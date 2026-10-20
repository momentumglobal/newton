// tests/assertions.js — shared core of the Newton test harness (N-353).
// Declares ASSERTIONS and the helpers every assertion uses. The assertions themselves live in
// tests/assert-<domain>.js, loaded after this file, each pushing into ASSERTIONS. Pure: no DOM,
// no console. Each assertion's fn() throws on failure (or calls _skip() when it can't meaningfully
// run in the current environment — see the coeWeekIndex assertion) so the same list runs
// unmodified in both index.html (browser) and run.js (Node).
// History: N-095 seeded the file (revenue/role/LCI cases); N-096 added date/week coverage;
// N-097 the LCI calc layer; N-098 the analytics layer; N-353 split it by domain.

function _deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => _deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => _deepEqual(a[k], b[k]));
  }
  return false;
}

function _assertEqual(actual, expected, label) {
  if (!_deepEqual(actual, expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Throws a marked "skip" — for an assertion that can't meaningfully run in
// the current environment (see coeWeekIndex below). A plain marker
// property, not a custom Error subclass: N-087's QA run hit a cross-realm
// `instanceof` false-negative testing a Date built in one vm context
// against code loaded into another — a subclass check would hit the same
// trap between this file's realm and whichever runner reads the result.
function _skip(message) {
  const e = new Error(message);
  e.__skip = true;
  throw e;
}

var ASSERTIONS = [];

// N-301 test helpers — stub elements/events for js/actions.js (no DOM in the vm).
function _actUnescapeForTest(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function _actTestRig() {
  const t = { calls: [], errors: [], current: null };
  t.registry = Object.create(null);
  _actRegisterInto(t.registry, {
    rec: function () { const a = Array.prototype.slice.call(arguments); t.calls.push({ args: a }); if (t.current) t.current.log.push('rec'); },
    boom: function () { throw new Error('kaboom'); },
  });
  t.report = function (e) { t.errors.push(e); };
  t.reset = function () { t.calls = []; t.errors = []; };
  t.el = function (attrs, parent, props) {
    const el = { nodeType: 1, tagName: 'DIV', parentElement: parent || null };
    el.hasAttribute = n => Object.prototype.hasOwnProperty.call(attrs, n);
    el.getAttribute = n => (Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null);
    return Object.assign(el, props || {});
  };
  t.evt = function (type, target) {
    const e = { type: type, target: target, log: [] };
    e.preventDefault = () => e.log.push('preventDefault');
    e.stopPropagation = () => e.log.push('stopPropagation');
    e.stopImmediatePropagation = () => e.log.push('stopImmediatePropagation');
    t.current = e;
    return e;
  };
  return t;
}
