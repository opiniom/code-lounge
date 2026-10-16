/* ---- 워크스페이스 실시간 현황: 팀원이 지금 어떤 파일을 보고/수정 중인지 ----
   내가 파일을 열거나 타이핑하면 서버(/ws/live)에 알리고, 서버는 같은 프로젝트 팀원에게만 전달한다.
   파일 목록 · 탭 · 상단 바에 작은 원형 프로필로 보여준다. 저장하지 않는 순간 정보라서 DB 에는 남지 않는다. */
var WSP = {};                       // userId -> { name, path, editing, at }
var wsPresFirst = true, wsPresSig = '', wsPresLastAt = 0, wsPresTimer = null, wsPresSweep = null, wsEditing = false, wsEditT = null, wsPresActive = false;
var WSP_TTL = 75000;                // 이 시간 동안 신호가 없으면(탭이 죽었거나 끊김) 표시를 지운다

function wsPresMyPath(){ var f = currentFileKey ? files[currentFileKey] : null; return f && f.path ? f.path : null; }
function wsPresInWorkspace(){ return !!document.querySelector('.view.active[data-view="workspace"]'); }

/* 내 커서(어느 줄·어느 칸, 드래그한 영역) */
function wsPresMyCursor(){
  if(!window.monaco || !monacoEditor || !currentFileKey) return null;
  var p = monacoEditor.getPosition(); if(!p) return null;
  var c = { line:p.lineNumber, col:p.column }, sel = monacoEditor.getSelection();
  if(sel && !sel.isEmpty()){ c.sl = sel.startLineNumber; c.sc = sel.startColumn; c.el = sel.endLineNumber; c.ec = sel.endColumn; }
  return c;
}
/* 내 상태를 서버에 알린다 (바뀐 때만 + 20초마다 한 번씩 '아직 여기 있어요') */
function wsPresSend(force){
  if(!calApiMode || !wsUseServer() || !wsPresInWorkspace()) return;
  var path = wsPresMyPath(), cur = path ? wsPresMyCursor() : null;
  var sig = wsServerId() + '|' + path + '|' + (wsEditing ? 1 : 0) + '|' + (cur ? [cur.line, cur.col, cur.sl, cur.sc, cur.el, cur.ec].join(',') : ''), now = Date.now();
  if(!force && sig === wsPresSig && now - wsPresLastAt < 20000) return;
  var msg = { t:'ws', project_id:wsServerId(), path:path, editing:wsEditing, cur:cur };
  if(wsPresFirst){ msg.snap = true; }
  if(liveSend(msg)){ wsPresSig = sig; wsPresLastAt = now; wsPresActive = true; wsPresFirst = false; }
}
/* 커서는 자주 움직이므로 150ms 마다 한 번만 (맨 앞과 맨 뒤는 반드시 보냄) */
function wsPresSync(){ if(wsPresTimer) return; wsPresTimer = setTimeout(function(){ wsPresTimer = null; wsPresSend(false); }, 150); }
function wsPresStart(){
  wsPresSig = ''; wsPresFirst = true; wsPresSend(true);
  if(!wsPresSweep) wsPresSweep = setInterval(function(){ if(!wsPresInWorkspace()) return; wsPresSend(false); wsPresExpire(); }, 15000);
}
/* 워크스페이스를 떠남 / 프로젝트 바꿈: 내 표시를 지우고, 받아 둔 팀원 표시도 비운다 */
function wsPresLeave(){
  if(wsPresActive && wsUseServer()){ liveSend({ t:'ws', project_id:wsServerId(), path:null, editing:false }); }
  wsPresActive = false; wsPresSig = ''; wsPresFirst = true; wsEditing = false; clearTimeout(wsEditT);
  WSP = {}; wsPresPaint();
}
/* 타이핑하는 동안 '수정 중', 5초 멈추면 '보는 중' */
function wsPresTyped(){
  if(!wsEditing){ wsEditing = true; wsPresSend(true); }
  clearTimeout(wsEditT); wsEditT = setTimeout(function(){ wsEditing = false; wsPresSend(true); }, 5000);
}

/* 서버에서 온 신호 */
function wsPresHandle(m){
  if(!m || m.project_id !== wsServerId()) return;
  if(m.t === 'wssnap'){
    WSP = {}; (m.items || []).forEach(function(it){ if(it.path) WSP[it.user_id] = { name:it.name, path:it.path, editing:!!it.editing, cur:it.cur || null, at:Date.now() }; });
    wsPresPaint(); return;
  }
  var old = WSP[m.user_id];
  if(!m.path){ delete WSP[m.user_id]; wsPresPaint(); return; }
  WSP[m.user_id] = { name:m.name, path:m.path, editing:!!m.editing, cur:m.cur || null, at:Date.now() };
  /* 같은 파일 · 같은 상태에서 커서만 움직였으면 에디터 안 표시만 다시 그린다 (파일 목록까지 매번 다시 그리지 않음) */
  if(old && old.path === m.path && old.editing === !!m.editing){ wsPresCursors(); wsPresNow(); wsPresSameFile(); }
  else wsPresPaint();
}
function wsPresExpire(){
  var changed = false, now = Date.now();
  Object.keys(WSP).forEach(function(k){ if(now - WSP[k].at > WSP_TTL){ delete WSP[k]; changed = true; } });
  if(changed) wsPresPaint();
}
/* 이 파일(또는 이 폴더 안)에 있는 팀원들 */
function wsPresAt(path, asFolder){
  var out = [];
  Object.keys(WSP).forEach(function(k){
    var w = WSP[k]; if(!w.path) return;
    if(asFolder ? w.path.indexOf(path + '/') === 0 : w.path === path) out.push({ id:k, name:w.name, editing:w.editing, path:w.path, cur:w.cur });
  });
  out.sort(function(a, b){ return (b.editing ? 1 : 0) - (a.editing ? 1 : 0) || String(a.name).localeCompare(b.name); });
  return out;
}
function wsPresDot(w, cls){
  var d = document.createElement('span'); d.className = 'wsp-av' + (cls ? ' ' + cls : '') + (w.editing ? ' editing' : '');
  d.style.background = chatColor(w.name || '?'); d.textContent = String(w.name || '?').slice(0, 1);
  d.title = w.name + (w.editing ? ' · 수정 중' : ' · 보는 중') + (w.path ? ' · ' + w.path : '') + (w.cur ? ':' + w.cur.line : '');
  return d;
}
function wsPresGroup(list, cls, max){
  var g = document.createElement('span'); g.className = 'wsp-group ' + (cls || '');
  list.slice(0, max || 3).forEach(function(w){ g.appendChild(wsPresDot(w)); });
  if(list.length > (max || 3)){ var more = document.createElement('span'); more.className = 'wsp-more'; more.textContent = '+' + (list.length - (max || 3)); g.appendChild(more); }
  return g;
}
/* 화면에 그리기: 파일 목록 · 폴더 · 탭 · 상단 바 · 같은 파일 안내 (이미 그려진 DOM 위에 덧붙이는 방식) */
function wsPresPaint(){
  document.querySelectorAll('.wsp-group, .ws-now-chip').forEach(function(n){ n.remove(); });
  document.querySelectorAll('.wsp-here').forEach(function(n){ n.classList.remove('wsp-here'); });
  var open = {};   // 접힌 폴더 안에 있는 사람도 폴더 줄에 보이게
  document.querySelectorAll('#wsFileTreeContent .ftree-node.file[data-key]').forEach(function(n){
    var f = files[n.dataset.key]; if(!f) return;
    var at = wsPresAt(f.path); if(!at.length) return;
    n.classList.add('wsp-here'); var anchor = n.querySelector('.fact'); n.insertBefore(wsPresGroup(at, 'in-tree', 3), anchor || n.querySelector('.fdot'));
  });
  document.querySelectorAll('#wsFileTreeContent .ftree-node.folder.closed[data-path]').forEach(function(n){
    var at = wsPresAt(n.dataset.path, true); if(!at.length) return;
    var seen = {}, uniq = at.filter(function(w){ if(seen[w.id]) return false; seen[w.id] = 1; return true; });
    n.insertBefore(wsPresGroup(uniq, 'in-tree', 3), n.querySelector('.fcnt'));
  });
  document.querySelectorAll('#editorTabs .etab[data-file]').forEach(function(t){
    var f = files[t.dataset.file]; if(!f) return;
    var at = wsPresAt(f.path); if(!at.length) return;
    t.insertBefore(wsPresGroup(at, 'in-tab', 2), t.querySelector('.etab-mod, .etab-close'));
  });
  wsPresNow(); wsPresSameFile(); wsPresCursors();
}
/* 상단 바: '지금 작업 중' 칩 (눌러서 그 파일 열기) */
function wsPresNow(){
  var box = document.getElementById('wsNow'); if(!box) return;
  var ids = Object.keys(WSP);
  box.innerHTML = '';
  if(!ids.length){ box.hidden = true; return; }
  box.hidden = false;
  var lbl = document.createElement('span'); lbl.className = 'ws-now-lbl'; lbl.innerHTML = '<i></i>지금 작업 중'; box.appendChild(lbl);
  ids.sort(function(a, b){ return (WSP[b].editing ? 1 : 0) - (WSP[a].editing ? 1 : 0); }).slice(0, 4).forEach(function(id){
    var w = WSP[id], base = String(w.path).split('/').pop(); w = { id:id, name:w.name, path:w.path, editing:w.editing, cur:w.cur };
    var chip = document.createElement('button'); chip.type = 'button'; chip.className = 'ws-now-chip' + (w.editing ? ' editing' : '');
    chip.title = w.name + ' · ' + w.path + (w.cur ? ' · ' + w.cur.line + '번째 줄' : '') + (w.editing ? ' · 수정 중' : ' · 보는 중') + ' (눌러서 그 위치로 이동)';
    chip.appendChild(wsPresDot({ name:w.name, editing:w.editing, path:w.path }));
    var t = document.createElement('span'); t.className = 'ws-now-file'; t.textContent = base + (w.cur ? ':' + w.cur.line : ''); chip.appendChild(t);
    chip.onclick = function(){ wsPresGoto(w); };
    box.appendChild(chip);
  });
  if(ids.length > 4){ var more = document.createElement('span'); more.className = 'wsp-more'; more.textContent = '+' + (ids.length - 4); box.appendChild(more); }
}
/* 그 팀원의 위치로 이동: 다른 파일이면 열고, 그 줄로 스크롤 */
function wsPresGoto(w){
  var k = wsKey(w.path); if(!files[k]) return;
  if(currentFileKey !== k) wsOpenKey(k);
  var go = function(){ if(window.monaco && monacoEditor && w.cur){ var ln = Math.min(w.cur.line, monacoEditor.getModel().getLineCount()); monacoEditor.revealLineInCenter(ln); monacoEditor.setPosition({ lineNumber:ln, column:Math.min(w.cur.col, monacoEditor.getModel().getLineMaxColumn(ln)) }); monacoEditor.focus(); } };
  setTimeout(go, currentFileKey === k ? 0 : 120);
}
/* 내가 열어 둔 파일을 팀원도 보고/수정 중이면 에디터 위에 한 줄로 알려 준다 (어느 줄인지, 눌러서 이동) */
function wsPresSameFile(){
  var bar = document.getElementById('wsSameBar'); if(!bar) return;
  var mine = wsPresMyPath(), list = mine ? wsPresAt(mine) : [];
  if(!list.length){ bar.hidden = true; bar.innerHTML = ''; return; }
  var editors = list.filter(function(w){ return w.editing; });
  bar.hidden = false; bar.className = 'ws-same' + (editors.length ? ' editing' : '');
  bar.innerHTML = ''; bar.appendChild(wsPresGroup(list, '', 3));
  var msg = document.createElement('span'); msg.className = 'ws-same-msg';
  var parts = list.map(function(w){ return w.name + (w.cur ? ' ' + w.cur.line + '번째 줄' : '') + (w.editing ? ' 수정 중' : ''); });
  msg.textContent = parts.join(' · ') + (editors.length ? ' — 같은 곳을 고치면 충돌할 수 있어요' : '');
  bar.appendChild(msg);
  var first = list.find(function(w){ return w.cur; });
  if(first){ var go = document.createElement('button'); go.type = 'button'; go.className = 'btn'; go.textContent = first.name + '님 위치로'; go.onclick = function(){ wsPresGoto(first); }; bar.appendChild(go); }
}

/* ---- 에디터 안: 팀원의 커서(작은 아바타) · 선택 영역 · 줄 표시 ----
   Monaco 의 content widget 으로 커서와 아바타를 그리고, decoration 으로 줄·선택 영역을 칠한다. */
var wsCurWidgets = {}, wsCurDeco = null, wsCurStyle = null, wsCurStyled = {};
function wsHexA(hex, a){ var n = parseInt(String(hex).slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
function wsCurEnsureStyle(uid, name){
  var color = chatColor(name || '?'), key = uid + color;
  if(wsCurStyled[uid] === key) return color;
  wsCurStyled[uid] = key;
  if(!wsCurStyle){ wsCurStyle = document.createElement('style'); wsCurStyle.id = 'wsCursorStyle'; document.head.appendChild(wsCurStyle); }
  var css = '';
  Object.keys(wsCurStyled).forEach(function(u){ var nm = (WSP[u] && WSP[u].name) || name, c = chatColor(nm || '?');
    css += '.wsc-u' + u + '{--c:' + c + ';} .wss-u' + u + '{background:' + wsHexA(c, .28) + ';} .wsline-u' + u + '{background:' + wsHexA(c, .08) + ';} .wsline-u' + u + '.editing{background:' + wsHexA(c, .15) + ';} .wslg-u' + u + '{background:' + c + '; width:3px !important; margin-left:3px; border-radius:2px;}\n'; });
  wsCurStyle.textContent = css; return color;
}
function wsCurRemove(uid){
  var w = wsCurWidgets[uid]; if(!w) return;
  try { if(monacoEditor) monacoEditor.removeContentWidget(w.widget); } catch(e){}
  clearTimeout(w.t); delete wsCurWidgets[uid];
}
function wsCurMake(uid, who){
  var node = document.createElement('div'); node.className = 'wsc wsc-u' + uid;
  node.innerHTML = '<span class="wsc-caret"></span><span class="wsc-av"></span><span class="wsc-name"></span>';
  var rec = { node:node, line:1, col:1, t:null, lastLine:0, lastEdit:false };
  rec.widget = { getId:function(){ return 'wsp.cursor.' + uid; }, getDomNode:function(){ return node; },
    getPosition:function(){ return { position:{ lineNumber:rec.line, column:rec.col }, preference:[monaco.editor.ContentWidgetPositionPreference.EXACT] }; } };
  monacoEditor.addContentWidget(rec.widget); wsCurWidgets[uid] = rec; return rec;
}
function wsPresCursors(){
  if(!window.monaco || !monacoEditor) return;
  var model = monacoEditor.getModel(), mine = wsPresMyPath(), seen = {}, decos = [];
  var lh = monacoEditor.getOption(monaco.editor.EditorOption.lineHeight);
  if(model && mine && currentFileKey){
    Object.keys(WSP).forEach(function(uid){
      var w = WSP[uid]; if(w.path !== mine || !w.cur) return;
      var color = wsCurEnsureStyle(uid, w.name), maxL = model.getLineCount();
      var ln = Math.min(w.cur.line, maxL), col = Math.min(w.cur.col, model.getLineMaxColumn(ln));
      seen[uid] = 1;
      var rec = wsCurWidgets[uid] || wsCurMake(uid, w);
      var movedLine = rec.lastLine !== ln, startedEdit = w.editing && !rec.lastEdit;
      rec.line = ln; rec.col = col; rec.lastLine = ln; rec.lastEdit = w.editing;
      rec.node.style.setProperty('--lh', lh + 'px');
      rec.node.classList.toggle('editing', !!w.editing); rec.node.classList.toggle('below', ln <= 1);
      rec.node.querySelector('.wsc-av').textContent = String(w.name || '?').slice(0, 1);
      rec.node.querySelector('.wsc-name').textContent = w.name + (w.editing ? ' · 수정 중' : '');
      if(movedLine || startedEdit){ rec.node.classList.add('show'); clearTimeout(rec.t); rec.t = setTimeout(function(){ rec.node.classList.remove('show'); }, 2600); }
      monacoEditor.layoutContentWidget(rec.widget);
      decos.push({ range:new monaco.Range(ln, 1, ln, 1), options:{ isWholeLine:true, className:'wsline wsline-u' + uid + (w.editing ? ' editing' : ''), linesDecorationsClassName:'wslg wslg-u' + uid, overviewRuler:{ color:color, position:monaco.editor.OverviewRulerLane.Right } } });
      if(w.cur.sl){
        var r = new monaco.Range(Math.min(w.cur.sl, maxL), w.cur.sc, Math.min(w.cur.el, maxL), w.cur.ec);
        decos.push({ range:r, options:{ className:'wss wss-u' + uid } });
      }
    });
  }
  Object.keys(wsCurWidgets).forEach(function(uid){ if(!seen[uid]) wsCurRemove(uid); });
  if(!wsCurDeco) wsCurDeco = monacoEditor.createDecorationsCollection([]);
  wsCurDeco.set(decos);
}
/* 내 커서가 움직이거나 선택이 바뀌면 팀원에게 알린다 */
function wsPresHookEditor(){
  if(!window.monaco || !monacoEditor || monacoEditor._wspHooked) return;
  monacoEditor._wspHooked = true;
  monacoEditor.onDidChangeCursorSelection(function(){ wsPresSync(); });
  monacoEditor.onDidChangeModel(function(){ wsPresCursors(); });
}
