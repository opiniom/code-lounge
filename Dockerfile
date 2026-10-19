FROM python:3.11-slim

WORKDIR /app

# 워크스페이스 '▶ 실행' 버튼이 쓰는 언어 실행 도구
#   이미지에 기본으로 넣는 언어: Python · JavaScript/TypeScript(Node 22) · Java · C · C++ · Ruby · PHP · Perl · Bash
#   Go · Rust · C# 같은 큰 언어는 이미지에 넣지 않는다. 서버 터미널에서 필요할 때 설치한다 (재빌드·재시작 없음):
#       docker compose -f docker-compose.prod.yml exec app install-lang go      (list / go / rust / dotnet / remove <이름>)
#   설치한 언어는 /opt/langs (도커 볼륨 ./langs)에 남고, 서버가 10초 안에 알아본다 (/health 의 supported_languages).

# Node.js 22: TypeScript 를 바로 실행하려면 22.18 이상이 필요하다 (Debian 기본 nodejs 는 버전이 낮다). 공식 이미지에서 실행 파일만 가져온다.
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node

# 내려받기가 잠깐 끊겨도 빌드 전체가 실패하지 않게 apt 가 알아서 재시도한다
RUN printf 'Acquire::Retries "5";\nAcquire::http::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc g++ libc6-dev \
    ruby \
    php-cli \
    perl \
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
