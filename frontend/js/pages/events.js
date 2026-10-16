/* ---- events ---- */
/* ---- 이벤트·공모전: 서버가 자동으로 모은 해커톤·공모전·개발자 행사를 보여준다 ---- */
var evtState = { cat:'all', list:[], view:[], status:null, seq:0, searchTimer:null, lastRunSeen:null, added:{} };
var EVT_BM_KEY = 'sync_evt_bookmarks';
function evtBookmarks(){ try { return JSON.parse(localStorage.getItem(EVT_BM_KEY) || '{}'); } catch(e){ return {}; } }
function evtSaveBookmarks(o){ try { localStorage.setItem(EVT_BM_KEY, JSON.stringify(o)); } catch(e){} }
function evtSafeUrl(u){ return /^https?:\/\//i.test(u || '') ? u : '#'; }
function evtFmtDate(iso){
  if(!iso) return '';
  var d = new Date(iso + 'T00:00:00'); if(isNaN(d)) return iso;
  return (d.getMonth()+1) + '월 ' + d.getDate() + '일(' + '일월화수목금토'.charAt(d.getDay()) + ')';
}
function evtRel(iso){
  if(!iso) return '';
  var t = new Date(iso + (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? '' : 'Z')).getTime(); if(isNaN(t)) return '';
  var diff = Math.round((t - Date.now()) / 1000), abs = Math.abs(diff), tail = diff >= 0 ? ' 뒤' : ' 전';
  if(abs < 60) return diff >= 0 ? '곧' : '방금';
  if(abs < 3600) return Math.round(abs/60) + '분' + tail;
  if(abs < 86400) return Math.round(abs/3600) + '시간' + tail;
  return Math.round(abs/86400) + '일' + tail;
}
async function loadEvents(quiet){
  var grid = document.getElementById('evtGrid'); if(!grid) return;
  var my = ++evtState.seq;
  if(!quiet && !evtState.list.length){ grid.innerHTML = '<div class="evt-skel"></div><div class="evt-skel"></div><div class="evt-skel"></div><div class="evt-skel"></div>'; }
  var params = new URLSearchParams();
  if(evtState.cat !== 'all' && evtState.cat !== 'saved') params.set('category', evtState.cat);
  var q = ((document.getElementById('evtSearch') || {}).value || '').trim(); if(q) params.set('q', q);
  params.set('sort', (document.getElementById('evtSort') || {}).value || 'deadline');
  if((document.getElementById('evtClosed') || {}).checked) params.set('include_closed', 'true');
  try {
    var res = await Promise.all([fetch(API_BASE + '/api/events?' + params.toString()), fetch(API_BASE + '/api/events/status')]);
    if(my !== evtState.seq) return;                       // 더 최근 요청이 있으면 이 결과는 버린다
    if(!res[0].ok) throw new Error('목록을 불러오지 못했어요 (' + res[0].status + ')');
    evtState.list = await res[0].json();
    evtState.status = res[1].ok ? await res[1].json() : null;
    renderEvents(); renderCrawlStatus();
  } catch(e){
    if(my !== evtState.seq) return;
    grid.innerHTML = '<div class="evt-empty">⚠️ ' + escapeHtml(e.message || '서버에 연결하지 못했어요') + '<br><button class="btn ghost" style="margin-top:10px;" onclick="loadEvents()">다시 시도</button></div>';
  }
}
var EVT_STYLE = {
  '해커톤':   {g1:'#3B82F6', g2:'#8B5CF6', ic:'💻'},
  '공모전':   {g1:'#8B5CF6', g2:'#EC4899', ic:'🏆'},
  '대외활동': {g1:'#06B6D4', g2:'#3B82F6', ic:'🌱'},
  '세미나':   {g1:'#10B981', g2:'#06B6D4', ic:'🎤'},
  '기타':     {g1:'#64748B', g2:'#94A3B8', ic:'📌'}
};
function evtDday(ev){
  var d = ev.d_day || '접수중', n = /^D-\d+$/.test(d) ? parseInt(d.slice(2), 10) : null;
  if(ev.is_closed) return {cls:'closed', text:'마감'};
  if(d === 'D-Day') return {cls:'urgent', text:'마감임박 D-Day'};
  if(n !== null && n <= 3) return {cls:'urgent', text:'마감임박 ' + d};
  if(n !== null && n <= 7) return {cls:'soon', text:d};
  return {cls:(n === null ? 'rolling' : ''), text:d};
}
function evtImgLoaded(img){
  var box = img.parentNode;
  function show(){
    if(!img.parentNode) return;
    if(img.naturalHeight && img.naturalWidth / img.naturalHeight > 1.25){      // 가로로 긴 이미지(링크 미리보기 등)는 잘라 내지 않고 흐린 배경 위에 맞춰 보여준다
      box.classList.add('wide');
      box.style.setProperty('--bgimg', 'url("' + img.src.replace(/"/g, '%22') + '")');
    }
    box.classList.add('has-img');
  }
  // 큰 이미지는 화면에 그리기까지 시간이 걸리므로, 준비될 때까지 자동 생성 포스터를 보여주다가 부드럽게 바꾼다
  if(img.decode) img.decode().then(show, show); else show();
}
function evtImgError(img){ var box = img.parentNode; img.remove(); box.classList.remove('has-img'); }
function evtCardHtml(ev, i, bm){
  var st = EVT_STYLE[ev.category] || EVT_STYLE['기타'], dd = evtDday(ev);
  var url = escapeHtml(evtSafeUrl(ev.url));
  var sub = (ev.category === '대외활동' && ev.tags && ev.tags.length) ? ev.tags[0] : ev.category;
  var when = ev.deadline_date ? ('<b>' + (ev.deadline_kind === 'event' ? '행사 ' : '접수 마감 ') + escapeHtml(evtFmtDate(ev.deadline_date)) + '</b>') : '상시 · 일정 미정';
  var h = '<div class="pcard' + (ev.is_closed ? ' closed' : '') + '" style="--i:' + Math.min(i, 20) + '" data-cat="' + escapeHtml(ev.category) + '" onclick="evtOpen(event,' + i + ')">';
  h += '<div class="poster" style="--g1:' + st.g1 + ';--g2:' + st.g2 + '">';
  h += '<div class="poster-fb"><span class="pf-ic">' + st.ic + '</span><div><div class="pf-title">' + escapeHtml(ev.title) + '</div><div class="pf-host">' + escapeHtml(ev.host || '') + '</div></div></div>';
  if(ev.image_url && /^https:\/\//i.test(ev.image_url)) h += '<img src="' + escapeHtml(ev.image_url) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="evtImgLoaded(this)" onerror="evtImgError(this)">';
  h += '<div class="pc-top"><span class="pc-dday ' + dd.cls + '">' + escapeHtml(dd.text) + '</span>' + (ev.is_new ? '<span class="new-badge">NEW</span>' : '') + '</div>';
  h += '<button class="bookmark-btn' + (bm[ev.url] ? ' on' : '') + '" title="저장" onclick="event.stopPropagation(); toggleBookmark(' + i + ')"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="1.8" fill="none"><path d="M6 3h12v18l-6-4-6 4Z"/></svg></button>';
  h += '</div>';
  h += '<div class="pc-body"><span class="pc-cat">' + escapeHtml(sub) + '</span>';
  h += '<h4><a href="' + url + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">' + escapeHtml(ev.title) + '</a></h4>';
  h += '<div class="pc-host">' + escapeHtml(ev.host || '주최 정보 없음') + '</div><div class="pc-when">' + when + '</div>';
  h += '<div class="pc-actions">';
  if(ev.source === 'manual' && currentUser) h += '<button class="btn ghost" onclick="event.stopPropagation(); deleteCustomEvent(' + i + ')">삭제</button>';
  h += '<button class="btn ghost" ' + (evtState.added[ev.url] ? 'disabled' : '') + ' onclick="event.stopPropagation(); addEventToCal(' + i + ', this)">' + (evtState.added[ev.url] ? '✓ 추가됨' : '📅 캘린더') + '</button>';
  h += '<a class="btn ghost" href="' + url + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">공고 ↗</a>';
  if(ev.category !== '세미나') h += '<button class="btn ghost" style="flex:1 1 100%" onclick="event.stopPropagation(); evtRecruit(' + i + ')">👥 이 대회 팀원 구하기</button>';
  h += '</div>';
  h += '<div class="pc-src">출처 · ' + escapeHtml(ev.source_label || ev.source) + '</div></div></div>';
  return h;
}
function evtOpen(e, i){
  var ev = evtState.view[i]; if(!ev) return;
  var u = evtSafeUrl(ev.url); if(u !== '#') window.open(u, '_blank', 'noopener,noreferrer');
}
function renderEvents(){
  var grid = document.getElementById('evtGrid'); if(!grid) return;
  var bm = evtBookmarks();
  var list = evtState.list;
  if(evtState.cat === 'saved') list = list.filter(function(e){ return bm[e.url]; });
  evtState.view = list;
  if(!list.length){
    var q = ((document.getElementById('evtSearch') || {}).value || '').trim();
    var msg = evtState.cat === 'saved' ? '저장한 이벤트가 없어요. 카드의 ☆ 를 눌러 저장해 보세요.'
      : (q ? '“' + escapeHtml(q) + '” 에 맞는 이벤트가 없어요.'
      : ((evtState.status && !evtState.status.last_run) ? '아직 수집 전이에요. 잠시 후 자동으로 채워지고, 바로 보려면 [지금 새로고침]을 눌러 보세요.' : '지금 접수 중인 이벤트가 없어요. [마감 포함]을 켜 보세요.'));
    evtState.sig = null;
    grid.innerHTML = '<div class="evt-empty">' + msg + '</div>';
    return;
  }
  // 1분마다 조용히 새로고침할 때, 내용이 그대로면 200장 카드를 다시 그리지 않는다 (깜빡임·끊김 방지)
  var sig = evtState.cat + '|' + Object.keys(bm).sort().join(',') + '|' + list.map(function(e){ return e.id + ':' + (e.d_day || '') + ':' + (e.image_url ? 1 : 0) + ':' + (e.is_new ? 1 : 0); }).join(',');
  if(sig === evtState.sig && grid.firstElementChild && !grid.querySelector('.evt-empty')) return;
  evtState.sig = sig;
  grid.innerHTML = list.map(function(ev, i){ return evtCardHtml(ev, i, bm); }).join('');
}
function renderCrawlStatus(){
  var st = evtState.status, line = document.getElementById('crawlLine'), dot = document.getElementById('crawlDot'), box = document.getElementById('crawlSources');
  if(!line) return;
  if(!st){ line.textContent = '수집 현황을 불러오지 못했어요'; dot.className = 'cb-dot err'; box.innerHTML = ''; return; }
  var okN = st.sources.filter(function(x){ return x.ok === true; }).length, errN = st.sources.filter(function(x){ return x.ok === false; }).length;
  dot.className = 'cb-dot ' + (st.running ? 'run' : (!st.last_run ? '' : (errN && !okN ? 'err' : (errN ? 'warn' : 'ok'))));
  var parts = [];
  if(st.running) parts.push('<b>수집 중…</b>');
  else if(st.last_run) parts.push('마지막 수집 · <b>' + escapeHtml(evtRel(st.last_run)) + '</b>');
  else parts.push(st.enabled ? '아직 수집 전이에요 · 곧 자동으로 시작돼요' : '자동 수집이 꺼져 있어요 (서버 설정)');
  parts.push('접수중 <b>' + st.open_count + '</b>건');
  if(st.enabled && st.next_run && !st.running) parts.push('다음 자동 수집 · ' + escapeHtml(evtRel(st.next_run)));
  line.innerHTML = parts.join(' · ');
  box.innerHTML = st.sources.map(function(x){
    if(x.ok === false) return '<span class="src-chip err" title="' + escapeHtml(x.error || '실패') + '">⚠ ' + escapeHtml(x.label) + ' · ' + escapeHtml((x.error || '실패').slice(0, 24)) + '</span>';
    if(x.ok === true) return '<span class="src-chip ok" title="발견 ' + x.found + ' · 새로 ' + x.added + ' · 갱신 ' + x.updated + '">✓ ' + escapeHtml(x.label) + ' <b>' + x.found + '건</b></span>';
    return '<span class="src-chip">' + escapeHtml(x.label) + ' · 대기</span>';
  }).join('');
  if(evtState.lastRunSeen && st.last_run && st.last_run !== evtState.lastRunSeen){
    var added = st.sources.reduce(function(a, x){ return a + (x.added || 0); }, 0);
    if(added > 0) pushToast('🆕', '새 이벤트가 올라왔어요', added + '건이 새로 수집됐어요');
  }
  evtState.lastRunSeen = st.last_run || evtState.lastRunSeen;
}
function setEvtCategory(btn, cat){
  document.querySelectorAll('#evtFilters button').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active'); evtState.cat = cat; loadEvents(true);
}
function onEvtSearch(){ clearTimeout(evtState.searchTimer); evtState.searchTimer = setTimeout(function(){ loadEvents(true); }, 300); }
async function refreshCrawl(){
  var btn = document.getElementById('refreshBtn'), label = document.getElementById('refreshLabel');
  if(!btn || btn.classList.contains('spinning')) return;
  if(!calApiMode){ pushToast('🔒', '로그인 후 새로고침할 수 있어요', '자동 수집은 로그인하지 않아도 서버가 알아서 해요'); return; }
  btn.classList.add('spinning'); label.textContent = '수집 중…';
  try {
    var st = await apiFetch('/api/events/refresh', {method:'POST'});
    if(!st.running){ pushToast('ℹ️', '이벤트 수집', st.message || '지금은 새로고침할 수 없어요'); return; }
    evtState.status = st; renderCrawlStatus();
    for(var i = 0; i < 45; i++){                               // 최대 약 90초 동안 끝날 때까지 확인
      await new Promise(function(r){ setTimeout(r, 2000); });
      var cur = await fetch(API_BASE + '/api/events/status').then(function(r){ return r.json(); });
      evtState.status = cur;
      if(!cur.running) break;
    }
    var added = (evtState.status.sources || []).reduce(function(a, x){ return a + (x.added || 0); }, 0);
    evtState.lastRunSeen = evtState.status.last_run;           // 아래 토스트와 중복 알림 방지
    await loadEvents(true);
    var bad = (evtState.status.sources || []).filter(function(x){ return x.ok === false; });
    pushToast(bad.length ? '⚠️' : '✅', '이벤트 정보를 갱신했어요', added + '건 새로 추가' + (bad.length ? ' · 실패한 출처: ' + bad.map(function(x){ return x.label; }).join(', ') : ''));
  } catch(e){
    if(e.status !== 401) pushToast('⚠️', '새로고침하지 못했어요', e.message);
  } finally {
    btn.classList.remove('spinning'); label.textContent = '지금 새로고침';
  }
}
function toggleBookmark(i){
  var ev = evtState.view[i]; if(!ev) return;
  var bm = evtBookmarks(); if(bm[ev.url]) delete bm[ev.url]; else bm[ev.url] = 1;
  evtSaveBookmarks(bm);
  if(evtState.cat === 'saved') renderEvents();
  else { var b = document.querySelectorAll('#evtGrid .pcard')[i]; if(b) b.querySelector('.bookmark-btn').classList.toggle('on', !!bm[ev.url]); }
}
function addEventToCal(i, btn){
  var ev = evtState.view[i]; if(!ev) return;
  if(!calApiMode){ pushToast('🔒', '로그인 후 캘린더에 담을 수 있어요', ''); return; }
  var sid = chatServerId();
  if(!sid){ pushToast('🗂️', '프로젝트가 필요해요', '프로젝트를 만든 뒤 팀 캘린더에 담을 수 있어요.'); return; }
  if(!ev.deadline_date){ pushToast('📅', '날짜 정보가 없어요', '일정 미정이라 캘린더에 담을 수 없어요.'); return; }
  var title = ((ev.deadline_kind === 'event') ? '' : '[접수 마감] ') + ev.title;
  if(btn) btn.disabled = true;
  apiFetch('/api/calendar/events', {method:'POST', body:JSON.stringify({project_id:sid, title:title.slice(0, 200), start_date:ev.deadline_date, kind:'shared', source:(ev.url || '').slice(0, 300)})}).then(function(){
    evtState.added[ev.url] = true; if(btn) btn.textContent = '✓ 추가됨';
    refreshTeamEvents();
    var cur = calProjectById(chatProject);
    pushToast('📅', '캘린더에 담았어요', (cur ? '「' + cur.title + '」 ' : '') + evtFmtDate(ev.deadline_date) + ' · ' + ev.title.slice(0, 30));
  }).catch(function(e){ if(btn) btn.disabled = false; if(e.status !== 401) pushToast('⚠️', '캘린더에 담지 못했어요', e.message); });
}
async function submitCustomCrawl(){
  var inp = document.getElementById('crawlCustomUrl'), catSel = document.getElementById('crawlCustomCategory'), btn = document.getElementById('btnCustomCrawl');
  var url = ((inp || {}).value || '').trim();
  if(!url){ pushToast('⚠️', '주소를 입력해 주세요', '공고 페이지 주소(https://…)를 붙여넣어 주세요.'); return; }
  if(!calApiMode){ pushToast('🔒', '로그인 후 등록할 수 있어요', ''); return; }
  btn.disabled = true; btn.textContent = '읽는 중…';
  try {
    var data = await apiFetch('/api/events/crawl-url', {method:'POST', body:JSON.stringify({url:url, category:catSel ? catSel.value : null})});
    inp.value = '';
    pushToast('🎉', '이벤트를 등록했어요', "'" + data.title.slice(0, 40) + "'");
    await loadEvents(true);
  } catch(e){ if(e.status !== 401) pushToast('⚠️', '등록하지 못했어요', e.message); }
  finally { btn.disabled = false; btn.textContent = '등록'; }
}
function deleteCustomEvent(i){
  var ev = evtState.view[i]; if(!ev || !confirm("'" + ev.title + "' 이벤트를 삭제할까요?")) return;
  apiFetch('/api/events/' + ev.id, {method:'DELETE'}).then(function(){ pushToast('🗑️', '삭제했어요', ''); loadEvents(true); })
    .catch(function(e){ if(e.status !== 401) pushToast('⚠️', '삭제하지 못했어요', e.message); });
}
/* 이벤트 화면을 보고 있는 동안 1분마다 조용히 새로 고침해서, 서버의 자동 수집 결과가 바로 반영되게 한다 */
setInterval(function(){
  var v = document.querySelector('.view.active');
  if(v && v.dataset.view === 'events' && !document.hidden) loadEvents(true);
}, 60000);
function autoGrow(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }
/* 한글/일본어 등 IME 로 글자를 조합하는 중에 누른 Enter 는 '입력 확정'이지 제출이 아니다.
   이걸 구분하지 않으면 확정 Enter 가 한 번 더 들어와서 같은 동작이 두 번 실행된다. */
var imeComposing = false;
document.addEventListener('compositionstart', function(){ imeComposing = true; }, true);
document.addEventListener('compositionend', function(){ setTimeout(function(){ imeComposing = false; }, 0); }, true);
// 조합 중이라는 신호가 하나라도 있으면 Enter 를 제출로 보지 않는다 (브라우저/OS 마다 isComposing 값이 제각각이라 3가지를 모두 확인)
function isEnter(e){ return e.key==='Enter' && !e.isComposing && e.keyCode!==229 && !imeComposing; }
function homeAddEvent(){ goView('calendar'); setTimeout(function(){ if(typeof openAddEvent === 'function') openAddEvent(); }, 250); }
function homeToggleJoin(force){
  var row = document.getElementById('homeJoinRow'), btn = document.getElementById('homeJoinBtn'); if(!row) return;
  var open = (typeof force === 'boolean') ? force : row.hidden;
  row.hidden = !open; if(btn) btn.classList.toggle('on', open);
  if(open){ var i = document.getElementById('homeJoinInput'); if(i){ i.value = ''; setTimeout(function(){ i.focus(); }, 30); } }
}
function homeJoin(){
  var i = document.getElementById('homeJoinInput'); var v = (i ? i.value : '').trim(); if(!v){ if(i) i.focus(); return; }
  var token = '';
  try { token = new URL(v).searchParams.get('invite') || ''; } catch(e){}
  if(!token && /^[A-Za-z0-9_-]{8,128}$/.test(v)) token = v;
  if(!token){ pushToast('⚠️','초대 링크를 확인해 주세요','팀장이 보내 준 링크(…?invite=…)를 그대로 붙여넣어 주세요.'); if(i) i.focus(); return; }
  setPendingInvite(token); homeToggleJoin(false); processPendingInvite();
}
function homeRecruit(){
  if(cmNeedLogin('팀원 모집 글을 쓰려면 로그인이 필요해요')) return;
  goView('community'); cmOpenEditor({cat:'recruit'});
}
function handlePromptKeydown(e){
  if(isEnter(e) && !e.altKey){
    e.preventDefault();
    createFromPrompt();
  }
}
function createFromPrompt(){
  var input = document.getElementById('promptInput');
  function go(){
    var v = input.value.trim();
    if(!v) return;
    input.value = '';
    autoGrow(input);
    addProjectFromPrompt(v);
    dismissHomeLanding();
  }
  // 조합이 끝나지 않은 상태에서 값을 비우면 마지막 글자가 입력창에 다시 남는다 → 먼저 입력을 확정(blur)하고 처리
  if(imeComposing){ input.blur(); setTimeout(go, 30); } else go();
}
var myProjects = [];
var currentWorkspaceId = null;
var projPageIndex = 0;
var PROJ_PAGE_SIZE = 3;
function buildProjCard(p){
  var card = document.createElement('div');
  card.className = 'proj-card card';
  card.onclick = function(){ openWorkspace(p.id); };
  var avatarsHtml = p.avatars.map(function(a){ return "<div class='mini' style='background:"+a.c+";'>"+a.i+"</div>"; }).join('');
  card.innerHTML =
    "<div class='top'><div class='stackicon' style='background:"+p.stackColor+";'>"+p.stack+"</div>"+
      (p.status ? "<span class='chip "+p.statusClass+"'>"+escHtml(p.status)+"</span>" : '')+
    "</div>"+
    "<div><h4></h4><div class='meta'></div>"+(p.recentFile ? "<div class='meta-file'>📄 "+escHtml(p.recentFile)+"</div>" : '')+"</div>"+
    "<div class='bottom'><div class='avatar-stack'>"+avatarsHtml+"</div><span class='chip'></span></div>";
  card.querySelector('h4').textContent = p.title;
  card.querySelector('.meta').textContent = p.meta;
  card.querySelector('.bottom .chip').textContent = p.files;
  return card;
}
function renderProjRow(){
  var row = document.querySelector('.dyn-widget[data-widget="projects"] .proj-row');
  if(!row) return;
  row.innerHTML = '';
  if(myProjects.length===0){
    row.innerHTML = "<p class='proj-empty'>아직 워크스페이스가 없어요. 위 입력창에 프로젝트를 설명하면 여기에 만들어져요.</p>";
  } else {
    var totalPages = Math.ceil(myProjects.length / PROJ_PAGE_SIZE);
    if(projPageIndex > totalPages-1) projPageIndex = totalPages-1;
    var start = projPageIndex * PROJ_PAGE_SIZE;
    myProjects.slice(start, start+PROJ_PAGE_SIZE).forEach(function(p){ row.appendChild(buildProjCard(p)); });
  }
  var nav = document.getElementById('projNav');
  if(nav){
    var totalPages2 = Math.ceil(myProjects.length / PROJ_PAGE_SIZE);
    nav.hidden = totalPages2 <= 1;
    document.getElementById('projPageLabel').textContent = (projPageIndex+1)+' / '+Math.max(totalPages2,1);
    document.getElementById('projPrevBtn').disabled = projPageIndex<=0;
    document.getElementById('projNextBtn').disabled = projPageIndex>=totalPages2-1;
  }
  if(calReady) syncCalProjects();
  renderDureOrbit();
  if(typeof mpRefreshSoon === 'function') mpRefreshSoon();
}
function projPrev(){ if(projPageIndex>0){ projPageIndex--; renderProjRow(); } }
function projNext(){
  var totalPages = Math.ceil(myProjects.length / PROJ_PAGE_SIZE);
  if(projPageIndex<totalPages-1){ projPageIndex++; renderProjRow(); }
}
/* 열어 둔 화면이 오래된 코드면 알려주고(작업 중이 아니면 자동으로) 새로고침한다 */
var appBuild = null;
function checkAppVersion(){
  if (document.hidden) return;
  var base = (typeof API_BASE === 'string') ? API_BASE : (function(){ try { return localStorage.getItem('sync_api_base') || defaultApiBase(); } catch(e){ return defaultApiBase(); } })();
  fetch(base + '/api/version', {cache:'no-store'}).then(function(r){ return r.json(); }).then(function(v){
    if (!v || !v.build) return;
    var tag = document.getElementById('buildTag');
    if (appBuild === null) { appBuild = v.build; }
    if (tag) tag.textContent = '화면 버전 ' + appBuild + (v.build === appBuild ? ' · 최신' : ' · 새 버전 ' + v.build + ' 있음 (새로고침 필요)');
    if (v.build === appBuild) return;
    if (v.build === appBuild) return;
    var ae = document.activeElement;
    var typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable) && ae.value;
    var unsaved = Object.keys(files).some(function(k){ return files[k] && files[k].dirty; });
    if (!typing && !unsaved) { location.reload(); }
    else if (!window.__staleToast) { window.__staleToast = true; pushToast('🔄', '새 버전이 나왔어요', '작업을 마치면 페이지를 새로고침(⌘R) 해주세요'); }
  }).catch(function(){});
}
checkAppVersion();
setInterval(checkAppVersion, 60000);
document.addEventListener('visibilitychange', function(){ if (!document.hidden) checkAppVersion(); });
var projCreateGuard = {name:null, at:0, busy:false};
function addProjectFromPrompt(name, row){
  name = (name || '').trim();
  if(!name) return;
  if(!row){
    // 연타·중복 이벤트 방지: 생성 중이거나, 같은 이름을 방금(3초 안에) 만들었으면 무시
    if(projCreateGuard.busy) return;
    // 한글 입력에서 같은 Enter 가 두 번 들어오면, 두 번째는 방금 만든 이름의 일부(마지막 글자)로 들어온다
    // 예) "ㄹㅇ" 를 만든 직후 "ㅇ" → 같은 이름이거나, 방금 이름의 끝/앞부분이면 중복으로 보고 무시
    var prev = projCreateGuard.name;
    if(prev && Date.now()-projCreateGuard.at < 3000 && (prev===name || (name.length < prev.length && (prev.endsWith(name) || prev.startsWith(name))))) return;
    projCreateGuard.name = name; projCreateGuard.at = Date.now();
  }
  if(calApiMode && !row){
    projCreateGuard.busy = true;
    apiFetch('/api/projects', {method:'POST', body:JSON.stringify({title:name})})
      .then(function(created){ projCreateGuard.busy = false; addProjectFromPrompt(name, created); })
      .catch(function(e){ projCreateGuard.busy = false; projCreateGuard.name = null; pushToast('⚠️','프로젝트를 만들지 못했어요', e.message); });
    return;
  }
  if(row){
    // 서버가 이미 만든 프로젝트를 돌려준 경우(중복 요청) → 다시 추가하지 않고, 서버 쪽 이름으로만 맞춘다
    var existing = myProjects.filter(function(x){ return x.id==='p'+row.id; })[0];
    if(existing){ if(existing.title!==row.title){ existing.title = row.title; renderProjRow(); } return; }
  }
  var id = row ? 'p'+row.id : 'ws'+Date.now()+Math.random().toString(36).slice(2,5);
    var newProj = {
    id: id,
    serverId: row ? row.id : undefined,
    members: row ? row.members : [],
    isOwner: true,
    title: name,
    isNew: false,
    stack: 'AI',
    stackColor: 'var(--accent)',
    status: '방금 생성됨',
    statusClass: 'accent2',
    meta: 'AI 워크스페이스 · 지금 막 시작함',
    avatars: [{i:'나',c:'#06B6D4'}],
    files: '2 files',
    recentFile: 'main.py'
  };
  myProjects.unshift(newProj);
  if(row) registerProjectMembers(newProj);
  projPageIndex = 0;
  renderProjRow();
  pushToast('✨','프로젝트 생성됨', '"'+name+'" 워크스페이스가 생성되었습니다.');
  openWorkspace(id);
  // 서버에 저장된 프로젝트라면 바로 팀원 초대 창을 열어 링크를 보낼 수 있게 한다
  if(calApiMode && row){ setTimeout(function(){ openInviteModal(id); }, 400); }
}
function openWorkspace(id){
  if (calApiMode && calProjectById(id)) {
    // 실제 로그인: 프로젝트를 선택하고 워크스페이스 화면으로 (파일은 서버에서 불러옴)
    wsProject = null; wsLoaded = false;
    calSelected = id; saveCalSettings(); syncCalProjects();
    goView('workspace');
    return;
  }
  var proj = myProjects.find(function(p){ return p.id===id; }) || myProjects[0] || null;
  if(!proj){ goView('workspace'); return; }
  currentWorkspaceId = proj.id;
  wsProject = proj.id;
  var crumb = document.getElementById('wsCrumbName');
  if (crumb) crumb.textContent = proj.title;

  initProjectStarterFiles(proj, false);
  proj.isNew = false;
  renderWsSelector();

  var wsFileTree = document.getElementById('wsFileTree');
  var wsEditorCol = document.getElementById('wsEditorCol');
  if (wsFileTree) wsFileTree.hidden = false;
  if (wsEditorCol) wsEditorCol.hidden = false;
  renderWsEmpty();

  var chip = document.getElementById('wsPresenceChip');
  var stack = document.getElementById('wsMemberStack');
  if (chip) chip.hidden = false;
  if (stack) stack.hidden = false;

  goView('workspace');
  if (window.monaco && monacoEditor) {
    setTimeout(function() { monacoEditor.layout(); }, 120);
  }
}

