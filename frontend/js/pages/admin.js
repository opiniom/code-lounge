/* ---- admin: team member detail & feedback ---- */
var teamMembers = {
  jiwoo:{
    name:'지우', role:'프론트엔드 · UI/UX', avatarColor:'#3B82F6',
    tasks:8, attend:'88%', commits:14,
    aiFeedback:'지우님은 이번 주 UI 컴포넌트 작업을 예정보다 빠르게 마무리했어요. 다만 API 연동 리뷰 참여가 적었으니 다음 스프린트엔 백엔드 리뷰도 함께 맡아보면 좋겠습니다.',
    history:[{author:'하은', date:'09.05', text:'디자인 시스템 정리를 꼼꼼히 해줘서 좋았어요', tag:'우수'}]
  },
  minjae:{
    name:'민재', role:'백엔드 · 인프라', avatarColor:'#8B5CF6',
    tasks:11, attend:'95%', commits:21,
    aiFeedback:'민재님은 캐싱 작업 등 성능 개선 이슈를 스스로 찾아 처리하는 비중이 높아요. 다만 리뷰 코멘트 응답이 평균보다 늦은 편이라 팀 커뮤니케이션 속도를 한 번 점검해보면 좋겠습니다.',
    history:[{author:'지우', date:'09.06', text:'API 응답 속도 개선 빠르게 대응해줘서 감사해요', tag:'우수'}]
  },
  haeun:{
    name:'하은', role:'디자인 · 기획', avatarColor:'#EC4899',
    tasks:6, attend:'92%', commits:5,
    aiFeedback:'하은님은 회의 결정사항 정리와 디자인 시안 확정을 주도적으로 이끌고 있어요. 개발 관련 논의에도 조금 더 참여하면 팀 전체 이해도가 올라갈 것 같아요.',
    history:[{author:'민재', date:'09.02', text:'회의 진행이 명확해서 의사결정이 빨랐어요', tag:'성장중'}]
  }
};
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
