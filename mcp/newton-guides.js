// mcp/newton-guides.js - Newton for Claude: guide Q&A tools (N-547, AMCP-3; specs/N-545.md AMCP-A11).
//
// search_guides + read_guide_section answer "how do I..." from the five user guides and
// README.md. Served from GitHub Pages and loaded into the MCP server's vm context straight after
// mcp/newton-tools.js (CONFIG.MCP.scripts order); it pushes its two entries onto MCP_TOOLS. No
// Newton page loads it. tests/run.js loads it too (declarations + MCP_TOOLS only).
//
// The guides are fetched live through the bundle's fetchGuide(name) global (N-546: GET only, six
// pinned names, 2 MB cap, no caching). The server has no DOM, so this file parses the shared guide
// shape (.guide-section, h2 / h3, .faq-item - the one js/guide-search.js relies on) with plain
// string scans, and caches the parsed guides for CONFIG.MCP.guideCacheTtlMs (1 hour).
//
// Read only. Guides hold no sensitive data, so every allowed role may use both tools; no
// SharePoint list is read, no mcpScope() is needed, and no Newton row is touched. Rules
// (tests/lint-mcp.js lintMcpGuideTools): the lintMcpTools rules, plus fetchGuide may only be
// called with a name already checked against MCP_GUIDE_FILES.
//
// The lint stripper can't read a regex literal containing a quote or backtick: regexes that
// need a double quote are built with new RegExp('...') instead.

// The six names fetchGuide accepts. Must equal GUIDE_FILES in mcp/bootstrap/loader.js (tested).
var MCP_GUIDE_FILES = ['user-guide.html', 'people-user-guide.html', 'sales-user-guide.html',
  'market-reporting-user-guide.html', 'my-momentum-user-guide.html', 'README.md'];
var MCP_GUIDE_README = 'README.md';
var MCP_GUIDE_README_SKIP = ['changelog'];   // README sections left out of search (per-version noise)
var MCP_GUIDE_READ_CAP = 6000;        // chars of section text one read_guide_section call returns
var MCP_GUIDE_SNIPPET = 300;          // chars of a search snippet
var MCP_GUIDE_LIMIT_DEFAULT = 5;
var MCP_GUIDE_LIMIT_MAX = 8;
var MCP_GUIDE_PER_SECTION = 2;        // most hits one section may take in a search
var MCP_GUIDE_STOPWORDS = ['the', 'and', 'for', 'how', 'do', 'does', 'did', 'can', 'could', 'should', 'would',
  'what', 'when', 'where', 'why', 'which', 'who', 'with', 'from', 'that', 'this', 'there', 'are', 'was', 'were',
  'been', 'being', 'have', 'has', 'had', 'you', 'your', 'our', 'its', 'not', 'but', 'any', 'all', 'into', 'about',
  'newton', 'please', 'tell', 'show', 'need', 'want', 'get', 'use', 'using',
  'in', 'on', 'of', 'to', 'is', 'it', 'my', 'me', 'an', 'as', 'at', 'be', 'by', 'or', 'so', 'up', 'we', 'if', 'no', 'am', 'us'];
var MCP_GUIDE_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: String.fromCharCode(34), apos: String.fromCharCode(39),
  nbsp: ' ', middot: '·', mdash: '—', ndash: '–', hellip: '…', rarr: '→', larr: '←',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', bull: '•' };

// Parsed guides, per file: { parsed, at, promise? }. Lives for the MCP process; a failed fetch is never stored.
var MCP_GUIDE_CACHE = {};

// Test seam: the clock. Tests replace this global.
function mcpGuideNow() {
  return Date.now();
}

// ── Text helpers ──────────────────────────────────────────────────────

function mcpGuideDecode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function (whole, e) {
    if (e.charAt(0) === '#') {
      var n = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 1114112 ? String.fromCodePoint(n) : whole;
    }
    var v = MCP_GUIDE_ENTITIES[e.toLowerCase()];
    return v === undefined ? whole : v;
  });
}

// HTML fragment -> plain text. Block ends become newlines, each <li> starts a "- " line, table cells " | ".
function mcpGuideHtmlToText(html) {
  var s = String(html || '');
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<\/(td|th)>/gi, ' | ');
  s = s.replace(/<\/(p|div|h[1-6]|tr|ul|ol|table|pre|blockquote)>|<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]*>/g, '');
  s = mcpGuideDecode(s);
  var lines = s.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').replace(/\s*\|\s*$/, '').trim(); });
  var out = [];
  lines.forEach(function (l) {
    if (l === '' && (out.length === 0 || out[out.length - 1] === '')) return;
    out.push(l);
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

function mcpGuideOneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

// ── Parsers (pure, no DOM) ────────────────────────────────────────────

// A chunk is the unit of search and of read_guide_section's subsection: a FAQ item, an h3 block,
// or a whole section with neither. { heading: string|null, text }.
function mcpGuideSectionFromHtml(id, body) {
  var h2 = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(body);
  var title = h2 ? mcpGuideOneLine(mcpGuideHtmlToText(h2[1])) : id;
  var rest = h2 ? body.slice(h2.index + h2[0].length) : body;
  var chunks = [];
  var faqRe = new RegExp('<div\\b[^>]*class="(?:[^"]* )?faq-item(?: [^"]*)?"[^>]*>', 'gi');
  var qRe = new RegExp('<div\\b[^>]*class="(?:[^"]* )?faq-q(?: [^"]*)?"[^>]*>([\\s\\S]*?)</div>', 'i');
  var marks = [];
  var m;
  while ((m = faqRe.exec(rest)) !== null) marks.push(m.index);
  if (marks.length) {
    var intro = mcpGuideHtmlToText(rest.slice(0, marks[0]));
    if (intro) chunks.push({ heading: null, text: intro });
    marks.forEach(function (start, i) {
      var piece = rest.slice(start, i + 1 < marks.length ? marks[i + 1] : rest.length);
      var q = qRe.exec(piece);
      var heading = q ? mcpGuideOneLine(mcpGuideHtmlToText(q[1])) : null;
      var text = mcpGuideHtmlToText(q ? piece.replace(q[0], ' ') : piece);
      if (heading || text) chunks.push({ heading: heading, text: text });
    });
  } else {
    var h3Re = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi;
    var heads = [];
    while ((m = h3Re.exec(rest)) !== null) heads.push({ at: m.index, end: m.index + m[0].length, heading: mcpGuideOneLine(mcpGuideHtmlToText(m[1])) });
    if (heads.length) {
      var lead = mcpGuideHtmlToText(rest.slice(0, heads[0].at));
      if (lead) chunks.push({ heading: null, text: lead });
      heads.forEach(function (h, i) {
        chunks.push({ heading: h.heading || null, text: mcpGuideHtmlToText(rest.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : rest.length)) });
      });
    } else {
      var whole = mcpGuideHtmlToText(rest);
      if (whole) chunks.push({ heading: null, text: whole });
    }
  }
  return { id: id, title: title, chunks: chunks, text: mcpGuideSectionText(chunks) };
}

function mcpGuideSectionText(chunks) {
  return chunks.map(function (c) { return (c.heading ? c.heading + '\n' : '') + c.text; }).join('\n\n').trim();
}

// A guide page -> { title, sections: [{ id, title, chunks, text }], skipped }.
// A section starts at each guide-section div and ends at the next one, the page footer or </body>.
// Sections with no id are counted in `skipped` (the drift canary asserts 0).
function mcpGuideParseHtml(text) {
  var src = String(text || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  var t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(src);
  var markRe = new RegExp('<div\\b[^>]*class="(?:[^"]* )?guide-section(?: [^"]*)?"[^>]*>', 'gi');
  var marks = [];
  var m;
  while ((m = markRe.exec(src)) !== null) marks.push({ at: m.index, end: m.index + m[0].length, tag: m[0] });
  var footer = src.search(new RegExp('<div\\b[^>]*class="(?:[^"]* )?guide-footer(?: [^"]*)?"', 'i'));
  var bodyEnd = src.search(/<\/body>/i);
  var tail = [footer, bodyEnd].filter(function (n) { return n >= 0; });
  var pageEnd = tail.length ? Math.min.apply(null, tail) : src.length;
  var sections = [];
  var skipped = 0;
  marks.forEach(function (mk, i) {
    var end = Math.min(i + 1 < marks.length ? marks[i + 1].at : pageEnd, pageEnd);
    var idm = new RegExp('\\bid="([^"]+)"').exec(mk.tag);
    if (!idm) { skipped++; return; }
    sections.push(mcpGuideSectionFromHtml(idm[1], src.slice(mk.end, Math.max(end, mk.end))));
  });
  return { title: t ? mcpGuideOneLine(mcpGuideHtmlToText(t[1])) : '', sections: sections, skipped: skipped };
}

function mcpGuideSlug(heading) {
  return String(heading).toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ /g, '-');
}

function mcpGuideMdInline(s) {
  return s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').replace(/\*\*/g, '');
}

// README.md -> the same shape. "## " starts a section (id = GitHub-style slug), "### " a chunk.
// Sections named in MCP_GUIDE_README_SKIP are left out. Fenced code is kept as text.
function mcpGuideParseMarkdown(text) {
  var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  var fence = String.fromCharCode(96, 96, 96);
  var title = '';
  var sections = [];
  var cur = null;
  var inFence = false;
  var seen = {};
  lines.forEach(function (line) {
    if (line.indexOf(fence) === 0) inFence = !inFence;
    var h = inFence ? null : /^(#{1,3})\s+(.*)$/.exec(line);
    if (h && h[1].length === 1) { if (!title) title = mcpGuideOneLine(mcpGuideMdInline(h[2])); return; }
    if (h && h[1].length === 2) {
      var name = mcpGuideOneLine(mcpGuideMdInline(h[2]));
      var id = mcpGuideSlug(name);
      if (seen[id]) { seen[id]++; id = id + '-' + (seen[id] - 1); } else seen[id] = 1;
      cur = { id: id, title: name, lines: [], heads: [] };
      sections.push(cur);
      return;
    }
    if (!cur) return;
    if (h && h[1].length === 3) cur.heads.push({ heading: mcpGuideOneLine(mcpGuideMdInline(h[2])), from: cur.lines.length });
    else cur.lines.push(line);
  });
  var out = [];
  sections.forEach(function (s) {
    if (MCP_GUIDE_README_SKIP.indexOf(s.title.toLowerCase()) >= 0) return;
    var join = function (a, b) { return mcpGuideMdInline(s.lines.slice(a, b).join('\n')).replace(/\n{3,}/g, '\n\n').trim(); };
    var chunks = [];
    if (s.heads.length) {
      var lead = join(0, s.heads[0].from);
      if (lead) chunks.push({ heading: null, text: lead });
      s.heads.forEach(function (hd, i) {
        chunks.push({ heading: hd.heading, text: join(hd.from, i + 1 < s.heads.length ? s.heads[i + 1].from : s.lines.length) });
      });
    } else {
      var whole = join(0, s.lines.length);
      if (whole) chunks.push({ heading: null, text: whole });
    }
    out.push({ id: s.id, title: s.title, chunks: chunks, text: mcpGuideSectionText(chunks) });
  });
  return { title: title, sections: out, skipped: 0 };
}

function mcpGuideParse(file, text) {
  return file === MCP_GUIDE_README ? mcpGuideParseMarkdown(text) : mcpGuideParseHtml(text);
}

// ── Cache + fetch ─────────────────────────────────────────────────────

// -> { parsed, stale }. Within the TTL: no fetch. Concurrent callers share one fetch. A failed
// refetch serves the previous copy (stale: true); a failed first fetch throws and stores nothing.
async function mcpGuideLoad(file) {
  if (MCP_GUIDE_FILES.indexOf(file) < 0) throw mcpRefuse('That is not one of the Newton guides.');
  var e = MCP_GUIDE_CACHE[file];
  var ttl = CONFIG.MCP.guideCacheTtlMs;
  if (e && e.parsed && !e.promise && mcpGuideNow() - e.at < ttl) return { parsed: e.parsed, stale: false };
  if (e && e.promise) return e.promise;
  var prev = e && e.parsed ? e : null;
  var p = (async function () {
    try {
      if (typeof fetchGuide !== 'function') throw new Error('no fetchGuide');
      var text = await fetchGuide(file);
      var parsed = mcpGuideParse(file, text);
      MCP_GUIDE_CACHE[file] = { parsed: parsed, at: mcpGuideNow() };
      return { parsed: parsed, stale: false };
    } catch (err) {
      MCP_GUIDE_CACHE[file] = prev ? { parsed: prev.parsed, at: prev.at } : null;
      if (prev) return { parsed: prev.parsed, stale: true };
      throw mcpRefuse(MCP_GUIDE_UNAVAILABLE);
    }
  })();
  MCP_GUIDE_CACHE[file] = { parsed: prev ? prev.parsed : null, at: prev ? prev.at : 0, promise: p };
  return p;
}

var MCP_GUIDE_UNAVAILABLE = "Newton's guides couldn't be loaded right now. Try again in a moment.";

function mcpGuideUrl(file, sectionId) {
  if (file === MCP_GUIDE_README) return null;
  var base = String(CONFIG.REDIRECT_URI || '');   // the Pages root Newton is served from (single source)
  if (base && base.charAt(base.length - 1) !== '/') base += '/';
  return base + file + '#' + sectionId;
}

// ── Search ────────────────────────────────────────────────────────────

// Query -> distinct lower-case match keys (stopwords dropped; a trailing "s" on a longer word is
// trimmed so "roles" finds "role"). Falls back to every word when only stopwords were given.
function mcpGuideTerms(query) {
  var words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 2; });
  var kept = words.filter(function (w) { return MCP_GUIDE_STOPWORDS.indexOf(w) < 0; });
  var use = kept.length ? kept : words;
  var keys = [];
  use.forEach(function (w) {
    var k = w.length > 3 && w.charAt(w.length - 1) === 's' ? w.slice(0, -1) : w;
    if (keys.indexOf(k) < 0) keys.push(k);
  });
  return keys;
}

function mcpGuideCount(hay, needle, cap) {
  var n = 0;
  var i = hay.indexOf(needle);
  while (i !== -1 && n < cap) { n++; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

// Score one chunk: section-title term 5, chunk-heading term 4 (+3 when it is a whole word there),
// body occurrences (max 5) 1 each, +2 per distinct term found anywhere in the chunk, +4 for the
// whole phrase in the heading or body. 0 unless the heading or body matched.
function mcpGuideScore(section, chunk, keys, phrase) {
  var title = section.title.toLowerCase();
  var head = (chunk.heading || '').toLowerCase();
  var words = head.split(/[^a-z0-9]+/);
  var body = chunk.text.toLowerCase();
  var score = 0;
  var direct = 0;
  keys.forEach(function (k) {
    var found = false;
    if (title.indexOf(k) >= 0) score += 5;
    if (head.indexOf(k) >= 0) {
      score += 4;
      if (words.indexOf(k) >= 0 || words.indexOf(k + 's') >= 0) score += 3;
      found = true;
    }
    var c = mcpGuideCount(body, k, 5);
    if (c) { score += c; found = true; }
    if (found) { direct++; score += 2; }
  });
  if (!direct) return 0;
  if (keys.length > 1 && phrase && (head.indexOf(phrase) >= 0 || body.indexOf(phrase) >= 0)) score += 4;
  return score;
}

function mcpGuideSnippet(chunk, keys) {
  var text = mcpGuideOneLine(chunk.text);
  var low = text.toLowerCase();
  var at = -1;
  keys.forEach(function (k) {
    var i = low.indexOf(k);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  });
  var start = at > 80 ? at - 80 : 0;
  if (start > 0) { var sp = text.indexOf(' ', start); if (sp >= 0 && sp - start < 20) start = sp + 1; }
  var piece = text.slice(start, start + MCP_GUIDE_SNIPPET);
  if (start + MCP_GUIDE_SNIPPET < text.length) {
    var cut = piece.lastIndexOf(' ');
    if (cut > MCP_GUIDE_SNIPPET - 40) piece = piece.slice(0, cut);
  }
  return (start > 0 ? '…' : '') + piece + (start + piece.length < text.length ? '…' : '');
}

// Pure ranking over already-parsed guides. loaded = [{ file, parsed }]; returns the hits array
// (at most `limit`, at most MCP_GUIDE_PER_SECTION per section). Throws a refusal when the query
// has no usable words.
function mcpGuideRank(loaded, query, limit) {
  var keys = mcpGuideTerms(query);
  if (!keys.length) throw mcpRefuse('Give a few words to search for.');
  var phrase = String(query).toLowerCase();
  var scored = [];
  loaded.forEach(function (g, gi) {
    g.parsed.sections.forEach(function (s, si) {
      s.chunks.forEach(function (c, ci) {
        var score = mcpGuideScore(s, c, keys, phrase);
        if (score > 0) scored.push({ score: score, order: gi * 1000000 + si * 1000 + ci, g: g, s: s, c: c });
      });
    });
  });
  scored.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
  var perSection = {};
  var hits = [];
  scored.forEach(function (x) {
    if (hits.length >= limit) return;
    var key = x.g.file + '#' + x.s.id;
    if ((perSection[key] || 0) >= MCP_GUIDE_PER_SECTION) return;
    perSection[key] = (perSection[key] || 0) + 1;
    hits.push({
      guide: x.g.file, guideTitle: x.g.parsed.title, section: x.s.id, sectionTitle: x.s.title,
      subsection: x.c.heading, snippet: mcpGuideSnippet(x.c, keys), url: mcpGuideUrl(x.g.file, x.s.id),
    });
  });
  return hits;
}

async function mcpSearchGuides(args) {
  var query = typeof args.query === 'string' ? mcpGuideOneLine(args.query) : '';
  if (query.length < 2 || query.length > 200) throw mcpRefuse('query must be 2 to 200 characters.');
  var limit = mcpInt(args.limit, 'limit', 1, MCP_GUIDE_LIMIT_MAX, MCP_GUIDE_LIMIT_DEFAULT);
  var files = MCP_GUIDE_FILES;
  if (args.guide !== undefined && args.guide !== null) {
    if (MCP_GUIDE_FILES.indexOf(args.guide) < 0) throw mcpRefuse('guide must be one of: ' + MCP_GUIDE_FILES.join(', ') + '.');
    files = [args.guide];
  }
  if (!mcpGuideTerms(query).length) throw mcpRefuse('Give a few words to search for.');   // before any fetch
  var settled = await Promise.allSettled(files.map(function (f) { return mcpGuideLoad(f); }));
  var loaded = [];
  var unavailable = [];
  var stale = false;
  settled.forEach(function (r, i) {
    if (r.status === 'fulfilled') { loaded.push({ file: files[i], parsed: r.value.parsed }); if (r.value.stale) stale = true; }
    else unavailable.push(files[i]);
  });
  if (!loaded.length) throw mcpRefuse(MCP_GUIDE_UNAVAILABLE);
  var hits = mcpGuideRank(loaded, query, limit);
  var result = { query: query, hits: hits, searched: loaded.length };
  if (!hits.length) result.note = 'No guide section matches. Say so rather than guessing, and suggest the user check with their Delivery Manager.';
  if (unavailable.length) result.unavailable = unavailable;
  if (stale) result.stale = true;
  return mcpOutputGuard(result);
}

// ── Read ──────────────────────────────────────────────────────────────

function mcpGuideCap(text) {
  if (text.length <= MCP_GUIDE_READ_CAP) return { text: text, cut: false };
  var piece = text.slice(0, MCP_GUIDE_READ_CAP);
  var at = piece.lastIndexOf('\n');
  return { text: (at > MCP_GUIDE_READ_CAP / 2 ? piece.slice(0, at) : piece).trim(), cut: true };
}

function mcpGuideHeadings(section) {
  return section.chunks.filter(function (c) { return c.heading; }).map(function (c) { return c.heading; });
}

// Heading text -> the one chunk it names: exact (case-insensitive), else a unique substring.
function mcpGuidePickChunk(section, wanted) {
  var w = mcpGuideOneLine(wanted).toLowerCase();
  var named = section.chunks.filter(function (c) { return c.heading; });
  var exact = named.filter(function (c) { return c.heading.toLowerCase() === w; });
  if (exact.length === 1) return exact[0];
  var part = exact.length ? exact : named.filter(function (c) { return c.heading.toLowerCase().indexOf(w) >= 0; });
  if (part.length === 1) return part[0];
  var list = mcpGuideHeadings(section).join(' | ');
  throw mcpRefuse((part.length ? 'More than one subsection matches "' : 'No subsection matches "') + wanted + '". Subsections: ' + list + '.');
}

// Pure: one section (or subsection) of an already-parsed guide, as the tool result.
function mcpGuideReadFrom(file, parsed, args) {
  var wantId = String(args.section).trim().toLowerCase();
  var section = parsed.sections.find(function (s) { return s.id.toLowerCase() === wantId; });
  if (!section) {
    throw mcpRefuse('No section "' + args.section + '" in ' + file + '. Sections: ' +
      parsed.sections.map(function (s) { return s.id + ' (' + s.title + ')'; }).join(', ') + '.');
  }
  var out = { guide: file, guideTitle: parsed.title, section: section.id, sectionTitle: section.title,
    subsection: null, url: mcpGuideUrl(file, section.id) };
  if (args.subsection !== undefined && args.subsection !== null && String(args.subsection).trim()) {
    var chunk = mcpGuidePickChunk(section, args.subsection);
    var capped = mcpGuideCap(chunk.text);
    out.subsection = chunk.heading;
    out.text = capped.text;
    if (capped.cut) out.truncated = true;
    return out;
  }
  var all = mcpGuideCap(section.text);
  if (!all.cut) {
    out.text = all.text;
    return out;
  }
  var lead = section.chunks[0] && !section.chunks[0].heading ? section.chunks[0].text : '';
  out.text = mcpGuideCap(lead || section.text).text;
  out.truncated = true;
  out.subsections = mcpGuideHeadings(section);
  out.note = 'This section is long. Call again with subsection set to one of the subsections to read it.';
  return out;
}

async function mcpReadGuideSection(args) {
  if (MCP_GUIDE_FILES.indexOf(args.guide) < 0) throw mcpRefuse('guide must be one of: ' + MCP_GUIDE_FILES.join(', ') + '.');
  if (typeof args.section !== 'string' || !args.section.trim()) throw mcpRefuse('section is required (a section id from search_guides).');
  var loaded = await mcpGuideLoad(args.guide);
  var out = mcpGuideReadFrom(args.guide, loaded.parsed, args);
  if (loaded.stale) out.stale = true;
  return mcpOutputGuard(out);
}

// ── Registry ──────────────────────────────────────────────────────────
MCP_TOOLS.push(
  {
    name: 'search_guides',
    description: 'Search the Newton user guides and README for how-to answers. Returns the best matching sections with a snippet and link; then call read_guide_section for the full text. Answer only from what it returns.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 200, description: 'What the user wants to do or know, in a few words (e.g. "log weekly activity").' },
        guide: { type: 'string', enum: MCP_GUIDE_FILES.slice(), description: 'Only search this guide (default: all six).' },
        limit: { type: 'integer', minimum: 1, maximum: MCP_GUIDE_LIMIT_MAX, description: 'Most hits to return (default ' + MCP_GUIDE_LIMIT_DEFAULT + ').' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    roles: ['admin', 'leadership', 'delivery_manager', 'talent_partner'],   // N-547 (AMCP-A2): guides hold no sensitive data
    handler: mcpSearchGuides,
  },
  {
    name: 'read_guide_section',
    description: 'Read one guide section (or one FAQ question / subsection) in full, using ids from search_guides. Quote the link. The guides describe every role\'s pages, so the user may not see all of them.',
    inputSchema: {
      type: 'object',
      properties: {
        guide: { type: 'string', enum: MCP_GUIDE_FILES.slice(), description: 'The guide file, as returned by search_guides.' },
        section: { type: 'string', description: 'The section id, as returned by search_guides.' },
        subsection: { type: 'string', description: 'A subsection or FAQ heading within the section; needed when the section is long.' },
      },
      required: ['guide', 'section'],
      additionalProperties: false,
    },
    roles: ['admin', 'leadership', 'delivery_manager', 'talent_partner'],   // N-547 (AMCP-A2)
    handler: mcpReadGuideSection,
  },
);
