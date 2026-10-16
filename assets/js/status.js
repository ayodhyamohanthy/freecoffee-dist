/* Live status checks, run in the visitor's browser. Each row reports only what its own request returned. */
(function () {
  var API = 'https://freecoffee-backend.ayodhya-711.workers.dev';
  var $ = function (id) { return document.getElementById(id); };
  function set(id, ok, text) { var e = $(id); e.textContent = (ok ? 'Working. ' : 'Problem. ') + text; e.style.fontWeight = '600'; }
  function get(path, ms) {
    var c = new AbortController(), t0 = Date.now();
    var timer = setTimeout(function () { c.abort(); }, ms || 8000);
    return fetch(API + path, { cache: 'no-store', signal: c.signal }).then(function (r) {
      clearTimeout(timer);
      return r.json().then(function (j) { return { ok: r.ok, json: j, ms: Date.now() - t0 }; });
    });
  }
  function fail(id, what) { return function () { set(id, false, what + ' did not answer. Try again in a minute.'); }; }
  set('st-site', true, 'You are reading this page from freecoffee.tech.');
  get('/health').then(function (r) { r.ok && r.json && r.json.ok ? set('st-health', true, 'Answered in ' + r.ms + ' ms.') : set('st-health', false, 'The service answered with an error.'); }).catch(fail('st-health', 'The backend'));
  get('/market').then(function (r) { r.ok && r.json && typeof r.json.floorCpm === 'number' ? set('st-market', true, 'Floor price $' + r.json.floorCpm.toFixed(2) + ' CPM. Answered in ' + r.ms + ' ms.') : set('st-market', false, 'The feed answered with an error.'); }).catch(fail('st-market', 'The market feed'));
  get('/auth/status').then(function (r) { var p = r.json && r.json.providers || {}; var on = [p.github ? 'GitHub' : '', p.google ? 'Google' : ''].filter(Boolean); r.ok && on.length ? set('st-auth', true, on.join(' and ') + ' sign-in available.') : set('st-auth', false, 'No sign-in method is switched on.'); }).catch(fail('st-auth', 'Sign-in'));
  $('st-time').textContent = 'Checked ' + new Date().toLocaleTimeString() + ' in your browser.';
})();
