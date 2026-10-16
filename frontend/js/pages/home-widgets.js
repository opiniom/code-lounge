/* ---- home widgets ---- */
var WG_CATALOG = [
  {id:'projects', ic:'🗂️', name:'워크스페이스', desc:'최근 작업한 프로젝트로 바로 이동해요', size:'넓게', c:'#3B82F6'},
  {id:'today', ic:'📅', name:'오늘의 일정', desc:'캘린더의 오늘 일정을 자동으로 보여줘요', size:'보통', c:'#8B5CF6'},
  {id:'events', ic:'🏆', name:'마감 임박 공모전', desc:'자동으로 모은 공모전을 마감 순으로', size:'보통', c:'#F59E0B'},
  {id:'community', ic:'👥', name:'커뮤니티 인기글', desc:'지금 뜨는 질문과 팀원 모집 소식', size:'보통', c:'#EC4899'},
  {id:'notes', ic:'📝', name:'최근 회의록', desc:'최근 정리된 회의록을 한눈에', size:'보통', c:'#22D3EE'},
];
function wgShown(id){ var c = document.querySelector('.dyn-widget[data-widget="'+id+'"]'); return !!c && !c.hidden; }
function wgPreview(id){
  var row = function(t, a, b){ return '<div class="wgp-row"><span class="wgp-t">'+t+'</span><i style="background:'+a+'"></i><span class="wgp-l" style="width:'+b+'%"></span></div>'; };
  if(id==='projects') return '<div class="wgp-title">🗂️ 워크스페이스</div><div class="wgp-cards">'+[['PY','#06B6D4'],['AI','#3B82F6'],['JS','#B24E9E']].map(function(x){ return '<div class="wgp-card"><b style="background:'+x[1]+'">'+x[0]+'</b><span class="wgp-l" style="width:80%"></span><span class="wgp-l s" style="width:50%"></span></div>'; }).join('')+'</div>';
  if(id==='today') return '<div class="wgp-title">📅 오늘의 일정</div>'+row('14:00','#3B82F6',70)+row('16:30','#8B5CF6',52)+row('21:00','#22D3EE',62);
  if(id==='events') return '<div class="wgp-title">🏆 마감 임박 공모전</div>'+row('D-1','#EF4444',74)+row('D-3','#F59E0B',58)+row('D-7','#3B82F6',66);
  if(id==='community') return '<div class="wgp-title">👥 커뮤니티 인기글</div>'+row('질문','#3B82F6',72)+row('모집','#8B5CF6',60)+row('자랑','#EC4899',68);
  if(id==='notes') return '<div class="wgp-title">📝 최근 회의록</div>'+row('9/11','#22D3EE',76)+row('9/09','#8B5CF6',54);
  return '';
}
function wgRender(){
  var q = ((document.getElementById('wgSearch') || {}).value || '').trim().toLowerCase();
  var list = WG_CATALOG.filter(function(w){ return !q || (w.name + ' ' + w.desc).toLowerCase().indexOf(q) >= 0; });
  var l = document.getElementById('wgList'), g = document.getElementById('wgGrid'); if(!l || !g) return;
  l.innerHTML = ''; g.innerHTML = '';
  list.forEach(function(w){
    var on = wgShown(w.id);
    var li = document.createElement('button'); li.type = 'button'; li.className = 'wg-li'; li.dataset.id = w.id;
    li.innerHTML = '<span class="wg-lic" style="--wc:'+w.c+'">'+w.ic+'</span><span class="wg-ltx"><b></b><small></small></span><span class="wg-lck">'+(on ? '✓' : '')+'</span>';
    li.querySelector('b').textContent = w.name; li.querySelector('small').textContent = w.size;
    li.onclick = function(){ var t = document.getElementById('wgCard-'+w.id); if(t){ t.scrollIntoView({behavior:'smooth', block:'nearest'}); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); } };
    l.appendChild(li);
    var card = document.createElement('div'); card.className = 'wg-card' + (w.size === '넓게' ? ' wide' : ''); card.id = 'wgCard-'+w.id;
    card.innerHTML = '<div class="wg-prev" style="--wc:'+w.c+'"><div class="wgp">'+wgPreview(w.id)+'</div><button type="button" class="wg-badge'+(on ? ' on' : '')+'" aria-label=""></button></div><div class="wg-cap"><b></b><small></small></div>';
    card.querySelector('.wg-cap b').textContent = w.name; card.querySelector('.wg-cap small').textContent = w.desc;
    var bd = card.querySelector('.wg-badge'); bd.setAttribute('aria-label', (on ? '제거: ' : '추가: ') + w.name); bd.innerHTML = on ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    bd.onclick = function(){ setWidget(w.id, !wgShown(w.id)); wgRender(); if(wgShown(w.id)) pushToast('✅', w.name + ' 위젯을 추가했어요', '홈 화면에서 확인해 보세요.'); };
    g.appendChild(card);
  });
  if(!list.length) g.innerHTML = '<div class="wg-empty">검색 결과가 없어요</div>';
  var n = WG_CATALOG.filter(function(w){ return wgShown(w.id); }).length;
  var c = document.getElementById('wgCount'); if(c) c.textContent = '홈에 ' + n + '개 표시 중 · + 를 눌러 추가하세요';
}
function wgOpen(){ wgToggleEdit(false); var m = document.getElementById('wgModal'); if(!m) return; var s = document.getElementById('wgSearch'); if(s) s.value = ''; wgRender(); m.classList.add('open'); }
function wgClose(){ var m = document.getElementById('wgModal'); if(m) m.classList.remove('open'); }
document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ var m = document.getElementById('wgModal'); if(m && m.classList.contains('open')) wgClose(); else if(document.getElementById('widgetGrid') && document.getElementById('widgetGrid').classList.contains('editing')) wgToggleEdit(false); } });
function setWidget(id, show){
  var card = document.querySelector('.dyn-widget[data-widget="'+id+'"]');
  if(card){
    var was = card.hidden; card.hidden = !show;
    if(show && was){ card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
  }
  saveWidgetPrefs();
  if(show) wgRefreshLive();
  var m = document.getElementById('wgModal'); if(m && m.classList.contains('open')) wgRender();
}
function removeWidget(id){ setWidget(id, false); }
function saveWidgetPrefs(){
  try{
    var all = Array.from(document.querySelectorAll('.dyn-widget'));
    localStorage.setItem('root_home_widgets', JSON.stringify(all.filter(function(w){ return !w.hidden; }).map(function(w){ return w.dataset.widget; })));
    localStorage.setItem('root_home_widget_order', JSON.stringify(all.map(function(w){ return w.dataset.widget; })));
  }catch(e){}
}
function loadWidgetPrefs(){
  try{
    var order = JSON.parse(localStorage.getItem('root_home_widget_order') || 'null');
    var grid = document.getElementById('widgetGrid');
    if(order && grid) order.forEach(function(id){ var c = grid.querySelector('.dyn-widget[data-widget="'+id+'"]'); if(c) grid.appendChild(c); });
    var raw = localStorage.getItem('root_home_widgets');
    if(!raw) return;
    var ids = JSON.parse(raw);
    document.querySelectorAll('.dyn-widget').forEach(function(w){ w.hidden = ids.indexOf(w.dataset.widget) < 0; });
  }catch(e){}
}
/* 편집 모드: 흔들리는 카드 + 빼기(−) 배지 + 끌어서 순서 바꾸기 */
function wgToggleEdit(force){
  var grid = document.getElementById('widgetGrid'); if(!grid) return;
  var on = (typeof force === 'boolean') ? force : !grid.classList.contains('editing');
  grid.classList.toggle('editing', on);
  var b = document.getElementById('wgEditBtn'); if(b){ b.textContent = on ? '완료' : '편집'; b.classList.toggle('active', on); }
  grid.querySelectorAll('.dyn-widget').forEach(function(c){ c.draggable = on; });
}
(function(){
  var grid = document.getElementById('widgetGrid'); if(!grid) return;
  var dragging = null;
  grid.addEventListener('dragstart', function(e){ var c = e.target.closest && e.target.closest('.dyn-widget'); if(!c || !grid.classList.contains('editing')) { e.preventDefault(); return; } dragging = c; c.classList.add('dragging'); try{ e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.dataset.widget); }catch(x){} });
  grid.addEventListener('dragover', function(e){
    if(!dragging) return; e.preventDefault();
    var over = e.target.closest('.dyn-widget'); if(!over || over === dragging || over.hidden) return;
    var r = over.getBoundingClientRect(), after = (e.clientY - r.top) > r.height / 2 && (e.clientX - r.left) > r.width / 2 || (e.clientY - r.top) > r.height * .75;
    grid.insertBefore(dragging, after ? over.nextSibling : over);
  });
  grid.addEventListener('dragend', function(){ if(dragging) dragging.classList.remove('dragging'); dragging = null; saveWidgetPrefs(); });
})();

/* ---- 살아 있는 위젯: 진짜 데이터로 채운다 ---- */
var wgLiveCache = {events:{at:0, data:null}, community:{at:0, data:null}};
function wgEl(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
function wgEmpty(box, msg, btnText, onclick){
  box.innerHTML = ''; box.appendChild(wgEl('div', 'wl-empty', msg));
  if(btnText){ var b = wgEl('button', 'wl-link', btnText); b.onclick = onclick; box.appendChild(b); }
}
function wgRow(left, dotColor, text, onclick){
  var r = wgEl('div', 'wl-row'); if(onclick){ r.classList.add('click'); r.onclick = onclick; }
  r.appendChild(wgEl('span', 'wl-t', left));
  var d = wgEl('span', 'wl-dot'); if(dotColor) d.style.background = dotColor; r.appendChild(d);
  r.appendChild(wgEl('span', 'wl-x', text)); return r;
}
function wgLiveToday(){
  var box = document.getElementById('wlToday'); if(!box || !wgShown('today')) return;
  var now = new Date(), y = calApiMode ? now.getFullYear() : CAL_TODAY.y, m = calApiMode ? now.getMonth() + 1 : CAL_TODAY.m, d = calApiMode ? now.getDate() : CAL_TODAY.d;
  var ds = y + '-' + pad2(m) + '-' + pad2(d), dow = '일월화수목금토'.charAt(new Date(y, m - 1, d).getDay());
  document.getElementById('wlTodayTitle').textContent = '📅 오늘의 일정 · ' + m + '월 ' + d + '일 (' + dow + ')';
  var evs = calendarEvents.filter(function(e){ return e.start <= ds && (e.end || e.start) >= ds; })
    .sort(function(a, b){ return (a.startTime || '') < (b.startTime || '') ? -1 : 1; });
  if(!evs.length){ wgEmpty(box, '오늘은 일정이 없어요', '캘린더 열기 →', function(){ goView('calendar'); }); return; }
  box.innerHTML = '';
  evs.slice(0, 4).forEach(function(e){
    var proj = calProjectById(e.project);
    box.appendChild(wgRow(e.startTime ? e.startTime.slice(0, 5) : '종일', proj ? calProjColor(proj) : 'var(--accent)', evTitle(e), function(){ goView('calendar'); }));
  });
  if(evs.length > 4) box.appendChild(wgEl('div', 'wl-more', '외 ' + (evs.length - 4) + '개'));
}
async function wgLiveEvents(){
  var box = document.getElementById('wlEvents'); if(!box || !wgShown('events')) return;
  var c = wgLiveCache.events;
  try {
    if(!c.data || Date.now() - c.at > 60000){ var r = await fetch(API_BASE + '/api/events?sort=deadline'); if(!r.ok) throw new Error(); c.data = await r.json(); c.at = Date.now(); }
  } catch(e){ if(!c.data){ wgEmpty(box, '공모전 정보를 불러오지 못했어요', '이벤트 열기 →', function(){ goView('events'); }); return; } }
  var items = (c.data || []).filter(function(x){ return x.deadline_date; }).slice(0, 3);
  if(!items.length){ wgEmpty(box, '아직 수집된 공모전이 없어요', '이벤트 열기 →', function(){ goView('events'); }); return; }
  box.innerHTML = '';
  items.forEach(function(x){
    var urgent = /^D-?[0-3]$|D-Day/i.test(x.d_day || '');
    box.appendChild(wgRow(x.d_day || '', urgent ? '#EF4444' : 'var(--accent)', x.title, function(){ goView('events'); }));
  });
  var more = wgEl('button', 'wl-link', '이벤트 더보기 →'); more.onclick = function(){ goView('events'); }; box.appendChild(more);
}
async function wgLiveCommunity(){
  var box = document.getElementById('wlCommunity'); if(!box || !wgShown('community')) return;
  var c = wgLiveCache.community;
  try {
    if(!c.data || Date.now() - c.at > 60000){ var r = await fetch(API_BASE + '/api/community/posts?sort=hot&limit=3'); if(!r.ok) throw new Error(); c.data = (await r.json()).items || []; c.at = Date.now(); }
  } catch(e){ if(!c.data){ wgEmpty(box, '커뮤니티 소식을 불러오지 못했어요', '커뮤니티 열기 →', function(){ goView('community'); }); return; } }
  var items = (c.data || []).slice(0, 3);
  if(!items.length){ wgEmpty(box, '아직 글이 없어요', '첫 글 쓰러 가기 →', function(){ goView('community'); }); return; }
  box.innerHTML = '';
  items.forEach(function(p){
    var cat = (typeof CM_CATS !== 'undefined' && CM_CATS[p.category]) || {label:'글', color:'#64748B'};
    box.appendChild(wgRow(cat.label, cat.color, p.title, function(){ goView('community'); cmOpenPost(p.id); }));
  });
  var more = wgEl('button', 'wl-link', '커뮤니티 열기 →'); more.onclick = function(){ goView('community'); }; box.appendChild(more);
}
function wgLiveNotes(){
  var box = document.getElementById('wlNotes'); if(!box || !wgShown('notes')) return;
  var docs = (meetingDocs || []).slice().sort(function(a, b){ return (b.date || '') < (a.date || '') ? -1 : 1; }).slice(0, 3);
  if(!docs.length){ wgEmpty(box, '아직 회의록이 없어요', '회의록 열기 →', function(){ goView('notes'); }); return; }
  box.innerHTML = '';
  docs.forEach(function(d){
    var md = (d.date || '').split('.').slice(1).map(function(x){ return parseInt(x, 10); }).join('/');
    box.appendChild(wgRow(md, 'var(--accent-2)', d.title + ' · 결정 ' + (d.decisions || []).length + ' · 할 일 ' + (d.actions || []).length, function(){ goView('notes'); }));
  });
}
function wgRefreshLive(){ wgLiveToday(); wgLiveEvents(); wgLiveCommunity(); wgLiveNotes(); renderDureOrbit(); }
loadWidgetPrefs();
setTimeout(wgRefreshLive, 600); setInterval(function(){ if(!document.hidden) wgRefreshLive(); }, 30000);


/* ---- 홈 상단 '두레' 궤도: 내 팀원들이 둘레에 모인다 (이름 첫 글자 + 접속 상태) ---- */
/* 팀원 최대 6명 + AI 1개 = 7자리를 둘레에 고르게 놓는다 (4번째 자리는 AI) */
var DURE_COUNT = 7, DURE_AI_INDEX = 4;
var DURE_ANGLES = []; for(var _i = 0; _i < DURE_COUNT; _i++) DURE_ANGLES.push(Math.round(_i * 360 / DURE_COUNT * 100) / 100);
var DURE_SLOTS = DURE_ANGLES.filter(function(_a, i){ return i !== DURE_AI_INDEX; });
var dureSig = '';
function dureTeammates(){
  var seen = {}, list = [];
  if(!calApiMode || !currentUser) return list;
  list.push({ id:currentUser.id, name:myProfile.name || currentUser.username || '나', me:true });
  seen[currentUser.id] = 1;
  myProjects.forEach(function(p){ (p.members || []).forEach(function(m){
    if(m && m.id != null && !seen[m.id]){ seen[m.id] = 1; list.push({ id:m.id, name:m.username || '팀원', me:false }); }
  }); });
  var rank = { online:0, dnd:1, away:2, offline:3 };
  var others = list.slice(1).sort(function(a, b){ return rank[pstOf(a.id)] - rank[pstOf(b.id)]; });
  return [list[0]].concat(others);
}
function dureNode(angle, color, label, title, extra){
  var d = document.createElement('div'); d.className = 'dn' + (extra && extra.cls ? ' ' + extra.cls : ''); d.style.setProperty('--a', angle + 'deg');
  if(color) d.style.setProperty('--c', color);
  var sp = document.createElement('span'); sp.textContent = label; d.appendChild(sp);
  if(title) d.title = title;
  if(extra && extra.pst) sp.dataset.pst = extra.pst;
  if(extra && extra.click){ d.setAttribute('role', 'button'); d.tabIndex = 0; d.onclick = extra.click; d.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); extra.click(); } }; }
  return d;
}
function dureChip(id, text, onclick){
  var c = document.getElementById(id); if(!c) return;
  if(!text){ c.hidden = true; c.onclick = null; c.classList.remove('click'); return; }
  c.hidden = false; c.textContent = text; c.classList.toggle('click', !!onclick); c.onclick = onclick || null;
}
function renderDureOrbit(){
  var box = document.getElementById('dureOrbit'); if(!box) return;
  if(typeof CAL_TODAY === 'undefined' || !CAL_TODAY || !Array.isArray(calendarEvents)) return;   // 화면 코드가 다 불러와지기 전에는 건너뜀
  var team = dureTeammates();
  var today = CAL_TODAY.y + '-' + pad2(CAL_TODAY.m) + '-' + pad2(CAL_TODAY.d);
  var todayN = calApiMode ? calendarEvents.filter(function(e){ return e.start <= today && (e.end || e.start) >= today; }).length : 0;
  var notesN = calApiMode ? (meetingDocs || []).length : 0;
  var online = team.filter(function(t){ return pstOf(t.id) === 'online' || pstOf(t.id) === 'dnd' || pstOf(t.id) === 'away'; }).length;
  var sig = [team.map(function(t){ return t.id + ':' + pstOf(t.id); }).join(','), calApiMode ? 1 : 0, todayN, notesN].join('|');
  if(sig === dureSig) return; dureSig = sig;
  box.innerHTML = '';
  var invite = function(){ openInviteFromHero(); };
  var visible = team.length > DURE_SLOTS.length ? DURE_SLOTS.length - 1 : team.length;
  DURE_SLOTS.forEach(function(angle, i){
    if(i < visible){
      var t = team[i], st = pstOf(t.id);
      box.appendChild(dureNode(angle, chatColor(t.name), String(t.name).slice(0, 1), t.name + (t.me ? ' (나)' : '') + ' · ' + PST_META[st].label, { pst:st }));
    } else if(i === visible && team.length > DURE_SLOTS.length){
      var rest = team.slice(visible).map(function(t){ return t.name; });
      box.appendChild(dureNode(angle, '#64748B', '+' + rest.length, rest.join(', '), {}));
    } else {
      box.appendChild(dureNode(angle, null, '+', calApiMode ? '팀원 초대' : '로그인하고 팀원 초대', { cls:'dn-plus' + (i === visible ? '' : ' ghost'), click:invite }));
    }
  });
  var ai = dureNode(DURE_ANGLES[DURE_AI_INDEX], null, 'AI', '두레 AI — 채팅에서 "두레야"라고 불러보세요', { cls:'dn-ai' }); box.appendChild(ai);
  // 둘레에 떠 있는 말풍선: 진짜 숫자만 보여준다
  if(!calApiMode) dureChip('dureChip1', '👋 로그인하면 팀원이 여기 모여요', function(){ openLogin(); });
  else if(team.length <= 1) dureChip('dureChip1', '＋ 친구·팀원을 초대해 보세요', invite);
  else dureChip('dureChip1', '🟢 팀원 ' + online + '/' + team.length + '명 접속 중', null);
  dureChip('dureChip2', todayN ? '📅 오늘 일정 ' + todayN + '개' : '', function(){ goView('calendar'); });
  dureChip('dureChip3', notesN ? '📝 회의록 ' + notesN + '개' : '', function(){ goView('notes'); });
}
