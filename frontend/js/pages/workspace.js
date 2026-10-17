/* ---- 파일 확장자 및 헬퍼 ---- */
function getDotColorForExt(ext) {
  var map = {
    py: '#3572A5', java: '#b07219', ts: '#3178c6', tsx: '#3178c6', js: '#f1e05a', jsx: '#f1e05a', mjs: '#f1e05a', cjs: '#f1e05a',
    json: '#cbcb41', html: '#e34c26', css: '#563d7c', md: '#42a5f5', txt: '#888888', sql: '#e38c00', sh: '#89e051', bash: '#89e051',
    yml: '#cb171e', yaml: '#cb171e', c: '#555555', h: '#555555', cpp: '#f34b7d', cc: '#f34b7d', cxx: '#f34b7d', hpp: '#f34b7d',
    cs: '#178600', rb: '#cc342d', php: '#4F5D95', pl: '#0298c3', go: '#00ADD8', rs: '#dea584', kt: '#A97BFF', swift: '#F05138', lua: '#000080'
  };
  return map[ext] || '#888888';
}

function getLangForExt(ext) {
  var map = {
    py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    java: 'java', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php', pl: 'perl',
    sh: 'shell', bash: 'shell', go: 'go', rs: 'rust', kt: 'kotlin', swift: 'swift', lua: 'lua', json: 'json', html: 'html', htm: 'html',
    css: 'css', scss: 'scss', md: 'markdown', sql: 'sql', yml: 'yaml', yaml: 'yaml', xml: 'xml'
  };
  return map[ext] || 'plaintext';
}

/* 실행할 수 있는 파일: 확장자 → 실행 언어 (서버 샌드박스가 아는 이름). 그 밖의 파일(.md .txt .json …)은 실행하지 않는다 */
var WS_RUN_BY_EXT = { py:'python', js:'javascript', mjs:'javascript', cjs:'javascript', ts:'typescript', java:'java', c:'c', cpp:'cpp', cc:'cpp', cxx:'cpp', cs:'csharp', rb:'ruby', php:'php', pl:'perl', sh:'bash', bash:'bash', go:'go', rs:'rust' };
var WS_RUN_LABEL = { python:'Python', javascript:'JavaScript', typescript:'TypeScript', java:'Java', c:'C', cpp:'C++', csharp:'C#', ruby:'Ruby', php:'PHP', perl:'Perl', bash:'Bash', go:'Go', rust:'Rust' };
function wsExt(name) { var n = String(name || '').split('/').pop(); var i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; }
function wsRunLang(key) { var f = key && files[key]; return f ? (WS_RUN_BY_EXT[wsExt(f.path || f.tab)] || null) : null; }

/* ---- 사용자 컴퓨터 폴더 입력 및 새 파일 생성 ---- */
function triggerOpenFolder() {
  var input = document.getElementById('wsFolderInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

var WS_BINARY_EXT = ['png','jpg','jpeg','gif','ico','webp','pdf','zip','tar','gz','exe','dll','so','dylib','class','pyc','woff','woff2','ttf'];
function handleFolderSelect(event) {
  var fileList = event.target.files;
  if (!fileList || fileList.length === 0) return;
  var entries = [];
  var skipped = 0;
  var reads = [];
  var rootFolderName = '';
  for (var i = 0; i < fileList.length; i++) {
    (function(file) {
      var relPath = file.webkitRelativePath || file.name;
      var parts = relPath.split('/');
      if (parts.length > 1 && !rootFolderName) rootFolderName = parts[0];
      var displayPath = parts.length > 1 ? parts.slice(1).join('/') : file.name;
      if (/(^|\/)(node_modules|\.git|__pycache__|\.venv|dist|build)(\/|$)/.test(displayPath) || !wsValidatePath(displayPath).ok) { skipped++; return; }
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      if (WS_BINARY_EXT.indexOf(ext) >= 0 || file.size > 300000) { skipped++; return; }
      reads.push(new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function(e) { entries.push({ path: displayPath, content: String(e.target.result || '') }); resolve(); };
        reader.onerror = function() { skipped++; resolve(); };
        reader.readAsText(file);
      }));
    })(fileList[i]);
  }
  Promise.all(reads).then(function() {
    if (!entries.length) { pushToast('📁', '가져올 파일이 없어요', '이미지·대용량·node_modules 같은 파일은 건너뛰어요'); return; }
    if (wsUseServer()) { wsImportEntries(entries, skipped, rootFolderName); return; }
    // 로그인 전(데모): 이 화면에서만 사용
    files = {}; openedTabs = [];
    entries.forEach(function(en){
      var ext = (en.path.split('.').pop() || '').toLowerCase();
      var key = wsKey(en.path);
      files[key] = { tab: en.path, path: en.path, dot: getDotColorForExt(ext), lang: getLangForExt(ext), raw: en.content, dirty: false };
    });
    var firstKeys = Object.keys(files).slice(0, 5);
    openedTabs = firstKeys; currentFileKey = firstKeys[0] || null;
    renderWsEmpty(); renderFileTree(); renderTabs();
    if (currentFileKey) renderFileContent(currentFileKey);
    pushToast('📁', '폴더 열기 완료', (rootFolderName || '선택한 폴더') + ' · ' + entries.length + '개 파일 (이 화면에서만 보여요)');
  });
}

/* VS Code 처럼: 폴더를 누르고 "새 파일/새 폴더"를 누르면 그 폴더 안에 입력칸이 바로 생긴다 (폴더 이름을 다시 칠 필요 없음) */
var wsSelDir = '', wsCreating = null;
function wsDirOf(path) { var i = String(path || '').lastIndexOf('/'); return i < 0 ? '' : path.slice(0, i); }
function wsDirExists(dir) { if (!dir) return true; return Object.keys(files).some(function(k){ return files[k].path.indexOf(dir + '/') === 0; }); }
function promptNewFile(kind) { wsStartCreate(wsSelDir, kind === 'folder' ? 'folder' : 'file'); }
function wsStartCreate(dir, kind) {
  var tree = document.getElementById('wsFileTree');
  if (tree && tree.classList.contains('collapsed')) toggleSidebar();
  if (!wsDirExists(dir)) dir = '';
  wsSelDir = dir; wsRenaming = null; wsDeleting = null;
  var parts = dir ? dir.split('/') : [], acc = '';
  parts.forEach(function(p){ acc += (acc ? '/' : '') + p; wsCollapsed[acc] = false; });       // 닫혀 있던 폴더는 펼친다
  wsSearch = ''; var si = document.getElementById('wsFileSearch'); if (si) si.value = '';
  wsCreating = { dir: dir, kind: kind || 'file' };
  var empty = document.getElementById('wsEmptyState'), shell = document.querySelector('.ws-shell');
  if (empty && !Object.keys(files).length) {            // 파일이 하나도 없을 땐 탐색기를 먼저 보여준다
    empty.hidden = true; if (shell) shell.classList.remove('is-empty');
    if (tree) tree.hidden = false;
    var col = document.getElementById('wsEditorCol'); if (col) col.hidden = false;
    var rv = document.getElementById('wsResizerSidebar'); if (rv) rv.hidden = false;
  }
  renderFileTree();
  var inp = document.querySelector('#wsFileTreeContent .ft-create input');
  if (inp) { inp.focus(); var row = inp.closest('.ft-create'); if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' }); }
}
function wsCancelCreate() { wsCreating = null; renderFileTree(); renderWsEmpty(); }
function wsCommitCreate(inp, value) {
  var c = wsCreating; if (!c) return;
  var rel = String(value || '').trim().replace(/^\/+/, '');
  if (!rel) { wsCancelCreate(); return; }
  var full = (c.dir ? c.dir + '/' : '') + rel;
  var v = wsValidatePath(full);
  if (!v.ok) { inp.classList.add('err'); inp.title = v.err; pushToast('⚠️', (c.kind === 'folder' ? '폴더' : '파일') + ' 이름을 확인해 주세요', v.err); return false; }
  wsCreating = null;
  (c.kind === 'folder' ? wsCreateFolder(v.path) : wsCreateFile(v.path)).then(function(){ renderFileTree(); renderWsEmpty(); });
  return true;
}
/* 이름 검사 (서버 규칙과 같음): 점(.)으로만 된 이름 · 금지 문자 · 앞뒤 공백/끝의 마침표 */
function wsValidatePath(name) {
  var p = String(name || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
  if (!p) return { ok: false, err: '이름을 입력해 주세요.' };
  if (p.length > 300) return { ok: false, err: '경로가 너무 길어요.' };
  var segs = p.split('/');
  for (var i = 0; i < segs.length; i++) {
    var sg = segs[i];
    if (!sg.replace(/\./g, '')) return { ok: false, err: "'" + sg + "' 처럼 점(.)으로만 된 이름은 쓸 수 없어요." };
    if (sg !== sg.trim() || /\.$/.test(sg)) return { ok: false, err: '이름의 앞뒤 공백이나 끝의 마침표는 쓸 수 없어요.' };
    if (/[\x00-\x1f\\:*?"<>|]/.test(sg)) return { ok: false, err: '이름에 \\ : * ? " < > | 문자는 쓸 수 없어요.' };
    if (sg.length > 120) return { ok: false, err: '이름이 너무 길어요. (최대 120자)' };
  }
  return { ok: true, path: p };
}
function wsPaintSel() {
  document.querySelectorAll('#wsFileTreeContent .ftree-node.folder[data-path]').forEach(function(n){ n.classList.toggle('sel', n.dataset.path === wsSelDir); });
}
/* ---- 트리 뷰 렌더링 ---- */
var wsSearch = '', wsRenaming = null, wsDeleting = null, wsCollapsed = {};
function wsSetSearch(v){ wsSearch = (v || '').trim().toLowerCase(); renderFileTree(); }
var ICON_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>';
var ICON_FOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
var ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>';
function renderFileTree() {
  var treeEl = document.getElementById('wsFileTreeContent');
  if (!treeEl) return;
  treeEl.innerHTML = '';
  var allKeys = Object.keys(files);
  var keys = allKeys.filter(function(k){
    var nm = (files[k].tab || k).toLowerCase();
    return !wsSearch || (nm.split('/').pop() !== '.gitkeep' && nm.indexOf(wsSearch) >= 0);
  });
  if (keys.length === 0 && !wsCreating) {
    treeEl.innerHTML = '<div class="ft-empty">' + (allKeys.length ? '검색 결과가 없어요.' : '아직 파일이 없어요.<br><button class="btn" style="margin-top:8px; font-size:12px; padding:6px 12px;" onclick="promptNewFile()">＋ 새 파일</button>') + '</div>';
    return;
  }
  var root = { dirs: {}, files: [], path: '' };
  keys.forEach(function(key) {
    var f = files[key];
    var parts = (f.tab || key).split('/');
    var curr = root, acc = '';
    for (var i = 0; i < parts.length - 1; i++) {
      acc += (acc ? '/' : '') + parts[i];
      var d = parts[i];
      if (!curr.dirs[d]) curr.dirs[d] = { dirs: {}, files: [], path: acc };
      curr = curr.dirs[d];
    }
    if (parts[parts.length - 1] !== '.gitkeep') curr.files.push({ key: key, name: parts[parts.length - 1], file: f });      // .gitkeep 은 빈 폴더를 붙잡아 두는 표시라서 목록엔 숨긴다
  });
  function countFiles(n){ var c = n.files.length; Object.keys(n.dirs).forEach(function(k){ c += countFiles(n.dirs[k]); }); return c; }
  function createRow(dir) {
    var row = document.createElement('div');
    row.className = 'ftree-node ft-create';
    row.innerHTML = (wsCreating.kind === 'folder' ? ICON_FOLDER : ICON_FILE);
    var inp = document.createElement('input');
    inp.className = 'ft-rename'; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.placeholder = (wsCreating.kind === 'folder' ? '폴더 이름' : '파일 이름 · 예: main.py') + (dir ? '  (' + dir + '/ 안)' : '');
    var done = false;
    inp.onkeydown = function(e){
      e.stopPropagation();
      if (isEnter(e)) { done = true; if (wsCommitCreate(inp, inp.value) === false) done = false; }
      else if (e.key === 'Escape') { done = true; wsCancelCreate(); }
      else inp.classList.remove('err');
    };
    inp.onblur = function(){ setTimeout(function(){ if (done || !wsCreating) return; if (inp.value.trim()) { done = true; if (wsCommitCreate(inp, inp.value) === false) done = false; } else { done = true; wsCancelCreate(); } }, 120); };
    inp.onclick = function(e){ e.stopPropagation(); };
    row.appendChild(inp);
    return row;
  }
  function buildBranch(node) {
    var frag = document.createDocumentFragment();
    if (wsCreating && wsCreating.dir === node.path) frag.appendChild(createRow(node.path));
    Object.keys(node.dirs).sort().forEach(function(dirName) {
      var dn = node.dirs[dirName];
      var closed = !wsSearch && wsCollapsed[dn.path];
      var dirNode = document.createElement('div');
      dirNode.dataset.path = dn.path;
      if (wsDeleting === 'dir:' + dn.path) {
        dirNode.className = 'ftree-node folder confirm';
        dirNode.innerHTML = '<span class="fname"></span><button class="cbtn yes">삭제</button><button class="cbtn no">취소</button>';
        dirNode.querySelector('.fname').textContent = '"' + dirName + '" 폴더와 안의 파일 ' + countFiles(dn) + '개를 삭제할까요?';
        dirNode.querySelector('.yes').onclick = function(e){ e.stopPropagation(); wsDeleteDir(dn.path); };
        dirNode.querySelector('.no').onclick = function(e){ e.stopPropagation(); wsDeleting = null; renderFileTree(); };
        frag.appendChild(dirNode);
        return;
      }
      dirNode.className = 'ftree-node folder' + (closed ? ' closed' : '') + (wsSelDir === dn.path ? ' sel' : '');
      dirNode.innerHTML = ICON_CHEV + ICON_FOLDER + '<span class="fname"></span>' +
        '<span class="fact"><button class="nf" title="이 폴더에 새 파일"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/></svg></button>' +
        '<button class="nd" title="이 폴더에 새 폴더"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M12 11v6M9 14h6"/></svg></button>' +
        '<button class="del" title="폴더 삭제"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button></span>' +
        '<span class="fcnt">' + countFiles(dn) + '</span>';
      dirNode.querySelector('.fname').textContent = dirName;
      var childContainer = document.createElement('div');
      childContainer.className = 'ftree-children';
      childContainer.style.display = closed ? 'none' : 'block';
      childContainer.appendChild(buildBranch(dn));
      dirNode.onclick = function(e) {
        e.stopPropagation();
        wsSelDir = dn.path;                                  // 폴더를 누르면 그 폴더가 선택돼서, 다음 "새 파일"이 이 안에 만들어진다
        wsCollapsed[dn.path] = !wsCollapsed[dn.path];
        var nowClosed = wsCollapsed[dn.path];
        childContainer.style.display = nowClosed ? 'none' : 'block';
        dirNode.classList.toggle('closed', nowClosed);
        wsPaintSel();
        if (typeof wsPresPaint === 'function') wsPresPaint();
      };
      dirNode.querySelector('.nf').onclick = function(e){ e.stopPropagation(); wsStartCreate(dn.path, 'file'); };
      dirNode.querySelector('.nd').onclick = function(e){ e.stopPropagation(); wsStartCreate(dn.path, 'folder'); };
      dirNode.querySelector('.del').onclick = function(e){ e.stopPropagation(); wsDeleting = 'dir:' + dn.path; renderFileTree(); };
      frag.appendChild(dirNode);
      frag.appendChild(childContainer);
    });
    node.files.sort(function(a, b){ return a.name.localeCompare(b.name); }).forEach(function(item) {
      var fileNode = document.createElement('div');
      fileNode.dataset.key = item.key;
      if (wsDeleting === item.key) {
        fileNode.className = 'ftree-node file confirm';
        fileNode.innerHTML = '<span class="fname"></span><button class="cbtn yes">삭제</button><button class="cbtn no">취소</button>';
        fileNode.querySelector('.fname').textContent = item.name + ' 삭제?';
        fileNode.querySelector('.yes').onclick = function(e){ e.stopPropagation(); wsDeleteFile(item.key); };
        fileNode.querySelector('.no').onclick = function(e){ e.stopPropagation(); wsDeleting = null; renderFileTree(); };
        frag.appendChild(fileNode);
        return;
      }
      if (wsRenaming === item.key) {
        fileNode.className = 'ftree-node file';
        var inp = document.createElement('input');
        inp.className = 'ft-rename'; inp.value = item.file.tab;
        var done = false;
        inp.onkeydown = function(e){
          if (isEnter(e)) { done = true; wsRenameFile(item.key, inp.value); }
          else if (e.key === 'Escape') { done = true; wsRenaming = null; renderFileTree(); }
        };
        inp.onblur = function(){ if (!done) { wsRenaming = null; renderFileTree(); } };
        inp.onclick = function(e){ e.stopPropagation(); };
        fileNode.innerHTML = ICON_FILE;
        fileNode.appendChild(inp);
        frag.appendChild(fileNode);
        setTimeout(function(){ inp.focus(); var dot = inp.value.lastIndexOf('.'); inp.setSelectionRange(inp.value.lastIndexOf('/') + 1, dot > 0 ? dot : inp.value.length); }, 0);
        return;
      }
      fileNode.className = 'ftree-node file' + (item.key === currentFileKey ? ' active' : '');
      fileNode.innerHTML = ICON_FILE + '<span class="fname"></span>' +
        (item.file.dirty ? '<span class="fmod" title="저장 안 된 변경"></span>' : '') +
        '<span class="fact"><button class="ren" title="이름 바꾸기"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>' +
        '<button class="del" title="삭제"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button></span>' +
        '<span class="fdot" style="background:' + (item.file.dot || '#888') + ';"></span>';
      fileNode.querySelector('.fname').textContent = item.name;
      fileNode.title = item.file.tab + (item.file.updatedBy ? ' · 마지막 수정 ' + item.file.updatedBy : '');
      fileNode.onclick = function(e) { e.stopPropagation(); wsSelDir = wsDirOf(item.file.path); wsPaintSel(); openFile(item.key, fileNode); };      // 파일을 누르면 그 파일이 있는 폴더가 선택된다
      fileNode.ondblclick = function(e) { e.stopPropagation(); wsRenaming = item.key; renderFileTree(); };
      fileNode.querySelector('.ren').onclick = function(e){ e.stopPropagation(); wsRenaming = item.key; renderFileTree(); };
      fileNode.querySelector('.del').onclick = function(e){ e.stopPropagation(); wsDeleting = item.key; renderFileTree(); };
      frag.appendChild(fileNode);
    });
    return frag;
  }
  treeEl.appendChild(buildBranch(root));
  treeEl.onclick = function(e){ if (e.target === treeEl) { wsSelDir = ''; wsPaintSel(); } };       // 빈 곳을 누르면 맨 위(루트)가 선택된다
  if (typeof wsPresPaint === 'function') wsPresPaint();
}

/* ---- 워크스페이스: 파일 데이터 / 새 프로젝트 시작 파일 ---- */
var files = {};
var currentFileKey = null;
var openedTabs = [];

function initProjectStarterFiles(proj, force) {
  var title = (proj && proj.title) ? proj.title : (document.getElementById('wsCrumbName') ? document.getElementById('wsCrumbName').textContent : '');
  {
    files = {
      main_py: {
        tab: 'main.py',
        dot: '#4B8BBE',
        lang: 'python',
        raw: `# DureSync 워크스페이스 시작 파일\n\ndef main():\n    print("🚀 코딩을 시작해보세요!")\n\nif __name__ == '__main__':\n    main()\n`
      },
      readme: {
        tab: 'README.md',
        dot: '#42A5F5',
        lang: 'markdown',
        raw: `# ${title || '프로젝트'}\n\n프로젝트 설명을 작성해보세요.`
      }
    };
    openedTabs = ['main_py', 'readme'];
    currentFileKey = 'main_py';
  }

  var wsEmptyState = document.getElementById('wsEmptyState');
  var wsFileTree = document.getElementById('wsFileTree');
  var wsEditorCol = document.getElementById('wsEditorCol');
  if (wsEmptyState) wsEmptyState.hidden = true;
  if (wsFileTree) wsFileTree.hidden = false;
  if (wsEditorCol) wsEditorCol.hidden = false;

  renderFileTree();
  renderTabs();
  if (monacoEditor && currentFileKey && files[currentFileKey]) {
    renderFileContent(currentFileKey);
  }
}


var monacoEditor = null;
var monacoLoaded = false;

function getFileLanguage(key) {
  if (!key || !files[key]) return 'python';
  var f = files[key];
  return getLangForExt(wsExt(f.path || f.tab));
}

function getMonacoLanguage(key) {
  return getFileLanguage(key);      // getLangForExt 가 돌려주는 이름이 곧 Monaco 언어 이름
}

function updateEditorStatusBar() {
  if (window.monaco && monacoEditor) {
    var model = monacoEditor.getModel();
    if (model) {
      var lineCount = model.getLineCount();
      var sbLines = document.getElementById('sbLines');
      if (sbLines) sbLines.textContent = lineCount + ' lines';
      var pos = monacoEditor.getPosition() || { lineNumber: 1, column: 1 };
      var sbPos = document.getElementById('sbPos');
      if (sbPos) sbPos.textContent = 'Ln ' + pos.lineNumber + ', Col ' + pos.column;
    }
  }
  var warn = document.getElementById('sbNameWarn');
  if (warn) {
    var iss = currentFileKey ? wsJavaNameIssue(currentFileKey) : null;
    warn.hidden = !iss;
    if (iss) { warn.textContent = '⚠ 파일명 ≠ 클래스명'; warn.title = '파일 ' + iss.stem + '.java 와 public 클래스 ' + iss.cls + ' 가 달라요. 눌러서 맞추기'; }
  }
  var badge = document.getElementById('sbLangBadge');
  if (badge && currentFileKey) {
    var lang = getFileLanguage(currentFileKey), run = wsRunLang(currentFileKey);
    badge.textContent = run ? WS_RUN_LABEL[run] : (lang === 'plaintext' ? '텍스트' : lang.toUpperCase());
  }
}

/* 코드 편집기(Monaco, 약 0.7MB)는 처음 화면에서는 받지 않고, 워크스페이스를 열 때 불러온다.
   빠른 PC 에서는 홈 화면이 다 그려진 뒤 한가할 때 미리 받아 둬서 처음 열 때도 바로 뜬다 (데이터 절약 모드·느린 망·폰에서는 미리 받지 않음) */
var wsMonacoAsked = false;
function wsEnsureMonaco() {
  if (wsMonacoAsked || monacoLoaded) return;
  wsMonacoAsked = true;
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js';
  s.async = true;
  s.onload = initMonacoEditor;
  s.onerror = function() { wsMonacoAsked = false; pushToast('⚠️', '코드 편집기를 불러오지 못했어요', '인터넷 연결을 확인하고 워크스페이스를 다시 열어 주세요.'); };
  document.head.appendChild(s);
}
(function() {
  var c = navigator.connection || {};
  var fast = !c.saveData && (!c.effectiveType || c.effectiveType === '4g') && window.innerWidth >= 900;
  if (fast) window.addEventListener('load', function() { (window.requestIdleCallback || function(f) { setTimeout(f, 3500); })(wsEnsureMonaco, { timeout: 6000 }); });
})();
function initMonacoEditor() {
  if (typeof require === 'undefined') {
    setTimeout(initMonacoEditor, 100);
    return;
  }
  require.config({
    paths: {
      'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs'
    }
  });
  require(['vs/editor/editor.main'], function() {
    var container = document.getElementById('monacoEditorContainer');
    if (!container) return;

    var curKey = currentFileKey || Object.keys(files)[0] || 'calc';
    var curContent = (files[curKey] && files[curKey].raw) ? files[curKey].raw : '';
    var curLang = getMonacoLanguage(curKey);

    monacoEditor = monaco.editor.create(container, {
      value: curContent,
      language: curLang,
      theme: isDarkMode() ? 'vs-dark' : 'vs',
      automaticLayout: true,
      fontSize: 13.5,
      fontFamily: "'JetBrains Mono', 'D2Coding', 'Cascadia Code', Consolas, monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      minimap: { enabled: true, side: 'right' },
      scrollBeyondLastLine: false,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'off',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 10, bottom: 10 },
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      renderLineHighlight: 'all',
      overviewRulerBorder: false,
      snippetSuggestions: 'top',                                   // sout · fori 같은 줄임말을 목록 맨 위에
      tabCompletion: 'on',                                         // 줄임말을 치고 Tab → 바로 펼치기 (IntelliJ 처럼)
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      autoClosingBrackets: 'always', autoClosingQuotes: 'always', autoIndent: 'full', formatOnPaste: true,
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10
      }
    });

    monacoLoaded = true;
    wsRegisterSnippets(); wsQuickKeysInit();
    if (typeof wsPresHookEditor === 'function') wsPresHookEditor();

    // 실시간 코드 변경 동기화
    monacoEditor.onDidChangeModelContent(function(ev) {
      if (wsSettingValue) return;   // 파일을 열면서 값을 채우는 변경은 '수정'이 아님
      if (currentFileKey && files[currentFileKey]) {
        files[currentFileKey].raw = monacoEditor.getValue();
        var live = wsLiveOnChange(ev);                          // 실시간 공동 편집 중이면 서버가 저장한다 (일반 저장은 하지 않음)
        if (!live) wsMarkDirty(currentFileKey);
        if (!LVSTAT.applying && typeof wsPresTyped === 'function') wsPresTyped();
        pvAutoRefresh();
      }
      updateEditorStatusBar();
    });
    wsLiveInitInput();
    if (currentFileKey) wsLiveAttach(currentFileKey, false);   // 편집기가 늦게 떠도 현재 파일을 실시간 편집에 붙인다

    // 커서 위치 변경 시 상태바 동기화
    monacoEditor.onDidChangeCursorPosition(function(e) {
      var pos = e.position;
      var sbPos = document.getElementById('sbPos');
      if (sbPos) sbPos.textContent = 'Ln ' + pos.lineNumber + ', Col ' + pos.column;
    });

    // 단축키: Ctrl/Cmd+S 저장
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function() {
      if (currentFileKey) wsSave(currentFileKey, false, true);
    });
    // 단축키: Ctrl+Enter 또는 Cmd+Enter로 실행
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function() {
      runCode();
    });

    updateEditorStatusBar();
  });
}

/* ---- 탭 렌더링 및 닫기 기능 ---- */
function renderTabs() {
  var tabsContainer = document.getElementById('editorTabs');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';

  openedTabs.forEach(function(key) {
    var f = files[key];
    if (!f) return;
    var tabDiv = document.createElement('div');
    tabDiv.className = 'etab' + (key === currentFileKey ? ' active' : '');
    tabDiv.dataset.file = key;
    tabDiv.onclick = function() { openFile(key, null); };

    var dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = f.dot || '#888';

    var title = document.createElement('span');
    title.className = 'etab-title';
    title.textContent = f.tab;

    var modDot = null;
    if (f.dirty) { modDot = document.createElement('span'); modDot.className = 'etab-mod'; modDot.title = '저장 안 된 변경'; }
    var closeBtn = document.createElement('span');
    closeBtn.className = 'etab-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = '파일 닫기';
    closeBtn.onclick = function(ev) {
      closeFileTab(key, ev);
    };

    tabDiv.appendChild(dot);
    tabDiv.appendChild(title);
    if (modDot) tabDiv.appendChild(modDot);
    tabDiv.appendChild(closeBtn);
    tabsContainer.appendChild(tabDiv);
  });

  // 에디터 활성 파일 유무에 따라 뷰 토글
  var monContainer = document.getElementById('monacoEditorContainer');
  var noFiles = document.getElementById('editorNoFiles');
  if (openedTabs.length === 0) {
    if (monContainer) monContainer.style.display = 'none';
    if (noFiles) noFiles.style.display = 'flex';
  } else {
    if (monContainer) monContainer.style.display = 'block';
    if (noFiles) noFiles.style.display = 'none';
    if (window.monaco && monacoEditor) {
      monacoEditor.layout();
    }
  }
  if (typeof wsPresPaint === 'function') { wsPresPaint(); wsPresSync(); }
}

function closeFileTab(key, ev) {
  if (ev) ev.stopPropagation();
  var idx = openedTabs.indexOf(key);
  if (idx !== -1) {
    openedTabs.splice(idx, 1);
  }
  if (currentFileKey === key) {
    if (openedTabs.length > 0) {
      var nextKey = openedTabs[Math.max(0, idx - 1)];
      openFile(nextKey, null);
    } else {
      currentFileKey = null;
      wsLiveDetach();
      renderTabs();
      if (window.monaco && monacoEditor) {
        wsSettingValue = true; monacoEditor.setValue(''); wsSettingValue = false;
      }
      updateEditorStatusBar();
    }
  } else {
    renderTabs();
  }
}

function openFile(key, el) {
  if (!files[key]) return;
  if (!openedTabs.includes(key)) {
    openedTabs.push(key);
  }
  currentFileKey = key;

  document.querySelectorAll('.ftree-node.file').forEach(function(n) {
    n.classList.remove('active');
  });
  if (el && el.classList.contains('ftree-node')) {
    el.classList.add('active');
  }

  renderTabs();
  renderFileContent(key);

  var openProj = myProjects.find(function(p){ return p.id === currentWorkspaceId; });
  if (openProj && files[key]) {
    openProj.recentFile = files[key].tab;
    renderProjRow();
  }
}

var wsSettingValue = false;
function renderFileContent(key, keepCursor) {
  var f = files[key];
  if (!f) return;
  if (window.monaco && monacoEditor) {
    var lang = getMonacoLanguage(key);
    var model = monacoEditor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, lang);
    }
    var pos = keepCursor ? monacoEditor.getPosition() : null;
    wsSettingValue = true;
    monacoEditor.setValue(f.raw || '');
    wsSettingValue = false;
    monacoEditor.revealPosition(pos || { lineNumber: 1, column: 1 });
    if (pos) monacoEditor.setPosition(pos);
  }
  updateEditorStatusBar();
  wsUpdateSaveStatus();
  wsRenderConflict();
  if (typeof wsPresCursors === 'function') wsPresCursors();   // 새 파일 내용이 들어온 뒤 팀원 커서 위치를 다시 맞춘다
  wsLiveAttach(key, !!keepCursor);                             // 글자 단위 실시간 공동 편집에 붙는다
}

/* ======================================================================
   워크스페이스 v2: 프로젝트별 파일 (서버 저장 · 자동 저장 · 팀 공유)
   ====================================================================== */
var wsProject = null, wsLoaded = false, wsLoading = false, wsPollTimer = null;
function wsServerId(){ var m = /^p(\d+)$/.exec(wsProject || ''); return m ? parseInt(m[1], 10) : null; }
function wsUseServer(){ return calApiMode && !!wsServerId(); }
function wsKey(path){ return 'f:' + path; }
function wsMakeFile(row){
  var ext = (row.path.split('.').pop() || '').toLowerCase();
  return { tab: row.path, path: row.path, dot: getDotColorForExt(ext), lang: getLangForExt(ext), raw: row.content || '',
    baseUpdatedAt: row.updated_at || null, updatedBy: row.updated_by || null, dirty: false, saving: false, conflict: null };
}
function wsAgo(iso){
  if (!iso) return '';
  var sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 10) return '방금';
  if (sec < 60) return sec + '초 전';
  if (sec < 3600) return Math.round(sec / 60) + '분 전';
  if (sec < 86400) return Math.round(sec / 3600) + '시간 전';
  return Math.round(sec / 86400) + '일 전';
}
function renderWsEmpty(){
  var empty = document.getElementById('wsEmptyState');
  if (!empty) return;
  var tree = document.getElementById('wsFileTree'), col = document.getElementById('wsEditorCol');
  var hasFiles = Object.keys(files).length > 0;
  var noProject = calApiMode && !myProjects.length;
  var title = document.getElementById('wsEmptyTitle'), desc = document.getElementById('wsEmptyDesc'), icon = document.getElementById('wsEmptyIcon');
  var newProj = document.getElementById('wsNewProjBtn');
  var acts = document.getElementById('wsEmptyActions');
  var shell = document.querySelector('.ws-shell');
  var resizerV = document.getElementById('wsResizerSidebar');
  if (shell) shell.classList.toggle('is-empty', !hasFiles);

  if (noProject) {
    icon.textContent = '🚀'; title.textContent = '프로젝트를 먼저 만들어주세요';
    desc.textContent = '프로젝트를 만들면 파일, 회의록, 캘린더, 팀 채팅이 그 프로젝트 단위로 나뉘어요.';
    Array.prototype.forEach.call(acts.children, function(b){ b.hidden = (b !== newProj); });
    empty.hidden = false;
    if (tree) tree.hidden = true;
    if (col) col.hidden = true;
    if (resizerV) resizerV.hidden = true;
    return;
  }
  if (tree) tree.hidden = !hasFiles;
  if (col) col.hidden = !hasFiles;
  if (resizerV) resizerV.hidden = !hasFiles;
  if (calApiMode) {
    icon.textContent = wsLoading ? '⏳' : '📂';
    title.textContent = wsLoading ? '파일을 불러오는 중이에요…' : '아직 파일이 없어요';
    desc.textContent = wsLoading ? '' : '이 프로젝트의 첫 파일을 만들어보세요. 만든 파일은 자동 저장되고 팀원과 함께 볼 수 있어요.';
    Array.prototype.forEach.call(acts.children, function(b){ b.hidden = (b === newProj || wsLoading); });
  } else {
    icon.textContent = '📁'; title.textContent = '열린 폴더가 없습니다';
    desc.textContent = '내 컴퓨터의 폴더를 열거나 새 파일을 만들어 시작해보세요. (로그인하면 파일이 저장되고 팀원과 공유돼요)';
    Array.prototype.forEach.call(acts.children, function(b){ b.hidden = (b === newProj); });
  }
  empty.hidden = hasFiles;
}
function wsUpdateSaveStatus(){
  var el = document.getElementById('sbSave');
  if (!el) return;
  var f = currentFileKey ? files[currentFileKey] : null;
  el.className = 'sb-save';
  if (!f) { el.textContent = ''; return; }
  if (!wsUseServer()) { el.textContent = '로컬 편집 (저장 안 됨)'; return; }
  if (f.conflict) { el.classList.add('dirty'); el.textContent = '⚠ 충돌'; }
  else if (f.live) { el.classList.add('live'); el.textContent = wsLivePending() ? '⟳ 동기화 중…' : '⚡ 실시간 · 자동 저장'; }
  else if (f.saving) { el.textContent = '저장 중…'; }
  else if (f.dirty) { el.classList.add('dirty'); el.textContent = '● 저장 안 됨'; }
  else { el.textContent = '✓ 저장됨' + (f.updatedBy ? ' · ' + f.updatedBy + ' ' + wsAgo(f.baseUpdatedAt) : ''); }
}
function wsRenderConflict(){
  var bar = document.getElementById('wsConflictBar');
  if (!bar) return;
  var f = currentFileKey ? files[currentFileKey] : null;
  if (!f || !f.conflict) { bar.hidden = true; bar.innerHTML = ''; return; }
  bar.hidden = false;
  bar.innerHTML = '';
  var msg = document.createElement('span');
  msg.textContent = '⚠ ' + (f.conflict.updated_by || '다른 팀원') + '님이 ' + wsAgo(f.conflict.updated_at) + ' 이 파일을 먼저 수정했어요. 어떻게 할까요?';
  var mine = document.createElement('button'); mine.className = 'btn'; mine.textContent = '내 변경으로 덮어쓰기';
  mine.onclick = function(){ wsSave(currentFileKey, true); };
  var theirs = document.createElement('button'); theirs.className = 'btn'; theirs.textContent = '최신 내용 불러오기';
  theirs.onclick = function(){
    f.raw = f.conflict.content; f.baseUpdatedAt = f.conflict.updated_at; f.updatedBy = f.conflict.updated_by; f.conflict = null; f.dirty = false;
    renderFileContent(currentFileKey, true); renderTabs(); renderFileTree();
  };
  bar.appendChild(msg); bar.appendChild(mine); bar.appendChild(theirs);
}
function wsMarkDirty(key){
  var f = files[key];
  if (!f) return;
  var wasDirty = f.dirty;
  f.dirty = true;
  wsUpdateSaveStatus();
  if (!wasDirty) { renderTabs(); renderFileTree(); }
  if (!wsUseServer()) return;
  clearTimeout(f._t);
  f._t = setTimeout(function(){ wsSave(key); }, 900);
}
function wsSave(key, force, manual){
  var f = files[key];
  if (!f || !wsUseServer()) return Promise.resolve();
  if (f.live) { if (manual) wsLiveSave(key); return Promise.resolve(); }      // 실시간 편집 중인 파일은 서버가 자동 저장한다
  clearTimeout(f._t);
  if (!f.dirty && !force) { if (manual) pushToast('✓', '이미 저장돼 있어요', f.tab); return Promise.resolve(); }
  if (f.conflict && !force) return Promise.resolve();
  f.saving = true; wsUpdateSaveStatus();
  var content = f.raw;
  return apiFetch('/api/projects/' + wsServerId() + '/files', { method: 'PUT',
    body: JSON.stringify({ path: f.path, content: content, base_updated_at: f.baseUpdatedAt, force: !!force }) })
    .then(function(row){
      f.saving = false; f.baseUpdatedAt = row.updated_at; f.updatedBy = row.updated_by; f.conflict = null;
      if (f.raw === content) f.dirty = false; else wsMarkDirty(key);
      renderTabs(); renderFileTree(); wsUpdateSaveStatus(); wsRenderConflict();
      if (manual) pushToast('💾', '저장했어요', f.tab);
    }).catch(function(e){
      f.saving = false;
      if (e.status === 409 && e.body && e.body.file) { f.conflict = e.body.file; wsRenderConflict(); wsUpdateSaveStatus(); }
      else { wsUpdateSaveStatus(); pushToast('⚠️', '저장하지 못했어요', e.message); }
    });
}
function wsFlushSaves(){
  Object.keys(files).forEach(function(k){ var f = files[k]; if (f.dirty && wsUseServer() && !f.conflict) wsSave(k); });
}
window.addEventListener('beforeunload', function(e){
  var pending = wsLiveHasPending() || Object.keys(files).some(function(k){ return files[k].dirty && wsUseServer(); });
  if (pending) { wsFlushSaves(); e.preventDefault(); e.returnValue = ''; }
});
document.addEventListener('keydown', function(e){
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && document.querySelector('.view.active[data-view="workspace"]')) {
    e.preventDefault();
    if (currentFileKey) wsSave(currentFileKey, false, true);
  }
});

/* ---- 새 파일 / 이름 바꾸기 / 삭제 ---- */
function wsOpenKey(key){
  if (!openedTabs.includes(key)) openedTabs.push(key);
  currentFileKey = key;
  renderWsEmpty(); renderFileTree(); renderTabs(); renderFileContent(key);
  try { localStorage.setItem('sync_ws_last_' + (wsProject || ''), files[key].path); } catch (e) {}
}
/* 빈 새 파일에 넣어 줄 기본 내용: 자바는 파일 이름과 같은 클래스, HTML 은 기본 뼈대 */
function wsTemplateFor(path){
  var base = String(path || '').split('/').pop(), ext = wsExt(base), stem = base.replace(/\.[^.]+$/, '');
  var hello = 'Hello, World!';
  switch (ext) {
    case 'java': return /^[A-Za-z_$][\w$]*$/.test(stem) ? 'public class ' + stem + ' {\n    public static void main(String[] args) {\n        System.out.println("' + hello + '");\n    }\n}\n' : '';
    case 'py': return 'print("' + hello + '")\n';
    case 'js': case 'mjs': case 'cjs': return 'console.log("' + hello + '");\n';
    case 'ts': return 'const message: string = "' + hello + '";\nconsole.log(message);\n';
    case 'c': return '#include <stdio.h>\n\nint main(void) {\n    printf("' + hello + '\\n");\n    return 0;\n}\n';
    case 'cpp': case 'cc': case 'cxx': return '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "' + hello + '" << endl;\n    return 0;\n}\n';
    case 'cs': return 'using System;\n\nclass Program\n{\n    static void Main(string[] args)\n    {\n        Console.WriteLine("' + hello + '");\n    }\n}\n';
    case 'go': return 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("' + hello + '")\n}\n';
    case 'rs': return 'fn main() {\n    println!("' + hello + '");\n}\n';
    case 'rb': return 'puts "' + hello + '"\n';
    case 'php': return '<?php\n\necho "' + hello + '\\n";\n';
    case 'pl': return 'use strict;\nuse warnings;\n\nprint "' + hello + '\\n";\n';
    case 'sh': case 'bash': return '#!/bin/bash\n\necho "' + hello + '"\n';
    case 'html': case 'htm': return '<!DOCTYPE html>\n<html lang="ko">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>' + stem + '</title>\n</head>\n<body>\n  <h1>안녕하세요!</h1>\n</body>\n</html>\n';
    case 'css': return '* {\n  box-sizing: border-box;\n}\n\nbody {\n  margin: 0;\n  font-family: sans-serif;\n}\n';
    case 'md': return '# ' + stem + '\n\n';
    case 'json': return '{\n  \n}\n';
    case 'sql': return '-- ' + stem + '\nSELECT 1;\n';
  }
  return '';
}
function wsCreateFile(name, content, opts){
  opts = opts || {};
  var v = wsValidatePath(name);
  if (!v.ok) { pushToast('⚠️', '파일 이름을 확인해 주세요', v.err); return Promise.resolve(false); }
  name = v.path;
  var key = wsKey(name);
  if (files[key]) { pushToast('ℹ️', '이미 있는 파일이에요', name); if (!opts.silent) wsOpenKey(key); return Promise.resolve(false); }
  if (wsDirExists(name)) { pushToast('⚠️', '같은 이름의 폴더가 있어요', name); return Promise.resolve(false); }
  var parts = name.split('/');
  for (var i = 1; i < parts.length; i++) {
    var pre = parts.slice(0, i).join('/');
    if (files[wsKey(pre)]) { pushToast('⚠️', "'" + pre + "' 는 파일이라 폴더로 쓸 수 없어요", name); return Promise.resolve(false); }
  }
  var f = wsMakeFile({ path: name, content: content == null ? wsTemplateFor(name) : content, updated_at: null, updated_by: null });
  function added(){ files[key] = f; if (!opts.silent) wsOpenKey(key); else { renderWsEmpty(); renderFileTree(); } return true; }
  if (!wsUseServer()) return Promise.resolve(added());
  // 서버가 저장을 받아준 뒤에만 화면에 올린다 → 서버가 거부해도 '지워지지도 않는 유령 파일'이 남지 않는다
  return apiFetch('/api/projects/' + wsServerId() + '/files', { method: 'PUT', body: JSON.stringify({ path: name, content: f.raw, force: true }) })
    .then(function(row){ f.baseUpdatedAt = row.updated_at; f.updatedBy = row.updated_by; f.dirty = false; return added(); })
    .catch(function(e){ pushToast('⚠️', '파일을 만들지 못했어요', e.message); return false; });
}
/* 빈 폴더: 서버는 파일만 저장하므로, 폴더 안에 보이지 않는 .gitkeep 파일을 하나 둬서 폴더를 붙잡아 둔다 (Git 에서 쓰는 방식) */
function wsCreateFolder(path){
  if (wsDirExists(path)) { pushToast('ℹ️', '이미 있는 폴더예요', path); wsSelDir = path; return Promise.resolve(false); }
  return wsCreateFile(path + '/.gitkeep', '', { silent: true }).then(function(ok){
    if (ok) { wsSelDir = path; var acc = ''; path.split('/').forEach(function(p){ acc += (acc ? '/' : '') + p; wsCollapsed[acc] = false; }); pushToast('📁', '폴더를 만들었어요', path); }
    return ok;
  });
}
function wsRenameFile(key, newPath){
  wsRenaming = null;
  var f = files[key];
  var nv = wsValidatePath(newPath);
  if (f && String(newPath || '').trim() && !nv.ok) { pushToast('⚠️', '이름을 확인해 주세요', nv.err); renderFileTree(); return Promise.resolve(false); }
  newPath = nv.ok ? nv.path : '';
  if (!f || !newPath || newPath === f.path) { renderFileTree(); return Promise.resolve(false); }
  if (files[wsKey(newPath)]) { pushToast('⚠️', '같은 이름의 파일이 이미 있어요', newPath); renderFileTree(); return Promise.resolve(false); }
  function applyLocal(row){
    var nk = wsKey(newPath), ext = (newPath.split('.').pop() || '').toLowerCase();
    var oldStem = wsFileBase(f).replace(/\.java$/i, ''), wasJava = wsExt(f.path || f.tab) === 'java';
    f.tab = newPath; f.path = newPath; f.dot = getDotColorForExt(ext); f.lang = getLangForExt(ext);
    if (row) { f.baseUpdatedAt = row.updated_at; f.updatedBy = row.updated_by; }
    delete files[key]; files[nk] = f;
    openedTabs = openedTabs.map(function(k){ return k === key ? nk : k; });
    if (currentFileKey === key) currentFileKey = nk;
    // 자바: 파일 이름을 바꾸면 public 클래스 이름도 같이 바꾼다 (파일 이름 ↔ 클래스 이름 연동)
    var newStem = newPath.split('/').pop().replace(/\.java$/i, '');
    if (wasJava && ext === 'java' && newStem !== oldStem && /^[A-Za-z_$][\w$]*$/.test(newStem)) {
      var m = WS_JAVA_PUB.exec(wsStripComments(f.raw || ''));
      if (m && m[1] === oldStem) {
        f.raw = wsRenameJavaClass(f.raw, oldStem, newStem);
        wsMarkDirty(nk);
        pushToast('🔗', '클래스 이름도 같이 바꿨어요', oldStem + ' → ' + newStem);
      }
    }
    renderFileTree(); renderTabs(); if (currentFileKey === nk) renderFileContent(nk, true);
    return true;
  }
  if (wsUseServer() && !f.dirty) {
    return apiFetch('/api/projects/' + wsServerId() + '/files/rename', { method: 'POST', body: JSON.stringify({ from_path: f.path, to_path: newPath }) })
      .then(applyLocal).catch(function(e){ pushToast('⚠️', '이름을 바꾸지 못했어요', e.message); renderFileTree(); return false; });
  } else if (wsUseServer()) {
    pushToast('ℹ️', '저장 후에 이름을 바꿀 수 있어요', '변경 내용을 먼저 저장하는 중이에요');
    return Promise.resolve(wsSave(key)).then(function(){ if (files[key] && files[key].dirty) { renderFileTree(); return false; } return wsRenameFile(key, newPath); });
  } else { return Promise.resolve(applyLocal(null)); }
}
function wsDropLocal(keys){
  keys.forEach(function(key){
    delete files[key];
    var idx = openedTabs.indexOf(key); if (idx >= 0) openedTabs.splice(idx, 1);
    if (currentFileKey === key) currentFileKey = null;
  });
  if (!currentFileKey) {
    currentFileKey = openedTabs.length ? openedTabs[openedTabs.length - 1] : null;
    if (currentFileKey) renderFileContent(currentFileKey);
    else if (window.monaco && monacoEditor) { wsSettingValue = true; monacoEditor.setValue(''); wsSettingValue = false; }
  }
  if (wsSelDir && !wsDirExists(wsSelDir)) wsSelDir = '';
  renderWsEmpty(); renderFileTree(); renderTabs(); wsUpdateSaveStatus(); wsRenderConflict();
}
function wsDeleteFile(key){
  wsDeleting = null;
  var f = files[key];
  if (!f) return;
  // 서버에 저장된 적 없는 파일(옛 오류로 화면에만 남은 것)은 서버에 묻지 않고 바로 치운다
  if (wsUseServer() && f.baseUpdatedAt) {
    apiFetch('/api/projects/' + wsServerId() + '/files?path=' + encodeURIComponent(f.path), { method: 'DELETE' })
      .then(function(){ wsDropLocal([key]); pushToast('🗑️', '파일을 삭제했어요', f.tab); })
      .catch(function(e){
        if (e.status === 400 || e.status === 404) { wsDropLocal([key]); pushToast('🗑️', '서버에 없는 파일이라 화면에서 지웠어요', f.tab); }   // 서버에 이미 없다면 화면에서도 지운다
        else { pushToast('⚠️', '삭제하지 못했어요', e.message); renderFileTree(); }
      });
  } else { wsDropLocal([key]); }
}
function wsDeleteDir(dir){
  wsDeleting = null;
  var keys = Object.keys(files).filter(function(k){ var p = files[k].path; return p === dir || p.indexOf(dir + '/') === 0; });
  if (!keys.length) { renderFileTree(); return; }
  var dirty = keys.filter(function(k){ return files[k].dirty; });
  if (dirty.length) { pushToast('ℹ️', '저장 중인 파일이 있어요', '잠시 뒤에 다시 삭제해 주세요'); wsFlushSaves(); renderFileTree(); return; }
  if (wsUseServer()) {
    apiFetch('/api/projects/' + wsServerId() + '/files?path=' + encodeURIComponent(dir), { method: 'DELETE' })
      .then(function(){ wsDropLocal(keys); pushToast('🗑️', '폴더를 삭제했어요', dir + ' · 파일 ' + keys.filter(function(k){ return !/\.gitkeep$/.test(k); }).length + '개'); })
      .catch(function(e){ pushToast('⚠️', '삭제하지 못했어요', e.message); renderFileTree(); });
  } else { wsDropLocal(keys); }
}
function wsImportEntries(entries, skipped, rootName){
  var sid = wsServerId();
  var chunks = [];
  for (var i = 0; i < entries.length; i += 50) chunks.push(entries.slice(i, i + 50));
  pushToast('📂', '폴더를 가져오는 중이에요', entries.length + '개 파일');
  chunks.reduce(function(chain, chunk){
    return chain.then(function(){ return apiFetch('/api/projects/' + sid + '/files/bulk', { method: 'PUT', body: JSON.stringify({ files: chunk }) }); });
  }, Promise.resolve()).then(function(){
    pushToast('✅', '폴더를 가져왔어요', (rootName || '선택한 폴더') + ' · ' + entries.length + '개 파일' + (skipped ? ' (' + skipped + '개 건너뜀)' : ''));
    wsProject = null; wsLoaded = false; enterWorkspaceView();
  }).catch(function(e){ pushToast('⚠️', '가져오지 못했어요', e.message); });
}

/* ---- 프로젝트 선택 / 로드 / 팀 변경 감지 ---- */
function renderWsSelector(){
  var menu = document.getElementById('wsSelMenu'), label = document.getElementById('wsSelLabel'), dot = document.getElementById('wsSelDot');
  if (!menu) return;
  menu.innerHTML = '';
  myProjects.forEach(function(pr){
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'calsel-item' + (pr.id === wsProject ? ' active' : '');
    var d = document.createElement('span'); d.className = 'pdot'; d.style.background = calProjColor(pr);
    var nm = document.createElement('span'); nm.textContent = pr.title; nm.style.overflow = 'hidden'; nm.style.textOverflow = 'ellipsis'; nm.style.whiteSpace = 'nowrap';
    b.appendChild(d); b.appendChild(nm);
    if (pr.members && pr.members.length) { var c = document.createElement('span'); c.className = 'cnt'; c.textContent = pr.members.length + '명'; b.appendChild(c); }
    b.onclick = function(){ closeCalMenu(); selectWsProject(pr.id); };
    menu.appendChild(b);
  });
  if (myProjects.length) { var sep = document.createElement('div'); sep.className = 'calsel-sep'; menu.appendChild(sep); }
  var add = document.createElement('button');
  add.type = 'button'; add.className = 'calsel-item settings'; add.textContent = '＋ 새 프로젝트 만들기';
  add.onclick = function(){ closeCalMenu(); openNewProjectModal(); };
  menu.appendChild(add);
  var mng = document.createElement('button');
  mng.type = 'button'; mng.className = 'calsel-item settings'; mng.textContent = '⚙ 프로젝트 관리 (삭제)';
  mng.onclick = function(){ closeCalMenu(); openProjManage(); };
  menu.appendChild(mng);
  var cur = calProjectById(wsProject);
  label.textContent = cur ? cur.title : (myProjects.length ? '프로젝트 선택' : '프로젝트 없음');
  dot.style.background = cur ? calProjColor(cur) : 'var(--border-strong)';
}
function renderWsHeader(){
  var chip = document.getElementById('wsPresenceChip'), stack = document.getElementById('wsMemberStack');
  var cur = calProjectById(wsProject);
  var invBtn = document.getElementById('wsInviteBtn');
  if (invBtn) invBtn.hidden = !!(calApiMode && cur && cur.isOwner === false);   // 팀장만 초대 가능
  if (!calApiMode || !cur) { return; }
  var members = cur.members || [];
  if (chip) { chip.hidden = false; chip.textContent = '팀원 ' + (members.length || 1) + '명'; chip.title = members.map(function(m){ return m.username; }).join(', '); }
  if (stack) {
    stack.hidden = false; stack.innerHTML = '';
    (members.length ? members : [{ username: (myProfile.name || '나') }]).slice(0, 5).forEach(function(m){
      var mini = document.createElement('div'); mini.className = 'mini'; mini.style.background = chatColor(m.username); mini.textContent = String(m.username).slice(0, 1); var pst = m.id != null ? pstOf(m.id) : pstOwn(); mini.dataset.pst = pst; mini.title = m.username + ' · ' + PST_META[pst].label;
      stack.appendChild(mini);
    });
  }
}
function selectWsProject(id){
  if (calApiMode) { calSelected = id; saveCalSettings(); syncCalProjects(); }
  if (!calApiMode) { openWorkspace(id); return; }
  loadWorkspace(id);
}
var wsMobileInited = false;
function enterWorkspaceView(){
  wsEnsureMonaco();
  /* 폰에서는 파일 목록을 처음엔 접어 둔다 (에디터가 화면을 다 쓰도록) */
  if(!wsMobileInited && document.documentElement.classList.contains('is-mobile')){ wsMobileInited = true; var ft = document.getElementById('wsFileTree'); if(ft) ft.classList.add('collapsed'); }
  renderWsSelector();
  if (!calApiMode) { renderWsEmpty(); return; }
  var target = (calSelected !== 'all' && calProjectById(calSelected)) ? calSelected
    : (wsProject && calProjectById(wsProject)) ? wsProject
    : (calDefaultProject() || (myProjects[0] && myProjects[0].id) || null);
  if (!target) { files = {}; openedTabs = []; currentFileKey = null; wsProject = null; renderWsEmpty(); renderFileTree(); renderTabs(); return; }
  if (target !== wsProject || !wsLoaded) loadWorkspace(target);
  else { wsStartPolling(); renderWsHeader(); if (typeof wsPresStart === 'function') wsPresStart(); }
}
function loadWorkspace(id){
  if (typeof wsPresLeave === 'function') wsPresLeave();   // 이전 프로젝트에서의 '작업 중' 표시는 지우고 시작
  if(calApiMode && id && chatProject !== id && typeof switchChatProject === 'function') switchChatProject(id);   // 워크스페이스에서 프로젝트를 바꾸면 채팅·통화도 같은 프로젝트로
  wsStopPolling();
  wsFlushSaves();
  wsLiveDetach();
  wsProject = id; wsLoaded = false; wsLoading = true;
  files = {}; openedTabs = []; currentFileKey = null; wsRenaming = null; wsDeleting = null; wsSearch = '';
  var si = document.getElementById('wsFileSearch'); if (si) si.value = '';
  var cur = calProjectById(id);
  var crumb = document.getElementById('wsCrumbName'); if (crumb && cur) crumb.textContent = cur.title;
  renderWsSelector(); renderWsHeader(); renderWsEmpty(); renderFileTree(); renderTabs(); renderFileContent_empty();
  var sid = wsServerId();
  if (!sid || !calApiMode) { wsLoading = false; renderWsEmpty(); return; }
  apiFetch('/api/projects/' + sid + '/files').then(function(rows){
    if (wsProject !== id) return;   // 불러오는 사이 다른 프로젝트로 바꾼 경우
    rows.forEach(function(r){ files[wsKey(r.path)] = wsMakeFile(r); });
    wsLoaded = true; wsLoading = false;
    var last = null; try { last = localStorage.getItem('sync_ws_last_' + id); } catch (e) {}
    var openKey = (last && files[wsKey(last)]) ? wsKey(last)
      : files[wsKey('main.py')] ? wsKey('main.py') : files[wsKey('README.md')] ? wsKey('README.md') : (Object.keys(files)[0] || null);
    renderWsEmpty(); renderFileTree();
    if (openKey) wsOpenKey(openKey); else renderTabs();
    wsStartPolling();
    if (typeof wsPresStart === 'function') wsPresStart();
  }).catch(function(e){ wsLoading = false; renderWsEmpty(); pushToast('⚠️', '파일을 불러오지 못했어요', e.message); });
}
function renderFileContent_empty(){
  wsLiveDetach();
  if (window.monaco && monacoEditor) { wsSettingValue = true; monacoEditor.setValue(''); wsSettingValue = false; }
  updateEditorStatusBar(); wsUpdateSaveStatus(); wsRenderConflict();
}
function wsStartPolling(){ wsStopPolling(); wsPollTimer = setInterval(function(){ wsPollTick = (wsPollTick || 0) + 1; if(!LIVE.ok || wsPollTick % 6 === 0) wsPoll(); }, 6000); }   // 실시간 연결이 있으면 가끔만 확인(변경은 푸시로 바로 옴)
var wsPollTick = 0, wsPollSoonTimer = null;
function wsPollSoon(){ clearTimeout(wsPollSoonTimer); wsPollSoonTimer = setTimeout(wsPoll, 150); }   // 팀원이 저장하면 거의 바로 반영 (연속 저장은 한 번으로 묶음)
function wsStopPolling(){ if (wsPollTimer) { clearInterval(wsPollTimer); wsPollTimer = null; } }
/* 팀원이 파일을 고칠 때의 알림: 저장할 때마다 팝업이 뜨면 방해되므로
   · 상태 표시줄에 '○○님이 수정 중'을 잠깐 보여주고(팝업 아님)
   · 팝업은 같은 사람·같은 종류를 3분에 한 번, 전체로는 20초에 한 번만 띄운다 */
var wsNoticeAt = {}, wsNoticeLast = 0, wsLiveTimer = null;
function wsRemoteActivity(names, changed, added, removed){
  var who = names.join(', ') || '팀원', now = Date.now();
  var bar = document.getElementById('sbLive');
  if(bar){
    var first = (changed[0] || added[0] || removed[0] || ''), what = changed.length ? '수정 중' : (added.length ? '파일 추가' : '파일 삭제');
    bar.textContent = '✏️ ' + who + '님이 ' + what + (first ? ' · ' + first.split('/').pop() : ''); bar.hidden = false;
    clearTimeout(wsLiveTimer); wsLiveTimer = setTimeout(function(){ bar.hidden = true; }, 9000);
  }
  var kind = changed.length ? 'c' : (added.length ? 'a' : 'r'), key = who + '|' + kind;
  if(now - (wsNoticeAt[key] || 0) < 180000 || now - wsNoticeLast < 20000) return;
  wsNoticeAt[key] = now; wsNoticeLast = now;
  var list = changed.length ? changed : (added.length ? added : removed);
  var title = changed.length ? who + '님이 파일을 수정했어요' : (added.length ? who + '님이 파일을 추가했어요' : who + '님이 파일을 삭제했어요');
  pushToast(changed.length ? '✏️' : (added.length ? '📄' : '🗑️'), title, list.slice(0, 3).join(', ') + (list.length > 3 ? ' 외 ' + (list.length - 3) + '개' : ''), { duration:2800 });
}
function wsPoll(){
  if (document.hidden || !wsUseServer() || !document.querySelector('.view.active[data-view="workspace"]')) return;
  var id = wsProject;
  apiFetch('/api/projects/' + wsServerId() + '/files').then(function(rows){
    if (wsProject !== id) return;
    var me = currentUser ? currentUser.username : null;
    var remote = {}; rows.forEach(function(r){ remote[r.path] = r; });
    var changed = [], who = {}, added = [], removed = [];
    rows.forEach(function(r){
      var key = wsKey(r.path), f = files[key];
      if (!f) { files[key] = wsMakeFile(r); if (r.updated_by !== me) { added.push(r.path); who[r.updated_by || '팀원'] = 1; } return; }
      if (f.baseUpdatedAt !== r.updated_at) {
        if (f.live) { f.baseUpdatedAt = r.updated_at; }                 // 실시간으로 받고 있는 파일은 글자 단위로 이미 반영돼 있다
        else if (!f.dirty && !f.saving) {
          f.raw = r.content; f.baseUpdatedAt = r.updated_at; f.updatedBy = r.updated_by;
          if (r.updated_by !== me) { changed.push(r.path); who[r.updated_by || '팀원'] = 1; }
          if (key === currentFileKey) renderFileContent(key, true);
        } else if (r.updated_by !== me) { f.conflict = r; if (key === currentFileKey) { wsRenderConflict(); wsUpdateSaveStatus(); } }
      }
    });
    Object.keys(files).forEach(function(key){
      var f = files[key];
      if (f.path && !remote[f.path] && !f.dirty && !f.saving && f.baseUpdatedAt) {
        delete files[key]; removed.push(f.path);
        var idx = openedTabs.indexOf(key); if (idx >= 0) openedTabs.splice(idx, 1);
        if (currentFileKey === key) { currentFileKey = openedTabs[0] || null; if (currentFileKey) renderFileContent(currentFileKey); else renderFileContent_empty(); }
      }
    });
    if (changed.length || added.length || removed.length) {
      renderWsEmpty(); renderFileTree(); renderTabs();
      wsRemoteActivity(Object.keys(who), changed, added, removed);
    }
    wsUpdateSaveStatus();
  }).catch(function(){});
}
/* ---- 새 프로젝트 ---- */
function openNewProjectModal(){ var el = document.getElementById('newProjectName'); el.value = ''; document.getElementById('newProjectModal').classList.add('open'); setTimeout(function(){ el.focus(); }, 100); }
function closeNewProjectModal(){ document.getElementById('newProjectModal').classList.remove('open'); }
function submitNewProject(){
  var name = document.getElementById('newProjectName').value.trim();
  if (!name) return;
  closeNewProjectModal();
  addProjectFromPrompt(name);
}

function toggleSidebar() {
  var tree = document.getElementById('wsFileTree');
  var btn = document.getElementById('wsSidebarToggleBtn');
  if (tree) {
    tree.classList.toggle('collapsed');
    if (btn) btn.classList.toggle('active', !tree.classList.contains('collapsed'));
    setTimeout(function() { if (window.monaco && monacoEditor) monacoEditor.layout(); }, 60);
  }
}

function toggleTerminal() {
  var p = document.getElementById('wsTerminalPanel');
  if (p) {
    p.classList.toggle('collapsed');
    setTimeout(function() { if (window.monaco && monacoEditor) monacoEditor.layout(); }, 60);
  }
}

function toggleMaximizeTerminal() {
  var p = document.getElementById('wsTerminalPanel');
  var btn = document.getElementById('termMaxBtn');
  if (p) {
    p.classList.toggle('maximized');
    if (btn) {
      var isMax = p.classList.contains('maximized');
      btn.title = isMax ? '터미널 복원' : '터미널 최대화';
    }
    setTimeout(function() { if (window.monaco && monacoEditor) monacoEditor.layout(); }, 60);
  }
}

function initResizers() {
  // 윈도우 리사이즈 대응
  window.addEventListener('resize', function() {
    if (window.monaco && monacoEditor) monacoEditor.layout();
  });

  // 수직 리사이저 (탐색기 폭 조절)
  var resizerV = document.getElementById('wsResizerSidebar');
  var fileTree = document.getElementById('wsFileTree');
  var wsShell = document.querySelector('.ws-shell');
  if (resizerV && fileTree) {
    var isDraggingV = false;
    var startX = 0;
    var startW = 0;

    function onPointerMoveV(e) {
      if (!isDraggingV) return;
      e.preventDefault();
      var deltaX = (e.clientX - startX) / currentUiScale();
      var maxW = wsShell ? Math.max(200, wsShell.clientWidth - 280) : 550;
      var newW = Math.round(startW + deltaX);
      if (newW < 140) newW = 140;
      if (newW > maxW) newW = maxW;

      fileTree.style.width = newW + 'px';
      if (window.monaco && monacoEditor) monacoEditor.layout();
    }

    function onPointerUpV(e) {
      if (!isDraggingV) return;
      isDraggingV = false;
      resizerV.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMoveV);
      window.removeEventListener('pointerup', onPointerUpV);
      window.removeEventListener('pointercancel', onPointerUpV);
      if (window.monaco && monacoEditor) monacoEditor.layout();
    }

    resizerV.addEventListener('pointerdown', function(e) {
      isDraggingV = true;
      startX = e.clientX;
      startW = fileTree.getBoundingClientRect().width / currentUiScale();
      resizerV.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();

      window.addEventListener('pointermove', onPointerMoveV);
      window.addEventListener('pointerup', onPointerUpV);
      window.addEventListener('pointercancel', onPointerUpV);
    });
  }

  // 수평 리사이저 (터미널 높이 조절)
  var resizerH = document.getElementById('wsResizerTerminal');
  var terminal = document.getElementById('wsTerminalPanel');
  var editorCol = document.getElementById('wsEditorCol');
  if (resizerH && terminal && editorCol) {
    var isDraggingH = false;
    var startY = 0;
    var startH = 0;

    function onPointerMoveH(e) {
      if (!isDraggingH) return;
      e.preventDefault();
      // startY - e.clientY: 마우스를 위로 올리면 터미널 높이 증가, 아래로 내리면 감소
      var deltaY = (startY - e.clientY) / currentUiScale();
      var totalH = editorCol.clientHeight;
      // 헤더(38px), 상태바(24px), 리사이저(6px), 최소 에디터 영역(70px)을 남겨둠
      var maxH = Math.max(100, totalH - 140);
      var newH = Math.round(startH + deltaY);

      if (newH < 60) newH = 60;
      if (newH > maxH) newH = maxH;

      terminal.style.height = newH + 'px';
      if (window.monaco && monacoEditor) monacoEditor.layout();
    }

    function onPointerUpH(e) {
      if (!isDraggingH) return;
      isDraggingH = false;
      resizerH.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMoveH);
      window.removeEventListener('pointerup', onPointerUpH);
      window.removeEventListener('pointercancel', onPointerUpH);
      if (window.monaco && monacoEditor) monacoEditor.layout();
    }

    resizerH.addEventListener('pointerdown', function(e) {
      if (terminal.classList.contains('maximized')) {
        terminal.classList.remove('maximized');
        var btn = document.getElementById('termMaxBtn');
        if (btn) btn.title = '터미널 최대화';
      }
      isDraggingH = true;
      startY = e.clientY;
      startH = terminal.getBoundingClientRect().height / currentUiScale();
      resizerH.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();

      window.addEventListener('pointermove', onPointerMoveH);
      window.addEventListener('pointerup', onPointerUpH);
      window.addEventListener('pointercancel', onPointerUpH);
    });
  }
}

function clearTerminal() {
  var live = document.getElementById('termLiveLog');
  if (live) live.innerHTML = '<div style="color:#6e7681;">// 터미널이 초기화되었습니다.</div>';
  var statusChip = document.getElementById('termStatusChip');
  if (statusChip) statusChip.style.display = 'none';
  var execTime = document.getElementById('termExecTime');
  if (execTime) execTime.style.display = 'none';
}

function setTerminalTab(tab) {
  ['interactive', 'preview', 'history'].forEach(function(t) {
    var btn = document.getElementById('termTab' + t.charAt(0).toUpperCase() + t.slice(1));
    var body = document.getElementById('termBody' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === tab);
    if (body) {
      if (t === tab) {
        body.style.display = (t === 'interactive' || t === 'preview') ? 'flex' : 'block';
      } else {
        body.style.display = 'none';
      }
    }
  });
  if (tab === 'interactive') {
    focusLiveInput();
  }
  if (tab === 'history') loadSubmissions();
  var panel = document.getElementById('wsTerminalPanel');
  if (panel) panel.classList.toggle('pv-tall', tab === 'preview');          // 미리보기는 화면이 커야 해서 터미널을 키워 준다
  if (tab === 'preview') { pvFit(); setTimeout(pvFit, 80); }
  if (window.monaco && monacoEditor) setTimeout(function() { monacoEditor.layout(); }, 60);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* =========================================================
   실시간 대화형 콘솔 (Native Live Interactive Console)
   ========================================================= */
var activeTermSocket = null;

function focusLiveInput() {
  var inp = document.getElementById('termLiveInput');
  if (inp) inp.focus();
}

function ansiToHtml(text) {
  if (!text) return '';
  var escaped = escapeHtml(text);
  // 간단한 ANSI 컬러 변환
  return escaped
    .replace(/\x1b\[31m/g, '<span style="color:#ff7b72;">')
    .replace(/\x1b\[32m/g, '<span style="color:#3fb950;">')
    .replace(/\x1b\[33m/g, '<span style="color:#d29922;">')
    .replace(/\x1b\[36m/g, '<span style="color:#39c5cf;">')
    .replace(/\x1b\[90m/g, '<span style="color:#8b949e;">')
    .replace(/\x1b\[0m/g, '</span>');
}

function appendLiveOutput(text, isErr) {
  var log = document.getElementById('termLiveLog');
  if (!log) return;
  var span = document.createElement('span');
  if (isErr) span.style.color = '#ff7b72';
  span.innerHTML = ansiToHtml(text);
  log.appendChild(span);
  log.scrollTop = log.scrollHeight;
}

function submitLiveInput(e) {
  if (e) e.preventDefault();
  var inp = document.getElementById('termLiveInput');
  if (!inp) return;
  var val = inp.value;
  inp.value = '';
  
  if (activeTermSocket && activeTermSocket.readyState === WebSocket.OPEN) {
    // 화면에 사용자 입력 에코 출력
    appendLiveOutput(val + '\n', false);
    activeTermSocket.send(JSON.stringify({ action: 'input', data: val + '\n' }));
  } else {
    appendLiveOutput('\n[실행 중인 프로그램이 없어요. 먼저 ▶ 실행을 눌러 주세요]\n', true);
  }
  inp.focus();
}

function stopInteractiveCode() {
  if (activeTermSocket && activeTermSocket.readyState === WebSocket.OPEN) {
    activeTermSocket.send(JSON.stringify({ action: 'stop' }));
  }
}

/* ---------- 파일 이름 ↔ 코드 이름 연동 (자바: public 클래스 이름 = 파일 이름) ---------- */
var WS_JAVA_PUB = /\bpublic\s+(?:final\s+|abstract\s+|strictfp\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/;
function wsStripComments(code) { return String(code || '').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''); }
function wsFileBase(f) { return String((f && (f.path || f.tab)) || '').split('/').pop(); }
/* 열린 자바 파일의 이름과 public 클래스 이름이 다르면 {cls, stem} 을 돌려준다 */
function wsJavaNameIssue(key) {
  var f = key && files[key];
  if (!f || wsExt(f.path || f.tab) !== 'java') return null;
  var raw = (window.monaco && monacoEditor && key === currentFileKey) ? monacoEditor.getValue() : (f.raw || '');
  var m = WS_JAVA_PUB.exec(wsStripComments(raw));
  var stem = wsFileBase(f).replace(/\.java$/i, '');
  return (m && m[1] !== stem) ? { cls: m[1], stem: stem } : null;
}
/* 문자열·주석 안은 건드리지 않고 클래스 이름만 바꾼다 */
function wsRenameJavaClass(code, from, to) {
  var re = new RegExp('\\b' + from.replace(/\$/g, '\\$') + '\\b', 'g');
  return String(code).split(/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\/.*|\/\*[\s\S]*?\*\/)/).map(function(part, i) { return i % 2 ? part : part.replace(re, to); }).join('');
}
/* 파일 이름을 코드(public 클래스)에 맞춘다 */
function wsFixNameFromClass(key) {
  var iss = wsJavaNameIssue(key); if (!iss) return Promise.resolve();
  var f = files[key], dir = wsDirOf(f.path);
  return Promise.resolve(wsRenameFile(key, (dir ? dir + '/' : '') + iss.cls + '.java'));
}
/* 코드(public 클래스) 이름을 파일 이름에 맞춘다 */
function wsFixClassFromName(key) {
  var iss = wsJavaNameIssue(key); if (!iss) return;
  if (!/^[A-Za-z_$][\w$]*$/.test(iss.stem)) { pushToast('⚠️', '클래스 이름으로 쓸 수 없는 파일 이름이에요', iss.stem + ' → 영문자·숫자·_ 만 쓸 수 있고 숫자로 시작할 수 없어요'); return; }
  var f = files[key], next = wsRenameJavaClass(window.monaco && monacoEditor && key === currentFileKey ? monacoEditor.getValue() : f.raw, iss.cls, iss.stem);
  if (window.monaco && monacoEditor && key === currentFileKey) {
    var model = monacoEditor.getModel();
    monacoEditor.executeEdits('name-sync', [{ range: model.getFullModelRange(), text: next }]);      // 되돌리기(Ctrl+Z) 가능
  } else { f.raw = next; wsMarkDirty(key); }
  pushToast('🔗', '클래스 이름을 파일에 맞췄어요', iss.cls + ' → ' + iss.stem);
}
function wsNameFixButtons(key, andRun) {
  var iss = wsJavaNameIssue(key), go = andRun ? ' 바꾸고 실행' : ' 바꾸기';
  return [
    { label: '파일 이름을 ' + iss.cls + '.java 로' + go, fn: function() { wsFixNameFromClass(key).then(function() { if (andRun) runCode(); else wsRunNoticeClear(); }); } },
    { label: '클래스 이름을 ' + iss.stem + ' 로' + go, fn: function() { wsFixClassFromName(key); if (andRun) runCode(); else wsRunNoticeClear(); } }
  ];
}
function wsRunNoticeClear() { var log = document.getElementById('termLiveLog'); if (log && log.querySelector('.term-fixes')) log.innerHTML = '<div style="color:#3fb950;">// 이름을 맞췄어요.</div>'; var chip = document.getElementById('termStatusChip'); if (chip) chip.style.display = 'none'; }
/* 상태바의 ⚠ 를 누르면: 어느 쪽에 맞출지 묻는다 */
function wsNameWarnClick() {
  var iss = wsJavaNameIssue(currentFileKey); if (!iss) return;
  wsRunNotice('파일 이름과 클래스 이름이 달라요', '파일: ' + wsFileBase(files[currentFileKey]) + '\npublic 클래스: ' + iss.cls + '\n\n자바는 public 클래스 이름과 파일 이름이 같아야 실행돼요. 어느 쪽에 맞출까요?', wsNameFixButtons(currentFileKey, false));
}
var wsRunning = false;
async function runCode() {
  if (wsRunning) { pushToast('ℹ️', '이미 실행 중이에요', '끝날 때까지 기다리거나 ■ 중지를 눌러 주세요.'); return; }
  if (currentFileKey && files[currentFileKey] && files[currentFileKey].dirty) wsSave(currentFileKey);
  var fobj = currentFileKey && files[currentFileKey];
  if (!fobj) { pushToast('⚠️', '열린 파일이 없어요', '왼쪽 탐색기에서 실행할 파일을 열어 주세요.'); return; }
  var code = '';
  if (window.monaco && monacoEditor) {
    code = monacoEditor.getValue().trim();
  } else {
    code = (fobj.raw || '').trim();
  }
  if (!code) {
    pushToast('⚠️', '코드 없음', '실행할 코드를 입력해주세요.');
    return;
  }

  // 화면(웹) 파일은 서버에서 돌리지 않고 결과 미리보기로 보여 준다
  var pv = pvTargetFor(currentFileKey);
  if (pv) { pvShow(pv); return; }

  // 파일 확장자로 실행 언어를 정한다. 코드가 아닌 파일(.md .txt …)이나 이 서버에 없는 언어는 이유를 알려 준다 (몰래 Python 으로 돌리지 않는다).
  var lang = wsRunLang(currentFileKey);
  if (!lang) {
    var ex = wsExt(fobj.path || fobj.tab);
    wsRunNotice('이 파일은 실행할 수 없어요', (ex ? '.' + ex : '확장자가 없는') + ' 파일은 코드로 실행되지 않아요.\n실행할 수 있는 파일: ' + ['py','js','ts','java','c','cpp','cs','rb','php','pl','sh','go','rs','html'].map(function(e){ return '.' + e; }).join(' '));
    return;
  }
  var supportedLangs = await wsRunSupported();
  if (supportedLangs && supportedLangs.indexOf(lang) < 0) {
    wsRunNotice(WS_RUN_LABEL[lang] + ' 실행 환경이 이 서버에 없어요', '이 서버에서 지금 실행할 수 있는 언어: ' + (supportedLangs.map(function(l){ return WS_RUN_LABEL[l] || l; }).join(', ') || '없음') + '\n(서버에 ' + WS_RUN_LABEL[lang] + ' 를 설치하면 실행할 수 있어요)');
    return;
  }
  if (!authToken) {
    wsRunNotice('로그인하면 코드를 실행할 수 있어요', '코드 실행은 로그인한 사용자만 쓸 수 있어요.');
    return;
  }
  // 자바: 파일 이름과 public 클래스 이름이 다르면 실행하지 않고 어느 쪽을 맞출지 묻는다
  var nameIssue = wsJavaNameIssue(currentFileKey);
  if (nameIssue) {
    wsRunNotice('파일 이름과 클래스 이름이 달라요',
      '파일: ' + wsFileBase(fobj) + '\npublic 클래스: ' + nameIssue.cls + '\n\n자바는 public 클래스 이름과 파일 이름이 같아야 실행돼요. 어느 쪽에 맞출까요?',
      wsNameFixButtons(currentFileKey, true));
    return;
  }

  // 터미널 패널 열기 및 대화형 탭 활성화
  var termPanel = document.getElementById('wsTerminalPanel');
  if (termPanel) termPanel.classList.remove('collapsed');
  setTerminalTab('interactive');

  var log = document.getElementById('termLiveLog');
  if (log) {
    log.innerHTML = '<div style="color:#06b6d4; font-weight:600;">// ▶ ' + escapeHtml(wsFileBase(fobj)) + ' 실행</div><div style="color:#8b949e; margin-bottom:8px;">// 프로그램이 입력을 기다리면 아래 INPUT 칸에 값을 넣고 Enter 를 누르세요.</div>';
  }
  focusLiveInput();

  var runBtn = document.getElementById('wsRunBtn');
  var stopBtn = document.getElementById('wsStopBtn');
  var statusChip = document.getElementById('termStatusChip');
  var execTime = document.getElementById('termExecTime');

  wsRunning = true;
  if (runBtn) runBtn.disabled = true;
  if (stopBtn) stopBtn.style.display = 'inline-flex';
  if (statusChip) {
    statusChip.style.display = 'inline-block';
    statusChip.className = 'term-status-chip running';
    statusChip.textContent = '실행 중';
  }
  if (execTime) {
    execTime.style.display = 'inline-block';
    execTime.textContent = fobj.path || fobj.tab;
  }

  // 기존 소켓 정리
  if (activeTermSocket) {
    try { activeTermSocket.close(); } catch(e){}
    activeTermSocket = null;
  }

  var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var wsUrl = proto + '//' + location.host + '/ws/terminal?token=' + encodeURIComponent(authToken || '');

  var ws = new WebSocket(wsUrl);
  activeTermSocket = ws;

  ws.onopen = function() {
    ws.send(JSON.stringify({
      action: 'start',
      language: lang,
      file_name: fobj.path || fobj.tab,
      source_code: code
    }));
    focusLiveInput();
  };

  ws.onmessage = function(ev) {
    try {
      var msg = JSON.parse(ev.data);
      if (msg.type === 'stdout') {
        appendLiveOutput(msg.data, false);
      } else if (msg.type === 'stderr') {
        appendLiveOutput(msg.data, true);
      } else if (msg.type === 'exit') {
        if (msg.data) appendLiveOutput(msg.data, false);
        finishRun(msg.code);
      }
    } catch(e) {
      appendLiveOutput(ev.data, false);
    }
  };

  ws.onerror = function() {
    appendLiveOutput('\n[WebSocket 연결 오류가 발생했습니다]\n', true);
    finishRun(-1);
  };

  ws.onclose = function() {
    finishRun(0);
  };

  var finished = false;
  function finishRun(code) {
    if (finished) return; finished = true;          // 종료 메시지 뒤에 연결이 닫혀도 결과 표시를 덮어쓰지 않는다
    wsRunning = false;
    if (runBtn) runBtn.disabled = false;
    if (stopBtn) stopBtn.style.display = 'none';
    if (statusChip) {
      var ok = (code === 0);
      statusChip.className = 'term-status-chip ' + (ok ? 'success' : 'error');
      statusChip.textContent = ok ? '정상 종료' : '종료 (코드 ' + code + ')';
    }
    if (execTime) execTime.textContent = '종료됨';
    activeTermSocket = null;
  }
}



/* =========================================================
   결과 미리보기 · 기기 크기 시뮬레이션
   HTML 파일에서 ▶ 실행 → 같은 폴더의 CSS/JS 를 합쳐서 격리된 창(iframe, 앱의 로그인·저장소에는 접근 불가)에 띄운다.
   모바일·태블릿·PC 크기로 바꿔 보고, 미리보기 안의 console.log / 오류는 '실행 콘솔'에도 나온다.
   ========================================================= */
var PV_DEVICES = { phone: { w: 390, h: 844, label: '모바일' }, tablet: { w: 820, h: 1180, label: '태블릿' }, desktop: { w: 1280, h: 800, label: 'PC' }, fit: null };
var pvState = { key: null, dev: 'phone', landscape: false, timer: null };
try { var _pvd = localStorage.getItem('sync_pv_dev'); if (_pvd && PV_DEVICES.hasOwnProperty(_pvd)) pvState.dev = _pvd; } catch (e) {}

function pvIsHtml(path) { var e = wsExt(path); return e === 'html' || e === 'htm'; }
/* 경로 합치기: 'a/b' + '../c.css' → 'a/c.css' */
function pvResolve(baseDir, rel) {
  var r = String(rel || '').split('#')[0].split('?')[0];
  if (!r || /^([a-z]+:)?\/\//i.test(r) || /^(data|blob|mailto|javascript):/i.test(r)) return null;
  var parts = (r.charAt(0) === '/' ? '' : baseDir).split('/').filter(Boolean);
  r.replace(/^\//, '').split('/').forEach(function(seg) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); });
  return parts.join('/');
}
function pvFileRaw(path) { var f = files[wsKey(path)]; return f ? (window.monaco && monacoEditor && wsKey(path) === currentFileKey ? monacoEditor.getValue() : (f.raw || '')) : null; }
/* 어떤 파일에서 ▶ 를 눌러도 화면(HTML) 파일을 찾는다: HTML 은 자기 자신, CSS 와 브라우저용 JS 는 그것을 쓰는 HTML */
function pvTargetFor(key) {
  var f = files[key]; if (!f) return null;
  var path = f.path || f.tab, ext = wsExt(path);
  if (pvIsHtml(path)) return key;
  var isStyle = ext === 'css';
  var raw = (window.monaco && monacoEditor && key === currentFileKey) ? monacoEditor.getValue() : (f.raw || '');
  var isBrowserJs = (ext === 'js' || ext === 'mjs') && /\b(document|window|localStorage|addEventListener|alert)\b/.test(raw);
  if (!isStyle && !isBrowserJs) return null;
  var found = null;
  Object.keys(files).some(function(k) {
    var hf = files[k]; if (!pvIsHtml(hf.path || hf.tab)) return false;
    var dir = wsDirOf(hf.path), html = pvFileRaw(hf.path) || '', re = /(?:href|src)\s*=\s*["']([^"']+)["']/gi, m;
    while ((m = re.exec(html))) { if (pvResolve(dir, m[1]) === path) { found = k; return true; } }
    return false;
  });
  return found || (isStyle ? '__none__' : null);
}
function pvBridgeScript() {
  return '<script>(function(){function s(t,a){try{parent.postMessage({__pv:1,t:t,m:Array.prototype.map.call(a,function(x){try{return typeof x==="string"?x:JSON.stringify(x)}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}}' +
    '["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){s(k,arguments);try{o.apply(console,arguments)}catch(e){}}});' +
    'addEventListener("error",function(e){s("error",[(e.message||"오류")+" ("+(e.lineno||0)+":"+(e.colno||0)+")"])});' +
    'addEventListener("unhandledrejection",function(e){s("error",["처리되지 않은 오류: "+(e.reason&&e.reason.message||e.reason)])});})();<\/script>';
}
/* 같은 프로젝트의 CSS·JS 파일을 HTML 안으로 합쳐서, 링크가 끊기지 않는 한 장짜리 문서로 만든다 */
function pvBuildDoc(key) {
  var f = files[key], dir = wsDirOf(f.path), html = pvFileRaw(f.path) || '';
  html = html.replace(/<link\b[^>]*>/gi, function(tag) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    var h = /href\s*=\s*["']([^"']+)["']/i.exec(tag), p = h && pvResolve(dir, h[1]), css = p ? pvFileRaw(p) : null;
    return css == null ? tag : '<style data-src="' + escapeHtml(p) + '">\n' + css.replace(/<\/style/gi, '<\\/style') + '\n</style>';
  });
  html = html.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, function(tag, a1, src, a2) {
    var p = pvResolve(dir, src), js = p ? pvFileRaw(p) : null;
    return js == null ? tag : '<script' + a1 + a2 + ' data-src="' + escapeHtml(p) + '">\n' + js.replace(/<\/script/gi, '<\\/script') + '\n<\/script>';
  });
  var bridge = pvBridgeScript();
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, function(m) { return m + bridge; });
  return bridge + html;
}
function pvRender() {
  var frame = document.getElementById('pvFrame'), key = pvState.key;
  if (!frame || !key || !files[key]) return;
  var empty = document.getElementById('pvEmpty'), wrap = document.getElementById('pvWrap');
  if (empty) empty.hidden = true; if (wrap) wrap.hidden = false;
  pvFit(); void frame.offsetWidth;                       // 기기 크기를 먼저 확정해 둬야 화면 안의 코드가 새 창 너비를 본다
  pvState.n = (pvState.n || 0) + 1; var n = pvState.n;
  requestAnimationFrame(function() {
    if (n !== pvState.n || !files[key]) return;
    frame.srcdoc = pvBuildDoc(key) + '<!-- ' + n + ' -->';   // 내용이 같아도 반드시 새로 불러오게 번호를 붙인다
  });
}
function pvShow(key) {
  if (key === '__none__') { wsRunNotice('이 CSS 를 쓰는 HTML 파일이 없어요', 'HTML 파일에서 <link rel="stylesheet" href="이_파일.css"> 로 연결하면 ▶ 실행으로 결과를 볼 수 있어요.'); return; }
  pvState.key = key;
  var termPanel = document.getElementById('wsTerminalPanel'); if (termPanel) termPanel.classList.remove('collapsed');
  setTerminalTab('preview');
  var chip = document.getElementById('termStatusChip'), t = document.getElementById('termExecTime');
  if (chip) { chip.style.display = 'inline-block'; chip.className = 'term-status-chip success'; chip.textContent = '미리보기'; }
  if (t) { t.style.display = 'inline-block'; t.textContent = files[key].path; }
  pvRender();
}
function pvReload() { if (pvState.key && files[pvState.key]) pvRender(); }
/* 미리보기 중인 HTML·CSS·JS 를 고치면 잠깐 뒤 자동으로 다시 그린다 */
function pvAutoRefresh() {
  if (!pvState.key) return;
  var body = document.getElementById('termBodyPreview');
  if (!body || body.style.display === 'none') return;
  clearTimeout(pvState.timer);
  pvState.timer = setTimeout(pvReload, 700);
}
function pvSetDevice(dev) {
  if (!PV_DEVICES.hasOwnProperty(dev)) return;
  pvState.dev = dev; if (dev === 'fit' || dev === 'desktop') pvState.landscape = false;
  try { localStorage.setItem('sync_pv_dev', dev); } catch (e) {}
  pvFit(); pvReload();           // 기기 크기가 바뀌면 화면을 다시 불러와서 그 크기 기준으로 다시 그리게 한다 (창 너비를 읽는 코드도 새 값을 본다)
}
function pvRotate() { if (pvState.dev === 'phone' || pvState.dev === 'tablet') { pvState.landscape = !pvState.landscape; pvFit(); pvReload(); } }
/* 기기 크기에 맞게 틀을 잡고, 미리보기 칸보다 크면 비율을 줄여서 통째로 보여 준다 */
function pvFit() {
  var stage = document.getElementById('pvStage'), wrap = document.getElementById('pvWrap'), inner = document.getElementById('pvInner'), size = document.getElementById('pvSize');
  document.querySelectorAll('#termBodyPreview .pv-dev').forEach(function(b) { b.classList.toggle('active', b.dataset.dev === pvState.dev); });
  var rot = document.getElementById('pvRotate'); if (rot) rot.style.display = (pvState.dev === 'phone' || pvState.dev === 'tablet') ? '' : 'none';
  if (!stage || !wrap || !inner) return;
  wrap.dataset.dev = pvState.dev;
  var d = PV_DEVICES[pvState.dev];
  if (!d) { wrap.style.width = ''; wrap.style.height = ''; inner.style.width = ''; inner.style.height = ''; inner.style.transform = ''; if (size) size.textContent = '창 크기'; return; }
  var w = pvState.landscape ? d.h : d.w, h = pvState.landscape ? d.w : d.h;
  var cs = getComputedStyle(stage), aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24, ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 24;
  var sc = (aw > 40 && ah > 40) ? Math.min(1, aw / w, Math.max(ah / h, 0.5)) : 1;     // 폭에 맞추되 너무 작아지면 세로로 스크롤
  inner.style.width = w + 'px'; inner.style.height = h + 'px'; inner.style.transform = 'scale(' + sc + ')';
  wrap.style.width = Math.round(w * sc) + 'px'; wrap.style.height = Math.round(h * sc) + 'px';
  if (size) size.textContent = w + ' × ' + h + (sc < 0.995 ? ' · ' + Math.round(sc * 100) + '%' : '');
}
function pvOpenTab() {
  if (!pvState.key || !files[pvState.key]) return;
  try {
    var url = URL.createObjectURL(new Blob([pvBuildDoc(pvState.key)], { type: 'text/html' }));
    var w = window.open(url, '_blank', 'noopener'); setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
    if (!w) pushToast('ℹ️', '새 탭이 막혔어요', '브라우저의 팝업 차단을 풀어 주세요.');
  } catch (e) {}
}
window.addEventListener('message', function(ev) {
  var frame = document.getElementById('pvFrame'), d = ev.data;
  if (!frame || ev.source !== frame.contentWindow || !d || d.__pv !== 1) return;     // 미리보기 창에서 온 메시지만
  var tag = d.t === 'error' ? '\x1b[31m[미리보기 오류] ' : d.t === 'warn' ? '\x1b[33m[미리보기] ' : '\x1b[90m[미리보기] ';
  appendLiveOutput(tag + String(d.m).slice(0, 2000) + '\x1b[0m\n', false);
});
(function() {
  var stage = document.getElementById('pvStage');
  if (stage && window.ResizeObserver) new ResizeObserver(function() { pvFit(); }).observe(stage);
  window.addEventListener('resize', function() { pvFit(); });
})();


/* =========================================================
   코드 조각(스니펫) 자동완성 — IntelliJ·VS Code 처럼 줄임말을 치면 코드가 펼쳐진다
   예) 자바: sout → System.out.println();  psvm → main 메서드  fori → for 반복문
   줄임말을 치면 목록에 맨 위로 뜨고, Enter 또는 Tab 으로 펼친 뒤 Tab 으로 다음 칸으로 이동한다.
   본문의 ${1:x} 는 Tab 으로 차례로 이동하는 칸, $0 은 마지막 커서 위치, {{CLASS}} 는 현재 파일 이름(확장자 뺀 것).
   ========================================================= */
var WS_SNIPPETS = {
  java: [
    ['main', 'main 메서드', 'public static void main(String[] args) {\n\t$0\n}'],
    ['psvm', 'main 메서드 (IntelliJ)', 'public static void main(String[] args) {\n\t$0\n}'],
    ['sout', 'System.out.println()', 'System.out.println($1);$0'],
    ['sysout', 'System.out.println()', 'System.out.println($1);$0'],
    ['soutv', '변수 이름과 값을 출력', 'System.out.println("${1:x} = " + ${1:x});$0'],
    ['souf', 'System.out.printf()', 'System.out.printf("${1:%d}%n", ${2:x});$0'],
    ['serr', 'System.err.println()', 'System.err.println($1);$0'],
    ['fori', 'for (int i …) 반복문', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}'],
    ['foreach', 'for-each 반복문', 'for (${1:String} ${2:item} : ${3:items}) {\n\t$0\n}'],
    ['iter', 'for-each 반복문', 'for (${1:String} ${2:item} : ${3:items}) {\n\t$0\n}'],
    ['while', 'while 반복문', 'while (${1:condition}) {\n\t$0\n}'],
    ['if', 'if 문', 'if (${1:condition}) {\n\t$0\n}'],
    ['ife', 'if - else 문', 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}'],
    ['switch', 'switch 문', 'switch (${1:value}) {\n\tcase ${2:1}:\n\t\t$0\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}'],
    ['try', 'try - catch', 'try {\n\t$1\n} catch (${2:Exception} e) {\n\te.printStackTrace();\n}$0'],
    ['scan', 'Scanner 로 입력 받기', 'java.util.Scanner ${1:sc} = new java.util.Scanner(System.in);$0'],
    ['br', 'BufferedReader 로 입력 받기', 'java.io.BufferedReader ${1:br} = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));$0'],
    ['list', 'ArrayList 만들기', 'java.util.List<${1:Integer}> ${2:list} = new java.util.ArrayList<>();$0'],
    ['map', 'HashMap 만들기', 'java.util.Map<${1:String}, ${2:Integer}> ${3:map} = new java.util.HashMap<>();$0'],
    ['class', 'public 클래스 (파일 이름과 같게)', 'public class {{CLASS}} {\n\t$0\n}'],
    ['thr', 'throw new', 'throw new ${1:IllegalArgumentException}("$2");$0']
  ],
  python: [
    ['pr', 'print()', 'print($1)$0'],
    ['main', 'if __name__ == "__main__"', 'def main():\n\t$0\n\n\nif __name__ == "__main__":\n\tmain()'],
    ['ifmain', 'if __name__ == "__main__"', 'if __name__ == "__main__":\n\t$0'],
    ['def', '함수 정의', 'def ${1:name}(${2:args}):\n\t${0:pass}'],
    ['class', '클래스 정의', 'class ${1:Name}:\n\tdef __init__(self${2:, args}):\n\t\t${0:pass}'],
    ['for', 'for 반복문', 'for ${1:item} in ${2:items}:\n\t$0'],
    ['fori', 'for i in range(n)', 'for ${1:i} in range(${2:n}):\n\t$0'],
    ['while', 'while 반복문', 'while ${1:condition}:\n\t$0'],
    ['if', 'if 문', 'if ${1:condition}:\n\t$0'],
    ['ife', 'if - else 문', 'if ${1:condition}:\n\t$2\nelse:\n\t$0'],
    ['try', 'try - except', 'try:\n\t$1\nexcept ${2:Exception} as e:\n\t${0:print(e)}'],
    ['with', '파일 열기 (with open)', 'with open(${1:"file.txt"}, ${2:"r"}, encoding="utf-8") as ${3:f}:\n\t$0'],
    ['inp', '입력 받기 (문자열)', '${1:x} = input(${2:"입력: "})$0'],
    ['inpi', '입력 받기 (정수)', '${1:n} = int(input(${2:"입력: "}))$0'],
    ['inpl', '입력 받기 (공백으로 나뉜 숫자들)', '${1:nums} = list(map(int, input().split()))$0'],
    ['lc', '리스트 컴프리헨션', '[${1:x} for ${1:x} in ${2:items}]$0'],
    ['lam', 'lambda', 'lambda ${1:x}: ${2:x}$0']
  ],
  javascript: [
    ['log', 'console.log()', 'console.log($1);$0'],
    ['clg', 'console.log()', 'console.log($1);$0'],
    ['logv', '변수 이름과 값을 출력', 'console.log("${1:x}:", ${1:x});$0'],
    ['fn', '함수', 'function ${1:name}(${2:args}) {\n\t$0\n}'],
    ['afn', '화살표 함수', 'const ${1:name} = (${2:args}) => {\n\t$0\n};'],
    ['for', 'for 반복문', 'for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}'],
    ['forof', 'for…of 반복문', 'for (const ${1:item} of ${2:items}) {\n\t$0\n}'],
    ['foreach', 'forEach', '${1:items}.forEach((${2:item}) => {\n\t$0\n});'],
    ['if', 'if 문', 'if (${1:condition}) {\n\t$0\n}'],
    ['ife', 'if - else 문', 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}'],
    ['try', 'try - catch', 'try {\n\t$1\n} catch (${2:err}) {\n\t${0:console.error(err);}\n}'],
    ['fetch', 'fetch 요청', 'const ${1:res} = await fetch(${2:url});\nconst ${3:data} = await ${1:res}.json();$0'],
    ['timeout', 'setTimeout', 'setTimeout(() => {\n\t$0\n}, ${1:1000});'],
    ['qs', 'document.querySelector', 'document.querySelector(${1:".selector"})$0'],
    ['ael', 'addEventListener', '${1:el}.addEventListener(${2:"click"}, (${3:e}) => {\n\t$0\n});'],
    ['rl', 'readline 으로 입력 받기 (Node)', 'const readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin, output: process.stdout });\nrl.question(${1:"입력: "}, (${2:answer}) => {\n\t$0\n\trl.close();\n});']
  ],
  c: [
    ['main', 'main 함수', '#include <stdio.h>\n\nint main(void) {\n\t$0\n\treturn 0;\n}'],
    ['inc', '#include <stdio.h>', '#include <${1:stdio.h}>$0'],
    ['printf', 'printf()', 'printf("${1:%d}\\n"${2:, x});$0'],
    ['scanf', 'scanf()', 'scanf("${1:%d}", &${2:x});$0'],
    ['for', 'for 반복문', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}'],
    ['while', 'while 반복문', 'while (${1:condition}) {\n\t$0\n}'],
    ['if', 'if 문', 'if (${1:condition}) {\n\t$0\n}'],
    ['ife', 'if - else 문', 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}'],
    ['struct', '구조체', 'typedef struct {\n\t$0\n} ${1:Name};']
  ],
  cpp: [
    ['main', 'main 함수 (iostream)', '#include <iostream>\nusing namespace std;\n\nint main() {\n\t$0\n\treturn 0;\n}'],
    ['inc', '#include', '#include <${1:iostream}>$0'],
    ['cout', 'cout 출력', 'cout << ${1:"Hello"} << endl;$0'],
    ['cin', 'cin 입력', 'cin >> ${1:x};$0'],
    ['for', 'for 반복문', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}'],
    ['forr', '범위 기반 for', 'for (auto& ${1:x} : ${2:v}) {\n\t$0\n}'],
    ['while', 'while 반복문', 'while (${1:condition}) {\n\t$0\n}'],
    ['if', 'if 문', 'if (${1:condition}) {\n\t$0\n}'],
    ['ife', 'if - else 문', 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}'],
    ['vec', 'vector', 'vector<${1:int}> ${2:v};$0'],
    ['class', '클래스', 'class ${1:Name} {\npublic:\n\t${1:Name}() {}\n\t$0\n};']
  ],
  csharp: [
    ['main', 'Main 메서드', 'static void Main(string[] args)\n{\n\t$0\n}'],
    ['cw', 'Console.WriteLine()', 'Console.WriteLine($1);$0'],
    ['cr', 'Console.ReadLine()', 'var ${1:line} = Console.ReadLine();$0'],
    ['for', 'for 반복문', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++)\n{\n\t$0\n}'],
    ['foreach', 'foreach 반복문', 'foreach (var ${1:item} in ${2:items})\n{\n\t$0\n}'],
    ['if', 'if 문', 'if (${1:condition})\n{\n\t$0\n}'],
    ['ife', 'if - else 문', 'if (${1:condition})\n{\n\t$2\n}\nelse\n{\n\t$0\n}'],
    ['try', 'try - catch', 'try\n{\n\t$1\n}\ncatch (${2:Exception} ex)\n{\n\t$0\n}'],
    ['class', '클래스', 'class ${1:Name}\n{\n\t$0\n}'],
    ['prop', '속성', 'public ${1:int} ${2:Name} { get; set; }$0']
  ],
  go: [
    ['main', 'main 함수', 'package main\n\nimport "fmt"\n\nfunc main() {\n\t$0\n}'],
    ['pl', 'fmt.Println()', 'fmt.Println($1)$0'],
    ['pf', 'fmt.Printf()', 'fmt.Printf("${1:%v}\\n", ${2:x})$0'],
    ['func', '함수', 'func ${1:name}(${2:args}) ${3:int} {\n\t$0\n}'],
    ['for', 'for 반복문', 'for ${1:i} := 0; ${1:i} < ${2:n}; ${1:i}++ {\n\t$0\n}'],
    ['forr', 'for range', 'for ${1:i}, ${2:v} := range ${3:items} {\n\t$0\n}'],
    ['if', 'if 문', 'if ${1:condition} {\n\t$0\n}'],
    ['iferr', 'if err != nil', 'if err != nil {\n\t${0:return err}\n}'],
    ['struct', '구조체', 'type ${1:Name} struct {\n\t$0\n}']
  ],
  rust: [
    ['main', 'main 함수', 'fn main() {\n\t$0\n}'],
    ['pl', 'println!()', 'println!("${1:{\\}}", ${2:x});$0'],
    ['fn', '함수', 'fn ${1:name}(${2:args}) -> ${3:i32} {\n\t$0\n}'],
    ['for', 'for 반복문', 'for ${1:i} in ${2:0..n} {\n\t$0\n}'],
    ['while', 'while 반복문', 'while ${1:condition} {\n\t$0\n}'],
    ['if', 'if 문', 'if ${1:condition} {\n\t$0\n}'],
    ['match', 'match', 'match ${1:value} {\n\t${2:_} => $0,\n}'],
    ['struct', '구조체', 'struct ${1:Name} {\n\t$0\n}'],
    ['inp', '입력 받기', 'let mut ${1:line} = String::new();\nstd::io::stdin().read_line(&mut ${1:line}).unwrap();$0']
  ],
  ruby: [
    ['pu', 'puts', 'puts $1$0'],
    ['def', '메서드', 'def ${1:name}(${2:args})\n\t$0\nend'],
    ['class', '클래스', 'class ${1:Name}\n\tdef initialize($2)\n\t\t$0\n\tend\nend'],
    ['each', 'each', '${1:items}.each do |${2:item}|\n\t$0\nend'],
    ['if', 'if 문', 'if ${1:condition}\n\t$0\nend'],
    ['gets', '입력 받기', '${1:line} = gets.chomp$0']
  ],
  php: [
    ['php', 'PHP 시작 태그', '<?php\n\n$0'],
    ['echo', 'echo', 'echo ${1:"Hello"} . "\\n";$0'],
    ['func', '함수', 'function ${1:name}(${2:\\$args}) {\n\t$0\n}'],
    ['foreach', 'foreach', 'foreach (${1:\\$items} as ${2:\\$item}) {\n\t$0\n}'],
    ['if', 'if 문', 'if (${1:condition}) {\n\t$0\n}']
  ],
  perl: [
    ['pr', 'print', 'print "${1:Hello}\\n";$0'],
    ['sub', '서브루틴', 'sub ${1:name} {\n\tmy (${2:\\$arg}) = @_;\n\t$0\n}'],
    ['foreach', 'foreach', 'foreach my ${1:\\$item} (${2:@items}) {\n\t$0\n}'],
    ['if', 'if 문', 'if (${1:condition}) {\n\t$0\n}']
  ],
  shell: [
    ['sh', 'shebang', '#!/bin/bash\n$0'],
    ['echo', 'echo', 'echo "${1:Hello}"$0'],
    ['read', '입력 받기', 'read -p "${1:입력: }" ${2:name}$0'],
    ['if', 'if 문', 'if [ ${1:condition} ]; then\n\t$0\nfi'],
    ['for', 'for 반복문', 'for ${1:i} in ${2:1 2 3}; do\n\t$0\ndone'],
    ['while', 'while 반복문', 'while [ ${1:condition} ]; do\n\t$0\ndone'],
    ['func', '함수', '${1:name}() {\n\t$0\n}']
  ],
  html: [
    ['html5', 'HTML 기본 문서', '<!DOCTYPE html>\n<html lang="ko">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1">\n\t<title>${1:제목}</title>\n\t<link rel="stylesheet" href="style.css">\n</head>\n<body>\n\t$0\n\t<script src="app.js"></script>\n</body>\n</html>'],
    ['link', 'CSS 연결', '<link rel="stylesheet" href="${1:style.css}">$0'],
    ['script', 'JS 연결', '<script src="${1:app.js}"></script>$0'],
    ['div', 'div', '<div class="${1:box}">\n\t$0\n</div>'],
    ['ul', '목록', '<ul>\n\t<li>${1:항목}</li>\n\t<li>$0</li>\n</ul>'],
    ['a', '링크', '<a href="${1:#}">${2:링크}</a>$0'],
    ['img', '이미지', '<img src="${1:image.png}" alt="${2:설명}">$0'],
    ['btn', '버튼', '<button type="button" id="${1:btn}">${2:누르기}</button>$0'],
    ['form', '폼', '<form action="${1:#}" method="post">\n\t<input type="text" name="${2:name}" placeholder="${3:입력}">\n\t<button type="submit">${4:보내기}</button>\n</form>$0']
  ],
  css: [
    ['flex', 'flex 가운데 정렬', 'display: flex;\njustify-content: center;\nalign-items: center;$0'],
    ['grid', 'grid 열 나누기', 'display: grid;\ngrid-template-columns: repeat(${1:3}, 1fr);\ngap: ${2:16px};$0'],
    ['media', '반응형 미디어 쿼리', '@media (max-width: ${1:600px}) {\n\t$0\n}'],
    ['reset', '기본 초기화', '* { box-sizing: border-box; }\nbody { margin: 0; font-family: sans-serif; }$0'],
    ['var', 'CSS 변수', ':root {\n\t--${1:main-color}: ${2:#4f46e5};\n}$0']
  ]
};
WS_SNIPPETS.typescript = WS_SNIPPETS.javascript.concat([
  ['iface', 'interface', 'interface ${1:Name} {\n\t$0\n}'],
  ['type', 'type 별칭', 'type ${1:Name} = $0;']
]);

function wsSnippetPreview(body) { return body.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\{\d+\}|\$\d+/g, '').replace(/\{\{CLASS\}\}/g, 'Main'); }
function wsRegisterSnippets() {
  if (!window.monaco || wsRegisterSnippets.done) return;
  wsRegisterSnippets.done = true;
  Object.keys(WS_SNIPPETS).forEach(function(lang) {
    monaco.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems: function(model, position) {
        var w = model.getWordUntilPosition(position);
        var range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
        var f = currentFileKey && files[currentFileKey], stem = f ? wsFileBase(f).replace(/\.[^.]+$/, '') : 'Main';
        if (!/^[A-Za-z_$][\w$]*$/.test(stem)) stem = 'Main';
        return {
          suggestions: WS_SNIPPETS[lang].map(function(s) {
            var body = s[2].replace(/\{\{CLASS\}\}/g, stem);
            return {
              label: { label: s[0], description: s[1] }, kind: monaco.languages.CompletionItemKind.Snippet, detail: s[1],
              documentation: { value: '```\n' + wsSnippetPreview(s[2]).replace(/\t/g, '    ').replace(/Main(?= \{)/, stem) + '\n```' },
              insertText: body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              filterText: s[0], sortText: '0' + s[0], range: range
            };
          })
        };
      }
    });
  });
}

/* =========================================================
   모바일·태블릿 입력줄 — 터치 키보드에는 Tab · 괄호 · 세미콜론이 불편해서 키보드 위에 따로 붙여 준다
   (터치 기기에서 코드 입력칸을 눌렀을 때만 보인다. 키보드가 올라온 높이만큼 자동으로 따라 올라간다)
   ========================================================= */
var WS_QK = [['Tab', 'tab'], ['{ }', '{}'], ['( )', '()'], ['[ ]', '[]'], [';', ';'], ['"', '"'], ["'", "'"], ['=', '='], [':', ':'], ['.', '.'], [',', ','], ['<', '<'], ['>', '>'], ['/', '/'], ['_', '_'], ['#', '#'], ['!', '!'], ['&', '&'], ['|', '|'], ['\\', '\\'],
             ['←', '@left'], ['→', '@right'], ['↑', '@up'], ['↓', '@down'], ['↶', '@undo'], ['↷', '@redo']];
function wsQuickKeys(v) {
  var ed = monacoEditor; if (!ed) return;
  ed.focus();
  if (v === 'tab') { ed.trigger('qk', 'tab', null); return; }
  if (v.charAt(0) === '@') { ed.trigger('qk', { left: 'cursorLeft', right: 'cursorRight', up: 'cursorUp', down: 'cursorDown', undo: 'undo', redo: 'redo' }[v.slice(1)], null); return; }
  var pair = { '{}': '{}', '()': '()', '[]': '[]', '"': '""', "'": "''" }[v];
  if (pair) {                                           // 여는 기호와 닫는 기호를 같이 넣고 커서를 그 사이로 (선택한 글자가 있으면 그것을 감싼다)
    var sel = ed.getSelection(), txt = sel && !sel.isEmpty() ? ed.getModel().getValueInRange(sel) : '';
    if (txt) { ed.executeEdits('qk', [{ range: sel, text: pair.charAt(0) + txt + pair.charAt(1) }]); return; }
    ed.trigger('qk', 'type', { text: pair }); ed.trigger('qk', 'cursorLeft', null); return;
  }
  ed.trigger('qk', 'type', { text: v });
}
function wsQuickKeysInit() {
  var bar = document.getElementById('wsQuickKeys');
  if (!bar || bar.dataset.ready || !monacoEditor) return;
  bar.dataset.ready = '1';
  bar.innerHTML = WS_QK.map(function(k) { return '<button type="button" class="qk" data-v="' + escapeHtml(k[1]) + '">' + escapeHtml(k[0]) + '</button>'; }).join('');
  bar.addEventListener('pointerdown', function(e) { e.preventDefault(); });           // 눌러도 입력칸에서 포커스가 빠지지 않게 (키보드가 안 내려간다)
  bar.addEventListener('click', function(e) { var b = e.target.closest('.qk'); if (b) wsQuickKeys(b.dataset.v); });
  var coarse = window.matchMedia && matchMedia('(pointer:coarse)');
  function place() {
    var vv = window.visualViewport;
    var lift = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    bar.style.bottom = lift + 'px';
    bar.style.paddingBottom = lift > 40 ? '0' : 'env(safe-area-inset-bottom)';           // 키보드가 올라와 있으면 안전 영역 여백은 필요 없다
  }
  function show(on) { bar.classList.toggle('show', !!on && !!(coarse && coarse.matches)); place(); }
  monacoEditor.onDidFocusEditorText(function() { show(true); });
  monacoEditor.onDidBlurEditorText(function() { setTimeout(function() { if (!monacoEditor.hasTextFocus()) show(false); }, 150); });
  if (window.visualViewport) { visualViewport.addEventListener('resize', place); visualViewport.addEventListener('scroll', place); }
}
