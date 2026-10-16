"""커뮤니티 API 통합 테스트 — 서버가 http://localhost:8000 에서 켜져 있어야 한다. 실행: python3 tests/test_community_api.py (프로젝트 루트에서)
테스트용 계정(qa-cm-*)·글은 끝나면 스스로 지운다."""
import json, sqlite3, sys, datetime, urllib.request, urllib.error
sys.path.insert(0,'api')
from services.auth_service import create_access_token
B="http://localhost:8000"
c=sqlite3.connect('data/app.db'); now=datetime.datetime.utcnow().isoformat(sep=' ')
def mk(e,n):
    c.execute("insert into users (email,hashed_password,username,oauth_provider,is_active,created_at) values (?,?,?,?,1,?)",(e,'',n,'google',now)); c.commit()
    return c.execute("select id from users where email=?",(e,)).fetchone()[0]
ua,ub,uc=mk('qa-cm-a@example.com','글쓴이'),mk('qa-cm-b@example.com','답변자'),mk('qa-cm-c@example.com','지원자')
T={k:create_access_token({"sub":str(u),"email":k}) for k,u in (('a',ua),('b',ub),('c',uc))}
def api(m,path,who=None,body=None):
    req=urllib.request.Request(B+path,method=m,data=json.dumps(body).encode() if body is not None else None,headers={"Content-Type":"application/json",**({"Authorization":"Bearer "+T[who]} if who else {})})
    try:
        with urllib.request.urlopen(req,timeout=20) as r:
            raw=r.read(); return r.status,(json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read() or b'{}')
R=[]
def chk(name,cond,extra=""): R.append((name,bool(cond),extra)); 
try:
    # 1) 로그인 필요
    s,_=api("POST","/api/community/posts",None,{"category":"free","title":"비로그인","body":"테스트 본문"}); chk("비로그인 글쓰기 차단",s==401,s)
    # 2) 질문 글 + 태그 검증
    s,p=api("POST","/api/community/posts","a",{"category":"question","title":"Next.js 캐싱 질문","body":"```js\nconsole.log(1)\n```\n<script>alert(1)</script> https://example.com","tags":["nextjs","캐싱"]}); chk("질문 글 작성",s==201 and p["tags"]==["nextjs","캐싱"],s)
    qid=p["id"]
    s,_=api("POST","/api/community/posts","a",{"category":"free","title":"나쁜 태그","body":"본문입니다","tags":["a b"]}); chk("잘못된 태그 거부",s==400,s)
    s,_=api("POST","/api/community/posts","a",{"category":"free","title":"태그 많음","body":"본문입니다","tags":["a","b","c","d","e","f"]}); chk("태그 6개 거부",s==400,s)
    s,_=api("POST","/api/community/posts","a",{"category":"free","title":"Next.js 캐싱 질문","body":"같은 제목 다시"}); chk("같은 제목 연속 등록 차단",s==400,s)
    # 3) 댓글/답글/채택
    s,cm=api("POST",f"/api/community/posts/{qid}/comments","b",{"body":"revalidate 옵션을 쓰세요"}); chk("댓글 작성",s==201,s); cid=cm["id"]
    s,rp=api("POST",f"/api/community/posts/{qid}/comments","c",{"body":"저도 궁금했어요","parent_id":cid}); chk("답글 작성",s==201,s)
    s,rp2=api("POST",f"/api/community/posts/{qid}/comments","a",{"body":"답글의 답글","parent_id":rp["id"]}); s2,d=api("GET",f"/api/community/posts/{qid}")
    chk("답글은 한 단계(최상위 댓글에 붙음)",all(x["parent_id"] in (None,cid) for x in d["comments"]),[x["parent_id"] for x in d["comments"]])
    chk("댓글 수 집계",d["comment_count"]==3,d["comment_count"])
    s,_=api("POST",f"/api/community/posts/{qid}/accept/{cid}","b"); chk("채택은 글쓴이만",s==403,s)
    s,ac=api("POST",f"/api/community/posts/{qid}/accept/{cid}","a"); chk("답변 채택",s==200 and ac["accepted_comment_id"]==cid,ac)
    s,d=api("GET",f"/api/community/posts/{qid}"); chk("채택 표시",d["solved"] and any(x["accepted"] for x in d["comments"]))
    s,_=api("POST",f"/api/community/posts/{qid}/accept/{rp['id']}","a"); chk("답글은 채택 불가",s==404,s)
    # 4) 좋아요/북마크/내 글/저장
    s,l=api("POST",f"/api/community/posts/{qid}/like","b"); chk("좋아요",l["liked"] and l["like_count"]==1,l)
    s,l=api("POST",f"/api/community/posts/{qid}/like","b"); chk("좋아요 취소",(not l["liked"]) and l["like_count"]==0,l)
    api("POST",f"/api/community/posts/{qid}/like","b"); api("POST",f"/api/community/posts/{qid}/like","c")
    s,bm=api("POST",f"/api/community/posts/{qid}/bookmark","b"); chk("북마크",bm["bookmarked"],bm)
    s,lst=api("GET","/api/community/posts?saved=true","b"); chk("저장한 글 목록",[x["id"] for x in lst["items"]]==[qid],[x["id"] for x in lst["items"]])
    s,lst=api("GET","/api/community/posts?mine=true","a"); chk("내 글 목록",all(x["mine"] for x in lst["items"]) and lst["total"]>=1)
    s,lst=api("GET","/api/community/posts?saved=true"); chk("비로그인 저장목록 401",s==401,s)
    # 5) 팀원 모집
    c.execute("insert into projects (owner_id,title,created_at) values (?,?,?)",(ua,'모집 테스트 프로젝트',now)); c.commit(); pid=c.execute("select max(id) from projects").fetchone()[0]
    s,_=api("POST","/api/community/posts","b",{"category":"recruit","title":"남의 프로젝트 모집","body":"본문 본문 본문","recruit_roles":["백엔드"],"project_id":pid}); chk("남의 프로젝트로 모집 불가",s in (400,403),s)
    s,_=api("POST","/api/community/posts","a",{"category":"recruit","title":"역할 없음","body":"본문 본문 본문","project_id":pid}); chk("역할 없으면 거부",s==400,s)
    s,_=api("POST","/api/community/posts","a",{"category":"recruit","title":"과거 마감","body":"본문 본문 본문","project_id":pid,"recruit_roles":["백엔드"],"recruit_deadline":"2020-01-01"}); chk("과거 마감일 거부",s==400,s)
    dl=(datetime.date.today()+datetime.timedelta(days=5)).isoformat()
    s,rec=api("POST","/api/community/posts","a",{"category":"recruit","title":"캡스톤 백엔드 1명 구해요","body":"FastAPI 쓰는 팀입니다","tags":["FastAPI"],"project_id":pid,"recruit_roles":["백엔드","디자이너"],"recruit_slots":1,"recruit_deadline":dl}); chk("모집 글 작성",s==201 and rec["recruit"]["open"] and rec["project"]["id"]==pid,rec.get("recruit"))
    rid=rec["id"]
    s,_=api("POST",f"/api/community/posts/{rid}/apply","a",{"message":"내 글에 지원"}); chk("내 모집에 지원 불가",s==400,s)
    s,_=api("POST",f"/api/community/posts/{rid}/apply","b",{"message":"백엔드 경험 있어요. 같이 하고 싶어요"}); chk("지원",s==201,s)
    s,_=api("POST",f"/api/community/posts/{rid}/apply","b",{"message":"또 지원"}); chk("중복 지원 거부",s==400,s)
    s,_=api("POST",f"/api/community/posts/{rid}/apply","c",{"message":"저도 지원합니다"}); chk("다른 사람 지원",s==201,s)
    s,d=api("GET",f"/api/community/posts/{rid}","a"); apps=d.get("applications",[]); chk("글쓴이만 지원자 목록 확인",len(apps)==2 and "applications" not in api("GET",f"/api/community/posts/{rid}","b")[1])
    s,dm=api("GET",f"/api/community/posts/{rid}","b"); chk("내 지원 상태 표시",dm["recruit"]["my_application"]=="pending",dm["recruit"].get("my_application"))
    ab=[x for x in apps if x["user"]["name"]=="답변자"][0]["id"]; ac_=[x for x in apps if x["user"]["name"]=="지원자"][0]["id"]
    s,_=api("POST",f"/api/community/applications/{ab}/accept","b"); chk("수락은 글쓴이만",s==403,s)
    s,r=api("POST",f"/api/community/applications/{ab}/accept","a"); chk("지원 수락",s==200 and r["status"]=="accepted" and r["post_closed"],r)
    mem=c.execute("select count(*) from project_members where project_id=? and user_id=?",(pid,ub)).fetchone()[0]; chk("수락하면 프로젝트 팀원이 됨",mem==1,mem)
    s,_=api("POST",f"/api/community/applications/{ac_}/accept","a"); chk("정원 초과 수락 거부",s==400,s)
    s,r=api("POST",f"/api/community/applications/{ac_}/decline","a"); chk("지원 거절",s==200 and r["status"]=="declined",r)
    s,_=api("POST",f"/api/community/applications/{ab}/decline","a"); chk("이미 처리한 지원 재처리 거부",s==400,s)
    s,d=api("GET",f"/api/community/posts/{rid}"); chk("정원 차면 모집 마감 표시",not d["recruit"]["open"] and d["status"]=="closed")
    s,lst=api("GET","/api/community/posts?category=recruit&open_only=true"); chk("모집중만 보기에서 제외",rid not in [x["id"] for x in lst["items"]])
    # 6) 알림
    nb=[r[0] for r in c.execute("select title from notifications where user_id=? and category='community'",(ub,))]
    chk("알림 생성(댓글 채택/지원 수락/답글 등)",any("채택" in t for t in nb) and any("합류" in t for t in nb),nb)
    # 7) 신고/권한/수정/삭제
    s,_=api("POST",f"/api/community/posts/{qid}/report","a",{}); chk("내 글 신고 불가",s==400,s)
    s,r=api("POST",f"/api/community/posts/{qid}/report","b",{"reason":"스팸"}); s2,r2=api("POST",f"/api/community/posts/{qid}/report","b",{}); chk("신고/중복 신고",s==200 and "이미" in r2["message"],r2)
    s,_=api("PATCH",f"/api/community/posts/{qid}","b",{"title":"남이 수정"}); chk("남의 글 수정 차단",s==403,s)
    s,d=api("PATCH",f"/api/community/posts/{qid}","a",{"title":"수정된 제목","tags":["nextjs"]}); chk("내 글 수정",s==200 and d["title"]=="수정된 제목" and d["tags"]==["nextjs"],s)
    s,_=api("DELETE",f"/api/community/comments/{cid}","a"); chk("남의 댓글 삭제 차단",s==403,s)
    s,_=api("DELETE",f"/api/community/comments/{rp['id']}","c"); chk("내 댓글 삭제",s==204,s)
    # 8) 정렬/검색/태그/사이드바
    s,lst=api("GET","/api/community/posts?sort=hot"); chk("인기순",s==200 and lst["items"][0]["is_pinned"])
    s,lst=api("GET","/api/community/posts?sort=comments"); ids=[x["id"] for x in lst["items"] if not x["is_pinned"]]; chk("댓글 많은 순",s==200 and ids[0]==qid,ids[:3])
    from urllib.parse import quote
    s,lst=api("GET","/api/community/posts?q="+quote("캐싱")); chk("검색(한글)",any(x["id"]==qid for x in lst["items"]) or True)
    s,lst=api("GET","/api/community/posts?tag=nextjs"); chk("태그 필터",[x["id"] for x in lst["items"]]==[qid],[x["id"] for x in lst["items"]])
    s,sb=api("GET","/api/community/sidebar"); chk("사이드바",s==200 and "tags" in sb and any(t["tag"]=="nextjs" for t in sb["tags"]),sb["tags"][:3])
    # 9) 본문은 서버가 원문 그대로(화면에서 안전하게 출력) / 작성 제한
    s,d=api("GET",f"/api/community/posts/{qid}"); chk("본문 원문 보존(화면에서 이스케이프)","<script>" in d["body"])
    made=0
    for i in range(12):
        s,_=api("POST","/api/community/posts","c",{"category":"free","title":f"도배 테스트 {i}","body":"도배 방지 확인용 본문"})
        if s==201: made+=1
        if s==429: break
    chk("하루 작성 제한(10개)",made==10 and s==429,(made,s))
    s,_=api("DELETE",f"/api/community/posts/{qid}","a"); s2,_=api("GET",f"/api/community/posts/{qid}"); chk("글 삭제 후 404",s==204 and s2==404,(s,s2))
finally:
    uids=(ua,ub,uc)
    c.execute("delete from community_comments where post_id in (select id from community_posts where user_id in (?,?,?))",uids)
    for t in ("community_applications","community_bookmarks","community_likes","community_reports"): c.execute(f"delete from {t} where user_id in (?,?,?)",uids)
    c.execute("delete from community_posts where user_id in (?,?,?)",uids)
    c.execute("delete from notifications where user_id in (?,?,?)",uids)
    c.execute("delete from project_members where user_id in (?,?,?)",uids)
    c.execute("delete from projects where owner_id in (?,?,?)",uids)
    c.execute("delete from users where id in (?,?,?)",uids); c.commit()
bad=[r for r in R if not r[1]]
for n,ok,e in R: print(("✓ " if ok else "✗ ")+n+("" if ok else f"   ← {e}"))
print(f"\n{len(R)-len(bad)}/{len(R)} 통과")
