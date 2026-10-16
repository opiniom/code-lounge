/* ---- 팀 통화방 (WebRTC: 팀원 브라우저끼리 직접 연결 → 지연 최소, 서버는 연결 신호만 중계) ----
   디스코드처럼 프로젝트마다 여러 방: '기본 통화방'은 프로젝트 이름을 따라가고, 나머지는 팀원이 만든다. */
var call = { ws:null, sid:null, roomKey:null, selfId:null, peers:{}, pcs:{}, pendingIce:{}, stream:null, muted:false, joined:false, connecting:false,
             rooms:[], relay:false, ice:null, statsTimer:null, meterTimer:null, rtt:null, ctx:null, analysers:{}, max:6, maxRooms:8 };
function callOpen(){ return document.getElementById('callPanel').classList.contains('open'); }
function toggleCall(){
  var panel = document.getElementById('callPanel');
  panel.classList.toggle('open');
  if(callOpen()){ pollCallRoster(); }
  renderCall();
}
/* 통화방은 항상 '지금 채팅 중인 프로젝트'의 것만 보여준다.
   프로젝트를 바꾸면: 통화 중이던 방에서 자동으로 나오고, 새 프로젝트의 통화방 목록으로 바뀐다 (다른 프로젝트와 섞이지 않게) */
function callSyncProject(){
  var sid = chatServerId();
  if((call.joined || call.connecting || call.ws) && call.sid && call.sid !== sid){
    var from = callProjectTitle();
    leaveCall(true);
    pushToast('📞', '통화방에서 나왔어요', '「' + from + '」 통화에서 나왔어요. 프로젝트를 바꿔서 「' + callProjectTitle() + '」의 통화방으로 바뀌었어요.', { duration:4200 });
  }
  if(call.shownSid !== sid){ call.shownSid = sid; call.rooms = []; call.roomKey = call.joined ? call.roomKey : null; renderCall(); pollCallRoster(); }
}
function callColor(name){ return chatColor(name || '?'); }
function callProjectTitle(){
  var cur = calProjectById(call.sid ? 'p'+call.sid : chatProject);
  return cur ? cur.title : '프로젝트';
}
function callSupported(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); }
function callRoomList(){
  // 서버에서 받은 목록. 아직 못 받았으면 '기본 통화방'만 프로젝트 이름으로 보여준다
  if(call.rooms && call.rooms.length) return call.rooms;
  return [{key:'main', name:callProjectTitle(), default:true, can_delete:false, participants:[]}];
}
function callRoomName(key){
  var r = callRoomList().filter(function(x){ return x.key === key; })[0];
  return r ? r.name : '통화방';
}
function callLivePeople(){
  var rows = [{id:'self', name:(myProfile.name || '나') + ' (나)', muted:call.muted, st:''}];
  Object.keys(call.peers).forEach(function(id){
    var p = call.peers[id];
    rows.push({id:id, name:p.name, muted:p.muted, st: p.state === 'connected' ? '' : (p.state === 'failed' ? '연결 실패' : '연결 중…')});
  });
  return rows;
}
function personRow(r){
  var el = document.createElement('div'); el.className = 'call-p'; el.setAttribute('data-peer', r.id);
  var av = document.createElement('div'); av.className = 'av'; av.style.background = callColor(r.name); av.textContent = String(r.name).slice(0, 1);
  var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = r.name;
  var st = document.createElement('div'); st.className = 'st'; st.textContent = (r.muted ? '🔇 ' : '') + (r.st || '');
  el.appendChild(av); el.appendChild(nm); el.appendChild(st);
  return el;
}
function renderCall(){
  var list = document.getElementById('callList'), status = document.getElementById('callStatus'),
      ctrl = document.getElementById('callCtrl'), foot = document.getElementById('callFoot'),
      badge = document.getElementById('callBadge'), tab = document.getElementById('callTab'),
      create = document.getElementById('callCreate');
  if(!list) return;
  var sid = chatServerId() || call.sid;
  var can = !!(calApiMode && sid);
  document.getElementById('callProj').textContent = can ? callProjectTitle() : '로그인 후 사용할 수 있어요';
  var rooms = can ? callRoomList() : [];
  // 방 목록
  list.innerHTML = '';
  var total = 0;
  rooms.forEach(function(rm){
    var isMine = call.joined && call.roomKey === rm.key;
    var people = isMine ? callLivePeople() : (rm.participants || []).filter(function(p){ return !(call.joined && currentUser && p.user_id === currentUser.id); }).map(function(p){ return {id:'r'+rm.key+'-'+p.user_id, name:p.name, muted:p.muted, st:''}; });
    total += people.length;
    var box = document.createElement('div'); box.className = 'call-room' + (isMine ? ' joined' : ''); box.setAttribute('data-room', rm.key);
    var head = document.createElement('div'); head.className = 'call-room-head';
    var rn = document.createElement('span'); rn.className = 'rn'; rn.textContent = '🔊 ' + rm.name; rn.title = rm.name;
    head.appendChild(rn);
    if(rm.default){ var tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = '기본'; head.appendChild(tg); }
    var cnt = document.createElement('span'); cnt.className = 'cnt'; cnt.textContent = people.length ? people.length + '/' + call.max : ''; head.appendChild(cnt);
    if(isMine){ var me = document.createElement('span'); me.className = 'tag'; me.textContent = '통화 중'; head.appendChild(me); }
    else {
      var jb = document.createElement('button'); jb.className = 'call-room-btn';
      jb.textContent = (call.joined || call.connecting) ? '이동' : '참여';
      jb.disabled = call.connecting || people.length >= call.max;
      jb.onclick = function(){ joinCall(rm.key); };
      head.appendChild(jb);
    }
    if(rm.can_delete){
      var del = document.createElement('button'); del.className = 'call-room-del'; del.title = '방 삭제'; del.textContent = '🗑';
      del.onclick = function(){ deleteCallRoom(rm); };
      head.appendChild(del);
    }
    box.appendChild(head);
    var ppl = document.createElement('div'); ppl.className = 'call-room-people';
    people.forEach(function(r){ ppl.appendChild(personRow(r)); });
    box.appendChild(ppl);
    list.appendChild(box);
  });
  // 상태 문구
  if(!calApiMode){ status.textContent = '로그인하면 프로젝트 팀원과 음성으로 바로 통화할 수 있어요.'; }
  else if(!sid){ status.textContent = '프로젝트를 만들면 팀원 전용 통화방을 쓸 수 있어요.'; }
  else if(call.connecting){ status.textContent = '연결하는 중…'; }
  else if(call.joined){ var n = callLivePeople().length; status.textContent = '「' + callRoomName(call.roomKey) + '」 ' + n + '명 통화 중' + (n === 1 ? ' · 팀원이 들어오면 바로 들려요' : ''); }
  else if(total){ status.textContent = total + '명이 통화 중이에요. 방을 골라 참여해 보세요!'; }
  else { status.textContent = '지금 통화 중인 팀원이 없어요. 방에 들어가서 팀원을 불러보세요.'; }
  // 방 만들기
  var customCount = rooms.filter(function(r){ return !r.default; }).length;
  create.hidden = !can || customCount >= call.maxRooms;
  // 버튼 (통화 중일 때만)
  ctrl.innerHTML = '';
  function mk(cls, html, fn){ var b = document.createElement('button'); b.className = 'btn ' + cls; b.innerHTML = html; b.onclick = fn; ctrl.appendChild(b); }
  if(call.joined){
    mk('call-btn-mute' + (call.muted ? ' off' : ''), call.muted ? '🔇 음소거됨' : '🎤 마이크 켜짐', toggleMute);
    mk('call-btn-leave', '나가기', function(){ leaveCall(false); });
  }
  // 푸터
  foot.innerHTML = '';
  function line(html){ var d = document.createElement('div'); d.innerHTML = html; foot.appendChild(d); }
  if(call.joined){
    var q = call.rtt == null ? '' : (call.rtt < 80 ? 'good' : (call.rtt < 200 ? 'mid' : 'bad'));
    line('지연 <b class="call-q ' + q + '">' + (call.rtt == null ? '측정 중…' : Math.round(call.rtt) + 'ms') + '</b> · 팀원과 직접 연결 · 이어폰을 쓰면 울림이 줄어요');
  } else {
    line('이 프로젝트 팀원에게만 들려요 · 방마다 최대 ' + call.max + '명 · 마이크 권한이 필요해요');
  }
  if(can && !call.relay) line('<span class="call-note">⚠️ 다른 장소(다른 네트워크)에서는 연결이 안 될 수 있어요. 서버에 중계(TURN) 설정이 필요해요.</span>');
  // 탭 배지
  badge.hidden = !total; badge.textContent = total;
  if(tab) tab.classList.toggle('live', total > 0);
}
function callMicError(e){
  if(!callSupported()) return '이 주소에서는 마이크를 쓸 수 없어요. https 또는 localhost 주소로 접속해 주세요.';
  var n = e && e.name;
  if(n === 'NotAllowedError' || n === 'SecurityError') return '마이크 권한이 꺼져 있어요. 주소창 왼쪽 자물쇠에서 마이크를 허용해 주세요.';
  if(n === 'NotFoundError' || n === 'OverconstrainedError') return '사용할 수 있는 마이크를 찾지 못했어요.';
  return '마이크를 켜지 못했어요: ' + ((e && e.message) || n || '알 수 없는 오류');
}
async function joinCall(roomKey){
  roomKey = (typeof roomKey === 'string' && roomKey) ? roomKey : 'main';
  if(call.connecting) return;
  if(call.joined && call.roomKey === roomKey) return;
  var sid = call.sid || chatServerId();
  if(!calApiMode || !sid){ pushToast('🔒','로그인과 프로젝트가 필요해요','프로젝트를 선택한 뒤 통화방에 들어올 수 있어요.'); return; }
  if(!callSupported()){ pushToast('🎤','통화를 시작할 수 없어요', callMicError()); return; }
  var moving = call.joined;
  if(moving){ sid = call.sid; cleanupCall(null); }      // 방 이동: 이전 방에서 먼저 나온다
  call.connecting = true; call.sid = sid; call.roomKey = roomKey; renderCall();
  try {
    call.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1 }, video:false });
  } catch(e){
    call.connecting = false; call.sid = null; call.roomKey = null; renderCall();
    pushToast('🎤','마이크를 켜지 못했어요', callMicError(e));
    return;
  }
  // 연결 서버(STUN/TURN) 설정은 서버에서 받는다
  try { call.ice = await apiFetch('/api/call/ice'); call.relay = !!call.ice.relay; } catch(e){ call.ice = {iceServers:[{urls:'stun:stun.l.google.com:19302'}], relay:false}; }
  var ws = new WebSocket(API_BASE.replace(/^http/, 'ws') + '/ws/call/' + sid + '/' + encodeURIComponent(roomKey));
  call.ws = ws;
  ws.onopen = function(){ ws.send(JSON.stringify({type:'auth', token:authToken})); };
  ws.onmessage = function(ev){ try { handleCallMsg(JSON.parse(ev.data)); } catch(e){ console.error(e); } };
  ws.onclose = function(){ if(call.ws === ws && (call.joined || call.connecting)) cleanupCall('통화방 연결이 끊겼어요.'); };
  ws.onerror = function(){};
}
function callSend(obj){ if(call.ws && call.ws.readyState === 1) call.ws.send(JSON.stringify(obj)); }
function handleCallMsg(m){
  if(m.type === 'welcome'){
    call.selfId = m.id; call.max = m.max || 6; call.roomKey = m.room || call.roomKey; call.joined = true; call.connecting = false; call.peers = {};
    (m.peers || []).forEach(function(p){ call.peers[p.id] = {name:p.name, muted:p.muted, state:'connecting'}; });
    // 새로 들어온 쪽이 기존 참가자 모두에게 연결을 건다
    (m.peers || []).forEach(function(p){ createPeer(p.id, true); });
    if(call.muted) callSend({type:'state', muted:true});
    startCallLoops(); renderCall();
    pushToast('📞','통화방에 들어왔어요', callRoomName(call.roomKey));
  } else if(m.type === 'peer-joined'){
    call.peers[m.peer.id] = {name:m.peer.name, muted:m.peer.muted, state:'connecting'};
    renderCall();
  } else if(m.type === 'peer-left'){
    closePeer(m.id); delete call.peers[m.id]; renderCall();
  } else if(m.type === 'state'){
    if(call.peers[m.id]){ call.peers[m.id].muted = !!m.muted; renderCall(); }
  } else if(m.type === 'signal'){
    handleCallSignal(m.from, m.data);
  } else if(m.type === 'kicked' || m.type === 'error'){
    cleanupCall(m.message || '통화방에서 나왔어요.');
  }
}
function createPeer(id, initiator){
  if(call.pcs[id]) return call.pcs[id];
  var servers = (call.ice && call.ice.iceServers) || [{urls:'stun:stun.l.google.com:19302'}];
  var pc = new RTCPeerConnection({ iceServers: servers, bundlePolicy:'max-bundle' });
  call.pcs[id] = pc; call.pendingIce[id] = [];
  call.stream.getTracks().forEach(function(t){
    var sender = pc.addTrack(t, call.stream);
    try { var pr = sender.getParameters(); pr.encodings = pr.encodings && pr.encodings.length ? pr.encodings : [{}]; pr.encodings[0].maxBitrate = 32000; pr.encodings[0].priority = 'high'; pr.encodings[0].networkPriority = 'high'; sender.setParameters(pr); } catch(e){}
  });
  pc.onicecandidate = function(e){ if(e.candidate) callSend({type:'signal', to:id, data:{candidate:e.candidate}}); };
  pc.ontrack = function(e){ attachRemote(id, e.streams[0], e.receiver); };
  var retries = 0;
  function retryIce(){
    // 연결을 건 쪽만 ICE 를 다시 시작한다 (네트워크가 잠깐 불안정했을 때 스스로 복구)
    if(!initiator || retries >= 3 || call.pcs[id] !== pc || pc.connectionState === 'connected' || pc.connectionState === 'closed') return;
    retries++; try { pc.restartIce(); } catch(e){}
  }
  pc.onconnectionstatechange = function(){
    if(call.peers[id]){ call.peers[id].state = pc.connectionState; renderCall(); }
    if(pc.connectionState === 'failed'){
      retryIce();
      if(!call.relay && call.pcs[id] === pc) pushToast('🌐','연결이 어려워요','서로 다른 네트워크라서 직접 연결이 안 될 수 있어요. 서버에 중계(TURN) 설정이 필요해요.');
    }
    else if(pc.connectionState === 'disconnected') setTimeout(function(){ if(pc.connectionState === 'disconnected') retryIce(); }, 4000);
  };
  setTimeout(retryIce, 8000);   // 8초 안에 연결이 안 되면 한 번 더 시도
  if(initiator){
    pc.onnegotiationneeded = async function(){
      try {
        var offer = await pc.createOffer();
        offer.sdp = tuneOpus(offer.sdp);
        await pc.setLocalDescription(offer);
        callSend({type:'signal', to:id, data:{sdp:pc.localDescription}});
      } catch(e){ console.error(e); }
    };
  }
  return pc;
}
async function handleCallSignal(from, data){
  if(!call.joined) return;
  var pc = call.pcs[from] || createPeer(from, false);
  try {
    if(data.sdp){
      await pc.setRemoteDescription(data.sdp);
      var q = call.pendingIce[from] || []; call.pendingIce[from] = [];
      for(var i = 0; i < q.length; i++){ try { await pc.addIceCandidate(q[i]); } catch(e){} }
      if(data.sdp.type === 'offer'){
        var answer = await pc.createAnswer();
        answer.sdp = tuneOpus(answer.sdp);
        await pc.setLocalDescription(answer);
        callSend({type:'signal', to:from, data:{sdp:pc.localDescription}});
      }
    } else if(data.candidate){
      if(pc.remoteDescription && pc.remoteDescription.type) await pc.addIceCandidate(data.candidate);
      else (call.pendingIce[from] = call.pendingIce[from] || []).push(data.candidate);
    }
  } catch(e){ console.error('signal', e); }
}
/* 음성에 맞춘 Opus 설정: 모노 32kbps, 손실 복구(FEC) 켜고 DTX 끔(말 시작이 잘리지 않게) */
function tuneOpus(sdp){
  var m = /a=rtpmap:(\d+) opus\/48000\/2/.exec(sdp);
  if(!m) return sdp;
  return sdp.replace(new RegExp('(a=fmtp:' + m[1] + ' )([^\\r\\n]*)'), function(_, head, params){
    var keep = params.split(';').filter(function(x){ return x && !/^(maxaveragebitrate|stereo|sprop-stereo|usedtx|useinbandfec|minptime)=/.test(x); });
    keep.push('minptime=10', 'useinbandfec=1', 'usedtx=0', 'stereo=0', 'sprop-stereo=0', 'maxaveragebitrate=32000');
    return head + keep.join(';');
  });
}
function attachRemote(id, stream, receiver){
  // 재생 지연을 최소로 (브라우저가 지원하는 경우)
  try { receiver.playoutDelayHint = 0; } catch(e){}
  try { receiver.jitterBufferTarget = 30; } catch(e){}
  var box = document.getElementById('callAudio');
  var old = document.getElementById('callAudio-' + id); if(old) old.remove();
  var a = document.createElement('audio'); a.id = 'callAudio-' + id; a.autoplay = true; a.setAttribute('playsinline', ''); a.srcObject = stream;
  box.appendChild(a);
  a.play().catch(function(){});
  watchSpeaking(id, stream);
}
function watchSpeaking(id, stream){
  try {
    call.ctx = call.ctx || new (window.AudioContext || window.webkitAudioContext)();
    var src = call.ctx.createMediaStreamSource(stream);
    var an = call.ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
    call.analysers[id] = {an:an, src:src, buf:new Uint8Array(an.fftSize)};
  } catch(e){}
}
function levelOf(entry){
  entry.an.getByteTimeDomainData(entry.buf);
  var sum = 0; for(var i = 0; i < entry.buf.length; i++){ var v = (entry.buf[i] - 128) / 128; sum += v * v; }
  return Math.sqrt(sum / entry.buf.length);
}
function startCallLoops(){
  stopCallLoops();
  watchSpeaking('self', new MediaStream(call.stream.getAudioTracks()));
  call.meterTimer = setInterval(function(){
    Object.keys(call.analysers).forEach(function(id){
      var el = document.querySelector('#callList [data-peer="' + id + '"]');
      if(!el) return;
      var speaking = levelOf(call.analysers[id]) > 0.03 && !(id === 'self' && call.muted);
      el.classList.toggle('speaking', speaking);
    });
  }, 120);
  call.statsTimer = setInterval(async function(){
    var worst = null;
    var ids = Object.keys(call.pcs);
    for(var i = 0; i < ids.length; i++){
      try {
        var rep = await call.pcs[ids[i]].getStats();
        rep.forEach(function(r){
          if(r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && typeof r.currentRoundTripTime === 'number'){
            var ms = r.currentRoundTripTime * 1000; if(worst === null || ms > worst) worst = ms;
          }
        });
      } catch(e){}
    }
    if(worst !== null){ call.rtt = worst; if(callOpen()) renderCall(); }
  }, 2000);
}
function stopCallLoops(){
  if(call.meterTimer){ clearInterval(call.meterTimer); call.meterTimer = null; }
  if(call.statsTimer){ clearInterval(call.statsTimer); call.statsTimer = null; }
  Object.keys(call.analysers).forEach(function(id){ try { call.analysers[id].src.disconnect(); } catch(e){} });
  call.analysers = {};
}
function closePeer(id){
  var pc = call.pcs[id]; if(pc){ try { pc.close(); } catch(e){} }
  delete call.pcs[id]; delete call.pendingIce[id];
  var a = document.getElementById('callAudio-' + id); if(a) a.remove();
  if(call.analysers[id]){ try { call.analysers[id].src.disconnect(); } catch(e){} delete call.analysers[id]; }
}
function toggleMute(){
  call.muted = !call.muted;
  if(call.stream) call.stream.getAudioTracks().forEach(function(t){ t.enabled = !call.muted; });
  callSend({type:'state', muted:call.muted});
  renderCall();
}
function cleanupCall(message){
  stopCallLoops();
  Object.keys(call.pcs).forEach(closePeer);
  if(call.stream){ call.stream.getTracks().forEach(function(t){ t.stop(); }); }
  var ws = call.ws; call.ws = null;
  if(ws){ try { ws.close(); } catch(e){} }
  call.stream = null; call.joined = false; call.connecting = false; call.peers = {}; call.selfId = null; call.sid = null; call.roomKey = null; call.rtt = null;
  renderCall();
  if(message) pushToast('📞','통화가 끝났어요', message);
}
function leaveCall(silent){
  if(!call.joined && !call.connecting && !call.ws) return;
  cleanupCall(silent ? null : '통화방에서 나왔어요.');
  if(!silent) pollCallRoster();
}
/* 통화방 목록·누가 어느 방에 있는지: 입장 전에도, 통화 중에도(다른 방/이름 변경 반영) 가끔 확인한다 */
function pollCallRoster(){
  var sid = call.sid || chatServerId();
  if(!calApiMode || !sid){ call.rooms = []; renderCall(); return Promise.resolve(); }
  return apiFetch('/api/projects/' + sid + '/call').then(function(r){
    call.rooms = r.rooms || [];
    call.max = r.max || call.max; call.maxRooms = r.max_rooms || call.maxRooms; call.relay = !!r.relay;
    // 기본 통화방 이름 = 프로젝트 이름. 다른 팀원이 프로젝트 이름을 바꿨다면 내 화면(채팅 헤더·워크스페이스 등)도 같이 맞춘다
    var main = call.rooms.filter(function(x){ return x.default; })[0], cur = calProjectById('p' + sid);
    if(main && cur && cur.title !== main.name){
      cur.title = main.name;
      renderChatHeader(); renderWsSelector(); renderWsHeader(); if(typeof renderProjRow === 'function') renderProjRow(); syncCalProjects();
    }
    renderCall();
  }).catch(function(){});
}
setInterval(function(){ if(!document.hidden) pollCallRoster(); }, 5000);
/* 방 만들기 / 삭제 */
function toggleCreateRoom(){
  var f = document.getElementById('callCreateForm'), b = document.getElementById('callCreateBtn');
  f.hidden = !f.hidden; b.hidden = !f.hidden;
  if(!f.hidden) setTimeout(function(){ document.getElementById('callNewRoomName').focus(); }, 50);
}
var callCreating = false;
function submitCreateRoom(){
  var inp = document.getElementById('callNewRoomName');
  var name = inp.value.trim();
  var sid = call.sid || chatServerId();
  if(!name || !sid || callCreating) return;
  callCreating = true;
  apiFetch('/api/projects/' + sid + '/call/rooms', {method:'POST', body:JSON.stringify({name:name})}).then(function(r){
    inp.value = ''; toggleCreateRoom();
    pushToast('🔊','통화방을 만들었어요', r.name);
    return pollCallRoster();
  }).catch(function(e){ if(e.status !== 401) pushToast('⚠️','통화방을 만들지 못했어요', e.message); }).then(function(){ callCreating = false; });
}
function deleteCallRoom(rm){
  if(!confirm("'" + rm.name + "' 통화방을 삭제할까요?\n방에 있는 사람은 통화에서 나가게 돼요.")) return;
  var sid = call.sid || chatServerId();
  apiFetch('/api/projects/' + sid + '/call/rooms/' + rm.key, {method:'DELETE'}).then(function(){
    pushToast('🗑️','통화방을 삭제했어요', rm.name);
    return pollCallRoster();
  }).catch(function(e){ if(e.status !== 401) pushToast('⚠️','삭제하지 못했어요', e.message); });
}
/* 프로젝트(워크스페이스) 이름 변경 — 채팅·워크스페이스·기본 통화방 이름이 함께 바뀐다 */
var renameBusy = false;
function openRenameProject(){
  var cur = calProjectById(chatProject);
  if(!calApiMode || !cur || cur.isOwner === false){ pushToast('ℹ️','프로젝트 소유자만 이름을 바꿀 수 있어요',''); return; }
  var i = document.getElementById('renameProjectInput'); i.value = cur.title;
  document.getElementById('renameProjectModal').classList.add('open');
  setTimeout(function(){ i.focus(); i.select(); }, 100);
}
function closeRenameProject(){ document.getElementById('renameProjectModal').classList.remove('open'); }
function submitRenameProject(){
  var sid = chatServerId(), title = document.getElementById('renameProjectInput').value.trim();
  var cur = calProjectById(chatProject);
  if(!sid || !title || renameBusy) return;
  if(cur && cur.title === title){ closeRenameProject(); return; }
  renameBusy = true;
  apiFetch('/api/projects/' + sid, {method:'PATCH', body:JSON.stringify({title:title})}).then(function(row){
    closeRenameProject();
    return loadCalProjects().then(function(){
      renderChatHeader(); renderWsSelector(); renderWsHeader(); syncCalProjects();
      return pollCallRoster();
    }).then(function(){ pushToast('✏️','프로젝트 이름을 바꿨어요', '「' + row.title + '」 · 기본 통화방 이름도 함께 바뀌었어요'); });
  }).catch(function(e){ if(e.status !== 401) pushToast('⚠️','이름을 바꾸지 못했어요', e.message); }).then(function(){ renameBusy = false; });
}
renderCall();

