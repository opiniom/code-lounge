/* ---- Backend API Integration ---- */
/* API 주소: 이 화면을 서버가 직접 내려준 경우(/app, /ui)에는 접속한 주소 그대로(같은 출처) 쓴다.
   그래야 ./share.sh 의 공개 주소로 들어온 팀원도 자기 컴퓨터가 아니라 이 서버로 요청한다.
   파일로 열었거나 다른 곳(Vercel 등)에 올린 화면이면 예전처럼 localhost:8000 (또는 직접 지정한 주소) */
function defaultApiBase(){
  try{
    if(/^https?:$/.test(location.protocol)) return location.origin;
  }catch(e){}
  return 'http://localhost:8000';
}
var API_BASE = (function(){
  var stored = localStorage.getItem('sync_api_base');
  if(/^https?:$/.test(location.protocol)){
    if(!stored || stored.indexOf('localhost') !== -1 || stored.indexOf('127.0.0.1') !== -1) return location.origin;
  }
  return stored || defaultApiBase();
})();
var authToken = localStorage.getItem('sync_auth_token') || null;
var pendingInviteMem = '';
function getPendingInvite(){ try{ return pendingInviteMem || localStorage.getItem('sync_pending_invite') || ''; }catch(e){ return pendingInviteMem; } }
function setPendingInvite(t){
  pendingInviteMem = t || '';
  try{ if(t) localStorage.setItem('sync_pending_invite', t); else localStorage.removeItem('sync_pending_invite'); }catch(e){}
}
// 초대 링크(?invite=…)로 열렸다면 값을 보관하고 주소창에서는 지운다 (로그인 이동을 거쳐도 유지)
(function(){
  try{
    var t = new URLSearchParams(location.search).get('invite');
    if(t){
      setPendingInvite(t);
      var u = new URL(location.href); u.searchParams.delete('invite');
      history.replaceState({}, document.title, u.pathname + (u.search || '') + u.hash);
    }
  }catch(e){}
})();
var currentUser = null;
try {
  var u = localStorage.getItem('sync_auth_user');
  if (u) currentUser = JSON.parse(u);
} catch(e){}

function promptBackendUrl() {
  var url = prompt('연결할 백엔드 API URL (FastAPI / Cloudflare Tunnel):', API_BASE);
  if (url && url.trim()) {
    API_BASE = url.trim().replace(/\/+$/, '');
    localStorage.setItem('sync_api_base', API_BASE);
    checkBackendHealth();
    initWebSocket();
  }
}

async function checkBackendHealth() {
  try {
    var res = await fetch(API_BASE + '/health', { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error();
    var data = await res.json();
    PST.server = true; PST.serverInfo = '서버 상태: ' + data.status + ' · DB: ' + data.database_status + ' · 엔진: ' + data.judge0_status;
  } catch(e) {
    PST.server = false; PST.serverInfo = '서버 (' + API_BASE + ')에 연결할 수 없어요.';
  }
  pstRender();
}


/* 이 서버가 실제로 실행할 수 있는 언어 목록 (/health). 잠깐 기억해 두고 다시 묻지 않는다 */
var WS_RUN_CACHE = { at: 0, langs: null };
async function wsRunSupported() {
  if (WS_RUN_CACHE.langs && Date.now() - WS_RUN_CACHE.at < 60000) return WS_RUN_CACHE.langs;
  try {
    var res = await fetch(API_BASE + '/health', { signal: AbortSignal.timeout(4000) });
    var d = await res.json();
    if (Array.isArray(d.supported_languages)) { WS_RUN_CACHE = { at: Date.now(), langs: d.supported_languages.map(function(x){ return String(x).toLowerCase(); }) }; return WS_RUN_CACHE.langs; }
  } catch(e){}
  return null;
}
/* 실행하지 않고 이유만 실행 콘솔에 알려 준다. actions = [{label, fn}] 이면 바로 고칠 수 있는 버튼도 붙인다 */
function wsRunNotice(title, detail, actions) {
  var termPanel = document.getElementById('wsTerminalPanel'); if (termPanel) termPanel.classList.remove('collapsed');
  setTerminalTab('interactive');
  var chip = document.getElementById('termStatusChip'), t = document.getElementById('termExecTime'), log = document.getElementById('termLiveLog');
  if (chip) { chip.style.display = 'inline-block'; chip.className = 'term-status-chip error'; chip.textContent = '실행 안 함'; }
  if (t) t.style.display = 'none';
  if (log) {
    log.innerHTML = '<div class="term-err">// ' + escapeHtml(title) + '</div><div class="term-dim" style="white-space:pre-wrap;">' + escapeHtml(detail || '') + '</div>';
    if (actions && actions.length) {
      var row = document.createElement('div'); row.className = 'term-fixes';
      actions.forEach(function(a) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'term-fix-btn'; b.textContent = a.label;
        b.onclick = function() { a.fn(); }; row.appendChild(b);
      });
      log.appendChild(row);
    }
  }
  pushToast('ℹ️', title, '');
}

async function loadSubmissions() {
  if (!authToken) return;
  try {
    var res = await fetch(API_BASE + '/api/submissions?limit=10', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (!res.ok) return;
    var data = await res.json();
    var container = document.getElementById('termHistoryList');
    if (!container) return;
    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="term-dim">저장된 실행 이력이 없습니다.</div>';
      return;
    }
    var html = '';
    data.items.forEach(function(sub) {
      var isOk = (sub.status === 'Accepted');
      var codeEsc = encodeURIComponent(sub.source_code);
      var stdoutEsc = encodeURIComponent(sub.stdout || '');
      html += '<div class="sub-item" onclick="restoreSub(\'' + codeEsc + '\', \'' + sub.language + '\', \'' + stdoutEsc + '\', \'' + sub.status + '\')">';
      html += '<div class="sub-left">';
      html += '<span class="term-status-chip ' + (isOk ? 'success' : 'error') + '">' + sub.status + '</span>';
      html += '<b>' + sub.language + '</b>';
      html += '<span class="sub-time">' + (sub.created_at ? sub.created_at.replace('T', ' ').slice(0, 19) : '') + '</span>';
      html += '</div>';
      html += '<div>' + (sub.execution_time !== null ? sub.execution_time + 's' : '') + '</div>';
      html += '</div>';
    });
    container.innerHTML = html;
  } catch(e){}
}

function restoreSub(codeEnc, lang, stdoutEnc, status) {
  var code = decodeURIComponent(codeEnc);
  var stdout = decodeURIComponent(stdoutEnc);
  if (window.monaco && monacoEditor) {
    monacoEditor.setValue(code);
    if (currentFileKey && files[currentFileKey]) {
      files[currentFileKey].raw = code;
    }
  }
  setTerminalTab('interactive');
  var outLog = document.getElementById('termLiveLog');
  if (outLog) outLog.textContent = stdout || '(이전 출력 없음)';
  var sc = document.getElementById('termStatusChip');
  if (sc) {
    sc.style.display = 'inline-block';
    sc.className = 'term-status-chip ' + (status === 'Accepted' ? 'success' : 'error');
    sc.textContent = status;
  }
  var badge = document.getElementById('sbLangBadge');
  if (badge) badge.textContent = (lang === 'java' ? '☕ Java 17' : '🐍 Python 3');
  updateEditorStatusBar();
  pushToast('📂', '기록 불러오기', lang + ' 실행 기록을 에디터로 불러왔습니다.');
}

/* ---- WebSocket Integration ---- */
var wsClient = null;
function initWebSocket() {
  try {
    if (wsClient) {
      try { wsClient.close(); } catch(e){}
    }
    var wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/events';
    wsClient = new WebSocket(wsUrl);
    wsClient.onopen = function() {
      console.log('[WebSocket] Connected:', wsUrl);
    };
    wsClient.onmessage = function(ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.event === 'code_executed') {
          pushToast('⚡', '실시간 코드 실행 알림', msg.language + ' (' + msg.status + ') · ' + (msg.execution_time||0) + 's');
          if (authToken) loadSubmissions();
        }
      } catch(e){}
    };
    wsClient.onclose = function() {
      setTimeout(initWebSocket, 6000);
    };
  } catch(e){}
}

// 초기화: 코드 편집기는 워크스페이스를 열 때(wsEnsureMonaco) 불러온다
var initialKey = currentFileKey || Object.keys(files)[0];
if (initialKey) {
  openFile(initialKey, null);
}
renderFileTree();
renderProjRow();
initResizers();
checkBackendHealth();
setInterval(function(){ if(!document.hidden) checkBackendHealth(); }, 60000);   // 서버 상태 확인은 화면이 보일 때만, 1분마다
initWebSocket();
// 자동 로그인 검증 및 OAuth 콜백 토큰 수신
async function checkAutoLogin() {
  try {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('token')) {
      authToken = urlParams.get('token');
      localStorage.setItem('sync_auth_token', authToken);
      var pName = urlParams.get('name');
      var pProv = urlParams.get('provider');
      window.history.replaceState({}, document.title, window.location.pathname);
      pushToast('✨', (pProv || '소셜') + ' 로그인 성공', (pName ? decodeURIComponent(pName) + '님 환영합니다!' : '성공적으로 로그인되었습니다.'));
    }
    if (urlParams.has('social_info')) {
      var info = urlParams.get('social_info');
      window.history.replaceState({}, document.title, window.location.pathname);
      if (info === 'google_keys_missing') {
        pushToast('ℹ️', 'Google OAuth 설정 안내', '.env에 GOOGLE_CLIENT_ID를 등록하면 실제 구글 계정으로 연결됩니다.');
      } else if (info === 'naver_keys_missing') {
        pushToast('ℹ️', '네이버 로그인 설정 안내', '.env에 NAVER_CLIENT_ID를 등록하면 실제 네이버 계정으로 연결됩니다.');
      }
    }
    if (urlParams.has('social_error')) {
      var err = urlParams.get('social_error');
      window.history.replaceState({}, document.title, window.location.pathname);
      pushToast('⚠️', '소셜 로그인 취소 또는 오류', decodeURIComponent(err));
    }
  } catch(e){}

  if (!authToken) { setTimeout(function(){ enterGuestHome(true); }, 0); return; }
  try {
    var res = await fetch(API_BASE + '/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.ok) {
      currentUser = await res.json();
      localStorage.setItem('sync_auth_user', JSON.stringify(currentUser));
      myProfile.name = currentUser.username || '사용자';
      myProfile.role = currentUser.email;
      var pn = document.getElementById('profileName');
      if (pn) pn.textContent = myProfile.name;
      startRealSession();
      goView('home');
      routerBoot();
      loadSubmissions();
      processPendingInvite();
      // 접속할 때마다 로그인 유효기간 연장 (실패해도 기존 토큰 유지)
      fetch(API_BASE + '/api/auth/refresh', { method:'POST', headers:{ 'Authorization': 'Bearer ' + authToken } })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){ if(d && d.access_token){ authToken = d.access_token; try{ localStorage.setItem('sync_auth_token', d.access_token); }catch(e){} } })
        .catch(function(){});
    } else {
      authToken = null;
      try{ localStorage.removeItem('sync_auth_token'); localStorage.removeItem('sync_auth_user'); }catch(e){}
      enterGuestHome(true);
      if (res.status === 401) pushToast('⏰', '로그인이 만료됐어요', '다시 로그인하면 이전 프로젝트와 채팅이 그대로 이어져요.');
      processPendingInvite();
    }
  } catch(e){ if(!currentUser) enterGuestHome(true); }
}
checkAutoLogin();

