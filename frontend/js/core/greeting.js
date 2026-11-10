/* ---- 시간대별 인사 (소개 화면 · 홈) ----
   새벽 · 아침 · 오전 · 점심 · 오후 · 저녁 · 밤에 따라 문구와 작은 아이콘이 자동으로 바뀐다. (계산은 index.html 머리의 dureGreeting 이 한다 — 앱 인사 화면과 같은 문구)
   · 소개 화면(로그인 전): "좋은 아침이에요 · 어서 오세요"
   · 홈(로그인 후): "○○님, 점심은 드셨나요?"
   1분마다 다시 확인해서, 화면을 열어 둔 채로 시간이 지나면 문구도 따라 바뀐다. */
function greetSet(el, g, text){
  var key = g.slot + '|' + text;
  if(el.dataset.k === key) return;
  el.dataset.k = key; el.dataset.slot = g.slot;
  el.innerHTML = dureGreetIcon(g.icon) + '<span></span>';
  el.lastChild.textContent = text;
  el.classList.remove('greet-in'); void el.offsetWidth; el.classList.add('greet-in');
}
function greetRefresh(){
  if(typeof dureGreeting !== 'function') return;
  var g = dureGreeting();
  var ld = document.getElementById('ldGreet'); if(ld) greetSet(ld, g, g.text + ' · 어서 오세요');
  var hm = document.getElementById('homeGreet');
  if(hm){
    var name = (typeof currentUser !== 'undefined' && currentUser && currentUser.username) ? String(currentUser.username) : '';
    if(typeof authToken !== 'undefined' && authToken && name){ hm.hidden = false; greetSet(hm, g, name + '님, ' + g.text); }
    else hm.hidden = true;
  }
}
setInterval(greetRefresh, 60000);
document.addEventListener('visibilitychange', function(){ if(!document.hidden) greetRefresh(); });
