// js/employee-logic.js — pure rules for the employee record page (N-457 / MM-7). No network I/O, no DOM.
// Loaded on people.html only (after my-details-logic.js, before graph-client.js); never mobile.html, Newton for Claude or the
// Command Bar. The registry it reads is CONFIG.EMPLOYEE_PAGE.EMPLOYMENT. It never names the My Details list or its registry:
// employee-page.js (the only file that reads it) passes the field registry and groups in, so this file holds no personal data.

function _epStr(v) { return v === undefined || v === null ? '' : String(v); }
function _epLower(v) { return _epStr(v).trim().toLowerCase(); }
function _epId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// Who may open a record: the Employee Tracker audience (Admin, Leadership, People Ops).
function epCanOpen(role) {
  return roleCan(role, 'peopleFull');
}

// What the My Details section does for this viewer: 'none' (the section is not drawn and nothing is read: Leadership and anyone
// else), 'ghost' (Admin / People Ops in Ghost Mode: fixed panel, no read) or 'view' (read-only cards).
function epDetailsMode(role, ghost) {
  if (!roleCan(role, 'myDetailsAdmin')) return 'none';
  return ghost ? 'ghost' : 'view';
}

// The two cross-page links. A bad id gives '' (never a half-built link).
function epRecordHref(id) {
  const n = _epId(id);
  return n ? CONFIG.EMPLOYEE_PAGE.RECORD_HREF + n : '';
}
function epEditDetailsHref(id) {
  const n = _epId(id);
  return n ? CONFIG.EMPLOYEE_PAGE.EDIT_DETAILS_HREF + n : '';
}

// 'external' / 'internal' / 'levelled': which EMPLOYMENT rows hide (hideFor).
function epStaffKind(person) {
  if (isExternalStaff(person)) return 'external';
  if (isInternalStaff(person)) return 'internal';
  return 'levelled';
}

// The line manager's name (People.ReportsTo is a work email), the email itself when nobody matches, '' when blank.
function epReportsToName(person, people) {
  const email = _epLower(person && person.ReportsTo);
  if (!email) return '';
  const boss = (people || []).find(p => _epLower(p && p.WorkEmail) === email);
  return boss && boss.EmployeeName ? boss.EmployeeName : email;
}

// A display name for a work email (the stamp line's "updated by"), '' when nobody matches.
function epNameByEmail(people, email) {
  const e = _epLower(email);
  if (!e) return '';
  const p = (people || []).find(x => _epLower(x && x.WorkEmail) === e);
  return p && p.EmployeeName ? p.EmployeeName : '';
}

// The tracker's rule: a salary is shown for the salary location only; '' otherwise (rendered as a dash).
function epSalaryText(person) {
  if (!person || person.Location !== CONFIG.EMPLOYEE_PAGE.SALARY_LOCATION) return '';
  if (person.Salary === undefined || person.Salary === null || person.Salary === '') return '';
  return '£' + Number(person.Salary).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The employment card rows: [{ key, label, kind, value }]. value '' means blank (the page shows a dash). ctx.canSalary leaves the
// Salary row off for anyone who may not see pay; ctx.registry replaces the config registry (tests).
function epEmploymentRows(person, people, ctx) {
  const reg = (ctx && ctx.registry) || CONFIG.EMPLOYEE_PAGE.EMPLOYMENT;
  const canSalary = !!(ctx && ctx.canSalary);
  const kind = epStaffKind(person);
  const out = [];
  reg.forEach(f => {
    if ((f.hideFor || []).includes(kind)) return;
    if (f.kind === 'salary' && !canSalary) return;
    let value;
    if (f.kind === 'role') value = personRoleLabel(person) || '';
    else if (f.kind === 'date') value = spDateIn(person[f.key]) || '';
    else if (f.kind === 'manager') value = epReportsToName(person, people);
    else if (f.kind === 'salary') value = epSalaryText(person);
    else value = _epStr(person[f.key]).trim();
    out.push({ key: f.key, label: f.label, kind: f.kind, value });
  });
  return out;
}

// The My Details cards: one per group, in the registry's group order. A blank value stays '' (the page shows a dash).
function epDetailsRows(row, fields, groups) {
  return Object.keys(groups || {}).map(g => ({
    group: g,
    title: groups[g].title,
    rows: (fields || []).filter(f => f.group === g).map(f => ({ key: f.key, label: f.label, value: _epStr(row && row[f.key]).trim() })),
  }));
}

// Is there anything to show? (Same test the Manage panel uses for a leaver's row.)
function epHasDetails(row) {
  return !!row && mdHasContent(row);
}