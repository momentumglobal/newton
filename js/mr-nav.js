// js/mr-nav.js — Marketing Report module navigation

let _mrCurrentPage   = null;
let _mrResolvedRole  = null;  // set by mr-app.js on init

// Full OS module switcher list — must include Marketing Report
const MR_OS_MODULES = [
  { key: "reporting",  name: "Reporting",         icon: "bar-chart-2",
    href: "reporting.html",  live: true,
    roles: ["admin","delivery_manager","talent_partner","leadership"] },
  { key: "marketing",  name: "Market Reporting",  icon: "megaphone",
    href: "market-reporting.html",  live: true,
    roles: ["admin","delivery_manager","talent_partner"] },
  { key: "people",     name: "People",            icon: "users",
    href: "people.html",     live: true,
    roles: ["admin","leadership"] },
  { key: "sales",      name: "Sales",             icon: "trending-up",
    href: "sales.html",      live: true,
    roles: ["admin","leadership"] },
];

function renderMrNav(role) {
  const pages   = getMrAccessiblePages(role);
  const user    = getCurrentUser();
  const visible = MR_OS_MODULES.filter(m => m.roles.includes(role));

  const moduleItems = visible.map(m => {
    if (!m.live) {
      return `<div class="nav-module-item disabled">
        <i data-lucide="${m.icon}" class="nav-module-icon"></i>
        ${m.name} <span class="nav-module-soon">Soon</span></div>`;
    }
    const isCurrent = m.key === "marketing";
    return `<a class="nav-module-item${isCurrent ? " current" : ""}"
      href="${m.href}">
      <i data-lucide="${m.icon}" class="nav-module-icon"></i>${m.name}</a>`;
  }).join("");

  document.getElementById("sidebar").innerHTML = `
    <div class="nav-header nav-header-dropdown"
         onclick="toggleMrModuleDropdown()">
      <div class="nav-logo">Newton
        <span class="nav-header-arrow">&#9662;</span></div>
      <div class="nav-subtitle">Market Reporting</div>
      <div class="nav-module-dropdown" id="nav-module-dropdown">
        <a class="nav-module-home" href="index.html">&#8592; Home</a>
        <div class="nav-module-divider"></div>
        ${moduleItems}
      </div>
    </div>
    <div class="nav-user">
      <div class="nav-user-name">${user.name || user.email}</div>
      <div class="nav-user-role">${role.replace(/_/g, " ")}</div>
    </div>
    <nav class="nav-links">
      ${pages.map(p => `
        <a class="nav-link ${p.key === _mrCurrentPage ? "active" : ""}"
           onclick="navigateToMr(\"${p.key}\")">
           ${p.label}</a>`).join("")}
    </nav>
    <img src="momentum-symbol-and-name-global-white.png"
         alt="Momentum Global" class="nav-logo-img">
    <div class="nav-footer">
      <a class="nav-link signout" onclick="signOut()">Sign out</a>
    </div>
  `;
  lucide.createIcons();
}

function toggleMrModuleDropdown() {
  const dd = document.getElementById("nav-module-dropdown");
  if (dd) dd.classList.toggle("open");
}

document.addEventListener("click", function(e) {
  const header = document.querySelector(".nav-header-dropdown");
  const dd     = document.getElementById("nav-module-dropdown");
  if (dd && header && !header.contains(e.target)) dd.classList.remove("open");
});

function navigateToMr(page) {
  const role = _mrResolvedRole || "viewer";
  if (!mrCanAccess(page, role)) return;
  _mrCurrentPage = page;
  renderMrNav(role);
  renderMrPage(page);
}

async function renderMrPage(page) {
  switch (page) {
    case "marketReport": await renderMarketReport(); break;
    default: document.getElementById("main-content").innerHTML
      = "<p>Page not found.</p>";
  }
}
