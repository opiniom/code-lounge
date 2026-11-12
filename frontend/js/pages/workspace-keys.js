/* ---- 워크스페이스 실행 단축키 ----
   많이 쓰는 개발 도구의 단축키를 그대로 쓴다 (맥은 Ctrl 대신 ⌘, Alt 대신 ⌥).
   · 실행: Ctrl+Enter (온라인 코드 편집기·Replit) · F5 (VS Code·IDLE) · Shift+F10 (IntelliJ·Eclipse)
   · 디버그로 실행: Shift+F9 (IntelliJ)   · 중지: Shift+F5 (VS Code)
   · 디버그 중 멈춰 있을 때: F5 / F8 계속 · F10 한 줄 · F11 안으로 · Shift+F11 밖으로 (이미 있던 것) · F9 중단점 켜고 끄기
   · 에디터 밖(파일 목록·터미널)에 포커스가 있어도 워크스페이스 화면이면 동작한다. 글자를 입력하는 칸(입력창·메모)에서는 가로채지 않는다.
   · 브라우저의 F5(새로고침)는 워크스페이스에서 파일을 열어 둔 동안만 실행으로 바꾼다. */
var WSKEY_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '') || /Mac OS X/.test(navigator.userAgent || '');
function wsKeyLabel(k){
  var parts = String(k).split('+');
  if(!WSKEY_MAC) return parts.map(function(p){ return p === 'Enter' ? 'Enter' : p; }).join('+');
  return parts.map(function(p){ return ({ Ctrl: '⌘', Alt: '⌥', Shift: '⇧', Enter: '↵', Backspace: '⌫' })[p] || p; }).join('');
}
var WSKEY_GROUPS = [
  { t: '실행', rows: [['실행', ['Ctrl+Enter', 'F5', 'Shift+F10']], ['중지', ['Shift+F5']], ['저장', ['Ctrl+S']]] },
  { t: '디버그', rows: [['디버그로 실행', ['Shift+F9']], ['중단점 켜기/끄기', ['F9']], ['계속', ['F8', 'F5']], ['한 줄 실행', ['F10']], ['함수 안으로', ['F11']], ['함수 밖으로', ['Shift+F11']]] },
  { t: '메모', rows: [['이 줄에 메모 남기기', ['Ctrl+Alt+M']]] },
  { t: '편집', rows: [['줄 주석', ['Ctrl+/']], ['찾기 · 바꾸기', ['Ctrl+F', 'Ctrl+H']], ['줄 옮기기', ['Alt+↑', 'Alt+↓']], ['줄 복사', ['Shift+Alt+↓']], ['코드 정리', ['Shift+Alt+F']], ['명령 목록', ['F1']]] }
];
function wsKeysActive(){ return !!document.querySelector('.view.active[data-view="workspace"]') && !document.querySelector('.modal-backdrop.open'); }
function wsKeysDo(e, what){
  e.preventDefault(); e.stopPropagation();
  if(!currentFileKey || !files[currentFileKey]){ pushToast('📄', '열린 파일이 없어요', '왼쪽 탐색기에서 실행할 파일을 열어 주세요.'); return; }
  if(what === 'run'){ if(typeof runCode === 'function') runCode(); }
  else if(what === 'debug'){ if(typeof wsDbgStart === 'function') wsDbgStart(); }
  else if(what === 'stop'){ if(typeof wsRunning !== 'undefined' && wsRunning && typeof stopInteractiveCode === 'function') stopInteractiveCode(); }
  else if(what === 'continue'){ if(typeof wsDbgCmd === 'function') wsDbgCmd('continue'); }
}
function wsKeysHandle(e){
  if(e.isComposing || e.defaultPrevented || !wsKeysActive()) return;
  var k = e.key, ctrl = e.ctrlKey || e.metaKey, tgt = e.target || {};
  var inEditor = !!(tgt.closest && tgt.closest('.monaco-editor'));
  var tag = tgt.tagName || '';
  var typing = !inEditor && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tgt.isContentEditable);
  var paused = typeof WSDBG !== 'undefined' && WSDBG.active && WSDBG.paused;
  if(k === 'Enter' && ctrl && !e.shiftKey && !e.altKey){
    if(inEditor || typing) return;                       // 에디터 안에서는 에디터 자신의 명령이 실행한다 (두 번 실행되지 않게), 입력칸에서는 그대로 둔다
    return wsKeysDo(e, 'run');
  }
  if(typing && k.charAt(0) !== 'F') return;
  if(k === 'F5' && !ctrl && !e.altKey){
    if(e.shiftKey) return wsKeysDo(e, 'stop');           // Shift+F5
    return wsKeysDo(e, paused ? 'continue' : 'run');     // F5: 멈춰 있으면 계속, 아니면 실행
  }
  if(k === 'F10' && e.shiftKey && !ctrl && !e.altKey){ if(paused) return; return wsKeysDo(e, 'run'); }      // Shift+F10 (멈춰 있을 땐 F10 = 한 줄 실행이 먼저)
  if(k === 'F9' && e.shiftKey && !ctrl && !e.altKey) return wsKeysDo(e, 'debug');                           // Shift+F9
}
document.addEventListener('keydown', wsKeysHandle, true);

/* 단축키 안내 창 + 버튼 설명에 단축키 표시 */
function wsKeysToggle(ev){
  if(ev) ev.stopPropagation();
  var pop = document.getElementById('wsKeysPop');
  if(pop){ pop.hidden = !pop.hidden; return; }
  pop = document.createElement('div'); pop.id = 'wsKeysPop'; pop.className = 'ws-keys-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '단축키');
  var h = '<div class="wk-head"><b>단축키</b><button type="button" class="wk-x" aria-label="닫기" onclick="document.getElementById(\'wsKeysPop\').hidden=true">' + uiIc('x', 14) + '</button></div><div class="wk-body">';
  WSKEY_GROUPS.forEach(function(g){
    h += '<div class="wk-grp"><div class="wk-gt">' + g.t + '</div>';
    g.rows.forEach(function(r){
      h += '<div class="wk-row"><span>' + r[0] + '</span><span class="wk-keys">' + r[1].map(function(k){ return '<kbd>' + wsKeyLabel(k) + '</kbd>'; }).join('<i>또는</i>') + '</span></div>';
    });
    h += '</div>';
  });
  h += '<p class="wk-note">' + (WSKEY_MAC ? '⌘ = Command, ⌥ = Option.' : 'Ctrl 은 맥에서 ⌘ 입니다.') + ' 글자를 입력하는 칸에서는 단축키가 동작하지 않아요.</p></div>';
  pop.innerHTML = h;
  (document.getElementById('editorBody') || document.body).appendChild(pop);
  document.addEventListener('mousedown', function(e){ var p = document.getElementById('wsKeysPop'); if(p && !p.hidden && !p.contains(e.target) && !(e.target.closest && e.target.closest('#wsKeysBtn'))) p.hidden = true; });
  document.addEventListener('keydown', function(e){ var p = document.getElementById('wsKeysPop'); if(e.key === 'Escape' && p && !p.hidden) p.hidden = true; });
}
function wsKeysHints(){
  var set = function(id, text){ var el = document.getElementById(id); if(el) el.title = text; };
  set('wsRunBtn', '실행 (' + wsKeyLabel('Ctrl+Enter') + ' · F5 · ' + wsKeyLabel('Shift+F10') + ') · 실행 중에도 키보드 입력(input)을 바로 넣을 수 있어요');
  set('wsStopBtn', '실행 중인 프로세스 강제 중지 (' + wsKeyLabel('Shift+F5') + ')');
  var d = document.getElementById('wsDbgBtn'); if(d) d.title = d.title.replace(/ \(디버그 시작:[^)]*\)$/, '') + ' (디버그 시작: ' + wsKeyLabel('Shift+F9') + ')';
  set('wsKeysBtn', '단축키 보기');
  var b = document.getElementById('sbKeyHint'); if(b) b.textContent = wsKeyLabel('Ctrl+Enter') + ' · F5 실행';
  var m = document.getElementById('wsMemoBtn'); if(m) m.title = '이 줄에 메모 남기기 (' + wsKeyLabel('Ctrl+Alt+M') + ') — 팀원에게 알림도 보낼 수 있어요';
}
wsKeysHints();
