"""파이썬 '한 줄씩 실행(디버거)' 하네스.

서버가 사용자 코드를 이 파일로 감싸서 실행한다:  python -u -B dbg_py_harness.py <EVT_FD> <CMD_FD> <파일이름> <중단점 JSON>
- 사용자 코드는 표준 라이브러리 bdb 위에서 돈다. 멈출 때마다 줄 번호·변수·호출 순서를 EVT_FD 로 한 줄(JSON)씩 서버에 알리고,
  CMD_FD 로 오는 명령(continue / next / step / out / breakpoints / stop)을 기다린다.
- 프로그램의 표준 입출력(input() · print)은 건드리지 않는다 → 디버그 중에도 입력이 평소처럼 된다.
- 이 파일은 사용자 코드를 돌리는 샌드박스 프로세스 안에서만 실행된다 (서버 프로세스에서 import 하지 않는다).
"""
import bdb
import json
import os
import reprlib
import sys
import traceback
import types


def main() -> None:
    evt_fd, cmd_fd = int(sys.argv[1]), int(sys.argv[2])
    fname = sys.argv[3]
    try:
        bps = [int(x) for x in json.loads(sys.argv[4] if len(sys.argv) > 4 else "[]")]
    except Exception:
        bps = []
    evt = os.fdopen(evt_fd, "w", encoding="utf-8", buffering=1)
    cmd = os.fdopen(cmd_fd, "r", encoding="utf-8")

    def send(obj) -> None:
        try:
            evt.write(json.dumps(obj, ensure_ascii=False) + "\n")
            evt.flush()
        except Exception:
            os._exit(0)

    # 사용자 코드가 harness 가 있는 폴더의 모듈을 잘못 불러오지 않게, 현재 폴더를 먼저 본다
    sys.path[0] = os.getcwd()
    try:
        with open(fname, "r", encoding="utf-8") as fh:
            src = fh.read()
    except OSError as e:
        sys.stderr.write("파일을 열 수 없어요: %s\n" % e)
        sys.exit(1)

    short = reprlib.Repr()
    short.maxlevel = 2; short.maxlist = 12; short.maxtuple = 12; short.maxdict = 10; short.maxset = 12
    short.maxstring = 80; short.maxother = 80; short.maxlong = 40

    HIDE = (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, types.MethodType, type)

    def one(name, value, scope):
        try:
            text = short.repr(value)
        except Exception:
            text = "<표시할 수 없어요>"
        return {"n": name, "t": type(value).__name__, "v": text[:200], "s": scope}

    def collect(frame):
        out = []
        is_module = frame.f_code.co_name == "<module>"
        try:
            for k, v in list(frame.f_locals.items())[:200]:
                if k.startswith("__") or isinstance(v, HIDE):
                    continue
                out.append(one(k, v, "전역" if is_module else "지역"))
                if len(out) >= 60:
                    break
            if not is_module:
                g = 0
                for k, v in list(frame.f_globals.items())[:300]:
                    if k.startswith("__") or isinstance(v, HIDE) or k in frame.f_locals:
                        continue
                    out.append(one(k, v, "전역"))
                    g += 1
                    if g >= 30:
                        break
        except Exception:
            pass
        return out

    def stack_of(frame):
        res, f = [], frame
        while f is not None and len(res) < 30:
            if f.f_code.co_filename == fname:
                name = f.f_code.co_name
                res.append({"f": "(모듈)" if name == "<module>" else name, "l": f.f_lineno})
            f = f.f_back
        return res

    class Dbg(bdb.Bdb):
        def __init__(self):
            super().__init__()
            self.first = True
            self.user_bps = set(bps)

        def stop_here(self, frame):
            if frame.f_code.co_filename != fname:
                return False
            return super().stop_here(frame)

        def break_here(self, frame):
            if frame.f_code.co_filename != fname:
                return False
            return super().break_here(frame)

        def apply_breaks(self, lines):
            self.clear_all_breaks()
            self.user_bps = set()
            for ln in lines:
                try:
                    if self.set_break(fname, int(ln)) is None:
                        self.user_bps.add(int(ln))
                except Exception:
                    pass

        def user_line(self, frame):
            if self.first:
                self.first = False
                # 중단점이 있으면 첫 줄에서 멈추지 않고 중단점까지 바로 달린다 (없으면 첫 줄에서 멈춰 한 줄씩 볼 수 있게)
                if self.user_bps and frame.f_lineno not in self.user_bps:
                    self.set_continue()
                    return
            self.pause(frame, "breakpoint" if frame.f_lineno in self.user_bps else "step")

        def user_exception(self, frame, exc_info):
            # 처리되지 않은 예외가 나려는 순간에 멈춰서 변수를 볼 수 있게 한다 (한 줄씩 실행 중일 때만)
            pass

        def pause(self, frame, reason):
            send({"ev": "paused", "reason": reason, "line": frame.f_lineno, "func": "(모듈)" if frame.f_code.co_name == "<module>" else frame.f_code.co_name,
                  "vars": collect(frame), "stack": stack_of(frame)})
            while True:
                line = cmd.readline()
                if not line:
                    os._exit(0)                       # 서버와 연결이 끊김 → 조용히 끝낸다
                try:
                    c = json.loads(line)
                except Exception:
                    continue
                op = c.get("cmd")
                if op == "breakpoints":
                    self.apply_breaks(c.get("lines") or [])
                    continue
                if op == "continue":
                    send({"ev": "running"}); self.set_continue(); return
                if op == "next":
                    send({"ev": "running"}); self.set_next(frame); return
                if op == "step":
                    send({"ev": "running"}); self.set_step(); return
                if op == "out":
                    send({"ev": "running"}); self.set_return(frame); return
                if op == "stop":
                    os._exit(0)

    d = Dbg()
    d.apply_breaks(bps)
    sys.argv = [fname]
    g = {"__name__": "__main__", "__file__": fname, "__builtins__": __builtins__, "__doc__": None}
    send({"ev": "ready"})
    try:
        code = compile(src, fname, "exec")
    except SyntaxError:
        traceback.print_exc(limit=0)
        sys.exit(1)
    try:
        d.run(code, g, g)
    except SystemExit as e:
        raise
    except BaseException:
        et, ev, tb = sys.exc_info()
        while tb is not None and tb.tb_frame.f_code.co_filename != fname:       # 하네스·bdb 쪽 줄은 보여 주지 않는다 (평소 실행과 같은 모양의 트레이스백)
            tb = tb.tb_next
        traceback.print_exception(et, ev, tb)
        sys.exit(1)


if __name__ == "__main__":
    main()
