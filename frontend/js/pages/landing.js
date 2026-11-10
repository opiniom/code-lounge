/* ---- 로그인 전 첫 화면(서비스 소개) ----
   스크롤하면 부드럽게 나타나는 효과 · 위쪽 메뉴 · 부드러운 이동. 화면이 열릴 때(goView('landing')) ldEnter() 가 불린다. */
var LD = { io: null, bound: false, open: null, hoverT: 0, leaveT: 0, built: false };
function ldReduced(){ return document.documentElement.getAttribute('data-motion') === 'reduce' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

/* ---------- 위쪽 메뉴: 카테고리별로 정리한 메뉴 (마우스를 올리거나 눌러서 펼친다 · 좁은 화면은 서랍) ---------- */
var LD_MENU = [
  { k: 'about', ic: 'compass', label: '서비스', cols: [
      { h: '두레 알아보기', items: [
        { ic: 'compass', c: '#3B82F6', t: '지향하는 방향', d: '쉽게 시작하고, 자연스럽게 함께', go: ['ldMission'] },
        { ic: 'mark', c: '#8B5CF6', t: '두레 이야기', d: '함께 일하던 우리의 오래된 방식', go: ['ldMission'] },
        { ic: 'flag', c: '#22C55E', t: '시작하는 법', d: '세 걸음이면 시작해요', go: ['ldHow'] } ] } ],
    feat: { type: 'brand', t: '함께 일하는 가장 오래된 방식, AI로 다시.', d: '코딩 입문부터 팀 프로젝트까지, 한 곳에서 이어져요.', cta: '지금 시작하기' } },
  { k: 'features', ic: 'spark', label: '기능', cols: [
      { h: '코딩', items: [
        { ic: 'code', c: '#3B82F6', t: '코드 워크스페이스', d: '여러 언어를 브라우저에서 바로', go: ['ldFeatures', 'ldf-workspace'] },
        { ic: 'bug', c: '#E5484D', t: '디버거 · AI 에러 설명', d: '한 줄씩 실행하고 쉽게 이해해요', go: ['ldFeatures', 'ldf-debug'] } ] },
      { h: '협업', items: [
        { ic: 'chat', c: '#8B5CF6', t: '팀 채팅 · 두레 AI', d: '"두레야"라고 부르면 알아서', go: ['ldFeatures', 'ldf-chat'] },
        { ic: 'phone', c: '#22C55E', t: '팀 통화방', d: '프로젝트마다 바로 연결', go: ['ldFeatures', 'ldf-call'] },
        { ic: 'cal', c: '#F59E0B', t: '자동 일정', d: '회의록에서 일정을 찾아줘요', go: ['ldFeatures', 'ldf-cal'] } ] },
      { h: '발견', items: [
        { ic: 'users', c: '#EC4899', t: '커뮤니티', d: '질문 · 팀원 구하기 · 스터디', go: ['ldFeatures', 'ldf-community'] },
        { ic: 'trophy', c: '#06B6D4', t: '공모전 · 해커톤', d: '마감 순으로 자동으로 모아요', go: ['ldFeatures', 'ldf-contest'] } ] } ],
    feat: { type: 'err', t: 'AI가 에러를 쉽게 풀어줘요', d: '에러가 난 줄과 진짜 원인 줄이 달라도 정확히 짚어줘요.', go: ['ldFeatures', 'ldf-debug'], cta: '자세히 보기' } },
  { k: 'who', ic: 'users', label: '대상별', cols: [
      { h: '배우는 사람', items: [
        { ic: 'sprout', c: '#22C55E', t: '코딩 입문자', d: '에러가 무서운 첫 코딩', go: ['ldWho', 'ldp-beginner'] },
        { ic: 'cap', c: '#8B5CF6', t: '전공 무관 학생', d: '과제 · 팀플 · 공모전', go: ['ldWho', 'ldp-student'] },
        { ic: 'school', c: '#06B6D4', t: '교육 목적', d: '스터디 · 동아리 · 수업', go: ['ldWho', 'ldp-edu'] } ] },
      { h: '만드는 사람', items: [
        { ic: 'laptop', c: '#3B82F6', t: '개인 개발자', d: '혼자 만들어도 든든하게', go: ['ldWho', 'ldp-solo'] },
        { ic: 'rocket', c: '#F59E0B', t: '상업 · 창업 프로젝트', d: '사이드 프로젝트에서 서비스까지', go: ['ldWho', 'ldp-biz'] } ] },
      { h: '가르치는 사람', items: [
        { ic: 'board', c: '#EC4899', t: '선생님', d: '학생 코드를 함께 보며 도와요', go: ['ldWho', 'ldp-teacher'] } ] } ],
    feat: { type: 'chips', t: '누구나, 제한 없이', d: '전공도 경력도 목적도 묻지 않아요. 브라우저만 있으면 돼요.', chips: ['전공 무관', '경력 무관', '설치 없이', '모든 화면'] } },
  { k: 'start', ic: 'flag', label: '시작하기', cols: [
      { h: '세 걸음이면 시작해요', items: [
        { ic: 'spark', c: '#3B82F6', t: '1. 로그인', d: '구글 · 네이버 계정으로 바로', go: ['ldHow'] },
        { ic: 'flag', c: '#8B5CF6', t: '2. 프로젝트 만들기', d: '이름만 정하면 끝', go: ['ldHow'] },
        { ic: 'users', c: '#22C55E', t: '3. 함께 만들기', d: '코드 · 채팅 · 일정을 한 곳에서', go: ['ldHow'] } ] } ],
    feat: { type: 'brand', t: '지금, 첫 프로젝트를', d: '가장 쉬운 시작을 두레가 도울게요.', cta: '로그인하고 시작하기' } }
];
function ldSvg(id){ return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-' + id + '"/></svg>'; }
function ldEsc(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function ldItemHtml(it, i){
  return '<button type="button" class="ld-it" data-go="' + it.go.join('|') + '"><span class="ld-ico" style="--c:' + it.c + '">' + ldSvg(it.ic) + '</span><span class="ld-it-tx"><b>' + ldEsc(it.t) + '</b><small>' + ldEsc(it.d) + '</small></span></button>';
}
function ldFeatHtml(f){
  var vis = '';
  if(f.type === 'brand') vis = '<span class="bm ld-feat-mark" role="img" aria-hidden="true"></span>';
  else if(f.type === 'err') vis = '<div class="ld-feat-err"><span class="e">에러 13번</span><i>→</i><span class="c">진짜 원인 11번</span></div>';
  else if(f.type === 'chips') vis = '<div class="ld-feat-chips">' + f.chips.map(function(c){ return '<span class="chip accent">' + ldEsc(c) + '</span>'; }).join('') + '</div>';
  var cta = f.cta ? '<button type="button" class="ld-feat-btn" data-go="' + (f.go ? f.go.join('|') : '') + '"' + (f.go ? '' : ' data-login="1"') + '>' + ldEsc(f.cta) + ldSvg('arrow') + '</button>' : '';
  return '<div class="ld-feat">' + vis + '<b>' + ldEsc(f.t) + '</b><p>' + ldEsc(f.d) + '</p>' + cta + '</div>';
}
function ldBuildMenu(){
  if(LD.built) return; LD.built = true;
  var nav = document.getElementById('ldMenu'), mega = document.getElementById('ldMega');
  if(!nav || !mega) return;
  nav.innerHTML = LD_MENU.map(function(m){ return '<button type="button" class="ld-mb" data-k="' + m.k + '" aria-haspopup="true" aria-expanded="false">' + ldSvg(m.ic) + '<span>' + ldEsc(m.label) + '</span><svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-chev"/></svg></button>'; }).join('');
  mega.innerHTML = '<div class="ld-mega-in">' + LD_MENU.map(function(m){
    return '<div class="ld-pn" data-k="' + m.k + '" role="menu"><div class="ld-pn-cols" style="--n:' + m.cols.length + '">' + m.cols.map(function(c){ return '<div class="ld-col"><h4>' + ldEsc(c.h) + '</h4>' + c.items.map(ldItemHtml).join('') + '</div>'; }).join('') + '</div>' + ldFeatHtml(m.feat) + '</div>';
  }).join('') + '</div>';
  // 눌렀을 때
  nav.addEventListener('click', function(e){ var b = e.target.closest('.ld-mb'); if(!b) return; ldToggleMenu(b.getAttribute('data-k')); });
  nav.addEventListener('pointerover', function(e){ if(e.pointerType !== 'mouse') return; var b = e.target.closest('.ld-mb'); if(b) ldHover(b.getAttribute('data-k')); });
  var head = document.getElementById('ldNav');
  head.addEventListener('pointerleave', function(e){ if(e.pointerType === 'mouse') ldLeave(); });
  head.addEventListener('pointerenter', function(e){ if(e.pointerType === 'mouse') clearTimeout(LD.leaveT); });
  function onGo(e){
    var t = e.target.closest('[data-go],[data-login]'); if(!t) return;
    if(t.hasAttribute('data-login') && !t.getAttribute('data-go')){ ldCloseMenus(); openLogin(); return; }
    var g = (t.getAttribute('data-go') || '').split('|'); ldGo(g[0], g[1]);
  }
  mega.addEventListener('click', onGo);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') ldCloseMenus(); });
}
function ldHover(k){ clearTimeout(LD.leaveT); clearTimeout(LD.hoverT); LD.hoverT = setTimeout(function(){ ldOpenMenu(k); }, 70); }
function ldLeave(){ clearTimeout(LD.hoverT); clearTimeout(LD.leaveT); LD.leaveT = setTimeout(ldCloseMenus, 200); }
function ldToggleMenu(k){ if(LD.open === k) ldCloseMenus(); else ldOpenMenu(k); }
function ldOpenMenu(k){
  var mega = document.getElementById('ldMega'); if(!mega) return;
  LD.open = k;
  Array.prototype.forEach.call(mega.querySelectorAll('.ld-pn'), function(p){ p.classList.toggle('on', p.getAttribute('data-k') === k); });
  Array.prototype.forEach.call(document.querySelectorAll('#ldMenu .ld-mb'), function(b){ var on = b.getAttribute('data-k') === k; b.classList.toggle('on', on); b.setAttribute('aria-expanded', on ? 'true' : 'false'); });
  mega.classList.add('open'); mega.setAttribute('aria-hidden', 'false');
  document.getElementById('ldScrim').classList.add('on');
}
function ldCloseMenus(){
  LD.open = null; clearTimeout(LD.hoverT);
  var mega = document.getElementById('ldMega'); if(mega){ mega.classList.remove('open'); mega.setAttribute('aria-hidden', 'true'); }
  Array.prototype.forEach.call(document.querySelectorAll('#ldMenu .ld-mb'), function(b){ b.classList.remove('on'); b.setAttribute('aria-expanded', 'false'); });
  var sc = document.getElementById('ldScrim'); if(sc) sc.classList.remove('on');
}
/* 메뉴에서 고른 곳으로 부드럽게 이동하고, 그 카드를 잠깐 강조한다 */
function ldGo(sec, card){
  ldCloseMenus();
  setTimeout(function(){
    var el = document.getElementById(card || sec); if(!el) return;
    var nav = document.getElementById('ldNav'), off = (nav ? nav.offsetHeight : 58) + (card ? 90 : 12);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - off, behavior: ldReduced() ? 'auto' : 'smooth' });
    if(card){ el.classList.remove('ld-flash'); void el.offsetWidth; el.classList.add('ld-flash'); setTimeout(function(){ el.classList.remove('ld-flash'); }, 2000); el.classList.add('in'); }
  }, 80);
}
function ldThemeIcon(){
  var b = document.getElementById('ldTheme'); if(!b) return;
  var dark = (typeof isDarkMode === 'function') && isDarkMode();
  b.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-' + (dark ? 'sun' : 'moon') + '"/></svg>';
  b.title = dark ? '라이트 모드로' : '다크 모드로';
}
function ldToggleTheme(){
  if(typeof setTheme !== 'function') return;
  setTheme((typeof isDarkMode === 'function' && isDarkMode()) ? 'light' : 'dark');
  setTimeout(ldThemeIcon, 60);
}
function ldScrollTop(){ window.scrollTo({ top: 0, behavior: ldReduced() ? 'auto' : 'smooth' }); }
function ldScroll(id){
  var el = document.getElementById(id); if(!el) return;
  var nav = document.getElementById('ldNav'), off = (nav ? nav.offsetHeight : 64) + 8;
  var y = el.getBoundingClientRect().top + window.pageYOffset - off;
  window.scrollTo({ top: y, behavior: ldReduced() ? 'auto' : 'smooth' });
}
function ldNavState(){
  var nav = document.getElementById('ldNav'); if(!nav) return;
  nav.classList.toggle('scrolled', (window.pageYOffset || 0) > 12);
}
/* 홈과 같은 두레 궤도(AI 1 + 초대 '+' 6)를 한 번만 그린다. 가짜 팀원은 없다 */
function ldOrbit(){
  var box = document.getElementById('ldOrbit'); if(!box || box.children.length || typeof dureNode !== 'function') return;
  var N = 7, kinds = ['inv', 'ghost', 'ghost', 'ghost', 'ai', 'ghost', 'ghost'];
  box.dataset.n = N;
  kinds.forEach(function(k, i){
    var angle = Math.round(i * 360 / N * 100) / 100;
    if(k === 'ai') box.appendChild(dureNode(angle, null, 'AI', '두레 AI — 채팅에서 "두레야"라고 불러보세요', { cls: 'dn-ai' }));
    else box.appendChild(dureNode(angle, null, '+', '로그인하고 시작하기', { cls: 'dn-plus' + (k === 'inv' ? '' : ' ghost'), click: function(){ openLogin(); } }));
  });
}
function ldIntro(){
  var hero = document.getElementById('ldHero'); if(!hero) return;
  hero.classList.remove('ld-intro'); void hero.offsetWidth; hero.classList.add('ld-intro');       // 홈과 같은 차례로 나타나는 효과
}
function ldEnter(){
  var root = document.getElementById('landing'); if(!root) return;
  window.scrollTo(0, 0);
  ldBuildMenu(); ldThemeIcon(); ldOrbit(); ldIntro();
  if(!LD.bound){ LD.bound = true; window.addEventListener('scroll', ldNavState, { passive: true }); }
  ldNavState();
  var items = root.querySelectorAll('.ld-rv');
  if(ldReduced() || !('IntersectionObserver' in window)){ root.classList.remove('ld-anim'); return; }
  if(LD.io) LD.io.disconnect();
  root.classList.add('ld-anim');
  items.forEach(function(el){ el.classList.remove('in'); });
  LD.io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); LD.io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  requestAnimationFrame(function(){ items.forEach(function(el){ LD.io.observe(el); }); });
}
