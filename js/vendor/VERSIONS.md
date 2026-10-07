# Vendored third-party libraries (N-289, SEC-9)

Every third-party script Newton runs is served from this folder, not from a public CDN. Files are **unmodified upstream bytes** taken from the pinned npm tarball (`npm pack <package>@<version>`); the filename carries the version. The `sha384` column is the SHA-384 of the file in the `sha384-<base64>` form `integrity=` uses, and `tests/lint-vendor.js` fails CI if a file here has no row, a different hash, or a version that disagrees with its filename.

| Package | Version | Published file | Upstream source file (npm tarball) | URL it replaced | Licence | Bytes | sha384 |
|---|---|---|---|---|---|---|---|
| lucide | 1.47.0 | `lucide-1.47.0.min.js` | `dist/umd/lucide.min.js` | https://unpkg.com/lucide@1.47.0/dist/umd/lucide.min.js | ISC | 442,433 | `sha384-v15JX+vZHMR3T6LQR9N6e6wIKrKOdNTbdj8j+e5irqq3L9gCauJz2vGlUzomWyUp` |
| @azure/msal-browser | 5.24.0 | `msal-browser-5.24.0.min.js` | `lib/msal-browser.min.js` | none (N-290 upgrade; 2.38.3 replaced https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js) | MIT | 288,797 | `sha384-H7sosGYmNJhd2Ut1g7bc3d4wVKnPaePDXJnsauSDVvuuYKcAbuJ0RU0A9KOd8f0X` |
| @azure/msal-browser | 5.24.0 | `msal-redirect-bridge-5.24.0.min.js` | `lib/redirect-bridge/msal-redirect-bridge.min.js` | none (new in v5; loaded only by `redirect.html`, N-290) | MIT | 6,656 | `sha384-s6kFQAdFfnyFUGdfle1UDGUpWvbT1MJ3mONbU2CZiGmOtSDR5PYrLQ6q8l2eZY5H` |
| sortablejs | 1.15.2 | `sortablejs-1.15.2.min.js` | `Sortable.min.js` | https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js | MIT | 44,581 | `sha384-BSxuMLxX+FCbTdYec3TbXlnMGEEM2QXTFdtDaveen71o+jswm2J36+xFqp8k4VHM` |
| exceljs | 4.4.0 | `exceljs-4.4.0.min.js` | `dist/exceljs.min.js` | https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js | MIT | 947,702 | `sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz` |
| pptxgenjs | 4.0.1 | `pptxgenjs-4.0.1.bundle.js` | `dist/pptxgen.bundle.js` | https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js | MIT | 460,889 | `sha384-qb0Xhi7LLYpvW1HCK6oMrmDLSY9sy7vwm6ZlV6KjtrlL9yg30+YN4neTwnmX+Kp8` |
| chart.js | 4.4.1 | `chart.js-4.4.1.umd.js` | `dist/chart.umd.js` | https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js | MIT | 205,125 | `sha384-dug+JxfBvklEQdJ4AYuBBAIScUz0bVN73xpy273gcAwHjb3qI0fXmuYNaNfdyYJG` |

## Upgrading a library

1. `npm pack <package>@<new version>` and extract the source file named above.
2. Copy it into this folder under the new versioned name (never edit the bytes).
3. Update its row in this table (version, filename, bytes, `sha384-...`), its pin in the root `package.json`, and its licence text in `LICENSES.md` if it changed.
4. Update the reference: the `<script src>` in each page that loads it, or `CONFIG.LCI.EXCEL.SRC` / `CONFIG.LCI.PPTX.SRC` / `CONFIG.SURVEY.CHARTJS_SRC` in `js/config.js`.
5. Delete the old file, run `node tests/run.js`, then smoke-test the pages that use the library.

## Notes

- **MSAL is two files from one package (N-290).** `msal-browser-*.min.js` is the library every page loads. `msal-redirect-bridge-*.min.js` is the v5 redirect bridge, loaded only by `redirect.html` (the redirect URI for silent, hidden-iframe token renewal). Upgrade both together, from the same tarball.
- **No CDN fallback, by design.** A fallback to a public CDN would reintroduce the supply-chain exposure this folder removes and would not satisfy a `script-src 'self'` CSP (N-292).
- **Chart.js provenance.** The five other files are what jsDelivr/unpkg serve (they serve npm package files verbatim). Chart.js was previously loaded from cdnjs as `chart.umd.min.js`, a file cdnjs generates; npm 4.4.1 ships `dist/chart.umd.js` (already minified). Same version and licence, not guaranteed byte-identical to the old cdnjs file.
- **Source maps.** `lucide`, `exceljs` and `pptxgenjs` end with a `//# sourceMappingURL=` comment. The `.map` files are not vendored (bytes must stay unmodified), so browser DevTools may log a 404 for them while open. It has no effect on the page.
- **Dependabot.** The root `package.json` pins the same versions so GitHub Dependabot alerts can flag advisories. It is not used by the build or CI; keep it in step with this table.
