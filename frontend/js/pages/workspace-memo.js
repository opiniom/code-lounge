/* ---- 워크스페이스 코드 줄 메모 ----
   "이 파일 19번째 줄은 민수님이 고쳐야 해요" 같은 짧은 메모를 코드 줄에 남기고, 팀이 함께 본다.
   · 직접 달기: 줄 번호 옆 '메모' 버튼 · 에디터에서 우클릭 · Ctrl+Alt+M (맥: ⌘⌥M).  두레에게 말로 시켜도 돼요: "두레야 민수님이 이 줄 수정해야 하니까 메모 남겨줘"
   · 보기: 메모가 있는 줄은 번호 옆에 색 막대 + 줄 끝에 한 줄 미리보기. 막대를 누르면 메모 창, 마우스를 올리면 내용이 떠요.
   · 목록: 아래쪽 '메모' 탭(전체 · 파일별 · 해결 여부). 누르면 그 줄로 이동해요.
   · 코드가 고쳐져 줄이 밀려도 메모는 같은 줄에 붙어 다녀요 (에디터가 따라가고, 저장되면 새 위치도 팀에 반영). 다른 사람이 고쳐서 줄이 달라졌다면 메모에 적어 둔 그 줄의 글자로 다시 찾아요.
   · 실시간: 팀원이 메모를 달거나 해결하면 바로 보여요 (/ws/live 의 memos). */
var WSMEMO = { items: [], pid: null, loaded: false, deco: null, slots: [], filter: 'open', onlyFile: false, pop: null, popLine: null, syncT: null, loadT: null, undoSeq: 0 };

function wsMemoSid(){ return (typeof wsServerId === 'function') ? wsServerId() : null; }
function wsMemoOn(){ return !!(calApiMode && wsMemoSid()); }
function wsMemoPath(){ var f = currentFileKey && files[currentFileKey]; return f ? f.path : null; }
function wsMemoMd(s){ return String(s || '').replace(/([\\`*_{}\[\]()#+\-.!|<>~])/g, '\\$1'); }
function wsMemoAgo(iso){
  var t = new Date(iso).getTime(); if(isNaN(t)) return '';
  var s = Math.max(0, (Date.now() - t) / 1000);
  if(s < 60) return '방금'; if(s < 3600) return Math.floor(s / 60) + '분 전'; if(s < 86400) return Math.floor(s / 3600) + '시간 전';
  var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate();
}
function wsMemoMembers(){
  var pr = calProjectById('p' + wsMemoSid());
  return (pr && pr.members) ? pr.members.filter(function(m){ return m && m.id && m.username; }) : [];
}

/* ---------- 불러오기 ---------- */
function wsMemoLoad(){
  if(!wsMemoOn()) { WSMEMO.items = []; WSMEMO.loaded = false; wsMemoRenderAll(); return Promise.resolve(); }
  var sid = wsMemoSid();
  if(WSMEMO.pid !== sid){ WSMEMO.items = []; WSMEMO.loaded = false; WSMEMO.pid = sid; wsMemoClosePop(); }
  return apiFetch('/api/projects/' + sid + '/memos').then(function(rows){
    if(WSMEMO.pid !== wsMemoSid()) return;
    WSMEMO.items = rows || []; WSMEMO.loaded = true;
    wsMemoRenderAll();
  }).catch(function(e){ if(e && e.status !== 401 && e.status !== 404) console.warn('memo load', e && e.message); });
}
/* 팀원이 메모를 달거나 바꾸면(/ws/live) 잠깐 모아서 한 번만 다시 받는다 */
function wsMemoLive(m){
  if(!m || (m.project_id && m.project_id !== wsMemoSid())) return;
  clearTimeout(WSMEMO.loadT); WSMEMO.loadT = setTimeout(wsMemoLoad, 350);
}
function wsMemoRenderAll(){
  wsMemoRender(); wsMemoRenderList(); wsMemoPaintTree(); wsMemoBadge();
  if(WSMEMO.pop && WSMEMO.popLine) wsMemoFillPop();
}
function wsMemoOpenCount(){ return WSMEMO.items.filter(function(m){ return !m.resolved; }).length; }
function wsMemoBadge(){
  var n = wsMemoOpenCount(), b = document.getElementById('wsMemoCnt'), t = document.getElementById('termTabMemo');
  if(b){ b.textContent = n; b.hidden = !n; }
  if(t){ t.innerHTML = '메모' + (n ? ' <i class="ws-memo-tabcnt">' + n + '</i>' : ''); }
}

/* ---------- 에디터 표시 ---------- */
function wsMemoLineText(model, n){ try { return model.getLineContent(n); } catch(e){ return ''; } }
function wsMemoNorm(s){ return String(s || '').replace(/\s+/g, ' ').trim(); }
/* 저장된 줄 번호가 맞으면 그대로, 코드가 바뀌어 안 맞으면 적어 둔 줄의 글자(anchor)로 가장 가까운 같은 줄을 찾는다. 못 찾으면 lost */
function wsMemoLocate(m, model){
  var total = model.getLineCount(), line = Math.min(Math.max(1, m.line), total);
  var a = wsMemoNorm(m.anchor);
  if(!a || wsMemoNorm(wsMemoLineText(model, line)) === a) return { line: line, moved: false, lost: false };
  for(var d = 1; d <= 300; d++){
    var up = line - d, dn = line + d;
    if(up >= 1 && wsMemoNorm(wsMemoLineText(model, up)) === a) return { line: up, moved: true, lost: false };
    if(dn <= total && wsMemoNorm(wsMemoLineText(model, dn)) === a) return { line: dn, moved: true, lost: false };
    if(up < 1 && dn > total) break;
  }
  return { line: line, moved: false, lost: true };
}
/* 에디터가 줄을 따라 옮긴 지금 위치 기준으로, 이 줄에 메모가 있는지 */
function wsMemoHasLine(line){
  if(!WSMEMO.deco) return false;
  return WSMEMO.slots.some(function(s, i){ var r = WSMEMO.deco.getRange(i); return (r ? r.startLineNumber : s.line) === line; });
}
function wsMemoFileItems(path){ return WSMEMO.items.filter(function(m){ return m.path === path; }); }
function wsMemoRender(){
  if(!(window.monaco && monacoEditor)) return;
  if(!WSMEMO.deco) WSMEMO.deco = monacoEditor.createDecorationsCollection([]);
  var path = wsMemoPath(), model = monacoEditor.getModel();
  WSMEMO.slots = [];
  if(!path || !model){ WSMEMO.deco.set([]); return; }
  var byLine = {};
  wsMemoFileItems(path).filter(function(m){ return !m.resolved; }).forEach(function(m){
    var loc = wsMemoLocate(m, model); m._loc = loc;
    (byLine[loc.line] = byLine[loc.line] || []).push(m);
  });
  var decos = [];
  Object.keys(byLine).map(Number).sort(function(a, b){ return a - b; }).forEach(function(line){
    var ms = byLine[line], first = ms[0], lost = ms.every(function(m){ return m._loc.lost; });
    var hover = ms.map(function(m){ return wsMemoMd(m.text) + '  \n*' + wsMemoMd(m.author || '두레') + (m.assignee ? ' → ' + wsMemoMd(m.assignee) : '') + '*'; }).join('\n\n');
    if(lost) hover += '\n\n*줄이 바뀐 것 같아요*';
    var short = wsMemoNorm(first.text); if(short.length > 32) short = short.slice(0, 32) + '…';
    decos.push({ range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)), options: {       // 줄 전체 범위: 미리보기 글자가 줄 '끝'에 붙는다
      isWholeLine: true, className: 'ws-memo-line' + (lost ? ' lost' : ''), linesDecorationsClassName: 'ws-memo-bar' + (lost ? ' lost' : ''),
      hoverMessage: { value: hover }, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      after: { content: '   ' + short + (ms.length > 1 ? '  (+' + (ms.length - 1) + ')' : ''), inlineClassName: 'ws-memo-inline' + (lost ? ' lost' : ''), cursorStops: monaco.editor.InjectedTextCursorStops.None }
    } });
    WSMEMO.slots.push({ line: line, ids: ms.map(function(m){ return m.id; }) });
  });
  WSMEMO.deco.set(decos);
}
/* 에디터가 줄을 따라 옮겨 준 새 위치를 저장해서 팀원 화면에도 반영 (코드가 고쳐진 뒤 잠깐 있다가) */
function wsMemoSyncSoon(){ clearTimeout(WSMEMO.syncT); WSMEMO.syncT = setTimeout(wsMemoSyncPositions, 2500); }
function wsMemoSyncPositions(){
  if(!(window.monaco && monacoEditor && WSMEMO.deco) || !wsMemoOn()) return;
  var model = monacoEditor.getModel(); if(!model) return;
  var sid = wsMemoSid(), jobs = 0;
  WSMEMO.slots.forEach(function(slot, i){
    var r = WSMEMO.deco.getRange(i); if(!r) return;
    var line = r.startLineNumber;
    if(line === slot.line) return;
    var text = wsMemoNorm(wsMemoLineText(model, line));
    slot.ids.forEach(function(id){
      var m = WSMEMO.items.filter(function(x){ return x.id === id; })[0];
      if(!m || jobs >= 20) return;
      var a = wsMemoNorm(m.anchor);
      if(a && text !== a && !(m._loc && m._loc.moved)) return;       // 줄이 지워져서 옆줄로 밀린 경우일 수 있다 → 위치를 바꾸지 않는다
      jobs++;
      apiFetch('/api/projects/' + sid + '/memos/' + id, { method: 'PATCH', body: JSON.stringify({ line: line, anchor: text }) })
        .then(function(row){ Object.assign(m, row); }).catch(function(){});
    });
    slot.line = line;
  });
}

/* ---------- 파일 트리 · 목록 ---------- */
function wsMemoPaintTree(){
  var tree = document.getElementById('wsFileTreeContent'); if(!tree) return;
  var count = {};
  WSMEMO.items.forEach(function(m){ if(!m.resolved) count[m.path] = (count[m.path] || 0) + 1; });
  tree.querySelectorAll('.ftree-node.file[data-key]').forEach(function(n){
    var old = n.querySelector('.fmemo'); if(old) old.remove();
    var f = files[n.dataset.key]; var c = f && count[f.path]; if(!c) return;
    var s = document.createElement('span'); s.className = 'fmemo'; s.title = '메모 ' + c + '개'; s.textContent = c;
    var nm = n.querySelector('.fname'); if(nm && nm.nextSibling) n.insertBefore(s, nm.nextSibling); else n.appendChild(s);
  });
}
function wsMemoVisible(){
  var path = wsMemoPath();
  return WSMEMO.items.filter(function(m){
    if(WSMEMO.onlyFile && m.path !== path) return false;
    return WSMEMO.filter === 'all' || (WSMEMO.filter === 'open' ? !m.resolved : m.resolved);
  });
}
function wsMemoRenderList(){
  var box = document.getElementById('wsMemoList'); if(!box) return;
  var all = WSMEMO.items, nOpen = all.filter(function(m){ return !m.resolved; }).length;
  var head = document.getElementById('wsMemoFilters');
  if(head){
    head.innerHTML = '';
    [['open', '열림 ' + nOpen], ['done', '해결 ' + (all.length - nOpen)], ['all', '전체 ' + all.length]].forEach(function(f){
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ws-mf' + (WSMEMO.filter === f[0] ? ' on' : ''); b.textContent = f[1];
      b.onclick = function(){ WSMEMO.filter = f[0]; wsMemoRenderList(); }; head.appendChild(b);
    });
    var add = document.createElement('button'); add.type = 'button'; add.className = 'ws-mf ws-mf-add'; add.title = '커서가 있는 줄에 메모 남기기 (' + wsKeyLabel('Ctrl+Alt+M') + ')';
    add.innerHTML = uiIc('note', 13) + '<span> 현재 줄에 메모</span>'; add.onclick = wsMemoAddAtCursor; head.appendChild(add);
    var lab = document.createElement('label'); lab.className = 'ws-mf-only';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = WSMEMO.onlyFile; cb.onchange = function(){ WSMEMO.onlyFile = cb.checked; wsMemoRenderList(); };
    lab.appendChild(cb); lab.appendChild(document.createTextNode(' 이 파일만')); head.appendChild(lab);
  }
  box.innerHTML = '';
  var list = wsMemoVisible();
  if(!wsMemoOn()){ box.innerHTML = '<div class="ws-memo-empty">로그인한 프로젝트에서 메모를 쓸 수 있어요.</div>'; return; }
  if(!list.length){
    var e = document.createElement('div'); e.className = 'ws-memo-empty';
    e.innerHTML = (all.length ? '이 조건에 맞는 메모가 없어요.' : '아직 메모가 없어요.<br>코드 줄에 커서를 두고 <b>메모</b> 버튼(' + wsKeyLabel('Ctrl+Alt+M') + ')을 누르거나, 두레에게 “민수님이 이 줄 수정해야 하니까 메모 남겨줘”라고 말해 보세요.');
    box.appendChild(e); return;
  }
  var cur = null;
  list.slice().sort(function(a, b){ return a.path < b.path ? -1 : a.path > b.path ? 1 : (a.line - b.line) || (a.id - b.id); }).forEach(function(m){
    if(m.path !== cur){
      cur = m.path;
      var h = document.createElement('div'); h.className = 'ws-memo-file'; h.textContent = m.path; box.appendChild(h);
    }
    box.appendChild(wsMemoRow(m));
  });
}
function wsMemoRow(m){
  var row = document.createElement('div'); row.className = 'ws-memo-row' + (m.resolved ? ' done' : '');
  var ln = document.createElement('button'); ln.type = 'button'; ln.className = 'ws-memo-ln'; ln.textContent = m.line;
  ln.title = m.path + ' ' + m.line + '번 줄로 이동'; ln.onclick = function(){ wsMemoGo(m); };
  var mid = document.createElement('div'); mid.className = 'ws-memo-mid';
  var tx = document.createElement('div'); tx.className = 'ws-memo-tx'; tx.textContent = m.text; tx.onclick = function(){ wsMemoGo(m); };
  var meta = document.createElement('div'); meta.className = 'ws-memo-meta';
  meta.textContent = (m.author || 'AI') + (m.source === 'ai' ? ' · 두레' : '') + ' · ' + wsMemoAgo(m.created_at);
  if(m.assignee){ var as = document.createElement('span'); as.className = 'ws-memo-as'; as.textContent = m.assignee + '님'; meta.appendChild(as); }
  if(m.resolved && m.resolved_by){ var rs = document.createElement('span'); rs.className = 'ws-memo-rs'; rs.textContent = m.resolved_by + ' 해결'; meta.appendChild(rs); }
  mid.appendChild(tx); mid.appendChild(meta);
  var act = document.createElement('div'); act.className = 'ws-memo-act';
  var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'ws-memo-ok'; ok.title = m.resolved ? '다시 열기' : '해결했어요';
  ok.innerHTML = uiIc(m.resolved ? 'undo' : 'checkc', 15); ok.onclick = function(){ wsMemoResolve(m, !m.resolved); };
  act.appendChild(ok);
  if(m.can_edit){
    var del = document.createElement('button'); del.type = 'button'; del.className = 'ws-memo-del'; del.title = '지우기'; del.innerHTML = uiIc('trash', 15);
    del.onclick = function(){ wsMemoDelete(m); }; act.appendChild(del);
  }
  row.appendChild(ln); row.appendChild(mid); row.appendChild(act);
  return row;
}
function wsMemoShowList(){
  var p = document.getElementById('wsTerminalPanel');
  if(p && p.classList.contains('collapsed') && typeof toggleTerminal === 'function') toggleTerminal();
  if(typeof setTerminalTab === 'function') setTerminalTab('memo');
}
/* 메모가 있는 줄로 이동: 지금 열린 파일이면 그 자리에서, 아니면 파일을 열고 이동한 뒤 메모 창을 연다 */
function wsMemoGo(m){
  var line = (m._loc && m._loc.line) || m.line;
  var same = wsMemoPath() === m.path && window.monaco && monacoEditor;
  if(same){ monacoEditor.revealLineInCenter(line); monacoEditor.setPosition({ lineNumber: line, column: 1 }); wsMemoOpenPop(line); return; }
  if(typeof wsJumpTo === 'function') wsJumpTo(wsMemoSid(), m.path, line);
  setTimeout(function(){ if(wsMemoPath() === m.path) wsMemoOpenPop(line); }, 900);
}

/* ---------- 메모 창 (줄 옆에 뜨는 작은 창 · 폰에서는 아래에서 올라오는 시트) ---------- */
function wsMemoEnsurePop(){
  if(WSMEMO.pop) return WSMEMO.pop;
  var host = document.getElementById('editorBody'); if(!host) return null;
  var p = document.createElement('div'); p.id = 'wsMemoPop'; p.className = 'ws-memo-pop'; p.hidden = true;
  p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', '코드 줄 메모');
  p.onmousedown = function(e){ e.stopPropagation(); }; p.onclick = function(e){ e.stopPropagation(); };
  host.appendChild(p); WSMEMO.pop = p;
  document.addEventListener('mousedown', function(e){ if(WSMEMO.pop && !WSMEMO.pop.hidden && !WSMEMO.pop.contains(e.target) && !(e.target.closest && e.target.closest('.monaco-editor .margin'))) wsMemoClosePop(); });
  return p;
}
function wsMemoClosePop(){ if(WSMEMO.pop) WSMEMO.pop.hidden = true; WSMEMO.popLine = null; }
function wsMemoOpenPop(line){
  if(!(window.monaco && monacoEditor)) return;
  if(!wsMemoOn()){ pushToast('🔒', '프로젝트를 열어야 해요', '로그인한 뒤 프로젝트의 파일에서 메모를 남길 수 있어요.'); return; }
  var path = wsMemoPath(); if(!path){ pushToast('📄', '열린 파일이 없어요', '메모를 남길 파일을 먼저 열어 주세요.'); return; }
  var pop = wsMemoEnsurePop(); if(!pop) return;
  WSMEMO.popLine = line; pop.hidden = false;
  wsMemoFillPop();
  wsMemoPlacePop(line);
  var ta = pop.querySelector('input.wmp-in'); if(ta && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) setTimeout(function(){ ta.focus(); }, 30);
}
function wsMemoPlacePop(line){
  var pop = WSMEMO.pop, host = document.getElementById('editorBody'); if(!pop || !host) return;
  if(window.matchMedia && matchMedia('(max-width: 820px), (max-height: 560px)').matches){ pop.style.top = ''; pop.style.left = ''; return; }      // 폰·낮은 화면: CSS 의 아래 시트
  var pos = monacoEditor.getScrolledVisiblePosition({ lineNumber: line, column: 1 });
  var hr = host.getBoundingClientRect(), er = monacoEditor.getDomNode().getBoundingClientRect();
  var w = pop.offsetWidth || 340, h = pop.offsetHeight || 220;
  var top = (pos ? pos.top + pos.height + 6 : 40) + (er.top - hr.top), left = Math.max(56, (pos ? pos.left : 60) + 8);
  if(top + h > hr.height - 6) top = Math.max(6, (pos ? pos.top : 40) + (er.top - hr.top) - h - 6);
  left = Math.min(left, Math.max(6, hr.width - w - 10));
  pop.style.top = Math.max(4, top) + 'px'; pop.style.left = left + 'px';
}
/* '@민수' / '@민수님' 처럼 글 속에 팀원을 적으면 그 사람이 담당자가 된다 (알림이 간다). 본인·없는 이름은 무시 */
function wsMemoMention(text){
  var m = /@([^\s@]+)/.exec(text || ''); if(!m) return null;
  var name = m[1].replace(/님$/, ''), me = currentUser && currentUser.id;
  var list = wsMemoMembers().filter(function(x){ return x.id !== me; });
  var hit = list.filter(function(x){ return x.username === name; })[0] || list.filter(function(x){ return x.username.indexOf(name) === 0 || name.indexOf(x.username) === 0; })[0];
  return hit ? hit.id : null;
}
function wsMemoFillPop(){
  var pop = WSMEMO.pop, line = WSMEMO.popLine; if(!pop || !line) return;
  var path = wsMemoPath();
  var here = wsMemoFileItems(path).filter(function(m){ var l = m._loc ? m._loc.line : m.line; return l === line; });
  var keep = (pop.querySelector('input.wmp-in') || {}).value || '';
  pop.innerHTML = '';
  if(here.length){
    var list = document.createElement('div'); list.className = 'wmp-list';
    here.forEach(function(m){ list.appendChild(wsMemoPopItem(m)); });
    pop.appendChild(list);
  }
  var row = document.createElement('div'); row.className = 'wmp-row';
  var ic = document.createElement('span'); ic.className = 'wmp-ic'; ic.innerHTML = uiIc('note', 14); row.appendChild(ic);
  var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'wmp-in'; inp.maxLength = 300; inp.value = keep; inp.autocomplete = 'off'; inp.spellcheck = false;
  inp.placeholder = here.length ? '메모 더 남기기' : '메모 남기기  ·  @이름 으로 담당 지정';
  inp.setAttribute('enterkeyhint', 'send');
  inp.onkeydown = function(e){ e.stopPropagation(); if(e.key === 'Enter' && !e.isComposing){ e.preventDefault(); wsMemoSave(line); } else if(e.key === 'Escape'){ wsMemoClosePop(); } };
  row.appendChild(inp);
  var go = document.createElement('button'); go.type = 'button'; go.className = 'wmp-go'; go.title = '남기기 (Enter)'; go.setAttribute('aria-label', '메모 남기기'); go.innerHTML = uiIc('send', 15); go.onclick = function(){ wsMemoSave(line); };
  row.appendChild(go);
  pop.appendChild(row);
}
function wsMemoPopItem(m){
  var it = document.createElement('div'); it.className = 'wmp-item' + (m.resolved ? ' done' : '');
  var body = document.createElement('div'); body.className = 'wmp-body';
  var tx = document.createElement('div'); tx.className = 'wmp-tx'; tx.textContent = m.text; body.appendChild(tx);
  var meta = document.createElement('div'); meta.className = 'wmp-meta';
  meta.textContent = (m.author || '두레') + ' · ' + wsMemoAgo(m.created_at) + (m.assignee ? ' · ' + m.assignee + '님' : '');
  if(m._loc && m._loc.lost){ meta.textContent += ' · 줄이 바뀐 것 같아요'; meta.classList.add('warn'); }
  body.appendChild(meta);
  it.appendChild(body);
  var act = document.createElement('div'); act.className = 'wmp-act';
  var mk = function(icon, title, fn, cls){ var b = document.createElement('button'); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.innerHTML = uiIc(icon, 14); if(cls) b.className = cls; b.onclick = fn; act.appendChild(b); };
  mk(m.resolved ? 'undo' : 'checkc', m.resolved ? '다시 열기' : '해결했어요', function(){ wsMemoResolve(m, !m.resolved); });
  if(m.can_edit){ mk('pencil', '고치기', function(){ wsMemoEdit(m, it, tx); }); mk('trash', '지우기', function(){ wsMemoDelete(m); }, 'danger'); }
  it.appendChild(act);
  return it;
}
function wsMemoEdit(m, it, tx){
  var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'wmp-edit'; inp.maxLength = 300; inp.value = m.text;
  var go = function(){ var t = inp.value.trim(); if(!t || t === m.text){ wsMemoFillPop(); return; } wsMemoPatch(m, { text: t }); };
  inp.onkeydown = function(e){ e.stopPropagation(); if(e.key === 'Enter' && !e.isComposing){ e.preventDefault(); go(); } else if(e.key === 'Escape'){ wsMemoFillPop(); } };
  inp.onblur = function(){ setTimeout(function(){ if(inp.isConnected) go(); }, 120); };
  tx.replaceWith(inp); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
}

/* ---------- 달기 · 고치기 · 해결 · 지우기 ---------- */
function wsMemoAddAtCursor(){
  if(!(window.monaco && monacoEditor) || !currentFileKey){ pushToast('📄', '열린 파일이 없어요', '메모를 남길 파일을 먼저 열어 주세요.'); return; }
  wsMemoOpenPop(monacoEditor.getPosition().lineNumber);
}
function wsMemoSave(line){
  var pop = WSMEMO.pop; if(!pop) return;
  var inp = pop.querySelector('input.wmp-in'), text = inp ? inp.value.trim() : '';
  if(!text){ if(inp) inp.focus(); return; }
  var f = files[currentFileKey], model = monacoEditor.getModel(), go = pop.querySelector('.wmp-go');
  if(go) go.disabled = true;
  var body = { path: f.path, line: line, text: text, anchor: wsMemoNorm(wsMemoLineText(model, line)), assignee_id: wsMemoMention(text) };
  function post(){ return apiFetch('/api/projects/' + wsMemoSid() + '/memos', { method: 'POST', body: JSON.stringify(body) }); }
  var pre = (f.dirty ? wsSave(currentFileKey) : Promise.resolve());       // 아직 서버에 없는 새 파일이면 먼저 저장한다
  pre.then(post).catch(function(e){ if(e && e.status === 404){ return new Promise(function(r){ setTimeout(r, 900); }).then(post); } throw e; }).then(function(row){
    WSMEMO.items.push(row);
    wsMemoClosePop();                                                    // 남기면 창은 바로 닫혀서 코드를 가리지 않는다 — 줄 끝에 작게 붙어 보인다
    wsMemoRenderAll();
  }).catch(function(e){ if(e && e.status !== 401) pushToast('⚠️', '메모를 남기지 못했어요', e && e.message ? e.message : ''); if(go) go.disabled = false; });
}
function wsMemoPatch(m, body){
  return apiFetch('/api/projects/' + wsMemoSid() + '/memos/' + m.id, { method: 'PATCH', body: JSON.stringify(body) }).then(function(row){
    Object.assign(m, row); wsMemoRenderAll();
  }).catch(function(e){ if(e && e.status !== 401) pushToast('⚠️', '메모를 바꾸지 못했어요', e && e.message ? e.message : ''); });
}
function wsMemoResolve(m, on){ return wsMemoPatch(m, { resolved: !!on }); }
function wsMemoDelete(m){
  apiFetch('/api/projects/' + wsMemoSid() + '/memos/' + m.id, { method: 'DELETE' }).then(function(){
    WSMEMO.items = WSMEMO.items.filter(function(x){ return x.id !== m.id; }); wsMemoRenderAll();
    if(WSMEMO.popLine && !wsMemoFileItems(wsMemoPath()).some(function(x){ return (x._loc ? x._loc.line : x.line) === WSMEMO.popLine; }) && WSMEMO.pop && !(WSMEMO.pop.querySelector('input.wmp-in') || {}).value) wsMemoClosePop();
  }).catch(function(e){ if(e && e.status !== 401) pushToast('⚠️', '메모를 지우지 못했어요', e && e.message ? e.message : ''); });
}

/* ---------- 연결 ---------- */
function wsMemoInit(){
  if(WSMEMO.inited || !(window.monaco && monacoEditor)) return;
  WSMEMO.inited = true;
  var BAR = monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS, TXT = monaco.editor.MouseTargetType.CONTENT_TEXT;
  monacoEditor.onMouseDown(function(e){
    var t = e.target; if(!t || !t.position || !wsMemoHasLine(t.position.lineNumber)) return;
    if(t.type === BAR) wsMemoOpenPop(t.position.lineNumber);                                           // 줄 번호 옆 색 막대
    else if(t.type === TXT && t.detail && t.detail.injectedText) wsMemoOpenPop(t.position.lineNumber);   // 줄 끝의 미리보기 글자
  });
  monacoEditor.onDidChangeModelContent(function(){
    if(typeof wsSettingValue !== 'undefined' && wsSettingValue) return;
    wsMemoSyncSoon();
    if(WSMEMO.pop && !WSMEMO.pop.hidden) wsMemoClosePop();
  });
  monacoEditor.onDidScrollChange(function(){ if(WSMEMO.pop && !WSMEMO.pop.hidden && WSMEMO.popLine) wsMemoPlacePop(WSMEMO.popLine); });
  monacoEditor.addAction({ id: 'ws-memo-add', label: '이 줄에 메모 남기기', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyM],
    contextMenuGroupId: 'navigation', contextMenuOrder: 1.6, run: function(){ wsMemoAddAtCursor(); } });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && WSMEMO.pop && !WSMEMO.pop.hidden) wsMemoClosePop(); });
  wsMemoRender();
}
