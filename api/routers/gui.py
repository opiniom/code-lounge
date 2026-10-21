"""자바 Swing/AWT 프로그램을 사이트 안의 창(브라우저 CheerpJ)으로 띄우기 — 서버는 컴파일만 한다 (services/java_gui.py).

  GET  /api/gui/config      프레임 주소(다른 출처에서 띄우는 경우)와 사용 가능 여부
  POST /api/gui/java/build  {files:[{path,content}], main_class} → {ok, jar_b64, main} 또는 {ok:false, errors}
로그인한 사용자만, PUBLIC_MODE 에서는 꺼짐, 한 사람이 동시에 하나만 컴파일.
"""
import base64
import re
from typing import List, Set

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import settings
from models import User
from services import java_gui
from services import sandbox_runner as sb
from services.auth_service import get_current_user

router = APIRouter(tags=["GUI"])
_busy: Set[int] = set()          # 지금 컴파일 중인 사용자 (한 사람이 동시에 하나만)


class GuiFile(BaseModel):
    path: str = Field(..., max_length=260)
    content: str = Field("", max_length=300_000)


class GuiBuild(BaseModel):
    files: List[GuiFile] = Field(..., max_length=java_gui.MAX_FILES)
    main_class: str = Field(..., max_length=200)


@router.get("/api/gui/config")
async def gui_config():
    origin = (settings.GUI_FRAME_ORIGIN or "").strip().rstrip("/")
    return {"available": (not settings.PUBLIC_MODE) and bool(sb.tool("javac")), "frame_origin": origin if re.fullmatch(r"https?://[\w.\-]+(:\d+)?", origin) else ""}


@router.post("/api/gui/java/build")
async def gui_java_build(data: GuiBuild, current_user: User = Depends(get_current_user)):
    if settings.PUBLIC_MODE:
        raise HTTPException(status_code=403, detail="공유 모드에서는 보안을 위해 꺼져 있어요.")
    if current_user.id in _busy:
        raise HTTPException(status_code=429, detail="이전 컴파일이 끝나면 다시 해 주세요.")
    _busy.add(current_user.id)
    try:
        res = await java_gui.build([f.model_dump() for f in data.files], data.main_class)
    except java_gui.GuiBuildError as e:
        return {"ok": False, "errors": str(e), "blocked": True}
    finally:
        _busy.discard(current_user.id)
    if not res.get("ok"):
        return {"ok": False, "errors": res.get("errors", "")}
    return {"ok": True, "main": res["main"], "classes": res["classes"], "jar_b64": base64.b64encode(res["jar"]).decode("ascii")}
