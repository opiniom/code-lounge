/* ---- 워크스페이스 단축키 (기본값 + 내가 바꾼 키) ----
   기본값은 많이 쓰는 개발 도구의 단축키를 그대로 쓴다 (맥은 Ctrl 대신 ⌘, Alt 대신 ⌥).
   · 실행: Ctrl+Enter (온라인 코드 편집기·Replit) · F5 (VS Code·IDLE) · Shift+F10 (IntelliJ·Eclipse)
   · 디버그로 실행: Shift+F9 (IntelliJ)   · 중지: Shift+F5 (VS Code)   · 이 줄에 메모: Ctrl+Alt+M
   · 디버그 중 멈춰 있을 때: F5/F8 계속 · F10 한 줄 · F11 안으로 · Shift+F11 밖으로 · F9 중단점 (이건 바꿀 수 없는 고정 키)
   ★ 설정 ▸ '워크스페이스 단축키'에서 동작마다 원하는 키로 바꿀 수 있다 (동작당 최대 3개). 바꾼 것만 저장되고 웹·앱이 같이 쓴다(/api/prefs 의 keys).
     'Ctrl' 은 어느 기기에서나 '그 기기의 기본 조합키'(윈도 Ctrl · 맥 ⌘)라서 한 번 정하면 어디서나 같은 의미다.
   · 에디터 밖(파일 목록·터미널)에 포커스가 있어도 워크스페이스 화면이면 동작하고, 글자를 입력하는 칸에서는 가로채지 않는다.
   · 브라우저의 F5(새로고침)는 워크스페이스에서 파일을 열어 둔 동안만 실행으로 바뀐다. */
var WSKEY_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '') || /Mac OS X/.test(navigator.userAgent || '');
var WSKEY_ACTIONS = [
  { k: 'run',   t: '실행',               d: ['Ctrl+Enter', 'F5', 'Shift+F10'] },
  { k: 'debug', t: '디버그로 실행',      d: ['Shift+F9'] },
  { k: 'stop',  t: '중지',               d: ['Shift+F5'] },
  { k: 'memo',  t: '이 줄에 메모 남기기', d: ['Ctrl+Alt+M'] }
];
var WSKEY_STORE = 'sync_ws_keys';
var WSKEY_MAX = 3;
var WSKEY_CUR = {};
var WSKEY_CAPTURE = null;

function wsKeyLabel(k){
  var parts = String(k).split('+');
  if(!WSKEY_MAC) return parts.join('+');
  return parts.map(function(p){ return ({ Ctrl: '⌘', Alt: '⌥', Shift: '⇧', Enter: '↵', Backspace: '⌫', Space: '␣' })[p] || p; }).join('');
}

/* ---------- 누른 키 → 'Ctrl+Alt+M' 같은 글자 (기기에 상관없이 같은 모양) ---------- */
var WSKEY_NAMED = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`' };
function wsKeyFromEvent(e){
  var k = e.key;
  if(!k || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Process', 'Unidentified', 'OS'].indexOf(k) >= 0) return null;
  var prim = WSKEY_MAC ? e.metaKey : e.ctrlKey, other = WSKEY_MAC ? e.ctrlKey : e.metaKey;
  if(other) return null;                                         // 맥의 Control · 윈도 키 조합은 쓰지 않는다 (운영체제가 쓰는 경우가 많다)
  var name = null, code = e.code || '';
  if(/^F([1-9]|1[0-2])$/.test(k)) name = k;
  else if(/^Key[A-Z]$/.test(code)) name = code.slice(3);
  else if(/^Digit[0-9]$/.test(code)) name = code.slice(5);
  else if(WSKEY_NAMED[code]) name = WSKEY_NAMED[code];
  else if(k === ' ') name = 'Space';
  else if(WSKEY_NAMED[k]) name = WSKEY_NAMED[k];
  else if(k.length === 1 && /[A-Za-z0-9]/.test(k)) name = k.toUpperCase();
  else if(k.length === 1 && ',./;\'[]\\-=`'.indexOf(k) >= 0) name = k;
  if(!name) return null;
  var m = []; if(prim) m.push('Ctrl'); if(e.altKey) m.push('Alt'); if(e.shiftKey) m.push('Shift');
  return m.concat(name).join('+');
}

/* ---------- 쓸 수 있는 키인지 ---------- */
var WSKEY_RESERVED = ['Ctrl+S', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+A', 'Ctrl+F', 'Ctrl+H', 'Ctrl+P', 'Ctrl+R', 'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+Q', 'Ctrl+L',
  'Ctrl+D', 'Ctrl+K', 'Ctrl+M', 'Ctrl+/', 'Ctrl+Shift+Z', 'Ctrl+Shift+R', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+W', 'Ctrl+Tab', 'Alt+F4', 'Ctrl+F4',
  'F1', 'F2', 'F3', 'Shift+F3', 'F8', 'F9', 'F10', 'F11', 'Shift+F11', 'F12', 'Enter', 'Space', 'Tab', 'Backspace', 'Delete'];
function wsKeyCheck(action, spec){
  var parts = spec.split('+'), name = parts[parts.length - 1], isF = /^F([1-9]|1[0-2])$/.test(name);
  if(parts.indexOf('Ctrl') < 0 && parts.indexOf('Alt') < 0 && !isF) return 'Ctrl(맥은 ⌘) 또는 Alt(맥은 ⌥)와 함께 누르거나, F키를 써 주세요. 글자 하나만으로는 코드를 입력할 때와 겹쳐요.';
  if(WSKEY_RESERVED.indexOf(spec) >= 0) return wsKeyLabel(spec) + ' 는 저장·복사·찾기처럼 브라우저나 에디터가 이미 쓰는 키예요. 다른 키를 눌러 주세요.';
  for(var i = 0; i < WSKEY_ACTIONS.length; i++){
    var a = WSKEY_ACTIONS[i];
    if(a.k !== action && (WSKEY_CUR[a.k] || []).indexOf(spec) >= 0) return wsKeyLabel(spec) + ' 는 이미 "' + a.t + '"에 쓰고 있어요.';
  }
  if((WSKEY_CUR[action] || []).indexOf(spec) >= 0) return '이미 추가한 키예요.';
  return '';
}
function wsKeyValid(spec){ return typeof spec === 'string' && /^((Ctrl|Alt|Shift)\+)*(F([1-9]|1[0-2])|[A-Z0-9]|Enter|Space|Tab|↑|↓|←|→|[,./;'\[\]\\\-=`])$/.test(spec) && spec.length <= 24; }

/* ---------- 저장 · 불러오기 (바꾼 것만 저장) ---------- */
function wsKeysDefaults(){ var o = {}; WSKEY_ACTIONS.forEach(function(a){ o[a.k] = a.d.slice(); }); return o; }
function wsKeysReload(){
  var cur = wsKeysDefaults(), saved = null;
  try { saved = JSON.parse(localStorage.getItem(WSKEY_STORE) || 'null'); } catch(e){}
  if(saved && typeof saved === 'object'){
    WSKEY_ACTIONS.forEach(function(a){
      var v = saved[a.k]; if(!Array.isArray(v)) return;
      cur[a.k] = v.filter(function(s, i){ return wsKeyValid(s) && v.indexOf(s) === i; }).slice(0, WSKEY_MAX);
    });
  }
  WSKEY_CUR = cur;
}
function wsKeysOverrides(){
  var o = {}, d = wsKeysDefaults();
  WSKEY_ACTIONS.forEach(function(a){ if(JSON.stringify(WSKEY_CUR[a.k]) !== JSON.stringify(d[a.k])) o[a.k] = WSKEY_CUR[a.k].slice(); });
  return o;
}
function wsKeysSave(){
  var o = wsKeysOverrides();
  try { localStorage.setItem(WSKEY_STORE, JSON.stringify(o)); } catch(e){}      // 비어 있어도({} = 모두 기본값) 저장해서 '되돌림'도 다른 기기에 전해진다
  if(typeof prefsPush === 'function') prefsPush('keys');
  wsKeysRefresh();
}
function wsKeysRefresh(){
  var pop = document.getElementById('wsKeysPop'); if(pop) pop.remove();     // 안내 창은 다음에 열 때 새로 만든다
  wsKeysHints();
  try { if(typeof wsMemoRenderList === 'function') wsMemoRenderList(); } catch(e){}
}
function wsKeyShow(action, n){ return (WSKEY_CUR[action] || []).slice(0, n || 1).map(wsKeyLabel).join(' · '); }

/* ---------- 키를 눌렀을 때 ---------- */
function wsKeysActive(){ return !!document.querySelector('.view.active[data-view="workspace"]') && !document.querySelector('.modal-backdrop.open'); }
function wsKeyAction(spec){
  for(var i = 0; i < WSKEY_ACTIONS.length; i++) if((WSKEY_CUR[WSKEY_ACTIONS[i].k] || []).indexOf(spec) >= 0) return WSKEY_ACTIONS[i].k;
  return null;
}
function wsKeysDo(e, what){
  e.preventDefault(); e.stopPropagation();
  if(!currentFileKey || !files[currentFileKey]){ pushToast('📄', '열린 파일이 없어요', '왼쪽 탐색기에서 파일을 열어 주세요.'); return; }
  if(what === 'run'){ if(typeof runCode === 'function') runCode(); }
  else if(what === 'debug'){ if(typeof wsDbgStart === 'function') wsDbgStart(); }
  else if(what === 'stop'){ if(typeof wsRunning !== 'undefined' && wsRunning && typeof stopInteractiveCode === 'function') stopInteractiveCode(); }
  else if(what === 'continue'){ if(typeof wsDbgCmd === 'function') wsDbgCmd('continue'); }
  else if(what === 'memo'){ if(typeof wsMemoAddAtCursor === 'function') wsMemoAddAtCursor(); }
}
function wsKeysHandle(e){
  if(WSKEY_CAPTURE || e.isComposing || e.defaultPrevented || !wsKeysActive()) return;
  var spec = wsKeyFromEvent(e); if(!spec) return;
  var act = wsKeyAction(spec); if(!act) return;
  var tgt = e.target || {}, tag = tgt.tagName || '';
  var inEditor = !!(tgt.closest && tgt.closest('.monaco-editor'));
  var typing = !inEditor && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tgt.isContentEditable);
  var isF = /(^|\+)F([1-9]|1[0-2])$/.test(spec);
  if(typing && !isF) return;                                 // 글자를 입력하는 칸에서는 F키가 아니면 건드리지 않는다
  var paused = typeof WSDBG !== 'undefined' && WSDBG.active && WSDBG.paused;
  if(paused && e.key === 'F10') return;                      // 멈춰 있을 땐 F10(한 줄 실행)이 먼저
  if(act === 'run' && spec === 'F5' && paused) return wsKeysDo(e, 'continue');    // 디버그로 멈춘 상태의 F5 는 '계속'
  return wsKeysDo(e, act);
}
document.addEventListener('keydown', wsKeysHandle, true);

/* ---------- 안내 창 + 버튼 설명 ---------- */
function wsKeysToggle(ev){
  if(ev) ev.stopPropagation();
  var pop = document.getElementById('wsKeysPop');
  if(pop){ pop.hidden = !pop.hidden; return; }
  pop = document.createElement('div'); pop.id = 'wsKeysPop'; pop.className = 'ws-keys-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '단축키');
  var row = function(label, keys){ return '<div class="wk-row"><span>' + label + '</span><span class="wk-keys">' + (keys.length ? keys.map(function(k){ return '<kbd>' + wsKeyLabel(k) + '</kbd>'; }).join('<i>또는</i>') : '<em>없음</em>') + '</span></div>'; };
  var C = WSKEY_CUR;
  var groups = [
    { t: '실행', rows: [row('실행', C.run), row('디버그로 실행', C.debug), row('중지', C.stop), row('저장', ['Ctrl+S'])] },
    { t: '디버그 (멈춘 상태)', rows: [row('중단점 켜기/끄기', ['F9']), row('계속', ['F8', 'F5']), row('한 줄 실행', ['F10']), row('함수 안으로', ['F11']), row('함수 밖으로', ['Shift+F11'])] },
    { t: '메모', rows: [row('이 줄에 메모 남기기', C.memo)] },
    { t: '편집 (에디터 기본)', rows: [row('줄 주석', ['Ctrl+/']), row('찾기 · 바꾸기', ['Ctrl+F', 'Ctrl+H']), row('줄 옮기기', ['Alt+↑', 'Alt+↓']), row('줄 복사', ['Shift+Alt+↓']), row('코드 정리', ['Shift+Alt+F']), row('명령 목록', ['F1'])] }
  ];
  var h = '<div class="wk-head"><b>단축키</b><span class="wk-sp"></span><button type="button" class="wk-chg" onclick="document.getElementById(\'wsKeysPop\').hidden=true; wsKeysOpenSettings();">' + uiIc('keyboard', 13) + ' 바꾸기</button><button type="button" class="wk-x" aria-label="닫기" onclick="document.getElementById(\'wsKeysPop\').hidden=true">' + uiIc('x', 14) + '</button></div><div class="wk-body">';
  groups.forEach(function(g){ h += '<div class="wk-grp"><div class="wk-gt">' + g.t + '</div>' + g.rows.join('') + '</div>'; });
  h += '<p class="wk-note">' + (WSKEY_MAC ? '⌘ = Command, ⌥ = Option. ' : 'Ctrl 은 맥에서 ⌘ 입니다. ') + '글자를 입력하는 칸에서는 단축키가 동작하지 않아요.</p>' +
       '</div>';
  pop.innerHTML = h;
  (document.getElementById('editorBody') || document.body).appendChild(pop);
  if(!wsKeysToggle.bound){
    wsKeysToggle.bound = true;
    document.addEventListener('mousedown', function(e){ var p = document.getElementById('wsKeysPop'); if(p && !p.hidden && !p.contains(e.target) && !(e.target.closest && e.target.closest('#wsKeysBtn'))) p.hidden = true; });
    document.addEventListener('keydown', function(e){ var p = document.getElementById('wsKeysPop'); if(e.key === 'Escape' && p && !p.hidden) p.hidden = true; });
  }
}
function wsKeysHints(){
  var set = function(id, text){ var el = document.getElementById(id); if(el) el.title = text; };
  var list = function(a, n){ var s = wsKeyShow(a, n); return s ? ' (' + s + ')' : ''; };
  set('wsRunBtn', '실행' + list('run', 3) + ' · 실행 중에도 키보드 입력(input)을 바로 넣을 수 있어요');
  set('wsStopBtn', '실행 중인 프로세스 강제 중지' + list('stop', 1));
  var d = document.getElementById('wsDbgBtn'); if(d) d.title = d.title.replace(/ \(디버그 시작:[^)]*\)$/, '') + (wsKeyShow('debug') ? ' (디버그 시작: ' + wsKeyShow('debug') + ')' : '');
  set('wsKeysBtn', '단축키 보기');
  var b = document.getElementById('sbKeyHint'); if(b) b.textContent = wsKeyShow('run', 2) ? wsKeyShow('run', 2) + ' 실행' : '실행 단축키 없음';
  var m = document.getElementById('wsMemoBtn'); if(m) m.title = '이 줄에 메모 남기기' + list('memo', 1) + ' — 팀원에게 알림도 보낼 수 있어요';
}

/* ---------- 설정 ▸ 워크스페이스 단축키 ---------- */
function wsKeysCloseSettings(){ var m = document.getElementById('keysModal'); if(m) m.classList.remove('open'); wsKeysEndCapture(); }
function wsKeysEndCapture(){
  if(WSKEY_CAPTURE){ document.removeEventListener('keydown', WSKEY_CAPTURE.fn, true); document.removeEventListener('mousedown', WSKEY_CAPTURE.out, true); WSKEY_CAPTURE = null; }
}
function wsKeysStartCapture(action, btn, errEl){
  wsKeysEndCapture();
  var fn = function(e){
    e.preventDefault(); e.stopImmediatePropagation();
    if(e.repeat) return;
    if(e.key === 'Escape'){ wsKeysEndCapture(); wsKeysRenderSettings(); return; }
    var spec = wsKeyFromEvent(e); if(!spec) return;           // 조합키만 누른 상태는 기다린다
    var err = wsKeyCheck(action, spec);
    if(err){ errEl.textContent = err; errEl.hidden = false; return; }
    WSKEY_CUR[action] = (WSKEY_CUR[action] || []).concat(spec).slice(0, WSKEY_MAX);
    wsKeysEndCapture(); wsKeysSave(); wsKeysRenderSettings();
  };
  var out = function(e){ if(!(e.target.closest && e.target.closest('.kb-add.on'))){ wsKeysEndCapture(); wsKeysRenderSettings(); } };
  WSKEY_CAPTURE = { fn: fn, out: out };
  document.addEventListener('keydown', fn, true); document.addEventListener('mousedown', out, true);
  btn.classList.add('on'); btn.textContent = '원하는 키를 누르세요… (Esc 취소)'; errEl.hidden = true;
}
function wsKeysRenderSettings(){
  var box = document.getElementById('kbRows'); if(!box) return;
  var d = wsKeysDefaults();
  box.innerHTML = '';
  WSKEY_ACTIONS.forEach(function(a){
    var row = document.createElement('div'); row.className = 'kb-row';
    var nm = document.createElement('div'); nm.className = 'kb-name'; nm.textContent = a.t; row.appendChild(nm);
    var keys = document.createElement('div'); keys.className = 'kb-keys';
    var cur = WSKEY_CUR[a.k] || [];
    cur.forEach(function(spec){
      var chip = document.createElement('span'); chip.className = 'kb-chip';
      var k = document.createElement('kbd'); k.textContent = wsKeyLabel(spec); chip.appendChild(k);
      var x = document.createElement('button'); x.type = 'button'; x.className = 'kb-x'; x.title = '이 키 지우기'; x.setAttribute('aria-label', wsKeyLabel(spec) + ' 지우기'); x.innerHTML = uiIc('x', 12);
      x.onclick = function(){ WSKEY_CUR[a.k] = cur.filter(function(s){ return s !== spec; }); wsKeysSave(); wsKeysRenderSettings(); };
      chip.appendChild(x); keys.appendChild(chip);
    });
    if(!cur.length){ var none = document.createElement('span'); none.className = 'kb-none'; none.textContent = '단축키 없음'; keys.appendChild(none); }
    var err = document.createElement('div'); err.className = 'kb-err'; err.hidden = true;
    if(cur.length < WSKEY_MAX){
      var add = document.createElement('button'); add.type = 'button'; add.className = 'kb-add'; add.textContent = '＋ 키 추가';
      add.onclick = function(e){ e.stopPropagation(); if(add.classList.contains('on')){ wsKeysEndCapture(); wsKeysRenderSettings(); } else wsKeysStartCapture(a.k, add, err); };
      keys.appendChild(add);
    }
    row.appendChild(keys);
    if(JSON.stringify(cur) !== JSON.stringify(d[a.k])){
      var rs = document.createElement('button'); rs.type = 'button'; rs.className = 'kb-reset'; rs.textContent = '기본값'; rs.title = '기본값(' + d[a.k].map(wsKeyLabel).join(' · ') + ')으로 되돌리기';
      rs.onclick = function(){ WSKEY_CUR[a.k] = d[a.k].slice(); wsKeysSave(); wsKeysRenderSettings(); }; row.appendChild(rs);
    }
    row.appendChild(err);
    box.appendChild(row);
  });
  var all = document.getElementById('kbResetAll'); if(all) all.hidden = !Object.keys(wsKeysOverrides()).length;
}
function wsKeysOpenSettings(){
  if(typeof closeSettings === 'function') closeSettings();
  var m = document.getElementById('keysModal');
  if(!m){
    m = document.createElement('div'); m.className = 'modal-backdrop'; m.id = 'keysModal';
    m.onclick = function(e){ if(e.target === m) wsKeysCloseSettings(); };
    m.innerHTML = '<div class="share-modal keys-modal" role="dialog" aria-label="워크스페이스 단축키">' +
      '<div class="mh"><h3>워크스페이스 단축키</h3><button type="button" class="icon-btn" aria-label="닫기" onclick="wsKeysCloseSettings()">' + uiIc('x', 14) + '</button></div>' +
      '<p class="kb-note">바꾸고 싶은 동작의 <b>＋ 키 추가</b>를 누른 뒤, 쓰고 싶은 키를 한 번 눌러 보세요. 동작마다 최대 ' + WSKEY_MAX + '개까지 쓸 수 있고, 바꾼 설정은 웹과 앱에 같이 적용돼요.</p>' +
      '<div class="kb-rows" id="kbRows"></div>' +
      '<p class="kb-note sub">' + (WSKEY_MAC ? '맥에서는 ⌘(Command) · ⌥(Option) 기준이에요.' : 'Ctrl 로 정한 키는 맥에서 ⌘ 로 동작해요.') + ' 저장(' + wsKeyLabel('Ctrl+S') + ')·디버그 중 F8/F10/F11 처럼 고정된 키는 바꿀 수 없어요.</p>' +
      '<p class="kb-note sub kb-touch" hidden>키보드가 연결되지 않은 폰·태블릿에서는 키를 누를 수 없어요. 키보드가 있는 기기에서 바꿔 주세요.</p>' +
      '<div class="kb-foot"><button type="button" class="btn ghost" id="kbResetAll" onclick="wsKeysResetAll()">모두 기본값으로</button><span class="kb-sp"></span><button type="button" class="btn primary" onclick="wsKeysCloseSettings()">닫기</button></div></div>';
    document.body.appendChild(m);
    if(window.matchMedia && matchMedia('(pointer: coarse)').matches){ var t = m.querySelector('.kb-touch'); if(t) t.hidden = false; }
  }
  wsKeysRenderSettings();
  m.classList.add('open');
}
function wsKeysResetAll(){ WSKEY_CUR = wsKeysDefaults(); wsKeysSave(); wsKeysRenderSettings(); }
document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !WSKEY_CAPTURE){ var m = document.getElementById('keysModal'); if(m && m.classList.contains('open')) wsKeysCloseSettings(); } });

wsKeysReload();
wsKeysHints();
