FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성 설치 (curl 등)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 파이썬 의존성 설치
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 프로젝트 전체 복사 (API 및 프론트엔드 UI 정적 파일 포함)
COPY . .

# 데이터 디렉토리 생성
RUN mkdir -p data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--app-dir", "api", "--host", "0.0.0.0", "--port", "8000"]
