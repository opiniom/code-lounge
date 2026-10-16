/* ---- calendar: data-driven events (cap + overflow + delete) ---- */
var CAL_CAP = 2;
var calendarEvents = [];
function loadDemoCalendar(){
  calendarEvents = []; calDetect = []; calDetectEngine = null; calDetectNote = null;
}
function memberColor(m){
  var map = {jiwoo:'#3B82F6', minjae:'#8B5CF6', haeun:'#EC4899', yoon:'#F59E0B', me:'#06B6D4'};
  if(map[m]) return map[m];
  var u = /^u(\d+)$/.exec(m || '');
  if(u) return ['#06B6D4','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#10B981'][parseInt(u[1], 10) % 6];
  return '#8C8578';
}
function registerProjectMembers(pr){
  calProjectMembers[pr.id] = (pr.members || []).map(function(mm){ calMemberNames['u'+mm.id] = mm.username; return 'u'+mm.id; });
}

/* ---- calendar: 프로젝트별 캘린더 (셀렉터 + 설정) ---- */
var calReady = false;
var CAL_TODAY = {y:2026, m:9, d:11};   // 데모 모드의 '오늘' (실제 로그인에서는 진짜 오늘 날짜)
var calYear = CAL_TODAY.y, calMonth = CAL_TODAY.m;
function pad2(n){ return n<10 ? '0'+n : ''+n; }
function calYm(y, m){ return (y===undefined?calYear:y)+'-'+pad2(m===undefined?calMonth:m); }
var calSelected = 'all';
var calHiddenProjects = {};
var calProjectColors = {};
var calHiddenMembers = {};
var CAL_PALETTE = ['#3B82F6','#8B5CF6','#06B6D4','#EC4899','#F59E0B','#10B981'];
var calMemberNames = {jiwoo:'지우', minjae:'민재', haeun:'하은', yoon:'윤', me:'나'};
var calProjectMembers = {capstone:['jiwoo','minjae','haeun','me'], algo:['minjae','jiwoo','yoon','me'], club:['haeun','yoon','me']};
(function(){
  try{
    var saved = JSON.parse(localStorage.getItem('sync_cal_settings')||'null');
    if(saved){ calHiddenProjects = saved.hidden||{}; calProjectColors = saved.colors||{}; calSelected = saved.selected||'all'; }
  }catch(e){}
})();
function saveCalSettings(){
  try{ localStorage.setItem('sync_cal_settings', JSON.stringify({hidden:calHiddenProjects, colors:calProjectColors, selected:calSelected})); }catch(e){}
}
function calProjectById(id){ for(var i=0;i<myProjects.length;i++){ if(myProjects[i].id===id) return myProjects[i]; } return null; }
function calProjColor(p){
  if(!p) return '#8C8578';
  if(calProjectColors[p.id]) return calProjectColors[p.id];
  if(p.stackColor && p.stackColor.charAt(0)==='#') return p.stackColor;
  return CAL_PALETTE[Math.max(0, myProjects.indexOf(p)) % CAL_PALETTE.length];
}
function calEnabledProjects(){ return myProjects.filter(function(p){ return !calHiddenProjects[p.id]; }); }
function calVisibleProjectIds(){
  var enabled = calEnabledProjects();
  if(calSelected!=='all'){
    var one = enabled.filter(function(p){ return p.id===calSelected; });
    if(one.length) return [calSelected];
  }
  return enabled.map(function(p){ return p.id; });
}
function calDefaultProject(){
  var ids = calVisibleProjectIds();
  return (calSelected!=='all' && ids.indexOf(calSelected)>=0) ? calSelected : (ids[0] || null);
}
function isMemberVisible(member){ return !member || !calHiddenMembers[member]; }
function isEventVisible(ev){
  return calVisibleProjectIds().indexOf(ev.project)>=0 && isMemberVisible(ev.member);
}
function buildCalGrid(){
  var grid = document.querySelector('.cal-grid');
  if(!grid) return;
  grid.querySelectorAll('.cal-cell').forEach(function(n){ n.remove(); });
  var first = new Date(calYear, calMonth-1, 1).getDay();
  var days = new Date(calYear, calMonth, 0).getDate();
  function empty(){ var c = document.createElement('div'); c.className = 'cal-cell empty'; grid.appendChild(c); }
  for(var i=0; i<first; i++) empty();
  for(var d=1; d<=days; d++){
    var cell = document.createElement('div');
    cell.dataset.date = calYm()+'-'+pad2(d);
    cell.className = 'cal-cell' + ((calYear===CAL_TODAY.y && calMonth===CAL_TODAY.m && d===CAL_TODAY.d) ? ' today' : '');
    var num = document.createElement('span'); num.className = 'cal-daynum'; num.textContent = d;
    cell.appendChild(num);
    grid.appendChild(cell);
  }
  var total = first + days;
  for(var j=0; j<(7 - total%7)%7; j++) empty();
}
function updateCalMonthLabel(){
  document.getElementById('calMonthLabel').textContent = calYear+'년 '+calMonth+'월';
}
function setCalMonth(y, m){
  calYear = y; calMonth = m;
  buildCalGrid();
  updateCalMonthLabel();
  closeCalPicker();
  renderCalSelector();
  renderCalendarEvents();
}
var calPickYear = calYear;
function renderCalPicker(){
  var box = document.getElementById('calPicker');
  box.innerHTML = '';
  var yr = document.createElement('div'); yr.className = 'calpick-year';
  var prev = document.createElement('button'); prev.type = 'button'; prev.setAttribute('aria-label','이전 해');
  prev.innerHTML = "<svg viewBox='0 0 24 24' width='13' height='13' fill='none' stroke='currentColor' stroke-width='2'><path d='m15 6-6 6 6 6'/></svg>";
  prev.onclick = function(){ calPickYear--; renderCalPicker(); };
  var next = document.createElement('button'); next.type = 'button'; next.setAttribute('aria-label','다음 해');
  next.innerHTML = "<svg viewBox='0 0 24 24' width='13' height='13' fill='none' stroke='currentColor' stroke-width='2'><path d='m9 6 6 6-6 6'/></svg>";
  next.onclick = function(){ calPickYear++; renderCalPicker(); };
  var lbl = document.createElement('span'); lbl.textContent = calPickYear+'년';
  yr.appendChild(prev); yr.appendChild(lbl); yr.appendChild(next);
  box.appendChild(yr);
  var grid = document.createElement('div'); grid.className = 'calpick-grid';
  for(var m=1; m<=12; m++){
    (function(m){
      var b = document.createElement('button'); b.type = 'button';
      b.textContent = m+'월';
      if(calPickYear===calYear && m===calMonth) b.className = 'cur';
      b.onclick = function(){ setCalMonth(calPickYear, m); };
      grid.appendChild(b);
    })(m);
  }
  box.appendChild(grid);
  var today = document.createElement('button'); today.type = 'button'; today.className = 'calpick-today';
  today.textContent = '오늘로 이동';
  today.onclick = function(){ setCalMonth(CAL_TODAY.y, CAL_TODAY.m); };
  box.appendChild(today);
}
function toggleCalPicker(e){
  if(e) e.stopPropagation();
  var box = document.getElementById('calPicker');
  var opening = !box.classList.contains('open');
  if(opening){ calPickYear = calYear; renderCalPicker(); }
  box.classList.toggle('open', opening);
  document.getElementById('calMonthBtn').classList.toggle('open', opening);
}
function closeCalPicker(){
  var box = document.getElementById('calPicker'); if(box) box.classList.remove('open');
  var btn = document.getElementById('calMonthBtn'); if(btn) btn.classList.remove('open');
}
var ALL_DOT = 'conic-gradient(#3B82F6 0 33%, #8B5CF6 0 66%, #06B6D4 0)';
function renderSelectorInto(prefix, countFn, unit){
  var menu = document.getElementById(prefix+'Menu');
  if(!menu) return;
  menu.innerHTML = '';
  var enabled = calEnabledProjects();
  function addItem(id, label, color, count){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'calsel-item' + (calSelected===id ? ' active' : '');
    var dot = document.createElement('span'); dot.className = 'pdot'; dot.style.background = color;
    var nm = document.createElement('span'); nm.textContent = label; nm.style.overflow='hidden'; nm.style.textOverflow='ellipsis'; nm.style.whiteSpace='nowrap';
    b.appendChild(dot); b.appendChild(nm);
    if(count!==undefined){ var c = document.createElement('span'); c.className='cnt'; c.textContent = count; b.appendChild(c); }
    b.onclick = function(){ selectCalProject(id); };
    menu.appendChild(b);
  }
  if(enabled.length){
    addItem('all', '전체 프로젝트', ALL_DOT, enabled.length+'개');
    enabled.forEach(function(p){ addItem(p.id, p.title, calProjColor(p), countFn(p)+unit); });
    var sep = document.createElement('div'); sep.className = 'calsel-sep'; menu.appendChild(sep);
  }
  if(prefix==='calSel'){
    var st = document.createElement('button');
    st.type = 'button'; st.className = 'calsel-item settings';
    st.textContent = '⚙ 캘린더 표시 설정';
    st.onclick = function(){ closeCalMenu(); openCalSettings(); };
    menu.appendChild(st);
  }

  var label = document.getElementById(prefix+'Label');
  var dot2 = document.getElementById(prefix+'Dot');
  var sel = calProjectById(calSelected);
  if(!enabled.length){
    label.textContent = '프로젝트 없음'; dot2.style.background = 'var(--border-strong)';
  } else if(calSelected!=='all' && sel && !calHiddenProjects[sel.id]){
    label.textContent = sel.title; dot2.style.background = calProjColor(sel);
  } else {
    label.textContent = '전체 프로젝트'; dot2.style.background = ALL_DOT;
  }
}
function renderCalSelector(){
  renderSelectorInto('calSel', function(p){ return calendarEvents.filter(function(ev){ return ev.project===p.id && evInMonth(ev); }).length; }, '건');
  renderSelectorInto('noteSel', function(p){ return meetingDocs.filter(function(d){ return d.project===p.id; }).length; }, '건');
}
function renderCalMemberLegend(){
  var wrap = document.getElementById('calMemberLegend');
  if(!wrap) return;
  wrap.innerHTML = '';
  var lab = document.createElement('span'); lab.className = 'cal-legend-label'; lab.textContent = '멤버별 보기';
  wrap.appendChild(lab);
  var seen = {}, members = [];
  calVisibleProjectIds().forEach(function(id){
    (calProjectMembers[id] || ['me']).forEach(function(m){ if(!seen[m]){ seen[m] = true; members.push(m); } });
  });
  members.forEach(function(m){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'member-chip' + (calHiddenMembers[m] ? '' : ' active');
    b.dataset.member = m;
    b.onclick = function(){ toggleMemberFilter(b); };
    var d = document.createElement('span'); d.className = 'dot'; d.style.background = memberColor(m);
    b.appendChild(d); b.append(calMemberNames[m] || m);
    wrap.appendChild(b);
  });
}
function updateCalTexts(){
  var sub = document.getElementById('calSub');
  var sel = calProjectById(calSelected);
  var ids = calVisibleProjectIds();
  if(!myProjects.length){ sub.textContent = '아직 참여 중인 프로젝트가 없어요. 프로젝트를 만들면 여기에 캘린더가 생겨요'; }
  else if(calSelected!=='all' && sel && ids.length===1){ sub.textContent = '이 프로젝트의 팀 일정과 팀원 개인 일정을 함께 봐요'; }
  else { sub.textContent = '내가 참여 중인 '+ids.length+'개 프로젝트의 일정을 한눈에 확인해요'; }
  renderDetectCard();
}
var calProjectsLoaded = !authToken;   // 로그인(또는 자동 로그인) 직후 서버에서 프로젝트를 다 불러오기 전에는 저장된 선택을 지우지 않는다
function syncCalProjects(){
  if(calSelected!=='all' && calProjectsLoaded && (!calProjectById(calSelected) || calHiddenProjects[calSelected])) calSelected = 'all';
  renderCalSelector(); renderCalMemberLegend(); updateCalTexts(); renderCalendarEvents();
  renderMeetingDocs();
  if(typeof renderChatHeader==='function') renderChatHeader();
  if(typeof renderWsSelector==='function') renderWsSelector();
}
function selectCalProject(id){
  calSelected = id;
  saveCalSettings();
  closeCalMenu();
  syncCalProjects();
}
function toggleCalMenu(e, prefix){
  if(e) e.stopPropagation();
  var menu = document.getElementById((prefix || 'calSel')+'Menu');
  var willOpen = !menu.classList.contains('open');
  closeCalMenu();
  menu.classList.toggle('open', willOpen);
}
function closeCalMenu(){
  ['calSelMenu','noteSelMenu','wsSelMenu'].forEach(function(id){ var m = document.getElementById(id); if(m) m.classList.remove('open'); });
}
document.addEventListener('click', function(e){
  if(!e.target.closest || !e.target.closest('.calsel-wrap')) closeCalMenu();
  if(!e.target.closest || !e.target.closest('.cal-head')) closeCalPicker();
});
function openCalSettings(){ closeCalMenu(); renderCalSettings(); document.getElementById('calSettingsModal').classList.add('open'); }
function closeCalSettings(){ var el = document.getElementById('calSettingsModal'); if(el) el.classList.remove('open'); }
/* ---- 워크스페이스: 프로젝트 관리 (체크 → 휴지통으로 삭제) ---- */
var pmSelected = {}, pmConfirm = false, pmBusy = false;
function openProjManage(){
  if (!calApiMode) { pushToast('🔒', '로그인이 필요해요', '로그인하면 프로젝트를 만들고 삭제할 수 있어요'); return; }
  pmSelected = {}; pmConfirm = false; pmBusy = false;
  renderProjManage();
  document.getElementById('projManageModal').classList.add('open');
}
function closeProjManage(){ document.getElementById('projManageModal').classList.remove('open'); pmConfirm = false; }
var PM_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
function renderProjManage(){
  var list = document.getElementById('pmList'), foot = document.getElementById('pmFoot');
  if (!list || !foot) return;
  list.innerHTML = ''; foot.innerHTML = '';
  var deletable = myProjects.filter(function(p){ return p.isOwner; });
  if (!myProjects.length) {
    list.innerHTML = "<p class='cal-set-empty'>프로젝트가 없어요. 워크스페이스 상단의 선택 박스에서 새 프로젝트를 만들어보세요.</p>";
    return;
  }
  var chosen = deletable.filter(function(p){ return pmSelected[p.id]; });
  // 전체 선택
  var all = document.createElement('div');
  all.className = 'pm-all' + (deletable.length && chosen.length === deletable.length ? ' sel' : '');
  all.innerHTML = "<span class='pm-check'>" + PM_CHECK + "</span><span>전체 선택</span>";
  all.onclick = function(){
    var every = deletable.length && chosen.length === deletable.length;
    deletable.forEach(function(p){ if (every) delete pmSelected[p.id]; else pmSelected[p.id] = true; });
    pmConfirm = false; renderProjManage();
  };
  if (deletable.length) list.appendChild(all);
  myProjects.forEach(function(p){
    var row = document.createElement('div');
    var locked = !p.isOwner;
    row.className = 'pm-row' + (pmSelected[p.id] ? ' sel' : '') + (locked ? ' locked' : '');
    row.title = locked ? '소유자만 삭제할 수 있어요' : '';
    row.innerHTML = "<span class='pm-check'>" + PM_CHECK + "</span><span class='pm-name'></span><span class='pm-meta'></span>";
    row.querySelector('.pm-name').textContent = p.title;
    row.querySelector('.pm-meta').textContent = locked ? '팀원 · 삭제 불가' : ((p.members || []).length || 1) + '명';
    if (!locked) row.onclick = function(){ if (pmSelected[p.id]) delete pmSelected[p.id]; else pmSelected[p.id] = true; pmConfirm = false; renderProjManage(); };
    list.appendChild(row);
  });
  if (pmConfirm && chosen.length) {
    var box = document.createElement('div'); box.className = 'pm-confirm';
    var msg = document.createElement('div');
    msg.textContent = '선택한 ' + chosen.length + '개 프로젝트를 삭제할까요? (' + chosen.slice(0, 3).map(function(p){ return '"' + p.title + '"'; }).join(', ') + (chosen.length > 3 ? ' 외 ' + (chosen.length - 3) + '개' : '') + ') 파일·채팅·캘린더 일정이 함께 삭제되고 되돌릴 수 없어요.';
    var row = document.createElement('div'); row.className = 'row';
    var no = document.createElement('button'); no.className = 'cbtn no'; no.textContent = '취소'; no.onclick = function(){ pmConfirm = false; renderProjManage(); };
    var yes = document.createElement('button'); yes.className = 'cbtn yes'; yes.textContent = pmBusy ? '삭제 중…' : '삭제'; yes.disabled = pmBusy;
    yes.onclick = function(){ deleteProjects(chosen.map(function(p){ return p.id; })); };
    row.appendChild(no); row.appendChild(yes); box.appendChild(msg); box.appendChild(row); foot.appendChild(box);
    return;
  }
  var cnt = document.createElement('span'); cnt.className = 'pm-count'; cnt.textContent = chosen.length ? chosen.length + '개 선택됨' : '삭제할 프로젝트를 체크하세요';
  var trash = document.createElement('button'); trash.className = 'pm-trash'; trash.disabled = !chosen.length;
  trash.innerHTML = "<svg viewBox='0 0 24 24' width='15' height='15' fill='none' stroke='currentColor' stroke-width='2'><path d='M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6'/></svg>삭제" + (chosen.length ? ' (' + chosen.length + ')' : '');
  trash.onclick = function(){ pmConfirm = true; renderProjManage(); };
  foot.appendChild(cnt); foot.appendChild(trash);
}
function deleteProjects(ids){
  if (pmBusy) return;
  pmBusy = true; renderProjManage();
  var done = [], failed = [];
  ids.reduce(function(chain, id){
    return chain.then(function(){
      var pr = calProjectById(id);
      if (!pr || !pr.serverId) return;
      return apiFetch('/api/projects/' + pr.serverId, { method: 'DELETE' }).then(function(){ done.push(pr); }).catch(function(e){ failed.push(pr.title + ' (' + e.message + ')'); });
    });
  }, Promise.resolve()).then(function(){
    var gone = {}; done.forEach(function(p){ gone[p.id] = true; });
    myProjects = myProjects.filter(function(x){ return !gone[x.id]; });
    if (gone[calSelected]) { calSelected = 'all'; saveCalSettings(); }
    if (gone[wsProject]) { wsProject = null; wsLoaded = false; files = {}; openedTabs = []; currentFileKey = null; }
    if (gone[chatProject]) { chatProject = null; chatMsgs = []; chatSig = ''; }
    calendarEvents = calendarEvents.filter(function(e){ return !gone[e.project]; });
    meetingDocs.forEach(function(d){ if (gone[d.project]) d.project = null; });
    projPageIndex = 0;
    pmSelected = {}; pmConfirm = false; pmBusy = false;
    renderProjRow();            // 캘린더/회의록/채팅/워크스페이스 선택 박스까지 함께 다시 그림
    renderProjManage();
    if (document.querySelector('.view.active[data-view="workspace"]')) enterWorkspaceView();
    if (done.length) pushToast('🗑️', done.length + '개 프로젝트를 삭제했어요', done.slice(0, 3).map(function(p){ return '"' + p.title + '"'; }).join(', ') + (done.length > 3 ? ' 외 ' + (done.length - 3) + '개' : ''));
    if (failed.length) pushToast('⚠️', '일부를 삭제하지 못했어요', failed.join(', '));
    if (!myProjects.length) closeProjManage();
  });
}
function renderCalSettings(){
  var list = document.getElementById('calSettingsList');
  list.innerHTML = '';
  if(!myProjects.length){
    list.innerHTML = "<p class='cal-set-empty'>참여 중인 프로젝트가 없어요. 홈에서 새 프로젝트를 만들어보세요.</p>";
    return;
  }
  myProjects.forEach(function(p){
    var row = document.createElement('div');
    row.className = 'cal-set-row';
    var dot = document.createElement('button');
    dot.type = 'button'; dot.className = 'pdot'; dot.title = '색상 변경';
    dot.style.background = calProjColor(p);
    dot.onclick = function(){
      var i = CAL_PALETTE.indexOf(calProjColor(p));
      calProjectColors[p.id] = CAL_PALETTE[(i+1) % CAL_PALETTE.length];
      saveCalSettings(); renderCalSettings(); syncCalProjects();
    };
    var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.title;
    var hint = document.createElement('span'); hint.className = 'hint';
    hint.textContent = (calProjectMembers[p.id] ? calProjectMembers[p.id].length : (p.avatars||[]).length)+'명';
    var sw = document.createElement('div');
    sw.className = 'switch' + (calHiddenProjects[p.id] ? '' : ' on');
    sw.onclick = function(){
      if(calHiddenProjects[p.id]) delete calHiddenProjects[p.id]; else calHiddenProjects[p.id] = true;
      saveCalSettings(); renderCalSettings(); syncCalProjects();
    };
    row.appendChild(dot); row.appendChild(nm); row.appendChild(hint); row.appendChild(sw);
    list.appendChild(row);
  });
}
var KIND_CLS = {manual:'manual', shared:'shared', private:'private', ai:'ai'};
function fmtDay(ds){
  var p = ds.split('-');
  var d = new Date(+p[0], +p[1]-1, +p[2]);
  return (+p[1])+'/'+(+p[2])+' ('+'일월화수목금토'.charAt(d.getDay())+')';
}
function fmtRange(ev){
  var out = fmtDay(ev.start);
  if(ev.end!==ev.start) out += ' ~ '+fmtDay(ev.end);
  if(ev.startTime) out += ' '+ev.startTime+(ev.endTime ? '~'+ev.endTime : '');
  return out;
}
function evTitle(ev){
  var t = ev.title;
  if(ev.cls==='ai' && t.indexOf('🤖')!==0) t = '🤖 '+t;
  if(ev.cls==='private' && t.indexOf('🔒')<0) t += ' 🔒';
  return t;
}
function evInMonth(ev){
  var first = calYm()+'-01', last = calYm()+'-31';
  return ev.start<=last && ev.end>=first;
}
function serverEventToLocal(e){
  return {id:'e'+e.id, serverId:e.id, start:e.start_date, end:e.end_date, startTime:e.start_time, endTime:e.end_time,
    title:e.title, cls:KIND_CLS[e.kind]||'manual', member:e.user_id ? 'u'+e.user_id : 'me', project:'p'+e.project_id, source:e.source, docServerId:e.meeting_doc_id || null};
}
function buildEvtChip(ev, ds){
  var span = document.createElement('span');
  var isCont = ds!==ev.start;
  span.className = 'cal-evt ' + ev.cls + (isCont ? ' cont' : '');
  span.onclick = function(e){ e.stopPropagation(); openDayDetail(ds); };
  var proj = calProjectById(ev.project);
  if(calSelected==='all' && proj){
    span.style.boxShadow = 'inset 3px 0 0 '+calProjColor(proj);
  }
  span.title = (proj ? proj.title+' · ' : '')+evTitle(ev)+' · '+fmtRange(ev);
  if(ev.member){
    var dot = document.createElement('span');
    dot.className = 'mdot';
    dot.style.background = memberColor(ev.member);
    span.appendChild(dot);
  }
  span.append((isCont ? '↳ ' : (ev.startTime ? ev.startTime+' ' : ''))+evTitle(ev));
  return span;
}
function renderCalendarEvents(){
  var vis = calendarEvents.filter(isEventVisible);
  document.querySelectorAll('.cal-cell:not(.empty)').forEach(function(cell){
    var ds = cell.dataset.date;
    if(!ds) return;
    cell.querySelectorAll('.cal-evt, .cal-more-btn').forEach(function(n){ n.remove(); });
    var list = vis.filter(function(ev){ return ev.start<=ds && ds<=ev.end; }).sort(function(a, b){
      var ka = (a.start!==a.end ? '0' : '1')+(a.startTime||'99:99')+a.title;
      var kb = (b.start!==b.end ? '0' : '1')+(b.startTime||'99:99')+b.title;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    list.slice(0, CAL_CAP).forEach(function(ev){ cell.appendChild(buildEvtChip(ev, ds)); });
    if(list.length > CAL_CAP){
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'cal-more-btn';
      more.textContent = '+'+(list.length-CAL_CAP)+'개';
      more.onclick = function(e){ e.stopPropagation(); openDayDetail(ds); };
      cell.appendChild(more);
    }
  });
}
/* 일정 추가: 실제 로그인이면 서버에 저장하고, 데모 모드면 메모리에만 둔다. Promise<event> 반환 */
function addCalendarEvent(opts){
  var base = {
    title:opts.title, start:opts.start, end:opts.end||opts.start, startTime:opts.startTime||null, endTime:opts.endTime||null,
    kind:opts.kind||'manual', project:opts.project||calDefaultProject(), source:opts.source||null
  };
  if(calApiMode){
    var pid = parseInt(String(base.project).replace(/^p/, ''), 10);
    return apiFetch('/api/calendar/events', {method:'POST', body:JSON.stringify({
      project_id:pid, title:base.title, start_date:base.start, end_date:base.end,
      start_time:base.startTime, end_time:base.startTime ? base.endTime : null, kind:base.kind, source:base.source,
      meeting_doc_id:opts.meetingDocId || null
    })}).then(function(row){
      var ev = serverEventToLocal(row);
      calendarEvents.push(ev);
      renderCalendarEvents(); renderCalSelector();
      return ev;
    });
  }
  var ev2 = {id:'ce'+Date.now()+Math.random().toString(36).slice(2,5), start:base.start, end:base.end, startTime:base.startTime, endTime:base.endTime,
    title:base.title, cls:KIND_CLS[base.kind]||'manual', member:opts.member||'me', project:base.project, source:base.source};
  calendarEvents.push(ev2);
  renderCalendarEvents(); renderCalSelector();
  return Promise.resolve(ev2);
}
function removeCalendarEvent(id){
  var ev = calendarEvents.filter(function(e){ return e.id===id; })[0];
  if(!ev) return;
  function done(){
    calendarEvents = calendarEvents.filter(function(e){ return e.id!==id; });
    var wasAdded = calDetect.filter(function(c){ return c.status==='added'; }).length;
    syncCandidateStatus();
    var restored = wasAdded - calDetect.filter(function(c){ return c.status==='added'; }).length;
    renderCalendarEvents(); renderCalSelector(); renderDayDetailList(); renderDetectCard();
    pushToast('🗑️','일정 삭제됨', restored>0 ? '캘린더에서 삭제했어요 · "감지된 일정"에 다시 표시돼요' : '캘린더에서 일정을 삭제했어요');
  }
  if(calApiMode && ev.serverId){
    apiFetch('/api/calendar/events/'+ev.serverId, {method:'DELETE'}).then(done).catch(function(e){ pushToast('⚠️','삭제하지 못했어요', e.message); });
  } else { done(); }
}

/* ---- calendar: day detail (2개 초과 시 +N 눌러서 전체 보기 + 삭제) ---- */
var currentDetailDate = null;
function openDayDetail(ds){
  currentDetailDate = ds;
  document.getElementById('dayDetailTitle').textContent = fmtDay(ds).replace('/', '월 ').replace(' (', '일 (')+' 일정';
  renderDayDetailList();
  document.getElementById('dayDetailModal').classList.add('open');
}
function renderDayDetailList(){
  var wrap = document.getElementById('dayDetailList');
  wrap.innerHTML = '';
  var list = calendarEvents.filter(function(ev){ return ev.start<=currentDetailDate && currentDetailDate<=ev.end && isEventVisible(ev); });
  if(list.length===0){
    wrap.innerHTML = "<p style='color:var(--text-faint); font-size:12.5px;'>표시할 일정이 없어요.</p>";
    return;
  }
  list.forEach(function(ev){
    var row = document.createElement('div');
    row.className = 'day-detail-item';
    if(ev.member){
      var dot = document.createElement('span');
      dot.className = 'ddi-dot';
      dot.style.background = memberColor(ev.member);
      row.appendChild(dot);
    }
    var t = document.createElement('span');
    t.className = 'ddi-title';
    t.textContent = evTitle(ev);
    row.appendChild(t);
    var when = document.createElement('span');
    when.className = 'ddi-proj';
    when.style.maxWidth = '160px';
    when.textContent = (ev.start!==ev.end || ev.startTime) ? fmtRange(ev) : '';
    if(when.textContent) row.appendChild(when);
    var pj = calProjectById(ev.project);
    if(pj && calSelected==='all'){
      var tag = document.createElement('span');
      tag.className = 'ddi-proj';
      tag.textContent = pj.title;
      row.appendChild(tag);
    }
    var del = document.createElement('button');
    del.className = 'ddi-del';
    del.innerHTML = "<svg viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='currentColor' stroke-width='2'><path d='M6 6l12 12M18 6 6 18'/></svg>";
    del.onclick = function(){ removeCalendarEvent(ev.id); };
    row.appendChild(del);
    wrap.appendChild(row);
  });
}
function closeDayDetail(){ var el = document.getElementById('dayDetailModal'); if(el) el.classList.remove('open'); }

/* ---- calendar: member filter, add-event modal, AI detect ---- */
function toggleMemberFilter(btn){
  var m = btn.dataset.member;
  if(calHiddenMembers[m]) delete calHiddenMembers[m]; else calHiddenMembers[m] = true;
  btn.classList.toggle('active', !calHiddenMembers[m]);
  renderCalendarEvents();
}
function openAddEvent(){
  var enabled = calEnabledProjects();
  if(!enabled.length){
    if(calApiMode && !myProjects.length){ ensureProjectId().then(function(){ openAddEvent(); }).catch(function(e){ pushToast('⚠️','프로젝트를 만들지 못했어요', e.message); }); return; }
    pushToast('📅','프로젝트가 없어요','캘린더 설정에서 프로젝트 캘린더를 켜주세요'); return;
  }
  var sel = document.getElementById('newEvtProject');
  sel.innerHTML = '';
  var def = calDefaultProject();
  enabled.forEach(function(p){
    var o = document.createElement('option');
    o.value = p.id; o.textContent = p.title;
    if(p.id===def) o.selected = true;
    sel.appendChild(o);
  });
  var dv = (calYear===CAL_TODAY.y && calMonth===CAL_TODAY.m) ? CAL_TODAY.d : 1;
  var ds = calYear+'-'+pad2(calMonth)+'-'+pad2(dv);
  document.getElementById('newEvtDate').value = ds;
  document.getElementById('newEvtEndDate').value = ds;
  document.getElementById('newEvtStartTime').value = '';
  document.getElementById('newEvtEndTime').value = '';
  document.getElementById('addEventModal').classList.add('open');
}
function closeAddEvent(){ document.getElementById('addEventModal').classList.remove('open'); }
function goToMonthOf(ds){
  var p = ds.split('-');
  if(+p[0]!==calYear || +p[1]!==calMonth) setCalMonth(+p[0], +p[1]);
}
function submitNewEvent(){
  var titleInput = document.getElementById('newEvtTitle');
  var title = titleInput.value.trim();
  if(!title) return;
  var start = document.getElementById('newEvtDate').value;
  var end = document.getElementById('newEvtEndDate').value || start;
  if(!start){ pushToast('📅','날짜를 선택해주세요',''); return; }
  if(end < start){ pushToast('📅','종료일을 확인해주세요','종료일이 시작일보다 빠를 수 없어요'); return; }
  var st = document.getElementById('newEvtStartTime').value || null;
  var et = st ? (document.getElementById('newEvtEndTime').value || null) : null;
  var shared = document.getElementById('newEvtShareSwitch').classList.contains('on');
  addCalendarEvent({
    title:title, start:start, end:end, startTime:st, endTime:et, kind: shared ? 'shared' : 'private',
    project:document.getElementById('newEvtProject').value, member:'me'
  }).then(function(){
    titleInput.value = '';
    closeAddEvent();
    goToMonthOf(start);
    pushToast(shared?'📤':'🔒', shared?'팀에 공유됨':'개인 일정 추가됨', title+' 일정이 '+(shared?'캘린더에 추가되고 팀원에게 공유됐어요':'나에게만 추가됐어요'));
  }).catch(function(e){ pushToast('⚠️','일정을 추가하지 못했어요', e.message); });
}

/* ---- calendar: 회의록 AI 분석 → 일정 후보 ---- */
var calDetect = [];
var calDetectEngine = null, calDetectNote = null, calDetectBusy = 0;
var detectCache = {};   // docId -> 분석한 회의록 원문 (같은 내용은 다시 호출하지 않음)
function docIso(d){ return String(d).replace(/\./g, '-'); }
function candKey(docId, e){ return docId+'|'+e.title+'|'+e.start_date+'|'+(e.start_time||''); }
/* 후보 상태는 캘린더에 실제로 있는지로 결정: 캘린더에서 일정을 지우면 다시 '추가 가능'으로 돌아온다 */
function syncCandidateStatus(){
  calDetect.forEach(function(c){
    if(c.status==='dismissed') return;
    c.status = calendarEvents.some(function(ev){ return ev.title===c.title && ev.start===c.start; }) ? 'added' : 'new';
  });
}
function saveDocDetections(doc){
  if(!calApiMode || !doc || !doc.serverId) return;
  var list = calDetect.filter(function(c){ return c.docId===doc.id; }).map(function(c){
    return {title:c.title, start_date:c.start, end_date:c.end, start_time:c.startTime, end_time:c.endTime, source:c.source || '', dismissed:c.status==='dismissed'};
  });
  apiFetch('/api/meetings/'+doc.serverId, {method:'PATCH', body:JSON.stringify({detections:list})}).catch(function(){});
}
function restoreDetections(){
  calDetect = [];
  meetingDocs.forEach(function(doc){
    (doc.detections || []).forEach(function(e){
      calDetect.push({key:candKey(doc.id, e), docId:doc.id, docTitle:doc.title, title:e.title, start:e.start_date, end:e.end_date,
        startTime:e.start_time, endTime:e.end_time, source:e.source, project:doc.project || null, status: e.dismissed ? 'dismissed' : 'new'});
    });
  });
  syncCandidateStatus();
  renderDetectCard();
}
function analyzeDoc(doc){
  calDetectBusy++; renderDetectCard();
  return apiFetch('/api/calendar/detect', {method:'POST', body:JSON.stringify({text:doc.raw, title:doc.title, reference_date:docIso(doc.date)})})
    .then(function(res){
      detectCache[doc.id] = doc.raw;
      var before = {}, dismissed = {};
      calDetect.filter(function(c){ return c.docId===doc.id; }).forEach(function(c){ before[c.key] = true; if(c.status==='dismissed') dismissed[c.key] = true; });
      calDetect = calDetect.filter(function(c){ return c.docId!==doc.id; });
      res.events.forEach(function(e){
        var key = candKey(doc.id, e);
        calDetect.push({key:key, docId:doc.id, docTitle:doc.title, title:e.title, start:e.start_date, end:e.end_date,
          startTime:e.start_time, endTime:e.end_time, source:e.source, project:doc.project || null, status: dismissed[key] ? 'dismissed' : 'new'});
      });
      syncCandidateStatus();
      calDetectEngine = res.engine; calDetectNote = res.note;
      saveDocDetections(doc);
      // 이전 분석에 없던 새 일정만 '방금 찾은 일정'으로 취급 (자동 반영 대상)
      return calDetect.filter(function(c){ return c.docId===doc.id && c.status==='new' && !before[c.key]; });
    })
    .catch(function(e){ calDetectNote = '분석에 실패했어요: '+e.message; pushToast('⚠️','회의록 분석에 실패했어요', e.message); return []; })
    .then(function(list){ calDetectBusy--; renderDetectCard(); return list; });
}
/* 일정이 들어갈 프로젝트가 없으면 "내 일정" 프로젝트를 자동으로 만든다 */
function ensureProjectId(){
  var def = calDefaultProject();
  if(def) return Promise.resolve(def);
  if(myProjects.length) return Promise.resolve(myProjects[0].id);
  if(!calApiMode) return Promise.resolve(null);
  return apiFetch('/api/projects', {method:'POST', body:JSON.stringify({title:'내 일정'})}).then(function(row){
    var pr = projFromServer(row);
    myProjects.unshift(pr);
    renderProjRow();
    pushToast('📁','기본 프로젝트를 만들었어요','"내 일정" 프로젝트 캘린더에 일정이 들어가요');
    return pr.id;
  });
}
function rangeBrief(c){ return c.title+' ('+fmtRange(c)+')'; }
/* 후보를 순서대로 캘린더에 추가 (AI 가 찾은 시작~종료 그대로) */
function addCandidates(list, opts){
  opts = opts || {};
  list = list.filter(function(c){ return c.status==='new'; });
  if(!list.length) return Promise.resolve([]);
  return ensureProjectId().then(function(pid){
    if(!pid){ pushToast('📅','프로젝트가 없어요','프로젝트를 만든 뒤 일정을 추가할 수 있어요'); return []; }
    var done = [];
    return list.reduce(function(chain, c){
      return chain.then(function(){
        var srcDoc = meetingDocs.filter(function(d){ return d.id===c.docId; })[0];
        return addCalendarEvent({title:c.title, start:c.start, end:c.end, startTime:c.startTime, endTime:c.endTime,
          kind:'ai', project:c.project || pid, source:c.source, member:c.member||'me', meetingDocId:srcDoc ? srcDoc.serverId : null
        }).then(function(){ c.status = 'added'; done.push(c); });
      }).catch(function(e){ pushToast('⚠️','일정을 추가하지 못했어요', e.message); });
    }, Promise.resolve()).then(function(){
      renderDetectCard();
      if(done.length){
        goToMonthOf(done[0].start);
        var pj = calProjectById(done[0].project || '');
        var brief = done.slice(0,3).map(rangeBrief).join(' · ') + (done.length>3 ? ' 외 '+(done.length-3)+'개' : '') + (pj ? ' → '+pj.title+' 캘린더' : '');
        pushToast(opts.auto ? '🤖' : '✅', opts.auto ? '회의록 일정을 캘린더에 자동 반영했어요' : '캘린더에 추가됨', brief);
      }
      return done;
    });
  });
}
function refreshDetections(notify, autoApply){
  if(!calApiMode){ renderDetectCard(); return Promise.resolve(); }
  var jobs = meetingDocs.filter(function(doc){ return doc.raw && detectCache[doc.id]!==doc.raw; });
  if(!jobs.length){ renderDetectCard(); return Promise.resolve(); }
  return Promise.all(jobs.map(analyzeDoc)).then(function(lists){
    var fresh = [].concat.apply([], lists);
    if(!fresh.length){
      if(notify) pushToast('🤖','일정으로 볼 내용이 없어요','회의록에 "9월 20일부터 22일까지"처럼 날짜나 기간을 적으면 캘린더에 반영돼요');
      return;
    }
    if(autoApply) return addCandidates(fresh, {auto:true});
    if(notify) pushToast('🤖','일정 후보를 찾았어요', '일정 '+fresh.length+'개를 감지했어요 · 캘린더 탭에서 추가할 수 있어요');
  });
}
/* 회의록 화면의 버튼: 이 회의록을 지금 분석해서 캘린더에 바로 넣는다 */
function applyDocToCalendar(docId){
  var doc = meetingDocs.filter(function(d){ return d.id===docId; })[0];
  if(!doc) return;
  if(!calApiMode){ pushToast('🔒','로그인이 필요해요','로그인하면 AI가 회의록을 분석해서 캘린더에 넣어줘요'); return; }
  if(!doc.raw || !doc.raw.trim()){ pushToast('📝','내용이 비어 있어요','회의록 내용을 적은 뒤 다시 눌러주세요'); return; }
  pushToast('🤖','회의록을 분석하는 중이에요', doc.title);
  // 직접 누른 "캘린더에 반영"은 이전에 무시했거나 지운 일정도 다시 후보로 올려서 추가한다
  syncCandidateStatus();
  calDetect = calDetect.filter(function(c){ return c.docId!==doc.id || c.status==='added'; });
  analyzeDoc(doc).then(function(fresh){
    if(!fresh.length){
      var already = calDetect.some(function(c){ return c.docId===doc.id && c.status==='added'; });
      pushToast(already ? '✅' : '🤖', already ? '이미 캘린더에 반영돼 있어요' : '일정으로 볼 내용이 없어요',
        already ? '이 회의록의 일정은 모두 캘린더에 들어 있어요' : '날짜나 기간(예: 9월 20일부터 22일까지)을 적어주세요');
      return;
    }
    return addCandidates(fresh, {auto:false}).then(function(done){ if(done.length) goView('calendar'); });
  });
}
function renderDetectCard(){
  var box = document.getElementById('detectList');
  var noteEl = document.getElementById('detectNote');
  if(!box) return;
  box.innerHTML = '';
  if(noteEl){
    noteEl.textContent = !calApiMode ? '' : ((calDetectEngine==='gemini' || calDetectEngine==='claude') ? '🤖 '+(calDetectEngine==='gemini' ? 'Gemini' : 'Claude')+'가 회의록을 분석했어요' : (calDetectNote || ''));
  }
  var ids = calVisibleProjectIds();
  var shown = calDetect.filter(function(c){ return c.status!=='dismissed' && (!c.project || ids.indexOf(c.project)>=0); });
  if(calDetectBusy){
    var busy = document.createElement('div'); busy.className = 'detect-busy'; busy.textContent = '회의록을 분석하는 중이에요…';
    box.appendChild(busy);
  }
  if(!shown.length){
    if(!calDetectBusy){
      var empty = document.createElement('p'); empty.className = 'detect-empty';
      empty.textContent = !calApiMode ? '로그인하면 회의록을 AI가 분석해서 일정을 찾아줘요.' : (!meetingDocs.length ? '회의록을 작성하면 AI가 일정을 찾아줘요.' : '감지된 일정이 없어요.');
      box.appendChild(empty);
    }
    return;
  }
  var targetId = calDefaultProject();
  var pending = shown.filter(function(c){ return c.status==='new'; });
  if(pending.length>1){
    var all = document.createElement('button');
    all.className = 'btn primary'; all.style.alignSelf = 'flex-start'; all.style.padding = '6px 12px'; all.style.fontSize = '12px';
    all.textContent = '모두 추가 ('+pending.length+')';
    all.onclick = function(){ addCandidates(pending, {auto:false}); };
    box.appendChild(all);
  }
  shown.forEach(function(c){
    var item = document.createElement('div');
    item.className = 'detect-item' + (c.status==='added' ? ' added' : '');
    var head = document.createElement('div');
    var b = document.createElement('b'); b.style.fontSize = '12.5px'; b.textContent = c.title; head.appendChild(b);
    item.appendChild(head);
    var when = document.createElement('span'); when.className = 'when'; when.textContent = '📅 '+fmtRange(c);
    item.appendChild(when);
    var src = document.createElement('span'); src.className = 'src';
    src.textContent = c.docTitle+(c.source ? ' · "'+c.source+'"' : '');
    item.appendChild(src);
    var tgt = calProjectById(c.project || targetId);
    if(tgt && c.status!=='added' && myProjects.length>1){
      var pl = document.createElement('span'); pl.className = 'proj-line'; pl.textContent = '→ '+tgt.title+' 캘린더에 추가돼요';
      item.appendChild(pl);
    }
    var actions = document.createElement('div'); actions.className = 'detect-actions';
    var add = document.createElement('button');
    add.textContent = c.status==='added' ? '✓ 추가됨' : '캘린더에 추가';
    add.disabled = c.status==='added';
    add.onclick = function(){ addDetected(c.key); };
    actions.appendChild(add);
    if(c.status!=='added'){
      var no = document.createElement('button'); no.className = 'detect-dismiss'; no.textContent = '무시';
      no.style.background = 'none'; no.style.color = 'var(--text-faint)'; no.style.padding = '0';
      no.onclick = function(){ c.status = 'dismissed'; renderDetectCard(); saveDocDetections(meetingDocs.filter(function(d){ return d.id===c.docId; })[0]); };
      actions.appendChild(no);
    }
    item.appendChild(actions);
    box.appendChild(item);
  });
}
function addDetected(key){
  var c = calDetect.filter(function(x){ return x.key===key; })[0];
  if(!c || c.status!=='new') return;
  addCandidates([c], {auto:false});
}
calReady = true;
buildCalGrid();
updateCalMonthLabel();
syncCalProjects();

