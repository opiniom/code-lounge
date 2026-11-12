/* ---- 공용 선 아이콘 ----
   서비스 전체가 쓰는 선 아이콘(굵기 1.8 · 둥근 끝)으로 통일한다. 이모티콘 대신 이 아이콘을 쓴다.
   · 커뮤니티가 이미 정의해 둔 아이콘(CM_ICON: folder · trophy · pin · check · chat · flag …)은 그대로 가져다 쓰고,
     여기에는 그 밖에 필요한 것만 둔다. 새 아이콘이 필요하면 UI_ICON 에 추가하면 어느 화면에서나 uiIc('이름') 으로 쓸 수 있다. */
var UI_ICON = {
  calendar:'<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8 3.5v3M16 3.5v3"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  team:'<circle cx="8" cy="9" r="3"/><circle cx="17" cy="10.5" r="2.4"/><path d="M3 19c.5-3 2.4-4.6 5-4.6s4.5 1.6 5 4.6M14.5 19c.3-2.2 1.6-3.5 3.6-3.5s3.1 1.3 3.4 3.5"/>',
  user:'<circle cx="12" cy="8" r="3.4"/><path d="M5 20c1-3.8 3.6-5.7 7-5.7s6 1.9 7 5.7"/>',
  checkc:'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.5"/>',
  tasks:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  sparkle:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5 9 9M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5"/>',
  note:'<path d="M6 4h9l3 3v13H6z"/><path d="M9 12h6M9 16h6M9 8h3"/>',
  screen:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  bulb:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  strike:'<path d="M5 12h14"/><path d="M16.5 7.2A4.5 3.2 0 0 0 12 5c-2.5 0-4.5 1.2-4.5 3s1.6 2.3 4.5 3M7.5 16.8A4.5 3.2 0 0 0 12 19c2.5 0 4.5-1.2 4.5-3"/>'
};
function uiIc(name, size, cls){
  var d = UI_ICON[name] || (typeof CM_ICON !== 'undefined' ? CM_ICON[name] : '') || '';
  var n = size || 16;
  return '<svg class="ui-i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
}
