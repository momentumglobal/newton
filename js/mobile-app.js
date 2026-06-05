// js/mobile-app.js — Mobile entry point, auth, and navigation controller

let _mobileRole    = null;  // Resolved role for current user
let _mobileUser    = null;  // { email, name }
let _mobileView    = 'roles'; // Current top-level view
let _mobileRoleId  = null;  // Selected role ID for detail/action views
let _mobileHistory = [];    // Simple back-stack

async function mobileInit() {
  // Show login screen while we check auth state
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display    = 'none';

  try {
    // Attempt silent token acquisition first
    const account = msalInstance.getAllAccounts()[0];
    if (account) {
       await msalInstance.acquireTokenSilent({
        scopes: loginRequest.scopes,
        account,
       });
      await mobileOnSignedIn();
    } else {
      // Check for redirect response (returning from Microsoft login)
      const response = await msalInstance.handleRedirectPromise();
      if (response) {
        await mobileOnSignedIn();
      }
      // else: show login screen (already visible)
    }
  } catch (e) {
    // Silent auth failed — show login screen
    console.warn('Mobile auth:', e.message);
  }
}

async function mobileOnSignedIn() {
  const user = getCurrentUser();
  if (!user) return;
  _mobileUser = user;
  _mobileRole = await getEffectiveRole(user.email);

  // Only TP and DM have mobile access
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

  mobileNav('roles');
}

function signIn() {
  msalInstance.loginRedirect(loginRequest);
}

function signOut() {
  sessionStorage.clear();
  msalInstance.logoutRedirect();
}

// ── Navigation ────────────────────────────────────────────────────────

function mobileNav(view, pushHistory = true) {
  if (pushHistory && _mobileView !== view) {
    _mobileHistory.push(_mobileView);
  }
  _mobileView = view;

  // Update bottom nav active state (only for top-level views)
  const topLevel = ['roles', 'activity', 'placement'];
  topLevel.forEach(v => {
    const el = document.getElementById(`m-nav-${v}`);
    if (el) el.classList.toggle('active', v === view);
  });

  // Show/hide back button
  const backBtn = document.getElementById('m-back-btn');
  if (backBtn) backBtn.style.display = _mobileHistory.length ? 'block' : 'none';

  // Render the view
  const main = document.getElementById('m-main');
  switch (view) {
    case 'roles':        mobileRenderRoles(main);               break;
    case 'role-detail':  mobileRenderRoleDetail(main);          break;
    case 'stage-update': mobileRenderStageUpdate(main);         break;
    case 'activity':     mobileRenderActivityForm(main, false); break;
    case 'activity-role':mobileRenderActivityForm(main, true);  break;
    case 'placement':    mobileRenderPlacementForm(main, false);break;
    case 'placement-role':mobileRenderPlacementForm(main, true);break;
    default:             mobileRenderRoles(main);
  }
}

function mobileBack() {
  if (_mobileHistory.length) {
    const prev = _mobileHistory.pop();
    mobileNav(prev, false);
  }
}

function mobileSetTitle(title, sub = 'Momentum Global') {
  document.getElementById('m-topbar-title').textContent = title;
  document.getElementById('m-topbar-sub').textContent   = sub;
}

function mobileForceDesktop() {
  sessionStorage.setItem('newton_force_desktop', '1');
  window.location.href = 'reporting.html';
}

// ── Toast ─────────────────────────────────────────────────────────────

function mobileToast(msg) {
  const toast = document.getElementById('m-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Boot ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', mobileInit);
