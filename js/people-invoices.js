// js/people-invoices.js — GP Invoices

// N-247c: { key, dir } — null = default order; shared list search box state.
let _invoicesSort   = null;
let _invoicesSearch = '';

// ── Row template builders (moved from utils.js, N-237c) ────────────────
function invoiceRowHtml(inv, { canEdit, pending = false } = {}) {
  const statusBadge = inv.isOverdue
    ? `<span class='badge' style='background:var(--status-danger-bg-soft);color:var(--status-danger)'>Overdue</span>`
    : inv.Status === 'Paid'
      ? `<span class='badge badge-active'>Paid</span>`
      : `<span class='badge' style='background:var(--status-warn-bg);color:var(--status-warn-text)'>Sent</span>`;

  const markPaidBtn = canEdit && !pending && inv.Status !== 'Paid'
    ? `<a href='#' onclick='markInvoicePaid(${inv.id})' style='white-space:nowrap'>
         Mark Paid</a>`
    : '';

  return `<tr class="${pending ? 'row-pending' : ''}"${pending ? ` data-pending-id="${escAttr(inv.id)}"` : ''}>
      <td>${escHtml(inv.InvoiceNumber || '—')}</td>
      <td>${spDateIn(inv.InvoiceDate) || '—'}</td>
      <td>${spDateIn(inv.DueDate) || '—'}</td>
      <td>£${inv.Amount ? Number(inv.Amount).toLocaleString('en-GB',
              {minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
      <td class='cell-notes'>${renderInvoiceNotesCell(inv, pending)}</td>
      <td>${statusBadge}</td>
${canEdit ? (pending ? `<td></td>` : `<td style='white-space:nowrap'>
  <div class='row-actions' style='gap:12px'>
    <a href='#' onclick='showEditInvoiceForm(${inv.id})'>Edit</a>
    ${markPaidBtn ? ' · ' + markPaidBtn : ''}
    · <button class='btn-danger' onclick='deleteInvoice(${inv.id})'>Delete</button>
  </div>
</td>`) : ''}
    </tr>`;
}

// First non-empty line of a multi-line string. Returns '' for empty input.
function firstLine(str) {
  const lines = String(str ?? '').split(/\r?\n/).map(l => l.trim());
  return lines.find(l => l !== '') || '';
}

async function renderGPInvoices(pendingItem = null) {
  const main    = document.getElementById('main-content');
  const canEdit = _resolvedRole === 'admin';
  main.innerHTML = '<p>Loading invoices...</p>';

  const invoices = await getGPInvoices();
  const today    = new Date(); today.setHours(0,0,0,0);

  // Derive overdue status in the UI — not stored in SharePoint
  let withStatus = invoices.map(inv => {
    const due      = inv.DueDate ? new Date(inv.DueDate) : null;
    const isOverdue = inv.Status === 'Sent' && due && due < today;
    return { ...inv, isOverdue };
  });

  // N-218b: a pending invoice folds into the same isOverdue computation as
  // real rows, then the summary-bar figures below (Total Outstanding /
  // Overdue count / Oldest Overdue) naturally include it too -- consistent
  // with "this write has already applied" rather than showing it in the
  // table but excluding it from totals it obviously affects.
  if (pendingItem) {
    const due = pendingItem.DueDate ? new Date(pendingItem.DueDate) : null;
    withStatus.push({
      ...pendingItem,
      isOverdue: pendingItem.Status === 'Sent' && due && due < today,
    });
    // getGPInvoices() (api.js) returns invoices sorted by InvoiceDate desc --
    // keep the pending row in that same order rather than always trailing it.
    withStatus.sort((x, y) =>
      (y.InvoiceDate ? new Date(y.InvoiceDate) : new Date(0)) -
      (x.InvoiceDate ? new Date(x.InvoiceDate) : new Date(0)));
  }

  // N-247c: search narrows `withStatus` before the summary bar below is
  // computed, so Total Outstanding / Overdue Invoices / Oldest Overdue all
  // reflect the search-narrowed list — a deliberate deviation from
  // Activity/Placements, where search only affects the table + result count.
  const totalInvoices = withStatus.length;
  withStatus = filterRowsByText(withStatus, _invoicesSearch, inv => [inv.InvoiceNumber, inv.Notes]);
  const INVOICE_SORT_COLUMNS = {
    number:      { type: 'text',   get: inv => inv.InvoiceNumber },
    invoiceDate: { type: 'date',   get: inv => inv.InvoiceDate },
    dueDate:     { type: 'date',   get: inv => inv.DueDate },
    amount:      { type: 'number', get: inv => inv.Amount },
    // No CONFIG order exists for this three-state label — don't invent one.
    status:      { type: 'text',   get: inv => inv.isOverdue ? 'Overdue' : inv.Status },
  };
  withStatus = sortRows(withStatus, _invoicesSort, INVOICE_SORT_COLUMNS);

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

  const rows = withStatus.map(inv => invoiceRowHtml(inv, {
    canEdit,
    pending: pendingItem ? inv.id === pendingItem.id : false,
  })).join('');

  main.innerHTML = `
    <div class='page-header'>
      <h2>Supplier Invoices</h2>
      ${canEdit ? "<button class='btn-primary' onclick='showAddInvoiceForm()'>+ Add Invoice</button>" : ''}
    </div>
    ${summaryBar}
    <div class="table-toolbar">${listControlsBar([listSearchBox(_invoicesSearch, 'setInvoicesSearch')])}</div>
    ${listResultCount(withStatus.length, withStatus.length, totalInvoices, null, 'invoice')}
    <table class='data-table'>
      <thead><tr>
        ${sortableHeader('Invoice #', 'number', _invoicesSort, 'setInvoicesSort')}
        ${sortableHeader('Invoice Date', 'invoiceDate', _invoicesSort, 'setInvoicesSort')}
        ${sortableHeader('Due Date', 'dueDate', _invoicesSort, 'setInvoicesSort')}
        ${sortableHeader('Amount', 'amount', _invoicesSort, 'setInvoicesSort')}
        <th>Notes</th>
        ${sortableHeader('Status', 'status', _invoicesSort, 'setInvoicesSort')}
        ${canEdit ? '<th></th>' : ''}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Notes cell: first line only, with a "See more" toggle when there is more to show.
// N-218b: `pending` suppresses the toggle -- its onclick embeds `inv.id`
// unquoted (`toggleInvoiceNotes(event, ${inv.id})`), which is a real numeric
// SharePoint id on every existing call site but would emit invalid JS for a
// pending row's string id from pendingRowId(). A pending row has nothing
// clickable anywhere else in the table for the same reason; this keeps that
// true for the notes cell too, and reads as a one-line preview instead.
function renderInvoiceNotesCell(inv, pending = false) {
  const notes = inv.Notes || '';
  if (!notes.trim()) return '—';

  const head     = firstLine(notes);
  const hasMore  = !pending && (/\r?\n/.test(notes.trim())
                   || head.length > CONFIG.NOTES_PREVIEW_CHARS);

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

// N-247c: debounced re-render, same shape as every other list page's setter.
const _debouncedRenderGPInvoices = debounce(async () => { await renderGPInvoices(); focusListSearchBox(); }, 250);
function setInvoicesSearch(val) { _invoicesSearch = val || ''; _debouncedRenderGPInvoices(); }
async function setInvoicesSort(key) { _invoicesSort = nextSortState(_invoicesSort, key); await renderGPInvoices(); focusSortHeader(key); }
