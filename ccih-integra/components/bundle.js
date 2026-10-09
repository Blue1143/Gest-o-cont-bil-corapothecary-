/* @ds-bundle: {"format":4,"namespace":"Integra","components":[{"name":"Button"},{"name":"StatusBadge"},{"name":"InfectionTag"},{"name":"AlertBanner"},{"name":"KpiCard"},{"name":"TrendChart"},{"name":"BarChart"},{"name":"DataTable"},{"name":"PatientRecord"},{"name":"SurgeryRecord"},{"name":"SterilizationCycle"},{"name":"TraceTimeline"},{"name":"TrainingProgress"},{"name":"BundleChecklist"},{"name":"SupplyStock"}]} */
(function () {
  var R = window.React, h = R.createElement;

  /* ---------- helpers ---------- */
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function omit(o, keys) { var r = {}; for (var k in o) if (keys.indexOf(k) < 0) r[k] = o[k]; return r; }
  function nf(v, d) {
    if (v == null || isNaN(v)) return '—';
    d = d == null ? 0 : d;
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function toUTC(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function dayDiff(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 864e5); }
  function addDays(iso, n) { return new Date(toUTC(iso) + n * 864e5).toISOString().slice(0, 10); }
  function fdate(s) {
    if (!s) return '—';
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
    if (!m) return s;
    return m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] + ':' + m[5] : '');
  }
  function cssVar(token) { return 'var(--' + token + ')'; }

  /* status of a measured value against its target. direction 'lower' = lower is better */
  function statusFor(value, target, direction, band) {
    if (value == null || target == null || isNaN(value)) return 'neutral';
    var lower = (direction || 'lower') === 'lower';
    if (band == null) band = Math.abs(target) * (lower ? 0.2 : 0.1);
    if (lower) return value <= target ? 'ok' : value <= target + band ? 'warn' : 'crit';
    return value >= target ? 'ok' : value >= target - band ? 'warn' : 'crit';
  }

  var STATUS_LABEL = { ok: 'Conforme', warn: 'Atenção', crit: 'Crítico', neutral: 'Sem dado', info: 'Informativo' };

  var IRAS = {
    'IPCS': { token: 'iras-ipcs', sigla: 'IPCS', nome: 'Infecção primária de corrente sanguínea', dispositivo: 'CVC' },
    'PAV': { token: 'iras-pav', sigla: 'PAV', nome: 'Pneumonia associada à ventilação mecânica', dispositivo: 'VM' },
    'ITU-AC': { token: 'iras-itu', sigla: 'ITU-AC', nome: 'Infecção do trato urinário associada a cateter', dispositivo: 'SVD' },
    'ISC': { token: 'iras-isc', sigla: 'ISC', nome: 'Infecção de sítio cirúrgico', dispositivo: null },
    'OUTRA': { token: 'iras-outras', sigla: 'Outras', nome: 'Outras IRAS', dispositivo: null }
  };

  var ICONS = {
    ok: 'M20 6 9 17l-5-5',
    warn: 'M12 3 2 20h20L12 3zM12 10v4M12 17h.01',
    crit: 'M8 2h8l6 6v8l-6 6H8l-6-6V8zM9 9l6 6M15 9l-6 6',
    neutral: 'M6 12h12',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7h.01',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    flat: 'M5 12h14',
    sort: 'M8 9l4-4 4 4M8 15l4 4 4-4',
    asc: 'M8 14l4-4 4 4',
    desc: 'M8 10l4 4 4-4',
    table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
    chart: 'M4 20V11M10 20V5M16 20v-6M2 20h20'
  };
  function Icon(p) {
    var s = p.size || 16;
    return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: p.weight || 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false' },
      h('path', { d: ICONS[p.name] || ICONS.neutral }));
  }

  function useWidth(initial) {
    var ref = R.useRef(null), st = R.useState(initial);
    R.useEffect(function () {
      var el = ref.current; if (!el) return;
      var set = function () { var w = el.clientWidth; if (w) st[1](w); };
      set();
      if (typeof ResizeObserver === 'undefined') return;
      var ro = new ResizeObserver(set); ro.observe(el);
      return function () { ro.disconnect(); };
    }, []);
    return [ref, st[0]];
  }

  function niceScale(max, count) {
    count = count || 4;
    if (!(max > 0)) max = 1;
    var raw = max / count, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    var step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    var top = step * Math.ceil(max / step), ticks = [];
    for (var v = 0; v <= top + step / 1e6; v += step) ticks.push(+v.toFixed(6));
    return { top: top, ticks: ticks, step: step };
  }

  /* ---------- Button ---------- */
  function Button(p) {
    var variant = p.variant || 'secondary', size = p.size || 'md';
    var rest = omit(p, ['variant', 'size', 'icon', 'children', 'className']);
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('ig-btn', variant !== 'secondary' && 'ig-btn-' + variant, size === 'sm' && 'ig-btn-sm', p.className)
    }), p.icon ? h(Icon, { name: p.icon, size: size === 'sm' ? 14 : 16 }) : null, p.children);
  }

  /* ---------- StatusBadge ---------- */
  function StatusBadge(p) {
    var s = p.status || 'neutral';
    return h('span', { className: cx('ig-badge', 'ig-tone-' + s, p.className) },
      h(Icon, { name: s, size: 13, weight: 2.5 }), p.children != null ? p.children : STATUS_LABEL[s]);
  }

  /* ---------- InfectionTag ---------- */
  function InfectionTag(p) {
    var t = IRAS[p.type] || IRAS.OUTRA;
    return h('span', { className: 'ig-iras', title: t.nome },
      h('i', { className: 'ig-iras-dot', style: { background: cssVar(t.token) }, 'aria-hidden': true }),
      h('b', null, t.sigla),
      p.showName ? h('span', null, t.nome) : null);
  }

  /* ---------- AlertBanner ---------- */
  function AlertBanner(p) {
    var tone = p.tone || 'info';
    return h('div', { className: cx('ig-alert', 'ig-tone-' + tone), role: tone === 'crit' ? 'alert' : 'status' },
      h(Icon, { name: tone, size: 18 }),
      h('div', { className: 'ig-alert-body' },
        p.title ? h('p', { className: 'ig-alert-title' }, p.title) : null,
        p.children ? h('p', { className: 'ig-alert-text' }, p.children) : null,
        p.actions ? h('div', { className: 'ig-alert-actions' }, p.actions) : null));
  }

  /* ---------- Sparkline (internal) ---------- */
  function Sparkline(p) {
    var v = (p.values || []).filter(function (x) { return x != null; });
    if (v.length < 2) return null;
    var w = 96, hh = 32, mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), rg = mx - mn || 1;
    var pts = v.map(function (y, i) { return [i * (w - 6) / (v.length - 1) + 1, hh - 4 - (y - mn) / rg * (hh - 8)]; });
    var last = pts[pts.length - 1];
    return h('svg', { width: w, height: hh, viewBox: '0 0 ' + w + ' ' + hh, 'aria-hidden': true },
      h('polyline', { points: pts.map(function (q) { return q.join(','); }).join(' '), fill: 'none', stroke: 'var(--ink-muted)', strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' }),
      h('circle', { cx: last[0], cy: last[1], r: 3.5, fill: 'var(--primary)', stroke: 'var(--surface-raised)', strokeWidth: 2 }));
  }

  /* ---------- KpiCard ---------- */
  function KpiCard(p) {
    var d = p.decimals == null ? 1 : p.decimals, dir = p.direction || 'lower';
    var status = p.status || statusFor(p.value, p.target, dir, p.band);
    var delta = p.previous != null && p.value != null ? p.value - p.previous : null;
    var better = delta == null || delta === 0 ? null : (dir === 'lower' ? delta < 0 : delta > 0);
    return h('div', { className: 'ig-card ig-kpi' },
      h('div', { className: 'ig-kpi-top' },
        h('span', { className: 'ig-label' }, p.label),
        p.target != null || p.status ? h(StatusBadge, { status: status }) : null),
      h('div', { className: 'ig-kpi-top', style: { alignItems: 'flex-end' } },
        h('div', { className: 'ig-kpi-value' }, nf(p.value, d), p.unit ? h('span', { className: 'ig-kpi-unit' }, p.unit) : null),
        p.spark ? h('div', { title: 'Últimos ' + p.spark.length + ' períodos' }, h(Sparkline, { values: p.spark })) : null),
      h('div', { className: 'ig-kpi-foot' },
        h('span', null, p.target != null ? 'Meta ' + (dir === 'lower' ? '≤ ' : '≥ ') + nf(p.target, d) : (p.period || '')),
        delta != null ? h('span', { className: 'ig-kpi-delta', 'aria-label': 'Variação ' + nf(delta, d) + ' em relação ao período anterior, ' + (better == null ? 'estável' : better ? 'melhora' : 'piora') },
          h('span', { style: { color: better == null ? 'var(--ink-muted)' : better ? 'var(--ok)' : 'var(--crit)', verticalAlign: '-2px', marginRight: 2 } }, h(Icon, { name: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat', size: 14 })),
          h('b', null, (delta > 0 ? '+' : '') + nf(delta, d)), ' ', p.previousLabel || 'vs anterior') : null));
  }

  /* ---------- Chart frame + table view ---------- */
  function ChartFrame(p) {
    var st = R.useState(false), asTable = st[0];
    return h('div', { className: 'ig-card' },
      h('div', { className: 'ig-card-head' },
        h('div', null,
          p.title ? h('h3', { className: 'ig-card-title' }, p.title) : null,
          p.subtitle ? h('p', { className: 'ig-card-sub' }, p.subtitle) : null),
        p.table ? h(Button, { variant: 'ghost', size: 'sm', icon: asTable ? 'chart' : 'table', onClick: function () { st[1](!asTable); }, 'aria-pressed': asTable }, asTable ? 'Gráfico' : 'Tabela') : null),
      asTable ? h(DataTable, { columns: p.table.columns, rows: p.table.rows, dense: true, sortable: false }) : p.children);
  }

  /* ---------- TrendChart ---------- */
  function TrendChart(p) {
    var labels = p.labels || [], series = p.series || [], d = p.decimals == null ? 1 : p.decimals;
    var height = p.height || 220, n = labels.length;
    var wr = useWidth(640), ref = wr[0], W = Math.max(280, wr[1]);
    var hov = R.useState(null), idx = hov[0], setIdx = hov[1];
    var direct = series.length <= 4;
    var limits = p.limit == null ? null : Array.isArray(p.limit) ? p.limit : labels.map(function () { return p.limit; });
    var max = p.yMax || Math.max.apply(null, [0].concat(
      series.reduce(function (a, s) { return a.concat(s.values.filter(function (v) { return v != null; })); }, []),
      p.target != null ? [p.target] : [], limits ? limits.filter(function (v) { return v != null; }) : []));
    var sc = niceScale(max * 1.05);
    var m = { l: 40, r: direct ? 76 : 16, t: 12, b: 28 };
    var pw = W - m.l - m.r, ph = height - m.t - m.b;
    var x = function (i) { return m.l + (n <= 1 ? pw / 2 : i * pw / (n - 1)); };
    var y = function (v) { return m.t + ph - v / sc.top * ph; };
    var every = Math.max(1, Math.ceil(n * 44 / pw));
    var color = function (s, i) { return cssVar(s.color || ('serie-' + (i + 1))); };
    var path = function (vals) {
      var dd = '', pen = false;
      vals.forEach(function (v, i) { if (v == null) { pen = false; return; } dd += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); pen = true; });
      return dd;
    };
    var ends = [];
    if (direct) {
      series.forEach(function (s, i) {
        for (var k = n - 1; k >= 0; k--) if (s.values[k] != null) { ends.push({ i: i, y: y(s.values[k]), name: s.name }); break; }
      });
      ends.sort(function (a, b) { return a.y - b.y; });
      for (var e = 1; e < ends.length; e++) if (ends[e].y - ends[e - 1].y < 14) ends[e].y = ends[e - 1].y + 14;
    }
    var move = function (ev) {
      var r = ev.currentTarget.getBoundingClientRect();
      var mx = (ev.clientX - r.left) * (W / r.width);
      var i = Math.round((mx - m.l) / (pw / Math.max(1, n - 1)));
      setIdx(Math.max(0, Math.min(n - 1, i)));
    };
    var key = function (ev) {
      if (ev.key === 'ArrowRight') { setIdx(idx == null ? 0 : Math.min(n - 1, idx + 1)); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft') { setIdx(idx == null ? n - 1 : Math.max(0, idx - 1)); ev.preventDefault(); }
      else if (ev.key === 'Escape') setIdx(null);
    };
    var tipLeft = idx == null ? 0 : Math.min(Math.max(x(idx) + 12, 0), W - 190);
    if (idx != null && x(idx) + 200 > W) tipLeft = x(idx) - 190;
    var tableCols = [{ key: 'periodo', label: 'Período' }].concat(series.map(function (s, i) { return { key: 's' + i, label: s.name, align: 'right', format: function (v) { return nf(v, d); } }; }));
    if (p.target != null) tableCols.push({ key: 'meta', label: p.targetLabel || 'Meta', align: 'right', format: function (v) { return nf(v, d); } });
    var tableRows = labels.map(function (l, i) { var r = { periodo: l, meta: p.target }; series.forEach(function (s, k) { r['s' + k] = s.values[i]; }); return r; });

    return h(ChartFrame, { title: p.title, subtitle: p.subtitle, table: { columns: tableCols, rows: tableRows } },
      (series.length > 1 || p.target != null || limits) ? h('div', { className: 'ig-legend' },
        series.length > 1 ? series.map(function (s, i) { return h('span', { key: i }, h('i', { style: { background: color(s, i) } }), s.name); }) : null,
        p.target != null ? h('span', null, h('i', { className: 'ig-dash' }), (p.targetLabel || 'Meta') + ' ' + nf(p.target, d)) : null,
        limits ? h('span', null, h('i', { style: { background: 'none', borderTop: '2px dotted var(--crit)', height: 0 } }), p.limitLabel || 'Limite superior de controle') : null) : null,
      h('div', { className: 'ig-chart', ref: ref },
        h('svg', {
          width: W, height: height, viewBox: '0 0 ' + W + ' ' + height, role: 'img', tabIndex: 0,
          'aria-label': (p.title || 'Série temporal') + '. Use as setas para percorrer os períodos.',
          onMouseMove: move, onMouseLeave: function () { setIdx(null); }, onKeyDown: key, onBlur: function () { setIdx(null); }
        },
          h('g', { className: 'ig-axis' },
            sc.ticks.map(function (t) {
              return h('g', { key: t }, h('line', { className: 'ig-grid-line', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }),
                h('text', { x: m.l - 8, y: y(t) + 4, textAnchor: 'end' }, nf(t, sc.step % 1 ? 1 : 0)));
            }),
            labels.map(function (l, i) { return i % every === 0 ? h('text', { key: i, x: x(i), y: height - 8, textAnchor: 'middle' }, l) : null; })),
          p.target != null ? h('line', { className: 'ig-target', x1: m.l, x2: W - m.r, y1: y(p.target), y2: y(p.target) }) : null,
          limits ? h('path', { className: 'ig-limit', d: path(limits) }) : null,
          idx != null ? h('line', { className: 'ig-crosshair', x1: x(idx), x2: x(idx), y1: m.t, y2: m.t + ph }) : null,
          series.map(function (s, i) {
            var last = -1; for (var k = n - 1; k >= 0; k--) if (s.values[k] != null) { last = k; break; }
            return h('g', { key: i },
              h('path', { d: path(s.values), fill: 'none', stroke: color(s, i), strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }),
              last >= 0 ? h('circle', { cx: x(last), cy: y(s.values[last]), r: 4, fill: color(s, i), stroke: 'var(--surface-raised)', strokeWidth: 2 }) : null,
              idx != null && s.values[idx] != null ? h('circle', { cx: x(idx), cy: y(s.values[idx]), r: 5, fill: color(s, i), stroke: 'var(--surface-raised)', strokeWidth: 2 }) : null);
          }),
          direct ? ends.map(function (e) {
            return h('text', { key: e.i, className: 'ig-chart-label', x: W - m.r + 10, y: e.y + 4, style: { fill: 'var(--ink)' } }, e.name);
          }) : null),
        idx != null ? h('div', { className: 'ig-tip', style: { left: tipLeft, top: 4 } },
          h('div', { className: 'ig-label', style: { marginBottom: 4 } }, labels[idx]),
          series.map(function (s, i) { return { s: s, i: i, v: s.values[idx] }; })
            .sort(function (a, b) { return (b.v || 0) - (a.v || 0); })
            .map(function (o) {
              return h('div', { key: o.i, className: 'ig-tip-row' },
                h('span', null, h('i', { className: 'ig-tip-key', style: { background: color(o.s, o.i) } }), o.s.name),
                h('b', null, nf(o.v, d) + (p.unit ? ' ' + p.unit : '')));
            }),
          p.target != null ? h('div', { className: 'ig-tip-row ig-muted' }, h('span', null, p.targetLabel || 'Meta'), h('span', null, nf(p.target, d))) : null,
          limits && limits[idx] != null ? h('div', { className: 'ig-tip-row ig-muted' }, h('span', null, 'LSC'), h('span', null, nf(limits[idx], d))) : null) : null),
      p.footnote ? h('p', { className: 'ig-card-sub', style: { marginTop: 8 } }, p.footnote) : null);
  }

  /* ---------- BarChart (horizontal) ---------- */
  function BarChart(p) {
    var data = (p.data || []).slice(), d = p.decimals == null ? 1 : p.decimals;
    if (p.sort !== false) data.sort(function (a, b) { return b.value - a.value; });
    var wr = useWidth(560), ref = wr[0], W = Math.max(260, wr[1]);
    var hov = R.useState(null), idx = hov[0], setIdx = hov[1];
    var rowH = 32, barH = 18, top = p.target != null ? 20 : 4;
    var height = top + data.length * rowH + 4;
    var labelW = Math.min(170, Math.round(W * 0.34)), valW = 56;
    var max = Math.max.apply(null, [p.target || 0].concat(data.map(function (r) { return r.value; })));
    var pw = W - labelW - valW - 8;
    var x = function (v) { return labelW + (max ? v / max * pw : 0); };
    var fill = function (r) { return cssVar(r.color || (r.type && IRAS[r.type] ? IRAS[r.type].token : 'primary')); };
    var bar = function (x0, x1, yy) {
      var w = Math.max(0, x1 - x0), rr = Math.min(4, w, barH / 2);
      return 'M' + x0 + ',' + yy + 'H' + (x0 + w - rr) + 'Q' + (x0 + w) + ',' + yy + ' ' + (x0 + w) + ',' + (yy + rr) +
        'V' + (yy + barH - rr) + 'Q' + (x0 + w) + ',' + (yy + barH) + ' ' + (x0 + w - rr) + ',' + (yy + barH) + 'H' + x0 + 'Z';
    };
    var trunc = function (s) { var c = Math.floor((labelW - 12) / 6.2); return s.length > c ? s.slice(0, c - 1) + '…' : s; };
    var tableCols = [{ key: 'label', label: p.categoryLabel || 'Categoria' }, { key: 'value', label: p.valueLabel || 'Valor', align: 'right', format: function (v) { return nf(v, d); } }];
    return h(ChartFrame, { title: p.title, subtitle: p.subtitle, table: { columns: tableCols, rows: data } },
      p.target != null ? h('div', { className: 'ig-legend' }, h('span', null, h('i', { className: 'ig-dash' }), (p.targetLabel || 'Meta') + ' ' + nf(p.target, d))) : null,
      h('div', { className: 'ig-chart', ref: ref },
        h('svg', { width: W, height: height, viewBox: '0 0 ' + W + ' ' + height, role: 'img', 'aria-label': p.title || 'Gráfico de barras' },
          data.map(function (r, i) {
            var yy = top + i * rowH + (rowH - barH) / 2, dim = idx != null && idx !== i;
            return h('g', { key: i, onMouseEnter: function () { setIdx(i); }, onMouseLeave: function () { setIdx(null); }, style: { cursor: 'default' } },
              h('rect', { x: 0, y: top + i * rowH, width: W, height: rowH, fill: 'transparent' }),
              h('text', { className: 'ig-chart-label', x: labelW - 10, y: yy + barH / 2 + 4, textAnchor: 'end', style: { fill: 'var(--ink)' } }, h('title', null, r.label), trunc(r.label)),
              h('path', { d: bar(labelW, x(r.value), yy), fill: fill(r), opacity: dim ? 0.4 : 1 }),
              h('text', { className: 'ig-chart-value', x: x(r.value) + 6, y: yy + barH / 2 + 4 }, nf(r.value, d)));
          }),
          h('line', { x1: labelW, x2: labelW, y1: top - 2, y2: height - 2, stroke: 'var(--line-strong)' }),
          p.target != null ? h('g', null,
            h('line', { className: 'ig-target', x1: x(p.target), x2: x(p.target), y1: top - 4, y2: height - 2 }),
            h('text', { className: 'ig-chart-label', x: x(p.target), y: 12, textAnchor: 'middle' }, (p.targetLabel || 'Meta'))) : null),
        idx != null ? h('div', { className: 'ig-tip', style: { left: Math.min(x(data[idx].value) + 12, W - 180), top: top + idx * rowH - 6 } },
          h('div', { className: 'ig-label', style: { marginBottom: 4 } }, data[idx].label),
          h('div', { className: 'ig-tip-row' },
            h('span', null, h('i', { className: 'ig-tip-key', style: { background: fill(data[idx]), height: 10 } }), data[idx].type ? IRAS[data[idx].type].sigla : (p.valueLabel || 'Valor')),
            h('b', null, nf(data[idx].value, d) + (p.unit ? ' ' + p.unit : ''))),
          p.target != null ? h('div', { className: 'ig-tip-row ig-muted' }, h('span', null, p.targetLabel || 'Meta'), h('span', null, nf(p.target, d))) : null,
          data[idx].note ? h('div', { className: 'ig-muted', style: { marginTop: 4 } }, data[idx].note) : null) : null),
      p.footnote ? h('p', { className: 'ig-card-sub', style: { marginTop: 8 } }, p.footnote) : null);
  }

  /* ---------- DataTable ---------- */
  function DataTable(p) {
    var cols = p.columns || [], sortable = p.sortable !== false;
    var st = R.useState(p.initialSort || null), sort = st[0];
    var rows = (p.rows || []).slice();
    if (sort) {
      var c = cols.filter(function (k) { return k.key === sort.key; })[0];
      var val = function (r) { return c && c.sortValue ? c.sortValue(r) : r[sort.key]; };
      rows.sort(function (a, b) {
        var A = val(a), B = val(b);
        var r = (typeof A === 'number' && typeof B === 'number') ? A - B : String(A == null ? '' : A).localeCompare(String(B == null ? '' : B), 'pt-BR');
        return sort.dir === 'desc' ? -r : r;
      });
    }
    var toggle = function (k) { st[1](!sort || sort.key !== k ? { key: k, dir: 'asc' } : { key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' }); };
    return h('div', { className: 'ig-table-wrap' },
      h('table', { className: cx('ig-table', p.dense && 'ig-dense') },
        p.caption ? h('caption', null, p.caption) : null,
        h('thead', null, h('tr', null, cols.map(function (c) {
          var on = sort && sort.key === c.key;
          return h('th', { key: c.key, className: c.align === 'right' ? 'ig-r' : null, scope: 'col', 'aria-sort': on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined },
            sortable && c.sortable !== false ? h('button', { type: 'button', className: 'ig-th-btn', onClick: function () { toggle(c.key); } }, c.label, h(Icon, { name: on ? sort.dir : 'sort', size: 12 })) : c.label);
        }))),
        h('tbody', null, rows.length ? rows.map(function (r, i) {
          return h('tr', { key: r.id || i }, cols.map(function (c) {
            var v = r[c.key];
            return h('td', { key: c.key, className: c.align === 'right' ? 'ig-r' : null }, c.render ? c.render(r) : c.format ? c.format(v, r) : (v == null ? '—' : v));
          }));
        }) : h('tr', null, h('td', { colSpan: cols.length, className: 'ig-muted' }, p.empty || 'Nenhum registro no período.')))));
  }

  /* ---------- PatientRecord (prontuário) ---------- */
  var CULT = { positiva: ['crit', 'Positiva'], negativa: ['ok', 'Negativa'], pendente: ['neutral', 'Pendente'], contaminada: ['warn', 'Contaminação'] };
  var IRAS_ST = { 'confirmada': 'crit', 'em investigação': 'warn', 'descartada': 'neutral' };
  function PatientRecord(p) {
    var pc = p.paciente || {}, ref = p.dataRef || today();
    var los = p.admissao ? dayDiff(p.admissao, ref) + 1 : null;
    return h('article', { className: 'ig-card' },
      h('div', { className: 'ig-rec-head' },
        h('div', null,
          h('span', { className: 'ig-label' }, 'Prontuário'),
          h('h3', { className: 'ig-rec-name' }, pc.iniciais || '—'),
          h('div', { className: 'ig-row', style: { marginTop: 4 } },
            h('span', { className: 'ig-mono' }, pc.prontuario),
            h('span', { className: 'ig-muted ig-small' }, [pc.idade != null ? pc.idade + ' anos' : null, pc.sexo].filter(Boolean).join(' · ')))),
        h('div', { className: 'ig-row' },
          p.precaucao ? h(StatusBadge, { status: 'warn' }, 'Precaução de ' + p.precaucao) : h(StatusBadge, { status: 'neutral' }, 'Precaução padrão'))),
      h('dl', { className: 'ig-facts', style: { marginTop: 16 } },
        h('div', null, h('dt', null, 'Setor'), h('dd', null, p.setor || '—')),
        h('div', null, h('dt', null, 'Leito'), h('dd', null, p.leito || '—')),
        h('div', null, h('dt', null, 'Admissão'), h('dd', null, fdate(p.admissao))),
        h('div', null, h('dt', null, 'Internação'), h('dd', { className: 'ig-num' }, los != null ? los + ' dias' : '—'))),
      p.dispositivos && p.dispositivos.length ? h('div', { className: 'ig-section' },
        h('span', { className: 'ig-label' }, 'Dispositivos invasivos — dia de uso'),
        h('div', { className: 'ig-devices' }, p.dispositivos.map(function (dv, i) {
          var dias = dv.inicio ? dayDiff(dv.inicio, dv.retirada || ref) + 1 : null;
          var tone = dv.retirada ? 'neutral' : dias > 2 ? 'info' : 'neutral';
          return h('span', { key: i, className: 'ig-device', title: dias > 2 ? 'Mais de 2 dias: elegível aos critérios de IRAS associada a dispositivo' : 'Até 2 dias de uso' },
            h('b', null, dv.tipo), dv.sitio ? h('span', { className: 'ig-muted' }, dv.sitio) : null,
            h('span', { className: cx('ig-days', 'ig-tone-' + tone) }, dv.retirada ? 'retirado' : 'D' + dias));
        })),
        h('p', { className: 'ig-card-sub', style: { marginTop: 8 } }, 'D1 = dia da instalação. A partir de D3 o paciente é elegível aos critérios de IRAS associada ao dispositivo.')) : null,
      p.culturas && p.culturas.length ? h('div', { className: 'ig-section' },
        h('span', { className: 'ig-label' }, 'Culturas e exames'),
        h('ul', { className: 'ig-list' }, p.culturas.map(function (c, i) {
          var r = CULT[c.resultado] || CULT.pendente;
          return h('li', { key: i },
            h('span', null, h('b', null, c.material), h('span', { className: 'ig-muted ig-small' }, ' · ' + fdate(c.coleta)),
              c.microrganismo ? h('span', null, ' — ', h('i', null, c.microrganismo)) : null),
            h('span', { className: 'ig-row', style: { gap: 6 } },
              c.perfil ? h(StatusBadge, { status: 'crit' }, 'MDR · ' + c.perfil) : null,
              h(StatusBadge, { status: r[0] }, r[1])));
        }))) : null,
      p.iras && p.iras.length ? h('div', { className: 'ig-section' },
        h('span', { className: 'ig-label' }, 'Notificações de IRAS'),
        h('ul', { className: 'ig-list' }, p.iras.map(function (n, i) {
          return h('li', { key: i },
            h('span', { className: 'ig-row', style: { gap: 8 } }, h(InfectionTag, { type: n.tipo }),
              h('span', { className: 'ig-small' }, fdate(n.dataEvento) + (n.criterio ? ' · ' + n.criterio : ''))),
            h(StatusBadge, { status: IRAS_ST[n.status] || 'neutral' }, n.status ? n.status.charAt(0).toUpperCase() + n.status.slice(1) : 'Sem status'));
        }))) : null,
      p.footer ? h('div', { className: 'ig-section ig-row' }, p.footer) : null);
  }

  /* ---------- SurgeryRecord ---------- */
  function riskIndex(p) {
    var pts = 0;
    if ((p.asa || 0) >= 3) pts++;
    if (p.potencial === 'contaminada' || p.potencial === 'infectada') pts++;
    if (p.duracaoMin != null && p.p75Min != null && p.duracaoMin > p.p75Min) pts++;
    return pts;
  }
  function SurgeryRecord(p) {
    var irc = riskIndex(p), pf = p.profilaxia || null, janela = (pf && pf.janelaMin) || 60;
    var pfOk = pf ? (pf.minutosAntesIncisao > 0 && pf.minutosAntesIncisao <= janela && (pf.duracaoHoras == null || pf.duracaoHoras <= 24)) : null;
    var dias = p.implante ? 90 : 30, ate = p.data ? addDays(p.data.slice(0, 10), dias) : null;
    var vig = p.vigilancia || {};
    var vigTone = vig.status === 'ISC confirmada' ? 'crit' : vig.status === 'sem ISC' ? 'ok' : 'info';
    return h('article', { className: 'ig-card' },
      h('div', { className: 'ig-rec-head' },
        h('div', null,
          h('span', { className: 'ig-label' }, 'Registro cirúrgico'),
          h('h3', { className: 'ig-rec-name' }, p.procedimento),
          h('div', { className: 'ig-row', style: { marginTop: 4 } },
            p.codigo ? h('span', { className: 'ig-mono' }, p.codigo) : null,
            p.paciente ? h('span', { className: 'ig-muted ig-small' }, p.paciente.iniciais + ' · ', h('span', { className: 'ig-mono' }, p.paciente.prontuario)) : null)),
        h(StatusBadge, { status: vigTone }, vig.status ? 'Vigilância: ' + vig.status : 'Em vigilância até ' + fdate(ate))),
      h('dl', { className: 'ig-facts', style: { marginTop: 16 } },
        h('div', null, h('dt', null, 'Data'), h('dd', null, fdate(p.data))),
        h('div', null, h('dt', null, 'Sala / especialidade'), h('dd', null, [p.sala, p.especialidade].filter(Boolean).join(' · '))),
        h('div', null, h('dt', null, 'Potencial de contaminação'), h('dd', null, p.potencial ? p.potencial.charAt(0).toUpperCase() + p.potencial.slice(1) : '—')),
        h('div', null, h('dt', null, 'ASA'), h('dd', { className: 'ig-num' }, p.asa != null ? 'ASA ' + p.asa : '—')),
        h('div', null, h('dt', null, 'Duração / P75'), h('dd', { className: 'ig-num' }, (p.duracaoMin != null ? p.duracaoMin + ' min' : '—') + (p.p75Min != null ? ' / ' + p.p75Min + ' min' : ''))),
        h('div', null, h('dt', null, 'Índice de risco (IRIC)'), h('dd', { className: 'ig-row', style: { gap: 8 } },
          h('span', { className: 'ig-risk', 'aria-hidden': true }, [0, 1, 2].map(function (k) { return h('i', { key: k, className: k < irc ? 'on' : null }); })),
          h('b', { className: 'ig-num' }, irc + ' de 3')))),
      pf ? h('div', { className: 'ig-section' },
        h('span', { className: 'ig-label' }, 'Antibioticoprofilaxia'),
        h('div', { className: 'ig-row', style: { justifyContent: 'space-between' } },
          h('span', null, h('b', null, pf.antimicrobiano), pf.dose ? ' ' + pf.dose : '', h('span', { className: 'ig-muted ig-small' },
            ' · ' + pf.minutosAntesIncisao + ' min antes da incisão' + (pf.duracaoHoras != null ? ' · duração ' + pf.duracaoHoras + ' h' : '') + (pf.repique ? ' · repique realizado' : ''))),
          h(StatusBadge, { status: pfOk ? 'ok' : 'crit' }, pfOk ? 'Profilaxia conforme' : 'Profilaxia não conforme'))) : null,
      p.caixas && p.caixas.length ? h('div', { className: 'ig-section' },
        h('span', { className: 'ig-label' }, 'Materiais e caixas cirúrgicas (rastreabilidade)'),
        h('ul', { className: 'ig-list' }, p.caixas.map(function (c, i) {
          return h('li', { key: i },
            h('span', null, h('span', { className: 'ig-mono' }, c.codigo), ' ', c.descricao),
            h('span', { className: 'ig-row', style: { gap: 8 } },
              h('span', { className: 'ig-mono ig-muted' }, 'Lote ' + c.lote + (c.ciclo ? ' · Ciclo ' + c.ciclo : '')),
              h(StatusBadge, { status: c.status || 'ok' }, c.status === 'crit' ? 'Lote recolhido' : c.status === 'warn' ? 'IB pendente' : 'Lote liberado')));
        }))) : null,
      h('p', { className: 'ig-card-sub', style: { marginTop: 12 } },
        'Vigilância pós-alta de ' + dias + ' dias' + (p.implante ? ' (com implante)' : '') + (ate ? ', até ' + fdate(ate) : '') + '.'));
  }

  /* ---------- SterilizationCycle ---------- */
  var TEST = { aprovado: ['ok', 'Aprovado'], reprovado: ['crit', 'Reprovado'], pendente: ['warn', 'Em leitura'] };
  function SterilizationCycle(p) {
    var tests = p.testes || [];
    var anyFail = tests.some(function (t) { return t.resultado === 'reprovado'; });
    var anyPend = tests.some(function (t) { return t.resultado === 'pendente'; });
    var st = anyFail ? ['crit', 'Carga bloqueada — recolher itens'] : anyPend ? ['warn', p.implantavel ? 'Aguardando IB — não liberar implantáveis' : 'Liberação condicionada à leitura'] : ['ok', 'Carga liberada'];
    return h('article', { className: 'ig-card' },
      h('div', { className: 'ig-rec-head' },
        h('div', null,
          h('span', { className: 'ig-label' }, 'Ciclo de esterilização'),
          h('h3', { className: 'ig-rec-name' }, p.equipamento),
          h('div', { className: 'ig-row', style: { marginTop: 4 } },
            h('span', { className: 'ig-mono' }, 'Ciclo ' + p.ciclo),
            h('span', { className: 'ig-muted ig-small' }, [fdate(p.data), p.metodo].filter(Boolean).join(' · ')))),
        h(StatusBadge, { status: st[0] }, st[1])),
      p.parametros ? h('dl', { className: 'ig-facts', style: { marginTop: 16 } }, p.parametros.map(function (q, i) {
        return h('div', { key: i }, h('dt', null, q.nome), h('dd', { className: 'ig-num' }, q.valor));
      })) : null,
      h('div', { className: 'ig-section' },
        h('span', { className: 'ig-label' }, 'Testes e indicadores'),
        h('div', { className: 'ig-tests' }, tests.map(function (t, i) {
          var r = TEST[t.resultado] || TEST.pendente;
          return h('div', { key: i, className: 'ig-test' },
            h('span', { className: 'ig-test-name' }, t.tipo),
            t.detalhe ? h('span', { className: 'ig-muted ig-small' }, t.detalhe) : null,
            h('span', null, h(StatusBadge, { status: r[0] }, r[1])));
        }))),
      h('div', { className: 'ig-section ig-row', style: { justifyContent: 'space-between' } },
        h('span', { className: 'ig-small ig-muted' },
          (p.itens != null ? p.itens + ' itens na carga' : '') + (p.implantavel ? ' · contém implantável' : '') + (p.operador ? ' · Operador: ' + p.operador : '')),
        p.actions || null));
  }

  /* ---------- TraceTimeline ---------- */
  function TraceTimeline(p) {
    var steps = p.etapas || [], it = p.item || {};
    var worst = steps.some(function (s) { return s.status === 'crit'; }) ? 'crit' : steps.some(function (s) { return s.status === 'warn' || s.status === 'neutral' || !s.status; }) ? 'warn' : 'ok';
    var label = { ok: 'Rastreabilidade completa', warn: 'Elo pendente', crit: 'Quebra na cadeia' }[worst];
    return h('article', { className: 'ig-card' },
      h('div', { className: 'ig-rec-head', style: { marginBottom: 16 } },
        h('div', null,
          h('span', { className: 'ig-label' }, 'Rastreabilidade do material'),
          h('h3', { className: 'ig-card-title', style: { fontSize: 18 } }, it.descricao),
          h('div', { className: 'ig-row', style: { marginTop: 2 } },
            h('span', { className: 'ig-mono' }, it.codigo), it.lote ? h('span', { className: 'ig-mono ig-muted' }, 'Lote ' + it.lote) : null)),
        h(StatusBadge, { status: worst }, label)),
      h('ol', { className: 'ig-tl' }, steps.map(function (s, i) {
        var tone = s.status || 'neutral';
        return h('li', { key: i },
          h('span', { className: cx('ig-tl-dot', 'ig-tone-' + tone), 'aria-hidden': true }, tone === 'neutral' ? null : h(Icon, { name: tone, size: 14, weight: 2.5 })),
          h('div', null,
            h('div', { className: 'ig-tl-step' },
              h('b', null, s.etapa),
              h('span', { className: 'ig-small ig-muted ig-num' }, s.data ? fdate(s.data) : 'Não registrado')),
            s.detalhe || s.responsavel ? h('div', { className: 'ig-small ig-muted' }, [s.detalhe, s.responsavel ? 'Resp.: ' + s.responsavel : null].filter(Boolean).join(' · ')) : null,
            tone !== 'ok' ? h('span', { className: 'ig-small', style: { color: 'var(--ink)' } }, tone === 'crit' ? 'Não conformidade registrada nesta etapa.' : tone === 'warn' ? 'Etapa com pendência.' : 'Etapa ainda não realizada.') : null));
      })));
  }

  /* ---------- TrainingProgress ---------- */
  function TrainingProgress(p) {
    var meta = p.meta == null ? 90 : p.meta;
    return h('div', { className: 'ig-card' },
      h('div', { className: 'ig-card-head' },
        h('div', null, h('h3', { className: 'ig-card-title' }, p.title || 'Treinamentos'),
          h('p', { className: 'ig-card-sub' }, 'Cobertura por tema · meta ' + nf(meta) + '% (linha vertical)'))),
      h('div', { className: 'ig-prog' }, (p.itens || []).map(function (t, i) {
        var pc = t.total ? t.concluidos / t.total * 100 : 0;
        var s = statusFor(pc, meta, 'higher', p.band == null ? 15 : p.band);
        return h('div', { key: i, className: 'ig-prog-item' },
          h('div', { className: 'ig-prog-head' },
            h('div', { className: 'ig-prog-name' }, t.tema, h('small', null, [t.publico, t.proximaReciclagem ? 'reciclagem ' + fdate(t.proximaReciclagem) : null].filter(Boolean).join(' · '))),
            h('div', { className: 'ig-prog-val' },
              h('b', null, nf(pc) + '%'), h('span', { className: 'ig-muted' }, t.concluidos + '/' + t.total),
              h(StatusBadge, { status: s }))),
          h('div', { className: 'ig-prog-track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pc), 'aria-label': t.tema },
            h('div', { className: 'ig-prog-fill', style: { width: Math.min(100, pc) + '%', background: cssVar(s) } }),
            h('div', { className: 'ig-prog-meta', style: { left: 'calc(' + meta + '% - 1px)' } })));
      })));
  }

  /* ---------- BundleChecklist ---------- */
  function BundleChecklist(p) {
    var init = (p.itens || []).map(function (i) { return i.resposta || null; });
    var st = R.useState(init), ans = st[0];
    var set = function (i, v) {
      if (p.editable === false) return;
      var nx = ans.slice(); nx[i] = nx[i] === v ? null : v; st[1](nx);
      if (p.onChange) p.onChange(nx);
    };
    var open = ans.filter(function (a) { return a == null; }).length;
    var nao = ans.filter(function (a) { return a === 'nao'; }).length;
    var res = nao ? ['crit', 'Não conforme — ' + nao + (nao > 1 ? ' itens' : ' item')] : open ? ['neutral', 'Incompleto — ' + open + ' sem resposta'] : ['ok', 'Bundle conforme'];
    var opts = [['sim', 'Sim', 'ig-yes'], ['nao', 'Não', 'ig-no'], ['na', 'N/A', 'ig-na']];
    return h('div', { className: 'ig-card' },
      h('div', { className: 'ig-card-head' },
        h('div', null, h('h3', { className: 'ig-card-title' }, p.title),
          h('p', { className: 'ig-card-sub' }, [p.setor, p.data ? fdate(p.data) : null, p.auditor ? 'Auditor: ' + p.auditor : null].filter(Boolean).join(' · '))),
        h(StatusBadge, { status: res[0] }, res[1])),
      h('ul', { className: 'ig-chk' }, (p.itens || []).map(function (it, i) {
        return h('li', { key: i },
          h('span', null, it.texto),
          h('span', { className: 'ig-seg', role: 'group', 'aria-label': it.texto }, opts.map(function (o) {
            return h('button', { key: o[0], type: 'button', className: cx('ig-check', o[2]), 'aria-pressed': ans[i] === o[0], onClick: function () { set(i, o[0]); } }, o[1]);
          })));
      })),
      h('p', { className: 'ig-card-sub', style: { marginTop: 12 } }, 'Adesão ao bundle é “tudo ou nada”: um único “Não” torna o registro não conforme.'));
  }

  /* ---------- SupplyStock ---------- */
  function SupplyStock(p) {
    var ref = p.dataRef || today();
    var rows = (p.itens || []).map(function (it, i) {
      var cob = it.consumoDia ? it.estoque / it.consumoDia : null, min = it.minimoDias || 15;
      var sc = cob == null ? 'neutral' : cob < min / 2 ? 'crit' : cob < min ? 'warn' : 'ok';
      var dv = it.validade ? dayDiff(ref, it.validade) : null;
      var sv = dv == null ? 'neutral' : dv < 0 ? 'crit' : dv <= 30 ? 'warn' : 'ok';
      var worst = [sc, sv].indexOf('crit') >= 0 ? 'crit' : [sc, sv].indexOf('warn') >= 0 ? 'warn' : sc;
      return Object.assign({ id: i, cobertura: cob, dv: dv, sc: sc, sv: sv, st: worst }, it);
    });
    var cols = [
      { key: 'insumo', label: 'Insumo', render: function (r) { return h('span', null, r.insumo, r.lote ? h('span', { className: 'ig-mono ig-muted', style: { marginLeft: 8, fontSize: 12 } }, r.lote) : null); } },
      { key: 'estoque', label: 'Estoque', align: 'right', render: function (r) { return nf(r.estoque) + ' ' + (r.unidade || ''); } },
      { key: 'consumoDia', label: 'Consumo/dia', align: 'right', render: function (r) { return nf(r.consumoDia, 1); } },
      { key: 'cobertura', label: 'Cobertura', align: 'right', render: function (r) { return r.cobertura == null ? '—' : nf(r.cobertura) + ' dias'; } },
      { key: 'validade', label: 'Validade', render: function (r) { return h('span', { className: 'ig-row', style: { gap: 6 } }, fdate(r.validade), r.sv === 'warn' ? h(StatusBadge, { status: 'warn' }, 'Vence em ' + r.dv + ' d') : r.sv === 'crit' ? h(StatusBadge, { status: 'crit' }, 'Vencido') : null); } },
      { key: 'st', label: 'Situação', sortValue: function (r) { return { crit: 0, warn: 1, ok: 2, neutral: 3 }[r.st]; }, render: function (r) { return h(StatusBadge, { status: r.st }, r.st === 'ok' ? 'Abastecido' : r.st === 'warn' ? 'Repor' : r.st === 'crit' ? 'Ruptura iminente' : 'Sem consumo'); } }
    ];
    return h(DataTable, { caption: p.title || 'Insumos de prevenção e controle', columns: cols, rows: rows, initialSort: { key: 'st', dir: 'asc' } });
  }

  var api = {
    Button: Button, StatusBadge: StatusBadge, InfectionTag: InfectionTag, AlertBanner: AlertBanner,
    KpiCard: KpiCard, TrendChart: TrendChart, BarChart: BarChart, DataTable: DataTable,
    PatientRecord: PatientRecord, SurgeryRecord: SurgeryRecord, SterilizationCycle: SterilizationCycle,
    TraceTimeline: TraceTimeline, TrainingProgress: TrainingProgress, BundleChecklist: BundleChecklist, SupplyStock: SupplyStock,
    IRAS: IRAS, statusFor: statusFor, riskIndex: riskIndex, format: { number: nf, date: fdate }
  };
  window.Integra = Object.assign(window.Integra || {}, api);
})();
