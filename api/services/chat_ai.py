import json
from datetime import date, datetime
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import MeetingDoc, CalendarEvent, Project
from config import settings

HELP_TEXT = """**🤖 sync AI 슬래시 명령어 가이드**
- `💬 /요약` 또는 `/회의록`: 프로젝트 최근 회의록 종합 분석 및 핵심 액션아이템 요약
- `📅 /캘린더` 또는 `/일정`: 마감 임박 일정 및 다가오는 프로젝트 스케줄 브리핑
- `📝 /회의 [메모]`: 대화 중 중요한 회의 안건을 회의록 메모로 태깅
- `❓ /도움말`: 사용 가능한 AI 슬래시 명령어 목록 확인"""

async def handle_slash_command(
    project_id: int,
    text: str,
    user_name: str,
    db: AsyncSession
) -> Optional[Dict[str, Any]]:
    """슬래시 명령어를 분석하고 AI 봇 응답 메시지 데이터를 생성"""
    trimmed = text.strip()
    if not trimmed.startswith("/"):
        return None

    cmd_part = trimmed.split()[0].lower()

    if cmd_part in ("/도움말", "/help", "/?"):
        return {
            "author": "sync AI",
            "text": HELP_TEXT,
            "kind": "ai"
        }

    if cmd_part in ("/요약", "/회의록", "/summary", "/회의정리"):
        # 프로젝트 회의록 조회
        docs = (await db.execute(
            select(MeetingDoc).where(MeetingDoc.project_id == project_id)
            .order_by(MeetingDoc.doc_date.desc(), MeetingDoc.id.desc())
            .limit(5)
        )).scalars().all()

        if not docs:
            return {
                "author": "sync AI",
                "text": f"📋 아직 '{project_id}번 프로젝트'에 작성된 회의록이 없습니다. 상단 '회의록' 탭에서 새 회의록을 작성해보세요!",
                "kind": "ai"
            }

        # 회의록 취합 요약
        doc_summaries = []
        for d in docs:
            snippet = d.raw.strip().replace("\n", " ")[:150]
            doc_summaries.append(f"- **{d.title}** ({d.doc_date}): {snippet}...")

        summary_body = "\n".join(doc_summaries)
        ai_reply = f"""**🤖 sync AI 회의록 종합 요약**
최근 등록된 {len(docs)}건의 회의록을 분석한 핵심 내용입니다:

{summary_body}

💡 *상세 내용은 상단 '회의록' 메뉴에서 전체 문서를 확인할 수 있습니다.*"""
        return {
            "author": "sync AI",
            "text": ai_reply,
            "kind": "ai"
        }

    if cmd_part in ("/캘린더", "/일정", "/schedule"):
        # 다가오는 캘린더 일정 조회
        today = date.today()
        events = (await db.execute(
            select(CalendarEvent).where(
                CalendarEvent.project_id == project_id,
                CalendarEvent.end_date >= today
            ).order_by(CalendarEvent.start_date, CalendarEvent.start_time).limit(8)
        )).scalars().all()

        if not events:
            return {
                "author": "sync AI",
                "text": f"📅 현재 진행 예정인 프로젝트 일정이 없습니다. 새 일정을 추가하거나 회의록에서 AI 일정을 자동 감지해보세요!",
                "kind": "ai"
            }

        event_lines = []
        for e in events:
            diff = (e.start_date - today).days
            d_str = "오늘" if diff == 0 else (f"D-{diff}" if diff > 0 else "진행중")
            time_part = f" ({e.start_time})" if e.start_time else ""
            event_lines.append(f"- **[{d_str}]** {e.title} · `{e.start_date}`{time_part}")

        schedule_body = "\n".join(event_lines)
        ai_reply = f"""**🤖 sync AI 다가오는 프로젝트 일정 브리핑**
오늘({today.isoformat()}) 기준 예정된 일정 목록입니다:

{schedule_body}

💡 *새 일정 등록 및 일정 확인은 상단 '캘린더' 탭을 이용하세요.*"""
        return {
            "author": "sync AI",
            "text": ai_reply,
            "kind": "ai"
        }

    return None
