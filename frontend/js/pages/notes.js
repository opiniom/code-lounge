/* ---- notes: composer ---- */
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s){ return escHtml(s).replace(/"/g,'&quot;'); }
function classifyLine(line){
  if(/까지|담당|맡/.test(line)) return 'action';
  if(/확정|하기로|결정/.test(line)) return 'decision';
  return 'other';
}
function buildDocFromLines(title, date, attendees, lines){
  var decisions=[], actions=[], others=[];
  lines.forEach(function(line){
    var c = classifyLine(line);
    if(c==='action') actions.push(line);
    else if(c==='decision') decisions.push(line);
    else others.push(line);
  });
  return {
    id:'m'+Date.now()+Math.random().toString(36).slice(2,6),
    title:title, date:date, attendees:attendees, decisions:decisions, actions:actions, others:others,
    status:'완료', raw: lines.join('\n')
  };
}
function formatNote(type){
  var editor = document.getElementById('noteEditor');
  editor.focus();
  if(type==='h3'){ document.execCommand('formatBlock', false, 'H3'); }
  else if(type==='ul'){ document.execCommand('insertUnorderedList'); }
  else if(type==='check'){ document.execCommand('insertHTML', false, '☐ '); }
  else if(type==='hr'){ document.execCommand('insertHorizontalRule'); }
}
document.getElementById('noteEditor').addEventListener('keyup', function(e){
  if(e.key==='/'){ document.getElementById('slashMenu').classList.add('open'); }
  else if(e.key!=='Shift'){ document.getElementById('slashMenu').classList.remove('open'); }
});
function slashInsert(type){
  var sel = window.getSelection();
  if(sel.rangeCount){
    var range = sel.getRangeAt(0);
    var node = range.startContainer;
    if(node.nodeType===3 && node.textContent.slice(0, range.startOffset).endsWith('/')){
      node.textContent = node.textContent.slice(0, range.startOffset-1) + node.textContent.slice(range.startOffset);
      range.setStart(node, range.startOffset-1);
      range.setEnd(node, range.startOffset-1);
      sel.removeAllRanges(); sel.addRange(range);
    }
  }
  document.getElementById('slashMenu').classList.remove('open');
  formatNote(type);
}
function validateRequired(){
  var title = document.getElementById('noteTitleInput').value.trim();
  var dateVal = document.getElementById('noteDateInput').value;
  var attendees = Array.from(document.querySelectorAll('#attendeePicker .member-chip.active')).map(function(c){ return c.dataset.name; });
  if(!title || !dateVal || attendees.length===0){
    pushToast('⚠️','필수 항목을 확인해주세요','회의 제목 · 날짜 · 참석자는 꼭 입력해야 해요');
    return null;
  }
  var p = dateVal.split('-');
  return {title:title, date:p[0]+'.'+p[1]+'.'+p[2], attendees:attendees, project:document.getElementById('noteProject').value || null};
}
function saveDraft(){
  pushToast('💾','임시저장됨','작성 중인 내용이 임시로 저장됐어요');
}
var attendeeDefaultHtml = null;
function buildAttendeePicker(projId){
  var box = document.getElementById('attendeePicker');
  if(attendeeDefaultHtml===null) attendeeDefaultHtml = box.innerHTML;
  if(!calApiMode){ box.innerHTML = attendeeDefaultHtml; return; }
  box.innerHTML = '';
  var pr = calProjectById(projId || (document.getElementById('noteProject') || {}).value);
  var names = (pr && pr.members && pr.members.length) ? pr.members.map(function(mm){ return mm.username; }) : [myProfile.name || '나'];
  names.forEach(function(nm){
    var chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'member-chip active'; chip.dataset.name = nm;
    chip.onclick = function(){ chip.classList.toggle('active'); };
    var dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = chatColor(nm);
    chip.appendChild(dot); chip.append(nm);
    box.appendChild(chip);
  });
}
function openComposeModal(){
  if(calApiMode && !myProjects.length){
    ensureProjectId().then(function(){ openComposeModal(); }).catch(function(e){ pushToast('⚠️','프로젝트를 만들지 못했어요', e.message); });
    return;
  }
  var psel = document.getElementById('noteProject');
  psel.innerHTML = '';
  var defProj = calDefaultProject() || (myProjects[0] && myProjects[0].id) || null;
  myProjects.forEach(function(p){
    var o = document.createElement('option'); o.value = p.id; o.textContent = p.title;
    if(p.id===defProj) o.selected = true;
    psel.appendChild(o);
  });
  if(!myProjects.length){ var none = document.createElement('option'); none.value = ''; none.textContent = '프로젝트 없음'; psel.appendChild(none); }
  document.getElementById('noteTitleInput').value = '';
  document.getElementById('noteDateInput').value = CAL_TODAY.y+'-'+pad2(CAL_TODAY.m)+'-'+pad2(CAL_TODAY.d);
  buildAttendeePicker(defProj);
  document.querySelectorAll('#attendeePicker .member-chip').forEach(function(c){ c.classList.add('active'); });
  document.getElementById('noteEditor').innerHTML = '';
  document.getElementById('composeModal').classList.add('open');
}
function closeComposeModal(){ var el = document.getElementById('composeModal'); if(el) el.classList.remove('open'); }
/* 회의 메모를 AI 가 논의/결정/액션아이템으로 정리 (로그인 필요). 실패하면 null → 기본 분류로 대체 */
function structureWithAi(lines, title){
  if(!calApiMode) return Promise.resolve(null);
  return apiFetch('/api/meetings/structure', {method:'POST', body:JSON.stringify({lines:lines, title:title||null})})
    .catch(function(e){ pushToast('ℹ️','AI가 정리하지 못해 기본 분류로 만들었어요', e.message); return null; });
}
function applyStructure(doc, res){
  if(!res) return doc;
  doc.others = res.discussion || []; doc.decisions = res.decisions || []; doc.actions = res.actions || [];
  doc.aiStructured = true;
  return doc;
}
function generateAiRecord(){
  var meta = validateRequired();
  if(!meta) return;
  var editor = document.getElementById('noteEditor');
  var lines = editor.innerText.trim().split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
  if(!lines.length){ pushToast('📝','내용을 적어주세요','회의 내용을 적은 뒤 AI가 정리해요'); return; }
  var btn = document.getElementById('aiRecordBtn');
  var original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '🤖 AI가 정리하는 중...';
  structureWithAi(lines, meta.title).then(function(res){
    var doc = buildDocFromLines(meta.title, meta.date, meta.attendees, lines);
    applyStructure(doc, res);
    doc.project = meta.project;
    meetingDocs.unshift(doc);
    if(meta.project && calSelected!=='all' && calSelected!==meta.project) calSelected = meta.project;   // 새 회의록이 보이는 프로젝트로 이동
    syncCalProjects();
    syncDocToCalendar(doc);
    btn.disabled = false;
    btn.innerHTML = original;
    closeComposeModal();
    pushToast('📄', res ? 'AI 회의록 정리 완료' : '회의록 저장됨', doc.title+' · 결정 '+doc.decisions.length+' · 액션 '+doc.actions.length);
  });
}

/* ---- notes: document gallery + side drawer ---- */
var meetingDocs = [];
function renderMeetingDocs(){
  var wrap = document.getElementById('meetingDocList');
  wrap.innerHTML = '';
  var visibleIds = calReady ? calVisibleProjectIds() : null;   // 캘린더 상태가 준비되기 전(스크립트 첫 로드)에는 전부 표시
  var docsToShow = meetingDocs.filter(function(d){ return !visibleIds || !d.project || visibleIds.indexOf(d.project)>=0; });
  if(!docsToShow.length){
    var emptyRow = document.createElement('div');
    emptyRow.style.cssText = 'padding:34px 18px; text-align:center; color:var(--text-faint); font-size:13px; line-height:1.7;';
    emptyRow.innerHTML = (meetingDocs.length && calSelected!=='all')
      ? '이 프로젝트에는 아직 회의록이 없어요.<br>"새 회의록 작성"으로 이 프로젝트의 첫 회의록을 남겨보세요.'
      : '아직 회의록이 없어요.<br>"새 회의록 작성"으로 첫 회의록을 남겨보세요. "9월 20일부터 22일까지 해커톤 준비"처럼 기간을 적으면 그 프로젝트 캘린더에 반영할 수 있어요.';
    wrap.appendChild(emptyRow);
    return;
  }
  docsToShow.forEach(function(doc){
    var row = document.createElement('div');
    row.className = 'mdoc-row';
    row.innerHTML =
      "<span class='mdoc-chk-cell'><span class='pm-check'>"+PM_CHECK+"</span></span>"+
      "<span class='mdr-date'></span>"+
      "<button type='button' class='mdr-title'></button>"+
      "<span class='mdr-attendees'></span>"+
      "<button type='button' class='mdr-status-btn'></button>";
    row.querySelector('.mdr-date').textContent = doc.date;
    var titleBtn = row.querySelector('.mdr-title');
    titleBtn.textContent = doc.title + '  →';
    var rowProj = calReady ? calProjectById(doc.project) : null;
    if(rowProj && calSelected==='all' && myProjects.length>1){
      var tag = document.createElement('span'); tag.className = 'mdr-proj';
      var tdot = document.createElement('i'); tdot.style.background = calProjColor(rowProj);
      tag.appendChild(tdot); tag.append(rowProj.title);
      titleBtn.insertBefore(tag, titleBtn.firstChild);
    }
    titleBtn.onclick = function(e){ if(noteSelecting){ e.stopPropagation(); toggleNoteSel(doc.id); return; } openMdocDrawer(doc.id); };
    if(noteSelecting && noteSel[doc.id]) row.classList.add('sel');
    row.onclick = function(){ if(noteSelecting) toggleNoteSel(doc.id); };
    if(doc.author && doc.authorId !== (currentUser && currentUser.id)){ var by = document.createElement('span'); by.className = 'mdr-by'; by.textContent = doc.author + ' 작성'; titleBtn.appendChild(by); }
    row.querySelector('.mdr-attendees').innerHTML = doc.attendees.map(function(a){ return "<span class='chip'>"+escHtml(a)+"</span>"; }).join('');
    var statusBtn = row.querySelector('.mdr-status-btn');
    var c = getStatusColor(doc.status);
    statusBtn.style.background = c+'22'; statusBtn.style.color = c;
    statusBtn.textContent = '● '+doc.status;
    statusBtn.onclick = function(e){ if(noteSelecting){ e.stopPropagation(); toggleNoteSel(doc.id); return; } openStatusEditor(e, doc.id); };
    wrap.appendChild(row);
  });
  var tableEl = document.querySelector('.mdoc-table');
  if(tableEl) tableEl.classList.toggle('selecting', noteSelecting);
  renderNoteSelBar();
}
/* ---- 회의록 삭제 (선택 삭제 + 상세 화면의 삭제) ---- */
var noteSelecting = false, noteSel = {}, noteConfirm = false, noteBusy = false;
function visibleDocsForSelection(){
  var ids = calReady ? calVisibleProjectIds() : null;
  return meetingDocs.filter(function(d){ return !ids || !d.project || ids.indexOf(d.project)>=0; });
}
function toggleNoteSelectMode(){
  noteSelecting = !noteSelecting; noteSel = {}; noteConfirm = false;
  var btn = document.getElementById('noteSelectBtn');
  if(btn) btn.classList.toggle('primary', false);
  renderMeetingDocs();
}
function toggleNoteSel(id){ if(noteSel[id]) delete noteSel[id]; else noteSel[id] = true; noteConfirm = false; renderMeetingDocs(); }
function toggleNoteSelAll(){
  var docs = visibleDocsForSelection();
  var every = docs.length && docs.every(function(d){ return noteSel[d.id]; });
  docs.forEach(function(d){ if(every) delete noteSel[d.id]; else noteSel[d.id] = true; });
  noteConfirm = false; renderMeetingDocs();
}
function renderNoteSelBar(){
  var bar = document.getElementById('noteSelBar');
  if(!bar) return;
  var all = document.getElementById('noteSelAll');
  var docs = visibleDocsForSelection();
  var chosen = docs.filter(function(d){ return noteSel[d.id]; });
  if(all) all.classList.toggle('on', docs.length>0 && chosen.length===docs.length);
  bar.hidden = !noteSelecting;
  bar.innerHTML = '';
  if(!noteSelecting) return;
  if(noteConfirm && chosen.length){
    var box = document.createElement('div'); box.className = 'pm-confirm'; box.style.flex = '1';
    var msg = document.createElement('div');
    msg.textContent = '선택한 회의록 ' + chosen.length + '개를 삭제할까요? 이 회의록들에서 AI가 만든 캘린더 일정도 함께 삭제되고, 되돌릴 수 없어요.';
    var row = document.createElement('div'); row.className = 'row';
    var no = document.createElement('button'); no.className = 'cbtn no'; no.textContent = '취소'; no.onclick = function(){ noteConfirm = false; renderNoteSelBar(); };
    var yes = document.createElement('button'); yes.className = 'cbtn yes'; yes.textContent = noteBusy ? '삭제 중…' : '삭제'; yes.disabled = noteBusy;
    yes.onclick = function(){ deleteMeetingDocs(chosen.map(function(d){ return d.id; })); };
    row.appendChild(no); row.appendChild(yes); box.appendChild(msg); box.appendChild(row); bar.appendChild(box);
    return;
  }
  var cnt = document.createElement('span'); cnt.className = 'cnt'; cnt.textContent = chosen.length ? chosen.length + '개 선택됨' : '삭제할 회의록을 체크하세요';
  var acts = document.createElement('div'); acts.className = 'acts';
  var cancel = document.createElement('button'); cancel.className = 'btn ghost'; cancel.textContent = '취소'; cancel.onclick = toggleNoteSelectMode;
  var trash = document.createElement('button'); trash.className = 'pm-trash'; trash.disabled = !chosen.length;
  trash.innerHTML = "<svg viewBox='0 0 24 24' width='15' height='15' fill='none' stroke='currentColor' stroke-width='2'><path d='M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6'/></svg>삭제" + (chosen.length ? ' (' + chosen.length + ')' : '');
  trash.onclick = function(){ noteConfirm = true; renderNoteSelBar(); };
  acts.appendChild(cancel); acts.appendChild(trash);
  bar.appendChild(cnt); bar.appendChild(acts);
}
function deleteMeetingDocs(ids){
  if(noteBusy) return;
  noteBusy = true; renderNoteSelBar();
  var done = [], failed = [];
  ids.reduce(function(chain, id){
    return chain.then(function(){
      var doc = meetingDocs.filter(function(d){ return d.id===id; })[0];
      if(!doc) return;
      if(calApiMode && doc.serverId){
        return apiFetch('/api/meetings/'+doc.serverId, {method:'DELETE'}).then(function(){ done.push(doc); }).catch(function(e){ failed.push(doc.title+' ('+e.message+')'); });
      }
      done.push(doc);   // 로그인 전(데모) 회의록은 화면에서만 지움
    });
  }, Promise.resolve()).then(function(){
    var gone = {}; done.forEach(function(d){ gone[d.id] = d; });
    meetingDocs = meetingDocs.filter(function(d){ return !gone[d.id]; });
    calDetect = calDetect.filter(function(c){ return !gone[c.docId]; });
    calendarEvents = calendarEvents.filter(function(e){ return !(e.cls==='ai' && e.docServerId && done.some(function(d){ return d.serverId===e.docServerId; })); });
    done.forEach(function(d){ delete detectCache[d.id]; });
    var drawer = document.getElementById('mdocDrawer');
    if(drawer && drawer.classList.contains('open') && gone[drawer.dataset.docId]) closeMdocDrawer();
    noteSel = {}; noteConfirm = false; noteBusy = false;
    noteSelecting = false;   // 삭제가 끝나면 선택 모드를 닫는다
    renderMeetingDocs(); renderCalendarEvents(); renderCalSelector(); renderDetectCard();
    if(done.length) pushToast('🗑️', '회의록 '+done.length+'개를 삭제했어요', done.slice(0,3).map(function(d){ return '"'+d.title+'"'; }).join(', ')+(done.length>3 ? ' 외 '+(done.length-3)+'개' : ''));
    if(failed.length) pushToast('⚠️', '일부를 삭제하지 못했어요', failed.join(', '));
  });
}
var docDeleteAsk = null;
function askDeleteDoc(){
  var drawer = document.getElementById('mdocDrawer');
  var id = drawer.dataset.docId;
  var btn = document.getElementById('mdocDeleteBtn');
  if(!id) return;
  if(docDeleteAsk === id){
    docDeleteAsk = null; btn.classList.remove('ask'); btn.textContent = '🗑 삭제';
    deleteMeetingDocs([id]);
    return;
  }
  docDeleteAsk = id; btn.classList.add('ask'); btn.textContent = '정말 삭제?';
  setTimeout(function(){ if(docDeleteAsk === id){ docDeleteAsk = null; btn.classList.remove('ask'); btn.textContent = '🗑 삭제'; } }, 3500);
}
function buildDocHtml(doc){
  var attendeesHtml = doc.attendees.map(function(a){ return "<span class='chip'>"+escHtml(a)+"</span>"; }).join('');
  var discussionHtml = doc.others.length ? doc.others.map(function(o){ return "<li>"+escHtml(o)+"</li>"; }).join('') : "<li class='mdoc-empty' style='list-style:none; margin-left:-20px;'>일반 논의 내용이 없어요.</li>";
  var decisionsHtml = doc.decisions.length ? doc.decisions.map(function(d){ return "<li>"+escHtml(d)+"</li>"; }).join('') : "<li class='mdoc-empty' style='list-style:none; margin-left:-20px;'>확정된 결정사항이 없어요.</li>";
  var actionsHtml = doc.actions.length ? doc.actions.map(function(a){ return "<li>"+escHtml(a)+"</li>"; }).join('') : "<li class='mdoc-empty'>등록된 액션 아이템이 없어요.</li>";
  var c = getStatusColor(doc.status);
  return (
    "<h2 class='mdoc-title-lg'>"+escHtml(doc.title)+"</h2>"+
    "<div class='mdoc-props'>"+
      "<div class='mdoc-prop'><span class='mp-label'>📅 날짜</span><span class='mp-val'>"+escHtml(doc.date)+"</span></div>"+
      "<div class='mdoc-prop'><span class='mp-label'>✅ 상태</span><span class='mp-val'><button type='button' class='mdr-status-btn' style='background:"+c+"22; color:"+c+";' onclick='openStatusEditor(event,\""+doc.id+"\")'>● "+escHtml(doc.status)+"</button></span></div>"+
      "<div class='mdoc-prop'><span class='mp-label'>📁 프로젝트</span><span class='mp-val'>"+escHtml((calProjectById(doc.project)||{title:'미분류'}).title)+"</span></div>"+
      "<div class='mdoc-prop'><span class='mp-label'>👥 참석자</span><span class='mp-val'>"+attendeesHtml+"</span></div>"+
    "</div>"+
    "<hr class='mdoc-divider'>"+
    "<div class='mdoc-block'><h4>💬 논의 내용</h4><ul>"+discussionHtml+"</ul></div>"+
    "<div class='mdoc-block'><h4>✅ 결정 사항 <span class='count'>("+doc.decisions.length+")</span></h4><ol>"+decisionsHtml+"</ol></div>"+
    "<div class='mdoc-block'><h4>🔧 액션 아이템 <span class='count'>("+doc.actions.length+")</span></h4><ul class='mdoc-checklist'>"+actionsHtml+"</ul></div>"+
    "<hr class='mdoc-divider'>"+
    "<div class='mdoc-block'><h4>📅 캘린더</h4><p style='font-size:12px; color:var(--text-faint); line-height:1.6; margin-bottom:10px;'>회의록에 적힌 날짜·기간(예: 9월 20일부터 22일까지)을 AI가 분석해서 캘린더에 시작~종료 그대로 넣어줘요.</p>"+
    "<button type='button' class='btn primary' onclick='applyDocToCalendar(\""+doc.id+"\")'>📅 이 회의록 일정을 캘린더에 반영</button></div>"
  );
}
function openMdocDrawer(id){
  var doc = meetingDocs.find(function(d){ return d.id===id; });
  if(!doc) return;
  var drawer = document.getElementById('mdocDrawer');
  drawer.dataset.docId = id;
  docDeleteAsk = null;
  var delBtn = document.getElementById('mdocDeleteBtn'); if(delBtn){ delBtn.classList.remove('ask'); delBtn.textContent = '🗑 삭제'; }
  drawer.classList.remove('editing');
  document.getElementById('mdocCrumb').textContent = '회의록';
  document.getElementById('mdocDrawerBody').innerHTML = buildDocHtml(doc);
  drawer.classList.add('open');
}
function closeMdocDrawer(){ var el = document.getElementById('mdocDrawer'); if(el) el.classList.remove('open'); }

/* ---- notes: editable status tags ---- */
var statusOptions = [
  {name:'완료', color:'#8B5CF6'},
  {name:'진행중', color:'#3B82F6'}
];
var currentStatusDocId = null;
function getStatusColor(name){
  var opt = statusOptions.find(function(o){ return o.name===name; });
  return opt ? opt.color : '#8C8578';
}
function openStatusEditor(e, docId){
  e.stopPropagation();
  currentStatusDocId = docId;
  renderStatusOptionList();
  var r = e.currentTarget.getBoundingClientRect();
  var pop = document.getElementById('statusPopover');
  var z = currentUiScale();
  pop.style.top = (r.bottom / z + 6)+'px';
  pop.style.left = Math.min(r.left / z, window.innerWidth / z - 220)+'px';
  pop.classList.add('open');
}
function closeStatusEditor(){ var el = document.getElementById('statusPopover'); if(el) el.classList.remove('open'); }
function renderStatusOptionList(){
  var wrap = document.getElementById('statusOptionList');
  wrap.innerHTML = '';
  statusOptions.forEach(function(opt){
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'sp-item';
    row.innerHTML = "<span class='sp-dot' style='background:"+opt.color+";'></span><span></span>";
    row.querySelector('span:last-child').textContent = opt.name;
    row.onclick = function(){ setDocStatus(currentStatusDocId, opt.name); closeStatusEditor(); };
    wrap.appendChild(row);
  });
}
var statusPalette = ['#8B5CF6','#3B82F6','#06B6D4','#F59E0B','#EC4899','#22D3EE'];
function addStatusOption(){
  var input = document.getElementById('newStatusInput');
  var name = input.value.trim();
  if(!name) return;
  if(!statusOptions.find(function(o){ return o.name===name; })){
    statusOptions.push({name:name, color: statusPalette[statusOptions.length % statusPalette.length]});
  }
  setDocStatus(currentStatusDocId, name);
  input.value = '';
  closeStatusEditor();
}
function setDocStatus(docId, name){
  var doc = meetingDocs.find(function(d){ return d.id===docId; });
  if(!doc) return;
  doc.status = name;
  renderMeetingDocs();
  var drawer = document.getElementById('mdocDrawer');
  if(drawer.classList.contains('open') && drawer.dataset.docId===docId) openMdocDrawer(docId);
  syncDocToCalendar(doc);
}

/* ---- notes: edit AI-generated record ---- */
function growTextarea(el){
  el.style.height = 'auto';
  el.style.height = Math.max(60, el.scrollHeight)+'px';
  var cnt = document.querySelector('.sec-count[data-for="'+el.id+'"]');
  if(cnt){ var n = el.value.split('\n').filter(function(l){ return l.trim(); }).length; cnt.textContent = n+'줄'; }
}
function buildEditSection(cls, icon, title, id, lines, placeholder){
  return "<div class='mdoc-edit-sec "+cls+"'>"+
    "<div class='sec-head'><span class='sec-title'>"+icon+" "+title+"</span><span class='sec-hint'>한 줄에 하나씩</span><span class='sec-count' data-for='"+id+"'>0줄</span></div>"+
    "<textarea id='"+id+"' rows='3' placeholder=\""+escAttr(placeholder)+"\" oninput='growTextarea(this)'>"+escHtml(lines.join('\n'))+"</textarea></div>";
}
function buildDocEditHtml(doc){
  var projOptions = myProjects.map(function(p){ return "<option value='"+escAttr(p.id)+"'"+(p.id===doc.project?" selected":"")+">"+escHtml(p.title)+"</option>"; }).join('');
  var attendeesHtml = doc.attendees.map(function(a){ return "<span class='chip'>"+escHtml(a)+"</span>"; }).join('');
  return (
    "<div class='mdoc-edit'>"+
    "<input type='text' class='mdoc-edit-title' id='editTitle' placeholder='회의 제목' value=\""+escAttr(doc.title)+"\">"+
    "<div class='mdoc-props'>"+
      "<div class='mdoc-prop'><span class='mp-label'>📁 프로젝트</span><span class='mp-val'><select id='editProject' class='mdoc-select'>"+(projOptions || "<option value=''>프로젝트 없음</option>")+"</select></span></div>"+
      "<div class='mdoc-prop'><span class='mp-label'>📅 날짜</span><span class='mp-val'>"+escHtml(doc.date)+"</span></div>"+
      "<div class='mdoc-prop'><span class='mp-label'>👥 참석자</span><span class='mp-val'>"+attendeesHtml+"</span></div>"+
    "</div>"+
    "<hr class='mdoc-divider'>"+
    "<div class='mdoc-edit-note'><span>🤖</span><span><b>저장하면 AI가 회의록을 다시 분석해요.</b> 날짜나 기간(예: 9월 20일부터 22일까지)을 적으면 캘린더 일정이 새 내용으로 다시 만들어져요.</span></div>"+
    buildEditSection('sec-other', '💬', '논의 내용', 'editOthers', doc.others, '예: 검색 필터 기능부터 먼저 논의')+
    buildEditSection('sec-decision', '✅', '결정 사항', 'editDecisions', doc.decisions, '예: UI 디자인 시안은 이번 주 안에 확정하기로 함')+
    buildEditSection('sec-action', '🔧', '액션 아이템', 'editActions', doc.actions, '담당자와 할 일을 적어 주세요')+
    "<div class='mdoc-edit-footer'><button type='button' class='btn ghost' onclick='cancelEditDoc()'>취소</button><button type='button' class='btn primary' onclick='saveEditDoc()'>저장하고 캘린더 다시 분석</button></div>"+
    "</div>"
  );
}
function toggleEditDoc(){
  var drawer = document.getElementById('mdocDrawer');
  var id = drawer.dataset.docId;
  var doc = meetingDocs.find(function(d){ return d.id===id; });
  if(!doc) return;
  drawer.classList.add('editing');
  document.getElementById('mdocCrumb').textContent = '회의록 › 수정';
  document.getElementById('mdocDrawerBody').innerHTML = buildDocEditHtml(doc);
  document.getElementById('mdocDrawerBody').scrollTop = 0;
  document.querySelectorAll('#mdocDrawerBody .mdoc-edit-sec textarea').forEach(growTextarea);
  var t = document.getElementById('editTitle'); if(t) t.focus();
}
function cancelEditDoc(){ openMdocDrawer(document.getElementById('mdocDrawer').dataset.docId); }
function saveEditDoc(){
  var id = document.getElementById('mdocDrawer').dataset.docId;
  var doc = meetingDocs.find(function(d){ return d.id===id; });
  if(!doc) return;
  var titleVal = document.getElementById('editTitle').value.trim();
  if(titleVal) doc.title = titleVal;
  var projSel = document.getElementById('editProject');
  if(projSel && projSel.value) doc.project = projSel.value;
  doc.others = document.getElementById('editOthers').value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
  doc.decisions = document.getElementById('editDecisions').value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
  doc.actions = document.getElementById('editActions').value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
  doc.raw = doc.others.concat(doc.decisions, doc.actions).join('\n');
  renderMeetingDocs();
  openMdocDrawer(id);
  syncDocToCalendar(doc);
  pushToast('✅','수정 완료', doc.title+' 회의록이 수정됐어요');
}

/* ---- notes → calendar integration ---- */
var guestNoticeShown = false;
/* 회의록을 서버에 저장(생성/수정). 같은 문서의 요청은 순서대로 처리 */
function persistDoc(doc){
  if(!calApiMode) return Promise.resolve(doc);
  doc._p = (doc._p || Promise.resolve()).then(function(){
    var body = {title:doc.title, attendees:doc.attendees, raw:doc.raw || '', status:doc.status,
      structure:{others:doc.others || [], decisions:doc.decisions || [], actions:doc.actions || []}};
    var m = /^p(\d+)$/.exec(doc.project || '');
    if(m) body.project_id = parseInt(m[1], 10);
    if(doc.serverId){
      return apiFetch('/api/meetings/'+doc.serverId, {method:'PATCH', body:JSON.stringify(body)});
    }
    body.doc_date = docIso(doc.date);
    return apiFetch('/api/meetings', {method:'POST', body:JSON.stringify(body)}).then(function(row){ doc.serverId = row.id; });
  }).then(function(){ return doc; }, function(e){
    pushToast('⚠️','회의록을 서버에 저장하지 못했어요', e.message);
    return doc;
  });
  return doc._p;
}
function docFromServer(row){
  var lines = (row.raw || '').split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
  var d = buildDocFromLines(row.title, row.doc_date.replace(/-/g, '.'), row.attendees, lines);
  if(row.structure){ d.others = row.structure.others || []; d.decisions = row.structure.decisions || []; d.actions = row.structure.actions || []; }
  d.serverId = row.id; d.status = row.status; d.raw = row.raw;
  d.project = row.project_id ? 'p'+row.project_id : null;
  d.detections = row.detections || [];
  d.authorId = row.author_id; d.author = row.author; d.canEdit = row.can_edit !== false;
  return d;
}
function syncDocToCalendar(doc){
  // 회의록이 만들어지거나 수정되면 저장하고, AI 가 일정(시작~종료)을 찾아 캘린더에 반영한다
  if(!calApiMode){
    if(!guestNoticeShown){ guestNoticeShown = true; pushToast('🔒','AI 일정 분석은 로그인 후 사용할 수 있어요','구글/네이버/이메일로 로그인하면 회의록이 저장되고 캘린더에 반영돼요'); }
    return;
  }
  // 이미 분석했던 회의록의 내용이 바뀌었다면(수정): 예전 내용에서 만들어진 일정/후보를 지우고 새 내용으로 다시 만든다
  var edited = detectCache[doc.id]!==undefined && detectCache[doc.id]!==doc.raw;
  persistDoc(doc)
    .then(function(){ return edited ? resetDocDerived(doc) : null; })
    .then(function(){ refreshDetections(true, true); });
}
function resetDocDerived(doc){
  // 무시한 항목은 그대로 두고, 나머지 후보와 이 회의록이 만든 AI 일정은 지운다
  calDetect = calDetect.filter(function(c){ return c.docId!==doc.id || c.status==='dismissed'; });
  function dropLocal(){
    calendarEvents = calendarEvents.filter(function(e){ return !(e.cls==='ai' && e.docServerId && e.docServerId===doc.serverId); });
    renderCalendarEvents(); renderCalSelector(); renderDetectCard();
  }
  if(!doc.serverId){ dropLocal(); return Promise.resolve(); }
  return apiFetch('/api/meetings/'+doc.serverId+'/events', {method:'DELETE'}).then(function(res){
    dropLocal();
    if(res && res.deleted) pushToast('🔄','회의록이 바뀌어 일정을 다시 만들어요','이전 내용에서 만든 일정 '+res.deleted+'개를 지우고 새 내용으로 다시 분석해요');
  }).catch(function(e){ dropLocal(); pushToast('⚠️','이전 일정을 정리하지 못했어요', e.message); });
}
renderMeetingDocs();

