/* ---- home widgets ---- */
var WG_CATALOG = [
  {id:'projects', ic:'🗂️', name:'워크스페이스', desc:'최근 작업한 프로젝트로 바로 이동해요', size:'넓게', c:'#3B82F6'},
  {id:'today', ic:'📅', name:'오늘의 일정', desc:'캘린더의 오늘 일정을 자동으로 보여줘요', size:'보통', c:'#8B5CF6'},
  {id:'events', ic:'🏆', name:'마감 임박 공모전', desc:'자동으로 모은 공모전을 마감 순으로', size:'보통', c:'#F59E0B'},
  {id:'community', ic:'👥', name:'커뮤니티 인기글', desc:'지금 뜨는 질문과 팀원 모집 소식', size:'보통', c:'#EC4899'},
  {id:'team', ic:'🟢', name:'팀원 접속 현황', desc:'우리 팀원이 지금 온라인인지 실시간으로', size:'보통', c:'#22C55E'},
  {id:'notes', ic:'📝', name:'최근 회의록', desc:'최근 정리된 회의록을 한눈에', size:'보통', c:'#22D3EE'},
];
function wgShown(id){ var c = document.querySelector('.dyn-widget[data-widget="'+id+'"]'); return !!c && !c.hidden; }
function wgPreview(id){
  /* 갤러리 미리보기는 예시 글자·숫자 없이 '모양'만 보여주는 뼈대(스켈레톤)로 그린다 */
  var row = function(a, b){ return '<div class="wgp-row"><span class="wgp-t"><span class="wgp-l" style="width:100%"></span></span><i style="background:'+a+'"></i><span class="wgp-l" style="width:'+b+'%"></span></div>'; };
  var title = function(ic, t){ return '<div class="wgp-title">'+ic+' '+t+'</div>'; };
  if(id==='projects') return title('🗂️', '워크스페이스')+'<div class="wgp-cards">'+['#3B82F6','#8B5CF6','#06B6D4'].map(function(c){ return '<div class="wgp-card"><b style="background:'+c+'"></b><span class="wgp-l" style="width:80%"></span><span class="wgp-l s" style="width:50%"></span></div>'; }).join('')+'</div>';
  if(id==='today') return title('📅', '오늘의 일정')+row('#3B82F6',70)+row('#8B5CF6',52)+row('#22D3EE',62);
  if(id==='events') return title('🏆', '마감 임박 공모전')+row('#EF4444',74)+row('#F59E0B',58)+row('#3B82F6',66);
  if(id==='community') return title('👥', '커뮤니티 인기글')+row('#3B82F6',72)+row('#8B5CF6',60)+row('#EC4899',68);
  if(id==='team') return title('👥', '팀원 접속 현황')+'<div class="wgp-stack">'+['#3B82F6|#22C55E','#EC4899|#F59E0B','#8B5CF6|#22C55E','#06B6D4|#94A3B8'].map(function(x){ var q=x.split('|'); return '<b style="background:'+q[0]+'"><i style="background:'+q[1]+'"></i></b>'; }).join('')+'</div><div class="wgp-sbar"><i style="flex:2;background:#22C55E"></i><i style="flex:1;background:#F59E0B"></i><i style="flex:1;background:var(--border-strong)"></i></div>';
  if(id==='notes') return title('📝', '최근 회의록')+row('#22D3EE',76)+row('#8B5CF6',54);
  return '';
}
var wgFilter = 'all';
function wgSetFilter(f){ wgFilter = f; wgRender(); }
function wgRender(){
  var q = ((document.getElementById('wgSearch') || {}).value || '').trim().toLowerCase();
  var list = WG_CATALOG.filter(function(w){
    var on = wgShown(w.id);
    if(wgFilter === 'on' && !on) return false; if(wgFilter === 'off' && on) return false;
    return !q || (w.name + ' ' + w.desc).toLowerCase().indexOf(q) >= 0;
  });
  var g = document.getElementById('wgGrid'); if(!g) return;
  g.innerHTML = '';
  var plus = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  var check = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  list.forEach(function(w){
    var on = wgShown(w.id);
    var card = document.createElement('div'); card.className = 'wg-card' + (w.size === '넓게' ? ' wide' : '') + (on ? ' on' : ''); card.id = 'wgCard-'+w.id;
    card.innerHTML = '<div class="wg-prev" style="--wc:'+w.c+'"><div class="wgp">'+wgPreview(w.id)+'</div></div>' +
      '<div class="wg-foot"><span class="wg-lic" style="--wc:'+w.c+'">'+w.ic+'</span><div class="wg-cap"><b></b><small></small></div><button type="button" class="wg-act"></button></div>';
    card.querySelector('.wg-cap b').textContent = w.name; card.querySelector('.wg-cap small').textContent = w.desc;
    var bt = card.querySelector('.wg-act');
    bt.className = 'wg-act' + (on ? ' on' : ''); bt.innerHTML = on ? check + '<span>추가됨</span>' : plus + '<span>추가</span>';
    bt.setAttribute('aria-label', (on ? '홈에서 빼기: ' : '홈에 추가: ') + w.name); bt.title = on ? '눌러서 홈에서 빼기' : '홈에 추가';
    bt.onclick = function(){ var was = wgShown(w.id); setWidget(w.id, !was); wgRender(); if(!was) pushToast('✅', w.name + ' 위젯을 추가했어요', '홈 화면에서 확인해 보세요. 꾹 눌러서 위치를 바꿀 수 있어요.'); };
    g.appendChild(card);
  });
  if(!list.length) g.innerHTML = '<div class="wg-none"><b>' + (q ? '검색 결과가 없어요' : (wgFilter === 'on' ? '아직 추가한 위젯이 없어요' : '모든 위젯을 추가했어요 🎉')) + '</b><span>' + (q ? '다른 이름으로 찾아 보세요.' : '') + '</span></div>';
  var n = WG_CATALOG.filter(function(w){ return wgShown(w.id); }).length;
  var c = document.getElementById('wgCount'); if(c) c.textContent = '홈에 ' + n + ' / ' + WG_CATALOG.length + '개 올려 두었어요';
  Array.prototype.forEach.call(document.querySelectorAll('.wg-seg button'), function(b){ b.classList.toggle('on', b.dataset.f === wgFilter); b.setAttribute('aria-pressed', b.dataset.f === wgFilter ? 'true' : 'false'); });
}
function wgOpen(){ wgToggleEdit(false); var m = document.getElementById('wgModal'); if(!m) return; var s = document.getElementById('wgSearch'); if(s) s.value = ''; wgFilter = 'all'; wgRender(); m.classList.add('open'); document.documentElement.classList.add('wg-modal-open'); }
function wgClose(){ var m = document.getElementById('wgModal'); if(m) m.classList.remove('open'); document.documentElement.classList.remove('wg-modal-open'); }
document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ var m = document.getElementById('wgModal'); if(m && m.classList.contains('open')) wgClose(); else if(document.getElementById('widgetGrid') && document.getElementById('widgetGrid').classList.contains('editing')) wgToggleEdit(false); } });
/* 보이는 위젯이 하나도 없으면(처음 실행 포함) 빈 상태 안내를 보여준다 */
function wgSyncEmpty(){
  var e = document.getElementById('wgEmpty'), g = document.getElementById('widgetGrid'); if(!e || !g) return;
  var any = !!g.querySelector('.dyn-widget:not([hidden])');
  e.hidden = any; g.hidden = !any;
  var eb = document.getElementById('wgEditBtn'); if(eb) eb.hidden = !any;
}
function setWidget(id, show){
  var card = document.querySelector('.dyn-widget[data-widget="'+id+'"]');
  if(card){
    var was = card.hidden; card.hidden = !show;
    if(show && was){ card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
  }
  saveWidgetPrefs(); wgSyncEmpty();
  if(show) wgRefreshLive();
  var m = document.getElementById('wgModal'); if(m && m.classList.contains('open')) wgRender();
}
function removeWidget(id){ setWidget(id, false); }
function saveWidgetPrefs(){
  try{
    var all = Array.from(document.querySelectorAll('.dyn-widget'));
    localStorage.setItem('root_home_widgets', JSON.stringify(all.filter(function(w){ return !w.hidden; }).map(function(w){ return w.dataset.widget; })));
    localStorage.setItem('root_home_widget_order', JSON.stringify(all.map(function(w){ return w.dataset.widget; })));
    var wide = {}; all.forEach(function(w){ wide[w.dataset.widget] = w.classList.contains('wide'); });                 // 넓게/보통 (사용자가 ↔ 로 바꾼 크기)
    localStorage.setItem('root_home_widget_wide', JSON.stringify(wide));
  }catch(e){}
}
function loadWidgetPrefs(){
  try{
    var order = JSON.parse(localStorage.getItem('root_home_widget_order') || 'null');
    var grid = document.getElementById('widgetGrid');
    if(order && grid){
      order.forEach(function(id){ var c = grid.querySelector('.dyn-widget[data-widget="'+id+'"]'); if(c) grid.appendChild(c); });
      // 예전에 저장된 순서에 없던 새 위젯(예: 팀원 접속 현황)은 맨 앞이 아니라 '오늘의 일정' 바로 뒤에 둔다
      var tw = grid.querySelector('.dyn-widget[data-widget="team"]'), td = grid.querySelector('.dyn-widget[data-widget="today"]');
      if(tw && td && order.indexOf('team') < 0) grid.insertBefore(tw, td.nextSibling);
    }
    var wideRaw = localStorage.getItem('root_home_widget_wide');
    if(wideRaw && grid){ var wide = JSON.parse(wideRaw); Object.keys(wide).forEach(function(id){ var c = grid.querySelector('.dyn-widget[data-widget="'+id+'"]'); if(c) c.classList.toggle('wide', !!wide[id]); }); }
    var raw = localStorage.getItem('root_home_widgets');
    if(!raw) return;
    var ids = JSON.parse(raw);
    document.querySelectorAll('.dyn-widget').forEach(function(w){ w.hidden = ids.indexOf(w.dataset.widget) < 0; });
  }catch(e){}
  wgSyncEmpty();
}
/* 편집 모드(꾹 누르기 · 끌어서 옮기기 · − 빼기 · ↔ 크기)는 home-widget-edit.js 에 있어요 */

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
/* 팀원 접속 현황 위젯: 내가 속한 모든 프로젝트의 팀원을 접속 상태 순으로. 상태가 바뀌면 실시간으로 갱신 */
function wgLiveTeam(){
  var box = document.getElementById('wlTeam'); if(!box || !wgShown('team')) return;
  var pill = document.getElementById('twPill'); if(pill) pill.hidden = true;
  var empty = function(msg, sub, btn, fn){
    box.innerHTML = '';
    var e = wgEl('div', 'tw-empty'); var ic = wgEl('div', 'tw-empty-ic'); ic.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8M18 14.4c1.7.6 2.7 2.1 3 4.6"/></svg>';
    e.appendChild(ic); e.appendChild(wgEl('b', null, msg)); e.appendChild(wgEl('span', null, sub));
    if(btn){ var b = wgEl('button', 'tw-btn', btn); b.onclick = fn; e.appendChild(b); }
    box.appendChild(e);
  };
  if(!calApiMode){ empty('로그인하면 보여요', '팀원이 지금 온라인인지 실시간으로 알려드려요.', '로그인', function(){ openLogin(); }); return; }
  var team = dureTeammates();                       // 나 포함, 내가 속한 모든 프로젝트의 팀원
  if(team.length <= 1){ empty('아직 함께하는 팀원이 없어요', '팀원을 초대하면 접속 상태가 여기 모여요.', '＋ 팀원 초대', function(){ openInviteFromHero(); }); return; }
  var rank = { online:0, dnd:1, away:2, offline:3 }, cnt = { online:0, away:0, dnd:0, offline:0 };
  team.forEach(function(t){ t.st = pstOf(t.id); cnt[t.st]++; });
  team.sort(function(a, b){ return (a.me ? -1 : b.me ? 1 : 0) || rank[a.st] - rank[b.st]; });
  var live = team.length - cnt.offline;
  if(pill){ pill.hidden = false; pill.textContent = live + '/' + team.length + ' 온라인'; pill.classList.toggle('on', live > 0); }
  box.innerHTML = '';
  var hp0 = homeProject(); if(hp0){ var pn = wgEl('div', 'tw-projname'); pn.innerHTML = '<i></i><b></b>'; pn.querySelector('i').style.background = calProjColor(hp0); pn.querySelector('b').textContent = hp0.title; box.appendChild(pn); }
  // 1) 아바타 스택 (상태 점)
  var stack = wgEl('div', 'tw-stack');
  team.slice(0, 7).forEach(function(t, i){
    var a = wgEl('span', 'tw-av', String(t.name).slice(0, 1)); a.style.zIndex = 20 - i; a.style.background = t.me ? '#06B6D4' : chatColor(t.name); a.dataset.pst = t.st; a.title = t.name + (t.me ? ' (나)' : '') + ' · ' + PST_META[t.st].label;
    if(!t.me){ a.style.cursor = 'pointer'; a.onclick = function(){ openProfile(t.id); }; }
    stack.appendChild(a);
  });
  if(team.length > 7) stack.appendChild(wgEl('span', 'tw-more', '+' + (team.length - 7)));
  box.appendChild(stack);
  // 2) 상태 비율 막대 + 범례
  var bar = wgEl('div', 'tw-bar');
  ['online', 'dnd', 'away', 'offline'].forEach(function(k){ if(cnt[k]){ var seg = wgEl('i'); seg.dataset.pst = k; seg.style.flexGrow = cnt[k]; seg.title = PST_META[k].label + ' ' + cnt[k] + '명'; bar.appendChild(seg); } });
  box.appendChild(bar);
  var lg = wgEl('div', 'tw-legend');
  [['online', '온라인'], ['away', '자리비움'], ['dnd', '방해금지'], ['offline', '오프라인']].forEach(function(x){ if(cnt[x[0]]){ var s = wgEl('span'); s.dataset.pst = x[0]; s.innerHTML = '<i></i><b></b>'; s.querySelector('b').textContent = x[1] + ' ' + cnt[x[0]]; lg.appendChild(s); } });
  box.appendChild(lg);
  // 3) 한 줄씩 (접속 중인 사람이 먼저)
  var list = wgEl('div', 'tw-list');
  team.filter(function(t){ return !t.me; }).slice(0, 3).forEach(function(t){
    var r = wgEl('button', 'tw-row'); r.type = 'button'; r.onclick = function(){ openProfile(t.id); };
    var a = wgEl('span', 'tw-av sm', String(t.name).slice(0, 1)); a.style.background = chatColor(t.name); a.dataset.pst = t.st; r.appendChild(a);
    r.appendChild(wgEl('span', 'tw-name', t.name));
    var st = wgEl('span', 'tw-st', PST_META[t.st].label); st.dataset.pst = t.st; r.appendChild(st); list.appendChild(r);
  });
  var others = team.length - 1 - 3; if(others > 0) list.appendChild(wgEl('div', 'tw-restn', '외 ' + others + '명'));
  box.appendChild(list);
  var more = wgEl('button', 'tw-link', '팀원 화면 열기'); more.innerHTML += ' <span>→</span>'; more.onclick = function(){ goView('admin'); }; box.appendChild(more);
}
function wgRefreshLive(){ wgLiveToday(); wgLiveEvents(); wgLiveCommunity(); wgLiveNotes(); wgLiveTeam(); renderDureOrbit(); }
loadWidgetPrefs(); wgSyncEmpty();
setTimeout(wgRefreshLive, 600); setInterval(function(){ if(!document.hidden) wgRefreshLive(); }, 30000);


/* ---- 홈 상단 '두레' 궤도: 내 팀원들이 둘레에 모인다 (이름 첫 글자 + 접속 상태) ---- */
/* 팀원 최대 6명 + AI 1개 = 7자리를 둘레에 고르게 놓는다 (4번째 자리는 AI) */
var DURE_COUNT = 7, DURE_AI_INDEX = 4;
var DURE_ANGLES = []; for(var _i = 0; _i < DURE_COUNT; _i++) DURE_ANGLES.push(Math.round(_i * 360 / DURE_COUNT * 100) / 100);
var DURE_SLOTS = DURE_ANGLES.filter(function(_a, i){ return i !== DURE_AI_INDEX; });
var dureSig = '';
var DURE_PAGE = 6, dureOrbitPage = 0, dureOrbitProj = null, dureEnterDir = 0;   // 한 쪽에 팀원 6명씩, 넘으면 옆으로 넘겨서 본다
/* 홈에서 고른 '지금 프로젝트': 궤도·팀원 위젯은 이 프로젝트의 팀원만 보여준다 (친구가 늘어도 홈이 복잡해지지 않게) */
function homeProject(){
  if(!calApiMode || !myProjects.length) return null;
  var stored = null; try { stored = localStorage.getItem('sync_home_project'); } catch(e){}
  return calProjectById(stored) || calProjectById(chatProject) || myProjects[0];
}
function setHomeProject(id){
  try { localStorage.setItem('sync_home_project', id); } catch(e){}
  if(id !== chatProject && typeof switchChatProject === 'function') switchChatProject(id);     // 채팅·통화도 같은 프로젝트로
  dureSig = ''; renderDureOrbit(); wgLiveTeam();
}
function dureTeammates(){
  var list = [];
  if(!calApiMode || !currentUser) return list;
  list.push({ id:currentUser.id, name:myProfile.name || currentUser.username || '나', me:true });
  var cur = homeProject(), seen = {}; seen[currentUser.id] = 1;
  ((cur && cur.members) || []).forEach(function(m){
    if(m && m.id != null && !seen[m.id]){ seen[m.id] = 1; list.push({ id:m.id, name:m.username || '팀원', me:false }); }
  });
  var rank = { online:0, dnd:1, away:2, offline:3 };
  var others = list.slice(1).sort(function(a, b){ return rank[pstOf(a.id)] - rank[pstOf(b.id)]; });
  return [list[0]].concat(others);
}
/* 궤도 아래의 프로젝트 선택 */
function dureRenderProj(){
  var box = document.getElementById('dureProj'); if(!box) return;
  var cur = homeProject();
  if(!cur){ box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false; box.innerHTML = '';
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dure-proj-btn'; btn.setAttribute('aria-haspopup', 'listbox');
  btn.innerHTML = '<span class="pd"></span><b></b><small></small><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  btn.querySelector('.pd').style.background = calProjColor(cur); btn.querySelector('b').textContent = cur.title; btn.querySelector('small').textContent = ((cur.members || []).length || 1) + '명';
  box.appendChild(btn);
  if(myProjects.length > 1){
    var menu = document.createElement('div'); menu.className = 'dure-proj-menu'; menu.setAttribute('role', 'listbox');
    myProjects.forEach(function(p){
      var it = document.createElement('button'); it.type = 'button'; it.className = 'dure-proj-it' + (p.id === cur.id ? ' on' : ''); it.setAttribute('role', 'option');
      it.innerHTML = '<span class="pd"></span><b></b><small></small><i>✓</i>'; it.querySelector('.pd').style.background = calProjColor(p); it.querySelector('b').textContent = p.title; it.querySelector('small').textContent = ((p.members || []).length || 1) + '명';
      it.onclick = function(e){ e.stopPropagation(); box.classList.remove('open'); setHomeProject(p.id); };
      menu.appendChild(it);
    });
    box.appendChild(menu);
    btn.onclick = function(e){ e.stopPropagation(); box.classList.toggle('open'); };
  } else { btn.classList.add('single'); btn.querySelector('svg').remove(); }
}
document.addEventListener('click', function(e){ var b = document.getElementById('dureProj'); if(b && !e.target.closest('#dureProj')) b.classList.remove('open'); });
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
/* 홈의 [팀원 초대하기] 버튼 설명을 지금 상태(로그인 전 / 프로젝트 없음 / 있음)에 맞게 바꾼다 */
function homeCtaRefresh(){
  var sub = document.getElementById('homeInviteSub'); if(!sub) return;
  var hp = null; try { hp = homeProject(); } catch(e){}
  if(!calApiMode) sub.textContent = '로그인하면 초대 링크를 만들 수 있어요';
  else if(!hp) sub.textContent = '프로젝트를 만들면 초대할 수 있어요';
  else sub.textContent = '‘' + hp.title + '’ 초대 링크 만들기';
}
function renderDureOrbit(){
  homeCtaRefresh();
  var box = document.getElementById('dureOrbit'); if(!box) return;
  if(typeof CAL_TODAY === 'undefined' || !CAL_TODAY || !Array.isArray(calendarEvents)) return;   // 화면 코드가 다 불러와지기 전에는 건너뜀
  var team = dureTeammates();
  var today = CAL_TODAY.y + '-' + pad2(CAL_TODAY.m) + '-' + pad2(CAL_TODAY.d);
  var todayN = calApiMode ? calendarEvents.filter(function(e){ return e.start <= today && (e.end || e.start) >= today; }).length : 0;
  var notesN = calApiMode ? (meetingDocs || []).length : 0;
  var online = team.filter(function(t){ return pstOf(t.id) === 'online' || pstOf(t.id) === 'dnd' || pstOf(t.id) === 'away'; }).length;
  var hp = homeProject(), sig = [hp ? hp.id + ':' + hp.title : '', team.map(function(t){ return t.id + ':' + pstOf(t.id); }).join(','), calApiMode ? 1 : 0, todayN, notesN, 'pg' + dureOrbitPage, myProjects.map(function(p){ return p.id + p.title; }).join(',')].join('|');
  if(sig === dureSig) return; dureSig = sig;
  dureRenderProj();
  if(typeof homeStickSync === 'function') homeStickSync();
  box.innerHTML = '';
  var invite = function(){ openInviteFromHero(); };
  /* 팀원은 한 쪽에 6명씩 둘레에 놓고, 더 많으면 궤도 위에 마우스를 올려 옆으로 넘겨 본다 (< >, 점, 밀어서 넘기기).
     쪽마다 [팀원 · 초대 '+' · AI] 를 고르게 나누고, 작은 팀은 7자리를 흐린 '+'로 채워 둥글게 보인다. */
  var curId = hp ? hp.id : null;
  if(curId !== dureOrbitProj){ dureOrbitProj = curId; dureOrbitPage = 0; }
  var pages = Math.max(1, Math.ceil(team.length / DURE_PAGE));
  if(dureOrbitPage >= pages) dureOrbitPage = pages - 1;
  var pageTeam = team.slice(dureOrbitPage * DURE_PAGE, dureOrbitPage * DURE_PAGE + DURE_PAGE);
  var shown = pageTeam.length;
  var N = DURE_COUNT;                                               // 한 쪽은 언제나 7자리: AI 1 + 사람 6 (팀원이 6명보다 적으면 남는 자리가 초대 '+' 와 흐린 '+')
  var aiIdx = DURE_AI_INDEX;
  box.dataset.n = N; box.dataset.page = dureOrbitPage;
  dureNavRefresh(pages);
  var items = [];
  for(var mi = 0; mi < shown; mi++) items.push({k:'m', t:pageTeam[mi]});
  if(shown < DURE_PAGE) items.push({k:'inv'});
  while(items.length < N - 1) items.push({k:'ghost'});
  items.splice(aiIdx, 0, {k:'ai'});
  items.forEach(function(it, i){
    var angle = Math.round(i * 360 / N * 100) / 100;
    if(it.k === 'm'){
      var t = it.t, st = pstOf(t.id);
      box.appendChild(dureNode(angle, chatColor(t.name), String(t.name).slice(0, 1), t.name + (t.me ? ' (나)' : '') + ' · ' + PST_META[st].label, { pst:st }));
    } else if(it.k === 'ai'){
      box.appendChild(dureNode(angle, null, 'AI', '두레 AI — 채팅에서 "두레야"라고 불러보세요', { cls:'dn-ai' }));
    } else {
      box.appendChild(dureNode(angle, null, '+', calApiMode ? '팀원 초대' : '로그인하고 팀원 초대', { cls:'dn-plus' + (it.k === 'inv' ? '' : ' ghost'), click:invite }));
    }
  });
  if(dureEnterDir){                                   // 쪽을 넘겼을 때만: 새 쪽의 원들이 옆에서 미끄러져 들어온다
    box.style.setProperty('--dir', dureEnterDir);
    Array.prototype.forEach.call(box.children, function(n, k){ n.classList.add('enter'); n.style.setProperty('--k', k); });
    dureEnterDir = 0;
  }
  // 둘레에 떠 있는 말풍선: 진짜 숫자만 보여준다
  if(!calApiMode) dureChip('dureChip1', '👋 로그인하면 팀원이 여기 모여요', function(){ openLogin(); });
  else if(team.length <= 1) dureChip('dureChip1', '＋ 친구·팀원을 초대해 보세요', invite);
  else dureChip('dureChip1', '🟢 팀원 ' + online + '/' + team.length + '명 접속 중', null);
  dureChip('dureChip2', todayN ? '📅 오늘 일정 ' + todayN + '개' : '', function(){ goView('calendar'); });
  dureChip('dureChip3', notesN ? '📝 회의록 ' + notesN + '개' : '', function(){ goView('notes'); });
}

/* ---- 홈: 위젯 옆에서 따라 내려오는 덩어리 — 위쪽 메뉴 바 높이와 덩어리 높이를 CSS 에 알려 준다 ---- */
(function(){
  function sync(){
    var tb = document.querySelector('.topbar'); if(tb && tb.offsetHeight) document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
    var left = document.querySelector('.home-hero-left'); if(left && left.offsetHeight) document.documentElement.style.setProperty('--lh', left.offsetHeight + 'px');
  }
  window.homeStickSync = sync;
  window.addEventListener('resize', sync);
  if(window.ResizeObserver){ var l0 = document.querySelector('.home-hero-left'); if(l0) new ResizeObserver(sync).observe(l0); }
  setTimeout(sync, 300); setTimeout(sync, 1500);
})();

/* ---- 홈 궤도: 팀원이 많을 때 옆으로 넘기기 ---- */
function dureNavRefresh(pages){
  var prev = document.getElementById('dureNavPrev'), next = document.getElementById('dureNavNext'), dots = document.getElementById('dureDots');
  var many = pages > 1;
  if(prev) prev.hidden = !many; if(next) next.hidden = !many;
  var stage = document.querySelector('.dure-stage'); if(stage) stage.classList.toggle('has-pages', many);
  if(!dots) return;
  dots.hidden = !many;
  if(!many){ dots.innerHTML = ''; return; }
  dots.innerHTML = '';
  for(var i = 0; i < pages; i++){
    var d = document.createElement('button'); d.type = 'button'; d.className = 'dd' + (i === dureOrbitPage ? ' on' : '');
    d.setAttribute('aria-label', (i + 1) + '쪽'); (function(k){ d.onclick = function(e){ e.stopPropagation(); dureOrbitSet(k); }; })(i);
    dots.appendChild(d);
  }
}
function dureOrbitSet(page){
  var team = dureTeammates(), pages = Math.max(1, Math.ceil(team.length / DURE_PAGE));
  var np = ((page % pages) + pages) % pages; if(np === dureOrbitPage) return;
  dureEnterDir = np > dureOrbitPage ? 1 : -1; dureOrbitPage = np; dureSig = ''; renderDureOrbit();
}
function dureOrbitGo(d){
  var team = dureTeammates(), pages = Math.max(1, Math.ceil(team.length / DURE_PAGE)); if(pages < 2) return;
  var np = ((dureOrbitPage + d) % pages + pages) % pages;
  dureEnterDir = d > 0 ? 1 : -1; dureOrbitPage = np; dureSig = ''; renderDureOrbit();
}
(function(){
  var stage = document.querySelector('.dure-stage'); if(!stage) return;
  var sx = 0, sy = 0, down = false, swiped = false, lastWheel = 0;
  stage.addEventListener('pointerdown', function(e){ if(e.target.closest('.dure-nav, .dure-dots')) return; down = true; swiped = false; sx = e.clientX; sy = e.clientY; });
  window.addEventListener('pointerup', function(e){
    if(!down) return; down = false;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if(Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.3){ swiped = true; dureOrbitGo(dx < 0 ? 1 : -1); setTimeout(function(){ swiped = false; }, 350); }
  });
  stage.addEventListener('click', function(e){ if(swiped){ e.stopPropagation(); e.preventDefault(); } }, true);   // 밀어 넘긴 끝에 '+' 가 눌려 초대 창이 뜨지 않게
  stage.addEventListener('wheel', function(e){                                                         // 트랙패드를 옆으로 밀면 넘어간다 (세로 스크롤은 그대로 통과)
    if(Math.abs(e.deltaX) < 18 || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.4) return;
    e.preventDefault(); var now = Date.now(); if(now - lastWheel < 520) return; lastWheel = now; dureOrbitGo(e.deltaX > 0 ? 1 : -1);
  }, {passive:false});
  stage.addEventListener('keydown', function(e){ if(e.key === 'ArrowRight'){ dureOrbitGo(1); } else if(e.key === 'ArrowLeft'){ dureOrbitGo(-1); } });
})();
