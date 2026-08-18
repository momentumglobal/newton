// js/people-invoices.js — GP Invoices
async function renderGPInvoices() {
  const main    = document.getElementById('main-content');
  const canEdit = _resolvedRole === 'admin';
  main.innerHTML = '<p>Loading invoices...</p>';

  const invoices = await getGPInvoices();
  const today    = new Date(); today.setHours(0,0,0,0);

  // Derive overdue status in the UI — not stored in SharePoint
  const withStatus = invoices.map(inv => {
    const due      = inv.DueDate ? new Date(inv.DueDate) : null;
    const isOverdue = inv.Status === 'Sent' && due && due < today;
    return { ...inv, isOverdue };
  });

  // Summary bar calculations
  const outstanding = withStatus
    .filter(i => i.Status !== 'Paid')
    .reduce((sum, i) => sum + (parseFloat(i.Amount) || 0), 0);
  const overdueList = withStatus.filter(i => i.isOverdue);
  const oldestOverdue = overdueList.length
    ? spDateIn(overdueList.reduce((oldest, i) =>
        new Date(i.DueDate) < new Date(oldest.DueDate) ? i : oldest
      ).DueDate)
    : null;

  const summaryBar = `
    <div style='display:flex;gap:24px;flex-wrap:wrap;padding:16px 0;margin-bottom:8px;
                border-bottom:1px solid var(--border)'>
      <div>
        <div style='font-size:11px;font-weight:700;text-transform:uppercase;
                    color:var(--text-label);letter-spacing:.05em'>Total Outstanding</div>
        <div style='font-size:22px;font-weight:700;color:var(--brand-tertiary)'>
          £${outstanding.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}
        </div>
      </div>
      <div>
        <div style='font-size:11px;font-weight:700;text-transform:uppercase;
                    color:var(--text-label);letter-spacing:.05em'>Overdue Invoices</div>
        <div style='font-size:22px;font-weight:700;color:${overdueList.length > 0 ? 'var(--status-danger)' : 'var(--brand-tertiary)'}'>
          ${overdueList.length}
        </div>
      </div>
      ${oldestOverdue ? `
      <div>
        <div style='font-size:11px;font-weight:700;text-transform:uppercase;
                    color:var(--text-label);letter-spacing:.05em'>Oldest Overdue</div>
        <div style='font-size:22px;font-weight:700;color:var(--status-danger)'>${oldestOverdue}</div>
      </div>` : ''}
    </div>`;

  const rows = withStatus.map(inv => {
    const statusBadge = inv.isOverdue
      ? `<span class='badge' style='background:var(--status-danger-bg-soft);color:var(--status-danger)'>Overdue</span>`
      : inv.Status === 'Paid'
        ? `<span class='badge badge-active'>Paid</span>`
        : `<span class='badge' style='background:var(--status-warn-bg);color:var(--status-warn-text)'>Sent</span>`;

    const markPaidBtn = canEdit && inv.Status !== 'Paid'
      ? `<a href='#' onclick='markInvoicePaid(${inv.id})' style='white-space:nowrap'>
           Mark Paid</a>`
      : '';

    return `<tr>
      <td>${escHtml(inv.InvoiceNumber || '—')}</td>
      <td>${spDateIn(inv.InvoiceDate) || '—'}</td>
      <td>${spDateIn(inv.DueDate) || '—'}</td>
      <td>£${inv.Amount ? Number(inv.Amount).toLocaleString('en-GB',
              {minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
      <td class='cell-notes'>${renderInvoiceNotesCell(inv)}</td>
      <td>${statusBadge}</td>
${canEdit ? `<td style='white-space:nowrap'>
  <div class='row-actions' style='gap:12px'>
    <a href='#' onclick='showEditInvoiceForm(${inv.id})'>Edit</a>
    ${markPaidBtn ? ' · ' + markPaidBtn : ''}
    · <button class='btn-danger' onclick='deleteInvoice(${inv.id})'>Delete</button>
  </div>
</td>` : ''}
    </tr>`;
  }).join('');

  main.innerHTML = `
    <div class='page-header'>
      <h2>Supplier Invoices</h2>
      ${canEdit ? "<button class='btn-primary' onclick='showAddInvoiceForm()'>+ Add Invoice</button>" : ''}
    </div>
    ${summaryBar}
    <table class='data-table'>
      <thead><tr>
        <th>Invoice #</th><th>Invoice Date</th><th>Due Date</th>
        <th>Amount</th><th>Notes</th><th>Status</th>
        ${canEdit ? '<th></th>' : ''}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Notes cell: first line only, with a "See more" toggle when there is more to show.
function renderInvoiceNotesCell(inv) {
  const notes = inv.Notes || '';
  if (!notes.trim()) return '—';

  const head     = firstLine(notes);
  const hasMore  = /\r?\n/.test(notes.trim())
                   || head.length > CONFIG.NOTES_PREVIEW_CHARS;

  if (!hasMore) return `<span class='notes-body'>${escHtml(head)}</span>`;

  return `
    <div class='notes-cell' id='notes-${inv.id}'>
      <div class='notes-short'>
        <span class='notes-preview'>${escHtml(head)}</span><a href='#' class='notes-toggle'
          onclick='toggleInvoiceNotes(event, ${inv.id})'>See more</a>
      </div>
      <div class='notes-full'>
        <span class='notes-body'>${escHtmlLines(notes)}</span><a href='#' class='notes-toggle'
          onclick='toggleInvoiceNotes(event, ${inv.id})'>See less</a>
      </div>
    </div>`;
}

function toggleInvoiceNotes(event, id) {
  event.preventDefault();
  document.getElementById(`notes-${id}`)?.classList.toggle('is-expanded');
}

async function markInvoicePaid(id) {
  try {
    await updateInvoice(id, { Status: 'Paid' });
    await renderGPInvoices();
  } catch (e) {
    toast('Error updating invoice: ' + e.message, { type: 'error' });
  }
}

async function deleteInvoice(id) {
  if (!(await confirmModal({
    message: 'Delete this invoice? This cannot be undone.',
    confirmLabel: 'Delete', danger: true,
  }))) return;
  try {
    await deleteItem('GPInvoices', id);
    await renderGPInvoices();
  } catch (e) {
    toast('Error deleting invoice: ' + e.message, { type: 'error' });
  }
}
