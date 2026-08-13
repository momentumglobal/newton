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
    <h3 style='margin:0 0 20px;color:var(--c-brand)'>Generate Payroll Summary</h3>
    <div style='display:flex;gap:12px;margin-bottom:20px'>
      <div class='form-group' style='margin:0;flex:1'>
        <label>Month</label>
        <select id='payroll-month' onchange='_onPayrollMonthChange()' style='width:100%'>${monthOptions}</select>
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
        ${isBonusMonth ? '' : '<span style="font-size:12px;color:var(--c-gray-400)">(bonus months: Jan, Apr, Jul, Oct)</span>'}
      </label>
    </div>
    <div style='display:flex;gap:10px;justify-content:flex-end'>
      <button class='btn-secondary' onclick='_closePayrollModal()'>Cancel</button>
      <button class='btn-primary' onclick='_generatePayrollPreview()'>Generate Preview</button>
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

  document.getElementById('payroll-modal-body').innerHTML = `<p style='text-align:center;color:var(--c-gray-500);padding:40px 0'>Generating...</p>`;

  const all     = await getPeople(false);
  const ukStaff = all.filter(p => p.Location === 'UK');

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
          <td>${p.StartDate.split('T')[0]}</td>
          <td>${p.Salary ? '£' + Number(p.Salary).toLocaleString('en-GB', { minimumFractionDigits: 2 }) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<p style='color:var(--c-gray-500);font-size:13px'>No starters this month.</p>`;

  const leaversHTML = leavers.length ? `
    <table class='data-table' style='margin-bottom:8px'>
      <thead><tr><th>Name</th><th>End Date</th></tr></thead>
      <tbody>${leavers.map(p => `
        <tr>
          <td>${escHtml(p.EmployeeName)}</td>
          <td>${p.EndDate.split('T')[0]}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<p style='color:var(--c-gray-500);font-size:13px'>No leavers this month.</p>`;

  const bonusSection = includeBonus ? `
    <h4 style='margin:20px 0 10px;color:var(--c-brand)'>Bonus Amounts</h4>
    <p style='font-size:12px;color:var(--c-gray-500);margin-bottom:12px'>Enter amounts for eligible employees. Leave blank to exclude from email.</p>
    <div id='bonus-inputs' style='max-height:240px;overflow-y:auto;border:1px solid var(--c-gray-100);border-radius:4px;padding:12px'>
      ${ukStaff.filter(p => p.IsActive !== false).map(p => `
        <div style='display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--c-gray-050)'>
          <span style='font-size:14px'>${escHtml(p.EmployeeName)}</span>
          <div style='display:flex;align-items:center;gap:6px'>
            <span style='color:var(--c-gray-500)'>£</span>
            <input type='number' min='0' step='0.01' placeholder='—'
              data-employee='${escHtml(p.EmployeeName)}'
              style='width:100px;padding:4px 8px;border:1px solid var(--c-gray-200);border-radius:4px;font-size:13px'>
          </div>
        </div>`).join('')}
    </div>` : '';

  document.getElementById('payroll-modal-body').innerHTML = `
    <h3 style='margin:0 0 4px;color:var(--c-brand)'>Payroll Summary Preview</h3>
    <p style='margin:0 0 20px;font-size:13px;color:var(--c-gray-500)'>${monthName} ${year}</p>

    <h4 style='margin:0 0 10px;color:var(--c-brand)'>Starters</h4>
    ${joinersHTML}

    <h4 style='margin:16px 0 10px;color:var(--c-brand)'>Leavers</h4>
    ${leaversHTML}

    ${bonusSection}

    <div style='display:flex;gap:10px;justify-content:flex-end;margin-top:24px;padding-top:16px;border-top:1px solid var(--c-gray-100)'>
      <button class='btn-secondary' onclick='_renderPayrollStep1()'>&#8592; Back</button>
      <button class='btn-primary' onclick='_sendPayrollSummary(${month}, ${year}, ${includeBonus})'>Send to Payroll</button>
    </div>`;
}

async function _sendPayrollSummary(month, year, includeBonus) {
  const btn = document.querySelector('#payroll-modal-body .btn-primary');
  if (btn) setButtonLoading(btn);

  const all     = await getPeople(false);
  const ukStaff = all.filter(p => p.Location === 'UK');

  const joinerStart = new Date(year, month - 2, 18); // 18th of previous month
  const joinerEnd   = new Date(year, month - 1, 18, 23, 59, 59); // 18th of current month
  const leaverStart = new Date(year, month - 1, 1);
  const leaverEnd   = new Date(year, month, 0, 23, 59, 59);

  const joiners = ukStaff.filter(p => {
    if (!p.StartDate) return false;
    const d = new Date(p.StartDate);
    return d >= joinerStart && d <= joinerEnd;
  }).map(p => ({ name: p.EmployeeName, startDate: p.StartDate.split('T')[0], salary: p.Salary || null }));

  const leavers = ukStaff.filter(p => {
    if (!p.EndDate) return false;
    const d = new Date(p.EndDate);
    return d >= leaverStart && d <= leaverEnd;
  }).map(p => ({ name: p.EmployeeName, endDate: p.EndDate.split('T')[0] }));

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
    await createPayrollNotification({ month, year, joiners, leavers, bonus });
    document.getElementById('payroll-modal-body').innerHTML = `
      <div style='text-align:center;padding:40px 0'>
        <div style='font-size:40px;margin-bottom:16px'>&#10003;</div>
        <h3 style='color:var(--c-brand);margin:0 0 8px'>Sent</h3>
        <p style='color:var(--c-gray-500);font-size:14px'>Payroll summary for ${['January','February','March','April','May','June','July','August','September','October','November','December'][month-1]} ${year} has been sent to the payroll team.</p>
        <button class='btn-secondary' style='margin-top:20px' onclick='_closePayrollModal()'>Close</button>
      </div>`;
  } catch (e) {
    if (btn) clearButtonLoading(btn);
    alert('Error sending payroll summary: ' + e.message);
  }
}
