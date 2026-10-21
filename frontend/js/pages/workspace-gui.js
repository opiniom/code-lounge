/* ---- 자바 Swing/AWT 프로그램을 사이트 안의 'GUI 창'으로 띄우기 ----
   서버에는 화면이 없어서 창(JFrame)을 열 수 없다. 그래서 서버는 진짜 javac 로 컴파일만 하고(POST /api/gui/java/build),
   그 결과(.jar)를 브라우저가 CheerpJ(브라우저 안의 자바)로 실행해서 창을 이 페이지 안에 그린다 → PC·모바일·PWA 모두 같다.
   · 코드는 자바 그대로다 (변환하지 않는다). 실행하는 쪽이 진짜 JDK 가 아니라 브라우저 안의 자바라서 JavaFX·일부 라이브러리는 안 된다.
   · 팀원이 올린 코드가 내 로그인 정보를 건드리지 못하게, 창은 로그인 정보를 모르는 작은 페이지(frontend/gui/frame.html)를 iframe 으로 열어서 그린다.
     서버 설정 GUI_FRAME_ORIGIN(다른 주소)을 쓰면 사이트와 완전히 분리된 출처에서 열린다 (개발할 때는 localhost ↔ 127.0.0.1 로 자동 분리).
   · 자바 실행 환경(CheerpJ)은 개인·비영리 용도 무료다. */
var GUI = { cfg: null, frame: null, origin: '', timer: null, closing: false, runId: 0, key: null };

/* Swing/AWT 를 쓰는 코드인가 */
function wsIsGuiJava(code) {
  var c = wsStripComments(code);
  return /\bimport\s+(?:static\s+)?(?:javax\.swing|java\.awt|java\.applet)\b/.test(c) || /\bextends\s+(?:javax\.swing\.)?(?:JFrame|JPanel|JDialog|JApplet|Frame|Applet|Canvas)\b/.test(c) || /\bnew\s+(?:javax\.swing\.)?JFrame\b/.test(c);
}
function wsJavaMainOf(code) {
  var c = wsStripComments(code);
  if (!/\bstatic\s+void\s+main\s*\(/.test(c)) return null;
  var pkg = (/^\s*package\s+([\w.]+)\s*;/m.exec(c) || [])[1] || '';
  var ID = '([\\p{L}_$][\\p{L}\\p{N}_$]*)';                                           // 한글 클래스 이름도 된다
  var pub = new RegExp('\\bpublic\\s+(?:final\\s+|abstract\\s+|strictfp\\s+)*class\\s+' + ID, 'u').exec(c), name = pub ? pub[1] : null;
  if (!name) { var m = new RegExp('\\bclass\\s+' + ID, 'u').exec(c); name = m ? m[1] : null; }
  return name ? (pkg ? pkg + '.' + name : name) : null;
}
function guiConfigLoad() {
  if (GUI.cfg) return Promise.resolve(GUI.cfg);
  return fetch(API_BASE + '/api/gui/config').then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; }).then(function(c) { GUI.cfg = c || {}; return GUI.cfg; });
}
function guiFrameOrigin() {
  var c = GUI.cfg || {}; if (c.frame_origin) return c.frame_origin;
  var h = location.hostname, port = location.port ? ':' + location.port : '';
  if (h === 'localhost') return location.protocol + '//127.0.0.1' + port;           // 개발할 때: 같은 서버를 다른 주소로 열어서 출처를 분리
  if (h === '127.0.0.1') return location.protocol + '//localhost' + port;
  return location.origin;
}
function guiSetStatus(t) { var s = document.getElementById('guiStatus'); if (s) s.textContent = t || ''; }
function guiClose(silent) {
  GUI.runId++; clearTimeout(GUI.timer);
  var dock = document.getElementById('wsGuiDock'), body = document.getElementById('guiBody');
  if (body) body.innerHTML = '';
  GUI.frame = null;
  if (dock) dock.hidden = true;
  if (wsRunning && GUI.key) guiFinished(null, silent);
}
function guiFinished(code, silent) {
  var chip = document.getElementById('termStatusChip'), runBtn = document.getElementById('wsRunBtn'), stopBtn = document.getElementById('wsStopBtn'), t = document.getElementById('termExecTime');
  wsRunning = false; GUI.key = null;
  if (runBtn) runBtn.disabled = false;
  if (stopBtn) stopBtn.style.display = 'none';
  if (chip && !silent) { chip.className = 'term-status-chip ' + (code ? 'error' : 'success'); chip.textContent = code ? '종료 (코드 ' + code + ')' : '정상 종료'; }
  if (t) t.textContent = '종료됨';
}
function guiFilesPayload() {
  var out = [];
  Object.keys(files).forEach(function(k) {
    var f = files[k], p = f.path || f.tab;
    if (wsExt(p) !== 'java') return;
    out.push({ path: p, content: (window.monaco && monacoEditor && k === currentFileKey) ? monacoEditor.getValue() : (f.raw || '') });
  });
  return out;
}
/* ▶ 실행: 컴파일(서버) → 창 띄우기(브라우저). code = 지금 열린 파일의 내용 */
async function wsGuiRun(key, code) {
  var fobj = files[key], base = wsFileBase(fobj);
  guiClose(true);
  var main = wsJavaMainOf(code);
  if (!main) {                                                                       // 열린 파일에 main 이 없으면, 다른 파일 중 GUI main 을 찾는다
    var alt = Object.keys(files).filter(function(k) { var f = files[k]; return wsExt(f.path || f.tab) === 'java' && wsJavaMainOf(f.raw || ''); })[0];
    if (alt) main = wsJavaMainOf(files[alt].raw || '');
  }
  var termPanel = document.getElementById('wsTerminalPanel'); if (termPanel) termPanel.classList.remove('collapsed');
  setTerminalTab('interactive');
  var log = document.getElementById('termLiveLog');
  if (log) log.innerHTML = '<div style="color:#06b6d4; font-weight:600;">// ▶ ' + escapeHtml(base) + ' 실행 (GUI 창)</div><div style="color:#8b949e; margin-bottom:8px;">// 서버가 컴파일하고, 창은 이 화면 안에서 열려요. 창을 닫거나 ■ 를 누르면 끝나요.</div>';
  var runBtn = document.getElementById('wsRunBtn'), stopBtn = document.getElementById('wsStopBtn'), chip = document.getElementById('termStatusChip'), execTime = document.getElementById('termExecTime');
  function fail(msg, isErr) { appendLiveOutput(msg + '\n', true); if (chip) { chip.style.display = 'inline-block'; chip.className = 'term-status-chip error'; chip.textContent = '실행 안 함'; } }
  if (!main) { fail('main 메서드가 있는 자바 파일을 열고 실행해 주세요. (public static void main(String[] args))'); return; }
  wsRunning = true; GUI.key = key;
  if (stopBtn) stopBtn.style.display = 'inline-flex';          // ▶ 는 그대로 눌러서 다시 실행할 수 있다
  if (chip) { chip.style.display = 'inline-block'; chip.className = 'term-status-chip running'; chip.textContent = '컴파일 중'; }
  if (execTime) { execTime.style.display = 'inline-block'; execTime.textContent = fobj.path || fobj.tab; }
  appendLiveOutput('[Java 컴파일 중...]\n', false);
  var cfg = await guiConfigLoad(), runId = ++GUI.runId;
  if (cfg.available === false) { fail('이 서버에서는 GUI 창 실행을 쓸 수 없어요.'); guiFinished(1, true); return; }
  var res;
  try { res = await apiFetch('/api/gui/java/build', { method: 'POST', body: JSON.stringify({ files: guiFilesPayload(), main_class: main }) }); }
  catch (e) { if (runId !== GUI.runId) return; fail(e.status === 401 ? '로그인한 뒤에 실행할 수 있어요.' : '컴파일하지 못했어요: ' + (e.message || e)); guiFinished(1, true); return; }
  if (runId !== GUI.runId) return;                                                     // 컴파일하는 동안 취소했거나 다시 실행했다
  if (!res.ok) { appendLiveOutput('\n' + (res.blocked ? '' : '[컴파일 에러]\n') + res.errors + '\n', true); if (chip) { chip.className = 'term-status-chip error'; chip.textContent = res.blocked ? '실행 안 함' : '컴파일 에러'; } guiFinished(1, true); return; }
  appendLiveOutput('[컴파일 완료 · 창을 여는 중…]\n', false);
  var jar = Uint8Array.from(atob(res.jar_b64), function(c) { return c.charCodeAt(0); }).buffer;
  guiOpenFrame(jar, res.main, runId, base);
}
function guiOpenFrame(jar, main, runId, title) {
  var dock = document.getElementById('wsGuiDock'), body = document.getElementById('guiBody'); if (!dock || !body) return;
  // 자바 창(JFrame)은 보통 500~800px 이라, 화면이 좁아도 최소 크기(560×440)로 그려 두고 패널 안에서 밀어서(스크롤) 볼 수 있게 한다
  var vw = Math.max(560, Math.min(window.innerWidth - 24, 760)), vh = Math.max(440, Math.min(Math.round(window.innerHeight * 0.62), 560));
  GUI.origin = guiFrameOrigin(); var cross = GUI.origin !== location.origin;
  var f = document.createElement('iframe');
  f.title = 'GUI 창'; f.style.width = vw + 'px'; f.style.height = vh + 'px'; f.style.border = '0'; f.style.display = 'block';
  if (cross) f.setAttribute('sandbox', 'allow-scripts allow-same-origin');             // 다른 출처에서 열리므로 사이트의 로그인 정보·저장소에는 닿지 못한다
  f.src = GUI.origin + '/static/gui/frame.html?p=' + encodeURIComponent(location.origin);
  body.innerHTML = ''; body.appendChild(f); GUI.frame = f;
  document.getElementById('guiTitle').textContent = 'GUI 창 · ' + title;
  guiSetStatus('자바 실행 환경을 준비하는 중…'); dock.hidden = false;
  GUI.timer = setTimeout(function() { if (runId === GUI.runId && GUI.frame === f) guiSetStatus('아직 준비 중이에요… (처음 한 번은 20~40초 걸려요)'); }, 12000);
  var onMsg = function(e) {
    if (GUI.frame !== f || runId !== GUI.runId) { window.removeEventListener('message', onMsg); return; }
    if (e.source !== f.contentWindow || e.origin !== GUI.origin) return;
    var m = e.data || {};
    if (m.t === 'ready') f.contentWindow.postMessage({ t: 'run', jar: jar, main: main, w: vw, h: vh }, GUI.origin);
    else if (m.t === 'status') { guiSetStatus(m.s); var chip = document.getElementById('termStatusChip'); if (m.s === '실행 중' && chip) { chip.className = 'term-status-chip running'; chip.textContent = '실행 중'; clearTimeout(GUI.timer); } }
    else if (m.t === 'out') appendLiveOutput(String(m.text || ''), !!m.err);
    else if (m.t === 'exit') { window.removeEventListener('message', onMsg); appendLiveOutput('\n[프로그램 종료]\n', false); guiSetStatus('종료됨'); guiFinished(m.code || 0); }
  };
  window.addEventListener('message', onMsg);
}
function wsGuiRerun() { guiClose(true); runCode(); }
