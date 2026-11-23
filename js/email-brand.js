// js/email-brand.js — the email-safe Momentum brand kit for emails Newton builds (N-517, ONB-D97)
//
// CONFIG.EMAIL_BRAND plus pure builders that turn already-escaped content into Outlook-safe markup: one 600px table, navy header with
// the hosted white logo, an optional eyebrow + headline, the caller's sections, and a navy footer. Table layout and inline CSS only —
// Outlook desktop (Word engine) and Outlook web ignore classes, <style> blocks and most modern CSS. The first user is the onboarding
// welcome email (onboarding-welcome.js); a later email feature loads this file on its own shell and calls the same builders.
// Pure: no DOM, no Graph, no network. Callers escape what they pass in (sections are trusted html); the kit escapes only what it
// interpolates itself (eyebrow, headline, footer, logo alt / src). my-momentum.html only for now, straight before onboarding-welcome.js.

// CSS hex, deliberately: an email client can't read style.css custom properties. This is the documented exception to "no hex in JS",
// as CONFIG.LCI.EXCEL / PPTX.COLOURS (lci-config.js). `navy` must stay in step with --c-brand in style.css (pinned by
// assert-onboarding-team.js); `card` is the light card of the Power Automate supplier-invoice email. No rgba(): Outlook desktop drops it.
CONFIG.EMAIL_BRAND = {
  WIDTH: 600,
  FONT: 'Arial, Helvetica, sans-serif',
  LOGO_BASE: 'https://momentumglobal.github.io/newton/',   // hosted, absolute: a pasted email has no Newton origin
  LOGO_PATH: 'momentum-symbol-and-name-global-white.png',
  LOGO_HEIGHT: 34,
  LOGO_WIDTH: 169,                                         // the PNG is 1200 x 241; Outlook needs both dimensions
  LOGO_ALT: 'Momentum Global',
  COLOURS: {
    navy:      '#0A0B44',
    navyMuted: '#C7CBDE',
    white:     '#FFFFFF',
    card:      '#F0F2FC',
    text:      '#444444',
  },
};

// Inline declarations by name, built from CONFIG.EMAIL_BRAND on each call (nothing is read at load time). font-family is repeated on
// every text element because Outlook doesn't inherit it from the table; spacing is padding on <td> and margin on <p> only.
function _ebStyles() {
  const B = CONFIG.EMAIL_BRAND, C = B.COLOURS, f = 'font-family:' + B.FONT + ';';
  return {
    table:     'width:' + B.WIDTH + 'px;max-width:' + B.WIDTH + 'px;background-color:' + C.white + ';border-collapse:collapse;' + f,
    header:    'background-color:' + C.navy + ';padding:28px 32px;',
    logo:      'display:block;height:' + B.LOGO_HEIGHT + 'px;width:' + B.LOGO_WIDTH + 'px;border:0;outline:none;text-decoration:none;',
    intro:     'padding:28px 32px 4px;',
    eyebrow:   'margin:0;' + f + 'font-size:13px;line-height:1.4;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:' + C.navy + ';',
    headline:  'margin:8px 0 0;' + f + 'font-size:24px;line-height:1.25;font-weight:bold;color:' + C.navy + ';',
    section:   'padding:16px 32px 0;',
    p:         'margin:0;' + f + 'font-size:15px;line-height:1.6;color:' + C.text + ';',
    title:     'margin:0;' + f + 'font-size:15px;line-height:1.6;font-weight:bold;color:' + C.navy + ';',
    cardTable: 'width:100%;background-color:' + C.card + ';border-collapse:collapse;',
    cardCell:  'padding:16px 20px;background-color:' + C.card + ';',
    cardTitle: 'margin:0 0 6px;' + f + 'font-size:15px;line-height:1.5;font-weight:bold;color:' + C.navy + ';',
    item:      'margin:0;' + f + 'font-size:15px;line-height:1.6;color:' + C.text + ';',
    spacer:    'padding:0;height:28px;line-height:28px;font-size:1px;',
    footer:    'background-color:' + C.navy + ';padding:18px 32px;text-align:center;' + f + 'font-size:12px;line-height:1.4;color:' + C.navyMuted + ';',
    docBody:   'margin:0;padding:16px;background-color:' + C.white + ';',
  };
}

// The style attribute for one named declaration set (leading space included). The kit's only inline-style site, so the
// lint-inline-styles ratchet for this file stays at 1 however many elements are styled.
function _ebStyle(name) {
  return ' style="' + (_ebStyles()[name] || '') + '"';
}

// The text kinds a caller can use with emailBrandText: body paragraph, section title, card title, list item.
const EMAIL_BRAND_TEXT_KINDS = ['p', 'title', 'cardTitle', 'item'];

// One styled paragraph. html must already be escaped. An unknown kind falls back to a body paragraph.
function emailBrandText(html, kind) {
  return `<p${_ebStyle(EMAIL_BRAND_TEXT_KINDS.includes(kind) ? kind : 'p')}>${html}</p>`;
}

// One light card (full width of the email body) around already-escaped html.
function emailBrandCard(html) {
  const C = CONFIG.EMAIL_BRAND.COLOURS;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}"${_ebStyle('cardTable')}>`
    + `<tr><td bgcolor="${C.card}"${_ebStyle('cardCell')}>${html}</td></tr></table>`;
}

// The email fragment: what goes on the clipboard and is pasted into a mail body. sections = html strings (already escaped), one table row
// each, in order; empty entries are skipped here, in JS, before any markup is built. (The Power Automate rule "never inject <tr> rows with
// a conditional expression" is about Outlook-side expressions; assembling the rows in JS before the email exists is not that.)
function emailBrandHtml({ eyebrow = '', headline = '', sections = [], footer = '' } = {}) {
  const B = CONFIG.EMAIL_BRAND, C = B.COLOURS;
  const head = (eyebrow ? `<p${_ebStyle('eyebrow')}>${escHtml(eyebrow)}</p>` : '')
    + (headline ? `<p${_ebStyle('headline')}>${escHtml(headline)}</p>` : '');
  const rows = (sections || []).filter(Boolean).map(h => `<tr><td${_ebStyle('section')}>${h}</td></tr>`).join('');
  return `<table role="presentation" width="${Number(B.WIDTH)}" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.white}"${_ebStyle('table')}>`
    + `<tr><td bgcolor="${C.navy}"${_ebStyle('header')}><img src="${escHtml(B.LOGO_BASE + B.LOGO_PATH)}" alt="${escHtml(B.LOGO_ALT)}" `
    + `width="${Number(B.LOGO_WIDTH)}" height="${Number(B.LOGO_HEIGHT)}" border="0"${_ebStyle('logo')}></td></tr>`
    + (head ? `<tr><td${_ebStyle('intro')}>${head}</td></tr>` : '')
    + rows
    + `<tr><td${_ebStyle('spacer')}>&nbsp;</td></tr>`
    + `<tr><td bgcolor="${C.navy}"${_ebStyle('footer')}>${escHtml(footer)}</td></tr>`
    + '</table>';
}

// A whole document around a fragment, for a preview frame's srcdoc only. Never the clipboard: a pasted <html><body> would drag the
// body padding into the mail composer.
function emailBrandDocument(fragment) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body${_ebStyle('docBody')}>${fragment || ''}</body></html>`;
}
