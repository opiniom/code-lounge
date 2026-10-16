"""관리자 API 통합 테스트 — 임시 DB(data/test_admin.db)와 임시 포트(8097)로 서버를 직접 띄워서 검증하고, 끝나면 모두 지운다.
실행: .venv/bin/python tests/test_admin_api.py  (프로젝트 루트에서). 실제 서비스 DB 는 건드리지 않는다."""
import json, os, urllib.parse, sqlite3, subprocess, sys, time, datetime, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_admin.db"); PORT = 8097; B = f"http://127.0.0.1:{PORT}"
SUPER = "qa-super@example.com"
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
env = dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", ADMIN_EMAILS=SUPER, EVENT_CRAWL_ENABLED="false", PUBLIC_MODE="false")
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
sys.path.insert(0, os.path.join(ROOT, "api")); os.environ.update({"DATABASE_URL": env["DATABASE_URL"]})
from services.auth_service import create_access_token
for _ in range(60):
    try: urllib.request.urlopen(B + "/api/auth/config", timeout=1); break
    except Exception: time.sleep(0.5)
c = sqlite3.connect(DB); now = datetime.datetime.utcnow().isoformat(sep=" ")
def mk(e, n):
    c.execute("insert into users (email,hashed_password,username,oauth_provider,is_active,created_at) values (?,?,?,?,1,?)", (e, "", n, "google", now)); c.commit()
    return c.execute("select id from users where email=?", (e,)).fetchone()[0]
ids = {"super": mk(SUPER, "최고관리자"), "op": mk("qa-op@example.com", "운영자"), "op2": mk("qa-op2@example.com", "운영자2"), "u1": mk("qa-u1@example.com", "일반1"), "u2": mk("qa-u2@example.com", "일반2")}
mails = {"super": SUPER, "op": "qa-op@example.com", "op2": "qa-op2@example.com", "u1": "qa-u1@example.com", "u2": "qa-u2@example.com"}
T = {k: create_access_token({"sub": str(i), "email": mails[k]}) for k, i in ids.items()}
def api(m, path, who=None, body=None):
    path = urllib.parse.quote(path, safe="/?&=:@")
    req = urllib.request.Request(B + path, method=m, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + T[who]} if who else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e: return e.code, (json.loads(e.read() or b"{}"))
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
try:
    # 1) 접근 권한
    for who, want in ((None, 401), ("u1", 403), ("op", 403)):
        s, _ = api("GET", "/api/admin/overview", who); chk(f"권한 없음({who}) → {want}", s == want, s)   # op 는 아직 운영자 지정 전
    s, me = api("GET", "/api/auth/me", "super"); chk("최고관리자 /me 에 is_admin·is_super", s == 200 and me["is_admin"] and me["is_super"], me)
    s, me = api("GET", "/api/auth/me", "u1"); chk("일반 사용자 /me 는 관리자 아님", not me["is_admin"] and not me["is_super"])
    s, _ = api("POST", "/api/admin/users/%d/role" % ids["op"], "super", {"is_admin": True}); chk("최고관리자가 운영자 지정", s == 200, s)
    s, me = api("GET", "/api/auth/me", "op"); chk("운영자 /me is_admin", me["is_admin"] and not me["is_super"], me)
    s, _ = api("GET", "/api/admin/overview", "op"); chk("운영자도 관리자 API 사용", s == 200, s)
    s, _ = api("POST", "/api/admin/users/%d/role" % ids["op2"], "op", {"is_admin": True}); chk("운영자는 운영자 지정 불가", s == 403, s)
    s, _ = api("POST", "/api/admin/users/%d/role" % ids["super"], "super", {"is_admin": False}); chk("최고관리자 계정은 권한 변경 불가", s == 400, s)
    # 2) 대시보드
    s, ov = api("GET", "/api/admin/overview", "super")
    chk("대시보드 구조", s == 200 and ov["users"]["total"] == 5 and len(ov["series"]["users"]) == 14 and "reports" in ov["todo"], ov["users"])
    chk("오늘 가입자 수", ov["users"]["new_today"] == 5, ov["users"]["new_today"])
    # 3) 사용자 목록·검색·상세
    s, lst = api("GET", "/api/admin/users?q=일반", "super"); chk("이름 검색", lst["total"] == 2, lst["total"])
    s, lst = api("GET", "/api/admin/users?q=qa-u1@", "super"); chk("이메일 검색", lst["total"] == 1 and lst["items"][0]["email"] == mails["u1"])
    s, lst = api("GET", "/api/admin/users?size=2&page=2", "super"); chk("페이지 나누기", s == 200 and len(lst["items"]) == 2 and lst["total"] == 5)
    chk("비밀번호·토큰 필드는 응답에 없다", not any(k in json.dumps(lst) for k in ("hashed_password", "oauth_id", "token")))
    s, d = api("GET", "/api/admin/users/%d" % ids["u1"], "super"); chk("사용자 상세", s == 200 and d["email"] == mails["u1"])
    # 4) 정지/해제
    s, _ = api("POST", "/api/admin/users/%d/suspend" % ids["u1"], "super", {"reason": "도배"}); chk("사용자 정지", s == 200, s)
    s, _ = api("GET", "/api/auth/me", "u1"); chk("정지된 사용자의 토큰은 바로 무효(401)", s == 401, s)
    s, lst = api("GET", "/api/admin/users?state=suspended", "super"); chk("정지 목록·사유", lst["total"] == 1 and lst["items"][0]["ban_reason"] == "도배")
    s, _ = api("POST", "/api/admin/users/%d/suspend" % ids["super"], "op", {"reason": "x"}); chk("최고관리자는 정지 불가", s == 403, s)
    s, _ = api("POST", "/api/admin/users/%d/suspend" % ids["op"], "op", {"reason": "x"}); chk("내 계정은 정지 불가", s == 400, s)
    api("POST", "/api/admin/users/%d/role" % ids["op2"], "super", {"is_admin": True})
    s, _ = api("POST", "/api/admin/users/%d/suspend" % ids["op2"], "op", {"reason": "x"}); chk("운영자는 다른 운영자를 정지 불가", s == 403, s)
    s, _ = api("POST", "/api/admin/users/%d/role" % ids["u1"], "super", {"is_admin": True}); chk("정지된 계정은 운영자 지정 불가", s == 400, s)
    s, _ = api("POST", "/api/admin/users/%d/unsuspend" % ids["u1"], "op"); chk("정지 해제", s == 200, s)
    s, _ = api("GET", "/api/auth/me", "u1"); chk("해제 후 다시 사용 가능", s == 200, s)
    # 5) 신고·콘텐츠
    c.execute("insert into community_posts (user_id,category,title,body,created_at,updated_at,like_count,comment_count,bookmark_count,report_count,is_pinned,is_hidden,is_deleted,status) values (?,?,?,?,?,?,0,0,0,2,0,0,0,'open')", (ids["u2"], "free", "신고된 글입니다", "광고 광고 광고", now, now))
    pid = c.execute("select max(id) from community_posts").fetchone()[0]
    c.execute("insert into community_reports (user_id,target_type,target_id,reason,created_at) values (?,?,?,?,?)", (ids["u1"], "post", pid, "광고", now))
    c.execute("insert into community_reports (user_id,target_type,target_id,reason,created_at) values (?,?,?,?,?)", (ids["op"], "post", pid, "스팸", now)); c.commit()
    s, rp = api("GET", "/api/admin/reports", "op"); chk("신고 큐: 글 단위로 묶음", s == 200 and rp["total"] == 1 and rp["items"][0]["count"] == 2 and rp["items"][0]["target"]["title"] == "신고된 글입니다", rp)
    s, _ = api("POST", f"/api/admin/reports/post/{pid}/resolve", "u2", {"action": "hide"}); chk("일반 사용자는 신고 처리 불가", s == 403, s)
    s, _ = api("POST", f"/api/admin/reports/post/{pid}/resolve", "op", {"action": "bogus"}); chk("잘못된 처리 거부", s == 400, s)
    s, _ = api("POST", f"/api/admin/reports/post/{pid}/resolve", "op", {"action": "hide"}); chk("신고 글 숨김", s == 200, s)
    hidden = c.execute("select is_hidden from community_posts where id=?", (pid,)).fetchone()[0]; chk("글이 실제로 숨겨짐", hidden == 1)
    s, rp = api("GET", "/api/admin/reports", "op"); chk("처리하면 대기 큐에서 빠짐", rp["total"] == 0)
    s, rp = api("GET", "/api/admin/reports?status=resolved", "op"); chk("처리 완료 목록에 남음", rp["total"] == 1)
    s, _ = api("POST", f"/api/admin/posts/{pid}/action", "op", {"action": "unhide"}); chk("글 숨김 해제", s == 200 and c.execute("select is_hidden from community_posts where id=?", (pid,)).fetchone()[0] == 0)
    s, _ = api("POST", f"/api/admin/posts/{pid}/action", "op", {"action": "pin"}); chk("글 고정", c.execute("select is_pinned from community_posts where id=?", (pid,)).fetchone()[0] == 1)
    s, ps = api("GET", "/api/admin/posts?state=pinned", "op"); chk("고정 글 목록", any(x["id"] == pid for x in ps["items"]), ps["total"])
    s, _ = api("POST", f"/api/admin/posts/{pid}/action", "op", {"action": "delete"}); chk("글 삭제(숨김 처리)", c.execute("select is_deleted from community_posts where id=?", (pid,)).fetchone()[0] == 1)
    # 6) 프로젝트
    c.execute("insert into projects (owner_id,title,created_at) values (?,?,?)", (ids["u2"], "관리 테스트 프로젝트", now)); c.commit()
    s, pj = api("GET", "/api/admin/projects?q=관리", "op"); chk("프로젝트 목록·검색", pj["total"] == 1 and pj["items"][0]["owner"] == "일반2" and pj["items"][0]["members"] == 1, pj)
    # 7) 크롤러
    s, cr = api("GET", "/api/admin/crawler", "op"); chk("크롤러 정보", s == 200 and "runs" in cr and "sources" in cr, list(cr.keys()) if isinstance(cr, dict) else cr)
    c.execute("insert into crawled_events (url,title,category,source,created_at) values (?,?,?,?,?)", ("https://example.com/x", "삭제할 행사", "공모전", "manual", now)); c.commit()
    eid = c.execute("select max(id) from crawled_events").fetchone()[0]
    s, ev = api("GET", "/api/admin/events?q=삭제할", "op"); chk("행사 목록·검색", ev["total"] == 1)
    s, _ = api("DELETE", f"/api/admin/events/{eid}", "op"); chk("행사 삭제", s == 200 and c.execute("select count(*) from crawled_events where id=?", (eid,)).fetchone()[0] == 0)
    # 8) 공지
    s, _ = api("POST", "/api/admin/announcements", "op", {"title": "점검 안내", "message": "오늘 밤 12시 점검", "link": "javascript:alert(1)"}); chk("위험한 링크 거부", s == 400, s)
    s, _ = api("POST", "/api/admin/announcements", "u2", {"title": "x", "message": "y"}); chk("일반 사용자는 공지 불가", s == 403, s)
    s, an = api("POST", "/api/admin/announcements", "op", {"title": "점검 안내", "message": "오늘 밤 12시 점검", "link": "/app/community"}); chk("공지 발송", s == 200 and an["sent_count"] == 5, an)
    s, nt = api("GET", "/api/notifications", "u2"); chk("사용자 알림함에 공지 도착", s == 200 and any(n["category"] == "notice" and "점검 안내" in n["title"] for n in nt), nt if s != 200 else "")
    s, hist = api("GET", "/api/admin/announcements", "op"); chk("공지 기록", len(hist["items"]) == 1 and hist["items"][0]["sent_count"] == 5)
    # 9) 감사 로그 · 시스템
    s, au = api("GET", "/api/admin/audit", "op"); acts = [a["action"] for a in au["items"]]
    chk("감사 로그에 모든 조치가 남음", all(x in acts for x in ("user.suspend", "user.unsuspend", "user.admin_on", "report.hide", "post.pin", "event.delete", "announce.send")), acts)
    s, au2 = api("GET", "/api/admin/audit?q=suspend", "op"); chk("감사 로그 검색", 0 < au2["total"] < au["total"])
    s, sy = api("GET", "/api/admin/system", "op"); chk("시스템 정보", s == 200 and sy["db_engine"] == "sqlite" and sy["tables"]["users"] == 5 and sy["you"]["role"] == "admin", sy.get("you"))
    chk("시스템 정보에 비밀 값 없음", "JWT" not in json.dumps(sy) and "SECRET" not in json.dumps(sy))
finally:
    srv.terminate()
    try: srv.wait(10)
    except Exception: srv.kill()
    c.close()
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
bad = [r for r in R if not r[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과")
sys.exit(1 if bad else 0)
