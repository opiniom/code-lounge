/* ---- 파일 확장자 및 헬퍼 ---- */
function getDotColorForExt(ext) {
  var map = {
    py: '#3572A5', java: '#b07219', ts: '#3178c6', tsx: '#3178c6',
    js: '#f1e05a', jsx: '#f1e05a', json: '#cbcb41', html: '#e34c26',
    css: '#563d7c', md: '#42a5f5', txt: '#888888', sql: '#e38c00',
    sh: '#89e051', yml: '#cb171e', yaml: '#cb171e'
  };
  return map[ext] || '#888888';
}

function getLangForExt(ext) {
  var map = {
    py: 'python', java: 'java', ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', json: 'json', html: 'html',
    css: 'css', md: 'markdown', sql: 'sql', sh: 'shell'
  };
  return map[ext] || 'plaintext';
}

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
      if (/(^|\/)(node_modules|\.git|__pycache__|\.venv|dist|build)(\/|$)/.test(displayPath)) { skipped++; return; }
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

function promptNewFile() {
  var tree = document.getElementById('wsFileTree');
  if (tree && tree.classList.contains('collapsed')) toggleSidebar();
  var row = document.getElementById('wsNewFileRow');
  var inp = document.getElementById('wsNewFileInput');
  if (!row || !inp) return;
  row.hidden = false; inp.value = '';
  var empty = document.getElementById('wsEmptyState');
  if (empty && !empty.hidden && Object.keys(files).length === 0) { empty.hidden = true; }   // 빈 화면에서 눌러도 탐색기에서 바로 입력
  inp.focus();
}
function wsNewFileKey(e){
  if (isEnter(e)) { var v = e.target.value; wsHideNewFileRow(); wsCreateFile(v); }
  else if (e.key === 'Escape') { wsHideNewFileRow(); renderWsEmpty(); }
}
function wsNewFileBlur(){ setTimeout(function(){ var row = document.getElementById('wsNewFileRow'); if (row && !row.hidden && document.activeElement !== document.getElementById('wsNewFileInput')) { wsHideNewFileRow(); renderWsEmpty(); } }, 120); }
function wsHideNewFileRow(){ var row = document.getElementById('wsNewFileRow'); if (row) row.hidden = true; }

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
  var keys = Object.keys(files).filter(function(k){ return !wsSearch || (files[k].tab || k).toLowerCase().indexOf(wsSearch) >= 0; });
  if (keys.length === 0) {
    treeEl.innerHTML = '<div class="ft-empty">' + (Object.keys(files).length ? '검색 결과가 없어요.' : '아직 파일이 없어요.<br><button class="btn" style="margin-top:8px; font-size:12px; padding:6px 12px;" onclick="promptNewFile()">＋ 새 파일</button>') + '</div>';
    return;
  }
  var root = { dirs: {}, files: [] };
  keys.forEach(function(key) {
    var f = files[key];
    var parts = (f.tab || key).split('/');
    var curr = root;
    var acc = '';
    for (var i = 0; i < parts.length - 1; i++) {
      acc += (acc ? '/' : '') + parts[i];
      var d = parts[i];
      if (!curr.dirs[d]) curr.dirs[d] = { dirs: {}, files: [], path: acc };
      curr = curr.dirs[d];
    }
    curr.files.push({ key: key, name: parts[parts.length - 1], file: f });
  });
  function countFiles(n){ var c = n.files.length; Object.keys(n.dirs).forEach(function(k){ c += countFiles(n.dirs[k]); }); return c; }
  function buildBranch(node) {
    var frag = document.createDocumentFragment();
    Object.keys(node.dirs).sort().forEach(function(dirName) {
      var dn = node.dirs[dirName];
      var closed = !wsSearch && wsCollapsed[dn.path];
      var dirNode = document.createElement('div');
      dirNode.className = 'ftree-node folder' + (closed ? ' closed' : '');
      dirNode.innerHTML = ICON_CHEV + ICON_FOLDER + '<span class="fname"></span><span class="fcnt">' + countFiles(dn) + '</span>';
      dirNode.querySelector('.fname').textContent = dirName;
      var childContainer = document.createElement('div');
      childContainer.className = 'ftree-children';
      childContainer.style.display = closed ? 'none' : 'block';
      childContainer.appendChild(buildBranch(dn));
      dirNode.onclick = function(e) {
        e.stopPropagation();
        wsCollapsed[dn.path] = !wsCollapsed[dn.path];
        var nowClosed = wsCollapsed[dn.path];
        childContainer.style.display = nowClosed ? 'none' : 'block';
        dirNode.classList.toggle('closed', nowClosed);
      };
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
      fileNode.onclick = function(e) { e.stopPropagation(); openFile(item.key, fileNode); };
      fileNode.ondblclick = function(e) { e.stopPropagation(); wsRenaming = item.key; renderFileTree(); };
      fileNode.querySelector('.ren').onclick = function(e){ e.stopPropagation(); wsRenaming = item.key; renderFileTree(); };
      fileNode.querySelector('.del').onclick = function(e){ e.stopPropagation(); wsDeleting = item.key; renderFileTree(); };
      frag.appendChild(fileNode);
    });
    return frag;
  }
  treeEl.appendChild(buildBranch(root));
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
  if (f.lang) return f.lang;
  var name = (f.tab || '').toLowerCase();
  if (name.endsWith('.py')) return 'python';
  if (name.endsWith('.java')) return 'java';
  if (name.endsWith('.cs')) return 'csharp';
  if (name.endsWith('.cpp') || name.endsWith('.cc')) return 'cpp';
  if (name.endsWith('.c')) return 'c';
  if (name.endsWith('.tsx') || name.endsWith('.ts')) return 'typescript';
  if (name.endsWith('.js') || name.endsWith('.jsx')) return 'javascript';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.html')) return 'html';
  if (name.endsWith('.css')) return 'css';
  return 'python';
}

function getMonacoLanguage(key) {
  var lang = getFileLanguage(key);
  if (lang === 'typescript') return 'typescript';
  if (lang === 'javascript') return 'javascript';
  if (lang === 'python') return 'python';
  if (lang === 'java') return 'java';
  if (lang === 'csharp') return 'csharp';
  if (lang === 'cpp') return 'cpp';
  if (lang === 'c') return 'c';
  if (lang === 'json') return 'json';
  if (lang === 'html') return 'html';
  if (lang === 'css') return 'css';
  return 'plaintext';
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
  var badge = document.getElementById('sbLangBadge');
  if (badge && currentFileKey) {
    var lang = getFileLanguage(currentFileKey);
    if (lang === 'python') badge.textContent = '🐍 Python 3';
    else if (lang === 'java') badge.textContent = '☕ Java 17';
    else if (lang === 'csharp') badge.textContent = '🔷 C#';
    else if (lang === 'cpp') badge.textContent = '⚡ C++';
    else if (lang === 'c') badge.textContent = '⚙️ C';
    else if (lang === 'typescript') badge.textContent = 'TS TypeScript';
    else if (lang === 'json') badge.textContent = '{} JSON';
    else badge.textContent = lang.toUpperCase();
  }
}

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
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10
      }
    });

    monacoLoaded = true;

    // 실시간 코드 변경 동기화
    monacoEditor.onDidChangeModelContent(function() {
      if (wsSettingValue) return;   // 파일을 열면서 값을 채우는 변경은 '수정'이 아님
      if (currentFileKey && files[currentFileKey]) {
        files[currentFileKey].raw = monacoEditor.getValue();
        wsMarkDirty(currentFileKey);
      }
      updateEditorStatusBar();
    });

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
      runCurrentCode();
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
      renderTabs();
      if (window.monaco && monacoEditor) {
        monacoEditor.setValue('');
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
  var starter = document.getElementById('wsStarterBtn'), newProj = document.getElementById('wsNewProjBtn');
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
    if (starter) starter.hidden = wsLoading;
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
  var pending = Object.keys(files).some(function(k){ return files[k].dirty && wsUseServer(); });
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
function wsCreateFile(name, content){
  name = (name || '').trim().replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!name) { renderWsEmpty(); return Promise.resolve(); }
  var key = wsKey(name);
  if (files[key]) { pushToast('ℹ️', '이미 있는 파일이에요', name); wsOpenKey(key); return Promise.resolve(); }
  var f = wsMakeFile({ path: name, content: content || '', updated_at: null, updated_by: null });
  files[key] = f;
  wsOpenKey(key);
  if (!wsUseServer()) return Promise.resolve();
  return wsSave(key, true);
}
function wsRenameFile(key, newPath){
  wsRenaming = null;
  var f = files[key];
  newPath = (newPath || '').trim().replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!f || !newPath || newPath === f.path) { renderFileTree(); return; }
  if (files[wsKey(newPath)]) { pushToast('⚠️', '같은 이름의 파일이 이미 있어요', newPath); renderFileTree(); return; }
  function applyLocal(row){
    var nk = wsKey(newPath), ext = (newPath.split('.').pop() || '').toLowerCase();
    f.tab = newPath; f.path = newPath; f.dot = getDotColorForExt(ext); f.lang = getLangForExt(ext);
    if (row) { f.baseUpdatedAt = row.updated_at; f.updatedBy = row.updated_by; }
    delete files[key]; files[nk] = f;
    openedTabs = openedTabs.map(function(k){ return k === key ? nk : k; });
    if (currentFileKey === key) currentFileKey = nk;
    renderFileTree(); renderTabs(); if (currentFileKey === nk) renderFileContent(nk, true);
  }
  if (wsUseServer() && !f.dirty) {
    apiFetch('/api/projects/' + wsServerId() + '/files/rename', { method: 'POST', body: JSON.stringify({ from_path: f.path, to_path: newPath }) })
      .then(applyLocal).catch(function(e){ pushToast('⚠️', '이름을 바꾸지 못했어요', e.message); renderFileTree(); });
  } else if (wsUseServer()) {
    pushToast('ℹ️', '저장 후에 이름을 바꿀 수 있어요', '변경 내용을 먼저 저장하는 중이에요'); wsSave(key).then(function(){ renderFileTree(); });
  } else { applyLocal(null); }
}
function wsDeleteFile(key){
  wsDeleting = null;
  var f = files[key];
  if (!f) return;
  function dropLocal(){
    delete files[key];
    var idx = openedTabs.indexOf(key);
    if (idx >= 0) openedTabs.splice(idx, 1);
    if (currentFileKey === key) {
      currentFileKey = openedTabs.length ? openedTabs[Math.max(0, idx - 1)] : null;
      if (currentFileKey) renderFileContent(currentFileKey);
      else if (window.monaco && monacoEditor) { wsSettingValue = true; monacoEditor.setValue(''); wsSettingValue = false; }
    }
    renderWsEmpty(); renderFileTree(); renderTabs(); wsUpdateSaveStatus(); wsRenderConflict();
  }
  if (wsUseServer()) {
    apiFetch('/api/projects/' + wsServerId() + '/files?path=' + encodeURIComponent(f.path), { method: 'DELETE' })
      .then(function(){ dropLocal(); pushToast('🗑️', '파일을 삭제했어요', f.tab); })
      .catch(function(e){ pushToast('⚠️', '삭제하지 못했어요', e.message); renderFileTree(); });
  } else { dropLocal(); }
}
function wsStarter(){
  var title = (calProjectById(wsProject) || { title: '프로젝트' }).title;
  var main = '# ' + title + '\n\ndef main():\n    print("Hello, ' + title.replace(/"/g, '') + '!")\n\n\nif __name__ == "__main__":\n    main()\n';
  var readme = '# ' + title + '\n\n프로젝트 설명을 적어보세요.\n\n## 실행\n\n```bash\npython main.py\n```\n';
  wsCreateFile('README.md', readme).then(function(){ return wsCreateFile('main.py', main); });
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
function enterWorkspaceView(){
  renderWsSelector();
  if (!calApiMode) { renderWsEmpty(); return; }
  var target = (calSelected !== 'all' && calProjectById(calSelected)) ? calSelected
    : (wsProject && calProjectById(wsProject)) ? wsProject
    : (calDefaultProject() || (myProjects[0] && myProjects[0].id) || null);
  if (!target) { files = {}; openedTabs = []; currentFileKey = null; wsProject = null; renderWsEmpty(); renderFileTree(); renderTabs(); return; }
  if (target !== wsProject || !wsLoaded) loadWorkspace(target);
  else { wsStartPolling(); renderWsHeader(); }
}
function loadWorkspace(id){
  wsStopPolling();
  wsFlushSaves();
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
  }).catch(function(e){ wsLoading = false; renderWsEmpty(); pushToast('⚠️', '파일을 불러오지 못했어요', e.message); });
}
function renderFileContent_empty(){
  if (window.monaco && monacoEditor) { wsSettingValue = true; monacoEditor.setValue(''); wsSettingValue = false; }
  updateEditorStatusBar(); wsUpdateSaveStatus(); wsRenderConflict();
}
function wsStartPolling(){ wsStopPolling(); wsPollTimer = setInterval(function(){ wsPollTick = (wsPollTick || 0) + 1; if(!LIVE.ok || wsPollTick % 6 === 0) wsPoll(); }, 6000); }   // 실시간 연결이 있으면 가끔만 확인(변경은 푸시로 바로 옴)
var wsPollTick = 0, wsPollSoonTimer = null;
function wsPollSoon(){ clearTimeout(wsPollSoonTimer); wsPollSoonTimer = setTimeout(wsPoll, 350); }   // 팀원이 저장하면 거의 바로 반영 (연속 저장은 한 번으로 묶음)
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
        if (!f.dirty && !f.saving) {
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
  var out = document.getElementById('termOutputText');
  if (out) out.innerHTML = '';
  var statusChip = document.getElementById('termStatusChip');
  if (statusChip) statusChip.style.display = 'none';
  var execTime = document.getElementById('termExecTime');
  if (execTime) execTime.style.display = 'none';
}

function setTerminalTab(tab) {
  ['output', 'stdin', 'history'].forEach(function(t) {
    var btn = document.getElementById('termTab' + t.charAt(0).toUpperCase() + t.slice(1));
    var body = document.getElementById('termBody' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === tab);
    if (body) body.style.display = (t === tab) ? 'block' : 'none';
  });
  if (tab === 'history') loadSubmissions();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

