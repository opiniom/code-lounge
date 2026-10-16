/* ---- theme (light/dark/system), restored before first paint ---- */
(function(){
  try{
    var saved = localStorage.getItem('root_theme');
    if(saved && saved!=='system'){ document.documentElement.setAttribute('data-theme', saved); }
  }catch(e){}
})();

