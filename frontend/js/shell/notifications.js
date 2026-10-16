/* ---- 알림 센터 + 실시간 토스트 ----
   · 토스트 = 방금 한 동작의 결과 안내(저장됨, 오류 등). 알림 목록에는 쌓지 않는다.
   · 알림 목록 = 서버가 보낸 진짜 알림(일정·초대·커뮤니티). 20초마다 확인해서 새 알림이 오면 토스트로도 알려준다. */
var NT = {items:[], tab:'all', seen:null, timer:null, busy:false};
var NT_KIND = {
  calendar:{c:'#8B5CF6', svg:'<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>'},
  chat:{c:'#3B82F6', svg:'<path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.3A7.5 7.5 0 1 1 20 12Z"/>'},
  project:{c:'#22D3EE', svg:'<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.3l2 2.2H18A2.5 2.5 0 0 1 20.5 9.7v7.8A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5Z"/>'},
  community:{c:'#EC4899', svg:'<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19c.4-3.2 2.7-5 6-5s5.6 1.8 6 5"/><path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8M18 14.4c1.7.6 2.7 2.1 3 4.6"/>'},
  event:{c:'#F59E0B', svg:'<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7"/>'},
  follow:{c:'#14B8A6', svg:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M19 8v6M16 11h6"/>'},
  notice:{c:'#EF4444', svg:'<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'},
  ai:{c:'#6366F1', svg:'<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9Z"/><path d="M18.5 3.5v3M17 5h3"/>'}
};
function ntKind(cat){ return NT_KIND[cat] || NT_KIND.ai; }
function ntIcon(cat, size){ var k = ntKind(cat); return '<svg viewBox="0 0 24 24" width="'+(size||18)+'" height="'+(size||18)+'" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+k.svg+'</svg>'; }
function ntDate(iso){ if(!iso) return null; var d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z'); return isNaN(d) ? null : d; }
function ntRel(iso){
  var d = ntDate(iso); if(!d) return '';
  var sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if(sec < 60) return '방금'; if(sec < 3600) return Math.floor(sec / 60) + '분 전'; if(sec < 86400) return Math.floor(sec / 3600) + '시간 전';
  if(sec < 172800) return '어제'; return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
}
function ntGroup(iso){
  var d = ntDate(iso); if(!d) return '이전';
  var t0 = new Date(); t0.setHours(0, 0, 0, 0);
  var day = Math.floor((t0.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  return day <= 0 ? '오늘' : (day === 1 ? '어제' : '이전');
}
/* 화면 가장자리에 걸려 잘리지 않게 팝업 위치를 보정한다 */
function fitPopover(id, baseRight){
  var p = document.getElementById(id); if(!p) return;
  p.style.right = baseRight + 'px'; p.style.left = 'auto';
  for(var i = 0; i < 3; i++){
    var r = p.getBoundingClientRect(), vw = document.documentElement.clientWidth, cur = parseFloat(p.style.right) || 0;
    if(r.left < 12) p.style.right = (cur - (12 - r.left)) + 'px';
    else if(r.right > vw - 12) p.style.right = (cur + (r.right - (vw - 12))) + 'px';
    else break;
  }
}
function ntFit(){ fitPopover('notifPanel', -6); }
window.addEventListener('resize', function(){ var p = document.getElementById('notifPanel'); if(p && p.classList.contains('open')) ntFit(); var m = document.getElementById('pstMenu'); if(m && m.classList.contains('open')) fitPopover('pstMenu', 0); });
function ntRecount(){ unreadCount = NT.items.filter(function(n){ return !n.is_read; }).length; updateNotifBadge(); }
function ntSetTab(tab){
  NT.tab = tab;
  document.querySelectorAll('.nt-tabs button').forEach(function(b){ b.classList.toggle('on', b.dataset.tab === tab); });
  ntRender();
}
/* ---- 인스타그램 스타일 팔로우 알림 ---- */
function ntFollowName(n){ var i = (n.title || '').indexOf('님이'); return i > 0 ? n.title.slice(0, i) : (n.title || '누군가'); }
function ntFollowUid(n){ var m = /^profile:(\d+)$/.exec(n.link || ''); return m ? parseInt(m[1], 10) : null; }
function ntFollowRow(n){
  var uid = ntFollowUid(n), name = ntFollowName(n);
  var it = document.createElement('div'); it.className = 'notif-item nt-follow' + (n.is_read ? '' : ' unread'); it.dataset.id = n.id; it.tabIndex = 0; it.setAttribute('role', 'button');
  var av = document.createElement('span'); av.className = 'nt-fav'; av.textContent = String(name).slice(0, 1); av.style.background = chatColor(name);
  var body = document.createElement('div'); body.className = 'notif-body';
  var tx = document.createElement('div'); tx.className = 'nt-ftext'; var b = document.createElement('b'); b.textContent = name; tx.appendChild(b); tx.append('님이 회원님을 팔로우하기 시작했습니다. '); var tm = document.createElement('span'); tm.className = 'ntime'; tm.textContent = ntRel(n.created_at); tx.appendChild(tm);
  body.appendChild(tx);
  it.appendChild(av); it.appendChild(body);
  if(uid){ it.appendChild(fwButton(uid, 'sm')); }
  var dot = document.createElement('i'); dot.className = 'nt-dot'; it.appendChild(dot);
  var del = document.createElement('button'); del.type = 'button'; del.className = 'notif-del'; del.title = '삭제'; del.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'; del.onclick = function(e){ e.stopPropagation(); ntDelete(n.id); }; it.appendChild(del);
  it.onclick = function(){ ntMark(n.id); openNotifLink(n.link || ''); };
  it.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); it.click(); } };
  return it;
}
function ntFollowGroup(list){
  var it = document.createElement('div'); it.className = 'notif-item nt-follow' + (list.some(function(n){ return !n.is_read; }) ? ' unread' : ''); it.tabIndex = 0; it.setAttribute('role', 'button');
  var stack = document.createElement('span'); stack.className = 'nt-fstack';
  list.slice(0, 3).forEach(function(n){ var nm = ntFollowName(n), a = document.createElement('span'); a.className = 'nt-fav sm'; a.textContent = String(nm).slice(0, 1); a.style.background = chatColor(nm); stack.appendChild(a); });
  var body = document.createElement('div'); body.className = 'notif-body';
  var names = list.slice(0, 2).map(ntFollowName), rest = list.length - names.length;
  var tx = document.createElement('div'); tx.className = 'nt-ftext';
  names.forEach(function(nm, i){ var b = document.createElement('b'); b.textContent = nm; tx.appendChild(b); tx.append(i < names.length - 1 ? '님, ' : '님'); });
  tx.append(rest > 0 ? ' 외 ' + rest + '명이 회원님을 팔로우하기 시작했습니다. ' : '이 회원님을 팔로우하기 시작했습니다. ');
  var tm = document.createElement('span'); tm.className = 'ntime'; tm.textContent = ntRel(list[0].created_at); tx.appendChild(tm); body.appendChild(tx);
  it.appendChild(stack); it.appendChild(body);
  var dot = document.createElement('i'); dot.className = 'nt-dot'; it.appendChild(dot);
  it.onclick = function(){ list.forEach(function(n){ ntMark(n.id); }); document.getElementById('notifPanel').classList.remove('open'); goView('mypage'); setTimeout(function(){ openFollowModal('followers'); }, 250); };
  it.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); it.click(); } };
  return it;
}
function ntRender(){
  var box = document.getElementById('notifList'); if(!box) return;
  var unread = NT.items.filter(function(n){ return !n.is_read; }).length;
  var pill = document.getElementById('ntPill'); if(pill){ pill.hidden = unread === 0; pill.textContent = unread + '개 새 알림'; }
  var ra = document.getElementById('ntReadAll'); if(ra) ra.disabled = unread === 0;
  var dn = document.getElementById('ntDnd'); if(dn) dn.hidden = PST.pref !== 'dnd';
  var items = NT.tab === 'unread' ? NT.items.filter(function(n){ return !n.is_read; }) : NT.items;
  box.innerHTML = '';
  if(!items.length){
    var e = document.createElement('div'); e.className = 'nt-empty';
    var loggedIn = !!authToken;
    e.innerHTML = '<div class="nt-empty-ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></div><b></b><span></span>';
    e.querySelector('b').textContent = NT.tab === 'unread' && NT.items.length ? '모두 확인했어요' : '새로운 알림이 없어요';
    e.querySelector('span').textContent = loggedIn ? '일정, 팀 초대, 커뮤니티 소식이 여기에 모여요.' : '로그인하면 팀 소식을 이곳에서 받아볼 수 있어요.';
    box.appendChild(e); return;
  }
  var last = null, hasFollow = false;
  // 같은 날 팔로우 알림이 3개 이상이면 인스타그램처럼 "A님, B님 외 N명이 팔로우하기 시작했습니다"로 묶는다
  var fgroups = {};
  items.forEach(function(n){ if(n.category === 'follow'){ var g = ntGroup(n.created_at); (fgroups[g] = fgroups[g] || []).push(n); } });
  var folded = {};
  items.forEach(function(n){
    var g = ntGroup(n.created_at);
    if(g !== last){ var h = document.createElement('div'); h.className = 'nt-group'; h.textContent = g; box.appendChild(h); last = g; }
    if(n.category === 'follow'){
      hasFollow = true;
      var grp = fgroups[g];
      if(grp.length >= 3){ if(folded[g]) return; folded[g] = true; box.appendChild(ntFollowGroup(grp)); return; }
      box.appendChild(ntFollowRow(n)); return;
    }
    var k = ntKind(n.category);
    var it = document.createElement('div'); it.className = 'notif-item' + (n.is_read ? '' : ' unread'); it.dataset.id = n.id; it.style.setProperty('--nc', k.c);
    it.tabIndex = 0; it.setAttribute('role', 'button');
    it.innerHTML = '<span class="nic">' + ntIcon(n.category, 18) + '</span><div class="notif-body"><div class="nt-row1"><b class="ntext"></b><span class="ntime"></span></div><div class="nmsg"></div></div><i class="nt-dot"></i><button type="button" class="notif-del" title="삭제" aria-label="알림 삭제"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
    it.querySelector('.ntext').textContent = n.title; it.querySelector('.nmsg').textContent = n.message || ''; it.querySelector('.ntime').textContent = ntRel(n.created_at);
    it.onclick = function(){ ntMark(n.id); openNotifLink(n.link || ''); };
    it.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); it.click(); } };
    it.querySelector('.notif-del').onclick = function(e){ e.stopPropagation(); ntDelete(n.id); };
    box.appendChild(it);
  });
  if(hasFollow && typeof fwResync === 'function') fwResync();
}
function ntApply(list, announce){
  list = list.slice().sort(function(a, b){ return (ntDate(b.created_at) || 0) - (ntDate(a.created_at) || 0) || b.id - a.id; });
  NT.items = list;
  if(NT.seen === null){ NT.seen = {}; list.forEach(function(n){ NT.seen[n.id] = 1; }); }
  else {
    var fresh = list.filter(function(n){ return !NT.seen[n.id]; });
    list.forEach(function(n){ NT.seen[n.id] = 1; });
    if(announce) fresh.filter(function(n){ return !n.is_read; }).reverse().slice(-3).forEach(function(n){
      pushToast(null, n.title, n.message, {category:n.category, onclick:function(){ ntMark(n.id); openNotifLink(n.link || ''); }});
    });
  }
  ntRecount(); ntRender();
}
async function loadNotifications(announce){
  if(!authToken){ NT.items = []; NT.seen = null; ntRecount(); ntRender(); return; }
  if(NT.tok !== authToken){ NT.tok = authToken; NT.seen = null; }
  if(NT.busy) return; NT.busy = true;
  try {
    var res = await fetch(API_BASE + '/api/notifications', { headers: { 'Authorization': 'Bearer ' + authToken } });
    if(res.ok) ntApply(await res.json(), announce === true);
  } catch(e){}
  NT.busy = false;
}
function ntStartPolling(){
  if(NT.timer) return;
  var ntTick = 0;
  NT.timer = setInterval(function(){ ntTick++; if(!document.hidden && authToken && (!LIVE.ok || ntTick % 3 === 0)) loadNotifications(true); }, 20000);   // 실시간 연결이 있으면 가끔만
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && authToken) loadNotifications(true); });
}
async function ntMark(id){
  var n = NT.items.filter(function(x){ return x.id === id; })[0];
  if(!n || n.is_read) return;
  n.is_read = true; ntRecount(); ntRender();
  if(!authToken) return;
  try { await fetch(API_BASE + '/api/notifications/' + id + '/read', { method:'PATCH', headers:{ 'Authorization':'Bearer ' + authToken } }); } catch(e){}
}
async function clearNotif(){
  NT.items.forEach(function(n){ n.is_read = true; });
  ntRecount(); ntRender();
  if(!authToken) return;
  try { await fetch(API_BASE + '/api/notifications/read-all', { method:'POST', headers:{ 'Authorization':'Bearer ' + authToken } }); } catch(e){}
}
async function ntDelete(id){
  NT.items = NT.items.filter(function(x){ return x.id !== id; });
  ntRecount(); ntRender();
  if(!authToken) return;
  try { await fetch(API_BASE + '/api/notifications/' + id, { method:'DELETE', headers:{ 'Authorization':'Bearer ' + authToken } }); } catch(e){}
}
function updateNotifBadge(){
  var el = document.getElementById('notifCount');
  if(!el) return;
  if(unreadCount<=0){ el.style.display='none'; } else { el.style.display='flex'; el.textContent = unreadCount>9?'9+':unreadCount; }
}
function renderNotifEmptyState(){ ntRender(); }

/* ---- 토스트 ---- */
var TOAST_KINDS = {
  success:{c:'#22C55E', svg:'<path d="m5 12.5 4.5 4.5L19 7.5"/>'},
  warn:{c:'#F59E0B', svg:'<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.2M12 17.2v.1"/>'},
  error:{c:'#EF4444', svg:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v5M12 16.2v.1"/>'},
  info:{c:'#3B82F6', svg:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.1"/>'}
};
function toastKindFor(icon){
  if(/⚠|🚫|⛔/.test(icon || '')) return 'warn';
  if(/❌|✖/.test(icon || '')) return 'error';
  if(/✅|✨|🎉|👍|💾|☑/.test(icon || '')) return 'success';
  return 'info';
}
function dismissToast(elOrBtn){
  var t = elOrBtn.classList.contains('toast') ? elOrBtn : elOrBtn.closest('.toast');
  if(!t || t.classList.contains('out')) return;
  if(t._timer) clearTimeout(t._timer);
  t.classList.add('out');
  setTimeout(function(){ t.remove(); }, 320);
}
function pushToast(icon, title, desc, opts){
  opts = opts || {};
  if(opts.category && PST.pref === 'dnd') return;      // 방해금지: 새 알림 팝업은 띄우지 않는다 (목록에는 쌓임)
  var stack = document.getElementById('toastStack'); if(!stack) return;
  // 같은 내용이 이미 떠 있으면 새로 쌓지 않고 시간만 늘린다
  var dup = Array.from(stack.querySelectorAll('.toast:not(.out)')).filter(function(x){ return x.dataset.key === title + '|' + (desc || ''); })[0];
  var kind = opts.category ? null : toastKindFor(icon);
  var color = opts.category ? ntKind(opts.category).c : TOAST_KINDS[kind].c;
  var dur = opts.duration || (kind === 'warn' || kind === 'error' ? 7000 : 5000);
  function arm(t){
    if(t._timer) clearTimeout(t._timer);
    var bar = t.querySelector('.tbar'); if(bar){ bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = 'toastBar ' + dur + 'ms linear forwards'; }
    t._left = dur; t._start = Date.now(); t._timer = setTimeout(function(){ dismissToast(t); }, dur);
  }
  if(dup){ arm(dup); dup.classList.remove('bump'); void dup.offsetWidth; dup.classList.add('bump'); return; }
  var t = document.createElement('div');
  t.className = 'toast' + (opts.onclick ? ' click' : ''); t.dataset.key = title + '|' + (desc || ''); t.style.setProperty('--tc', color); t.setAttribute('role', kind === 'error' || kind === 'warn' ? 'alert' : 'status');
  var glyph = opts.category ? ntIcon(opts.category, 17) : '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' + TOAST_KINDS[kind].svg + '</svg>';
  t.innerHTML = '<span class="nic">' + glyph + '</span><div class="toast-body"><div class="tt"></div><div class="td"></div></div>' +
    '<button type="button" class="toast-close" aria-label="닫기"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button><i class="tbar"></i>';
  t.querySelector('.tt').textContent = title || '';
  var td = t.querySelector('.td'); if(desc) td.textContent = desc; else td.remove();
  t.querySelector('.toast-close').onclick = function(e){ e.stopPropagation(); dismissToast(t); };
  if(opts.onclick) t.onclick = function(){ dismissToast(t); try { opts.onclick(); } catch(e){} };
  t.addEventListener('mouseenter', function(){ if(t._timer){ clearTimeout(t._timer); t._left = Math.max(1200, t._left - (Date.now() - t._start)); } var b = t.querySelector('.tbar'); if(b) b.style.animationPlayState = 'paused'; });
  t.addEventListener('mouseleave', function(){ var b = t.querySelector('.tbar'); if(b) b.style.animationPlayState = 'running'; t._start = Date.now(); t._timer = setTimeout(function(){ dismissToast(t); }, t._left); });
  stack.appendChild(t); arm(t);
  var all = stack.querySelectorAll('.toast:not(.out)'); if(all.length > 4) dismissToast(all[0]);
}

