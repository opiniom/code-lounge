#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""서버에서 코드 실행용 언어를 나중에 설치/삭제하는 도구 (재빌드·재시작 필요 없음). 관리자 페이지의 '언어 관리'와 같은 기능이다.

  docker compose -f docker-compose.prod.yml exec app install-lang list                 설치 현황(버전 포함)
  docker compose -f docker-compose.prod.yml exec app install-lang available java      설치할 수 있는 버전
  docker compose -f docker-compose.prod.yml exec app install-lang java 21             Java 21 설치 (버전을 여러 개 나란히 둘 수 있어요)
  docker compose -f docker-compose.prod.yml exec app install-lang node                Node.js 최신 LTS
  docker compose -f docker-compose.prod.yml exec app install-lang go | rust | dotnet  Go · Rust · C#(.NET)
  docker compose -f docker-compose.prod.yml exec app install-lang default java 21.0.5 기본 버전 지정
  docker compose -f docker-compose.prod.yml exec app install-lang remove java 17.0.13 삭제

설치한 언어는 LANGS_DIR(기본 /opt/langs, 도커 볼륨 ./langs)에 남고, 서버가 10초 안에 알아본다.
"""
import os
import sys

_here = os.path.dirname(os.path.abspath(__file__))
for cand in (os.path.join(_here, "..", "api"), "/app/api"):
    if os.path.isdir(os.path.join(cand, "services")):
        sys.path.insert(0, os.path.abspath(cand))
        break

from services import lang_install as li  # noqa: E402
from services import lang_registry as reg  # noqa: E402


def say(m=""):
    print(m, flush=True)


def die(m, code=1):
    print("✗ " + m, file=sys.stderr, flush=True)
    sys.exit(code)


def cmd_list():
    say(f"설치 위치: {reg.LANGS_DIR}")
    for rt, m in reg.RUNTIMES.items():
        vs = reg.list_versions(rt)
        say(f"\n{m['label']}  [{rt}]")
        if not vs:
            say(f"   · 설치 안 됨   →  install-lang {rt}")
        for v in vs:
            say(f"   {'●' if v['active'] else '○'} {v['id']:<14} {v['label']}{'   ← 기본 버전' if v['active'] else ''}")
    say("\n(● = 기본 버전)  Python · C · C++ 은 이미지에 포함돼 있고, 재빌드로 갱신해요.")


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        say(__doc__)
        return 0
    cmd = argv[0].lower()
    if cmd == "list":
        cmd_list()
        return 0
    if cmd == "available":
        if len(argv) < 2:
            die("언어를 적어 주세요. 예: install-lang available java")
        try:
            for a in li.available(argv[1].lower()):
                say(f"  {a['version']:<12} {a['label']}")
        except Exception as e:
            die(str(e))
        return 0
    if cmd in ("remove", "default"):
        if len(argv) < 3:
            die(f"사용법: install-lang {cmd} <언어> <버전>   (현황: install-lang list)")
        rt = li.ALIASES.get(argv[1].lower(), argv[1].lower())
        if rt not in reg.RUNTIMES:
            die(f"알 수 없는 언어예요: {argv[1]}")
        if cmd == "remove":
            if not reg.remove_version(rt, argv[2]):
                die("그 버전을 찾지 못했어요. (install-lang list)")
            say(f"✓ {rt} {argv[2]} 를 삭제했어요. 10초 안에 서버가 반영해요.")
        else:
            if not any(v["id"] == argv[2] for v in reg.list_versions(rt)):
                die("그 버전은 설치돼 있지 않아요. (install-lang list)")
            reg.set_default(rt, argv[2])
            say(f"✓ {rt} 기본 버전을 {argv[2]} 로 정했어요.")
        return 0
    name = li.ALIASES.get(cmd, cmd)
    try:
        vid = li.install(name, argv[1] if len(argv) > 1 else None, say)
    except li.InstallError as e:
        die(str(e))
    say(f"\n✓ 설치 완료: {name} {vid}")
    say("  서버가 10초 안에 자동으로 알아봐요. 확인:  curl -s localhost:8000/api/languages")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
