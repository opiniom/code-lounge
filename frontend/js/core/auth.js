/* ---- auth ---- */
var isAdmin = false;
var savedMyProjects = null;
var savedProjPageIndex = 0;
var savedNotifListHTML = null;
var savedNotesWidgetHidden = null;
function resetToNewMemberState(){
  var notifList = document.getElementById('notifList');
  var notesWidget = document.querySelector('.dyn-widget[data-widget="notes"]');
  if(savedMyProjects===null){ savedMyProjects = myProjects.slice(); savedProjPageIndex = projPageIndex; }
  if(savedNotesWidgetHidden===null && notesWidget) savedNotesWidgetHidden = notesWidget.hidden;
  setWidget('today', false);
  setWidget('notes', false);
  myProjects = [];
  projPageIndex = 0;
  renderProjRow();
  NT.items = []; ntRecount(); ntRender();
}
function restoreDemoState(){
  setWidget('today', true);
  if(savedNotesWidgetHidden!==null) setWidget('notes', !savedNotesWidgetHidden);
  if(savedMyProjects!==null){ myProjects = savedMyProjects.slice(); projPageIndex = savedProjPageIndex; }
  renderProjRow();
  ntRecount(); ntRender();
}
/* 구글/네이버 로그인은 서버에 등록된 주소(PUBLIC_BASE_URL)에서만 돌아올 수 있다.
   ./share.sh 로 열린 임시 공개 주소 등 다른 주소에서는 로그인 버튼을 숨기고 초대 카드만 보여준다 */
var oauthHere = true;
function applyAuthMode(){
  return fetch(API_BASE + '/api/auth/config').then(function(r){ return r.ok ? r.json() : {}; }).then(function(conf){
    try{
      var pubHost = conf.public_base_url ? new URL(conf.public_base_url, location.href).hostname.replace(/^www\./, '').toLowerCase() : '';
      var curHost = location.hostname.replace(/^www\./, '').toLowerCase();
      oauthHere = !pubHost || pubHost === curHost || curHost === 'localhost' || curHost === '127.0.0.1' || curHost === 'duresync.cloud';
    }catch(e){ oauthHere = true; }
    var dn = document.getElementById('authDevNote'); if(dn) dn.hidden = !conf.dev_auto_login;
    var card = document.getElementById('inviteCard');
    var cardShown = !!(card && !card.hidden);
    ['authButtons','authTerms','authSkip'].forEach(function(id){ var el = document.getElementById(id); if(el) el.hidden = !oauthHere; });
    var or = document.getElementById('inviteCardOr'); if(or) or.hidden = !oauthHere;
    var note = document.getElementById('authRemoteNote'); if(note) note.hidden = oauthHere || cardShown;
    // 게스트 둘러보기는 언제나 접근 가능하도록 유지
    var skip = document.getElementById('authSkip'); if(skip) skip.hidden = false;
  }).catch(function(){});
}
async function handleSocialLogin(provider){
  if(!oauthHere){
    pushToast('ℹ️','이 주소에서는 소셜 로그인을 쓸 수 없어요','팀원에게 받은 초대 링크로 들어오거나, 서버를 켠 컴퓨터(localhost)에서 로그인하세요.');
    return;
  }
  try {
    var confRes = await fetch(API_BASE + '/api/auth/config');
    var conf = confRes.ok ? await confRes.json() : {};
    if(conf.dev_auto_login){                      // 임시(로컬) 서버: 소셜 로그인을 거치지 않고 바로 로그인
      var dr = await fetch(API_BASE + '/api/auth/dev-auto', { method:'POST' });
      if(dr.ok){
        var dj = await dr.json();
        try { localStorage.setItem('sync_auth_token', dj.access_token); } catch(e){}
        window.location.href = '/app';
        return;
      }
      var de = await dr.json().catch(function(){ return {}; });
      pushToast('⚠️', '자동 로그인을 못 했어요', de.detail || '');
      return;
    }
    
    if (provider === 'Google') {
      if (conf.google_enabled) {
        window.location.href = API_BASE + '/api/auth/google/login';
        return;
      } else {
        alert('Google 소셜 로그인 설정이 아직 등록되지 않았습니다.\n.env 파일에 GOOGLE_CLIENT_ID 및 GOOGLE_CLIENT_SECRET을 설정해주세요.\n(자세한 방법은 docs/social_login_setup.md 참조)');
        return;
      }
    }
    if (provider === 'Naver') {
      if (conf.naver_enabled) {
        window.location.href = API_BASE + '/api/auth/naver/login';
        return;
      } else {
        alert('네이버 로그인 설정이 아직 등록되지 않았습니다.\n.env 파일에 NAVER_CLIENT_ID 및 NAVER_CLIENT_SECRET을 설정해주세요.\n(자세한 방법은 docs/social_login_setup.md 참조)');
        return;
      }
    }
  } catch(e) {
    alert('소셜 로그인 서버 연결에 실패했습니다: ' + e.message);
  }
}

/* 처음 들어오면 로그인 창 대신 게스트 화면(둘러보기)을 보여주고, 로그인하면 내 계정으로 바뀐다 */
function enterGuestHome(quiet){
  enterDemoMode();
  isAdmin = false;
  document.getElementById('adminBadge').hidden = true;
  document.getElementById('teamManageMenuItem').hidden = true;
  restoreDemoState();
  document.querySelector('.app').classList.add('guest-mode');
  goView('home');
  routerBoot();
  if(!quiet) pushToast('👋', '게스트 접속', '게스트 모드로 둘러봅니다.');
}
function mockLogin(provider){ enterGuestHome(false); }
function openLogin(){ goView('auth'); applyAuthMode(); }
function wsResetForSessionChange(){
  wsStopPolling(); wsProject = null; wsLoaded = false; wsLoading = false;
  files = {}; openedTabs = []; currentFileKey = null; wsRenaming = null; wsDeleting = null;
  renderWsSelector(); renderWsEmpty(); renderFileTree(); renderTabs();
  if (window.monaco && monacoEditor) { wsSettingValue = true; monacoEditor.setValue(''); wsSettingValue = false; }
  wsUpdateSaveStatus(); wsRenderConflict();
}
/* 로그인 토큰이 만료/무효가 되면: 조용히 로그아웃하고 로그인 화면으로 안내 (채팅·폴링이 오류만 반복하지 않게) */
function expireSession(){
  if(!authToken) return;
  mockLogout('expired');
}
function mockLogout(reason){
  liveDisconnect(); pstOffline(); PST.team = {};
  calProjectsLoaded = true;
  wsResetForSessionChange();
  stopChat();
  calApiMode = false; calendarEvents = []; calDetect = []; detectCache = {}; meetingDocs = []; renderMeetingDocs();
  isAdmin = false;
  authToken = null;
  currentUser = null;
  try {
    localStorage.removeItem('sync_auth_token');
    localStorage.removeItem('sync_auth_user');
  } catch(e){}
  document.getElementById('adminBadge').hidden = true;
  document.getElementById('teamManageMenuItem').hidden = true;
  enterGuestHome(true);
  if(reason === 'expired') pushToast('⏰', '로그인이 만료됐어요', '보안을 위해 로그인 유효기간이 지났어요. 다시 로그인하면 채팅·AI를 이어서 쓸 수 있어요.');
  else pushToast('👋', '로그아웃', '로그아웃되었습니다.');
}

