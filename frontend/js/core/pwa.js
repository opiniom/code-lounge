/* ---- PWA: 앱으로 설치 · 새 버전 알림 · 오프라인 알림 · 화면 모드(라이트/다크)에 맞는 아이콘 ----
   · 서비스 워커(/sw.js)는 화면 파일(CSS·JS·아이콘)만 보관한다. 로그인·채팅 같은 서버 데이터(/api, /ws)는 절대 건드리지 않는다.
   · 홈 화면 아이콘은 '설치하는 순간'의 것이 쓰이므로, 라이트/다크가 바뀔 때마다 매니페스트·아이콘 주소를 그 모드에 맞게 바꿔 둔다.
     (설치된 뒤에 모드를 바꿔도 이미 만든 홈 화면 아이콘은 운영체제가 정하므로 자동으로 바뀌지 않는다 — 다시 설치하면 새 모드의 아이콘이 쓰인다) */
var PWA = { deferred:null, reg:null, hadController:false, updateShown:false };

function pwaDark(){ try { return (typeof isDarkMode === 'function') ? isDarkMode() : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); } catch(e){ return false; } }
function pwaStandalone(){ try { return !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true); } catch(e){ return false; } }
function pwaIsIOS(){ var ua = navigator.userAgent || ''; return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1); }

/* 라이트/다크에 맞게: 매니페스트 · 탭 아이콘 · iOS 홈 화면 아이콘 · 상단 상태 표시줄 색 */
function pwaSyncTheme(){
  var k = pwaDark() ? 'dark' : 'light', $ = function(id){ return document.getElementById(id); };
  var set = function(el, attr, val){ if(el && el.getAttribute(attr) !== val) el.setAttribute(attr, val); };
  set($('pwaManifest'), 'href', '/manifest.webmanifest?theme=' + k);
  set($('pwaFavicon'), 'href', '/static/icons/favicon-' + k + '-64.png');
  set($('pwaApple'), 'href', '/static/icons/apple-touch-' + k + '.png');
  set(document.querySelector('meta[name="theme-color"]'), 'content', k === 'dark' ? '#111731' : '#FFFFFF');
  set($('pwaStatusBar'), 'content', k === 'dark' ? 'black' : 'default');
}

/* 서비스 워커 등록 + 새 버전 알림 */
function pwaRegister(){
  if(!('serviceWorker' in navigator)) return;
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if(!secure) return;
  PWA.hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if(!PWA.hadController){ PWA.hadController = true; return; }       // 처음 설치될 때의 교체는 화면을 새로고침하지 않는다
    if(PWA.reloading) return; PWA.reloading = true; location.reload();
  });
  var go = function(){
    navigator.serviceWorker.register('/sw.js', { scope:'/' }).then(function(reg){
      PWA.reg = reg;
      if(reg.waiting && navigator.serviceWorker.controller) pwaUpdateReady(reg);
      reg.addEventListener('updatefound', function(){
        var nw = reg.installing; if(!nw) return;
        nw.addEventListener('statechange', function(){ if(nw.state === 'installed' && navigator.serviceWorker.controller) pwaUpdateReady(reg); });
      });
      // 열어 둔 채로도 새 버전을 알아채게: 화면으로 돌아올 때, 그리고 30분마다 확인
      document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'visible') reg.update().catch(function(){}); });
      setInterval(function(){ reg.update().catch(function(){}); }, 30 * 60 * 1000);
    }).catch(function(){});
  };
  if(document.readyState === 'complete') go(); else window.addEventListener('load', go);
}
function pwaUpdateReady(reg){
  if(PWA.updateShown) return; PWA.updateShown = true;
  if(typeof pushToast === 'function') pushToast('🔄', '새 버전이 나왔어요', '여기를 눌러 새로고침하면 바로 적용돼요', { duration:20000, onclick:function(){ if(reg.waiting) reg.waiting.postMessage({ type:'SKIP_WAITING' }); else location.reload(); } });
}

/* 설치 버튼 (아바타 메뉴 → 앱으로 설치) */
function pwaRefreshInstallUi(){
  var b = document.getElementById('avatarInstallBtn'); if(!b) return;
  b.hidden = pwaStandalone() || !(PWA.deferred || pwaIsIOS());       // 이미 앱으로 열었으면 숨김 · 크롬 계열은 브라우저가 설치를 허락했을 때 · iOS 는 안내 창
}
window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); PWA.deferred = e; pwaRefreshInstallUi(); });
window.addEventListener('appinstalled', function(){
  PWA.deferred = null; pwaRefreshInstallUi();
  if(typeof pushToast === 'function') pushToast('📲', '앱이 설치됐어요', '홈 화면(또는 앱 목록)에서 DureSync 를 열어 보세요');
});
function pwaInstall(){
  if(typeof closeMenus === 'function') closeMenus();
  if(PWA.deferred){
    var ev = PWA.deferred; PWA.deferred = null; pwaRefreshInstallUi();
    ev.prompt();
    if(ev.userChoice) ev.userChoice.then(function(c){ if(c && c.outcome === 'dismissed' && typeof pushToast === 'function') pushToast('ℹ️', '설치를 취소했어요', '언제든 아바타 메뉴에서 다시 설치할 수 있어요'); });
    return;
  }
  if(pwaIsIOS()){ pwaShowGuide(); return; }
  if(typeof pushToast === 'function') pushToast('ℹ️', '이 브라우저에서는 바로 설치할 수 없어요', '크롬·엣지·삼성 인터넷의 주소창 설치 아이콘이나 메뉴 → "앱 설치"를 이용해 주세요');
}

/* iOS: 설치 버튼이 없어서 '공유 → 홈 화면에 추가' 안내 창 */
function pwaShowGuide(){
  var ov = document.getElementById('pwaGuide');
  if(!ov){
    ov = document.createElement('div'); ov.id = 'pwaGuide'; ov.className = 'pwa-guide'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'pwaGuideT');
    ov.innerHTML = '<div class="pwa-guide-card"><img class="pwa-guide-ic" alt="" width="72" height="72"><h3 id="pwaGuideT">홈 화면에 추가하기</h3>'
      + '<ol><li><b>공유 버튼</b> <span class="pwa-sh"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg></span> 를 눌러요 (Safari 아래쪽 / Chrome 위쪽)</li>'
      + '<li>메뉴에서 <b>“홈 화면에 추가”</b> 를 골라요</li><li>오른쪽 위 <b>“추가”</b> 를 누르면 끝!</li></ol>'
      + '<p>지금 화면 모드(<b class="pwa-mode"></b>)에 맞는 아이콘으로 추가돼요.</p><button type="button" class="pwa-guide-ok">확인</button></div>';
    ov.addEventListener('click', function(e){ if(e.target === ov || e.target.classList.contains('pwa-guide-ok')) ov.hidden = true; });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') ov.hidden = true; });
    document.body.appendChild(ov);
  }
  var dark = pwaDark();
  ov.querySelector('.pwa-guide-ic').src = '/static/icons/apple-touch-' + (dark ? 'dark' : 'light') + '.png';
  ov.querySelector('.pwa-mode').textContent = dark ? '다크' : '라이트';
  ov.hidden = false;
}

/* 연결 상태 알림 */
window.addEventListener('offline', function(){ if(typeof pushToast === 'function') pushToast('📡', '오프라인이에요', '연결이 돌아오면 자동으로 이어져요'); });
window.addEventListener('online', function(){ if(typeof pushToast === 'function') pushToast('✅', '다시 연결됐어요', ''); });

/* 시작 */
(function(){
  if(pwaStandalone()) document.documentElement.classList.add('is-pwa');
  pwaSyncTheme(); pwaRefreshInstallUi(); pwaRegister();
  try { new MutationObserver(pwaSyncTheme).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] }); } catch(e){}      // 앱 안에서 라이트/다크를 바꿀 때
  try { var mq = matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener ? mq.addEventListener('change', pwaSyncTheme) : mq.addListener(pwaSyncTheme)); } catch(e){}           // 기기 설정을 따라가는 경우
  try { matchMedia('(display-mode: standalone)').addEventListener('change', function(e){ document.documentElement.classList.toggle('is-pwa', e.matches); pwaRefreshInstallUi(); }); } catch(e){}
})();
