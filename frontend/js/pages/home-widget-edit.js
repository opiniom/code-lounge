/* =========================================================
   홈 위젯 편집 모드 (아이폰 홈 화면처럼)
   ---------------------------------------------------------
   · 위젯을 꾹 누르면(약 0.5초) 편집 모드로 들어가요: 위젯이 살짝 흔들리고, 왼쪽 위에 − (빼기), 오른쪽 위에 ↔ (크기) 버튼이 떠요.
   · 꾹 누른 채로 끌면 바로 집어 올려져서, 원하는 자리에 놓으면 돼요. 끄는 동안 다른 위젯은 알아서 비켜 주고, 놓는 순간 그 자리에 딱 맞게 정렬돼요.
   · 편집 모드에서는 손가락(또는 마우스)을 잠깐 대고 있으면(0.16초) 집어 올려지고, 그냥 쓸어내리면 화면이 스크롤돼요.
   · 끝낼 때는 아래에 뜬 [완료], 위젯 바깥 빈 곳, Esc 중 아무거나. 순서·크기는 이 기기에 저장돼요(localStorage).
   · 터치(폰·태블릿·PWA)와 마우스 모두 Pointer Events 로 처리해요. 끄는 동안 화면이 같이 스크롤되지 않게 막고, 가장자리에 닿으면 자동 스크롤해요.
   · 접근성: 편집 모드에서 위젯에 Tab 으로 가서 방향키(←↑ 앞으로 · →↓ 뒤로)로도 옮길 수 있어요. 움직임 줄이기 설정이면 흔들림·이동 애니메이션을 끄고요.
   ========================================================= */
(function(){
  var grid = document.getElementById('widgetGrid'); if(!grid) return;
  var HOLD_MS = 480;          // 보통 상태에서 꾹 누르기로 인식하는 시간
  var PICK_MS = 160;          // 편집 모드에서 손가락을 대고 있으면 집어 올리는 시간
  var TOL = 10;               // 이만큼 움직이면 '스크롤/스와이프'로 보고 꾹 누르기를 취소 (px)
  var MOUSE_DRAG_PX = 4;      // 편집 모드에서 마우스는 이만큼만 움직여도 바로 집는다
  var press = null, drag = null, swallowUntil = 0, bar = null;

  function reduced(){ return document.documentElement.getAttribute('data-motion') === 'reduce' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function editing(){ return grid.classList.contains('editing'); }
  function buzz(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
  function widgets(){ return Array.prototype.filter.call(grid.querySelectorAll('.dyn-widget'), function(w){ return !w.hidden; }); }
  function now(){ return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* ---------- 크기 버튼(↔): 모든 위젯에 한 번만 붙여 둔다 (편집 모드에서만 보인다) ---------- */
  function addSizeButtons(){
    grid.querySelectorAll('.dyn-widget').forEach(function(w){
      if(w.querySelector('.dyn-size')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'dyn-size'; b.setAttribute('aria-label', '위젯 크기 바꾸기'); b.title = '크기 바꾸기 (넓게 ↔ 보통)';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>';
      b.addEventListener('click', function(e){ e.stopPropagation(); wgToggleSize(w.dataset.widget); });
      w.appendChild(b);
    });
  }
  window.wgToggleSize = function(id){
    var w = grid.querySelector('.dyn-widget[data-widget="'+id+'"]'); if(!w) return;
    flip(function(){ w.classList.toggle('wide'); });
    buzz(8); if(typeof saveWidgetPrefs === 'function') saveWidgetPrefs();
  };

  /* ---------- 자리 이동 애니메이션 (FLIP): 바뀌기 전 위치 → 바뀐 위치로 부드럽게 ---------- */
  function flip(change){
    var list = widgets(), before = list.map(function(w){ return w.getBoundingClientRect(); });
    change();
    if(reduced()) return;
    list.forEach(function(w, i){
      var a = before[i], b = w.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top, sx = b.width ? a.width / b.width : 1, sy = b.height ? a.height / b.height : 1;
      if(Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < .01 && Math.abs(sy - 1) < .01) return;
      w.style.transition = 'none'; w.style.transformOrigin = '0 0'; w.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
      void w.offsetWidth;
      w.style.transition = 'transform .24s cubic-bezier(.2,.9,.3,1)'; w.style.transform = '';
      setTimeout(function(){ w.style.transition = ''; w.style.transformOrigin = ''; }, 280);
    });
  }

  /* ---------- 편집 모드 켜기/끄기 ---------- */
  window.wgToggleEdit = function(force){
    var on = (typeof force === 'boolean') ? force : !editing();
    if(on === editing()) return;
    if(on) addSizeButtons();
    grid.classList.toggle('editing', on);
    document.documentElement.classList.toggle('wg-edit', on);
    var b = document.getElementById('wgEditBtn'); if(b){ b.textContent = on ? '완료' : '편집'; b.classList.toggle('active', on); }
    grid.querySelectorAll('.dyn-widget').forEach(function(c){
      c.removeAttribute('draggable');
      if(on) c.tabIndex = 0; else c.removeAttribute('tabindex');
    });
    if(on) showBar(); else hideBar();
    if(!on && drag) endDrag(true);
  };
  function showBar(){
    if(bar) return;
    bar = document.createElement('div'); bar.className = 'wg-editbar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', '위젯 편집');
    bar.innerHTML = '<span class="we-tx"><b>끌어서 옮기고, − 로 빼요</b><small>↔ 로 넓게·보통을 바꿀 수 있어요</small></span><button type="button" class="we-add">＋ 위젯 추가</button><button type="button" class="we-done">완료</button>';
    bar.querySelector('.we-done').onclick = function(){ wgToggleEdit(false); };
    bar.querySelector('.we-add').onclick = function(){ if(typeof wgOpen === 'function') wgOpen(); };
    document.body.appendChild(bar);
    requestAnimationFrame(function(){ bar && bar.classList.add('in'); });
  }
  function hideBar(){ if(!bar) return; var b = bar; bar = null; b.classList.remove('in'); setTimeout(function(){ if(b.parentNode) b.parentNode.removeChild(b); }, 220); }

  /* ---------- − 버튼: 사라지는 애니메이션 뒤에 빼고, 남은 위젯이 알아서 채운다 ---------- */
  grid.addEventListener('click', function(e){
    var c = e.target.closest && e.target.closest('.dyn-close'); if(!c || !editing()) return;
    var w = c.closest('.dyn-widget'); if(!w) return;
    e.preventDefault(); e.stopPropagation(); buzz(10);
    var done = function(){ flip(function(){ if(typeof removeWidget === 'function') removeWidget(w.dataset.widget); w.classList.remove('removing'); }); if(!widgets().length) wgToggleEdit(false); };
    if(reduced()){ done(); return; }
    w.classList.add('removing'); setTimeout(done, 170);
  }, true);

  /* ---------- 눌렀을 때: 꾹 누르기(보통) / 집어 올리기(편집) 준비 ---------- */
  grid.addEventListener('pointerdown', function(e){
    if(drag) return;
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    var el = e.target.closest && e.target.closest('.dyn-widget'); if(!el || el.hidden) return;
    if(e.target.closest('.dyn-close, .dyn-size')) return;
    cancelPress();
    press = { el: el, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, id: e.pointerId, type: e.pointerType, timer: 0, instant: false };
    if(editing() && e.pointerType === 'mouse'){ press.instant = true; return; }        // 마우스(편집 중): 조금 움직이면 바로 집는다
    var wait = editing() ? PICK_MS : HOLD_MS;
    press.timer = setTimeout(function(){
      if(!press) return;
      var p = press; press = null;
      if(!editing()){ wgToggleEdit(true); swallowUntil = now() + 700; }               // 꾹 누름 → 편집 모드 (뒤따라오는 클릭은 무시)
      buzz(16);
      beginDrag(p.el, p.lx, p.ly, p.id);
    }, wait);
  });
  function cancelPress(){ if(press){ clearTimeout(press.timer); press = null; } }

  window.addEventListener('pointermove', function(e){
    if(press && e.pointerId === press.id){
      press.lx = e.clientX; press.ly = e.clientY;
      var dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if(press.instant){ if(dist > MOUSE_DRAG_PX){ var p = press; press = null; beginDrag(p.el, p.x, p.y, p.id); moveTo(e.clientX, e.clientY); } return; }
      if(dist > TOL) cancelPress();                                                     // 스크롤·스와이프로 판단
      return;
    }
    if(drag && e.pointerId === drag.id){ e.preventDefault(); moveTo(e.clientX, e.clientY); }
  }, { passive: false });
  function finish(e){
    if(press && e.pointerId === press.id) cancelPress();
    if(drag && e.pointerId === drag.id) endDrag(false);
  }
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  window.addEventListener('blur', function(){ cancelPress(); if(drag) endDrag(false); });
  document.addEventListener('visibilitychange', function(){ if(document.hidden){ cancelPress(); if(drag) endDrag(false); } });
  /* 끄는 동안 화면이 같이 스크롤되지 않게 (터치). passive:false 라야 preventDefault 가 먹는다 */
  document.addEventListener('touchmove', function(e){ if(drag && e.cancelable) e.preventDefault(); }, { passive: false });
  /* 꾹 눌렀을 때 뜨는 길게 누르기 메뉴(복사·링크 열기 등)와 글자 선택을 막는다 */
  grid.addEventListener('contextmenu', function(e){ if(press || drag || editing() || now() < swallowUntil) e.preventDefault(); });
  grid.addEventListener('selectstart', function(e){ if(press || drag || editing()) e.preventDefault(); });
  grid.addEventListener('dragstart', function(e){ e.preventDefault(); });               // 브라우저 기본 끌기(링크·이미지)는 쓰지 않는다
  document.addEventListener('click', function(e){ if(now() < swallowUntil){ e.stopPropagation(); e.preventDefault(); } }, true);

  /* ---------- 집어 올리기 ---------- */
  function beginDrag(el, x, y, pid){
    var r = el.getBoundingClientRect();
    var wrap = document.createElement('div'); wrap.className = 'widget-dyn-grid bento wg-float-wrap';       // 위젯 스타일(.widget-dyn-grid.bento .dyn-widget)을 그대로 받으려고 같은 클래스로 감싼다
    var clone = el.cloneNode(true);
    clone.removeAttribute('id'); clone.removeAttribute('tabindex'); clone.classList.add('wg-float'); clone.hidden = false;
    clone.querySelectorAll('[id]').forEach(function(n){ n.removeAttribute('id'); });
    clone.querySelectorAll('.dyn-close, .dyn-size').forEach(function(n){ n.remove(); });
    wrap.style.width = r.width + 'px'; wrap.style.height = r.height + 'px'; wrap.style.left = '0'; wrap.style.top = '0';
    wrap.appendChild(clone); document.body.appendChild(wrap);
    el.classList.add('ph');
    document.documentElement.classList.add('wg-dragging');
    drag = { el: el, wrap: wrap, id: pid, ox: x - r.left, oy: y - r.top, x: x, y: y, lastSwap: 0, raf: 0, vy: 0 };
    place(); requestAnimationFrame(function(){ if(drag) wrap.classList.add('up'); });
    drag.raf = requestAnimationFrame(tick);
  }
  function place(){ if(drag) drag.wrap.style.transform = 'translate3d(' + (drag.x - drag.ox) + 'px,' + (drag.y - drag.oy) + 'px,0)'; }
  function moveTo(x, y){
    if(!drag) return;
    drag.x = x; drag.y = y; place();
    var hot = 84, top = hot, bottom = window.innerHeight - hot - (window.innerWidth <= 820 ? 62 : 0);
    drag.vy = y < top ? -Math.min(20, (top - y) / 4 + 2) : (y > bottom ? Math.min(20, (y - bottom) / 4 + 2) : 0);   // 위·아래 가장자리에 닿으면 자동 스크롤
    reorder();
  }
  function tick(){
    if(!drag) return;
    if(drag.vy){ var before = window.pageYOffset; window.scrollBy(0, drag.vy); if(window.pageYOffset !== before) reorder(); }
    drag.raf = requestAnimationFrame(tick);
  }

  /* ---------- 놓을 자리 찾기: 손가락 밑에 있는 위젯과 자리를 바꾼다 (깜빡임 방지로 가운데쯤에 들어왔을 때만, 짧은 쿨다운) ---------- */
  function reorder(){
    if(!drag || now() - drag.lastSwap < 130) return;
    var x = drag.x, y = drag.y, ph = drag.el, list = widgets().filter(function(w){ return w !== ph; });
    if(!list.length) return;
    var target = null;
    for(var i = 0; i < list.length; i++){
      var r = list[i].getBoundingClientRect(), mx = Math.min(r.width * .14, 28), my = Math.min(r.height * .22, 64);       // 가장자리에 살짝 걸친 정도로는 안 바꾼다 (깜빡임 방지)
      if(x > r.left + mx && x < r.right - mx && y > r.top + my && y < r.bottom - my){ target = list[i]; break; }
    }
    var ref = null, after = false;
    if(target){
      after = !!(ph.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);       // 내가 앞에 있으면 그 뒤로, 뒤에 있으면 그 앞으로
      ref = after ? target.nextSibling : target;
    } else {
      var first = list[0].getBoundingClientRect(), last = list[list.length - 1].getBoundingClientRect();
      if(y > last.bottom + 8 && ph !== widgets().pop()){ ref = null; after = true; }              // 맨 아래 빈 곳 → 맨 끝으로
      else if(y < first.top - 8 && ph !== widgets()[0]){ ref = list[0]; }                           // 맨 위 빈 곳 → 맨 앞으로
      else return;
    }
    if(ref === ph || (ref === null && grid.lastElementChild === ph)) return;
    drag.lastSwap = now();
    flip(function(){ grid.insertBefore(ph, ref); });
    buzz(6);
  }

  /* ---------- 놓기: 떠 있던 카드가 자리로 날아와 앉고, 순서를 저장한다 ---------- */
  function endDrag(instant){
    if(!drag) return;
    var d = drag; drag = null; cancelAnimationFrame(d.raf);
    swallowUntil = now() + 400;
    document.documentElement.classList.remove('wg-dragging');
    var finishUp = function(){
      d.wrap.remove(); d.el.classList.remove('ph');
      if(typeof saveWidgetPrefs === 'function') saveWidgetPrefs();
    };
    if(instant || reduced()){ finishUp(); return; }
    var r = d.el.getBoundingClientRect();
    d.wrap.classList.add('drop'); d.wrap.style.width = r.width + 'px'; d.wrap.style.height = r.height + 'px';
    d.wrap.style.transform = 'translate3d(' + r.left + 'px,' + r.top + 'px,0)';
    buzz(10);
    setTimeout(finishUp, 210);
  }

  /* ---------- 키보드: 편집 모드에서 위젯에 포커스를 두고 방향키로 옮긴다 ---------- */
  grid.addEventListener('keydown', function(e){
    if(!editing()) return;
    var w = e.target.closest && e.target.closest('.dyn-widget'); if(!w || e.target !== w) return;
    var dir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : ((e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : 0);
    if(!dir) return;
    var list = widgets(), i = list.indexOf(w), j = i + dir; if(j < 0 || j >= list.length) return;
    e.preventDefault();
    flip(function(){ grid.insertBefore(w, dir < 0 ? list[j] : list[j].nextSibling); });
    w.focus(); if(typeof saveWidgetPrefs === 'function') saveWidgetPrefs();
  });

  /* ---------- 위젯 바깥 빈 곳을 누르면 편집 끝 ---------- */
  document.addEventListener('pointerdown', function(e){
    if(!editing() || drag) return;
    if(e.target.closest && e.target.closest('.dyn-widget, .wg-editbar, #wgModal, .modal-backdrop, #wgEditBtn, .wg-add-btn, .toast-stack, .mnav, .topbar')) return;
    if(e.target.closest && e.target.closest('#widgetGrid')) wgToggleEdit(false);              // 위젯 사이 틈
    else if(e.target.closest && e.target.closest('.home-section, .home-hero-right, .home-hero')) wgToggleEdit(false);
  });
  addSizeButtons();
})();
