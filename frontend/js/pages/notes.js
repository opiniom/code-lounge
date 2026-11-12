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
  /* 서버에서 목록을 다시 받아도 같은 회의록은 같은 번호를 유지한다. (번호가 바뀌면 방금 분석한 일정 후보가 회의록과 연결이 끊겨,
     나중에 회의록을 고치거나 지워도 그 일정이 지워지지 않고 남았다) */
  var prev = meetingDocs.filter(function(x){ return x.serverId === row.id; })[0];
  if(prev) d.id = prev.id;
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
  // 이미 분석했던 회의록의 내용이 바뀌었다면(수정): 새 내용과 맞춰서, 더는 적혀 있지 않은 일정만 지우고 새로 생긴 일정만 추가한다
  // (예전에는 이 회의록의 일정을 전부 지우고 다시 만들어서, 그때마다 팀원에게 '새 일정' 알림이 또 갔다)
  var edited = detectCache[doc.id]!==undefined && detectCache[doc.id]!==doc.raw;
  persistDoc(doc).then(function(){
    /* 저장 직후 서버가 보내는 '회의록이 바뀜' 신호가 이 글을 '이미 분석한 글'로 표시해 버리면 재분석이 건너뛰어졌다 → 방금 저장한 글은 항상 새로 분석한다 */
    delete detectCache[doc.id];
    return edited ? reconcileDocEvents(doc) : refreshDetections(true, true);
  });
}
function reconcileDocEvents(doc){
  return analyzeDoc(doc).then(function(fresh){
    var keep = {};
    calDetect.filter(function(c){ return c.docId===doc.id; }).forEach(function(c){ keep[c.title+'|'+c.start] = true; });
    var stale = !doc.serverId ? [] : calendarEvents.filter(function(e){ return e.cls==='ai' && e.docServerId===doc.serverId && !keep[e.title+'|'+e.start]; });
    return Promise.all(stale.map(function(e){
      return apiFetch('/api/calendar/events/'+e.serverId, {method:'DELETE'}).then(function(){ return e; }).catch(function(){ return null; });   // 내가 만든 일정이 아니면 못 지운다 → 그대로 둔다
    })).then(function(gone){
      var removed = gone.filter(Boolean);
      if(removed.length){
        var ids = {}; removed.forEach(function(e){ ids[e.id] = true; });
        calendarEvents = calendarEvents.filter(function(e){ return !ids[e.id]; });
        syncCandidateStatus(); renderCalendarEvents(); renderCalSelector(); renderDetectCard();
        pushToast('🔄','회의록 내용에 맞춰 일정을 정리했어요','더는 적혀 있지 않은 일정 '+removed.length+'개를 지웠어요');
      }
      if(fresh.length) return addCandidates(fresh, {auto:true});
    });
  });
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

