/* ---- admin: team member detail & feedback ---- */
var teamMembers = {};   // (예전 데모 팀원 정보는 제거 — 팀원 목록은 서버에서 불러온다)
var currentMemberId = null;
function openMemberDetail(id){
  var m = teamMembers[id];
  currentMemberId = id;
  var av = document.getElementById('mdAvatar');
  av.textContent = m.name[0]; av.style.background = m.avatarColor;
  document.getElementById('mdName').textContent = m.name;
  document.getElementById('mdRole').textContent = m.role;
  document.getElementById('mdTasks').textContent = m.tasks;
  document.getElementById('mdAttend').textContent = m.attend;
  document.getElementById('mdCommits').textContent = m.commits;
  document.getElementById('mdAiFeedback').value = m.aiFeedback;
  renderMemberHistory(m);
  document.getElementById('memberModal').classList.add('open');
}
function closeMemberDetail(){ var el = document.getElementById('memberModal'); if(el) el.classList.remove('open'); }
function renderMemberHistory(m){
  var wrap = document.getElementById('mdHistory');
  wrap.innerHTML = '';
  m.history.slice().reverse().forEach(function(h){
    var div = document.createElement('div');
    div.className = 'fb-card';
    div.style.background = 'var(--surface-2)'; div.style.border = 'none';
    div.innerHTML = "<div class='fb-top'><div class='favatar'></div><b></b><span class='date'></span><span class='chip accent2'></span></div><p class='fb-quote'></p>";
    div.querySelector('.favatar').style.background = h.author==='나' ? '#06B6D4' : m.avatarColor;
    div.querySelector('.favatar').textContent = h.author[0];
    div.querySelector('b').textContent = h.author;
    div.querySelector('.date').textContent = h.date;
    div.querySelector('.chip').textContent = h.tag;
    div.querySelector('.fb-quote').textContent = '"'+h.text+'"';
    wrap.appendChild(div);
  });
}
function sendMemberFeedback(fromAi){
  var m = teamMembers[currentMemberId];
  var text = fromAi ? document.getElementById('mdAiFeedback').value.trim() : document.getElementById('mdFeedbackInput').value.trim();
  if(!text) return;
  var today = new Date();
  var dateLabel = (today.getMonth()+1)+'.'+today.getDate();
  m.history.push({author:'나', date:dateLabel, text:text, tag: fromAi ? 'AI 제안' : '리더 피드백'});
  renderMemberHistory(m);
  if(!fromAi) document.getElementById('mdFeedbackInput').value='';
  pushToast('✅','피드백 전달됨', m.name+'님에게 피드백을 남겼어요');
}

// 페이지 로드 시 초대 토큰 확인 및 초기 알림 로드
setTimeout(function(){
  checkInviteParam();
  cmHandleHash();
  loadNotifications();
  ntStartPolling();
  pstStart();
  loadEvents();
}, 600);

/* ---- 마이페이지: 내 활동 숫자 (진짜 데이터) ---- */
async function renderMyPage(){
  var set = function(id, v){ var e = document.getElementById(id); if(e) e.textContent = v; };
  var mpRole = document.getElementById('mypageRole'); if(mpRole) mpRole.textContent = myProfile.role || (currentUser ? currentUser.email : '로그인하면 내 활동이 여기에 모여요');
  var ym = CAL_TODAY.y + '-' + pad2(CAL_TODAY.m);
  set('mpProjects', myProjects.length);
  set('mpEvents', calendarEvents.filter(function(e){ return (e.start || '').indexOf(ym) === 0; }).length);
  set('mpNotes', (meetingDocs || []).length);
  set('mpPosts', 0);
  if(authToken && calApiMode){
    try { var r = await cmFetch('/api/community/posts?mine=true&limit=1'); set('mpPosts', r.total != null ? r.total : (r.items || []).length); } catch(e){}
  }
}
