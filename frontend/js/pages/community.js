/* ---- community ---- */
/* ---- 커뮤니티 ----
   OKKY·DEV·GeekNews·디스콰이엇·인프런을 비교해 가져온 구조: 용도별 분류, 최신/인기/댓글순, 태그, 질문 채택, 팀원 모집(지원→수락→프로젝트 합류) */
var CM_CATS = {
  question: {label:'질문', ic:'❓', color:'#3B82F6', hint:'막힌 문제를 구체적으로 적을수록 좋은 답변을 받아요. 에러 메시지, 시도해 본 방법, 사용한 환경을 함께 적어 주세요.', ph:'어떤 문제를 겪고 있나요?\n\n- 하려던 것:\n- 실제로 일어난 일 / 에러 메시지:\n- 시도해 본 것:'},
  recruit:  {label:'팀원 모집', ic:'🤝', color:'#8B5CF6', hint:'찾는 역할·인원·마감을 적어 주세요. 지원을 수락하면 곧바로 내 프로젝트의 팀원이 돼요.', ph:'프로젝트 소개\n\n- 하는 일:\n- 쓰는 기술:\n- 진행 방식(온라인/오프라인, 주 몇 회):\n- 이런 분이면 좋아요:'},
  showcase: {label:'프로젝트 자랑', ic:'🚀', color:'#EC4899', hint:'만든 것의 소개, 사용한 기술, 배운 점을 공유해 보세요. 피드백을 받아 보는 것도 좋아요.', ph:'어떤 걸 만들었나요?\n\n- 소개:\n- 사용한 기술:\n- 어려웠던 점 / 배운 점:'},
  share:    {label:'정보·노하우', ic:'💡', color:'#10B981', hint:'공부한 것, 도구, 노하우를 나눠 주세요. 코드는 ``` 로 감싸면 보기 좋아요.', ph:''},
  free:     {label:'자유', ic:'💬', color:'#64748B', hint:'가볍게 이야기해요. 서로 존중하고 광고·개인정보는 올리지 않아요.', ph:''}
};
var CM_ROLE_SUGGEST = ['프론트엔드', '백엔드', '디자이너', '기획', 'AI/ML', '앱 개발', '데브옵스', '발표/PM'];
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
    feed.innerHTML = '<div class="cm-empty">⚠️ ' + escapeHtml(e.message || '불러오지 못했어요') + '<br><button class="btn ghost" style="margin-top:10px" onclick="cmLoad(true)">다시 시도</button></div>';
  }
}
function cmCardHtml(p, i){
  var cat = CM_CATS[p.category] || CM_CATS.free;
  var h = '<div class="cm-card card' + (p.is_pinned ? ' pinned' : '') + '" style="--i:' + Math.min(i, 12) + ';--cc:' + cat.color + '" onclick="cmOpenPost(' + p.id + ')">';
  h += '<div class="cm-meta"><span class="cm-cat">' + cat.ic + ' ' + escapeHtml(cat.label) + '</span>';
  if(p.is_pinned) h += '<span class="cm-st">📌 고정</span>';
  if(p.category === 'question') h += p.solved ? '<span class="cm-st solved">✓ 해결됨</span>' : '';
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
      '<span class="cm-slots">모집 <b>' + p.recruit.accepted + '/' + p.recruit.slots + '</b>명</span>' + (p.project ? '<span class="cm-proj">📁 ' + escapeHtml(p.project.title) + '</span>' : '') + '</div>';
  } else if(p.category === 'showcase' && p.project){
    h += '<div class="cm-roles"><span class="cm-proj">📁 ' + escapeHtml(p.project.title) + ' · 팀원 ' + p.project.members + '명</span></div>';
  }
  if(p.event) h += '<div class="cm-roles"><span class="cm-proj">🏆 ' + escapeHtml(p.event.title.slice(0, 40)) + '</span></div>';
  if(p.tags.length) h += '<div class="cm-tags">' + p.tags.map(function(t){ return '<span class="cm-tag" onclick="event.stopPropagation();cmSetTag(\'' + escapeHtml(t).replace(/'/g, '') + '\')">#' + escapeHtml(t) + '</span>'; }).join('') + '</div>';
  h += '<div class="cm-foot"><span class="who">' + cmAvatar(p.author.name) + '<b>' + escapeHtml(p.author.name) + '</b>' + (p.author.official ? '<span class="cm-badge author">운영</span>' : '') + '<span>· ' + escapeHtml(cmAgo(p.created_at)) + '</span></span>';
  h += '<span class="cm-counts"><span class="' + (p.liked ? 'on' : '') + '">' + (p.liked ? '♥' : '♡') + ' ' + p.like_count + '</span><span>💬 ' + p.comment_count + '</span><span class="' + (p.bookmarked ? 'on' : '') + '">' + (p.bookmarked ? '★' : '☆') + ' ' + p.bookmark_count + '</span></span></div></div>';
  return h;
}
function cmRenderFeed(){
  var feed = document.getElementById('cmFeed');
  if(!cm.items.length){
    var msg;
    if(cm.view === 'saved') msg = '저장한 글이 없어요.<br>글의 ☆ 를 눌러 저장해 보세요.';
    else if(cm.view === 'mine') msg = '아직 쓴 글이 없어요.';
    else if(cm.q || cm.tag) msg = '조건에 맞는 글이 없어요.';
    else if(cm.cat === 'recruit') msg = '아직 팀원 모집 글이 없어요.<br>프로젝트를 만들었다면 첫 모집 글을 올려 보세요!';
    else if(cm.cat === 'question') msg = '아직 질문이 없어요.<br>막힌 게 있다면 가장 먼저 물어보세요.';
    else msg = '아직 글이 없어요. 첫 글을 남겨 보세요!';
    feed.innerHTML = '<div class="cm-empty">' + msg + '<br><button class="btn primary" style="margin-top:12px" onclick="cmOpenEditor(' + (cm.cat !== 'all' ? "{cat:'" + cm.cat + "'}" : '') + ')">✏️ 글쓰기</button></div>';
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
    h += '<div class="cm-box card"><h5>🔥 인기 태그</h5>' + (d.tags.length ? '<div class="cm-tagcloud">' + d.tags.map(function(t){ return '<button onclick="cmSetTag(\'' + escapeHtml(t.tag).replace(/'/g, '') + '\')">#' + escapeHtml(t.tag) + ' <small>' + t.count + '</small></button>'; }).join('') + '</div>' : '<div class="cm-side-empty">글에 태그를 달면 여기에 모여요</div>') + '</div>';
    h += '<div class="cm-box card"><h5>📈 이번 주 인기글</h5>' + (d.hot.length ? d.hot.map(function(p){ return '<div class="cm-mini" onclick="cmOpenPost(' + p.id + ')"><b>' + escapeHtml(p.title) + '</b><span>♥ ' + p.like_count + ' · 💬 ' + p.comment_count + '</span></div>'; }).join('') : '<div class="cm-side-empty">아직 인기글이 없어요</div>') + '</div>';
    h += '<div class="cm-box card"><h5>🤝 모집 중인 팀</h5>' + (d.recruits.length ? d.recruits.map(function(p){ return '<div class="cm-mini" onclick="cmOpenPost(' + p.id + ')"><b>' + escapeHtml(p.title) + '</b><span>' + escapeHtml(p.recruit.roles.slice(0, 2).join(' · ')) + (p.recruit.d_day ? ' · ' + escapeHtml(p.recruit.d_day) : '') + '</span></div>'; }).join('') : '<div class="cm-side-empty">모집 중인 팀이 없어요</div>') + '<button class="btn ghost cm-all" onclick="cmSetCat(\'recruit\')">모집 글 모두 보기 →</button></div>';
    h += '<div class="cm-box card"><h5>📌 커뮤니티 이용 안내</h5><ul class="cm-rules"><li>서로 존중하며 이야기해요</li><li>개인정보·광고성 링크는 올리지 않아요</li><li>신고가 쌓인 글은 자동으로 가려져요</li></ul></div>';
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
  catch(e){ sheet.innerHTML = '<div class="cm-empty">⚠️ ' + escapeHtml(e.message) + '<br><button class="btn ghost" style="margin-top:10px" onclick="cmClosePost()">닫기</button></div>'; }
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
  if(c.accepted) h += '<span class="cm-badge accepted">✓ 채택된 답변</span>';
  h += '<span>' + escapeHtml(cmAgo(c.created_at)) + '</span></div>';
  h += '<div class="ct cm-body"' + (c.deleted ? '' : ' data-cb="' + c.id + '"') + '>' + (c.deleted ? '<i style="color:var(--text-faint)">삭제된 댓글이에요.</i>' : '') + '</div>';
  if(!c.deleted){
    h += '<div class="ca"><button class="' + (c.liked ? 'on' : '') + '" onclick="cmLikeComment(' + c.id + ')">' + (c.liked ? '♥' : '♡') + ' ' + c.like_count + '</button>';
    h += '<button onclick="cmReplyBox(' + c.id + ')">답글</button>';
    if(d.category === 'question' && d.mine && !c.mine && !isReply) h += '<button onclick="cmAccept(' + c.id + ')">' + (c.accepted ? '채택 취소' : '✓ 채택하기') + '</button>';
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
  h += '<div class="cm-sheet-head"><div class="cm-meta"><span class="cm-cat" style="--cc:' + cat.color + '">' + cat.ic + ' ' + escapeHtml(cat.label) + '</span>';
  if(d.category === 'question' && d.solved) h += '<span class="cm-st solved">✓ 해결됨</span>';
  if(d.category === 'recruit' && d.recruit) h += d.recruit.open ? '<span class="cm-st open">모집중' + (d.recruit.d_day ? ' · ' + escapeHtml(d.recruit.d_day) : '') + '</span>' : '<span class="cm-st closed">모집 마감</span>';
  h += '</div><button class="icon-btn" onclick="cmClosePost()" title="닫기"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
  h += '<div class="cm-d-title">' + escapeHtml(d.title) + '</div>';
  h += '<div class="cm-d-author">' + cmAvatar(d.author.name, 30) + '<span><b' + (d.author.id ? ' class="cm-au" onclick="cmClosePost();openProfile(' + d.author.id + ')" title="프로필 보기"' : '') + '>' + escapeHtml(d.author.name) + '</b>' + (d.author.official ? ' <span class="cm-badge author">운영</span>' : '') + '<br>' + escapeHtml(cmAgo(d.created_at)) + (d.updated_at && d.updated_at !== d.created_at ? ' · 수정됨' : '') + '</span>' + (d.project ? '<span class="cm-proj" style="margin-left:auto">📁 ' + escapeHtml(d.project.title) + ' · 팀원 ' + d.project.members + '명</span>' : '') + '</div>';
  if(d.event){
    h += '<div class="cm-evtcard" onclick="window.open(' + "'" + escapeHtml(evtSafeUrl(d.event.url)) + "'" + ',\'_blank\',\'noopener,noreferrer\')">' + (d.event.image_url && /^https:\/\//.test(d.event.image_url) ? '<img src="' + escapeHtml(d.event.image_url) + '" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">' : '<span style="font-size:30px">🏆</span>') + '<div><b>' + escapeHtml(d.event.title) + '</b><span>' + escapeHtml(d.event.category) + (d.event.d_day ? ' · ' + escapeHtml(d.event.d_day) : '') + ' · 공고 보기 ↗</span></div></div>';
  }
  h += '<div class="cm-body" id="cmBodyEl"></div>';
  if(d.tags.length) h += '<div class="cm-tags">' + d.tags.map(function(t){ return '<span class="cm-tag" onclick="cmClosePost();cmSetTag(\'' + escapeHtml(t).replace(/'/g, '') + '\')">#' + escapeHtml(t) + '</span>'; }).join('') + '</div>';
  if(d.category === 'recruit' && d.recruit) h += cmRecruitPanel(d);
  h += '<div class="cm-actions"><button class="cm-act' + (d.liked ? ' on' : '') + '" onclick="cmLikePost()">' + (d.liked ? '♥' : '♡') + ' 좋아요 ' + d.like_count + '</button>';
  h += '<button class="cm-act' + (d.bookmarked ? ' on' : '') + '" onclick="cmBookmarkPost()">' + (d.bookmarked ? '★' : '☆') + ' 저장 ' + d.bookmark_count + '</button>';
  h += '<button class="cm-act" onclick="cmCopyLink()">🔗 링크 복사</button>';
  if(d.mine){ h += '<button class="cm-act right" onclick="cmEditPost()">✏️ 수정</button><button class="cm-act danger" onclick="cmDeletePost()">🗑 삭제</button>'; }
  else if(!d.author.official){ h += '<button class="cm-act right danger" onclick="cmReportPost()">🚩 신고</button>'; }
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
  var r = d.recruit, h = '<div class="cm-recruit-panel"><h5>🤝 팀원 모집</h5><div class="cm-roles">' + r.roles.map(function(x){ return '<span class="cm-role">' + escapeHtml(x) + '</span>'; }).join('') + '<span class="cm-slots">모집 <b>' + r.accepted + '/' + r.slots + '</b>명' + (r.deadline ? ' · 마감 ' + escapeHtml(evtFmtDate(r.deadline)) + ' (' + escapeHtml(r.d_day || '') + ')' : '') + '</span></div>';
  if(d.mine){
    var apps = d.applications || [];
    h += '<div class="cm-slots">지원자 <b>' + apps.length + '</b>명 · 수락하면 이 프로젝트의 팀원이 돼요</div>';
    apps.forEach(function(a){
      h += '<div class="cm-app">' + cmAvatar(a.user.name, 30) + '<div class="tx"><b>' + escapeHtml(a.user.name) + '</b> <span style="color:var(--text-faint)">' + escapeHtml(cmAgo(a.created_at)) + '</span><br>' + escapeHtml(a.message) + '</div><div class="btns">' +
        (a.status === 'pending' ? '<button class="btn primary" onclick="cmDecide(' + a.id + ',\'accept\')">수락</button><button class="btn ghost" onclick="cmDecide(' + a.id + ',\'decline\')">거절</button>' : '<span class="cm-st ' + (a.status === 'accepted' ? 'open' : 'closed') + '">' + (a.status === 'accepted' ? '수락됨' : '거절됨') + '</span>') + '</div></div>';
    });
    h += '<div><button class="btn ghost" onclick="cmToggleRecruit()">' + (d.status === 'open' ? '모집 마감하기' : '모집 다시 열기') + '</button></div>';
  } else if(r.my_application === 'pending'){
    h += '<div class="cm-slots">✅ 지원했어요. 글쓴이의 답을 기다리는 중이에요.</div><div><button class="btn ghost" onclick="cmWithdraw()">지원 취소</button></div>';
  } else if(r.my_application === 'accepted'){
    h += '<div class="cm-slots"><b>🎉 팀에 합류했어요!</b> 워크스페이스에서 프로젝트를 확인해 보세요.</div>';
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
function cmRenderTags(){ cmChipRender('cmEdTags', 'cmEdTagInput', cmEd.tags, function(i){ cmEd.tags.splice(i, 1); cmRenderTags(); }); }
function cmRenderRoles(){
  cmChipRender('cmEdRoles', 'cmEdRoleInput', cmEd.roles, function(i){ cmEd.roles.splice(i, 1); cmRenderRoles(); });
  document.getElementById('cmEdRoleSuggest').innerHTML = CM_ROLE_SUGGEST.filter(function(r){ return cmEd.roles.indexOf(r) < 0; }).map(function(r){ return '<button type="button" onclick="cmAddRole(\'' + r.replace(/'/g, '') + '\')">+ ' + escapeHtml(r) + '</button>'; }).join('');
}
function cmAddRole(r){ if(cmEd.roles.length < 6 && cmEd.roles.indexOf(r) < 0){ cmEd.roles.push(r); cmRenderRoles(); } }
function cmEdSetCat(cat){
  if(cmEd.mode === 'edit') return;
  cmEd.cat = cat;
  document.querySelectorAll('#cmEdCats .cm-ed-cat').forEach(function(b){ b.classList.toggle('on', b.dataset.cat === cat); });
  var info = CM_CATS[cat];
  document.getElementById('cmEdHint').textContent = info.hint;
  document.getElementById('cmEdRecruit').hidden = cat !== 'recruit';
  document.getElementById('cmEdShowcase').hidden = cat !== 'showcase';
  var body = document.getElementById('cmEdBody'); body.placeholder = info.ph || '내용을 입력하세요. **굵게**, `코드`, ```코드블록```, - 목록, 링크(https://…)를 쓸 수 있어요';
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
          roles:edit && edit.recruit ? edit.recruit.roles.slice() : [], event:pre.event || null, preview:false, busy:false, project:pre.projectId || null};
  document.getElementById('cmEdTitle').textContent = edit ? '글 수정' : '글쓰기';
  document.getElementById('cmEdCats').innerHTML = Object.keys(CM_CATS).map(function(k){
    return '<button type="button" class="cm-ed-cat" data-cat="' + k + '"' + (edit ? ' disabled style="opacity:.55;cursor:default"' : '') + ' onclick="cmEdSetCat(\'' + k + '\')"><span class="ic">' + CM_CATS[k].ic + '</span>' + escapeHtml(CM_CATS[k].label) + '</button>';
  }).join('');
  document.getElementById('cmEdTitleInput').value = edit ? edit.title : (pre.title || '');
  document.getElementById('cmEdBody').value = edit ? edit.body : (pre.body || '');
  document.getElementById('cmEdSlots').value = edit && edit.recruit ? edit.recruit.slots : 1;
  var dl = document.getElementById('cmEdDeadline'); dl.value = edit && edit.recruit && edit.recruit.deadline ? edit.recruit.deadline : ''; dl.min = new Date().toISOString().slice(0, 10);
  var ev = document.getElementById('cmEdEvent');
  if(cmEd.event){ ev.hidden = false; ev.innerHTML = '<label>연결된 대회</label><div class="cm-evtcard" style="cursor:default"><span style="font-size:26px">🏆</span><div><b>' + escapeHtml(cmEd.event.title) + '</b><span>이 글에서 공고로 바로 이동할 수 있어요</span></div><button class="cm-link" style="margin-left:auto" onclick="cmEd.event=null;document.getElementById(\'cmEdEvent\').hidden=true">연결 해제</button></div>'; } else { ev.hidden = true; ev.innerHTML = ''; }
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
  if(cmEd.preview){ cmRenderBody(pv, body.value || '(내용이 비어 있어요)'); pv.classList.add('cm-body'); }
  pv.hidden = !cmEd.preview; body.hidden = cmEd.preview; document.getElementById('cmEdPrevBtn').textContent = cmEd.preview ? '편집으로' : '미리보기';
}
async function cmSubmitEditor(){
  if(cmEd.busy) return;
  var title = document.getElementById('cmEdTitleInput').value.trim(), body = document.getElementById('cmEdBody').value.trim(), note = document.getElementById('cmEdNote');
  note.textContent = '';
  if(title.length < 2){ note.textContent = '제목을 2자 이상 입력해 주세요.'; return; }
  if(body.length < 2){ note.textContent = '내용을 입력해 주세요.'; return; }
  var payload = {title:title, body:body, tags:cmEd.tags.slice()};
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
  m = /^project:(\d+)$/.exec(link);
  if(m){ openWorkspace('p' + m[1]); return; }
  if(/^\/calendar/.test(link)) goView('calendar');
}
function cmHandleHash(){
  var m = /^#community-(\d+)$/.exec(location.hash || '');
  if(m){ goView('community'); cmOpenPost(parseInt(m[1], 10)); }
}
window.addEventListener('hashchange', function(){ if(/^#community-\d+$/.test(location.hash) && !document.getElementById('cmPostModal').classList.contains('open')) cmHandleHash(); });

