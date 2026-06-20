// js/mobile-app.js - Mobile entry point, auth, and navigation controller

let _mobileRole    = null;  // Resolved role for current user
let _mobileUser    = null;  // { email, name }
let _mobileModule  = 'home';// Active module key ('home' | 'reporting' | ...)
let _mobileView    = 'home';// Current view within the active module
let _mobileRoleId  = null;  // Selected role ID for detail/action views
let _mobileHistory = [];    // Simple back-stack (stores {module, view})

// === Mobile module registry ===
// Single source of truth for WHICH modules have a built mobile experience.
// A module from CONFIG.OS_MODULES only appears in the launcher / switcher
// if its key is in this set. Add a key here when its mobile view ships.
// (Command Centre is intentionally excluded from mobile entirely.)
const MOBILE_MODULES = new Set([
  'reporting',
  // 'people',     // Phase B
  // 'sales',      // Phase C
  // 'marketing',  // Phase C (Market Analytics -> Placement Analytics)
]);

// Per-module bottom-nav definitions. Each item: {view, label, icon(svg)}.
// 'home' has no bottom nav (it's the launcher).
const MOBILE_NAV = {
  reporting: [
    { view: 'roles',     label: 'Roles',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>' },
    { view: 'activity',  label: 'Log Activity',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
    { view: 'placement', label: 'Placement',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
  ],
};

// Default view when a module is opened.
const MOBILE_MODULE_HOME = {
  reporting: 'roles',
};

function getWeekEnding() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 6=Sat
  const diff = day === 0 ? 0 : 7 - day; // next Sunday
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + diff);
  return sunday.toISOString().slice(0, 10);
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function mobileInit() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display    = 'none';

  try {
    const account = msalInstance.getAllAccounts()[0];
    if (account) {
       await msalInstance.acquireTokenSilent({
        scopes: loginRequest.scopes,
        account,
       });
      await mobileOnSignedIn();
    } else {
      const response = await msalInstance.handleRedirectPromise();
      if (response) {
        await mobileOnSignedIn();
      }
    }
  } catch (e) {
    console.warn('Mobile auth:', e.message);
  }
}

async function mobileOnSignedIn() {
  const user = getCurrentUser();
  if (!user) return;
  _mobileUser = user;
  _mobileRole = await getEffectiveRole(user.email);

  // Only TP, DM and admin have mobile access
  if (!['talent_partner', 'delivery_manager', 'admin'].includes(_mobileRole)) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-screen').innerHTML = `
      <div class="m-login-card" style="position:relative;z-index:2">
        <h1 style="color:white">Access Restricted</h1>
        <p style="color:rgba(255,255,255,0.6)">The mobile view is available to Talent Partners and Delivery Managers only.</p>
        <button class="btn-signin" onclick="signOut()">Sign out</button>
      </div>`;
    return;
  }

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display    = 'flex';

  // Land on the Home launcher
  mobileOpenHome();
}

function signIn() {
  msalInstance.loginRedirect(loginRequest);
}

function signOut() {
  sessionStorage.clear();
  msalInstance.logoutRedirect();
}

// === Module navigation ===

// Open the Home launcher (no active module).
function mobileOpenHome(pushHistory = true) {
  if (pushHistory) _mobileHistory.push({ module: _mobileModule, view: _mobileView });
  _mobileModule = 'home';
  _mobileView   = 'home';
  mobileSyncChrome();
  mobileRenderHome(document.getElementById('m-main'));
}

// Open a module at its default view.
function mobileOpenModule(moduleKey, pushHistory = true) {
  if (!MOBILE_MODULES.has(moduleKey)) return;
  if (pushHistory) _mobileHistory.push({ module: _mobileModule, view: _mobileView });
  _mobileModule = moduleKey;
  _mobileView   = MOBILE_MODULE_HOME[moduleKey] || 'home';
  mobileSyncChrome();
  mobileRenderView();
}

// Navigate to a view within the current module.
function mobileNav(view, pushHistory = true) {
  if (pushHistory && _mobileView !== view) {
    _mobileHistory.push({ module: _mobileModule, view: _mobileView });
  }
  _mobileView = view;
  mobileSyncChrome();
  mobileRenderView();
}

function mobileBack() {
  if (_mobileHistory.length) {
    const prev = _mobileHistory.pop();
    // Back-compat: mobile-pages.js may push a bare string (just a view).
    // Tolerate both {module,view} objects and plain strings.
    if (typeof prev === 'string') {
      _mobileView = prev;                 // same module, previous view
    } else {
      _mobileModule = prev.module;
      _mobileView   = prev.view;
    }
    mobileSyncChrome();
    if (_mobileModule === 'home') mobileRenderHome(document.getElementById('m-main'));
    else mobileRenderView();
  }
}

// Render the current module/view.
function mobileRenderView() {
  const main = document.getElementById('m-main');
  if (_mobileModule === 'home') { mobileRenderHome(main); return; }

  switch (_mobileView) {
    // Reporting
    case 'roles':        mobileRenderRoles(main);               break;
    case 'role-detail':  mobileRenderRoleDetail(main);          break;
    case 'stage-update': mobileRenderStageUpdate(main);         break;
    case 'activity':     mobileRenderActivityForm(main, false); break;
    case 'activity-role':mobileRenderActivityForm(main, true);  break;
    case 'placement':    mobileRenderPlacementForm(main, false);break;
    case 'placement-role':mobileRenderPlacementForm(main, true);break;
    default:
      // Fallback to the module's home view
      mobileNav(MOBILE_MODULE_HOME[_mobileModule] || 'home', false);
  }
}

// === Chrome (top bar, switcher, bottom nav) ===

// Keep the back button, bottom nav and switcher in sync with state.
function mobileSyncChrome() {
  // Back button: shown whenever there's history
  const backBtn = document.getElementById('m-back-btn');
  if (backBtn) backBtn.style.display = _mobileHistory.length ? 'block' : 'none';

  // Module switcher button label
  const swLabel = document.getElementById('m-switcher-label');
  if (swLabel) {
    const mod = (CONFIG.OS_MODULES || []).find(m => m.key === _mobileModule);
    swLabel.textContent = _mobileModule === 'home' ? 'Newton' : (mod?.name || 'Newton');
  }

  // Bottom nav: rebuild for the active module (hidden on home)
  mobileRenderBottomNav();
}

function mobileRenderBottomNav() {
  const nav = document.getElementById('m-bottom-nav');
  if (!nav) return;
  const items = MOBILE_NAV[_mobileModule];
  if (!items || _mobileModule === 'home') {
    nav.innerHTML = '';
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';
  nav.innerHTML = items.map(it => `
    <button class="m-nav-item ${_mobileView === it.view ? 'active' : ''}"
      onclick="mobileNav('${it.view}')">
      ${it.icon}
      ${it.label}
    </button>`).join('');
}

// === Module switcher dropdown ===

function mobileToggleSwitcher() {
  const menu = document.getElementById('m-switcher-menu');
  if (!menu) return;
  const open = menu.style.display === 'block';
  if (open) { menu.style.display = 'none'; return; }

  // Build menu items: Home + accessible modules
  const modules = mobileGetAccessibleModules();
  let html = `<button class="m-switcher-item ${_mobileModule==='home'?'active':''}"
                onclick="mobileSwitcherGo('home')">Home</button>`;
  html += modules.map(m => `
    <button class="m-switcher-item ${_mobileModule===m.key?'active':''}"
      onclick="mobileSwitcherGo('${m.key}')">${m.name}</button>`).join('');
  menu.innerHTML = html;
  menu.style.display = 'block';
}

function mobileSwitcherGo(key) {
  const menu = document.getElementById('m-switcher-menu');
  if (menu) menu.style.display = 'none';
  if (key === 'home') mobileOpenHome();
  else mobileOpenModule(key);
}

// Close the switcher if tapping outside it
document.addEventListener('click', (e) => {
  const menu = document.getElementById('m-switcher-menu');
  const btn  = document.getElementById('m-switcher-btn');
  if (!menu || menu.style.display !== 'block') return;
  if (btn && (btn.contains(e.target) || menu.contains(e.target))) return;
  menu.style.display = 'none';
});

function mobileSetTitle(title, sub = 'Momentum Global') {
  document.getElementById('m-topbar-title').textContent = title;
  document.getElementById('m-topbar-sub').textContent   = sub;
}

function mobileForceDesktop() {
  sessionStorage.setItem('newton_force_desktop', '1');
  window.location.href = 'reporting.html';
}

// === Toast ===

function mobileToast(msg) {
  const toast = document.getElementById('m-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// === Boot ===

document.addEventListener('DOMContentLoaded', mobileInit);
