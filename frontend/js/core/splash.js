/* ---- 설치한 앱(PWA) 인사 화면 걷기 ----
   html.is-standalone 일 때만 인사 화면(#splash)이 보인다. 로그인 확인이 끝나면(splashReady) (화면에 처음 나타난 뒤) 최소 1.9초는 보여 준 뒤 스르륵 사라진다.
   (아무리 늦어도 6초 뒤에는 걷는다 — 서버가 느려도 앱이 가려진 채로 멈춰 있지 않게) */
var SPLASH = { min: 1900, max: 6000, ready: false, done: false, t0: 0 };
function splashTry(){
  if(SPLASH.done || !SPLASH.ready) return;
  var left = SPLASH.min - ((window.performance && performance.now ? performance.now() : SPLASH.min) - SPLASH.t0);       // 인사 화면이 실제로 그려지기 시작한 뒤 지난 시간
  if(left > 0){ setTimeout(splashTry, left); return; }
  SPLASH.done = true;
  var el = document.getElementById('splash'); if(!el) return;
  el.classList.add('out');
  setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); document.documentElement.classList.remove('is-standalone'); }, 700);
}
function splashReady(){ SPLASH.ready = true; splashTry(); }
(function(){
  if(!document.documentElement.classList.contains('is-standalone')){         // 웹 브라우저: 인사 화면이 필요 없다
    var el = document.getElementById('splash'); if(el && el.parentNode) el.parentNode.removeChild(el);
    SPLASH.done = true; return;
  }
  setTimeout(splashReady, SPLASH.max);
  /* 느린 기기에서는 스크립트를 읽는 동안 애니메이션이 늦게 시작한다 → '처음 그려진 순간'부터 시간을 잰다 (인사가 다 보이기 전에 사라지지 않게) */
  requestAnimationFrame(function(){ SPLASH.t0 = (window.performance && performance.now) ? performance.now() : 0; splashTry(); });
})();
