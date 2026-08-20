// js/guide-search.js — self-initialising search bar for the static User
// Guide pages (user-guide.html, people-user-guide.html, sales-user-guide.html,
// market-reporting-user-guide.html). N-163.
//
// These 4 pages are standalone static docs, not Newton SPA modules — no
// SharePoint data, no api.js/config.js/nav-core.js dependency, not part of
// the app's script load order. This file works purely off the DOM shape
// every guide already shares (.guide-nav, .guide-content, .guide-section,
// .faq-item) — no per-page config or hand-listed section IDs.

(() => {
  const HIT_CLASS = 'guide-search-hit';
  const HIDDEN_CLASS = 'guide-search-hidden';
  const STYLE_ID = 'guide-search-style';
  const HIGHLIGHT_SELECTOR = 'h2, h3, p, .tip, .faq-q, .faq-a';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .guide-search-box { margin-bottom: 14px; }
      .guide-search-box input[type="search"] {
        width: 100%; padding: 8px 10px; font-family: inherit; font-size: 13px;
        border: 1px solid #ccc; border-radius: 4px; background: #fff; color: #1a1a2e;
      }
      .guide-search-box input[type="search"]:focus { outline: 2px solid #0A0B44; outline-offset: 1px; }
      .guide-search-count { font-size: 11px; color: #888; margin-top: 4px; padding: 0 2px; min-height: 14px; }
      .${HIT_CLASS} { background: #fff3b0; color: inherit; border-radius: 2px; }
      .guide-search-empty { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 28px 32px; color: #444; font-size: 14px; }
      .${HIDDEN_CLASS} { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  function buildSearchBox(nav) {
    const wrap = document.createElement('div');
    wrap.className = 'guide-search-box';
    wrap.innerHTML = `
      <input type="search" aria-label="Search this guide" placeholder="Search this guide…">
      <div class="guide-search-count" aria-live="polite"></div>
    `;
    nav.insertBefore(wrap, nav.firstChild);
    return wrap;
  }

  function textOf(el) {
    return (el.textContent || '').toLowerCase();
  }

  // Unwrap every <mark class="guide-search-hit"> back to plain text.
  function clearHighlights(root) {
    root.querySelectorAll(`mark.${HIT_CLASS}`).forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
  }

  // Wrap every case-insensitive match of `query` inside `el`'s text nodes.
  // Text-node-only replacement — never touches existing markup (<strong>,
  // <em>, links, role badges) and never nests marks.
  function highlightIn(el, query) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.toLowerCase().includes(query)) nodes.push(n);
    }
    nodes.forEach((node) => {
      const text = node.nodeValue;
      const lower = text.toLowerCase();
      const frag = document.createDocumentFragment();
      let start = 0;
      let idx = lower.indexOf(query, start);
      while (idx !== -1) {
        if (idx > start) frag.appendChild(document.createTextNode(text.slice(start, idx)));
        const mark = document.createElement('mark');
        mark.className = HIT_CLASS;
        mark.textContent = text.slice(idx, idx + query.length);
        frag.appendChild(mark);
        start = idx + query.length;
        idx = lower.indexOf(query, start);
      }
      if (start < text.length) frag.appendChild(document.createTextNode(text.slice(start)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  // Highlight a visible section, skipping anything inside a hidden
  // .faq-item (so a still-visible FAQ section doesn't highlight text
  // belonging to its hidden sibling items).
  function highlightSection(section, query) {
    section.querySelectorAll(HIGHLIGHT_SELECTOR).forEach((target) => {
      if (target.closest(`.${HIDDEN_CLASS}`)) return;
      highlightIn(target, query);
    });
  }

  function resetAll(content, nav, emptyMsg) {
    clearHighlights(content);
    content.querySelectorAll('.guide-section, .faq-item').forEach((el) => el.classList.remove(HIDDEN_CLASS));
    nav.querySelectorAll('li').forEach((li) => li.classList.remove(HIDDEN_CLASS));
    emptyMsg.classList.add(HIDDEN_CLASS);
  }

  function init() {
    const nav = document.querySelector('.guide-nav');
    const content = document.querySelector('.guide-content');
    if (!nav || !content) return;

    injectStyle();
    const box = buildSearchBox(nav);
    const input = box.querySelector('input');
    const count = box.querySelector('.guide-search-count');

    const emptyMsg = document.createElement('div');
    emptyMsg.className = `guide-section guide-search-empty ${HIDDEN_CLASS}`;
    content.appendChild(emptyMsg);

    const navRows = nav.querySelectorAll('ul > li');
    // Sections that pre-date the search box itself (the empty-results
    // message we just appended is a .guide-section too, but never a target).
    const sections = () => Array.from(content.querySelectorAll('.guide-section')).filter((s) => s !== emptyMsg);

    function applyFilter(raw) {
      const query = raw.trim().toLowerCase();
      resetAll(content, nav, emptyMsg);
      if (!query) {
        count.textContent = '';
        return;
      }

      let visibleCount = 0;

      sections().forEach((section) => {
        const faqItems = section.querySelectorAll('.faq-item');
        if (faqItems.length) {
          let anyVisible = false;
          faqItems.forEach((item) => {
            if (textOf(item).includes(query)) {
              anyVisible = true;
            } else {
              item.classList.add(HIDDEN_CLASS);
            }
          });
          if (anyVisible) visibleCount++;
          else section.classList.add(HIDDEN_CLASS);
        } else if (textOf(section).includes(query)) {
          visibleCount++;
        } else {
          section.classList.add(HIDDEN_CLASS);
        }
      });

      sections().forEach((section) => {
        if (!section.classList.contains(HIDDEN_CLASS)) highlightSection(section, query);
      });

      // Sync the sidebar: a topic link hides if its target section is
      // hidden; a group label hides if every link under it (down to the
      // next label) is hidden. The "← Back to X" link and spacer rows
      // have no #href / no label and are left alone.
      let currentLabelLi = null;
      let groupHasVisible = false;
      const closeGroup = () => {
        if (currentLabelLi && !groupHasVisible) currentLabelLi.classList.add(HIDDEN_CLASS);
      };
      navRows.forEach((li) => {
        const label = li.querySelector('.nav-section-label');
        if (label) {
          closeGroup();
          currentLabelLi = li;
          groupHasVisible = false;
          return;
        }
        const link = li.querySelector('a[href^="#"]');
        if (!link) return;
        const target = document.getElementById(link.getAttribute('href').slice(1));
        if (!target) return;
        if (target.classList.contains(HIDDEN_CLASS)) li.classList.add(HIDDEN_CLASS);
        else groupHasVisible = true;
      });
      closeGroup();

      if (visibleCount === 0) {
        emptyMsg.textContent = `No results for “${raw.trim()}”`;
        emptyMsg.classList.remove(HIDDEN_CLASS);
        count.textContent = '';
      } else {
        count.textContent = `${visibleCount} topic${visibleCount === 1 ? '' : 's'} match`;
      }
    }

    input.addEventListener('input', () => applyFilter(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      input.value = '';
      applyFilter('');
      input.blur();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
