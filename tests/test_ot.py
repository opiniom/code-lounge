"""글자 단위 동시 편집(OT) 계산 검사 — api/services/ot.py 와 frontend/js/pages/workspace-live.js 의 변환 규칙이 같은지, 어떤 순서로 적용해도 결과가 같은지 무작위로 수만 번 확인한다.
실행: .venv/bin/python tests/test_ot.py  (프로젝트 루트에서. Node 가 있으면 자바스크립트 쪽도 같이 검사)"""
import json, os, random, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api"))
from services import ot

ALPHA = ["a", "b", "c", "\n", " ", "한", "😀", "é"]
def rnd_text(r, n): return "".join(r.choice(ALPHA) for _ in range(n))
def rnd_ops(r, doc_len, k):
    """문서 길이 doc_len 에 유효한 연산 목록 k 개 (앞 연산을 적용한 뒤 길이를 따라가며 만든다)"""
    ops, n = [], doc_len
    for _ in range(k):
        if n > 0 and r.random() < 0.45:
            p = r.randint(0, n - 1); c = r.randint(1, min(4, n - p)); ops.append((1, p, c)); n -= c
        else:
            s = rnd_text(r, r.randint(1, 4)); p = r.randint(0, n); ops.append((0, p, s)); n += ot.len16(s)
    return ops
def run(text, ops):
    b = ot.to_buf(text); assert ot.apply_ops(b, ops), (text, ops); return ot.buf_text(b)

R = []
def chk(name, ok, extra=""): R.append((name, bool(ok), extra))

r = random.Random(7); bad = None
for i in range(30000):
    base = rnd_text(r, r.randint(0, 12)); n = ot.len16(base)
    A = rnd_ops(r, n, r.randint(1, 4)); B = rnd_ops(r, n, r.randint(1, 4))
    a_first = r.random() < 0.5
    A2, B2 = ot.xform_lists(A, B, a_first)
    left = run(run(base, A), B2); right = run(run(base, B), A2)
    if left != right: bad = (base, A, B, a_first, left, right); break
chk("두 사람이 동시에 고쳐도 어떤 순서로 적용하든 결과가 같다 (무작위 3만 번)", bad is None, bad)

# 서버 1대 + 클라이언트 3대 시뮬레이션: 서버가 순서를 정하고, 클라이언트는 내 편집을 보내 놓고 남의 편집을 변환해서 적용 (실제 프로토콜과 같은 방식)
class Client:
    def __init__(s, text): s.doc = ot.to_buf(text); s.rev = 0; s.infl = None; s.buf = []; s.inbox = []
    def local(s, ops):
        assert ot.apply_ops(s.doc, ops); s.buf += ops
    def pump_send(s, server):
        if s.infl is None and s.buf: s.infl, s.buf = s.buf, []; server.inbox.append((s, s.rev, s.infl))
    def receive(s, who, rev, ops):
        if who is s:
            s.rev = rev; s.infl = None
        else:
            R1, ni = ot.xform_lists(ops, s.infl or [], True); s.infl = ni if s.infl is not None else None; R2, s.buf = ot.xform_lists(R1, s.buf, True)
            assert ot.apply_ops(s.doc, R2); s.rev = rev
class Server:
    def __init__(s, text): s.doc = ot.to_buf(text); s.hist = []; s.inbox = []
def simulate(seed):
    r = random.Random(seed); base = rnd_text(r, r.randint(0, 10)); srv = Server(base); cl = [Client(base) for _ in range(3)]
    for step in range(60):
        c = r.choice(cl); k = r.random()
        if k < 0.5: c.local(rnd_ops(r, len(c.doc) // 2, r.randint(1, 3)))
        elif k < 0.7: c.pump_send(srv)
        elif srv.inbox and k < 0.85:
            who, rev, ops = srv.inbox.pop(0); t = ops
            for h in srv.hist[rev:]: t, _ = ot.xform_lists(t, h, False)
            assert ot.apply_ops(srv.doc, t); srv.hist.append(t); r_ = len(srv.hist)
            for x in cl: x.inbox.append((who, r_, t))
        else:
            x = r.choice(cl)
            if x.inbox: who, rv, t = x.inbox.pop(0); x.receive(who, rv, t if who is not x else None)
    # 마무리: 모두 비운다
    for _ in range(500):
        moved = False
        for c in cl:
            if c.inbox: who, rv, t = c.inbox.pop(0); c.receive(who, rv, t if who is not c else None); moved = True
            c.pump_send(srv)
        if srv.inbox:
            who, rev, ops = srv.inbox.pop(0); t = ops
            for h in srv.hist[rev:]: t, _ = ot.xform_lists(t, h, False)
            assert ot.apply_ops(srv.doc, t); srv.hist.append(t); r_ = len(srv.hist)
            for x in cl: x.inbox.append((who, r_, t))
            moved = True
        if not moved: break
    return srv, cl
bad = None
for seed in range(1500):
    srv, cl = simulate(seed)
    texts = {ot.buf_text(c.doc) for c in cl} | {ot.buf_text(srv.doc)}
    if len(texts) != 1 or any(c.infl or c.buf for c in cl): bad = (seed, texts); break
chk("서버 1 + 접속자 3 이 마구 입력해도 모두 같은 문서로 끝난다 (1500판)", bad is None, bad)

chk("형식이 이상한 연산은 거부", all(ot.parse_ops(x) is None for x in ([], [[2, 0, 1]], [[0, -1, "a"]], [[0, 0, ""]], [[1, 0, 0]], [[0, 0]], "x", [[0, True, "a"]], [[1, 1.5, 1]])), "")
chk("글자 수는 자바스크립트와 같은 기준(이모지 2)", ot.len16("😀") == 2 and ot.len16("한") == 1 and ot.len16("a😀") == 3, "")

# 자바스크립트 쪽 규칙이 파이썬과 똑같은지 (같은 무작위 판을 Node 로도 돌려 결과를 비교)
node = shutil.which("node"); js = os.path.join(ROOT, "frontend", "js", "pages", "workspace-live.js")
if node and os.path.exists(js):
    r = random.Random(11); cases = []
    for i in range(4000):
        base = rnd_text(r, r.randint(0, 10)); n = ot.len16(base); A = rnd_ops(r, n, r.randint(1, 4)); B = rnd_ops(r, n, r.randint(1, 4)); f = r.random() < 0.5
        A2, B2 = ot.xform_lists(A, B, f)
        cases.append({"base": base, "A": [list(o) for o in A], "B": [list(o) for o in B], "f": f, "A2": [list(o) for o in A2], "B2": [list(o) for o in B2]})
    runner = os.path.join(ROOT, "data", "_ot_js_runner.js")
    with open(runner, "w", encoding="utf-8") as fh:
        fh.write("const vm=require('vm'),fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');const ctx={window:{},console};vm.createContext(ctx);vm.runInContext(src+'\\n;this.__ot=(typeof WSOT!==\"undefined\")?WSOT:null;',ctx);\n"
                 "const O=ctx.__ot;if(!O){console.log('NOOT');process.exit(2)}const cases=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));let bad=0,first=null;\n"
                 "for(const c of cases){const [A2,B2]=O.xformLists(c.A,c.B,c.f);if(JSON.stringify(A2)!==JSON.stringify(c.A2)||JSON.stringify(B2)!==JSON.stringify(c.B2)){bad++;if(!first)first=c}\n"
                 "let d=c.base;const ap=(s,ops)=>{for(const o of ops){s=o[0]===0?s.slice(0,o[1])+o[2]+s.slice(o[1]):s.slice(0,o[1])+s.slice(o[1]+o[2])}return s};if(ap(ap(d,c.A),B2)!==ap(ap(d,c.B),A2)){bad++;if(!first)first=c}}\n"
                 "console.log(JSON.stringify({bad,first}));\n")
    cj = os.path.join(ROOT, "data", "_ot_cases.json"); json.dump(cases, open(cj, "w", encoding="utf-8"))
    try:
        out = subprocess.run([node, runner, js, cj], capture_output=True, text=True, timeout=120)
        res = json.loads(out.stdout.strip().splitlines()[-1]) if out.stdout.strip() else {"bad": -1, "first": out.stderr[-300:]}
        chk("자바스크립트 쪽 변환 결과가 파이썬과 완전히 같다 (4000판, 적용 결과도 확인)", res["bad"] == 0, res)
    finally:
        for f in (runner, cj):
            if os.path.exists(f): os.remove(f)
bad = [x for x in R if not x[1]]
for n, ok, ex in R:
    if not ok: print("FAIL:", n, "→", ex)
print(f"{len(R) - len(bad)}/{len(R)} 통과"); sys.exit(1 if bad else 0)
