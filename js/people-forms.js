// js/people-forms.js — People module data entry forms

// ── Employee (People list) forms ─────────────────────────────

function renderPersonForm(existingData = null) {
  const isEdit = !!existingData;
  // N-304: a blank StaffType (every pre-N-304 row) opens as Deployable.
  const internal  = isInternalStaff(existingData);
  const staffType = internal ? CONFIG.STAFF_TYPE_INTERNAL : CONFIG.STAFF_TYPE_DEPLOYABLE;
  return `
    <div class='form-container'>
      <h2>${isEdit ? 'Edit Employee' : 'Add Employee'}</h2>
      <div id='person-form-error' class='form-error'></div>
      <form id='person-form'${actOn('submit', 'submitPersonForm', ACT_EVENT, existingData?.id ? Number(existingData.id) : null)}>
        <div class='form-group'>
          <label>Full Name *</label>
          <input type='text' name='EmployeeName' required
            value='${escHtml(existingData?.EmployeeName || '')}'>
        </div>
        <div class='form-group'>
          <label>Staff type *</label>
          <select name='StaffType' required${actOn('change', '_onStaffTypeChange', ACT_EL)}>
            ${CONFIG.STAFF_TYPES.map(t =>
              `<option value='${escHtml(t)}' ${staffType===t?'selected':''}>${escHtml(t)}</option>`
            ).join('')}
          </select>
        </div>
        <div class='form-row'>
          <div class='form-group${internal ? ' is-hidden' : ''}' id='person-level-group'>
            <label>Level *</label>
            <select name='Level'${internal ? ' disabled' : ' required'}>
              ${CONFIG.PEOPLE_LEVELS.map(l =>
                `<option value='${l}' ${existingData?.Level===l?'selected':''}>${l}</option>`
              ).join('')}
            </select>
          </div>
          <div class='form-group${internal ? '' : ' is-hidden'}' id='person-function-group'>
            <label>Function *</label>
            <select name='StaffFunction'${internal ? ' required' : ' disabled'}>
              <option value=''>— select —</option>
              ${CONFIG.INTERNAL_FUNCTIONS.map(f =>
                `<option value='${escHtml(f)}' ${existingData?.StaffFunction===f?'selected':''}>${escHtml(f)}</option>`
              ).join('')}
            </select>
          </div>
          <div class='form-group'>
            <label>Contract Type *</label>
            <select name='ContractType' required>
              ${['Core','FTC','G-P'].map(c =>
                `<option value='${c}' ${existingData?.ContractType===c?'selected':''}>${c}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class='form-group'>
          <label>Location *</label>
          <input type='text' name='Location' required
            value='${escHtml(existingData?.Location || '')}'>
        </div>
        <div class='form-row'>
          <div class='form-group'>
            <label>Start Date *</label>
            <input type='date' name='StartDate' required
              value='${escHtml(spDateIn(existingData?.StartDate) || '')}'>
          </div>
          <div class='form-group'>
            <label>End Date</label>
            <input type='date' name='EndDate'
              value='${escHtml(spDateIn(existingData?.EndDate) || '')}'>
          </div>
        </div>
        <div class='form-group'>
          <label>Salary (£) <span style='font-size:11px;color:var(--text-muted);font-weight:normal'>UK staff only</span></label>
          <input type='number' name='Salary' min='0' step='0.01'
            value='${escHtml(existingData?.Salary || '')}'>
        </div>
        <div class='form-group'>
          <label>Photo</label>
          ${existingData?.PhotoUrl
            ? `<img src='${escHtml(existingData.PhotoUrl)}' alt='' style='width:56px;height:56px;border-radius:50%;object-fit:cover;margin-bottom:6px'>`
            : ''}
          <input type='file' name='PhotoFile' accept='${uploadAcceptAttr('PHOTO')}'>
          <span style='font-size:11px;color:var(--text-muted)'>Uploads to PeoplePhotos. Square images crop best.</span>
        </div>
        ${isEdit ? `
        <div class='form-group'>
          <label style='display:flex;align-items:center;gap:8px;cursor:pointer'>
            <input type='checkbox' name='IsActive'
              ${existingData?.IsActive !== false ? 'checked' : ''}>
            Active employee
          </label>
        </div>` : ''}
        <div class='form-actions'>
          <button type='submit' class='btn-primary'>
            ${isEdit ? 'Save Changes' : 'Add Employee'}</button>
          <button type='button' class='btn-secondary'${act('navigateToPeople', 'peopleTracker')}>Cancel</button>
        </div>
      </form>
    </div>`;
}

async function submitPersonForm(event, editId = null) {
  event.preventDefault();
  clearPersonFormError();
  const form = document.getElementById('person-form');
  const btn  = form.querySelector('[type=submit]');
  setButtonLoading(btn);
  const data = Object.fromEntries(new FormData(form));
  // N-304: the hidden Level / Function select is disabled, so FormData omits
  // it. Internal clears Level; Deployable clears StaffFunction (null = clear).
  const internal = data.StaffType === CONFIG.STAFF_TYPE_INTERNAL;
  if (internal && !data.StaffFunction) {
    showPersonFormError('Please select a function for an internal employee.');
    clearButtonLoading(btn);
    return;
  }
  const fields = {
    EmployeeName: data.EmployeeName,
    Level:        internal ? null : data.Level,
    StaffType:    internal ? CONFIG.STAFF_TYPE_INTERNAL : CONFIG.STAFF_TYPE_DEPLOYABLE,
    StaffFunction: internal ? data.StaffFunction : null,
    ContractType: data.ContractType,
    Location:     data.Location,
    StartDate:    isoDate(data.StartDate) || undefined,
    EndDate:      isoDate(data.EndDate)   || undefined,
    IsActive:     editId ? (form.querySelector('[name=IsActive]')?.checked !== false) : true,
    Salary:       data.Salary ? parseFloat(data.Salary) : undefined,
  };
  const file = form.querySelector('[name=PhotoFile]')?.files?.[0] || null;
  if (file) {                                   // N-284: fail before anything is saved
    const photoCheck = validateUpload(file, 'PHOTO');
    if (!photoCheck.ok) { showPersonFormError(photoCheck.reason); clearButtonLoading(btn); return; }
  }

  if (editId) {
    // N-218b: optimistic insert is a create-only concept -- editing an
    // existing employee is unaffected, unchanged from before this task.
    try {
      await updatePerson(editId, fields);
      if (file) {
        const url = await uploadPeoplePhoto('person', editId, file);
        if (url) await updatePerson(editId, { PhotoUrl: url });
      }
      navigateToPeople('peopleTracker');
    } catch (e) {
      clearButtonLoading(btn);
      showPersonFormError(`Error saving employee: ${e.message}`);
    }
    return;
  }

  try {
    await optimisticWrite({
      apply: () => {
        const pendingItem = { id: pendingRowId(), ...fields };
        navigateToPeople('peopleTracker', pendingItem);
      },
      revert: async () => { await renderEmployeesTab(); },
      commit: async () => {
        const saved = await createPerson(fields);
        // N-286: the person was saved; only the PeoplePay write failed.
        if (saved._salaryError) {
          toast('Employee added, but the salary could not be saved — edit the employee to retry: ' + saved._salaryError, { type: 'error' });
        }
        if (file && saved.id) {
          const url = await uploadPeoplePhoto('person', saved.id, file);
          if (url) await updatePerson(saved.id, { PhotoUrl: url });
        }
        return saved;
      },
      errorMessage: 'Error saving employee — change reverted.',
    });
    await renderEmployeesTab();
  } catch (e) {
    // optimisticWrite() already reverted the view and showed a Retry toast.
  }
}

function showPersonFormError(msg) {
  const el = document.getElementById('person-form-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function clearPersonFormError() {
  const el = document.getElementById('person-form-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function showAddPersonForm() {
  document.getElementById('main-content').innerHTML = renderPersonForm();
}
async function showEditPersonForm(id) {
  // N-286: getItem() is $select=*, so until the People.Salary column is
  // deleted it still returns the old, stale value. attachSalaries()
  // overwrites it with the PeoplePay value (or undefined).
  const [person, payRows] = await Promise.all([getItem('People', id), getPeoplePay()]);
  const data = attachSalaries([person], payRows)[0];
  document.getElementById('main-content').innerHTML = renderPersonForm(data);
}

// ── G-P Invoice forms ─────────────────────────────────────────
function renderInvoiceForm(existingData = null) {
  const isEdit = !!existingData;
  return `
    <div class='form-container'>
      <h2>${isEdit ? 'Edit Invoice' : 'Add Invoice'}</h2>
      <div id='invoice-form-error' class='form-error'></div>
      <form id='invoice-form'${actOn('submit', 'submitInvoiceForm', ACT_EVENT, existingData?.id ? Number(existingData.id) : null)}>
        <div class='form-group'>
          <label>Invoice Number *</label>
          <input type='text' name='InvoiceNumber' required
            value='${escHtml(existingData?.InvoiceNumber || '')}'>
        </div>
        <div class='form-row'>
          <div class='form-group'>
            <label>Invoice Date *</label>
            <input type='date' name='InvoiceDate' required
              value='${escHtml(spDateIn(existingData?.InvoiceDate) || '')}'>
          </div>
          <div class='form-group'>
            <label>Due Date *</label>
            <input type='date' name='DueDate' required
              value='${escHtml(spDateIn(existingData?.DueDate) || '')}'>
          </div>
        </div>
        <div class='form-row'>
          <div class='form-group'>
            <label>Amount (£) *</label>
            <input type='number' name='Amount' min='0' step='0.01' required
              value='${escHtml(existingData?.Amount || '')}'>
          </div>
          <div class='form-group'>
            <label>Status *</label>
            <select name='Status' required>
              <option value='Sent' ${!existingData||existingData?.Status==='Sent'?'selected':''}>Sent</option>
              <option value='Paid' ${existingData?.Status==='Paid'?'selected':''}>Paid</option>
            </select>
          </div>
        </div>
        <div class='form-group'>
          <label>Notes</label>
          <small class='form-hint'>Leave a message for Finance here — it appears in the email they receive.</small>
          <textarea name='Notes' rows='3'>${escHtml(existingData?.Notes)}</textarea>
        </div>
        <div class='form-group'>
          <label>Invoice PDF ${isEdit ? '(leave blank to keep existing)' : '*'}</label>
          <input type='file' name='InvoicePDF' accept='${uploadAcceptAttr('INVOICE')}'
            ${isEdit ? '' : 'required'}>
          <small class='form-hint'>PDF only. One file per invoice.</small>
        </div>
        <div class='form-actions'>
          <button type='submit' class='btn-primary'>
            ${isEdit ? 'Save Changes' : 'Add Invoice'}</button>
          <button type='button' class='btn-secondary'${act('navigateToPeople', 'gpInvoices')}>Cancel</button>
        </div>
      </form>
    </div>`;
}

async function submitInvoiceForm(event, editId = null) {
  event.preventDefault();
  const form      = document.getElementById('invoice-form');
  const btn       = form.querySelector('[type=submit]');
  const data      = Object.fromEntries(new FormData(form));
  const errEl     = document.getElementById('invoice-form-error');
  const fileInput = form.querySelector('input[name="InvoicePDF"]');
  const file      = fileInput?.files?.[0] || null;
  if (errEl) { errEl.style.display = 'none'; }
  setButtonLoading(btn);
  if (file) {                                   // N-284: fail before anything is saved
    const pdfCheck = validateUpload(file, 'INVOICE');
    if (!pdfCheck.ok) {
      if (errEl) { errEl.textContent = pdfCheck.reason; errEl.style.display = 'block'; }
      clearButtonLoading(btn);
      return;
    }
  }
  const fields = {
    InvoiceNumber: data.InvoiceNumber,
    InvoiceDate:   isoDate(data.InvoiceDate),
    DueDate:       isoDate(data.DueDate),
    Amount:        parseFloat(data.Amount),
    Notes:         data.Notes || undefined,
    Status:        data.Status,
  };
  if (editId) {
    // N-218b: optimistic insert is a create-only concept -- editing an
    // existing invoice is unaffected, unchanged from before this task.
    try {
      await updateInvoice(editId, fields);
      if (file) {
        const fileUrl = await uploadInvoiceAttachment(editId, file);
        if (fileUrl) { await addInvoiceFileURL(editId, fileUrl); }
      }
      navigateToPeople('gpInvoices');
    } catch (e) {
      clearButtonLoading(btn);
      if (errEl) { errEl.textContent = 'Error saving invoice: ' + e.message; errEl.style.display = 'block'; }
    }
    return;
  }

  try {
    await optimisticWrite({
      apply: () => {
        const pendingItem = { id: pendingRowId(), ...fields };
        navigateToPeople('gpInvoices', pendingItem);
      },
      revert: async () => { await renderGPInvoices(); },
      commit: async () => {
        const result = await createInvoice(fields);
        const newId  = result?.id;
        if (!newId) throw new Error('Failed to retrieve new invoice ID.');
        const fileUrl = await uploadInvoiceAttachment(newId, file);
        if (fileUrl) { await addInvoiceFileURL(newId, fileUrl); }
        return result;
      },
      errorMessage: 'Error saving invoice — change reverted.',
    });
    await renderGPInvoices();
  } catch (e) {
    // optimisticWrite() already reverted the view and showed a Retry toast.
  }
}

function showAddInvoiceForm() {
  document.getElementById('main-content').innerHTML = renderInvoiceForm();
}

async function showEditInvoiceForm(id) {
  const data = await getItem('GPInvoices', id);
  document.getElementById('main-content').innerHTML = renderInvoiceForm(data);
}

// N-302c: delegated actions for the People record forms and the Add/Edit entry
// points the tracker and invoice lists call (js/actions.js).
registerActions({
  showAddPersonForm,
  showEditPersonForm,
  showAddInvoiceForm,
  showEditInvoiceForm,
  submitPersonForm,
  submitInvoiceForm,
  _onStaffTypeChange,
});