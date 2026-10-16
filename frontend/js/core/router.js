/* ---- 화면 주소(라우팅) ----
   화면마다 자기 주소를 가진다:  /app · /app/login · /app/workspace · /app/meetings · /app/calendar
                                  /app/events · /app/community · /app/community/글번호 · /app/mypage · /app/admin
   주소를 직접 열거나 새로고침해도 그 화면이 열리고, 브라우저 뒤로/앞으로 가기도 동작한다. */
var ROUTES = { home:'', auth:'login', workspace:'workspace', notes:'meetings', calendar:'calendar', events:'events', community:'community', mypage:'mypage', admin:'admin' };
var PAGE_TITLES = { home:'홈', auth:'로그인', workspace:'워크스페이스', notes:'회의록', calendar:'캘린더', events:'이벤트', community:'커뮤니티', mypage:'마이페이지', admin:'팀 관리' };
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
    if(location.pathname === path) return;
    if(forceReplace || ROUTER.replace || ROUTER.popping || !ROUTER.booted) history.replaceState({}, '', path);
    else history.pushState({}, '', path);
  } catch(e){}
}
function routerSync(view){
  document.title = (view === 'home' ? '' : PAGE_TITLES[view] + ' · ') + 'DureSync';
  if(ROUTER.popping) return;
  var cur = routeParse(location.pathname);
  if(cur.view === view && view === 'community') return;      // 커뮤니티 글 주소(/app/community/번호)는 그대로 둔다
  routerSetUrl(routePath(view));
}
/* 세션(게스트/로그인)이 정해진 뒤 한 번만: 처음 열린 주소의 화면으로 이동 */
function routerBoot(){
  if(ROUTER.booted) return;
  ROUTER.booted = true;
  var r = BOOT_ROUTE, v = r.view;
  if(v === 'auth' && authToken) v = 'home';
  if(v === 'admin' && !isAdmin && !authToken) v = 'home';
  ROUTER.replace = true;
  try {
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
    else { if(m && m.classList.contains('open')) cmClosePost(); goView(r.view === 'auth' && authToken ? 'home' : r.view); }
  } finally { ROUTER.popping = false; }
});

function goView(name){
  if(!ROUTES.hasOwnProperty(name)) name = 'home';
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.dataset.view===name));
  document.querySelectorAll('#tabnav button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  document.querySelector('.app').classList.toggle('auth-mode', name==='auth');
  closeMenus();
  routerSync(name);
  if(name==='calendar') refreshDetections(false);
  if(name==='events') loadEvents();
  if(name==='community') cmEnter();
  if(name==='admin') loadAdminMembers();
  if(name==='mypage') renderMyPage();
  if(name==='workspace') enterWorkspaceView(); else wsStopPolling();
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
