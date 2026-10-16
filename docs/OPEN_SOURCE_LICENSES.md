# 오픈소스 소프트웨어 라이선스 고지 (Open Source Licenses)

본 **DureSync(두레싱크)** (코드 라운지 협업 플랫폼) 프로젝트는 다양한 오픈소스 소프트웨어 및 라이브러리를 활용하여 구축되었습니다. 각 오픈소스의 저작권과 라이선스 규정을 준수하며, 주요 오픈소스 구성 요소 및 라이선스 정보는 다음과 같습니다.

---

## 1. 백엔드 핵심 프레임워크 및 라이브러리

| 소프트웨어 | 버전 | 라이선스 | 저작권자 / 배포처 | 용도 |
| :--- | :--- | :--- | :--- | :--- |
| **FastAPI** | >= 0.109.0 | MIT License | Sebastián Ramírez (tiangolo) | 고성능 비동기 REST API 웹 프레임워크 |
| **Uvicorn** | >= 0.27.0 | BSD-3-Clause | Encode OSS Ltd. | 비동기 ASGI 웹 서버 |
| **SQLAlchemy** | >= 2.0.25 | MIT License | Michael Bayer | 비동기 객체 관계형 매퍼 (ORM) 및 DB 추상화 |
| **aiosqlite** | >= 0.19.0 | MIT License | John Reese | Python asyncio 기반 비동기 SQLite 드라이버 |
| **Pydantic** | >= 2.6.0 | MIT License | Samuel Colvin & Pydantic Contributors | 데이터 스키마 유효성 검증 및 직렬화 |
| **httpx** | >= 0.26.0 | BSD-3-Clause | Encode OSS Ltd. | 비동기 HTTP 클라이언트 (크롤링 및 외부 연동) |
| **PyJWT** | >= 2.8.0 | MIT License | José Padilla | JWT(JSON Web Token) 인코딩/디코딩/인증 |
| **bcrypt** | >= 4.1.2 | Apache-2.0 | Python Cryptographic Authority | 비밀번호 단방향 해싱 및 보안 암호화 |

---

## 2. 코드 실행 샌드박스 및 런타임 환경

| 소프트웨어 | 라이선스 | 제공자 | 설명 |
| :--- | :--- | :--- | :--- |
| **Python 3.11** | PSF License | Python Software Foundation | 파이썬 기본 런타임 및 프로세스 격리 샌드박스 |
| **OpenJDK / Eclipse Temurin** | GPL v2 with Classpath Exception | Eclipse Foundation / Adoptium | Java 17/25 가상머신 및 javac 컴파일러 |
| **Microsoft .NET Framework CSC** | Microsoft EULA / MIT | Microsoft Corporation | C# 샌드박스 컴파일러 (`csc.exe`) |
| **Judge0 CE** | MIT License | Herman Zvonimir Došilović | 분산 코드 실행 엔진 및 도커 샌드박스 |

---

## 3. 프론트엔드 및 웹 UI 구성 요소

| 소프트웨어 | 라이선스 | 설명 |
| :--- | :--- | :--- |
| **HTML5 / CSS3 / ES6+** | W3C Standard | 의존성 없는 고속 반응형 웹 인터페이스 |
| **Monaco Editor / CodeMirror** | MIT License | VSCode 기반 인라인 코드 편집기 및 구문 강조 |
| **Lucide / Feather Icons** | MIT / ISC License | 경량 벡터 SVG 협업 및 내비게이션 아이콘 세트 |

---

## 4. 라이선스 전문 안내 (MIT License Template)

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
