/* ---- team invite ---- */
/* 초대 창: 대상 프로젝트(프런트 id 'p3')를 받는다. 없으면 채팅에서 보고 있는 프로젝트 */
/* 홈 화면의 중앙 로고(와 + 노드)를 누르면 지금 보고 있는 프로젝트의 팀원 초대 창을 연다 */
function openInviteFromHero(){
  if(!calApiMode){ openInviteModal(); return; }                     // 로그인 안내
  var id = chatProject || (typeof calDefaultProject === 'function' && calDefaultProject()) || (myProjects[0] && myProjects[0].id) || null;
  if(!id || !calProjectById(id)){
    pushToast('🗂️','먼저 프로젝트를 만들어 주세요','프로젝트 이름을 입력하면 바로 팀원을 초대할 수 있어요.');
    var pi = document.getElementById('promptInput'); if(pi) pi.focus();
    return;
  }
  openInviteModal(id);
}
var inviteTarget = null;
var inviteLinkCache = {};   // 서버 프로젝트 id → {url, at}
function inviteTargetFront(){ return inviteTarget || chatProject; }
function inviteTargetId(){ var m = /^p(\d+)$/.exec(inviteTargetFront() || ''); return m ? parseInt(m[1], 10) : null; }
function openInviteModal(frontId){
  if(!calApiMode){ pushToast('🔒','로그인 후 팀원을 초대할 수 있어요','로그인하면 프로젝트마다 초대 링크를 만들 수 있어요'); return; }
  inviteTarget = (typeof frontId === 'string' && frontId) ? frontId : null;
  var cur = calProjectById(inviteTargetFront());
  var sid = inviteTargetId();
  if(!cur || !sid){ pushToast('⚠️','프로젝트 필요','팀원을 초대할 프로젝트를 먼저 만들거나 선택해주세요.'); return; }
  if(cur.isOwner === false){ pushToast('ℹ️','팀장만 초대할 수 있어요','프로젝트를 만든 팀장에게 초대를 요청해주세요.'); return; }
  document.getElementById('inviteModalTitle').textContent = "'" + cur.title + "' 팀원 초대";
  document.getElementById('inviteEmail').value = '';
  var inp = document.getElementById('generatedInviteUrl'); if(inp) inp.value = '';
  var hint = document.getElementById('inviteShareHint'); if(hint) hint.hidden = true;
  document.getElementById('inviteModal').classList.add('open');
  generateInviteLink(false);   // 열자마자 링크를 만들어 바로 복사할 수 있게
}
function closeInviteModal(){ var m = document.getElementById('inviteModal'); if(m) m.classList.remove('open'); }
function submitInvite(){
  var email = document.getElementById('inviteEmail').value.trim();
  var sid = inviteTargetId();
  if(!email || !sid) return;
  apiFetch('/api/projects/'+sid+'/members', {method:'POST', body:JSON.stringify({email:email})}).then(function(row){
    var cur = calProjectById(inviteTargetFront());
    if(cur){ cur.members = row.members; registerProjectMembers(cur); }
    closeInviteModal(); renderChatHeader(); renderWsHeader(); syncCalProjects();
    pushToast('🎉','팀원을 초대했어요', email+' 님이 이 프로젝트의 채팅과 캘린더에 참여해요');
  }).catch(function(e){ pushToast('⚠️','초대하지 못했어요', e.message); });
}

async function generateInviteLink(force){
  var sid = inviteTargetId();
  var inp = document.getElementById('generatedInviteUrl');
  if(!sid){
    pushToast('⚠️','프로젝트 필요','초대 링크를 생성할 프로젝트를 먼저 선택해주세요.');
    return;
  }
  var cached = inviteLinkCache[sid];
  if(!force && cached && Date.now() - cached.at < 30*60*1000){
    if(inp) inp.value = cached.url;
    applyInviteHint(cached.local);
    return;
  }
  if(inp) inp.placeholder = '초대 링크를 만들고 있어요…';
  try {
    var res = await apiFetch('/api/projects/'+sid+'/invite-link', {
      method: 'POST',
      body: JSON.stringify({ expires_in_hours: 72, max_uses: 0 })
    });
    // 외부 공유 모드(./share.sh)가 켜져 있으면 그 공개 주소로, 아니면 지금 접속한 주소로 링크를 만든다
    var share = null;
    try{ share = await fetch(API_BASE + '/api/share-url').then(function(r){ return r.ok ? r.json() : null; }); }catch(e){}
    var query = (res.invite_url.split('?')[1] || '');
    var origin = (share && share.url) ? share.url : window.location.origin;
    var fullUrl = origin + '/app?' + query;
    var local = !(share && share.url) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
    inviteLinkCache[sid] = {url: fullUrl, at: Date.now(), local: local};
    if(inp) inp.value = fullUrl;
    applyInviteHint(local);
    if(force) pushToast('🔗','새 초대 링크를 만들었어요', '72시간 동안 유효해요.');
  } catch(err){
    if(inp) inp.placeholder = '초대 링크를 만들지 못했어요';
    pushToast('⚠️','초대 링크 생성 실패', err.message);
  }
}
function applyInviteHint(local){
  var hint = document.getElementById('inviteShareHint');
  if(!hint) return;
  hint.hidden = !local;
  hint.textContent = '⚠️ 이 링크는 이 컴퓨터에서만 열려요. 떨어져 있는 팀원에게는 터미널에서 ./share.sh 로 공유 모드를 켠 뒤 링크를 만들어 보내세요.';
}

function copyInviteLink(){
  var inp = document.getElementById('generatedInviteUrl');
  if(!inp || !inp.value || inp.value.includes('[')){
    pushToast('⚠️','복사 실패','먼저 [초대 링크 생성]을 클릭해주세요.');
    return;
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(inp.value).then(function(){
      pushToast('📋','복사 완료','초대 링크가 클립보드에 복사되었습니다.');
    }).catch(function(){
      inp.select(); document.execCommand('copy');
      pushToast('📋','복사 완료','초대 링크가 복사되었습니다.');
    });
  } else {
    inp.select(); document.execCommand('copy');
    pushToast('📋','복사 완료','초대 링크가 복사되었습니다.');
  }
}

/* 초대 링크: 링크의 ?invite= 값은 로그인(구글/네이버 이동)을 거쳐도 사라지지 않게 저장해 두었다가 처리한다 */
var inviteBusy = false;
function showInviteCard(token){
  goView('auth');
  fetch(API_BASE + '/api/invitations/' + encodeURIComponent(token)).then(function(r){
    return r.ok ? r.json() : r.json().catch(function(){ return {}; }).then(function(b){ throw new Error(b.detail || '유효하지 않은 초대 링크입니다.'); });
  }).then(function(info){
    var card = document.getElementById('inviteCard'); if(!card) return;
    if(info.is_expired){
      pushToast('⚠️','초대 링크가 만료됐어요','초대한 사람에게 새 링크를 요청해 주세요.');
      setPendingInvite(''); return;
    }
    document.getElementById('inviteCardTitle').textContent = info.inviter_name + '님이 \'' + info.project_title + '\' 프로젝트에 초대했어요';
    document.getElementById('inviteCardSub').textContent = '팀에서 쓸 이름만 정하면 바로 참여할 수 있어요. 가입은 필요 없어요.';
    card.hidden = false;
    applyAuthMode();
    var d = document.getElementById('authDesc'); if(d) d.textContent = '초대를 수락하고 팀 워크스페이스에 들어오세요.';
    setTimeout(function(){ var i = document.getElementById('inviteGuestName'); if(i) i.focus(); }, 100);
  }).catch(function(e){
    pushToast('⚠️','초대 링크 오류', e.message);
    setPendingInvite('');
  });
}
function acceptInviteAsGuest(){
  var token = getPendingInvite();
  var inp = document.getElementById('inviteGuestName');
  var name = inp ? inp.value.trim() : '';
  if(!token) return;
  if(!name){ pushToast('✍️','이름을 입력해 주세요','팀원들에게 보여질 이름이에요.'); if(inp) inp.focus(); return; }
  var btn = document.getElementById('inviteGuestBtn'); if(btn) btn.disabled = true;
  fetch(API_BASE + '/api/invitations/' + encodeURIComponent(token) + '/guest-join', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:name})
  }).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(b){
      if(!r.ok) throw new Error(typeof b.detail === 'string' ? b.detail : '참여하지 못했어요 ('+r.status+')');
      return b;
    });
  }).then(function(res){
    authToken = res.access_token;
    try{ localStorage.setItem('sync_auth_token', authToken); }catch(e){}
    setPendingInvite('');
    document.getElementById('inviteCard').hidden = true;
    return checkAutoLogin().then(function(){
      return loadCalProjects().then(function(){ selectCalProject(res.project_id); });
    }).then(function(){ pushToast('🎉','프로젝트 참여 완료', res.message); });
  }).catch(function(e){
    pushToast('⚠️','참여하지 못했어요', e.message);
  }).then(function(){ if(btn) btn.disabled = false; });
}
function openInviteAccept(info){
  document.getElementById('inviteAcceptText').textContent = info.inviter_name + '님이 \'' + info.project_title + '\' 프로젝트에 초대했어요. 팀원으로 참여할까요?';
  document.getElementById('inviteAcceptModal').classList.add('open');
}
function declineInvite(){
  setPendingInvite('');
  document.getElementById('inviteAcceptModal').classList.remove('open');
}
function acceptInviteLoggedIn(){
  var token = getPendingInvite(); if(!token) return;
  var btn = document.getElementById('inviteAcceptBtn'); if(btn) btn.disabled = true;
  apiFetch('/api/invitations/' + encodeURIComponent(token) + '/join', { method:'POST' }).then(function(res){
    setPendingInvite('');
    document.getElementById('inviteAcceptModal').classList.remove('open');
    pushToast('🎉','프로젝트 참여 완료', res.message);
    return loadCalProjects().then(function(){ selectCalProject(res.project_id); });
  }).catch(function(e){
    if(e.status !== 401) pushToast('⚠️','초대를 수락하지 못했어요', e.message);
    if(e.status === 400 || e.status === 404){ setPendingInvite(''); document.getElementById('inviteAcceptModal').classList.remove('open'); }
  }).then(function(){ if(btn) btn.disabled = false; });
}
async function processPendingInvite(){
  var token = getPendingInvite();
  if(!token || inviteBusy) return;
  if(!authToken){ showInviteCard(token); return; }
  inviteBusy = true;
  try {
    var info = await apiFetch('/api/invitations/' + encodeURIComponent(token));
    if(info.is_expired){
      pushToast('⚠️','초대 링크가 만료됐어요','초대한 사람에게 새 링크를 요청해 주세요.');
      setPendingInvite('');
    } else if(info.is_already_member){
      pushToast('ℹ️','이미 참여 중', "'" + info.project_title + "' 프로젝트의 팀원입니다.");
      setPendingInvite('');
      loadCalProjects().then(function(){ selectCalProject(info.project_id); });
    } else {
      openInviteAccept(info);
    }
  } catch(e){
    if(e.status !== 401) pushToast('⚠️','초대 링크 오류', e.message);
    if(e.status === 404) setPendingInvite('');
  } finally { inviteBusy = false; }
}
applyAuthMode();
function checkInviteParam(){
  // 로그인 안 된 상태로 열었을 때만 여기서 처리 (로그인된 경우는 자동 로그인 확인이 끝난 뒤 처리)
  if(!authToken) processPendingInvite();
}

/* 프로젝트 목록만 서버에서 다시 불러오기 */
function loadCalProjects(){
  return apiFetch('/api/projects').then(function(rows){
    myProjects = rows.map(projFromServer);
    calProjectsLoaded = true;
    renderProjRow();
    syncCalProjects();
    if(myProjects.length){ setWidget('projects', true); homeLandingActive = false; applyHomeLandingState(); }
  });
}

/* ---- 팀원 화면: 누가 들어와 있는지(접속 상태) + 팀원 관리 ---- */
var TM = { pid:null, filter:'all' };
function tmProject(){
  if(!calApiMode || !myProjects.length) return null;
  var cur = TM.pid ? calProjectById(TM.pid) : null;
  if(!cur){ cur = calProjectById(chatProject) || calProjectById(calSelected) || myProjects[0]; TM.pid = cur ? cur.id : null; }
  return cur;
}
function tmSelect(id){ TM.pid = id; TM.filter = 'all'; renderTeamPage(); }
function tmFilter(f){ TM.filter = f; renderTeamPage(); }
function tmInvite(){ var cur = tmProject(); if(!cur){ openInviteModal(); return; } openInviteModal(cur.id); }
function tmStatusOf(m){ return pstOf(m.id); }
function renderTeamPage(){
  var grid = document.getElementById('tmGrid'); if(!grid) return;
  var box = document.getElementById('tmProjects'), sum = document.getElementById('tmSummary'), fl = document.getElementById('tmFilters'), inv = document.getElementById('tmInviteBtn');
  var cur = tmProject();
  grid.innerHTML = ''; box.innerHTML = ''; sum.innerHTML = '';
  var empty = function(title, text, btn, fn){
    var e = document.createElement('div'); e.className = 'tm-empty';
    e.innerHTML = '<div class="tm-empty-ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8M18 14.4c1.7.6 2.7 2.1 3 4.6"/></svg></div><b></b><span></span>';
    e.querySelector('b').textContent = title; e.querySelector('span').textContent = text;
    if(btn){ var b = document.createElement('button'); b.className = 'btn primary'; b.textContent = btn; b.onclick = fn; e.appendChild(b); }
    grid.appendChild(e);
  };
  fl.hidden = !cur; inv.hidden = !cur;
  if(!calApiMode){ empty('로그인하면 팀원을 볼 수 있어요', '프로젝트를 만들고 팀원을 초대하면 누가 접속 중인지 한눈에 보여요.', '로그인', openLogin); return; }
  if(!cur){ empty('아직 프로젝트가 없어요', '프로젝트를 만들면 팀원을 초대하고 관리할 수 있어요.', '프로젝트 만들러 가기', function(){ goView('home'); var pi = document.getElementById('promptInput'); if(pi) setTimeout(function(){ pi.focus(); }, 200); }); return; }
  // 프로젝트 선택
  myProjects.forEach(function(p){
    var b = document.createElement('button'); b.type = 'button'; b.className = 'tm-proj' + (p.id === cur.id ? ' on' : '');
    var n = (p.members || []).length || 1;
    b.innerHTML = '<span class="pd"></span><b></b><small></small>'; b.querySelector('b').textContent = p.title; b.querySelector('small').textContent = n + '명';
    b.querySelector('.pd').style.background = calProjColor(p);
    b.onclick = function(){ tmSelect(p.id); }; box.appendChild(b);
  });
  var members = (cur.members && cur.members.length) ? cur.members.slice() : (currentUser ? [{ id:currentUser.id, username:myProfile.name || currentUser.username, email:currentUser.email, role:'leader' }] : []);
  var ownerId = members.length ? members[0].id : null;          // 목록의 첫 번째가 프로젝트 소유자
  var rank = { online:0, dnd:1, away:2, offline:3 };
  var rows = members.map(function(m){ return { m:m, st:tmStatusOf(m) }; });
  var on = rows.filter(function(r){ return r.st !== 'offline'; }).length;
  var chip = function(t, n, c){ var e = document.createElement('div'); e.className = 'tm-stat'; e.innerHTML = '<b></b><span></span>'; e.querySelector('b').textContent = n; e.querySelector('span').textContent = t; if(c) e.style.setProperty('--c', c); sum.appendChild(e); };
  chip('전체 팀원', members.length, null); chip('지금 접속 중', on, '#22C55E'); chip('오프라인', members.length - on, '#94A3B8');
  fl.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.f === TM.filter); });
  var cnt = { all:rows.length, online:rows.filter(function(r){ return r.st === 'online'; }).length, busy:rows.filter(function(r){ return r.st === 'away' || r.st === 'dnd'; }).length, offline:rows.filter(function(r){ return r.st === 'offline'; }).length };
  fl.querySelectorAll('button').forEach(function(b){ var f = b.dataset.f; var base = b.textContent.replace(/\s*\d+$/, ''); b.textContent = base + ' ' + cnt[f]; });
  var show = rows.filter(function(r){ return TM.filter === 'all' || (TM.filter === 'online' && r.st === 'online') || (TM.filter === 'busy' && (r.st === 'away' || r.st === 'dnd')) || (TM.filter === 'offline' && r.st === 'offline'); })
    .sort(function(a, b){ return rank[a.st] - rank[b.st] || (a.m.id === ownerId ? -1 : b.m.id === ownerId ? 1 : 0); });
  if(!show.length){ empty('해당하는 팀원이 없어요', '다른 필터를 눌러 보세요.'); return; }
  var myId = currentUser ? currentUser.id : null, sid = parseInt(String(cur.id).replace(/^p/, ''), 10);
  var groups = [['owner', '팀장'], ['leader', '부팀장'], ['member', '팀원']];
  var roleOf = function(m){ return m.id === ownerId ? 'owner' : (m.role === 'leader' ? 'leader' : 'member'); };
  var myId = currentUser ? currentUser.id : null, sid = parseInt(String(cur.id).replace(/^p/, ''), 10);
  groups.forEach(function(g){
    var part = show.filter(function(r){ return roleOf(r.m) === g[0]; }); if(!part.length) return;
    var gh = document.createElement('div'); gh.className = 'tm-group'; gh.innerHTML = '<b></b><span></span>'; gh.querySelector('b').textContent = g[1]; gh.querySelector('span').textContent = part.length + '명'; grid.appendChild(gh);
    part.forEach(function(r){ grid.appendChild(tmCard(r, g[0], cur, sid, myId)); });
  });
}
function tmCard(r, role, cur, sid, myId){
  var m = r.m, isSelf = m.id === myId, st = r.st;
  var card = document.createElement('div'); card.className = 'tm-card' + (st === 'offline' ? ' off' : '');
  card.innerHTML = '<div class="tm-top"><div class="tm-av" data-pst="' + st + '"></div><div class="tm-who"><div class="tm-name"><b></b></div><span class="tm-mail"></span></div><span class="tm-role"></span></div>'
    + '<div class="tm-state"><span class="tm-dot" data-pst="' + st + '"></span><span class="tm-st"></span></div><div class="tm-act"></div>';
  var av = card.querySelector('.tm-av'); av.textContent = String(m.username || '?').slice(0, 1); av.style.background = isSelf ? '#06B6D4' : chatColor(m.username);
  av.style.cursor = 'pointer'; av.title = '프로필 · 포트폴리오 보기'; av.onclick = function(){ openProfile(m.id); };
  card.querySelector('.tm-name b').textContent = m.username;
  if(isSelf){ var me = document.createElement('span'); me.className = 'chip accent2'; me.textContent = '나'; card.querySelector('.tm-name').appendChild(me); }
  card.querySelector('.tm-mail').textContent = m.email || '';
  var rl = card.querySelector('.tm-role'); rl.textContent = role === 'owner' ? '👑 팀장' : (role === 'leader' ? '부팀장' : '팀원'); if(role !== 'member') rl.classList.add('lead');
  card.querySelector('.tm-st').textContent = { online:'접속 중', away:'자리비움', dnd:'방해금지', offline:'오프라인' }[st]; card.querySelector('.tm-st').dataset.pst = st;
  var act = card.querySelector('.tm-act');
  var pb = document.createElement('button'); pb.className = 'btn ghost tm-prof'; pb.textContent = '프로필'; pb.onclick = function(){ openProfile(m.id); }; act.appendChild(pb);
  if(cur.isOwner && !isSelf){
    var sel = document.createElement('select'); sel.className = 'tm-sel';
    [['member', '팀원'], ['leader', '부팀장']].forEach(function(o){ var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; if(m.role === o[0]) op.selected = true; sel.appendChild(op); });
    sel.onchange = function(){ changeMemberRole(sid, m.id, sel.value); };
    var kick = document.createElement('button'); kick.className = 'btn ghost tm-kick'; kick.textContent = '내보내기'; kick.onclick = function(){ kickMember(sid, m.id); };
    act.appendChild(sel); act.appendChild(kick);
  } else if(isSelf && !cur.isOwner){
    var lv = document.createElement('button'); lv.className = 'btn ghost tm-kick'; lv.textContent = '프로젝트 탈퇴'; lv.onclick = function(){ leaveProject(sid, m.id); }; act.appendChild(lv);
  }
  return card;
}
function loadAdminMembers(){ renderTeamPage(); }

async function changeMemberRole(projectId, userId, newRole){
  try {
    await apiFetch('/api/projects/' + projectId + '/members/' + userId + '/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole })
    });
    pushToast('👑', '역할을 바꿨어요', (newRole === 'leader' ? '부팀장' : '팀원') + '으로 변경했어요.', { duration:2200 });
    await loadCalProjects();
    renderTeamPage();
  } catch(e){
    pushToast('⚠️', '역할 변경 실패', e.message);
  }
}

/* 브라우저 기본 confirm() 대신 화면 안의 확인 창 (일부 환경에서 기본 창이 막혀 버튼이 안 눌린 것처럼 보이던 문제 방지) */
function appConfirm(o){
  return new Promise(function(resolve){
    var bd = document.createElement('div'); bd.className = 'modal-backdrop open'; bd.style.zIndex = 120;
    bd.innerHTML = '<div class="share-modal cf-box" role="alertdialog" aria-modal="true"><div class="cf-ic"></div><h3></h3><p></p><div class="cf-row"><button type="button" class="btn ghost cf-no">취소</button><button type="button" class="btn primary cf-ok"></button></div></div>';
    bd.querySelector('.cf-ic').textContent = o.icon || '⚠️'; bd.querySelector('h3').textContent = o.title || '확인'; bd.querySelector('p').textContent = o.text || '';
    var ok = bd.querySelector('.cf-ok'); ok.textContent = o.ok || '확인'; if(o.danger) ok.classList.add('danger');
    var done = function(v){ document.removeEventListener('keydown', onKey, true); bd.remove(); resolve(v); };
    var onKey = function(e){ if(e.key === 'Escape'){ e.stopPropagation(); done(false); } };
    document.addEventListener('keydown', onKey, true);
    bd.addEventListener('click', function(e){ if(e.target === bd) done(false); });
    bd.querySelector('.cf-no').onclick = function(){ done(false); }; ok.onclick = function(){ done(true); };
    document.body.appendChild(bd); setTimeout(function(){ ok.focus(); }, 30);
  });
}
async function kickMember(projectId, userId){
  var cur = calProjectById('p' + projectId), who = cur && (cur.members || []).filter(function(m){ return m.id === userId; })[0];
  var yes = await appConfirm({ icon:'👋', title:(who ? who.username + '님을 ' : '') + '내보낼까요?', text:'이 프로젝트의 파일·채팅·일정에 더 이상 접근할 수 없게 돼요. 다시 초대하면 돌아올 수 있어요.', ok:'내보내기', danger:true });
  if(!yes) return;
  try {
    await apiFetch('/api/projects/' + projectId + '/members/' + userId, { method: 'DELETE' });
    pushToast('👋', '팀원을 내보냈어요', (who ? who.username + '님이 ' : '팀원이 ') + '프로젝트에서 제외되었어요.');
    await loadCalProjects();
    renderTeamPage();
  } catch(e){
    pushToast('⚠️', '내보내기 실패', e.message);
  }
}

async function leaveProject(projectId, userId){
  var yes = await appConfirm({ icon:'🚪', title:'이 프로젝트에서 탈퇴할까요?', text:'탈퇴하면 이 프로젝트의 파일·채팅·일정에 접근할 수 없어요. 다시 들어오려면 초대를 받아야 해요.', ok:'탈퇴하기', danger:true });
  if(!yes) return;
  try {
    await apiFetch('/api/projects/' + projectId + '/members/' + userId, { method: 'DELETE' });
    pushToast('👋', '탈퇴 완료', '프로젝트에서 탈퇴했습니다.');
    await loadCalProjects();
    goView('home');
  } catch(e){
    pushToast('⚠️', '탈퇴 실패', e.message);
  }
}

/* ---- open source licenses modal ---- */
function openLicensesModal(){
  var m = document.getElementById('licensesModal');
  if(m) m.classList.add('open');
}
function closeLicensesModal(){
  var m = document.getElementById('licensesModal');
  if(m) m.classList.remove('open');
}

