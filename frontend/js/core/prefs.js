/* ---- 내 설정 동기화 (웹사이트 ↔ 설치한 앱 ↔ 다른 기기) ----
   웹과 앱은 브라우저 저장소(localStorage)가 서로 달라서, 거기에만 저장하던 설정은 공유되지 않았다.
   → 같은 값을 서버(/api/prefs)에도 보관한다. 저장하는 코드는 그대로 두고, 저장한 직후 prefsPush('키') 한 줄만 부른다.
   · 키마다 '바꾼 시각'이 더 늦은 쪽이 이긴다. 한쪽에서 바꾸면 실시간 연결(/ws/live 의 prefs)로 다른 쪽이 바로 따라온다.
   · 처음 연결하는 기기: 서버에 값이 없고 내 기기에 저장해 둔 값이 있으면 그 값을 올리고, 서버에 값이 있으면 그걸 받아 온다.
   · 기기마다 달라야 하는 것(화면 크기 배율·움직임·효과음·내 PC 실행기·미리보기 크기)은 동기화하지 않는다.
   · 다른 계정으로 로그인하면 이 기기에 남은 이전 계정의 동기화 설정은 먼저 지운다 (남의 설정이 내 계정에 올라가지 않게). */
var PREFS = { defs: {}, dirty: {}, timer: null, applying: false, pulling: false, lastPull: 0, userKey: null };

function prefsJson(k){ try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ return null; } }
function prefsTimes(){ return prefsJson('sync_pref_t_' + (PREFS.userKey || 'x')) || {}; }
function prefsSetTime(key, t){ var o = prefsTimes(); o[key] = t; try { localStorage.setItem('sync_pref_t_' + (PREFS.userKey || 'x'), JSON.stringify(o)); } catch(e){} }
function prefsOn(){ return !!(authToken && typeof calApiMode !== 'undefined' && calApiMode && currentUser); }

/* 키 → { read(): 지금 내 기기의 값(없으면 null), write(v): 받은 값을 이 기기에 적용, wipe(): 이 기기의 값을 지움 } */
PREFS.defs.home = {
  read: function(){
    var show = prefsJson('root_home_widgets'), order = prefsJson('root_home_widget_order'), wide = prefsJson('root_home_widget_wide');
    if(show === null && order === null && wide === null) return null;
    var o = {}; if(show) o.show = show; if(order) o.order = order; if(wide) o.wide = wide; return o;
  },
  write: function(v){
    try {
      if(v.show) localStorage.setItem('root_home_widgets', JSON.stringify(v.show));
      if(v.order) localStorage.setItem('root_home_widget_order', JSON.stringify(v.order));
      if(v.wide) localStorage.setItem('root_home_widget_wide', JSON.stringify(v.wide));
    } catch(e){}
    if(typeof loadWidgetPrefs === 'function'){ loadWidgetPrefs(); if(typeof wgRefreshLive === 'function') wgRefreshLive(); var gm = document.getElementById('wgModal'); if(gm && gm.classList.contains('open') && typeof wgRender === 'function') wgRender(); }
  },
  wipe: function(){ ['root_home_widgets', 'root_home_widget_order', 'root_home_widget_wide'].forEach(function(k){ try { localStorage.removeItem(k); } catch(e){} }); }
};
PREFS.defs.homeproj = {
  read: function(){ try { return localStorage.getItem('sync_home_project'); } catch(e){ return null; } },
  write: function(v){
    try { localStorage.setItem('sync_home_project', v); } catch(e){}
    if(typeof renderDureOrbit === 'function' && calApiMode){ dureSig = ''; renderDureOrbit(); if(typeof wgLiveTeam === 'function') wgLiveTeam(); }
  },
  wipe: function(){ try { localStorage.removeItem('sync_home_project'); } catch(e){} }
};
PREFS.defs.evtbm = {
  read: function(){ return prefsJson('sync_evt_bookmarks'); },
  write: function(v){
    try { localStorage.setItem('sync_evt_bookmarks', JSON.stringify(v)); } catch(e){}
    var ev = document.querySelector('.view.active[data-view="events"]'); if(ev && typeof renderEvents === 'function') renderEvents();
    if(typeof wgLiveEvents === 'function') wgLiveEvents();
  },
  wipe: function(){ try { localStorage.removeItem('sync_evt_bookmarks'); } catch(e){} }
};
PREFS.defs.cal = {
  read: function(){ return prefsJson('sync_cal_settings'); },
  write: function(v){
    try { localStorage.setItem('sync_cal_settings', JSON.stringify(v)); } catch(e){}
    calHiddenProjects = v.hidden || {}; calProjectColors = v.colors || {}; calSelected = v.selected || 'all';
    if(typeof syncCalProjects === 'function') syncCalProjects();
    if(typeof renderCalendarEvents === 'function') renderCalendarEvents();
    if(typeof wgLiveToday === 'function') wgLiveToday();
  },
  wipe: function(){ try { localStorage.removeItem('sync_cal_settings'); } catch(e){} calHiddenProjects = {}; calProjectColors = {}; calSelected = 'all'; }
};
PREFS.defs.theme = {
  read: function(){ try { return localStorage.getItem('root_theme'); } catch(e){ return null; } },
  write: function(v){ if(typeof setTheme === 'function') setTheme(v, { silent: true }); },
  wipe: function(){ /* 테마는 지우지 않는다 (로그인 화면의 모양이 갑자기 바뀌지 않게) */ }
};
PREFS.defs.wslast = {
  read: function(){
    var o = {}, any = false;
    try { for(var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if(k && k.indexOf('sync_ws_last_') === 0){ o[k.slice(13)] = localStorage.getItem(k); any = true; } } } catch(e){}
    return any ? o : null;
  },
  write: function(v){ try { Object.keys(v).forEach(function(id){ localStorage.setItem('sync_ws_last_' + id, v[id]); }); } catch(e){} },
  wipe: function(){ try { Object.keys(PREFS.defs.wslast.read() || {}).forEach(function(id){ localStorage.removeItem('sync_ws_last_' + id); }); } catch(e){} }
};

PREFS.defs.chatseen = {                       // 채팅을 어디까지 읽었는지 (프로젝트별 마지막 메시지 번호) — 기기마다 읽음 표시가 다르지 않게
  prefix: function(){ return 'sync_chat_seen_' + (currentUser ? currentUser.id : 'x') + '_'; },
  read: function(){
    var pre = PREFS.defs.chatseen.prefix(), o = {}, any = false;
    try { for(var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if(k && k.indexOf(pre) === 0){ var n = parseInt(localStorage.getItem(k) || '0', 10); if(n > 0){ o[k.slice(pre.length)] = n; any = true; } } } } catch(e){}
    return any ? o : null;
  },
  write: function(v){                           // 더 큰(=더 많이 읽은) 쪽을 따른다
    var pre = PREFS.defs.chatseen.prefix();
    try { Object.keys(v).forEach(function(id){ var k = pre + id, cur = parseInt(localStorage.getItem(k) || '0', 10); if(v[id] > cur) localStorage.setItem(k, String(v[id])); }); } catch(e){}
    if(typeof updateChatBadge === 'function') updateChatBadge();
  },
  wipe: function(){ var pre = PREFS.defs.chatseen.prefix(); try { Object.keys(PREFS.defs.chatseen.read() || {}).forEach(function(id){ localStorage.removeItem(pre + id); }); } catch(e){} }
};

/* 저장하는 곳에서 부른다: 이 키가 바뀌었다고 표시하고, 잠깐 모아서 서버에 올린다 */
function prefsPush(key){
  if(PREFS.applying || !PREFS.defs[key] || !prefsOn()) return;
  prefsSetTime(key, Date.now()); PREFS.dirty[key] = 1;
  clearTimeout(PREFS.timer); PREFS.timer = setTimeout(prefsFlush, 700);
}
function prefsFlush(keep){
  clearTimeout(PREFS.timer); PREFS.timer = null;
  if(!prefsOn()) return Promise.resolve();
  var times = prefsTimes(), items = {}, n = 0;
  Object.keys(PREFS.dirty).forEach(function(k){
    var v = PREFS.defs[k].read();
    if(v === null || v === undefined) return;
    items[k] = { v: v, t: times[k] || Date.now() }; n++;
  });
  PREFS.dirty = {};
  if(!n) return Promise.resolve();
  return apiFetch('/api/prefs', { method: 'PUT', body: JSON.stringify({ items: items }), keepalive: !!keep }).then(prefsApply).catch(function(e){
    if(e && e.status === 400) return;            // 값이 서버 규칙에 안 맞으면 다시 보내도 소용없다 (내 기기에는 그대로 저장돼 있다)
    Object.keys(items).forEach(function(k){ PREFS.dirty[k] = 1; });
    clearTimeout(PREFS.timer); PREFS.timer = setTimeout(prefsFlush, 15000);
  });
}
/* 서버에서 받은 설정을 이 기기에 적용 (서버 쪽이 더 늦게 바뀐 키만) */
function prefsApply(remote){
  if(!remote || typeof remote !== 'object') return;
  var times = prefsTimes(), up = {};
  Object.keys(PREFS.defs).forEach(function(k){
    var r = remote[k], def = PREFS.defs[k];
    if(r && typeof r === 'object' && r.t > (times[k] || 0)){
      var cur = def.read();
      if(JSON.stringify(cur) !== JSON.stringify(r.v)){ PREFS.applying = true; try { def.write(r.v); } catch(e){} PREFS.applying = false; }
      prefsSetTime(k, r.t);
    } else if(!r){                                // 서버에는 아직 없는데 이 기기에 저장해 둔 값이 있으면 올려서 다른 기기도 쓰게 한다
      var mine = def.read();
      if(mine !== null && mine !== undefined){ up[k] = 1; }
    }
  });
  var ks = Object.keys(up);
  if(ks.length){ ks.forEach(function(k){ if(!prefsTimes()[k]) prefsSetTime(k, Date.now()); PREFS.dirty[k] = 1; }); clearTimeout(PREFS.timer); PREFS.timer = setTimeout(prefsFlush, 300); }
}
function prefsOwner(){
  /* 이 기기의 동기화 설정이 누구 것인지 기억해 두고, 다른 계정이 로그인하면 이전 계정 것을 지운다 */
  var uid = String(currentUser && currentUser.id || ''); PREFS.userKey = uid || null;
  var owner = null; try { owner = localStorage.getItem('sync_pref_owner'); } catch(e){}
  if(owner && uid && owner !== uid){
    PREFS.applying = true;
    Object.keys(PREFS.defs).forEach(function(k){ try { PREFS.defs[k].wipe(); } catch(e){} });
    PREFS.applying = false;
  }
  try { if(uid) localStorage.setItem('sync_pref_owner', uid); } catch(e){}
}
function prefsPull(force){
  if(!prefsOn() || PREFS.pulling) return Promise.resolve();
  var now = Date.now(); if(!force && now - PREFS.lastPull < 4000) return Promise.resolve();
  PREFS.pulling = true; PREFS.lastPull = now; prefsOwner();
  return apiFetch('/api/prefs').then(prefsApply).catch(function(){}).then(function(){ PREFS.pulling = false; });
}
/* 앱을 다시 열거나 다른 화면에서 돌아오면 한 번 맞춰 본다 (실시간 연결이 끊겨 있었을 수도 있으니) */
document.addEventListener('visibilitychange', function(){ if(!document.hidden) prefsPull(false); });
window.addEventListener('online', function(){ prefsPull(true); });
window.addEventListener('pagehide', function(){ if(PREFS.timer){ try { prefsFlush(true); } catch(e){} } });
