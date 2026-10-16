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
  if(chatServerId()) loadChat(false);
}
function liveHandle(m){
  switch(m.t){
    case 'presence':
      PST.team[String(m.user_id)] = m.status;
      if(typeof renderWsHeader === 'function' && calApiMode) renderWsHeader();
      renderDureOrbit(); chatRenderPresence();
      break;
    case 'notification': loadNotifications(true); break;
    case 'chat': if(m.project_id && chatServerId() === m.project_id) loadChat(false); else if(chatServerId()) loadChat(false); break;
    case 'calendar': refreshTeamEvents(); break;
    case 'notes': refreshMeetingDocs(); break;
    case 'projects':
      if(typeof loadCalProjects === 'function') loadCalProjects().then(function(){ renderProjRow(); renderChatHeader(); pstLoadTeam(); }).catch(function(){});
      break;
  }
}
window.addEventListener('beforeunload', function(){ LIVE.closing = true; });
