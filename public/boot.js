// Loading screen progress. Kept as a separate file: Reddit's CSP blocks inline scripts.
(function () {
  var root = document.getElementById('boot');
  if (!root) return;
  var fill = root.querySelector('.bl__fill');
  var p = 6;
  var creep = setInterval(function () {
    if (p < 60) set(p + 2);
  }, 150);
  function set(v) {
    p = Math.max(p, Math.min(100, v));
    if (fill) fill.style.width = p + '%';
  }
  set(6);
  window.__boot = {
    to: function (v) { set(v); },
    done: function () {
      clearInterval(creep);
      set(100);
      setTimeout(function () {
        root.classList.add('is-done');
        setTimeout(function () { root.remove(); }, 450);
      }, 250);
    }
  };
})();
