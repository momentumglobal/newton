// js/actions.js — delegated UI actions (N-301, SEC-12b step 1 of 3).
//
// Replaces inline on*= handler attributes, which force 'unsafe-inline' in the
// CSP script-src (N-292). Markup carries DATA, never code:
//
//   data-act="name"                         click, no arguments
//   data-act='["name", 12, "text"]'         click, arguments as a JSON array
//   data-act-change="name"                  any other event type in ACT_EVENTS
//   data-act="name.prevent.stop"            modifiers (see _ACT_MODIFIERS)
//
// Templates never write these attributes by hand — they call the builders,
// which return the WHOLE attribute (leading space, own double quotes) with the
// value escaped by escHtml(), so it is safe inside any surrounding quote style
// and needs no escJsAttr:
//
//   `<button class="btn"${act('saveThing', item.id, item.Title)}>Save</button>`
//   `<select${actOn('change', 'setFilter', ACT_VALUE)}>…</select>`
//
// Each file registers the actions it owns, at top level, as an object literal
// written directly inside the call (tests/lint-inline-handlers.js reads the
// keys from the source text). Lookup is registry-only — never window[name] —
// so injected markup can reach UI actions but no other global.
//
// The encoder (act/actOn) lives here rather than in utils.js on purpose: it
// writes the exact format _actDispatch() reads, and the two must change
// together. Nothing in this file touches the network or CONFIG. Loaded on every
// app page straight after config.js, so its document listeners are the first
// ones registered — the .stop modifier depends on that.

// Event types the dispatcher listens for. Extending it is one entry here plus
// an assertion. 'error' is listened for in the capture phase (it does not
// bubble — <img> load failures).
const ACT_EVENTS = ['click', 'dblclick', 'change', 'input', 'submit', 'keydown', 'keyup', 'mousedown', 'mouseup', 'error'];
const _ACT_CAPTURE = { error: true };

// .prevent → event.preventDefault() before the action (was: return false;)
// .stop    → stop propagation and end the walk     (was: event.stopPropagation())
// .self    → run only when the event target is this element (was: if (event.target === this))
const _ACT_MODIFIERS = ['prevent', 'stop', 'self'];

// Placeholders: runtime values an inline handler used to read from this/event.
// An argument that is an object whose ONLY key is $ is a placeholder; any other
// object is passed through as data. Top-level arguments only.
const ACT_EL      = Object.freeze({ $: 'el' });
const ACT_EVENT   = Object.freeze({ $: 'event' });
const ACT_VALUE   = Object.freeze({ $: 'value' });
const ACT_CHECKED = Object.freeze({ $: 'checked' });
const ACT_HTML    = Object.freeze({ $: 'html' });
const _ACT_PLACEHOLDERS = {
  el:      function (el, evt) { return el; },
  event:   function (el, evt) { return evt; },
  value:   function (el) { return el.value; },
  checked: function (el) { return el.checked; },
  html:    function (el) { return el.innerHTML; },
};

const _ACT_NAME_RE = /^[A-Za-z_$][\w$]*$/;
const _ACT_REGISTRY = Object.create(null);
const _actHas = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// ── Registry ────────────────────────────────────────────────────

// Validates the whole map before adding any of it. A duplicate name throws at
// load time (diag-buffer → Diagnostics) rather than silently shadowing.
function _actRegisterInto(registry, map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new Error('registerActions: expected an object of { name: function }');
  }
  const names = Object.keys(map);
  names.forEach(name => {
    if (!_ACT_NAME_RE.test(name)) throw new Error(`registerActions: invalid action name "${name}"`);
    if (typeof map[name] !== 'function') throw new Error(`registerActions: action "${name}" is not a function`);
    if (_actHas(registry, name)) throw new Error(`registerActions: action "${name}" is already registered`);
  });
  names.forEach(name => { registry[name] = map[name]; });
}

function registerActions(map) {
  _actRegisterInto(_ACT_REGISTRY, map);
}

// ── Encoder ─────────────────────────────────────────────────────

function _actAttrName(type) {
  return type === 'click' ? 'data-act' : 'data-act-' + type;
}

// spec = "name" or "name.mod.mod" → { name, mods }. Throws on a bad name or an
// unknown modifier, both when building and when dispatching.
function _actParseSpec(spec) {
  if (typeof spec !== 'string') throw new Error('action spec must be a string');
  const parts = spec.split('.');
  const name = parts[0];
  if (!_ACT_NAME_RE.test(name)) throw new Error(`invalid action name "${name}"`);
  const mods = {};
  parts.slice(1).forEach(m => {
    if (_ACT_MODIFIERS.indexOf(m) < 0) throw new Error(`unknown modifier ".${m}" on action "${name}"`);
    mods[m] = true;
  });
  return { name: name, mods: mods };
}

// Arguments must survive JSON unchanged: undefined would become null, NaN and
// Infinity would become null, functions would vanish.
function _actCheckArg(v, path) {
  const t = typeof v;
  if (v === null || t === 'string' || t === 'boolean') return;
  if (t === 'number') {
    if (!isFinite(v)) throw new Error(`act: argument ${path} is ${v} — not JSON-safe`);
    return;
  }
  if (t === 'object') {
    Object.keys(v).forEach(k => _actCheckArg(v[k], path + '.' + k));
    return;
  }
  throw new Error(`act: argument ${path} is ${t} — not JSON-safe`);
}

function _actValue(spec, args) {
  _actParseSpec(spec);
  if (!args.length) return spec;
  args.forEach((a, i) => _actCheckArg(a, '#' + (i + 1)));
  return JSON.stringify([spec].concat(args));
}

// Click action attribute: ` data-act="…"` (leading space included).
function act(spec, ...args) {
  return ` data-act="${escHtml(_actValue(spec, args))}"`;
}

// Any event type in ACT_EVENTS: ` data-act-<type>="…"` (click → data-act).
function actOn(type, spec, ...args) {
  if (ACT_EVENTS.indexOf(type) < 0) {
    throw new Error(`actOn: event type "${type}" is not in ACT_EVENTS (js/actions.js)`);
  }
  return ` ${_actAttrName(type)}="${escHtml(_actValue(spec, args))}"`;
}

// ── Dispatcher ──────────────────────────────────────────────────

function _actParseValue(raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (v.charAt(0) !== '[') return { spec: v, args: [] };
  const arr = JSON.parse(v);
  if (!Array.isArray(arr) || typeof arr[0] !== 'string') throw new Error('action value must be ["name", ...args]');
  return { spec: arr[0], args: arr.slice(1) };
}

function _actResolveArg(arg, el, evt) {
  if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
    const keys = Object.keys(arg);
    if (keys.length === 1 && keys[0] === '$') {
      if (!_actHas(_ACT_PLACEHOLDERS, arg.$)) throw new Error(`unknown placeholder "${arg.$}"`);
      return _ACT_PLACEHOLDERS[arg.$](el, evt);
    }
  }
  return arg;
}

// Surfaces an error without stopping the walk — same isolation as separate
// inline handlers. reportError fires the window 'error' event that
// diag-buffer.js / diagnostics.js already capture. Messages name the action and
// attribute only, never argument values (they can be candidate data).
function _actDefaultReport(err) {
  if (typeof window !== 'undefined' && typeof window.reportError === 'function') window.reportError(err);
  else if (typeof console !== 'undefined') console.error(err);
}

// Runs one element's action. Returns true when the walk must end (.stop).
function _actRunOne(el, attr, evt, registry, report) {
  let parsed, args;
  try {
    const v = _actParseValue(el.getAttribute(attr));
    parsed = _actParseSpec(v.spec);
    args = v.args;
  } catch (err) {
    report(new Error(`Bad ${attr} value on <${String(el.tagName || '?').toLowerCase()}>: ${err.message}`));
    return false;
  }
  const mods = parsed.mods;
  if (mods.self && evt.target !== el) return false;
  if (mods.prevent && typeof evt.preventDefault === 'function') evt.preventDefault();
  const fn = _actHas(registry, parsed.name) ? registry[parsed.name] : null;
  if (!fn) {
    report(new Error(`Unknown action "${parsed.name}" (${attr}) — register it with registerActions`));
  } else {
    try {
      fn.apply(undefined, args.map(a => _actResolveArg(a, el, evt)));
    } catch (err) {
      report(err);
    }
  }
  if (mods.stop) {
    if (typeof evt.stopPropagation === 'function') evt.stopPropagation();
    if (typeof evt.stopImmediatePropagation === 'function') evt.stopImmediatePropagation();
    return true;
  }
  return false;
}

// Walks from the event target up to the root, child → parent (the order inline
// handlers fire in), running every element that carries this event's attribute.
function _actDispatch(evt, registry, report) {
  report = report || _actDefaultReport;
  const attr = _actAttrName(evt.type);
  let el = evt.target;
  if (el && el.nodeType !== 1) el = el.parentElement || null;   // text node
  while (el && el.nodeType === 1) {
    if (el.hasAttribute(attr) && _actRunOne(el, attr, evt, registry, report)) return;
    el = el.parentElement;
  }
}

function _actInstall(doc, registry, report) {
  ACT_EVENTS.forEach(type => {
    doc.addEventListener(type, evt => _actDispatch(evt, registry, report), !!_ACT_CAPTURE[type]);
  });
}

// Built-in: lets markup cancel a default with no other effect, e.g. a rich-text
// toolbar button keeping editor focus — actOn('mousedown', 'noop.prevent').
registerActions({
  noop: function () {},
});

// Install once, in a browser only — tests/run.js loads this file into a bare
// Node vm with no DOM (same guard as utils.js N-216).
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  _actInstall(document, _ACT_REGISTRY);
}