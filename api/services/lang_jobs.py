"""관리자 페이지에서 시작한 언어 설치 작업 — 한 번에 하나만 돌리고, 진행 상황(로그)을 화면이 계속 물어볼 수 있게 보관한다."""
import asyncio
import threading
import time
import uuid
from typing import Dict, List, Optional

from services import lang_install as li
from services import lang_registry as reg

_jobs: Dict[str, Dict] = {}
_current: Optional[str] = None
_lock = threading.Lock()
MAX_LOG = 400


def _public(j: Dict) -> Dict:
    return {"id": j["id"], "runtime": j["runtime"], "version": j["version"], "status": j["status"], "log": j["log"][-60:], "result": j.get("result"),
            "error": j.get("error"), "started_at": j["started_at"], "finished_at": j.get("finished_at"), "by": j.get("by")}


def current() -> Optional[Dict]:
    j = _jobs.get(_current) if _current else None
    return _public(j) if j else None


def get(job_id: str) -> Optional[Dict]:
    j = _jobs.get(job_id)
    return _public(j) if j else None


def start(runtime: str, version: Optional[str], by: str) -> Dict:
    """설치를 백그라운드에서 시작한다. 이미 다른 설치가 돌고 있으면 RuntimeError"""
    global _current
    with _lock:
        cur = _jobs.get(_current) if _current else None
        if cur and cur["status"] == "running":
            raise RuntimeError("다른 언어를 설치하는 중이에요. 끝난 뒤에 다시 시도해 주세요.")
        job = {"id": uuid.uuid4().hex[:12], "runtime": runtime, "version": version or "", "status": "running", "log": [], "started_at": time.time(), "by": by}
        _jobs[job["id"]] = job
        _current = job["id"]
        for old in sorted(_jobs.values(), key=lambda x: x["started_at"])[:-10]:       # 오래된 기록은 정리
            _jobs.pop(old["id"], None)

    def log(line: str) -> None:
        job["log"].append(str(line)[:300])
        if len(job["log"]) > MAX_LOG:
            del job["log"][: len(job["log"]) - MAX_LOG]

    def work() -> None:
        try:
            vid = li.install(runtime, version or None, log)
            job["result"] = vid
            job["status"] = "done"
            log(f"✓ 설치 완료: {runtime} {vid}")
        except li.InstallError as e:
            job["status"], job["error"] = "error", str(e)
            log("✗ " + str(e))
        except Exception as e:                      # 설치 도구의 예상 못 한 문제도 서버를 죽이지 않고 알린다
            job["status"], job["error"] = "error", f"설치 중 문제가 생겼어요: {e}"
            log("✗ " + job["error"])
        finally:
            job["finished_at"] = time.time()

    threading.Thread(target=work, daemon=True, name=f"lang-install-{runtime}").start()
    return _public(job)
