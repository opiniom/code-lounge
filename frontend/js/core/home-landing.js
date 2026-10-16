/* ---- home landing (first-screen welcome, Gemini-style centered intro) ---- */
/* always shows fresh on load; dismissing only hides it for the current visit */
var homeLandingActive = true;
(function(){ try{ localStorage.removeItem('root_home_landing_dismissed'); }catch(e){} })();
function applyHomeLandingState(){
  document.querySelector('.app').classList.toggle('home-landing-mode', homeLandingActive);
}
function dismissHomeLanding(){
  if(!homeLandingActive) return;
  homeLandingActive = false;
  if(document.startViewTransition){
    document.startViewTransition(function(){ applyHomeLandingState(); });
  } else {
    applyHomeLandingState();
  }
}
applyHomeLandingState();

function playHomeIntro(){
  var hero = document.querySelector('.home-hero');
  if(!hero) return;
  hero.classList.remove('home-intro');
  void hero.offsetWidth;
  hero.classList.add('home-intro');
}

