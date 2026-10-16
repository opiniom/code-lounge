"""관리자 코드를 잊었을 때: 서버에서 직접 실행해 코드를 지운다. (서버 파일에 접근할 수 있는 사람만 할 수 있다)
실행 후 최고관리자가 /app/admin 에서 새 6자리 코드를 다시 정하면 된다. 이전에 받은 확인 토큰도 모두 무효가 된다.

  Docker 로 배포한 경우:  docker compose -f docker-compose.prod.yml exec app python /app/scripts/reset_admin_code.py
  로컬:                    .venv/bin/python scripts/reset_admin_code.py
"""
import asyncio, os, sys
here = os.path.dirname(os.path.abspath(__file__))
for cand in (os.path.join(here, "..", "api"), os.path.join(here, "..")):
    if os.path.exists(os.path.join(cand, "database.py")):
        sys.path.insert(0, cand); os.chdir(cand); break
from database import async_session_maker, init_db       # noqa: E402
from services import admin_gate                         # noqa: E402


async def main():
    await init_db()
    async with async_session_maker() as db:
        await admin_gate.clear_code(db)
        await db.commit()
    print("관리자 코드를 지웠어요. 최고관리자가 /app/admin 에서 새 코드를 설정하세요.")

asyncio.run(main())
