/**
 * pulse.js — live GitHub activity renderers for the pulse pane.
 *
 * Three renderers, each triggered by a marker data attribute:
 *   [data-yearmap]           → ASCII heatmap grid (configurable range)
 *   [data-neofetch-stats]    → key/value stats block
 *   [data-langbars]          → top-language horizontal bars (optionally
 *                               seeded inline via data-langs)
 *
 * Data sources (no auth required):
 *   - github-contributions-api.jogruber.de  (daily contribution counts)
 *   - api.github.com/users/<user>/repos     (repo list, sorted by pushed_at)
 *   - api.github.com/users/<user>/events    (public push events)
 *
 * Rate limit survival: localStorage cache w/ 1h TTL. On error we fall back
 * to stale cache before giving up, so a rate-limited visitor still sees data.
 */
(() => {
  const user = document.body.dataset.ghUser || 'ugurcandede';
  const HEAT = '·▃▅▇█';

  const contributionsAPI = `https://github-contributions-api.jogruber.de/v4/${user}?y=last`;
  const eventsAPI = `https://api.github.com/users/${user}/events/public?per_page=100`;
  const reposAPI  = `https://api.github.com/users/${user}/repos?per_page=100&type=owner&sort=pushed`;

  // ── cached fetch (localStorage, 1h TTL, stale fallback) ──
  const TTL_MS = 60 * 60 * 1000;
  const cachedFetch = async (url) => {
    const key = `pulse-cache:${url}`;
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
      return data;
    } catch (e) {
      if (cached) return cached.data;
      throw e;
    }
  };

  // share across renderers within a single page load
  let contribP, eventsP, reposP;
  const getContributions = () => contribP ||= cachedFetch(contributionsAPI);
  const getEvents        = () => eventsP  ||= cachedFetch(eventsAPI);
  const getRepos         = () => reposP   ||= cachedFetch(reposAPI);

  const relAge = (iso) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    const d = Math.floor(s / 86400);
    if (d < 30) return `${d}d`;
    return `${Math.floor(d / 30)}mo`;
  };

  const escape = (s) => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // ── ASCII heatmap ──
  const buildYearmap = (days) => {
    if (!days.length) return '<div class="err">no data</div>';
    const firstDate = new Date(days[0].date + 'T00:00:00Z');
    const firstDow = (firstDate.getUTCDay() + 6) % 7; // Mon = 0
    const padded = Array(firstDow).fill(null).concat(days);
    const weeks = Math.ceil(padded.length / 7);

    const grid = Array.from({ length: 7 }, () => Array(weeks).fill(null));
    for (let i = 0; i < padded.length; i++) {
      grid[i % 7][Math.floor(i / 7)] = padded[i];
    }
    const max = Math.max(1, ...days.map(d => d.count || 0));
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    let html = '';
    for (let r = 0; r < 7; r++) {
      let line = '';
      for (let c = 0; c < weeks; c++) {
        const cell = grid[r][c];
        if (!cell) { line += '  '; continue; }
        const n = cell.count || 0;
        const idx = n === 0 ? 0 : Math.min(HEAT.length - 1, 1 + Math.floor((n / max) * (HEAT.length - 2)));
        line += HEAT[idx] + ' ';
      }
      html += `<span class="row"><span class="lbl">${dayLabels[r]}</span>${escape(line)}</span>`;
    }

    const monthLabels = Array(weeks).fill('  ');
    let lastMonth = -1;
    for (let c = 0; c < weeks; c++) {
      const cell = grid[0][c] || grid[1][c] || grid[2][c];
      if (!cell) continue;
      const m = new Date(cell.date + 'T00:00:00Z').getUTCMonth();
      if (m !== lastMonth) {
        const name = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m];
        if (c + 1 < weeks) monthLabels[c] = name.slice(0, 3) + ' ';
        lastMonth = m;
      }
    }
    html += `<span class="months">${escape(monthLabels.join(''))}</span>`;
    html += `<span class="legend">less <span class="swatch">${HEAT.split('').join(' ')}</span> more · ${days.length} days · peak ${max}</span>`;
    return html;
  };

  const renderYearmap = async () => {
    const outs = document.querySelectorAll('[data-yearmap]');
    if (!outs.length) return;
    try {
      const data = await getContributions();
      const all = data.contributions || [];
      if (!all.length) throw new Error('no data');
      outs.forEach((out) => {
        const limit = parseInt(out.dataset.yearmapDays || '0', 10);
        const days = limit > 0 ? all.slice(-limit) : all;
        out.innerHTML = buildYearmap(days);
      });
    } catch (e) {
      outs.forEach(o => o.innerHTML = `<div class="err">failed to load heatmap: ${e.message}</div>`);
    }
  };

  // ── neofetch-style stats ──
  const renderStats = async () => {
    const outs = document.querySelectorAll('[data-neofetch-stats]');
    if (!outs.length) return;

    const safe = async (p) => { try { return await p; } catch (e) { return { __err: e.message }; } };
    const [contrib, events, repos] = await Promise.all([
      safe(getContributions()), safe(getEvents()), safe(getRepos()),
    ]);

    const days = (contrib && !contrib.__err ? contrib.contributions : null) || [];
    const totalYear = days.reduce((a, d) => a + (d.count || 0), 0);
    const today = days.at(-1)?.count || 0;
    const activeDays = days.filter(d => (d.count || 0) > 0).length;

    // Events API: ~90d of PUBLIC events only. Fall back to most-recently-pushed
    // public repo (reposAPI is sorted by pushed_at).
    let lastPush = null;
    const push = Array.isArray(events) ? events.find(e => e.type === 'PushEvent') : null;
    const recentRepo = Array.isArray(repos) ? repos.find(r => !r.fork) : null;
    if (push) lastPush = `${relAge(push.created_at)} ago → ${push.repo.name}`;
    else if (recentRepo) lastPush = `${relAge(recentRepo.pushed_at)} ago → ${recentRepo.full_name}`;

    const fmt = (v, fallback = 'n/a') =>
      v != null && v !== '' ? v : `<span style="color:var(--dim);font-style:italic;">${fallback}</span>`;

    const contribErr = contrib && contrib.__err;
    const pushErr = (events && events.__err) && (repos && repos.__err);

    const html = `
      <div class="head">${user}<span class="at">@</span><span class="host">github</span></div>
      <div class="divider">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
      <div class="row"><span class="k">Contribs (y)</span><span class="v">${contribErr ? fmt(null, 'api limit · retry later') : `<span class="hl">${totalYear.toLocaleString()}</span> · today ${today}`}</span></div>
      <div class="row"><span class="k">Active (y)</span><span class="v">${contribErr ? fmt(null, '—') : `${activeDays}/${days.length} days`}</span></div>
      <div class="row"><span class="k">Last push</span><span class="v">${pushErr ? fmt(null, 'api limit · retry later') : escape(lastPush || 'no public push found')}</span></div>
    `;
    outs.forEach(o => o.innerHTML = html);
  };

  // ── language horizontal bars ──
  const renderLangsInto = (out, entries) => {
    const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
    const sorted = entries.slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
    const barW = 22;
    let html = `<div class="head">top languages</div>`;
    for (const [label, val] of sorted) {
      const pct = Math.round((val / total) * 100);
      const filled = Math.max(1, Math.round((val / total) * barW));
      const empty = barW - filled;
      html += `
        <div class="row">
          <span class="name">${escape(label)}</span>
          <span class="bar">${'█'.repeat(filled)}<span class="empty">${'\u00A0'.repeat(empty)}</span></span>
          <span class="pct">${pct}%</span>
        </div>`;
    }
    out.innerHTML = html;
  };

  const renderLangBars = async () => {
    const outs = document.querySelectorAll('[data-langbars]');
    if (!outs.length) return;

    // Elements with inline data-langs (Liquid-templated from YAML) render directly.
    // Elements without it fall back to GitHub repo-language API.
    const inlineOuts = [];
    const apiOuts = [];
    outs.forEach((out) => {
      if (out.dataset.langs && out.dataset.langs.trim()) inlineOuts.push(out);
      else apiOuts.push(out);
    });

    for (const out of inlineOuts) {
      try {
        const entries = out.dataset.langs.split(',').map(s => {
          const [label, v] = s.split(':');
          return [label.trim(), parseFloat(v)];
        }).filter(([l, v]) => l && !isNaN(v));
        if (!entries.length) throw new Error('empty yaml list');
        renderLangsInto(out, entries);
      } catch (e) {
        out.innerHTML = `<div class="err">parse error: ${e.message}</div>`;
      }
    }

    if (!apiOuts.length) return;
    try {
      const repos = await getRepos();
      const count = {};
      for (const r of repos) {
        if (r.fork || !r.language) continue;
        count[r.language] = (count[r.language] || 0) + 1;
      }
      const entries = Object.entries(count);
      if (!entries.length) throw new Error('no languages found');
      apiOuts.forEach(out => renderLangsInto(out, entries));
    } catch (e) {
      apiOuts.forEach(o => o.innerHTML = `<div class="err">failed: ${e.message}</div>`);
    }
  };

  renderYearmap();
  renderStats();
  renderLangBars();
})();
