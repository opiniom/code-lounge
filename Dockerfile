FROM python:3.13-slim

WORKDIR /app

# 워크스페이스 '▶ 실행' 버튼이 쓰는 언어 실행 도구 — 핵심 언어만 이미지에 넣고, 나머지는 관리자 페이지('언어 관리')나 서버 터미널에서 설치한다.
#   이미지에 들어 있는 것: Python 3.13 · Node.js 24 LTS(JavaScript/TypeScript) · Java(JDK, Debian 기본 LTS) · C/C++(gcc) · Bash
#   (HTML · CSS 는 서버가 아니라 사용자 브라우저에서 미리보기로 동작해서 설치가 필요 없다)
#   C# · Go · Rust, 그리고 Java/Node 의 다른 버전은 관리자 페이지 → 언어 관리, 또는 (재빌드·재시작 없이):
#       docker compose -f docker-compose.prod.yml exec app install-lang java 21      (list / available <언어> / <언어> [버전] / default / remove)
#   설치한 언어는 /opt/langs (도커 볼륨 ./langs)에 남고, 같은 언어의 여러 버전을 나란히 둘 수 있다. 서버가 10초 안에 알아본다 (/api/languages).
#   이미지 안의 언어를 최신으로 갱신하려면 다시 빌드한다:  docker compose -f docker-compose.prod.yml build --pull && docker compose -f docker-compose.prod.yml up -d

# Node.js 24 LTS: TypeScript 를 바로 실행하려면 22.18 이상이 필요하다 (Debian 기본 nodejs 는 버전이 낮다). 공식 이미지에서 실행 파일만 가져온다.
COPY --from=node:24-slim /usr/local/bin/node /usr/local/bin/node

# 내려받기가 잠깐 끊겨도 빌드 전체가 실패하지 않게 apt 가 알아서 재시도한다
RUN printf 'Acquire::Retries "5";\nAcquire::http::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc g++ libc6-dev \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    default-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

# 나중에 설치하는 언어가 놓이는 곳 (도커 볼륨으로 연결) + 설치 도구
ENV LANGS_DIR=/opt/langs
RUN mkdir -p /opt/langs
COPY scripts/install_lang.py /usr/local/bin/install-lang
RUN chmod +x /usr/local/bin/install-lang

# 파이썬 의존성 설치
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 프로젝트 전체 복사 (API 및 프론트엔드 UI 정적 파일 포함)
COPY . .

# 데이터 디렉토리 생성
RUN mkdir -p data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--app-dir", "api", "--host", "0.0.0.0", "--port", "8000"]
