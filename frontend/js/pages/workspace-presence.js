/* ---- 워크스페이스 실시간 현황: 팀원이 지금 어떤 파일을 보고/수정 중인지 ----
   내가 파일을 열거나 타이핑하면 서버(/ws/live)에 알리고, 서버는 같은 프로젝트 팀원에게만 전달한다.
   파일 목록 · 탭 · 상단 바에 작은 원형 프로필로 보여준다. 저장하지 않는 순간 정보라서 DB 에는 남지 않는다. */
var WSP = {};                       // userId -> { name, path, editing, at }
var wsPresSig = '', wsPresLastAt = 0, wsPresTimer = null, wsPresSweep = null, wsEditing = false, wsEditT = null, wsPresActive = false;
var WSP_TTL = 75000;                // 이 시간 동안 신호가 없으면(탭이 죽었거나 끊김) 표시를 지운다

function wsPresMyPath(){ var f = currentFileKey ? files[currentFileKey] : null; return f && f.path ? f.path : null; }
function wsPresInWorkspace(){ return !!document.querySelector('.view.active[data-view="workspace"]'); }

/* 내 상태를 서버에 알린다 (바뀐 때만 + 20초마다 한 번씩 '아직 여기 있어요') */
function wsPresSend(force){
  if(!calApiMode || !wsUseServer() || !wsPresInWorkspace()) return;
  var path = wsPresMyPath(), sig = wsServerId() + '|' + path + '|' + (wsEditing ? 1 : 0), now = Date.now();
  if(!force && sig === wsPresSig && now - wsPresLastAt < 20000) return;
  if(liveSend({ t:'ws', project_id:wsServerId(), path:path, editing:wsEditing })){ wsPresSig = sig; wsPresLastAt = now; wsPresActive = true; }
}
function wsPresSync(){ clearTimeout(wsPresTimer); wsPresTimer = setTimeout(function(){ wsPresSend(false); }, 120); }
function wsPresStart(){
  wsPresSig = ''; wsPresSend(true);
  if(!wsPresSweep) wsPresSweep = setInterval(function(){ if(!wsPresInWorkspace()) return; wsPresSend(false); wsPresExpire(); }, 15000);
}
/* 워크스페이스를 떠남 / 프로젝트 바꿈: 내 표시를 지우고, 받아 둔 팀원 표시도 비운다 */
function wsPresLeave(){
  if(wsPresActive && wsUseServer()){ liveSend({ t:'ws', project_id:wsServerId(), path:null, editing:false }); }
  wsPresActive = false; wsPresSig = ''; wsEditing = false; clearTimeout(wsEditT);
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
    WSP = {}; (m.items || []).forEach(function(it){ if(it.path) WSP[it.user_id] = { name:it.name, path:it.path, editing:!!it.editing, at:Date.now() }; });
  } else if(m.t === 'wspres'){
    if(!m.path) delete WSP[m.user_id]; else WSP[m.user_id] = { name:m.name, path:m.path, editing:!!m.editing, at:Date.now() };
  }
  wsPresPaint();
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
    if(asFolder ? w.path.indexOf(path + '/') === 0 : w.path === path) out.push({ id:k, name:w.name, editing:w.editing, path:w.path });
  });
  out.sort(function(a, b){ return (b.editing ? 1 : 0) - (a.editing ? 1 : 0) || String(a.name).localeCompare(b.name); });
  return out;
}
function wsPresDot(w, cls){
  var d = document.createElement('span'); d.className = 'wsp-av' + (cls ? ' ' + cls : '') + (w.editing ? ' editing' : '');
  d.style.background = chatColor(w.name || '?'); d.textContent = String(w.name || '?').slice(0, 1);
  d.title = w.name + (w.editing ? ' · 수정 중' : ' · 보는 중') + (w.path ? ' · ' + w.path : '');
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
  wsPresNow(); wsPresSameFile();
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
    var w = WSP[id], base = String(w.path).split('/').pop();
    var chip = document.createElement('button'); chip.type = 'button'; chip.className = 'ws-now-chip' + (w.editing ? ' editing' : '');
    chip.title = w.name + ' · ' + w.path + (w.editing ? ' · 수정 중' : ' · 보는 중') + ' (눌러서 열기)';
    chip.appendChild(wsPresDot({ name:w.name, editing:w.editing, path:w.path }));
    var t = document.createElement('span'); t.className = 'ws-now-file'; t.textContent = base; chip.appendChild(t);
    chip.onclick = function(){ var k = wsKey(w.path); if(files[k]) wsOpenKey(k); };
    box.appendChild(chip);
  });
  if(ids.length > 4){ var more = document.createElement('span'); more.className = 'wsp-more'; more.textContent = '+' + (ids.length - 4); box.appendChild(more); }
}
/* 내가 열어 둔 파일을 팀원도 보고/수정 중이면 에디터 위에 한 줄로 알려 준다 (겹쳐 쓰다 충돌하지 않게) */
function wsPresSameFile(){
  var bar = document.getElementById('wsSameBar'); if(!bar) return;
  var mine = wsPresMyPath(), list = mine ? wsPresAt(mine) : [];
  if(!list.length){ bar.hidden = true; bar.innerHTML = ''; return; }
  var editors = list.filter(function(w){ return w.editing; }), names = (editors.length ? editors : list).map(function(w){ return w.name; }).join(', ');
  bar.hidden = false; bar.className = 'ws-same' + (editors.length ? ' editing' : '');
  bar.innerHTML = ''; bar.appendChild(wsPresGroup(list, '', 3));
  var msg = document.createElement('span'); msg.textContent = names + '님이 이 파일을 ' + (editors.length ? '수정하고 있어요. 같은 곳을 고치면 충돌할 수 있어요.' : '보고 있어요.');
  bar.appendChild(msg);
}
