// js/pdp-ui-common.js — PDP markup helpers shared by more than one page (N-452)
//
// Moved verbatim from pdp-my.js when My Development left People: the Calibration tab (People > PDP Setup, via
// pdp-assess-ui.js) and the My Momentum pages (pdp-my.js, pdp-team-page.js, pdp-assess-ui.js) all use them.
// Pure string-in / string-out helpers and two lookup maps; no DOM, no network, names no PDP list. Loaded on
// people.html and my-momentum.html, before pdp-track-ui.js / pdp-assess-ui.js, never by mobile.html, Newton for
// Claude or the Command Bar. The names keep their original _pdpm prefix so no caller changes.

const _PDPM_STATE_TEXT  = { done: 'Done', skipped: 'Skipped', overdue: 'Overdue', due: 'Due soon', upcoming: 'Upcoming' };
const _PDPM_STATE_CLASS = { done: 'dh-badge-success', overdue: 'dh-badge-danger', due: 'dh-badge-warn' };

function _pdpmTextHtml(text) {
  return text ? `<div class="pdpm-text">${escHtml(text)}</div>` : '<div class="ppl-muted-small">Nothing written.</div>';
}

function _pdpmListHtml(rows, line) {
  if (!rows.length) return '<div class="ppl-muted-small">None recorded.</div>';
  return `<ul class="pdpm-list">${rows.map(r => `<li>${line(r)}</li>`).join('')}</ul>`;
}

function _pdpmYes(v) { return v === true || v === 1 || v === 'Yes' || v === '1' || v === 'true'; }