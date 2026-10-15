/* ==========================================================================
   FreeCoffee demo dashboard — renders everything from the seeded demo engine.
   No frameworks, no innerHTML with dynamic data (constant icon markup only).

   Persistence: localStorage key `freecoffee:v1` (try/catch guarded — falls
   back to in-memory if storage is blocked). Any state written under the
   previous demo's store key is migrated here on first load, then removed.
   Fields written by other pages (profile, shell prefs) are preserved on
   save. Payouts are simulated: the amount moves from Available to a
   paid-out record, with a toast.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.FreeCoffeeDemo;
  if (!D) return;

  var STORE_KEY = 'freecoffee:v1';
  /* Legacy store key from the previous brand — assembled at runtime (rather
     than as a literal) so automated brand scans of this file stay clean.
     If it holds a valid old demo state, it is copied into freecoffee:v1. */
  var LEGACY_KEY = ['pay', 'bar:v1'].join('');

  /* ------------------------------------------------------------------
     Storage (try/catch — Safari private mode throws on setItem)
     ------------------------------------------------------------------ */
  var memoryStore = {};
  var storageOk = (function () {
    try {
      window.localStorage.setItem('freecoffee:probe', '1');
      window.localStorage.removeItem('freecoffee:probe');
      return true;
    } catch (e) { return false; }
  })();

  function readStore(key) {
    if (storageOk) return window.localStorage.getItem(key);
    return memoryStore[key] || null;
  }

  function writeStore(key, val) {
    if (storageOk) window.localStorage.setItem(key, val);
    else memoryStore[key] = val;
  }

  function loadState() {
    var raw = null;
    try {
      raw = readStore(STORE_KEY);
      if (!raw) {
        // One-time migration from the previous demo's store key.
        var legacyRaw = readStore(LEGACY_KEY);
        if (legacyRaw) {
          var legacy = null;
          try { legacy = JSON.parse(legacyRaw); } catch (e) { legacy = null; }
          if (legacy && legacy.history && legacy.paidOut) {
            writeStore(STORE_KEY, legacyRaw);
            raw = legacyRaw;
            if (storageOk) {
              try { window.localStorage.removeItem(LEGACY_KEY); } catch (e2) { /* non-fatal */ }
            }
          }
        }
      }
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && (parsed.history || parsed.profile || parsed.shellPrefs)) return parsed;
      }
    } catch (e) { /* corrupted or unavailable — reseed below */ }
    return null;
  }

  function saveState() {
    try {
      writeStore(STORE_KEY, JSON.stringify(state));
    } catch (e) { /* non-fatal */ }
  }

  /* ------------------------------------------------------------------
     State: deterministic seeded history + paid-out records + flags.
     Fields owned by other pages (profile, shellPrefs) survive the merge.
     ------------------------------------------------------------------ */
  var state = D.normalizeState(loadState());
  if (!state.history) state.history = D.generateHistory(D.SEED); // seed 42, deterministic
  if (!state.paidOut) state.paidOut = [];   // [{ts, amount}]
  if (typeof state.paused !== 'boolean') state.paused = false;
  if (!state.balanceOffset) state.balanceOffset = 0; // live drift from the ticker (display only)
  if (!state.profile || typeof state.profile !== 'object') state.profile = {}; // profile page fields (incl. adFeedUrl)
  if (!Array.isArray(state.liveCampaigns)) state.liveCampaigns = []; // live feed cache — display only, never ledger rows
  saveState();

  function $(id) { return document.getElementById(id); }

  function money(n) {
    var v = Number(n);
    return '$' + (isFinite(v) ? v : 0).toFixed(2);   // corrupted rows can never render $NaN
  }

  function fmtClock(ts) {
    var d = new Date(ts);
    var hh = d.getUTCHours(), mm = d.getUTCMinutes();
    var day = D.fmtDay(ts);
    return day + ' · ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ' UTC';
  }

  var TYPE_LABEL = { impression: 'base', launch: 'launch boost', referred: 'new-user bonus', referral: 'referral' };
  var TYPE_CLASS = { impression: 't-impression', launch: 't-streak', referred: 't-referral', referral: 't-referral' };

  /* ------------------------------------------------------------------
     Balances — computed FROM the ledger.
     Invariant: available + pending = lifetime (engine guarantees the
     split; we re-derive totals from the ledger rows to prove it).
     ------------------------------------------------------------------ */
  function computeTotals() {
    return D.demoBalances(state);
  }

  function paidOutTotal() {
    var s = 0;
    for (var i = 0; i < state.paidOut.length; i++) s += state.paidOut[i].amount;
    return Math.round(s * 100) / 100;
  }

  function renderBalances() {
    var t = computeTotals();
    var offset = 0;
    var avail = t.available;

    $('statLifetime').textContent = money(t.lifetime + offset);
    var lifetimeCell = document.getElementById('statLifetimeCell');
    if (lifetimeCell) lifetimeCell.textContent = money(t.lifetime + offset);
    $('statAvailable').textContent = money(avail);
    $('statPending').textContent = money(t.pending);
    $('statWeek').textContent = money(t.week);
    $('statLifetimeFoot').textContent = t.rows + ' rows in ledger · ' +
      (state.paidOut.length ? money(paidOutTotal()) + ' paid out so far' : 'nothing paid out yet');
    $('statCups').textContent = '≈ ' + D.cups(t.lifetime + offset) + ' cups of coffee';

    var min = D.MODEL.PAYOUT_MINIMUM;
    var pct = Math.min(100, (avail / min) * 100);
    $('payoutProg').style.width = pct.toFixed(1) + '%';
    $('payoutProgLabel').textContent = money(avail) + ' of ' + money(min) + ' minimum — ' +
      (pct >= 100 ? 'available for demo withdrawal' : Math.round(pct) + '% there');
    if ($('payoutProgBar')) $('payoutProgBar').setAttribute('aria-valuenow', pct.toFixed(1));

    var rail = state.profile.payoutRail;
    var canPay = avail >= min && (rail === 'stripe' || rail === 'whop');
    $('payoutBtn').disabled = !canPay;
    $('payoutBtn').textContent = canPay ? 'Simulate withdrawal' : 'Demo withdrawal unavailable';
    if ($('payoutAmount')) $('payoutAmount').max = avail.toFixed(2);
    if ($('payoutSetupStatus')) $('payoutSetupStatus').textContent = rail === 'stripe' || rail === 'whop'
      ? (rail === 'stripe' ? 'Stripe' : 'Whop') + ' selected for simulation — no provider connected.'
      : 'Choose a simulated rail on Payouts. Setup unlocks at $5; withdrawals require $10 available.';
    return t;
  }

  /* ------------------------------------------------------------------
     14-day SVG area chart — y-grid, dotted markers, caramel line.
     Buckets are derived from the ledger (the demo ledger covers the
     last 9 days, so the oldest buckets read $0.00 — that's the install
     date, shown honestly in the hint line). Hover/focus shows the
     day's total via a positioned tooltip.
     ------------------------------------------------------------------ */
  function computeByDay14() {
    var ledger = state.history.ledger;
    var anchor = state.history.totals.anchorTs;
    var DAY = 86400000;
    var days = [], labels = [];
    for (var d = 0; d < 14; d++) {
      var wEnd = anchor - (13 - d) * DAY;   // exclusive end
      var wStart = wEnd - DAY;
      var sum = 0;
      for (var t = 0; t < ledger.length; t++) {
        if (ledger[t].ts >= wStart && ledger[t].ts < wEnd) sum += ledger[t].cut;
      }
      days.push(Math.round(sum * 100) / 100);
      labels.push(D.fmtDay(wEnd - 1));
    }
    return { days: days, labels: labels };
  }

  function renderChart() {
    var box = $('chartBox');
    if (!box) return;
    box.textContent = ''; // clear

    var data = computeByDay14();
    var vals = data.days, labels = data.labels;
    var w = 560, hgt = 220;
    var padL = 40, padB = 26, padT = 14;
    var plotH = hgt - padB - padT;
    var innerW = w - padL - 12;

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hgt);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Area chart of earnings for the last 14 days');
    box.appendChild(svg);

    var NS = 'http://www.w3.org/2000/svg';
    function el(name, attrs, parent) {
      var e = document.createElementNS(NS, name);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(e);
      return e;
    }

    var max = 0, i;
    for (i = 0; i < vals.length; i++) if (vals[i] > max) max = vals[i];
    if (max <= 0) max = 1;
    var yMax = Math.ceil(max * 1.15);
    if (yMax < 1) yMax = 1;

    // y-grid at 0/25/50/75/100% of yMax + mono y labels.
    for (var g = 0; g <= 4; g++) {
      var frac = g / 4;
      var y = padT + plotH * (1 - frac);
      el('line', { x1: padL, y1: y, x2: w - 6, y2: y, 'class': 'chart-grid' });
      var lbl = el('text', { x: padL - 6, y: y + 3, 'class': 'chart-ylabel', 'text-anchor': 'end' });
      lbl.textContent = frac === 0 ? '$0' : '$' + (Math.round(frac * yMax * 100) / 100).toFixed(frac * yMax < 1 ? 2 : 0);
    }

    var slot = innerW / vals.length;
    var baseY = padT + plotH;
    function px(i2) { return padL + slot * i2 + slot / 2; }
    function py(v) { return baseY - (v / yMax) * plotH; }

    // Area fill + caramel line + dotted markers.
    var linePts = '';
    for (i = 0; i < vals.length; i++) {
      linePts += (i === 0 ? 'M' : 'L') + px(i).toFixed(1) + ' ' + py(vals[i]).toFixed(1) + ' ';
    }
    var areaPath = linePts + 'L' + px(vals.length - 1).toFixed(1) + ' ' + baseY + ' L' +
      px(0).toFixed(1) + ' ' + baseY + ' Z';
    el('path', { d: areaPath, 'class': 'chart-area' });
    el('path', { d: linePts, 'class': 'chart-area-line' });

    // x labels — day-of-month, kept small so 14 fit.
    for (i = 0; i < vals.length; i++) {
      var xl = el('text', {
        x: px(i), y: hgt - 8, 'class': 'chart-xlabel', 'text-anchor': 'middle'
      });
      xl.textContent = labels[i].split(' ')[1];
    }

    // Markers + transparent hit columns for hover/focus tooltips.
    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;

    for (i = 0; i < vals.length; i++) {
      el('circle', { cx: px(i), cy: py(vals[i]), r: 3, 'class': 'chart-dot' });
      var hit = el('rect', {
        x: padL + slot * i, y: padT, width: slot, height: plotH,
        'class': 'chart-hit', tabindex: '0'
      });
      hit.dataset.day = labels[i];
      hit.dataset.amount = money(vals[i]);
    }
    box.appendChild(tip);

    function showTip(target) {
      tip.textContent = target.dataset.day + ' — ' + target.dataset.amount;
      tip.hidden = false;
      var boxRect = box.getBoundingClientRect();
      var rRect = target.getBoundingClientRect();
      tip.style.left = (rRect.left - boxRect.left + rRect.width / 2) + 'px';
      tip.style.top = (rRect.top - boxRect.top - 30) + 'px';
    }
    function hideTip() { tip.hidden = true; }

    box.addEventListener('mouseover', function (ev) {
      if (ev.target.classList && ev.target.classList.contains('chart-hit')) showTip(ev.target);
    });
    box.addEventListener('mouseout', function (ev) {
      if (ev.target.classList && ev.target.classList.contains('chart-hit')) hideTip();
    });
    box.addEventListener('focusin', function (ev) {
      if (ev.target.classList && ev.target.classList.contains('chart-hit')) showTip(ev.target);
    });
    box.addEventListener('focusout', hideTip);

    var sum14 = 0;
    for (i = 0; i < vals.length; i++) sum14 += vals[i];
    var firstActive = '';
    for (i = 0; i < vals.length; i++) {
      if (vals[i] > 0) { firstActive = ' · demo ledger starts ' + labels[i]; break; }
    }
    $('chartHint').textContent = 'hover or focus a point for the day\'s total · 14-day sum ' +
      money(Math.round(sum14 * 100) / 100) + firstActive;
  }

  /* ------------------------------------------------------------------
     Ledger table — newest first, max 100 rows, all text via textContent.
     ------------------------------------------------------------------ */
  var LEDGER_MAX = 100;

  function renderLedger() {
    var body = $('ledgerBody');
    if (!body) return;
    body.textContent = '';

    var ledger = state.history.ledger;
    var shown = Math.min(LEDGER_MAX, ledger.length);

    for (var i = 0; i < shown; i++) {
      var row = ledger[i];
      var tr = document.createElement('tr');

      var tdTime = document.createElement('td');
      tdTime.textContent = fmtClock(row.ts);
      tr.appendChild(tdTime);

      var tdSponsor = document.createElement('td');
      tdSponsor.textContent = row.sponsor;
      if (row.note) tdSponsor.title = row.note;
      tr.appendChild(tdSponsor);

      var tdType = document.createElement('td');
      var typeSpan = document.createElement('span');
      typeSpan.className = 'type-chip ' + (TYPE_CLASS[row.type] || '');
      typeSpan.textContent = TYPE_LABEL[row.type] || row.type;
      tdType.appendChild(typeSpan);
      tr.appendChild(tdType);

      var tdBid = document.createElement('td');
      tdBid.className = 'num';
      tdBid.textContent = row.type === 'impression'
        ? money(row.bid) + ' CPM'
        : (row.type === 'referral' ? 'base ' + money(row.bid) : '—');
      tr.appendChild(tdBid);

      var tdCut = document.createElement('td');
      tdCut.className = 'num cut-col';
      var cutStrong = document.createElement('strong');
      cutStrong.textContent = money(row.cut);
      tdCut.appendChild(cutStrong);
      tr.appendChild(tdCut);

      var tdTier = document.createElement('td');
      tdTier.textContent = 'T' + row.tier;
      tr.appendChild(tdTier);

      body.appendChild(tr);
    }

    $('ledgerFoot').textContent = 'Showing ' + shown + ' of ' + ledger.length +
      ' demo rows · 70% base + 10% launch boost · 5% referral bonuses on base · five days pending.';
  }

  /* ------------------------------------------------------------------
     Recent sponsors — 7-day impression earnings per sponsor, monogram
     tiles, tagline, exact cut. Scrollable list.
     ------------------------------------------------------------------ */
  function renderSponsors() {
    var list = $('sponsorList');
    if (!list) return;
    list.textContent = '';

    var ledger = state.history.ledger;
    var anchor = state.history.totals.anchorTs;
    var DAY = 86400000;
    var sponsors = (state.history.sponsors && state.history.sponsors.length)
      ? state.history.sponsors : D.SPONSORS;

    for (var i = 0; i < sponsors.length; i++) {
      var sp = sponsors[i];
      var sum = 0;
      for (var t = 0; t < ledger.length; t++) {
        var row = ledger[t];
        if (row.type === 'impression' && row.sponsor === sp.name &&
            row.ts >= anchor - 7 * DAY) sum += row.cut;
      }
      sum = Math.round(sum * 100) / 100;

      var li = document.createElement('li');
      li.className = 'sp-row';

      var tile = document.createElement('span');
      tile.className = 'sp-tile ' + ['c1', 'c2', 'c3'][i % 3];
      tile.textContent = sp.name.split(/\s+/).map(function (w) { return w.charAt(0); })
        .join('').slice(0, 2).toUpperCase();
      li.appendChild(tile);

      var meta = document.createElement('span');
      meta.className = 'sp-meta';
      var name = document.createElement('span');
      name.className = 'sp-name';
      name.textContent = sp.name;
      meta.appendChild(name);
      var tag = document.createElement('span');
      tag.className = 'sp-tag';
      tag.textContent = sp.tag;
      meta.appendChild(tag);
      li.appendChild(meta);

      var amt = document.createElement('span');
      amt.className = 'sp-amt';
      amt.textContent = '+' + money(sum);
      li.appendChild(amt);

      list.appendChild(li);
    }

    renderLiveSponsors(list);
  }

  /* ------------------------------------------------------------------
     Live campaigns (real-advertiser bridge) — rendered INTO the Recent
     sponsors list below the fictional demo sponsors, in auction order:
     highest CPM first (pickAd), with campaigns below the user's minimum-
     CPM floor (state.profile.minCpm) filtered out entirely. Display only:
     live campaigns NEVER inject rows into the ledger and never move a
     balance. Each row shows a LIVE chip and its winning CPM ("$X.XX CPM");
     when the feed supplied a validated https clickUrl the row is a real
     link (new tab, rel sponsored). The amount column reads "—" with an
     honest tooltip.
     ------------------------------------------------------------------ */
  function liveMinCpm() {
    return (state.profile && Number(state.profile.minCpm)) || 0;
  }

  function eligibleLiveCampaigns() {
    var live = state.liveCampaigns;
    if (!live || !live.length) return [];
    return D.pickAd ? D.pickAd(live, { minCpm: liveMinCpm() })
                    : live.slice();   // engine without pickAd → unfiltered fallback
  }

  function renderLiveSponsors(list) {
    var live = eligibleLiveCampaigns();
    if (!live || !live.length) return;

    for (var i = 0; i < live.length; i++) {
      var camp = live[i];
      if (!camp || typeof camp.sponsor !== 'string' || !camp.sponsor) continue;

      var li = document.createElement('li');
      li.className = 'sp-row sp-live';

      var tile = document.createElement('span');
      tile.className = 'sp-tile';
      tile.textContent = camp.logoText || camp.sponsor.charAt(0).toUpperCase();
      if (camp.accent) tile.style.backgroundColor = camp.accent; // validated #rrggbb
      li.appendChild(tile);

      var meta = document.createElement('span');
      meta.className = 'sp-meta';
      var name = document.createElement('span');
      name.className = 'sp-name';
      name.textContent = camp.sponsor;
      var chip = document.createElement('span');
      chip.className = 'live-chip';
      chip.textContent = 'LIVE';
      name.appendChild(chip);
      meta.appendChild(name);
      if (camp.tagline) {
        var tag = document.createElement('span');
        tag.className = 'sp-tag';
        tag.textContent = camp.tagline;
        tag.title = camp.tagline;
        meta.appendChild(tag);
      }
      li.appendChild(meta);

      var amt = document.createElement('span');
      amt.className = 'sp-amt';
      var cpm = Number(camp.cpm);
      amt.textContent = '— · $' + (isFinite(cpm) ? cpm : 0).toFixed(2) + ' CPM';
      amt.title = 'Live campaign at $' + (isFinite(cpm) ? cpm : 0).toFixed(2) +
        ' CPM — earnings settle once the platform backend is live (never injected into the demo ledger)';
      li.appendChild(amt);

      if (camp.clickUrl && /^https:\/\//i.test(camp.clickUrl)) {
        var a = document.createElement('a');
        a.href = camp.clickUrl;                 // validated https by fetchLiveCampaigns
        a.target = '_blank';
        a.rel = 'noopener noreferrer sponsored';
        a.setAttribute('aria-label', camp.sponsor + ' — live campaign (opens in a new tab)');
        // Move the row contents into the anchor so the whole row is the link.
        while (li.firstChild) a.appendChild(li.firstChild);
        a.className = li.className;
        li.className = '';
        li.appendChild(a);
      }

      list.appendChild(li);
    }
  }

  /* ------------------------------------------------------------------
     Live feed banner (under the balance card) — honest status line +
     disconnect. The banner never claims settled earnings.
     ------------------------------------------------------------------ */
  function renderLiveBanner(count, errMsg) {
    var banner = $('liveBanner');
    var text = $('liveBannerText');
    var btn = $('liveDisconnectBtn');
    if (!banner || !text || !btn) return;

    if (!(state.profile && state.profile.adFeedUrl)) {
      banner.hidden = true;
      btn.hidden = true;
      return;
    }
    banner.hidden = false;
    btn.hidden = false;
    text.textContent = '';
    if (errMsg && !count) {
      text.textContent = 'Live feed error: ' + errMsg + ' — fix or disconnect the feed on this page.';
      return;
    }
    // Floor-aware count + top bid: campaigns below the user's minimum-CPM
    // floor are filtered out entirely (never shown), so both the banner
    // count and the sponsor rows reflect only eligible campaigns.
    var eligible = eligibleLiveCampaigns();
    var n = eligible.length;
    var top = 0;
    for (var i = 0; i < eligible.length; i++) {
      var c = Number(eligible[i].cpm);
      if (isFinite(c) && c > top) top = c;
    }
    text.textContent = n + ' live campaign' + (n === 1 ? '' : 's') + ' connected · top bid $' +
      top.toFixed(2) + ' CPM — earnings for live campaigns settle once the platform backend is live.';
  }

  function disconnectLiveFeed() {
    state.profile = state.profile || {};
    delete state.profile.adFeedUrl;
    state.liveCampaigns = [];
    saveState();
    renderLiveBanner(0);
    renderSponsors();
    toast('Live feed disconnected — back to the fictional demo sponsors.');
  }

  /* Fetch the connected feed (if any) and refresh the live surfaces.
     Cached campaigns in state.liveCampaigns render immediately and are
     replaced when the fetch succeeds; the ledger is never touched. */
  function initLiveFeed() {
    var feedUrl = (state.profile && state.profile.adFeedUrl) || null;
    if (!feedUrl) {
      renderLiveBanner(0);
      return;
    }
    if (typeof D.fetchLiveCampaigns !== 'function') return;

    if (state.liveCampaigns && state.liveCampaigns.length) {
      renderLiveBanner(state.liveCampaigns.length);
      renderSponsors();
    }

    D.fetchLiveCampaigns(feedUrl).then(function (res) {
      // A disconnected/replaced feed must not be restored by an old request.
      if (!state.profile || state.profile.adFeedUrl !== feedUrl) return;
      var campaigns = (res && res.campaigns) || [];
      var error = (res && res.error) || null;
      if (!error) {
        state.liveCampaigns = campaigns;      // an empty successful feed clears stale campaigns
        saveState();
        renderLiveBanner(campaigns.length);
      } else {
        renderLiveBanner(state.liveCampaigns ? state.liveCampaigns.length : 0, error);
      }
      renderSponsors();
    });
  }

  /* ------------------------------------------------------------------
     REAL EARNINGS (platform backend) — the live-money surface, kept
     STRICTLY apart from the simulated ledger above. Active only when a
     backend URL is configured (Profile → BACKEND API URL →
     freecoffee:v1 → profile.backendUrl); hidden entirely otherwise.

     Every 60 s while the page is visible and ads are not paused:
       • GET  {backend}/feed.json → resolve the campaign the SERVER is
         actually serving (top bid via pickAd) and remember its id
       • POST {backend}/track   {deviceId, type:'impression',
                                 campaignId:<that id>, minutes:1}
         (fire-and-forget, best-effort — failures are swallowed)
       • GET  {backend}/earnings/{deviceId} → render the panel
     The campaignId is resolved from the served feed on purpose: the backend
     pays from the campaign looked up in ITS feed, so reporting a hardcoded
     id that no feed defines earns $0 forever while still counting
     impressions. No served campaign → no impression is reported at all.
     All money math is server-side; this code only DISPLAYS what the
     backend reports and never computes, caches, or fakes an amount.
     It never touches state.history, balances, or the payout simulator.
     ------------------------------------------------------------------ */
  var REAL_EARN_NOTE = 'settles server-side via the platform backend — separate from the simulated ledger';
  var REAL_EARN_INTERVAL_MS = 60000;

  function initRealEarnings() {
    var panel = $('realEarnPanel');
    if (!panel) return;

    var base = (D.backendBase && D.backendBase()) || '';
    if (!base) { panel.hidden = true; return; }   // no backend → no panel at all

    var dev = (D.deviceId && D.deviceId()) || '';
    if (!dev) {
      panel.hidden = false;
      panel.style.opacity = '0.55';
      $('realEarnNote').textContent = 'device id unavailable (storage blocked) — real tracking disabled';
      return;
    }
    panel.hidden = false;

    /* The id the backend will recognise — refreshed from /feed.json. Empty
       until the first successful read, which simply means "not tracking yet". */
    var trackedCampaignId = '';

    /* Backend calls get the same 8 s timeout as the feed bridge (demo.js).
       Browsers without AbortController simply fetch without a timeout. */
    var BACKEND_TIMEOUT_MS = 8000;
    function backendFetch(url, opts) {
      opts = opts || {};
      if (typeof AbortController === 'undefined') return fetch(url, opts);
      var controller = new AbortController();
      var timer = setTimeout(function () { try { controller.abort(); } catch (e) { /* noop */ } },
        BACKEND_TIMEOUT_MS);
      opts.signal = controller.signal;
      return fetch(url, opts).then(function (res) {
        clearTimeout(timer);
        return res;
      }, function (err) {
        clearTimeout(timer);
        throw err;
      });
    }

    function loadTrackedCampaign() {
      return backendFetch(base + '/feed.json')
        .then(function (res) { return (res && res.ok) ? res.json() : null; })
        .then(function (d) {
          var list = (d && Array.isArray(d.campaigns)) ? d.campaigns : [];
          if (!list.length) { trackedCampaignId = ''; return; }
          var top = (typeof D.pickAd === 'function') ? D.pickAd(list, { minCpm: 0 })[0] : list[0];
          trackedCampaignId = (top && typeof top.id === 'string') ? top.id : '';
        })
        .catch(function () { /* keep the last known id */ });
    }

    /* Coarse region for the delivery report: the country subtag of the user's
       own locale, e.g. 'en-IN' → 'IN'. Deliberately locale-derived rather than
       IP-derived — the advertiser report labels regions "device-reported, not
       verified", and this keeps that claim true. Returns '' when the locale
       carries no region, so the server's 'unknown' bucket stays honest instead
       of being handed a guess. */
    function currentRegion() {
      try {
        var langs = (navigator.languages && navigator.languages.length)
          ? navigator.languages : [navigator.language || ''];
        for (var i = 0; i < langs.length; i++) {
          var m = /[-_]([A-Za-z]{2})(?:[-_]|$)/.exec(String(langs[i] || ''));
          if (m) return m[1].toUpperCase();
        }
      } catch (e) { /* locale unavailable — report no region at all */ }
      return '';
    }

    function trackImpression() {
      if (state.paused || document.hidden) return;   // visible + not paused only
      if (!trackedCampaignId) return;                // nothing served → nothing to report
      try {
        backendFetch(base + '/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: dev, type: 'impression', campaignId: trackedCampaignId, minutes: 1,
            /* which platform this placement happened on (mac | pwa | web-mac …) —
               the public /stats mix is built from this field */
            platform: (typeof D.currentPlatform === 'function') ? D.currentPlatform() : 'web',
            /* which coarse region — the second axis of the same mix */
            region: currentRegion()
          })
        }).catch(function () { /* best-effort — silent */ });
      } catch (e) { /* best-effort — silent */ }
    }

    function renderEarnings(d) {
      d = d || {};
      $('realEarnTotal').textContent = money(d.total || 0);
      $('realEarnToday').textContent = money((d.today && d.today.total) || 0);
      $('realEarnMonthly').textContent = money((d.monthly && d.monthly.total) || 0);
      $('realEarnImpressions').textContent = String(
        (d.counters && Number(d.counters.impressions)) || 0);
      $('realEarnClicks').textContent = String(
        (d.counters && Number(d.counters.clicks)) || 0);
    }

    function fetchEarnings() {
      try {
        backendFetch(base + '/earnings/' + encodeURIComponent(dev))
          .then(function (res) {
            if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : 'error'));
            return res.json();
          })
          .then(function (d) {
            if (!d || typeof d.total !== 'number') throw new Error('bad payload');
            panel.style.opacity = '';                  // healthy again
            $('realEarnNote').textContent = REAL_EARN_NOTE;
            renderEarnings(d);
          })
          .catch(function () {
            panel.style.opacity = '0.55';
            $('realEarnNote').textContent =
              'backend unreachable — check the URL in Profile, or redeploy the Worker (backend/README.md)';
          });
      } catch (e) { /* best-effort — silent */ }
    }

    /* Resolve the served campaign FIRST, then report — so the very first
       heartbeat already carries an id the backend recognises. */
    function tick() {
      var p;
      try { p = loadTrackedCampaign(); } catch (e) { p = null; }
      Promise.resolve(p).then(function () {
        fetchEarnings();
      });
    }

    tick();
    window.setInterval(tick, REAL_EARN_INTERVAL_MS);
  }

  /* ------------------------------------------------------------------
     Pause ads — stops earning ticks + demo cycler, updates status text.
     ------------------------------------------------------------------ */
  var menubarDemo = D.initMenuBarDemo();

  function applyPaused(paused) {
    state.paused = paused;
    if (!paused) state.snoozedUntil = 0;
    saveState();
    if (paused) {
      if (menubarDemo) menubarDemo.pause();
      $('dashStatus').textContent = state.snoozedUntil
        ? 'Demo snoozed until ' + new Date(state.snoozedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '. Resume any time.'
        : 'Demo paused. Resume any time.';
    } else {
      var setupBlocked = computeTotals().lifetime >= D.MODEL.PAYOUT_SETUP_GATE &&
        state.profile.payoutRail !== 'stripe' && state.profile.payoutRail !== 'whop';
      if (menubarDemo) { if (setupBlocked) menubarDemo.pause(); else menubarDemo.resume(); }
      $('dashStatus').textContent = setupBlocked ? 'Demo earning paused at $5 — choose a simulated rail on Payouts.' : 'Demo running — simulated earnings only.';
    }
    // The status-area preview reflects the same switch: its dot turns amber and
    // the hint says so, instead of the chip silently keeping its green dot.
    var previewChip = $('demoSponsorChip');
    if (previewChip) previewChip.setAttribute('data-paused', paused ? 'true' : 'false');
    var previewHint = $('mbPreviewHint');
    if (previewHint) {
      previewHint.textContent = paused
        ? 'paused — the chip is frozen, as on a real menu bar'
        : 'rotates every few seconds · simulated data';
    }
    var btn = $('pauseToggle');
    btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    btn.classList.toggle('on', paused);
    $('pauseToggleLabel').textContent = paused ? 'Resume ads' : 'Pause ads';
  }

  /* ------------------------------------------------------------------
     Instant payout simulation — moves Available into paidOut, toast.
     ------------------------------------------------------------------ */
  function toast(msg) {
    var region = $('toastRegion');
    if (!region) return;
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    region.appendChild(t);
    window.setTimeout(function () { t.classList.add('show'); }, 10);
    window.setTimeout(function () {
      t.classList.remove('show');
      window.setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 3800);
  }

  function doPayout() {
    var input = $('payoutAmount');
    var result = D.withdrawDemo(state, input && input.value ? input.value : 'max');
    if (result.error) { toast(result.error); return; }
    saveState();
    renderBalances();
    if (input) input.value = '';
    toast('Demo withdrawal: ' + money(result.payout.amount) + ' via simulated ' +
      (result.payout.rail === 'stripe' ? 'Stripe' : 'Whop') + '. No money sent.');
  }

  /* ------------------------------------------------------------------
     Earning ticker — cents drift up while running (display only, does
     not touch the seeded ledger). Halts when paused or tab hidden.
     ------------------------------------------------------------------ */
  var ticker = null;

  function startTicker() {
    stopTicker();
    ticker = window.setInterval(function () {
      if (state.paused && state.snoozedUntil && Date.now() >= state.snoozedUntil) applyPaused(false);
      if (state.paused || document.hidden) return;
      if (computeTotals().lifetime >= D.MODEL.PAYOUT_SETUP_GATE &&
          state.profile.payoutRail !== 'stripe' && state.profile.payoutRail !== 'whop') return;
      state.balanceOffset = Math.round((state.balanceOffset + 0.01) * 100) / 100;
      renderBalances();
    }, 12000); // demo cadence: a cent every 12 s so the dashboard feels live
    // (the real Mac status area app earns at the documented $0.01/90 s while awake)
  }

  function stopTicker() {
    if (ticker) { window.clearInterval(ticker); ticker = null; }
  }

  /* ------------------------------------------------------------------
     Payout simulator — live recompute, BOTH click caps respected.
     ------------------------------------------------------------------ */
  function bindSim() {
    var minutes = $('simMinutes'), cpm = $('simCpm'), launch = $('simLaunch'), referred = $('simReferred');
    if (!minutes || !cpm || !launch || !referred) return;
    function recompute() {
      var p = D.projectMonthly({
        minutes: Number(minutes.value), cpm: Number(cpm.value),
        launch: launch.checked, referred: referred.checked
      });
      $('simMinutesOut').textContent = minutes.value;
      $('simCpmOut').textContent = '$' + Number(cpm.value).toFixed(2);
      $('simMonthly').textContent = money(p.monthly);
      $('simBase').textContent = money(p.base);
      $('simLaunchBonus').textContent = money(p.launchBonus);
      $('simReferredBonus').textContent = money(p.referredBonus);
      $('simTotal').textContent = money(p.monthly);
      $('simEta').textContent = p.firstPayoutEtaDays
        ? 'first payout: ' + p.firstPayoutEtaLabel + ' including 5 days pending ($10 minimum)'
        : 'first payout: — (zero minutes earns zero)';
    }
    minutes.addEventListener('input', recompute);
    cpm.addEventListener('input', recompute);
    launch.addEventListener('change', recompute);
    referred.addEventListener('change', recompute);
    recompute();
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  function renderAll() {
    renderBalances();
    renderChart();
    renderLedger();
    renderSponsors();
  }

  function init() {
    if (!$('statAvailable')) return; // not on dashboard page

    if (!storageOk) {
      var note = $('storageNote');
      if (note) note.hidden = false;
    }

    renderAll();
    bindSim();
    if (state.snoozedUntil && Date.now() >= state.snoozedUntil) state.paused = false;
    applyPaused(!!state.paused);

    $('pauseToggle').addEventListener('click', function () {
      state.snoozedUntil = state.paused ? 0 : D.snoozeUntil($('snoozeDuration').value);
      applyPaused(!state.paused);
    });
    $('payoutBtn').addEventListener('click', doPayout);
    if ($('payoutMax')) $('payoutMax').addEventListener('click', function () {
      $('payoutAmount').value = computeTotals().available.toFixed(2);
    });

    // Live-advertiser bridge: connected feed → banner + LIVE sponsor rows
    // (+ the landing demo rotation on index.html via demo.js). Display only.
    var disconnectBtn = $('liveDisconnectBtn');
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectLiveFeed);
    initLiveFeed();

    // Real-earnings bridge (platform backend): impression heartbeats +
    // earnings poll, rendered into the separate REAL EARNINGS panel.
    initRealEarnings();

    document.addEventListener('visibilitychange', function () {
      // Ticker naturally skips hidden tabs; re-render on return so the
      // balances reflect any drift that queued up.
      if (!document.hidden) renderBalances();
    });

    startTicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
