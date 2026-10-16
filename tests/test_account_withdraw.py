"""회원 탈퇴 테스트 — 임시 DB(data/test_withdraw.db)·임시 포트(8095)로 서버를 직접 띄우고 끝나면 지운다.
실행: .venv/bin/python tests/test_account_withdraw.py (프로젝트 루트에서). 실제 서비스 DB 는 건드리지 않는다."""
import json, os, sqlite3, subprocess, sys, time, datetime, urllib.parse, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_withdraw.db"); PORT = 8095; B = f"http://127.0.0.1:{PORT}"
SUPER = "qa-super@example.com"
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
env = dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", ADMIN_EMAILS=SUPER, EVENT_CRAWL_ENABLED="false", PUBLIC_MODE="false")
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
sys.path.insert(0, os.path.join(ROOT, "api"))
from services.auth_service import create_access_token
for _ in range(60):
    try: urllib.request.urlopen(B + "/api/auth/config", timeout=1); break
    except Exception: time.sleep(0.5)
c = sqlite3.connect(DB); NOW = datetime.datetime.utcnow(); now = NOW.isoformat(sep=" ")
def q(sql, *a): cur = c.execute(sql, a); c.commit(); return cur
def mk(e, n, prov="google"):
    q("insert into users (email,hashed_password,username,oauth_provider,oauth_id,is_active,is_admin,created_at) values (?,?,?,?,?,1,0,?)", e, "x" if prov == "local" else "", n, prov, "oid-" + n, now)
    return c.execute("select id from users where email=?", (e,)).fetchone()[0]
U = {k: mk(*v) for k, v in {"super": (SUPER, "최고관리자"), "A": ("alice.kim@example.com", "앨리스"), "B": ("qa-b@example.com", "비비"), "C": ("qa-c@example.com", "씨씨"),
                           "X": ("qa-x@example.com", "엑스"), "G": ("guest-abc123@guest.sync.local", "게스트1", "invite")}.items()}
M = {"super": SUPER, "A": "alice.kim@example.com", "B": "qa-b@example.com", "C": "qa-c@example.com", "X": "qa-x@example.com", "G": "guest-abc123@guest.sync.local"}
T = {k: create_access_token({"sub": str(i), "email": M[k]}) for k, i in U.items()}
G = {}
def api(m, path, who=None, body=None):
    req = urllib.request.Request(B + urllib.parse.quote(path, safe="/?&=:@%"), method=m, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + T[who]} if who else {}), **({"X-Admin-Token": G[who]} if G.get(who) else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e: return e.code, (json.loads(e.read() or b"{}"))
def cnt(sql, *a): return c.execute(sql, a).fetchone()[0]
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
a = U["A"]
try:
    # ---- 데이터 준비: A 는 P1(팀장, B 부팀장·C 팀원) · P2(혼자) 의 팀장, X 의 P3 에는 팀원
    P = {}
    for k, owner, title in (("P1", a, "함께 하는 프로젝트"), ("P2", a, "혼자 쓰는 프로젝트"), ("P3", U["X"], "엑스의 프로젝트")):
        q("insert into projects (owner_id,title,created_at) values (?,?,?)", owner, title, now); P[k] = c.execute("select max(id) from projects").fetchone()[0]
    for pid, uid, role in ((P["P1"], U["C"], "member"), (P["P1"], U["B"], "leader"), (P["P3"], a, "member")):
        q("insert into project_members (project_id,user_id,role,created_at) values (?,?,?,?)", pid, uid, role, now)
    for pid in (P["P1"], P["P2"]):
        q("insert into project_files (project_id,path,content,updated_by,created_at,updated_at) values (?,?,?,?,?,?)", pid, "main.py", "print(1)", a, now, now)
        q("insert into chat_messages (project_id,user_id,kind,text,created_at) values (?,?,?,?,?)", pid, a, "user", "안녕하세요 비밀 메시지", now)
        q("insert into project_invitations (project_id,token,created_by,max_uses,used_count,created_at) values (?,?,?,0,0,?)", pid, f"tok-{pid}", a, now)
        q("insert into call_rooms (project_id,name,created_by,created_at) values (?,?,?,?)", pid, "방", a, now)
        q("insert into meeting_docs (user_id,project_id,title,doc_date,attendees,raw,status,created_at) values (?,?,?,?,?,?,?,?)", a, pid, "팀 회의록", NOW.date().isoformat(), "[]", "내용", "완료", now)
        q("insert into calendar_events (user_id,project_id,title,start_date,end_date,all_day,kind,created_at) values (?,?,?,?,?,1,'shared',?)", a, pid, "팀 일정", NOW.date().isoformat(), NOW.date().isoformat(), now)
    q("insert into calendar_events (user_id,project_id,title,start_date,end_date,all_day,kind,created_at) values (?,?,?,?,?,1,'private',?)", a, P["P1"], "내 개인 일정", NOW.date().isoformat(), NOW.date().isoformat(), now)
    q("insert into meeting_docs (user_id,project_id,title,doc_date,attendees,raw,status,created_at) values (?,NULL,?,?,?,?,?,?)", a, "개인 회의록", NOW.date().isoformat(), "[]", "개인", "완료", now)
    q("insert into user_profiles (user_id,headline,bio,updated_at) values (?,?,?,?)", a, "개발자", "소개", now)
    q("insert into portfolio_entries (user_id,project_id,summary,updated_at) values (?,?,?,?)", a, P["P1"], "내가 한 일", now)
    q("insert into follows (follower_id,followee_id,created_at) values (?,?,?)", a, U["B"], now); q("insert into follows (follower_id,followee_id,created_at) values (?,?,?)", U["B"], a, now)
    for i in range(3): q("insert into notifications (user_id,title,message,category,is_read,created_at) values (?,?,?,?,0,?)", a, f"알림{i}", "내용", "chat", now)
    for i in range(2): q("insert into submissions (user_id,language,source_code,status,created_at) values (?,?,?,?,?)", a, "python", "print(1)", "Accepted", now)
    cp = "category,title,body,like_count,comment_count,bookmark_count,report_count,is_pinned,is_hidden,is_deleted,status,created_at,updated_at"
    q(f"insert into community_posts (user_id,{cp}) values (?,?,?,?,?,?,?,?,0,0,0,'open',?,?)", a, "free", "앨리스의 글", "개인 의견 본문", 0, 0, 0, 0, now, now); my_post = c.execute("select max(id) from community_posts").fetchone()[0]
    q(f"insert into community_posts (user_id,{cp}) values (?,?,?,?,?,?,?,?,0,0,0,'open',?,?)", U["X"], "free", "엑스의 글", "본문", 1, 1, 1, 0, now, now); xp = c.execute("select max(id) from community_posts").fetchone()[0]
    q("insert into community_comments (post_id,user_id,body,like_count,is_deleted,created_at) values (?,?,?,0,0,?)", xp, a, "앨리스 댓글", now)
    q("insert into community_likes (user_id,target_type,target_id,created_at) values (?,'post',?,?)", a, xp, now); q("insert into community_bookmarks (user_id,post_id,created_at) values (?,?,?)", a, xp, now)

    # ---- 미리보기
    s, pv = api("GET", "/api/account/withdraw/preview", "A")
    chk("미리보기: 혼자인 프로젝트는 삭제, 팀원 있는 프로젝트는 팀장 이전(부팀장 우선)", s == 200 and {o["title"]: o["action"] for o in pv["owned"]} == {"함께 하는 프로젝트": "transfer", "혼자 쓰는 프로젝트": "delete"}, pv)
    chk("미리보기: 이전 대상은 부팀장 B", [o["successor"] for o in pv["owned"] if o["action"] == "transfer"] == ["비비"], pv["owned"])
    chk("미리보기: 건수 (참여 1·글 1·댓글 1·실행 2·팔로잉 1·팔로워 1)", (pv["member_of"], pv["posts"], pv["comments"], pv["runs"], pv["following"], pv["followers"]) == (1, 1, 1, 2, 1, 1), pv)
    chk("미리보기만으로는 아무것도 바뀌지 않음", cnt("select count(*) from projects where owner_id=?", a) == 2 and cnt("select is_active from users where id=?", a) == 1)
    s, _ = api("GET", "/api/account/withdraw/preview"); chk("로그인 없이는 미리보기 불가", s == 401, s)
    s, pv_s = api("GET", "/api/account/withdraw/preview", "super"); chk("최고관리자는 미리보기에 차단 안내", pv_s.get("blocked"), pv_s)

    # ---- 검증 (서버가 직접 확인)
    ok = {"agree_terms": True, "agree_data": True, "confirm_text": "탈퇴합니다", "reason": "rare", "reason_text": "테스트 사유"}
    for label, patch in (("약관 동의 없음", {"agree_terms": False}), ("데이터 삭제 동의 없음", {"agree_data": False}), ("확인 문구 틀림", {"confirm_text": "탈퇴"}), ("확인 문구 비어 있음", {"confirm_text": ""})):
        s, r = api("POST", "/api/account/withdraw", "A", {**ok, **patch}); chk(f"탈퇴 거부: {label}", s == 400, (s, r))
    chk("거부된 요청은 아무것도 바꾸지 않음", cnt("select is_active from users where id=?", a) == 1 and cnt("select count(*) from withdrawal_logs") == 0)
    s, r = api("POST", "/api/account/withdraw", "super", ok); chk("최고관리자(ADMIN_EMAILS)는 탈퇴 불가(403)", s == 403 and "ADMIN_EMAILS" in r["detail"], r)
    s, _ = api("POST", "/api/account/withdraw", None, ok); chk("로그인 없이 탈퇴 불가", s == 401, s)

    # ---- 탈퇴
    s, r = api("POST", "/api/account/withdraw", "A", ok); chk("탈퇴 성공", s == 200 and r["ok"] and r["keep_days"] == 7, r)
    sm = r.get("summary", {})
    chk("처리 요약: 프로젝트 1 삭제 · 1 팀장 이전 · 참여 프로젝트 1에서 나감 · 글/댓글/실행 정리", (sm.get("projects_deleted"), sm.get("projects_transferred"), sm.get("left_projects"), sm.get("posts"), sm.get("comments"), sm.get("runs")) == (1, 1, 1, 1, 1, 2), sm)
    s, _ = api("GET", "/api/auth/me", "A"); chk("탈퇴한 계정의 로그인 토큰은 즉시 무효(401)", s == 401, s)
    s, _ = api("POST", "/api/account/withdraw", "A", ok); chk("같은 계정으로 다시 탈퇴 요청도 401", s == 401, s)
    u = c.execute("select email,username,hashed_password,oauth_provider,oauth_id,is_active,is_admin,withdrawn_at,ai_name from users where id=?", (a,)).fetchone()
    chk("계정 행은 남되 개인정보는 모두 비워짐(번호 보존)", u and u[0] == f"withdrawn-{a}@deleted.invalid" and u[1] == "탈퇴한 사용자" and u[2] is None and u[3] is None and u[4] is None and u[5] == 0 and u[7] is not None, u)
    q("insert into users (email,hashed_password,username,oauth_provider,is_active,created_at) values ('new-user@example.com','','새 사람','google',1,?)", now)
    new_id = c.execute("select id from users where email='new-user@example.com'").fetchone()[0]
    chk("새 가입자는 탈퇴한 번호를 물려받지 않음", new_id != a and new_id > a, (a, new_id))
    q("insert into users (email,hashed_password,username,oauth_provider,is_active,created_at) values ('alice.kim@example.com','','앨리스 재가입','google',1,?)", now)
    chk("같은 이메일로 다시 가입은 가능(새 계정)", cnt("select count(*) from users where email='alice.kim@example.com'") == 1)
    # 프로젝트
    p1 = c.execute("select owner_id from projects where id=?", (P["P1"],)).fetchone()
    chk("함께 하는 프로젝트는 남고 팀장이 부팀장 B 로 넘어감", p1 and p1[0] == U["B"], p1)
    mem = sorted(r[0] for r in c.execute("select user_id from project_members where project_id=?", (P["P1"],)))
    chk("팀장이 된 B 의 멤버 행은 정리되고 C 는 그대로, 탈퇴한 A 는 없음", mem == [U["C"]], mem)
    chk("남은 프로젝트의 파일·채팅·회의록·일정은 팀에 남음", cnt("select count(*) from project_files where project_id=?", P["P1"]) == 1 and cnt("select count(*) from chat_messages where project_id=?", P["P1"]) == 1
        and cnt("select count(*) from meeting_docs where project_id=?", P["P1"]) == 1 and cnt("select count(*) from calendar_events where project_id=? and kind='shared'", P["P1"]) == 1)
    chk("혼자 쓰던 프로젝트는 연결 데이터까지 통째로 삭제(유령 데이터 없음)", cnt("select count(*) from projects where id=?", P["P2"]) == 0 and all(cnt(f"select count(*) from {t} where project_id=?", P["P2"]) == 0 for t in ("project_files", "chat_messages", "project_invitations", "call_rooms", "meeting_docs", "calendar_events", "project_members")))
    chk("남의 프로젝트(P3)에서는 나가기만", cnt("select count(*) from projects where id=?", P["P3"]) == 1 and cnt("select count(*) from project_members where project_id=? and user_id=?", P["P3"], a) == 0)
    chk("내가 만든 초대 링크는 모두 사라짐", cnt("select count(*) from project_invitations where created_by=?", a) == 0)
    s, chat = api("GET", f"/api/projects/{P['P1']}/messages", "C")
    msgs = chat if isinstance(chat, list) else (chat or {}).get("items", [])
    chk("팀 채팅에는 내 메시지가 '탈퇴한 사용자'로 남음", s == 200 and any(m.get("author") == "탈퇴한 사용자" for m in msgs), (s, msgs[:2] if msgs else chat))
    # 개인 데이터
    gone = {"프로필": "select count(*) from user_profiles where user_id=?", "포트폴리오": "select count(*) from portfolio_entries where user_id=?", "알림": "select count(*) from notifications where user_id=?",
            "코드 실행 기록": "select count(*) from submissions where user_id=?", "개인 일정": "select count(*) from calendar_events where user_id=? and kind='private'", "개인 회의록": "select count(*) from meeting_docs where user_id=? and project_id is null",
            "좋아요": "select count(*) from community_likes where user_id=?", "북마크": "select count(*) from community_bookmarks where user_id=?"}
    for label, sql in gone.items(): chk(f"삭제됨: {label}", cnt(sql, a) == 0)
    chk("삭제됨: 팔로우 관계(양쪽)", cnt("select count(*) from follows where follower_id=? or followee_id=?", a, a) == 0)
    po = c.execute("select title,body,is_deleted from community_posts where id=?", (my_post,)).fetchone(); chk("내 글은 내용이 비워지고 삭제 처리", po == ("(삭제된 글)", "", 1), po)
    co = c.execute("select body,is_deleted from community_comments where user_id=?", (a,)).fetchone(); chk("내 댓글은 내용이 비워지고 삭제 처리", co == ("", 1), co)
    xr = c.execute("select like_count,comment_count,bookmark_count from community_posts where id=?", (xp,)).fetchone(); chk("남의 글의 좋아요·댓글·북마크 숫자에서 내 몫이 빠짐", xr == (0, 0, 0), xr)
    chk("팀장을 이어받은 B 에게 알림이 감", cnt("select count(*) from notifications where user_id=? and title='팀장이 바뀌었어요'", U["B"]) == 1)
    lg = c.execute("select email_masked,username,provider,expires_at,withdrawn_at,reason,reason_text,by,summary from withdrawal_logs").fetchall()
    chk("탈퇴 기록 1건: 이메일은 가려져서 저장, 사유·처리 내용 포함", len(lg) == 1 and lg[0][0] == "a***m@example.com" and lg[0][1] == "앨리스" and lg[0][5] == "rare" and lg[0][7] == "self" and '"projects_deleted": 1' in lg[0][8], lg)
    exp = datetime.datetime.fromisoformat(lg[0][3]); chk("보관 기간은 정확히 7일", 6.99 < (exp - NOW).total_seconds() / 86400 < 7.01, lg[0][3])
    chk("탈퇴 기록에 원래 이메일 전체가 남지 않음", "alice.kim@" not in json.dumps(lg, ensure_ascii=False))

    # ---- 관리자 화면 (관리자 코드 확인 후)
    s, r = api("POST", "/api/admin/gate/setup", "super", {"code": "482913"}); G["super"] = r["token"]
    s, wl = api("GET", "/api/admin/withdrawals", "super"); it = (wl.get("items") or [None])[0]
    chk("관리자: 탈퇴 기록 목록(가린 이메일 · 남은 7일 · 사유 · 처리 내용)", s == 200 and it and it["email"] == "a***m@example.com" and it["days_left"] == 7 and it["reason"] == "자주 쓰지 않아요" and it["summary"]["projects_deleted"] == 1 and it["by"] == "self", wl)
    s, ul = api("GET", "/api/admin/users?q=alice", "super"); chk("관리자 사용자 목록에서 탈퇴한 빈 계정은 보이지 않고, 재가입 계정만 보임", s == 200 and ul["total"] == 1 and ul["items"][0]["username"] == "앨리스 재가입", ul)
    s, ul = api("GET", "/api/admin/users?q=withdrawn", "super"); chk("'withdrawn-…' 빈 이메일로도 검색되지 않음", ul["total"] == 0, ul)
    s, _ = api("GET", f"/api/admin/users/{a}", "super"); chk("탈퇴한 계정 상세는 404", s == 404, s)
    s, ov = api("GET", "/api/admin/overview", "super"); chk("대시보드: 최근 7일 탈퇴 1명, 사용자 수에는 빈 계정 제외", ov["users"]["withdrawn_7d"] == 1 and ov["users"]["total"] == 8 - 1, ov["users"])
    s, _ = api("GET", "/api/admin/withdrawals", "A"); chk("일반(탈퇴한) 계정은 관리자 기록을 못 봄", s in (401, 403), s)
    s, _ = api("GET", "/api/admin/withdrawals", "B"); chk("일반 사용자는 탈퇴 기록을 못 봄(403)", s == 403, s)
    # 7일이 지나면 자동 삭제
    q("update withdrawal_logs set expires_at=?", (NOW - datetime.timedelta(minutes=1)).isoformat(sep=" "))
    s, wl2 = api("GET", "/api/admin/withdrawals", "super"); chk("7일이 지난 기록은 목록을 열 때 자동으로 지워짐", wl2["total"] == 0 and cnt("select count(*) from withdrawal_logs") == 0, wl2)
    chk("기록이 지워져도 빈 계정 행(번호 보존)은 남음", cnt("select count(*) from users where id=?", a) == 1)

    # ---- 관리자의 계정 삭제 (유령 게스트 계정 정리)
    s, r = api("POST", f"/api/admin/users/{U['G']}/delete", "super", {"reason": "유령 게스트"}); chk("관리자가 유령 게스트 계정을 삭제", s == 200 and r["ok"], r)
    g = c.execute("select email,is_active,withdrawn_at from users where id=?", (U["G"],)).fetchone(); chk("게스트 계정도 빈 계정으로 정리됨", g[0].startswith("withdrawn-") and g[1] == 0 and g[2] is not None, g)
    s, wl3 = api("GET", "/api/admin/withdrawals", "super"); gi = wl3["items"][0] if wl3["items"] else {}
    chk("관리자 삭제도 탈퇴 기록에 남음(방식 admin · 게스트 계정 표시)", gi.get("by") == "admin" and gi.get("email") == "게스트 계정" and gi.get("reason_text") == "유령 게스트", gi)
    s, _ = api("POST", f"/api/admin/users/{U['G']}/delete", "super", {}); chk("이미 삭제한 계정은 다시 삭제 불가(404)", s == 404, s)
    s, _ = api("POST", f"/api/admin/users/{U['super']}/delete", "super", {}); chk("최고관리자·내 계정은 삭제 불가", s in (400, 403), s)
    s, _ = api("POST", f"/api/admin/users/{U['X']}/delete", "B", {}); chk("일반 사용자는 관리자 삭제 불가", s == 403, s)
    s, au = api("GET", "/api/admin/audit?q=delete", "super"); chk("감사 로그에 계정 삭제가 남음", any(x["action"] == "user.delete" for x in au["items"]), au)

    # ---- 본인 탈퇴: 게스트(초대 링크 계정)도 가능, 마지막 한 명 남은 프로젝트의 팀원 보호
    q("insert into projects (owner_id,title,created_at) values (?,?,?)", U["X"], "엑스의 두번째", now); p4 = c.execute("select max(id) from projects").fetchone()[0]
    q("insert into project_members (project_id,user_id,role,created_at) values (?,?,?,?)", p4, U["C"], "member", now)
    s, r = api("POST", "/api/account/withdraw", "X", ok); chk("팀원이 있는 팀장(X)이 탈퇴 → 팀장 이전, 프로젝트 보존", s == 200 and r["summary"]["projects_transferred"] >= 1, r)
    chk("두번째 프로젝트 팀장이 C 로 넘어감", c.execute("select owner_id from projects where id=?", (p4,)).fetchone()[0] == U["C"])
finally:
    srv.terminate()
    try: srv.wait(10)
    except Exception: srv.kill()
    c.close()
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
bad = [r for r in R if not r[1]]
for n, okk, ex in R:
    if not okk: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
