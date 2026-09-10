# Newton

Recruitment reporting and workforce management platform built for Momentum Global.

## Overview

Newton is a static web application hosted on GitHub Pages, with Microsoft Azure AD for authentication and SharePoint Online as its data backend. All data access is performed client-side via the Microsoft Graph API.

## Modules

| Module | File | Access |
|---|---|---|
| Reporting | `reporting.html` | Admin, Delivery Manager, Talent Partner, Leadership |
| Market Analytics | `market-reporting.html` | Admin, Delivery Manager, Talent Partner |
| People | `people.html` | Admin, Leadership, Delivery Manager |
| Sales | `sales.html` | Admin, Leadership; Delivery Manager (LCI Cost Models only) |
| MG Command Centre | `command-centre.html` | Admin, Leadership |
| Newton OS Admin | `admin.html` | Admin only |
| Mobile App (PWA) | `mobile.html` | Admin, Delivery Manager, Talent Partner |

## Stack

- **Hosting** — GitHub Pages
- **Auth** — Microsoft Azure AD + MSAL.js v2
- **Data** — SharePoint Online via Microsoft Graph API v1.0
- **UI** — Vanilla HTML, CSS, JavaScript (no framework)
- **Mobile** — Installable PWA (`manifest.webmanifest` + `sw.js`) over the same codebase
- **Icons** — Lucide
- **Fonts** — Polymath (self-hosted)

## Developer Reference

Full system directory including architecture, data flows, SharePoint data model, role/access matrix, coding conventions, mobile app, and module build guide:

👉 **[README.html](https://momentumglobal.github.io/newton/Readme.html)**

## Quick links

- [Newton platform](https://momentumglobal.github.io/newton/)
- [Newton mobile](https://momentumglobal.github.io/newton/mobile.html)
- [SharePoint site](https://talentpoint.sharepoint.com/sites/SolutionsHubReporting)

## Changelog

The changelog lives in the Developer Reference, so there is one copy to keep current rather
than two that drift apart:

👉 **[Changelog — README.html](https://momentumglobal.github.io/newton/Readme.html)** — open the
**Changelog** section in the sidebar.

Everything that was recorded here has been migrated there; nothing was lost in the move.
