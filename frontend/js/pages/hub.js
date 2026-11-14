/* ---- 메인 홈 (/) · 기관용 소개 (/institution) ----
   두레싱크를 '비즈니스'와 '기관용' 두 모델로 나눠 소개하는 웹사이트 첫 화면 (설치한 앱(PWA)에서는 보이지 않는다).
   · 비즈니스  = 지금 만든 서비스(자세한 소개 화면은 /business). 지금은 수요조사 기간이라 'Free & Beta' 하나로 풀어 둔다.
   · 기관용    = 학교·교수용. 아직 개발 중이라 뼈대와 '준비 중' 안내만 있다.
   · 구독 카드는 더미: 사업자 등록 전이라 결제는 없고, 비즈니스 버튼은 /business 로, 기관용 버튼은 '개발 중' 안내를 보여 준다.
   화면 구성: 위쪽 메뉴(펼침 카테고리) → 첫 화면(제품 화면이 움직인다) → 두 가지 모델 → 기능 둘러보기(탭) → 시작하는 법 → 구독·요금 → 자주 묻는 질문 → 마무리.
   색·아이콘·움직임은 로그인 전 소개 화면(landing.js · landing.css)의 것을 그대로 쓰고, 화면 속 제품 모습은 '예시'로 그린 그림이다(실제 데이터가 아니다). */
var HB = { ctx: null, io: null, bound: false, built: false, open: null, hoverT: 0, leaveT: 0, tab: 0, tabT: 0, tabHold: false };

function hbSvg(id){ return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-' + id + '"/></svg>'; }
function hbIco(id, c, big){ return '<span class="ld-ico' + (big ? ' lg' : '') + '" style="--c:' + c + '">' + hbSvg(id) + '</span>'; }
var HB_CHECK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

/* ---------- 위쪽 메뉴 (카테고리) ---------- */
var HB_MENU = [
  { k: 'biz', ic: 'rocket', label: '비즈니스', cols: [
      { h: '코딩', items: [
        { ic: 'code', c: '#3B82F6', t: '코드 워크스페이스', d: '여러 언어를 브라우저에서 바로', act: 'biz|ldFeatures|ldf-workspace' },
        { ic: 'bug', c: '#E5484D', t: '디버거 · AI 에러 설명', d: '한 줄씩 실행하고 쉽게 이해해요', act: 'biz|ldFeatures|ldf-debug' } ] },
      { h: '협업', items: [
        { ic: 'chat', c: '#8B5CF6', t: '팀 채팅 · 두레 AI', d: '"두레야"라고 부르면 알아서', act: 'biz|ldFeatures|ldf-chat' },
        { ic: 'phone', c: '#22C55E', t: '팀 통화방', d: '프로젝트마다 바로 연결', act: 'biz|ldFeatures|ldf-call' },
        { ic: 'cal', c: '#F59E0B', t: '자동 일정', d: '회의록에서 일정을 찾아줘요', act: 'biz|ldFeatures|ldf-cal' } ] },
      { h: '발견', items: [
        { ic: 'users', c: '#EC4899', t: '커뮤니티', d: '질문 · 팀원 구하기 · 스터디', act: 'biz|ldFeatures|ldf-community' },
        { ic: 'trophy', c: '#06B6D4', t: '공모전 · 해커톤', d: '마감 순으로 자동으로 모아요', act: 'biz|ldFeatures|ldf-contest' } ] } ],
    feat: { type: 'brand', t: '지금은 Free & Beta', d: '베타 기간 동안 모든 기능을 무료로 써 볼 수 있어요.', cta: '무료로 시작하기', act: 'start' } },
  { k: 'edu', ic: 'school', label: '기관용', cols: [
      { h: '기관용 · 준비 중', items: [
        { ic: 'school', c: '#06B6D4', t: '학교 · 교수용', d: '수업과 팀 프로젝트를 기관 단위로', act: 'inst' },
        { ic: 'chat', c: '#22C55E', t: '도입 문의', d: '현재 개발 중이에요', act: 'notice' } ] } ],
    feat: { type: 'brand', t: '기관용은 준비 중이에요', d: '현재 개발 중이니 양해 부탁드립니다.', cta: '기관용 보기', act: 'inst' } },
  { k: 'who', ic: 'users', label: '대상별', cols: [
      { h: '배우는 사람', items: [
        { ic: 'sprout', c: '#22C55E', t: '코딩 입문자', d: '에러가 무서운 첫 코딩', act: 'biz|ldWho|ldp-beginner' },
        { ic: 'cap', c: '#8B5CF6', t: '전공 무관 학생', d: '과제 · 팀플 · 공모전', act: 'biz|ldWho|ldp-student' },
        { ic: 'school', c: '#06B6D4', t: '교육 목적', d: '스터디 · 동아리 · 수업', act: 'biz|ldWho|ldp-edu' } ] },
      { h: '만드는 사람', items: [
        { ic: 'laptop', c: '#3B82F6', t: '개인 개발자', d: '혼자 만들어도 든든하게', act: 'biz|ldWho|ldp-solo' },
        { ic: 'rocket', c: '#F59E0B', t: '상업 · 창업 프로젝트', d: '사이드 프로젝트에서 서비스까지', act: 'biz|ldWho|ldp-biz' } ] },
      { h: '가르치는 사람', items: [
        { ic: 'board', c: '#EC4899', t: '선생님', d: '학생 코드를 함께 보며 도와요', act: 'biz|ldWho|ldp-teacher' } ] } ],
    feat: { type: 'chips', t: '누구나, 제한 없이', d: '전공도 경력도 목적도 묻지 않아요. 브라우저만 있으면 돼요.', chips: ['전공 무관', '경력 무관', '설치 없이', '무료 베타'] } },
  { k: 'learn', ic: 'compass', label: '알아보기', cols: [
      { h: '두레 알아보기', items: [
        { ic: 'compass', c: '#3B82F6', t: '지향하는 방향', d: '쉽게 시작하고, 자연스럽게 함께', act: 'biz|ldMission' },
        { ic: 'flag', c: '#22C55E', t: '시작하는 법', d: '세 걸음이면 시작해요', act: 'hub|hbHow' },
        { ic: 'help', c: '#8B5CF6', t: '자주 묻는 질문', d: '궁금한 점을 모아 뒀어요', act: 'hub|hbFaq' } ] } ],
    feat: { type: 'brand', t: '함께 일하는 가장 오래된 방식, AI로 다시.', d: '코딩 입문부터 팀 프로젝트까지, 한 곳에서 이어져요.', cta: '지금 시작하기', act: 'start' } },
  { k: 'plans', ic: 'spark', label: '요금제', link: 'hub|hbPlans' }
];
function hbFeatHtml(f){
  var vis = '';
  if(f.type === 'brand') vis = '<span class="bm ld-feat-mark" role="img" aria-hidden="true"></span>';
  else if(f.type === 'chips') vis = '<div class="ld-feat-chips">' + f.chips.map(function(c){ return '<span class="chip accent">' + ldEsc(c) + '</span>'; }).join('') + '</div>';
  var cta = f.cta ? '<button type="button" class="ld-feat-btn" data-act="' + (f.act || '') + '">' + ldEsc(f.cta) + ldSvg('arrow') + '</button>' : '';
  return '<div class="ld-feat">' + vis + '<b>' + ldEsc(f.t) + '</b><p>' + ldEsc(f.d) + '</p>' + cta + '</div>';
}
var HB_CTX = {
  hub: { nav: 'hbNav', menu: 'hbMenu', mega: 'hbMega', scrim: 'hbScrim', items: HB_MENU },
  inst: { nav: 'inNav', menu: 'inMenu', mega: 'inMega', scrim: 'inScrim', items: null }          // items 는 institution.js 가 채운다
};
HB.ctx = HB_CTX.hub;
function hbBuildMenu(c){
  c = c || HB_CTX.hub; if(!c.items) return;
  var nav = document.getElementById(c.menu), mega = document.getElementById(c.mega);
  if(!nav || !mega || nav.children.length) return;
  nav.innerHTML = c.items.map(function(m){
    return '<button type="button" class="ld-mb" data-k="' + m.k + '"' + (m.link ? ' data-act="' + m.link + '"' : ' aria-haspopup="true" aria-expanded="false"') + '>' + ldSvg(m.ic) + '<span>' + ldEsc(m.label) + '</span>' + (m.link ? '' : '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-chev"/></svg>') + '</button>';
  }).join('');
  mega.innerHTML = '<div class="ld-mega-in">' + c.items.filter(function(m){ return !m.link; }).map(function(m){
    return '<div class="ld-pn" data-k="' + m.k + '" role="menu"><div class="ld-pn-cols" style="--n:' + m.cols.length + '">' + m.cols.map(function(col){
      return '<div class="ld-col"><h4>' + ldEsc(col.h) + '</h4>' + col.items.map(function(it){
        return '<button type="button" class="ld-it" data-act="' + it.act + '"><span class="ld-ico" style="--c:' + it.c + '">' + ldSvg(it.ic) + '</span><span class="ld-it-tx"><b>' + ldEsc(it.t) + '</b><small>' + ldEsc(it.d) + '</small></span></button>';
      }).join('') + '</div>';
    }).join('') + '</div>' + hbFeatHtml(m.feat) + '</div>';
  }).join('') + '</div>';
  nav.addEventListener('click', function(e){ HB.ctx = c; var b = e.target.closest('.ld-mb'); if(!b) return; if(b.getAttribute('data-act')){ hbCloseMenus(); hbAct(b.getAttribute('data-act')); } else hbToggleMenu(b.getAttribute('data-k')); });
  nav.addEventListener('pointerover', function(e){ if(e.pointerType !== 'mouse') return; HB.ctx = c; var b = e.target.closest('.ld-mb'); if(!b) return; if(b.getAttribute('data-act')){ clearTimeout(HB.hoverT); HB.hoverT = setTimeout(hbCloseMenus, 120); } else { clearTimeout(HB.leaveT); clearTimeout(HB.hoverT); HB.hoverT = setTimeout(function(){ HB.ctx = c; hbOpenMenu(b.getAttribute('data-k')); }, 70); } });
  var head = document.getElementById(c.nav);
  head.addEventListener('pointerleave', function(e){ if(e.pointerType === 'mouse'){ clearTimeout(HB.hoverT); clearTimeout(HB.leaveT); HB.leaveT = setTimeout(hbCloseMenus, 200); } });
  head.addEventListener('pointerenter', function(e){ if(e.pointerType === 'mouse') clearTimeout(HB.leaveT); });
  mega.addEventListener('click', function(e){ var t = e.target.closest('[data-act]'); if(!t) return; hbCloseMenus(); hbAct(t.getAttribute('data-act')); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') hbCloseMenus(); });
}
function hbToggleMenu(k){ if(HB.open === k) hbCloseMenus(); else hbOpenMenu(k); }
function hbOpenMenu(k){
  var c = HB.ctx, mega = document.getElementById(c.mega); if(!mega) return;
  HB.open = k;
  Array.prototype.forEach.call(mega.querySelectorAll('.ld-pn'), function(p){ p.classList.toggle('on', p.getAttribute('data-k') === k); });
  Array.prototype.forEach.call(document.querySelectorAll('#' + c.menu + ' .ld-mb'), function(b){ var on = b.getAttribute('data-k') === k; b.classList.toggle('on', on); if(b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', on ? 'true' : 'false'); });
  mega.classList.add('open'); mega.setAttribute('aria-hidden', 'false');
  var sc = document.getElementById(c.scrim); if(sc) sc.classList.add('on');
}
function hbCloseMenus(){
  HB.open = null; clearTimeout(HB.hoverT);
  Object.keys(HB_CTX).forEach(function(key){
    var c = HB_CTX[key], mega = document.getElementById(c.mega); if(mega){ mega.classList.remove('open'); mega.setAttribute('aria-hidden', 'true'); }
    Array.prototype.forEach.call(document.querySelectorAll('#' + c.menu + ' .ld-mb'), function(b){ b.classList.remove('on'); if(b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', 'false'); });
    var sc = document.getElementById(c.scrim); if(sc) sc.classList.remove('on');
  });
}
/* 메뉴·버튼이 가리키는 곳으로: 'start' 시작하기 · 'notice' 개발 중 안내 · 'inst' 기관용 화면 · 'biz|구역|카드' 비즈니스 소개의 그 자리 · 'hub|id' 이 화면의 그 자리 */
function hbAct(a){
  var p = String(a || '').split('|');
  if(p[0] === 'start') return hbStartBusiness();
  if(p[0] === 'notice') return hbNotice();
  if(p[0] === 'inst') return goView('institution');
  if(p[0] === 'hub') return hbScroll(p[1]);
  if(p[0] === 'biz'){ goView('landing'); if(p[1]) setTimeout(function(){ if(typeof ldGo === 'function') ldGo(p[1], p[2]); }, 220); }
}

var HB_TABS = [
  { k: 'code', ic: 'code', c: '#3B82F6', t: '코드 워크스페이스', d: '여러 언어를 설치 없이 브라우저에서 쓰고, 중단점을 찍어 한 줄씩 따라가며 확인해요.', mock: function(){ return hdCode('dbg'); } },
  { k: 'chat', ic: 'chat', c: '#8B5CF6', t: '팀 채팅 · 두레 AI', d: '"두레야"라고 부르면 회의 내용을 읽고 일정과 메모까지 챙겨 줘요.', mock: hdChat },
  { k: 'call', ic: 'phone', c: '#22C55E', t: '팀 통화방', d: '프로젝트마다 바로 연결되는 음성 통화방이에요.', mock: hdCall },
  { k: 'notes', ic: 'cal', c: '#F59E0B', t: '회의록 · 자동 일정', d: '회의록에서 날짜를 찾아 캘린더에 올려 줘요.', mock: hdNotes },
  { k: 'comm', ic: 'users', c: '#EC4899', t: '커뮤니티 · 공모전', d: '팀원 구하기와 공모전 · 해커톤을 마감 순으로 모아 봐요.', mock: hdComm }
];

/* ---------- 구독 · 요금 카드 (본문과 구독창이 같이 쓴다) ---------- */
var HB_MARQ = [['code', '코드 워크스페이스'], ['chat', '팀 채팅'], ['spark', '두레 AI'], ['phone', '팀 통화방'], ['cal', '자동 일정'], ['board', '회의록'], ['users', '커뮤니티'], ['trophy', '공모전 · 해커톤']];
var HB_BIZ_FEATS = ['여러 언어를 브라우저에서 바로 실행하는 코드 워크스페이스', '팀 채팅과 "두레야" AI 도우미', '프로젝트마다 바로 연결되는 팀 통화방', '회의록에서 자동으로 만드는 일정', '커뮤니티 · 공모전 · 해커톤 모아 보기', '웹과 설치한 앱(PWA)에서 같은 계정으로'];
function hbPlansHtml(){
  var big = function(id){ return '<svg class="i hb-plan-svg" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-' + id + '"/></svg>'; };
  return '<article class="hb-plan hb-biz hb-spot">' +
      '<div class="hb-plan-ic">' + big('rocket') + '</div>' +
      '<h3>Free &amp; Beta</h3><p class="hb-plan-tag">비즈니스 · 팀, 창업, 개인 개발에</p>' +
      '<div class="hb-price"><b>무료</b><span>베타 기간 동안 모든 기능</span></div>' +
      '<button type="button" class="hb-planbtn primary" onclick="hbStartBusiness()">무료로 시작하기</button>' +
      '<p class="hb-plan-note">약정 없음 · 결제 정보 필요 없음</p>' +
      '<div class="hb-inc">Free &amp; Beta에 포함된 것</div>' +
      '<ul class="hb-checks">' + HB_BIZ_FEATS.map(function(f){ return '<li>' + HB_CHECK + '<span>' + f + '</span></li>'; }).join('') + '</ul>' +
    '</article>' +
    '<article class="hb-plan hb-edu hb-spot">' +
      '<div class="hb-plan-ic">' + big('school') + '</div>' +
      '<h3>기관용</h3><p class="hb-plan-tag">학교 · 교수용</p>' +
      '<div class="hb-price"><b>준비 중</b><span>현재 개발 중이에요</span></div>' +
      '<button type="button" class="hb-planbtn" onclick="hbNotice()">기관용 알아보기</button>' +
      '<p class="hb-plan-note">현재 개발 중이니 양해 부탁드립니다.</p>' +
      '<div class="hb-inc">기관용에 담을 내용</div>' +
      '<ul class="hb-checks hb-soonlist" aria-hidden="true"><li><i></i></li><li><i></i></li><li><i></i></li><li><i></i></li></ul>' +
      '<p class="hb-soon">준비가 끝나면 이곳에서 안내해 드려요.</p>' +
    '</article>';
}

/* ---------- 메인 홈 본문 ---------- */
var HB_FAQ = [
  ['정말 무료인가요?', '지금은 수요조사를 위한 <b>Free &amp; Beta</b> 기간이라 모든 기능을 무료로 써 볼 수 있어요. 결제 정보도 필요 없어요. 정식 요금제는 베타가 끝난 뒤에 따로 안내해 드릴게요.'],
  ['설치해야 하나요?', '아니요. <b>브라우저에서 바로</b> 쓸 수 있어요. 원하면 홈 화면에 앱(PWA)처럼 설치할 수도 있고, 웹과 앱은 같은 계정과 같은 데이터를 써요.'],
  ['어떤 계정으로 시작하나요?', '<b>구글 · 네이버 계정</b>으로 바로 로그인해서 시작해요.'],
  ['코딩을 처음 해도 괜찮나요?', '네. 에러가 나면 <b>AI가 어디가 왜 틀렸는지 쉬운 말로</b> 알려 줘요. 전공이나 경력은 묻지 않아요.'],
  ['기관용(학교 · 교수용)은 언제 나오나요?', '현재 <b>개발 중</b>이에요. 준비가 끝나면 이 페이지에서 안내해 드릴게요.']
];
function hbBuildHub(){
  var main = document.getElementById('hbMain'); if(!main || HB.built) return; HB.built = true;
  var arrow = hbSvg('arrow');
  main.innerHTML =
    /* 첫 화면 */
    '<section class="hb-hero" id="hbHero"><div class="hb-hero-grid">' +
      '<div class="hb-copy">' +
        '<span class="hh-eyebrow">두레 · together, since forever</span>' +
        '<h1 class="hb-h1"><span>함께 일하는</span><span>가장 오래된 방식,</span><span class="hb-grad">AI로 다시.</span></h1>' +
        '<p class="hb-lead">코딩을 막 시작한 사람부터 팀 프로젝트를 이끄는 사람까지. <b class="kw k1">코드</b> · <b class="kw k2">채팅</b> · <b class="kw k3">통화</b> · <b class="kw k4">일정</b> · <b class="kw k5">회의록</b>을 한곳에서 이어서 써요.</p>' +
        '<div class="hb-cta">' +
          '<button type="button" class="cta-btn primary hb-big" onclick="hbStartBusiness()">' + arrow + '<span class="cta-tx"><b>무료로 시작하기</b><small>비즈니스 · Free &amp; Beta</small></span></button>' +
          '<a class="cta-btn hb-big" href="/institution" onclick="return hbLink(event, \'institution\')">' + hbSvg('school') + '<span class="cta-tx"><b>기관용 알아보기</b><small>학교 · 교수용 · 준비 중</small></span></a>' +
        '</div>' +
        '<p class="hh-rotor"><span class="rot-label">함께 쓰는</span><span class="rot"><i>팀 프로젝트</i><i>창업 팀</i><i>코딩 수업</i><i>스터디</i><i>학교</i></span></p>' +
        '<ul class="hb-pills"><li>' + HB_CHECK + '설치 없이 브라우저에서</li><li>' + HB_CHECK + '무료 베타</li><li>' + HB_CHECK + '웹과 앱(PWA)</li></ul>' +
      '</div>' +
      '<div class="hb-art" aria-hidden="true">' +
        '<div class="hb-glow"></div><div class="hb-tilt" id="hbTilt">' + hdHero() + '</div><p class="hb-eg">화면은 예시예요</p>' +
      '</div>' +
    '</div><button type="button" class="ld-down" onclick="hbScroll(\'hbCats\')" aria-label="아래로 내려서 보기">' + hbSvg('chev') + '</button></section>' +

    /* 첫 화면과 다음 영역을 부드럽게 이어 주는 흐르는 띠 */
    '<div class="hb-marq" aria-hidden="true"><div class="hb-marq-t">' + [1, 2].map(function(){ return '<ul>' + HB_MARQ.map(function(m){ return '<li>' + hbSvg(m[0]) + m[1] + '</li>'; }).join('') + '</ul>'; }).join('') + '</div></div>' +

    /* 두레 이야기: 스크롤하면 문장이 단어별로 밝아진다 */
    '<section class="ld-sec hb-story" id="hbStory"><div class="ld-wrap narrow">' +
      '<span class="view-eyebrow ld-rv">두레 이야기</span>' +
      '<p class="hb-words" id="hbWords" aria-label="두레는 마을 사람들이 힘을 모아 함께 일하던 우리의 오래된 협동 방식이에요. 서로의 일이 곧 우리의 일이 되는 마음을 코딩 공간에 옮겨 왔어요.">' + hbWordsHtml() + '</p>' +
    '</div></section>' +

    /* 두 가지 모델 (카테고리) */
    '<section class="ld-sec" id="hbCats"><div class="ld-wrap">' +
      '<span class="view-eyebrow ld-rv">두레의 두 가지 모델</span>' +
      '<h2 class="ld-h2 ld-rv" style="--d:.05s">나에게 맞는 두레를 골라요</h2>' +
      '<p class="ld-p ld-rv" style="--d:.1s">같은 두레이지만 쓰는 곳에 따라 필요한 모습이 달라요. 비즈니스는 지금 바로 쓸 수 있고, 기관용은 준비하고 있어요.</p>' +
      '<div class="hb-cats">' +
        '<article class="card hb-cat hb-spot ld-rv" style="--d:.04s">' +
          '<div class="hb-cat-h">' + hbIco('rocket', '#3B82F6', true) + '<div><span class="chip accent">Free &amp; Beta</span><h3>DureSync 비즈니스</h3></div></div>' +
          '<p>코딩을 처음 배우는 사람부터 팀 프로젝트와 창업 서비스를 만드는 사람까지. 채팅 · 통화 · 일정 · 회의록 · 코드를 한곳에서 이어서 써요.</p>' +
          '<div class="hb-sub-h">이런 분께</div>' +
          '<div class="hb-tags">' +
            '<button type="button" onclick="hbAct(\'biz|ldWho|ldp-beginner\')">' + hbSvg('sprout') + '코딩 입문자</button>' +
            '<button type="button" onclick="hbAct(\'biz|ldWho|ldp-solo\')">' + hbSvg('laptop') + '개인 개발자</button>' +
            '<button type="button" onclick="hbAct(\'biz|ldWho|ldp-student\')">' + hbSvg('cap') + '전공 무관 학생</button>' +
            '<button type="button" onclick="hbAct(\'biz|ldWho|ldp-biz\')">' + hbSvg('rocket') + '상업 · 창업 프로젝트</button>' +
          '</div>' +
          '<a class="cta-btn primary hb-go" href="/business" onclick="return hbLink(event, \'landing\')">' + arrow + '<span class="cta-tx"><b>비즈니스 소개 보기</b><small>로그인 없이 먼저 둘러보세요</small></span></a>' +
        '</article>' +
        '<article class="card hb-cat hb-spot ld-rv" style="--d:.12s">' +
          '<div class="hb-cat-h">' + hbIco('school', '#06B6D4', true) + '<div><span class="chip">준비 중</span><h3>DureSync 기관용</h3></div></div>' +
          '<p>학교와 교수님이 수업과 팀 프로젝트를 기관 단위로 운영할 수 있도록 준비하고 있어요. 현재 개발 중이에요.</p>' +
          '<div class="hb-sub-h">이런 곳을 위해</div>' +
          '<div class="hb-tags"><button type="button" onclick="hbNotice()">' + hbSvg('board') + '학교 · 교수용</button></div>' +
          '<a class="cta-btn hb-go" href="/institution" onclick="return hbLink(event, \'institution\')">' + arrow + '<span class="cta-tx"><b>기관용 보기</b><small>준비 중인 내용을 확인해요</small></span></a>' +
        '</article>' +
      '</div>' +
    '</div></section>' +

    /* 기능 둘러보기: 좁은 화면은 탭, 넓은 화면은 스크롤하면 무대가 고정되고 화면들이 겹겹이 앞으로 나온다 */
    hbFlatHtml('hbShowFlat', HB_TABS, '기능 둘러보기', '한곳에서 이어지는 팀 작업', '코드를 쓰고, 이야기하고, 일정을 챙기는 일을 앱을 옮겨 다니지 않고 한 화면에서 해요.') +
    hbStageHtml('hbShow', HB_TABS, '기능 둘러보기', '한곳에서 이어지는 팀 작업') +

    /* 이런 분들이 써요 (가로로 넘기는 카드) */
    '<section class="ld-sec" id="hbWho"><div class="ld-wrap">' +
      '<span class="view-eyebrow ld-rv">이런 분들이 써요</span>' +
      '<h2 class="ld-h2 ld-rv" style="--d:.05s">전공도 경력도 목적도 달라도 괜찮아요</h2>' +
    '</div>' + hbCarouselHtml({ id: 'hbCar' }) + '</section>' +

    /* 시작하는 법 */
    '<section class="ld-sec" id="hbHow"><div class="ld-wrap">' +
      '<span class="view-eyebrow ld-rv">시작하는 법</span>' +
      '<h2 class="ld-h2 ld-rv" style="--d:.05s">세 걸음이면 시작해요</h2>' +
      '<div class="hb-steps">' +
        [['01', 'spark', '#3B82F6', '로그인', '구글 · 네이버 계정으로 바로 시작해요.'], ['02', 'flag', '#8B5CF6', '프로젝트 만들기', '이름만 정하면 끝이에요.'], ['03', 'users', '#22C55E', '함께 만들기', '코드 · 채팅 · 일정을 한곳에서 이어서 써요.']].map(function(s, i){
          return '<article class="hb-step hb-spot ld-rv" style="--d:' + (0.04 + i * 0.07) + 's"><span class="no">' + s[0] + '</span>' + hbIco(s[1], s[2], true) + '<h3>' + s[3] + '</h3><p>' + s[4] + '</p></article>'; }).join('') +
      '</div>' +
    '</div></section>' +

    /* 구독 · 요금 */
    '<section class="ld-sec" id="hbPlans"><div class="ld-wrap">' +
      '<span class="view-eyebrow ld-rv">구독 · 요금</span>' +
      '<h2 class="ld-h2 ld-rv" style="--d:.05s">지금은 무료로, 베타로 열어 두었어요</h2>' +
      '<p class="ld-p ld-rv" style="--d:.1s">여러분의 의견을 듣는 수요조사 기간이에요. 정식 요금제는 베타가 끝난 뒤에 안내해 드릴게요.</p>' +
      '<div class="hb-plans ld-rv" style="--d:.14s">' + hbPlansHtml() + '</div>' +
    '</div></section>' +

    /* 자주 묻는 질문 */
    '<section class="ld-sec" id="hbFaq"><div class="ld-wrap narrow">' +
      '<span class="view-eyebrow ld-rv">자주 묻는 질문</span>' +
      '<h2 class="ld-h2 ld-rv" style="--d:.05s">궁금한 점을 모아 뒀어요</h2>' +
      '<div class="hb-faq ld-rv" style="--d:.1s">' + HB_FAQ.map(function(q, i){ return '<details class="hb-spot"><summary><em class="no">0' + (i + 1) + '</em><span>' + q[0] + '</span>' + hbSvg('chev') + '</summary><p>' + q[1] + '</p></details>'; }).join('') + '</div>' +
    '</div></section>' +

    /* 마무리: 스크롤하면 두레 로고가 커지면서 고리가 번지고, 시작 버튼이 나타난다 */
    '<section class="hb-fin" id="hbFin"><div class="hb-fin-track"><div class="hb-fin-sticky">' +
      '<i class="fr fr1"></i><i class="fr fr2"></i><i class="fr fr3"></i>' +
      '<div class="hb-fin-in"><span class="bm hb-final-mark" role="img" aria-hidden="true"></span>' +
        '<h2>지금, 첫 프로젝트를</h2><p>가장 쉬운 시작을 두레가 도울게요.</p>' +
        '<div class="hb-final-cta"><button type="button" class="cta-btn primary hb-big" onclick="hbStartBusiness()">' + arrow + '<span class="cta-tx"><b>무료로 시작하기</b><small>비즈니스 · Free &amp; Beta</small></span></button>' +
        '<button type="button" class="cta-btn hb-big" onclick="hbNotice()">' + hbSvg('school') + '<span class="cta-tx"><b>도입 문의</b><small>기관용 · 준비 중</small></span></button></div>' +
      '</div>' +
    '</div></div></section>';
}
function hbBuildFoot(){
  var f = document.getElementById('hbFoot'); if(!f || f.children.length) return;
  f.innerHTML = '<div class="hb-foot-in"><div class="hb-foot-brand"><span class="ld-foot-brand"><span class="bm wm-mark" role="img" aria-hidden="true"></span>DureSync</span><span class="ld-foot-tag">함께 일하는 가장 오래된 방식, AI로 다시.</span></div>' +
    '<div class="hb-foot-cols">' +
      '<div><h4>비즈니스</h4><a href="/business" onclick="return hbLink(event, \'landing\')">비즈니스 소개</a><button type="button" onclick="hbAct(\'biz|ldFeatures\')">기능</button><button type="button" onclick="hbAct(\'biz|ldWho\')">대상별</button><button type="button" onclick="hbAct(\'hub|hbHow\')">시작하는 법</button></div>' +
      '<div><h4>기관용</h4><a href="/institution" onclick="return hbLink(event, \'institution\')">학교 · 교수용</a><button type="button" onclick="hbNotice()">도입 문의</button></div>' +
      '<div><h4>알아보기</h4><button type="button" onclick="hbAct(\'hub|hbPlans\')">구독 · 요금</button><button type="button" onclick="hbAct(\'hub|hbFaq\')">자주 묻는 질문</button></div>' +
    '</div></div>';
}

/* ---------- 기능 둘러보기 탭: 누르면 바뀌고, 가만히 두면 차례로 넘어간다 ---------- */
function hbFlatHtml(id, tabs, eyebrow, title, sub){
  return '<section class="ld-sec hb-flat" id="' + id + '" data-n="' + tabs.length + '"><div class="ld-wrap">' +
    '<span class="view-eyebrow ld-rv">' + eyebrow + '</span><h2 class="ld-h2 ld-rv" style="--d:.05s">' + title + '</h2><p class="ld-p ld-rv" style="--d:.1s">' + sub + '</p>' +
    '<div class="hb-show ld-rv" style="--d:.14s"><div class="hb-tabs" role="tablist" aria-label="' + eyebrow + '">' +
      tabs.map(function(t, i){ return '<button type="button" class="hb-tab hb-spot' + (i === 0 ? ' on' : '') + '" role="tab" aria-selected="' + (i === 0) + '" data-i="' + i + '">' + hbIco(t.ic, t.c) + '<span class="tx"><b>' + t.t + '</b><small>' + t.d + '</small></span><i class="prog"></i></button>'; }).join('') +
    '</div><div class="hb-pane">' + tabs.map(function(t, i){ return '<div class="hb-slide' + (i === 0 ? ' on' : '') + '" data-i="' + i + '" role="tabpanel">' + t.mock() + '</div>'; }).join('') + '<p class="hb-eg">화면은 예시예요</p></div></div>' +
  '</div></section>';
}
function hbStageHtml(id, tabs, eyebrow, title){
  return '<section class="hb-pinsec" id="' + id + '" style="--n:' + tabs.length + '"><div class="hb-stage-track" data-n="' + tabs.length + '"><div class="hb-stage-sticky">' +
    '<div class="hb-stage-copy"><span class="view-eyebrow">' + eyebrow + '</span><h2 class="ld-h2">' + title + '</h2>' +
      '<ol class="hb-steps-l">' + tabs.map(function(t, i){ return '<li class="hb-sl" data-i="' + i + '"><button type="button" onclick="hbStageGo(\'' + id + '\', ' + i + ')">' + hbIco(t.ic, t.c) + '<span class="tx"><b>' + t.t + '</b><small>' + t.d + '</small></span></button></li>'; }).join('') + '</ol>' +
    '</div>' +
    '<div class="hb-stage-art"><div class="hb-orb"><i class="ringd"></i>' + tabs.map(function(t, i){ return '<span class="n" data-i="' + i + '" style="--a:' + (i * 360 / tabs.length) + 'deg; --c:' + t.c + '">' + hbSvg(t.ic) + '</span>'; }).join('') + '</div>' +
      tabs.map(function(t, i){ return '<div class="hb-sw" data-i="' + i + '">' + t.mock() + '</div>'; }).join('') +
      '<p class="hb-eg">화면은 예시예요</p></div>' +
  '</div></div></section>';
}
function hbTabSet(root, i, user){
  if(!root) return;
  root.dataset.tab = String(i);
  Array.prototype.forEach.call(root.querySelectorAll('.hb-tab'), function(b, k){ var on = k === i; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); if(on){ b.classList.remove('run'); void b.offsetWidth; if(!user) b.classList.add('run'); } });
  Array.prototype.forEach.call(root.querySelectorAll('.hb-slide'), function(s, k){
    var on = k === i; s.classList.toggle('on', on);
    var hd = s.querySelector('.hd'); if(hd){ if(on) hdPlay(hd); else hdStop(hd); }          // 보일 때마다 그 화면의 장면이 처음부터 다시 움직인다
  });
}
function hbTabAuto(){
  clearInterval(HB.tabT);
  if(ldReduced()) return;
  HB.tabT = setInterval(function(){
    if(HB.tabHold) return;
    Array.prototype.forEach.call(document.querySelectorAll('.hb-flat'), function(root){
      if(root.offsetParent === null) return;
      var r = root.getBoundingClientRect(); if(r.bottom < 0 || r.top > innerHeight) return;        // 화면에 보일 때만
      hbTabSet(root, (parseInt(root.dataset.tab || '0', 10) + 1) % parseInt(root.dataset.n || '1', 10), false);
    });
  }, 7000);
}
function hbBindTabs(root){
  if(!root || root.dataset.bound) return; root.dataset.bound = '1';
  root.addEventListener('click', function(e){ var b = e.target.closest('.hb-tab'); if(!b) return; hbTabSet(root, parseInt(b.getAttribute('data-i'), 10), true); HB.tabHold = true; clearTimeout(HB.holdT); HB.holdT = setTimeout(function(){ HB.tabHold = false; }, 15000); });
  root.addEventListener('pointerenter', function(e){ if(e.pointerType === 'mouse') HB.tabHold = true; });
  root.addEventListener('pointerleave', function(e){ if(e.pointerType === 'mouse') HB.tabHold = false; });
  hbTabSet(root, 0, false); hbTabAuto();
}

/* ---------- 두레 이야기(단어가 밝아지는 문장) ---------- */
var HB_STORY = [['두레는 ', 0], ['마을 사람들이 힘을 모아 함께 일하던 ', 0], ['우리의 오래된 협동 방식', 1], ['이에요. 서로의 일이 곧 ', 0], ['우리의 일', 1], ['이 되는 그 마음을, ', 0], ['코딩 공간', 1], ['에 옮겨 왔어요.', 0]];
function hbWordsHtml(){
  var out = '', n = 0;
  HB_STORY.forEach(function(seg){ seg[0].split(' ').forEach(function(w){ if(!w) return; out += '<span class="hb-wd' + (seg[1] ? ' kw' : '') + '" data-n="' + (n++) + '">' + ldEsc(w) + '</span> '; }); });
  return out;
}
function hbWordsTick(view){
  Array.prototype.forEach.call((view || document).querySelectorAll('.hb-words'), function(el){
    var ws = el.querySelectorAll('.hb-wd'); if(!ws.length) return;
    var r = el.getBoundingClientRect(), vh = window.innerHeight;
    var p = ldReduced() ? 1 : Math.min(1, Math.max(0, (vh * 0.86 - r.top) / (vh * 0.52 + r.height * 0.4)));       // 문장이 화면 아래에서 올라와 가운데쯤 올 때까지
    var on = Math.round(p * ws.length);
    if(el.dataset.on === String(on)) return; el.dataset.on = String(on);
    Array.prototype.forEach.call(ws, function(w, i){ w.classList.toggle('on', i < on); });
  });
}

/* ---------- 이런 분들이 써요 (가로 카드 · 자동으로 넘어가고 멈출 수 있다) ---------- */
var HB_WHO = [
  ['sprout', '#22C55E', '코딩 입문자', '"에러 글이 무슨 말인지 모르겠어요"', '설치 없이 바로 코드를 실행하고, 에러가 나면 AI가 어디가 왜 틀렸는지 쉬운 한국어로 알려줘요.', ['설치 없이', 'AI 에러 설명', '한 줄씩 실행'], 'ldp-beginner'],
  ['laptop', '#3B82F6', '개인 개발자', '"혼자 만들어도 정리는 제대로 하고 싶어요"', '코드 작성 · 실행 · 디버그, 일정과 회의 메모까지 한곳에서. 나중에 팀원을 부르면 그대로 협업 공간이 돼요.', ['여러 언어', '디버거', '일정 · 메모'], 'ldp-solo'],
  ['cap', '#8B5CF6', '전공 무관 학생', '"전공은 아닌데 팀플에서 코딩을 맡게 됐어요"', '과제, 팀플, 공모전 준비까지. 비전공자도 따라갈 수 있게 단계마다 쉽게 안내해요.', ['팀플', '공모전', '쉬운 설명'], 'ldp-student'],
  ['rocket', '#F59E0B', '상업 · 창업 프로젝트', '"사이드 프로젝트를 서비스로 키우고 싶어요"', '팀 채팅, 음성 통화, 회의록, 일정을 하나의 워크스페이스에서. 회의록에서 일정은 AI가 찾아 캘린더에 넣어줘요.', ['팀 채팅', '통화방', '자동 일정'], 'ldp-biz'],
  ['board', '#EC4899', '선생님', '"학생들 코드를 같이 보면서 도와주고 싶어요"', '초대 링크 하나로 학생을 모으고, 같은 파일을 실시간으로 함께 보며 도와줄 수 있어요. 기초 에러는 AI가 먼저 설명해요.', ['초대 링크', '실시간 공동 편집', '에러 설명'], 'ldp-teacher'],
  ['school', '#06B6D4', '교육 목적', '"동아리 · 스터디 · 수업 팀이 함께 배울 곳이 필요해요"', '팀마다 프로젝트를 만들고, 커뮤니티에서 스터디와 팀원을 구해요. 함께 배우는 공간이 필요한 모든 곳에서 쓸 수 있어요.', ['스터디', '동아리', '수업'], 'ldp-edu']
];
/* opts: { id: 카드 묶음 id, ids: true 면 카드에 ldp-* id 를 붙인다(비즈니스 소개), go: false 면 '자세히 보기' 버튼을 뺀다 } */
function hbCarouselHtml(opts){
  opts = opts || {}; var id = opts.id || 'hbCar';
  return '<div class="hb-car" id="' + id + '"><div class="hb-car-track" tabindex="0" aria-label="이런 분들이 써요">' +
    HB_WHO.map(function(w){ return '<article class="hb-pc hb-spot"' + (opts.ids ? ' id="' + w[6] + '"' : '') + '>' + hbIco(w[0], w[1], true) + '<h3>' + w[2] + '</h3><p class="q">' + w[3] + '</p><p class="d">' + w[4] + '</p><div class="tg">' + w[5].map(function(t){ return '<span class="chip">' + t + '</span>'; }).join('') + '</div>' + (opts.go === false ? '' : '<button type="button" class="hb-pc-go" onclick="hbAct(\'biz|ldWho|' + w[6] + '\')">자세히 보기' + hbSvg('arrow') + '</button>') + '</article>'; }).join('') +
    '</div><div class="hb-car-ctl"><button type="button" class="hb-cb" onclick="hbCarMove(this, -1, true)" aria-label="이전">' + hbSvg('chev') + '</button><button type="button" class="hb-cb pp" onclick="hbCarToggle(this)" aria-label="자동 넘김 멈춤">' + hbSvg('close') + '</button><button type="button" class="hb-cb nx" onclick="hbCarMove(this, 1, true)" aria-label="다음">' + hbSvg('chev') + '</button></div></div>';
}
var HBC = { t: 0 };
function hbCarOf(x){ return x && x.closest ? x.closest('.hb-car') : x; }
function hbCarMove(x, dir, user){
  var car = hbCarOf(x); if(!car) return; var tr = car.querySelector('.hb-car-track'); if(!tr) return;
  var c = tr.querySelector('.hb-pc'); if(!c) return;
  var step = c.getBoundingClientRect().width + parseFloat(getComputedStyle(tr).columnGap || getComputedStyle(tr).gap || 16);
  var max = tr.scrollWidth - tr.clientWidth, x2 = tr.scrollLeft + dir * step;
  if(x2 > max + 4) x2 = 0; else if(x2 < -4) x2 = max;
  tr.scrollTo({ left: x2, behavior: ldReduced() ? 'auto' : 'smooth' });
  if(user) hbCarPause(car, true);
}
function hbCarPause(car, p){
  car.dataset.paused = p ? '1' : ''; var b = car.querySelector('.hb-cb.pp');
  if(b){ b.classList.toggle('is-paused', p); b.setAttribute('aria-label', p ? '자동 넘김 다시 켜기' : '자동 넘김 멈춤'); }
}
function hbCarToggle(btn){ var car = hbCarOf(btn); if(car) hbCarPause(car, !car.dataset.paused); }
function hbCarAuto(){
  clearInterval(HBC.t);
  if(ldReduced()){ Array.prototype.forEach.call(document.querySelectorAll('.hb-car'), function(c){ hbCarPause(c, true); }); return; }
  HBC.t = setInterval(function(){
    Array.prototype.forEach.call(document.querySelectorAll('.hb-car'), function(el){
      if(el.dataset.paused || el.offsetParent === null) return;
      var r = el.getBoundingClientRect(); if(r.bottom < 0 || r.top > innerHeight || el.matches(':hover') || el.contains(document.activeElement)) return;
      hbCarMove(el, 1, false);
    });
  }, 4200);
}

/* ---------- 고정 무대: 스크롤하는 동안 화면들이 겹겹이 앞으로 나온다 ---------- */
function hbStageGo(id, i){
  var tr = document.querySelector('#' + id + ' .hb-stage-track'); if(!tr) return;
  var top = tr.getBoundingClientRect().top + window.pageYOffset, total = tr.offsetHeight - tr.querySelector('.hb-stage-sticky').offsetHeight, n = parseInt(tr.dataset.n || '1', 10);
  window.scrollTo({ top: top + total * (i / Math.max(1, n - 1)) + 2, behavior: ldReduced() ? 'auto' : 'smooth' });
}
function hbStageTick(view){
  Array.prototype.forEach.call(view.querySelectorAll('.hb-stage-track'), function(track){
    if(track.offsetParent === null) return;
    var sticky = track.querySelector('.hb-stage-sticky'), r = track.getBoundingClientRect(), n = parseInt(track.dataset.n || '1', 10);
    var total = Math.max(1, track.offsetHeight - sticky.offsetHeight), p = Math.min(1, Math.max(0, -r.top / total)), t = p * (n - 1);
    var key = t.toFixed(3); if(track.dataset.k === key) return; track.dataset.k = key;
    Array.prototype.forEach.call(track.querySelectorAll('.hb-sw'), function(el){
      var off = parseFloat(el.getAttribute('data-i')) - t, k = Math.abs(off), x, y, s, o, b, rot;
      if(off >= 0){ x = 56 * off; y = -32 * off; s = 1 - 0.08 * off; o = Math.max(0, 1 - 0.46 * off); b = 1.6 * off; rot = 3 * off; }
      else { x = 130 * off; y = -off * 60; s = 1 - off * 0.05; o = Math.max(0, 1 + off * 1.7); b = -off * 3; rot = off * 4; }
      el.style.setProperty('--tx', x.toFixed(1) + 'px'); el.style.setProperty('--ty', y.toFixed(1) + 'px'); el.style.setProperty('--s', s.toFixed(3)); el.style.opacity = o.toFixed(3);
      el.style.setProperty('--b', b.toFixed(2) + 'px'); el.style.setProperty('--r', rot.toFixed(2) + 'deg'); el.style.zIndex = String(100 - Math.round(k * 10)); el.style.pointerEvents = k < 0.5 ? 'auto' : 'none';
      var now = k < 0.5, was = el.classList.contains('cur'); el.classList.toggle('cur', now);
      var hd = el.querySelector('.hd'); if(hd && now !== was){ if(now) hdPlay(hd); else hdStop(hd); }          // 앞으로 나온 화면의 장면이 처음부터 움직인다
    });
    var cur = Math.round(t);
    Array.prototype.forEach.call(track.querySelectorAll('.hb-sl'), function(li){ li.classList.toggle('on', parseInt(li.getAttribute('data-i'), 10) === cur); });
    var orb = track.querySelector('.hb-orb'); if(orb){ orb.style.setProperty('--sp', t.toFixed(3)); Array.prototype.forEach.call(orb.querySelectorAll('.n'), function(nd){ nd.classList.toggle('on', parseInt(nd.getAttribute('data-i'), 10) === cur); }); }
    track.style.setProperty('--sprog', p.toFixed(3));
  });
}
function hbFinTick(view){
  var fin = (view || document).querySelector('.hb-fin-track'); if(!fin) return;
  var st = fin.querySelector('.hb-fin-sticky'), r = fin.getBoundingClientRect(), total = Math.max(1, fin.offsetHeight - st.offsetHeight);
  var p = fin.offsetHeight <= st.offsetHeight + 4 ? 1 : Math.min(1, Math.max(0, -r.top / total));
  var key = p.toFixed(3); if(fin.dataset.k === key) return; fin.dataset.k = key; fin.style.setProperty('--fp', key);
}

/* ---------- 스크롤·마우스를 따라 움직이는 것들 (두레 안내 · 배경 · 제품 그림 기울기 · 카드 빛) ---------- */
var HB_FX = {};
var HB_SECS = [['hbHero', '처음'], ['hbStory', '두레 이야기'], ['hbCats', '두 가지 모델'], [['hbShow', 'hbShowFlat'], '기능 둘러보기'], ['hbWho', '이런 분들이'], ['hbHow', '시작하는 법'], ['hbPlans', '구독 · 요금'], ['hbFaq', '자주 묻는 질문'], ['hbFin', '시작하기']];
HB_FX.hub = { guide: 'hbGuide', tip: 'hbGuideTip', secs: HB_SECS };
function hbSecEl(sc){ var ids = [].concat(sc[0]); for(var i = 0; i < ids.length; i++){ var el = document.getElementById(ids[i]); if(el && el.offsetParent !== null) return el; } return null; }
var HBF = { on: false, raf: 0, last: 0, tiltT: 0, cur: 0 };
function hbFxTick(){
  HBF.raf = 0;
  var hub = document.querySelector('#hub.active, #institution.active'); if(!hub) return;
  var cfg = HB_FX[hub.id] || {};
  var y = window.pageYOffset || 0, vh = window.innerHeight, max = Math.max(1, document.documentElement.scrollHeight - vh);
  hub.style.setProperty('--p', Math.min(1, Math.max(0, y / max)).toFixed(4));          // 스크롤 진행도 (두레 안내의 둘레 선)
  hub.style.setProperty('--sy', Math.round(y));                                        // 배경이 천천히 따라 움직이는 양
  var pin = !ldReduced() && window.innerWidth > 1000; hub.classList.toggle('hb-pin', pin);
  if(pin){ hbStageTick(hub); hbFinTick(hub); } else { var fin = hub.querySelector('.hb-fin-track'); if(fin) fin.style.setProperty('--fp', 1); }
  hbWordsTick(hub);
  var dy = y - HBF.last; HBF.last = y;
  var g = cfg.guide ? document.getElementById(cfg.guide) : null, SECS = cfg.secs || [];
  if(g){
    var tilt = Math.max(-16, Math.min(16, dy * 0.7)); g.style.setProperty('--tilt', tilt.toFixed(1) + 'deg');       // 스크롤 방향으로 살짝 기운다
    clearTimeout(HBF.tiltT); HBF.tiltT = setTimeout(function(){ g.style.setProperty('--tilt', '0deg'); }, 140);
    var cur = 0, probe = y + vh * 0.35;
    SECS.forEach(function(sc, i){ var el = hbSecEl(sc); if(el && el.getBoundingClientRect().top + y <= probe) cur = i; });
    if(cur !== HBF.cur || !g.dataset.t){ HBF.cur = cur; g.dataset.t = '1'; var tip = document.getElementById(cfg.tip); if(tip){ var nx = SECS[cur + 1]; tip.textContent = nx ? '다음: ' + nx[1] : '맨 위로'; } g.classList.add('nudge'); setTimeout(function(){ g.classList.remove('nudge'); }, 900); }
    g.classList.toggle('show', y > vh * 0.5);                                         // 첫 화면 맨 위에서는 숨겨 둔다
  }
}
function hbFxSchedule(){ if(!HBF.raf) HBF.raf = requestAnimationFrame(hbFxTick); }
function hbGuideNext(){
  var hub = document.querySelector('#hub.active'); var cfg = hub && HB_FX[hub.id]; if(!cfg) return;
  var nx = (cfg.secs || [])[HBF.cur + 1], el = nx && hbSecEl(nx);
  if(el) hbScroll(el.id); else hbTop();
}
function hbFxBind(){
  if(HBF.on) return; HBF.on = true;
  window.addEventListener('scroll', hbFxSchedule, { passive: true }); window.addEventListener('resize', hbFxSchedule);
  ['hub', 'institution'].forEach(function(id){
    var view = document.getElementById(id); if(!view) return;
    // 제품 그림: 마우스 쪽으로 살짝 기운다 (움직임 줄이기를 고른 사람·터치 화면은 제외)
    view.addEventListener('pointermove', function(e){
      if(ldReduced() || e.pointerType !== 'mouse') return;
      var art = e.target.closest && e.target.closest('.hb-art'); var t = art && art.querySelector('.hb-tilt');
      if(art && t){ var r = art.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, yy = (e.clientY - r.top) / r.height - 0.5; t.style.setProperty('--ry', (-yy * 7).toFixed(2) + 'deg'); t.style.setProperty('--rx', (x * 9).toFixed(2) + 'deg'); }
      var sp = e.target.closest && e.target.closest('.hb-spot');
      if(sp){ var b = sp.getBoundingClientRect(); sp.style.setProperty('--mx', Math.round(e.clientX - b.left) + 'px'); sp.style.setProperty('--my', Math.round(e.clientY - b.top) + 'px'); }
    });
    view.addEventListener('pointerleave', function(){ var t = view.querySelector('.hb-tilt'); if(t){ t.style.setProperty('--ry', '0deg'); t.style.setProperty('--rx', '0deg'); } });
  });
}

/* ---------- 화면이 열릴 때 (goView('hub' | 'institution')) ---------- */
function hbEnter(view){
  var root = document.getElementById(view === 'institution' ? 'institution' : 'hub'); if(!root) return;
  document.documentElement.removeAttribute('data-route');
  window.scrollTo(0, 0);
  HB.ctx = view === 'institution' ? HB_CTX.inst : HB_CTX.hub;
  if(view === 'institution'){ inBuild(); hdWatch(document.getElementById('inMain')); hbFxBind(); HBF.last = 0; hbFxSchedule(); }
  else { hbBuildMenu(); hbBuildHub(); hbBuildFoot(); hbBindTabs(document.getElementById('hbShowFlat')); hdWatch(document.getElementById('hbMain')); hbFxBind(); hbCarAuto(); HBF.last = 0; hbFxSchedule(); }
  hbCloseMenus(); hbThemeIcon(); hbLoginState();
  if(!HB.bound){ HB.bound = true; window.addEventListener('scroll', function(){ ['hbNav', 'inNav'].forEach(function(id){ var n = document.getElementById(id); if(n) n.classList.toggle('scrolled', (window.pageYOffset || 0) > 12); }); }, { passive: true }); }
  var hero = root.querySelector('.hb-hero'); if(hero){ hero.classList.remove('ld-intro'); void hero.offsetWidth; hero.classList.add('ld-intro'); }
  var items = root.querySelectorAll('.ld-rv');
  if(ldReduced() || !('IntersectionObserver' in window)){ root.classList.remove('ld-anim'); return; }
  if(HB.io) HB.io.disconnect();
  root.classList.add('ld-anim');
  items.forEach(function(el){ el.classList.remove('in'); });
  HB.io = new IntersectionObserver(function(entries){ entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); HB.io.unobserve(e.target); } }); }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  requestAnimationFrame(function(){ items.forEach(function(el){ HB.io.observe(el); }); });
}

/* ---------- 이동 · 버튼 ---------- */
/* 같은 앱 안에서 부드럽게 이동하고 주소(/business 등)도 바꾼다. 새 탭·Ctrl/⌘ 클릭은 브라우저 기본 동작 그대로 */
function hbLink(e, view, anchor){
  if(e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return true;
  if(e && e.preventDefault) e.preventDefault();
  goView(view);
  if(anchor && view === 'landing'){ setTimeout(function(){ if(typeof ldGo === 'function') ldGo('ldWho', anchor); }, 160); }
  return false;
}
function hbStartBusiness(){ hbCloseSub(); goView('landing'); }
function hbTop(){ window.scrollTo({ top: 0, behavior: ldReduced() ? 'auto' : 'smooth' }); }
function hbScroll(id){
  var el = document.getElementById(id);
  if(el && el.offsetParent === null){ var alt = document.getElementById(/Flat$/.test(id) ? id.replace(/Flat$/, '') : id + 'Flat'); if(alt && alt.offsetParent !== null) el = alt; }       // 고정 무대와 탭 중 지금 보이는 쪽으로
  if(!el) return;
  var nav = document.querySelector('#hub.active .ld-nav, #institution.active .ld-nav'), off = (nav ? nav.offsetHeight : 64) + 8;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - off, behavior: ldReduced() ? 'auto' : 'smooth' });
}
function hbLoginClick(){ if(authToken) goView('home'); else openLogin(); }
function hbLoginState(){
  var b = document.getElementById('hbLogin'); if(b) b.textContent = authToken ? '앱 열기' : '로그인';
  var s = document.getElementById('hbStart'); if(s) s.hidden = !!authToken;
  var q = document.getElementById('hbInquiry'); if(q) q.hidden = !!authToken && false;
}
function hbThemeIcon(){
  var dark = (typeof isDarkMode === 'function') && isDarkMode();
  ['hbTheme', 'inTheme'].forEach(function(id){
    var b = document.getElementById(id); if(!b) return;
    b.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-' + (dark ? 'sun' : 'moon') + '"/></svg>';
    b.title = dark ? '라이트 모드로' : '다크 모드로';
  });
}

/* ---------- 구독창 (더미) · 개발 중 안내 ---------- */
function hbOpenSub(){
  var box = document.getElementById('hbSubPlans'), m = document.getElementById('hbSubModal'); if(!box || !m) return;
  box.innerHTML = hbPlansHtml(); m.classList.add('open');
  var b = box.querySelector('button'); if(b) b.focus();
}
function hbCloseSub(){ var m = document.getElementById('hbSubModal'); if(m) m.classList.remove('open'); }
function hbNotice(){
  hbCloseSub(); hbCloseMenus();
  var m = document.getElementById('hbNotice'); if(!m) return; m.classList.add('open');
  var b = m.querySelector('button'); if(b) b.focus();
}
function hbCloseNotice(){ var m = document.getElementById('hbNotice'); if(m) m.classList.remove('open'); }
document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ hbCloseNotice(); hbCloseSub(); } });
document.addEventListener('themechange', hbThemeIcon);
try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change', hbThemeIcon); }catch(e){}
