import os
import sys
import asyncio
import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# API 경로를 sys.path에 추가
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api")))

from main import app
from database import init_db, async_session_maker
from models import User, Project, ProjectMember, CalendarEvent, MeetingDoc
from services.sandbox_runner import local_sandbox_runner
from services.auth_service import create_access_token

async def run_tests():
    print("=" * 60)
    print("🚀 sync/ 올인원 미완료 과제 전체 자동화 통합 검증 시작")
    print("=" * 60)

    await init_db()

    # 1. 테스트 사용자 2명 생성 및 토큰 발급 (팀장 leader, 팀원 member)
    leader_email = "leader_test@sync.local"
    member_email = "member_test@sync.local"

    async with async_session_maker() as db:
        from sqlalchemy import select
        # 기존 테스트 사용자 정리 또는 조회
        leader = (await db.execute(select(User).where(User.email == leader_email))).scalar_one_or_none()
        if not leader:
            leader = User(email=leader_email, username="팀장유저", is_active=True)
            db.add(leader)
            await db.commit()
            await db.refresh(leader)

        member = (await db.execute(select(User).where(User.email == member_email))).scalar_one_or_none()
        if not member:
            member = User(email=member_email, username="팀원유저", is_active=True)
            db.add(member)
            await db.commit()
            await db.refresh(member)

    leader_token = create_access_token({"sub": str(leader.id)})
    member_token = create_access_token({"sub": str(member.id)})

    headers_leader = {"Authorization": f"Bearer {leader_token}"}
    headers_member = {"Authorization": f"Bearer {member_token}"}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:

        # ---------------------------------------------------------------------
        # [과제 7] 지원 언어 5개 (Python, Java, C#, C, C++) 샌드박스 검증
        # ---------------------------------------------------------------------
        print("\n[과제 7] 5개 언어 코드 샌드박스 실행 엔진 검증")
        supported_langs = local_sandbox_runner.get_supported_languages()
        print(f"  - 지원 언어 목록: {supported_langs}")
        assert "csharp" in supported_langs and "python" in supported_langs and "java" in supported_langs and "c" in supported_langs and "cpp" in supported_langs

        # Python 실행
        py_res = await client.post("/api/run", json={"source_code": "print('Hello Python')", "language": "python"})
        assert py_res.status_code == 200 and py_res.json()["status"] == "Accepted"
        print(f"  ✓ Python 실행 성공: {py_res.json()['stdout'].strip()}")

        # C# 실행 (Windows CSC)
        cs_code = "using System; class P { static void Main() { Console.WriteLine(\"Hello CSharp\"); } }"
        cs_res = await client.post("/api/run", json={"source_code": cs_code, "language": "csharp"})
        assert cs_res.status_code == 200 and cs_res.json()["status"] == "Accepted"
        print(f"  ✓ C# 실행 성공: {cs_res.json()['stdout'].strip()}")

        # C & C++ 실행
        c_code = '#include <stdio.h>\nint main() { printf("Hello C"); return 0; }'
        c_res = await client.post("/api/run", json={"source_code": c_code, "language": "c"})
        assert c_res.status_code == 200 and c_res.json()["status"] == "Accepted"
        print(f"  ✓ C 실행 성공: {c_res.json()['stdout'].strip()}")

        cpp_code = '#include <iostream>\nint main() { std::cout << "Hello CPP"; return 0; }'
        cpp_res = await client.post("/api/run", json={"source_code": cpp_code, "language": "cpp"})
        assert cpp_res.status_code == 200 and cpp_res.json()["status"] == "Accepted"
        print(f"  ✓ C++ 실행 성공: {cpp_res.json()['stdout'].strip()}")

        # 오픈소스 라이선스 파일 검증
        assert os.path.exists("docs/OPEN_SOURCE_LICENSES.md")
        print("  ✓ docs/OPEN_SOURCE_LICENSES.md 오픈소스 문서 정상 존재 확인")

        # ---------------------------------------------------------------------
        # [과제 1] 임의 URL 기반 크롤링 및 이벤트 목록 조회 검증
        # ---------------------------------------------------------------------
        print("\n[과제 1] 해커톤·공모전 임의 URL 크롤링 기능 검증")
        # 1-1. 전체 이벤트 목록 조회
        evt_list_res = await client.get("/api/events")
        assert evt_list_res.status_code == 200
        events = evt_list_res.json()
        print(f"  ✓ 기본 이벤트 목록 조회 성공 (총 {len(events)}건)")

        # 1-2. 사용자가 입력한 임의 웹사이트 URL 크롤링
        crawl_req = {
            "url": "https://example.com/hackathon-2026",
            "category": "해커톤"
        }
        crawl_res = await client.post("/api/events/crawl-url", json=crawl_req, headers=headers_leader)
        assert crawl_res.status_code == 201
        crawled = crawl_res.json()
        print(f"  ✓ 임의 URL 크롤링 성공: [{crawled['category']}] {crawled['title']} (D-day: {crawled['d_day']})")

        # ---------------------------------------------------------------------
        # 프로젝트 생성 (테스트용)
        # ---------------------------------------------------------------------
        proj_res = await client.post("/api/projects", json={"title": "AI 캡스톤 협업 프로젝트"}, headers=headers_leader)
        assert proj_res.status_code == 201
        project_id = proj_res.json()["id"]
        print(f"\n[기본 인프라] 테스트 프로젝트 생성 완료 (ID: {project_id})")

        # ---------------------------------------------------------------------
        # [과제 6] URL 생성기: 고유 초대 링크(토큰) 생성 및 가입
        # ---------------------------------------------------------------------
        print("\n[과제 6] URL 생성기 (초대 링크 생성 및 참여) 검증")
        link_res = await client.post(f"/api/projects/{project_id}/invite-link", headers=headers_leader)
        assert link_res.status_code == 200
        link_data = link_res.json()
        invite_token = link_data["token"]
        print(f"  ✓ 고유 초대 링크 생성 성공: {link_data['invite_url']} (토큰: {invite_token})")

        # 초대 정보 조회
        info_res = await client.get(f"/api/invitations/{invite_token}", headers=headers_member)
        assert info_res.status_code == 200
        print(f"  ✓ 초대 정보 확인 성공: 프로젝트 '{info_res.json()['project_title']}' by {info_res.json()['inviter_name']}")

        # 팀원이 초대 링크로 프로젝트 자동 합류
        join_res = await client.post(f"/api/invitations/{invite_token}/join", headers=headers_member)
        assert join_res.status_code == 200
        print(f"  ✓ 초대 링크 기반 팀원 합류 성공: {join_res.json()['message']}")

        # ---------------------------------------------------------------------
        # [과제 4 & 5] 팀원 권한 관리 (RBAC) 및 역할 변경 / 추방 권한 검증
        # ---------------------------------------------------------------------
        print("\n[과제 4 & 5] 팀장·팀원 역할 구분 (RBAC) 및 권한 관리 검증")
        # 프로젝트 정보 조회 (멤버 목록 및 역할 확인)
        proj_detail = await client.get("/api/projects", headers=headers_leader)
        p_data = [p for p in proj_detail.json() if p["id"] == project_id][0]
        print(f"  - 현재 프로젝트 멤버 수: {len(p_data['members'])}명")
        for m in p_data["members"]:
            print(f"    • {m['username']} (역할: {m['role']})")

        # 팀장 권한으로 팀원 역할을 'leader'로 변경
        role_res = await client.patch(
            f"/api/projects/{project_id}/members/{member.id}/role",
            json={"role": "leader"},
            headers=headers_leader
        )
        assert role_res.status_code == 200
        print("  ✓ 팀원 역할 변경 성공 (member -> leader)")

        # 다시 'member'로 변경
        await client.patch(
            f"/api/projects/{project_id}/members/{member.id}/role",
            json={"role": "member"},
            headers=headers_leader
        )

        # 권한 테스트: 일반 팀원이 프로젝트 삭제 시도 시 403 Forbidden 확인
        del_fail = await client.delete(f"/api/projects/{project_id}", headers=headers_member)
        assert del_fail.status_code == 403
        print("  ✓ 팀원의 프로젝트 삭제 차단 (403 Forbidden) 정상 방어")

        # ---------------------------------------------------------------------
        # [과제 3] 공유 캘린더 일정 등록 및 팀원 실시간 알림 검증
        # ---------------------------------------------------------------------
        print("\n[과제 3] 공유 캘린더 기능 및 실시간 팀 알림 검증")
        cal_res = await client.post(
            "/api/calendar/events",
            json={
                "project_id": project_id,
                "title": "중간 발표 자료 제작 마감",
                "start_date": "2026-10-20",
                "kind": "shared"
            },
            headers=headers_leader
        )
        assert cal_res.status_code == 201
        print("  ✓ 공유 캘린더 일정 등록 완료")

        # 팀원 계정으로 알림 목록 조회
        notif_res = await client.get("/api/notifications", headers=headers_member)
        assert notif_res.status_code == 200
        notifs = notif_res.json()
        assert len(notifs) > 0
        first_notif = notifs[0]
        print(f"  ✓ 팀원 알림 수신 성공: [{first_notif['category']}] {first_notif['title']} - {first_notif['message']}")

        # 알림 읽음 처리 검증
        read_res = await client.patch(f"/api/notifications/{first_notif['id']}/read", headers=headers_member)
        assert read_res.status_code == 200 and read_res.json()["is_read"] is True
        print("  ✓ 알림 읽음 처리 완료")

        # ---------------------------------------------------------------------
        # [과제 2] 채팅 AI 연동 기능 (슬래시 명령어 요약, 캘린더 분석) 검증
        # ---------------------------------------------------------------------
        print("\n[과제 2] 채팅 AI (이름으로 부르면 AI가 알아서 처리) 검증")
        # 2-1. 회의록 하나 생성
        await client.post(
            "/api/meetings",
            json={
                "project_id": project_id,
                "title": "1차 스프린트 기획 회의록",
                "doc_date": "2026-10-13",
                "raw": "결정사항: 백엔드는 FastAPI로 통일하고, 10월 20일까지 중간 발표 자료를 완성하기로 확정함.",
                "attendees": ["팀장유저", "팀원유저"]
            },
            headers=headers_leader
        )

        async def ask(text: str):
            """AI를 부르는 메시지를 보내고 AI 답변(비동기 처리)을 기다린다"""
            sent = await client.post(f"/api/projects/{project_id}/messages", json={"text": text}, headers=headers_leader)
            assert sent.status_code == 201
            sent_id = sent.json()["id"]
            for _ in range(40):
                await asyncio.sleep(1.5)
                msgs = (await client.get(f"/api/projects/{project_id}/messages", headers=headers_leader)).json()
                found = [m for m in msgs if m["kind"] == "ai" and m["id"] > sent_id]
                if found:
                    return found[0]
            raise AssertionError(f"AI 응답이 없습니다: {text}")

        # 2-2. 이름 없는 평소 대화에는 AI가 답하지 않는다
        before = len([m for m in (await client.get(f"/api/projects/{project_id}/messages", headers=headers_leader)).json() if m["kind"] == "ai"])
        await client.post(f"/api/projects/{project_id}/messages", json={"text": "/요약"}, headers=headers_leader)
        await asyncio.sleep(2)
        after = len([m for m in (await client.get(f"/api/projects/{project_id}/messages", headers=headers_leader)).json() if m["kind"] == "ai"])
        assert after == before, "이름 없는 메시지에는 AI가 응답하면 안 됩니다"
        print("  ✓ 이름 없는 메시지(슬래시 포함)에는 AI가 반응하지 않음")

        # 2-3. 이름으로 부르면 자연어 질문에 답한다
        ans = await ask("AI야 이번 회의에서 결정된 게 뭐야?")
        print(f"  ✓ 'AI야 …' 질문 응답 수신:\n    {ans['text'][:80]}...")

        # 2-4. 자연어로 일정 추가 → 캘린더에 반영 + 되돌리기 정보 포함
        added = await ask("AI야 10월 30일에 워크숍 일정 추가해줘")
        assert added["meta"] and added["meta"].get("actions"), "일정 추가 작업 결과가 없습니다"
        print(f"  ✓ 자연어 일정 추가 성공: {added['text'][-60:]}")

        # 2-5. 삭제는 확인 카드를 거쳐야 실행된다
        dele = await ask("AI야 워크숍 일정 삭제해줘")
        assert dele["meta"] and dele["meta"].get("confirms"), "삭제 확인 카드가 없습니다"
        ev_before = (await client.get(f"/api/calendar/events?project_id={project_id}", headers=headers_leader)).json()
        confirm = await client.post(f"/api/projects/{project_id}/messages/{dele['id']}/confirm/0", headers=headers_leader)
        assert confirm.status_code == 200
        ev_after = (await client.get(f"/api/calendar/events?project_id={project_id}", headers=headers_leader)).json()
        assert len(ev_after) == len(ev_before) - 1
        print("  ✓ 삭제는 확인 후에만 실행됨")

    print("\n" + "=" * 60)
    print("🎉 축하합니다! 모든 미체크 과제 (과제 1 ~ 7 + 통합검증 11)가 성공적으로 완료되었습니다!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_tests())
