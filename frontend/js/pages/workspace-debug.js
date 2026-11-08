/* =========================================================
   워크스페이스 디버거 + 입문자용 'AI 에러 설명'
   ---------------------------------------------------------
   · 🐞 디버그 버튼 하나로 시작한다. 줄 번호 왼쪽 빈칸을 눌러 '중단점(빨간 점)'을 걸면 프로그램이 거기서 멈추고,
     멈춘 동안 변수 값을 보면서 한 줄씩(F10) · 함수 안으로(F11) · 함수 밖으로(Shift+F11) · 계속(F8) 실행할 수 있다.
   · 한 줄씩 보기는 서버에서 도는 파이썬 · 자바스크립트 · 자바에서 된다. 다른 언어는 그냥 실행하고, 에러가 나면 아래 기능이 도와준다.
   · 에러가 나면 에러 줄을 에디터에 표시하고, '🤖 AI에게 쉽게 설명 듣기' 로 쉬운 한국어 설명을 받는다.
     에러가 보고된 줄과 진짜 원인 줄이 다르면(괄호를 안 닫으면 몇 줄 뒤에서 에러가 난다) 두 줄을 따로 표시해 준다.
   서버 쪽: routers/terminal.py (debug 모드) · services/debugger.py · routers/code_ai.py · services/code_ai.py
   ========================================================= */
var WS_DBG_LANGS = ['python', 'javascript', 'java'];
var WSDBG = { inited: false, bps: {}, fileKey: null, col: null, hov: null, cur: null, err: null, active: false, paused: false, line: null, prev: {}, hintShown: false };
var WSERR = { last: null, busy: false };

function wsDbgSupported(lang) { return WS_DBG_LANGS.indexOf(lang) >= 0; }
function wsDbgEsc(s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* ---------------- 에디터 준비: 중단점 점 · 단축키 ---------------- */
function wsDbgInit() {
  if (WSDBG.inited || !window.monaco || !monacoEditor) return;
  WSDBG.inited = true;
  WSDBG.col = monacoEditor.createDecorationsCollection([]);
  WSDBG.hov = monacoEditor.createDecorationsCollection([]);
  WSDBG.cur = monacoEditor.createDecorationsCollection([]);
  WSDBG.err = monacoEditor.createDecorationsCollection([]);
  var GLYPH = monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN;
  monacoEditor.onMouseDown(function(e) {
    var t = e.target;
    if (t && t.type === GLYPH && t.position) wsDbgToggle(t.position.lineNumber);
  });
  monacoEditor.onMouseMove(function(e) {          // 줄 번호 왼쪽에 마우스를 올리면 연한 점이 보여서 '여기를 누르면 된다'는 걸 알 수 있다
    var t = e.target;
    if (t && t.type === GLYPH && t.position) WSDBG.hov.set([{ range: new monaco.Range(t.position.lineNumber, 1, t.position.lineNumber, 1), options: { glyphMarginClassName: 'ws-bp-hover' } }]);
    else WSDBG.hov.clear();
  });
  monacoEditor.onMouseLeave(function() { WSDBG.hov.clear(); });
  monacoEditor.addCommand(monaco.KeyCode.F9, function() { wsDbgToggle(monacoEditor.getPosition().lineNumber); });
  monacoEditor.onDidChangeModelContent(function() {
    if (typeof wsSettingValue !== 'undefined' && wsSettingValue) return;       // 파일을 열면서 채우는 변경은 제외
    wsDbgSnapshot();
    if (!WSDBG.active) wsErrClear();                                           // 코드를 고치면 예전 에러 표시는 지운다
  });
  document.addEventListener('keydown', wsDbgKey, true);
  wsDbgRender();
}

/* 파일을 바꾸거나 값이 통째로 바뀌기 전에, 지금 중단점 위치를 기억해 둔다 (이후 wsDbgRender 로 다시 그린다) */
function wsDbgBeforeRender(newKey) {
  if (!WSDBG.inited) return;
  wsDbgSnapshot();
  if (newKey !== WSDBG.fileKey) { wsErrClear(); WSDBG.cur.clear(); }
}
function wsDbgSnapshot() {
  if (!WSDBG.inited || !WSDBG.fileKey || !WSDBG.col) return;
  var seen = {}, lines = [];
  WSDBG.col.getRanges().forEach(function(r) { var l = r.startLineNumber; if (!seen[l]) { seen[l] = 1; lines.push(l); } });
  lines.sort(function(a, b) { return a - b; });
  WSDBG.bps[WSDBG.fileKey] = lines;
}
function wsDbgRender() {
  if (!WSDBG.inited) return;
  WSDBG.fileKey = (typeof currentFileKey !== 'undefined') ? currentFileKey : null;
  var model = monacoEditor.getModel(), max = model ? model.getLineCount() : 0;
  var lines = ((WSDBG.fileKey && WSDBG.bps[WSDBG.fileKey]) || []).filter(function(l) { return l >= 1 && l <= max; });
  WSDBG.col.set(lines.map(function(l) {
    return { range: new monaco.Range(l, 1, l, 1), options: { glyphMarginClassName: 'ws-bp-glyph', glyphMarginHoverMessage: { value: '중단점 — 프로그램이 여기서 멈춰요. 다시 누르면 없어져요.' },
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } };
  }));
}
function wsDbgToggle(line) {
  if (!WSDBG.inited || !WSDBG.fileKey) return;
  wsDbgSnapshot();
  var arr = (WSDBG.bps[WSDBG.fileKey] || []).slice(), i = arr.indexOf(line);
  if (i >= 0) arr.splice(i, 1);
  else { if (arr.length >= 100) { pushToast('⚠️', '중단점이 너무 많아요', '한 파일에 100개까지 걸 수 있어요.'); return; } arr.push(line); }
  WSDBG.bps[WSDBG.fileKey] = arr;
  wsDbgRender();
  if (WSDBG.active) wsDbgSend({ cmd: 'breakpoints', lines: arr });          // 디버그 중에 바꾼 중단점은 바로 반영
}
function wsDbgLines(key) { wsDbgSnapshot(); return ((key === WSDBG.fileKey && WSDBG.bps[key]) || WSDBG.bps[key] || []).slice(); }
function wsDbgSend(obj) {
  if (typeof activeTermSocket !== 'undefined' && activeTermSocket && activeTermSocket.readyState === WebSocket.OPEN) {
    activeTermSocket.send(JSON.stringify(Object.assign({ action: 'dbg' }, obj)));
    return true;
  }
  return false;
}

/* ---------------- 시작 · 조작 ---------------- */
function wsDbgStart() {
  if (typeof wsRunning !== 'undefined' && wsRunning) { pushToast('ℹ️', '이미 실행 중이에요', '끝날 때까지 기다리거나 ■ 중지를 눌러 주세요.'); return; }
  runCode({ debug: true });
}
function wsDbgBtnState(running) {
  var b = document.getElementById('wsDbgBtn');
  if (b) b.disabled = !!running;
}
function wsDbgCmd(cmd) {
  if (!WSDBG.active || !WSDBG.paused) return;
  wsDbgSend({ cmd: cmd });
}
function wsDbgKey(e) {
  if (!WSDBG.active || !WSDBG.paused) return;
  var cmd = null;
  if (e.key === 'F8') cmd = 'continue';
  else if (e.key === 'F10') cmd = 'next';
  else if (e.key === 'F11') cmd = e.shiftKey ? 'out' : 'step';
  if (!cmd) return;
  e.preventDefault(); e.stopPropagation();
  wsDbgCmd(cmd);
}

/* ---------------- 서버에서 오는 디버그 소식 ---------------- */
function wsDbgEvent(m) {
  var bar = document.getElementById('wsDbgBar');
  if (m.ev === 'ready') {
    WSDBG.active = true; WSDBG.paused = false; WSDBG.prev = {}; WSDBG.line = null;
    if (bar) bar.hidden = false;
    var body = document.getElementById('termBodyInteractive'); if (body) body.classList.add('dbg-on');
    var pane = document.getElementById('wsDbgPane'); if (pane) pane.hidden = false;
    wsDbgStatus('준비 중…', 'run'); wsDbgButtons(false); wsDbgPaneRender(null);
  } else if (m.ev === 'running') {
    WSDBG.paused = false; WSDBG.cur.clear();
    wsDbgStatus('실행 중… (입력이 필요하면 아래 INPUT 칸에 넣어 주세요)', 'run'); wsDbgButtons(false);
  } else if (m.ev === 'paused') {
    WSDBG.paused = true; WSDBG.line = m.line;
    var model = monacoEditor && monacoEditor.getModel();
    if (model && m.line >= 1 && m.line <= model.getLineCount()) {
      WSDBG.cur.set([{ range: new monaco.Range(m.line, 1, m.line, 1), options: { isWholeLine: true, className: 'ws-dbg-line', glyphMarginClassName: 'ws-dbg-arrow' } }]);
      monacoEditor.revealLineInCenterIfOutsideViewport(m.line);
    }
    var why = m.reason === 'exception' ? ('⚠️ ' + (m.note || '예외가 발생했어요') + ' — 변수를 확인해 보세요') : (m.reason === 'breakpoint' ? '중단점에서 멈췄어요' : '한 줄 실행했어요');
    wsDbgStatus('⏸ ' + m.line + '번 줄' + (m.func ? ' · ' + m.func : '') + ' — ' + why, m.reason === 'exception' ? 'err' : 'pause');
    wsDbgButtons(true);
    wsDbgPaneRender(m);
    if (!WSDBG.hintShown) {
      WSDBG.hintShown = true;
      appendLiveOutput('// 💡 노란 줄은 "지금 멈춰 있는 줄"이고, 아직 실행하기 전이에요. 한 줄 실행(F10)을 누르면 그 줄이 실행돼요. 오른쪽에서 변수 값이 어떻게 바뀌는지 보세요.\n', false);
    }
  } else if (m.ev === 'notice') {
    appendLiveOutput('// ℹ️ ' + (m.text || '') + '\n', false);
  }
}
function wsDbgStatus(text, kind) {
  var el = document.getElementById('wsDbgStatus');
  if (el) { el.textContent = text; el.className = 'ws-dbg-status ' + (kind || ''); }
}
function wsDbgButtons(enabled) {
  var bar = document.getElementById('wsDbgBar');
  if (!bar) return;
  Array.prototype.forEach.call(bar.querySelectorAll('button[data-cmd]'), function(b) { b.disabled = !enabled; });
}
/* 디버그가 끝났을 때 (프로그램 종료 · 중지 · 연결 끊김) */
function wsDbgEnd() {
  if (!WSDBG.inited) return;
  WSDBG.active = false; WSDBG.paused = false; WSDBG.line = null; WSDBG.cur.clear();
  var bar = document.getElementById('wsDbgBar'); if (bar) bar.hidden = true;
  var pane = document.getElementById('wsDbgPane'); if (pane) pane.hidden = true;
  var body = document.getElementById('termBodyInteractive'); if (body) body.classList.remove('dbg-on');
}

/* ---------------- 변수 · 호출 순서 패널 ---------------- */
function wsDbgPaneRender(m) {
  var pane = document.getElementById('wsDbgPane');
  if (!pane) return;
  if (!m) { pane.innerHTML = '<div class="dbg-h">변수</div><div class="dbg-empty">프로그램이 멈추면 여기에 변수가 나와요.</div>'; return; }
  var vars = m.vars || [], now = {}, html = '<div class="dbg-h">변수 <span class="dbg-sub">' + (m.func ? wsDbgEsc(m.func) + ' 안' : '') + '</span></div>';
  if (!vars.length) html += '<div class="dbg-empty">아직 만들어진 변수가 없어요. 한 줄 실행(F10)을 눌러 보세요.</div>';
  var scopes = [];
  vars.forEach(function(v) { if (scopes.indexOf(v.s) < 0) scopes.push(v.s); });
  scopes.forEach(function(sc) {
    if (scopes.length > 1) html += '<div class="dbg-scope">' + wsDbgEsc(sc) + '</div>';
    vars.filter(function(v) { return v.s === sc; }).forEach(function(v) {
      var k = sc + ':' + v.n; now[k] = v.v;
      var changed = WSDBG.prev[k] !== undefined ? WSDBG.prev[k] !== v.v : true;
      html += '<div class="dbg-row' + (changed ? ' chg' : '') + '"><span class="dbg-n">' + wsDbgEsc(v.n) + '</span><span class="dbg-t">' + wsDbgEsc(v.t) + '</span><span class="dbg-v" title="' + wsDbgEsc(v.v) + '">' + wsDbgEsc(v.v) + '</span></div>';
    });
  });
  WSDBG.prev = now;
  if ((m.stack || []).length) {
    html += '<div class="dbg-h" style="margin-top:12px">호출 순서 <span class="dbg-sub">(위가 지금 있는 곳)</span></div>';
    m.stack.forEach(function(f, i) {
      html += '<div class="dbg-frame' + (i === 0 ? ' top' : '') + '" onclick="wsDbgGoto(' + (f.l | 0) + ')">' + wsDbgEsc(f.f) + ' <span class="dbg-sub">' + (f.l | 0) + '번 줄</span></div>';
    });
  }
  html += '<div class="dbg-tip">💡 <b>빨간 점 = 중단점</b>. 노랗게 바뀐 값은 방금 바뀐 값이에요.</div>';
  pane.innerHTML = html;
}
function wsDbgGoto(line) {
  if (!monacoEditor || !line) return;
  monacoEditor.revealLineInCenter(line);
  monacoEditor.setPosition({ lineNumber: line, column: 1 });
}

/* =========================================================
   에러 줄 표시 + 입문자용 AI 에러 설명
   ========================================================= */
function wsErrLineOf(lang, text, fname) {
  var base = String(fname || '').split('/').pop(), m, re, last = null;
  if (lang === 'python') {
    re = /File "([^"]+)", line (\d+)/g;
    var anyMine = null;
    while ((m = re.exec(text))) {
      var f = m[1].split('/').pop();
      if (base && f === base) last = +m[2];
      else if (!/site-packages|^<|\/lib\/python/.test(m[1])) anyMine = +m[2];
    }
    return last || anyMine;
  }
  if (lang === 'javascript' || lang === 'typescript') { m = /(?:^|[\/\\\s(])[^\s\/\\():]+\.[mc]?[jt]s:(\d+)/.exec(text); return m ? +m[1] : null; }
  if (lang === 'java') { m = /\.java:(\d+)/.exec(text); return m ? +m[1] : null; }
  if (lang === 'c' || lang === 'cpp') { m = /:(\d+):\d+:\s*(?:fatal )?error/.exec(text) || /:(\d+):\d+:/.exec(text); return m ? +m[1] : null; }
  m = /(?:line|:)\s*(\d+)/.exec(text);
  return m ? +m[1] : null;
}
function wsErrHeadline(text) {
  var lines = String(text || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
  var e = lines.filter(function(s) { return /error|exception|Error:/i.test(s); });
  return (e.length ? e[e.length - 1] : lines[lines.length - 1] || '에러').slice(0, 200);
}
function wsErrClear() {
  if (!WSDBG.inited) return;
  if (WSDBG.err) WSDBG.err.clear();
  try { var model = monacoEditor.getModel(); if (model) monaco.editor.setModelMarkers(model, 'duresync-err', []); } catch (e) {}
}
/* 컴파일 에러는 한 번에 여러 개가 나오므로(자바·C) 줄마다 자기 메시지와 함께 모두 표시한다 */
function wsErrCompileList(lang, text) {
  if (lang !== 'java' && lang !== 'c' && lang !== 'cpp') return [];
  var re = /:(\d+)(?::\d+)?:\s*(?:fatal )?error:\s*([^\n]*)/g, m, out = [], seen = {};
  while ((m = re.exec(text)) && out.length < 10) { if (!seen[m[1]]) { seen[m[1]] = 1; out.push({ line: +m[1], msg: m[2].trim() }); } }
  return out;
}
function wsErrMark(errLine, causeLine, errMsg, causeMsg, more) {
  if (!WSDBG.inited) return;
  var model = monacoEditor.getModel(); if (!model) return;
  var max = model.getLineCount(), marks = [], decos = [];
  function add(line, sev, msg, cls, glyph) {
    if (!line || line < 1 || line > max) return;
    marks.push({ startLineNumber: line, startColumn: model.getLineFirstNonWhitespaceColumn(line) || 1, endLineNumber: line, endColumn: model.getLineMaxColumn(line), message: msg, severity: sev });
    decos.push({ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: cls, glyphMarginClassName: glyph, glyphMarginHoverMessage: { value: msg } } });
  }
  if (causeLine && causeLine !== errLine) add(causeLine, monaco.MarkerSeverity.Warning, causeMsg || '여기가 진짜 원인이에요', 'ws-cause-line', 'ws-cause-glyph');
  add(errLine, monaco.MarkerSeverity.Error, errMsg || '에러가 난 줄', 'ws-err-line', 'ws-err-glyph');
  (more || []).forEach(function(x) { if (x.line !== errLine && x.line !== causeLine) add(x.line, monaco.MarkerSeverity.Error, x.msg, 'ws-err-line', 'ws-err-glyph'); });
  monaco.editor.setModelMarkers(model, 'duresync-err', marks);
  WSDBG.err.set(decos);
}

/* 실행이 에러로 끝났을 때 (workspace.js 의 finishRun 에서 부른다) */
function wsErrAfterRun(info) {
  WSERR.last = info;
  var err = String(info.err || '').replace(/\x1b\[[0-9;]*m/g, '').trim();       // 색 코드(내 PC 러너·서버가 붙인 것)는 뺀다
  info.err = err;
  if (!err) return;
  var line = wsErrLineOf(info.lang, err, info.fname);
  info.errLine = line;
  var sameFile = (typeof currentFileKey !== 'undefined') && info.key === currentFileKey;
  var list = wsErrCompileList(info.lang, err);
  info.errList = list;
  if (list.length) line = info.errLine = list[0].line;
  if (sameFile && line) wsErrMark(line, null, list.length ? list[0].msg : wsErrHeadline(err), null, list);
  var log = document.getElementById('termLiveLog');
  if (!log) return;
  var box = document.createElement('div');
  box.className = 'ws-err-box';
  box.innerHTML = '<div class="eb-row">' + (line ? '📍 에러가 난 줄: <b>' + (list.length > 1 ? list.map(function(x) { return x.line; }).join('번, ') : line) + '번 줄</b> <button type="button" class="eb-link" data-go="' + line + '">줄로 이동</button>' : '에러가 났어요') +
    '</div>' + (authToken ? '<button type="button" class="eb-ai" data-ai="1">🤖 AI에게 쉽게 설명 듣기</button>' +
    '<div class="eb-sub">에러 글이 어려우면 눌러 보세요. 어디가 왜 틀렸는지 쉬운 말로 알려 줘요.</div>' : '<div class="eb-sub">로그인하면 AI가 에러를 쉬운 말로 설명해 줘요.</div>');
  box.addEventListener('click', function(ev) {
    var t = ev.target;
    if (t && t.getAttribute('data-go')) wsDbgGoto(+t.getAttribute('data-go'));
    else if (t && t.getAttribute('data-ai')) wsErrAsk(box, t);
  });
  log.appendChild(box);
  log.scrollTop = log.scrollHeight;
}

async function wsErrAsk(box, btn) {
  var info = WSERR.last;
  if (!info || WSERR.busy) return;
  WSERR.busy = true;
  btn.disabled = true; btn.textContent = '🤖 코드를 읽는 중…';
  var out = null, fail = '';
  try {
    var r = await fetch(API_BASE + '/api/ai/explain-error', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ language: info.lang, code: info.code, error: info.err, file_name: info.fname || null })
    });
    var j = await r.json().catch(function() { return {}; });
    if (r.ok) out = j; else fail = (j && j.detail && (typeof j.detail === 'string' ? j.detail : '')) || ('설명을 가져오지 못했어요 (' + r.status + ')');
  } catch (e) { fail = '서버에 연결할 수 없어요. 잠시 뒤에 다시 눌러 주세요.'; }
  WSERR.busy = false;
  if (!out) { btn.disabled = false; btn.textContent = '🤖 다시 시도'; var f = document.createElement('div'); f.className = 'eb-sub'; f.style.color = '#ff7b72'; f.textContent = fail; box.appendChild(f); return; }
  wsErrRenderCard(box, out, info);
  var sameFile = (typeof currentFileKey !== 'undefined') && info.key === currentFileKey;
  if (sameFile) {
    var el = out.error_line || info.errLine, cl = out.cause_line || el;
    wsErrMark(el, cl, '에러가 보고된 줄: ' + ((info.errList && info.errList[0] && info.errList[0].msg) || wsErrHeadline(info.err)), '여기가 진짜 원인이에요: ' + (out.summary || ''), info.errList);
    if (cl) wsDbgGoto(cl);
  }
}

function wsErrRenderCard(box, d, info) {
  var el = d.error_line || info.errLine, cl = d.cause_line || el, differ = !!(el && cl && el !== cl);
  var h = '<div class="ai-head">🤖 AI 선생님 설명 <span class="ai-eng">' + (d.engine === 'rules' ? '기본 설명' : 'AI') + '</span></div>';
  h += '<div class="ai-sum">' + wsDbgEsc(d.summary) + '</div>';
  if (el || cl) {
    h += '<div class="ai-lines">';
    if (el) h += '<button type="button" class="ai-chip err" data-go="' + el + '">에러가 보고된 줄 <b>' + el + '번</b></button>';
    if (differ) h += '<span class="ai-arrow">→</span><button type="button" class="ai-chip cause" data-go="' + cl + '">진짜 원인 줄 <b>' + cl + '번</b></button>';
    else if (el) h += '<span class="ai-same">원인도 같은 줄이에요</span>';
    h += '</div>';
  }
  if (d.line_note) h += '<div class="ai-note">' + wsDbgEsc(d.line_note) + '</div>';
  h += '<div class="ai-sec">왜 이런 에러가 났나요?</div><div class="ai-txt">' + wsDbgEsc(d.explanation) + '</div>';
  if ((d.steps || []).length) h += '<div class="ai-sec">이렇게 고쳐 보세요</div><ol class="ai-steps">' + d.steps.map(function(s) { return '<li>' + wsDbgEsc(s) + '</li>'; }).join('') + '</ol>';
  if (d.fixed_code) h += '<div class="ai-sec">고친 코드 예시 <button type="button" class="eb-link" data-copy="1">복사</button></div><pre class="ai-code">' + wsDbgEsc(d.fixed_code) + '</pre>';
  if (d.concept) h += '<div class="ai-concept">💡 알아두면 좋아요: ' + wsDbgEsc(d.concept) + '</div>';
  if (d.ai_failed) h += '<div class="eb-sub">AI 연결이 불안정해서 기본 설명으로 알려 드렸어요.</div>';
  h += '<div class="eb-sub">AI 설명은 틀릴 수도 있어요. 위의 에러 글 원문도 함께 확인해 보세요.</div>';
  var card = document.createElement('div');
  card.className = 'ws-ai-card';
  card.innerHTML = h;
  card.addEventListener('click', function(ev) {
    var t = ev.target.closest ? ev.target.closest('[data-go],[data-copy]') : null;
    if (!t) return;
    if (t.getAttribute('data-go')) wsDbgGoto(+t.getAttribute('data-go'));
    else if (t.getAttribute('data-copy')) { try { navigator.clipboard.writeText(d.fixed_code); pushToast('✅', '복사했어요', '고친 코드 예시를 클립보드에 복사했어요.'); } catch (e) {} }
  });
  var old = box.querySelector('.ws-ai-card'); if (old) old.remove();
  var b = box.querySelector('.eb-ai'); if (b) { b.disabled = false; b.textContent = '🤖 다시 설명 듣기'; b.style.display = 'none'; }
  box.appendChild(card);
  var log = document.getElementById('termLiveLog');
  if (log) log.scrollTop = Math.max(0, card.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop - 52);      // 설명 카드의 맨 위(요약)부터 보이게
}
