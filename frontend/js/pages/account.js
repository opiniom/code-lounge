/* ---- 회원 탈퇴 (마이페이지 → 계정 탈퇴) ----
   1단계: 탈퇴하면 무엇이 어떻게 되는지 내 데이터 기준으로 보여준다 (프로젝트 삭제/팀장 이전, 지워지는 정보, 남는 기록)
   2단계: 약관 확인 + 동의 2가지 + 확인 문구 입력 → 탈퇴
   서버(/api/account/withdraw)도 같은 조건을 직접 한 번 더 확인한다. */
var WD = { data:null, step:1, busy:false, built:false, c1:false, c2:false, reason:'', reasonText:'', typed:'' };

function wdH(tag, attrs, kids){
  var e = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function(k){
    var v = attrs[k]; if(v == null || v === false) return;
    if(k === 'class') e.className = v; else if(k === 'text') e.textContent = v; else if(k === 'html') e.innerHTML = v; else if(k.slice(0, 2) === 'on') e[k] = v; else e.setAttribute(k, v === true ? '' : v);
  });
  (kids || []).forEach(function(c){ if(c == null || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function wdN(n){ return (n || 0).toLocaleString('ko-KR'); }

function wdTerms(d){
  return [
    ['1. 탈퇴하면 바로 삭제되는 정보', [
      '계정 정보(이메일·이름·로그인 연동 정보), 프로필, 포트폴리오, 팔로우·팔로워 관계, 알림',
      '내가 누른 좋아요·북마크·팀원 지원 내역, 코드 실행 기록, 개인 일정·개인 회의록, 내가 만든 초대 링크',
      '내가 쓴 커뮤니티 글과 댓글(제목·본문이 비워지고 삭제 처리돼요)'
    ]],
    ['2. 프로젝트는 이렇게 처리돼요', [
      '내가 팀장이고 다른 팀원이 없는 프로젝트는 파일·채팅·회의록·일정까지 모두 삭제돼요.',
      '내가 팀장이고 다른 팀원이 있는 프로젝트는 팀장이 자동으로 넘어가요(부팀장이 먼저, 없으면 먼저 참여한 팀원). 프로젝트 데이터는 팀에 그대로 남아요.',
      '다른 사람의 프로젝트에서는 나가게 되고, 내가 남긴 채팅·파일 수정·회의록 기록은 팀을 위해 남되 작성자가 「탈퇴한 사용자」로 표시돼요.'
    ]],
    ['3. 탈퇴 기록의 보관', [
      '탈퇴 사실 확인과 문의 대응, 부정 이용 방지를 위해 탈퇴 기록(일부를 가린 이메일, 이름, 가입·탈퇴 일시, 탈퇴 사유, 처리 내용)을 ' + d.keep_days + '일 동안만 운영진이 볼 수 있게 보관하고, ' + d.keep_days + '일이 지나면 자동으로 삭제해요.',
      '이 기록 외에 개인 정보는 남기지 않아요. 관련 법령에서 보관을 요구하는 정보가 생기면 그 기간 동안 따로 보관할 수 있어요.'
    ]],
    ['4. 탈퇴 후에는', [
      '탈퇴한 계정과 삭제된 데이터는 어떤 방법으로도 복구할 수 없어요. ' + d.keep_days + '일 안이라도 마찬가지예요.',
      '같은 이메일로 다시 가입할 수는 있지만 완전히 새 계정이고, 이전 데이터는 이어지지 않아요.',
      '진행 중인 통화·접속은 즉시 종료돼요.',
      'Google·네이버 같은 외부 로그인의 앱 연동 정보는 해당 서비스의 설정에서 따로 해제해 주세요.'
    ]]
  ];
}

function wdEnsure(){
  if(WD.built) return;
  WD.built = true;
  var ov = wdH('div', { class:'wd-overlay', id:'wdOverlay', role:'dialog', 'aria-modal':'true', 'aria-labelledby':'wdTitle', hidden:true, onclick:function(e){ if(e.target === ov) wdClose(); } }, [
    wdH('div', { class:'wd-sheet' }, [
      wdH('div', { class:'wd-head' }, [wdH('h3', { id:'wdTitle', text:'계정 탈퇴' }), wdH('button', { class:'wd-x', type:'button', 'aria-label':'닫기', html:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>', onclick:function(){ wdClose(); } })]),
      wdH('div', { class:'wd-steps', id:'wdSteps' }, [wdH('i'), wdH('i')]),
      wdH('div', { class:'wd-body', id:'wdBody' }),
      wdH('div', { class:'wd-foot', id:'wdFoot' })
    ])
  ]);
  document.body.appendChild(ov);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !ov.hidden) wdClose(); });
}

function wdOpen(){
  if(!authToken || !calApiMode){ pushToast('ℹ️', '로그인한 계정만 탈퇴할 수 있어요', ''); return; }
  wdEnsure();
  WD.step = 1; WD.busy = false; WD.data = null; WD.c1 = WD.c2 = false; WD.reason = ''; WD.reasonText = ''; WD.typed = '';
  var ov = document.getElementById('wdOverlay'); ov.hidden = false; document.documentElement.classList.add('wd-lock');
  wdRender();
  apiFetch('/api/account/withdraw/preview').then(function(d){ WD.data = d; wdRender(); }).catch(function(e){ WD.data = { error:(e && e.message) || '불러오지 못했어요.' }; wdRender(); });
}
function wdClose(){
  if(WD.busy) return;
  var ov = document.getElementById('wdOverlay'); if(ov) ov.hidden = true;
  document.documentElement.classList.remove('wd-lock');
}

function wdSection(title, rows){ return wdH('section', { class:'wd-sec' }, [wdH('h4', { text:title }), wdH('ul', { class:'wd-list' }, rows)]); }
function wdRow(icon, title, detail, tag, kind){
  return wdH('li', {}, [wdH('span', { class:'wd-ic', html:icon }), wdH('div', {}, [wdH('b', { text:title }), detail ? wdH('small', { text:detail }) : null]), tag ? wdH('em', { class:'wd-tag ' + (kind || ''), text:tag }) : null]);
}
var WD_I = {
  proj:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.3l2 2.2H18A2.5 2.5 0 0 1 20.5 9.7v7.8A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>',
  user:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c1-3.8 3.6-5.7 7-5.7s6 1.9 7 5.7"/></svg>',
  trash:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  keep:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  clock:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
};

function wdRender(){
  var title = document.getElementById('wdTitle'), body = document.getElementById('wdBody'), foot = document.getElementById('wdFoot'), steps = document.getElementById('wdSteps');
  if(!body) return;
  body.innerHTML = ''; foot.innerHTML = '';
  var d = WD.data;
  var close = wdH('button', { class:'btn', type:'button', text:'닫기', onclick:function(){ wdClose(); } });
  steps.hidden = !(d && !d.error && !d.blocked);
  [].slice.call(steps.children).forEach(function(i, n){ i.className = n < WD.step ? 'on' : ''; });
  if(!d){ title.textContent = '계정 탈퇴'; body.appendChild(wdH('div', { class:'wd-loading', html:'<span class="wd-spin"></span>내 계정 정보를 확인하는 중…' })); foot.appendChild(close); return; }
  if(d.error){ title.textContent = '계정 탈퇴'; body.appendChild(wdH('div', { class:'wd-loading', text:d.error })); foot.appendChild(close); return; }
  if(d.blocked){
    title.textContent = '탈퇴할 수 없어요';
    body.appendChild(wdH('div', { class:'wd-banner info' }, [wdH('b', { text:'최고관리자 계정이에요' }), wdH('span', { text:d.blocked })]));
    foot.appendChild(close); return;
  }
  if(WD.step === 1) wdStep1(d, title, body, foot, close); else wdStep2(d, title, body, foot);
}

function wdStep1(d, title, body, foot, close){
  title.textContent = '정말 탈퇴하시겠어요?';
  body.appendChild(wdH('div', { class:'wd-banner danger' }, [wdH('b', { text:'탈퇴하면 되돌릴 수 없어요' }), wdH('span', { text:'계정과 활동 데이터가 삭제되고, 어떤 방법으로도 복구할 수 없어요. 아래 내용을 꼭 확인해 주세요.' })]));
  var projRows = d.owned.map(function(o){
    return o.action === 'transfer'
      ? wdRow(WD_I.proj, o.title, '팀원 ' + wdN(o.members) + '명 · 팀장이 ' + o.successor + ' 님께 넘어가요', '팀장 이전', 'move')
      : wdRow(WD_I.proj, o.title, '다른 팀원이 없어서 파일·채팅·회의록·일정이 모두 삭제돼요', '삭제', 'del');
  });
  if(d.member_of) projRows.push(wdRow(WD_I.user, '참여 중인 프로젝트 ' + wdN(d.member_of) + '개', '프로젝트에서 나가요. 내가 남긴 기록은 「탈퇴한 사용자」로 표시돼요', '나가기', 'move'));
  if(!projRows.length) projRows.push(wdRow(WD_I.proj, '참여 중인 프로젝트가 없어요', '', '', ''));
  body.appendChild(wdSection('내 프로젝트', projRows));
  var gone = [];
  gone.push(wdRow(WD_I.user, '계정 정보 · 프로필 · 포트폴리오', '이메일, 이름, 소개, 알림이 삭제돼요', '삭제', 'del'));
  gone.push(wdRow(WD_I.trash, '커뮤니티 글 ' + wdN(d.posts) + '개 · 댓글 ' + wdN(d.comments) + '개', '내용이 비워지고 삭제 처리돼요', '삭제', 'del'));
  gone.push(wdRow(WD_I.trash, '코드 실행 기록 ' + wdN(d.runs) + '개', '', '삭제', 'del'));
  gone.push(wdRow(WD_I.user, '팔로잉 ' + wdN(d.following) + '명 · 팔로워 ' + wdN(d.followers) + '명', '관계가 모두 끊어져요', '삭제', 'del'));
  body.appendChild(wdSection('삭제되는 정보', gone));
  body.appendChild(wdSection('보관과 재가입', [
    wdRow(WD_I.clock, '탈퇴 기록은 ' + d.keep_days + '일만 보관', '문의 대응을 위해 운영진만 ' + d.keep_days + '일간 볼 수 있고, 이후 자동 삭제돼요', '', ''),
    wdRow(WD_I.keep, '같은 이메일로 다시 가입은 가능', '다만 새 계정이라 이전 데이터는 이어지지 않아요', '', '')
  ]));
  foot.appendChild(close);
  foot.appendChild(wdH('button', { class:'btn wd-next', type:'button', text:'다음 · 약관 확인', onclick:function(){ WD.step = 2; wdRender(); document.getElementById('wdBody').scrollTop = 0; } }));
}

function wdCheck(id, text, key, req){
  var inp = wdH('input', { type:'checkbox', id:id }); inp.checked = !!WD[key];
  inp.onchange = function(){ WD[key] = inp.checked; wdSync(); };
  return wdH('label', { class:'wd-check', 'for':id }, [inp, wdH('span', { class:'wd-box', html:'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' }), wdH('span', { class:'wd-ct' }, [wdH('em', { text:req }), ' ' + text])]);
}
function wdStep2(d, title, body, foot){
  title.textContent = '약관 확인 후 탈퇴';
  var terms = wdH('div', { class:'wd-terms', tabindex:'0', 'aria-label':'탈퇴 안내 및 개인정보 처리 약관' }, [wdH('h5', { text:'서비스 탈퇴 안내 및 개인정보 처리' })]);
  wdTerms(d).forEach(function(sec){ terms.appendChild(wdH('h6', { text:sec[0] })); terms.appendChild(wdH('ul', {}, sec[1].map(function(t){ return wdH('li', { text:t }); }))); });
  body.appendChild(terms);
  body.appendChild(wdCheck('wdC1', '위 탈퇴 안내와 개인정보 처리 내용을 모두 읽고 동의합니다.', 'c1', '[필수]'));
  body.appendChild(wdCheck('wdC2', '탈퇴하면 계정과 데이터를 복구할 수 없다는 것을 이해했습니다.', 'c2', '[필수]'));
  var sel = wdH('select', { class:'wd-input', id:'wdReason', 'aria-label':'탈퇴 사유' }, [wdH('option', { value:'', text:'탈퇴 사유 (선택)' })].concat(d.reasons.map(function(r){ return wdH('option', { value:r.code, text:r.label }); })));
  sel.value = WD.reason; sel.onchange = function(){ WD.reason = sel.value; };
  var rt = wdH('textarea', { class:'wd-input', id:'wdReasonText', rows:'2', maxlength:'200', placeholder:'더 하고 싶은 말이 있다면 적어 주세요 (선택)' }); rt.value = WD.reasonText; rt.oninput = function(){ WD.reasonText = rt.value; };
  body.appendChild(wdH('div', { class:'wd-reason' }, [sel, rt]));
  var typed = wdH('input', { class:'wd-input wd-confirm', id:'wdTyped', type:'text', autocomplete:'off', autocapitalize:'off', spellcheck:'false', placeholder:'위 문구를 그대로 입력해 주세요', 'aria-label':'확인 문구 입력' }); typed.value = WD.typed;
  typed.oninput = function(){ WD.typed = typed.value; wdSync(); };
  typed.onkeydown = function(e){ if(isEnter(e)){ e.preventDefault(); wdSubmit(); } };
  body.appendChild(wdH('div', { class:'wd-typed' }, [wdH('label', { for:'wdTyped' }, ['확인을 위해 아래 칸에 ', wdH('b', { text:'“' + d.confirm_text + '”' }), ' 를 입력해 주세요.']), typed]));
  body.appendChild(wdH('div', { class:'wd-err', id:'wdErr', role:'alert' }));
  foot.appendChild(wdH('button', { class:'btn', type:'button', id:'wdBack', text:'이전', onclick:function(){ WD.step = 1; wdRender(); } }));
  foot.appendChild(wdH('button', { class:'btn wd-go', type:'button', id:'wdGo', text:'탈퇴하기', onclick:function(){ wdSubmit(); } }));
  wdSync();
}
function wdValid(){ return !!(WD.data && WD.c1 && WD.c2 && WD.typed.trim() === WD.data.confirm_text); }
function wdSync(){
  var go = document.getElementById('wdGo'); if(!go) return;
  go.disabled = WD.busy || !wdValid(); go.classList.toggle('busy', WD.busy);
  go.textContent = WD.busy ? '탈퇴 처리 중…' : '탈퇴하기';
  var back = document.getElementById('wdBack'); if(back) back.disabled = WD.busy;
}
function wdSubmit(){
  if(WD.busy || !wdValid()) return;
  WD.busy = true; wdSync();
  var err = document.getElementById('wdErr'); if(err) err.textContent = '';
  apiFetch('/api/account/withdraw', { method:'POST', body:JSON.stringify({ agree_terms:WD.c1, agree_data:WD.c2, confirm_text:WD.typed.trim(), reason:WD.reason || null, reason_text:WD.reasonText.trim() || null }) })
    .then(function(r){
      WD.busy = false; wdClose();
      mockLogout('withdrawn');                 // 서버는 이미 이 계정의 토큰을 무효로 했다 → 화면도 바로 로그아웃 상태로
      wdDone(r && r.keep_days ? r.keep_days : 7);
    })
    .catch(function(e){
      WD.busy = false; wdSync();
      var el = document.getElementById('wdErr'); if(el) el.textContent = (e && e.message) || '탈퇴하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
    });
}
function wdDone(days){
  wdEnsure();
  var ov = document.getElementById('wdOverlay'), title = document.getElementById('wdTitle'), body = document.getElementById('wdBody'), foot = document.getElementById('wdFoot'), steps = document.getElementById('wdSteps');
  steps.hidden = true; title.textContent = '탈퇴가 완료됐어요'; body.innerHTML = ''; foot.innerHTML = '';
  body.appendChild(wdH('div', { class:'wd-done' }, [
    wdH('div', { class:'wd-done-ic', html:'<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' }),
    wdH('b', { text:'그동안 DureSync를 이용해 주셔서 감사합니다' }),
    wdH('p', { text:'계정과 개인 데이터는 삭제됐어요. 탈퇴 기록은 ' + days + '일 뒤 자동으로 지워져요. 언제든 다시 가입할 수 있어요.' })
  ]));
  foot.appendChild(wdH('button', { class:'btn primary wd-ok', type:'button', text:'확인', onclick:function(){ ov.hidden = true; document.documentElement.classList.remove('wd-lock'); goView('home'); } }));
  ov.hidden = false; document.documentElement.classList.add('wd-lock');
}
