/* ---- 내 PC 실행: 내 컴퓨터에 설치한 언어로 워크스페이스 코드를 실행 ----
   브라우저는 내 컴퓨터의 프로그램을 직접 실행할 수 없어서, 작은 연결 프로그램('러너', 사이트에서 내려받는 Python 파일 하나)을 내 컴퓨터에 켜 두면
   ▶ 실행이 서버 대신 내 컴퓨터(127.0.0.1)의 러너로 코드를 보내고, 러너가 설치된 언어로 실행해서 결과를 돌려준다.
   · PC 에서만 쓸 수 있다 (폰·태블릿·PWA 는 서버 언어만 — 서버에 없는 언어는 '언어 지원이 되지 않습니다' 안내).
   · 서버와 내 PC 에 같은 언어가 있으면 ▶ 실행 옆 선택 박스에서 '서버 · Java 21 / 내 PC · Java 17' 처럼 고른다 (고른 것을 기억).
   · 러너는 허락한 사이트에서 온 요청만 받고, 처음 한 번 '연결 코드'를 입력해야 한다. 코드는 내 컴퓨터에서 내 권한으로 실행된다(서버처럼 격리되지 않음). */
var RUNNER = { port: 47321, ok: false, info: null, last: null, at: 0, probing: null, latest: null, MIN: '1.0.0' };

/* 폰·태블릿에서는 내 PC 러너를 쓸 수 없다 */
function runnerDeviceOk() {
  var ua = navigator.userAgent || '', touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return !(/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac);
}
/* '내 PC 실행 사용' 스위치: 끄면 러너가 켜져 있어도 항상 서버로만 실행한다 (이 브라우저에만 저장) */
function runnerEnabled() { try { return localStorage.getItem('sync_runner_on') !== '0'; } catch (e) { return true; } }
function runnerSetEnabled(on) { try { localStorage.setItem('sync_runner_on', on ? '1' : '0'); } catch (e) {} RUNNER.at = 0; runnerPaint(); }
function runnerToken() { try { return localStorage.getItem('sync_runner_token') || ''; } catch (e) { return ''; } }
function runnerSetToken(t) { try { if (t) localStorage.setItem('sync_runner_token', t); else localStorage.removeItem('sync_runner_token'); } catch (e) {} }
function runnerUrl() { return 'ws://127.0.0.1:' + RUNNER.port + '/'; }
function runnerOsHint() { var p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''; return /win/i.test(p) ? 'win' : (/mac/i.test(p) ? 'mac' : 'linux'); }

/* 러너가 켜져 있고 연결 코드가 맞는지 확인한다. 결과: {ok, info} 또는 {ok:false, why: 'device'|'notoken'|'token'|'down'|'blocked'} (20초 동안 기억) */
function runnerProbe(force) {
  if (!runnerDeviceOk()) return Promise.resolve({ ok: false, why: 'device' });
  if (!force && RUNNER.last && Date.now() - RUNNER.at < 20000) return Promise.resolve(RUNNER.last);
  if (RUNNER.probing) return RUNNER.probing;
  RUNNER.probing = new Promise(function(resolve) {
    var done = false, ws = null, timer = null;
    function fin(r) {
      if (done) return; done = true; clearTimeout(timer);
      try { if (ws) ws.close(); } catch (e) {}
      if (r.ok && r.info && r.info.runtimes) {
        // 높은 버전이 앞에 오도록 러너가 정렬해서 준다
      }
      RUNNER.last = r; RUNNER.at = Date.now(); RUNNER.ok = !!r.ok; RUNNER.info = r.ok ? r.info : null; RUNNER.probing = null;
      runnerPaint(); resolve(r);
    }
    timer = setTimeout(function() { fin({ ok: false, why: 'down' }); }, 3000);
    try { ws = new WebSocket(runnerUrl()); } catch (e) { return fin({ ok: false, why: 'blocked' }); }          // 사파리처럼 https 페이지에서 ws://127.0.0.1 을 막는 브라우저
    ws.onopen = function() { ws.send(JSON.stringify({ action: 'hello', token: runnerToken() })); };
    ws.onmessage = function(ev) {
      try { var m = JSON.parse(ev.data); if (m.type === 'hello') fin(m.ok ? { ok: true, info: m } : { ok: false, why: runnerToken() ? 'token' : 'notoken' }); } catch (e) {}
    };
    ws.onerror = function() { fin({ ok: false, why: 'down' }); };
    ws.onclose = function() { fin({ ok: false, why: 'down' }); };
  });
  return RUNNER.probing;
}
/* 러너에게 내 컴퓨터의 언어를 다시 찾게 한다 (방금 설치한 언어를 알아보게). 성공하면 true */
function runnerRefresh() {
  return new Promise(function(resolve) {
    var ws, done = false, timer = setTimeout(function() { fin(false); }, 25000);
    function fin(ok) { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch (e) {} resolve(ok); }
    try { ws = new WebSocket(runnerUrl()); } catch (e) { return fin(false); }
    ws.onopen = function() { ws.send(JSON.stringify({ action: 'hello', token: runnerToken() })); };
    ws.onmessage = function(ev) {
      try {
        var m = JSON.parse(ev.data);
        if (m.type === 'hello') { if (m.ok) ws.send(JSON.stringify({ action: 'inventory' })); else fin(false); }
        else if (m.type === 'inventory') { if (RUNNER.info) RUNNER.info.runtimes = m.runtimes; RUNNER.last = { ok: true, info: RUNNER.info }; RUNNER.at = Date.now(); RUNNER.ok = true; fin(true); runnerPaint(); }
      } catch (e) {}
    };
    ws.onerror = function() { fin(false); };
    ws.onclose = function() { fin(false); };
  });
}
function runnerLangs() { return (runnerEnabled() && RUNNER.ok && RUNNER.info && RUNNER.info.runtimes) || {}; }
function runnerLatest() {
  if (RUNNER.latest) return Promise.resolve(RUNNER.latest);
  return fetch(API_BASE + '/api/runner').then(function(r) { return r.ok ? r.json() : null; }).then(function(d) { RUNNER.latest = d || { version: null }; return RUNNER.latest; }).catch(function() { return { version: null }; });
}
function runnerVerLt(a, b) {
  var x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
  for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); }
  return false;
}

/* ===== 실행 환경 선택 (서버 · 내 PC) ===== */
function wsRunKey(lang) { return 'sync_run_' + lang; }
/* 이 언어로 실행할 수 있는 곳들: {server:[{value,label,active}], local:[{value,label}]} */
async function wsRunOptions(lang) {
  var c = await wsRunLoad(false);
  var info = wsLangInfo(lang), server = [], local = [], name = (typeof WS_RUN_LABEL !== 'undefined' && WS_RUN_LABEL[lang]) || lang;
  if (!c || (c.langs && c.langs.indexOf(lang) >= 0) || info) {        // 서버 목록을 못 받았을 때(c 없음)는 서버로 시도한다
    info = info || {};
    if (info.versions && info.versions.length) info.versions.forEach(function(v) { server.push({ value: 's:' + v.id, label: '서버 · ' + name + ' ' + v.label.replace(/ \(기본 포함\)$/, '').replace(/ \(이전 방식 설치\)$/, ''), active: !!v.active }); });
    else server.push({ value: 's:', label: '서버 · ' + name, active: true });
  }
  (runnerLangs()[lang] || []).forEach(function(v) { local.push({ value: 'l:' + v.id, label: '내 PC · ' + name + ' ' + v.label }); });
  return { server: server, local: local };
}
function wsRunChoice(lang, o) {
  var all = o.server.concat(o.local), want = null;
  try { want = localStorage.getItem(wsRunKey(lang)); } catch (e) {}
  if (want && all.some(function(x) { return x.value === want; })) return want;
  var d = o.server.filter(function(x) { return x.active; })[0] || o.server[0] || o.local[0];
  return d ? d.value : null;
}
/* ▶ 실행이 쓸 곳: {kind:'server'|'local', ver} — 서버에도 내 PC 에도 없으면 null */
async function wsRunTarget(lang) {
  if (runnerToken() && runnerEnabled()) await runnerProbe(false);     // 연결한 적이 있으면 내 PC 상태를 먼저 확인
  var o = await wsRunOptions(lang), v = wsRunChoice(lang, o);
  if (!v && RUNNER.ok && runnerEnabled()) {                                              // 서버에도 내 PC 목록에도 없다: 방금 설치했을 수 있으니 한 번 다시 찾아 본다
    if (await runnerRefresh()) { o = await wsRunOptions(lang); v = wsRunChoice(lang, o); }
  }
  if (!v) return null;
  return { kind: v.charAt(0) === 'l' ? 'local' : 'server', ver: v.slice(2) || null, options: o };
}
function wsRtChange() {
  var sel = document.getElementById('wsRuntimeSel'); if (!sel || !sel.dataset.lang) return;
  try { localStorage.setItem(wsRunKey(sel.dataset.lang), sel.value); } catch (e) {}
  pushToast('🔧', '실행 환경을 바꿨어요', sel.options[sel.selectedIndex].text);
}
/* 지금 열린 파일의 언어로 실행할 곳이 둘 이상이면 선택 박스를 보여 준다 */
async function wsRtUpdate() {
  var sel = document.getElementById('wsRuntimeSel'); if (!sel) return;
  var lang = currentFileKey ? wsRunLang(currentFileKey) : null;
  if (!lang) { sel.hidden = true; sel.dataset.lang = ''; return; }
  if (runnerToken() && runnerDeviceOk() && runnerEnabled()) runnerProbe(false);
  var o = await wsRunOptions(lang), n = o.server.length + o.local.length;
  if (n < 2) { sel.hidden = true; sel.dataset.lang = ''; return; }
  var cur = wsRunChoice(lang, o);
  sel.innerHTML = '';
  function group(label, items) {
    if (!items.length) return;
    var g = document.createElement('optgroup'); g.label = label;
    items.forEach(function(x) { var op = document.createElement('option'); op.value = x.value; op.textContent = x.label.replace(/^(서버|내 PC) · /, '') + (x.active ? ' · 기본' : ''); g.appendChild(op); });
    sel.appendChild(g);
  }
  group('서버', o.server); group('내 PC', o.local);
  sel.value = cur; sel.dataset.lang = lang; sel.hidden = false;
  sel.title = '이 파일을 실행할 곳과 버전을 고르세요';
}

/* 상태 표시: 편집기 위쪽 버튼의 점, 열려 있는 안내창 */
function runnerPaint() {
  var b = document.getElementById('wsRunnerBtn');
  if (b) { var live = !!RUNNER.ok && runnerEnabled(); b.hidden = !runnerDeviceOk(); b.classList.toggle('on', live); b.classList.toggle('off', !runnerEnabled()); b.title = !runnerEnabled() ? '내 PC 실행 꺼짐 (서버로만 실행) · 눌러서 설정' : (RUNNER.ok ? '내 PC 러너 연결됨 · 눌러서 설정' : '내 컴퓨터에 설치한 언어로 실행'); }
  if (typeof wsRtUpdate === 'function') wsRtUpdate();
  var m = document.getElementById('runnerModal'); if (m && m.classList.contains('open')) runnerRenderModal();
}

/* ===== 안내·설정 창 ===== */
var RUNNER_MODAL_NOTE = '', RUNNER_UI = { os: null, since: 0, poll: null, sig: '', was: false };
/* 연결 코드는 사이트가 정해서 한 줄 설치 명령에 넣어 준다 → 사용자가 코드를 보고 입력할 일이 없다 */
function runnerEnsureToken() {
  var t = runnerToken(); if (t) return t;
  var a = new Uint8Array(8); (window.crypto || window.msCrypto).getRandomValues(a);
  var h = ''; for (var i = 0; i < a.length; i++) h += ('0' + a[i].toString(16)).slice(-2);
  t = (h.slice(0, 4) + '-' + h.slice(4, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16)).toUpperCase();
  runnerSetToken(t); return t;
}
function runnerInstallCmd(os) {
  var base = (typeof API_BASE === 'string' && API_BASE) || location.origin, t = runnerEnsureToken();
  return os === 'win' ? "$env:DURESYNC_TOKEN='" + t + "'; irm " + base + '/runner/install.ps1 | iex' : 'curl -fsSL ' + base + '/runner/install.sh | DURESYNC_TOKEN=' + t + ' sh';
}
function runnerOpenModal(note) {
  var m = document.getElementById('runnerModal'); if (!m) return;
  RUNNER_MODAL_NOTE = note || ''; RUNNER_UI.os = RUNNER_UI.os || runnerOsHint(); RUNNER_UI.since = Date.now(); RUNNER_UI.sig = '';
  m.classList.add('open'); runnerRenderModal(true);
  runnerLatest().then(function() { if (m.classList.contains('open')) runnerRenderModal(true); });
  if (runnerDeviceOk()) { runnerProbe(true); runnerStartPoll(); }
}
function runnerCloseModal() { var m = document.getElementById('runnerModal'); if (m) m.classList.remove('open'); clearInterval(RUNNER_UI.poll); RUNNER_UI.poll = null; }
/* 창이 열려 있고 아직 연결 전이면 2.5초마다 확인해서, 터미널에 붙여넣자마자 '연결됨'으로 바뀐다 */
function runnerStartPoll() {
  clearInterval(RUNNER_UI.poll);
  RUNNER_UI.poll = setInterval(function() {
    var m = document.getElementById('runnerModal');
    if (!m || !m.classList.contains('open')) { clearInterval(RUNNER_UI.poll); RUNNER_UI.poll = null; return; }
    if (!(RUNNER.last && RUNNER.last.ok)) runnerProbe(true);
  }, 2500);
}
function runnerCopy(text, btn) {
  function ok() { if (btn) { var o = btn.textContent; btn.textContent = '복사됨 ✓'; setTimeout(function() { btn.textContent = o; }, 1400); } }
  try { navigator.clipboard.writeText(text).then(ok, function() {}); } catch (e) {}
}
function runnerRenderModal(force) {
  var body = document.querySelector('#runnerModal .rn-body'); if (!body) return;
  var last = RUNNER.last || { ok: false, why: 'down' }, latest = RUNNER.latest && RUNNER.latest.version, on = runnerEnabled();
  var waited = !last.ok && Date.now() - RUNNER_UI.since > 25000;
  var sig = [last.ok, last.why, on, RUNNER_UI.os, latest, waited, RUNNER.info && JSON.stringify(RUNNER.info.runtimes || {}), RUNNER_MODAL_NOTE].join('|');
  if (!force && sig === RUNNER_UI.sig) return;
  RUNNER_UI.sig = sig;
  if (last.ok && !RUNNER_UI.was) { try { if (RUNNER_UI.was === false && RUNNER_UI.since && Date.now() - RUNNER_UI.since > 1500) pushToast('🖥️', '내 PC에 연결됐어요', '이제 내 컴퓨터에 설치한 언어로 실행할 수 있어요.'); } catch (e) {} }
  RUNNER_UI.was = !!last.ok;
  body.innerHTML = '';
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function add(n, parent) { (parent || body).appendChild(n); return n; }
  function codeBox(text, parent) {
    var cb = el('div', 'rn-code'); cb.appendChild(el('code', null, text));
    var cp = el('button', 'rn-copy', '복사'); cp.type = 'button'; cp.onclick = function() { runnerCopy(text, cp); }; cb.appendChild(cp); add(cb, parent); return cb;
  }
  if (!runnerDeviceOk()) {
    add(el('div', 'rn-status warn', '이 기기(폰·태블릿)에서는 내 PC 실행을 쓸 수 없어요'));
    add(el('p', 'rn-p', '폰과 태블릿에서는 서버가 지원하는 언어만 실행할 수 있어요. 내 컴퓨터(PC)의 크롬·엣지·파이어폭스에서 열면 내 컴퓨터에 설치한 언어로도 실행할 수 있어요.'));
    return;
  }
  if (RUNNER_MODAL_NOTE) add(el('p', 'rn-note', RUNNER_MODAL_NOTE));
  var os = RUNNER_UI.os || 'mac';
  /* ---- 연결됨 ---- */
  if (last.ok) {
    var sw = add(el('label', 'rn-switch')); var cbx = el('input'); cbx.type = 'checkbox'; cbx.checked = on;
    cbx.onchange = function() { runnerSetEnabled(cbx.checked); pushToast('🖥️', cbx.checked ? '내 PC 실행을 켰어요' : '내 PC 실행을 껐어요', cbx.checked ? '설치한 언어를 다시 쓸 수 있어요.' : '이제 서버로만 실행돼요. (러너 프로그램은 그대로 켜져 있어요)'); };
    sw.appendChild(cbx); sw.appendChild(el('span', null, '내 PC 실행 사용')); sw.appendChild(el('small', null, on ? '켜짐: 서버에 없는 언어·버전은 내 컴퓨터로 실행해요' : '꺼짐: 항상 서버로만 실행해요'));
    add(el('div', 'rn-status ' + (on ? 'ok' : 'warn'), on ? '✓ 연결됨 · 내 컴퓨터(' + (RUNNER.info.os || '') + ')의 언어를 쓸 수 있어요' : '연결은 돼 있지만 "내 PC 실행 사용"이 꺼져 있어요 (서버로만 실행)'));
    if (latest && runnerVerLt(RUNNER.info.version, latest)) add(el('p', 'rn-note', '새 러너 버전(' + latest + ')이 있어요. 아래 "다시 설치"의 한 줄을 붙여넣으면 새 버전으로 바뀌어요.'));
    var rt = RUNNER.info.runtimes || {}, names = Object.keys(rt);
    add(el('div', 'rn-lbl', '내 컴퓨터에서 찾은 언어 (' + names.length + '개)'));
    var box = add(el('div', 'rn-langs'));
    names.forEach(function(l) { var r = el('div', 'rn-lang'); r.appendChild(el('b', null, (WS_RUN_LABEL && WS_RUN_LABEL[l]) || l)); r.appendChild(el('span', null, rt[l].map(function(v) { return v.version || v.id; }).join(' · '))); box.appendChild(r); });
    if (!names.length) box.appendChild(el('div', 'rn-faint', '아직 찾은 언어가 없어요. 파이썬·자바·gcc 등을 설치하면 ▶ 실행할 때 알아서 찾아요.'));
    var rs = add(el('button', 'btn', '🔄 다시 검색')); rs.type = 'button';
    rs.onclick = function() { rs.disabled = true; rs.textContent = '검색 중…'; runnerRefresh().then(function() { rs.disabled = false; rs.textContent = '🔄 다시 검색'; }); };
    add(el('p', 'rn-faint', '언어를 새로 설치했다면 ▶ 실행할 때 알아서 다시 찾아요. 이 버튼을 누르지 않아도 돼요.'));
    add(el('p', 'rn-p', '같은 언어가 서버에도 있고 내 PC 에도 있으면 ▶ 실행 옆 선택 박스에서 "서버 · Java 21 / 내 PC · Java 17" 처럼 어디서 어떤 버전으로 실행할지 고를 수 있어요.'));
    var d = add(el('details', 'rn-more')); d.appendChild(el('summary', null, '다시 설치하거나 끄고 싶어요'));
    add(el('p', 'rn-p', '다시 설치(새 버전으로 바꾸기, 컴퓨터를 바꿨을 때): 터미널에 아래 한 줄을 붙여넣으세요.'), d); codeBox(runnerInstallCmd(os), d);
    add(el('p', 'rn-p', '완전히 끄고 지우기(자동 시작 해제):'), d);
    codeBox(os === 'win' ? 'py "$env:USERPROFILE\\.duresync-runner\\duresync_runner.py" --uninstall-autostart' : 'python3 ~/.duresync-runner/duresync_runner.py --uninstall-autostart', d);
    add(el('p', 'rn-faint', '잠깐만 쓰고 싶지 않다면 위의 "내 PC 실행 사용"만 꺼도 돼요.'), d);
  } else {
    /* ---- 아직 연결 전: 3단계 안내 ---- */
    var st;
    if (last.why === 'blocked') st = ['bad', '이 브라우저가 내 컴퓨터로의 연결을 막고 있어요. 크롬·엣지·파이어폭스에서 열어 주세요. (사파리는 막을 수 있어요)'];
    else if (!on) st = ['warn', '내 PC 실행이 꺼져 있어요 (서버로만 실행). 연결한 뒤 켤 수 있어요.'];
    else if (last.why === 'token') st = ['warn', '러너는 켜져 있는데 연결 코드가 달라요. 아래 한 줄을 다시 붙여넣으면 맞춰져요.'];
    else st = ['bad', '아직 내 컴퓨터에 러너가 없어요. 아래 3단계로 설치해 주세요 (1분이면 돼요).'];
    add(el('div', 'rn-status ' + st[0], st[1]));
    var tabs = add(el('div', 'rn-tabs'));
    [['mac', '맥'], ['win', '윈도우'], ['linux', '리눅스']].forEach(function(t) {
      var b = el('button', 'rn-tab' + (os === t[0] ? ' on' : ''), t[1]); b.type = 'button'; b.onclick = function() { RUNNER_UI.os = t[0]; runnerRenderModal(true); }; tabs.appendChild(b);
    });
    var steps = add(el('ol', 'rn-steps'));
    var s1 = el('li'); s1.appendChild(el('b', null, '터미널(검은 글자 창) 열기'));
    s1.appendChild(el('div', 'rn-faint', os === 'win' ? '키보드의 윈도우 키(⊞)를 누르고  PowerShell  이라고 입력한 뒤 Enter 를 누르세요. 파란(또는 검은) 창이 열려요.' : (os === 'mac' ? '키보드에서 ⌘ Command + Space 를 함께 누르고  터미널  이라고 입력한 뒤 Enter 를 누르세요. 글자를 입력하는 창이 열려요.' : '터미널 앱을 열어 주세요. (보통 Ctrl+Alt+T)')));
    steps.appendChild(s1);
    var s2 = el('li'); s2.appendChild(el('b', null, '아래 한 줄을 복사해서 터미널에 붙여넣고 Enter'));
    codeBox(runnerInstallCmd(os), s2);
    s2.appendChild(el('div', 'rn-faint', (os === 'win' ? '붙여넣기: Ctrl+V (또는 창을 마우스 오른쪽 클릭). ' : '붙여넣기: ⌘V (리눅스는 Ctrl+Shift+V). ') + '어느 폴더에 있어도 괜찮아요. 아무것도 따로 받을 필요 없어요.'));
    steps.appendChild(s2);
    var s3 = el('li'); s3.appendChild(el('b', null, '끝! 이 창이 알아서 "연결됨"으로 바뀌어요'));
    s3.appendChild(el('div', 'rn-faint', waited ? '아직 연결이 안 돼요. 터미널에 빨간 글자(에러)가 나왔다면 아래 "자주 나오는 에러"를 보세요. 에러가 없는데도 안 되면 이 페이지를 새로고침(Ctrl+Shift+R) 해 보세요.' : '⏳ 연결을 기다리는 중이에요… 터미널에 "[완료] 설치가 끝났어요!"가 나오면 잠시 뒤 자동으로 바뀌어요.'));
    steps.appendChild(s3);
    var tr = add(el('details', 'rn-more')); tr.open = waited; tr.appendChild(el('summary', null, '자주 나오는 에러와 해결법'));
    var items = [
      ['"파이썬이 없어요 / [필요] 파이썬 3.7 이상" 이라고 나와요', '러너는 파이썬이 있어야 켜져요. ' + (os === 'win' ? 'python.org/downloads 에서 설치(첫 화면 "Add python.exe to PATH" 체크)하거나 PowerShell 에 winget install Python.Python.3.12 를 입력하세요. 설치 후 PowerShell 을 닫았다가 새로 열고 위 한 줄을 다시 붙여넣으세요.' : 'python.org/downloads 에서 설치하세요. 맥은 터미널에 xcode-select --install 도 돼요. 설치 후 위 한 줄을 다시 붙여넣으세요.')],
      ['"러너를 내려받지 못했어요" / "Could not resolve host" 라고 나와요', '인터넷 연결(와이파이)을 확인하고 한 줄을 다시 붙여넣으세요. 회사·학교 보안 프로그램이 막을 수도 있어요.'],
      ['붙여넣었는데 아무 일도 안 일어나요', '한 줄 전체가 붙여넣어졌는지, 맨 끝에서 Enter 를 눌렀는지 확인하세요. 복사 버튼을 누르고 다시 붙여넣어 보세요.'],
      ['설치는 끝났는데 계속 "러너가 없어요" 라고 나와요', '이 페이지를 Ctrl+Shift+R 로 새로고침하고 잠깐 기다려 보세요. 크롬·엣지·파이어폭스에서만 연결돼요(사파리 불가). VPN·보안 프로그램이 내 컴퓨터(127.0.0.1) 연결을 막는지도 확인하세요.'],
      ['"연결 코드가 달라요" 라고 나와요', '위의 한 줄을 다시 붙여넣으면 코드가 자동으로 맞춰져요. (다른 브라우저로 연결하려는 경우에도 한 줄을 다시 실행하세요)']
    ];
    items.forEach(function(it) { var q = el('div', 'rn-q'); q.appendChild(el('b', null, it[0])); q.appendChild(el('div', 'rn-faint', it[1])); tr.appendChild(q); });
  }
  var safe = add(el('div', 'rn-safe'));
  safe.appendChild(el('b', null, '🔒 안전하게 쓰려면'));
  ['러너는 내 컴퓨터(127.0.0.1)에서만 열려요. 같은 와이파이를 쓰는 다른 사람도 내 러너를 쓸 수 없어요. (각자 자기 컴퓨터에 설치해요)', 'DureSync 사이트에서 온 요청만 받고, 연결 코드를 아는 브라우저만 연결돼요.', '코드는 내 컴퓨터에서 내 권한으로 실행돼요(서버처럼 격리되지 않아요). 믿을 수 있는 코드만 실행하세요.', '폰·태블릿·설치형 앱(PWA)에서는 쓸 수 없어요. 서버가 지원하는 언어만 실행돼요.'].forEach(function(t) { safe.appendChild(el('div', 'rn-li', '· ' + t)); });
}

/* ===== 내 PC 에서 실행하기 전의 확인 =====
   내 PC 실행은 서버처럼 격리되지 않아서, 처음 한 번은 안내를 보여 주고
   팀원이 고친 코드(실시간 편집으로 바뀐 코드 포함)는 내가 확인했다는 동의를 받고 나서 실행한다. */
function runnerHash(t) { var h = 5381; t = String(t || ''); for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return h + ':' + t.length; }
function runnerConfirm(title, paras, okLabel, withRemember) {
  return new Promise(function(resolve) {
    var m = document.getElementById('runnerConfirmModal'); if (!m) { resolve(true); return; }
    m.querySelector('.rc-title').textContent = title;
    var body = m.querySelector('.rc-body'); body.innerHTML = '';
    paras.forEach(function(t) { var p = document.createElement('p'); p.textContent = t; body.appendChild(p); });
    var rem = m.querySelector('.rc-remember'); rem.hidden = !withRemember; rem.querySelector('input').checked = false;
    var ok = m.querySelector('.rc-ok'), no = m.querySelector('.rc-no'); ok.textContent = okLabel;
    function done(v) { m.classList.remove('open'); ok.onclick = no.onclick = m.onclick = null; resolve({ ok: v, remember: !rem.hidden && rem.querySelector('input').checked }); }
    ok.onclick = function() { done(true); }; no.onclick = function() { done(false); };
    m.onclick = function(e) { if (e.target === m) done(false); };
    m.classList.add('open'); setTimeout(function() { no.focus(); }, 50);       // 실수로 Enter 를 눌러도 '취소'가 눌리게
  });
}
async function runnerGate(key, code) {
  var f = files[key]; if (!f) return false;
  var me = currentUser ? currentUser.username : null, h = runnerHash(code), paras = [], title = '내 컴퓨터에서 실행할까요?', ok = '실행', remember = false;
  var others = (f.othersEdit || (f.updatedBy && f.updatedBy !== me)) && f.runnerOkHash !== h;
  var acked = false; try { acked = localStorage.getItem('sync_runner_ack') === '1'; } catch (e) {}
  if (others) {
    title = '팀원이 고친 코드예요';
    paras.push((f.updatedBy && f.updatedBy !== me ? f.updatedBy + ' 님이' : '팀원이') + ' 이 파일을 수정했어요. 내 PC 실행은 서버처럼 격리되지 않아서, 파일 삭제 같은 코드도 내 컴퓨터에서 그대로 실행될 수 있어요.');
    paras.push('코드를 훑어보고 믿을 수 있을 때만 실행하세요. (서버로 실행하면 안전하게 격리돼요)');
    ok = '확인했어요, 실행';
  } else if (!acked) {
    paras.push('이 코드는 서버가 아니라 내 컴퓨터에서, 내 권한으로 실행돼요. 서버처럼 격리되지 않아서 파일 삭제·읽기 같은 일도 할 수 있어요.');
    paras.push('내가 쓴 코드나 믿을 수 있는 코드만 실행하세요. 팀원이 고친 코드는 실행 전에 한 번 더 물어봐요.');
    remember = true;
  } else { f.runnerOkHash = h; f.othersEdit = false; return true; }
  var r = await runnerConfirm(title, paras, ok, remember);
  if (!r.ok) return false;
  if (r.remember) { try { localStorage.setItem('sync_runner_ack', '1'); } catch (e) {} }
  f.runnerOkHash = h; f.othersEdit = false;
  return true;
}
