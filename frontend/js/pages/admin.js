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
