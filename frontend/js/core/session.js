/* ---- 모드 전환: 실제 로그인(서버 저장) / 데모 ---- */
var calApiMode = false;
function getToken(){ return authToken; }
function setToken(t){
  authToken = t;
  if(!t){ try{ localStorage.removeItem('sync_auth_token'); localStorage.removeItem('sync_auth_user'); }catch(e){} }
}
/* 입력 검사(422) 에러를 '요청에 실패했어요 (422)' 대신 이유로 보여 준다 */
function apiDetailText(d){
  if(!Array.isArray(d) || !d.length || !d[0]) return '';
  var e = d[0], ctx = e.ctx || {}, loc = (e.loc || []).join('.');
  if(e.type === 'string_too_long') return (/content/.test(loc) ? '파일 하나는 ' : '글이 너무 길어요. ') + (ctx.max_length ? '최대 ' + Number(ctx.max_length).toLocaleString() + '글자까지만 저장할 수 있어요.' : '저장할 수 있는 길이를 넘었어요.');
  if(e.type === 'too_long') return '한 번에 보낼 수 있는 개수(' + (ctx.max_length || '') + '개)를 넘었어요.';
  if(e.type === 'string_too_short' || e.type === 'missing') return '비어 있는 항목이 있어요. 입력한 내용을 확인해 주세요.';
  return '';
}
function apiFetch(path, opts){
  opts = opts || {};
  opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {}, {Authorization:'Bearer '+getToken(), 'X-Client-Mode': (typeof pwaStandalone === 'function' && pwaStandalone()) ? 'app' : 'web'});
  return fetch(API_BASE+path, opts).then(function(r){
    var expired = r.status===401 && !!getToken();
    if(r.status===401){ if(calApiMode && authToken) expireSession(); else setToken(null); }
    if(!r.ok){
      return r.json().catch(function(){ return {}; }).then(function(b){
        var err = new Error(expired ? '로그인이 만료됐어요. 다시 로그인해 주세요.' : (typeof b.detail==='string' ? b.detail : (apiDetailText(b.detail) || '요청에 실패했어요 ('+r.status+')')));
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
/* 로그인 전/로그아웃 상태: 서버 연결 없이 비어 있는 상태로 되돌린다 */
function enterLoggedOutState(){
  calApiMode = false; calProjectsLoaded = true;
  wsResetForSessionChange();
  stopChat();
  meetingDocs = []; renderMeetingDocs();
  resetCalToday(true);
  clearCalendarState();
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
  if(typeof saSyncAccess === 'function') saSyncAccess();      // 관리자라면 메뉴·배지 표시
  setTimeout(liveConnect, 400);                     // 로그인한 상태에서 실시간 연결 시작
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

