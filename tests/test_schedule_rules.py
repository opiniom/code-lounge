"""규칙 기반 일정 분석 테스트. 실행: .venv/bin/python tests/test_schedule_rules.py"""
import os, sys
from datetime import date
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from services.schedule_ai import detect_rules

REF = date(2026, 9, 11)  # 금요일

def one(text):
    r = detect_rules(text, REF)
    assert len(r) == 1, (text, r)
    e = r[0]
    return e["title"], e["start_date"].isoformat(), e["end_date"].isoformat(), e["start_time"], e["end_time"]

cases = [
    ("다음 회의는 다음주 화요일 오후 2시",           ("다음 회의", "2026-09-15", "2026-09-15", "14:00", None)),
    ("민재가 API 문서 정리 금요일까지 담당",          ("민재가 API 문서 정리 담당", "2026-09-18", "2026-09-18", None, None)),
    ("해커톤 9월 20일부터 22일까지 진행",             ("해커톤", "2026-09-20", "2026-09-22", None, None)),
    ("중간 발표 9/25 오전 10시~11시30분",             ("중간 발표", "2026-09-25", "2026-09-25", "10:00", "11:30")),
    ("최종 제출 2026.10.05",                          ("최종 제출", "2026-10-05", "2026-10-05", None, None)),
    ("스터디 이번 주말",                              ("스터디", "2026-09-12", "2026-09-13", None, None)),
    ("팀 점검 3일 뒤 오후 7시",                       ("팀 점검", "2026-09-14", "2026-09-14", "19:00", None)),
    ("발표 준비 다음주 월요일부터 수요일까지",        ("발표 준비", "2026-09-14", "2026-09-16", None, None)),
]
for text, want in cases:
    got = one(text)
    assert got == want, f"\n입력: {text}\n기대: {want}\n결과: {got}"

assert detect_rules("오늘 회의에서 UI 디자인 시안 확정하기로 함", REF) == []   # '오늘'만 있으면 제외
assert detect_rules("매주 화요일 정기 회의", REF) == []                        # 반복 일정 제외
assert detect_rules("UI 시안 확정하기", REF) == []                             # 날짜 없음
print("OK", len(cases) + 3, "cases")
