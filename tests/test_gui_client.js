// 자바 GUI 창(frontend/js/pages/workspace-gui.js)의 판별 로직 + 프레임 페이지 보안 확인 — node 만 있으면 돼요.
// 실행: node tests/test_gui_client.js (프로젝트 루트에서)
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.dirname(__dirname), R = []; const chk = (n, c, x) => R.push([n, !!c, x]);
const src = fs.readFileSync(path.join(ROOT, 'frontend/js/pages/workspace-gui.js'), 'utf8');
const ctx = { wsStripComments: c => String(c || '').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '') }; vm.createContext(ctx);
for (const fn of ['wsIsGuiJava', 'wsJavaMainOf']) vm.runInContext(new RegExp('function ' + fn + '[\\s\\S]*?\\n}\\n').exec(src)[0], ctx);
const gui = c => ctx.wsIsGuiJava(c), mainOf = c => ctx.wsJavaMainOf(c);
chk('Swing import 가 있으면 GUI 프로그램으로 본다', gui('import javax.swing.*;\npublic class A {}') && gui('import java.awt.*;\nclass A{}'));
chk('JFrame 상속·생성도 GUI 로 본다', gui('class A extends JFrame {}') && gui('class A { void f(){ new JFrame("x"); } }'));
chk('콘솔 프로그램·주석 속 import 는 GUI 가 아니다 (기존처럼 서버에서 실행)', !gui('public class A { public static void main(String[] a){ System.out.println(1); } }') && !gui('// import javax.swing.*;\npublic class A{}') && !gui('/* import java.awt.*; */ class A{}') && !gui('import java.util.*;\nclass A{}'));
chk('main 이 있는 클래스 이름을 찾는다 (public 우선)', mainOf('public class main { public static void main(String[] args){} }') === 'main' && mainOf('class Helper{}\npublic class App { public static void main(String[] a){} }') === 'App');
chk('package 가 있으면 완전한 이름(app.Main)', mainOf('package app;\npublic class Main { public static void main(String[] a){} }') === 'app.Main');
chk('한글 클래스 이름도 찾는다', mainOf('public class 한글 { public static void main(String[] a){} }') === '한글');
chk('main 이 없으면 null (다른 파일에서 찾거나 안내)', mainOf('public class Foo { void x(){} }') === null);
const frame = fs.readFileSync(path.join(ROOT, 'frontend/gui/frame.html'), 'utf8');
chk('프레임 페이지: 로그인 정보(localStorage·토큰)를 쓰지 않는다', !/localStorage|sync_auth|authToken|Authorization/.test(frame));
chk('프레임 페이지: 우리를 연 페이지(p 주소)에서 온 메시지만, 한 번만 실행한다', /e\.origin !== parentOrigin/.test(frame) && /started \|\| e\.origin|started\) return|!== 'run' \|\| started/.test(frame) && /parent\.postMessage\(m, parentOrigin\)/.test(frame));
chk('프레임 페이지: 자바 출력(System.out)을 부모의 실행 콘솔로 넘기고 CheerpJ 안내문은 걸러 낸다', /console\[k\] = function/.test(frame) && /CHEERPJ COMMUNITY EDITION/.test(frame));
chk('프레임 페이지: CheerpJ 로더 버전을 고정해서 쓴다 (latest 금지)', /cjrtnc\.leaningtech\.com\/\d+\.\d+\/loader\.js/.test(frame) && !/latest/.test(frame));
chk('부모: 다른 출처에서 열 때 sandbox 를 걸고, 메시지는 iframe 과 출처가 맞을 때만 받는다', /setAttribute\('sandbox', 'allow-scripts allow-same-origin'\)/.test(src) && /e\.source !== f\.contentWindow \|\| e\.origin !== GUI\.origin/.test(src));
const html = fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');
chk('GUI 창 하단에 CheerpJ 크레딧(공식 링크)이 있다 (무료 라이선스 조건)', /Powered by <a href="https:\/\/cheerpj\.com"[^>]*rel="noopener noreferrer">CheerpJ<\/a>/.test(html));
chk('README 에 CheerpJ 출처와 상용 전환 시 라이선스 안내가 있다', /CheerpJ/.test(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')) && /Commercial|유료/.test(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')));
const css = fs.readFileSync(path.join(ROOT, 'frontend/css/editor.css'), 'utf8');
chk('모바일에서도 크레딧을 숨기지 않는다', !/\.gui-foot\{display:none;\}/.test(css));
const bad = R.filter(x => !x[1]); bad.forEach(x => console.log('FAIL:', x[0], '→', JSON.stringify(x[2])));
console.log(`${R.length - bad.length}/${R.length} 통과`); process.exit(bad.length ? 1 : 0);
