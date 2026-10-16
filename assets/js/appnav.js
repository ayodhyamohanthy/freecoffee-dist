/* Phone navigation for app pages: compact top bar with a Menu button.
   On wide screens this script does nothing visible. */
(function () {
  var side = document.querySelector('.sidebar');
  var bar = document.querySelector('.topbar');
  if (!side || !bar) return;
  side.id = side.id || 'appNav';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-menu-btn';
  btn.setAttribute('aria-controls', side.id);
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Menu</span>';
  bar.insertBefore(btn, bar.firstChild);
  var scrim = document.createElement('div');
  scrim.className = 'nav-scrim';
  document.body.appendChild(scrim);
  function set(open) {
    document.body.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function () { set(!document.body.classList.contains('nav-open')); });
  scrim.addEventListener('click', function () { set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  side.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) set(false); });
  var mq = window.matchMedia('(min-width: 981px)');
  var onMq = function () { if (mq.matches) set(false); };
  if (mq.addEventListener) mq.addEventListener('change', onMq);
})();
