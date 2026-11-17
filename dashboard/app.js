// Token Radar dashboard, model radar-2. Reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own inputs and the protocol's
// farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // Export the board the reader is actually looking at: the same filtered,
  // sorted rows the table shows, plus the model's own multipliers, so a
  // spreadsheet can redo the ranking without re-reading the snapshot.
  var lastExport = null;
  function csvCell(value) {
    if (value === null || value === undefined) return '';
    var text = String(value);
    if (text.indexOf('"') >= 0 || text.indexOf(',') >= 0 || text.indexOf('\n') >= 0 || text.indexOf('\r') >= 0) {
      return '"' + text.split('"').join('""') + '"';
    }
    return text;
  }
  function csvFileName() {
    var stamp = new Date().toISOString().slice(0, 10);
    var tag = state.category !== 'all' ? '-' + state.category.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '';
    return 'token-radar-' + state.tab + tag + '-' + stamp + '.csv';
  }
  function exportRows() {
    var head, lines;
    if (state.tab === 'live') {
      head = ['Status', 'Protocol', 'Category', 'Chains', 'TVL USD', '7d change %', 'Market cap USD'];
      lines = DATA.live.map(function (r) {
        return ['live', r.name, r.category || 'Other', (r.chains || []).join('; '), r.tvl_usd, r.change_7d, r.mcap_usd].map(csvCell).join(',');
      });
    } else {
      head = ['Rank', 'Protocol', 'Category', 'Chains', 'TVL USD', '7d change %', 'Age days', 'Category multiple', 'Growth multiplier', 'Maturity multiplier', 'Chain multiplier', 'Implied value USD', 'Watchlist'];
      lines = sortedRows(rows()).map(function (r) {
        return [r.rank, r.name, r.category || 'Other', (r.chains || []).join('; '), r.tvl_usd, r.change_7d, r.age_days, r.category_multiple, r.growth_multiplier, r.maturity_multiplier, r.chain_multiplier, r.implied_value_usd, isWatch(r) ? 'yes' : 'no'].map(csvCell).join(',');
      });
    }
    var blob = new Blob([head.map(csvCell).join(',') + '\r\n' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = csvFileName();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    lastExport = { count: lines.length, name: link.download };
    render();
  }
  // The model in one function: the page recomputes a row from the snapshot
  // figures and the multipliers board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic.
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * row.growth_multiplier * row.maturity_multiplier * row.chain_multiplier));
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watch') === '1') state.watch = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watch) params.set('watch', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function isWatch(row) { return !!row.watchlist; }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !isWatch(r)) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_multiple; bv = b.category_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      ));
  }
  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { html: 'The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M</b> of TVL and no token on record. The early radar adds <b>' + DATA.early_size + '</b> pre-token protocols below that floor, every one the house rule would keep. Implied value is a model, not a promise: it never predicts whether or when a token is issued.' }),
        top ? el('p', { text: 'Top of the board: ' + top.name + ' at ' + fmtUsd(top.implied_value_usd) + ' implied value.' }) : null
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global category multiple' }), el('b', { text: String(DATA.global_multiple) + 'x' }))
      ));
  }
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); }));
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var watch = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watch ? 'checked' : null, onchange: function (e) { state.watch = e.target.checked; writeHash(); render(); } }),
      'Watchlist only');
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      watch,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Board tools' }),
        el('div', { class: 'tools' },
          el('button', { class: 'button', type: 'button', text: 'Export CSV', onclick: exportRows }),
          el('button', { class: 'button ghost', type: 'button', text: 'How it works', onclick: openMethod }))),
      lastExport ? el('span', { class: 'export-note', text: 'Exported ' + lastExport.count + ' rows to ' + lastExport.name }) : null,
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' }));
  }
  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null));
  }
  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; writeHash(); render(); } })));
    }
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank-badge' + (r.rank <= 10 ? ' top' : ''), text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name, isWatch(r) ? el('span', { class: 'watch', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.category_multiple + 'x' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'status', text: 'no token' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'),
            sortHeader('age', 'Age'), sortHeader('multiple', 'Cat. multiple'), sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios are the comparables the model prices the pre-token board with.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  }
  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + min(chains - 1, ' + m.chain_max_steps + ') x ' + m.chain_step + ') )'),
      el('p', { class: 'sub', text: 'The category multiple is the median market-cap-to-TVL ratio of the live-token protocols in the same category, when at least ' + m.min_comparables + ' exist; otherwise the global median (' + DATA.global_multiple + 'x). It is clamped to ' + m.multiple_min + 'x to ' + m.multiple_max + 'x. TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Wrapped, staked and bridged products are excluded from the board, and live-token protocols are set aside with their market caps shown.' }));
  }
  // The method, in plain words: a second dialog that explains the model
  // with the live parameters, so the numbers in the text can never drift
  // from the numbers the board was scored with. A worked example uses the
  // protocol at the top of the board, with its own figures.
  var methodDialog = el('dialog', { class: 'method', id: 'method', 'aria-labelledby': 'method-title' });
  methodDialog.addEventListener('click', function (e) { if (e.target === methodDialog) methodDialog.close(); });
  function openMethod() {
    var m = DATA.model;
    var top = DATA.rows[0];
    methodDialog.textContent = '';
    methodDialog.appendChild(el('div', { class: 'method-body' },
      el('div', { class: 'method-head' },
        el('div', null,
          el('span', { class: 'brand-name', text: DATA.model_version + ' model' }),
          el('h2', { id: 'method-title', text: 'How the radar works' }),
          el('p', { class: 'sub', text: 'Implied value answers one question: if this protocol launched a token today, what would it be worth? The radar prices it the way a market would, by looking at similar protocols that already have a token.' })),
        el('button', { class: 'close', type: 'button', 'aria-label': 'Close the method explanation', text: 'Close', onclick: function () { methodDialog.close(); } })),
      el('ol', { class: 'method-steps' },
        el('li', null,
          el('h3', { text: '1. Find the neighbours' }),
          el('p', { html: 'In the protocol\u2019s own category, take every protocol whose token already trades and divide its market cap by its TVL. The middle value of those ratios is the category multiple. A category needs at least <b>' + m.min_comparables + '</b> such neighbours; with fewer, the board falls back to the global median of <b>' + DATA.global_multiple + 'x</b>. The multiple is then clamped between <b>' + m.multiple_min + 'x</b> and <b>' + m.multiple_max + 'x</b>, so one overheated category cannot set the price.' })),
        el('li', null,
          el('h3', { text: '2. Start from locked value' }),
          el('p', { text: 'Implied value starts as TVL times the category multiple. A protocol with twice the locked value of a same-category neighbour starts with twice the implied value, before any adjustment.' })),
        el('li', null,
          el('h3', { text: '3. Adjust for momentum, staying power and reach' }),
          el('p', { html: 'Three multipliers nudge that starting number. <b>Growth:</b> the seven-day change in TVL, clamped between ' + m.growth_floor + '% and ' + m.growth_cap + '%, and counted at ' + Math.round(m.growth_weight * 100) + '% weight, so a one-week spike cannot carry a protocol. <b>Maturity:</b> the longer a protocol has run with no token, the closer its multiplier gets to ' + (m.maturity_floor + m.maturity_range) + ', rising from ' + m.maturity_floor + ' over ' + m.maturity_days + ' days. <b>Chain:</b> each extra chain beyond the first adds ' + (m.chain_step * 100) + '%, up to ' + m.chain_max_steps + ' extra chains.' })),
        el('li', null,
          el('h3', { text: '4. Know what the number is not' }),
          el('p', { text: 'Implied value is an estimate, not a price, and it says nothing about whether or when a token appears. Wrapped, staked and bridged products are left off the board, and protocols whose token already trades are set aside with their real market caps shown.' }))),
      top ? el('section', { class: 'detail-section' },
        el('h3', { text: 'Worked example: ' + top.name }),
        el('div', { class: 'worked' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(top.tvl_usd) })),
          el('div', null, el('span', { text: 'Category multiple (' + (top.comparables > 0 ? top.comparables + ' live neighbours' : 'global fallback') + ')' }), el('b', { class: 'num', text: top.category_multiple + 'x' })),
          el('div', null, el('span', { text: 'Growth multiplier (7d ' + fmtPct(top.change_7d) + ')' }), el('b', { class: 'num', text: String(top.growth_multiplier) })),
          el('div', null, el('span', { text: 'Maturity multiplier (' + fmtAge(top.age_days) + ' with no token)' }), el('b', { class: 'num', text: String(top.maturity_multiplier) })),
          el('div', null, el('span', { text: 'Chain multiplier (' + (top.chains || []).length + ' chains)' }), el('b', { class: 'num', text: String(top.chain_multiplier) })),
          el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(top.implied_value_usd) }))),
        el('p', { class: 'sub', text: 'Multiply the five numbers above and round: that is the figure on the board. Nothing else goes into the ranking.' })) : null,
      el('p', { class: 'note', text: 'Every number in this explanation comes from the same snapshot the board was scored from, so it stays true even if the snapshot changes.' })));
    if (typeof methodDialog.showModal === 'function') { if (!methodDialog.open) methodDialog.showModal(); }
    else methodDialog.setAttribute('open', '');
  }
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatch(row) ? ' - watchlist' : ' - early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' - listed ' + (row.listed_at || 'unknown') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.comparables > 0 ? row.comparables + ' live comparables' : 'global fallback') + ')' }), el('b', { class: 'num', text: row.category_multiple + 'x' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth / maturity / chain multipliers' }), el('b', { class: 'num', text: row.growth_multiplier + ' / ' + row.maturity_multiplier + ' / ' + row.chain_multiplier })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price, and it records no token, never that the protocol has none.' }),
      el('p', { class: 'note', text: 'This board does not predict whether or when a token is issued. If one is issued, the value above is what it would be worth if the protocol\'s record stayed as it is.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (!methodDialog.isConnected) app.appendChild(methodDialog);
    if (state.selected) openDetail(state.selected);
  }
  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (dialog.open) dialog.close();
    if (methodDialog.open) methodDialog.close();
  });
})();
