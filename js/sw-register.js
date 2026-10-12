// js/sw-register.js - moved out of mobile.html (N-303, SEC-12b step 3). Code unchanged.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('SW registration failed:', e);
    });
  });
}