// 통화방(frontend/js/pages/call.js)·효과음(sfx.js)·채팅 효과음 로직 테스트 — node 만 있으면 돼요 (브라우저 없이 가짜 소켓·가짜 시계로 실행).
// 실행: node tests/test_call_client.js  (프로젝트 루트에서)
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.dirname(__dirname);
const R = []; const chk = (n, c, x) => R.push([n, !!c, x]);
// ---- 가짜 시계
let now = 1000000, timers = [], seq = 0;
const fakeSetTimeout = (fn, ms) => { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn, every: null }); return id; };
const fakeSetInterval = (fn, ms) => { const id = ++seq; timers.push({ id, at: now + ms, fn, every: ms }); return id; };
const clear = id => { timers = timers.filter(t => t.id !== id); };
async function advance(ms) {
  const end = now + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at); const t = timers[0];
    if (!t || t.at > end) break;
    now = t.at; if (t.every) t.at += t.every; else timers.shift(); await t.fn(); await Promise.resolve();
  }
  now = end; await Promise.resolve();
}
// ---- 아무 속성이나 받아 주는 가짜 화면 요소
const stub = new Proxy(function () {}, { get: (t, p) => (p === Symbol.toPrimitive ? () => '' : (p === 'length' ? 0 : (p === 'then' ? undefined : stub))), apply: () => stub, set: () => true, construct: () => stub });
// ---- 가짜 웹소켓
const sockets = [];
class FakeWS {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); fakeSetTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 5); }
  send(d) { this.sent.push(JSON.parse(d)); } close() { this.readyState = 3; }
  recv(o) { this.onmessage && this.onmessage({ data: JSON.stringify(o) }); }
  drop(code) { this.readyState = 3; this.onclose && this.onclose({ code: code || 1006 }); }
}
const sounds = [], toasts = [];
const track = { enabled: true, stopped: false, onended: null, stop() { this.stopped = true; } };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
const listeners = {};
const ctx = {
  console, setTimeout: fakeSetTimeout, setInterval: fakeSetInterval, clearTimeout: clear, clearInterval: clear, Date: { now: () => now }, JSON, Math, Object, Array, Promise, Uint8Array, Symbol, encodeURIComponent, parseInt, String, RegExp, Error,
  document: Object.assign(Object.create(stub), { hidden: false, getElementById: () => stub, querySelector: () => stub, querySelectorAll: () => [], createElement: () => stub, addEventListener: (e, f) => { (listeners['d:' + e] = listeners['d:' + e] || []).push(f); } }),
  navigator: { mediaDevices: { getUserMedia: async () => stream } },
  RTCPeerConnection: class { constructor() { this.connectionState = 'new'; } addTrack() { return { getParameters: () => ({}), setParameters() {} }; } close() {} },
  WebSocket: FakeWS, MediaStream: class { constructor() {} }, AudioContext: class {},
  API_BASE: 'http://h', authToken: 'tok', calApiMode: true, currentUser: { id: 7 }, myProfile: { name: '나' }, chatProject: 'p1',
  chatServerId() { return /^p(\d+)$/.test(ctx.chatProject) ? +ctx.chatProject.slice(1) : null; }, chatColor: () => '#888', isEnter: () => false,
  calProjectById: id => ({ id, title: 'P' + id, members: [] }), apiFetch: async u => (u.indexOf('/api/call/ice') >= 0 ? { iceServers: [], relay: false } : { rooms: [{ key: 'main', name: 'A', default: true, can_delete: false, participants: [] }], max: 6, max_rooms: 8, relay: false }),
  pushToast: (a, b, c) => toasts.push(b), sfxPlay: n => sounds.push(n), renderChatHeader() {}, renderWsSelector() {}, renderWsHeader() {}, renderProjRow() {}, syncCalProjects() {},
  addEventListener: (e, f) => { (listeners['w:' + e] = listeners['w:' + e] || []).push(f); },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'frontend/js/pages/call.js'), 'utf8'), ctx, { filename: 'call.js' });
const call = vm.runInContext('call', ctx);
const run = c => vm.runInContext(c, ctx);
const lastSock = () => sockets[sockets.length - 1];
(async () => {
  // 입장
  await run("joinCall('main')"); await advance(10);
  chk('입장: /ws/call/프로젝트/방 으로 연결하고 첫 메시지로 로그인 토큰을 보낸다', sockets[0].url === 'ws://h/ws/call/1/main' && sockets[0].sent[0].type === 'auth' && sockets[0].sent[0].token === 'tok', sockets[0].url);
  sockets[0].recv({ type: 'welcome', id: 'a', peers: [], max: 6, room: 'main' });
  chk('입장하면 들어가는 소리(join)가 난다', call.joined && sounds.join() === 'join', sounds);
  // ---- 연결이 그냥 끊겼을 때: 통화 유지 + 자동 재연결
  sockets[0].drop(1006);
  chk('연결이 끊겨도 통화를 끝내지 않는다 (마이크 유지·재연결 상태)', call.joined && call.reconnecting && !track.stopped, { joined: call.joined, re: call.reconnecting });
  await advance(400);
  chk('0.2초 뒤 자동으로 다시 연결을 시도한다', sockets.length === 2 && sockets[1].url === sockets[0].url, sockets.length);
  sockets[1].recv({ type: 'welcome', id: 'b', peers: [{ id: 'c', name: '팀원', muted: false }], max: 6, room: 'main' });
  chk('다시 연결되면 같은 방으로 돌아오고 팀원 목록을 새로 받는다 (나가는 소리·들어오는 소리는 나지 않는다)', call.joined && !call.reconnecting && Object.keys(call.peers).join() === 'c' && sounds.join() === 'join', sounds);
  // ---- 프로젝트를 바꿔도 통화는 유지
  run("chatProject = 'p2'; callSyncProject();");
  chk('채팅·워크스페이스에서 프로젝트를 바꿔도 통화는 끊기지 않고 통화 중인 프로젝트에 고정된다', call.joined && call.sid === 1 && run('callActiveSid()') === 1, { sid: call.sid });
  run("chatProject = 'p1'");
  // ---- 팀원 입장/퇴장 소리
  lastSock().recv({ type: 'peer-joined', peer: { id: 'd', name: '둘째', muted: false } }); lastSock().recv({ type: 'peer-left', id: 'd' }); lastSock().recv({ type: 'peer-left', id: 'zzz' });
  chk('팀원이 들어오면/나가면 각각 소리가 난다 (없는 사람의 퇴장은 소리 없음)', sounds.join() === 'join,peerjoin,peerleave', sounds);
  run('toggleMute()'); run('toggleMute()');
  chk('마이크 끄기/켜기 소리', sounds.slice(-2).join() === 'mute,unmute', sounds);
  // ---- 서버가 일부러 내보냄: 재연결하지 않는다
  const n = sockets.length;
  lastSock().recv({ type: 'kicked', message: '다른 곳에서 들어왔어요' });
  await advance(10000);
  chk('다른 곳에서 접속해 내보내진 경우(kicked)는 재연결하지 않고 통화를 끝낸다 (나가는 소리)', !call.joined && !call.reconnecting && sockets.length === n && track.stopped && sounds[sounds.length - 1] === 'leave', { n: sockets.length - n });
  // ---- 계속 실패하면 8번 시도 뒤 끝낸다
  track.stopped = false; sounds.length = 0;
  await run("joinCall('main')"); await advance(10); lastSock().recv({ type: 'welcome', id: 'e', peers: [], max: 6, room: 'main' }); lastSock().drop(1006);
  const base = sockets.length; let attempts = 0, t = 0;
  while ((call.joined || call.reconnecting) && t < 60000) { await advance(100); t += 100; const s = lastSock(); if (s.readyState === 1 && sockets.length - base === attempts + 1) { attempts++; s.drop(1006); } }
  chk('재연결이 계속 실패하면 8번까지 점점 간격을 늘려 시도한 뒤 통화를 끝낸다(약 26초)', !call.joined && attempts === 8 && t > 20000 && t < 40000, { attempts, t });
  chk('  ㄴ 끝낼 때 마이크를 끄고 나가는 소리가 난다', track.stopped && sounds.join() === 'join,leave', sounds);
  // ---- 입장 전에 끊기면(재연결 없이) 실패 안내
  toasts.length = 0; track.stopped = false;
  await run("joinCall('main')"); await advance(10); lastSock().drop(1006);
  chk('입장하기 전에(환영 메시지 전에) 연결이 끊기면 재연결하지 않고 실패 안내', !call.joined && !call.reconnecting && toasts.some(x => /통화가 끝났어요/.test(x)), toasts);
  // ---- 죽은 연결(조용히 끊김) 감지
  await run("joinCall('main')"); await advance(10); lastSock().recv({ type: 'welcome', id: 'f', peers: [], max: 6, room: 'main' });
  const s0 = lastSock(); await advance(15100);
  chk('통화 중 15초마다 ping 을 보낸다', s0.sent.some(m => m.type === 'ping'), s0.sent.map(m => m.type));
  s0.recv({ type: 'pong' }); await advance(15100);   // 응답이 오면 정상
  chk('pong 이 오는 동안은 연결을 끊지 않는다', call.joined && !call.reconnecting && lastSock() === s0);
  await advance(15100); await advance(15100);        // ping 을 보냈는데 응답이 없다
  chk('ping 에 20초 넘게 응답이 없으면 죽은 연결로 보고 자동으로 다시 연결한다', call.reconnecting || lastSock() !== s0, { re: call.reconnecting });
  // ---- 인터넷이 돌아오면 바로 다시 연결 시도
  run('cleanupCall(null)'); sounds.length = 0;
  // ---- 효과음(sfx.js)
  const ac = []; const gains = [];
  const sctx = {
    console, setTimeout: fakeSetTimeout, Date: { now: () => now }, Math, document: Object.assign(Object.create(stub), { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [] }), localStorage: { _v: {}, getItem(k) { return this._v[k] === undefined ? null : this._v[k]; }, setItem(k, v) { this._v[k] = String(v); } },
    pushToast() {}, pstOf: () => 'online', currentUser: { id: 7 },
    AudioContext: class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
      createOscillator() { const o = { frequency: { value: 0 }, connect() {}, start() { ac.push(o.frequency.value); }, stop() {} }; return o; }
      createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; } resume() { return Promise.resolve(); } },
  };
  sctx.window = sctx; vm.createContext(sctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'frontend/js/core/sfx.js'), 'utf8'), sctx, { filename: 'sfx.js' });
  vm.runInContext('SFX.unlocked = true', sctx);
  vm.runInContext("sfxPlay('message')", sctx);
  chk('sfx: 새 채팅 소리는 두 음(톡-또옥)으로 난다', ac.length === 2 && ac[0] < ac[1], ac);
  ac.length = 0; vm.runInContext("sfxPlay('message')", sctx);
  chk('sfx: 너무 자주(0.6초 안에) 울리지 않는다', ac.length === 0, ac);
  now += 700; vm.runInContext("sfxPlay('join')", sctx);
  chk('sfx: 내가 들어가는 소리는 세 음이 올라간다', ac.length === 3 && ac[0] < ac[1] && ac[1] < ac[2], ac);
  ac.length = 0; vm.runInContext("sfxPlay('leave')", sctx);
  chk('sfx: 내가 나가는 소리는 세 음이 내려간다', ac.length === 3 && ac[0] > ac[1] && ac[1] > ac[2], ac);
  ac.length = 0; now += 700; vm.runInContext("localStorage.setItem('sync_sfx','0'); sfxPlay('message')", sctx);
  chk('sfx: 효과음을 끄면 소리가 나지 않는다', ac.length === 0, ac);
  vm.runInContext("localStorage.setItem('sync_sfx','1')", sctx); vm.runInContext('SFX.unlocked = false; SFX.ctx.state = "suspended"', sctx); ac.length = 0; now += 700; vm.runInContext("sfxPlay('peerjoin')", sctx);
  chk('sfx: 화면을 한 번도 누르기 전(브라우저가 소리를 막는 상태)에는 조용히 건너뛴다(에러 없음)', ac.length === 0);
  // ---- 정적 확인
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/manifest.json'), 'utf8')).js;
  chk('화면 묶음에 sfx.js 가 call.js·chat.js 보다 먼저 들어 있다', man.indexOf('js/core/sfx.js') >= 0 && man.indexOf('js/core/sfx.js') < man.indexOf('js/pages/chat.js') && man.indexOf('js/core/sfx.js') < man.indexOf('js/pages/call.js'));
  const ws = fs.readFileSync(path.join(ROOT, 'frontend/js/pages/workspace.js'), 'utf8');
  chk('폴더 가져오기 뒤에는 가져온 그 프로젝트를 다시 불러온다 (다른 프로젝트로 옮겨 가서 통화가 끊기던 문제)', /wsProject === pid && pid && calProjectById\(pid\)\) \{ wsLoaded = false; loadWorkspace\(pid\)/.test(ws));
  const bad = R.filter(x => !x[1]);
  bad.forEach(x => console.log('FAIL:', x[0], '→', JSON.stringify(x[2])));
  console.log(`${R.length - bad.length}/${R.length} 통과`); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
