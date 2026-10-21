/* ---- 효과음 (디스코드처럼): 새 채팅 · 통화방 입장/퇴장 · 마이크 켜기/끄기 ----
   소리 파일 없이 브라우저(Web Audio)가 짧은 음을 직접 만들어서 냄 → 용량·저작권 걱정 없이 PC·모바일·PWA 모두 같은 소리.
   · 설정에서 끌 수 있다 (이 브라우저에 저장). 방해금지 상태에서는 채팅 소리를 내지 않는다.
   · 브라우저 정책상 처음 화면을 누르기 전에는 소리를 낼 수 없어서, 첫 클릭·터치 때 오디오를 깨운다. */
var SFX = { ctx: null, last: {}, unlocked: false };
function sfxEnabled() { try { return localStorage.getItem('sync_sfx') !== '0'; } catch (e) { return true; } }
function sfxSetEnabled(on) {
  try { localStorage.setItem('sync_sfx', on ? '1' : '0'); } catch (e) {}
  sfxPaint();
  if (on) sfxPlay('unmute', true);
}
function sfxToggle() { sfxSetEnabled(!sfxEnabled()); if (typeof pushToast === 'function') pushToast(sfxEnabled() ? '🔔' : '🔕', sfxEnabled() ? '효과음을 켰어요' : '효과음을 껐어요', sfxEnabled() ? '새 채팅·통화 입장/퇴장 소리가 나요.' : '소리가 나지 않아요.'); }
function sfxPaint() {
  var on = sfxEnabled();
  document.querySelectorAll('.sfx-btn').forEach(function(b) { b.classList.toggle('off', !on); b.title = on ? '효과음 켜짐 (눌러서 끄기)' : '효과음 꺼짐 (눌러서 켜기)'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? '🔔' : '🔕'; });
}
function sfxCtx() {
  if (!SFX.ctx) { try { SFX.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  return SFX.ctx;
}
function sfxUnlock() {
  var c = sfxCtx(); if (!c) return;
  if (c.state === 'suspended') c.resume().catch(function() {});
  SFX.unlocked = true;
}
['pointerdown', 'keydown', 'touchstart'].forEach(function(ev) { document.addEventListener(ev, function() { if (!SFX.unlocked || (SFX.ctx && SFX.ctx.state === 'suspended')) sfxUnlock(); }, { passive: true }); });
/* [주파수Hz, 시작초, 길이초, 세기, 파형] 목록으로 소리를 만든다 */
var SFX_SOUNDS = {
  message:   [[880, 0, .09, .5, 'sine'], [1318, .08, .16, .45, 'sine']],                         // 새 채팅: 톡-또옥
  join:      [[523, 0, .12, .5, 'sine'], [659, .11, .12, .5, 'sine'], [880, .22, .22, .5, 'sine']],// 내가 들어감: 도-미-솔(올라가는 소리)
  peerjoin:  [[659, 0, .1, .4, 'sine'], [988, .09, .18, .4, 'sine']],                            // 팀원이 들어옴
  peerleave: [[784, 0, .1, .35, 'sine'], [523, .09, .2, .35, 'sine']],                           // 팀원이 나감
  leave:     [[880, 0, .12, .45, 'sine'], [659, .11, .12, .45, 'sine'], [440, .22, .24, .45, 'sine']], // 내가 나감: 내려가는 소리
  mute:      [[420, 0, .08, .4, 'triangle'], [300, .07, .12, .4, 'triangle']],
  unmute:    [[400, 0, .07, .4, 'triangle'], [600, .06, .11, .4, 'triangle']]
};
var SFX_GAP = { message: 600, peerjoin: 250, peerleave: 250, join: 400, leave: 400, mute: 120, unmute: 120 };       // 너무 자주 울리지 않게 (밀리초)
function sfxPlay(name, force) {
  if (!force && !sfxEnabled()) return;
  var notes = SFX_SOUNDS[name], c = sfxCtx(); if (!notes || !c) return;
  var now = Date.now(); if (SFX.last[name] && now - SFX.last[name] < (SFX_GAP[name] || 200)) return; SFX.last[name] = now;
  if (c.state === 'suspended') { c.resume().catch(function() {}); if (!SFX.unlocked) return; }     // 아직 화면을 누른 적이 없으면 소리를 낼 수 없다 (조용히 건너뜀)
  try {
    var t0 = c.currentTime + 0.01, master = c.createGain(); master.gain.value = 0.18; master.connect(c.destination);
    notes.forEach(function(n) {
      var o = c.createOscillator(), g = c.createGain(), t = t0 + n[1], end = t + n[2];
      o.type = n[4] || 'sine'; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.001, n[3]), t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, end);
      o.connect(g); g.connect(master); o.start(t); o.stop(end + 0.02);
    });
    setTimeout(function() { try { master.disconnect(); } catch (e) {} }, 900);
  } catch (e) {}
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sfxPaint); else setTimeout(sfxPaint, 0);
