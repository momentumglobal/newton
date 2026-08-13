// js/theme-init.js — sets data-theme on <html> before first paint.
// Deliberately standalone: utils.js loads at the bottom of <body>, too late to
// avoid a flash of the wrong theme. Must be loaded first in <head>, without
// defer/async, on every page that links css/style.css.
// Reads the SAME localStorage key as utils.js's THEME_KEY ('newton_theme') —
// if that constant name ever changes, update the literal string here too.
(function () {
  try {
    var stored = localStorage.getItem('newton_theme');
    var dark = stored ? stored === 'dark'
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');

    // Live-follow the OS setting only while no explicit choice is stored.
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (localStorage.getItem('newton_theme')) return; // explicit choice wins
        if (e.matches) {
          document.documentElement.setAttribute('data-theme', 'dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
        }
        if (typeof updateThemeToggleIcon === 'function') updateThemeToggleIcon();
      });
    }
  } catch (e) {}
})();
