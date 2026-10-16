/* ---- 관리자 페이지 (/app/admin) ----
   서버가 권한을 직접 확인한다(/api/admin/*). 여기서 메뉴를 숨기는 건 편의일 뿐이다.
   화면: 대시보드 · 사용자 · 신고/콘텐츠 · 프로젝트 · 크롤러 · 공지 · 감사 로그 · 시스템 */
var SA = { tab:'dash', inited:false, timers:{}, state:{ users:{ q:'', state:'all', page:1 }, posts:{ q:'', state:'all', page:1 }, projects:{ q:'', page:1 }, events:{ q:'', page:1 }, audit:{ q:'', page:1 }, reports:{ status:'open' } }, todo:0 };
var SA_TABS = [
  { k:'dash', t:'대시보드', i:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>' },
  { k:'users', t:'사용자', i:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8M18 14.4c1.7.6 2.7 2.1 3 4.6"/>' },
  { k:'withdrawals', t:'탈퇴 기록', i:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>' },
  { k:'reports', t:'신고', i:'<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>' },
  { k:'posts', t:'커뮤니티', i:'<path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.3A7.5 7.5 0 1 1 20 12Z"/>' },
  { k:'projects', t:'프로젝트', i:'<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.3l2 2.2H18A2.5 2.5 0 0 1 20.5 9.7v7.8A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5Z"/>' },
  { k:'crawler', t:'크롤러', i:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.3 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.3-3.5-8.5s1-6 3.5-8.5Z"/>' },
  { k:'announce', t:'공지', i:'<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>' },
  { k:'audit', t:'감사 로그', i:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>' },
  { k:'system', t:'시스템', i:'<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/>' }
];
var SA_ACTIONS = { 'user.suspend':'사용자 정지', 'user.unsuspend':'정지 해제', 'user.admin_on':'운영자 지정', 'user.admin_off':'운영자 해제', 'user.delete':'계정 삭제(탈퇴 처리)', 'report.hide':'신고 글 숨김', 'report.delete':'신고 글 삭제', 'report.dismiss':'신고 기각', 'report.restore':'신고 글 복구',
  'post.pin':'글 고정', 'post.unpin':'글 고정 해제', 'post.hide':'글 숨김', 'post.unhide':'글 숨김 해제', 'post.delete':'글 삭제', 'post.restore':'글 복구', 'crawler.run':'크롤러 수동 실행', 'event.delete':'행사 삭제', 'announce.send':'공지 발송', 'gate.login':'관리자 페이지 접속', 'gate.lock':'코드 연속 오입력 잠금', 'gate.setup':'관리자 코드 최초 설정', 'gate.change':'관리자 코드 변경' };
var SA_CATS = { question:'질문', recruit:'팀원 모집', showcase:'프로젝트 자랑', share:'정보 공유', free:'자유', comment:'댓글' };

/* ----- 작은 도구들 ----- */
function saH(tag, attrs, kids){
  var e = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function(k){
    var v = attrs[k]; if(v == null || v === false) return;
    if(k === 'class') e.className = v; else if(k === 'text') e.textContent = v; else if(k === 'html') e.innerHTML = v; else if(k.slice(0, 2) === 'on') e[k] = v; else e.setAttribute(k, v === true ? '' : v);
  });
  (kids || []).forEach(function(c){ if(c == null || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function saSvg(path, size){ return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>'; }
function saN(n){ return (n == null ? 0 : n).toLocaleString('ko-KR'); }
function saWhen(iso){ if(!iso) return '—'; var d = ntDate(iso); if(!d) return '—'; var p = function(x){ return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
function saAgo(iso){ return iso ? ntRel(iso) : '—'; }
function saBytes(n){ if(n == null) return '—'; var u = ['B', 'KB', 'MB', 'GB'], i = 0; while(n >= 1024 && i < 3){ n /= 1024; i++; } return (i ? n.toFixed(1) : n) + ' ' + u[i]; }
function saDur(sec){ var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return (d ? d + '일 ' : '') + (h ? h + '시간 ' : '') + m + '분'; }
function saErr(e){ pushToast('⚠️', '처리하지 못했어요', (e && e.message) || '다시 시도해 주세요.'); }
/* 확인 토큰은 메모리에만 둔다: 새로고침하거나 주소를 다시 입력해 들어오면 항상 코드를 다시 묻는다 (저장소에 남지 않음) */
var SA_TOKEN = '';
function saToken(){ return SA_TOKEN; }
function saSetToken(t){ SA_TOKEN = t || ''; }
function saApi(path, opts){
  opts = opts || {}; var t = saToken();
  if(t) opts.headers = Object.assign({}, opts.headers || {}, { 'X-Admin-Token':t });
  return apiFetch('/api/admin' + path, opts).catch(function(e){
    if(e && e.status === 403 && /^관리자 코드/.test(e.message || '') && path.indexOf('/gate/') !== 0){ saSetToken(''); SA.inited = false; saGate(); }   // 확인 시간이 지났거나 코드가 바뀜 → 다시 코드 입력
    throw e;
  });
}
function saPost(path, body){ return saApi(path, { method:'POST', body:JSON.stringify(body || {}) }); }
function saChip(text, kind){ return saH('span', { class:'sa-chip ' + (kind || ''), text:text }); }
function saAvatar(name, size){ var a = saH('span', { class:'sa-av', text:String(name || '?').slice(0, 1) }); a.style.background = chatColor(name || '?'); if(size) { a.style.width = a.style.height = size + 'px'; a.style.fontSize = Math.round(size * .42) + 'px'; } return a; }
function saIsSuper(){ return !!(currentUser && currentUser.is_super); }
function saRoleChip(role){ return role === 'super' ? saChip('최고관리자', 'super') : role === 'admin' ? saChip('운영자', 'admin') : null; }
function saLoading(box){ box.innerHTML = ''; box.appendChild(saH('div', { class:'sa-empty', html:'<span class="sa-spin"></span>불러오는 중…' })); }
function saEmpty(text){ return saH('div', { class:'sa-empty', text:text }); }

/* 확인/입력 창 */
function saConfirm(o, ok){
  var m = document.getElementById('saModal'); if(!m) return;
  var card = m.querySelector('.sa-modal-card'); card.innerHTML = '';
  var input = null;
  card.appendChild(saH('h3', { text:o.title }));
  if(o.msg) card.appendChild(saH('p', { text:o.msg }));
  if(o.input){ input = saH('textarea', { class:'sa-input', rows:'3', maxlength:String(o.input.max || 200), placeholder:o.input.placeholder || '' }); card.appendChild(input); }
  var go = saH('button', { class:'btn ' + (o.danger ? 'sa-danger' : 'primary'), type:'button', text:o.ok || '확인' });
  var cancel = saH('button', { class:'btn', type:'button', text:'취소', onclick:function(){ m.classList.remove('open'); } });
  go.onclick = function(){ var v = input ? input.value.trim() : ''; if(o.input && o.input.required && !v){ input.focus(); return; } m.classList.remove('open'); ok(v); };
  card.appendChild(saH('div', { class:'sa-modal-act' }, [cancel, go]));
  m.classList.add('open'); if(input) setTimeout(function(){ input.focus(); }, 60);
}

/* 표 + 쪽 넘기기 */
function saTable(cols, rows, empty){
  if(!rows.length) return saEmpty(empty || '표시할 내용이 없어요.');
  var t = saH('table', { class:'sa-table' }), hr = saH('tr');
  cols.forEach(function(c){ hr.appendChild(saH('th', { text:c.t, class:c.cls || '' })); });
  t.appendChild(saH('thead', {}, [hr]));
  var tb = saH('tbody');
  rows.forEach(function(r){
    var tr = saH('tr', { class:r.cls || '' });
    if(r.onclick){ tr.onclick = r.onclick; tr.classList.add('click'); }
    cols.forEach(function(c){ var v = r.cells[c.k]; var td = saH('td', { class:c.cls || '' }); td.setAttribute('data-l', c.t); if(v instanceof Node) td.appendChild(v); else td.textContent = v == null ? '' : v; tr.appendChild(td); });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  return saH('div', { class:'sa-tablewrap' }, [t]);
}
function saPager(total, page, size, go){
  var pages = Math.max(1, Math.ceil(total / size));
  var box = saH('div', { class:'sa-pager' });
  box.appendChild(saH('span', { class:'sa-pager-n', text:'총 ' + saN(total) + '건' }));
  if(pages > 1){
    var prev = saH('button', { class:'btn', type:'button', text:'이전', onclick:function(){ go(page - 1); } }); prev.disabled = page <= 1;
    var next = saH('button', { class:'btn', type:'button', text:'다음', onclick:function(){ go(page + 1); } }); next.disabled = page >= pages;
    box.appendChild(prev); box.appendChild(saH('span', { class:'sa-pager-p', text:page + ' / ' + pages })); box.appendChild(next);
  }
  return box;
}
function saSearch(value, ph, on){
  var inp = saH('input', { class:'sa-input sa-search', type:'search', placeholder:ph, value:value || '' }), t = null;
  inp.oninput = function(){ clearTimeout(t); t = setTimeout(function(){ on(inp.value.trim()); }, 320); };
  return inp;
}
function saSeg(items, cur, on){
  var box = saH('div', { class:'sa-seg' });
  items.forEach(function(it){ box.appendChild(saH('button', { type:'button', class:cur === it[0] ? 'on' : '', text:it[1], onclick:function(){ on(it[0]); } })); });
  return box;
}

/* ----- 관리자 코드 관문 ----- */
function saLock(){ saLeave(); saGate(); }
function saCodeBox(onDone){
  var inp = saH('input', { class:'sa-code-in', type:'password', inputmode:'numeric', pattern:'[0-9]*', maxlength:'6', autocomplete:'off', 'aria-label':'관리자 코드 6자리' });
  var cells = []; for(var i = 0; i < 6; i++) cells.push(saH('i'));
  var box = saH('div', { class:'sa-code' }, cells.concat([inp]));
  var draw = function(){ var v = inp.value; cells.forEach(function(c, i){ c.textContent = i < v.length ? '•' : ''; c.classList.toggle('on', document.activeElement === inp && i === Math.min(v.length, 5)); c.classList.toggle('fill', i < v.length); }); };
  inp.oninput = function(){ inp.value = inp.value.replace(/\D/g, '').slice(0, 6); draw(); if(inp.value.length === 6) onDone(inp.value); };
  inp.onfocus = inp.onblur = draw; box.onclick = function(){ if(!inp.disabled) inp.focus(); };
  return { el:box, input:inp, value:function(){ return inp.value; }, clear:function(){ inp.value = ''; draw(); },
    focus:function(){ setTimeout(function(){ inp.focus(); }, 30); },
    shake:function(){ box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); },
    disable:function(on){ inp.disabled = on; box.classList.toggle('off', on); } };
}
function saGate(st){
  saLeave();
  var root = document.getElementById('saRoot'); root.innerHTML = '';
  var card = saH('div', { class:'sa-gate-card' }); root.appendChild(saH('div', { class:'sa-gate' }, [card]));
  var draw = function(st){
    card.innerHTML = '';
    card.appendChild(saH('div', { class:'sa-gate-ic', html:saSvg('<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6Z"/><path d="M9.5 11.5V10a2.5 2.5 0 0 1 5 0v1.5M9 11.5h6v4H9Z"/>', 30) }));
    var msg = saH('p', { class:'sa-gate-msg' });
    if(!st.code_set && !st.is_super){
      card.appendChild(saH('h3', { text:'관리자 코드가 아직 없어요' }));
      msg.textContent = '최고관리자가 먼저 6자리 관리자 코드를 설정해야 해요. 설정된 뒤에 다시 들어와 주세요.'; card.appendChild(msg);
      card.appendChild(saH('button', { class:'btn', type:'button', text:'서비스로 돌아가기', onclick:function(){ goView('home'); } })); return;
    }
    if(!st.code_set){
      var step = 1, first = '';
      card.appendChild(saH('h3', { text:'관리자 코드를 정해 주세요' }));
      msg.textContent = '처음 한 번만 정하면 돼요. 숫자 6자리 — 이 코드를 입력해야 관리자 페이지가 열려요. (같은 숫자 반복·연속 숫자는 쓸 수 없어요)'; card.appendChild(msg);
      var sub = saH('div', { class:'sa-gate-step', text:'새 코드 입력' }); card.appendChild(sub);
      var bx = saCodeBox(function(v){
        if(step === 1){ first = v; step = 2; sub.textContent = '한 번 더 입력해 확인'; bx.clear(); bx.focus(); return; }
        if(v !== first){ err.textContent = '두 번 입력한 코드가 달라요. 처음부터 다시 입력해 주세요.'; step = 1; first = ''; sub.textContent = '새 코드 입력'; bx.shake(); bx.clear(); bx.focus(); return; }
        bx.disable(true);
        saApi('/gate/setup', { method:'POST', body:JSON.stringify({ code:v }) }).then(function(r){ saSetToken(r.token); pushToast('🛡️', '관리자 코드를 설정했어요', '잊지 않게 안전한 곳에 적어 두세요.'); saEnter(); })
          .catch(function(e){ err.textContent = e.message; step = 1; first = ''; sub.textContent = '새 코드 입력'; bx.disable(false); bx.shake(); bx.clear(); bx.focus(); });
      });
      card.appendChild(bx.el); var err = saH('div', { class:'sa-gate-err' }); card.appendChild(err); bx.focus(); return;
    }
    card.appendChild(saH('h3', { text:'관리자 확인' }));
    msg.textContent = '관리자 코드 6자리를 입력해 주세요.'; card.appendChild(msg);
    var err2 = saH('div', { class:'sa-gate-err' }), timer = null;
    var bx2 = saCodeBox(function(v){
      bx2.disable(true); err2.textContent = '';
      saApi('/gate/verify', { method:'POST', body:JSON.stringify({ code:v }) }).then(function(r){ saSetToken(r.token); saEnter(); })
        .catch(function(e){
          err2.textContent = e.message || '확인하지 못했어요.'; bx2.shake(); bx2.clear();
          if(e.status === 429){ saCountdown(err2, bx2, e.message); } else { bx2.disable(false); bx2.focus(); }
        });
    });
    card.appendChild(bx2.el); card.appendChild(err2);
    card.appendChild(saH('div', { class:'sa-gate-foot' }, [saH('button', { class:'sa-link', type:'button', text:'← 서비스로 돌아가기', onclick:function(){ goView('home'); } })]));
    if(st.locked_seconds > 0){ bx2.disable(true); saCountdown(err2, bx2, null, st.locked_seconds); } else bx2.focus();
  };
  if(st) draw(st); else saApi('/gate/status').then(draw).catch(function(e){ card.appendChild(saEmpty(e.message)); });
}
function saCountdown(el, bx, msg, secs){
  var m = secs == null ? /(\d+)분/.exec(msg || '') : null; var left = secs != null ? secs : (m ? parseInt(m[1], 10) * 60 : 60);
  bx.disable(true);
  var t = setInterval(function(){
    left--; if(left <= 0 || !document.body.contains(el)){ clearInterval(t); if(document.body.contains(el)){ el.textContent = ''; bx.disable(false); bx.focus(); } return; }
    el.textContent = '잠겨 있어요 · ' + Math.floor(left / 60) + '분 ' + (left % 60 < 10 ? '0' : '') + (left % 60) + '초 뒤에 다시 시도할 수 있어요.';
  }, 1000);
  el.textContent = '잠겨 있어요 · ' + Math.floor(left / 60) + '분 ' + (left % 60 < 10 ? '0' : '') + (left % 60) + '초 뒤에 다시 시도할 수 있어요.';
}

/* ----- 화면 틀 ----- */
function saEnter(){
  saApi('/gate/status').then(function(st){
    if(st.verified && saToken()){ if(!SA.inited){ SA.inited = true; saBuild(); } saShow(SA.tab); }
    else { saSetToken(''); SA.inited = false; saGate(st); }
  }).catch(function(e){ if(!(e && e.status === 403 && /^관리자 코드/.test(e.message || ''))) saErr(e); });
}
function saLeave(){ Object.keys(SA.timers).forEach(function(k){ clearInterval(SA.timers[k]); delete SA.timers[k]; }); }
function saBuild(){
  var root = document.getElementById('saRoot'); root.innerHTML = '';
  var nav = saH('nav', { class:'sa-nav', id:'saNav' });
  SA_TABS.forEach(function(t){
    var b = saH('button', { type:'button', 'data-k':t.k, onclick:function(){ saShow(t.k); } }, [saH('span', { class:'sa-ic', html:saSvg(t.i) }), saH('span', { class:'sa-nt', text:t.t })]);
    if(t.k === 'reports') b.appendChild(saH('i', { class:'sa-badge', id:'saReportBadge', hidden:true }));
    nav.appendChild(b);
  });
  var head = saH('div', { class:'sa-head' }, [
    saH('div', {}, [saH('span', { class:'view-eyebrow', text:'Admin' }), saH('h2', { text:'관리자 페이지' })]),
    saH('div', { class:'sa-head-r' }, [saH('span', { id:'saRole' }), saH('button', { class:'btn', type:'button', text:'🔒 잠그기', title:'관리자 코드를 다시 입력해야 열려요', onclick:function(){ saSetToken(''); SA.inited = false; saLock(); } }), saH('button', { class:'btn', type:'button', text:'서비스로 돌아가기', onclick:function(){ goView('home'); } })])
  ]);
  var body = saH('div', { class:'sa-body' }, [nav, saH('main', { class:'sa-main', id:'saMain' })]);
  root.appendChild(head); root.appendChild(body);
  var drawer = saH('div', { class:'sa-drawer', id:'saDrawer' }, [saH('div', { class:'sa-drawer-bg', onclick:saCloseDrawer }), saH('aside', { class:'sa-drawer-card', id:'saDrawerCard' })]);
  root.appendChild(drawer);
  var rc = document.getElementById('saRole'); if(rc){ var r = saIsSuper() ? saChip('최고관리자', 'super') : saChip('운영자', 'admin'); rc.appendChild(r); }
}
function saShow(k){
  saLeave(); SA.tab = k;
  document.querySelectorAll('#saNav button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-k') === k); });
  var main = document.getElementById('saMain'); saLoading(main);
  var fn = { dash:saDash, users:saUsers, withdrawals:saWithdrawals, reports:saReports, posts:saPosts, projects:saProjects, crawler:saCrawler, announce:saAnnounce, audit:saAudit, system:saSystem }[k];
  saCloseDrawer();
  fn(main);
  window.scrollTo(0, 0);
}
function saSetReportBadge(n){ SA.todo = n; var b = document.getElementById('saReportBadge'); if(b){ b.hidden = !n; b.textContent = n > 99 ? '99+' : n; } }
function saPanel(title, sub, kids, cls){
  return saH('section', { class:'sa-panel ' + (cls || '') }, [saH('div', { class:'sa-panel-h' }, [saH('h3', { text:title }), sub ? saH('span', { class:'sa-sub', text:sub }) : null])].concat(kids || []));
}

/* ----- 대시보드 ----- */
function saStat(label, val, hint, kind, go){
  var c = saH('div', { class:'sa-stat ' + (kind || '') + (go ? ' click' : ''), onclick:go }, [saH('span', { class:'sa-stat-l', text:label }), saH('b', { class:'sa-stat-v', text:saN(val) }), hint ? saH('span', { class:'sa-stat-h', text:hint }) : null]);
  return c;
}
function saBars(series, color){
  var max = Math.max.apply(null, series.map(function(s){ return s.count; }).concat([1]));
  var w = 100 / series.length, svg = '<svg viewBox="0 0 100 40" preserveAspectRatio="none" class="sa-bars" aria-hidden="true">';
  series.forEach(function(s, i){ var h = Math.max(s.count ? 3 : .8, s.count / max * 36); svg += '<rect x="' + (i * w + w * .16) + '" y="' + (40 - h) + '" width="' + (w * .68) + '" height="' + h + '" rx="1.2" fill="' + color + '" opacity="' + (s.count ? .92 : .25) + '"><title>' + s.date + ' · ' + s.count + '</title></rect>'; });
  var box = saH('div', { class:'sa-chart', html:svg + '</svg>' });
  box.appendChild(saH('div', { class:'sa-chart-x' }, [saH('span', { text:series[0].date.slice(5).replace('-', '/') }), saH('span', { text:series[series.length - 1].date.slice(5).replace('-', '/') })]));
  return box;
}
function saDash(main){
  saApi('/overview').then(function(o){
    saSetReportBadge(o.todo.reports);
    main.innerHTML = '';
    var sum = function(a){ return a.reduce(function(n, x){ return n + x.count; }, 0); };
    main.appendChild(saH('div', { class:'sa-stats' }, [
      saStat('전체 사용자', o.users.total, '이번 주 +' + saN(o.users.new_7d), 'blue', function(){ saShow('users'); }),
      saStat('오늘 가입', o.users.new_today, '', ''),
      saStat('지금 접속 중', o.users.online, '실시간 연결 기준', 'green'),
      saStat('정지된 계정', o.users.suspended, '', o.users.suspended ? 'red' : '', function(){ SA.state.users.state = 'suspended'; saShow('users'); }),
      saStat('최근 7일 탈퇴', o.users.withdrawn_7d, '탈퇴 기록은 7일 뒤 자동 삭제', '', function(){ saShow('withdrawals'); })
    ]));
    main.appendChild(saH('div', { class:'sa-todo' }, [
      saH('div', { class:'sa-todo-i' + (o.todo.reports ? ' warn' : ''), onclick:function(){ saShow('reports'); } }, [saH('b', { text:saN(o.todo.reports) }), saH('span', { text:'처리할 신고' })]),
      saH('div', { class:'sa-todo-i' + (o.todo.crawl_failed ? ' warn' : ''), onclick:function(){ saShow('crawler'); } }, [saH('b', { text:saN(o.todo.crawl_failed) }), saH('span', { text:'24시간 내 크롤링 실패' })])
    ]));
    main.appendChild(saH('div', { class:'sa-grid3' }, [
      saPanel('신규 가입', '최근 14일 · 합계 ' + saN(sum(o.series.users)), [saBars(o.series.users, '#3B82F6')]),
      saPanel('커뮤니티 글', '최근 14일 · 합계 ' + saN(sum(o.series.posts)), [saBars(o.series.posts, '#EC4899')]),
      saPanel('팀 채팅 메시지', '최근 14일 · 합계 ' + saN(sum(o.series.chat)), [saBars(o.series.chat, '#8B5CF6')])
    ]));
    var c = o.content;
    main.appendChild(saPanel('서비스 현황', '', [saH('div', { class:'sa-mini' }, [['프로젝트', c.projects], ['커뮤니티 글', c.posts], ['댓글', c.comments], ['채팅', c.chat], ['워크스페이스 파일', c.files], ['회의록', c.notes], ['수집된 행사', c.events]].map(function(x){ return saH('div', {}, [saH('b', { text:saN(x[1]) }), saH('span', { text:x[0] })]); }))]));
    var recentU = o.recent_users.map(function(u){ return saH('li', { class:'click', onclick:function(){ saShow('users'); saOpenUser(u.id); } }, [saAvatar(u.username, 28), saH('div', {}, [saH('b', { text:u.username }), saH('span', { text:u.email })]), saH('time', { text:saAgo(u.created_at) })]); });
    var recentA = o.recent_audit.map(function(a){ return saH('li', {}, [saH('div', { class:'sa-act-dot' }), saH('div', {}, [saH('b', { text:(SA_ACTIONS[a.action] || a.action) }), saH('span', { text:a.admin + (a.detail ? ' · ' + a.detail : '') })]), saH('time', { text:saAgo(a.created_at) })]); });
    main.appendChild(saH('div', { class:'sa-grid2' }, [
      saPanel('최근 가입자', '', [recentU.length ? saH('ul', { class:'sa-list' }, recentU) : saEmpty('아직 없어요.')]),
      saPanel('최근 관리자 활동', '', [recentA.length ? saH('ul', { class:'sa-list' }, recentA) : saEmpty('아직 기록이 없어요.')])
    ]));
  }).catch(function(e){ main.innerHTML = ''; main.appendChild(saEmpty(e.message || '불러오지 못했어요.')); });
}

/* ----- 사용자 ----- */
function saUsers(main){
  var st = SA.state.users; main.innerHTML = '';
  var list = saH('div', { id:'saUsersList' });
  main.appendChild(saH('div', { class:'sa-tools' }, [
    saSearch(st.q, '이름 또는 이메일 검색', function(v){ st.q = v; st.page = 1; saUsersLoad(); }),
    saSeg([['all', '전체'], ['active', '정상'], ['suspended', '정지'], ['admin', '운영자']], st.state, function(v){ st.state = v; st.page = 1; saUsers(main); })
  ]));
  main.appendChild(list); saUsersLoad();
}
function saUsersLoad(){
  var st = SA.state.users, box = document.getElementById('saUsersList'); if(!box) return;
  saApi('/users?q=' + encodeURIComponent(st.q) + '&state=' + st.state + '&page=' + st.page).then(function(r){
    box.innerHTML = '';
    var rows = r.items.map(function(u){
      var who = saH('div', { class:'sa-who' }, [saAvatar(u.username, 30), saH('div', {}, [saH('b', { text:u.username }), saH('span', { text:u.email })])]);
      var stat = saH('div', { class:'sa-stat-cell' }, [u.online ? saH('span', { class:'sa-online', title:'접속 중' }) : null, u.is_active ? saChip('정상', 'ok') : saChip('정지', 'bad'), saRoleChip(u.role)]);
      return { onclick:function(){ saOpenUser(u.id); }, cells:{ who:who, st:stat, joined:saWhen(u.created_at), seen:u.online ? '접속 중' : saAgo(u.last_seen_at), pj:u.projects + '개', posts:u.posts + '개' } };
    });
    box.appendChild(saTable([{ k:'who', t:'사용자' }, { k:'st', t:'상태' }, { k:'joined', t:'가입일' }, { k:'seen', t:'마지막 접속' }, { k:'pj', t:'프로젝트', cls:'num' }, { k:'posts', t:'글', cls:'num' }], rows, '조건에 맞는 사용자가 없어요.'));
    box.appendChild(saPager(r.total, r.page, r.size, function(p){ st.page = p; saUsersLoad(); }));
  }).catch(function(e){ box.innerHTML = ''; box.appendChild(saEmpty(e.message)); });
}
function saCloseDrawer(){ var d = document.getElementById('saDrawer'); if(d) d.classList.remove('open'); }
function saOpenUser(id){
  var d = document.getElementById('saDrawer'), card = document.getElementById('saDrawerCard'); if(!d) return;
  card.innerHTML = ''; card.appendChild(saH('div', { class:'sa-empty', html:'<span class="sa-spin"></span>불러오는 중…' })); d.classList.add('open');
  saApi('/users/' + id).then(function(u){
    card.innerHTML = '';
    card.appendChild(saH('button', { class:'sa-x', type:'button', 'aria-label':'닫기', html:saSvg('<path d="M6 6l12 12M18 6 6 18"/>', 16), onclick:saCloseDrawer }));
    card.appendChild(saH('div', { class:'sa-ud-head' }, [saAvatar(u.username, 54), saH('div', {}, [saH('h3', { text:u.username }), saH('span', { text:u.email }), saH('div', { class:'sa-stat-cell' }, [u.online ? saH('span', { class:'sa-online' }) : null, u.is_active ? saChip('정상', 'ok') : saChip('정지', 'bad'), saRoleChip(u.role)])])]));
    var info = [['가입', saWhen(u.created_at)], ['마지막 접속', u.online ? '접속 중' : saWhen(u.last_seen_at)], ['로그인 방식', u.provider || '이메일'], ['받은 신고', u.reports_received + '건']];
    card.appendChild(saH('dl', { class:'sa-dl' }, [].concat.apply([], info.map(function(x){ return [saH('dt', { text:x[0] }), saH('dd', { text:x[1] })]; }))));
    if(!u.is_active) card.appendChild(saH('div', { class:'sa-note bad' }, [saH('b', { text:'정지됨 · ' + saWhen(u.banned_at) }), saH('span', { text:u.ban_reason || '사유 없음' })]));
    card.appendChild(saH('h4', { text:'프로젝트 ' + u.projects.length }));
    card.appendChild(u.projects.length ? saH('ul', { class:'sa-list tight' }, u.projects.map(function(p){ return saH('li', {}, [saH('div', {}, [saH('b', { text:p.title }), saH('span', { text:p.role })])]); })) : saEmpty('참여 중인 프로젝트가 없어요.'));
    card.appendChild(saH('h4', { text:'최근 글' }));
    card.appendChild(u.posts.length ? saH('ul', { class:'sa-list tight' }, u.posts.map(function(p){ return saH('li', {}, [saH('div', {}, [saH('b', { text:p.title }), saH('span', { text:(SA_CATS[p.category] || p.category) + ' · ' + saWhen(p.created_at) })]), p.deleted ? saChip('삭제됨', 'bad') : p.hidden ? saChip('숨김', 'warn') : null]); })) : saEmpty('작성한 글이 없어요.'));
    if(u.audit.length){ card.appendChild(saH('h4', { text:'이 계정에 대한 조치' })); card.appendChild(saH('ul', { class:'sa-list tight' }, u.audit.map(function(a){ return saH('li', {}, [saH('div', {}, [saH('b', { text:SA_ACTIONS[a.action] || a.action }), saH('span', { text:a.admin + ' · ' + saWhen(a.created_at) + (a.detail ? ' · ' + a.detail : '') })])]); }))); }
    var act = saH('div', { class:'sa-ud-act' });
    var me = currentUser && currentUser.id === u.id, locked = u.role === 'super' || me || (u.role === 'admin' && !saIsSuper());
    if(locked){ act.appendChild(saH('span', { class:'sa-faint', text:me ? '내 계정에는 조치할 수 없어요.' : u.role === 'super' ? '최고관리자 계정은 건드릴 수 없어요.' : '운영자 계정은 최고관리자만 관리할 수 있어요.' })); }
    else if(u.is_active){ act.appendChild(saH('button', { class:'btn sa-danger', type:'button', text:'계정 정지', onclick:function(){ saConfirm({ title:u.username + ' 님을 정지할까요?', msg:'정지하면 바로 로그아웃되고 다시 로그인할 수 없어요. 사유는 기록으로 남아요.', input:{ placeholder:'정지 사유 (예: 반복적인 광고 게시)', required:true }, ok:'정지하기', danger:true }, function(reason){ saPost('/users/' + u.id + '/suspend', { reason:reason }).then(function(){ pushToast('🚫', '정지했어요', u.username); saOpenUser(u.id); saUsersLoad(); }).catch(saErr); }); } })); }
    else { act.appendChild(saH('button', { class:'btn primary', type:'button', text:'정지 해제', onclick:function(){ saPost('/users/' + u.id + '/unsuspend').then(function(){ pushToast('✅', '정지를 풀었어요', u.username); saOpenUser(u.id); saUsersLoad(); }).catch(saErr); } })); }
    if(saIsSuper() && !locked && u.is_active){
      var on = u.role === 'admin';
      act.appendChild(saH('button', { class:'btn', type:'button', text:on ? '운영자 해제' : '운영자로 지정', onclick:function(){ saConfirm({ title:u.username + (on ? ' 님의 운영자 권한을 해제할까요?' : ' 님을 운영자로 지정할까요?'), msg:on ? '관리자 페이지에 더 이상 들어갈 수 없어요.' : '신고·콘텐츠·크롤러·공지를 관리하고 일반 사용자를 정지할 수 있어요.', ok:on ? '해제' : '지정' }, function(){ saPost('/users/' + u.id + '/role', { is_admin:!on }).then(function(){ pushToast('🛡️', on ? '운영자를 해제했어요' : '운영자로 지정했어요', u.username); saOpenUser(u.id); saUsersLoad(); }).catch(saErr); }); } }));
    }
    if(!locked){
      act.appendChild(saH('button', { class:'btn sa-danger sa-del', type:'button', text:'계정 삭제', title:'쓰지 않는 유령 계정을 정리할 때', onclick:function(){
        saConfirm({ title:u.username + ' 계정을 삭제할까요?', msg:'본인이 탈퇴한 것과 똑같이 처리돼요: 계정 정보와 개인 데이터가 삭제되고, 혼자 쓰던 프로젝트는 통째로 삭제되며, 팀원이 있는 프로젝트는 팀장이 넘어가요. 되돌릴 수 없어요. 처리 기록은 탈퇴 기록에 7일간 남아요.', input:{ placeholder:'삭제 사유 (예: 사용하지 않는 게스트 계정)', required:true }, ok:'삭제하기', danger:true }, function(reason){
          saPost('/users/' + u.id + '/delete', { reason:reason }).then(function(){ pushToast('🗑️', '계정을 삭제했어요', u.username); saCloseDrawer(); saUsersLoad(); }).catch(saErr);
        });
      } }));
    }
    card.appendChild(act);
  }).catch(function(e){ card.innerHTML = ''; card.appendChild(saEmpty(e.message)); });
}

/* ----- 탈퇴 기록 (최근 7일) ----- */
function saWithdrawals(main){
  main.innerHTML = '';
  saApi('/withdrawals').then(function(r){
    main.appendChild(saH('div', { class:'sa-note info' }, [saH('b', { text:'탈퇴 기록은 ' + r.keep_days + '일 동안만 보관돼요' }), saH('span', { text:'문의 대응과 부정 이용 확인을 위해서예요. 이메일은 일부만 보이고, ' + r.keep_days + '일이 지나면 이 목록에서도 자동으로 사라져요. 탈퇴한 계정은 복구할 수 없어요.' })]));
    var list = saH('div', { class:'sa-wds' });
    r.items.forEach(function(w){
      var s = w.summary || {}, parts = [];
      if(s.projects_deleted) parts.push('프로젝트 ' + s.projects_deleted + '개 삭제');
      if(s.projects_transferred) parts.push('팀장 ' + s.projects_transferred + '곳 이전');
      if(s.left_projects) parts.push('참여 ' + s.left_projects + '곳에서 나감');
      if(s.posts || s.comments) parts.push('글 ' + (s.posts || 0) + '개 · 댓글 ' + (s.comments || 0) + '개 삭제');
      if(s.runs) parts.push('실행 기록 ' + s.runs + '개 삭제');
      var left = w.days_left <= 1 ? (w.hours_left < 1 ? '곧 삭제' : w.hours_left + '시간 남음') : w.days_left + '일 남음';
      var dl = function(k, v){ return saH('div', {}, [saH('dt', { text:k }), saH('dd', { text:v })]); };
      list.appendChild(saH('article', { class:'sa-wd' }, [
        saH('div', { class:'sa-wd-top' }, [saAvatar(w.username || '?', 34), saH('div', { class:'sa-wd-who' }, [saH('b', { text:w.username || '(이름 없음)' }), saH('span', { text:w.email + (w.provider ? ' · ' + w.provider : '') })]),
          saH('div', { class:'sa-wd-tags' }, [w.by === 'admin' ? saChip('관리자 삭제' + (w.by_admin ? ' · ' + w.by_admin : ''), 'warn') : saChip('본인 탈퇴', ''), saChip(left, w.days_left <= 1 ? 'bad' : 'warn')])]),
        saH('dl', { class:'sa-wd-dl' }, [dl('가입', saWhen(w.joined_at)), dl('탈퇴', saWhen(w.withdrawn_at)), dl('사유', (w.reason || (w.by === 'admin' ? '관리자 삭제' : '사유 없음')) + (w.reason_text ? ' · ' + w.reason_text : '')), dl('처리 내용', parts.length ? parts.join(' · ') : '정리할 데이터 없음')])
      ]));
    });
    main.appendChild(saPanel('최근 ' + r.keep_days + '일 탈퇴 ' + r.total + '명', '', [r.items.length ? list : saEmpty('최근 ' + r.keep_days + '일 안에 탈퇴한 계정이 없어요.')]));
  }).catch(function(e){ main.innerHTML = ''; main.appendChild(saEmpty(e.message || '불러오지 못했어요.')); });
}

/* ----- 신고 ----- */
function saReports(main){
  var st = SA.state.reports; main.innerHTML = '';
  var list = saH('div', { id:'saRepList', class:'sa-cards' });
  main.appendChild(saH('div', { class:'sa-tools' }, [saSeg([['open', '처리 대기'], ['resolved', '조치함'], ['dismissed', '기각']], st.status, function(v){ st.status = v; saReports(main); })]));
  main.appendChild(list);
  saApi('/reports?status=' + st.status).then(function(r){
    if(st.status === 'open') saSetReportBadge(r.total);
    list.innerHTML = '';
    if(!r.items.length){ list.appendChild(saEmpty(st.status === 'open' ? '처리할 신고가 없어요. 🎉' : '내역이 없어요.')); return; }
    r.items.forEach(function(g){
      var t = g.target || { title:'(삭제된 대상)', body:'', author:'—', category:'' };
      var card = saH('article', { class:'sa-rep' }, [
        saH('div', { class:'sa-rep-top' }, [saH('span', { class:'sa-rep-n', text:'신고 ' + g.count }), saChip(SA_CATS[t.category] || '글', ''), t.hidden ? saChip('숨김', 'warn') : null, t.deleted ? saChip('삭제됨', 'bad') : null, saH('time', { text:saAgo(g.last_at) })]),
        saH('h4', { text:t.title }), saH('p', { class:'sa-rep-body', text:t.body || '' }),
        saH('div', { class:'sa-rep-meta' }, [saH('span', { text:'작성자 ' + t.author }), g.reasons.length ? saH('span', { text:'사유: ' + g.reasons.join(' · ') }) : null])
      ]);
      var act = saH('div', { class:'sa-rep-act' });
      var go = function(action, label, msg){ return function(){ saConfirm({ title:label + '할까요?', msg:msg, ok:label, danger:action === 'delete' }, function(){ saPost('/reports/' + g.target_type + '/' + g.target_id + '/resolve', { action:action }).then(function(){ pushToast('✅', label + ' 완료', t.title); saReports(main); }).catch(saErr); }); }; };
      if(st.status === 'open'){
        if(g.target_type === 'post') act.appendChild(saH('button', { class:'btn', type:'button', text:'숨김', onclick:go('hide', '숨김', '목록에서 가려져요. 나중에 복구할 수 있어요.') }));
        act.appendChild(saH('button', { class:'btn sa-danger', type:'button', text:'삭제', onclick:go('delete', '삭제', '글이 삭제 처리돼요. (복구 가능)') }));
        act.appendChild(saH('button', { class:'btn', type:'button', text:'문제없음(기각)', onclick:go('dismiss', '기각', '신고를 기각하고 신고 횟수를 0으로 되돌려요.') }));
      } else if(t.deleted || t.hidden){ act.appendChild(saH('button', { class:'btn', type:'button', text:'복구', onclick:go('restore', '복구', '글을 다시 보이게 해요.') })); }
      if(g.target_type === 'post' || t.post_id) act.appendChild(saH('a', { class:'btn ghost', href:'/app/community/' + t.post_id, target:'_blank', rel:'noopener', text:'글 보기' }));
      card.appendChild(act); list.appendChild(card);
    });
  }).catch(function(e){ list.innerHTML = ''; list.appendChild(saEmpty(e.message)); });
}

/* ----- 커뮤니티 글 ----- */
function saPosts(main){
  var st = SA.state.posts; main.innerHTML = '';
  var list = saH('div', { id:'saPostList' });
  main.appendChild(saH('div', { class:'sa-tools' }, [saSearch(st.q, '제목·내용 검색', function(v){ st.q = v; st.page = 1; saPostsLoad(); }), saSeg([['all', '전체'], ['reported', '신고됨'], ['hidden', '숨김'], ['deleted', '삭제'], ['pinned', '고정']], st.state, function(v){ st.state = v; st.page = 1; saPosts(main); })]));
  main.appendChild(list); saPostsLoad();
}
function saPostsLoad(){
  var st = SA.state.posts, box = document.getElementById('saPostList'); if(!box) return;
  saApi('/posts?q=' + encodeURIComponent(st.q) + '&state=' + st.state + '&page=' + st.page).then(function(r){
    box.innerHTML = '';
    var rows = r.items.map(function(p){
      var flags = saH('div', { class:'sa-stat-cell' }, [p.pinned ? saChip('고정', 'ok') : null, p.hidden ? saChip('숨김', 'warn') : null, p.deleted ? saChip('삭제', 'bad') : null, p.reports ? saChip('신고 ' + p.reports, 'warn') : null]);
      var acts = saH('div', { class:'sa-rowact' });
      var mk = function(label, action, cls){ return saH('button', { class:'btn ' + (cls || ''), type:'button', text:label, onclick:function(e){ e.stopPropagation(); var run = function(){ saPost('/posts/' + p.id + '/action', { action:action }).then(function(){ saPostsLoad(); }).catch(saErr); }; if(action === 'delete') saConfirm({ title:'글을 삭제할까요?', msg:p.title, ok:'삭제', danger:true }, run); else run(); } }); };
      acts.appendChild(mk(p.pinned ? '고정 해제' : '고정', p.pinned ? 'unpin' : 'pin'));
      acts.appendChild(mk(p.hidden ? '숨김 해제' : '숨김', p.hidden ? 'unhide' : 'hide'));
      acts.appendChild(p.deleted ? mk('복구', 'restore') : mk('삭제', 'delete', 'sa-danger'));
      acts.appendChild(saH('a', { class:'btn ghost', href:'/app/community/' + p.id, target:'_blank', rel:'noopener', text:'보기', onclick:function(e){ e.stopPropagation(); } }));
      return { cells:{ title:saH('div', { class:'sa-who' }, [saH('div', {}, [saH('b', { text:p.title }), saH('span', { text:(SA_CATS[p.category] || p.category) + ' · ' + p.author })])]), flags:flags, stats:'♥ ' + p.likes + ' · 💬 ' + p.comments, at:saWhen(p.created_at), act:acts } };
    });
    box.appendChild(saTable([{ k:'title', t:'글' }, { k:'flags', t:'상태' }, { k:'stats', t:'반응' }, { k:'at', t:'작성' }, { k:'act', t:'' }], rows, '조건에 맞는 글이 없어요.'));
    box.appendChild(saPager(r.total, r.page, r.size, function(p){ st.page = p; saPostsLoad(); }));
  }).catch(function(e){ box.innerHTML = ''; box.appendChild(saEmpty(e.message)); });
}

/* ----- 프로젝트 (보기 전용) ----- */
function saProjects(main){
  var st = SA.state.projects; main.innerHTML = '';
  var list = saH('div', { id:'saProjList' });
  main.appendChild(saH('div', { class:'sa-tools' }, [saSearch(st.q, '프로젝트 이름 검색', function(v){ st.q = v; st.page = 1; saProjectsLoad(); }), saH('span', { class:'sa-faint', text:'개인정보 보호를 위해 프로젝트 안의 파일·채팅 내용은 볼 수 없어요.' })]));
  main.appendChild(list); saProjectsLoad();
}
function saProjectsLoad(){
  var st = SA.state.projects, box = document.getElementById('saProjList'); if(!box) return;
  saApi('/projects?q=' + encodeURIComponent(st.q) + '&page=' + st.page).then(function(r){
    box.innerHTML = '';
    var rows = r.items.map(function(p){ return { cells:{ t:saH('div', { class:'sa-who' }, [saH('div', {}, [saH('b', { text:p.title }), saH('span', { text:'팀장 ' + p.owner + ' · ' + p.owner_email })])]), m:p.members + '명', f:p.files + '개', c:saN(p.chat) + '건', last:p.last_chat_at ? saAgo(p.last_chat_at) : '—', at:saWhen(p.created_at) } }; });
    box.appendChild(saTable([{ k:'t', t:'프로젝트' }, { k:'m', t:'팀원', cls:'num' }, { k:'f', t:'파일', cls:'num' }, { k:'c', t:'채팅', cls:'num' }, { k:'last', t:'마지막 채팅' }, { k:'at', t:'생성' }], rows, '프로젝트가 없어요.'));
    box.appendChild(saPager(r.total, r.page, r.size, function(p){ st.page = p; saProjectsLoad(); }));
  }).catch(function(e){ box.innerHTML = ''; box.appendChild(saEmpty(e.message)); });
}

/* ----- 행사 크롤러 ----- */
function saCrawler(main){
  var load = function(){
    saApi('/crawler').then(function(c){
      var keep = main.scrollTop; main.innerHTML = '';
      var run = saH('button', { class:'btn primary', type:'button', text:c.running ? '수집 중…' : '지금 수집하기', onclick:function(){ saPost('/crawler/run').then(function(r){ pushToast(r.started ? '🌐' : 'ℹ️', r.started ? '수집을 시작했어요' : '안내', r.message); setTimeout(load, 800); }).catch(saErr); } });
      run.disabled = c.running;
      main.appendChild(saPanel('수집 상태', '', [
        saH('div', { class:'sa-crawl-top' }, [
          saH('div', { class:'sa-stat-cell' }, [c.running ? saChip('수집 중', 'warn') : saChip('대기', 'ok'), c.enabled ? saChip('자동 수집 켜짐 · ' + c.interval_hours + '시간마다', '') : saChip('자동 수집 꺼짐', 'bad')]), run]),
        saH('div', { class:'sa-mini' }, [saH('div', {}, [saH('b', { text:saN(c.total_events) }), saH('span', { text:'전체 행사' })])].concat(c.sources.map(function(s){ return saH('div', {}, [saH('b', { text:saN(c.by_source[s.key] || 0) }), saH('span', { text:s.label })]); })))
      ]));
      var rows = c.runs.map(function(r){
        var secs = r.finished_at && r.started_at ? Math.max(0, Math.round((ntDate(r.finished_at) - ntDate(r.started_at)) / 1000)) : null;
        return { cells:{ src:r.label, at:saWhen(r.started_at), dur:secs == null ? '진행 중' : secs + '초', res:r.finished_at ? (r.ok ? saChip('성공', 'ok') : saChip('실패', 'bad')) : saChip('진행 중', 'warn'), n:r.found + ' / +' + r.added + ' / ~' + r.updated, tr:r.trigger === 'manual' ? '수동' : '자동', err:r.error ? saH('span', { class:'sa-err', text:r.error.slice(0, 140), title:r.error }) : '' } };
      });
      main.appendChild(saPanel('실행 기록', '최근 40회 · 발견 / 추가 / 갱신', [saTable([{ k:'src', t:'출처' }, { k:'at', t:'시작' }, { k:'dur', t:'소요', cls:'num' }, { k:'res', t:'결과' }, { k:'n', t:'발견/추가/갱신' }, { k:'tr', t:'방식' }, { k:'err', t:'오류' }], rows, '아직 실행 기록이 없어요.')]));
      var evBox = saH('div', { id:'saEvList' });
      main.appendChild(saPanel('수집된 행사', '잘못 수집된 행사를 지울 수 있어요 (다음 수집 때 같은 행사가 다시 올 수 있어요)', [saH('div', { class:'sa-tools' }, [saSearch(SA.state.events.q, '행사 이름·주최 검색', function(v){ SA.state.events.q = v; SA.state.events.page = 1; saEventsLoad(); })]), evBox]));
      saEventsLoad();
      if(c.running){ clearInterval(SA.timers.crawl); SA.timers.crawl = setInterval(function(){ if(SA.tab !== 'crawler'){ clearInterval(SA.timers.crawl); return; } load(); }, 4000); } else clearInterval(SA.timers.crawl);
      main.scrollTop = keep;
    }).catch(function(e){ main.innerHTML = ''; main.appendChild(saEmpty(e.message)); });
  };
  load();
}
function saEventsLoad(){
  var st = SA.state.events, box = document.getElementById('saEvList'); if(!box) return;
  saApi('/events?q=' + encodeURIComponent(st.q) + '&page=' + st.page).then(function(r){
    box.innerHTML = '';
    var rows = r.items.map(function(e){
      var del = saH('button', { class:'btn sa-danger', type:'button', text:'삭제', onclick:function(){ saConfirm({ title:'행사를 삭제할까요?', msg:e.title, ok:'삭제', danger:true }, function(){ saApi('/events/' + e.id, { method:'DELETE' }).then(function(){ saEventsLoad(); }).catch(saErr); }); } });
      return { cells:{ t:saH('div', { class:'sa-who' }, [saH('div', {}, [saH('b', { text:e.title }), saH('span', { text:(e.host || '주최 미상') + ' · ' + e.category })])]), src:e.source, dl:e.deadline || '—', link:saH('a', { class:'btn ghost', href:e.url, target:'_blank', rel:'noopener noreferrer', text:'원문' }), act:del } };
    });
    box.appendChild(saTable([{ k:'t', t:'행사' }, { k:'src', t:'출처' }, { k:'dl', t:'마감' }, { k:'link', t:'' }, { k:'act', t:'' }], rows, '행사가 없어요.'));
    box.appendChild(saPager(r.total, r.page, r.size, function(p){ st.page = p; saEventsLoad(); }));
  }).catch(function(e){ box.innerHTML = ''; box.appendChild(saEmpty(e.message)); });
}

/* ----- 공지 ----- */
function saAnnounce(main){
  main.innerHTML = '';
  var title = saH('input', { class:'sa-input', maxlength:'120', placeholder:'제목 (예: 오늘 밤 12시 점검 안내)' });
  var msg = saH('textarea', { class:'sa-input', rows:'4', maxlength:'1000', placeholder:'내용' });
  var link = saH('input', { class:'sa-input', maxlength:'300', placeholder:'눌렀을 때 이동할 주소 (선택) 예: /app/community' });
  var prev = saH('div', { class:'sa-prev' });
  var draw = function(){ prev.innerHTML = ''; prev.appendChild(saH('div', { class:'sa-prev-card' }, [saH('span', { class:'nic', html:ntIcon('notice', 18) }), saH('div', {}, [saH('b', { text:'📢 ' + (title.value.trim() || '제목이 여기에 보여요')}), saH('p', { text:msg.value.trim() || '내용이 여기에 보여요.' })])])); };
  [title, msg, link].forEach(function(i){ i.oninput = draw; }); draw();
  var send = saH('button', { class:'btn primary', type:'button', text:'모든 사용자에게 보내기', onclick:function(){
    if(!title.value.trim() || !msg.value.trim()){ pushToast('⚠️', '제목과 내용을 입력해 주세요', ''); return; }
    saConfirm({ title:'공지를 보낼까요?', msg:'정지되지 않은 모든 사용자의 알림함으로 전달되고, 접속 중인 사람에게는 바로 알림이 떠요. 보낸 뒤에는 취소할 수 없어요.', ok:'보내기' }, function(){
      saPost('/announcements', { title:title.value.trim(), message:msg.value.trim(), link:link.value.trim() || null }).then(function(r){ pushToast('📢', '공지를 보냈어요', saN(r.sent_count) + '명에게 전달했어요.'); saAnnounce(main); }).catch(saErr);
    });
  } });
  main.appendChild(saH('div', { class:'sa-grid2' }, [
    saPanel('새 공지', '알림으로 전달돼요', [saH('div', { class:'sa-form' }, [saH('label', { text:'제목' }), title, saH('label', { text:'내용' }), msg, saH('label', { text:'링크' }), link, send])]),
    saPanel('미리보기', '받는 사람에게 이렇게 보여요', [prev])
  ]));
  var hist = saH('div'); main.appendChild(saPanel('보낸 공지', '', [hist]));
  saApi('/announcements').then(function(r){
    hist.innerHTML = '';
    hist.appendChild(r.items.length ? saH('ul', { class:'sa-list' }, r.items.map(function(a){ return saH('li', {}, [saH('div', {}, [saH('b', { text:a.title }), saH('span', { text:a.message.slice(0, 120) })]), saH('div', { class:'sa-right' }, [saH('b', { text:saN(a.sent_count) + '명' }), saH('time', { text:saWhen(a.created_at) + ' · ' + (a.by || '—') })])]); })) : saEmpty('아직 보낸 공지가 없어요.'));
  }).catch(function(e){ hist.innerHTML = ''; hist.appendChild(saEmpty(e.message)); });
}

/* ----- 감사 로그 ----- */
function saAudit(main){
  var st = SA.state.audit; main.innerHTML = '';
  var list = saH('div', { id:'saAuditList' });
  main.appendChild(saH('div', { class:'sa-tools' }, [saSearch(st.q, '작업·관리자·내용 검색', function(v){ st.q = v; st.page = 1; saAuditLoad(); }), saH('span', { class:'sa-faint', text:'관리자가 한 모든 조치가 기록돼요. 이 기록은 고치거나 지울 수 없어요.' })]));
  main.appendChild(list); saAuditLoad();
}
function saAuditLoad(){
  var st = SA.state.audit, box = document.getElementById('saAuditList'); if(!box) return;
  saApi('/audit?q=' + encodeURIComponent(st.q) + '&page=' + st.page).then(function(r){
    box.innerHTML = '';
    var rows = r.items.map(function(a){ return { cells:{ at:saWhen(a.created_at), who:saH('div', { class:'sa-who' }, [saAvatar(a.admin, 24), saH('b', { text:a.admin })]), act:saChip(SA_ACTIONS[a.action] || a.action, ''), d:a.detail || (a.target_type ? a.target_type + ' #' + a.target_id : '') } }; });
    box.appendChild(saTable([{ k:'at', t:'시간' }, { k:'who', t:'관리자' }, { k:'act', t:'작업' }, { k:'d', t:'내용' }], rows, '기록이 없어요.'));
    box.appendChild(saPager(r.total, r.page, r.size, function(p){ st.page = p; saAuditLoad(); }));
  }).catch(function(e){ box.innerHTML = ''; box.appendChild(saEmpty(e.message)); });
}

/* ----- 시스템 ----- */
function saSystem(main){
  saApi('/system').then(function(s){
    main.innerHTML = '';
    main.appendChild(saH('div', { class:'sa-stats' }, [
      saStat('가동 시간', 0, saDur(s.uptime_seconds), ''), saStat('실시간 접속자', s.ws_users, '연결 ' + s.ws_connections + '개', 'green'),
      saStat('DB', 0, s.db_engine + ' · ' + saBytes(s.db_size_bytes), '')
    ]));
    main.querySelectorAll('.sa-stat-v')[0].textContent = saDur(s.uptime_seconds); main.querySelectorAll('.sa-stat-v')[2].textContent = saBytes(s.db_size_bytes);
    var max = Math.max.apply(null, Object.keys(s.tables).map(function(k){ return s.tables[k]; }).concat([1]));
    var labels = { users:'사용자', projects:'프로젝트', chat_messages:'채팅 메시지', project_files:'워크스페이스 파일', meeting_docs:'회의록', calendar_events:'일정', notifications:'알림', community_posts:'커뮤니티 글', crawled_events:'수집된 행사', audit_logs:'감사 로그' };
    main.appendChild(saPanel('데이터 규모', '테이블별 행 수', [saH('div', { class:'sa-bar-list' }, Object.keys(s.tables).map(function(k){ var f = saH('i'); f.style.width = Math.max(2, s.tables[k] / max * 100) + '%'; return saH('div', {}, [saH('span', { text:labels[k] || k }), saH('div', { class:'sa-bar' }, [f]), saH('b', { text:saN(s.tables[k]) })]); }))]));
    if(saIsSuper()){
      var cur = saH('input', { class:'sa-input', type:'password', inputmode:'numeric', maxlength:'6', placeholder:'현재 코드 6자리', autocomplete:'off' });
      var nw = saH('input', { class:'sa-input', type:'password', inputmode:'numeric', maxlength:'6', placeholder:'새 코드 6자리', autocomplete:'off' });
      var nw2 = saH('input', { class:'sa-input', type:'password', inputmode:'numeric', maxlength:'6', placeholder:'새 코드 한 번 더', autocomplete:'off' });
      [cur, nw, nw2].forEach(function(i){ i.oninput = function(){ i.value = i.value.replace(/\D/g, '').slice(0, 6); }; });
      var go = saH('button', { class:'btn primary', type:'button', text:'코드 변경', onclick:function(){
        if(cur.value.length !== 6 || nw.value.length !== 6){ pushToast('⚠️', '6자리 숫자를 입력해 주세요', ''); return; }
        if(nw.value !== nw2.value){ pushToast('⚠️', '새 코드가 서로 달라요', '두 칸에 같은 코드를 입력해 주세요.'); return; }
        saConfirm({ title:'관리자 코드를 바꿀까요?', msg:'바꾸면 지금 다른 곳에 열려 있는 관리자 페이지는 모두 닫히고, 새 코드로 다시 들어와야 해요.', ok:'변경' }, function(){
          saApi('/gate/change', { method:'POST', body:JSON.stringify({ current:cur.value, new:nw.value }) }).then(function(r){ saSetToken(r.token); pushToast('🛡️', '관리자 코드를 바꿨어요', '다른 접속은 모두 해제됐어요.'); cur.value = nw.value = nw2.value = ''; }).catch(saErr);
        });
      } });
      main.appendChild(saPanel('보안 · 관리자 코드', '최고관리자만 바꿀 수 있어요', [saH('div', { class:'sa-form sa-form-row' }, [saH('div', { class:'sa-faint', text:'관리자 페이지를 열 때 입력하는 6자리 코드예요. 잊어버렸다면 서버에서 scripts/reset_admin_code.py 로 지우고 다시 정할 수 있어요.' }), cur, nw, nw2, go])]));
    }
    var fl = s.flags;
    main.appendChild(saPanel('서버 설정 (읽기 전용)', '비밀 값은 표시하지 않아요', [saH('ul', { class:'sa-list tight' }, [
      ['외부 공유 모드', fl.PUBLIC_MODE ? '켜짐' : '꺼짐', !fl.PUBLIC_MODE], ['행사 자동 수집', fl.EVENT_CRAWL_ENABLED ? '켜짐' : '꺼짐', fl.EVENT_CRAWL_ENABLED], ['개발용 이메일 로그인', fl.ALLOW_DEV_LOGIN ? '켜짐 (위험)' : '꺼짐', !fl.ALLOW_DEV_LOGIN], ['최고관리자 지정(ADMIN_EMAILS)', fl.ADMIN_EMAILS_SET ? '설정됨' : '미설정', fl.ADMIN_EMAILS_SET]
    ].map(function(x){ return saH('li', {}, [saH('div', {}, [saH('b', { text:x[0] })]), saChip(x[1], x[2] ? 'ok' : 'warn')]); }))]));
  }).catch(function(e){ main.innerHTML = ''; main.appendChild(saEmpty(e.message)); });
}

/* ----- 접근 표시 (메뉴 · 배지) ----- */
function saSyncAccess(){
  var ok = !!(currentUser && currentUser.is_admin);
  var b = document.getElementById('avatarAdminBtn'); if(b) b.hidden = !ok;
  var hr = document.getElementById('avatarAdminSep'); if(hr) hr.hidden = !ok;
  var badge = document.getElementById('adminBadge'); if(badge){ badge.hidden = !ok; badge.textContent = currentUser && currentUser.is_super ? '최고관리자' : '운영자'; }
  isAdmin = ok; if(!ok) saSetToken('');
  if(ok && !SA.pollOnce){ SA.pollOnce = true; saApi('/overview').then(function(o){ saSetReportBadge(o.todo.reports); if(o.todo.reports){ var ab = document.getElementById('avatarAdminBtn'); if(ab && !ab.querySelector('.sa-dot')) ab.appendChild(saH('i', { class:'sa-dot' })); } }).catch(function(){}); }
}
