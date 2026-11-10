/* ---- community ---- */
/* ---- 커뮤니티 ----
   OKKY·DEV·GeekNews·디스콰이엇·인프런을 비교해 가져온 구조: 용도별 분류, 최신/인기/댓글순, 태그, 질문 채택, 팀원 모집(지원→수락→프로젝트 합류) */
/* ---- 아이콘: 이모티콘 대신 서비스 전체와 같은 선 아이콘(SVG)을 쓴다 ---- */
var CM_ICON = {
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6"/><path d="M12 17h.01"/>',
  users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M17 8v6M14 11h6"/>',
  book:'<path d="M12 6c-1.6-1.2-3.8-2-6.5-2H3v14h2.5c2.7 0 4.9.8 6.5 2 1.6-1.2 3.8-2 6.5-2H21V4h-2.5C15.8 4 13.6 4.8 12 6z"/><path d="M12 6v14"/>',
  star:'<path d="M12 3l2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8L6.7 19.7l1-6L3.3 9.4l6-.9z"/>',
  bulb:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  chat:'<path d="M21 12a8 8 0 0 1-11.7 7.1L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
  grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  pencil:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  flame:'<path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.5.6-2.5 1.5-3.5.2 1 .8 1.5 1.5 1.5C11 7 11 5 12 3z"/>',
  trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  pin:'<path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3z"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  folder:'<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M9 21h6M10 17h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn:'<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'
};
function cmIc(name, size, fill){
  return '<svg class="cm-i" viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) + '" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (CM_ICON[name] || '') + '</svg>';
}
var CM_CATS = {
  question: {label:'질문·과제 도움', short:'질문', ic:'help', color:'#3B82F6', sub:'과제·코드가 막혔을 때',
    hint:'막힌 문제를 구체적으로 적을수록 좋은 답변을 받아요. 에러 메시지, 시도해 본 방법, 사용한 환경을 함께 적어 주세요.', titlePh:'예) 파이썬 for문에서 IndexError가 나요',
    tags:['Python','Java','JavaScript','C/C++','알고리즘','오류해결','과제'],
    tpl:'## 어떤 과제/프로젝트인가요?\n- 과목·프로젝트:\n- 하려던 것:\n\n## 실제로 일어난 일\n- 에러 메시지 / 결과:\n\n```\n(에러 메시지나 코드를 여기에)\n```\n\n## 시도해 본 것\n- \n\n## 환경\n- 언어·버전 / 운영체제:\n'},
  recruit:  {label:'팀원 구하기', short:'팀원', ic:'users', color:'#8B5CF6', sub:'공모전·해커톤·팀플·졸업작품',
    hint:'지원을 수락하면 곧바로 내 프로젝트의 팀원이 돼요.', titlePh:'예) ○○ 공모전 같이 나갈 백엔드·디자이너 구해요',
    tags:['공모전','해커톤','팀프로젝트','캡스톤','졸업작품','사이드프로젝트'],
    tpl:'## 어떤 프로젝트인가요?\n- 대회·과목: (예: ○○ 공모전, 캡스톤디자인)\n- 만들 것:\n\n## 이런 분을 찾아요\n- 필요한 역할·기술:\n- 이런 분이면 좋아요:\n\n## 진행 방식\n- 기간·마감:\n- 모임: 온라인 / 오프라인, 주 ○회\n\n## 지원 방법\n- [지원하기]를 누르고 간단한 소개와 가능한 시간을 남겨 주세요.\n'},
  study:    {label:'스터디 모집', short:'스터디', ic:'book', color:'#F59E0B', sub:'코테·자격증·과제 같이 할 사람',
    hint:'같이 공부할 주제, 인원, 시간대를 적어 주세요. 댓글로 신청을 받고 연락 방법을 정하면 돼요.', titlePh:'예) 코딩테스트 주 2회 온라인 스터디 (4명)',
    tags:['코딩테스트','알고리즘','CS','자격증','과제','온라인','오프라인'],
    tpl:'## 무엇을 같이 할까요?\n- 주제: (예: 코딩테스트, CS 면접, 정보처리기사)\n- 목표:\n\n## 방식\n- 인원:\n- 기간:\n- 요일·시간:\n- 온라인 / 오프라인:\n\n## 이런 분이면 좋아요\n- \n\n## 신청 방법\n- 댓글로 간단한 소개와 가능한 시간을 남겨 주세요.\n'},
  showcase: {label:'결과물·피드백', short:'결과물', ic:'star', color:'#EC4899', sub:'만든 걸 보여주고 의견 받기',
    hint:'만든 것의 소개, 사용한 기술, 배운 점을 공유하고 받고 싶은 피드백을 적어 보세요. 포트폴리오에 도움이 돼요.', titlePh:'예) 팀 일정 관리 웹앱을 만들었어요 — 피드백 부탁드려요',
    tags:['포트폴리오','피드백','웹','앱','AI','캡스톤'],
    tpl:'## 무엇을 만들었나요?\n- 한 줄 소개:\n- 데모·GitHub 링크:\n\n## 사용한 기술\n- \n\n## 어려웠던 점 / 배운 점\n- \n\n## 피드백 받고 싶은 점\n- \n'},
  share:    {label:'정보·후기', short:'정보', ic:'bulb', color:'#10B981', sub:'공모전 후기·팁·도구 추천',
    hint:'공모전·해커톤 후기, 과제·시험 팁, 쓸 만한 도구를 나눠 주세요. 코드는 ``` 로 감싸면 보기 좋아요.', titlePh:'예) 첫 해커톤 후기 — 준비하면서 도움 된 것들',
    tags:['공모전후기','해커톤후기','취업','자격증','꿀팁','도구추천'],
    tpl:'## 한 줄 요약\n\n## 자세한 내용\n\n## 이런 분께 도움이 돼요\n- \n'},
  free:     {label:'자유', short:'자유', ic:'chat', color:'#64748B', sub:'가볍게 이야기해요',
    hint:'가볍게 이야기해요. 서로 존중하고 광고·개인정보는 올리지 않아요.', titlePh:'제목을 입력하세요', tags:['잡담','진로','고민'], tpl:''}
};
/* ---- 분류별 글쓰기 양식 ----
   select: 고르는 항목. '라벨|태그' 로 쓰면 그 태그가 자동으로 붙는다. 마지막에 '기타 (직접 입력)' 이 자동으로 들어가고, 고르면 입력칸이 나타난다.
   text: 직접 적는 한 줄 항목(선택). 글을 올릴 때 본문 맨 위에 '- **항목**: 값' 으로 정리돼 들어간다. */
CM_CATS.question.detailPh = '막힌 부분을 자세히 적어 주세요.\n\n- 하려던 것:\n- 실제로 일어난 일 / 에러 메시지:\n- 시도해 본 것:\n\n코드는 ``` 로 감싸면 보기 좋아요.';
CM_CATS.question.fields = [
  {key:'field', label:'분야', type:'select', tag:true, opts:['Python','Java','JavaScript·웹|JavaScript','C·C++|C++','알고리즘·코딩테스트|알고리즘','데이터베이스|DB','앱 개발|앱','AI·데이터|AI']},
  {key:'kind', label:'질문 유형', type:'select', opts:['에러·오류 해결','코드 리뷰·개선','개념 이해','과제 방향 잡기','환경 설정']},
  {key:'when', label:'답변이 필요한 시점', type:'select', opts:['오늘 안에','이번 주 안에','여유 있어요']},
  {key:'subject', label:'과목·프로젝트 이름', type:'text', ph:'예) 자료구조 과제 3, 캡스톤디자인'}
];
CM_CATS.recruit.detailPh = '프로젝트를 소개해 주세요.\n\n- 만들 것:\n- 이런 분이면 좋아요:\n- 지원 방법: [지원하기]를 누르고 간단한 소개와 가능한 시간을 남겨 주세요.';
CM_CATS.recruit.fields = [
  {key:'goal', label:'모집 목적', type:'select', tag:true, opts:['공모전','해커톤','팀 프로젝트(수업)|팀플','캡스톤·졸업작품|캡스톤','사이드 프로젝트|사이드프로젝트']},
  {key:'event', label:'대회·과목 이름', type:'text', ph:'예) ○○ 대학생 앱 공모전'},
  {key:'mode', label:'진행 방식', type:'select', opts:['온라인','오프라인','온·오프라인 병행']},
  {key:'freq', label:'모임 빈도', type:'select', opts:['주 1회','주 2회','주 3회 이상','메신저로 수시 소통']},
  {key:'period', label:'프로젝트 기간', type:'select', opts:['2주 이내','1개월','2~3개월','한 학기','기간은 협의']}
];
CM_CATS.study.detailPh = '스터디를 소개해 주세요.\n\n- 목표·커리큘럼:\n- 이런 분이면 좋아요:\n- 신청 방법: 댓글로 간단한 소개와 가능한 시간을 남겨 주세요.';
CM_CATS.study.fields = [
  {key:'topic', label:'스터디 주제', type:'select', tag:true, opts:['코딩테스트·알고리즘|코딩테스트','CS 기초|CS','자격증','웹·앱 개발 공부|개발공부','어학·면접|면접','과제·팀플 준비|과제']},
  {key:'mode', label:'진행 방식', type:'select', opts:['온라인','오프라인','온·오프라인 병행']},
  {key:'size', label:'모집 인원', type:'select', opts:['2명','3명','4명','5~6명','7명 이상']},
  {key:'time', label:'요일·시간대', type:'select', opts:['평일 낮','평일 저녁','주말','새벽·심야','시간은 협의']},
  {key:'freq', label:'모임 빈도', type:'select', opts:['주 1회','주 2회','주 3회 이상']}
];
CM_CATS.showcase.detailPh = '만든 것을 소개해 주세요.\n\n- 한 줄 소개:\n- 사용한 기술:\n- 어려웠던 점 / 배운 점:\n- 특히 봐 주셨으면 하는 부분:';
CM_CATS.showcase.fields = [
  {key:'type', label:'프로젝트 종류', type:'select', tag:true, opts:['웹 서비스|웹','모바일 앱|앱','AI·데이터|AI','게임','알고리즘·도구|도구']},
  {key:'stage', label:'진행 상황', type:'select', opts:['아이디어 단계','개발 중','완성(배포 전)','배포 완료']},
  {key:'want', label:'받고 싶은 피드백', type:'select', opts:['UI·UX','기능 아이디어','코드 구조','성능·보안','소개·발표 방식']},
  {key:'link', label:'데모·GitHub 링크', type:'text', ph:'https://…'}
];
CM_CATS.share.detailPh = '나누고 싶은 내용을 적어 주세요.\n\n- 한 줄 요약:\n- 자세한 내용:\n- 이런 분께 도움이 돼요:';
CM_CATS.share.fields = [
  {key:'kind', label:'글 종류', type:'select', tag:true, opts:['공모전 후기|공모전후기','해커톤 후기|해커톤후기','과제·시험 팁|꿀팁','도구·라이브러리 추천|도구추천','취업·진로|취업','자격증']},
  {key:'who', label:'이런 분께', type:'select', opts:['입문자','1~2학년','3~4학년','누구나']}
];
CM_CATS.free.fields = [];
CM_CATS.free.detailPh = '';

var CM_ROLE_SUGGEST = ['프론트엔드', '백엔드', '디자이너', '기획', 'AI/ML', '앱 개발', '데이터 분석', '발표/PM'];
var cm = {cat:'all', sort:'latest', q:'', tag:'', view:'', openOnly:false, items:[], offset:0, total:0, hasMore:false, seq:0, side:null, entered:false, post:null, searchTimer:null};
var cmEd = {mode:'new', id:null, cat:'question', tags:[], roles:[], event:null, preview:false, busy:false, project:null};

async function cmFetch(path, opts){
  opts = opts || {};
  var headers = Object.assign(opts.body ? {'Content-Type':'application/json'} : {}, opts.headers || {});
  if(authToken && calApiMode) headers['Authorization'] = 'Bearer ' + authToken;
  var r = await fetch(API_BASE + path, Object.assign({}, opts, {headers:headers}));
  if(!r.ok){
    var b = await r.json().catch(function(){ return {}; });
    var e = new Error(typeof b.detail === 'string' ? b.detail : '요청에 실패했어요 (' + r.status + ')'); e.status = r.status;
    if(r.status === 401 && authToken && calApiMode) expireSession();
    throw e;
  }
  return r.status === 204 ? null : r.json();
}
function cmNeedLogin(msg){
  if(calApiMode && authToken) return false;
  pushToast('🔒', '로그인 후 이용할 수 있어요', msg || '글쓰기·댓글·좋아요는 로그인이 필요해요');
  return true;
}
function cmErr(e){ if(e.status !== 401) pushToast('⚠️', '처리하지 못했어요', e.message); }
function cmAgo(iso){ if(!iso) return ''; var t = evtRel(iso); return t === '곧' ? '방금' : t; }
function cmAvatar(name, size){ var n = name || '?'; return '<span class="cm-av" style="background:' + chatColor(n) + (size ? ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * .42) + 'px' : '') + '">' + escapeHtml(String(n).slice(0, 1)) + '</span>'; }

/* ---------- 목록 ---------- */
function cmEnter(){
  var hasToken = calApiMode && authToken;
  ['cmChipSaved', 'cmChipMine'].forEach(function(id){ document.getElementById(id).hidden = !hasToken; });
  if(!hasToken && cm.view){ cm.view = ''; }
  cmLoad(true); cmLoadSide();
}
async function cmLoad(reset){
  var feed = document.getElementById('cmFeed'); if(!feed) return;
  if(reset){ cm.offset = 0; cm.items = []; if(!cm.entered) feed.innerHTML = '<div class="evt-skel" style="height:110px"></div><div class="evt-skel" style="height:110px"></div><div class="evt-skel" style="height:110px"></div>'; }
  var my = ++cm.seq;
  var qs = new URLSearchParams({sort:cm.sort, limit:'20', offset:String(cm.offset)});
  if(cm.cat !== 'all') qs.set('category', cm.cat);
  if(cm.q) qs.set('q', cm.q);
  if(cm.tag) qs.set('tag', cm.tag);
  if(cm.view === 'saved') qs.set('saved', 'true');
  if(cm.view === 'mine') qs.set('mine', 'true');
  if(cm.openOnly && cm.cat === 'recruit') qs.set('open_only', 'true');
  try {
    var d = await cmFetch('/api/community/posts?' + qs.toString());
    if(my !== cm.seq) return;
    cm.items = reset ? d.items : cm.items.concat(d.items);
    cm.offset = cm.items.length; cm.total = d.total; cm.hasMore = d.has_more; cm.entered = true;
    cmRenderFeed(); cmRenderActive();
  } catch(e){
    if(my !== cm.seq) return;
    feed.innerHTML = '<div class="cm-empty">' + cmIc('warn', 18) + ' ' + escapeHtml(e.message || '불러오지 못했어요') + '<br><button class="btn ghost" style="margin-top:10px" onclick="cmLoad(true)">다시 시도</button></div>';
  }
}
function cmCardHtml(p, i){
  var cat = CM_CATS[p.category] || CM_CATS.free;
  var h = '<div class="cm-card card' + (p.is_pinned ? ' pinned' : '') + '" style="--i:' + Math.min(i, 12) + ';--cc:' + cat.color + '" onclick="cmOpenPost(' + p.id + ')">';
  h += '<div class="cm-meta"><span class="cm-cat" style="--cc:' + cat.color + '">' + cmIc(cat.ic, 13) + ' ' + escapeHtml(cat.label) + '</span>';
  if(p.is_pinned) h += '<span class="cm-st">' + cmIc('pin', 12) + ' 고정</span>';
  if(p.category === 'question') h += p.solved ? '<span class="cm-st solved">' + cmIc('check', 12) + ' 해결됨</span>' : '';
  if(p.category === 'recruit' && p.recruit){
    var r = p.recruit;
    h += r.open ? '<span class="cm-st open">모집중' + (r.d_day && r.d_day !== '마감' ? ' · ' + escapeHtml(r.d_day) : '') + '</span>' : '<span class="cm-st closed">마감</span>';
  }
  if(p.is_new && !p.is_pinned) h += '<span class="new-badge">NEW</span>';
  h += '</div>';
  h += '<div class="cm-title">' + escapeHtml(p.title) + (p.comment_count ? '<span class="cm-cc">[' + p.comment_count + ']</span>' : '') + '</div>';
  if(p.preview) h += '<div class="cm-prev">' + escapeHtml(p.preview) + '</div>';
  if(p.category === 'recruit' && p.recruit){
    h += '<div class="cm-roles">' + p.recruit.roles.slice(0, 4).map(function(x){ return '<span class="cm-role">' + escapeHtml(x) + '</span>'; }).join('') +
      '<span class="cm-slots">모집 <b>' + p.recruit.accepted + '/' + p.recruit.slots + '</b>명</span>' + (p.project ? '<span class="cm-proj">' + cmIc('folder', 13) + ' ' + escapeHtml(p.project.title) + '</span>' : '') + '</div>';
  } else if(p.category === 'showcase' && p.project){
    h += '<div class="cm-roles"><span class="cm-proj">' + cmIc('folder', 13) + ' ' + escapeHtml(p.project.title) + ' · 팀원 ' + p.project.members + '명</span></div>';
  }
  if(p.event) h += '<div class="cm-roles"><span class="cm-proj">' + cmIc('trophy', 13) + ' ' + escapeHtml(p.event.title.slice(0, 40)) + '</span></div>';
  if(p.tags.length) h += '<div class="cm-tags">' + p.tags.map(function(t){ return '<span class="cm-tag" onclick="event.stopPropagation();cmSetTag(\'' + escapeHtml(t).replace(/'/g, '') + '\')">#' + escapeHtml(t) + '</span>'; }).join('') + '</div>';
  h += '<div class="cm-foot"><span class="who">' + cmAvatar(p.author.name) + '<b>' + escapeHtml(p.author.name) + '</b>' + (p.author.official ? '<span class="cm-badge author">운영</span>' : '') + '<span>· ' + escapeHtml(cmAgo(p.created_at)) + '</span></span>';
  h += '<span class="cm-counts"><span class="' + (p.liked ? 'on' : '') + '">' + cmIc('heart', 14, p.liked) + ' ' + p.like_count + '</span><span>' + cmIc('chat', 14) + ' ' + p.comment_count + '</span><span class="' + (p.bookmarked ? 'on' : '') + '">' + cmIc('bookmark', 14, p.bookmarked) + ' ' + p.bookmark_count + '</span></span></div></div>';
  return h;
}
function cmRenderFeed(){
  var feed = document.getElementById('cmFeed');
  if(!cm.items.length){
    var msg;
    if(cm.view === 'saved') msg = '저장한 글이 없어요.<br>글의 [저장] 버튼을 눌러 모아 보세요.';
    else if(cm.view === 'mine') msg = '아직 쓴 글이 없어요.';
    else if(cm.q || cm.tag) msg = '조건에 맞는 글이 없어요.';
    else if(cm.cat === 'recruit') msg = '아직 팀원 구하는 글이 없어요.<br>공모전·해커톤·팀플 팀원을 찾는 첫 글을 올려 보세요!';
    else if(cm.cat === 'question') msg = '아직 질문이 없어요.<br>막힌 과제나 코드가 있다면 가장 먼저 물어보세요.';
    else if(cm.cat === 'study') msg = '아직 스터디 모집 글이 없어요.<br>코딩테스트·자격증·과제 같이 할 사람을 찾아 보세요!';
    else if(cm.cat === 'showcase') msg = '아직 올라온 결과물이 없어요.<br>만든 걸 보여주고 피드백을 받아 보세요.';
    else msg = '아직 글이 없어요. 첫 글을 남겨 보세요!';
    feed.innerHTML = '<div class="cm-empty">' + msg + '<br><button class="btn primary" style="margin-top:12px" onclick="cmOpenEditor(' + (cm.cat !== 'all' ? "{cat:'" + cm.cat + "'}" : '') + ')">' + cmIc('pencil', 14) + ' 글쓰기</button></div>';
  } else {
    feed.innerHTML = cm.items.map(cmCardHtml).join('');
  }
  document.getElementById('cmMore').hidden = !cm.hasMore;
}
function cmRenderActive(){
  var box = document.getElementById('cmActive'), parts = [];
  if(cm.tag) parts.push('<button class="cm-chip on" onclick="cmSetTag(\'\')">#' + escapeHtml(cm.tag) + ' ✕</button>');
  if(cm.q) parts.push('<span>“' + escapeHtml(cm.q) + '” 검색 결과 ' + cm.total + '건</span>');
  box.hidden = !parts.length; box.innerHTML = parts.join(' ');
  document.getElementById('cmChipOpen').hidden = cm.cat !== 'recruit';
  document.getElementById('cmChipOpen').classList.toggle('on', cm.openOnly);
  document.getElementById('cmChipSaved').classList.toggle('on', cm.view === 'saved');
  document.getElementById('cmChipMine').classList.toggle('on', cm.view === 'mine');
}
function cmSetCat(cat){
  cm.cat = cat; if(cat !== 'recruit') cm.openOnly = false;
  document.querySelectorAll('#cmTabs button').forEach(function(b){ b.classList.toggle('active', b.dataset.cat === cat); });
  cmLoad(true);
}
function cmSetSort(v){ cm.sort = v; cmLoad(true); }
function cmSetTag(t){ cm.tag = t; cmLoad(true); }
function cmToggleOpen(){ cm.openOnly = !cm.openOnly; cmLoad(true); }
function cmSetView(v){ cm.view = (cm.view === v) ? '' : v; cmLoad(true); }
function cmOnSearch(){ clearTimeout(cm.searchTimer); cm.searchTimer = setTimeout(function(){ cm.q = document.getElementById('cmSearch').value.trim(); cmLoad(true); }, 300); }

async function cmLoadSide(){
  var box = document.getElementById('cmSide'); if(!box) return;
  try {
    var d = await cmFetch('/api/community/sidebar'); cm.side = d;
    var h = '';
    h += '<div class="cm-box card"><h5>' + cmIc('flame', 16) + ' 인기 태그</h5>' + (d.tags.length ? '<div class="cm-tagcloud">' + d.tags.map(function(t){ return '<button onclick="cmSetTag(\'' + escapeHtml(t.tag).replace(/'/g, '') + '\')">#' + escapeHtml(t.tag) + ' <small>' + t.count + '</small></button>'; }).join('') + '</div>' : '<div class="cm-side-empty">글에 태그를 달면 여기에 모여요</div>') + '</div>';
    h += '<div class="cm-box card"><h5>' + cmIc('trend', 16) + ' 이번 주 인기글</h5>' + (d.hot.length ? d.hot.map(function(p){ return '<div class="cm-mini" onclick="cmOpenPost(' + p.id + ')"><b>' + escapeHtml(p.title) + '</b><span>' + cmIc('heart', 12) + ' ' + p.like_count + ' · ' + cmIc('chat', 12) + ' ' + p.comment_count + '</span></div>'; }).join('') : '<div class="cm-side-empty">아직 인기글이 없어요</div>') + '</div>';
    h += '<div class="cm-box card"><h5>' + cmIc('users', 16) + ' 모집 중인 팀</h5>' + (d.recruits.length ? d.recruits.map(function(p){ return '<div class="cm-mini" onclick="cmOpenPost(' + p.id + ')"><b>' + escapeHtml(p.title) + '</b><span>' + escapeHtml(p.recruit.roles.slice(0, 2).join(' · ')) + (p.recruit.d_day ? ' · ' + escapeHtml(p.recruit.d_day) : '') + '</span></div>'; }).join('') : '<div class="cm-side-empty">모집 중인 팀이 없어요</div>') + '<button class="btn ghost cm-all" onclick="cmSetCat(\'recruit\')">모집 글 모두 보기 →</button></div>';
    h += '<div class="cm-box card"><h5>' + cmIc('info', 16) + ' 커뮤니티 이용 안내</h5><ul class="cm-rules"><li>서로 존중하며 이야기해요</li><li>개인정보·광고성 링크는 올리지 않아요</li><li>신고가 쌓인 글은 자동으로 가려져요</li></ul></div>';
    box.innerHTML = h;
  } catch(e){ box.innerHTML = ''; }
}

/* ---------- 본문(안전한 마크다운) ---------- */
function cmInline(el, text){
  var re = /(`[^`]+`|\*\*[^*]+\*\*|https?:\/\/[^\s<>"')]+)/g, last = 0, m;
  while((m = re.exec(text)) !== null){
    if(m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    var tok = m[0], n;
    if(tok.charAt(0) === '`'){ n = document.createElement('code'); n.textContent = tok.slice(1, -1); }
    else if(tok.charAt(0) === '*'){ n = document.createElement('strong'); n.textContent = tok.slice(2, -2); }
    else { n = document.createElement('a'); n.href = tok; n.textContent = tok; n.target = '_blank'; n.rel = 'noopener noreferrer nofollow ugc'; }
    el.appendChild(n); last = m.index + tok.length;
  }
  if(last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
}
function cmRenderBody(el, text){
  el.textContent = '';
  var lines = String(text || '').replace(/\r/g, '').split('\n'), i = 0, list = null;
  while(i < lines.length){
    var ln = lines[i];
    if(/^```/.test(ln.trim())){
      var code = []; i++;
      while(i < lines.length && !/^```\s*$/.test(lines[i].trim())){ code.push(lines[i]); i++; }
      i++;
      var pre = document.createElement('pre'), cd = document.createElement('code'); cd.textContent = code.join('\n'); pre.appendChild(cd); el.appendChild(pre); list = null; continue;
    }
    var li = /^\s*[-*•]\s+(.*)$/.exec(ln);
    if(li){ if(!list){ list = document.createElement('ul'); el.appendChild(list); } var it = document.createElement('li'); cmInline(it, li[1]); list.appendChild(it); i++; continue; }
    list = null;
    if(!ln.trim()){ i++; continue; }
    var q = /^>\s?(.*)$/.exec(ln), hd = /^#{1,3}\s+(.*)$/.exec(ln), node;
    if(q){ node = document.createElement('blockquote'); cmInline(node, q[1]); }
    else if(hd){ node = document.createElement('h5'); cmInline(node, hd[1]); }
    else { node = document.createElement('p'); cmInline(node, ln); }
    el.appendChild(node); i++;
  }
}

/* ---------- 상세 ---------- */
async function cmOpenPost(id){
  var modal = document.getElementById('cmPostModal'), sheet = document.getElementById('cmSheet');
  modal.classList.add('open');
  if(!cm.post || cm.post.id !== id) sheet.innerHTML = '<div class="evt-skel" style="height:260px"></div>';
  try { cmRenderPost(await cmFetch('/api/community/posts/' + id)); }
  catch(e){ sheet.innerHTML = '<div class="cm-empty">' + cmIc('warn', 18) + ' ' + escapeHtml(e.message) + '<br><button class="btn ghost" style="margin-top:10px" onclick="cmClosePost()">닫기</button></div>'; }
  routerSetUrl(routePath('community', id), true);
}
function cmClosePost(){ document.getElementById('cmPostModal').classList.remove('open'); cm.post = null; if(/^\/app\/community\/\d+/.test(location.pathname)) routerSetUrl(routePath('community'), true); }
async function cmRefreshPost(){
  if(!cm.post) return;
  var sheet = document.getElementById('cmSheet'), top = sheet.scrollTop;
  var d = await cmFetch('/api/community/posts/' + cm.post.id);
  cmRenderPost(d); sheet.scrollTop = top;
  var it = cm.items.filter(function(x){ return x.id === d.id; })[0];
  if(it){ ['like_count', 'comment_count', 'bookmark_count', 'liked', 'bookmarked', 'solved', 'status', 'recruit', 'title', 'tags', 'preview'].forEach(function(k){ it[k] = d[k]; }); cmRenderFeed(); }
}
function cmCommentHtml(c, d, replies){
  var isReply = c.parent_id !== null;
  var h = '<div class="cm-comment' + (isReply ? ' reply' : '') + (c.accepted ? ' is-accepted' : '') + '" id="cmC' + c.id + '">' + cmAvatar(c.author.name, 28) + '<div class="cb"><div class="ch"><b>' + escapeHtml(c.author.name) + '</b>';
  if(c.is_author) h += '<span class="cm-badge author">글쓴이</span>';
  if(c.accepted) h += '<span class="cm-badge accepted">' + cmIc('check', 12) + ' 채택된 답변</span>';
  h += '<span>' + escapeHtml(cmAgo(c.created_at)) + '</span></div>';
  h += '<div class="ct cm-body"' + (c.deleted ? '' : ' data-cb="' + c.id + '"') + '>' + (c.deleted ? '<i style="color:var(--text-faint)">삭제된 댓글이에요.</i>' : '') + '</div>';
  if(!c.deleted){
    h += '<div class="ca"><button class="' + (c.liked ? 'on' : '') + '" onclick="cmLikeComment(' + c.id + ')">' + cmIc('heart', 13, c.liked) + ' ' + c.like_count + '</button>';
    h += '<button onclick="cmReplyBox(' + c.id + ')">답글</button>';
    if(d.category === 'question' && d.mine && !c.mine && !isReply) h += '<button onclick="cmAccept(' + c.id + ')">' + (c.accepted ? '채택 취소' : cmIc('check', 12) + ' 채택하기') + '</button>';
    if(c.mine) h += '<button onclick="cmDeleteComment(' + c.id + ')">삭제</button>';
    h += '</div>';
  }
  h += '<div id="cmReply' + c.id + '"></div></div></div>';
  (replies || []).forEach(function(r){ h += cmCommentHtml(r, d, null); });
  return h;
}
function cmRenderPost(d){
  cm.post = d;
  var cat = CM_CATS[d.category] || CM_CATS.free, sheet = document.getElementById('cmSheet'), h = '';
  h += '<div class="cm-sheet-head"><div class="cm-meta"><span class="cm-cat" style="--cc:' + cat.color + '">' + cmIc(cat.ic, 13) + ' ' + escapeHtml(cat.label) + '</span>';
  if(d.category === 'question' && d.solved) h += '<span class="cm-st solved">' + cmIc('check', 12) + ' 해결됨</span>';
  if(d.category === 'recruit' && d.recruit) h += d.recruit.open ? '<span class="cm-st open">모집중' + (d.recruit.d_day ? ' · ' + escapeHtml(d.recruit.d_day) : '') + '</span>' : '<span class="cm-st closed">모집 마감</span>';
  h += '</div><button class="icon-btn" onclick="cmClosePost()" title="닫기"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
  h += '<div class="cm-d-title">' + escapeHtml(d.title) + '</div>';
  h += '<div class="cm-d-author">' + cmAvatar(d.author.name, 30) + '<span><b' + (d.author.id ? ' class="cm-au" onclick="cmClosePost();openProfile(' + d.author.id + ')" title="프로필 보기"' : '') + '>' + escapeHtml(d.author.name) + '</b>' + (d.author.official ? ' <span class="cm-badge author">운영</span>' : '') + '<br>' + escapeHtml(cmAgo(d.created_at)) + (d.updated_at && d.updated_at !== d.created_at ? ' · 수정됨' : '') + '</span>' + (d.project ? '<span class="cm-proj" style="margin-left:auto">' + cmIc('folder', 13) + ' ' + escapeHtml(d.project.title) + ' · 팀원 ' + d.project.members + '명</span>' : '') + '</div>';
  if(d.event){
    h += '<div class="cm-evtcard" onclick="window.open(' + "'" + escapeHtml(evtSafeUrl(d.event.url)) + "'" + ',\'_blank\',\'noopener,noreferrer\')">' + (d.event.image_url && /^https:\/\//.test(d.event.image_url) ? '<img src="' + escapeHtml(d.event.image_url) + '" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">' : '<span class="cm-evic">' + cmIc('trophy', 26) + '</span>') + '<div><b>' + escapeHtml(d.event.title) + '</b><span>' + escapeHtml(d.event.category) + (d.event.d_day ? ' · ' + escapeHtml(d.event.d_day) : '') + ' · 공고 보기 ↗</span></div></div>';
  }
  h += '<div class="cm-body" id="cmBodyEl"></div>';
  if(d.tags.length) h += '<div class="cm-tags">' + d.tags.map(function(t){ return '<span class="cm-tag" onclick="cmClosePost();cmSetTag(\'' + escapeHtml(t).replace(/'/g, '') + '\')">#' + escapeHtml(t) + '</span>'; }).join('') + '</div>';
  if(d.category === 'recruit' && d.recruit) h += cmRecruitPanel(d);
  h += '<div class="cm-actions"><button class="cm-act' + (d.liked ? ' on' : '') + '" onclick="cmLikePost()">' + cmIc('heart', 15, d.liked) + ' 좋아요 ' + d.like_count + '</button>';
  h += '<button class="cm-act' + (d.bookmarked ? ' on' : '') + '" onclick="cmBookmarkPost()">' + cmIc('bookmark', 15, d.bookmarked) + ' 저장 ' + d.bookmark_count + '</button>';
  h += '<button class="cm-act" onclick="cmCopyLink()">' + cmIc('link', 15) + ' 링크 복사</button>';
  if(d.mine){ h += '<button class="cm-act right" onclick="cmEditPost()">' + cmIc('pencil', 15) + ' 수정</button><button class="cm-act danger" onclick="cmDeletePost()">' + cmIc('trash', 15) + ' 삭제</button>'; }
  else if(!d.author.official){ h += '<button class="cm-act right danger" onclick="cmReportPost()">' + cmIc('flag', 15) + ' 신고</button>'; }
  h += '</div>';
  var tops = d.comments.filter(function(c){ return c.parent_id === null; });
  tops.sort(function(a, b){ return (b.accepted ? 1 : 0) - (a.accepted ? 1 : 0); });
  h += '<div class="cm-ctitle">' + (d.category === 'question' ? '답변' : '댓글') + ' ' + d.comment_count + '</div><div id="cmComments">';
  h += tops.length ? tops.map(function(c){ return cmCommentHtml(c, d, d.comments.filter(function(r){ return r.parent_id === c.id; })); }).join('') : '<div class="cm-side-empty" style="padding:10px 0">' + (d.category === 'question' ? '아직 답변이 없어요. 첫 답변을 남겨 보세요!' : '아직 댓글이 없어요.') + '</div>';
  h += '</div><div class="cm-composer"><textarea id="cmNewComment" maxlength="2000" placeholder="' + (calApiMode ? (d.category === 'question' ? '답변을 입력하세요' : '댓글을 입력하세요') : '로그인하면 댓글을 쓸 수 있어요') + '"' + (calApiMode ? '' : ' disabled') + '></textarea><div class="row"><button class="btn primary" onclick="cmSubmitComment(null)">' + (d.category === 'question' ? '답변 등록' : '댓글 등록') + '</button></div></div>';
  sheet.innerHTML = h;
  cmRenderBody(document.getElementById('cmBodyEl'), d.body);
  if(d.author.id && calApiMode && !(currentUser && d.author.id === currentUser.id)){ var au = sheet.querySelector('.cm-d-author span'); if(au){ var slot = document.createElement('span'); au.parentNode.appendChild(slot); fwLoad([d.author.id]).then(function(){ if(cm.post && cm.post.id === d.id) slot.replaceWith(fwButton(d.author.id, 'sm')); }); } }
  d.comments.forEach(function(c){ var el = c.deleted ? null : sheet.querySelector('[data-cb="' + c.id + '"]'); if(el) cmRenderBody(el, c.body); });
}
function cmRecruitPanel(d){
  var r = d.recruit, h = '<div class="cm-recruit-panel"><h5>' + cmIc('users', 16) + ' 팀원 모집</h5><div class="cm-roles">' + r.roles.map(function(x){ return '<span class="cm-role">' + escapeHtml(x) + '</span>'; }).join('') + '<span class="cm-slots">모집 <b>' + r.accepted + '/' + r.slots + '</b>명' + (r.deadline ? ' · 마감 ' + escapeHtml(evtFmtDate(r.deadline)) + ' (' + escapeHtml(r.d_day || '') + ')' : '') + '</span></div>';
  if(d.mine){
    var apps = d.applications || [];
    h += '<div class="cm-slots">지원자 <b>' + apps.length + '</b>명 · 수락하면 이 프로젝트의 팀원이 돼요</div>';
    apps.forEach(function(a){
      h += '<div class="cm-app">' + cmAvatar(a.user.name, 30) + '<div class="tx"><b>' + escapeHtml(a.user.name) + '</b> <span style="color:var(--text-faint)">' + escapeHtml(cmAgo(a.created_at)) + '</span><br>' + escapeHtml(a.message) + '</div><div class="btns">' +
        (a.status === 'pending' ? '<button class="btn primary" onclick="cmDecide(' + a.id + ',\'accept\')">수락</button><button class="btn ghost" onclick="cmDecide(' + a.id + ',\'decline\')">거절</button>' : '<span class="cm-st ' + (a.status === 'accepted' ? 'open' : 'closed') + '">' + (a.status === 'accepted' ? '수락됨' : '거절됨') + '</span>') + '</div></div>';
    });
    h += '<div><button class="btn ghost" onclick="cmToggleRecruit()">' + (d.status === 'open' ? '모집 마감하기' : '모집 다시 열기') + '</button></div>';
  } else if(r.my_application === 'pending'){
    h += '<div class="cm-slots">' + cmIc('check', 14) + ' 지원했어요. 글쓴이의 답을 기다리는 중이에요.</div><div><button class="btn ghost" onclick="cmWithdraw()">지원 취소</button></div>';
  } else if(r.my_application === 'accepted'){
    h += '<div class="cm-slots"><b>' + cmIc('check', 14) + ' 팀에 합류했어요!</b> 워크스페이스에서 프로젝트를 확인해 보세요.</div>';
  } else if(r.my_application === 'declined'){
    h += '<div class="cm-slots">아쉽지만 이번에는 함께하지 못하게 됐어요.</div>';
  } else if(r.open){
    h += '<div class="cm-apply-form"><textarea id="cmApplyMsg" maxlength="500" placeholder="자기소개와 지원 동기를 적어 주세요 (맡을 수 있는 역할, 경험, 가능한 시간 등)"' + (calApiMode ? '' : ' disabled') + '></textarea><div><button class="btn primary" onclick="cmApply()">지원하기</button></div></div>';
  } else { h += '<div class="cm-slots">모집이 마감됐어요.</div>'; }
  return h + '</div>';
}

/* ---------- 상세 동작 ---------- */
async function cmLikePost(){ if(cmNeedLogin()) return; try { await cmFetch('/api/community/posts/' + cm.post.id + '/like', {method:'POST'}); await cmRefreshPost(); } catch(e){ cmErr(e); } }
async function cmBookmarkPost(){ if(cmNeedLogin()) return; try { await cmFetch('/api/community/posts/' + cm.post.id + '/bookmark', {method:'POST'}); await cmRefreshPost(); } catch(e){ cmErr(e); } }
function cmCopyLink(){
  var url = location.origin + routePath('community', cm.post.id);
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function(){ pushToast('🔗', '링크를 복사했어요', ''); }, function(){ prompt('이 글의 링크', url); });
}
async function cmReportPost(){
  if(cmNeedLogin()) return;
  var reason = prompt('신고 사유를 간단히 적어 주세요 (스팸, 광고, 욕설 등)'); if(reason === null) return;
  try { var r = await cmFetch('/api/community/posts/' + cm.post.id + '/report', {method:'POST', body:JSON.stringify({reason:reason})}); pushToast('🚩', '신고', r.message); } catch(e){ cmErr(e); }
}
async function cmDeletePost(){
  if(!confirm('이 글을 삭제할까요? 되돌릴 수 없어요.')) return;
  try { await cmFetch('/api/community/posts/' + cm.post.id, {method:'DELETE'}); cmClosePost(); pushToast('🗑️', '글을 삭제했어요', ''); cmLoad(true); cmLoadSide(); } catch(e){ cmErr(e); }
}
function cmEditPost(){ cmOpenEditor({edit:cm.post}); }
async function cmSubmitComment(parentId){
  if(cmNeedLogin()) return;
  var ta = document.getElementById(parentId ? 'cmReplyText' + parentId : 'cmNewComment'); var body = (ta.value || '').trim();
  if(!body){ ta.focus(); return; }
  try { await cmFetch('/api/community/posts/' + cm.post.id + '/comments', {method:'POST', body:JSON.stringify({body:body, parent_id:parentId})}); await cmRefreshPost(); }
  catch(e){ cmErr(e); }
}
function cmReplyBox(cid){
  if(cmNeedLogin()) return;
  var box = document.getElementById('cmReply' + cid);
  if(box.firstChild){ box.innerHTML = ''; return; }
  box.innerHTML = '<div class="cm-composer"><textarea id="cmReplyText' + cid + '" maxlength="2000" placeholder="답글을 입력하세요"></textarea><div class="row"><button class="btn ghost" onclick="document.getElementById(\'cmReply' + cid + '\').innerHTML=\'\'">취소</button><button class="btn primary" onclick="cmSubmitComment(' + cid + ')">답글 등록</button></div></div>';
  document.getElementById('cmReplyText' + cid).focus();
}
async function cmLikeComment(cid){ if(cmNeedLogin()) return; try { await cmFetch('/api/community/comments/' + cid + '/like', {method:'POST'}); await cmRefreshPost(); } catch(e){ cmErr(e); } }
async function cmDeleteComment(cid){ if(!confirm('이 댓글을 삭제할까요?')) return; try { await cmFetch('/api/community/comments/' + cid, {method:'DELETE'}); await cmRefreshPost(); } catch(e){ cmErr(e); } }
async function cmAccept(cid){ try { await cmFetch('/api/community/posts/' + cm.post.id + '/accept/' + cid, {method:'POST'}); await cmRefreshPost(); } catch(e){ cmErr(e); } }
async function cmApply(){
  if(cmNeedLogin('지원하려면 로그인이 필요해요')) return;
  var msg = (document.getElementById('cmApplyMsg').value || '').trim();
  if(msg.length < 2){ document.getElementById('cmApplyMsg').focus(); pushToast('✍️', '지원 메시지를 적어 주세요', '자기소개와 지원 동기를 적으면 수락 확률이 높아져요'); return; }
  try { await cmFetch('/api/community/posts/' + cm.post.id + '/apply', {method:'POST', body:JSON.stringify({message:msg})}); pushToast('🤝', '지원했어요', '글쓴이가 확인하면 알림으로 알려드려요'); await cmRefreshPost(); } catch(e){ cmErr(e); }
}
async function cmWithdraw(){ try { await cmFetch('/api/community/posts/' + cm.post.id + '/apply', {method:'DELETE'}); await cmRefreshPost(); } catch(e){ cmErr(e); } }
async function cmDecide(appId, decision){
  try {
    var r = await cmFetch('/api/community/applications/' + appId + '/' + decision, {method:'POST'});
    if(decision === 'accept'){ pushToast('🎉', '팀원으로 맞이했어요', r.post_closed ? '모집 인원이 차서 모집이 마감됐어요' : '프로젝트 팀원에 추가됐어요'); if(typeof loadCalProjects === 'function') loadCalProjects().then(function(){ syncCalProjects(); }); }
    await cmRefreshPost();
  } catch(e){ cmErr(e); }
}
async function cmToggleRecruit(){
  try { await cmFetch('/api/community/posts/' + cm.post.id, {method:'PATCH', body:JSON.stringify({status:cm.post.status === 'open' ? 'closed' : 'open'})}); await cmRefreshPost(); } catch(e){ cmErr(e); }
}

/* ---------- 글쓰기 / 수정 ---------- */
function cmChipRender(boxId, inputId, arr, onRemove){
  var box = document.getElementById(boxId), input = document.getElementById(inputId);
  box.querySelectorAll('.c').forEach(function(c){ c.remove(); });
  arr.forEach(function(v, i){
    var c = document.createElement('span'); c.className = 'c'; c.appendChild(document.createTextNode(v));
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.onclick = function(){ onRemove(i); }; c.appendChild(x);
    box.insertBefore(c, input);
  });
}
function cmChipBind(inputId, arr, max, render, normalize){
  var input = document.getElementById(inputId);
  function add(){
    var v = normalize(input.value); input.value = '';
    if(!v) return;
    if(arr.length >= max){ pushToast('ℹ️', '최대 ' + max + '개까지 추가할 수 있어요', ''); return; }
    if(arr.map(function(x){ return x.toLowerCase(); }).indexOf(v.toLowerCase()) < 0) arr.push(v);
    render();
  }
  input.onkeydown = function(e){
    if((isEnter(e) || e.key === ',') ){ e.preventDefault(); add(); }
    else if(e.key === 'Backspace' && !input.value && arr.length){ arr.pop(); render(); }
  };
  input.onblur = function(){ if(input.value.trim()) add(); };
}
function cmRenderTags(){ cmChipRender('cmEdTags', 'cmEdTagInput', cmEd.tags, function(i){ cmEd.tags.splice(i, 1); cmRenderTags(); }); cmRenderTagSuggest(); }

/* ---- 분류별 양식(셀렉트 박스 + 기타 직접 입력) ---- */
var CM_OTHER = '__other';
function cmOptParts(o){ var i = o.indexOf('|'); return i < 0 ? {label:o, tag:''} : {label:o.slice(0, i), tag:o.slice(i + 1)}; }
function cmFieldSnapshot(cat){
  var out = {}, fs = (CM_CATS[cat] || {}).fields || [];
  fs.forEach(function(f){
    var el = document.getElementById('cmF_' + f.key); if(!el) return;
    var ot = document.getElementById('cmFo_' + f.key);
    out[f.key] = {v: el.value, o: ot ? ot.value : ''};
  });
  return out;
}
function cmFieldSave(){ if(!cmEd.fv) cmEd.fv = {}; cmEd.fv[cmEd.cat] = cmFieldSnapshot(cmEd.cat); }
function cmFieldChange(key){
  var el = document.getElementById('cmF_' + key), ot = document.getElementById('cmFo_' + key);
  if(el && ot){ var on = el.value === CM_OTHER; ot.hidden = !on; if(on) ot.focus(); }
  cmFieldSave();
}
function cmRenderFields(cat){
  var box = document.getElementById('cmEdFields'); if(!box) return;
  var fs = (CM_CATS[cat] || {}).fields || [];
  if(cmEd.id != null || !fs.length){ box.hidden = true; box.innerHTML = ''; return; }      // 글 수정 중이거나 양식이 없는 분류(자유)
  var saved = (cmEd.fv && cmEd.fv[cat]) || {};
  box.innerHTML = fs.map(function(f){
    var sv = saved[f.key] || {v:'', o:''}, h = '<div class="cm-field' + (f.type === 'text' ? ' wide' : '') + '"><label>' + escapeHtml(f.label) + ' <small>(선택)</small></label>';
    if(f.type === 'text'){
      h += '<input type="text" id="cmF_' + f.key + '" maxlength="80" placeholder="' + escapeHtml(f.ph || '') + '" value="' + escapeHtml(sv.v || '') + '" oninput="cmFieldSave()" autocomplete="off">';
    } else {
      h += '<select id="cmF_' + f.key + '" onchange="cmFieldChange(\'' + f.key + '\')"><option value="">선택해 주세요</option>' +
        f.opts.map(function(o){ var l = cmOptParts(o).label; return '<option value="' + escapeHtml(l) + '"' + (sv.v === l ? ' selected' : '') + '>' + escapeHtml(l) + '</option>'; }).join('') +
        '<option value="' + CM_OTHER + '"' + (sv.v === CM_OTHER ? ' selected' : '') + '>기타 (직접 입력)</option></select>' +
        '<input type="text" class="cm-fother" id="cmFo_' + f.key + '" maxlength="40" placeholder="직접 적어 주세요" value="' + escapeHtml(sv.o || '') + '"' + (sv.v === CM_OTHER ? '' : ' hidden') + ' oninput="cmFieldSave()" autocomplete="off">';
    }
    return h + '</div>';
  }).join('');
  box.hidden = false;
}
/* 고른 항목들을 본문 맨 위의 목록으로 정리하고, 그 아래에 상세 내용을 붙인다. 고른 '주요 항목'은 태그로도 붙는다 */
function cmFieldValues(cat){
  var fs = (CM_CATS[cat] || {}).fields || [], lines = [], tags = [];
  fs.forEach(function(f){
    var el = document.getElementById('cmF_' + f.key); if(!el) return;
    var val = (el.value || '').trim();
    if(f.type === 'select'){
      if(val === CM_OTHER){ var ot = document.getElementById('cmFo_' + f.key); val = ot ? ot.value.trim() : ''; }
      else if(val && f.tag){ var op = f.opts.map(cmOptParts).filter(function(x){ return x.label === val; })[0]; var t = op && (op.tag || op.label.replace(/[^0-9A-Za-z가-힣+#._\-]/g, '')); if(t) tags.push(t.slice(0, 20)); }
    }
    if(val) lines.push('- **' + f.label + '**: ' + val.replace(/\s+/g, ' '));
  });
  return {lines:lines, tags:tags};
}
function cmComposeBody(detail){
  if(cmEd.id != null) return detail;
  var v = cmFieldValues(cmEd.cat);
  return (v.lines.length ? v.lines.join('\n') + (detail ? '\n\n' : '') : '') + detail;
}
function cmRenderTagSuggest(){
  var box = document.getElementById('cmEdTagSuggest'); if(!box) return;
  if(cmEd.id == null && ((CM_CATS[cmEd.cat] || {}).fields || []).length){ box.innerHTML = ''; return; }
  var list = ((CM_CATS[cmEd.cat] || {}).tags || []).filter(function(t){ return cmEd.tags.map(function(x){ return x.toLowerCase(); }).indexOf(t.toLowerCase()) < 0; });
  box.innerHTML = list.length ? '<span class="cm-sug-lbl">추천</span>' + list.map(function(t){ return '<button type="button" onclick="cmAddTag(this.dataset.t)" data-t="' + escapeHtml(t) + '">+ ' + escapeHtml(t) + '</button>'; }).join('') : '';
}
function cmAddTag(t){
  if(!t) return;
  if(cmEd.tags.length >= 5){ pushToast('ℹ️', '태그는 최대 5개까지 붙일 수 있어요', ''); return; }
  if(cmEd.tags.map(function(x){ return x.toLowerCase(); }).indexOf(t.toLowerCase()) < 0) cmEd.tags.push(t);
  cmRenderTags();
}
function cmRenderRoles(){
  cmChipRender('cmEdRoles', 'cmEdRoleInput', cmEd.roles, function(i){ cmEd.roles.splice(i, 1); cmRenderRoles(); });
  document.getElementById('cmEdRoleSuggest').innerHTML = CM_ROLE_SUGGEST.filter(function(r){ return cmEd.roles.indexOf(r) < 0; }).map(function(r){ return '<button type="button" onclick="cmAddRole(\'' + r.replace(/'/g, '') + '\')">+ ' + escapeHtml(r) + '</button>'; }).join('');
}
function cmAddRole(r){ if(cmEd.roles.length < 6 && cmEd.roles.indexOf(r) < 0){ cmEd.roles.push(r); cmRenderRoles(); } }
function cmFieldSave_prev(){ if(cmEd._prevCat){ if(!cmEd.fv) cmEd.fv = {}; cmEd.fv[cmEd._prevCat] = cmFieldSnapshot(cmEd._prevCat); } }
function cmEdSetCat(cat){
  if(cmEd.mode === 'edit') return;
  if(cmEd.cat !== cat) cmEd._prevCat = cmEd.cat; else cmEd._prevCat = null;
  cmEd.cat = cat;
  document.querySelectorAll('#cmEdCats .cm-ed-cat').forEach(function(b){ b.classList.toggle('on', b.dataset.cat === cat); });
  var info = CM_CATS[cat];
  document.getElementById('cmEdHint').textContent = info.hint;
  document.getElementById('cmEdRecruit').hidden = cat !== 'recruit';
  document.getElementById('cmEdShowcase').hidden = cat !== 'showcase';
  var body = document.getElementById('cmEdBody');
  document.getElementById('cmEdTitleInput').placeholder = info.titlePh || '제목을 입력하세요';
  if(cmEd.id == null) cmFieldSave_prev();      // 다른 분류로 바꾸기 전에, 지금 고른 항목을 보관해 둔다 (다시 돌아오면 그대로 복원)
  cmRenderFields(cat);
  var hasF = !!(info.fields && info.fields.length && cmEd.id == null);
  var bl = document.getElementById('cmEdBodyLabel'); if(bl) bl.textContent = hasF ? '상세 내용' : '내용';
  body.placeholder = (hasF && info.detailPh) ? info.detailPh : '내용을 입력하세요. **굵게**, `코드`, ```코드블록```, - 목록, 링크(https://…)를 쓸 수 있어요';
  cmRenderTagSuggest();
  var owned = (typeof myProjects !== 'undefined' ? myProjects : []).filter(function(p){ return p.serverId && p.isOwner !== false; });
  var sel = document.getElementById('cmEdProject'), sel2 = document.getElementById('cmEdShowProject');
  sel.innerHTML = owned.length ? owned.map(function(p){ return '<option value="' + p.serverId + '">' + escapeHtml(p.title) + '</option>'; }).join('') : '<option value="">내가 만든 프로젝트가 없어요</option>';
  var allP = (typeof myProjects !== 'undefined' ? myProjects : []).filter(function(p){ return p.serverId; });
  sel2.innerHTML = '<option value="">연결 안 함</option>' + allP.map(function(p){ return '<option value="' + p.serverId + '">' + escapeHtml(p.title) + '</option>'; }).join('');
  if(cmEd.project){ sel.value = String(cmEd.project); sel2.value = String(cmEd.project); }
  document.getElementById('cmEdNote').textContent = (cat === 'recruit' && !owned.length) ? '팀원 모집은 내가 만든 프로젝트가 필요해요. 먼저 프로젝트를 만들어 주세요.' : '';
}
function cmOpenEditor(pre){
  if(cmNeedLogin()) return;
  pre = pre || {};
  var edit = pre.edit || null;
  cmEd = {mode:edit ? 'edit' : 'new', id:edit ? edit.id : null, cat:edit ? edit.category : (pre.cat || (cm.cat !== 'all' ? cm.cat : 'question')), tags:edit ? edit.tags.slice() : (pre.tags || []).slice(),
          roles:edit && edit.recruit ? edit.recruit.roles.slice() : [], event:pre.event || null, preview:false, busy:false, project:pre.projectId || null, tpl:'', fv:{}, _prevCat:null};
  document.getElementById('cmEdTitle').textContent = edit ? '글 수정' : '글쓰기';
  document.getElementById('cmEdCats').innerHTML = Object.keys(CM_CATS).map(function(k){
    return '<button type="button" class="cm-ed-cat" data-cat="' + k + '"' + (edit ? ' disabled style="opacity:.55;cursor:default"' : '') + ' onclick="cmEdSetCat(\'' + k + '\')"><span class="ic">' + cmIc(CM_CATS[k].ic, 18) + '</span><b>' + escapeHtml(CM_CATS[k].label) + '</b><small>' + escapeHtml(CM_CATS[k].sub || '') + '</small></button>';
  }).join('');
  document.getElementById('cmEdTitleInput').value = edit ? edit.title : (pre.title || '');
  document.getElementById('cmEdBody').value = edit ? edit.body : (pre.body || '');
  document.getElementById('cmEdSlots').value = edit && edit.recruit ? edit.recruit.slots : 1;
  var dl = document.getElementById('cmEdDeadline'); dl.value = edit && edit.recruit && edit.recruit.deadline ? edit.recruit.deadline : ''; dl.min = new Date().toISOString().slice(0, 10);
  var ev = document.getElementById('cmEdEvent');
  if(cmEd.event){ ev.hidden = false; ev.innerHTML = '<label>연결된 대회</label><div class="cm-evtcard" style="cursor:default"><span class="cm-evic">' + cmIc('trophy', 24) + '</span><div><b>' + escapeHtml(cmEd.event.title) + '</b><span>이 글에서 공고로 바로 이동할 수 있어요</span></div><button class="cm-link" style="margin-left:auto" onclick="cmEd.event=null;document.getElementById(\'cmEdEvent\').hidden=true">연결 해제</button></div>'; } else { ev.hidden = true; ev.innerHTML = ''; }
  cmEd.preview = false; document.getElementById('cmEdPreview').hidden = true; document.getElementById('cmEdBody').hidden = false; document.getElementById('cmEdPrevBtn').textContent = '미리보기';
  cmChipBind('cmEdTagInput', cmEd.tags, 5, cmRenderTags, function(v){ return (v || '').trim().replace(/^#/, '').slice(0, 20); });
  cmChipBind('cmEdRoleInput', cmEd.roles, 6, cmRenderRoles, function(v){ return (v || '').trim().slice(0, 20); });
  cmEdSetCatForce(cmEd.cat);
  if(edit){ document.getElementById('cmEdRecruit').hidden = edit.category !== 'recruit'; document.getElementById('cmEdShowcase').hidden = true; document.getElementById('cmEdProject').disabled = true; document.getElementById('cmEdHint').textContent = '수정할 수 있는 건 제목·내용·태그와 모집 조건이에요.'; }
  else { document.getElementById('cmEdProject').disabled = false; }
  cmRenderTags(); cmRenderRoles(); cmEdCount();
  document.getElementById('cmEdSubmit').textContent = edit ? '저장' : '올리기'; document.getElementById('cmEdSubmit').disabled = false;
  document.getElementById('cmEditorModal').classList.add('open');
  setTimeout(function(){ document.getElementById('cmEdTitleInput').focus(); }, 80);
}
function cmEdSetCatForce(cat){ var m = cmEd.mode; cmEd.mode = 'new'; cmEdSetCat(cat); cmEd.mode = m; }
function cmCloseEditor(){ document.getElementById('cmEditorModal').classList.remove('open'); }
function cmEdCount(){ var n = document.getElementById('cmEdBody').value.length; document.getElementById('cmEdCount').textContent = n + ' / 10000'; }
function cmTogglePreview(){
  cmEd.preview = !cmEd.preview;
  var body = document.getElementById('cmEdBody'), pv = document.getElementById('cmEdPreview');
  if(cmEd.preview){ cmRenderBody(pv, cmComposeBody(body.value.trim()) || '(내용이 비어 있어요)'); pv.classList.add('cm-body'); }
  pv.hidden = !cmEd.preview; body.hidden = cmEd.preview; document.getElementById('cmEdPrevBtn').textContent = cmEd.preview ? '편집으로' : '미리보기';
}
async function cmSubmitEditor(){
  if(cmEd.busy) return;
  var title = document.getElementById('cmEdTitleInput').value.trim(), detail = document.getElementById('cmEdBody').value.trim(), note = document.getElementById('cmEdNote');
  var body = cmComposeBody(detail);          // 새 글이면 [고른 항목 목록 + 상세 내용], 수정이면 쓴 그대로
  note.textContent = '';
  if(title.length < 2){ note.textContent = '제목을 2자 이상 입력해 주세요.'; return; }
  if(body.length < 2){ note.textContent = (cmEd.id == null && (CM_CATS[cmEd.cat].fields || []).length) ? '항목을 고르거나 상세 내용을 적어 주세요.' : '내용을 입력해 주세요.'; return; }
  var payload = {title:title, body:body, tags:cmEd.tags.slice()};
  if(cmEd.mode === 'new'){                    // 고른 '주요 항목'(분야·모집 목적 등)은 검색되도록 태그로도 붙인다 (최대 5개)
    cmFieldValues(cmEd.cat).tags.forEach(function(t){ if(payload.tags.length < 5 && payload.tags.map(function(x){ return x.toLowerCase(); }).indexOf(t.toLowerCase()) < 0) payload.tags.push(t); });
  }
  if(cmEd.mode === 'new'){
    payload.category = cmEd.cat;
    if(cmEd.event) payload.event_id = cmEd.event.id;
    if(cmEd.cat === 'recruit'){
      var pid = parseInt(document.getElementById('cmEdProject').value, 10);
      if(!pid){ note.textContent = '모집할 내 프로젝트를 골라 주세요.'; return; }
      if(!cmEd.roles.length){ note.textContent = '찾는 역할을 하나 이상 추가해 주세요.'; return; }
      payload.project_id = pid; payload.recruit_roles = cmEd.roles.slice(); payload.recruit_slots = parseInt(document.getElementById('cmEdSlots').value, 10) || 1;
      var dl = document.getElementById('cmEdDeadline').value; if(dl) payload.recruit_deadline = dl;
    }
    if(cmEd.cat === 'showcase'){ var sp = parseInt(document.getElementById('cmEdShowProject').value, 10); if(sp) payload.project_id = sp; }
  } else if(cm.post && cm.post.category === 'recruit'){
    if(!cmEd.roles.length){ note.textContent = '찾는 역할을 하나 이상 추가해 주세요.'; return; }
    payload.recruit_roles = cmEd.roles.slice(); payload.recruit_slots = parseInt(document.getElementById('cmEdSlots').value, 10) || 1;
    var dl2 = document.getElementById('cmEdDeadline').value; if(dl2) payload.recruit_deadline = dl2;
  }
  cmEd.busy = true; document.getElementById('cmEdSubmit').disabled = true;
  try {
    var d = cmEd.mode === 'new' ? await cmFetch('/api/community/posts', {method:'POST', body:JSON.stringify(payload)}) : await cmFetch('/api/community/posts/' + cmEd.id, {method:'PATCH', body:JSON.stringify(payload)});
    cmCloseEditor(); pushToast(cmEd.mode === 'new' ? '🎉' : '✅', cmEd.mode === 'new' ? '글을 올렸어요' : '글을 수정했어요', '');
    if(cmEd.mode === 'new' && cm.cat !== 'all' && cm.cat !== d.category){ cm.cat = 'all'; document.querySelectorAll('#cmTabs button').forEach(function(b){ b.classList.toggle('active', b.dataset.cat === 'all'); }); }
    cm.view = ''; await cmLoad(true); cmLoadSide(); cmOpenPost(d.id);
  } catch(e){ note.textContent = e.message; }
  finally { cmEd.busy = false; document.getElementById('cmEdSubmit').disabled = false; }
}

/* ---------- 다른 화면과 연결 ---------- */
function evtRecruit(i){
  var ev = evtState.view[i]; if(!ev) return;
  if(cmNeedLogin('팀원을 구하려면 로그인이 필요해요')) return;
  goView('community');
  cmOpenEditor({cat:'recruit', event:{id:ev.id, title:ev.title}, title:'[' + ev.title.slice(0, 50) + '] 팀원 모집', tags:[ev.category === '해커톤' ? '해커톤' : (ev.category === '대외활동' ? '대외활동' : '공모전')],
    body:'함께 도전할 팀원을 찾고 있어요!\n\n- 대회: ' + ev.title + (ev.deadline_date ? '\n- 접수 마감: ' + evtFmtDate(ev.deadline_date) : '') + '\n- 공고: ' + ev.url + '\n\n하는 일:\n쓰는 기술:\n이런 분이면 좋아요:'});
}
function openNotifLink(link){
  document.getElementById('notifPanel').classList.remove('open');
  if(!link) return;
  var m = /^community:(\d+)$/.exec(link);
  if(m){ goView('community'); cmOpenPost(parseInt(m[1], 10)); return; }
  m = /^profile:(\d+)$/.exec(link);
  if(m){ openProfile(parseInt(m[1], 10)); return; }
  m = /^file:(\d+):(\d+):(.+)$/.exec(link);
  if(m){ wsJumpTo(parseInt(m[1], 10), m[3], parseInt(m[2], 10)); return; }
  m = /^project:(\d+)$/.exec(link);
  if(m){ openWorkspace('p' + m[1]); return; }
  if(/^\/calendar/.test(link)) goView('calendar');
}
function cmHandleHash(){
  var m = /^#community-(\d+)$/.exec(location.hash || '');
  if(m){ goView('community'); cmOpenPost(parseInt(m[1], 10)); }
}
window.addEventListener('hashchange', function(){ if(/^#community-\d+$/.test(location.hash) && !document.getElementById('cmPostModal').classList.contains('open')) cmHandleHash(); });


/* 분류 탭·버튼의 이모티콘 대신 선 아이콘을 넣는다 */
function cmRenderTabs(){
  document.querySelectorAll('#cmTabs button').forEach(function(b){
    var k = b.dataset.cat, c = CM_CATS[k];
    b.innerHTML = cmIc(k === 'all' ? 'grid' : c.ic, 15) + '<span>' + (k === 'all' ? '전체' : escapeHtml(c.label)) + '</span>';
  });
  var sv = document.getElementById('cmChipSaved'); if(sv) sv.innerHTML = cmIc('bookmark', 14) + ' 저장한 글';
  var mi = document.getElementById('cmChipMine'); if(mi) mi.innerHTML = cmIc('pencil', 14) + ' 내 글';
  var wr = document.getElementById('cmWriteBtn'); if(wr) wr.innerHTML = cmIc('pencil', 15) + ' 글쓰기';
}
cmRenderTabs();
