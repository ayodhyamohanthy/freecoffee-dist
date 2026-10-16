/* Shared public-page script: fills the live price in the top bar from the
   backend market feed. If the call fails the slot stays on its static text. */
(function () {
  var el = document.getElementById('fc-bar-price');
  if (!el || !window.fetch) return;
  fetch('https://freecoffee-backend.ayodhya-711.workers.dev/market', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (m) {
      var b = m && m.blocks && m.blocks.filter(function (x) { return x.state === 'open'; })[0];
      var cpm = b ? b.priceToWin : (m && m.floorCpm);
      if (typeof cpm === 'number') el.textContent = 'Live price to win the next block: $' + cpm.toFixed(2) + ' CPM';
    }).catch(function () {});
})();
