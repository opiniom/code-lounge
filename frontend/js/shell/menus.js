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
