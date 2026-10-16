/* ---- 프로필 · 포트폴리오 · 팔로우 (/app/profile, /app/profile/사용자번호) ---- */
var PF = { uid:null, data:null, follows:null, tab:'portfolio', editing:false, editProj:null, busy:false, q:'', results:[] };

function openProfile(id){
  if(!calApiMode){ pushToast('🔒', '로그인 후 프로필을 볼 수 있어요', '로그인하면 내 포트폴리오와 팔로우를 쓸 수 있어요'); openLogin(); return; }
  PF.uid = (id && !(currentUser && id === currentUser.id)) ? id : null;
  PF.tab = 'portfolio'; PF.editing = false; PF.editProj = null; PF.data = null;
  goView('profile');
  routerSetUrl(routePath('profile', PF.uid), true);
}
function pfEl(tag, cls, text){ var e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
function pfRole(r){ return r === 'owner' ? '👑 팀장' : (r === 'leader' ? '부팀장' : '팀원'); }
function pfDate(iso){ if(!iso) return ''; var d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z'); return isNaN(d) ? '' : d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate()); }
function pfSafeUrl(u){ return /^https?:\/\//i.test(u || '') ? u : '#'; }

async function renderProfile(keepScroll){
  var root = document.getElementById('pfRoot'); if(!root) return;
  if(!calApiMode){
    root.innerHTML = ''; var e = pfEl('div', 'pf-empty'); e.innerHTML = '<b>로그인하면 프로필과 포트폴리오를 볼 수 있어요</b><span>참여한 프로젝트와 내가 한 일이 자동으로 정리돼요.</span>';
    var b = pfEl('button', 'btn primary', '로그인'); b.onclick = openLogin; e.appendChild(b); root.appendChild(e); return;
  }
  var y = window.scrollY;
  try {
    var d = await apiFetch(PF.uid ? '/api/profile/' + PF.uid : '/api/profile/me');
    PF.data = d;
    if(d.is_self){ try { PF.follows = await apiFetch('/api/follows/me'); } catch(e){ PF.follows = { followers:[], following:[] }; } } else PF.follows = null;
  } catch(e){
    root.innerHTML = ''; var er = pfEl('div', 'pf-empty'); er.innerHTML = '<b></b><span>다시 시도해 주세요.</span>'; er.querySelector('b').textContent = e.message || '프로필을 불러오지 못했어요'; root.appendChild(er); return;
  }
  document.title = PF.data.user.name + ' · 프로필 · DureSync';
  pfDraw();
  if(keepScroll) window.scrollTo(0, y);
}
function pfLive(){ var v = document.querySelector('.view.active'); if(v && v.dataset.view === 'profile' && !PF.editing && !PF.editProj) renderProfile(true); }

function pfDraw(){
  var d = PF.data, root = document.getElementById('pfRoot'); root.innerHTML = '';
  var self = d.is_self, u = d.user, p = d.profile;
  // ----- 머리: 아바타 · 이름 · 소개 · 팔로우
  var head = pfEl('div', 'pf-head card');
  var av = pfEl('div', 'pf-av', String(u.name || '?').slice(0, 1)); av.style.background = self ? avatarSwatches[myProfile.swatch] || '#06B6D4' : chatColor(u.name);
  var st = self ? pstOwn() : (PST.team[String(u.id)] || null);
  if(st){ av.dataset.pst = st; av.title = PST_META[st].label; }
  head.appendChild(av);
  var info = pfEl('div', 'pf-info');
  var nm = pfEl('div', 'pf-name'); nm.appendChild(pfEl('h2', null, u.name));
  if(!self && d.follows_me) nm.appendChild(pfEl('span', 'chip', d.i_follow ? '맞팔로우' : '나를 팔로우해요'));
  info.appendChild(nm);
  info.appendChild(pfEl('div', 'pf-headline' + (p.headline ? '' : ' muted'), p.headline || (self ? '한 줄 소개를 적어 보세요' : '아직 한 줄 소개가 없어요')));
  var cnt = pfEl('div', 'pf-counts');
  var c1 = pfEl('button', 'pf-count'); c1.innerHTML = '<b></b><span>팔로워</span>'; c1.querySelector('b').textContent = d.followers; c1.onclick = function(){ if(self){ PF.tab = 'followers'; pfDraw(); } };
  var c2 = pfEl('button', 'pf-count'); c2.innerHTML = '<b></b><span>팔로잉</span>'; c2.querySelector('b').textContent = d.following; c2.onclick = function(){ if(self){ PF.tab = 'following'; pfDraw(); } };
  var c3 = pfEl('div', 'pf-count static'); c3.innerHTML = '<b></b><span>프로젝트</span>'; c3.querySelector('b').textContent = d.projects.length + (d.hidden_projects ? '+' : '');
  var c4 = pfEl('div', 'pf-count static'); c4.innerHTML = '<b></b><span>커뮤니티 글</span>'; c4.querySelector('b').textContent = d.posts;
  cnt.appendChild(c1); cnt.appendChild(c2); cnt.appendChild(c3); cnt.appendChild(c4); info.appendChild(cnt);
  head.appendChild(info);
  var act = pfEl('div', 'pf-actions');
  if(self){ var eb = pfEl('button', 'btn primary', PF.editing ? '편집 취소' : '프로필 편집'); eb.onclick = function(){ PF.editing = !PF.editing; pfDraw(); }; act.appendChild(eb); }
  else { act.appendChild(pfFollowBtn(u.id, d.i_follow)); }
  head.appendChild(act); root.appendChild(head);

  if(PF.editing && self){ root.appendChild(pfEditForm(p)); }
  else if(p.bio || (p.skills && p.skills.length) || (p.links && p.links.length)){
    var about = pfEl('div', 'pf-about card');
    if(p.bio) about.appendChild(pfEl('p', 'pf-bio', p.bio));
    if(p.skills.length){ var sk = pfEl('div', 'pf-chips'); p.skills.forEach(function(s){ sk.appendChild(pfEl('span', 'pf-chip', s)); }); about.appendChild(sk); }
    if(p.links.length){ var lk = pfEl('div', 'pf-links'); p.links.forEach(function(l){ var a = pfEl('a', 'pf-link', '↗ ' + l.label); a.href = pfSafeUrl(l.url); a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; lk.appendChild(a); }); about.appendChild(lk); }
    root.appendChild(about);
  } else if(self && !PF.editing){
    var tip = pfEl('div', 'pf-tip card'); tip.innerHTML = '<b>프로필을 채워 보세요</b><span>한 줄 소개, 기술 스택, 링크(GitHub·블로그)를 적으면 팀원과 포트폴리오에서 보여요.</span>';
    var tb = pfEl('button', 'btn primary', '프로필 편집'); tb.onclick = function(){ PF.editing = true; pfDraw(); }; tip.appendChild(tb); root.appendChild(tip);
  }
  // ----- 탭
  var tabs = pfEl('div', 'pf-tabs');
  var list = [['portfolio', '포트폴리오']]; if(self){ list.push(['followers', '팔로워 ' + d.followers]); list.push(['following', '팔로잉 ' + d.following]); }
  list.forEach(function(t){ var b = pfEl('button', PF.tab === t[0] ? 'on' : '', t[1]); b.onclick = function(){ PF.tab = t[0]; pfDraw(); }; tabs.appendChild(b); });
  root.appendChild(tabs);
  if(PF.tab === 'portfolio') pfPortfolio(root); else pfFollowLists(root);
}

function pfFollowBtn(uid, on){
  var b = pfEl('button', 'btn ' + (on ? 'ghost pf-following' : 'primary'), on ? '팔로잉' : '팔로우');
  if(on){ b.onmouseenter = function(){ b.textContent = '언팔로우'; }; b.onmouseleave = function(){ b.textContent = '팔로잉'; }; }
  b.onclick = function(){ pfToggleFollow(uid, on, b); };
  return b;
}
async function pfToggleFollow(uid, on, btn){
  if(PF.busy) return; PF.busy = true; if(btn) btn.disabled = true;
  try {
    await apiFetch('/api/follows/' + uid, { method: on ? 'DELETE' : 'POST' });
    if(!on) pushToast('✅', '팔로우했어요', '상대에게 바로 알려드렸어요.', { duration:2200 });
    await renderProfile(true);
  } catch(e){ pushToast('⚠️', on ? '언팔로우하지 못했어요' : '팔로우하지 못했어요', e.message); }
  PF.busy = false; if(btn) btn.disabled = false;
}

function pfStat(label, n){ var e = pfEl('div', 'pf-stat'); e.innerHTML = '<b></b><span></span>'; e.querySelector('b').textContent = n; e.querySelector('span').textContent = label; return e; }
function pfPortfolio(root){
  var d = PF.data, self = d.is_self;
  var tot = { notes:0, files:0, events:0, messages:0 };
  d.projects.forEach(function(p){ tot.notes += p.stats.notes; tot.files += p.stats.files; tot.events += p.stats.events; tot.messages += p.stats.messages; });
  var strip = pfEl('div', 'pf-strip'); strip.appendChild(pfStat('참여 프로젝트', d.projects.length)); strip.appendChild(pfStat('수정한 파일', tot.files)); strip.appendChild(pfStat('작성한 회의록', tot.notes)); strip.appendChild(pfStat('만든 일정', tot.events)); strip.appendChild(pfStat('보낸 채팅', tot.messages));
  root.appendChild(strip);
  if(!d.projects.length){
    var e = pfEl('div', 'pf-empty'); e.innerHTML = '<b></b><span></span>';
    e.querySelector('b').textContent = self ? '아직 참여한 프로젝트가 없어요' : '함께 보이는 프로젝트가 없어요';
    e.querySelector('span').textContent = self ? '프로젝트를 만들거나 초대를 받으면 여기에 포트폴리오가 쌓여요.' : '같은 프로젝트에 참여한 경우에만 프로젝트 내용이 보여요.';
    root.appendChild(e);
  }
  d.projects.forEach(function(p){ root.appendChild(pfProjectCard(p, self)); });
  if(d.hidden_projects){ root.appendChild(pfEl('div', 'pf-hidden', '비공개 프로젝트 ' + d.hidden_projects + '개 · 같은 프로젝트의 팀원에게만 보여요')); }
}
function pfProjectCard(p, self){
  var c = pfEl('div', 'pf-proj card');
  var top = pfEl('div', 'pf-ptop'); var t = pfEl('div', 'pf-ptitle'); t.appendChild(pfEl('b', null, p.title)); t.appendChild(pfEl('span', 'pf-role' + (p.role !== 'member' ? ' lead' : ''), pfRole(p.role))); top.appendChild(t);
  top.appendChild(pfEl('span', 'pf-meta', pfDate(p.joined_at) + ' 참여 · 팀 ' + p.member_count + '명')); c.appendChild(top);
  var s = p.stats, chips = pfEl('div', 'pf-sc');
  [['📄', '파일 ' + s.files], ['📝', '회의록 ' + s.notes], ['📅', '일정 ' + s.events], ['💬', '채팅 ' + s.messages], ['🗣️', '글 ' + s.posts]].forEach(function(x){ if(x[1].split(' ')[1] !== '0') chips.appendChild(pfEl('span', 'pf-sc-i', x[0] + ' ' + x[1])); });
  if(chips.children.length) c.appendChild(chips); else c.appendChild(pfEl('div', 'pf-sc muted', '아직 기록된 활동이 없어요'));
  if(self && PF.editProj === p.project_id){ c.appendChild(pfEntryForm(p)); return c; }
  if(p.summary) c.appendChild(pfEl('p', 'pf-sum', p.summary));
  if(p.tech && p.tech.length){ var tc = pfEl('div', 'pf-chips'); p.tech.forEach(function(x){ tc.appendChild(pfEl('span', 'pf-chip', x)); }); c.appendChild(tc); }
  if(self){
    var row = pfEl('div', 'pf-prow'); var eb = pfEl('button', 'btn ghost', p.summary ? '내가 한 일 수정' : '＋ 내가 한 일 쓰기'); eb.onclick = function(){ PF.editProj = p.project_id; pfDraw(); }; row.appendChild(eb);
    var ob = pfEl('button', 'btn ghost', '프로젝트 열기'); ob.onclick = function(){ openWorkspace('p' + p.project_id); }; row.appendChild(ob); c.appendChild(row);
  }
  return c;
}
function pfChipInput(initial, max, ph){
  var box = pfEl('div', 'pf-ci'), vals = (initial || []).slice(), inp = pfEl('input'); inp.type = 'text'; inp.placeholder = ph; inp.maxLength = 30;
  function draw(){ box.querySelectorAll('.pf-chip').forEach(function(x){ x.remove(); }); vals.forEach(function(v, i){ var c = pfEl('span', 'pf-chip rm', v + ' ×'); c.onclick = function(){ vals.splice(i, 1); draw(); }; box.insertBefore(c, inp); }); }
  function add(){ var t = inp.value.replace(/[,]+/g, ' ').trim(); if(t && vals.length < max && vals.map(function(x){ return x.toLowerCase(); }).indexOf(t.toLowerCase()) < 0) vals.push(t); inp.value = ''; draw(); }
  inp.onkeydown = function(e){ if(isEnter(e) || e.key === ','){ e.preventDefault(); add(); } else if(e.key === 'Backspace' && !inp.value && vals.length){ vals.pop(); draw(); } };
  inp.onblur = add; box.appendChild(inp); draw(); box.getValues = function(){ add(); return vals.slice(); }; return box;
}
function pfEntryForm(p){
  var f = pfEl('div', 'pf-form');
  var ta = pfEl('textarea'); ta.rows = 4; ta.maxLength = 2000; ta.placeholder = '이 프로젝트에서 맡은 역할과 한 일을 적어 보세요. (예: 어떤 기능을 만들었는지, 어떤 문제를 해결했는지)'; ta.value = p.summary || '';
  f.appendChild(pfEl('label', null, '내가 한 일')); f.appendChild(ta);
  f.appendChild(pfEl('label', null, '사용 기술 (Enter로 추가)')); var ci = pfChipInput(p.tech, 12, '예: Python, FastAPI'); f.appendChild(ci);
  var row = pfEl('div', 'pf-prow'); var ok = pfEl('button', 'btn primary', '저장'); var no = pfEl('button', 'btn ghost', '취소');
  ok.onclick = async function(){ ok.disabled = true; try { await apiFetch('/api/profile/me/projects/' + p.project_id, { method:'PUT', body:JSON.stringify({ summary:ta.value, tech:ci.getValues() }) }); PF.editProj = null; pushToast('✅', '포트폴리오에 저장했어요', p.title, { duration:2200 }); renderProfile(true); } catch(e){ ok.disabled = false; pushToast('⚠️', '저장하지 못했어요', e.message); } };
  no.onclick = function(){ PF.editProj = null; pfDraw(); }; row.appendChild(ok); row.appendChild(no); f.appendChild(row); return f;
}
function pfEditForm(p){
  var f = pfEl('div', 'pf-form card');
  f.appendChild(pfEl('label', null, '한 줄 소개')); var hl = pfEl('input'); hl.type = 'text'; hl.maxLength = 120; hl.value = p.headline || ''; hl.placeholder = '나를 한 줄로 소개해 보세요'; f.appendChild(hl);
  f.appendChild(pfEl('label', null, '자기소개')); var bio = pfEl('textarea'); bio.rows = 4; bio.maxLength = 2000; bio.value = p.bio || ''; bio.placeholder = '관심 분야, 강점, 목표 등을 자유롭게 적어 주세요'; f.appendChild(bio);
  f.appendChild(pfEl('label', null, '기술 스택 (Enter로 추가, 최대 20개)')); var sk = pfChipInput(p.skills, 20, '예: React, Python'); f.appendChild(sk);
  f.appendChild(pfEl('label', null, '링크 (GitHub·블로그 등, 최대 6개)'));
  var rows = []; var lw = pfEl('div', 'pf-lrows');
  function addRow(l){ if(rows.length >= 6) return; var r = pfEl('div', 'pf-lrow'), a = pfEl('input'), b = pfEl('input'); a.type = 'text'; a.placeholder = '이름'; a.maxLength = 30; a.value = (l && l.label) || ''; b.type = 'url'; b.placeholder = 'https://…'; b.maxLength = 300; b.value = (l && l.url) || ''; var x = pfEl('button', 'btn ghost', '삭제'); x.type = 'button'; x.onclick = function(){ r.remove(); rows.splice(rows.indexOf(o), 1); }; var o = { a:a, b:b }; rows.push(o); r.appendChild(a); r.appendChild(b); r.appendChild(x); lw.appendChild(r); }
  (p.links || []).forEach(addRow); if(!rows.length) addRow(); f.appendChild(lw);
  var add = pfEl('button', 'btn ghost', '＋ 링크 추가'); add.type = 'button'; add.onclick = function(){ addRow(); }; f.appendChild(add);
  var row = pfEl('div', 'pf-prow'); var ok = pfEl('button', 'btn primary', '저장'); var no = pfEl('button', 'btn ghost', '취소');
  ok.onclick = async function(){
    ok.disabled = true;
    try { await apiFetch('/api/profile/me', { method:'PUT', body:JSON.stringify({ headline:hl.value, bio:bio.value, skills:sk.getValues(), links:rows.map(function(o){ return { label:o.a.value, url:o.b.value.trim() }; }).filter(function(l){ return l.url; }) }) }); PF.editing = false; pushToast('✅', '프로필을 저장했어요', '', { duration:2200 }); renderProfile(true); }
    catch(e){ ok.disabled = false; pushToast('⚠️', '저장하지 못했어요', e.message); }
  };
  no.onclick = function(){ PF.editing = false; pfDraw(); }; row.appendChild(ok); row.appendChild(no); f.appendChild(row); return f;
}
function pfPerson(x){
  var r = pfEl('div', 'pf-person'); var av = pfEl('div', 'pf-pav', String(x.name || '?').slice(0, 1)); av.style.background = chatColor(x.name); if(x.mutual && x.status){ av.dataset.pst = x.status; av.title = PST_META[x.status].label; } r.appendChild(av);
  var w = pfEl('div', 'pf-pwho'); w.appendChild(pfEl('b', null, x.name)); w.appendChild(pfEl('span', null, x.headline || (x.mutual ? '맞팔로우 · ' + (x.status ? PST_META[x.status].label : '') : ''))); r.appendChild(w);
  r.onclick = function(){ openProfile(x.id); };
  var b = pfFollowBtn(x.id, x.i_follow); var bb = b.onclick; b.onclick = function(e){ e.stopPropagation(); bb(); }; r.appendChild(b); return r;
}
function pfFollowLists(root){
  var f = PF.follows || { followers:[], following:[] }, list = PF.tab === 'followers' ? f.followers : f.following;
  if(PF.tab === 'following'){
    var sb = pfEl('div', 'pf-search'); var inp = pfEl('input'); inp.type = 'search'; inp.placeholder = '이름으로 사람 찾기 (2글자 이상)'; inp.value = PF.q || ''; sb.appendChild(inp); root.appendChild(sb);
    var res = pfEl('div', 'pf-results'); root.appendChild(res);
    var t = null;
    var showRes = function(){ res.innerHTML = ''; (PF.results || []).forEach(function(x){ res.appendChild(pfPerson({ id:x.id, name:x.name, headline:x.headline, i_follow:x.i_follow })); }); if(PF.q && PF.q.length >= 2 && !(PF.results || []).length) res.appendChild(pfEl('div', 'pf-hidden', '검색 결과가 없어요')); };
    inp.oninput = function(){ clearTimeout(t); PF.q = inp.value.trim(); t = setTimeout(async function(){ if(PF.q.length < 2){ PF.results = []; showRes(); return; } try { PF.results = await apiFetch('/api/profile/search?q=' + encodeURIComponent(PF.q)); } catch(e){ PF.results = []; } showRes(); }, 300); };
    showRes();
  }
  if(!list.length){ var e = pfEl('div', 'pf-empty'); e.innerHTML = '<b></b><span></span>'; e.querySelector('b').textContent = PF.tab === 'followers' ? '아직 팔로워가 없어요' : '아직 팔로우한 사람이 없어요'; e.querySelector('span').textContent = PF.tab === 'followers' ? '내 프로필을 채우고 커뮤니티에 글을 써 보세요.' : '위 검색창이나 커뮤니티 글의 작성자 이름을 눌러 팔로우해 보세요.'; root.appendChild(e); return; }
  var box = pfEl('div', 'pf-people'); list.forEach(function(x){ box.appendChild(pfPerson(x)); }); root.appendChild(box);
}
