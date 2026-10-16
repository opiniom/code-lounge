/* ---- 내 상태: 온라인 · 자리비움 · 방해금지 (사이트를 닫으면 자동으로 오프라인) ---- */
var PST = { pref:'auto', server:null, serverInfo:'', team:{}, timer:null, beating:false };
try { var _pp = localStorage.getItem('sync_presence_pref'); if(_pp === 'away' || _pp === 'dnd') PST.pref = _pp; } catch(e){}
var PST_META = {
  online:{label:'온라인', c:'#22C55E'}, away:{label:'자리비움', c:'#F59E0B'}, dnd:{label:'방해금지', c:'#EF4444'}, offline:{label:'오프라인', c:'#94A3B8'}
};
function pstOwn(){ return PST.pref === 'away' ? 'away' : (PST.pref === 'dnd' ? 'dnd' : 'online'); }
function pstSvg(st, size){
  var c = (PST_META[st] || PST_META.offline).c, z = size || 12, h = '<svg viewBox="0 0 16 16" width="'+z+'" height="'+z+'" aria-hidden="true">';
  if(st === 'away') return h + '<path d="M11.6 10.7A5.3 5.3 0 0 1 5.3 4.4a5.3 5.3 0 1 0 6.3 6.3Z" fill="'+c+'"/></svg>';
  if(st === 'dnd') return h + '<circle cx="8" cy="8" r="7" fill="'+c+'"/><rect x="4.2" y="6.9" width="7.6" height="2.2" rx="1.1" fill="#fff"/></svg>';
  if(st === 'offline') return h + '<circle cx="8" cy="8" r="5.2" fill="none" stroke="'+c+'" stroke-width="2.2"/></svg>';
  return h + '<circle cx="8" cy="8" r="6.5" fill="'+c+'"/></svg>';
}
function pstRender(){
  var btn = document.getElementById('pstBtn'); if(!btn) return;
  var st = PST.server === false ? 'offline' : pstOwn();
  btn.dataset.s = st;
  document.getElementById('pstIc').innerHTML = pstSvg(st, 12);
  document.getElementById('pstLabel').textContent = PST.server === false ? '연결 끊김' : PST_META[st].label;
  btn.classList.toggle('bad', PST.server === false);
  document.querySelectorAll('#pstMenu .pst-opt').forEach(function(o){
    var on = (o.dataset.s === PST.pref); o.classList.toggle('on', on); o.setAttribute('aria-checked', on ? 'true' : 'false');
    var ic = o.querySelector('.pst-ic'); if(ic && !ic.innerHTML) ic.innerHTML = pstSvg(ic.dataset.ic, 16);
  });
  var srv = document.getElementById('pstSrv'); if(srv){ srv.classList.toggle('bad', PST.server === false); srv.title = PST.serverInfo || ''; }
  var t = document.getElementById('pstSrvText'); if(t) t.textContent = PST.server === null ? '서버 확인 중' : (PST.server ? '서버 연결됨' : '서버에 연결할 수 없어요');
  var av = document.getElementById('avatarBtn'); if(av) av.dataset.pst = PST.server === false ? 'offline' : pstOwn();
  ntRender();
  if(typeof chatRenderPresence === 'function') chatRenderPresence();
}
function pstToggle(e){
  if(e) e.stopPropagation();
  var m = document.getElementById('pstMenu'), was = m.classList.contains('open');
  closeMenus();
  if(!was){ m.classList.add('open'); fitPopover('pstMenu', 0); document.getElementById('pstBtn').setAttribute('aria-expanded', 'true'); checkBackendHealth(); }
}
function pstSet(pref){
  PST.pref = pref;
  try { localStorage.setItem('sync_presence_pref', pref); } catch(e){}
  pstRender(); closeMenus();
  if(authToken) pstBeat(pref);
  var msg = {auto:['온라인으로 바꿨어요','팀원에게 온라인으로 보여요.'], away:['자리비움으로 바꿨어요','팀원에게 자리비움으로 보여요.'], dnd:['방해금지를 켰어요','새 알림 팝업이 꺼져요. 알림은 목록에 쌓여요.']}[pref];
  pushToast(pref === 'dnd' ? '🔕' : '✅', msg[0], msg[1], {duration:3200});
}
async function pstBeat(setPref){
  if(!authToken) return;
  try {
    var res = await fetch(API_BASE + '/api/presence/heartbeat', {
      method:'POST', headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + authToken},
      body: JSON.stringify(setPref ? {status:setPref} : {})
    });
    if(!res.ok) return;
    var me = await res.json();
    if(!setPref && me.pref && me.pref !== PST.pref){      // 다른 기기에서 바꾼 상태를 따라간다
      PST.pref = me.pref; try { localStorage.setItem('sync_presence_pref', me.pref); } catch(e){}
    }
    pstRender();
  } catch(e){}
}
async function pstLoadTeam(){
  if(!authToken) return;
  try {
    var res = await fetch(API_BASE + '/api/presence/team', { headers:{'Authorization':'Bearer ' + authToken} });
    if(res.ok){ PST.team = await res.json(); if(typeof renderWsHeader === 'function' && calApiMode) renderWsHeader(); renderDureOrbit(); if(typeof chatRenderPresence === 'function') chatRenderPresence(); }
  } catch(e){}
}
function pstOf(userId){
  if(currentUser && String(currentUser.id) === String(userId)) return PST.server === false ? 'offline' : pstOwn();
  return PST.team[String(userId)] || 'offline';
}
function pstTick(){ if(!authToken) return; liveConnect(); pstBeat().then(function(){ if(!LIVE.ok) pstLoadTeam(); }); }
function pstOffline(){
  if(!authToken) return;
  try { fetch(API_BASE + '/api/presence/offline', { method:'POST', keepalive:true, headers:{'Authorization':'Bearer ' + authToken} }); } catch(e){}
}
function pstStart(){
  if(PST.timer) return;
  PST.timer = setInterval(pstTick, 30000);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) pstTick(); });
  window.addEventListener('pagehide', pstOffline);
  window.addEventListener('online', function(){ checkBackendHealth(); pstTick(); });
  pstRender(); pstTick();
}

