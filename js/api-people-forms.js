// Assignment-edit and GP-invoice-write SharePoint API calls.
// Extracted from api.js by N-237b — single-consumer functions used only by
// people-forms.js (people.html). Depends on createItem/updateItem, defined
// in api.js (loads first, see script order). createAssignment/updateInvoice
// stay in api.js — multi-consumer (people-forms.js + people-tracker.js /
// people-invoices.js).

async function updateAssignment(id, fields) {
  const payload = {};
  if (fields.AssignmentID    !== undefined) payload.Title           = fields.AssignmentID;
  if (fields.EmployeeName    !== undefined) payload.EmployeeName    = fields.EmployeeName;
  if (fields.Level           !== undefined) payload.Level           = fields.Level;
  if (fields.Customer        !== undefined) payload.Customer        = fields.Customer;
  if (fields.ProjectType     !== undefined) payload.ProjectType     = fields.ProjectType;
  if (fields.StartDate       !== undefined) payload.StartDate       = fields.StartDate;
  if (fields.EndDate         !== undefined) payload.EndDate         = fields.EndDate;
  if (fields.MonthlyBillRate !== undefined) payload.MonthlyBillRate = fields.MonthlyBillRate;
  if (fields.RetainerFee     !== undefined) payload.RetainerFee     = fields.RetainerFee;
  if (fields.PlacementFee    !== undefined) payload.PlacementFee    = fields.PlacementFee;
  if (fields.Billed          !== undefined) payload.Billed          = fields.Billed;
  if (fields.Country         !== undefined) payload.Country         = fields.Country;
  if (fields.IsForecast      !== undefined) payload.IsForecast      = fields.IsForecast;
  return updateItem("Assignments", id, payload);
}

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
 const filename = `invoice-${itemId}-${file.name}`;
 const token = await getToken();
 if (!token) throw new Error('Not authenticated');
 const url = `${GRAPH}/sites/${CONFIG.SP_SITE_ID}/drives/${CONFIG.GP_INVOICE_DRIVE_ID}/items/root:/${encodeURIComponent(filename)}:/content`;
 const res = await fetch(url, {
 method: 'PUT',
 headers: {
 'Authorization': `Bearer ${token}`,
 'Content-Type': 'application/pdf',
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
