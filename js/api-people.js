// js/api-people.js — People module Graph reads/writes (N-476, R3-7, moved from api.js):
// People, pay, Assignments, bench resync, invoices and staff photos. Loads straight after
// api-access.js on every shell that loads api.js (ui-kit.js, people-logic.js, command-bar.js,
// home-banner.js and cc-pages.js call it at run time) and in CONFIG.MCP.scripts
// (getPeople / getAssignments).

// ── People module: People list ────────────────────────────────────────
// Placeholder rows (vacancies / fictional roles) are EXCLUDED unless the caller
// opts in — only the Org Chart does. Filtered client-side, not in the OData
// $filter: rows created before the IsPlaceholder column existed have no value
// for it, and a server-side "eq 0" would drop every one of them.
async function getPeople(activeOnly = true, includePlaceholders = false) {
  const filter = activeOnly ? "fields/IsActive eq 1" : "";
  const all = await getItems("People", filter);
  const people = includePlaceholders ? all : all.filter(p => !p.IsPlaceholder);
  return people.sort((a, b) => {
    const lDiff = levelSortIndex(a.Level) - levelSortIndex(b.Level);
    if (lDiff !== 0) return lDiff;
    return (a.EmployeeName || "").localeCompare(b.EmployeeName || "");
  });
}

// ── People module: PeoplePay list (N-286 / SEC-6) ────────────────────
// Salary's only home. Restricted to admin + leadership: call these ONLY on
// payroll paths (Employee Tracker salary column, Edit Employee, Payroll
// Summary) — never from a TP/DM page. Unfiltered read: the list is one row
// per employee, and a filter on the non-indexed PersonID would need the
// HonorNonIndexedQueries header. A 403 returns [] (N-285, getItems).
// Deliberately tier 1 only — not in CONFIG.CACHE.persistentLists — so
// salaries never sit in sessionStorage.
async function getPeoplePay() {
  return getItems('PeoplePay');
}

// Upsert one person's salary. Blank (undefined/null/'') = no change, never a
// clear (N-286 decision 2). Writes only through createItem/updateItem, so the
// cache-invalidation contract holds.
async function setPersonSalary(personId, salary) {
  if (salary === undefined || salary === null || salary === '') return null;
  const value = Number(salary);
  const pid   = Number(personId);
  const rows  = (await getPeoplePay())
    .filter(r => Number(r.PersonID) === pid)
    .sort((a, b) => Number(a.id) - Number(b.id));
  if (!rows.length) {
    return createItem('PeoplePay', { Title: String(pid), PersonID: pid, Salary: value });
  }
  if (rows.length > 1) {
    console.warn(`Newton: ${rows.length} PeoplePay rows for PersonID ${pid} — updating the lowest id (N-286).`);
  }
  if (Number(rows[0].Salary) === value) return rows[0];
  return updateItem('PeoplePay', rows[0].id, { Salary: value });
}

// N-286: Salary goes to PeoplePay, never People. A failed salary write must
// not throw: the People row already exists, and rethrowing would make
// optimisticWrite() revert and offer a Retry that creates a duplicate person.
// Instead the result carries _salaryError (the message) and the caller —
// people-forms.js — tells the user. api.js stays free of UI calls.
async function createPerson(fields) {
  const saved = await createItem("People", {
    Title:        fields.EmployeeName,
    Level:        fields.Level || undefined,   // N-304: blank for internal staff
    StaffType:    fields.StaffType || CONFIG.STAFF_TYPE_DEPLOYABLE,
    StaffFunction: fields.StaffFunction || undefined,
    ContractType: fields.ContractType || undefined,   // N-402: none for External
    Location:     fields.Location,
    StartDate:    fields.StartDate || undefined,
    EndDate:      fields.EndDate   || undefined,
    LevelSince:   fields.LevelSince || undefined,   // N-437: PDP promotion date (Date only)
    IsActive:     fields.IsActive !== false,
    PhotoUrl:     fields.PhotoUrl || undefined,
    IsPlaceholder:      fields.IsPlaceholder || undefined,
    PlaceholderProject: fields.PlaceholderProject || undefined,
    PlaceholderCSD:     fields.PlaceholderCSD     || undefined,
  });
  if (fields.Salary !== undefined && saved && saved.id) {
    try {
      await setPersonSalary(saved.id, fields.Salary);
    } catch (e) {
      console.warn('Newton: PeoplePay write failed for new person ' + saved.id, e);
      return { ...saved, _salaryError: e.message };
    }
  }
  return saved;
}
// N-286: errors from the salary write propagate — the edit form shows them.
async function updatePerson(id, fields) {
  const payload = {};
  if (fields.EmployeeName !== undefined) payload.Title        = fields.EmployeeName;
  if (fields.Level        !== undefined) payload.Level        = fields.Level;
  if (fields.StaffType    !== undefined) payload.StaffType    = fields.StaffType;     // N-304
  if (fields.StaffFunction !== undefined) payload.StaffFunction = fields.StaffFunction;
  if (fields.ContractType !== undefined) payload.ContractType = fields.ContractType;
  if (fields.Location     !== undefined) payload.Location     = fields.Location;
  if (fields.StartDate    !== undefined) payload.StartDate    = fields.StartDate;
  if (fields.EndDate      !== undefined) payload.EndDate      = fields.EndDate;
  if (fields.LevelSince   !== undefined) payload.LevelSince   = fields.LevelSince;   // N-437 (null clears)
  if (fields.IsActive     !== undefined) payload.IsActive     = fields.IsActive;
  if (fields.PhotoUrl     !== undefined) payload.PhotoUrl     = fields.PhotoUrl;
  if (fields.IsPlaceholder      !== undefined) payload.IsPlaceholder      = fields.IsPlaceholder;
  if (fields.PlaceholderProject !== undefined) payload.PlaceholderProject = fields.PlaceholderProject;
  if (fields.PlaceholderCSD     !== undefined) payload.PlaceholderCSD     = fields.PlaceholderCSD;
  const result = Object.keys(payload).length ? await updateItem("People", id, payload) : null;
  if (fields.Salary !== undefined) await setPersonSalary(id, fields.Salary);
  return result;
}
 
// ── People module: Assignments list ──────────────────────────────────
async function getAssignments(filters = {}) {
  const parts = [];
  // N-365: one project's team (ProjectID is indexed, N-361). A bad id returns
  // nothing rather than dropping the filter and returning every row.
  if (filters.projectId !== undefined) {
    const pid = Number(filters.projectId);
    if (!Number.isInteger(pid) || pid <= 0) return [];
    parts.push(`fields/ProjectID eq ${pid}`);
  }
  if (filters.employeeName) parts.push(`fields/EmployeeName eq '${odataStr(filters.employeeName)}'`);
  if (filters.customer)     parts.push(`fields/Customer eq '${odataStr(filters.customer)}'`);
  if (filters.billed !== undefined && filters.billed !== '')
    parts.push(`fields/Billed eq '${odataStr(filters.billed)}'`);
  const filterStr = parts.join(" and ");
  const assignments = await getItems("Assignments", filterStr);
  if (filters.year) {
    const y = parseInt(filters.year);
    const yearStart = new Date(y, 0, 1);
    const yearEnd   = new Date(y, 11, 31, 23, 59, 59);
    return assignments.filter(a => {
      const s = a.StartDate ? new Date(a.StartDate) : null;
      const e = a.EndDate   ? new Date(a.EndDate)   : null;
      if (!s) return false;
      return s <= yearEnd && (!e || e >= yearStart);
    });
  }
  return assignments;
}
async function createAssignment(fields) {
  return createItem("Assignments", {
    Title:           fields.AssignmentID,
    EmployeeName:    fields.EmployeeName,
    Level:           fields.Level,
    StaffType:       fields.StaffType || undefined,   // N-402: copied at create; blank = Deployable
    Customer:        fields.Customer,
    ProjectType:     fields.ProjectType,
    StartDate:       fields.StartDate,
    EndDate:         fields.EndDate,
    MonthlyBillRate: fields.MonthlyBillRate || undefined,
    RetainerFee:     fields.RetainerFee  || undefined,   // N-116 split-fee
    PlacementFee:    fields.PlacementFee || undefined,   // N-116 split-fee
    Billed:          fields.Billed,
    Country:         fields.Country,
    IsForecast:      fields.IsForecast || false,
    AutoGenerated:   fields.AutoGenerated || false,
    // N-365: Project Team keys (N-361 columns). Bench rows and People-form rows
    // leave them unset.
    ProjectID:       fields.ProjectID || undefined,
    UserEmail:       fields.UserEmail || undefined,
    IsLeadDM:        fields.IsLeadDM === true ? true : undefined,
  });
}
// Moved from api-people-forms.js by N-365. Its only caller is the Project Team on
// reporting.html (the People Assignment form was deleted in N-372). Only keys present are sent.
async function updateAssignment(id, fields) {
  const payload = {};
  if (fields.AssignmentID    !== undefined) payload.Title           = fields.AssignmentID;
  if (fields.EmployeeName    !== undefined) payload.EmployeeName    = fields.EmployeeName;
  if (fields.Level           !== undefined) payload.Level           = fields.Level;
  if (fields.StaffType       !== undefined) payload.StaffType       = fields.StaffType;   // N-402
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
  if (fields.ProjectID       !== undefined) payload.ProjectID       = fields.ProjectID;   // N-365
  if (fields.UserEmail       !== undefined) payload.UserEmail       = fields.UserEmail;
  if (fields.IsLeadDM        !== undefined) payload.IsLeadDM        = fields.IsLeadDM;
  return updateItem("Assignments", id, payload);
}
// N-365: remove one Assignments row (Project Team delete).
async function deleteAssignment(id) {
  return deleteItem("Assignments", id);
}

// N-365 (design rule 4): re-run Sync Bench for ONE person after a Project Team
// save, so their bench rows never overlap the new / changed assignment. Same
// gap rule as the Sync Bench button (ptComputeBenchChanges, project-team.js),
// limited to this person. Never throws — the save it follows has already
// landed: resolves { ok, created, deleted }; ok false = run Sync Bench in People.
async function resyncBenchFor(employeeName) {
  try {
    const person = (await getPeople(false)).find(p => p.EmployeeName === employeeName);
    if (!person) return { ok: true, created: 0, deleted: 0 };
    const rows = await getAssignments({ employeeName });
    const { toCreate, toDelete } = ptComputeBenchChanges([person], rows);
    for (const id of toDelete) await deleteItem("Assignments", id);
    if (toCreate.length) {
      const all = await getAssignments({});
      for (let i = 0; i < toCreate.length; i++) {
        toCreate[i].AssignmentID = ptNextAssignmentId(all, 'B', i);
        await createAssignment(toCreate[i]);
      }
    }
    return { ok: true, created: toCreate.length, deleted: toDelete.length };
  } catch (e) {
    console.warn('Newton: bench re-sync failed for ' + employeeName, e);
    return { ok: false, created: 0, deleted: 0 };
  }
}

// N-365 (D-5): make one Project Team row the project's Lead DM, or clear it
// (assignmentId null). Three writes, in this order: (1) IsLeadDM true on the
// new row, (2) IsLeadDM false on every other team row that has it, (3)
// Projects.DeliveryManager = the new row's UserEmail ('' to clear). Not atomic:
// a failure throws with err.step = 1 | 2 | 3 so the caller can say what
// landed (N-373's Data Health probe catches a half-write).
async function setProjectLeadDm(projectId, assignmentId, teamRows) {
  const rows = teamRows || [];
  const target = assignmentId == null ? null : rows.find(r => String(r.id) === String(assignmentId));
  const email = target ? String(target.UserEmail || '').trim().toLowerCase() : '';
  if (assignmentId != null && !email) throw Object.assign(new Error('That team member has no Newton login.'), { step: 1 });
  const run = async (step, fn) => {
    try { return await fn(); } catch (e) { e.step = step; throw e; }
  };
  if (target) await run(1, () => updateItem("Assignments", target.id, { IsLeadDM: true }));
  const others = rows.filter(r => (!target || String(r.id) !== String(target.id)) &&
    (r.IsLeadDM === true || r.IsLeadDM === 1 || r.IsLeadDM === 'Yes'));
  await run(2, async () => { for (const r of others) await updateItem("Assignments", r.id, { IsLeadDM: false }); });
  await run(3, () => updateItem("Projects", projectId, { DeliveryManager: email }));
}
 
// ── People module: GPInvoices list ────────────────────────────────────
async function updateInvoice(id, fields) {
  const payload = {};
  if (fields.InvoiceNumber !== undefined) payload.Title       = fields.InvoiceNumber;
  if (fields.InvoiceDate   !== undefined) payload.InvoiceDate = fields.InvoiceDate;
  if (fields.DueDate       !== undefined) payload.DueDate     = fields.DueDate;
  if (fields.Amount        !== undefined) payload.Amount      = fields.Amount;
  if (fields.Notes         !== undefined) payload.Notes       = fields.Notes;
  if (fields.Status        !== undefined) payload.Status      = fields.Status;
  return updateItem("GPInvoices", id, payload);
}

// ── People photos: upload into the PeoplePhotos document library ──────
let _peoplePhotosDriveId = null;
async function getPeoplePhotosDriveId() {
  if (_peoplePhotosDriveId) return _peoplePhotosDriveId;
  const data = await graphRequest('GET', `/sites/${CONFIG.SP_SITE_ID}/drives`);
  const drive = (data.value || []).find(d => d.name === 'PeoplePhotos');
  if (!drive) throw new Error("'PeoplePhotos' document library not found on the site.");
  _peoplePhotosDriveId = drive.id;
  return drive.id;
}

// ── People photos: Graph download URLs (N-337) ───────────────────────
// A plain <img src="https://….sharepoint.com/…/PeoplePhotos/x.png"> is
// authenticated by a SharePoint session cookie, which browsers often don't
// send cross-site (401). Graph's /content would work, but it 302s to a
// sharepoint.com host that connect-src does not allow. So the library is listed
// once and each file's pre-authenticated @microsoft.graph.downloadUrl becomes
// the <img> src (img-src already allows sharepoint.com). Memory only — never
// _apiCache or browser storage: the URLs are time-limited bearer links (N-282).
let _photoMap = null;        // Map: lower-cased filename -> download URL
let _photoMapAt = null;      // Date.now() when _photoMap was built
let _photoMapPromise = null; // in-flight read, shared by concurrent callers
let _photoMapGen = 0;        // bumped by _photoMapInvalidate(); a read that started before it is not stored

// Never throws. A failed read returns an empty Map and is not remembered, so
// the next call retries. force = re-read even inside the TTL.
async function getPhotoUrlMap(force = false) {
  if (!force && _photoMap && photoMapFresh(_photoMapAt, Date.now(), CONFIG.PHOTO_URL_TTL_MS)) return _photoMap;
  if (_photoMapPromise) return _photoMapPromise;
  const gen = _photoMapGen;
  const read = (async () => {
    try {
      const driveId = await getPeoplePhotosDriveId();
      const items = [];
      let url = `/sites/${CONFIG.SP_SITE_ID}/drives/${driveId}/root/children?$top=200`;
      while (url) {
        const data = await graphRequest('GET', url);
        items.push(...(data.value || []));
        url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(GRAPH, '') : null;
      }
      const map = buildPhotoUrlMap(items);
      if (gen === _photoMapGen) { _photoMap = map; _photoMapAt = Date.now(); }
      return map;
    } catch (e) {
      console.warn('N-337: could not read the PeoplePhotos library — avatars fall back to initials', e);
      return new Map();
    } finally {
      if (_photoMapPromise === read) _photoMapPromise = null;
    }
  })();
  _photoMapPromise = read;
  return read;
}

// Forget the map (a photo was just uploaded or replaced).
function _photoMapInvalidate() {
  _photoMapGen++;
  _photoMap = null;
  _photoMapAt = null;
  _photoMapPromise = null;
}

// Upload an image; returns its web URL. prefix = 'person' | 'leader'.
// Stable filename (prefix-id.ext) so re-uploads overwrite the previous photo.
async function uploadPeoplePhoto(prefix, id, file) {
  // N-284: validate first, at the API boundary, so no caller can skip it.
  const check = validateUpload(file, 'PHOTO');
  if (!check.ok) throw new Error(check.reason);
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const driveId = await getPeoplePhotosDriveId();
  const filename = `${prefix}-${id}.${check.ext}`;
  const url = `${GRAPH}/sites/${CONFIG.SP_SITE_ID}/drives/${driveId}/items/root:/${encodeURIComponent(filename)}:/content`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': check.mime },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Photo upload failed: HTTP ${res.status}`);
  }
  const result = await res.json();
  _photoMapInvalidate();   // N-337: the library changed — next hydrate re-lists it
  const web = result?.webUrl;
  return web ? web + (web.includes('?') ? '&' : '?') + 'v=' + Date.now() : null;
}
