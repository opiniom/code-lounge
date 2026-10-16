/* ---- notif / avatar dropdown ---- */
var unreadCount = 0;
function closeMenus(){
  document.getElementById('notifPanel').classList.remove('open');
  document.getElementById('avatarMenu').classList.remove('open');
  var wp = document.getElementById('widgetPicker');
  if(wp) wp.classList.remove('open');
  var pm = document.getElementById('pstMenu'); if(pm){ pm.classList.remove('open'); var pb = document.getElementById('pstBtn'); if(pb) pb.setAttribute('aria-expanded', 'false'); }
}
function toggleNotif(e){
  e.stopPropagation();
  var wasOpen = document.getElementById('notifPanel').classList.contains('open');
  closeMenus();
  if(!wasOpen){
    document.getElementById('notifPanel').classList.add('open');
    ntFit();
    loadNotifications();
  }
}
function toggleAvatarMenu(e){
  e.stopPropagation();
  var wasOpen = document.getElementById('avatarMenu').classList.contains('open');
  closeMenus();
  if(!wasOpen) document.getElementById('avatarMenu').classList.add('open');
}
document.addEventListener('click', function(e){
  if(!e.target.closest('.notif-wrap') && !e.target.closest('.avatar-wrap') && !e.target.closest('.widget-picker-wrap') && !e.target.closest('.pst-wrap')) closeMenus();
  if(!e.target.closest('.note-editor-wrap')){ var sm = document.getElementById('slashMenu'); if(sm) sm.classList.remove('open'); }
  if(!e.target.closest('.status-popover') && !e.target.closest('.mdr-status-btn')) closeStatusEditor();
});
document.addEventListener('keydown', function(e){
  if(e.key==='Escape'){ closeInviteModal(); closeAddEvent(); closeMdocDrawer(); closeComposeModal(); closeStatusEditor(); closeDayDetail(); closeSettings(); closeProfileModal(); closeMenus(); }
});


/* 메뉴바: 스크롤하면 .scrolled (유리 느낌 + 그림자) */
(function(){
  var bar = document.querySelector('.topbar');
  if(!bar) return;
  function upd(){ var on = (window.pageYOffset || document.documentElement.scrollTop || 0) > 4; if(on !== bar.classList.contains('scrolled')) bar.classList.toggle('scrolled', on); }
  window.addEventListener('scroll', upd, { passive:true });
  upd();
})();

/* ---- 폰 화면: 아래쪽 탭 바 (1쪽: 홈·워크스페이스·회의록·캘린더 / 2쪽: 이벤트·커뮤니티·팀원·마이) — 옆으로 밀거나 '더보기'로 넘긴다 ---- */
var MNAV_PAGE2 = ['events', 'community', 'admin', 'mypage', 'profile'];
function mnavScrollTo(page, smooth){
  var tr = document.getElementById('mnavTrack'); if(!tr) return;
  var x = page * tr.clientWidth;
  if(Math.abs(tr.scrollLeft - x) < 2) return;
  try { tr.scrollTo({ left:x, behavior: smooth === false ? 'auto' : 'smooth' }); } catch(e){ tr.scrollLeft = x; }
}
function mnavMore(){ mnavScrollTo(1); }
function mnavBack(){ mnavScrollTo(0); }
function mnavClose(){}
function mnavGo(v){ goView(v); }
function mnavSync(view){ mnavScrollTo(MNAV_PAGE2.indexOf(view) >= 0 ? 1 : 0); }     // 화면이 바뀌면 그 메뉴가 있는 쪽으로 부드럽게 넘어간다
(function(){
  var tr = document.getElementById('mnavTrack'); if(!tr) return;
  var dots = document.querySelectorAll('#mnav .mnav-dots i'), t = null;
  tr.addEventListener('scroll', function(){
    var p = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth));
    dots.forEach(function(d, i){ d.classList.toggle('on', i === p); });
  }, { passive:true });
  window.addEventListener('resize', function(){ clearTimeout(t); t = setTimeout(function(){ var a = document.querySelector('#mnav button.active'); mnavSync(a && a.dataset.view || 'home'); }, 150); });
})();
/* 화면 크기에 맞춰 html 에 표시 (CSS 가 알아서 바꾸지만, 코드에서도 폰인지 알 수 있게) */
(function(){
  var mq = window.matchMedia ? window.matchMedia('(max-width: 820px)') : null;
  function apply(){ document.documentElement.classList.toggle('is-mobile', !!(mq && mq.matches)); }
  apply(); if(mq){ if(mq.addEventListener) mq.addEventListener('change', apply); else if(mq.addListener) mq.addListener(apply); }
})();
