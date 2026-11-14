/* ---- 기관용 소개 (/institution) ----
   학교 전반(초 · 중 · 고 · 대학)에서 수업 속 팀 프로젝트를 운영하는 교수 · 교사 · 기관 담당자와 학생을 위한 두레싱크 '기관용' 소개 페이지.
   ★ 아직 개발 중이다: 화면 맨 위에 '개발 중' 안내를 한 번만 두고, 본문은 소개하는 글로 쓴다. 근거 없는 보안·인증·정책 약속은 쓰지 않는다
     (학생 정보 보호 · 도입 절차 구역은 정책이 정해지면 추가한다).
   소개하는 내용(정해진 구상):
     · 팀별: 진행 현황 · 계정 일괄 관리 · 과제 스프레드시트(AI가 기본 채점, 평가자가 수정해서 확정)
     · 워크스페이스: 인원별 파일 자동 생성 · 파일 권한(교수·교사는 모든 권한, 학생은 제한 — 다른 사람 파일에는 못 들어간다)
     · 개인 프로필: 학교 · 소속(학과·반) · 학년 · 참여 중인 프로젝트
     · 채팅은 그대로, 통화는 뺀다. 팀장(교수 · 교사 · 기관 담당자)과의 1:1 톡방을 더한다
     · 커뮤니티: 학생에게는 학교 마크
     · 기관용 프로젝트를 만드는 팀장은 원하는 대로 편하게 커스텀할 수 있다
   화면 구조·움직임은 메인 홈(hub.js · hub-demo.js)과 같은 부품을 쓰고, 화면 속 이름·학교·점수는 모두 꾸며낸 예시다. */

function inIc(id){ return hbSvg(id); }
var IN_AVS = [['민', '#3B82F6'], ['지', '#EC4899'], ['수', '#22C55E'], ['하', '#F59E0B']];

/* ---------- 팀별 진행 현황 (교수 · 교사가 한눈에 본다) ---------- */
function inTeams(){
  var T = function(i, name, prog, st, stc, mem, last){ return '<div class="tm t' + i + '"><div class="th"><b>' + name + '</b><span class="stt" style="--c:' + stc + '">' + st + '</span></div><div class="pb"><i style="--w:' + prog + '%"></i></div><div class="tf"><span class="pc">' + prog + '%</span><span class="mm">' + mem.map(function(m){ return hdAv(m[0], m[1], 'sm'); }).join('') + '</span><span class="la">' + last + '</span></div></div>'; };
  return '<div class="hbm hd hd-teams" data-demo="teams">' + hdBar('3학년 캡스톤 · 진행 현황', '<span class="hd-chip">8개 팀</span>') +
    '<div class="tsum"><div class="sm"><small>전체 진행</small><b>64%</b></div><div class="sm"><small>이번 주 활동</small><b>128</b></div><div class="sm w"><small>지연 주의</small><b class="warn">2팀</b></div></div>' +
    '<div class="tf2"><span class="f on">전체</span><span class="f">진행 중</span><span class="f">지연 주의</span><span class="f">완료</span></div>' +
    '<div class="tgrid">' + T(1, '1팀 · 성적 처리 앱', 82, '진행 중', '#22C55E', [IN_AVS[0], IN_AVS[1], IN_AVS[2]], '10분 전') + T(2, '2팀 · 도서관 좌석', 41, '지연 주의', '#F59E0B', [IN_AVS[1], IN_AVS[3]], '3일 전') + T(3, '3팀 · 학식 추천', 67, '진행 중', '#22C55E', [IN_AVS[2], IN_AVS[0], IN_AVS[3]], '1시간 전') + T(4, '4팀 · 동아리 관리', 100, '완료', '#3B82F6', [IN_AVS[0], IN_AVS[3]], '어제') + '</div></div>';
}

/* ---------- 계정 일괄 관리 ---------- */
function inAccounts(){
  var R = function(i, id, nm, dept, role, st){ return '<div class="rw r' + i + '"><span class="ck"><i></i></span><span class="id">' + id + '</span><b>' + nm + '</b><span class="dp">' + dept + '</span><span class="rl">' + role + '</span><span class="stt ' + (st === '대기' ? 'w' : '') + '">' + st + '</span></div>'; };
  return '<div class="hbm hd hd-accts" data-demo="accts">' + hdBar('계정 관리', '<span class="hd-chip ai">일괄 등록</span>') +
    '<div class="imp"><span class="fi">' + '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z"/><path d="M14 3.5V8h4"/></svg>' + '수강생명단.xlsx</span><span class="pg"><i></i></span><span class="pt">24명 불러오는 중…</span><span class="pd">24명 등록 완료</span></div>' +
    '<div class="tbl"><div class="rw hd2"><span class="ck"></span><span class="id">학번</span><b>이름</b><span class="dp">소속</span><span class="rl">역할</span><span class="stt">상태</span></div>' +
      R(1, '20260101', '김민수', '컴퓨터공학', '학생', '활성') + R(2, '20260102', '이지은', '컴퓨터공학', '학생', '활성') + R(3, '20260103', '박수현', '소프트웨어', '학생', '활성') + R(4, '20260104', '최하준', '소프트웨어', '학생', '대기') + R(5, '20260105', '정유나', '컴퓨터공학', '학생', '활성') + '</div>' +
    '<div class="bulk"><span class="bn">선택 <b>5</b>명</span><span class="ba">팀 배정</span><span class="ba">권한 설정</span><span class="ba g">초대 메일 보내기</span></div>' +
    '<div class="done">' + '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' + '5명을 1팀 · 2팀으로 배정했어요</div></div>';
}

/* ---------- 과제 스프레드시트: AI가 기본 채점, 평가자가 수정해서 확정 ---------- */
function inSheet(){
  var cols = ['A', 'B', 'C', 'D', 'E', 'F'];
  var rows = [['김민수', '요구사항 정리', 18, 17, 35], ['이지은', '요구사항 정리', 20, 19, 39], ['박수현', '요구사항 정리', 15, 12, 27], ['최하준', '요구사항 정리', 19, 18, 37]];
  var body = rows.map(function(r, i){
    return '<div class="sr r' + (i + 1) + '"><span class="rn">' + (i + 2) + '</span><span class="c a">' + r[0] + '</span><span class="c b">' + r[1] + '</span><span class="c n">' + r[2] + '</span><span class="c n">' + r[3] + '</span><span class="c ai"><em>' + r[4] + '</em></span><span class="c fx"><em>' + (i === 2 ? '30' : r[4]) + '</em></span></div>';
  }).join('');
  return '<div class="hbm hd hd-sheet" data-demo="sheet">' + hdBar('과제 1 · 요구사항 정리', '<span class="hd-chip ai">스프레드시트</span>') +
    '<div class="fxb"><span class="fn">fx</span><span class="fv"><span class="f1">=AI 기본 채점(B2:D5, 기준표)</span><span class="f2">평가자가 점수를 고치는 중…</span></span></div>' +
    '<div class="grid"><div class="sr hh"><span class="rn"></span>' + cols.slice(0, 6).map(function(c){ return '<span class="c">' + c + '</span>'; }).join('') + '</div>' +
      '<div class="sr hh2"><span class="rn">1</span><span class="c a">이름</span><span class="c b">제출물</span><span class="c n">기준 1</span><span class="c n">기준 2</span><span class="c ai">AI 점수</span><span class="c fx">확정</span></div>' + body + '</div>' +
    '<div class="sfoot"><span class="ai1">' + hdIc('spark') + 'AI가 기본 채점을 마쳤어요</span><span class="ev">평가자가 수정하고 확정해요</span><span class="ok">' + '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' + '4명 확정</span></div></div>';
}

/* ---------- 워크스페이스: 인원별 파일 자동 생성 · 권한 ---------- */
function inFiles(){
  var F = function(i, nm, st){ return '<div class="fd f' + i + (st ? ' ' + st : '') + '"><span class="tw">' + HD_FOLDER + '</span><b>' + nm + '</b><span class="lk">' + '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>' + '</span><span class="op">열기</span></div><div class="fl f' + i + '">' + HD_FILE + 'main.py</div>'; };
  return '<div class="hbm hd hd-files" data-demo="files">' + hdBar('캡스톤 1팀 · 워크스페이스', '<span class="role"><span class="r1">교수 보기</span><span class="r2">학생 보기 · 민수</span></span>') +
    '<div class="fbody"><div class="ftree"><div class="fh">EXPLORER</div><div class="root">' + HD_FOLDER + '성적처리/<em class="auto">인원별 폴더 자동 생성</em></div>' +
      F(1, '김민수', 'me') + F(2, '이지은') + F(3, '박수현') + '</div>' +
      '<div class="fpane"><div class="legend"><span class="all">교수 · 교사는 모든 파일을 볼 수 있어요</span><span class="lim">학생은 내 폴더만 열 수 있어요</span></div>' +
        '<div class="deny"><span class="dk">' + '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>' + '</span><b>이지은님의 폴더예요</b><small>접근 권한이 없어요</small></div>' +
        '<div class="code"><div class="cl"><span>1</span> <i class="k">def</i> <i class="f">average</i>(scores):</div><div class="cl"><span>2</span>     total = <i class="n">0</i></div><div class="cl"><span>3</span>     ...</div></div></div></div></div>';
}

/* ---------- 팀장과의 1:1 톡방 (통화는 빼고 채팅만) ---------- */
function inDm(){
  return '<div class="hbm hd hd-chat hd-dm" data-demo="dm">' + hdBar('채팅', '<span class="hd-chip">통화 없이 채팅으로</span>') +
    '<div class="dbody"><div class="dl"><div class="it"><b>팀 채팅</b><small>4명</small></div><div class="it on"><span class="lkd">' + '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>' + '</span><b>박 교수님 (팀장)</b><small>1:1</small></div></div>' +
    '<div class="dc"><div class="dh"><b>박 교수님</b><span class="chip">1:1 톡방</span></div><div class="cmsgs">' +
      '<div class="cm me m1"><div><small>나</small><p>교수님, 3번 기준은 어떤 걸 보시나요?</p></div></div>' +
      '<div class="cm them m2"><div><small>박 교수님</small><p>요구사항이 테스트로 확인되는지 봅니다. 예시는 공지에 올려 둘게요.</p></div></div>' +
      '<div class="cm me m3"><div><small>나</small><p>확인했어요. 감사합니다!</p></div></div></div>' +
    '<div class="cin"><span class="ph">교수님께 메시지 보내기</span><span class="snd">' + HD_SEND + '</span></div></div></div></div>';
}

/* ---------- 학생 프로필 ---------- */
function inProfile(){
  return '<div class="hbm hd hd-prof" data-demo="prof">' + hdBar('프로필', '<span class="hd-chip">학생</span>') +
    '<div class="pbody"><div class="ph"><span class="pav">' + '민' + '</span><div><b>김민수</b><div class="sch"><span class="mk">한</span>한빛대학교</div></div></div>' +
      '<div class="kv"><div><small>소속</small><b>컴퓨터공학과</b></div><div><small>학년</small><b>3학년</b></div></div>' +
      '<div class="ps"><small>참여 중인 프로젝트</small>' +
        '<div class="pr r1"><b>성적 처리 앱</b><span class="chip">캡스톤 1팀 · 팀원</span></div><div class="pr r2"><b>도서관 좌석 알리미</b><span class="chip">자료구조 · 팀장</span></div><div class="pr r3"><b>학식 추천 서비스</b><span class="chip">동아리 · 팀원</span></div></div></div></div>';
}

/* ---------- 커뮤니티: 학생에게는 학교 마크 ---------- */
function inComm(){
  var P = function(i, mk, school, who, title, tag, tc){ return '<div class="po p' + i + '"><div class="top"><span class="mk">' + mk + '</span><span class="who"><b>' + who + '</b><small>' + school + '</small></span><span class="tg" style="--c:' + tc + '">' + tag + '</span></div><b class="tt">' + title + '</b></div>'; };
  return '<div class="hbm hd hd-icomm" data-demo="icomm">' + hdBar('커뮤니티', '<span class="hd-chip">학교 마크</span>') +
    '<div class="pl">' + P(1, '한', '한빛대학교 · 컴퓨터공학과', '민수', '자료구조 스터디 같이 하실 분', '스터디', '#22C55E') + P(2, '새', '새봄고등학교 · 2학년', '지은', '동아리 프로젝트 백엔드 구해요', '팀원 구해요', '#EC4899') + P(3, '미', '미래중학교 · 1학년', '수현', '파이썬 반복문이 어려워요', '질문', '#8B5CF6') + '</div></div>';
}

/* ---------- 첫 화면: 진행 현황(앞) + 팀장 1:1 알림(뒤) ---------- */
function inHero(){
  return '<div class="hd-collage" id="inCollage" data-hd-auto="teams"><div class="hd-back">' + inMiniDm() + '</div><div class="hd-front">' + inTeams() + '</div></div>';
}
function inMiniDm(){
  return '<div class="hbm hd hd-chat hd-dm mini" data-demo="teams-mini">' + hdBar('1:1 톡방', '<span class="hd-chip">2팀</span>') +
    '<div class="cmsgs"><div class="cm them hm1"><div><small>2팀 팀장</small><p>이번 주에 도서관 API 연동을 마칠게요.</p></div></div><div class="cm me hm2"><div><small>박 교수님</small><p>좋아요. 진행 상황을 공유해 주세요.</p></div></div></div></div>';
}

/* ---------- 시간표 ---------- */
HD.seq.teams = [[500, 1], [1600, 2], [2800, 3], [4000, 4]];
HD.seq.accts = [[500, 1], [1700, 2], [2900, 3], [4200, 4], [5500, 5]];
HD.seq.sheet = [[500, 1], [1800, 2], [3200, 3], [4600, 4], [5800, 5]];
HD.seq.files = [[500, 1], [1800, 2], [3200, 3], [4800, 4], [6000, 5]];
HD.seq.dm = [[500, 1], [1600, 2], [2800, 3]];
HD.seq.prof = [[400, 1], [1000, 2], [1500, 3], [2100, 4]];
HD.seq.icomm = [[400, 1], [1000, 2], [1600, 3], [2600, 4]];
HD.seq['teams-mini'] = [];

/* ---------- 위쪽 메뉴 · 본문 데이터 ---------- */
HB_CTX.inst.items = [
  { k: 'feat', ic: 'spark', label: '기능', cols: [
      { h: '팀별', items: [
        { ic: 'flag', c: '#3B82F6', t: '진행 현황', d: '팀마다 어디까지 왔는지 한눈에', act: 'hub|inShow' },
        { ic: 'users', c: '#8B5CF6', t: '계정 일괄 관리', d: '명단으로 한 번에 등록 · 팀 배정', act: 'hub|inShow' },
        { ic: 'board', c: '#F59E0B', t: '과제 스프레드시트', d: 'AI 기본 채점 → 평가자가 확정', act: 'hub|inShow' } ] },
      { h: '워크스페이스 · 소통', items: [
        { ic: 'code', c: '#22C55E', t: '파일 자동 생성 · 권한', d: '인원별 폴더, 학생은 내 파일만', act: 'hub|inShow' },
        { ic: 'chat', c: '#EC4899', t: '팀 채팅 · 1:1 톡방', d: '통화 없이 채팅으로', act: 'hub|inShow' } ] },
      { h: '사람', items: [
        { ic: 'cap', c: '#06B6D4', t: '학생 프로필', d: '학교 · 소속 · 학년 · 참여 프로젝트', act: 'hub|inPeople' },
        { ic: 'trophy', c: '#EF4444', t: '커뮤니티 학교 마크', d: '학생에게는 학교 마크가 붙어요', act: 'hub|inPeople' } ] } ],
    feat: { type: 'brand', t: '수업 속 팀 프로젝트를 한곳에서', d: '현재 개발 중이에요. 준비되는 대로 안내드릴게요.', cta: '도입 문의', act: 'notice' } },
  { k: 'role', ic: 'users', label: '역할별', cols: [
      { h: '팀장', items: [
        { ic: 'board', c: '#3B82F6', t: '교수 · 교사 · 기관 담당자', d: '현황 · 계정 · 채점 · 권한을 한곳에서', act: 'hub|inRoles' } ] },
      { h: '학생', items: [
        { ic: 'cap', c: '#22C55E', t: '학생', d: '내 파일에 집중하고, 팀과 소통해요', act: 'hub|inRoles' } ] } ],
    feat: { type: 'chips', t: '초 · 중 · 고 · 대학 어디서든', d: '수업에서 팀 프로젝트를 하는 곳을 위해 준비하고 있어요.', chips: ['교수', '교사', '기관 담당자', '학생'] } },
  { k: 'cmp', ic: 'compass', label: '비즈니스와 다른 점', link: 'hub|inCmp' },
  { k: 'faq', ic: 'help', label: '자주 묻는 질문', link: 'hub|inFaq' }
];
var IN_TABS = [
  { k: 'teams', ic: 'flag', c: '#3B82F6', t: '팀별 진행 현황', d: '팀마다 진행률과 최근 활동을 한눈에 보고, 지연 주의 팀을 바로 찾아요.', mock: inTeams },
  { k: 'accts', ic: 'users', c: '#8B5CF6', t: '계정 일괄 관리', d: '수강생 명단으로 계정을 한 번에 등록하고, 팀 배정과 권한을 함께 정해요.', mock: inAccounts },
  { k: 'sheet', ic: 'board', c: '#F59E0B', t: '과제 스프레드시트', d: '과제 제출이 필요하면 스프레드시트로 받고, AI가 기본 채점을 해 주면 평가자가 수정해서 확정해요.', mock: inSheet },
  { k: 'files', ic: 'code', c: '#22C55E', t: '파일 자동 생성 · 권한', d: '인원별 폴더와 파일이 자동으로 만들어져요. 교수 · 교사는 모두 열고, 학생은 내 파일만 열어요.', mock: inFiles },
  { k: 'dm', ic: 'chat', c: '#EC4899', t: '팀 채팅 · 1:1 톡방', d: '통화는 빼고 채팅은 그대로. 팀장(교수 · 교사 · 기관 담당자)과 1:1 톡방으로 물어볼 수 있어요.', mock: inDm }
];
var IN_ROLES = [
  ['board', '#3B82F6', '팀장', '교수 · 교사 · 기관 담당자', ['팀별 진행 현황을 한눈에 보고', '명단으로 계정을 일괄 등록 · 관리하고', '과제 스프레드시트를 AI 기본 채점으로 받아 수정 · 확정하고', '모든 학생 파일을 볼 수 있어요', '기관용 프로젝트를 원하는 대로 편하게 커스텀해요']],
  ['cap', '#22C55E', '학생', '초 · 중 · 고 · 대학', ['내 폴더와 파일에 집중하고 (다른 사람 파일은 제한)', '학교 · 소속 · 학년과 참여 프로젝트가 담긴 프로필을 만들고', '팀 채팅과 팀장과의 1:1 톡방으로 소통하고', '커뮤니티에서는 학교 마크가 함께 보여요']]
];
var IN_CMP = [
  ['통화', '팀 통화방', '넣지 않아요 (채팅으로)'], ['채팅', '팀 채팅', '팀 채팅 + 팀장과 1:1 톡방'], ['프로필', '일반 프로필', '학교 · 소속 · 학년 · 참여 프로젝트'],
  ['파일 권한', '팀원 모두 함께 편집', '팀장은 전체, 학생은 내 파일 중심'], ['계정', '개인이 가입', '명단으로 일괄 등록 · 관리'], ['과제 제출', '—', '스프레드시트 + AI 기본 채점'],
  ['커뮤니티', '일반', '학생에게 학교 마크'], ['프로젝트 설정', '기본', '팀장이 원하는 대로 커스텀']
];
var IN_FAQ = [
  ['지금 쓸 수 있나요?', '현재 <b>개발 중</b>이에요. 준비가 끝나면 이 페이지에서 안내해 드릴게요. 소개한 기능은 개발 과정에서 바뀔 수 있어요.'],
  ['어떤 곳에서 쓸 수 있나요?', '<b>초 · 중 · 고 · 대학</b> 어디든 수업에서 팀 프로젝트를 하는 곳을 위해 준비하고 있어요. 교수 · 교사 · 기관 담당자가 팀장이 되어 수업을 이끌어요.'],
  ['학생이 다른 학생의 파일을 볼 수 있나요?', '학생은 <b>내 폴더와 파일 중심</b>으로 쓰고, 다른 사람의 파일은 접근이 제한돼요. 교수 · 교사는 모든 파일을 볼 수 있어요.'],
  ['AI가 점수를 정하나요?', '과제 제출이 필요하면 스프레드시트로 받고, <b>AI가 기본 채점</b>을 해 줘요. 그 결과를 <b>평가자가 수정하고 확정</b>해요.'],
  ['프로젝트를 우리 수업에 맞게 바꿀 수 있나요?', '네. 기관용 프로젝트를 만드는 팀장은 <b>원하는 대로 편하게 커스텀</b>할 수 있게 준비하고 있어요.'],
  ['통화 기능은 있나요?', '기관용에는 통화 기능을 넣지 않아요. 대신 <b>팀 채팅과 팀장과의 1:1 톡방</b>으로 소통해요.']
];

/* ---------- 본문 ---------- */
function inBuild(){
  var main = document.getElementById('inMain'); if(!main || main.children.length) return;
  hbBuildMenu(HB_CTX.inst);
  var arrow = hbSvg('arrow');
  main.innerHTML =
    '<div class="in-banner" role="status"><span class="chip">개발 중</span><span>기관용은 현재 개발 중이에요. 준비되는 대로 안내드릴게요. 소개하는 기능은 개발 과정에서 바뀔 수 있어요.</span></div>' +

    '<section class="hb-hero" id="inHero"><div class="hb-hero-grid">' +
      '<div class="hb-copy">' +
        '<span class="hh-eyebrow">DureSync · 기관용</span>' +
        '<h1 class="hb-h1"><span>수업 속 팀 프로젝트를</span><span>한눈에 살피고,</span><span class="hb-grad">공정하게 이끌어요.</span></h1>' +
        '<p class="hb-lead">초 · 중 · 고 · 대학 어디서든. <b class="kw k1">진행 현황</b> · <b class="kw k2">계정 관리</b> · <b class="kw k4">과제 채점</b> · <b class="kw k3">파일 권한</b>까지, 교수 · 교사와 학생을 위한 협업 공간이에요.</p>' +
        '<div class="hb-cta">' +
          '<button type="button" class="cta-btn primary hb-big" onclick="hbNotice()">' + arrow + '<span class="cta-tx"><b>도입 문의</b><small>준비되는 대로 안내드려요</small></span></button>' +
          '<button type="button" class="cta-btn hb-big" onclick="hbScroll(\'inShowFlat\')">' + hbSvg('compass') + '<span class="cta-tx"><b>기능 살펴보기</b><small>소개를 먼저 둘러보세요</small></span></button>' +
        '</div>' +
        '<ul class="hb-pills"><li>' + HB_CHECK + '교수 · 교사는 모든 권한</li><li>' + HB_CHECK + '학생은 내 파일 중심</li><li>' + HB_CHECK + 'AI는 기본 채점, 확정은 평가자</li></ul>' +
      '</div>' +
      '<div class="hb-art" aria-hidden="true"><div class="hb-glow"></div><div class="hb-tilt">' + inHero() + '</div><p class="hb-eg">화면은 예시예요</p></div>' +
    '</div></section>' +

    '<section class="ld-sec" id="inRoles"><div class="ld-wrap">' +
      '<span class="view-eyebrow ld-rv">역할별</span>' +
      '<h2 class="ld-h2 ld-rv" style="--d:.05s">이끄는 사람과 배우는 사람, 각자에게 맞게</h2>' +
      '<p class="ld-p ld-rv" style="--d:.1s">같은 프로젝트 안에서도 역할마다 보이는 것과 할 수 있는 일이 달라요.</p>' +
      '<div class="in-roles">' + IN_ROLES.map(function(r, i){ return '<article class="card in-role hb-spot ld-rv" style="--d:' + (0.04 + i * 0.08) + 's"><div class="hb-cat-h">' + hbIco(r[0], r[1], true) + '<div><span class="chip">' + r[3] + '</span><h3>' + r[2] + '</h3></div></div><ul class="hb-checks">' + r[4].map(function(f){ return '<li>' + HB_CHECK + '<span>' + f + '</span></li>'; }).join('') + '</ul></article>'; }).join('') + '</div>' +
    '</div></section>' +

    hbFlatHtml('inShowFlat', IN_TABS, '핵심 기능', '수업 운영에 꼭 필요한 것들', '진행 현황부터 계정, 과제 채점, 파일 권한, 소통까지 한 화면에서 이어져요.') +
    hbStageHtml('inShow', IN_TABS, '핵심 기능', '수업 운영에 꼭 필요한 것들') +

    '<section class="ld-sec" id="inPeople"><div class="ld-wrap">' +
      '<span class="view-eyebrow ld-rv">사람 · 커뮤니티</span>' +
      '<h2 class="ld-h2 ld-rv" style="--d:.05s">나를 소개하는 프로필, 학교가 보이는 커뮤니티</h2>' +
      '<p class="ld-p ld-rv" style="--d:.1s">학교 · 소속 · 학년과 참여 중인 프로젝트를 담은 프로필, 그리고 학생에게는 학교 마크가 붙는 커뮤니티예요.</p>' +
      '<div class="in-people ld-rv" style="--d:.14s"><div class="in-pcol" id="inProfW">' + inProfile() + '</div><div class="in-pcol" id="inCommW">' + inComm() + '</div></div>' +
      '<p class="hb-eg in-eg">화면은 예시예요</p>' +
    '</div></section>' +

    '<section class="ld-sec" id="inCmp"><div class="ld-wrap">' +
      '<span class="view-eyebrow ld-rv">비즈니스와 다른 점</span>' +
      '<h2 class="ld-h2 ld-rv" style="--d:.05s">같은 두레, 수업에 맞게 달라진 부분</h2>' +
      '<div class="in-cmp ld-rv" style="--d:.1s"><div class="cr ch"><span></span><b>비즈니스</b><b class="acc">기관용</b></div>' + IN_CMP.map(function(r){ return '<div class="cr"><span class="cl">' + r[0] + '</span><span class="cb" data-l="비즈니스">' + r[1] + '</span><span class="cb acc" data-l="기관용">' + r[2] + '</span></div>'; }).join('') + '</div>' +
    '</div></section>' +

    '<section class="ld-sec" id="inFaq"><div class="ld-wrap narrow">' +
      '<span class="view-eyebrow ld-rv">자주 묻는 질문</span><h2 class="ld-h2 ld-rv" style="--d:.05s">궁금한 점을 모아 뒀어요</h2>' +
      '<div class="hb-faq ld-rv" style="--d:.1s">' + IN_FAQ.map(function(q, i){ return '<details class="hb-spot"><summary><em class="no">0' + (i + 1) + '</em><span>' + q[0] + '</span>' + hbSvg('chev') + '</summary><p>' + q[1] + '</p></details>'; }).join('') + '</div>' +
    '</div></section>' +

    '<section class="hb-fin" id="inFin"><div class="hb-fin-track"><div class="hb-fin-sticky">' +
      '<i class="fr fr1"></i><i class="fr fr2"></i><i class="fr fr3"></i>' +
      '<div class="hb-fin-in"><span class="bm hb-final-mark" role="img" aria-hidden="true"></span>' +
        '<h2>수업을 위한 협업 공간, 준비하고 있어요</h2><p>현재 개발 중이에요. 준비되는 대로 이 페이지에서 안내해 드릴게요.</p>' +
        '<div class="hb-final-cta"><button type="button" class="cta-btn primary hb-big" onclick="hbNotice()">' + arrow + '<span class="cta-tx"><b>도입 문의</b><small>준비되는 대로 안내드려요</small></span></button>' +
        '<a class="cta-btn hb-big" href="/business" onclick="return hbLink(event, \'landing\')">' + hbSvg('rocket') + '<span class="cta-tx"><b>비즈니스 보기</b><small>지금 무료로 써 볼 수 있어요</small></span></a></div>' +
      '</div>' +
    '</div></div></section>';

  var f = document.getElementById('inFoot');
  if(f && !f.children.length) f.innerHTML = '<div class="hb-foot-in"><div class="hb-foot-brand"><span class="ld-foot-brand"><span class="bm wm-mark" role="img" aria-hidden="true"></span>DureSync</span><span class="ld-foot-tag">함께 일하는 가장 오래된 방식, AI로 다시.</span></div>' +
    '<div class="hb-foot-cols"><div><h4>기관용</h4><button type="button" onclick="hbAct(\'hub|inShowFlat\')">기능</button><button type="button" onclick="hbAct(\'hub|inCmp\')">비즈니스와 다른 점</button><button type="button" onclick="hbNotice()">도입 문의</button></div>' +
    '<div><h4>둘러보기</h4><a href="/" onclick="return hbLink(event, \'hub\')">메인 홈</a><a href="/business" onclick="return hbLink(event, \'landing\')">비즈니스</a><button type="button" onclick="hbAct(\'hub|inFaq\')">자주 묻는 질문</button></div></div></div>';

  hbBindTabs(document.getElementById('inShowFlat'));
  inBindPeople();
}
/* 프로필·커뮤니티 그림은 화면에 보일 때 장면이 시작된다 */
function inBindPeople(){
  ['inProfW', 'inCommW'].forEach(function(id){ var w = document.getElementById(id); if(!w) return; var hd = w.querySelector('.hd'); if(hd){ hd.setAttribute('data-hd-auto', hd.getAttribute('data-demo')); } });
  hdWatch(document.getElementById('inMain'));
}
