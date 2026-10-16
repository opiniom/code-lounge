"""워크스페이스 파일 API 테스트 — 임시 DB(data/test_wsfiles.db)·임시 포트(8096)로 서버를 직접 띄우고 끝나면 지운다.
'.../test.txt' 같은 이름이 서버에 거부돼 화면에 유령 파일이 남던 문제와 폴더 처리를 확인한다. 실행: .venv/bin/python tests/test_workspace_files_api.py"""
import json, os, sqlite3, subprocess, sys, time, datetime, urllib.parse, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "test_wsfiles.db"); PORT = 8096; B = f"http://127.0.0.1:{PORT}"
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f): os.remove(f)
env = dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{DB}", EVENT_CRAWL_ENABLED="false", ADMIN_EMAILS="")
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)], cwd=os.path.join(ROOT, "api"), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
sys.path.insert(0, os.path.join(ROOT, "api"))
from services.auth_service import create_access_token
for _ in range(60):
    try: urllib.request.urlopen(B + "/api/auth/config", timeout=1); break
    except Exception: time.sleep(0.5)
c = sqlite3.connect(DB); now = datetime.datetime.utcnow().isoformat(sep=" ")
c.execute("insert into users (email,hashed_password,username,oauth_provider,is_active,created_at) values ('qa-f@example.com','','파일QA','google',1,?)", (now,))
c.execute("insert into projects (owner_id,title,created_at) values (1,'파일 테스트',?)", (now,)); c.commit()
TOK = create_access_token({"sub": "1", "email": "qa-f@example.com"}); PID = 1
def api(m, path, body=None):
    req = urllib.request.Request(B + urllib.parse.quote(path, safe="/?&=:@%"), method=m, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", "Authorization": "Bearer " + TOK})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e: return e.code, (json.loads(e.read() or b"{}"))
R = []
def chk(name, cond, extra=""): R.append((name, bool(cond), extra))
F = f"/api/projects/{PID}/files"
try:
    s, r = api("PUT", F, {"path": ".../test.txt", "content": "x"}); chk("'.../test.txt' 는 이유와 함께 거부(400)", s == 400 and "점" in r["detail"], r)
    for bad in ("../x", "a/../b", "a/./b", "...", "a/b.", "x:y.txt", "q?.txt", "a/ b"):
        s, r = api("PUT", F, {"path": bad, "content": ""}); chk(f"잘못된 이름 거부: {bad!r}", s == 400, (s, r))
    for ok in ("a..b.txt", ".gitignore", "src/util/helper.py", "한글 폴더/파일 이름.md", "v1.2/notes.txt"):
        s, r = api("PUT", F, {"path": ok, "content": "1"}); chk(f"정상 이름 허용: {ok!r}", s == 200 and r["path"] == ok, (s, r))
    s, r = api("PUT", F, {"path": "src//main.py/", "content": "p"}); chk("겹친 슬래시·끝 슬래시는 정리해서 저장", s == 200 and r["path"] == "src/main.py", r)
    # 예전 버전이 남겼을 수 있는 규칙에 안 맞는 이름: 지우기·옮기기가 되어야 한다 ('유령' 방지)
    c.execute("insert into project_files (project_id,path,content,updated_by,created_at,updated_at) values (1,'.../ghost.txt','g',1,?,?)", (now, now))
    c.execute("insert into project_files (project_id,path,content,updated_by,created_at,updated_at) values (1,'x/../old.txt','o',1,?,?)", (now, now)); c.commit()
    s, r = api("POST", F + "/rename", {"from_path": "x/../old.txt", "to_path": "renamed/old.txt"}); chk("규칙에 안 맞는 옛 이름도 올바른 이름으로 옮길 수 있음", s == 200 and r["path"] == "renamed/old.txt", (s, r))
    s, r = api("POST", F + "/rename", {"from_path": "renamed/old.txt", "to_path": "bad/../name.txt"}); chk("옮길 새 이름은 엄격히 검사", s == 400, s)
    s, _ = api("DELETE", F + "?path=" + urllib.parse.quote(".../ghost.txt", safe="")); chk("규칙에 안 맞는 옛 파일도 삭제 가능(204)", s == 204, s)
    n = c.execute("select count(*) from project_files where path='.../ghost.txt'").fetchone()[0]; chk("실제로 지워짐", n == 0)
    # 폴더: .gitkeep 으로 빈 폴더 유지 + 폴더 삭제는 아래 파일 전체
    s, _ = api("PUT", F, {"path": "empty/.gitkeep", "content": ""}); chk("빈 폴더(.gitkeep) 만들기", s == 200, s)
    s, _ = api("PUT", F, {"path": "empty/a.txt", "content": "a"}); s2, _ = api("PUT", F, {"path": "empty/sub/b.txt", "content": "b"})
    s, lst = api("GET", F); paths = [x["path"] for x in lst]; chk("목록에 폴더 안 파일이 모두 보임", "empty/.gitkeep" in paths and "empty/sub/b.txt" in paths)
    s, _ = api("DELETE", F + "?path=empty"); left = [x["path"] for x in api("GET", F)[1] if x["path"].startswith("empty")]; chk("폴더 삭제 = 안의 파일 전체 삭제", s == 204 and left == [], left)
    s, _ = api("DELETE", F + "?path="); chk("빈 경로 삭제는 거부", s in (400, 422), s)
    s, r = api("PUT", F + "/bulk", {"files": [{"path": "imp/ok.py", "content": "1"}, {"path": "imp/../bad.py", "content": "2"}]}); chk("가져오기에 이상한 이름이 섞이면 거부(400)", s == 400, s)
finally:
    srv.terminate()
    try: srv.wait(10)
    except Exception: srv.kill()
    c.close()
    for f in (DB, DB + "-wal", DB + "-shm"):
        if os.path.exists(f): os.remove(f)
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
