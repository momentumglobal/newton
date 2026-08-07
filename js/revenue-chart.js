// js/revenue-chart.js — shared Revenue Tracking chart renderer.
// Pure presentation: no network I/O, no DOM access. Depends only on
// CONFIG.REVENUE_THRESHOLDS, computeMonthlyRevenueForYear() and
// computeMonthlyForecastRevenueForYear() (both in utils.js).
// Loaded by sales.html (Revenue Tracking page) and command-centre.html
// (Revenue tile expanded detail).

function _fmtGBPk(v) {
  return '£' + Math.round(v).toLocaleString('en-GB');
}

// ── Revenue Line Graph (mirrors People > Team Utilisation) ────────
function _renderRevenueLineGraph(assignments, year, salesForecasts) {
  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const revenue = computeMonthlyRevenueForYear(assignments, year); // array[12]
  const forecastRev = computeMonthlyForecastRevenueForYear(salesForecasts || [], year);

  // Combined (estimated + forecast) series, used from the fork month onward
  const combined = revenue.map((v, i) => v + forecastRev[i]);

  // Fork at the current calendar month (same index rule for all years)
  const forkIdx = new Date().getMonth();

  const green = CONFIG.REVENUE_THRESHOLDS.green;
  const amber = CONFIG.REVENUE_THRESHOLDS.amber;

  // Dynamic y-axis: top is 10% above the higher of (max month, combined, green band)
  const dataMax = Math.max(...revenue, ...combined, green);
  const yMax    = Math.ceil((dataMax * 1.1) / 25000) * 25000; // round to £25k

  const W = 900, H = 240;
  const PAD = { top: 10, right: 24, bottom: 32, left: 64 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  const xOf = (i) => PAD.left + (i / 11) * chartW;
  const yOf = (v) => PAD.top + chartH - (Math.min(v, yMax) / yMax) * chartH;

  // Gridlines every £50k
  const gridVals = [];
  for (let v = 0; v <= yMax; v += 50000) gridVals.push(v);
  const gridLines = gridVals.map(v => {
    const y = yOf(v);
    return `
      <line x1='${PAD.left}' y1='${y}' x2='${W - PAD.right}' y2='${y}'
            stroke='#e8e8e8' stroke-width='1'/>
      <text x='${PAD.left - 6}' y='${y + 4}' text-anchor='end'
            font-size='10' fill='#999'>£${(v / 1000).toFixed(0)}k</text>`;
  }).join('');

  const xLabels = MONTH_LABELS.map((lbl, i) =>
    `<text x='${xOf(i)}' y='${PAD.top + chartH + 18}' text-anchor='middle'
           font-size='10' fill='#888'>${lbl}</text>`
  ).join('');

  // Threshold bands: green from green→top, orange amber→green, red 0→amber
  const bands = `
    <rect x='${PAD.left}' y='${yOf(yMax)}' width='${chartW}'
          height='${yOf(green) - yOf(yMax)}' fill='#e6f4ea' opacity='0.6'/>
    <rect x='${PAD.left}' y='${yOf(green)}' width='${chartW}'
          height='${yOf(amber) - yOf(green)}' fill='#fff3e0' opacity='0.6'/>
    <rect x='${PAD.left}' y='${yOf(amber)}' width='${chartW}'
          height='${yOf(0) - yOf(amber)}' fill='#fce8e8' opacity='0.6'/>`;

  const linePts = revenue
    .map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`)
    .join(' ');
  const line = `<polyline points='${linePts}' fill='none' stroke='#2E75B6'
                  stroke-width='2.5' stroke-linejoin='round'/>`;

  // Dashed forecast line: forks at forkIdx (shares that point with the solid
  // line), runs to Dec. Only drawn if any forecast revenue exists from the
  // fork month onward.
  const hasForecast = forecastRev.slice(forkIdx).some(v => v > 0);
  const forecastPts = combined
    .map((v, i) => ({ v, i }))
    .filter(p => p.i >= forkIdx)
    .map(p => `${xOf(p.i).toFixed(1)},${yOf(p.v).toFixed(1)}`)
    .join(' ');
  const forecastLine = hasForecast && forecastPts.includes(' ')
    ? `<polyline points='${forecastPts}' fill='none' stroke='#E8703A'
                stroke-width='2' stroke-dasharray='5,4'
                stroke-linejoin='round' opacity='0.85'/>`
    : '';

  const dots = revenue.map((v, i) => `
    <circle cx='${xOf(i).toFixed(1)}' cy='${yOf(v).toFixed(1)}'
            r='3.5' fill='#2E75B6' stroke='#fff' stroke-width='1.5'>
      <title>${MONTH_LABELS[i]} ${year}: ${_fmtGBPk(v)}</title>
    </circle>`).join('');

  const forecastDots = hasForecast
    ? combined.map((v, i) => ({ v, i }))
        .filter(p => p.i > forkIdx && forecastRev[p.i] > 0)
        .map(p => `
          <circle cx='${xOf(p.i).toFixed(1)}' cy='${yOf(p.v).toFixed(1)}'
                  r='3' fill='#fff' stroke='#E8703A' stroke-width='2' opacity='0.85'>
            <title>${MONTH_LABELS[p.i]} ${year}: ${_fmtGBPk(p.v)} (est. + forecast)</title>
          </circle>`).join('')
    : '';

  return `
    <div style='background:#fff;border:1px solid #e0e0e0;border-radius:6px;
                padding:20px 20px 12px;margin-bottom:24px'>
      <div style='font-size:13px;font-weight:700;color:#1B3A5C;margin-bottom:8px'>
        Estimated Monthly Revenue ${year}</div>
      <svg viewBox='0 0 ${W} ${H}' style='width:100%;height:auto;display:block'
           xmlns='http://www.w3.org/2000/svg'>
        ${bands}
        ${gridLines}
        ${xLabels}
        ${line}
        ${forecastLine}
        ${dots}
        ${forecastDots}
      </svg>
      <div style='display:flex;justify-content:center;gap:24px;margin-top:4px;
                  font-size:11px;color:#555'>
        <div style='display:flex;align-items:center;gap:6px'>
          <svg width='24' height='2' style='overflow:visible'>
            <line x1='0' y1='1' x2='24' y2='1' stroke='#2E75B6' stroke-width='2.5'/>
          </svg>
          Estimated (booked)
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <svg width='24' height='2' style='overflow:visible'>
            <line x1='0' y1='1' x2='24' y2='1' stroke='#E8703A' stroke-width='2'
                  stroke-dasharray='5,4' opacity='0.85'/>
          </svg>
          Estimated + Forecast
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <span style='width:12px;height:12px;background:#e6f4ea;border:1px solid #cde6d4;
                       display:inline-block;border-radius:2px'></span>
          ≥ ${_fmtGBPk(green)}
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <span style='width:12px;height:12px;background:#fff3e0;border:1px solid #f0dcc0;
                       display:inline-block;border-radius:2px'></span>
          ${_fmtGBPk(amber)} – ${_fmtGBPk(green)}
        </div>
        <div style='display:flex;align-items:center;gap:6px'>
          <span style='width:12px;height:12px;background:#fce8e8;border:1px solid #efcccc;
                       display:inline-block;border-radius:2px'></span>
          < ${_fmtGBPk(amber)}
        </div>
      </div>
    </div>`;
}
