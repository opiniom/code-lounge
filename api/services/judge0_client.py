import base64
import asyncio
import httpx
from typing import Dict, Any, Optional, Tuple
from config import settings
from schemas import CodeRunResponse

# Judge0 언어 ID 매핑 (Judge0 CE 기본 언어 ID)
LANGUAGE_MAP: Dict[str, int] = {
    "python": 71,       # Python (3.8.1)
    "python3": 71,
    "py": 71,
    "java": 62,         # Java (OpenJDK 13.0.1)
    "c": 50,            # C (GCC 9.2.0)
    "cpp": 54,          # C++ (GCC 9.2.0)
    "c++": 54,
    "javascript": 63,   # JavaScript (Node.js 12.14.0)
    "js": 63,
    "node": 63,
    "typescript": 74,   # TypeScript (3.7.4)
    "ts": 74,
    "go": 60,           # Go (1.13.5)
    "golang": 60,
    "rust": 73,         # Rust (1.40.0)
    "rs": 73
}

def encode_b64(text: Optional[str]) -> Optional[str]:
    if text is None:
        return None
    return base64.b64encode(text.encode("utf-8")).decode("utf-8")

def decode_b64(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    try:
        return base64.b64decode(text).decode("utf-8")
    except Exception:
        return base64.b64decode(text).decode("latin-1", errors="replace")

class Judge0Client:
    def __init__(self, base_url: str = settings.JUDGE0_URL):
        self.base_url = base_url.rstrip("/")

    def get_language_id(self, lang: str) -> Optional[int]:
        return LANGUAGE_MAP.get(lang.lower().strip())

    async def check_health(self) -> Tuple[bool, Optional[str]]:
        """Judge0 서버 헬스체크 및 버전 조회"""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/version")
                if resp.status_code == 200:
                    data = resp.json()
                    version = data.get("version", "unknown")
                    return True, f"Judge0 CE v{version}"
                return False, f"HTTP {resp.status_code}"
        except Exception as e:
            return False, str(e)

    async def run_code(
        self,
        source_code: str,
        language: str,
        stdin: str = "",
        cpu_time_limit: Optional[float] = None,
        memory_limit: Optional[int] = None
    ) -> CodeRunResponse:
        """코드를 Judge0 샌드박스로 전송하고 결과를 수신"""
        lang_id = self.get_language_id(language)
        if not lang_id:
            return CodeRunResponse(
                status="Error",
                error=f"지원하지 않는 언어입니다: '{language}'. 지원 언어: {list(LANGUAGE_MAP.keys())}"
            )

        # 리소스 제약 안전 가드레일 적용
        time_limit = cpu_time_limit or settings.DEFAULT_TIMEOUT_SECONDS
        time_limit = min(max(0.5, time_limit), settings.MAX_TIMEOUT_SECONDS)

        mem_limit = memory_limit or settings.DEFAULT_MEMORY_LIMIT_KB
        mem_limit = min(max(16384, mem_limit), settings.DEFAULT_MEMORY_LIMIT_KB)

        payload = {
            "source_code": encode_b64(source_code),
            "language_id": lang_id,
            "stdin": encode_b64(stdin),
            "cpu_time_limit": time_limit,
            "cpu_extra_time": 1.0,
            "wall_time_limit": time_limit * 2,
            "memory_limit": mem_limit,
            "stack_limit": 128000,
            "max_processes_and_or_threads": 60,
            "enable_network": False  # 외부 인터넷 격리 보안 정책
        }

        url = f"{self.base_url}/submissions?base64_encoded=true&wait=true"
        
        try:
            async with httpx.AsyncClient(timeout=time_limit + 15.0) as client:
                response = await client.post(url, json=payload)
                
                if response.status_code not in (200, 201):
                    return CodeRunResponse(
                        status="Error",
                        error=f"Judge0 제출 오류 (HTTP {response.status_code}): {response.text}"
                    )
                
                result = response.json()
                token = result.get("token")

                # wait=true로 바로 완료되지 않았을 경우 폴링
                status_id = result.get("status", {}).get("id", 1)
                # status_id 1: In Queue, 2: Processing
                max_polls = 10
                poll_count = 0
                while status_id in (1, 2) and token and poll_count < max_polls:
                    await asyncio.sleep(1.0)
                    poll_resp = await client.get(f"{self.base_url}/submissions/{token}?base64_encoded=true")
                    if poll_resp.status_code == 200:
                        result = poll_resp.json()
                        status_id = result.get("status", {}).get("id", 1)
                    poll_count += 1

                # 결과 파싱
                status_desc = result.get("status", {}).get("description", "Unknown")
                stdout = decode_b64(result.get("stdout"))
                stderr = decode_b64(result.get("stderr"))
                compile_output = decode_b64(result.get("compile_output"))
                execution_time = float(result.get("time")) if result.get("time") is not None else None
                memory_used = int(result.get("memory")) if result.get("memory") is not None else None
                exit_code = result.get("exit_code")

                return CodeRunResponse(
                    status=status_desc,
                    stdout=stdout,
                    stderr=stderr,
                    compile_output=compile_output,
                    execution_time=execution_time,
                    memory_used=memory_used,
                    exit_code=exit_code
                )

        except httpx.ConnectError:
            return CodeRunResponse(
                status="Error",
                error=f"Judge0 서버({self.base_url})에 연결할 수 없습니다. Docker 컨테이너 실행 상태를 확인하세요."
            )
        except httpx.TimeoutException:
            return CodeRunResponse(
                status="Time Limit Exceeded",
                error="중계 서버 요청 제한 시간을 초과하였습니다."
            )
        except Exception as e:
            return CodeRunResponse(
                status="Error",
                error=f"코드 실행 중 예외 발생: {str(e)}"
            )

judge0_client = Judge0Client()
