/* ---- 통합 홈의 '제품 화면 예시' (js/pages/hub.js 가 불러 쓴다) ----
   실제 두레 화면(워크스페이스 · 팀 채팅 · 통화방 · 회의록/캘린더 · 커뮤니티)의 구성과 같은 모양으로 그린 예시다. 내용(사람 이름·글)은 모두 꾸며낸 예시이고, 화면에도 '화면은 예시예요'라고 적는다.
   각 화면은 시간 순서대로 '실제로 쓰는 장면'이 움직인다: 코드가 써지고 → 실행하면 에러 → 두레 AI가 설명 → 고쳐서 다시 실행, 채팅에서 두레 AI가 일정을 만들고, 회의록의 날짜가 캘린더로 올라가는 식.
   진행 방식: 화면 뿌리(.hd)에 s1, s2 … 클래스를 차례로 붙이고, CSS 가 그 클래스에 맞춰 보이고 움직인다 (hd-demo 스타일). 화면에 보일 때만 돌고, 끝나면 처음부터 다시 한다. */
var HD = { timers: new WeakMap(), seq: {} };

function hdIc(id){ return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-' + id + '"/></svg>'; }
var HD_FOLDER = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/></svg>';
var HD_FILE = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z"/><path d="M14 3.5V8h4"/></svg>';
var HD_MIC = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/></svg>';
var HD_SEND = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4.5 16-3.5-6.5Z"/><path d="m12 13.5 8-9.5"/></svg>';
var HD_STAR = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.8 2.5 5.3 5.7.7-4.2 4 1.1 5.7L12 16.7 6.9 19.5 8 13.8l-4.2-4 5.7-.7Z"/></svg>';
function hdAv(ch, c, cls){ return '<b class="hd-av' + (cls ? ' ' + cls : '') + '" style="--c:' + c + '">' + ch + '</b>'; }
function hdBar(title, right){ return '<div class="hd-bar"><i></i><i></i><i></i><span class="hd-bt">' + title + '</span>' + (right || '') + '</div>'; }

/* ---------- 워크스페이스: 코드 → 실행 → 에러 → 두레 AI 설명 → 고쳐서 다시 실행 (mode 'run') / 디버거로 한 줄씩 (mode 'dbg') ---------- */
function hdCode(mode){
  var L = function(n, html, cls){ return '<div class="ln' + (cls ? ' ' + cls : '') + '" data-n="' + n + '" style="--k:' + (n - 1) + '"><span class="g">' + n + '</span><span class="c">' + html + '</span></div>'; };
  var k = function(t){ return '<span class="k">' + t + '</span>'; }, f = function(t){ return '<span class="f">' + t + '</span>'; }, n = function(t){ return '<span class="n">' + t + '</span>'; };
  var lines =
    L(1, k('def') + ' ' + f('average') + '(scores):') +
    L(2, '    total = ' + n('0')) +
    L(3, '    ' + k('for') + ' s ' + k('in') + ' scores:') +
    '<div class="ln l4" data-n="4" style="--k:3"><span class="g"><i class="bp"></i><em>4</em></span><span class="c">        total += s</span></div>' +
    '<div class="ln l5" data-n="5" style="--k:4"><span class="g"><i class="bp"></i><em>5</em></span><span class="c"><span class="bad">    ' + k('return') + ' total / ' + f('len') + '(scores)</span><span class="fix">    ' + k('return') + ' total / ' + f('len') + '(scores) ' + k('if') + ' scores ' + k('else') + ' ' + n('0') + '</span></span></div>' +
    L(6, '') + L(7, 'scores = ' + (mode === 'dbg' ? '[' + n('90') + ', ' + n('80') + ', ' + n('70') + ']' : '[]')) + L(8, f('print') + '(' + f('average') + '(scores))') +
    '<div class="tm" aria-hidden="true"><span class="nm">지은</span><i class="cur"></i></div>';
  var tree = '<div class="r"><span class="tw">' + HD_FOLDER + '</span>utils<em>1</em></div><div class="r sub">' + HD_FILE + 'report.py</div><div class="r on">' + HD_FILE + 'main.py<span class="pres" title="지은님이 보는 중">' + hdAv('지', '#EC4899', 'sm') + '</span></div><div class="r">' + HD_FILE + 'README.md</div>';
  var bottom = mode === 'dbg'
    ? '<div class="con dbgp"><div class="ch"><b>디버거</b><span>호출 스택</span><span>중단점</span><span class="sp"></span><span class="dk"><i>계속</i><u>F8</u></span><span class="dk"><i>한 줄</i><u>F10</u></span><span class="dk"><i>안으로</i><u>F11</u></span></div>' +
      '<div class="cb vars"><div class="v"><span>total</span><b class="vt"></b></div><div class="v"><span>s</span><b class="vs"></b></div><div class="v"><span>scores</span><b>[90, 80, 70]</b></div></div></div>'
    : '<div class="con"><div class="ch"><b>실행 콘솔</b><span>실행 이력</span><span>메모</span></div><div class="cb">' +
      '<div class="o hint">// [실행]을 누르면 결과가 여기에 나와요.</div><div class="o cmd">$ python main.py</div><div class="o run">' + '<i class="spin"></i>실행 중…</div>' +
      '<div class="o err">Traceback (most recent call last):</div><div class="o err d">  File "main.py", line 8, in &lt;module&gt;</div><div class="o err d">  File "main.py", line 5, in average</div><div class="o err b">ZeroDivisionError: division by zero</div>' +
      '<div class="o ai"><span class="ico">' + '<span class="bm hd-aim" role="img" aria-hidden="true"></span></span><div><b>두레 AI · 에러 설명</b><p><em>5번째 줄</em>에서 0으로 나누고 있어요. <code>scores</code>가 비어 있어서 <code>len(scores)</code>가 0이에요.</p><span class="fixbtn">' + hdIc('spark') + '이렇게 고치기</span></div></div>' +
      '<div class="o cmd two">$ python main.py</div><div class="o res">0</div><div class="o ok">' + '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>실행 완료 · 0.1초</div></div></div>';
  return '<div class="hbm hd hd-ws m-' + mode + '" data-demo="' + mode + '">' + hdBar('두레 캡스톤 팀', '<span class="hd-chip">팀원 3명</span><span class="hd-avs">' + hdAv('민', '#3B82F6') + hdAv('지', '#EC4899') + hdAv('수', '#22C55E') + '</span>') +
    '<div class="wsb"><aside class="ex"><div class="exh">EXPLORER</div>' + tree + '</aside><section class="mn">' +
      '<div class="tabs"><span class="tab on"><i class="dot"></i>main.py</span><span class="tab">report.py</span><span class="sp"></span><span class="btn dbg">' + hdIc('code') + '디버거</span><span class="btn run">' + hdIc('arrow') + '실행</span></div>' +
      '<div class="ed">' + lines + '</div>' +
      '<div class="st"><span class="live">실시간 · 자동 저장</span><span class="pos">Ln ' + (mode === 'dbg' ? '4' : '5') + ', Col 22</span><span>8 lines</span><span>UTF-8</span><span class="py">Python</span></div>' + bottom +
    '</section></div></div>';
}

/* ---------- 팀 채팅 · 두레 AI ---------- */
function hdChat(){
  return '<div class="hbm hd hd-chat" data-demo="chat">' + hdBar('팀 채팅', '<span class="hd-chip ai">두레 AI 켜짐</span>') +
    '<div class="cmsgs">' +
      '<div class="cm them m1">' + hdAv('지', '#EC4899') + '<div><small>지은</small><p>다음 주 발표 자료는 누가 맡았지?</p></div></div>' +
      '<div class="cm me m2"><div><small>나</small><p><span class="men">@두레</span> 회의록 보고 알려줘</p></div>' + hdAv('민', '#3B82F6') + '</div>' +
      '<div class="cm ai typing"><span class="ai-av"><span class="bm hd-aim" role="img" aria-hidden="true"></span></span><div class="dots"><i></i><i></i><i></i></div></div>' +
      '<div class="cm ai m4"><span class="ai-av"><span class="bm hd-aim" role="img" aria-hidden="true"></span></span><div><small>두레 AI</small><p>회의록에 따르면 <em>지은님</em>이 맡았고 <em>금요일</em>이 마감이에요. 일정에 넣어 둘까요?</p><div class="acts"><span class="a pri">' + hdIc('cal') + '일정에 추가</span><span class="a">회의록 보기</span></div></div></div>' +
      '<div class="cm card m5">' + hdIc('cal') + '<div><b>일정에 추가했어요</b><small>11월 20일 금요일 · 발표 자료 마감</small></div><span class="ck"><svg class="i" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span></div>' +
    '</div>' +
    '<div class="cin"><span class="ph">메시지 입력 · @두레 로 AI 부르기</span><span class="snd">' + HD_SEND + '</span></div></div>';
}

/* ---------- 팀 통화방 ---------- */
function hdCall(){
  var T = function(i, ch, c, nm){ return '<div class="tl t' + i + '" style="--c:' + c + '"><span class="av">' + ch + '</span><span class="eq"><i></i><i></i><i></i><i></i></span><span class="nm">' + nm + '</span><span class="mc">' + HD_MIC + '</span></div>'; };
  return '<div class="hbm hd hd-call" data-demo="call">' + hdBar('팀 통화방', '<span class="hd-chip live">통화 중 · <b class="tm">12:08</b></span>') +
    '<div class="tiles">' + T(1, '민', '#3B82F6', '민수 (나)') + T(2, '지', '#EC4899', '지은') + T(3, '수', '#22C55E', '수현') + T(4, '하', '#F59E0B', '하준') + '</div>' +
    '<div class="sayb"><span class="say say1">민수님이 말하는 중</span><span class="say say2">지은님이 말하는 중</span><span class="say say3">수현님이 말하는 중</span></div>' +
    '<div class="ctl"><span class="c on">' + HD_MIC + '</span><span class="c">' + hdIc('chat') + '</span><span class="c end">' + hdIc('phone') + '</span></div></div>';
}

/* ---------- 회의록 → 자동 일정 ---------- */
function hdNotes(){
  var days = '', first = 0, wd = ['일', '월', '화', '수', '목', '금', '토'];
  for(var d = 1; d <= 30; d++){ var cls = d === 20 ? ' fri' : (d === 24 ? ' tue' : ''); days += '<div class="d' + cls + '"><span>' + d + '</span>' + (d === 20 ? '<em class="ev e1">발표 자료 마감</em>' : '') + (d === 24 ? '<em class="ev e2">중간 점검</em>' : '') + '</div>'; }
  return '<div class="hbm hd hd-notes" data-demo="notes">' + hdBar('회의록 · 캘린더', '<span class="hd-chip ai">AI 인식</span>') +
    '<div class="nb"><div class="doc"><h4>주간 회의록 <small>11/16 월</small></h4>' +
      '<p class="l1"><i class="bl"></i>발표 자료는 지은님이 <mark class="m1">금요일까지</mark> 정리하기로 함</p>' +
      '<p class="l2"><i class="bl"></i>중간 점검은 <mark class="m2">다음 주 화요일</mark> 오후에 진행</p>' +
      '<p class="l3"><i class="bl"></i>다음 회의 전까지 각자 맡은 부분 마무리</p>' +
      '<div class="found"><span class="sp">' + hdIc('spark') + '</span><div><b>일정 2개를 찾았어요</b><small>캘린더에 자동으로 올려 드려요</small></div></div></div>' +
    '<div class="cal"><div class="chd"><b>2026년 11월</b><span>' + hdIc('cal') + '</span></div><div class="wd">' + wd.map(function(w){ return '<span>' + w + '</span>'; }).join('') + '</div><div class="dg">' + days + '</div></div></div></div>';
}

/* ---------- 커뮤니티 · 공모전 ---------- */
function hdComm(){
  var P = function(i, tag, tc, title, meta, extra){ return '<div class="po p' + i + '"><div class="top"><span class="tg" style="--c:' + tc + '">' + tag + '</span>' + (extra || '') + '</div><b>' + title + '</b><div class="mt"><span>' + meta[0] + '</span><span>' + hdIc('chat') + meta[1] + '</span><span class="bk">' + HD_STAR + '</span></div></div>'; };
  return '<div class="hbm hd hd-comm" data-demo="comm">' + hdBar('커뮤니티', '<span class="hd-chip">공모전 · 해커톤</span>') +
    '<div class="cf"><span class="f on">전체</span><span class="f">팀원 구해요</span><span class="f">질문</span><span class="f">공모전</span><span class="srch">' + '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' + '검색</span></div>' +
    '<div class="pl">' +
      P(1, '팀원 구해요', '#EC4899', '웹 사이드 프로젝트에 프론트엔드 1분 구해요', ['방금 · 하준', '3'], '<em class="nw">NEW</em>') +
      P(2, '공모전', '#06B6D4', '대학생 해커톤 참가자를 모집해요', ['1시간 전 · 지은', '8'], '<em class="dd">D-7</em>') +
      P(3, '스터디', '#22C55E', '알고리즘 스터디 같이 하실 분 (주 2회)', ['어제 · 수현', '5']) +
      P(4, '질문', '#8B5CF6', '파이썬 리스트를 복사했는데 같이 바뀌어요', ['어제 · 민수', '12']) +
    '</div></div>';
}

/* ---------- 첫 화면의 콜라주: 워크스페이스(앞) + 팀 채팅(뒤) ---------- */
function hdHero(){
  return '<div class="hd-collage" id="hbCollage" data-hd-auto="run"><div class="hd-back">' + hdChatMini() + '</div><div class="hd-front">' + hdCode('run') + '</div></div>';
}
function hdChatMini(){
  return '<div class="hbm hd hd-chat mini" data-demo="hero-chat">' + hdBar('팀 채팅', '<span class="hd-chip ai">두레 AI</span>') +
    '<div class="cmsgs"><div class="cm them hm1">' + hdAv('지', '#EC4899') + '<div><small>지은</small><p>5번째 줄에서 에러가 나요 ㅠㅠ</p></div></div>' +
    '<div class="cm ai hm2"><span class="ai-av"><span class="bm hd-aim" role="img" aria-hidden="true"></span></span><div><small>두레 AI</small><p><em>scores</em>가 비어 있어서 나눗셈이 안 돼요. 왼쪽 콘솔의 <em>이렇게 고치기</em>를 눌러 보세요.</p></div></div></div></div>';
}

/* ---------- 움직임 진행 (시간표) ---------- */
HD.seq = {
  run:  [[500, 1], [1700, 2], [2500, 3], [3600, 4], [5600, 5], [7000, 6], [8200, 7]],
  dbg:  [[600, 1], [1700, 2], [2800, 3], [3900, 4], [5000, 5], [6100, 6], [7200, 7]],
  chat: [[500, 1], [1500, 2], [2400, 3], [3700, 4], [5400, 5]],
  call: [[400, 1], [2300, 2], [4200, 3], [6100, 4]],
  notes: [[500, 1], [1500, 2], [2700, 3], [3700, 4], [5000, 5], [6200, 6]],
  comm: [[400, 1], [1000, 2], [1600, 3], [2200, 4], [3600, 5], [5000, 6]],
  'hero-chat': []
};
function hdTargets(root){ return root.matches('.hd') ? [root] : [].slice.call(root.querySelectorAll('.hd')); }     // 콜라주는 안의 화면들이 같은 시간표를 함께 쓴다
function hdStop(root){ (HD.timers.get(root) || []).forEach(clearTimeout); HD.timers.delete(root); }
function hdReset(root){ hdTargets(root).forEach(function(t){ t.className = t.className.replace(/\bs\d+\b|\bdone\b/g, '').replace(/\s+/g, ' ').trim(); }); }
function hdAdd(root, cls){ hdTargets(root).forEach(function(t){ t.classList.add(cls); }); }
function hdPlay(root){
  hdStop(root); hdReset(root);
  var kind = root.getAttribute('data-hd-auto') || root.getAttribute('data-demo');
  var seq = HD.seq[kind]; if(!seq || !seq.length) return;
  if(ldReduced()){ seq.forEach(function(st){ hdAdd(root, 's' + st[1]); }); hdAdd(root, 'done'); return; }       // 움직임 줄이기: 마지막 장면을 그대로 보여 준다
  var ts = [];
  seq.forEach(function(st){ ts.push(setTimeout(function(){ hdAdd(root, 's' + st[1]); }, st[0])); });
  ts.push(setTimeout(function(){ hdPlay(root); }, seq[seq.length - 1][0] + 3400));                                    // 끝나면 처음부터 다시
  HD.timers.set(root, ts);
}
/* 화면에 보일 때만 돌린다 */
function hdWatch(scope){
  var roots = (scope || document).querySelectorAll('[data-hd-auto]'); if(!roots.length) return;
  if(!('IntersectionObserver' in window)){ roots.forEach(hdPlay); return; }
  HD.io = HD.io || new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting) hdPlay(e.target); else hdStop(e.target); }); }, { threshold: 0.3 });
  roots.forEach(function(r){ if(!r.dataset.hdw){ r.dataset.hdw = '1'; HD.io.observe(r); } });
}
