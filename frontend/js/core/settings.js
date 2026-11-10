/* ---- settings: theme ---- */
function openSettings(){ syncThemeButtons(); syncScaleButtons(); syncMotionButtons(); document.getElementById('settingsModal').classList.add('open'); }
function closeSettings(){ var el = document.getElementById('settingsModal'); if(el) el.classList.remove('open'); }
function isDarkMode(){
  var t = document.documentElement.getAttribute('data-theme');
  if(t === 'dark') return true;
  if(t === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function setTheme(mode, opts){
  opts = opts || {};
  /* 테마 바꾸기: 한 번만 눌러도 바로 반응해야 한다.
     화면 전환 효과(startViewTransition)는 변경을 한 박자 늦게 실행하는데, 선택 표시(syncThemeButtons)를 그보다 먼저 계산해서
     한 번 눌러서는 표시가 안 바뀌고 두 번째 눌러야 바뀌는 문제가 있었다. → 실제 변경이 끝난 '뒤'에 표시·아이콘을 맞추고,
     효과가 늦거나 건너뛰어져도 0.35초 안에는 반드시 적용한다. */
  var done = false;
  function apply(){
    if(done) return; done = true;
    if(mode === 'system'){ document.documentElement.removeAttribute('data-theme'); }
    else{ document.documentElement.setAttribute('data-theme', mode); }
    if(window.monaco && monacoEditor){
      try{ monaco.editor.setTheme(isDarkMode() ? 'vs-dark' : 'vs'); }catch(e){}
    }
    syncThemeButtons();
    try{ document.dispatchEvent(new Event('themechange')); }catch(e){}
  }
  var calm = document.documentElement.getAttribute('data-motion') === 'reduce' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if(document.startViewTransition && document.visibilityState === 'visible' && !calm){
    try{
      var vt = document.startViewTransition(apply);
      if(vt && vt.finished) vt.finished.then(apply, apply);
      setTimeout(apply, 350);                       // 안전장치: 효과가 막혀도 적용은 된다
    }catch(e){ apply(); }
  } else {
    document.documentElement.classList.add('theme-fading');
    apply();
    setTimeout(function(){ document.documentElement.classList.remove('theme-fading'); }, 400);
  }
  try{ localStorage.setItem('root_theme', mode); }catch(e){}
  syncThemeButtons(mode);                           // 누른 즉시 선택 표시도 먼저 맞춘다
  if(!opts.silent && typeof prefsPush === 'function') prefsPush('theme');      // 다른 기기(웹/앱)도 같은 테마로
  if(opts.silent) return;                           // 다른 기기에서 바뀐 걸 따라갈 때는 알림을 띄우지 않는다
  pushToast(mode==='dark'?'🌙':mode==='light'?'☀️':'🖥️','테마 변경됨', mode==='system' ? '시스템 설정을 따라가요' : (mode==='dark'?'다크 모드로 바꿨어요':'라이트 모드로 바꿨어요'));
}
/* ---- 움직임 (켜기 / 줄이기) ---- */
function setMotion(m){
  if(m === 'reduce') document.documentElement.setAttribute('data-motion', 'reduce'); else document.documentElement.removeAttribute('data-motion');
  try { localStorage.setItem('sync_motion', m); } catch(e){}
  syncMotionButtons();
  pushToast(m === 'reduce' ? '🧘' : '✨', m === 'reduce' ? '움직임을 줄였어요' : '애니메이션을 켰어요', '', { duration:2200 });
}
function syncMotionButtons(){
  var cur = document.documentElement.getAttribute('data-motion') === 'reduce' ? 'reduce' : 'full';
  document.querySelectorAll('#motionOptions .scale-opt').forEach(function(b){ b.classList.toggle('active', b.dataset.motion === cur); });
}
/* ---- 화면 크기 (자동/수동) ---- */
function currentUiScale(){ return window.__uiScale || 1; }
function setUiScale(pref){
  window.__uiScalePref = pref;
  try { localStorage.setItem('sync_ui_scale', pref); } catch(e){}
  applyUiScale();
  syncScaleButtons();
  pushToast('🔍', '화면 크기 변경', pref === 'auto' ? '모니터 너비에 맞춰 자동으로 조절해요' : Math.round(parseFloat(pref) * 100) + '%로 고정했어요');
}
function applyUiScale(){
  var s = window.__uiScaleApply ? window.__uiScaleApply() : 1;
  if (window.monaco && monacoEditor) setTimeout(function(){ monacoEditor.layout(); }, 60);
  return s;
}
function syncScaleButtons(){
  var pref = window.__uiScalePref || 'auto';
  document.querySelectorAll('.scale-opt').forEach(function(b){ b.classList.toggle('active', b.dataset.scale === pref); });
  var hint = document.getElementById('scaleHint');
  if (hint) hint.textContent = '현재 ' + Math.round(currentUiScale() * 100) + '% · ' + (pref === 'auto' ? '창 너비 ' + window.innerWidth + 'px 기준으로 자동 조절 중' : '직접 고른 크기');
}
var __scaleTimer = null;
window.addEventListener('resize', function(){
  clearTimeout(__scaleTimer);
  __scaleTimer = setTimeout(function(){ if ((window.__uiScalePref || 'auto') === 'auto') { applyUiScale(); syncScaleButtons(); } }, 150);
});
function syncThemeButtons(forced){
  var current = forced || document.documentElement.getAttribute('data-theme') || 'system';
  document.querySelectorAll('.theme-opt').forEach(function(b){ b.classList.toggle('active', b.dataset.themeChoice===current); });
}

/* ---- settings: profile ---- */
var myProfile = { name:'나', role:'', swatch:0 };
var avatarSwatches = [
  'linear-gradient(150deg,#3B82F6,#8B5CF6)',
  'linear-gradient(150deg,#06B6D4,#EC4899)',
  'linear-gradient(150deg,#F59E0B,#3B82F6)',
  'linear-gradient(150deg,#8B5CF6,#22D3EE)'
];
var myAiName = '';
/* AI 호출 판별 — 서버(chat_ai.is_ai_request)와 같은 규칙: 메시지 맨 앞의 "이름야 …" / "@이름 …" (이름 = AI·sync·에이아이·프로필에서 정한 이름). 슬래시 명령어는 없다 */
function aiRequestRe(){
  var names = ['AI','Dure','두레','DureSync','sync','에이아이'];
  if(myAiName && myAiName.trim()) names.push(myAiName.trim());
  var alts = names.map(function(n){ return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
  return new RegExp('^\\s*(@(' + alts + ')(\\s|$)|(' + alts + ')\\s*(야|아|,)\\s*)', 'i');
}
function isAiRequest(text){ return aiRequestRe().test(text || ''); }
var pfmFields = null;     // 상세 프로필 입력칸 (로그인했을 때만)
async function openProfileModal(){
  document.getElementById('profileAiNameInput').value = myAiName || '';
  document.getElementById('profileNameInput').value = (currentUser && currentUser.username) || myProfile.name;
  document.getElementById('profileRoleInput').value = myProfile.role;
  syncAvatarSwatchButtons();
  var ex = document.getElementById('pfModalExtra'); ex.innerHTML = ''; pfmFields = null;
  document.getElementById('profileModal').classList.add('open');
  if(calApiMode){
    try {
      var me = await apiFetch('/api/profile/me');
      pfmFields = pfDetailFields(me.profile); ex.appendChild(pfmFields);
    } catch(e){ ex.textContent = '상세 프로필을 불러오지 못했어요.'; }
  } else {
    var tip = document.createElement('p'); tip.className = 'pf-modal-tip'; tip.textContent = '로그인하면 한 줄 소개·기술 스택·링크까지 자세히 적을 수 있어요.'; ex.appendChild(tip);
  }
}
function closeProfileModal(){ var el = document.getElementById('profileModal'); if(el) el.classList.remove('open'); }
function pickAvatarSwatch(i){ myProfile.swatch = i; syncAvatarSwatchButtons(); }
function syncAvatarSwatchButtons(){
  document.querySelectorAll('.avatar-swatch').forEach(function(b,i){ b.classList.toggle('active', i===myProfile.swatch); });
}
function saveProfile(){
  myProfile.name = document.getElementById('profileNameInput').value.trim() || '나';
  myProfile.role = document.getElementById('profileRoleInput').value.trim() || myProfile.role;
  var aiName = document.getElementById('profileAiNameInput').value.trim();
  function done(){
    applyProfileToUI();
    closeProfileModal();
    if(document.querySelector('.view.active') && document.querySelector('.view.active').dataset.view === 'mypage') renderMyPage();
    updateChatPlaceholder();
    pushToast('✅','프로필 저장됨', '내 프로필이 업데이트됐어요' + (aiName ? ' · AI는 "'+aiName+'야"로 불러요' : ''));
  }
  if(calApiMode && pfmFields){
    var vals = pfmFields.getValues(); vals.name = document.getElementById('profileNameInput').value.trim();
    apiFetch('/api/profile/me', { method:'PUT', body:JSON.stringify(vals) }).then(function(){ if(currentUser && vals.name){ currentUser.username = vals.name.slice(0, 20); try { localStorage.setItem('sync_auth_user', JSON.stringify(currentUser)); } catch(e){} } proceed(); }).catch(function(e){ pushToast('⚠️', '프로필을 저장하지 못했어요', e.message); });
    return;
  }
  proceed();
  function proceed(){ continueSave(); }
  function continueSave(){
  if(calApiMode && aiName !== (myAiName || '')){
    apiFetch('/api/auth/me/ai-name', {method:'PUT', body:JSON.stringify({ai_name: aiName})}).then(function(u){
      myAiName = u.ai_name || ''; if(currentUser) currentUser.ai_name = myAiName;
      done();
    }).catch(function(e){ pushToast('⚠️','AI 이름을 저장하지 못했어요', e.message); });
    return;
  }
  if(!calApiMode) myAiName = aiName;   // 로그인 전(게스트)에는 이 화면에서만
  done();
  }
}
function updateChatPlaceholder(){
  if(typeof renderAiGuide === 'function') renderAiGuide();
  var inp = document.getElementById('chatMsgInput');
  if(inp) inp.placeholder = "팀원에게 메시지 · '" + (myAiName || '두레') + "야 …'로 부르면 AI가 알아서 처리해요";
}
function applyProfileToUI(){
  var initial = myProfile.name.trim().slice(0,1) || '나';
  var mpName = document.getElementById('mypageName'); if(mpName) mpName.textContent = myProfile.name;
  var mpRole = document.getElementById('mypageRole'); if(mpRole) mpRole.textContent = myProfile.role;
  var mpAvatar = document.getElementById('mypageAvatar');
  if(mpAvatar){ mpAvatar.textContent = initial; mpAvatar.style.background = avatarSwatches[myProfile.swatch]; }
  var topAvatar = document.getElementById('avatarBtn');
  if(topAvatar){ topAvatar.textContent = initial; topAvatar.style.background = avatarSwatches[myProfile.swatch]; }
}

