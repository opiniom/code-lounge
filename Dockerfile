FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성 설치 (curl 등) + 워크스페이스 '실행' 버튼이 쓰는 언어 실행 도구
#   gcc/g++ (C·C++), JDK (Java), Node.js (JavaScript), Ruby, PHP, Perl.  Python 은 기본 이미지에 있음.
#   서버에 설치된 도구만 자동으로 '실행 가능한 언어' 목록에 올라간다 (/health). Go·Rust·C# 이 필요하면 여기에 추가.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc g++ libc6-dev \
    default-jdk-headless \
    nodejs \
    ruby \
    php-cli \
    perl \
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
