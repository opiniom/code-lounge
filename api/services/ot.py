"""글자 단위 동시 편집(OT)의 계산 부분 — 서버와 화면(frontend/js/pages/workspace-live.js)이 같은 규칙을 쓴다.

문서는 글자(UTF-16 단위, 자바스크립트 문자열과 같은 기준)의 나열이고, 편집은 두 종류의 '작은 연산'이다.
  [0, 위치, "넣을 글자"]   넣기
  [1, 위치, 개수]          지우기
한 번의 편집은 연산 목록이고, 목록은 앞에서부터 차례로 적용된다(뒤 연산의 위치는 앞 연산을 적용한 뒤 기준).

같은 문서에서 두 사람이 동시에 고쳤을 때(A, B) 서로의 편집을 변환해 두면 어느 순서로 적용해도 같은 결과가 된다:
    apply(apply(문서, A), B') == apply(apply(문서, B), A')       ← xform_lists(A, B) 가 (A', B') 를 돌려준다
같은 자리에 동시에 넣는 경우는 a_first 로 누가 왼쪽에 오는지 정한다 (서버가 먼저 받은 쪽이 왼쪽).
"""
from typing import List, Optional, Sequence, Tuple

Op = Tuple  # (0, pos, str) | (1, pos, n)


def len16(s: str) -> int:
    """JS 의 s.length 와 같은 값 (이모지 같은 글자는 2). 짝이 없는 서로게이트도 1 로 센다."""
    return len(s.encode("utf-16-le", "surrogatepass")) // 2


def parse_ops(raw, max_total: int = 400_000) -> Optional[List[Op]]:
    """클라이언트가 보낸 연산 목록을 검사해서 튜플 목록으로. 형식이 틀리면 None"""
    if not isinstance(raw, list) or not raw or len(raw) > 2000:
        return None
    out: List[Op] = []
    total = 0
    for o in raw:
        if not isinstance(o, (list, tuple)) or len(o) != 3:
            return None
        t, p, x = o
        if isinstance(p, bool) or not isinstance(p, int) or p < 0 or p > 50_000_000:
            return None
        if t == 0:
            if not isinstance(x, str) or not x:
                return None
            total += len(x)
            out.append((0, p, x))
        elif t == 1:
            if isinstance(x, bool) or not isinstance(x, int) or x <= 0 or x > 50_000_000:
                return None
            out.append((1, p, x))
        else:
            return None
        if total > max_total:
            return None
    return out


def xform_op(a: Op, b: Op, a_first: bool) -> List[Op]:
    """b 가 이미 적용된 문서에 맞게 a 를 고쳐 쓴다 (지우는 범위 안에 b 가 글자를 넣었다면 둘로 쪼개질 수 있음)"""
    if a[0] == 0 and b[0] == 0:                      # 넣기 / 넣기
        if a[1] < b[1] or (a[1] == b[1] and a_first):
            return [a]
        return [(0, a[1] + len16(b[2]), a[2])]
    if a[0] == 0:                                    # 넣기 / 지우기
        p, q, k = a[1], b[1], b[2]
        if p <= q:
            return [a]
        if p >= q + k:
            return [(0, p - k, a[2])]
        return [(0, q, a[2])]
    if b[0] == 0:                                    # 지우기 / 넣기
        p, n, q, m = a[1], a[2], b[1], len16(b[2])
        if q <= p:
            return [(1, p + m, n)]
        if q >= p + n:
            return [a]
        return [(1, p, q - p), (1, p + m, p + n - q)]
    p, n, q, k = a[1], a[2], b[1], b[2]              # 지우기 / 지우기
    if p + n <= q:
        return [a]
    if p >= q + k:
        return [(1, p - k, n)]
    overlap = min(p + n, q + k) - max(p, q)
    rest = n - overlap
    return [(1, min(p, q), rest)] if rest > 0 else []


def xform_lists(A: Sequence[Op], B: Sequence[Op], a_first: bool) -> Tuple[List[Op], List[Op]]:
    """같은 문서에서 시작한 두 연산 목록을 서로의 뒤에 적용할 수 있게 변환 → (A', B')"""
    if not A or not B:
        return list(A), list(B)
    if len(A) == 1 and len(B) == 1:
        return xform_op(A[0], B[0], a_first), xform_op(B[0], A[0], not a_first)
    if len(A) > 1:
        a1, rest = A[0], A[1:]
        a1p, B1 = xform_lists([a1], B, a_first)
        restp, B2 = xform_lists(rest, B1, a_first)
        return a1p + restp, B2
    b1, restb = B[0], B[1:]
    A1, b1p = xform_lists(A, [b1], a_first)
    A2, restbp = xform_lists(A1, restb, a_first)
    return A2, b1p + restbp


def apply_ops(buf: bytearray, ops: Sequence[Op]) -> bool:
    """UTF-16(리틀엔디언) 바이트 문서에 연산을 적용한다. 범위를 벗어나면 False (문서는 일부만 바뀔 수 있으니 호출한 쪽에서 복사본으로 시도할 것)"""
    for o in ops:
        n_units = len(buf) // 2
        if o[0] == 0:
            if o[1] > n_units:
                return False
            buf[o[1] * 2:o[1] * 2] = o[2].encode("utf-16-le", "surrogatepass")
        else:
            if o[1] + o[2] > n_units:
                return False
            del buf[o[1] * 2:(o[1] + o[2]) * 2]
    return True


def to_buf(text: str) -> bytearray:
    return bytearray(text.encode("utf-16-le", "surrogatepass"))


def buf_text(buf: bytearray, safe: bool = False) -> str:
    """safe=True: 저장용(짝 없는 서로게이트는 □ 로). False: 화면으로 보낼 때(그대로, JSON 이스케이프로 전달)"""
    return bytes(buf).decode("utf-16-le", "replace" if safe else "surrogatepass")


def valid_ops(n_units: int, ops: Sequence[Op]) -> Optional[int]:
    """길이 n_units 인 문서에 ops 를 적용해도 범위를 벗어나지 않는지 미리 확인. 맞으면 적용 뒤 길이, 아니면 None"""
    n = n_units
    for o in ops:
        if o[0] == 0:
            if o[1] > n:
                return None
            n += len16(o[2])
        else:
            if o[1] + o[2] > n:
                return None
            n -= o[2]
    return n
