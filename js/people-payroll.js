// js/people-payroll.js — Payroll summary modal
async function _openPayrollModal() {
  document.getElementById('payroll-modal-overlay').style.display = 'block';
  _renderPayrollStep1();
}
function _closePayrollModal() {
  document.getElementById('payroll-modal-overlay').style.display = 'none';
}

function _renderPayrollStep1() {
  const now          = new Date();
  const bonusMonths  = [1, 4, 7, 10];
  const curMonth     = now.getMonth() + 1;
  const curYear      = now.getFullYear();
  const isBonusMonth = bonusMonths.includes(curMonth);

  const monthOptions = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ].map((m, i) => `<option value='${i+1}' ${i+1 === curMonth ? 'selected' : ''}>${m}</option>`).join('');

  const yearOptions = [curYear - 1, curYear, curYear + 1]
    .map(y => `<option value='${y}' ${y === curYear ? 'selected' : ''}>${y}</option>`).join('');

  document.getElementById('payroll-modal-body').innerHTML = `
    <h3 class='pay-h3'>Generate Payroll Summary</h3>
    <div style='display:flex;gap:12px;margin-bottom:20px'>
      <div class='form-group' style='margin:0;flex:1'>
        <label>Month</label>
        <select id='payroll-month'${actOn('change', '_onPayrollMonthChange')} style='width:100%'>${monthOptions}</select>
      </div>
      <div class='form-group' style='margin:0;flex:1'>
        <label>Year</label>
        <select id='payroll-year' style='width:100%'>${yearOptions}</select>
      </div>
    </div>
    <div style='margin-bottom:24px'>
      <label style='display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px' id='bonus-checkbox-label'>
        <input type='checkbox' id='payroll-include-bonus' ${isBonusMonth ? 'checked' : ''}>
        <span>Include bonus data</span>
        ${isBonusMonth ? '' : '<span class="ppl-faint">(bonus months: Jan, Apr, Jul, Oct)</span>'}
      </label>
    </div>
    <div style='display:flex;gap:10px;justify-content:flex-end'>
      <button class='btn-secondary'${act('_closePayrollModal')}>Cancel</button>
      <button class='btn-primary'${act('_generatePayrollPreview')}>Generate Preview</button>
    </div>`;
}

function _onPayrollMonthChange() {
  const bonusMonths = [1, 4, 7, 10];
  const month       = parseInt(document.getElementById('payroll-month').value);
  const cb          = document.getElementById('payroll-include-bonus');
  const hint        = document.querySelector('#bonus-checkbox-label span:last-child');
  if (bonusMonths.includes(month)) {
    cb.checked = true;
    if (hint) hint.style.display = 'none';
  } else {
    cb.checked = false;
    if (hint) hint.style.display = 'inline';
  }
}

async function _generatePayrollPreview() {
  const month       = parseInt(document.getElementById('payroll-month').value);
  const year        = parseInt(document.getElementById('payroll-year').value);
  const includeBonus = document.getElementById('payroll-include-bonus').checked;

  document.getElementById('payroll-modal-body').innerHTML = `<p class='pay-result pay-result--muted'>Generating...</p>`;

  // N-286: salary is joined from the restricted PeoplePay list.
  const [people, payRows] = await Promise.all([getPeople(false), getPeoplePay()]);
  const all     = attachSalaries(people, payRows);
  const ukStaff = all.filter(isPayrollPerson);   // N-402: UK, never External

  const joinerStart = new Date(year, month - 2, 18); // 18th of previous month
  const joinerEnd   = new Date(year, month - 1, 18, 23, 59, 59); // 18th of current month
  const leaverStart = new Date(year, month - 1, 1);
  const leaverEnd   = new Date(year, month, 0, 23, 59, 59);

  const joiners = ukStaff.filter(p => {
    if (!p.StartDate) return false;
    const d = new Date(p.StartDate);
    return d >= joinerStart && d <= joinerEnd;
  });

  const leavers = ukStaff.filter(p => {
    if (!p.EndDate) return false;
    const d = new Date(p.EndDate);
    return d >= leaverStart && d <= leaverEnd;
  });

  const monthName = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'][month - 1];

  const joinersHTML = joiners.length ? `
    <table class='data-table' style='margin-bottom:8px'>
      <thead><tr><th>Name</th><th>Start Date</th><th>Salary</th></tr></thead>
      <tbody>${joiners.map(p => `
        <tr>
          <td>${escHtml(p.EmployeeName)}</td>
          <td>${spDateIn(p.StartDate) || '—'}</td>
          <td>${p.Salary ? '£' + Number(p.Salary).toLocaleString('en-GB', { minimumFractionDigits: 2 }) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<p class='ppl-muted-note'>No starters this month.</p>`;

  const leaversHTML = leavers.length ? `
    <table class='data-table' style='margin-bottom:8px'>
      <thead><tr><th>Name</th><th>End Date</th></tr></thead>
      <tbody>${leavers.map(p => `
        <tr>
          <td>${escHtml(p.EmployeeName)}</td>
          <td>${spDateIn(p.EndDate) || '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<p class='ppl-muted-note'>No leavers this month.</p>`;

  const bonusSection = includeBonus ? `
    <h4 class='pay-h4 pay-h4--lg'>Bonus Amounts</h4>
    <p class='pay-note'>Enter amounts for eligible employees. Leave blank to exclude from email.</p>
    <div id='bonus-inputs' class='pay-bonus-list'>
      ${ukStaff.filter(p => p.IsActive !== false).map(p => `
        <div class='pay-bonus-row'>
          <span style='font-size:14px'>${escHtml(p.EmployeeName)}</span>
          <div style='display:flex;align-items:center;gap:6px'>
            <span class='pay-currency'>£</span>
            <input type='number' min='0' step='0.01' placeholder='—'
              data-employee='${escHtml(p.EmployeeName)}'
              class='pay-bonus-input'>
          </div>
        </div>`).join('')}
    </div>` : '';

  document.getElementById('payroll-modal-body').innerHTML = `
    <h3 class='pay-h3 pay-h3--xs'>Payroll Summary Preview</h3>
    <p class='ppl-muted-note pay-sub'>${monthName} ${year}</p>

    <h4 class='pay-h4'>Starters</h4>
    ${joinersHTML}

    <h4 class='pay-h4 pay-h4--mid'>Leavers</h4>
    ${leaversHTML}

    ${bonusSection}

    <div class='pay-actions'>
      <button class='btn-secondary'${act('_renderPayrollStep1')}>&#8592; Back</button>
      <button class='btn-primary'${act('_sendPayrollSummary', month, year, includeBonus)}>Send to Payroll</button>
    </div>`;
}

async function _sendPayrollSummary(month, year, includeBonus) {
  const btn = document.querySelector('#payroll-modal-body .btn-primary');
  if (btn) setButtonLoading(btn);

  // N-286: salary is joined from the restricted PeoplePay list.
  const [people, payRows] = await Promise.all([getPeople(false), getPeoplePay()]);
  // N-300: a denied PeoplePay read returns [] — sending would email blank
  // salaries, so stop here and write nothing.
  if (wasListDenied('PeoplePay')) {
    if (btn) clearButtonLoading(btn);
    toast(CONFIG.PAYROLL_PAY_DENIED_TEXT, { type: 'error' });
    return;
  }
  const all     = attachSalaries(people, payRows);
  const ukStaff = all.filter(isPayrollPerson);   // N-402: UK, never External

  const joinerStart = new Date(year, month - 2, 18); // 18th of previous month
  const joinerEnd   = new Date(year, month - 1, 18, 23, 59, 59); // 18th of current month
  const leaverStart = new Date(year, month - 1, 1);
  const leaverEnd   = new Date(year, month, 0, 23, 59, 59);

  const joiners = ukStaff.filter(p => {
    if (!p.StartDate) return false;
    const d = new Date(p.StartDate);
    return d >= joinerStart && d <= joinerEnd;
  }).map(p => ({ name: p.EmployeeName, startDate: spDateIn(p.StartDate), salary: p.Salary || null }));

  const leavers = ukStaff.filter(p => {
    if (!p.EndDate) return false;
    const d = new Date(p.EndDate);
    return d >= leaverStart && d <= leaverEnd;
  }).map(p => ({ name: p.EmployeeName, endDate: spDateIn(p.EndDate) }));

  let bonus = null;
  if (includeBonus) {
    const inputs = document.querySelectorAll('#bonus-inputs input[data-employee]');
    bonus = [];
    inputs.forEach(input => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        bonus.push({ name: input.dataset.employee, amount: val });
      }
    });
    if (bonus.length === 0) bonus = null;
  }

  try {
    const res = await createPayrollSummary({ month, year, joiners, leavers, bonus });
    if (res.alreadySent) {
      const msg = CONFIG.PAYROLL_ALREADY_SENT_TEXT.replace('{period}', `${res.fields.Month} ${res.fields.Year}`);
      document.getElementById('payroll-modal-body').innerHTML = `
      <div class='pay-result'>
        <div style='font-size:40px;margin-bottom:16px'>&#9432;</div>
        <h3 class='pay-h3 pay-h3--sm'>Already sent</h3>
        <p class='pay-p'>${escHtml(msg)}</p>
        <button class='btn-secondary' style='margin-top:20px'${act('_closePayrollModal')}>Close</button>
      </div>`;
      return;
    }
    document.getElementById('payroll-modal-body').innerHTML = `
      <div class='pay-result'>
        <div style='font-size:40px;margin-bottom:16px'>&#10003;</div>
        <h3 class='pay-h3 pay-h3--sm'>Sent</h3>
        <p class='pay-p'>Payroll summary for ${['January','February','March','April','May','June','July','August','September','October','November','December'][month-1]} ${year} has been sent to the payroll team.</p>
        <button class='btn-secondary' style='margin-top:20px'${act('_closePayrollModal')}>Close</button>
      </div>`;
  } catch (e) {
    if (btn) clearButtonLoading(btn);
    toast('Error sending payroll summary: ' + e.message, { type: 'error' });
  }
}

// N-302c: delegated actions for the Payroll Summary modal (js/actions.js).
registerActions({
  _openPayrollModal,
  _closePayrollModal,
  _renderPayrollStep1,
  _onPayrollMonthChange,
  _generatePayrollPreview,
  _sendPayrollSummary,
});
