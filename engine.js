// Experiment Readout engine. Runs in the browser and in Node (scripts and tests).
// Two steps: summarise(rows, mapping) turns raw rows into sufficient statistics,
// readout(summary, settings) turns those statistics into checks, metric results and a decision.
(function (root) {
  'use strict';

  // ---------- maths ----------
  // Standard normal CDF (Abramowitz and Stegun 7.1.26, error below 1.5e-7)
  function normCdf(x) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  // Inverse normal CDF (Acklam's algorithm)
  function normInv(p) {
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425;
    let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const twoSidedP = (z) => 2 * (1 - normCdf(Math.abs(z)));
  // Chi-square test of the observed split against the planned split (1 degree of freedom for 2 groups)
  function srmTest(nA, nB, shareA) {
    const n = nA + nB, eA = n * shareA, eB = n * (1 - shareA);
    const chi = (nA - eA) ** 2 / eA + (nB - eB) ** 2 / eB;
    return { chi, p: twoSidedP(Math.sqrt(chi)) };
  }

  // ---------- parsing ----------
  function parseCsv(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (ch !== '\r') f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    const head = (rows.shift() || []).map((h) => h.trim());
    return { head, rows: rows.filter((r) => r.length === head.length) };
  }
  const BOOL_T = new Set(['1', 'true', 'yes', 'y', 't']), BOOL_F = new Set(['0', 'false', 'no', 'n', 'f']);
  // Guess column roles from names and values, so the mapping step starts filled in
  function guessMapping(parsed) {
    const { head, rows } = parsed; const sample = rows.slice(0, 2000);
    const info = head.map((h, j) => {
      const vals = sample.map((r) => r[j].trim()); const uniq = new Set(vals.map((v) => v.toLowerCase()));
      const isBool = [...uniq].every((v) => BOOL_T.has(v) || BOOL_F.has(v));
      const isNum = vals.every((v) => v !== '' && !isNaN(Number(v)));
      const isTime = vals.slice(0, 50).every((v) => /^\d{4}-\d{2}-\d{2}/.test(v));
      return { name: h, j, uniq: uniq.size, isBool, isNum, isTime };
    });
    const by = (re) => info.find((c) => re.test(c.name.toLowerCase()));
    const id = by(/(^|_)(user|player|customer|visitor)?_?id$|userid/);
    const group = by(/^(group|version|variant|arm|bucket|treatment)$/) || info.find((c) => c.uniq === 2 && !c.isBool && !c.isNum);
    const time = info.find((c) => c.isTime);
    const shown = info.find((c) => c !== group && c.uniq === 2 && !c.isBool && !c.isNum && /page|shown|exposure|experience|landing/.test(c.name.toLowerCase()));
    const metrics = info.filter((c) => c !== id && c !== group && c !== time && c !== shown && (c.isBool || c.isNum)).map((c) => c.name);
    return { id: id && id.name, group: group && group.name, time: time && time.name, shown: shown && shown.name, metrics };
  }

  // ---------- summarise ----------
  // mapping: { id, group, shown, time, metrics: [...], control }
  function summarise(parsed, mapping) {
    const { head, rows } = parsed; const col = (n) => (n ? head.indexOf(n) : -1);
    const gi = col(mapping.group), ii = col(mapping.id), si = col(mapping.shown), ti = col(mapping.time);
    const groups = [...new Set(rows.map((r) => r[gi].trim()))];
    if (groups.length !== 2) throw new Error('The group column needs exactly two values. It has ' + groups.length + ': ' + groups.slice(0, 5).join(', '));
    const control = groups.includes(mapping.control) ? mapping.control : groups.sort()[0];
    const treatment = groups.find((g) => g !== control);
    // Duplicates: users with more than one row
    const seen = new Map(); let dupRows = 0;
    if (ii >= 0) rows.forEach((r) => { const k = r[ii]; seen.set(k, (seen.get(k) || 0) + 1); });
    const dupUsers = new Set(); if (ii >= 0) seen.forEach((c, k) => { if (c > 1) { dupUsers.add(k); dupRows += c; } });
    // Assignment mismatches: for each group, the most common "shown" value is expected, the rest are mismatches
    const pair = {}; if (si >= 0) rows.forEach((r) => { const k = r[gi].trim() + '\u0001' + r[si].trim(); pair[k] = (pair[k] || 0) + 1; });
    const expectedShown = {}; if (si >= 0) groups.forEach((g) => {
      let best = null, bn = -1; Object.entries(pair).forEach(([k, n]) => { const [gg, s] = k.split('\u0001'); if (gg === g && n > bn) { best = s; bn = n; } });
      expectedShown[g] = best;
    });
    const isMismatch = (r) => si >= 0 && r[si].trim() !== expectedShown[r[gi].trim()];
    const mismatchRows = si >= 0 ? rows.filter(isMismatch).length : 0;
    // Clean set: drop mismatched rows and every row of a duplicated user
    const clean = rows.filter((r) => !isMismatch(r) && !(ii >= 0 && dupUsers.has(r[ii])));
    const metricKinds = {}; mapping.metrics.forEach((m) => {
      const j = col(m); const vals = clean.slice(0, 5000).map((r) => r[j].trim().toLowerCase());
      metricKinds[m] = vals.every((v) => BOOL_T.has(v) || BOOL_F.has(v)) ? 'rate' : 'mean';
    });
    const stat = {}; [control, treatment].forEach((g) => { stat[g] = { n: 0, m: {} }; mapping.metrics.forEach((m) => { stat[g].m[m] = { sum: 0, sumsq: 0, max: -Infinity, vals: [] }; }); });
    const daily = {};
    clean.forEach((r) => {
      const g = r[gi].trim(); const s = stat[g]; s.n++;
      mapping.metrics.forEach((m) => {
        const raw = r[col(m)].trim().toLowerCase(); const v = metricKinds[m] === 'rate' ? (BOOL_T.has(raw) ? 1 : 0) : Number(raw);
        const o = s.m[m]; o.sum += v; o.sumsq += v * v; if (v > o.max) o.max = v; if (metricKinds[m] === 'mean') o.vals.push(v);
      });
      if (ti >= 0) {
        const day = r[ti].slice(0, 10); const m0 = mapping.metrics[0];
        daily[day] = daily[day] || {}; daily[day][g] = daily[day][g] || { n: 0, sum: 0 };
        daily[day][g].n++; const raw = r[col(m0)].trim().toLowerCase();
        daily[day][g].sum += metricKinds[m0] === 'rate' ? (BOOL_T.has(raw) ? 1 : 0) : Number(raw);
      }
    });
    // Keep only what the readout needs: a 99th percentile instead of all values
    [control, treatment].forEach((g) => mapping.metrics.forEach((m) => {
      const o = stat[g].m[m];
      if (o.vals.length) { o.vals.sort((a, b) => a - b); o.p99 = o.vals[Math.floor(o.vals.length * 0.99)]; }
      delete o.vals;
    }));
    return {
      control, treatment, rowsIn: rows.length, cleanRows: clean.length,
      rawSplit: Object.fromEntries(groups.map((g) => [g, rows.filter((r) => r[gi].trim() === g).length])),
      duplicates: { users: dupUsers.size, rows: dupRows, checked: ii >= 0 },
      mismatches: { rows: mismatchRows, checked: si >= 0, expectedShown },
      metricKinds, stat, daily: ti >= 0 ? daily : null, metrics: mapping.metrics,
    };
  }

  // Summary from typed-in counts (no row data): one rate metric
  function fromCounts(c) {
    const mk = (n, x) => ({ n, m: { conversions: { sum: x, sumsq: x, max: 1 } } });
    return {
      control: 'control', treatment: 'treatment', rowsIn: c.nA + c.nB, cleanRows: c.nA + c.nB, rawSplit: { control: c.nA, treatment: c.nB },
      duplicates: { checked: false }, mismatches: { checked: false }, metricKinds: { conversions: 'rate' },
      stat: { control: mk(c.nA, c.xA), treatment: mk(c.nB, c.xB) }, daily: null, metrics: ['conversions'],
    };
  }

  // ---------- readout ----------
  // settings: { primary, guardrails: [..], alpha, minLift (relative, e.g. 0.01), guardrailTol (relative), srmAlpha, plannedShare, higherIsBetter: {metric: bool} }
  function compare(sum, m, alpha) {
    const A = sum.stat[sum.control], B = sum.stat[sum.treatment];
    const a = A.m[m], b = B.m[m];
    const meanA = a.sum / A.n, meanB = b.sum / B.n;
    const varA = Math.max(0, a.sumsq / A.n - meanA * meanA) * A.n / Math.max(1, A.n - 1);
    const varB = Math.max(0, b.sumsq / B.n - meanB * meanB) * B.n / Math.max(1, B.n - 1);
    const se = Math.sqrt(varA / A.n + varB / B.n);
    // Pooled standard error for the p-value of a rate, unpooled for the interval
    let seTest = se;
    if (sum.metricKinds[m] === 'rate') { const p = (a.sum + b.sum) / (A.n + B.n); seTest = Math.sqrt(p * (1 - p) * (1 / A.n + 1 / B.n)); }
    const diff = meanB - meanA, z = seTest > 0 ? diff / seTest : 0, zc = normInv(1 - alpha / 2);
    const lo = diff - zc * se, hi = diff + zc * se;
    // Smallest true difference this sample detects 80% of the time
    const mde = (zc + normInv(0.8)) * se;
    const heavyTail = sum.metricKinds[m] === 'mean' && a.p99 > 0 && (Math.max(a.max, b.max) / Math.max(a.p99, b.p99)) > 20;
    return {
      metric: m, kind: sum.metricKinds[m], nA: A.n, nB: B.n, meanA, meanB, diff, rel: meanA ? diff / meanA : null,
      lo, hi, relLo: meanA ? lo / meanA : null, relHi: meanA ? hi / meanA : null, p: twoSidedP(z), mde, relMde: meanA ? mde / meanA : null,
      significant: twoSidedP(z) < alpha, heavyTail, maxVal: Math.max(a.max, b.max), p99: Math.max(a.p99 || 0, b.p99 || 0),
    };
  }

  function readout(sum, s) {
    const checks = [];
    const nA = sum.stat[sum.control].n, nB = sum.stat[sum.treatment].n;
    const srm = srmTest(nA, nB, s.plannedShare);
    checks.push({
      id: 'srm', label: 'Split between groups', status: srm.p < s.srmAlpha ? 'fail' : 'pass',
      detail: `${nA.toLocaleString('en')} in ${sum.control} and ${nB.toLocaleString('en')} in ${sum.treatment} after cleaning (planned ${Math.round(s.plannedShare * 100)}/${Math.round((1 - s.plannedShare) * 100)}). A split this uneven happens by chance with p = ${fmtP(srm.p)}.`,
      p: srm.p,
    });
    if (sum.mismatches.checked) {
      const share = sum.mismatches.rows / sum.rowsIn;
      checks.push({ id: 'mismatch', label: 'Users saw the version of their group', status: share > 0.05 ? 'fail' : share > 0 ? 'warn' : 'pass',
        detail: sum.mismatches.rows ? `${sum.mismatches.rows.toLocaleString('en')} rows (${pct(share, 2)}) show a version that does not match the group. They were removed before the analysis. Above 5% this blocks the decision.` : 'Every row shows the version that matches its group.' });
    } else checks.push({ id: 'mismatch', label: 'Users saw the version of their group', status: 'skip', detail: 'Not checked: no column for the version shown.' });
    if (sum.duplicates.checked) {
      checks.push({ id: 'dups', label: 'One row per user', status: sum.duplicates.users ? 'warn' : 'pass',
        detail: sum.duplicates.users ? `${sum.duplicates.users.toLocaleString('en')} users appear more than once (${sum.duplicates.rows.toLocaleString('en')} rows). All their rows were removed, because their group cannot be trusted.` : 'Every user appears once.' });
    } else checks.push({ id: 'dups', label: 'One row per user', status: 'skip', detail: 'Not checked: no user ID column.' });
    const minN = Math.min(nA, nB);
    checks.push({ id: 'size', label: 'Enough users for the statistics used', status: minN < 1000 ? 'warn' : 'pass',
      detail: minN < 1000 ? `The smaller group has ${minN} users. The normal approximation used here is rough below about 1,000 per group.` : `The smaller group has ${minN.toLocaleString('en')} users.` });

    const primary = compare(sum, s.primary, s.alpha);
    const guards = (s.guardrails || []).filter((g) => g !== s.primary).map((g) => compare(sum, g, s.alpha));
    if (primary.heavyTail) checks.push({ id: 'tail', label: 'Outliers in the primary metric', status: 'warn',
      detail: `The largest value (${primary.maxVal.toLocaleString('en')}) is more than 20 times the 99th percentile (${primary.p99.toLocaleString('en')}). A few users can move the average.` });

    // Higher is better unless the setting says otherwise
    const better = (r) => ((s.higherIsBetter || {})[r.metric] === false ? -1 : 1);
    const reasons = []; let decision;
    const badData = checks.some((c) => c.status === 'fail');
    const guardHit = guards.filter((g) => better(g) * g.diff < 0 && g.significant && Math.abs(g.rel) >= s.guardrailTol);
    const pSign = better(primary);
    const worthwhile = s.minLift * Math.abs(primary.meanA);
    if (badData) {
      decision = 'fix';
      checks.filter((c) => c.status === 'fail').forEach((c) => reasons.push(`${c.label}: failed. ${c.detail}`));
      reasons.push('Results from a test with this problem can be biased in either direction. Find the cause before deciding.');
    } else if (guardHit.length) {
      decision = 'no';
      guardHit.forEach((g) => reasons.push(`Guardrail "${g.metric}" got worse: ${fmtVal(g.meanA, g.kind)} to ${fmtVal(g.meanB, g.kind)} (${signPct(g.rel)}, p = ${fmtP(g.p)}).`));
    } else if (primary.significant && pSign * primary.lo > 0) {
      decision = 'ship';
      reasons.push(`"${primary.metric}" improved from ${fmtVal(primary.meanA, primary.kind)} to ${fmtVal(primary.meanB, primary.kind)} (${signPct(primary.rel)}, p = ${fmtP(primary.p)}).`);
      if (pSign * primary.lo < worthwhile) reasons.push(`The interval still includes lifts smaller than your minimum worthwhile lift of ${pct(s.minLift, 1)}.`);
    } else if (primary.significant) {
      decision = 'no';
      reasons.push(`"${primary.metric}" got worse: ${fmtVal(primary.meanA, primary.kind)} to ${fmtVal(primary.meanB, primary.kind)} (${signPct(primary.rel)}, p = ${fmtP(primary.p)}).`);
    } else if (pSign * (pSign > 0 ? primary.hi : primary.lo) < worthwhile) {
      decision = 'no';
      reasons.push(`No significant change in "${primary.metric}" (p = ${fmtP(primary.p)}), and the 95% interval rules out a lift as large as your minimum worthwhile lift of ${pct(s.minLift, 1)}.`);
    } else {
      decision = 'longer';
      reasons.push(`No significant change in "${primary.metric}" (p = ${fmtP(primary.p)}), but the interval (${signPct(primary.relLo)} to ${signPct(primary.relHi)}) still includes a worthwhile lift.`);
      const factor = (primary.mde / Math.max(worthwhile, 1e-12)) ** 2;
      if (isFinite(factor) && factor > 1) reasons.push(`To detect a ${pct(s.minLift, 1)} lift 80% of the time, the test needs about ${Math.ceil(factor * 10) / 10} times its current number of users.`);
    }
    guards.filter((g) => !guardHit.includes(g)).forEach((g) => reasons.push(better(g) * g.diff < 0 && g.significant
      ? `Guardrail "${g.metric}": a significant drop (${signPct(g.rel)}, p = ${fmtP(g.p)}), but smaller than your tolerance of ${pct(s.guardrailTol, 1)}.`
      : better(g) * g.diff > 0 && g.significant
        ? `Guardrail "${g.metric}": improved (${signPct(g.rel)}, p = ${fmtP(g.p)}).`
        : `Guardrail "${g.metric}": no significant drop (${signPct(g.rel)}, p = ${fmtP(g.p)}).`));
    return { decision, reasons, checks, primary, guards, srm };
  }

  // ---------- formatting ----------
  function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + '%'; }
  function signPct(x) { return x == null ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%'; }
  function fmtP(p) { return p < 0.0001 ? '< 0.0001' : p.toFixed(4); }
  function fmtVal(v, kind) { return kind === 'rate' ? (v * 100).toFixed(2) + '%' : v.toFixed(2); }

  const api = { normCdf, normInv, srmTest, parseCsv, guessMapping, summarise, fromCounts, readout, compare, fmt: { pct, signPct, fmtP, fmtVal } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ER = api;
})(typeof window !== 'undefined' ? window : globalThis);
