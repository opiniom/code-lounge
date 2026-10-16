// 페이지 로드 시 초대 토큰 확인 및 초기 알림 로드
setTimeout(function(){
  checkInviteParam();
  cmHandleHash();
  loadNotifications();
  ntStartPolling();
  pstStart();
  loadEvents();
}, 600);

/* ---- 마이페이지 ---- */
/* 프로젝트·일정·회의록이 (실시간으로) 바뀌면, 마이페이지가 열려 있을 때 숫자와 목록을 다시 맞춘다 */
var mpTimer = null;
function mpRefreshSoon(){
  var v = document.querySelector('.view.active'); if(!v || v.dataset.view !== 'mypage') return;
  clearTimeout(mpTimer); mpTimer = setTimeout(renderMyPage, 300);
}
/* ---- 마이페이지: 숫자 카드를 누르면 자세한 목록 + 관리(열기·수정·삭제) ---- */
var MP = { tab:'projects', posts:null };
function mpEl(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
async function renderMyPage(){
  var set = function(id, v){ var e = document.getElementById(id); if(e) e.textContent = v; };
  var nm = (currentUser && currentUser.username) || myProfile.name || '나';
  var mpName = document.getElementById('mypageName'); if(mpName) mpName.textContent = nm;
  var mpAv = document.getElementById('mypageAvatar'); if(mpAv){ mpAv.textContent = nm.slice(0, 1); mpAv.style.background = avatarSwatches[myProfile.swatch] || ''; }
  var mpRole = document.getElementById('mypageRole'); if(mpRole) mpRole.textContent = myProfile.role || (currentUser ? currentUser.email : '로그인하면 내 활동이 여기에 모여요');
  set('mpProjects', myProjects.length);
  set('mpEvents', mpMonthEvents().length);
  set('mpNotes', (meetingDocs || []).length);
  if(authToken && calApiMode){
    try { var r = await cmFetch('/api/community/posts?mine=true&limit=50'); MP.posts = r.items || []; set('mpPosts', r.total != null ? r.total : MP.posts.length); } catch(e){}
  } else { MP.posts = []; set('mpPosts', 0); }
  if(authToken && calApiMode){ try { MP.me = await apiFetch('/api/profile/me'); } catch(e){ MP.me = null; } } else MP.me = null;
  mpRenderAbout(); mpRenderPortfolio();
  mpTab(MP.tab);
  var fl = document.getElementById('mpFollow');
  if(fl && authToken && calApiMode){
    try {
      var f = await apiFetch('/api/follows/me'); fl.innerHTML = '';
      var mk = function(label, n, tab){ var b = mpEl('button', 'mp-fbtn'); b.innerHTML = '<b></b><span></span>'; b.querySelector('b').textContent = n; b.querySelector('span').textContent = label; b.onclick = function(){ mpTab(tab); document.getElementById('mpPanel').scrollIntoView({ behavior:'smooth', block:'start' }); }; fl.appendChild(b); };
      MP.follows = f;
      mk('팔로워', f.followers.length, 'followers'); mk('팔로잉', f.following.length, 'following');
      var fb = mpEl('button', 'btn ghost', '＋ 사람 찾기'); fb.onclick = function(){ mpTab('following'); document.getElementById('mpPanel').scrollIntoView({ behavior:'smooth', block:'start' }); }; fl.appendChild(fb);
    } catch(e){}
  } else if(fl){ fl.innerHTML = ''; }
}
function mpMonthEvents(){
  var ym = CAL_TODAY.y + '-' + pad2(CAL_TODAY.m);
  return calendarEvents.filter(function(e){ return (e.start || '').indexOf(ym) === 0; }).sort(function(a, b){ return (a.start + (a.startTime || '')) < (b.start + (b.startTime || '')) ? -1 : 1; });
}
function mpTab(tab){
  MP.tab = tab;
  document.querySelectorAll('.stat-tile[data-tab]').forEach(function(t){ t.classList.toggle('on', t.dataset.tab === tab); });
  var title = { projects:'참여 프로젝트', events:'이번 달 일정', notes:'회의록', posts:'내가 쓴 커뮤니티 글', followers:'팔로워', following:'팔로잉' }[tab];
  var list = document.getElementById('mpList'); if(!list) return; list.innerHTML = '';
  var rows = [];
  var none = function(msg){ list.appendChild(mpEl('div', 'mp-none', msg)); document.getElementById('mpCount').textContent = '0'; document.getElementById('mpTitle').textContent = title; };
  if(!calApiMode){ none('로그인하면 내 활동을 볼 수 있어요.'); return; }
  if(tab === 'followers' || tab === 'following'){
    var f = MP.follows || { followers:[], following:[] }; rows = tab === 'followers' ? f.followers : f.following;
    if(tab === 'following') pfEmailSearch(list);
    rows.forEach(function(x){ list.appendChild(pfPerson(x)); });
    if(!rows.length) list.appendChild(mpEl('div', 'mp-none', tab === 'followers' ? '아직 팔로워가 없어요. 프로필을 채우고 커뮤니티에 글을 써 보세요.' : '아직 팔로우한 사람이 없어요. 위 이메일 검색이나 커뮤니티 글의 작성자 옆 버튼으로 팔로우해 보세요.'));
  } else if(tab === 'projects'){
    rows = myProjects.slice();
    rows.forEach(function(p){
      var r = mpEl('div', 'mp-row'), main = mpEl('div', 'mp-main'); main.appendChild(mpEl('b', null, p.title));
      var sub = mpEl('div', 'mp-sub'); sub.appendChild(mpEl('span', 'mp-tag', p.isOwner ? '👑 팀장' : (((p.members || []).filter(function(m){ return currentUser && m.id === currentUser.id; })[0] || {}).role === 'leader' ? '부팀장' : '팀원'))); sub.appendChild(mpEl('span', null, '팀원 ' + ((p.members || []).length || 1) + '명')); main.appendChild(sub);
      main.onclick = function(){ openWorkspace(p.id); }; r.appendChild(main);
      var a = mpEl('div', 'mp-acts'); var b1 = mpEl('button', 'btn ghost', '워크스페이스'); b1.onclick = function(){ openWorkspace(p.id); }; var b2 = mpEl('button', 'btn ghost', '팀원'); b2.onclick = function(){ TM.pid = p.id; goView('admin'); };
      a.appendChild(b1); a.appendChild(b2); r.appendChild(a); list.appendChild(r);
    });
    if(!rows.length) none('아직 참여한 프로젝트가 없어요. 홈에서 프로젝트를 만들어 보세요.');
  } else if(tab === 'events'){
    rows = mpMonthEvents();
    rows.forEach(function(e){
      var proj = calProjectById(e.project), r = mpEl('div', 'mp-row'), main = mpEl('div', 'mp-main'); main.appendChild(mpEl('b', null, evTitle(e)));
      var sub = mpEl('div', 'mp-sub'); sub.appendChild(mpEl('span', null, fmtRange(e))); if(proj) sub.appendChild(mpEl('span', 'mp-tag', proj.title)); main.appendChild(sub);
      main.onclick = function(){ goView('calendar'); }; r.appendChild(main);
      var a = mpEl('div', 'mp-acts'); var b = mpEl('button', 'btn ghost', '캘린더에서 보기'); b.onclick = function(){ goView('calendar'); }; a.appendChild(b); r.appendChild(a); list.appendChild(r);
    });
    if(!rows.length) none('이번 달에 등록된 일정이 없어요.');
  } else if(tab === 'notes'){
    rows = (meetingDocs || []).slice().sort(function(a, b){ return (b.date || '') < (a.date || '') ? -1 : 1; });
    rows.forEach(function(d){
      var r = mpEl('div', 'mp-row'), main = mpEl('div', 'mp-main'); main.appendChild(mpEl('b', null, d.title));
      var sub = mpEl('div', 'mp-sub'); sub.appendChild(mpEl('span', null, d.date)); sub.appendChild(mpEl('span', 'mp-tag', d.status)); if(d.author && d.authorId !== (currentUser && currentUser.id)) sub.appendChild(mpEl('span', 'mp-tag', d.author + ' 작성')); main.appendChild(sub);
      var open = function(){ goView('notes'); setTimeout(function(){ openMdocDrawer(d.id); }, 250); }; main.onclick = open; r.appendChild(main);
      var a = mpEl('div', 'mp-acts'); var b = mpEl('button', 'btn ghost', '열기'); b.onclick = open; a.appendChild(b);
      if(d.canEdit !== false && d.serverId){ var x = mpEl('button', 'btn ghost danger', '삭제'); x.onclick = function(){ mpDeleteNote(d); }; a.appendChild(x); }
      r.appendChild(a); list.appendChild(r);
    });
    if(!rows.length) none('아직 회의록이 없어요.');
  } else {
    rows = MP.posts || [];
    rows.forEach(function(p){
      var cat = (typeof CM_CATS !== 'undefined' && CM_CATS[p.category]) || { label:'글', ic:'', color:'#64748B' };
      var r = mpEl('div', 'mp-row'), main = mpEl('div', 'mp-main'); main.appendChild(mpEl('b', null, p.title));
      var sub = mpEl('div', 'mp-sub'); var tg = mpEl('span', 'mp-tag', cat.ic + ' ' + cat.label); sub.appendChild(tg);
      sub.appendChild(mpEl('span', null, '♡ ' + p.like_count + ' · 💬 ' + p.comment_count + ' · ☆ ' + p.bookmark_count)); sub.appendChild(mpEl('span', null, cmAgo(p.created_at)));
      if(p.category === 'question' && p.solved) sub.appendChild(mpEl('span', 'mp-tag', '✓ 해결됨')); if(p.category === 'recruit' && p.recruit) sub.appendChild(mpEl('span', 'mp-tag', p.recruit.open ? '모집중' : '모집 마감'));
      main.appendChild(sub); main.onclick = function(){ goView('community'); cmOpenPost(p.id); }; r.appendChild(main);
      var a = mpEl('div', 'mp-acts'); var b1 = mpEl('button', 'btn ghost', '열기'); b1.onclick = main.onclick; var b2 = mpEl('button', 'btn ghost', '수정'); b2.onclick = function(){ mpEditPost(p.id); }; var b3 = mpEl('button', 'btn ghost danger', '삭제'); b3.onclick = function(){ mpDeletePost(p); };
      a.appendChild(b1); a.appendChild(b2); a.appendChild(b3); r.appendChild(a); list.appendChild(r);
    });
    if(!rows.length) none('아직 쓴 글이 없어요. 커뮤니티에서 첫 글을 남겨 보세요.');
  }
  document.getElementById('mpTitle').textContent = title; document.getElementById('mpCount').textContent = String(rows.length) + '개';
}
async function mpEditPost(id){
  try { var d = await cmFetch('/api/community/posts/' + id); goView('community'); cmOpenEditor({ edit:d }); } catch(e){ cmErr(e); }
}
async function mpDeletePost(p){
  var yes = await appConfirm({ icon:'🗑️', title:'이 글을 삭제할까요?', text:'"' + p.title + '" 글과 달린 댓글이 함께 사라져요. 되돌릴 수 없어요.', ok:'삭제', danger:true });
  if(!yes) return;
  try { await cmFetch('/api/community/posts/' + p.id, { method:'DELETE' }); pushToast('🗑️', '글을 삭제했어요', p.title, { duration:2200 }); MP.posts = (MP.posts || []).filter(function(x){ return x.id !== p.id; }); renderMyPage(); } catch(e){ cmErr(e); }
}
async function mpDeleteNote(d){
  var yes = await appConfirm({ icon:'🗑️', title:'이 회의록을 삭제할까요?', text:'"' + d.title + '"과 이 회의록에서 AI가 만든 일정이 함께 사라져요.', ok:'삭제', danger:true });
  if(!yes) return;
  try { await apiFetch('/api/meetings/' + d.serverId, { method:'DELETE' }); meetingDocs = meetingDocs.filter(function(x){ return x.serverId !== d.serverId; }); renderMeetingDocs(); refreshTeamEvents(); pushToast('🗑️', '회의록을 삭제했어요', d.title, { duration:2200 }); renderMyPage(); } catch(e){ pushToast('⚠️', '삭제하지 못했어요', e.message); }
}

/* ---- 마이페이지: 내 프로필 요약 + 포트폴리오 ---- */
function mpRenderAbout(){
  var box = document.getElementById('mpAbout'); if(!box) return; box.innerHTML = '';
  var me = MP.me; if(!me) return;
  var p = me.profile, has = p.headline || p.bio || p.skills.length || p.links.length;
  var c = mpEl('div', 'card mp-about');
  if(!has){
    c.appendChild(mpEl('b', null, '프로필을 채워 보세요')); c.appendChild(mpEl('span', 'mp-about-tip', '한 줄 소개, 기술 스택, 링크를 적으면 팀원이 내 프로필에서 볼 수 있어요.'));
    var b = mpEl('button', 'btn primary', '프로필 편집'); b.onclick = openProfileModal; c.appendChild(b);
  } else {
    if(p.headline) c.appendChild(mpEl('div', 'mp-headline', p.headline));
    if(p.bio) c.appendChild(mpEl('p', 'pf-bio', p.bio));
    if(p.skills.length){ var sk = mpEl('div', 'pf-chips'); p.skills.forEach(function(x){ sk.appendChild(mpEl('span', 'pf-chip', x)); }); c.appendChild(sk); }
    if(p.links.length){ var lk = mpEl('div', 'pf-links'); p.links.forEach(function(l){ var a = mpEl('a', 'pf-link', '↗ ' + l.label); a.href = pfSafeUrl(l.url); a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; lk.appendChild(a); }); c.appendChild(lk); }
  }
  box.appendChild(c);
}
function mpRenderPortfolio(){
  var box = document.getElementById('mpPortfolio'); if(!box) return; box.innerHTML = '';
  var me = MP.me; if(!me) return;
  var h = mpEl('div', 'mp-port-head'); h.appendChild(mpEl('b', null, '내 포트폴리오')); h.appendChild(mpEl('span', null, '참여한 프로젝트와 내가 한 일이 자동으로 모여요. "내가 한 일"은 직접 적을 수 있어요.')); box.appendChild(h);
  if(!me.projects.length){ box.appendChild(mpEl('div', 'mp-none', '아직 참여한 프로젝트가 없어요.')); return; }
  me.projects.forEach(function(p){ box.appendChild(pfProjectCard(p, true)); });
}
