// js/readme-page.js - moved out of Readme.html (N-303, SEC-12b step 3). Code unchanged except
// the registerActions call (now top level, no DOMContentLoaded wrapper).
  const allSections = document.querySelectorAll('.section');
  const allLinks    = document.querySelectorAll('.sidebar-link');

  function show(id) {
    allSections.forEach(s => s.style.display = 'none');
    allLinks.forEach(l => l.classList.remove('active'));
    const sec  = document.getElementById('sec-' + id);
    const link = document.querySelector(`.sidebar-link[data-show="${id}"]`);
    if (sec)  sec.style.display  = 'block';
    if (link) link.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  show('overview');

  // N-303: loads (deferred) after js/actions.js, so register at top level.
  registerActions({ show });