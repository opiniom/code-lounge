/* ---- 모드 전환: 실제 로그인(서버 저장) / 데모 ---- */
var calApiMode = false;
function getToken(){ return authToken; }
function setToken(t){
  authToken = t;
  if(!t){ try{ localStorage.removeItem('sync_auth_token'); localStorage.removeItem('sync_auth_user'); }catch(e){} }
}
function apiFetch(path, opts){
  opts = opts || {};
  opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {}, {Authorization:'Bearer '+getToken()});
  return fetch(API_BASE+path, opts).then(function(r){
    var expired = r.status===401 && !!getToken();
    if(r.status===401){ if(calApiMode && authToken) expireSession(); else setToken(null); }
    if(!r.ok){
      return r.json().catch(function(){ return {}; }).then(function(b){
        var err = new Error(expired ? '로그인이 만료됐어요. 다시 로그인해 주세요.' : (typeof b.detail==='string' ? b.detail : '요청에 실패했어요 ('+r.status+')'));
        err.status = r.status; err.body = b; throw err;
      });
    }
    return r.status===204 ? null : r.json();
  });
}
function resetCalToday(real){
  var n = new Date(); CAL_TODAY.y = n.getFullYear(); CAL_TODAY.m = n.getMonth()+1; CAL_TODAY.d = n.getDate();
  calYear = CAL_TODAY.y; calMonth = CAL_TODAY.m;
  buildCalGrid(); updateCalMonthLabel();
}
function enterDemoMode(){
  calApiMode = false; calProjectsLoaded = true;
  wsResetForSessionChange();
  stopChat();
  meetingDocs = []; renderMeetingDocs();
  resetCalToday(true);
  loadDemoCalendar();
  detectCache = {};
  syncCalProjects();
}
function projFromServer(p){
  var pr = {id:'p'+p.id, serverId:p.id, title:p.title, isNew:false, stack:'AI', stackColor:'var(--accent)', status:'', statusClass:'',
    meta:'AI 워크스페이스 · '+((p.members||[]).length || 1)+'명',
    avatars:(p.members && p.members.length ? p.members : [{username:(myProfile.name||'나')}]).slice(0,4).map(function(mm){ return {i:String(mm.username||'?').slice(0,1), c:chatColor(mm.username||'?')}; }),
    files:'0 files', recentFile:null, members:p.members||[], isOwner:p.is_owner!==false};
  registerProjectMembers(pr);
  return pr;
}
function startRealSession(){
  setTimeout(liveConnect, 400);                     // 로그인한 상태에서 실시간 연결 시작
  document.querySelector('.app').classList.remove('guest-mode');
  myAiName = (currentUser && currentUser.ai_name) || '';
  updateChatPlaceholder();
  calProjectsLoaded = false;
  homeLandingActive = true;
  resetToNewMemberState();
  applyHomeLandingState();
  enterApiMode();
}
function enterApiMode(){
  calApiMode = true;
  meetingDocs = []; renderMeetingDocs();
  resetCalToday(true);
  calendarEvents = []; calDetect = []; calDetectEngine = null; calDetectNote = null; detectCache = {};
  syncCalProjects();
  return apiFetch('/api/projects').then(function(rows){
    myProjects = rows.map(projFromServer);
    calProjectsLoaded = true;
    projPageIndex = 0;
    renderProjRow();
    if(myProjects.length){ homeLandingActive = false; applyHomeLandingState(); }
    var av = document.querySelector('.view.active');          // 주소로 바로 들어온 화면(워크스페이스·팀원)도 프로젝트가 준비되면 채운다
    if(av && av.dataset.view === 'workspace' && typeof enterWorkspaceView === 'function') enterWorkspaceView();
    if(typeof tmRefresh === 'function') tmRefresh();
    return apiFetch('/api/calendar/events');
  }).then(function(rows){
    calendarEvents = rows.map(serverEventToLocal);
    syncCalProjects();
    return apiFetch('/api/meetings');
  }).then(function(rows){
    meetingDocs = rows.map(docFromServer);
    meetingDocs.forEach(function(d){ detectCache[d.id] = d.raw; });   // 저장된 회의록은 로그인할 때마다 다시 분석하지 않음
    renderMeetingDocs();
    restoreDetections();   // 저장해 둔 분석 결과로 카드 복원 (캘린더에 없는 일정은 다시 '추가 가능')
    startChat();
  }).catch(function(e){ calProjectsLoaded = true; pushToast('⚠️','데이터를 불러오지 못했어요', e.message); });
}

