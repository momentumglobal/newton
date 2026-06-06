# Newton

Recruitment reporting and workforce management platform built for Momentum Global.

## Overview

Newton is a static web application hosted on GitHub Pages, with Microsoft Azure AD for authentication and SharePoint Online as its data backend. All data access is performed client-side via the Microsoft Graph API.

## Modules

| Module | File | Access |
|---|---|---|
| Reporting | `reporting.html` | Admin, Delivery Manager, Talent Partner, Leadership |
| Market Reporting | `market-reporting.html` | Admin, Delivery Manager, Talent Partner |
| People | `people.html` | Admin, Leadership, Delivery Manager |
| Sales | `sales.html` | Admin, Leadership |
| Newton OS Admin | `admin.html` | Admin only |

## Stack

- **Hosting** — GitHub Pages
- **Auth** — Microsoft Azure AD + MSAL.js v2
- **Data** — SharePoint Online via Microsoft Graph API v1.0
- **UI** — Vanilla HTML, CSS, JavaScript (no framework)
- **Icons** — Lucide
- **Fonts** — Polymath (self-hosted)

## Developer Reference

Full system directory including architecture, data flows, SharePoint data model, role/access matrix, coding conventions, and module build guide:

👉 **[README.html](https://momentumglobal.github.io/newton/Readme.html)**

## Quick links

- [Newton platform](https://momentumglobal.github.io/newton/)
- [SharePoint site](https://talentpoint.sharepoint.com/sites/SolutionsHubReporting)
