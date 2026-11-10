/* =========================================================
   음성으로 AI 부르기
   ---------------------------------------------------------
   채팅 입력칸 옆 🎤 를 누르고 "두레야, 내일 오후 3시에 중간발표 일정 잡아줘" 처럼 말하면, 말이 글로 바뀌어 입력칸에 들어가고
   글로 쓴 것과 똑같이 처리된다 (AI 가 일정·회의록 등을 알아서 처리). 웹사이트와 설치한 앱(PWA) 모두 같다.
   · 말을 글로 바꾸는 방법 두 가지 (알아서 고른다)
       ① 브라우저의 음성 인식(Web Speech): 말하는 대로 실시간으로 글자가 나온다. 크롬·엣지·사파리 등.
       ② 녹음해서 서버로 보내 받아쓰기(/api/ai/transcribe): ①을 못 쓰는 곳(아이폰 홈 화면 앱, 파이어폭스 등). 말이 끝나면(1.4초 조용) 자동으로 끝낸다.
   · "두레야"로 시작하면(나만 보는 AI 대화는 항상) 1.6초 뒤에 자동으로 보낸다. 그 사이 [취소]를 누르거나 입력칸을 고치면 멈춘다. 그 밖의 말은 입력칸에만 넣어 두니 확인하고 보내면 된다.
   · 음성 인식이 "두레야"를 "두래야·두례야·듀레야"처럼 적어도 호출어로 알아듣게 고쳐 준다 (내가 정한 AI 이름도 글자 하나 차이까지).
   · 소리는 저장하지 않는다. 마이크 권한이 꺼져 있으면 켜는 방법을 알려 준다.
   서버: routers/voice.py · services/voice_ai.py
   ========================================================= */
var VOICE = { state: 'idle', mode: '', rec: null, stream: null, mr: null, chunks: [], ctx: null, raf: 0, maxT: 0, sendT: 0, hideT: 0, heard: false, lastVoice: 0, t0: 0, final: '', interim: '', err: '', chatMode: 'team', last: '' };

function voiceSpeechCtor(){ return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
function voiceIOSApp(){
  var ios = document.documentElement.classList.contains('is-ios') || /iPhone|iPad|iPod/i.test(navigator.userAgent);
  var standalone = window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  return ios && standalone;                      // 아이폰 홈 화면 앱: 브라우저 음성 인식이 막혀 있어서 녹음 방식을 쓴다
}
function voiceCanRecord(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); }
function voicePickMode(){
  if(voiceSpeechCtor() && !voiceIOSApp()) return 'speech';
  if(voiceCanRecord()) return 'record';
  return '';
}
function voiceInit(){
  var b = document.getElementById('chatMicBtn'); if(!b) return;
  b.hidden = !voicePickMode();                    // 어떤 방법도 못 쓰는 브라우저에서는 버튼을 숨긴다
}
function voiceEl(id){ return document.getElementById(id); }
function voiceSetBar(kind, text, opt){
  var bar = voiceEl('voiceBar'); if(!bar) return;
  clearTimeout(VOICE.hideT);
  opt = opt || {};
  bar.hidden = false; bar.className = 'voice-bar ' + kind;
  voiceEl('voiceText').textContent = text;
  var act = voiceEl('voiceActBtn');
  act.hidden = !opt.btn; act.textContent = opt.btn || '';
  var prog = voiceEl('voiceProg'); prog.style.animationDuration = (opt.prog || 0) + 'ms'; prog.hidden = !opt.prog;
  if(opt.prog){ prog.style.animation = 'none'; void prog.offsetWidth; prog.style.animation = ''; }
  if(opt.hide) VOICE.hideT = setTimeout(voiceHideBar, opt.hide);
  var mic = voiceEl('chatMicBtn'); if(mic){ var on = kind === 'listening'; mic.classList.toggle('on', on); mic.setAttribute('aria-pressed', on ? 'true' : 'false'); }
}
function voiceHideBar(){
  var bar = voiceEl('voiceBar'); if(bar) bar.hidden = true;
  var mic = voiceEl('chatMicBtn'); if(mic){ mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false'); }
}
function voiceLevel(v){ var l = voiceEl('voiceLevel'); if(l) l.style.setProperty('--lv', Math.max(0, Math.min(1, v)).toFixed(2)); }

/* ---------- 누르기 ---------- */
function voiceToggle(){
  if(VOICE.state === 'listening'){ voiceStop(); return; }          // 듣는 중에 다시 누르면 '끝내기'
  if(VOICE.state === 'confirm'){ voiceCancel(); return; }          // 보내기 전에 누르면 '취소'
  if(VOICE.state === 'working') return;
  voiceStart();
}
function voiceStart(){
  if(typeof authToken === 'undefined' || !authToken || typeof calApiMode === 'undefined' || !calApiMode){ pushToast('🔒', '로그인하면 말로 시킬 수 있어요', '로그인한 뒤 프로젝트를 열고 이용해 주세요.'); return; }
  var mode = voicePickMode();
  if(!mode){ pushToast('🎤', '이 브라우저에서는 음성 입력을 쓸 수 없어요', '키보드의 마이크(받아쓰기) 버튼을 쓰거나, 크롬·사파리에서 열어 주세요.'); return; }
  try{ if(!localStorage.getItem('sync_voice_notice')){ localStorage.setItem('sync_voice_notice', '1'); pushToast('🎤', '말하는 소리는 글로 바꾸는 데만 써요', mode === 'speech' ? '브라우저의 음성 인식 서비스가 처리해요. 저장하지 않아요.' : '글로 바꾼 뒤 바로 지워요. 저장하지 않아요.', { duration: 5200 }); } }catch(e){}
  VOICE.chatMode = (typeof chatMode !== 'undefined') ? chatMode : 'team';
  VOICE.final = ''; VOICE.interim = ''; VOICE.err = ''; VOICE.heard = false; VOICE.mode = mode; VOICE.t0 = Date.now();
  clearTimeout(VOICE.sendT);
  if(mode === 'speech') voiceStartSpeech(); else voiceStartRecord();
}

/* ---------- ① 브라우저 음성 인식 ---------- */
function voiceStartSpeech(){
  var R = voiceSpeechCtor(), rec;
  try{ rec = new R(); }catch(e){ if(voiceCanRecord()){ VOICE.mode = 'record'; voiceStartRecord(); } return; }
  VOICE.rec = rec; rec.lang = 'ko-KR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  rec.onstart = function(){ VOICE.state = 'listening'; voiceSetBar('listening', '듣고 있어요… 말씀하세요', { btn: '끝내기' }); VOICE.maxT = setTimeout(voiceStop, 20000); voiceLevel(.25); };
  rec.onresult = function(e){
    var fin = '', itm = '';
    for(var i = e.resultIndex; i < e.results.length; i++){ var tr = e.results[i][0].transcript; if(e.results[i].isFinal) fin += tr; else itm += tr; }
    VOICE.final += fin; VOICE.interim = itm; VOICE.heard = true;
    var live = (VOICE.final + itm).trim();
    voiceSetBar('listening', live ? '“' + live + '”' : '듣고 있어요… 말씀하세요', { btn: '끝내기' });
    voiceLevel(.55 + Math.random() * .4);
  };
  rec.onerror = function(e){ VOICE.err = e.error || 'error'; };
  rec.onend = function(){
    clearTimeout(VOICE.maxT);
    if(VOICE.state !== 'listening') return;
    var err = VOICE.err, text = (VOICE.final + VOICE.interim).trim();
    if(!text && (err === 'service-not-allowed' || err === 'network' || err === 'language-not-supported') && voiceCanRecord()){ VOICE.mode = 'record'; VOICE.state = 'idle'; voiceStartRecord(); return; }   // 브라우저 음성 인식이 막혔으면 녹음 방식으로 바꿔서 이어간다
    voiceFinish(text, err);
  };
  try{ rec.start(); }catch(e){ VOICE.state = 'idle'; voiceFail('음성 입력을 시작하지 못했어요. 잠시 뒤에 다시 눌러 주세요.'); }
}

/* ---------- ② 녹음 → 서버 받아쓰기 ---------- */
function voiceStartRecord(){
  VOICE.state = 'working'; voiceSetBar('working', '마이크를 켜는 중…');      // 권한 창이 떠 있는 동안 또 눌러도 두 번 시작되지 않게
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function(stream){
    if(VOICE.state !== 'working'){ try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){} return; }     // 마이크를 켜는 사이에 취소됐다
    VOICE.stream = stream; VOICE.chunks = [];
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'], mime = '';
    for(var i = 0; i < types.length; i++){ try{ if(MediaRecorder.isTypeSupported(types[i])){ mime = types[i]; break; } }catch(e){} }
    var mr; try{ mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }catch(e){ voiceCleanup(); voiceFail('이 기기에서는 녹음을 시작하지 못했어요.'); return; }
    VOICE.mr = mr;
    mr.ondataavailable = function(ev){ if(ev.data && ev.data.size) VOICE.chunks.push(ev.data); };
    mr.onstop = function(){
      var type = (mr.mimeType || mime || 'audio/webm'), blob = new Blob(VOICE.chunks, { type: type }), heard = VOICE.heard;
      voiceCleanup();
      if(VOICE.state !== 'listening') return;                       // 취소됨
      if(!heard || blob.size < 700){ VOICE.state = 'idle'; voiceFinish('', 'no-speech'); return; }
      VOICE.state = 'working'; voiceSetBar('working', '말씀을 글로 바꾸는 중…');
      voiceUpload(blob, type);
    };
    mr.start(250);
    VOICE.state = 'listening'; voiceSetBar('listening', '듣고 있어요… 말씀하세요', { btn: '끝내기' });
    // 소리 크기 보기: 막대 움직임 + '말이 끝났는지'(말한 뒤 1.4초 조용) 판단해서 자동으로 끝낸다
    try{
      var AC = window.AudioContext || window.webkitAudioContext; VOICE.ctx = new AC();
      var an = VOICE.ctx.createAnalyser(); an.fftSize = 512; VOICE.ctx.createMediaStreamSource(stream).connect(an);
      var buf = new Uint8Array(an.fftSize); VOICE.lastVoice = Date.now();
      (function tick(){
        if(VOICE.state !== 'listening'){ return; }
        an.getByteTimeDomainData(buf); var s = 0; for(var k = 0; k < buf.length; k++){ var d = (buf[k] - 128) / 128; s += d * d; }
        var rms = Math.sqrt(s / buf.length); voiceLevel(rms * 7);
        var now = Date.now();
        if(rms > 0.035){ VOICE.heard = true; VOICE.lastVoice = now; }
        if(VOICE.heard && now - VOICE.lastVoice > 1400){ voiceStop(); return; }
        if(!VOICE.heard && now - VOICE.t0 > 9000){ voiceStop(); return; }
        VOICE.raf = requestAnimationFrame(tick);
      })();
    }catch(e){ VOICE.heard = true; }                                // 소리 크기를 못 재는 기기: 누를 때까지 녹음하고 보낸다
    VOICE.maxT = setTimeout(voiceStop, 25000);
  }).catch(function(e){
    voiceCleanup(); VOICE.state = 'idle';
    if(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) voiceFail('마이크 권한이 꺼져 있어요. 주소창 옆 자물쇠(또는 기기 설정)에서 마이크를 허용해 주세요.', 6000);
    else if(e && e.name === 'NotFoundError') voiceFail('마이크를 찾을 수 없어요.');
    else voiceFail('마이크를 켜지 못했어요.');
  });
}
function voiceUpload(blob, type){
  fetch(API_BASE + '/api/ai/transcribe', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': type }, body: blob }).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error((j && typeof j.detail === 'string' && j.detail) || ('음성을 글로 바꾸지 못했어요 (' + r.status + ')')); return j; });
  }).then(function(j){ VOICE.state = 'idle'; voiceFinish((j.text || '').trim(), ''); }).catch(function(e){ VOICE.state = 'idle'; voiceFail(e.message || '음성을 글로 바꾸지 못했어요.', 5200); });
}

/* ---------- 끝내기 · 취소 ---------- */
function voiceStop(){                                                // 말하기를 끝내고 지금까지 들린 것을 처리
  if(VOICE.state !== 'listening') return;
  clearTimeout(VOICE.maxT); cancelAnimationFrame(VOICE.raf);
  voiceSetBar('working', '정리하는 중…');
  if(VOICE.mode === 'speech'){ try{ VOICE.rec.stop(); }catch(e){ voiceFinish((VOICE.final + VOICE.interim).trim(), VOICE.err); } }
  else { VOICE.heard = VOICE.heard || (Date.now() - VOICE.t0 > 1500); try{ if(VOICE.mr && VOICE.mr.state !== 'inactive') VOICE.mr.stop(); else voiceCleanup(); }catch(e){ voiceCleanup(); } }
}
function voiceCancel(){
  clearTimeout(VOICE.maxT); clearTimeout(VOICE.sendT); cancelAnimationFrame(VOICE.raf);
  var was = VOICE.state; VOICE.state = 'idle';
  try{ if(VOICE.rec){ VOICE.rec.onend = null; VOICE.rec.abort ? VOICE.rec.abort() : VOICE.rec.stop(); } }catch(e){}
  voiceCleanup(); VOICE.rec = null; voiceHideBar();
  if(was === 'confirm'){ var i = voiceEl('chatMsgInput'); if(i && i.value === VOICE.last) i.value = ''; }       // 보내기 전에 취소하면 입력칸에 넣어 둔 글도 지운다
}
function voiceCleanup(){
  try{ if(VOICE.mr && VOICE.mr.state !== 'inactive'){ VOICE.mr.ondataavailable = null; VOICE.mr.onstop = null; VOICE.mr.stop(); } }catch(e){}
  try{ if(VOICE.stream) VOICE.stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
  try{ if(VOICE.ctx && VOICE.ctx.close) VOICE.ctx.close(); }catch(e){}
  VOICE.mr = null; VOICE.stream = null; VOICE.ctx = null; cancelAnimationFrame(VOICE.raf);
}
function voiceFail(msg, hide){ VOICE.state = 'idle'; voiceSetBar('error', msg, { hide: hide || 3600 }); }

/* ---------- 받아 적은 글 다듬기 · 보내기 ---------- */
function voiceLev(a, b){
  var m = [], i, j; for(i = 0; i <= a.length; i++){ m[i] = [i]; } for(j = 1; j <= b.length; j++){ m[0][j] = j; }
  for(i = 1; i <= a.length; i++) for(j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}
/* 음성 인식이 호출어를 비슷하게 적어도("두래야·두례야·듀레야·두레 야") 정확한 호출어로 고친다 */
function voiceNormalize(raw){
  var t = String(raw || '').replace(/\s+/g, ' ').trim();
  if(!t) return '';
  var name = (typeof aiMyName === 'function') ? aiMyName() : '두레';
  var custom = name && name !== '두레';
  // 내가 정한 이름: 첫 낱말이 그 이름과 글자 하나 차이면 이름으로
  if(custom){
    var m = /^(\S{1,12}?)\s*(야|아)?([\s,]+|$)/.exec(t);
    if(m && m[1].length >= 2 && voiceLev(m[1].replace(/\s/g, ''), name) <= (name.length >= 3 ? 1 : 0)){ return name + '야 ' + t.slice(m[0].length).trim(); }
  }
  var d = /^(두|듀|뚜)\s*[레래례리]\s*(야|아|여|요)?([\s,.!]+|$)/.exec(t);
  if(d){ return '두레야 ' + t.slice(d[0].length).trim(); }
  return t;
}
function voiceFinish(raw, err){
  VOICE.state = 'idle'; VOICE.rec = null; voiceCleanup();
  var text = voiceNormalize(raw);
  if(!text){
    var msg = err === 'not-allowed' ? '마이크 권한이 꺼져 있어요. 주소창 옆 자물쇠(또는 기기 설정)에서 마이크를 허용해 주세요.' : (err === 'no-speech' || !err ? '말소리가 안 들렸어요. 다시 눌러서 말해 보세요.' : '잘 못 알아들었어요. 다시 말해 주세요.');
    voiceFail(msg, err === 'not-allowed' ? 6000 : 3200); return;
  }
  var input = voiceEl('chatMsgInput'); if(!input){ voiceHideBar(); return; }
  input.value = text; VOICE.last = text;
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if(!coarse){ try{ input.focus(); input.setSelectionRange(text.length, text.length); }catch(e){} }       // 폰에서는 키보드가 불쑥 올라오지 않게 포커스는 주지 않는다
  var toAi = (VOICE.chatMode === 'ai') || (typeof isAiRequest === 'function' && isAiRequest(text));
  if(!toAi){ voiceSetBar('confirm', '“' + text + '” — 확인하고 보내기(↑)를 눌러 주세요', { hide: 6000 }); return; }
  // AI 를 부른 말: 잠깐 보여 주고(취소 가능) 자동으로 보낸다
  VOICE.state = 'confirm';
  voiceSetBar('confirm', '“' + text + '” 보낼게요', { btn: '취소', prog: 1600 });
  var typed = function(){ if(VOICE.state === 'confirm'){ clearTimeout(VOICE.sendT); VOICE.state = 'idle'; voiceHideBar(); } input.removeEventListener('input', typed); };
  input.addEventListener('input', typed);
  VOICE.sendT = setTimeout(function(){
    input.removeEventListener('input', typed);
    if(VOICE.state !== 'confirm') return;
    VOICE.state = 'idle'; voiceHideBar();
    var still = (typeof chatMode === 'undefined') || chatMode === VOICE.chatMode;
    if(still && input.value === text && typeof sendChatMsg === 'function') sendChatMsg();
  }, 1600);
}

/* 채팅창을 닫거나 화면을 떠나면 듣기를 멈춘다 */
document.addEventListener('visibilitychange', function(){ if(document.hidden && VOICE.state !== 'idle') voiceCancel(); });
window.addEventListener('pagehide', function(){ if(VOICE.state !== 'idle') voiceCancel(); });
document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && VOICE.state !== 'idle') voiceCancel(); });
voiceInit();
