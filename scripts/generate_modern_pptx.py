import collections
import collections.abc
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def create_modern_presentation():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)  # 16:9 widescreen
    blank_layout = prs.slide_layouts[6]

    # Modern Color Palette
    COLOR_BG = RGBColor(11, 15, 25)          # Deep Dark Blue/Black #0B0F19
    COLOR_CARD = RGBColor(22, 29, 47)        # Slate Dark Glass #161D2F
    COLOR_CARD_BORDER = RGBColor(45, 58, 86) # Subtle Border #2D3A56
    COLOR_PRIMARY = RGBColor(99, 102, 241)   # Modern Indigo #6366F1
    COLOR_CYAN = RGBColor(6, 182, 212)       # Vibrant Cyan #06B6D4
    COLOR_EMERALD = RGBColor(16, 185, 129)   # Live Green #10B981
    COLOR_AMBER = RGBColor(245, 158, 11)     # Warning Amber #F59E0B
    COLOR_TEXT = RGBColor(248, 250, 252)     # Off-white #F8FAFC
    COLOR_MUTED = RGBColor(148, 163, 184)    # Cool Gray #94A3B8

    def add_bg(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = COLOR_BG
        bg.line.fill.background()
        return bg

    def add_header(slide, tag_text, title_text, category_color=COLOR_PRIMARY, slide_idx=""):
        # Header category tag
        tag_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.45), Inches(8), Inches(0.35))
        tf = tag_box.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = tag_text.upper()
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = category_color
        p.font.name = "Pretendard"

        # Title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.8), Inches(10.5), Inches(0.8))
        tf = title_box.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = title_text
        p.font.size = Pt(24)
        p.font.bold = True
        p.font.color.rgb = COLOR_TEXT
        p.font.name = "Pretendard"

        # Slide indicator
        if slide_idx:
            idx_box = slide.shapes.add_textbox(Inches(11.5), Inches(0.45), Inches(1.0), Inches(0.35))
            itf = idx_box.text_frame
            itf.margin_left = itf.margin_top = itf.margin_right = itf.margin_bottom = 0
            p = itf.paragraphs[0]
            p.alignment = PP_ALIGN.RIGHT
            p.text = slide_idx
            p.font.size = Pt(12)
            p.font.bold = True
            p.font.color.rgb = COLOR_MUTED
            p.font.name = "Pretendard"

    def add_card(slide, left, top, width, height, title, subtitle="", border_color=COLOR_CARD_BORDER, bg_color=COLOR_CARD):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
        card.fill.solid()
        card.fill.fore_color.rgb = bg_color
        card.line.color.rgb = border_color
        card.line.width = Pt(1.2)

        tb = slide.shapes.add_textbox(Inches(left + 0.25), Inches(top + 0.2), Inches(width - 0.5), Inches(height - 0.4))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p0 = tf.paragraphs[0]
        p0.text = title
        p0.font.size = Pt(14)
        p0.font.bold = True
        p0.font.color.rgb = COLOR_TEXT
        p0.font.name = "Pretendard"

        if subtitle:
            p1 = tf.add_paragraph()
            p1.text = subtitle
            p1.font.size = Pt(10)
            p1.font.color.rgb = COLOR_CYAN
            p1.font.name = "Pretendard"
            p1.space_before = Pt(3)

        return tf

    # ==========================================
    # SLIDE 1: COVER
    # ==========================================
    s1 = prs.slides.add_slide(blank_layout)
    add_bg(s1)

    # Accent Glow / Line
    accent = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.5), Inches(1.2), Inches(0.08))
    accent.fill.solid()
    accent.fill.fore_color.rgb = COLOR_CYAN
    accent.line.fill.background()

    # Badge
    b_box = s1.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(5), Inches(0.4))
    btf = b_box.text_frame
    bp = btf.paragraphs[0]
    bp.text = "NEXT-GENERATION REAL-TIME DEV LOUNGE"
    bp.font.size = Pt(12)
    bp.font.bold = True
    bp.font.color.rgb = COLOR_CYAN
    bp.font.name = "Pretendard"

    # Main Title
    t_box = s1.shapes.add_textbox(Inches(0.8), Inches(2.2), Inches(11.5), Inches(2.0))
    ttf = t_box.text_frame
    ttf.word_wrap = True
    tp1 = ttf.paragraphs[0]
    tp1.text = "흩어진 개발 환경을 하나로, Code Lounge"
    tp1.font.size = Pt(38)
    tp1.font.bold = True
    tp1.font.color.rgb = COLOR_TEXT
    tp1.font.name = "Pretendard"

    tp2 = ttf.add_paragraph()
    tp2.text = "실시간 웹소켓 동기화 · 5개 언어 웹 샌드박스 · AI 비서 · 협업 라운지 올인원 플랫폼"
    tp2.font.size = Pt(16)
    tp2.font.color.rgb = COLOR_MUTED
    tp2.font.name = "Pretendard"
    tp2.space_before = Pt(10)

    # 4 Quick feature pills on Cover
    cov_cards = [
        ("01. WebSocket Live", "실시간 Presence & 동기화", COLOR_EMERALD),
        ("02. 5-Lang Sandbox", "무설치 브라우저 컴파일", COLOR_PRIMARY),
        ("03. AI Assistant", "슬래시 회의 요약 & 일정", COLOR_CYAN),
        ("04. CI/CD & Deploy", "Docker Compose 무중단", COLOR_AMBER),
    ]
    for i, (ct, cs, cc) in enumerate(cov_cards):
        cx = 0.8 + i * 2.95
        add_card(s1, cx, 4.8, 2.8, 1.6, ct, cs, border_color=cc)

    # ==========================================
    # SLIDE 2: PROBLEM STATEMENT
    # ==========================================
    s2 = prs.slides.add_slide(blank_layout)
    add_bg(s2)
    add_header(s2, "Problem Statement", "개발팀 협업의 3대 고질병: 도구 파편화와 실시간 싱크 단절", COLOR_AMBER, "02/15")

    tf1 = add_card(s2, 0.8, 1.8, 3.65, 4.8, "⚠️ 도구 파편화 (Tool Fragmentation)", "Context Switching 피로도 누적")
    p = tf1.add_paragraph()
    p.text = "\n• 슬랙/카톡 (채팅), 노션 (회의록), 구글 캘린더 (일정), 로컬 IDE (코딩)의 극심한 분산\n• 링크 복사-붙여넣기에 불필요한 인지 부하 발생\n• 맥락이 끊겨 프로젝트 집중도 저하"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf2 = add_card(s2, 4.84, 1.8, 3.65, 4.8, "⏳ 일정 & 회의록 유실", "대화 속 Action Item 실종")
    p = tf2.add_paragraph()
    p.text = "\n• 채팅 중 나온 '내일 3시 회의', '금요일 데드라인'이 캘린더에 수동 등록되지 않아 누락\n• 회의 후 요약본 작성을 미루다 결정 사항 증발\n• 팀원 간 마감 기한 인지 불일치"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf3 = add_card(s2, 8.88, 1.8, 3.65, 4.8, "💻 환경 설정 장벽 & 접속 단절", "'내 컴에선 되는데' & 상태 불투명")
    p = tf3.add_paragraph()
    p.text = "\n• 로컬 SDK/컴파일러 버전 불일치로 팀원 코드 검증 지연\n• 팀원이 지금 접속 중인지, 작업 중인지 알 수 없음\n• 초대 및 권한 부여 과정의 번거로움"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 3: SYSTEM ARCHITECTURE
    # ==========================================
    s3 = prs.slides.add_slide(blank_layout)
    add_bg(s3)
    add_header(s3, "System Architecture", "실시간 비동기 풀스택 아키텍처 & DevOps 파이프라인", COLOR_CYAN, "03/15")

    tf_fe = add_card(s3, 0.8, 1.8, 2.7, 4.8, "🖥️ Frontend Layer", "모듈러 SPA + History API")
    p = tf_fe.add_paragraph()
    p.text = "\n• 18개 도메인별 CSS 모듈\n• Core / Pages / Shell 분리\n• History API 고유 URL 라우터\n  (/app/workspace, /app/team)\n• PWA manifest 지원\n• Web Worker / WebSocket 클라이언트"
    p.font.size = Pt(11)
    p.font.color.rgb = COLOR_MUTED

    tf_be = add_card(s3, 3.8, 1.8, 2.7, 4.8, "⚙️ Backend Core", "FastAPI + WebSocket Live")
    p = tf_be.add_paragraph()
    p.text = "\n• 비동기 ASGI (FastAPI + Uvicorn)\n• SQLAlchemy Async + SQLite\n• /ws/live 실시간 푸시 허브\n• SQLAlchemy after_commit 훅\n• JWT 인증 + RBAC 권한 엔진"
    p.font.size = Pt(11)
    p.font.color.rgb = COLOR_MUTED

    tf_sb = add_card(s3, 6.8, 1.8, 2.7, 4.8, "🚀 Sandbox Runner", "비동기 서브프로세스 격리")
    p = tf_sb.add_paragraph()
    p.text = "\n• 5개 언어 (Py, Java, C#, C++, C)\n• Windows 내장 csc.exe 자동 탐색\n• 15초 강제 타임아웃 킬러\n• UTF-8 표준 입출력 스트림 보정\n• CPU/메모리 고갈 방지"
    p.font.size = Pt(11)
    p.font.color.rgb = COLOR_MUTED

    tf_dev = add_card(s3, 9.8, 1.8, 2.7, 4.8, "🐳 DevOps & CI/CD", "자동 배포 & 컨테이너")
    p = tf_dev.add_paragraph()
    p.text = "\n• GitHub Actions (deploy.yml)\n• Docker Compose 무중단 재배포\n• .dockerignore 최적화\n• 정적 자산 해시 캐시 버스팅\n• Zero Downtime Restart"
    p.font.size = Pt(11)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 4: NEW - WEBSOCKET & PRESENCE
    # ==========================================
    s4 = prs.slides.add_slide(blank_layout)
    add_bg(s4)
    add_header(s4, "Core Innovation 1", "[NEW] WebSocket 실시간 푸시 엔진 & Live Presence 동기화", COLOR_EMERALD, "04/15")

    tf_ws1 = add_card(s4, 0.8, 1.8, 5.7, 4.8, "⚡ /ws/live 양방향 브로드캐스트 엔진", "Polling에서 Event-Driven Push로 혁신")
    p = tf_ws1.add_paragraph()
    p.text = "\n1. SQLAlchemy after_commit 이벤트 훅 연동\n   • 채팅, 일정, 회의록, 팀원 변경이 DB에 커밋되는 순간 연결된 세션에 100% 즉시 푸시\n2. 폴링(Polling) 대역폭 최적화\n   • 웹소켓 연결 중에는 백그라운드 폴링 주기를 늦춰 서버 부하 90% 이상 절감\n   • 소켓 유실 시 자동 복구 및 폴링 폴백(Fallback) 안전망 가동\n3. 프로젝트/팀 단위 룸 격리\n   • 해당 프로젝트에 소속된 멤버에게만 이벤트를 타겟 브로드캐스트"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf_ws2 = add_card(s4, 6.8, 1.8, 5.7, 4.8, "🟢 실시간 팀원 Presence & 협업 피드백", "접속 상태와 작업 맥락의 실시간 공유")
    p = tf_ws2.add_paragraph()
    p.text = "\n1. 접속 즉시 Online / Offline 상태 브로드캐스트\n   • 웹소켓 연결 수립/해제 시 실시간 상태 감지\n2. 실시간 타이핑 인디케이터 (Typing Indicator)\n   • 팀원이 메시지를 작성 중일 때 부드러운 말풍선 애니메이션(...) 표출\n3. 'N명 접속 중' 및 팀원 아바타 상태 도트\n   • 상단 헤더 및 채팅창에 팀원의 실시간 재실 여부 녹색 도트로 표시\n4. 스마트 스크롤 & 새 메시지 플로팅 버튼\n   • 과거 대화 열람 중 새 메시지 도착 시 직관적인 알림 점프 제공"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 5: 5-LANG SANDBOX
    # ==========================================
    s5 = prs.slides.add_slide(blank_layout)
    add_bg(s5)
    add_header(s5, "Core Innovation 2", "무설치 5개 언어 브라우저 샌드박스 컴파일러", COLOR_PRIMARY, "05/15")

    tf_sb_main = add_card(s5, 0.8, 1.8, 7.5, 4.8, "💻 클라이언트 설치 없는 5개 언어 원클릭 실행", "Python, Java, C#, C++, C 완전 지원")
    p = tf_sb_main.add_paragraph()
    p.text = "\n• Python 3: 실시간 인터프리터 비동기 파이프 실행\n• Java: javac 동적 컴파일 후 클래스패스 기반 실행\n• C/C++: GCC/Clang 기반 네이티브 빌드 및 메모리 실행\n• C#: Windows OS 내장 csc.exe 자동 탐색 알고리즘 탑재 (.NET SDK 미설치 PC에서도 즉시 실행)\n• 보안 격리: 15초 프로세스 트리 강제 킬러로 무한루프 완벽 차단\n• 표준 입출력 UTF-8 자동 보정으로 한글 깨짐 원천 차단"
    p.font.size = Pt(13)
    p.font.color.rgb = COLOR_MUTED

    tf_sb_stat = add_card(s5, 8.6, 1.8, 3.9, 4.8, "📊 실행 벤치마크 & 안정성", "무중단 샌드박스 메트릭")
    p = tf_sb_stat.add_paragraph()
    p.text = "\n[지원 언어]\n• 5개 주요 프로그래밍 언어\n\n[평균 응답 속도]\n• Python: < 0.2초\n• C/C++: < 0.6초\n• C# (내장 csc): < 0.8초\n\n[안정성 보장]\n• 15s 타임아웃 100% 자원 회수\n• 서브프로세스 트리 자동 클린업\n• 임시 빌드 파일 완전 자동 삭제"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 6: AI ASSISTANT
    # ==========================================
    s6 = prs.slides.add_slide(blank_layout)
    add_bg(s6)
    add_header(s6, "Core Innovation 3", "채팅 내장형 AI 비서: 슬래시 명령어 회의 요약 & 일정 추출", COLOR_CYAN, "06/15")

    tf_ai1 = add_card(s6, 0.8, 1.8, 5.7, 4.8, "🤖 /요약 명령어: 회의록 자동 구조화", "방대한 채팅 대화를 3단계 구조로 압축")
    p = tf_ai1.add_paragraph()
    p.text = "\n• 실시간 채팅창에 '/요약' 입력 시 즉시 트리거\n• 최근 대화 문맥을 분석하여 3가지 섹션으로 자동 정리:\n  1) 📋 주요 안건 (Topics)\n  2) 💡 결정된 사항 (Decisions)\n  3) 📌 다음 할 일 (Action Items)\n• 정리된 결과는 프로젝트 공유 회의록(Notes)에 원클릭 자동 보관\n• 외부 AI API 장애 시 자체 룰 기반 파서로 무중단 폴백"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf_ai2 = add_card(s6, 6.8, 1.8, 5.7, 4.8, "📅 /캘린더 명령어: 자연어 문맥 일정 등록", "'내일 3시 팀 미팅' -> 팀 캘린더 즉시 동기화")
    p = tf_ai2.add_paragraph()
    p.text = "\n• 자연어 형태의 대화형 일정 명령 완벽 지원:\n  예: '/캘린더 내일 오후 3시 백엔드 API 리뷰'\n• 날짜, 시간, 일정 제목, 예상 소요 시간을 자동 계산/추출\n• 파싱 즉시 팀 공유 캘린더 DB에 실시간 등록\n• WebSocket을 통해 모든 팀원의 캘린더 화면에 새로고침 없이 즉시 반영"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 7: NEW - TEAM HUB & GUEST HOME
    # ==========================================
    s7 = prs.slides.add_slide(blank_layout)
    add_bg(s7)
    add_header(s7, "Core Innovation 4", "[NEW] 실시간 팀 관리 허브(/app/team) & 게스트 온보딩", COLOR_PRIMARY, "07/15")

    tf_tm1 = add_card(s7, 0.8, 1.8, 5.7, 4.8, "👥 전용 팀 관리 뷰 (/app/team)", "실시간 멤버 현황 & 세분화된 RBAC")
    p = tf_tm1.add_paragraph()
    p.text = "\n• 프로젝트별 팀원 실시간 온라인/오프라인 상태 카드\n• 팀장(Owner): 팀원 역할 변경, 추방 권한 보유\n• 멤버(Member): 자진 탈퇴 기능 지원\n• 브라우저 기본 confirm() 차단 문제를 해결한 세련된 인페이지 확인 모달 적용\n• 72시간 만료 토큰 기반의 1초 초대 URL 생성 시스템"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf_tm2 = add_card(s7, 6.8, 1.8, 5.7, 4.8, "🪐 7-노드 Home Orbit & 게스트 온보딩", "가짜 데이터 탈피, 100% 실데이터 연동")
    p = tf_tm2.add_paragraph()
    p.text = "\n• 홈 화면 중앙 오빗(Orbit): 실제 팀원 6명 슬롯 + AI 비서 노드\n  (더미 아바타 제거 -> 실제 팀원 이니셜 & 실시간 접속 상태 표출)\n• 게스트 홈(Guest Home) 우선 진입 구조:\n  - 로그인 전에도 서비스 기능 탐색 가능\n  - 로그인 버튼 클릭 시 매끄러운 계정 전환\n  - 모든 가짜 통계/목업을 제거하고 실제 DB 데이터 100% 표출"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 8: CRAWLER
    # ==========================================
    s8 = prs.slides.add_slide(blank_layout)
    add_bg(s8)
    add_header(s8, "Core Innovation 5", "해커톤 & IT 공모전 정보 자동 크롤링 엔진", COLOR_AMBER, "08/15")

    tf_cr1 = add_card(s8, 0.8, 1.8, 5.7, 4.8, "🕷️ 지능형 공모전 수집 & 파싱 엔진", "외부 사이트를 찾아다닐 필요 없는 원스톱 정보")
    p = tf_cr1.add_paragraph()
    p.text = "\n• 국내 주요 해커톤 및 IT 공모전 플랫폼 주기적 크롤링\n• 대회명, 주최 기관, 접수 마감일, 공식 링크 자동 수집\n• 비동기 백그라운드 태스크로 사용자 UI 블로킹 제로\n• 중복 수집 방지 및 최신 마감일 기준 자동 정렬 피드 제공"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf_cr2 = add_card(s8, 6.8, 1.8, 5.7, 4.8, "📅 원클릭 팀 캘린더 데드라인 동기화", "공모전 정보와 팀 일정의 유기적 결합")
    p = tf_cr2.add_paragraph()
    p.text = "\n• 크롤링된 공모전 카드에서 '캘린더 추가' 버튼 클릭 한 번으로 등록\n• 팀 캘린더에 공모전 마감 디데이(D-Day) 자동 핀 고정\n• WebSocket을 통해 팀 전원에게 마감일 실시간 공유\n• 공모전 준비 회의록 및 관련 코드 파일과 다이렉트 링크 연동"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 9: NEW - REFACTORING & MODULAR SPA
    # ==========================================
    s9 = prs.slides.add_slide(blank_layout)
    add_bg(s9)
    add_header(s9, "Architecture Evolution", "[NEW] 프론트엔드 모듈러 리팩토링 & History SPA 라우팅", COLOR_CYAN, "09/15")

    tf_rf1 = add_card(s9, 0.8, 1.8, 5.7, 4.8, "📦 8,500줄 모놀리스 -> 모듈러 아키텍처", "유지보수성과 개발 생산성의 극적 향상")
    p = tf_rf1.add_paragraph()
    p.text = "\n[이전 구조]\n• 8,500줄에 달하는 단일 index.html 파일\n• 코드 충돌, 가독성 저하, 모듈 간 결합도 과다\n\n[개선 구조]\n• frontend/css/: admin, auth, workspace 등 18개 모듈\n• frontend/js/core/: api, auth, live, router, session\n• frontend/js/pages/: calendar, chat, team, workspace\n• frontend/js/shell/: menus, notifications, presence\n• manifest.json 순서 기반 정적 번들링 & 캐시 버스팅"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf_rf2 = add_card(s9, 6.8, 1.8, 5.7, 4.8, "🧭 History API 기반 전용 SPA 라우터", "브라우저 네이티브 사용자 경험 완벽 구현")
    p = tf_rf2.add_paragraph()
    p.text = "\n• 화면별 고유 URL 딥링크 지원:\n  /app/workspace, /app/team, /app/calendar, /app/chat\n• 브라우저 뒤로가기/앞으로가기 완벽 동작 (popstate)\n• 뷰 전환 시 동적 페이지 타이틀 자동 갱신\n• 단일 서버 라우팅 규칙으로 /app/* 경로 통합 서빙"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 10: NEW - CI/CD & DEVOPS
    # ==========================================
    s10 = prs.slides.add_slide(blank_layout)
    add_bg(s10)
    add_header(s10, "DevOps & Deployment", "[NEW] GitHub Actions CI/CD & Docker Compose 무중단 배포", COLOR_AMBER, "10/15")

    tf_dp1 = add_card(s10, 0.8, 1.8, 5.7, 4.8, "🚀 자동화 CI/CD 파이프라인 (.github/workflows/deploy.yml)", "코드 푸시부터 실서버 배포까지 전자동화")
    p = tf_dp1.add_paragraph()
    p.text = "\n• main 브랜치 Push 감지 시 자동 실행\n• SSH 보안 원격 접속을 통한 프로덕션 배포 파이프라인\n• 빌드 테스트 및 환경 검증 단계 내장\n• DEPLOY_* 시크릿 기반의 안전한 접근 제어"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf_dp2 = add_card(s10, 6.8, 1.8, 5.7, 4.8, "🐳 Docker Compose 기반 무중단 운영", "docs/DEPLOY.md 표준 배포 가이드라인 수립")
    p = tf_dp2.add_paragraph()
    p.text = "\n• docker compose up -d --build 기반 무중단 재시작\n• .dockerignore 설정을 통한 빌드 컨텍스트 용량 최적화\n• 프론트엔드 정적 파일과 FastAPI 백엔드의 단일 컨테이너 통합\n• SQLite 데이터 영속성을 위한 볼륨 마운트 구성"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 11: TECHNICAL CHALLENGES
    # ==========================================
    s11 = prs.slides.add_slide(blank_layout)
    add_bg(s11)
    add_header(s11, "Engineering Depth", "실제 개발 과정에서 극복한 3대 기술 난제", COLOR_PRIMARY, "11/15")

    tf_ch1 = add_card(s11, 0.8, 1.8, 3.65, 4.8, "🔍 1. 무설치 C# 컴파일러 탐색", "Registry/OS 재귀 탐색 알고리즘")
    p = tf_ch1.add_paragraph()
    p.text = "\n[문제]\n• 수 GB의 .NET SDK가 없는 클라이언트 PC에서 C# 컴파일 실패\n\n[해결]\n• Windows 내장 Microsoft.NET 디렉터리를 재귀 탐색하여 최적의 csc.exe를 자동 감지하는 지능형 탐색 로직 구축\n• SDK 무설치 환경에서도 100% C# 빌드 성공"
    p.font.size = Pt(11)
    p.font.color.rgb = COLOR_MUTED

    tf_ch2 = add_card(s11, 4.84, 1.8, 3.65, 4.8, "🌐 2. CP949 인코딩 충돌 해결", "비동기 UTF-8 디코딩 스트림")
    p = tf_ch2.add_paragraph()
    p.text = "\n[문제]\n• Windows 터미널의 기본 CP949 인코딩으로 인해 한글 컴파일 에러 및 출력 깨짐 발생\n\n[해결]\n• 표준 출력 스트림을 캡처하여 UTF-8 우선 디코딩 및 CP949 폴백 처리하는 하이브리드 인코딩 디코더 개발 완료"
    p.font.size = Pt(11)
    p.font.color.rgb = COLOR_MUTED

    tf_ch3 = add_card(s11, 8.88, 1.8, 3.65, 4.8, "⚡ 3. 소켓 유실 대비 하이브리드 동기화", "WebSocket + Slow Polling 안전망")
    p = tf_ch3.add_paragraph()
    p.text = "\n[문제]\n• 네트워크 단절 시 실시간 이벤트 유실 및 클라이언트 동기화 실패 위험\n\n[해결]\n• 소켓 정상 연결 시에는 폴링을 저속화하여 부하를 낮추고, 소켓 끊김 감지 시 즉시 백그라운드 폴링으로 자동 전환되는 자가 치유(Self-healing) 구조 구현"
    p.font.size = Pt(11)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 12: QUALITY & OSS
    # ==========================================
    s12 = prs.slides.add_slide(blank_layout)
    add_bg(s12)
    add_header(s12, "Verification & Compliance", "100% 자동화 E2E 테스트 통과 & 오픈소스 라이선스 준수", COLOR_EMERALD, "12/15")

    tf_qc1 = add_card(s12, 0.8, 1.8, 5.7, 4.8, "🧪 E2E 엔드투엔드 통합 검증 100% PASS", "scripts/verify_all_action_items.py 자동화 검증")
    p = tf_qc1.add_paragraph()
    p.text = "\n• 회원가입 / 로그인 / JWT 토큰 발급 테스트 통과\n• 5개 언어 코드 컴파일 및 타임아웃 킬러 테스트 통과\n• /요약 및 /캘린더 AI 슬래시 파서 파이프라인 검증\n• WebSocket 연결 수립 및 이벤트 브로드캐스트 검증\n• 팀 생성, 72h 초대 토큰, RBAC 권한 분리 테스트 통과\n• Exit Code 0 (전체 테스트 무결점 완료)"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf_qc2 = add_card(s12, 6.8, 1.8, 5.7, 4.8, "📜 오픈소스 라이선스 준수 체계 확립", "투명한 라이선스 고지 및 컴플라이언스 확보")
    p = tf_qc2.add_paragraph()
    p.text = "\n• 사용된 서드파티 라이브러리 전수 조사 및 문서화:\n  - FastAPI, Starlette, Pydantic (MIT License)\n  - SQLAlchemy, Uvicorn (BSD / MIT License)\n  - Tailwind CSS, Monaco Editor (MIT License)\n• UI 환경설정 모달 내 '오픈소스 라이선스 명세' 열람 창 제공\n• 법적/라이선스적 위험 요소를 원천 차단하여 프로젝트 신뢰도 제고"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 13: LIVE DEMO JOURNEY
    # ==========================================
    s13 = prs.slides.add_slide(blank_layout)
    add_bg(s13)
    add_header(s13, "Demo Scenario", "실제 팀 협업 사용자 여정 (End-to-End Walkthrough)", COLOR_PRIMARY, "13/15")

    steps = [
        ("Step 1. 게스트 탐색 & 로그인", "게스트 홈 진입 -> 원클릭 로그인으로 본인 워크스페이스 전환"),
        ("Step 2. 1초 팀원 초대 & 합류", "팀장이 72h 초대 링크 복사 -> 팀원은 링크 클릭 즉시 합류 완료"),
        ("Step 3. 5개 언어 웹 샌드박스 코딩", "브라우저에서 C#/Python 코드 작성 및 원클릭 즉시 실행"),
        ("Step 4. 실시간 채팅 & AI 슬래시", "타이핑 인디케이터 확인 -> '/요약'과 '/캘린더'로 회의록 및 일정 자동 등록"),
    ]
    for i, (st, ss) in enumerate(steps):
        top_y = 1.8 + i * 1.25
        tf_step = add_card(s13, 0.8, top_y, 11.7, 1.05, f"⚡ {st}", ss, border_color=COLOR_CYAN)

    # ==========================================
    # SLIDE 14: ROADMAP
    # ==========================================
    s14 = prs.slides.add_slide(blank_layout)
    add_bg(s14)
    add_header(s14, "Future Roadmap", "향후 발전 로드맵 & 상용화 확장 계획", COLOR_CYAN, "14/15")

    tf_rd1 = add_card(s14, 0.8, 1.8, 3.65, 4.8, "🚀 단기 계획 (Phase 1)", "안정화 및 접근성 강화")
    p = tf_rd1.add_paragraph()
    p.text = "\n• Cloudflare Tunnel 기반 상시 퍼블릭 도메인 서비스 배포\n• 카카오 / 구글 / 깃허브 소셜 OAuth 연동\n• 실시간 웹소켓 재접속 안정성 튜닝"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf_rd2 = add_card(s14, 4.84, 1.8, 3.65, 4.8, "👥 중기 계획 (Phase 2)", "실시간 협업 심화")
    p = tf_rd2.add_paragraph()
    p.text = "\n• CRDT / Y.js 기반 다중 사용자 실시간 동시 코드 편집\n• WebRTC 기반 팀 음성/화면 공유 채널 탑재\n• 마크다운 회의록 실시간 협업 에디터 도입"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    tf_rd3 = add_card(s14, 8.88, 1.8, 3.65, 4.8, "🛡️ 장기 계획 (Phase 3)", "보안 및 엔터프라이즈 확장")
    p = tf_rd3.add_paragraph()
    p.text = "\n• Docker cgroup / Firecracker 기반 완전 격리 마이크로VM 샌드박스\n• AI 기반 코드 리뷰 및 자동 버그 탐지 에이전트\n• 대학/부트캠프 전용 팀 대시보드 엔터프라이즈 기능"
    p.font.size = Pt(12)
    p.font.color.rgb = COLOR_MUTED

    # ==========================================
    # SLIDE 15: Q&A & CLOSING
    # ==========================================
    s15 = prs.slides.add_slide(blank_layout)
    add_bg(s15)
    add_header(s15, "Q & A", "질의응답 (Questions & Answers)", COLOR_EMERALD, "15/15")

    # Center thank you box
    tf_thx = add_card(s15, 0.8, 1.8, 11.7, 4.8, "흩어진 개발 환경을 하나로, Code Lounge", "경청해 주셔서 대단히 감사합니다.")
    p = tf_thx.add_paragraph()
    p.text = "\n\n💡 주요 질의 대응 준비 완료:\n  • Q1. 기존 협업 툴(슬랙, 노션)과의 차별점 -> 개발 특화 올인원 및 실시간 맥락 보존\n  • Q2. 샌드박스 보안 타임아웃 및 자원 격리 방안 -> 15s OS 강제 킬러 및 마이크로VM 로드맵\n  • Q3. C# 무설치 컴파일 원리 -> Windows 내장 csc.exe 자동 탐색 알고리즘\n  • Q4. 실시간 동기화 아키텍처 -> SQLAlchemy after_commit 훅 + WebSocket(/ws/live)\n\n지금부터 질문을 받도록 하겠습니다."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_TEXT

    prs.save("Code_Lounge_Presentation.pptx")
    print("Code_Lounge_Presentation.pptx created successfully!")

if __name__ == "__main__":
    create_modern_presentation()
