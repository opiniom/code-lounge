/* ---- 실시간 연결 (WebSocket /ws/live) ----
   서버가 바뀌는 순간 알려준다: 알림 · 채팅 · 일정 · 회의록 · 프로젝트/팀원 · 팀원 접속 상태.
   연결이 되어 있으면 화면이 서버에 계속 물어보는(폴링) 횟수를 크게 줄이고, 끊기면 예전처럼 폴링으로 돌아간다. */
var LIVE = { ws:null, ok:false, retry:0, ping:null, reconnect:null, closing:false };

function liveUrl(){
  var base = String(API_BASE || location.origin).replace(/^http/i, 'ws').replace(/\/+$/, '');
  return base + '/ws/live?token=' + encodeURIComponent(authToken);
}
function liveConnect(){
  if(!authToken || !calApiMode || LIVE.ws || !('WebSocket' in window)) return;
  var ws;
  try { ws = new WebSocket(liveUrl()); } catch(e){ return; }
  LIVE.ws = ws; LIVE.closing = false;
  ws.onopen = function(){
    LIVE.ok = true; LIVE.retry = 0;
    clearInterval(LIVE.ping); LIVE.ping = setInterval(function(){ try { ws.send('ping'); } catch(e){} }, 25000);
    liveResync();
  };
  ws.onmessage = function(ev){
    if(ev.data === 'pong') return;
    var m; try { m = JSON.parse(ev.data); } catch(e){ return; }
    liveHandle(m);
  };
  ws.onclose = function(){
    LIVE.ok = false; LIVE.ws = null; clearInterval(LIVE.ping);
    if(typeof wsLiveLost === 'function') wsLiveLost();      // 실시간 편집 중이었다면 일반 저장으로 돌아간다
    if(LIVE.closing || !authToken) return;
    var wait = Math.min(30000, 1000 * Math.pow(2, Math.min(LIVE.retry++, 5)));   // 1s, 2s, 4s … 최대 30s
    clearTimeout(LIVE.reconnect); LIVE.reconnect = setTimeout(liveConnect, wait);
  };
  ws.onerror = function(){ try { ws.close(); } catch(e){} };
}
function liveDisconnect(){
  LIVE.closing = true; LIVE.ok = false; clearInterval(LIVE.ping); clearTimeout(LIVE.reconnect);
  if(LIVE.ws){ try { LIVE.ws.close(); } catch(e){} }
  LIVE.ws = null;
}
/* 연결(또는 재연결) 직후: 그 사이 놓친 변경을 한 번 맞춰 둔다 */
function liveResync(){
  loadNotifications(true); pstLoadTeam();
  apiFetch('/api/meetings').then(function(rows){ liveSeenDocs = {}; rows.forEach(function(r){ liveSeenDocs[r.id] = 1; }); }).catch(function(){});
  if(chatServerId()) loadChat(false);
  if(typeof wsPresStart === 'function' && wsPresInWorkspace()) wsPresStart();      // 재연결되면 내 작업 위치를 다시 알린다
  if(typeof wsLiveRejoin === 'function') wsLiveRejoin();                           // 실시간 편집도 다시 붙는다
}
/* 팀원이 회의록을 만들면 목록에 바로 올리고, 새 글이면 한 번만 조용히 알려준다 */
var liveSeenDocs = null;
function liveNotes(m){
  if(!calApiMode) return;
  apiFetch('/api/meetings').then(function(rows){
    var fresh = [];
    if(liveSeenDocs){ rows.forEach(function(r){ if(!liveSeenDocs[r.id] && r.author_id !== (currentUser && currentUser.id)) fresh.push(r); }); }
    liveSeenDocs = {}; rows.forEach(function(r){ liveSeenDocs[r.id] = 1; });
    meetingDocs = rows.map(docFromServer);
    meetingDocs.forEach(function(d){ detectCache[d.id] = d.raw; });
    renderMeetingDocs(); if(typeof wgLiveNotes === 'function') wgLiveNotes(); if(typeof mpRefreshSoon === 'function') mpRefreshSoon();
    if(fresh.length){ var r = fresh[0]; pushToast('📝', (r.author || '팀원') + '님이 회의록을 올렸어요', r.title + (fresh.length > 1 ? ' 외 ' + (fresh.length - 1) + '개' : ''), { duration:3500, onclick:function(){ goView('notes'); } }); }
  }).catch(function(){});
}
/* 팀원 화면이 열려 있을 때만 다시 그린다 */
function tmRefresh(){ var v = document.querySelector('.view.active'); if(v && v.dataset.view === 'admin') renderTeamPage(); }
function liveSend(obj){ if(LIVE.ok && LIVE.ws && LIVE.ws.readyState === 1){ try { LIVE.ws.send(JSON.stringify(obj)); return true; } catch(e){} } return false; }
function liveHandle(m){
  switch(m.t){
    case 'presence':
      PST.team[String(m.user_id)] = m.status;
      if(typeof renderWsHeader === 'function' && calApiMode) renderWsHeader();
      renderDureOrbit(); chatRenderPresence(); tmRefresh(); if(typeof wgLiveTeam === 'function') wgLiveTeam();
      break;
    case 'notification': loadNotifications(true); break;
    case 'chat':
      if(m.from) chatTypingClear(m.from);                       // 방금 메시지를 보낸 사람은 '입력 중'이 끝난 것
      if(chatServerId()) loadChat(false);
      break;
    case 'aichat': if(typeof aiChatLive === 'function') aiChatLive(m); break;      // 나만 보는 AI 대화 (나에게만 온다)
    case 'typing': chatTypingEvent(m); break;
    case 'follow': pfLive(); break;
    case 'calendar': refreshTeamEvents(); break;
    case 'notes': liveNotes(m); break;
    case 'files': wsPollSoon(); break;
    case 'docsync': case 'docop': case 'docsaved': case 'docreset': case 'docerr': if(typeof wsLiveHandle === 'function') wsLiveHandle(m); break;
    case 'wspres': case 'wssnap': if(typeof wsPresHandle === 'function') wsPresHandle(m); break;
    case 'projects':
      if(typeof loadCalProjects === 'function') loadCalProjects().then(function(){ renderProjRow(); renderChatHeader(); pstLoadTeam(); tmRefresh(); }).catch(function(){});
      break;
  }
}
window.addEventListener('beforeunload', function(){ LIVE.closing = true; });
