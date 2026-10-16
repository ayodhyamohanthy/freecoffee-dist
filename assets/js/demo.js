/* ==========================================================================
   FreeCoffee demo engine — seeded, deterministic, zero dependencies.
   All data on this site is simulated. Nothing here talks to a network.

   Exposed two ways:
     window.FreeCoffeeDemo        (browser)
     module.exports = FreeCoffeeDemo  (CommonJS, so `node` can require it)

   Deterministic guarantee: every PRNG draw flows through ONE mulberry32
   stream seeded from `SEED`. Timestamps are anchored to a FIXED demo
   epoch (ANCHOR_TS = 2026-09-06T00:00:00Z), never to Date.now() — so
   generateHistory(42) returns byte-identical JSON on every call.

   Coffee conversion: balances also display as "≈ N cups" — 1 cup = $5,
   floor(balance / 5).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.FreeCoffeeDemo = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEED = 42;
  var CUP_PRICE = 5; // $5 buys a coffee — cups hint = floor(balance / 5)

  /* ------------------------------------------------------------------
     Seeded PRNG (mulberry32).
     ------------------------------------------------------------------ */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------
     Model constants — mirror the copy on payouts.html exactly.
     ------------------------------------------------------------------ */
  var MODEL = {
    VERSION: 3,
    BASE_SHARE: 0.70,
    LAUNCH_BOOST: 0.10,
    REFERRED_RATE: 0.05,
    REFERRAL_DAYS: 30,
    REFERRAL_ATTRIBUTION_DAYS: 14,
    PAYOUT_PENDING_DAYS: 5,
    PAYOUT_SETUP_GATE: 5,
    TIERS: {
      1: { name: 'Tier 1', regions: 'US, CA, UK, CH, EEA', floorCPM: 4.0 },
      2: { name: 'Tier 2', regions: 'AU, NZ, JP, KR, SG, AE', floorCPM: 2.5 },
      3: { name: 'Tier 3', regions: 'Rest of world', floorCPM: 1.25 }
    },
    REFERRAL_RATE: 0.05,
    PAYOUT_MINIMUM: 10.0,
    CLAWBACK_DAYS: 90,            // fraud clawback window
    CUP_PRICE: CUP_PRICE,         // $5 per cup for the "≈ N cups" hint
    // Worked example, displayed as-is on payouts.html.
    WORKED_EXAMPLE: {
      impressions: 1000, cpm: 6.0,
      revenue: 6.0, userBase: 4.20, launchBoost: 0.60,
      referrerBonus: 0.21, referredBonus: 0.21, platformKeeps: 0.78
    },
    // Competitor benchmark block removed from copy — the product stands on
    // its own published economics (AD_ECON + SUSTAINABILITY above).
    BENCHMARKS_REMOVED: true
  };

  /* ------------------------------------------------------------------ */
  var SPONSORS = [
    { name: 'Northline',       tag: 'Shipping software, on schedule', bid: 6.0 },
    { name: 'Ledgerly',        tag: 'Invoicing that reconciles itself', bid: 5.25 },
    { name: 'Fernhill Coffee', tag: 'Single-origin, roasted Thursdays', bid: 4.5 },
    { name: 'Breeze VPN',      tag: 'Private tunnels, zero logs', bid: 5.5 },
    { name: 'Kite Studio',     tag: 'A type foundry for busy apps', bid: 4.0 }
  ];

  var DAY_MS = 86400000;
  var ANCHOR_TS = 1788652800000; // FIXED demo clock: 2026-09-06T00:00:00Z

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtTime(ts) {
    var d = new Date(ts);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) +
      ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ' UTC';
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDay(ts) {
    var d = new Date(ts);
    return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /* "≈ N cups" — 1 cup costs $5. */
  function normalizeState(state) {
    state = state && typeof state === 'object' ? state : {};
    if (!state.history || !state.history.model || state.history.model.VERSION !== MODEL.VERSION) {
      state.history = generateHistory(SEED);
      state.paidOut = [];
      state.balanceOffset = 0;
    }
    if (!Array.isArray(state.paidOut)) state.paidOut = [];
    if (!state.profile || typeof state.profile !== 'object') state.profile = {};
    return state;
  }

  function demoBalances(state) {
    state = normalizeState(state);
    var hist = state.history;
    var lifetime = 0, pending = 0, week = 0, paid = 0;
    hist.ledger.forEach(function (row) {
      lifetime += row.cut;
      if (row.ts > hist.totals.anchorTs - MODEL.PAYOUT_PENDING_DAYS * DAY_MS) pending += row.cut;
      if (row.ts >= hist.totals.anchorTs - 7 * DAY_MS) week += row.cut;
    });
    state.paidOut.forEach(function (row) { paid += Number(row.amount) || 0; });
    var offset = Math.max(0, Number(state.balanceOffset) || 0);
    return {
      lifetime: round2(lifetime + offset), pending: round2(pending + offset),
      available: Math.max(0, round2(lifetime - pending - paid)),
      week: round2(week), paid: round2(paid), rows: hist.ledger.length
    };
  }

  function withdrawDemo(state, requested) {
    var totals = demoBalances(state);
    var rail = state.profile.payoutRail;
    if (totals.lifetime < MODEL.PAYOUT_SETUP_GATE) return { error: 'Payout setup unlocks at $5 in demo earnings.' };
    if (rail !== 'stripe' && rail !== 'whop') return { error: 'Choose a simulated Stripe or Whop rail on Payouts first.' };
    var amount = requested === 'max' ? totals.available : Number(requested);
    if (!isFinite(amount) || amount < MODEL.PAYOUT_MINIMUM || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
      return { error: 'Enter at least $10.00, using no more than two decimal places.' };
    }
    amount = round2(amount);
    if (amount > totals.available) return { error: 'Amount exceeds available demo funds. Pending earnings cannot be withdrawn.' };
    var payout = { ts: Date.now(), amount: amount, rail: rail, simulated: true };
    state.paidOut.push(payout);
    return { payout: payout };
  }

  function snoozeUntil(duration, now) {
    var start = typeof now === 'number' ? now : Date.now();
    if (duration === 'restday') {
      var end = new Date(start);
      end.setHours(24, 0, 0, 0);
      return end.getTime();
    }
    var minutes = { '30m': 30, '2h': 120, '6h': 360 }[duration];
    return minutes ? start + minutes * 60000 : 0;
  }

  function cups(balance) {
    return Math.max(0, Math.floor((Number(balance) || 0) / CUP_PRICE));
  }

  /* ------------------------------------------------------------------
     Live-advertiser feed bridge — the pluggable AD FEED CONTRACT.

     A feed is any HTTPS URL returning a JSON array of campaigns:
       [
         {
           "id": "camp_001",
           "sponsor": "Acme Coffee Co.",
           "tagline": "Single-origin beans — 20% off first bag",
           "clickUrl": "https://advertiser.example/offer?utm_source=freecoffee",
           "cpm": 6.0,
           "logoText": "AC",
           "accent": "#C98F4E"
         }
       ]

     fetchLiveCampaigns(feedUrl) → Promise<{campaigns, error}> — NEVER throws.
       • 8 s AbortController timeout
       • strict validation: https-only URLs (clickUrl must match the same
         /^https?:\/\//i rule as every other URL here — http links are dropped),
         strings trimmed + length-capped (sponsor 40, tagline 90, logoText 2,
         id 40), cpm coerced to a number clamped 0–100, accent validated
         /^#[0-9a-fA-F]{6}$/ (else the default caramel)
       • dedupe by id, cap 20 campaigns
       • invalid entries are skipped; the promise only rejects nothing —
         failures come back as {error: '...'} with campaigns: [].

     Live campaigns NEVER touch the ledger — they render only.
     ------------------------------------------------------------------ */
  var LIVE_LIMITS = {
    MAX_CAMPAIGNS: 20,
    TIMEOUT_MS: 8000,
    ID: 40,
    SPONSOR: 40,
    TAGLINE: 90,
    LOGO_TEXT: 2,
    URL: 500,
    CPM_MIN: 0,
    CPM_MAX: 100,
    DEFAULT_ACCENT: '#C98F4E'
  };

  function capStr(val, max) {
    if (typeof val !== 'string') return '';
    return val.replace(/^\s+|\s+$/g, '').slice(0, max);
  }

  function isValidHttpsUrl(val) {
    if (typeof val !== 'string') return false;
    if (!/^https?:\/\//i.test(val)) return false;   // same URL rule as everywhere else
    return /^https:\/\//i.test(val);                // feeds are https-only
  }

  function fetchLiveCampaigns(feedUrl) {
    return new Promise(function (resolve) {
      var timer = null;
      function fail(msg) {
        if (timer) { clearTimeout(timer); timer = null; }
        resolve({ campaigns: [], error: msg });
      }

      if (typeof feedUrl !== 'string' || !isValidHttpsUrl(feedUrl)) {
        fail('Feed URL must be an https:// URL');
        return;
      }

      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      // Always arm the timeout — without AbortController the late fetch
      // still resolves into a settled promise (harmless no-op).
      timer = setTimeout(function () {
        if (controller) { try { controller.abort(); } catch (e) { /* noop */ } }
        fail('Feed fetch timed out after ' + LIVE_LIMITS.TIMEOUT_MS + ' ms');
      }, LIVE_LIMITS.TIMEOUT_MS);

      var opts = controller ? { signal: controller.signal } : {};
      fetch(feedUrl, opts).then(function (res) {
        if (!res || !res.ok) { fail('Feed fetch failed — HTTP ' + (res ? res.status : 'error')); return; }
        return res.text().then(function (text) {
          var data;
          try { data = JSON.parse(text); } catch (e) { fail('Feed is not valid JSON'); return; }
          if (!Array.isArray(data)) { fail('Feed must be a JSON array of campaigns'); return; }

          var seen = Object.create(null);
          var out = [];
          for (var i = 0; i < data.length && out.length < LIVE_LIMITS.MAX_CAMPAIGNS; i++) {
            var raw = data[i];
            if (!raw || typeof raw !== 'object') continue;

            var sponsor = capStr(raw.sponsor, LIVE_LIMITS.SPONSOR);
            var tagline = capStr(raw.tagline, LIVE_LIMITS.TAGLINE);
            var id = capStr(raw.id, LIVE_LIMITS.ID) || ('camp_' + (i + 1));
            var click = isValidHttpsUrl(capStr(raw.clickUrl, LIVE_LIMITS.URL)) ? capStr(raw.clickUrl, LIVE_LIMITS.URL) : '';
            if (!sponsor) continue;               // a campaign without a name is unusable

            // cpm: coerce to a finite number, clamp 0–100 (informational —
            // live campaigns never inject earnings into the ledger).
            var cpm = Number(raw.cpm);
            if (!isFinite(cpm)) cpm = 0;
            cpm = Math.min(LIVE_LIMITS.CPM_MAX, Math.max(LIVE_LIMITS.CPM_MIN, cpm));

            var logo = capStr(raw.logoText, LIVE_LIMITS.LOGO_TEXT) ||
              sponsor.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
            var accent = (typeof raw.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.accent))
              ? raw.accent : LIVE_LIMITS.DEFAULT_ACCENT;

            if (seen[id]) continue;               // dedupe by id
            seen[id] = true;
            out.push({
              id: id,
              sponsor: sponsor,
              tagline: tagline,
              clickUrl: click,
              cpm: cpm,
              logoText: logo,
              accent: accent
            });
          }
          if (timer) clearTimeout(timer);
          resolve({ campaigns: out, error: out.length ? null : 'Feed contained no valid campaigns' });
        });
      }).catch(function () {
        if (timer) clearTimeout(timer);
        fail('Feed fetch failed — network error, timeout, or blocked URL');
      });
    });
  }

  /* ------------------------------------------------------------------
     pickAd(campaigns, opts) — the highest-bid-wins auction selector.

     opts = { minCpm (number, default 0), count (default campaigns.length) }
     Returns a NEW array: eligible campaigns (cpm >= minCpm) sorted by
     cpm DESC, ties broken by id ASC, capped at count. The input array is
     never mutated and the campaign objects are handed back as-is; bad
     input (null, non-array, garbage rows) never throws — garbage rows are
     skipped and a non-array input yields []. Missing/invalid cpm coerces
     to 0, so lowball and malformed bids sort to the back, never crash.
     ------------------------------------------------------------------ */
  function pickAd(campaigns, opts) {
    try {
      if (!Array.isArray(campaigns)) return [];
      var minCpm = (opts && opts.minCpm !== undefined) ? Number(opts.minCpm) : 0;
      if (!isFinite(minCpm) || minCpm < 0) minCpm = 0;
      var count = (opts && opts.count !== undefined) ? Number(opts.count) : campaigns.length;
      if (!isFinite(count) || count < 0) count = campaigns.length;

      var entries = [];
      for (var i = 0; i < campaigns.length; i++) {
        var c = campaigns[i];
        if (!c || typeof c !== 'object') continue;        // skip garbage rows
        var cpm = Number(c.cpm);
        if (!isFinite(cpm)) cpm = 0;
        if (cpm < minCpm) continue;                       // below the floor → out
        var id = typeof c.id === 'string' ? c.id : '';
        entries.push({ c: c, cpm: cpm, id: id });
      }
      entries.sort(function (a, b) {
        if (b.cpm !== a.cpm) return b.cpm - a.cpm;        // highest CPM first
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);  // ties: id ASC
      });
      var out = [];
      for (var j = 0; j < entries.length && out.length < count; j++) out.push(entries[j].c);
      return out;
    } catch (e) {
      return [];
    }
  }

  /* ------------------------------------------------------------------
     generateHistory(seed) → deterministic demo ledger + totals.

     ~9 days ending just before the fixed anchor. Each day produces
     40–50 sponsored flights (10–25 minute-long impressions each — a
     fully-filled waking day), plus verified clicks, one completed
     5-day streak block, and daily referral accrual rows. ~460 rows.
     ------------------------------------------------------------------ */
  function generateHistory(seed) {
    var rand = mulberry32(typeof seed === 'number' ? seed : SEED);

    var DAYS = 9;                  // day 0 oldest … day 8 = day before anchor
    var ledger = [];
    var lifetime = 0;
    var clicks = 0;
    var impressions = 0;

    // Weighted tier mix for the (simulated) audience region of each flight:
    // Tier1 ~55%, Tier2 ~25%, Tier3 ~20%.
    function drawTier() {
      var r = rand();
      if (r < 0.55) return 1;
      if (r < 0.80) return 2;
      return 3;
    }

    function drawSponsor() {
      return SPONSORS[Math.floor(rand() * SPONSORS.length)];
    }

    var d, i;

    for (d = 0; d < DAYS; d++) {
      var dayStart = ANCHOR_TS - (DAYS - d) * DAY_MS;

      // Fill ~15 waking hours (07:00–22:59) with back-to-back flights.
      var targetMinutes = 850 + Math.floor(rand() * 60); // 850–909
      var filled = 0;
      var cursorHour = 7;
      var cursorMin = 0;

      while (filled < targetMinutes && cursorHour < 23) {
        var sp = drawSponsor();
        var count = 10 + Math.floor(rand() * 16);         // 10–25 min flight
        if (filled + count > targetMinutes) count = targetMinutes - filled;
        if (count < 5) break;

        // Winning CPM bid wobbles around the sponsor's base bid.
        var bid = round2(sp.bid * (0.88 + rand() * 0.24));
        if (bid < 0.75) bid = 0.75;

        var tier = drawTier();
        var ts = dayStart + cursorHour * 3600000 + cursorMin * 60000;

        var cut = round2(count * bid * MODEL.BASE_SHARE / 1000);

        ledger.push({
          ts: ts, timeLabel: fmtTime(ts),
          sponsor: sp.name, type: 'impression',
          bid: bid, cut: cut, tier: tier, count: count,
          note: 'demo flight of ' + count + ' minute-long placements · 70% base share'
        });
        var boost = round2(count * bid * MODEL.LAUNCH_BOOST / 1000);
        var referred = round2(cut * MODEL.REFERRED_RATE);
        ledger.push({
          ts: ts, timeLabel: fmtTime(ts), sponsor: sp.name, type: 'launch',
          bid: bid, cut: boost, tier: tier, count: count,
          note: 'demo launch boost · 10% of auction revenue, platform-funded'
        });
        ledger.push({
          ts: ts, timeLabel: fmtTime(ts), sponsor: sp.name, type: 'referred',
          bid: cut, cut: referred, tier: tier, count: count,
          note: 'demo referred-user bonus · 5% of base earnings in first 30 days, platform-funded'
        });
        lifetime += cut + boost + referred;
        impressions += count;
        filled += count;

        // Advance the clock by the flight length + a small gap.
        cursorMin += count + 1 + Math.floor(rand() * 3);
        while (cursorMin >= 60) { cursorMin -= 60; cursorHour++; }
      }

    }

    var t;
    var referrals = [
      { name: 'astra.dev', verified: true, dailyBase: 2.55, days: DAYS,
        status: 'Demo · day 9 of 30' },
      { name: 'quill@mac', verified: true, dailyBase: 1.90, days: 3,
        status: 'Demo · day 3 of 30' }
    ];
    var rr;
    for (rr = 0; rr < referrals.length; rr++) {
      var refName = referrals[rr].name;
      var refDays = Math.min(referrals[rr].days, MODEL.REFERRAL_DAYS);
      for (i = 0; i < refDays; i++) {
        var rDay = ANCHOR_TS - (refDays - i) * DAY_MS;
        var wob = 0.85 + rand() * 0.3;
        var rBase = round2(referrals[rr].dailyBase * wob);
        var rTs = rDay + 21 * 3600000 + Math.floor(rand() * 60) * 60000;
        var rCut = round2(rBase * MODEL.REFERRAL_RATE);
        ledger.push({
          ts: rTs, timeLabel: fmtTime(rTs),
          sponsor: refName + ' (referral)', type: 'referral',
          bid: rBase, cut: rCut, tier: 1, count: 1,
          note: 'demo referral · 5% of referred-user base earnings · first 30 days · platform-funded'
        });
        lifetime += rCut;
      }
    }

    ledger.sort(function (a, b) { return b.ts - a.ts; }); // newest first

    // ---- Totals, computed FROM the ledger so invariants hold by construction.
    // Pending = the newest 24 h of rows; Available = everything older.
    var CUTOFF = ANCHOR_TS;
    var pendingSum = 0;
    for (t = 0; t < ledger.length; t++) {
      if (ledger[t].ts > CUTOFF - MODEL.PAYOUT_PENDING_DAYS * DAY_MS) pendingSum += ledger[t].cut;
    }
    var lifetimeRounded = round2(lifetime);
    var pendingRounded = round2(pendingSum);
    var available = round2(lifetimeRounded - pendingRounded);

    // 7-day buckets (byDay[0] = 7 days back … byDay[6] = day before anchor).
    var byDay = [0, 0, 0, 0, 0, 0, 0];
    var byTier = { 1: 0, 2: 0, 3: 0 };
    var dayLabels = [];
    for (d = 0; d < 7; d++) {
      var wEnd = ANCHOR_TS - (6 - d) * DAY_MS;   // exclusive end
      var wStart = wEnd - DAY_MS;
      var sum = 0;
      for (t = 0; t < ledger.length; t++) {
        var row = ledger[t];
        if (row.ts >= wStart && row.ts < wEnd) {
          sum += row.cut;
          byTier[row.tier] += row.cut;
        }
      }
      byDay[d] = round2(sum);
      dayLabels.push(fmtDay(wEnd - 1));
    }
    for (var tk in byTier) byTier[tk] = round2(byTier[tk]);

    // Referral accrued sums, straight from the ledger.
    for (rr = 0; rr < referrals.length; rr++) {
      var acc = 0;
      for (t = 0; t < ledger.length; t++) {
        if (ledger[t].type === 'referral' &&
            ledger[t].sponsor.indexOf(referrals[rr].name) === 0) acc += ledger[t].cut;
      }
      referrals[rr].accrued = round2(acc);
    }

    var totals = {
      available: available,
      pending: pendingRounded,
      lifetime: lifetimeRounded,
      byDay: byDay,
      dayLabels: dayLabels,
      byTier: byTier,
      clicks: clicks,
      impressions: impressions,
      rows: ledger.length,
      referrals: referrals,
      anchorTs: ANCHOR_TS,
      cutoffTs: CUTOFF,
      seed: (typeof seed === 'number' ? seed : SEED),
      daysGenerated: DAYS
    };

    return {
      ledger: ledger,
      totals: totals,
      model: MODEL,
      sponsors: SPONSORS,
      fmtTime: fmtTime,
      fmtDay: fmtDay
    };
  }

  function projectMonthly(opts) {
    var minutes = Math.max(0, Math.min(600, Number(opts.minutes) || 0));
    var cpm = Math.max(1, Math.min(8, Number(opts.cpm) || 1));
    var launchOn = opts.launch !== false;
    var referredOn = !!opts.referred;

    var DAYS = 30;
    var dailyImpressions = Math.round(minutes);        // 1 impression per active minute
    var impressions = dailyImpressions * DAYS;         // monthly
    var gross = impressions * cpm / 1000;
    var base = gross * MODEL.BASE_SHARE;

    var launchBonus = launchOn ? gross * MODEL.LAUNCH_BOOST : 0;
    var referredBonus = referredOn ? base * MODEL.REFERRED_RATE : 0;
    var monthly = round2(base + launchBonus + referredBonus);
    var daily = monthly / DAYS;
    var etaDays = daily > 0 ? Math.ceil(MODEL.PAYOUT_MINIMUM / daily) + MODEL.PAYOUT_PENDING_DAYS : null;

    return {
      monthly: monthly,
      daily: round2(daily),
      gross: round2(gross),
      base: round2(base),
      launchBonus: round2(launchBonus),
      referredBonus: round2(referredBonus),
      impressions: impressions,
      dailyImpressions: dailyImpressions,
      firstPayoutEtaDays: etaDays,
      firstPayoutEtaLabel: etaDays === null ? '—'
        : (etaDays === 1 ? '~1 day' : '~' + etaDays + ' days')
    };
  }

  /* ------------------------------------------------------------------
     Browser-only: Mac status area cycler + live clock + balance ticker for the
     landing hero, plus the popover web mock (totals + 7-day bars).
     Respects prefers-reduced-motion; pauses when document.hidden;
     freezes when the demo is paused.
     ------------------------------------------------------------------ */
  function initMenuBarDemo() {
    if (typeof document === 'undefined') return null;

    var chip = document.getElementById('demoSponsorChip');
    var tag = document.getElementById('demoSponsorTag');
    var clock = document.getElementById('demoClock');
    var balance = document.getElementById('demoBalance');
    var cupsEl = document.getElementById('demoCups');
    var chartEl = document.getElementById('demoChart');
    var weekSum = document.getElementById('demoWeekSum');
    var bar = document.getElementById('demoMenuBar');
    /* Popover mock mirrors the bar chip. These used to be hardcoded figures in
       the HTML, which let the popover and the live-ticking chip disagree. */
    var popTotal = document.getElementById('popBalance');
    var popAvailable = document.getElementById('popAvailable');
    var popPending = document.getElementById('popPending');
    if (!chip && !clock && !balance && !chartEl) return null;

    var reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { reduced = false; }

    // Balance starts at the seeded ledger's lifetime so the landing demo
    // and the dashboard tell the same story.
    var balanceCents = 226;
    var pendingCents = 0;                 // seeded pending bucket (mirrors the popover split)
    var history = null;
    try {
      history = generateHistory(SEED);
      balanceCents = Math.round((history.totals.available + history.totals.pending) * 100);
      pendingCents = Math.round(history.totals.pending * 100);
    } catch (e) { /* keep fallback */ }

    // Popover web mock: 7 inset bars (weekday letter + value label) from
    // the seeded history's 7-day buckets. Static — built once.
    if (chartEl && history) {
      var byDay = history.totals.byDay;
      var letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      var max = 0, i;
      for (i = 0; i < byDay.length; i++) if (byDay[i] > max) max = byDay[i];
      if (max <= 0) max = 1;
      // Weekday letters for the 7 bucket days, ending the day before the anchor.
      var anchor = history.totals.anchorTs;
      for (i = 0; i < byDay.length; i++) {
        var col = document.createElement('span');
        col.className = 'pop-barcol';
        var val = document.createElement('span');
        val.className = 'pop-barval';
        val.textContent = '$' + byDay[i].toFixed(2);
        var b = document.createElement('span');
        b.className = 'pop-bar';
        b.style.height = Math.max(4, Math.round((byDay[i] / max) * 100)) + '%';
        var wd = new Date(anchor - (7 - i) * DAY_MS).getUTCDay();
        var letter = document.createElement('span');
        letter.className = 'pop-letter';
        letter.textContent = letters[wd];
        col.appendChild(val); col.appendChild(b); col.appendChild(letter);
        chartEl.appendChild(col);
      }
      if (weekSum) {
        var wk = 0;
        for (i = 0; i < byDay.length; i++) wk += byDay[i];
        weekSum.textContent = '$' + round2(wk).toFixed(2) + ' this week';
      }
    }

    // Display cycle order is shuffled per visit (display only — history
    // stays seed-42 canonical).
    var order = SPONSORS.slice();
    var crand = mulberry32(((Date.now() & 0xffff) | 1) >>> 0);
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(crand() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }

    // Public landing page only: the example advertiser is skipwait.me, with
    // its own name, tagline and icon. Display only; the ledger is untouched.
    if (document.body && document.body.classList.contains('fc-public')) {
      order = [{ name: 'skipwait.me', tag: 'Free job referrals. A warmer way in.', bid: 0, icon: 'assets/img/skipwait-icon.svg' }];
    }

    var idx = 0;
    var paused = false;
    var chipTimer = null;
    var balTimer = null;

    // Live campaigns (real advertiser bridge): when non-empty, the chip and
    // tag line rotate through THEM instead of the fictional sponsors — in
    // auction order, highest CPM first — and a "LIVE CAMPAIGN · $X.XX CPM"
    // micro-label replaces the "Current winning sponsor" title. Display
    // only — never touches the seeded ledger.
    var liveCampaigns = [];

    /* Two sponsor shapes meet here:
         • built-in demo sponsors — { name, tag, bid }
         • live campaigns (AD FEED CONTRACT) — { id, sponsor, tagline, clickUrl,
           cpm, logoText, accent }
       Resolve both, so a connected live feed never renders the literal string
       "undefined" into the chip, and its tagline is never silently dropped. */
    function chipName(c) { return (c && (c.sponsor || c.name)) || ''; }
    function chipTag(c) { return (c && (c.tagline || c.tag)) || ''; }

    /* Monogram for the chip tile: the campaign's logoText when the feed
       supplied one, else word initials — the same rule as the native chip. */
    function chipMonogram(name, sp) {
      var t = (sp && typeof sp.logoText === 'string') ? sp.logoText.replace(/^\s+|\s+$/g, '') : '';
      if (t) return t.slice(0, 2).toUpperCase();
      var parts = String(name || '').split(/\s+/).filter(Boolean);
      var initials = parts.map(function (w) { return w.charAt(0); }).join('');
      return (initials.slice(0, 2) || 'FC').toUpperCase();
    }

    function renderChip() {
      var useLive = liveCampaigns.length > 0;
      var sp = useLive ? liveCampaigns[idx % liveCampaigns.length] : order[idx % order.length];
      var name = chipName(sp);
      var sub = chipTag(sp);
      var liveCpm = Number(sp && sp.cpm);

      /* Two markup shapes are supported:
           • structured menu-bar chip — .mb-chip-mark / .mb-chip-copy
             (title + description INSIDE the bar, like the native pill)
           • legacy single-line chip  — one text node
         The structured path is preferred; the fallback keeps any older page
         working instead of throwing on a missing node. */
      var head = null, small = null, mark = null;
      if (chip && chip.querySelector) {
        head = chip.querySelector('.mb-chip-copy strong');
        small = chip.querySelector('.mb-chip-copy small');
        mark = chip.querySelector('.mb-chip-mark');
      }
      var structured = !!(head && small);

      if (chip) {
        if (structured) {
          head.textContent = name;
          small.textContent = sub;
          if (mark) {
            if (sp && sp.icon) {
              mark.textContent = '';
              mark.style.backgroundImage = 'url(' + sp.icon + ')';
              mark.style.backgroundSize = 'cover';
              mark.style.backgroundColor = '#fff';
            } else {
              mark.style.backgroundImage = '';
              mark.textContent = chipMonogram(name, sp);
            }
            // A live campaign's validated accent tints the TILE, not the whole
            // pill (a full-colour bar chip looks like a badge, not an ad slot).
            if (useLive && sp.accent && /^#[0-9a-fA-F]{6}$/.test(sp.accent)) {
              mark.style.backgroundColor = sp.accent;
            } else {
              mark.style.backgroundColor = '';
            }
          }
        } else {
          chip.textContent = name + (sub ? ' — ' + sub : '');
        }
        chip.setAttribute('title', useLive
          ? 'LIVE CAMPAIGN — ' + name + (sub ? ' — ' + sub : '')
          : 'Current winning sponsor (fictional demo sponsor)');
        if (!structured) {
          chip.style.backgroundColor = (useLive && sp.accent && /^#[0-9a-fA-F]{6}$/.test(sp.accent))
            ? sp.accent : '';
        }
      }

      if (tag) {
        tag.textContent = '';
        if (useLive) {
          // Micro-label first: the winning bid is always visible, and the
          // destination rule is stated rather than implied.
          var label = document.createElement('span');
          label.className = 'mb-live-label';
          label.textContent = 'LIVE CAMPAIGN · $' + (isFinite(liveCpm) ? liveCpm : 0).toFixed(2) + ' CPM';
          tag.appendChild(label);
          tag.appendChild(document.createTextNode(structured
            ? 'validated https destination · highest bid wins the minute'
            : sub));
        } else {
          tag.appendChild(document.createTextNode(structured
            ? (order.length === 1 && order[0].icon
                ? 'Example advertiser, not a paid campaign — display only, nothing is collected.'
                : 'Fictional demo sponsor (simulated) — display only, nothing is collected.')
            : sub));
        }
      }
    }

    function renderClock() {
      if (!clock) return;
      var now = new Date();
      var h12 = now.getHours() % 12; if (h12 === 0) h12 = 12;
      clock.textContent = h12 + ':' + pad2(now.getMinutes()) + ' ' +
        (now.getHours() < 12 ? 'AM' : 'PM');
    }

    function renderBalance() {
      var dollars = balanceCents / 100;
      if (balance) balance.textContent = '$' + dollars.toFixed(2);
      if (cupsEl) cupsEl.textContent = '≈ ' + cups(dollars) + ' cups of coffee';
      // Popover mock: same numbers as the bar chip, with available + pending
      // always summing to the total (the demo ledger's own invariant).
      var pendingDollars = pendingCents / 100;
      if (popTotal) popTotal.textContent = '$' + dollars.toFixed(2);
      if (popPending) popPending.textContent = '$' + pendingDollars.toFixed(2);
      if (popAvailable) {
        popAvailable.textContent = '$' + Math.max(0, dollars - pendingDollars).toFixed(2);
      }
    }

    function tickBalance() {
      if (paused || document.hidden || reduced) return;
      if (crand() < 0.5) {
        balanceCents += 1 + Math.floor(crand() * 3); // a cent or three
        renderBalance();
      }
    }

    function advanceChip() {
      if (paused || document.hidden || reduced) return;
      idx++;
      renderChip();
    }

    function startTimers() {
      if (reduced) return; // static frame under reduced motion
      clearInterval(chipTimer); clearInterval(balTimer);
      chipTimer = setInterval(advanceChip, 6000);
      balTimer = setInterval(tickBalance, 4500);
    }

    function stopTimers() {
      clearInterval(chipTimer); clearInterval(balTimer);
    }

    function markLive() {
      if (bar) {
        bar.setAttribute('data-live',
          (!paused && !document.hidden && !reduced) ? 'true' : 'false');
      }
    }

    renderChip(); renderClock(); renderBalance(); markLive();

    // Clock ticks every second (a text update — not motion). Under
    // reduced motion we still show the real time, once per minute.
    setInterval(function () {
      if (document.hidden) return;
      renderClock();
    }, reduced ? 60000 : 1000);

    startTimers();

    // ---- Live campaign bridge (AD FEED CONTRACT) ---------------------------
    // If a real advertiser feed is connected (profile page →
    // freecoffee:v1 → profile.adFeedUrl), fetch it and rotate the chip/tag
    // through the validated campaigns, updating the landing caption. Any
    // failure leaves the fictional sponsors showing. Display only — the
    // seeded ledger is never touched.
    (function loadLiveCampaigns() {
      var feedUrl = null;
      try {
        var raw = window.localStorage.getItem('freecoffee:v1');
        var s = raw ? JSON.parse(raw) : null;
        if (s && s.profile && typeof s.profile.adFeedUrl === 'string' && s.profile.adFeedUrl) {
          feedUrl = s.profile.adFeedUrl;
        }
      } catch (e) { feedUrl = null; }
      if (!feedUrl || typeof fetch !== 'function') return;
      fetchLiveCampaigns(feedUrl).then(function (res) {
        if (!res || res.error || !res.campaigns || !res.campaigns.length) return;
        // Auction order: highest CPM first (pickAd never mutates the input).
        liveCampaigns = pickAd(res.campaigns);
        idx = 0;
        renderChip();
        // Landing-page caption + footnote go live-aware (index.html demo).
        var demoBox = bar && bar.closest ? bar.closest('.menubar-demo') : null;
        var note = demoBox ? demoBox.querySelector('.menubar-note') : null;
        if (note) {
          note.textContent = '';
          var dot = document.createElement('span');
          dot.className = 'live-dot';
          dot.setAttribute('aria-hidden', 'true');
          note.appendChild(dot);
          note.appendChild(document.createTextNode(' LIVE — ' + liveCampaigns.length +
            ' live campaign' + (liveCampaigns.length === 1 ? '' : 's') +
            ' connected: this mock Mac status area rotates your real feed.'));
        }
        var foot = demoBox ? demoBox.querySelector('.menubar-footnote') : null;
        if (foot) {
          foot.textContent = 'Sponsor chip rotates campaigns from your connected live feed (validated https URLs). ' +
            'Live-campaign earnings settle once the platform backend is live — the demo ledger stays simulated.';
        }
      }).catch(function () { /* fetchLiveCampaigns never throws — belt and braces */ });
    })();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopTimers(); else startTimers();
      renderClock(); markLive();
    });

    return {
      pause: function () { paused = true; stopTimers(); markLive(); },
      resume: function () { paused = false; startTimers(); markLive(); },
      isPaused: function () { return paused; },
      /* Live-advertiser bridge: hand in validated campaigns (or []) to swap
         the chip/tag rotation over to them (or back to the fictional
         sponsors). The rotation walks pickAd() order — highest CPM first.
         Display only — the ledger is never touched. */
      applyLiveCampaigns: function (campaigns) {
        liveCampaigns = (Array.isArray(campaigns) && campaigns.length)
          ? pickAd(campaigns).slice(0, 20) : [];
        idx = 0;
        renderChip();
      }
    };
  }

  /* ------------------------------------------------------------------
     Platform-backend bridge (REAL earnings, not the demo ledger).

     deviceId() — stable ANONYMOUS device id: a random UUID v4 created
     once and kept in localStorage `freecoffee:device`. This is the only
     identifier the backend ever sees — no account, no email, no PII.
     Returns '' when storage is unavailable (node, private mode): real
     tracking then silently stays off.

     backendBase() — the configured platform-backend base URL
     (profile page → freecoffee:v1 → profile.backendUrl), trimmed,
     trailing slashes stripped, '' when unset. An empty value means the
     site runs 100% offline-demo: nothing ever leaves the browser.

     Both are browser-only by design — under `node` they return '' and
     the demo engine is untouched.
     ------------------------------------------------------------------ */
  var DEVICE_STORE_KEY = 'freecoffee:device';

  function deviceId() {
    if (typeof window === 'undefined') return '';
    try {
      if (!window.localStorage) return '';
      var existing = window.localStorage.getItem(DEVICE_STORE_KEY);
      if (existing && /^[a-f0-9-]{8,64}$/i.test(existing)) return existing;
      var id;
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        id = window.crypto.randomUUID();
      } else {
        // RFC 4122 v4 fallback — Math.random is fine for a non-secret id.
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = Math.random() * 16 | 0;
          var v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }
      window.localStorage.setItem(DEVICE_STORE_KEY, id);
      return id;
    } catch (e) { return ''; }
  }

  function backendBase() {
    if (typeof window === 'undefined') return '';
    try {
      if (!window.localStorage) return '';
      var raw = window.localStorage.getItem('freecoffee:v1');
      var s = raw ? JSON.parse(raw) : null;
      var url = (s && s.profile && typeof s.profile.backendUrl === 'string')
        ? s.profile.backendUrl : '';
      return url.replace(/^\s+|\s+$/g, '').replace(/\/+$/, '');
    } catch (e) { return ''; }
  }

  /* ------------------------------------------------------------------
     Flywheel — the loop, client side.

     Every platform a user already lives on (the Mac app, the PWA, GitHub,
     Homebrew, an AI agent, email, a DM) is a CAPTURE surface: it carries a
     share link shaped

       https://freecoffee.tech/index.html?ref=<code>&utm_source=<platform>

     `ref` is a short random code the user owns and registers server-side
     (POST {backend}/referral, action 'register'). It is deliberately NOT the
     device id: the device id is the only identifier the platform holds and
     GET /earnings/{deviceId} is public, so a share link must never carry it.

     The three pieces are local-first and offline-safe:
       referralCode()          the user's own code (localStorage, created once)
       captureInboundRef()     read ?ref / ?utm_source on arrival, remember it,
                               and claim it server-side when a backend is set
       shareKit()              one attributed artifact per platform

     ------------------------------------------------------------------ */
  var REFCODE_KEY = 'freecoffee:refcode';
  var REFCAPTURE_KEY = 'freecoffee:refcapture';
  var REF_CODE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;

  var DIST_REPO = 'https://github.com/ayodhyamohanthy/freecoffee-dist';
  var DMG_URL = DIST_REPO + '/releases/latest/download/FreeCoffee.dmg';
  var BREW_CMD = 'brew install --cask freecoffee';
  var SHARE_TEXT = 'FreeCoffee demo: explore Mac status area sponsorships with a 70% base share, a platform-funded 10% launch boost, and 5% referral bonuses for each person in the first 30 days. $10 payout minimum after a 5-day pending period; setup unlocks at $5. Preview only — no real payouts.';
  var HN_TEXT = 'FreeCoffee – your Mac status area pays for the coffee';

  /* The user's own share code: 8 hex chars, generated once and kept locally.
     Hex-only so it always satisfies the server's code rules. */
  function referralCode() {
    if (typeof window === 'undefined') return '';
    try {
      if (!window.localStorage) return '';
      var existing = window.localStorage.getItem(REFCODE_KEY);
      if (existing && REF_CODE_RE.test(existing)) return existing;
      var hex = '0123456789abcdef';
      var code = '';
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(8);
        window.crypto.getRandomValues(bytes);
        for (var i = 0; i < bytes.length; i++) code += hex[bytes[i] % 16];
      } else {
        for (var j = 0; j < 8; j++) code += hex[Math.floor(Math.random() * 16)];
      }
      window.localStorage.setItem(REFCODE_KEY, code);
      return code;
    } catch (e) { return ''; }
  }

  /* Where this visit is coming from — used as the `platform` field on every
     placement report, so the public /stats mix is real rather than guessed. */
  function currentPlatform() {
    if (typeof window === 'undefined') return 'web';
    try {
      var nav = window.navigator || {};
      if (nav.standalone === true) return 'pwa';
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return 'pwa';
      var ua = nav.userAgent || '';
      if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
      if (/android/i.test(ua)) return 'android';
      if (/macintosh|mac os x/i.test(ua)) return 'web-mac';
      if (/windows/i.test(ua)) return 'web-win';
      if (/linux/i.test(ua)) return 'web-linux';
    } catch (e) { /* fall through */ }
    return 'web';
  }

  /* Attributed link: `ref` closes the loop, `utm_*` keeps the platform's own
     analytics honest about where the click came from. */
  function attributedUrl(code, platform, target) {
    var base = target || 'https://freecoffee.tech/index.html';
    var sep = base.indexOf('?') === -1 ? '?' : '&';
    return base + sep +
      'ref=' + encodeURIComponent(code || '') +
      '&utm_source=' + encodeURIComponent(platform || 'share') +
      '&utm_medium=share&utm_campaign=flywheel';
  }

  function defaultShareTarget() {
    if (typeof window !== 'undefined' && window.location) {
      try { return new URL('index.html', window.location.href).toString(); }
      catch (e) { /* fall through */ }
    }
    return 'https://freecoffee.tech/index.html';
  }

  /* One attributed artifact per platform the user is already in. `href` opens
     it; `cmd` is a copyable command that carries no URL semantics of its own. */
  function shareKit(code, target) {
    var c = code || referralCode();
    var t = target || defaultShareTarget();
    var enc = encodeURIComponent;
    var emailBody = SHARE_TEXT + '\n\n' + attributedUrl(c, 'email', t);
    return {
      code: c,
      link: attributedUrl(c, 'share', t),
      text: SHARE_TEXT,
      platforms: [
        { id: 'mac', label: 'Mac app (.dmg)', href: attributedUrl(c, 'mac', DMG_URL) },
        { id: 'brew', label: 'Homebrew', cmd: BREW_CMD },
        { id: 'pwa', label: 'Web app (PWA)', href: attributedUrl(c, 'pwa', t) },
        { id: 'github', label: 'GitHub', href: attributedUrl(c, 'github', DIST_REPO) },
        { id: 'agent', label: 'AI agent (MCP)', href: attributedUrl(c, 'agent', 'https://freecoffee.tech/agents.html') },
        { id: 'x', label: 'X', href: 'https://twitter.com/intent/tweet?url=' + enc(attributedUrl(c, 'x', t)) + '&text=' + enc(SHARE_TEXT) },
        { id: 'whatsapp', label: 'WhatsApp', href: 'https://wa.me/?text=' + enc(SHARE_TEXT + '\n\n' + attributedUrl(c, 'whatsapp', t)) },
        { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/sharing/share-offsite/?url=' + enc(attributedUrl(c, 'linkedin', t)) },
        { id: 'reddit', label: 'Reddit', href: 'https://www.reddit.com/submit?url=' + enc(attributedUrl(c, 'reddit', t)) + '&title=' + enc(HN_TEXT) },
        { id: 'hn', label: 'Hacker News', href: 'https://news.ycombinator.com/submitlink?u=' + enc(attributedUrl(c, 'hn', t)) + '&t=' + enc(HN_TEXT) },
        { id: 'email', label: 'Email', href: 'mailto:?subject=' + enc('Your Mac status area could buy your coffee') + '&body=' + enc(emailBody) }
      ]
    };
  }

  /* ------------------------------------------------------------------
     Capture — read ?ref / ?utm_source on arrival, on ANY page.

     Returns the capture ({code, platform, at}) or null when the visit carried
     no usable ref. Never throws, never blocks the page.
     ------------------------------------------------------------------ */
  function captureInboundRef() {
    var code = '', platform = '';
    try {
      if (typeof window === 'undefined' || !window.location) return null;
      var qs = new URLSearchParams(window.location.search);
      code = (qs.get('ref') || '').replace(/^\s+|\s+$/g, '').toLowerCase();
      platform = (qs.get('utm_source') || '').replace(/^\s+|\s+$/g, '').toLowerCase();
    } catch (e) { return null; }
    var capture;
    if (!REF_CODE_RE.test(code) || code === referralCode()) {
      capture = inboundRef();
      if (!capture) return null;
      code = capture.code;
      platform = capture.platform;
    } else {
      capture = { code: code, platform: platform, at: Date.now() };
    }
    try {
      if (window.localStorage) window.localStorage.setItem(REFCAPTURE_KEY, JSON.stringify(capture));
    } catch (e) { /* storage blocked — the claim below still runs */ }

    var base = backendBase();
    var dev = deviceId();
    if (!base || !dev) return capture;                 // kept locally, unclaimed

    try {
      fetch(base + '/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: dev, code: code, action: 'claim' })
      }).then(function (res) {
        return (res && res.ok) ? res.json() : null;
      }).then(function (d) {
        if (!d || !d.claimed) return;
        try {
          if (window.localStorage) {
            window.localStorage.setItem(REFCAPTURE_KEY, JSON.stringify({
              code: code, platform: platform, at: capture.at, claimed: true
            }));
          }
        } catch (e) { /* non-fatal */ }
      }).catch(function () { /* best-effort — the capture stays local */ });
    } catch (e) { /* best-effort */ }

    return capture;
  }

  /* The last capture this browser saw (claimed or not) — for the flywheel page. */
  function inboundRef() {
    if (typeof window === 'undefined') return null;
    try {
      if (!window.localStorage) return null;
      var raw = window.localStorage.getItem(REFCAPTURE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return (parsed && REF_CODE_RE.test(String(parsed.code || '')) &&
        isFinite(parsed.at) && parsed.at <= Date.now() &&
        Date.now() - parsed.at < MODEL.REFERRAL_ATTRIBUTION_DAYS * DAY_MS) ? parsed : null;
    } catch (e) { return null; }
  }

  /* ANY page is a capture surface, not just the landing page: a share link can
     point anywhere. This runs on load but does nothing at all unless the URL
     actually carries a `ref` — and it never claims anything unless a backend
     URL has been configured (Profile → BACKEND API URL), so a normal visit
     still makes zero network calls. */
  captureInboundRef();

  /* Owner side: register the user's own code so their links can be claimed.
     Called only by the pages that show the link (flywheel, referrals) — a user
     who never shares therefore burns no request. */
  function registerReferralCode() {
    var base = backendBase();
    var dev = deviceId();
    var code = referralCode();
    if (!base || !dev || !code) return null;
    try {
      return fetch(base + '/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: dev, code: code, action: 'register' })
      }).then(function (res) {
        return (res && res.ok) ? res.json() : null;
      }).catch(function () { return null; });
    } catch (e) { return null; }
  }

  /* The referrer's own aggregate view (anonymous 'referee N' rows, no device
     ids) — or null when there is no backend to ask. */
  function fetchReferrals(code) {
    var base = backendBase();
    var c = code || referralCode();
    if (!base || !c) return Promise.resolve(null);
    try {
      return fetch(base + '/referrals/' + encodeURIComponent(c))
        .then(function (res) { return (res && res.ok) ? res.json() : null; })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /* ------------------------------------------------------------------
     PWA install UX (index.html hero + dashboard header). The #installBtn
     markup is hidden by default; it appears when beforeinstallprompt
     fires (captured + preventDefault'd), prompt() runs on click, and
     appinstalled hides it with a toast. iOS Safari never fires the
     prompt event, so when running in-browser on an iPhone/iPad we show
     the manual "Share → Add to Home Screen" hint line instead.
     ------------------------------------------------------------------ */
  function initInstallUX() {
    if (typeof document === 'undefined') return null;
    var btn = document.getElementById('installBtn');
    var hint = document.getElementById('installHint');
    if (!btn) return null;

    var deferredPrompt = null;

    var isStandalone = false;
    try {
      isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    } catch (e) { isStandalone = false; }
    if (!isStandalone && window.navigator && window.navigator.standalone === true) {
      isStandalone = true; // iOS Safari standalone flag
    }

    // Same toast visuals as the dashboard (.toast-region/.toast CSS exists);
    // creates the region on demand for pages that don't ship one (index).
    function toast(msg) {
      var region = document.getElementById('toastRegion');
      if (!region) {
        region = document.createElement('div');
        region.className = 'toast-region';
        region.setAttribute('aria-live', 'polite');
        document.body.appendChild(region);
      }
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

    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();               // take over the install flow
      deferredPrompt = ev;
      if (hint) hint.hidden = true;
      if (!isStandalone) btn.hidden = false;
    });

    btn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') {
          btn.hidden = true;
          toast('FreeCoffee installed — find it in your apps. (demo)');
        }
        deferredPrompt = null;
      }).catch(function () { deferredPrompt = null; });
    });

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      btn.hidden = true;
      if (hint) hint.hidden = true;
      toast('FreeCoffee app installed. Demo data stays in this browser.');
    });

    // No prompt support + iOS Safari in-browser → manual-install hint.
    if (!isStandalone && hint &&
        /iphone|ipad/i.test(window.navigator.userAgent || '')) {
      hint.hidden = false;
    }

    return null;
  }

  /* ------------------------------------------------------------------ */
  return {
    SEED: SEED,
    MODEL: MODEL,
    SPONSORS: SPONSORS,
    ANCHOR_TS: ANCHOR_TS,
    CUP_PRICE: CUP_PRICE,
    mulberry32: mulberry32,
    generateHistory: generateHistory,
    projectMonthly: projectMonthly,
    normalizeState: normalizeState,
    demoBalances: demoBalances,
    withdrawDemo: withdrawDemo,
    snoozeUntil: snoozeUntil,
    fetchLiveCampaigns: fetchLiveCampaigns,
    pickAd: pickAd,
    deviceId: deviceId,
    backendBase: backendBase,
    /* flywheel — capture on any page, share from the flywheel page */
    referralCode: referralCode,
    currentPlatform: currentPlatform,
    attributedUrl: attributedUrl,
    shareKit: shareKit,
    captureInboundRef: captureInboundRef,
    inboundRef: inboundRef,
    registerReferralCode: registerReferralCode,
    fetchReferrals: fetchReferrals,
    cups: cups,
    initMenuBarDemo: initMenuBarDemo,
    initInstallUX: initInstallUX,
    fmtTime: fmtTime,
    fmtDay: fmtDay,
    version: '2.2.0-demo'
  };
});
