// GP-invoice-write SharePoint API calls.
// Extracted from api.js by N-237b — single-consumer functions used only by
// people-forms.js (people.html). Depends on createItem/updateItem, defined
// in graph-client.js (loads first, see script order). createAssignment/updateInvoice
// stay in api.js — multi-consumer (people-forms.js + people-tracker.js /
// people-invoices.js). updateAssignment moved back to api.js in N-365 (the
// Project Team on reporting.html writes it too).

async function createInvoice(fields) {
  return createItem("GPInvoices", {
    Title:       fields.InvoiceNumber,
    InvoiceDate: fields.InvoiceDate,
    DueDate:     fields.DueDate,
    Amount:      fields.Amount,
    Notes:       fields.Notes  || undefined,
    Status:      fields.Status || "Sent",
  });
}

async function uploadInvoiceAttachment(itemId, file) {
 // Upload PDF to GPInvoiceFiles document library via Graph Drive API.
 // filename includes itemId to avoid collisions.
 // N-284: validate first; the stored name is sanitised, never the raw file name.
 const check = validateUpload(file, 'INVOICE');
 if (!check.ok) throw new Error(check.reason);
 const filename = `invoice-${itemId}-${safeUploadName(file.name, check.ext)}`;
 const token = await getToken();
 if (!token) throw new Error('Not authenticated');
 const url = `${GRAPH}/sites/${CONFIG.SP_SITE_ID}/drives/${CONFIG.GP_INVOICE_DRIVE_ID}/items/root:/${encodeURIComponent(filename)}:/content`;
 const res = await fetch(url, {
 method: 'PUT',
 headers: {
 'Authorization': `Bearer ${token}`,
 'Content-Type': check.mime,
 },
 body: file,
 });
 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 throw new Error(err?.error?.message || `Upload failed: HTTP ${res.status}`);
 }
 const result = await res.json();
 // Return the web URL so it can be stored on the list item
 return result?.webUrl || null;
}
async function addInvoiceFileURL(itemId, fileUrl) {
 // Write the uploaded file's URL back to the GPInvoices list item.
 return updateItem('GPInvoices', itemId, { FileURL: fileUrl });
}
