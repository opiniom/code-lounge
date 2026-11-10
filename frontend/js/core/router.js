/* ---- 화면 주소(라우팅) ----
   화면마다 자기 주소를 가진다:  /app · /app/login · /app/workspace · /app/meetings · /app/calendar
                                  /app/events · /app/community · /app/community/글번호 · /app/mypage · /app/admin
   주소를 직접 열거나 새로고침해도 그 화면이 열리고, 브라우저 뒤로/앞으로 가기도 동작한다. */
var ROUTES = { home:'', landing:'', auth:'login', workspace:'workspace', notes:'meetings', calendar:'calendar', events:'events', community:'community', mypage:'mypage', admin:'team', profile:'profile', sysadmin:'admin' };
var PAGE_TITLES = { home:'홈', landing:'소개', auth:'로그인', workspace:'워크스페이스', notes:'회의록', calendar:'캘린더', events:'이벤트', community:'커뮤니티', mypage:'마이페이지', admin:'팀원', profile:'프로필', sysadmin:'관리자' };
var ROUTER = { booted:false, replace:false, popping:false };
function routePath(view, extra){ return '/app' + (ROUTES[view] ? '/' + ROUTES[view] : '') + (extra ? '/' + extra : ''); }
function routeParse(pathname){
  var parts = String(pathname || '').replace(/^\/(app|ui)\/?/, '').split('/').filter(Boolean);
  var slug = parts[0] || '';
  for(var v in ROUTES){ if(ROUTES[v] === slug) return { view:v, id: parts[1] || null }; }
  return { view:'home', id:null, unknown: !!slug };
}
var BOOT_ROUTE = routeParse(location.pathname);
function routerSetUrl(path, forceReplace){
  try {
    if(window.__pwaPreview) path += '?pwa=1';              // '설치한 앱 미리 보기'는 주소를 옮겨 다녀도 유지한다
    if(location.pathname + location.search === path) return;
    if(forceReplace || ROUTER.replace || ROUTER.popping || !ROUTER.booted) history.replaceState({}, '', path);
    else history.pushState({}, '', path);
  } catch(e){}
}
function routerSync(view){
  document.title = (view === 'home' || view === 'landing' ? '' : PAGE_TITLES[view] + ' · ') + 'DureSync';
  if(ROUTER.popping) return;
  var cur = routeParse(location.pathname);
  if(cur.view === view && view === 'community') return;      // 커뮤니티 글 주소(/app/community/번호)는 그대로 둔다
  routerSetUrl(view === 'profile' ? routePath('profile', PF.uid) : routePath(view));
}
/* 세션(로그인 전/후)이 정해진 뒤 한 번만: 처음 열린 주소의 화면으로 이동 */
function routerBoot(){
  if(ROUTER.booted) return;
  ROUTER.booted = true;
  var r = BOOT_ROUTE, v = r.view;
  if(v === 'auth' && authToken) v = 'home';
  ROUTER.replace = true;
  try {
    if(v === 'profile') PF.uid = (r.id && /^\d+$/.test(r.id)) ? parseInt(r.id, 10) : null;
    if(v !== 'home') goView(v);
    else routerSetUrl('/app', true);
    if(v === 'community' && r.id && /^\d+$/.test(r.id)) cmOpenPost(parseInt(r.id, 10));
  } finally { ROUTER.replace = false; }
}
window.addEventListener('popstate', function(){
  var r = routeParse(location.pathname);
  ROUTER.popping = true;
  try {
    var m = document.getElementById('cmPostModal');
    if(r.view === 'community' && r.id && /^\d+$/.test(r.id)){ goView('community'); cmOpenPost(parseInt(r.id, 10)); }
    else { if(r.view === 'profile') PF.uid = (r.id && /^\d+$/.test(r.id)) ? parseInt(r.id, 10) : null; if(m && m.classList.contains('open')) cmClosePost(); goView(r.view === 'auth' && authToken ? 'home' : r.view); }
  } finally { ROUTER.popping = false; }
});

function goView(name){
  if(!ROUTES.hasOwnProperty(name)) name = 'home';
  /* 로그인해야 쓸 수 있다: 로그인 정보가 없으면 소개(또는 로그인) 화면 밖으로는 갈 수 없다 */
  if(!authToken && name !== 'landing' && name !== 'auth') name = (typeof pwaStandalone === 'function' && pwaStandalone()) ? 'auth' : 'landing';      // 설치한 앱은 소개 대신 바로 로그인 화면
  if(name === 'landing' && authToken) name = 'home';
  document.documentElement.classList.remove('no-session');
  if(name === 'sysadmin' && !(currentUser && currentUser.is_admin)){ if(authToken && typeof pushToast === 'function') pushToast('🔒', '관리자만 들어갈 수 있어요', '이 페이지는 관리자 권한이 필요해요.'); name = 'home'; }   // 화면 확인일 뿐, 실제 권한은 서버가 다시 확인한다
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.dataset.view===name));
  document.querySelectorAll('#tabnav button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  document.querySelectorAll('#mnav button[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  if(typeof mnavSync === 'function') mnavSync(name);
  document.querySelector('.app').classList.toggle('auth-mode', name==='auth');
  document.querySelector('.app').classList.toggle('landing-mode', name==='landing');
  closeMenus();
  routerSync(name);
  if(name==='landing' && typeof ldEnter === 'function') ldEnter();
  if(typeof greetRefresh === 'function') greetRefresh();
  if(name==='calendar') refreshDetections(false);
  if(name==='events') loadEvents();
  if(name==='community') cmEnter();
  if(name==='admin') loadAdminMembers();
  if(name==='mypage') renderMyPage();
  if(name==='profile') renderProfile();
  if(name==='sysadmin' && typeof saEnter === 'function') saEnter(); else if(typeof saLeave === 'function') saLeave();
  if(name==='workspace') enterWorkspaceView(); else { wsStopPolling(); if(typeof wsPresLeave === 'function') wsPresLeave(); }
  if(name==='workspace'){
    setTimeout(function(){
      if(window.monaco && monacoEditor) monacoEditor.layout();
    }, 60);
  }
  if(name==='home'){
    wgRefreshLive();
    playHomeIntro();
  } else if(homeLandingActive){
    homeLandingActive = false;
    applyHomeLandingState();
  }
}
