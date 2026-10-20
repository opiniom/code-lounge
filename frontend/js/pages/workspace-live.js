/* ---- 워크스페이스 글자 단위 실시간 공동 편집 ----
   같은 파일을 연 팀원끼리 한 글자가 쳐지는 순간 서로 화면에 나타난다 (저장·Enter 를 기다리지 않는다).
   서버(api/services/livedoc.py)가 편집의 순서를 정하고, 동시에 같은 곳을 고쳐도 변환 규칙(WSOT = api/services/ot.py 와 같은 규칙)으로 모두 같은 글이 된다.
   저장은 서버가 알아서 한다. 실시간 연결이 없거나 끊기면 예전 방식(자동 저장 + 충돌 확인)으로 저절로 돌아간다.
   동작 원리: 내 편집은 한 번에 한 묶음(infl)만 서버에 보내 두고, 답(ack)이 오기 전의 입력은 모아 둔다(buf). 남의 편집이 오면 infl·buf 와 맞춰 고쳐서 내 화면에 적용한다. */

/* ===== 변환 규칙 (파이썬 api/services/ot.py 와 똑같이 — tests/test_ot.py 가 두 쪽이 같은 결과를 내는지 확인한다) ===== */
var WSOT = (function() {
  function xformOp(a, b, aFirst) {
    if (a[0] === 0 && b[0] === 0) {
      if (a[1] < b[1] || (a[1] === b[1] && aFirst)) return [a];
      return [[0, a[1] + b[2].length, a[2]]];
    }
    if (a[0] === 0) {
      var p = a[1], q = b[1], k = b[2];
      if (p <= q) return [a];
      if (p >= q + k) return [[0, p - k, a[2]]];
      return [[0, q, a[2]]];
    }
    if (b[0] === 0) {
      var p2 = a[1], n2 = a[2], q2 = b[1], m = b[2].length;
      if (q2 <= p2) return [[1, p2 + m, n2]];
      if (q2 >= p2 + n2) return [a];
      return [[1, p2, q2 - p2], [1, p2 + m, p2 + n2 - q2]];
    }
    var p3 = a[1], n3 = a[2], q3 = b[1], k3 = b[2];
    if (p3 + n3 <= q3) return [a];
    if (p3 >= q3 + k3) return [[1, p3 - k3, n3]];
    var overlap = Math.min(p3 + n3, q3 + k3) - Math.max(p3, q3), rest = n3 - overlap;
    return rest > 0 ? [[1, Math.min(p3, q3), rest]] : [];
  }
  function xformLists(A, B, aFirst) {
    if (!A.length || !B.length) return [A.slice(), B.slice()];
    if (A.length === 1 && B.length === 1) return [xformOp(A[0], B[0], aFirst), xformOp(B[0], A[0], !aFirst)];
    var r;
    if (A.length > 1) {
      r = xformLists([A[0]], B, aFirst);
      var r2 = xformLists(A.slice(1), r[1], aFirst);
      return [r[0].concat(r2[0]), r2[1]];
    }
    r = xformLists(A, [B[0]], aFirst);
    var r3 = xformLists(r[0], B.slice(1), aFirst);
    return [r3[0], r[1].concat(r3[1])];
  }
  /* 서버가 보내 주는 점검값(adler32)과 같은 방식: 글자(UTF-16 단위)를 리틀엔디언 바이트로 보고 계산 */
  function adler(str) {
    var a = 1, b = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      a = (a + (c & 255)) % 65521; b = (b + a) % 65521;
      a = (a + (c >> 8)) % 65521; b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }
  /* 연산 목록으로 Monaco 변경 묶음(여러 곳 동시 변경) → 순서대로 적용되는 작은 연산들 */
  function fromChanges(changes) {
    var ch = changes.slice().sort(function(x, y) { return y.rangeOffset - x.rangeOffset; }), ops = [];
    ch.forEach(function(c) { if (c.rangeLength > 0) ops.push([1, c.rangeOffset, c.rangeLength]); if (c.text) ops.push([0, c.rangeOffset, c.text]); });
    return ops;
  }
  return { xformOp: xformOp, xformLists: xformLists, adler: adler, fromChanges: fromChanges };
})();

/* ===== 접속·편집 상태 ===== */
var LV = null;               // 지금 에디터에 붙어 있는 실시간 편집 세션 {key,path,pid,cid,rev,infl,buf,joined,detached,queue,...}
var LVWANT = null;           // 붙고 싶은 파일 key (파일을 바꿔도 아직 보내지 못한 입력이 있으면 정리가 끝날 때까지 기다린다)
var LVSTAT = { applying: false, composing: false, timer: null, ready: false };

function wsLiveOn() { return !!(LV && LV.joined && !LV.detached); }
function wsLivePending() { return !!(LV && (LV.infl || LV.buf.length)); }
function wsLiveCid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function wsLiveEligible(key) {
  var f = files[key];
  return !!(f && key === currentFileKey && LIVE && LIVE.ok && LIVE.ws && wsUseServer() && window.monaco && monacoEditor && f.baseUpdatedAt && !f.conflict);
}
function wsLiveReadOnly(on) { try { if (window.monaco && monacoEditor) monacoEditor.updateOptions({ readOnly: !!on }); } catch (e) {} }

/* 에디터가 이 파일을 보여 줄 때마다 부른다 (파일 열기·탭 바꾸기·이름 바꾸기·새로 받기) */
function wsLiveAttach(key, keepCursor) {
  if (!key || !files[key]) { wsLiveWant(null); return; }
  if (keepCursor && LV && LV.key === key && !LV.detached) return;        // 같은 파일 화면 갱신: 이미 붙어 있음
  wsLiveWant(key);
}
function wsLiveDetach() { wsLiveWant(null); }
function wsLiveWant(key) { LVWANT = key; wsLivePump(); }

function wsLivePump() {
  clearTimeout(LVSTAT.timer);
  // 1) 지금 세션이 원하는 파일과 다르면 정리한다: 아직 서버에 못 보낸 입력이 있으면 잠깐(최대 2초) 기다렸다가 보낸다
  if (LV && LV.key !== LVWANT) {
    if (LV.joined && wsLivePending() && LIVE.ok && !LV.drainUntil) LV.drainUntil = Date.now() + 2000;
    if (LV.joined && wsLivePending() && LIVE.ok && Date.now() < LV.drainUntil) {
      LV.detached = true; wsLiveFlush(); wsLiveReadOnly(true);
      LVSTAT.timer = setTimeout(wsLivePump, 120); return;
    }
    wsLiveClose(LV, true);
  }
  if (!LVWANT || LV) { if (LV) wsLiveStatus(); return; }
  // 2) 새 파일에 붙는다
  var key = LVWANT, f = files[key];
  if (!wsLiveEligible(key)) { wsLiveReadOnly(false); return; }
  if (f.dirty || f.saving) {                                                // 저장 안 된 내용이 있으면 먼저 저장한 뒤 붙는다 (서버 내용 = 내 내용이어야 한다)
    wsSave(key).then(function() { if (LVWANT === key && files[key] && !files[key].dirty) wsLivePump(); });
    return;
  }
  LV = { key: key, path: f.path, pid: wsServerId(), cid: wsLiveCid(), rev: 0, infl: null, buf: [], joined: false, detached: false, queue: [], toast: false, drainUntil: 0, text: '', undo: [], redo: [], mode: '', collect: null, lastAt: 0, lastKind: '' };
  wsLiveReadOnly(true);                                                     // 서버 내용을 받기 전에 입력하면 사라지니 잠깐 잠근다
  var mine = LV;
  mine.joinTimer = setTimeout(function() { if (LV === mine && !mine.joined) wsLiveFail(mine, '서버가 응답하지 않아요'); }, 3500);
  if (!liveSend({ t: 'doc', a: 'join', project_id: mine.pid, path: mine.path, cid: mine.cid })) wsLiveFail(mine, '실시간 연결이 없어요');
}
/* 세션 정리: 서버에 방을 나간다고 알리고, 파일 표시를 원래대로 */
function wsLiveClose(s, tell) {
  if (!s) return;
  clearTimeout(s.joinTimer);
  if (tell && s.joined) liveSend({ t: 'doc', a: 'leave' });
  var f = files[s.key]; if (f) f.live = false;
  if (LV === s) LV = null;
  LVSTAT.composing = false;
  wsLiveReadOnly(false);
  wsLiveClearMarks();
  wsUpdateSaveStatus();
}
/* 실시간을 쓸 수 없게 된 경우(연결 끊김·서버 오류): 예전 방식으로 돌아간다. 아직 서버에 못 보낸 입력은 일반 저장(+충돌 확인)으로 보존한다 */
function wsLiveFail(s, why) {
  if (!s) return;
  var f = files[s.key], pending = s.infl || (s.buf && s.buf.length);
  var wasJoined = s.joined;
  wsLiveClose(s, false);
  if (f && (pending || (wasJoined && window.monaco && monacoEditor && s.key === currentFileKey && monacoEditor.getValue() !== f.raw))) {
    if (s.key === currentFileKey && window.monaco && monacoEditor) f.raw = monacoEditor.getValue();
    wsMarkDirty(s.key);                                                    // 일반 저장 + 충돌 확인으로 이어진다
  }
  if (why && wasJoined) pushToast('ℹ️', '실시간 편집이 잠시 꺼졌어요', why + ' · 입력한 내용은 일반 저장으로 보관돼요');
}
/* 화면 연결이 끊겼을 때 (live.js 에서 호출) */
function wsLiveLost() { if (LV) wsLiveFail(LV, '실시간 연결이 끊겼어요'); }
/* 연결이 다시 붙으면 현재 파일에 다시 붙는다 (live.js 의 liveResync 에서 호출) */
function wsLiveRejoin() { if (currentFileKey && files[currentFileKey] && !LV) wsLiveWant(currentFileKey); }

/* ===== 내 입력 → 서버 ===== */
function wsLiveFlush() {
  var s = LV;
  if (!s || !s.joined || s.infl || !s.buf.length) return;
  s.infl = s.buf; s.buf = [];
  if (!liveSend({ t: 'doc', a: 'op', project_id: s.pid, path: s.path, rev: s.rev, cid: s.cid, ops: s.infl })) wsLiveFail(s, '실시간 연결이 끊겼어요');
}
/* 에디터 내용이 바뀔 때마다 부른다. 실시간 편집이 맡았으면 true (그러면 일반 저장은 하지 않는다) */
function wsLiveOnChange(e) {
  var s = LV;
  if (!s || !s.joined || s.detached || s.key !== currentFileKey) return false;
  if (LVSTAT.applying) return true;                                         // 남의 편집을 적용하느라 바뀐 것: 서버에 다시 보내지 않는다
  var ops = WSOT.fromChanges(e.changes || []);
  if (!ops.length) return true;
  wsLiveRemember(s, ops);
  s.buf = s.buf.concat(ops);
  wsLiveFlush();
  wsLiveStatus();
  return true;
}

/* ===== 되돌리기(Ctrl+Z) — 실시간 편집에서는 '내가 한 편집만' 되돌려야 한다 =====
   편집기 기본 되돌리기는 글자 위치로 기록해서, 팀원이 위쪽에 줄을 넣으면 엉뚱한 곳을 지운다.
   그래서 내 편집마다 '반대 동작'을 기록해 두고, 남의 편집이 들어올 때마다 그 기록의 위치를 같이 고쳐 둔다. */
function wsLiveInverse(s, ops) {         // ops 를 문서에 적용하면서(s.text 갱신) 그 반대 동작 목록을 돌려준다
  var inv = [], t = s.text;
  ops.forEach(function(o) {
    if (o[0] === 0) { inv.unshift([1, o[1], o[2].length]); t = t.slice(0, o[1]) + o[2] + t.slice(o[1]); }
    else { inv.unshift([0, o[1], t.slice(o[1], o[1] + o[2])]); t = t.slice(0, o[1]) + t.slice(o[1] + o[2]); }
  });
  s.text = t;
  return inv;
}
function wsLiveRemember(s, ops) {
  var inv = wsLiveInverse(s, ops);
  if (s.mode) { s.collect = inv.concat(s.collect || []); return; }          // 되돌리기/다시 실행으로 생긴 변경은 반대편 기록으로 간다
  var kind = ops.every(function(o) { return o[0] === 0; }) ? 'i' : (ops.every(function(o) { return o[0] === 1; }) ? 'd' : 'x'), now = Date.now();
  var top = s.undo[s.undo.length - 1];
  if (top && kind !== 'x' && kind === s.lastKind && now - s.lastAt < 500) s.undo[s.undo.length - 1] = inv.concat(top);   // 이어서 친 글자는 한 번에 되돌린다
  else { s.undo.push(inv); if (s.undo.length > 200) s.undo.shift(); }
  s.lastAt = now; s.lastKind = kind; s.redo = [];
}
function wsLiveShift(s, R) {             // 남의 편집 R 이 들어왔을 때 되돌리기/다시 실행 기록의 위치를 같이 옮긴다
  [s.undo, s.redo].forEach(function(stack) {
    var r = R;
    for (var i = stack.length - 1; i >= 0; i--) { var res = WSOT.xformLists(stack[i], r, false); stack[i] = res[0]; r = res[1]; }
    for (var j = stack.length - 1; j >= 0; j--) if (!stack[j].length) stack.splice(j, 1);
  });
  R.forEach(function(o) { s.text = o[0] === 0 ? s.text.slice(0, o[1]) + o[2] + s.text.slice(o[1]) : s.text.slice(0, o[1]) + s.text.slice(o[1] + o[2]); });
}
function wsLiveHistory(kind) {           // kind: 'undo' | 'redo'
  var s = LV;
  if (!s || !s.joined || s.detached || !window.monaco || !monacoEditor) return false;
  var from = kind === 'undo' ? s.undo : s.redo, g = from.pop();
  if (!g) return true;
  var model = monacoEditor.getModel(), last = 0;
  s.mode = kind; s.collect = [];
  try {
    g.forEach(function(o) {
      if (o[0] === 0) { var p = model.getPositionAt(o[1]); model.applyEdits([{ range: new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column), text: o[2] }]); last = o[1] + o[2].length; }
      else { var a = model.getPositionAt(o[1]), b = model.getPositionAt(o[1] + o[2]); model.applyEdits([{ range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), text: '' }]); last = o[1]; }
    });
  } finally { s.mode = ''; }
  if (s.collect.length) (kind === 'undo' ? s.redo : s.undo).push(s.collect);
  s.collect = null; s.lastAt = 0;
  try { var pos = model.getPositionAt(last); monacoEditor.setPosition(pos); monacoEditor.revealPositionInCenterIfOutsideViewport(pos); } catch (e) {}
  return true;
}
function wsLiveUndo() { return wsLiveHistory('undo'); }
function wsLiveRedo() { return wsLiveHistory('redo'); }
/* 편집기 기본 되돌리기/다시 실행(단축키·메뉴·모바일 키)을 우리 것으로 바꿔 끼운다. 실시간 편집이 아닐 때는 원래대로 */
function wsLiveHookUndo() {
  if (!window.monaco || !monacoEditor) return;
  var model = monacoEditor.getModel(); if (!model || model.__wsHooked) return;
  var u = model.undo.bind(model), r = model.redo.bind(model);
  model.undo = function() { if (!wsLiveUndo()) return u(); };
  model.redo = function() { if (!wsLiveRedo()) return r(); };
  model.__wsHooked = true;
}

/* ===== 서버 → 화면 ===== */
function wsLiveHandle(m) {
  var s = LV;
  if (m.t === 'docerr') {
    if (s && m.path === s.path && !s.joined) wsLiveFail(s, m.why === 'missing' ? '' : '이 파일은 실시간 편집을 쓸 수 없어요');
    return;
  }
  if (!s || m.project_id !== s.pid || m.path !== s.path) return;
  if (m.t === 'docreset') {                                                  // 다른 경로(저장·이름 변경)로 내용이 바뀜 → 새로 받는다
    var key = s.key; wsLiveClose(s, false);
    var f = files[key]; if (f && currentFileKey === key) { wsPollSoon(); setTimeout(function() { if (currentFileKey === key) wsLiveWant(key); }, 450); }
    return;
  }
  if (m.t === 'docsync') { wsLiveOnSync(s, m); return; }
  if (m.t === 'docsaved') { wsLiveOnSaved(s, m); return; }
  if (m.t === 'docop') {
    if (LVSTAT.composing && !s.detached) { s.queue.push(m); return; }       // 한글 등 조합 입력 중에는 끝난 뒤에 적용 (조합이 깨지지 않게)
    wsLiveOnOp(s, m);
  }
}
function wsLiveOnSync(s, m) {
  clearTimeout(s.joinTimer);
  var again = s.joined;
  s.rev = m.rev; s.infl = null; s.buf = []; s.queue = []; s.joined = true; s.resyncing = false;
  s.text = m.text; s.undo = []; s.redo = [];                                  // 내용을 새로 받으면 되돌리기 기록도 새로 시작
  var f = files[s.key];
  if (s.detached || !f || s.key !== currentFileKey) return;
  wsLiveSetText(m.text);
  f.raw = m.text; f.dirty = false; f.saving = false; f.live = true; f.baseUpdatedAt = m.at || f.baseUpdatedAt;
  wsLiveReadOnly(false);
  if (again) pushToast('🔄', '다시 맞췄어요', '팀원과 내용이 어긋나서 서버 기준으로 다시 불러왔어요.');
  renderTabs(); wsUpdateSaveStatus();
}
/* 에디터 내용을 서버 내용으로 (커서 위치는 최대한 유지). 줄바꿈은 LF 로 통일해 서버와 글자 위치가 같게 한다 */
function wsLiveSetText(text) {
  if (!window.monaco || !monacoEditor) return;
  var model = monacoEditor.getModel(); if (!model) return;
  if (model.getValue() === text && model.getEOL() === '\n') return;
  var sel = monacoEditor.getSelection(), top = monacoEditor.getScrollTop();
  wsSettingValue = true;
  try { model.setEOL(monaco.editor.EndOfLineSequence.LF); monacoEditor.setValue(text); } finally { wsSettingValue = false; }
  try { if (sel) { var lines = model.getLineCount(); monacoEditor.setSelection(new monaco.Selection(Math.min(sel.startLineNumber, lines), sel.startColumn, Math.min(sel.endLineNumber, lines), sel.endColumn)); } monacoEditor.setScrollTop(top); } catch (e) {}
  updateEditorStatusBar();
}
function wsLiveOnOp(s, m) {
  if (s.resyncing) return;                                                    // 전체를 다시 받는 중에는 그 사이 편집을 무시 (다시 받는 내용에 이미 들어 있다)
  if (m.rev !== s.rev + 1) { wsLiveResync(s); return; }                       // 번호가 건너뛰었다 → 놓친 편집이 있으니 전체를 다시 받는다
  if (m.cid === s.cid) {                                                      // 내 편집이 서버에서 순서가 정해졌다는 확인
    s.rev = m.rev; s.infl = null;
    wsLiveFlush(); wsLiveStatus();
    if (s.detached && !wsLivePending()) wsLivePump();
  } else {
    var R = m.ops || [], t1 = WSOT.xformLists(R, s.infl || [], true);
    if (s.infl) s.infl = t1[1];
    var t2 = WSOT.xformLists(t1[0], s.buf, true);
    s.buf = t2[1];
    s.rev = m.rev;
    if (t2[0].length) { wsLiveShift(s, t2[0]); if (!s.detached) wsLiveApply(t2[0], m); }
    var fo = files[s.key]; if (fo && R.length) fo.othersEdit = true;           // 팀원이 고친 파일 (내 PC 에서 실행하기 전에 확인을 받는다)
  }
  if (m.crc != null && !wsLivePending() && !s.detached && window.monaco && monacoEditor) {
    var v = monacoEditor.getModel().getValue();
    if (s.text !== v) { s.text = v; s.undo = []; s.redo = []; }                  // 되돌리기용 사본이 어긋났다면 기록을 버리고 새로 시작
    if (v.length !== m.len || WSOT.adler(v) !== m.crc) wsLiveResync(s);        // 서버와 내용이 다르면 스스로 바로잡는다
  }
}
function wsLiveResync(s) {
  if (LV !== s || !s.joined || s.resyncing) return;
  s.resyncing = true; s.queue = [];
  clearTimeout(s.joinTimer); s.joinTimer = setTimeout(function() { if (LV === s && s.resyncing) wsLiveFail(s, '서버가 응답하지 않아요'); }, 3500);
  if (!liveSend({ t: 'doc', a: 'join', project_id: s.pid, path: s.path, cid: s.cid })) wsLiveFail(s, '실시간 연결이 끊겼어요');
}
function wsLiveOnSaved(s, m) {
  var f = files[s.key]; if (!f) return;
  f.baseUpdatedAt = m.at || f.baseUpdatedAt; f.updatedBy = m.by || f.updatedBy; f.dirty = false;
  if (s.toast) { s.toast = false; pushToast('💾', '저장했어요', f.tab); }
  wsUpdateSaveStatus();
  if (m.crc != null && m.rev === s.rev && !wsLivePending() && !s.detached && window.monaco && monacoEditor) {
    var v = monacoEditor.getModel().getValue();
    if (v.length !== m.len || WSOT.adler(v) !== m.crc) wsLiveResync(s);
  }
}
/* 남의 편집을 에디터에 적용 (되돌리기 기록에는 남기지 않는다). 새로 쳐진 글자는 그 사람 색으로 잠깐 표시한다 */
function wsLiveApply(ops, m) {
  if (!window.monaco || !monacoEditor) return;
  var model = monacoEditor.getModel(), marks = [], uid = m.uid, color = null;
  try { color = wsCurEnsureStyle(uid, m.name || '?'); } catch (e) {}
  LVSTAT.applying = true;
  try {
    ops.forEach(function(o) {
      if (o[0] === 0) {
        var p = model.getPositionAt(o[1]);
        model.applyEdits([{ range: new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column), text: o[2], forceMoveMarkers: true }]);
        var e1 = model.getPositionAt(o[1] + o[2].length);
        marks.push({ range: new monaco.Range(p.lineNumber, p.column, e1.lineNumber, e1.column), options: { className: 'wsr-u' + uid, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } });
      } else {
        var a = model.getPositionAt(o[1]), b = model.getPositionAt(o[1] + o[2]);
        model.applyEdits([{ range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), text: '' }]);
      }
    });
  } finally { LVSTAT.applying = false; }
  var f = files[LV && LV.key]; if (f) f.raw = model.getValue();
  if (marks.length) {
    var ids = monacoEditor.deltaDecorations([], marks.slice(-20));
    setTimeout(function() { try { monacoEditor.deltaDecorations(ids, []); } catch (e) {} }, 1800);
  }
  if (typeof pvAutoRefresh === 'function') pvAutoRefresh();
  updateEditorStatusBar();
}
function wsLiveClearMarks() {}

/* 저장 단축키(Ctrl+S): 서버가 이미 자동으로 저장하고 있어서, 지금 바로 저장하라고만 알린다 */
function wsLiveSave(key) {
  if (LV && LV.key === key && LV.joined) { LV.toast = true; if (!liveSend({ t: 'doc', a: 'save' })) LV.toast = false; return true; }
  return false;
}
/* 아직 서버에 가지 못한 입력이 있나 (창을 닫기 전에 확인) */
function wsLiveHasPending() { return wsLivePending(); }
/* 상태 표시줄 */
function wsLiveStatus() { if (typeof wsUpdateSaveStatus === 'function') wsUpdateSaveStatus(); }

/* 한글처럼 글자를 조합하며 입력하는 동안에는 남의 편집 적용을 미룬다 (적용하면 조합 중인 글자가 깨진다) */
function wsLiveInitInput() {
  if (LVSTAT.ready) return;
  var box = document.getElementById('monacoEditorContainer'); if (!box) return;
  LVSTAT.ready = true; wsLiveHookUndo();
  box.addEventListener('compositionstart', function() { LVSTAT.composing = true; }, true);
  box.addEventListener('compositionend', function() {
    LVSTAT.composing = false;
    setTimeout(function() {
      var s = LV; if (!s) return;
      var q = s.queue; s.queue = [];
      for (var i = 0; i < q.length && LV === s; i++) wsLiveOnOp(s, q[i]);
    }, 0);
  }, true);
}
