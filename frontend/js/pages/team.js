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

/* ---- team admin & permissions ---- */
async function loadAdminMembers(){
  var sid = chatServerId();
  var grid = document.getElementById('adminMemberGrid');
  if(!grid) return;
  if(!sid){
    grid.innerHTML = '<div style="padding:16px; color:var(--text-faint); grid-column:1/-1;">선택된 프로젝트가 없습니다.</div>';
    return;
  }
  var cur = calProjectById(sid);
  if(!cur || !cur.members){
    try {
      var pList = await apiFetch('/api/projects');
      cur = pList.find(function(p){ return p.id === sid; });
    } catch(e){}
  }
  if(!cur || !cur.members) return;

  var myId = currentUser ? currentUser.id : null;
  var isLeader = cur.is_owner || cur.members.some(function(m){ return m.id === myId && m.role === 'leader'; });
  var html = '';
  cur.members.forEach(function(m){
    var roleLabel = (m.role === 'leader' || m.id === cur.owner_id) ? '👑 팀장' : '팀원';
    var isSelf = (myId === m.id);
    html += '<div class="admin-member-card card" style="display:flex; flex-direction:column; gap:8px; padding:16px;">';
    html += '  <div style="display:flex; align-items:center; gap:12px;">';
    html += '    <div class="pavatar" style="background:var(--accent);">' + (m.username ? m.username[0] : '팀') + '</div>';
    html += '    <div style="flex:1;"><b>' + escapeHtml(m.username) + '</b>' + (isSelf ? ' <span class="chip accent2">나</span>' : '') + '<br><span style="font-size:12px; color:var(--text-faint);">' + (m.email || '') + '</span></div>';
    html += '    <span class="chip">' + roleLabel + '</span>';
    html += '  </div>';

    if(isLeader && !isSelf){
      html += '  <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">';
      html += '    <select onchange="changeMemberRole(' + sid + ',' + m.id + ', this.value)" style="padding:5px 8px; font-size:12px; border-radius:4px; background:var(--bg-elev); color:var(--text); border:1px solid var(--border);">';
      html += '      <option value="member"' + (m.role === 'member' ? ' selected' : '') + '>팀원</option>';
      html += '      <option value="leader"' + (m.role === 'leader' ? ' selected' : '') + '>팀장</option>';
      html += '    </select>';
      html += '    <button class="btn ghost danger" onclick="kickMember(' + sid + ',' + m.id + ')" style="color:var(--danger, #e53935); font-size:12px; padding:5px 10px;">내보내기</button>';
      html += '  </div>';
    } else if(isSelf && !cur.is_owner){
      html += '  <div style="margin-top:8px;"><button class="btn ghost danger" onclick="leaveProject(' + sid + ',' + m.id + ')" style="font-size:12px; color:var(--danger, #e53935);">프로젝트 탈퇴</button></div>';
    }
    html += '</div>';
  });
  grid.innerHTML = html;
}

async function changeMemberRole(projectId, userId, newRole){
  try {
    await apiFetch('/api/projects/' + projectId + '/members/' + userId + '/role', {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole })
    });
    pushToast('👑', '역할 변경', '팀원 역할이 성공적으로 변경되었습니다.');
    await loadCalProjects();
    loadAdminMembers();
  } catch(e){
    pushToast('⚠️', '역할 변경 실패', e.message);
  }
}

async function kickMember(projectId, userId){
  if(!confirm('정말 이 팀원을 프로젝트에서 내보내시겠습니까?')) return;
  try {
    await apiFetch('/api/projects/' + projectId + '/members/' + userId, { method: 'DELETE' });
    pushToast('👋', '팀원 내보내기', '팀원이 프로젝트에서 제외되었습니다.');
    await loadCalProjects();
    loadAdminMembers();
  } catch(e){
    pushToast('⚠️', '내보내기 실패', e.message);
  }
}

async function leaveProject(projectId, userId){
  if(!confirm('이 프로젝트에서 탈퇴하시겠습니까?')) return;
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

