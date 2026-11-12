/* ---- 회의록 시트: 작성 · 보기 · 수정이 같은 모양, 같은 편집기 ----
   · 작성 창(composeModal)과 보기/수정 서랍(mdocDrawer)이 같은 부품(제목 · 속성 줄 · 도구 막대 · 편집기 · AI 미리보기)을 쓴다.
   · 편집기에서 '취소선'으로 지운 줄은 서버로 ~~글~~ 로 전달돼 AI 가 일정으로 만들지 않는다.
   · 쓰는 동안 오른쪽에서 'AI 가 지금 이렇게 읽고 있어요'(찾은 일정 · 취소로 본 줄)를 보여 준다 (규칙 기반이라 AI 한도를 쓰지 않는다).
   · 임시저장은 실제로 이 기기에 저장되고, 다시 열면 이어 쓴다. */
var NS_SEC = [
  { key: 'others',    ic: 'chat',   title: '논의 내용',   cls: 'sec-other',    re: /논의/ },
  { key: 'decisions', ic: 'checkc', title: '결정 사항',   cls: 'sec-decision', re: /결정/ },
  { key: 'actions',   ic: 'tasks',  title: '액션 아이템', cls: 'sec-action',   re: /액션|할\s*일/ }
];
var NS_DRAFT_KEY = 'sync_note_draft';
var NS = { pv: {}, draftT: null, built: false, editingId: null };

/* ---------- 공통 부품 ---------- */
function nsSheetHtml(pre, opt){
  opt = opt || {};
  var tool = function(f, label, title){ return '<button type="button" data-f="' + f + '" title="' + title + '" onmousedown="event.preventDefault()" onclick="nsFmt(\'' + pre + '\',\'' + f + '\')">' + label + '</button>'; };
  return '<div class="ns' + (opt.compact ? ' compact' : '') + '">' +
    '<input type="text" class="ns-title" id="' + pre + 'Title" placeholder="회의 제목을 입력하세요" maxlength="120" autocomplete="off">' +
    '<div class="ns-props">' +
      '<div class="ns-prop"><span class="ns-pl">' + uiIc('folder', 14) + ' 프로젝트</span><select id="' + pre + 'Project" class="mdoc-select" onchange="nsProjectChanged(\'' + pre + '\')"></select></div>' +
      '<div class="ns-prop"><span class="ns-pl">' + uiIc('calendar', 14) + ' 날짜</span>' + (opt.dateEditable ? '<input type="date" id="' + pre + 'Date" class="ns-date">' : '<span class="ns-dateval" id="' + pre + 'DateText"></span>') + '</div>' +
      '<div class="ns-prop wide"><span class="ns-pl">' + uiIc('team', 14) + ' 참석자</span><div class="attendee-picker" id="' + pre + 'Attendees"></div></div>' +
    '</div>' +
    '<div class="ns-main">' +
      '<div class="ns-write">' +
        '<div class="ns-bar" role="toolbar" aria-label="서식">' +
          tool('h3', '<b>H</b> 제목', '제목') + tool('ul', '• 글머리', '글머리 기호') + tool('check', uiIc('checkc', 14) + ' 체크', '체크리스트') + tool('hr', '― 구분선', '구분선') +
          '<span class="ns-bar-sep"></span>' + tool('strike', uiIc('strike', 14) + ' 취소선', '취소된 내용은 취소선으로 — AI 가 일정으로 만들지 않아요') + tool('tmpl', uiIc('tasks', 14) + ' 논의·결정·액션 칸', '논의 / 결정 / 액션 아이템 칸 넣기') +
        '</div>' +
        '<div class="note-editor-wrap">' +
          '<div class="slash-menu" id="' + pre + 'Slash">' +
            '<button type="button" onclick="nsSlash(\'' + pre + '\',\'h3\')"><b>H</b> 제목</button><button type="button" onclick="nsSlash(\'' + pre + '\',\'ul\')">• 글머리 기호</button>' +
            '<button type="button" onclick="nsSlash(\'' + pre + '\',\'check\')">' + uiIc('checkc', 14) + ' 체크리스트</button><button type="button" onclick="nsSlash(\'' + pre + '\',\'strike\')">' + uiIc('strike', 14) + ' 취소선</button><button type="button" onclick="nsSlash(\'' + pre + '\',\'hr\')">― 구분선</button>' +
          '</div>' +
          '<div class="note-editor ns-editor" id="' + pre + 'Editor" contenteditable="true" spellcheck="false" data-placeholder="' + escAttr(opt.placeholder || '회의 내용을 자유롭게 적어 보세요.\n예) 햄버거 땡땡 금요일까지 · 민수 로그인 구현 ~다음주 월 · 중간발표 11/20 2시') + '"></div>' +
        '</div>' +
        '<div class="ns-hint"><span>' + uiIc('bulb', 13) + ' 짧게 적어도 돼요. 취소한 일은 <s>취소선</s>으로 지우거나 “취소”라고 적으면 일정에서 빠져요.</span><span class="ns-count" id="' + pre + 'Count"></span></div>' +
      '</div>' +
      '<aside class="ns-ai" id="' + pre + 'Ai" aria-live="polite"></aside>' +
    '</div>' +
  '</div>';
}
function nsEl(id){ return document.getElementById(id); }
function nsFillProjects(pre, selected){
  var sel = nsEl(pre + 'Project'); sel.innerHTML = '';
  myProjects.forEach(function(p){ var o = document.createElement('option'); o.value = p.id; o.textContent = p.title; if(p.id === selected) o.selected = true; sel.appendChild(o); });
  if(!myProjects.length){ var none = document.createElement('option'); none.value = ''; none.textContent = '프로젝트 없음'; sel.appendChild(none); }
}
function nsBuildAttendees(pre, projId, selected){
  var box = nsEl(pre + 'Attendees'); box.innerHTML = '';
  var pr = calApiMode ? calProjectById(projId) : null;
  var names = (pr && pr.members && pr.members.length) ? pr.members.map(function(m){ return m.username; }) : [(typeof myProfile !== 'undefined' && myProfile.name) || '나'];
  (selected || []).forEach(function(n){ if(names.indexOf(n) < 0) names.push(n); });       // 프로젝트를 떠난 사람도 기록된 참석자는 그대로 둔다
  names.forEach(function(nm){
    var chip = document.createElement('button'); chip.type = 'button';
    chip.className = 'member-chip' + ((!selected || selected.indexOf(nm) >= 0) ? ' active' : ''); chip.dataset.name = nm;
    chip.onclick = function(){ chip.classList.toggle('active'); };
    var dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = chatColor(nm);
    chip.appendChild(dot); chip.append(nm); box.appendChild(chip);
  });
}
function nsProjectChanged(pre){ nsBuildAttendees(pre, nsEl(pre + 'Project').value, null); nsPreviewSoon(pre); if(pre === 'ns') nsDraftSoon(); }
function nsAttendees(pre){ return Array.from(document.querySelectorAll('#' + pre + 'Attendees .member-chip.active')).map(function(c){ return c.dataset.name; }); }

/* 편집기: 서식 */
function nsFmt(pre, type){
  var ed = nsEl(pre + 'Editor'); ed.focus();
  if(type === 'h3'){ document.execCommand('formatBlock', false, (document.queryCommandValue('formatBlock') || '').toLowerCase() === 'h3' ? 'P' : 'H3'); }
  else if(type === 'ul'){ document.execCommand('insertUnorderedList'); }
  else if(type === 'check'){ document.execCommand('insertText', false, '☐ '); }
  else if(type === 'hr'){ document.execCommand('insertHorizontalRule'); }
  else if(type === 'strike'){ document.execCommand('strikeThrough'); }
  else if(type === 'tmpl'){
    var html = NS_SEC.map(function(s){ return '<h3 data-sec="' + s.key + '">' + s.title + '</h3><ul><li><br></li></ul>'; }).join('');
    if(ed.textContent.trim()) ed.insertAdjacentHTML('beforeend', '<p><br></p>' + html); else ed.innerHTML = html;
    var li = ed.querySelector('li'); if(li){ var r = document.createRange(); r.selectNodeContents(li); r.collapse(true); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  }
  nsEditorChanged(pre);
}
function nsSlash(pre, type){
  var sel = window.getSelection();
  if(sel.rangeCount){
    var range = sel.getRangeAt(0), node = range.startContainer;
    if(node.nodeType === 3 && node.textContent.slice(0, range.startOffset).endsWith('/')){
      node.textContent = node.textContent.slice(0, range.startOffset - 1) + node.textContent.slice(range.startOffset);
      range.setStart(node, range.startOffset - 1); range.setEnd(node, range.startOffset - 1); sel.removeAllRanges(); sel.addRange(range);
    }
  }
  nsEl(pre + 'Slash').classList.remove('open'); nsFmt(pre, type);
}
function nsBindEditor(pre){
  var ed = nsEl(pre + 'Editor');
  ed.addEventListener('keyup', function(e){
    var sm = nsEl(pre + 'Slash');
    if(e.key === '/') sm.classList.add('open'); else if(e.key !== 'Shift') sm.classList.remove('open');
  });
  ed.addEventListener('input', function(){ nsEditorChanged(pre); });
  ed.addEventListener('paste', function(e){                         // 서식 없는 글만 붙여넣는다 (다른 문서의 글꼴·색이 섞이지 않게, AI 가 읽기 쉽게)
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    document.execCommand('insertText', false, t);
  });
  nsEl(pre + 'Title').addEventListener('input', function(){ nsEditorChanged(pre); });
  var d = nsEl(pre + 'Date'); if(d) d.addEventListener('change', function(){ nsPreviewSoon(pre); nsDraftSoon(); });
  nsEl(pre + 'Attendees').addEventListener('click', function(){ if(pre === 'ns') nsDraftSoon(); });
}
function nsEditorChanged(pre){
  /* 글자를 칠 때마다 편집기를 통째로 복제해서 읽으면 긴 회의록에서 느려진다 → 줄 수 표시도 잠깐 모아서 한 번만 센다 */
  var st = NS.pv[pre] = NS.pv[pre] || { t: null, seq: 0 };
  clearTimeout(st.ct);
  st.ct = setTimeout(function(){
    var ed = nsEl(pre + 'Editor'); if(!ed) return;
    var n = ed.textContent.trim() ? nsParse(ed).lines.length : 0, c = nsEl(pre + 'Count'); if(c) c.textContent = n ? n + '줄' : '';
  }, 300);
  nsPreviewSoon(pre);
  if(pre === 'ns') nsDraftSoon();
}

/* 편집기 내용 → 줄 목록 + 칸(논의/결정/액션). 취소선 글은 ~~글~~ 로 표시한다 */
function nsParse(ed){
  var c = ed.cloneNode(true);
  c.removeAttribute('id');
  c.querySelectorAll('s,strike,del').forEach(function(n){ var t = document.createElement('span'); t.textContent = '~~' + n.textContent + '~~'; n.replaceWith(t); });
  c.querySelectorAll('h1,h2,h3,h4').forEach(function(h){ h.insertBefore(document.createTextNode('\u0001'), h.firstChild); });
  c.style.cssText = 'position:absolute; left:-99999px; top:0; width:640px; white-space:pre-wrap;';
  document.body.appendChild(c);
  var text = c.innerText || c.textContent || '';
  c.remove();
  var sections = { others: [], decisions: [], actions: [] }, lines = [], cur = null, found = false;
  text.split('\n').forEach(function(raw){
    var s = raw.replace(/[​ ]/g, ' ').trim();
    if(!s) return;
    if(s.charAt(0) === '\u0001'){
      var h = s.slice(1).trim();
      var sec = NS_SEC.filter(function(x){ return x.re.test(h); })[0];
      cur = sec ? sec.key : null; if(sec) found = true;
      return;                                                         // 제목 줄은 내용이 아니다
    }
    s = s.replace(/^[•\-\*·▪]\s+/, '');
    lines.push(s);
    var live = s.replace(/~~.+?~~/g, '').trim();                      // 취소선으로 지운 줄은 칸에 넣지 않는다
    if(live && live.replace(/^☐\s*/, '').trim()) sections[cur || 'others'].push(live);
  });
  return { lines: lines, sections: sections, hasSections: found };
}
/* 칸 → 편집기 HTML (수정 화면과 임시저장 복원에 쓴다) */
function nsSectionsHtml(doc){
  return NS_SEC.map(function(s){
    var items = (doc[s.key] || []);
    return '<h3 data-sec="' + s.key + '">' + s.title + '</h3><ul>' + (items.length ? items.map(function(t){ return '<li>' + escHtml(t) + '</li>'; }).join('') : '<li><br></li>') + '</ul>';
  }).join('');
}

/* ---------- AI 미리보기 (쓰는 동안 오른쪽) ---------- */
var NS_TIPS = '<div class="ns-tips"><b>이렇게 적으면 잘 읽어요</b>' +
  '<ul><li><code>햄버거 땡땡 금요일까지</code></li><li><code>민수 로그인 구현 ~다음주 월</code></li><li><code>중간발표 11/20 2시</code></li><li><code>해커톤 9월 20일부터 22일까지</code></li></ul>' +
  '<p>날짜가 바뀌면 “다음 주 화요일로 변경”, 취소하면 “취소”라고 적거나 취소선을 쓰세요. 같은 일을 다시 적으면 마지막 것만 반영해요.</p></div>';
function nsPreviewSoon(pre){
  var st = NS.pv[pre] = NS.pv[pre] || { t: null, seq: 0 };
  clearTimeout(st.t);
  st.t = setTimeout(function(){ nsPreviewRun(pre); }, 650);
}
function nsPreviewRun(pre){
  var ai = nsEl(pre + 'Ai'); if(!ai) return;
  var ed = nsEl(pre + 'Editor'); if(!ed) return;
  var parsed = nsParse(ed), st = NS.pv[pre] = NS.pv[pre] || { t: null, seq: 0 }, my = ++st.seq;
  if(!parsed.lines.length || !calApiMode){ ai.innerHTML = '<div class="ns-ai-head"><b>' + uiIc('sparkle', 14) + ' AI 인식 미리보기</b></div><p class="ns-ai-empty">' + (calApiMode ? '내용을 적으면 AI가 찾은 일정이 여기에 바로 나타나요.' : '로그인하면 AI가 일정을 찾아 보여 줘요.') + '</p>' + NS_TIPS; return; }
  var dv = nsEl(pre + 'Date') ? nsEl(pre + 'Date').value : '';
  if(!dv && typeof nsEditingDoc === 'function'){ var d = nsEditingDoc(); if(d) dv = docIso(d.date); }
  apiFetch('/api/meetings/preview', { method: 'POST', body: JSON.stringify({ text: parsed.lines.join('\n'), doc_date: dv || null }) }).then(function(res){
    if(my !== st.seq || !nsEl(pre + 'Ai')) return;                    // 더 새 요청이 있으면 이 결과는 버린다
    var h = '<div class="ns-ai-head"><b>' + uiIc('sparkle', 14) + ' AI 인식 미리보기</b><span class="ns-live">실시간</span></div>';
    if(res.events.length){
      h += '<div class="ns-ai-sub">캘린더에 들어갈 일정 ' + res.events.length + '개</div><div class="ns-evs">' + res.events.map(function(e){
        var when = fmtRange({ start: e.start_date, end: e.end_date, startTime: e.start_time, endTime: e.end_time });
        return '<div class="ns-ev"><span class="when">' + escHtml(when) + '</span><b>' + escHtml(e.title) + '</b></div>';
      }).join('') + '</div>';
    } else {
      h += '<p class="ns-ai-empty">아직 일정으로 읽힌 내용이 없어요. “금요일까지”, “11/20 2시”처럼 날짜나 기한을 적어 보세요.</p>';
    }
    if(res.dropped.length){
      h += '<div class="ns-ai-sub dim">취소로 본 줄 ' + res.dropped.length + '개는 제외했어요</div><div class="ns-drop">' + res.dropped.slice(0, 4).map(function(l){ return '<s>' + escHtml(l) + '</s>'; }).join('') + '</div>';
    }
    h += '<p class="ns-ai-foot">저장하면 AI가 문맥까지 보고 한 번 더 확인해요.</p>';
    nsEl(pre + 'Ai').innerHTML = h;
  }).catch(function(){ if(my === st.seq && nsEl(pre + 'Ai')) nsEl(pre + 'Ai').innerHTML = '<div class="ns-ai-head"><b>' + uiIc('sparkle', 14) + ' AI 인식 미리보기</b></div>' + NS_TIPS; });
}

/* ---------- 새 회의록 작성 ---------- */
function nsBuildCompose(){
  if(NS.built) return;
  var host = nsEl('composeSheet'); if(!host) return;
  host.innerHTML = nsSheetHtml('ns', { dateEditable: true });
  nsBindEditor('ns'); NS.built = true;
}
function nsDraftSoon(){
  clearTimeout(NS.draftT);
  var st = nsEl('noteDraftState'); if(st) st.textContent = '작성 중…';
  NS.draftT = setTimeout(function(){ nsDraftSave(false); }, 900);
}
function nsDraftSave(manual){
  var ed = nsEl('nsEditor'); if(!ed) return;
  var title = nsEl('nsTitle').value.trim(), has = ed.textContent.trim();
  var st = nsEl('noteDraftState');
  if(!title && !has){ try{ localStorage.removeItem(NS_DRAFT_KEY); }catch(e){} if(st) st.textContent = ''; if(manual) pushToast('📝', '저장할 내용이 없어요', '제목이나 내용을 적은 뒤 임시저장해 주세요'); return; }
  try{
    localStorage.setItem(NS_DRAFT_KEY, JSON.stringify({ title: title, html: ed.innerHTML, project: nsEl('nsProject').value, date: nsEl('nsDate').value, attendees: nsAttendees('ns'), t: Date.now() }));
    if(st) st.textContent = '임시저장됨 · 방금';
    if(manual) pushToast('💾', '임시저장됨', '이 기기에 저장했어요. 창을 닫았다 다시 열어도 이어서 쓸 수 있어요');
  }catch(e){ if(st) st.textContent = ''; if(manual) pushToast('⚠️', '임시저장하지 못했어요', '브라우저 저장 공간을 쓸 수 없어요'); }
}
function saveDraft(){ nsDraftSave(true); }
function nsDraftClear(){ clearTimeout(NS.draftT); try{ localStorage.removeItem(NS_DRAFT_KEY); }catch(e){} var st = nsEl('noteDraftState'); if(st) st.textContent = ''; }
function nsDraftDiscard(){
  nsDraftClear(); nsEl('nsTitle').value = ''; nsEl('nsEditor').innerHTML = ''; nsEditorChanged('ns');
  var b = nsEl('nsDraftBanner'); if(b) b.remove();
  pushToast('🗑️', '임시저장을 지웠어요', '새로 시작해요');
}
function openComposeModal(){
  if(calApiMode && !myProjects.length){
    ensureProjectId().then(function(){ openComposeModal(); }).catch(function(e){ pushToast('⚠️', '프로젝트를 만들지 못했어요', e.message); });
    return;
  }
  nsBuildCompose();
  var defProj = calDefaultProject() || (myProjects[0] && myProjects[0].id) || null;
  nsFillProjects('ns', defProj);
  nsEl('nsTitle').value = '';
  nsEl('nsDate').value = CAL_TODAY.y + '-' + pad2(CAL_TODAY.m) + '-' + pad2(CAL_TODAY.d);
  nsBuildAttendees('ns', defProj, null);
  nsEl('nsEditor').innerHTML = '';
  var old = nsEl('nsDraftBanner'); if(old) old.remove();
  var d = null; try{ d = JSON.parse(localStorage.getItem(NS_DRAFT_KEY) || 'null'); }catch(e){}
  if(d && (d.title || (d.html && d.html.replace(/<[^>]*>/g, '').trim()))){
    nsEl('nsTitle').value = d.title || ''; nsEl('nsEditor').innerHTML = d.html || '';
    if(d.project && calProjectById(d.project)){ nsEl('nsProject').value = d.project; nsBuildAttendees('ns', d.project, d.attendees && d.attendees.length ? d.attendees : null); }
    if(d.date) nsEl('nsDate').value = d.date;
    var b = document.createElement('div'); b.className = 'ns-banner'; b.id = 'nsDraftBanner';
    b.innerHTML = '<span>' + uiIc('note', 14) + ' 작성하던 내용을 불러왔어요</span><button type="button" onclick="nsDraftDiscard()">지우고 새로 쓰기</button>';
    nsEl('composeSheet').insertBefore(b, nsEl('composeSheet').firstChild);
  }
  var st = nsEl('noteDraftState'); if(st) st.textContent = d ? '임시저장됨' : '';
  nsEditorChanged('ns');
  nsEl('composeModal').classList.add('open');
  setTimeout(function(){ var t = nsEl('nsTitle'); if(t && !t.value && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) t.focus(); }, 80);
}
function closeComposeModal(){
  var el = nsEl('composeModal'); if(!el || !el.classList.contains('open')) return;
  if(NS.built && nsEl('nsEditor')) nsDraftSave(false);              // 닫을 때도 쓰던 내용은 남겨 둔다
  el.classList.remove('open');
}
function validateRequired(){
  var title = nsEl('nsTitle').value.trim(), dateVal = nsEl('nsDate').value, attendees = nsAttendees('ns');
  if(!title || !dateVal || attendees.length === 0){
    pushToast('⚠️', '필수 항목을 확인해주세요', '회의 제목 · 날짜 · 참석자는 꼭 입력해야 해요');
    return null;
  }
  var p = dateVal.split('-');
  return { title: title, date: p[0] + '.' + p[1] + '.' + p[2], attendees: attendees, project: nsEl('nsProject').value || null };
}
/* 칸(논의/결정/액션)이 있으면 그대로 쓰고, 없으면 AI 가 정리한다. 결과는 doc 에 담는다 */
function nsStructure(parsed, title){
  if(parsed.hasSections) return Promise.resolve({ others: parsed.sections.others, decisions: parsed.sections.decisions, actions: parsed.sections.actions, ai: false });
  var live = parsed.lines.map(function(l){ return l.replace(/~~.+?~~/g, '').trim(); }).filter(Boolean);
  return structureWithAi(live, title).then(function(res){
    if(res) return { others: res.discussion || [], decisions: res.decisions || [], actions: res.actions || [], ai: true };
    var b = { others: [], decisions: [], actions: [] };
    live.forEach(function(l){ var c = classifyLine(l); (c === 'action' ? b.actions : c === 'decision' ? b.decisions : b.others).push(l); });
    return Object.assign(b, { ai: false });
  });
}
function generateAiRecord(){
  var meta = validateRequired();
  if(!meta) return;
  var parsed = nsParse(nsEl('nsEditor'));
  if(!parsed.lines.length){ pushToast('📝', '내용을 적어주세요', '회의 내용을 적은 뒤 저장하면 AI가 정리해요'); return; }
  var btn = nsEl('aiRecordBtn'), original = btn.innerHTML;
  btn.disabled = true; btn.textContent = parsed.hasSections ? '저장하는 중...' : '정리하는 중...';
  nsStructure(parsed, meta.title).then(function(st){
    var doc = buildDocFromLines(meta.title, meta.date, meta.attendees, parsed.lines);
    doc.others = st.others; doc.decisions = st.decisions; doc.actions = st.actions; doc.aiStructured = st.ai;
    doc.raw = parsed.lines.join('\n');                              // 취소선 표시(~~)를 그대로 보내서 서버 AI 가 취소된 줄을 알게 한다
    doc.project = meta.project;
    meetingDocs.unshift(doc);
    if(meta.project && calSelected !== 'all' && calSelected !== meta.project) calSelected = meta.project;
    syncCalProjects();
    syncDocToCalendar(doc);
    btn.disabled = false; btn.innerHTML = original;
    nsEl('nsTitle').value = ''; nsEl('nsEditor').innerHTML = '';        // 저장했으니 작성 칸은 비운다 (닫을 때 임시저장이 다시 만들어지지 않게)
    nsDraftClear();
    closeComposeModal();
    pushToast('📄', st.ai ? 'AI 회의록 정리 완료' : '회의록 저장됨', doc.title + ' · 결정 ' + doc.decisions.length + ' · 액션 ' + doc.actions.length);
  }).catch(function(e){ btn.disabled = false; btn.innerHTML = original; pushToast('⚠️', '저장하지 못했어요', e && e.message ? e.message : ''); });
}

/* ---------- 보기 (서랍) ---------- */
function nsDocById(id){ return meetingDocs.find(function(d){ return d.id === id; }); }
function nsEditingDoc(){ return NS.editingId ? nsDocById(NS.editingId) : null; }
function nsLinkedEvents(doc){
  if(!doc.serverId) return [];
  return calendarEvents.filter(function(e){ return e.docServerId === doc.serverId; }).sort(function(a, b){ return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
}
function buildDocHtml(doc){
  var c = getStatusColor(doc.status);
  var pr = calProjectById(doc.project);
  var attendees = doc.attendees.map(function(a){ return "<span class='chip'>" + escHtml(a) + "</span>"; }).join('');
  var linked = nsLinkedEvents(doc);
  var stat = function(n, l){ return "<div class='ns-stat'><b>" + n + "</b><span>" + l + "</span></div>"; };
  var sec = function(s){
    var items = doc[s.key] || [];
    var body = items.length ? "<ul class='" + (s.key === 'actions' ? 'mdoc-checklist' : '') + "'>" + items.map(function(t){ return "<li>" + escHtml(t) + "</li>"; }).join('') + "</ul>"
      : "<p class='mdoc-empty'>" + (s.key === 'others' ? '일반 논의 내용이 없어요.' : s.key === 'decisions' ? '확정된 결정사항이 없어요.' : '등록된 액션 아이템이 없어요.') + "</p>";
    return "<div class='ns-card " + s.cls + "'><div class='ns-card-head'><span>" + uiIc(s.ic, 15) + " " + s.title + "</span><i>" + items.length + "</i></div>" + body + "</div>";
  };
  var evHtml = linked.length
    ? "<div class='ns-linked'>" + linked.map(function(e){
        var cat = (typeof evCategory === 'function') ? evCategory(e) : null;
        return "<div class='ns-lev'>" + (cat ? "<span class='ev-badge " + cat.cls + "' style='--c:" + cat.c + "'>" + uiIc(cat.ic, 12) + " " + cat.label + "</span>" : '') + "<span class='t'>" + escHtml(e.title) + "</span><span class='w'>" + escHtml(fmtRange(e)) + "</span></div>";
      }).join('') + "</div>"
    : "<p class='mdoc-empty'>아직 캘린더에 반영된 일정이 없어요.</p>";
  return (
    "<div class='ns ns-view'>" +
    "<h2 class='ns-vtitle'>" + escHtml(doc.title) + "</h2>" +
    "<div class='ns-props'>" +
      "<div class='ns-prop'><span class='ns-pl'>" + uiIc('folder', 14) + " 프로젝트</span><span class='ns-pv'>" + (pr ? "<i class='pdot-s' style='background:" + calProjColor(pr) + "'></i>" : '') + escHtml((pr || { title: '미분류' }).title) + "</span></div>" +
      "<div class='ns-prop'><span class='ns-pl'>" + uiIc('calendar', 14) + " 날짜</span><span class='ns-pv'>" + escHtml(doc.date) + "</span></div>" +
      "<div class='ns-prop'><span class='ns-pl'>" + uiIc('checkc', 14) + " 상태</span><span class='ns-pv'><button type='button' class='mdr-status-btn' style='background:" + c + "22; color:" + c + ";' onclick='openStatusEditor(event,\"" + doc.id + "\")'>● " + escHtml(doc.status) + "</button></span></div>" +
      "<div class='ns-prop wide'><span class='ns-pl'>" + uiIc('team', 14) + " 참석자</span><span class='ns-pv'>" + attendees + "</span></div>" +
      (doc.author ? "<div class='ns-prop'><span class='ns-pl'>" + uiIc('user', 14) + " 작성</span><span class='ns-pv'>" + escHtml(doc.author) + "</span></div>" : '') +
    "</div>" +
    "<div class='ns-stats'>" + stat(doc.others.length, '논의') + stat(doc.decisions.length, '결정') + stat(doc.actions.length, '액션') + stat(linked.length, '캘린더 일정') + "</div>" +
    NS_SEC.map(sec).join('') +
    "<div class='ns-card sec-cal'><div class='ns-card-head'><span>" + uiIc('calendar', 15) + " 캘린더에 반영된 일정</span><i>" + linked.length + "</i></div>" + evHtml +
      "<p class='ns-cal-note'>회의록에 적힌 날짜·기간을 AI가 읽어 팀 캘린더에 넣어요. 취소한 일이나 정정한 일은 마지막 내용만 반영돼요.</p>" +
      "<button type='button' class='btn primary' onclick='applyDocToCalendar(\"" + doc.id + "\")'>" + uiIc('calendar', 15) + " 이 회의록 일정을 캘린더에 반영</button></div>" +
    "</div>"
  );
}
function openMdocDrawer(id){
  var doc = nsDocById(id);
  if(!doc) return;
  var drawer = nsEl('mdocDrawer');
  drawer.dataset.docId = id; NS.editingId = null;
  docDeleteAsk = null;
  var delBtn = nsEl('mdocDeleteBtn'); if(delBtn){ delBtn.classList.remove('ask'); delBtn.textContent = '🗑 삭제'; }
  drawer.classList.remove('editing');
  nsEl('mdocCrumb').textContent = '회의록';
  var body = nsEl('mdocDrawerBody'); body.innerHTML = buildDocHtml(doc); body.scrollTop = 0;
  drawer.classList.add('open');
}

/* ---------- 수정 (서랍 안에서 작성과 같은 편집기) ---------- */
function toggleEditDoc(){
  var drawer = nsEl('mdocDrawer'), doc = nsDocById(drawer.dataset.docId);
  if(!doc) return;
  if(doc.canEdit === false){ pushToast('🔒', '수정할 수 없어요', '작성자나 프로젝트 소유자만 수정할 수 있어요'); return; }
  NS.editingId = doc.id;
  drawer.classList.add('editing');
  nsEl('mdocCrumb').textContent = '회의록 › 수정';
  var body = nsEl('mdocDrawerBody');
  body.innerHTML = nsSheetHtml('es', { compact: true, dateEditable: false, placeholder: '내용을 적어 주세요' }) +
    '<div class="mdoc-edit-footer"><button type="button" class="btn ghost" onclick="cancelEditDoc()">취소</button><button type="button" class="btn primary" id="esSaveBtn" onclick="saveEditDoc()">저장하고 캘린더 다시 분석</button></div>';
  nsBindEditor('es');
  nsEl('esTitle').value = doc.title;
  nsFillProjects('es', doc.project);
  nsEl('esDateText').textContent = doc.date;
  nsBuildAttendees('es', doc.project, doc.attendees);
  nsEl('esEditor').innerHTML = nsSectionsHtml(doc);
  nsEditorChanged('es');
  nsPreviewRun('es');
  body.scrollTop = 0;
  var t = nsEl('esTitle'); if(t && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) t.focus();
}
function cancelEditDoc(){ openMdocDrawer(nsEl('mdocDrawer').dataset.docId); }
function saveEditDoc(){
  var id = nsEl('mdocDrawer').dataset.docId, doc = nsDocById(id);
  if(!doc) return;
  var parsed = nsParse(nsEl('esEditor'));
  var btn = nsEl('esSaveBtn'), original = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled = true; btn.textContent = parsed.hasSections ? '저장하는 중...' : '정리하는 중...'; }
  nsStructure(parsed, nsEl('esTitle').value.trim() || doc.title).then(function(st){
    var titleVal = nsEl('esTitle').value.trim();
    if(titleVal) doc.title = titleVal;
    var projSel = nsEl('esProject');
    if(projSel && projSel.value) doc.project = projSel.value;
    var att = nsAttendees('es'); if(att.length) doc.attendees = att;
    doc.others = st.others; doc.decisions = st.decisions; doc.actions = st.actions;
    doc.raw = parsed.lines.join('\n');
    NS.editingId = null;
    renderMeetingDocs();
    openMdocDrawer(id);
    syncDocToCalendar(doc);
    pushToast('✅', '수정 완료', doc.title + ' 회의록이 수정됐어요');
  }).catch(function(e){ if(btn){ btn.disabled = false; btn.innerHTML = original; } pushToast('⚠️', '저장하지 못했어요', e && e.message ? e.message : ''); });
}
