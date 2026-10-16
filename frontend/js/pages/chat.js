/* ---- team chat (프로젝트별 채팅 + AI 일정 감지) ---- */
var chatProject = null;      // 프런트 프로젝트 id ('p3')
var chatMsgs = [];           // 서버 메시지
var chatLocal = [];          // 이 세션에서만 보이는 안내 말풍선
var chatSig = '';
var chatTimer = null;
var chatBusy = false;
var chatNoteSig = null;
function chatServerId(){ var m = /^p(\d+)$/.exec(chatProject || ''); return m ? parseInt(m[1], 10) : null; }
function chatSeenKey(){ return 'sync_chat_seen_'+(currentUser ? currentUser.id : 'x')+'_'+chatProject; }
function chatSeenId(){ try{ return parseInt(localStorage.getItem(chatSeenKey()) || '0', 10); }catch(e){ return 0; } }
function chatMarkSeen(){
  var max = chatMsgs.reduce(function(a, m){ return Math.max(a, m.id); }, 0);
  try{ localStorage.setItem(chatSeenKey(), String(max)); }catch(e){}
}
var CHAT_COLORS = ['#3B82F6','#8B5CF6','#EC4899','#06B6D4','#F59E0B','#10B981'];
function chatColor(key){ var n = 0; String(key).split('').forEach(function(c){ n += c.charCodeAt(0); }); return CHAT_COLORS[n % CHAT_COLORS.length]; }
function fmtChatTime(iso){
  var d = new Date(iso); if(isNaN(d)) return '';
  var h = d.getHours(), m = d.getMinutes();
  return (h<12 ? '오전 ' : '오후 ')+(h%12===0 ? 12 : h%12)+':'+pad2(m);
}
function chatPanelOpen(){ return document.getElementById('chatPanel').classList.contains('open'); }
/* 채팅 패널: 넓은 화면에서는 본문 옆에 붙여서(도킹) 화면을 가리지 않고, 좁은 화면에서만 위에 겹쳐 띄운다 */
function chatCanDock(){ return (window.innerWidth / (window.__uiScale || 1)) >= 960; }
function syncChatDock(){
  var app = document.querySelector('.app');
  var open = chatPanelOpen();
  var dock = open && chatCanDock();
  if(app) app.classList.toggle('chat-docked', dock);
  document.body.classList.toggle('chat-docked', dock);
  document.body.classList.toggle('chat-open', open);
  setTimeout(function(){ if(window.monaco && monacoEditor) monacoEditor.layout(); }, 300);
}
window.addEventListener('resize', function(){ if(chatPanelOpen()) syncChatDock(); });
function toggleChat(){
  document.getElementById('chatPanel').classList.toggle('open');
  syncChatDock();
  if(chatPanelOpen()){ chatForceBottom = true; renderChatHeader(); renderAiGuide(); chatScrollBottom(false); loadChat(true).then(function(){ chatScrollBottom(false); }); setTimeout(function(){ var i = document.getElementById('chatMsgInput'); if(i) i.focus(); }, 200); }
}
/* ---- AI 사용법 (채팅 옆 패널에 정리) ---- */
function aiGuideCollapsed(){
  // 사용자가 직접 접거나 펼친 적이 있으면 그 선택을 따르고, 처음에는 대화가 쌓이기 전까지만 펼쳐 둔다
  try {
    var v = localStorage.getItem('sync_ai_guide_collapsed');
    if (v === '1') return true;
    if (v === '0') return false;
  } catch(e){}
  return chatMsgs.filter(function(m){ return m.kind === 'user'; }).length >= 4;
}
function toggleAiGuide(){
  var g = document.getElementById('aiGuide');
  var c = g.classList.toggle('collapsed');
  try { localStorage.setItem('sync_ai_guide_collapsed', c ? '1' : '0'); } catch(e){}
}
function fillChatInput(text){
  var i = document.getElementById('chatMsgInput');
  if(!i) return;
  i.value = text; i.focus();
  i.setSelectionRange(text.length, text.length);
}
function renderAiGuide(){
  var g = document.getElementById('aiGuide'), body = document.getElementById('aiGuideBody');
  if(!g || !body) return;
  g.classList.toggle('collapsed', aiGuideCollapsed());
  var n = myAiName || '두레';
  body.innerHTML = '';
  function h(t){ var e = document.createElement('h5'); e.textContent = t; body.appendChild(e); }
  function ul(items){
    var u = document.createElement('ul');
    items.forEach(function(html){ var li = document.createElement('li'); li.innerHTML = html; u.appendChild(li); });
    body.appendChild(u);
  }
  function chips(list){
    var r = document.createElement('div'); r.className = 'ai-chip-row';
    list.forEach(function(t){ var b = document.createElement('button'); b.className = 'ai-chip'; b.textContent = t; b.onclick = function(){ fillChatInput(t); }; r.appendChild(b); });
    body.appendChild(r);
  }
  function esc(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  h('AI 부르기');
  ul(['메시지 맨 앞에 이름을 붙이면 돼요: <code>' + esc(n) + '야 …</code> 또는 <code>@' + esc(n) + ' …</code>', '명령어는 외울 필요 없어요. <b>평소 말투</b>로 시키면 AI가 알아서 판단해요.']);
  h('이런 것을 시킬 수 있어요 (눌러서 입력)');
  chips([n + '야 이번 주 마감이 뭐야?', n + '야 내가 맡은 일 알려줘', n + '야 어제 회의 내용 요약해줘', n + '야 다음 주 화요일 3시에 중간발표 일정 잡아줘', n + '야 그 일정 4시로 바꿔줘', n + '야 오늘 대화 정리해서 회의록 만들어줘']);
  h('안전장치');
  ul(['일정 추가·수정·회의록 생성은 <b>바로 실행</b>하고, <b>되돌리기</b> 버튼이 나와요.', '<b>삭제</b>는 항상 확인 카드로 한 번 더 물어봐요. (부른 사람만 누를 수 있어요)', '이름을 붙이지 않은 평소 대화에는 AI가 아무것도 바꾸지 않아요.']);
  h('자동으로 해줘요');
  ul(['대화에서 <b>"제가 금요일까지 할게요"</b>처럼 담당·기한이 나오면 일정 카드가 생겨요. 눌러서 캘린더에 추가!']);
  var p = document.createElement('p'); p.style.marginTop = '8px';
  p.innerHTML = 'AI 이름은 <button class="ai-guide-link" onclick="openProfileModal()">프로필 설정</button>에서 바꿀 수 있어요.';
  body.appendChild(p);
}
function renderChatHeader(){
  var sel = document.getElementById('chatProjectSel');
  if(!sel) return;
  var members = document.getElementById('chatMembers');
  var invite = document.getElementById('chatInviteBtn');
  sel.innerHTML = '';
  if(!calApiMode){
    var o = document.createElement('option'); o.textContent = '팀 채팅'; sel.appendChild(o); sel.disabled = true;
    members.textContent = '로그인하면 팀 채팅을 쓸 수 있어요'; invite.hidden = true; var rn0 = document.getElementById('chatRenameBtn'); if(rn0) rn0.hidden = true;
    document.getElementById('chatAvatar').textContent = '팀';
    return;
  }
  sel.disabled = false;
  if(!myProjects.length){
    var o2 = document.createElement('option'); o2.textContent = '프로젝트 없음'; sel.appendChild(o2); sel.disabled = true;
    members.textContent = '프로젝트를 만들면 팀원과 대화할 수 있어요'; invite.hidden = true; var rn1 = document.getElementById('chatRenameBtn'); if(rn1) rn1.hidden = true;
    document.getElementById('chatAvatar').textContent = '팀';
    return;
  }
  if(!chatProject || !calProjectById(chatProject)) chatProject = calDefaultProject() || myProjects[0].id;
  myProjects.forEach(function(pr){
    var op = document.createElement('option'); op.value = pr.id; op.textContent = pr.title;
    if(pr.id===chatProject) op.selected = true;
    sel.appendChild(op);
  });
  var cur = calProjectById(chatProject);
  document.getElementById('chatAvatar').textContent = (cur.title || '팀').slice(0, 1);
  var names = (cur.members || []).map(function(mm){ return mm.username; });
  members.textContent = (names.length ? names.length + '명' : '나 혼자') + ' · 어디서든 이어서 대화해요';
  chatRenderPresence();
  invite.hidden = !cur.isOwner;
  var rn = document.getElementById('chatRenameBtn'); if(rn) rn.hidden = !cur.isOwner;
}
/* 채팅방 팀원 접속 상태: 머리말에 팀원 아바타(상태 점) + "N명 접속 중", 말풍선 아바타의 점도 같이 갱신 */
function chatRenderPresence(){
  var box = document.getElementById('chatPresence'), label = document.getElementById('chatMembers');
  if(!box || !label) return;
  var cur = (calApiMode && chatProject) ? calProjectById(chatProject) : null;
  if(!cur){ box.hidden = true; box.innerHTML = ''; return; }
  var members = (cur.members && cur.members.length) ? cur.members : (currentUser ? [{ id:currentUser.id, username:myProfile.name || '나' }] : []);
  var rank = { online:0, dnd:1, away:2, offline:3 }, on = 0;
  var list = members.map(function(m){ var st = pstOf(m.id); if(st !== 'offline') on++; return { m:m, st:st }; })
    .sort(function(a, b){ return rank[a.st] - rank[b.st]; });
  box.innerHTML = '';
  list.slice(0, 8).forEach(function(x){
    var me = currentUser && x.m.id === currentUser.id;
    var a = document.createElement('span'); a.className = 'chat-pav'; a.dataset.pst = x.st;
    a.style.background = me ? '#06B6D4' : chatColor(x.m.username); a.textContent = String(x.m.username || '?').slice(0, 1);
    a.title = x.m.username + (me ? ' (나)' : '') + ' · ' + PST_META[x.st].label;
    box.appendChild(a);
  });
  if(list.length > 8){ var more = document.createElement('span'); more.className = 'chat-pmore'; more.textContent = '+' + (list.length - 8); box.appendChild(more); }
  box.hidden = false;
  label.textContent = on + '명 접속 중 · 총 ' + members.length + '명';
  document.querySelectorAll('#chatPanel .mavatar[data-uid]').forEach(function(av){ av.dataset.pst = pstOf(av.dataset.uid); });
}
function switchChatProject(id){
  chatProject = id; chatMsgs = []; chatSig = ''; CHAT_TYPING = {}; chatForceBottom = true;
  renderChatHeader(); renderChat(); loadChat(true);
}
function updateChatBadge(){
  var badge = document.getElementById('chatBadge');
  if(!badge) return;
  var seen = chatSeenId();
  var mine = currentUser ? currentUser.id : -1;
  var unread = chatMsgs.filter(function(m){ return m.id > seen && m.user_id !== mine; }).length;
  badge.hidden = !(calApiMode && unread > 0 && !chatPanelOpen());
  badge.textContent = unread > 9 ? '9+' : String(unread);
}
function loadChat(force){
  var sid = chatServerId();
  if(!calApiMode || !sid || chatBusy) return Promise.resolve();
  chatBusy = true;
  return apiFetch('/api/projects/'+sid+'/messages').then(function(rows){
    var sig = rows.map(function(m){
      var x = m.meta || {};
      return m.id+(m.meta ? ':'+(x.status || '')
        +(x.actions ? ':'+x.actions.map(function(a){ return a.undone ? 'u' : 'd'; }).join('') : '')
        +(x.confirms ? ':'+x.confirms.map(function(c){ return c.status; }).join('') : '') : '');
    }).join(',');
    var changed = sig !== chatSig;
    // AI 가 회의록을 만들거나 지웠으면 회의록 목록도 새로 불러온다 (처음 로드는 제외)
    var noteSig = rows.filter(function(m){ return m.kind==='ai' && m.meta; }).map(function(m){
      return (m.meta.actions || []).filter(function(a){ return a.type==='note_added'; }).map(function(a){ return a.id+(a.undone?'u':''); }).join(',')
        +(m.meta.confirms || []).filter(function(c){ return c.action==='delete_note'; }).map(function(c){ return c.status; }).join(',');
    }).join('|');
    if(chatNoteSig !== null && noteSig !== chatNoteSig) refreshMeetingDocs();
    chatNoteSig = noteSig;
    chatSig = sig; chatMsgs = rows;
    if(changed || force){
      renderChat();
      if(changed) refreshTeamEvents();
    }
    if(chatPanelOpen()) chatMarkSeen();
    updateChatBadge();
  }).catch(function(){}).then(function(){ chatBusy = false; });
}
function refreshTeamEvents(){
  if(!calApiMode) return;
  apiFetch('/api/calendar/events').then(function(rows){
    calendarEvents = rows.map(serverEventToLocal);
    syncCandidateStatus();
    renderCalendarEvents(); renderCalSelector(); renderDetectCard(); wgLiveToday();
  }).catch(function(){});
}
function startChat(){
  renderChatHeader();
  chatMsgs = []; chatSig = ''; chatNoteSig = null;
  loadChat(true);
  if(chatTimer) clearInterval(chatTimer);
  var chatTick = 0;
  chatTimer = setInterval(function(){ chatTick++; if(!document.hidden && (!LIVE.ok || chatTick % 8 === 0)) loadChat(false); }, 3000);   // 실시간 연결이 있으면 가끔만 확인
}
function stopChat(){
  if(typeof leaveCall === 'function') leaveCall(true);
  if(chatTimer){ clearInterval(chatTimer); chatTimer = null; }
  chatMsgs = []; chatLocal = []; chatSig = ''; chatProject = null;
  renderChatHeader(); renderChat(); updateChatBadge();
}
/* AI 답변의 **굵게**, `코드`, 목록(-, *)을 안전하게(텍스트 노드로만) 표시 */
function renderAiText(el, text){
  el.textContent = '';
  String(text || '').split('\n').forEach(function(line, i){
    if(i > 0) el.appendChild(document.createElement('br'));
    var m = /^\s*[-*•]\s+(.*)$/.exec(line);
    if(m){ el.appendChild(document.createTextNode('• ')); line = m[1]; }
    var re = /(\*\*[^*]+\*\*|`[^`]+`)/g, last = 0, t;
    while((t = re.exec(line)) !== null){
      if(t.index > last) el.appendChild(document.createTextNode(line.slice(last, t.index)));
      var tok = t[0], node;
      if(tok.charAt(0) === '`'){ node = document.createElement('code'); node.textContent = tok.slice(1, -1); node.style.cssText = 'font-family:var(--font-mono); font-size:.92em; background:var(--surface-3); padding:1px 5px; border-radius:5px;'; }
      else { node = document.createElement('strong'); node.textContent = tok.slice(2, -2); }
      el.appendChild(node);
      last = t.index + tok.length;
    }
    if(last < line.length) el.appendChild(document.createTextNode(line.slice(last)));
  });
}
/* AI 가 한 일: 되돌리기 / 삭제 확인 카드 (AI 를 부른 사람에게만 버튼이 보인다) */
var AI_ACT_LABEL = {event_added:'일정 추가', event_updated:'일정 수정', note_added:'회의록 생성'};
function appendAiActions(col, m){
  var meta = m.meta || {};
  var mine = !!(currentUser && meta.requester_id === currentUser.id);
  (meta.actions || []).forEach(function(a, i){
    var row = document.createElement('div'); row.className = 'ai-act';
    var lbl = document.createElement('span'); lbl.className = 'ai-act-lbl';
    lbl.textContent = (AI_ACT_LABEL[a.type] || '작업') + ' · ' + a.title;
    row.appendChild(lbl);
    if(a.undone){ var done = document.createElement('span'); done.className = 'ai-act-state'; done.textContent = '↩️ 되돌림'; row.appendChild(done); }
    else if(mine){
      var b = document.createElement('button'); b.className = 'ai-act-btn'; b.textContent = '되돌리기';
      b.onclick = function(){ b.disabled = true; aiActionCall(m, 'undo', i); };
      row.appendChild(b);
    }
    col.appendChild(row);
  });
  (meta.confirms || []).forEach(function(c, i){
    var card = document.createElement('div'); card.className = 'ai-confirm';
    var t = document.createElement('div'); t.className = 'ai-confirm-t'; t.textContent = '🗑️ 삭제 확인 · ' + c.label; card.appendChild(t);
    if(c.status === 'pending'){
      if(mine){
        var yes = document.createElement('button'); yes.className = 'ai-act-btn danger'; yes.textContent = '삭제';
        var no = document.createElement('button'); no.className = 'ai-act-btn'; no.textContent = '취소';
        yes.onclick = function(){ yes.disabled = no.disabled = true; aiActionCall(m, 'confirm', i); };
        no.onclick = function(){ yes.disabled = no.disabled = true; aiActionCall(m, 'cancel', i); };
        var r = document.createElement('div'); r.className = 'ai-confirm-r'; r.appendChild(yes); r.appendChild(no); card.appendChild(r);
      } else {
        var w = document.createElement('div'); w.className = 'ai-act-state'; w.textContent = 'AI를 부른 사람의 확인을 기다리고 있어요'; card.appendChild(w);
      }
    } else {
      var st = document.createElement('div'); st.className = 'ai-act-state';
      st.textContent = c.status === 'cancelled' ? '취소했어요 — 삭제하지 않았어요' : (c.result || '처리했어요');
      card.appendChild(st);
    }
    col.appendChild(card);
  });
}
function aiActionCall(m, verb, index){
  var sid = chatServerId();
  apiFetch('/api/projects/'+sid+'/messages/'+m.id+'/'+verb+'/'+index, {method:'POST'}).then(function(){
    refreshTeamEvents(); refreshMeetingDocs();
    return loadChat(true);
  }).catch(function(e){ if(e.status!==401) pushToast('⚠️','처리하지 못했어요', e.message); loadChat(true); });
}
function refreshMeetingDocs(){
  if(!calApiMode) return;
  apiFetch('/api/meetings').then(function(rows){
    meetingDocs = rows.map(docFromServer);
    meetingDocs.forEach(function(d){ detectCache[d.id] = d.raw; });
    renderMeetingDocs();
  }).catch(function(){});
}
function buildMsgRow(m){
  var isAi = (m.kind === 'ai' || m.author === 'sync AI' || m.author === 'Dure AI');
  var mine = !isAi && currentUser && m.user_id === currentUser.id;
  var row = document.createElement('div');
  row.className = 'msg-row' + (mine ? ' me' : '') + (isAi ? ' ai-msg' : '');
  var av = document.createElement('div'); av.className = 'mavatar';
  if(isAi){
    av.className += ' ai-av';
  } else {
    av.style.background = mine ? '#06B6D4' : chatColor(m.author);
    av.textContent = (mine ? '나' : m.author).slice(0, 1);
    if(m.user_id != null){ av.dataset.uid = m.user_id; av.dataset.pst = pstOf(m.user_id); }
  }
  var col = document.createElement('div'); col.className = 'msg-col';
  var nm = document.createElement('span'); nm.className = 'msg-name'; nm.textContent = isAi ? ((m.meta && m.meta.ai_name) || 'Dure AI') : (mine ? '나' : m.author);
  var bubble = document.createElement('div'); bubble.className = 'bubble';
  if(isAi){
    bubble.style.background = 'var(--bg-elev)';
    bubble.style.border = '1px solid var(--border)';
    bubble.style.whiteSpace = 'pre-wrap';
    bubble.style.lineHeight = '1.6';
  }
  if(isAi) renderAiText(bubble, m.text); else bubble.textContent = m.text;
  col.appendChild(nm); col.appendChild(bubble);
  if(isAi && m.meta) appendAiActions(col, m);
  var tm = document.createElement('span'); tm.className = 'msg-time'; tm.textContent = fmtChatTime(m.created_at);
  col.appendChild(tm);
  row.appendChild(av); row.appendChild(col);
  return row;
}
function buildDetectBubble(m){
  var meta = m.meta || {};
  var div = document.createElement('div'); div.className = 'sys-bubble';
  var lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = '🤖 AI 일정 감지'; div.appendChild(lbl);
  var info = {start:meta.start_date, end:meta.end_date, startTime:meta.start_time, endTime:meta.end_time};
  var txt = document.createElement('span');
  txt.textContent = (meta.assignee ? meta.assignee+'님이 ' : '')+'"'+meta.title+'" 일정을 맡았어요 · '+fmtRange(info)+(meta.status==='pending' ? ' — 캘린더에 추가할까요?' : '');
  div.appendChild(txt);
  var row = document.createElement('div'); row.className = 'row';
  var btn = document.createElement('button');
  if(meta.status==='added'){ btn.textContent = '✓ 캘린더에 추가됨'; btn.disabled = true; row.appendChild(btn); }
  else {
    btn.textContent = '캘린더에 추가';
    btn.onclick = function(){ btn.disabled = true; applyChatDetection(m); };
    var no = document.createElement('button'); no.className = 'ghost'; no.textContent = '무시';
    no.onclick = function(){ dismissChatDetection(m); };
    row.appendChild(btn); row.appendChild(no);
  }
  div.appendChild(row);
  return div;
}
function renderChat(){
  var scroll = document.getElementById('chatScroll');
  if(!scroll) return;
  var nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
  scroll.innerHTML = '';
  if(!calApiMode){
    scroll.innerHTML = "<div class='chat-empty'>로그인하면 프로젝트 팀원과 대화할 수 있어요.<br>대화에서 \"제가 금요일까지 할게요\"처럼 담당과 기한이 나오면 AI가 캘린더에 올려줘요.</div>";
  } else if(!chatServerId()){
    scroll.innerHTML = "<div class='chat-empty'>프로젝트를 만들면 이곳에서 팀원과 대화할 수 있어요.</div>";
  } else if(!chatMsgs.length && !chatLocal.length){
    scroll.innerHTML = "<div class='chat-empty'>아직 대화가 없어요.<br>첫 메시지를 보내보세요. 담당과 기한이 나오는 대화는 AI가 캘린더에 올려줘요.</div>";
  } else {
    chatMsgs.forEach(function(m){
      if(m.kind==='ai_detect'){ if(m.meta && m.meta.status!=='dismissed') scroll.appendChild(buildDetectBubble(m)); }
      else scroll.appendChild(buildMsgRow(m));
    });
    chatLocal.forEach(function(el){ scroll.appendChild(el); });
    if(chatAiWait){
      var answered = chatMsgs.some(function(m){ return m.kind==='ai' && m.id > chatAiWait.after; });
      if(answered || Date.now() - chatAiWait.since > 45000){ chatAiWait = null; }
      else {
        var typing = document.createElement('div'); typing.className = 'msg-row ai-msg';
        typing.innerHTML = "<div class='mavatar ai-av'></div><div class='typing-dots'><span></span><span></span><span></span></div>";
        scroll.appendChild(typing);
      }
    }
  }
  chatRenderTyping(true);
  if(nearBottom || chatForceBottom || chatMsgs.length<=1) chatScrollBottom(chatForceBottom);
  if(chatMsgs.length || chatLocal.length) chatForceBottom = false;     // 글이 실제로 그려질 때까지는 '맨 아래로' 요청을 유지
  chatUpdateJump();
}
/* ---- 맨 아래로 내려가기 ---- */
var chatForceBottom = false;
var chatAiWait = null;       // AI 답변을 기다리는 중이면 {after, since} (선언이 없어 renderChat 이 중간에 오류로 멈추고 스크롤이 안 내려가던 원인)
function chatScrollBottom(smooth){
  var sc = document.getElementById('chatScroll'); if(!sc) return;
  var go = function(){ sc.scrollTop = sc.scrollHeight; };      // 바로 내려간다 (부드러운 스크롤은 중간에 멈추는 경우가 있어 쓰지 않음)
  go(); requestAnimationFrame(go); setTimeout(go, 60); setTimeout(go, 320);          // 글이 그려진 뒤에도 한 번 더 (높이가 늦게 정해지는 경우)
}
function chatUpdateJump(){
  var sc = document.getElementById('chatScroll'), btn = document.getElementById('chatJump'); if(!sc || !btn) return;
  btn.hidden = (sc.scrollHeight - sc.scrollTop - sc.clientHeight) < 120;
}
/* ---- 상대방이 입력 중일 때 말풍선 점 세 개 ---- */
var CHAT_TYPING = {};            // 사용자 id → { name, until }
var chatTypingTimer = null;
function chatTypingEvent(m){
  if(!m || m.project_id !== chatServerId() || (currentUser && m.user_id === currentUser.id)) return;
  if(m.on) CHAT_TYPING[m.user_id] = { name:m.name || '팀원', until:Date.now() + 5500 }; else delete CHAT_TYPING[m.user_id];
  chatRenderTyping(false);
}
function chatTypingClear(uid){ if(CHAT_TYPING[uid]){ delete CHAT_TYPING[uid]; chatRenderTyping(false); } }
function chatRenderTyping(fromRender){
  var sc = document.getElementById('chatScroll'); if(!sc) return;
  var now = Date.now(), ids = Object.keys(CHAT_TYPING).filter(function(id){ if(CHAT_TYPING[id].until <= now){ delete CHAT_TYPING[id]; return false; } return true; });
  var near = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 90;
  var shown = ids.slice(0, 3), have = Array.prototype.map.call(sc.querySelectorAll('.typing-row'), function(e){ return e.dataset.uid; });
  var same = have.length === shown.length && have.every(function(u, i){ return u === String(shown[i]); });
  if(!same){ sc.querySelectorAll('.typing-row').forEach(function(e){ e.remove(); }); }   // 같은 사람이면 다시 그리지 않는다 (애니메이션이 매번 처음부터 도는 것 방지)
  if(!same) shown.forEach(function(id){
    var t = CHAT_TYPING[id], row = document.createElement('div'); row.className = 'msg-row typing-row'; row.dataset.uid = id;
    var av = document.createElement('div'); av.className = 'mavatar'; av.style.background = chatColor(t.name); av.textContent = String(t.name).slice(0, 1);
    var col = document.createElement('div'); col.className = 'msg-col';
    var nm = document.createElement('span'); nm.className = 'msg-name'; nm.textContent = t.name + '님이 입력 중';
    var dots = document.createElement('div'); dots.className = 'typing-dots'; dots.innerHTML = '<span></span><span></span><span></span>';
    col.appendChild(nm); col.appendChild(dots); row.appendChild(av); row.appendChild(col); sc.appendChild(row);
  });
  if(!same && ids.length && near && !fromRender) chatScrollBottom(true);
  clearTimeout(chatTypingTimer);
  if(ids.length) chatTypingTimer = setTimeout(function(){ chatRenderTyping(false); }, 1000);   // 5초 동안 신호가 없으면 사라진다
  chatUpdateJump();
}
/* 내가 입력하는 동안 팀원 화면에 '입력 중' 신호 (2.5초에 한 번만) */
var chatTypingSentAt = 0, chatTypingOn = false;
function chatMyTyping(){
  var sid = chatServerId(), input = document.getElementById('chatMsgInput');
  if(!sid || !input) return;
  if(!input.value.trim()){ chatStopTyping(); return; }
  var now = Date.now();
  if(now - chatTypingSentAt > 2500 && liveSend({ t:'typing', project_id:sid, on:true })){ chatTypingSentAt = now; chatTypingOn = true; }
}
function chatStopTyping(){
  if(!chatTypingOn) return;
  chatTypingOn = false; chatTypingSentAt = 0;
  var sid = chatServerId(); if(sid) liveSend({ t:'typing', project_id:sid, on:false });
}
function applyChatDetection(m){
  var sid = chatServerId();
  apiFetch('/api/projects/'+sid+'/messages/'+m.id+'/apply', {method:'POST'}).then(function(row){
    var ev = serverEventToLocal(row);
    if(!calendarEvents.some(function(e){ return e.id===ev.id; })) calendarEvents.push(ev);
    renderCalendarEvents(); renderCalSelector();
    pushToast('✅','캘린더에 추가됨', (m.meta.assignee ? m.meta.assignee+' · ' : '')+m.meta.title+' · '+fmtRange({start:m.meta.start_date, end:m.meta.end_date, startTime:m.meta.start_time, endTime:m.meta.end_time}));
    return loadChat(true);
  }).catch(function(e){ pushToast('⚠️','일정을 추가하지 못했어요', e.message); renderChat(); });
}
function dismissChatDetection(m){
  var sid = chatServerId();
  apiFetch('/api/projects/'+sid+'/messages/'+m.id+'/dismiss', {method:'POST'}).then(function(){ return loadChat(true); }).catch(function(){});
}
function appendMyMessage(val, tagLabel){
  // 게스트(서버 없음)일 때의 임시 표시
  var el = buildMsgRow({user_id: currentUser ? currentUser.id : -1, author:'나', text:val, created_at:new Date().toISOString()});
  if(tagLabel){ var tag = document.createElement('span'); tag.className='chip accent2'; tag.style.marginTop='2px'; tag.textContent = tagLabel; el.querySelector('.msg-col').appendChild(tag); }
  chatLocal.push(el); chatForceBottom = true; renderChat();
  return el;
}
function appendTypingBubble(){
  var scroll = document.getElementById('chatScroll');
  var row = document.createElement('div');
  row.className='msg-row';
  row.innerHTML = "<div class='mavatar' style='background:var(--accent-2);'>AI</div><div class='typing-dots'><span></span><span></span><span></span></div>";
  scroll.appendChild(row);
  scroll.scrollTop = scroll.scrollHeight;
  return row;
}
function appendSystemBubble(icon, label, text, withBtn){
  var div = document.createElement('div');
  div.className='sys-bubble';
  div.innerHTML = "<span class='lbl'></span><span></span>";
  div.querySelector('.lbl').textContent = icon+' '+label;
  div.querySelector('.lbl + span').textContent = text;
  if(withBtn){
    var btn = document.createElement('button');
    btn.textContent='회의록에서 보기';
    btn.onclick = function(){ goView('notes'); };
    div.appendChild(btn);
  }
  chatLocal.push(div); renderChat();
}
function sendChatMsg(){
  var input = document.getElementById('chatMsgInput');
  var val = input.value.trim();
  if(!val) return;
  input.value='';
  chatStopTyping();
  chatForceBottom = true;        // 내가 보내면 항상 맨 아래로

  var sid = chatServerId();
  if(calApiMode && sid){
    apiFetch('/api/projects/'+sid+'/messages', {method:'POST', body:JSON.stringify({text:val})}).then(function(msg){
      try{
      chatMsgs.push(msg); chatSig += (chatSig ? ',' : '')+msg.id;
      var waitAi = isAiRequest(val);
      if(waitAi) chatAiWait = {after: msg.id, since: Date.now()};
      chatForceBottom = true; renderChat(); chatMarkSeen();
      // AI 가 대화를 분석/답변하는 동안(백그라운드) 몇 번 더 확인해서 일정 카드·답변이 바로 뜨게 한다
      (waitAi ? [1500, 3000, 5000, 8000, 12000, 18000, 28000] : [1500, 3500, 7000]).forEach(function(t){ setTimeout(function(){ loadChat(true); }, t); });
      }catch(uiErr){ console.error(uiErr); }   // 화면 갱신 오류는 '전송 실패'가 아님 (메시지는 이미 저장됨)
    }, function(e){ if(e.status!==401) pushToast('⚠️','메시지를 보내지 못했어요', e.message); input.value = val; });
    return;
  }
  // 게스트/프로젝트 없음: 이 화면에서만 보이는 임시 대화
  if(!calApiMode) pushToast('🔒','로그인 후 팀 채팅이 저장돼요','지금은 이 화면에서만 보이는 임시 대화예요');
  appendMyMessage(val, null);
}
