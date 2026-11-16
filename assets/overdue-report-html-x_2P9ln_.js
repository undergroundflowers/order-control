import{x as G,y as W,A as K}from"./index-BSSWtLip.js";import{G as Y,I,P as T,F as c,c as $,L as x,A as S,d as M,f as z,g as F,Z as R,h as H,C as D,i as _,E as B,j as C,W as U,p as Z,k as J}from"./overdue-report-owner-MqYyLySU.js";const V=`
// ---- radius: working days late, sqrt-scaled and clamped ----
// SIZED UP, 2026-08-17: the first cut was 2.6-9, then 2.2-6 to make dense cells fit, and at 6px
// the encoding stopped working — a hollow ring, a 40% wedge and a dashed staleness ring are the
// same grey smudge at that size. The reason the marks had to shrink was that the column width was
// fitted to the pane; now the columns widen on demand and the plot scrolls sideways, so the mark
// can be sized for LEGIBILITY instead of for the narrowest possible column.
// The clamp lands at ~88 wd (it was ~45), so the live p25/p50/p75 of 12/27/61 all separate.
var R_MIN = 4.5, R_MAX = 13;
function rOf(late) {
  if (!(late > 0)) return R_MIN;
  var r = R_MIN + 2.4 * Math.sqrt(late / 7);
  return r > R_MAX ? R_MAX : r;
}

// ---- columns: an ISO day -> its column, -1 = the gutter (older than the window) ----
function dayColumns(days, edges) {
  // days: ISO strings, oldest first. edges: [{s,e}] index ranges, or null for one column per day.
  var m = {};
  if (!edges) { for (var i = 0; i < days.length; i++) m[days[i]] = i; return m; }
  for (var k = 0; k < edges.length; k++) {
    for (var j = edges[k].s; j < edges[k].e && j < days.length; j++) m[days[j]] = k;
  }
  return m;
}
function colOf(efD, dayCol) {
  var c = dayCol[efD];
  return c === undefined ? -1 : c;
}

// ---- packing: lay dots out inside one cell, worst-delay first ----
// A grid, not a cluster. FeverStrip collapses coincident points and puts the COUNT in the radius;
// here the radius already means delay, so clustering would state something false. Instead every
// dot keeps its own size and gets its own slot, and a cell that overruns spends its last slot on
// a "+N" chip that opens the full list — so no row is ever unreachable.
function packCell(items, w, h, gap) {
  // items: [{i, r}] — i = index into the visible array, r = desired radius.
  var out = { slots: [], overflow: 0 };
  var n = items.length;
  if (!n || w <= 0 || h <= 0) return out;
  var sorted = items.slice().sort(function (a, b) { return b.r - a.r || a.i - b.i; });
  var g = gap === undefined ? 1 : gap;

  var rMax = sorted[0].r;
  var step = 2 * rMax + g;
  var cols = Math.max(1, Math.floor(w / step));
  var rowsN = Math.max(1, Math.floor(h / step));
  var cap = cols * rowsN;

  var draw = n, over = 0;
  if (n > cap) { draw = cap - 1; over = n - draw; if (draw < 0) { draw = 0; over = n; } }

  var subW = w / cols, subH = h / rowsN;
  var lim = Math.min(subW, subH) / 2 - 0.5;
  if (lim < 0.5) lim = 0.5;

  for (var i = 0; i < draw; i++) {
    var c = i % cols, rw = Math.floor(i / cols);
    var r = sorted[i].r;
    if (r > lim) r = lim;
    out.slots.push({ x: (c + 0.5) * subW, y: (rw + 0.5) * subH, r: r, i: sorted[i].i });
  }
  out.overflow = over;
  if (over > 0) {
    var ci = draw % cols, ri = Math.floor(draw / cols);
    out.chip = { x: (ci + 0.5) * subW, y: (ri + 0.5) * subH, n: over };
  }
  return out;
}
`,Q=V+`
(function () {
  var D = JSON.parse(document.getElementById('ocdata').textContent);
  var ROW = { M: 0, O: 1, R: 2, LATE: 3, PCT: 4, AGE: 5, BAND: 6, ZONE: 7, DAY: 8, STEP: 9, REM: 10, PRE: 11, W: 12, S: 13 };
  var BANDS = ['none', 'fresh', 'aging', 'stale'];
  var ZONES = ['green', 'amber', 'red'];
  var BAND_LABEL = { none: 'never remarked', fresh: 'remarked recently', aging: 'remark ageing', stale: 'remark stale' };
  var rows = D.dots.rows;

  var S = { zoom: 'day', group: 'm', merch: -1, res: -1, zone: '', band: '', delay: '', prog: '', old: '', q: '', sel: -1, table: false };
  function winStart() { return S.zoom === 'day' ? D.days[0] : D.weekDays[0]; }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  // The three dictionary-indexed row columns. Names and scheduled finishes are stored as indices
  // because both repeat hard across a portfolio; these are the only readers.
  function efdOf(r) { return D.dots.day[r[ROW.DAY]]; }
  function nameOf(r) {
    var p = D.dots.pre[r[ROW.PRE]];
    return (p ? p + ' \\u00b7 ' : '') + D.dots.nm[r[ROW.STEP]];
  }
  function dmy(s) {
    if (!s) return '—';
    var p = s.split('-');
    return p[2] + '/' + p[1] + '/' + p[0].slice(2);
  }
  function wd(n) { return n + ' wd'; }

  // ---------- filtering ----------
  // ONE pass produces the visible index array, and the dot layer, the header counts, the curve and
  // the table all render from it — so the numbers on screen always describe what is drawn.
  // Split into the part that does not depend on HOW LATE a task is, and the delay test on its own.
  // The ladder ages tasks backwards column by column, so it needs to ask the delay question at an
  // arbitrary lateness — and it needs the rest of the filter unchanged while it does.
  function passesStatic(r) {
    if (S.res >= 0 && r[ROW.R] !== S.res) return false;
    if (S.zone && ZONES[r[ROW.ZONE]] !== S.zone) return false;
    if (S.band && BANDS[r[ROW.BAND]] !== S.band) return false;
    if (S.prog === 'some' && !(r[ROW.PCT] > 0)) return false;
    if (S.prog === 'none' && r[ROW.PCT] > 0) return false;
    if (S.old === 'only' && efdOf(r) >= winStart()) return false;
    if (S.q) {
      var hay = (nameOf(r) + ' ' + D.dict.o[r[ROW.O]] + ' ' + (r[ROW.R] < 0 ? '' : D.dict.r[r[ROW.R]])).toLowerCase();
      if (hay.indexOf(S.q) < 0) return false;
    }
    return true;
  }
  function inDelay(L) {
    if (!S.delay) return true;
    if (S.delay === '0') return L === 0;
    if (S.delay === '1') return L >= 1 && L <= 5;
    if (S.delay === '6') return L >= 6 && L <= 20;
    if (S.delay === '21') return L >= 21;
    return true;
  }
  // Semantically identical to the single-pass version it replaced — the map, the table and the
  // header counts must not shift by one task because the ladder wanted the pieces separately.
  function passes(r) {
    if (S.merch >= 0 && r[ROW.M] !== S.merch) return false;
    return passesStatic(r) && inDelay(r[ROW.LATE]);
  }
  function visible() {
    var out = [];
    for (var i = 0; i < rows.length; i++) if (passes(rows[i])) out.push(i);
    return out;
  }

  // ---------- lanes ----------
  function laneKey(r) {
    if (S.group === 'm') return r[ROW.M];
    if (S.group === 'o') return r[ROW.O];
    if (S.group === 'w') return r[ROW.W];
    if (S.group === 't') return r[ROW.S];
    return r[ROW.R];
  }
  function laneName(k) {
    if (S.group === 'm') return D.dict.m[k] || 'Unassigned';
    if (S.group === 'o') return D.dict.o[k] || '—';
    if (S.group === 'w') return k < 0 ? 'unowned' : (D.dict.w[k] || '—');
    if (S.group === 't') return k < 0 ? 'no section' : (D.dict.s[k] || '—');
    return k < 0 ? 'no resource' : (D.dict.r[k] || '—');
  }
  var LANE_CAP = 40;
  function lanes(vis) {
    var count = {}, order = [];
    for (var i = 0; i < vis.length; i++) {
      var k = laneKey(rows[vis[i]]);
      if (count[k] === undefined) { count[k] = 0; order.push(k); }
      count[k]++;
    }
    if (S.group === 'm') order.sort(function (a, b) { return a - b; });          // leaderboard order
    else order.sort(function (a, b) { return count[b] - count[a] || a - b; });   // busiest first
    var shown = order.slice(0, LANE_CAP);
    var hidden = 0;
    for (var j = LANE_CAP; j < order.length; j++) hidden += count[order[j]];
    return { keys: shown, count: count, hidden: hidden, hiddenLanes: Math.max(0, order.length - LANE_CAP) };
  }

  // ---------- the delay map ----------
  // The map is TWO svgs side by side inside one scroller: a frozen label panel (lane name, count,
  // and the pre-window bar — all facts about the LANE) and the plot, which scrolls horizontally.
  // Same trick a spreadsheet uses, and it is what lets the marks be big: the columns no longer
  // have to fit the pane. Both panels are laid out on the same lane geometry, so they line up.
  var LEFT = 168, TOP = 30, PADR = 12, GUTTER = 96, LANE_MIN = 52, LANE_MAX = 520;
  // CW_MIN is exactly one full-size mark plus its gap (2 * R_MAX + GAP, rounded): narrower than
  // this and packCell's own radius clamp quietly shrinks the dots back down, which is the bug this
  // whole pass exists to fix. Wider than this and the daily scale scrolls for no reason.
  var CW_MIN = 30, CW_MAX = 148, GAP = 2.5;
  var LABW = LEFT + GUTTER;

  function columns() {
    return S.zoom === 'day'
      ? { days: D.days, edges: null, labels: D.days.map(function (d) { return dmy(d).slice(0, 5); }) }
      : { days: D.weekDays, edges: D.weekEdges, labels: D.weekEdges.map(function (e) { return e.label; }) };
  }

  function drawMap(vis) {
    var C = columns();
    var dayCol = dayColumns(C.days, C.edges);
    var L = lanes(vis);
    var host = el('map');
    var hostW = Math.max(560, host.clientWidth || 1100);
    var nCol = C.labels.length;

    var laneAt = {};
    for (var a = 0; a < L.keys.length; a++) laneAt[L.keys[a]] = a;

    // THE GUTTER IS NOT A COLUMN. It is everything that fell due before the window, and on a real
    // document that is the MAJORITY of the pile — 702 of 1,133 at daily zoom. Packed as dots it
    // was 660 unreadable "+N" chips pretending to be a chart. It is drawn as a counted bar per
    // lane instead, and clicking it lists those rows in the table: a different fact deserves a
    // different mark, and the count is the fact.
    var cells = {}, gut = {}, gutterN = 0;
    for (var i = 0; i < vis.length; i++) {
      var r = rows[vis[i]];
      var lk = laneAt[laneKey(r)];
      if (lk === undefined) continue;
      var c = colOf(efdOf(r), dayCol);
      if (c < 0) { gut[lk] = (gut[lk] || 0) + 1; gutterN++; continue; }
      var key = lk + ':' + c;
      (cells[key] || (cells[key] = [])).push({ i: vis[i], r: rOf(r[ROW.LATE]) });
    }

    // COLUMN WIDTH IS DEMAND-DRIVEN. Fitting the columns to the box is right until the box is
    // narrow: at 26 weekly columns in a 764px pane a column holds ONE dot per row, so a busy cell
    // needs 470px of lane and the clamp hides the overflow behind a chip. So: fit first, then widen
    // any column that would otherwise force the clamp, and let the box scroll sideways for it.
    // Nothing widens when the chart already fits — the daily scale is untouched by this.
    // CW_MIN is the floor that keeps a full-size mark from being squeezed by packCell's own
    // radius clamp — a column narrower than one mark would quietly shrink the dots back down.
    var cw = Math.max(CW_MIN, (hostW - LABW - PADR) / nCol);
    for (var ck0 in cells) {
      var bg0 = cells[ck0], rm0 = 0;
      for (var z0 = 0; z0 < bg0.length; z0++) if (bg0[z0].r > rm0) rm0 = bg0[z0].r;
      var st0 = 2 * rm0 + GAP;
      var rowsMax = Math.max(1, Math.floor((LANE_MAX - 6) / st0));
      var needCw = Math.ceil(bg0.length / rowsMax) * st0 + 2;
      if (needCw > cw) cw = Math.min(needCw, CW_MAX);
    }
    var PW = nCol * cw + PADR;

    // Lane height follows the busiest cell IN THAT LANE, not the busiest cell anywhere. One shared
    // height was the wrong shape twice over: a single merchant's bad week made every lane tall, and
    // the lane that caused it STILL overflowed once the clamp bit — 80 dots were hiding behind "+N"
    // chips at the weekly scale. Sizing per lane spends the height where the density actually is.
    var LH = [], LY = [], H = TOP;
    for (var li0 = 0; li0 < L.keys.length; li0++) LH.push(LANE_MIN);
    for (var ck in cells) {
      var bg = cells[ck], rm = 0;
      for (var z = 0; z < bg.length; z++) if (bg[z].r > rm) rm = bg[z].r;
      var st = 2 * rm + GAP;
      var perRow = Math.max(1, Math.floor((cw - 2) / st));
      var hNeed = Math.ceil(bg.length / perRow) * st + 6;
      var lane = +ck.split(':')[0];
      if (hNeed > LH[lane]) LH[lane] = hNeed;
    }
    for (var li1 = 0; li1 < LH.length; li1++) {
      LH[li1] = Math.min(LANE_MAX, Math.ceil(LH[li1]));
      LY.push(H); H += LH[li1];
    }
    H += 8;

    var gmax = 1;
    for (var gk in gut) if (gut[gk] > gmax) gmax = gut[gk];

    var lab = '<svg class="lab" viewBox="0 0 ' + LABW + ' ' + H + '" width="' + LABW + '" height="' + H + '" aria-hidden="true">';
    lab += '<g class="ax"><text x="' + (LEFT + GUTTER / 2) + '" y="20" text-anchor="middle" class="gut">before ' + esc(dmy(C.days[0])) + '</text></g>';

    var s = '<svg viewBox="0 0 ' + PW + ' ' + H + '" width="' + PW + '" height="' + H + '" role="img" aria-label="Overdue work by lane and scheduled finish date">';
    s += '<g class="ax">';
    for (var ci = 0; ci < nCol; ci++) {
      var x = ci * cw + cw / 2;
      if (cw >= 28 || ci % 2 === 0) s += '<text x="' + x + '" y="20" text-anchor="middle">' + esc(C.labels[ci]) + '</text>';
    }
    s += '</g>';

    var drawn = 0, chipped = 0;
    for (var li = 0; li < L.keys.length; li++) {
      var y = LY[li], LANE_H = LH[li];
      var k = L.keys[li];
      var color = S.group === 'm' ? (D.merchants[k] ? D.merchants[k].color : '#5e7d99') : '#5e7d99';
      if (li % 2 === 1) {
        lab += '<rect class="zebra" x="0" y="' + y + '" width="' + LABW + '" height="' + LANE_H + '"/>';
        s += '<rect class="zebra" x="0" y="' + y + '" width="' + PW + '" height="' + LANE_H + '"/>';
      }
      lab += '<text class="lane" x="8" y="' + (y + LANE_H / 2 + 4) + '">'
        + '<tspan class="sw" fill="' + color + '">&#9679; </tspan>'
        + esc(laneName(k)) + '</text>';
      lab += '<text class="lanen" x="' + (LEFT - 10) + '" y="' + (y + LANE_H / 2 + 4) + '" text-anchor="end">' + L.count[k] + '</text>';

      var gn = gut[li] || 0;
      if (gn) {
        var bx = LEFT + 4, bw2 = Math.max(10, (GUTTER - 40) * (gn / gmax));
        lab += '<g class="gbar" data-act="old" data-v="only">'
          + '<rect x="' + bx + '" y="' + (y + LANE_H / 2 - 8) + '" width="' + bw2.toFixed(1) + '" height="16" rx="3" fill="' + color + '" opacity=".3"/>'
          + '<text x="' + (bx + bw2 + 5).toFixed(1) + '" y="' + (y + LANE_H / 2 + 4) + '">' + gn + '</text>'
          + '<title>' + gn + ' tasks fell due before ' + esc(dmy(C.days[0])) + ' — click to list them</title></g>';
      }

      for (var c2 = 0; c2 < nCol; c2++) {
        var bag = cells[li + ':' + c2];
        if (!bag) continue;
        var cx = c2 * cw;
        var p = packCell(bag, cw - 2, LANE_H - 6, GAP);
        for (var q = 0; q < p.slots.length; q++) {
          var sl = p.slots[q];
          s += dot(cx + 1 + sl.x, y + 3 + sl.y, sl.r, rows[sl.i], sl.i);
          drawn++;
        }
        if (p.chip) {
          chipped += p.chip.n;
          s += '<g class="chip"><circle cx="' + (cx + 1 + p.chip.x) + '" cy="' + (y + 3 + p.chip.y)
            + '" r="10"/><text x="' + (cx + 1 + p.chip.x) + '" y="' + (y + 3 + p.chip.y + 3.5)
            + '" text-anchor="middle">+' + p.chip.n + '</text></g>';
        }
      }
    }
    lab += '</svg>';
    s += '</svg>';

    host.innerHTML = '<div class="mapflex"><div class="maplab">' + lab + '</div><div class="mapplot">' + s + '</div></div>';
    // Say exactly what is on screen. An earlier note read "1133 of 1133 shown" while 406 dots
    // were drawn — the kind of caption that makes a chart untrustworthy.
    el('mapnote').innerHTML = '<b>' + drawn + '</b> dots drawn'
      + (chipped ? ' &middot; ' + chipped + ' more collapsed into <b>+N</b> chips — filter or switch scale to separate them' : '')
      + (gutterN ? ' &middot; <b>' + gutterN + '</b> fell due before ' + esc(dmy(C.days[0])) + ' — the bars on the left; click one to list them' : '')
      + (L.hidden ? ' &middot; ' + L.hidden + ' in ' + L.hiddenLanes + ' further lanes not drawn' : '');
    // "N of M match the filter" used to close this line and OPENS the summary beside it. One of
    // them had to go; the summary keeps it, because it also carries the averages.
  }

  // A dot carries FOUR facts at once, which is the whole point of the encoding:
  //   position = when it fell due (x) and who owns it (lane)
  //   radius   = how late, sqrt-scaled
  //   fill     = reported progress. 90% of real rows report nothing, so NOTHING is the hollow
  //              ring (quiet) and progress is the filled wedge (loud) — exception encoding.
  //   outline  = remark state. Silence is the background here too, so the mark goes on speech.
  function dot(cx, cy, r, rr, idx) {
    var m = D.merchants[rr[ROW.M]];
    var col = m ? m.color : '#5e7d99';
    var band = BANDS[rr[ROW.BAND]];
    var pct = rr[ROW.PCT];
    var sel = idx === S.sel ? ' sel' : '';
    // Strokes scale WITH the radius. A fixed 1.4px line reads as a hairline on a 13px mark and as
    // a blob on a 4.5px one, which flattens exactly the difference the size channel is carrying.
    var sw = Math.max(1.4, r * 0.19).toFixed(2);
    var g = '<g class="d' + sel + '" data-i="' + idx + '">';
    if (rr[ROW.R] < 0) {
      // resource-independent work is a real category (2026-07-15) and gets the shape channel
      g += '<path d="M' + cx + ' ' + (cy - r) + 'L' + (cx + r) + ' ' + cy + 'L' + cx + ' ' + (cy + r) + 'L' + (cx - r) + ' ' + cy + 'Z" fill="'
        + (pct > 0 ? col : 'none') + '" stroke="' + col + '" stroke-width="' + sw + '"/>';
    } else if (pct > 0) {
      g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '"/>';
      g += '<path d="' + wedge(cx, cy, r, pct) + '" fill="' + col + '"/>';
    } else {
      g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '"/>';
    }
    if (band !== 'none') {
      var gapR = Math.max(3, r * 0.34);
      var dash = Math.max(2, r * 0.3).toFixed(1);
      g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + gapR).toFixed(2) + '" fill="none" stroke="' + D.age[band]
        + '" stroke-width="' + Math.max(1.2, r * 0.15).toFixed(2) + '"'
        + (band === 'fresh' ? '' : ' stroke-dasharray="' + dash + ' ' + dash + '"') + '/>';
    }
    // an invisible target: a 4.5px mark is still not something a mouse can comfortably hit
    g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + Math.max(r + 4, 9) + '" fill="transparent"/>';
    g += '<title>' + esc(nameOf(rr)) + ' — ' + wd(rr[ROW.LATE]) + ' late, ' + pct + '% done, ' + BAND_LABEL[band] + '</title>';
    return g + '</g>';
  }
  function wedge(cx, cy, r, pct) {
    var f = Math.max(0, Math.min(100, pct)) / 100;
    if (f >= 1) return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0';
    var a = f * Math.PI * 2 - Math.PI / 2;
    return 'M' + cx + ' ' + cy + 'L' + cx + ' ' + (cy - r)
      + 'A' + r + ' ' + r + ' 0 ' + (f > 0.5 ? 1 : 0) + ' 1 ' + (cx + r * Math.cos(a)) + ' ' + (cy + r * Math.sin(a)) + 'Z';
  }

  // ---------- the merchant ladder ----------
  // WHY A RANK AXIS: what he asked to see is who goes up and down, and a count of overdue tasks can
  // only ever go up — the pile is made of survivors, so nothing leaves it going backwards in time.
  // Rank is relative, so a line falls the moment somebody passes it.
  //
  // WHY IT IS REBUILT FROM THE DOTS: the pre-aggregated backlog series was per-merchant and
  // filter-blind, which is why the old curve happily drew all 1,338 tasks beside a map showing 412.
  // Everything here comes from the same rows the map draws, so the two can never disagree.
  var ACT_LINE = 20, SHRINK_K = 20, LAD_CAP = 16;
  var LAD_TOP = 34, LAD_BOT = 30, LAD_LEFT = 128, LAD_RIGHT = 210, RANK_H = 26;

  function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // Working days from column k back to the status date. Daily columns ARE working days, so the
  // distance is just how many columns remain; weekly columns carry theirs from the build side,
  // where the project calendar lives.
  function backOf(k, n) {
    if (S.zoom === 'day') return n - 1 - k;
    var e = D.weekEdges[k];
    return e && e.wb != null ? e.wb : 0;
  }
  function ladderCols() { return S.zoom === 'day' ? D.days.length : D.weekEdges.length; }

  // One pass over the statically-filtered rows: how big was each merchant's pile at each column,
  // and how much of it was still inside the act line. A task 30 wd late today was 10 wd late twenty
  // working days ago — and not overdue AT ALL before that, so it joins the pile partway across.
  // That is what lets a line's own population fall as well as rise.
  function ladderSeries() {
    var n = ladderCols(), nm = D.merchants.length;
    var pile = [], fresh = [], a, b;
    for (a = 0; a < nm; a++) {
      pile.push([]); fresh.push([]);
      for (b = 0; b < n; b++) { pile[a].push(0); fresh[a].push(0); }
    }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!passesStatic(r)) continue;
      var mi = r[ROW.M], L = r[ROW.LATE];
      if (mi < 0 || mi >= nm) continue;
      for (var k = 0; k < n; k++) {
        var lk = L - backOf(k, n);
        if (lk < 0 || !inDelay(lk)) continue;
        pile[mi][k]++;
        if (lk <= ACT_LINE) fresh[mi][k]++;
      }
    }
    return { pile: pile, fresh: fresh, n: n };
  }

  // Shrink toward the portfolio share of the SAME column. Without it a merchant holding four tasks,
  // all young, tops the table over one holding two hundred and doing well.
  function ladderScores(A) {
    var n = A.n, nm = D.merchants.length, out = [], k, m;
    for (m = 0; m < nm; m++) out.push([]);
    for (k = 0; k < n; k++) {
      var tp = 0, tf = 0;
      for (m = 0; m < nm; m++) { tp += A.pile[m][k]; tf += A.fresh[m][k]; }
      var pbar = tp > 0 ? tf / tp : 0;
      for (m = 0; m < nm; m++) out[m].push((A.fresh[m][k] + SHRINK_K * pbar) / (A.pile[m][k] + SHRINK_K));
    }
    return out;
  }

  function ladderRanks(sc, A) {
    var n = A.n, nm = D.merchants.length, live = [], m, k;
    for (m = 0; m < nm; m++) if (A.pile[m][n - 1] > 0) live.push(m);
    var ranks = {};
    for (m = 0; m < nm; m++) ranks[m] = [];
    for (k = 0; k < n; k++) {
      var ord2 = live.slice();
      ord2.sort(rankCmp(sc, A, k));
      for (var p = 0; p < ord2.length; p++) ranks[ord2[p]].push(0);
      for (p = 0; p < ord2.length; p++) ranks[ord2[p]][k] = p + 1;
    }
    return { ranks: ranks, live: live };
  }
  function rankCmp(sc, A, k) {
    // Tie on share -> the SMALLER pile ranks higher. This is not cosmetic: filter the map to
    // "21+ days late" and nothing can be inside a 20-working-day act line, so every score is 0
    // and the tiebreak becomes the whole ranking. Descending would have crowned whoever is
    // sitting on the biggest heap of ancient work.
    return function (x, y) { return sc[y][k] - sc[x][k] || A.pile[x][k] - A.pile[y][k] || x - y; };
  }

  function platOf(gap) { return gap > 0 ? Math.min(13, gap * 0.28) : 0; }

  function bumpPath(pts, gap) {
    var plat = platOf(gap), ctl = (gap - 2 * plat) * 0.42;
    var d = 'M' + (pts[0].x - plat).toFixed(1) + ' ' + pts[0].y.toFixed(1)
      + 'L' + (pts[0].x + plat).toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      d += 'C' + (a.x + plat + ctl).toFixed(1) + ' ' + a.y.toFixed(1)
        + ' ' + (b.x - plat - ctl).toFixed(1) + ' ' + b.y.toFixed(1)
        + ' ' + (b.x - plat).toFixed(1) + ' ' + b.y.toFixed(1)
        + 'L' + (b.x + plat).toFixed(1) + ' ' + b.y.toFixed(1);
    }
    return d;
  }

  function ordinal(i) {
    var v = i % 100;
    if (v >= 11 && v <= 13) return i + 'th';
    var r = i % 10;
    return i + (r === 1 ? 'st' : r === 2 ? 'nd' : r === 3 ? 'rd' : 'th');
  }

  function drawLadder() {
    var host = el('ladder'), note = el('ladnote');
    var A = ladderSeries(), sc = ladderScores(A), R = ladderRanks(sc, A);
    var n = A.n, live = R.live;
    if (!live.length || !n) {
      host.innerHTML = '';
      note.textContent = 'No task matches this filter, so there are no standings to draw.'
        + ' Reset the filters, or widen the delay band.';
      return;
    }
    var shown = live.slice();
    shown.sort(lastRankCmp(R, n));
    var over = 0;
    if (shown.length > LAD_CAP) { over = shown.length - LAD_CAP; shown = shown.slice(0, LAD_CAP); }

    var W = Math.max(620, host.clientWidth || 1100);
    var H = LAD_TOP + shown.length * RANK_H + LAD_BOT;
    var PX0 = LAD_LEFT, PX1 = W - LAD_RIGHT;
    var gap = n < 2 ? 0 : (PX1 - PX0) / (n - 1);
    var plat = platOf(gap);
    var px = function (k) { return n < 2 ? (PX0 + PX1) / 2 : PX0 + k * gap; };
    var py = function (rk) { return LAD_TOP + (rk - 0.5) * RANK_H; };
    var labels = S.zoom === 'day' ? D.days.map(dayLabel) : D.weekEdges.map(weekLabel);

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img"'
      + ' aria-label="Merchant ladder - rank by the share of each overdue pile still inside the act line">';
    for (var k0 = 0; k0 < n; k0++) {
      if (gap >= 34 || k0 % 2 === 0 || k0 === n - 1) {
        s += '<text class="ax" x="' + px(k0).toFixed(1) + '" y="20" text-anchor="middle">' + esc(labels[k0]) + '</text>';
      }
    }

    // The waterline: how many merchants have at least half their pile inside the act line. It is a
    // THRESHOLD, so it STEPS between columns rather than sweeping — a promotion line does not glide.
    // Everybody can be above it at once, which is what keeps it a goal rather than a forced curve.
    var wl = '', wprev = null;
    for (var k1 = 0; k1 < n; k1++) {
      var above = 0;
      for (var q = 0; q < shown.length; q++) if (sc[shown[q]][k1] >= 0.5) above++;
      var yv = LAD_TOP + above * RANK_H;
      if (wprev === null) wl += 'M' + (px(k1) - plat).toFixed(1) + ' ' + yv.toFixed(1);
      else {
        wl += 'L' + (px(k1) - plat).toFixed(1) + ' ' + wprev.toFixed(1)
          + 'L' + (px(k1) - plat).toFixed(1) + ' ' + yv.toFixed(1);
      }
      wl += 'L' + (px(k1) + plat).toFixed(1) + ' ' + yv.toFixed(1);
      wprev = yv;
    }
    s += '<path class="wl" d="' + wl + '"/>';
    s += '<text class="wlb" x="' + (PX1 + 8) + '" y="' + (LAD_TOP - 12) + '">half the pile inside '
      + ACT_LINE + ' wd</text>';

    for (var j = 0; j < shown.length; j++) {
      var mi = shown[j], M = D.merchants[mi], pts = [];
      for (var k2 = 0; k2 < n; k2++) pts.push({ x: px(k2), y: py(R.ranks[mi][k2]) });
      var first = R.ranks[mi][0], last = R.ranks[mi][n - 1], mv = first - last;
      var pct = Math.round(sc[mi][n - 1] * 100);
      var cls = 'm' + (S.merch === mi ? ' hi' : (S.merch >= 0 ? ' dim' : ''));
      var move = mv > 0 ? 'up ' + mv + ' place' + (mv === 1 ? '' : 's')
        : mv < 0 ? 'down ' + (-mv) + ' place' + (mv === -1 ? '' : 's') : 'unchanged';
      var tip = M.display + ' · ' + ordinal(last) + ' of ' + shown.length + ', ' + move
        + ' · ' + pct + '% inside the act line (' + A.fresh[mi][n - 1] + ' of '
        + A.pile[mi][n - 1] + ' in view)';
      s += '<g class="' + cls + '" data-act="merch" data-v="' + mi + '" role="button">';
      s += '<title>' + esc(tip) + '</title>';
      s += '<path class="ln" d="' + bumpPath(pts, gap) + '" stroke="' + M.color + '"/>';
      for (var k3 = 0; k3 < n; k3++) {
        s += '<circle class="mk" cx="' + pts[k3].x.toFixed(1) + '" cy="' + pts[k3].y.toFixed(1)
          + '" r="' + (k3 === n - 1 ? '5.5' : '4') + '" fill="' + M.color + '"/>';
      }
      var yf = (py(first) + 4).toFixed(1), yl = (py(last) + 4).toFixed(1);
      s += '<text class="rk" x="14" y="' + yf + '" text-anchor="middle">' + first + '</text>';
      s += '<text class="nm" x="30" y="' + yf + '" fill="' + M.color + '">' + esc(clip(M.display, 14)) + '</text>';
      s += '<text class="rk" x="' + (PX1 + 14) + '" y="' + yl + '" text-anchor="middle">' + last + '</text>';
      s += '<text class="nm" x="' + (PX1 + 30) + '" y="' + yl + '" fill="' + M.color + '">' + esc(clip(M.display, 13)) + '</text>';
      s += '<text class="sc" x="' + (PX1 + 140) + '" y="' + yl + '" text-anchor="end">' + pct + '%</text>';
      var mvc = mv > 0 ? 'up' : mv < 0 ? 'dn' : 'fl';
      var mvt = mv > 0 ? '▲' + mv : mv < 0 ? '▼' + (-mv) : '▬';
      s += '<text class="mv ' + mvc + '" x="' + (PX1 + 152) + '" y="' + yl + '">' + mvt + '</text>';
      s += '</g>';
    }
    s += '</svg>';
    host.innerHTML = s;
    note.textContent = ladderNote(A, shown, live, n, over);
  }

  function lastRankCmp(R, n) {
    return function (x, y) { return R.ranks[x][n - 1] - R.ranks[y][n - 1]; };
  }
  function dayLabel(d) { return dmy(d).slice(0, 5); }
  function weekLabel(e) { return e.label; }

  function ladderNote(A, shown, live, n, over) {
    var txt = 'Ranked by the share of each merchant’s overdue pile still inside the act line — '
      + ACT_LINE + ' working days late or less. ' + shown.length + ' merchants · ' + n
      + (S.zoom === 'day' ? ' matchdays' : ' matchweeks') + '.';
    if (S.delay === '21') {
      txt += ' Every share here reads 0% and that is arithmetic, not a verdict: nothing more than'
        + ' 21 working days late can sit inside a 20-day act line. The order is by pile size,'
        + ' smallest first.';
    }
    if (S.res >= 0 || S.zone || S.band || S.prog || S.q || S.delay || S.old === 'only') {
      txt += ' Narrowed to what the map is showing. Remark band, progress, zone, resource and search'
        + ' are today’s values applied to every column; days late DOES travel back, which is why'
        + ' a line can fall as well as rise.';
    }
    if (S.merch >= 0 && D.merchants[S.merch]) {
      txt += ' ' + D.merchants[S.merch].display + ' highlighted — merchant chips highlight here,'
        + ' they never remove opponents, because a table of one is not a table.';
    }
    if (S.group !== 'm') {
      txt += ' Lanes are set to ' + (S.group === 'o' ? 'Order' : 'Resource')
        + ' on the map; the ladder always ranks merchants.';
    }
    var missing = [];
    for (var z = 0; z < D.merchants.length; z++) {
      if (live.indexOf(z) < 0) missing.push(D.merchants[z].display);
    }
    if (missing.length) txt += ' Not in this filter: ' + missing.join(', ') + '.';
    if (over) txt += ' +' + over + ' further merchants not ranked.';
    return txt;
  }

  // ---------- detail ----------
  function detail(i) {
    var box = el('detail');
    if (i < 0 || !rows[i]) {
      box.innerHTML = '<p class="hint">Click any dot to read the task behind it — its order, resource, how late it is, what has been reported, and the whole remark thread.</p>';
      return;
    }
    var r = rows[i];
    var m = D.merchants[r[ROW.M]];
    var band = BANDS[r[ROW.BAND]];
    var h = '<div class="dt-h"><span class="sw" style="background:' + (m ? m.color : '#5e7d99') + '"></span>'
      + '<b>' + esc(nameOf(r)) + '</b></div>';
    h += '<table class="dt-t"><tbody>';
    h += row2('Order', esc(D.dict.o[r[ROW.O]]) + ' <span class="chip ' + ZONES[r[ROW.ZONE]] + '">' + ZONES[r[ROW.ZONE]].toUpperCase() + '</span>');
    h += row2('Merchant', esc(m ? m.display : '—'));
    h += row2('Resource', r[ROW.R] < 0 ? '<i>resource-independent</i>' : esc(D.dict.r[r[ROW.R]]));
    h += row2('Scheduled finish', dmy(efdOf(r)));
    h += row2('Late', '<b class="late">' + wd(r[ROW.LATE]) + '</b>');
    h += row2('Reported done', r[ROW.PCT] + '%' + (r[ROW.PCT] === 0 ? ' <span class="faint">nothing reported</span>' : ''));
    h += row2('Latest remark', r[ROW.AGE] == null ? '<span class="faint">never remarked</span>' : wd(r[ROW.AGE]) + ' ago <span class="faint">(' + BAND_LABEL[band] + ')</span>');
    h += '</tbody></table>';
    var rem = r[ROW.REM] || [];
    if (rem.length) {
      h += '<div class="dt-r"><div class="dt-rh">' + rem.length + ' remark' + (rem.length === 1 ? '' : 's') + '</div>';
      for (var q = rem.length - 1; q >= 0; q--) {
        h += '<div class="rm"><div class="rm-b">' + esc(D.dots.by[rem[q][0]]) + ' &middot; ' + dmy(rem[q][1]) + '</div><div>' + esc(rem[q][2]) + '</div></div>';
      }
      h += '</div>';
    }
    box.innerHTML = h;
  }
  function row2(k, v) { return '<tr><th>' + k + '</th><td>' + v + '</td></tr>'; }

  // ---------- table view ----------
  var TABLE_CAP = 300;
  function drawTable(vis) {
    var host = el('tablewrap');
    if (!S.table) { host.innerHTML = ''; host.hidden = true; return; }
    host.hidden = false;
    var show = vis.slice(0, TABLE_CAP);
    var h = '<table class="tv"><thead><tr><th>Task</th><th>Order</th><th>Merchant</th><th>Resource</th>'
      + '<th>Sched. finish</th><th class="num">Late</th><th class="num">% done</th><th>Latest remark</th></tr></thead><tbody>';
    for (var i = 0; i < show.length; i++) {
      var r = rows[show[i]];
      var rem = r[ROW.REM] || [];
      var lastr = rem.length ? rem[rem.length - 1] : null;
      h += '<tr data-i="' + show[i] + '"><td>' + esc(nameOf(r)) + '</td><td>' + esc(D.dict.o[r[ROW.O]]) + '</td>'
        + '<td>' + esc(D.merchants[r[ROW.M]] ? D.merchants[r[ROW.M]].display : '—') + '</td>'
        + '<td>' + (r[ROW.R] < 0 ? '<span class="faint">—</span>' : esc(D.dict.r[r[ROW.R]])) + '</td>'
        + '<td class="nw">' + dmy(efdOf(r)) + '</td><td class="num late">' + r[ROW.LATE] + '</td><td class="num">' + r[ROW.PCT] + '%</td>'
        + '<td>' + (lastr ? '<span class="faint">' + esc(D.dots.by[lastr[0]]) + ' &middot; ' + dmy(lastr[1]) + '</span> ' + esc(lastr[2]) : '<span class="faint">—</span>') + '</td></tr>';
    }
    h += '</tbody></table>';
    if (vis.length > TABLE_CAP) h += '<p class="note">Showing the first ' + TABLE_CAP + ' of ' + vis.length + ' — narrow the filter to see the rest.</p>';
    host.innerHTML = h;
  }

  // ---------- render ----------
  function render() {
    var vis = visible();
    el('vcount').textContent = vis.length;
    el('vtot').textContent = rows.length;
    var late = 0, silent = 0, prog = 0;
    for (var i = 0; i < vis.length; i++) {
      var r = rows[vis[i]];
      late += r[ROW.LATE];
      if (r[ROW.BAND] === 0) silent++;
      if (r[ROW.PCT] > 0) prog++;
    }
    el('vlate').textContent = vis.length ? Math.round(late / vis.length) : 0;
    el('vsilent').textContent = vis.length ? Math.round((silent / vis.length) * 100) : 0;
    el('vprog').textContent = prog;
    drawMap(vis);
    drawLadder();
    drawTable(vis);
    detail(S.sel);
    var chips = document.querySelectorAll('[data-act]');
    for (var c = 0; c < chips.length; c++) {
      var a = chips[c].getAttribute('data-act'), v = chips[c].getAttribute('data-v');
      var on = (a === 'zoom' && S.zoom === v) || (a === 'group' && S.group === v)
        || (a === 'merch' && String(S.merch) === v) || (a === 'zone' && S.zone === v)
        || (a === 'band' && S.band === v) || (a === 'delay' && S.delay === v)
        || (a === 'prog' && S.prog === v) || (a === 'table' && S.table) || (a === 'old' && S.old === 'only');
      chips[c].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // ---------- one merchant's series, full size ----------
  // The inline sparklines answer "who is different"; they cannot answer "what happened on the 6th",
  // and at 104x22 they never will. This is the other half of that: the same three series with an
  // axis, a scale and the numbers underneath. It is drawn ON DEMAND, so the 24 cells in the table
  // cost the file nothing extra — and a per-row scale is finally the RIGHT answer here, because
  // there is only one row in it.
  var SK = { m: -1, s: '' };

  function skClose() { var w = el('skwrap'); if (w) w.parentNode.removeChild(w); SK.m = -1; }

  function skPath(vals, X, Y) {
    var d = '';
    for (var i = 0; i < vals.length; i++) d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(vals[i]).toFixed(1);
    return d;
  }

  function skDraw() {
    if (SK.m < 0) return;
    var M = D.merchants[SK.m], sr = D.series[SK.m];
    if (!sr) return;
    var kind = SK.s === 'c' ? 'due' : SK.s === 'r' ? 'rem' : 'back';
    var vals = kind === 'due' ? sr.due : kind === 'rem' ? sr.rem : sr.back;
    var met = sr.met;
    var n = vals.length;
    var W = 760, H = 240, L = 44, T = 16, B = 34, R = 14;
    var top = 1;
    for (var i0 = 0; i0 < n; i0++) if (vals[i0] > top) top = vals[i0];
    var X = function (i) { return n < 2 ? L : L + (i * (W - L - R)) / (n - 1); };
    var Y = function (v) { return T + (H - T - B) * (1 - Math.min(1, v / top)); };
    var bw = (W - L - R) / Math.max(1, n);

    var title = kind === 'due' ? 'Work due, and how much of it cleared'
      : kind === 'rem' ? 'Remarks written per day' : 'Overdue backlog, day by day';
    var s2 = '<div class="skwrap" id="skwrap"><div class="skbox" role="dialog" aria-modal="true">';
    s2 += '<div class="skh"><span class="sw" style="background:' + M.color + '"></span><b>'
      + esc(M.display) + '</b> <span class="faint">' + esc(title) + '</span>'
      + '<button class="skx" data-act="skx">Close</button></div>';
    s2 += '<div class="sksub">' + D.days.length + ' working days to ' + dmy(D.days[D.days.length - 1])
      + '. This one is scaled to ' + esc(M.display) + ' alone — the small charts in the table share a'
      + ' scale so they can be compared with each other.</div>';
    s2 += '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(M.display + ' — ' + title) + '">';
    for (var g = 0; g <= 2; g++) {
      var gv = Math.round((top * g) / 2), gy = Y(gv);
      s2 += '<line class="grid" x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) + '"/>';
      s2 += '<text class="ax" x="' + (L - 7) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + gv + '</text>';
    }
    for (var k = 0; k < n; k++) {
      if (n <= 22 || k % 2 === 0) {
        s2 += '<text class="ax" x="' + X(k).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">'
          + esc(dmy(D.days[k]).slice(0, 5)) + '</text>';
      }
    }
    if (kind === 'back') {
      s2 += '<path d="' + skPath(vals, X, Y) + '" fill="none" stroke="' + M.color + '" stroke-width="2"/>';
    } else {
      var bwr = Math.max(2, bw - 3);
      for (var b = 0; b < n; b++) {
        if (!(vals[b] > 0)) continue;
        var x = X(b) - bwr / 2, y = Y(vals[b]), hh = (H - B) - y;
        s2 += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bwr.toFixed(1)
          + '" height="' + hh.toFixed(1) + '" fill="' + (kind === 'due' ? '#d9d7d0' : M.color) + '"/>';
        if (kind !== 'due') continue;
        var mv = met[b] || 0;
        if (!(mv > 0)) continue;
        var my = Y(mv);
        s2 += '<rect x="' + x.toFixed(1) + '" y="' + my.toFixed(1) + '" width="' + bwr.toFixed(1)
          + '" height="' + ((H - B) - my).toFixed(1) + '" fill="' + M.color + '"/>';
      }
    }
    s2 += '</svg>';

    var tot = 0, i2;
    for (i2 = 0; i2 < n; i2++) tot += vals[i2];
    s2 += '<div class="skfig">';
    if (kind === 'due') {
      var tm = 0;
      for (i2 = 0; i2 < n; i2++) tm += met[i2] || 0;
      s2 += '<span><b>' + tot + '</b> tasks fell due</span><span><b>' + tm
        + '</b> cleared on their day</span><span><b>' + (tot ? Math.round((100 * tm) / tot) : 0)
        + '%</b> hit rate</span>';
    } else if (kind === 'rem') {
      s2 += '<span><b>' + tot + '</b> remarks in the window</span><span><b>'
        + (Math.round((10 * tot) / Math.max(1, n)) / 10) + '</b> per working day</span>';
    } else {
      var d0 = vals[0], d1 = vals[n - 1];
      s2 += '<span>opened at <b>' + d0 + '</b></span><span>stands at <b>' + d1
        + '</b></span><span>' + (d1 - d0 >= 0 ? '+' : '') + (d1 - d0) + ' over the window</span>';
    }
    s2 += '</div></div></div>';

    var wrap = document.createElement('div');
    wrap.innerHTML = s2;
    // Into #app, NOT document.body: the click listener is delegated on #app, so a backdrop
    // appended outside it can never be heard and the panel would only close via Escape.
    el('app').appendChild(wrap.firstChild);
  }

  // ---------- events: all delegated, none per-row ----------
  document.getElementById('app').addEventListener('click', function (ev) {
    // an ⓘ closes when you click away from it. <details> alone would stay open until clicked
    // again, and two open reference panels overlapping the chart is the thing to avoid.
    // the full-size panel is modal: a click on its backdrop, or on Close, dismisses it, and
    // nothing behind it responds while it is open.
    if (SK.m >= 0) {
      var inBox = ev.target.closest ? ev.target.closest('.skbox') : null;
      var xb = ev.target.closest ? ev.target.closest('[data-act="skx"]') : null;
      if (!inBox || xb) { skClose(); return; }
      return;
    }
    var sk = ev.target.closest ? ev.target.closest('[data-act="sk"]') : null;
    if (sk) {
      SK.m = +sk.getAttribute('data-m');
      SK.s = sk.getAttribute('data-s');
      skDraw();
      return;
    }
    var here = ev.target.closest ? ev.target.closest('details.ii') : null;
    var tips = document.querySelectorAll('details.ii[open]');
    for (var ti = 0; ti < tips.length; ti++) if (tips[ti] !== here) tips[ti].removeAttribute('open');
    if (here) return;
    var d = ev.target.closest ? ev.target.closest('[data-i]') : null;
    if (d) { S.sel = +d.getAttribute('data-i'); render(); return; }
    var a = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!a) return;
    var act = a.getAttribute('data-act'), v = a.getAttribute('data-v');
    if (act === 'zoom') S.zoom = v;
    else if (act === 'group') S.group = v;
    else if (act === 'merch') S.merch = (S.merch === +v ? -1 : +v);
    else if (act === 'zone') S.zone = (S.zone === v ? '' : v);
    else if (act === 'band') S.band = (S.band === v ? '' : v);
    else if (act === 'delay') S.delay = (S.delay === v ? '' : v);
    else if (act === 'prog') S.prog = (S.prog === v ? '' : v);
    // clicking a gutter bar narrows to the pre-window pile AND opens the table — those rows have
    // no column to live in, so a list is the only place they can actually be read
    else if (act === 'old') { var on = S.old === 'only'; S.old = on ? '' : 'only'; S.table = !on; }
    else if (act === 'table') S.table = !S.table;
    else if (act === 'clear') { S.merch = -1; S.res = -1; S.zone = ''; S.band = ''; S.delay = ''; S.prog = ''; S.old = ''; S.q = ''; el('q').value = ''; el('res').value = '-1'; }
    render();
  });
  document.getElementById('app').addEventListener('input', function (ev) {
    if (ev.target.id === 'q') { S.q = ev.target.value.trim().toLowerCase(); render(); }
    else if (ev.target.id === 'res') { S.res = +ev.target.value; render(); }
  });
  // Sections fold. Folding one leaves its heading — and therefore its i — in the DOM, so an open
  // reference panel would hang under a collapsed title; and the map and the ladder size themselves
  // from their host's clientWidth, which reads 0 inside a closed details, so a section reopened
  // after the window moved must redraw. toggle does NOT bubble, hence the capture-phase delegate.
  var closedOnce = {};
  document.getElementById('app').addEventListener('toggle', function (ev) {
    var sc = ev.target;
    if (!sc.classList || !sc.classList.contains('sec')) return;
    if (!sc.open) {
      closedOnce[sc.id] = 1;
      var tips = sc.querySelectorAll('details.ii[open]');
      for (var ti2 = 0; ti2 < tips.length; ti2++) tips[ti2].removeAttribute('open');
      return;
    }
    // every open section fires one toggle as the page settles; that is not a reopen, and
    // redrawing on it would draw the whole document twice before anyone has touched it
    if (closedOnce[sc.id]) render();
  }, true);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && SK.m >= 0) skClose();
  });
  var t = null;
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(render, 150); });

  render();
})();
`,P=18;function h(a){return String(a).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t])}const ee=a=>a==null?"nil":a>1+1e-6?"over":a>=.8?"near":"ok",j={merchant:!0,lead:!0,owner:!0},q={merchant:"Merchant",lead:"Team leader",owner:"Resource owner"};function te(a){return a.split(`
`).filter(t=>!/^\s*\/\//.test(t)).join(`
`)}function X(a,t){return`<details class="ii"><summary aria-label="${h(a)}" title="${h(a)}">i</summary><div class="iip"><div class="t">${h(a)}</div><ul>${t.map(s=>`<li>${s}</li>`).join("")}</ul></div></details>`}function E(a,t,s){return`<h2>${a}</h2>${X(t,s)}`}function O(a,t,s){return`<details class="sec" id="sec-${a}" open><summary class="h2row">${t}</summary><div class="secb">${s}</div></details>`}const ae=`
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${Y}; }
  body { font: 13px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${I}; }
  /* No max-width: the document fills the window edge to edge. The 1360px cap was inherited from the
     printable ancestor, where a measure that long is unreadable prose — but nothing left on this
     page is prose. The scoreboard, the load grid and the map all want every pixel they can get. */
  .doc { margin: 0; padding: 24px 30px 56px; background: ${T}; min-height: 100vh; }
  .h1row { display: flex; align-items: center; gap: 9px; }
  h1 { font-size: 21px; font-weight: 700; letter-spacing: -.015em; margin: 0; }
  .meta { font-size: 11.5px; color: ${c}; margin: 5px 0 0; }
  .meta b { color: ${$}; font-weight: 600; }
  /* A section head is a title + an ⓘ. The prose that used to sit under every heading — four
     sub-paragraphs and an eight-item methodology block, ~830px of the page — lives inside the ⓘ
     now: it is reference, read once, and it was costing a screen and a half of scrolling on every
     visit. <details> is deliberate over a scripted popover — it opens with no JS, so the reference
     survives a script failure exactly like the scoreboard and the load table do. */
  .h2row { display: flex; align-items: center; gap: 8px; margin: 30px 0 10px; padding-top: 16px; border-top: 1px solid ${x}; }
  .h2row h2 { margin: 0; padding: 0; border: 0; }
  h2 { font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
  /* Every section folds. The heading row is the <summary>, so it works with no JavaScript — and
     the disclosure triangle is a ::before on that row rather than markup, so head() still
     returns nothing but the title and its ⓘ. */
  details.sec { margin: 0; }
  details.sec > summary { cursor: pointer; list-style: none; }
  details.sec > summary::-webkit-details-marker { display: none; }
  details.sec > summary::marker { content: ''; }
  details.sec > summary::before { content: ''; flex: none; width: 0; height: 0; margin-right: 1px;
    border-left: 5px solid ${c}; border-top: 4px solid transparent; border-bottom: 4px solid transparent;
    transform: rotate(0deg); transition: transform .12s ease; }
  details.sec[open] > summary::before { transform: rotate(90deg); }
  details.sec > summary:hover h2 { color: ${S}; }
  details.sec > summary:hover::before { border-left-color: ${S}; }
  details.sec > summary:focus-visible { outline: 2px solid ${S}; outline-offset: 2px; }
  /* An ⓘ lives in the summary, so it survives its own section being folded and would hang its
     panel under a collapsed heading. Hide it there — CSS, so it holds without the runtime. */
  details.sec:not([open]) .iip { display: none; }
  .ii { position: relative; display: inline-block; }
  .ii > summary { list-style: none; cursor: pointer; width: 17px; height: 17px; border-radius: 999px; border: 1px solid ${x}; background: ${M}; color: ${c}; font-size: 11px; font-weight: 700; font-style: italic; line-height: 15px; text-align: center; user-select: none; }
  .ii > summary::-webkit-details-marker { display: none; }
  .ii > summary::marker { content: ''; }
  .ii > summary:hover { border-color: ${S}; color: ${S}; }
  .ii[open] > summary { background: ${S}; border-color: ${S}; color: #fff; }
  .iip { position: absolute; z-index: 60; top: 25px; left: -7px; width: min(560px, 80vw); background: ${T}; border: 1px solid ${x}; border-radius: 10px; padding: 12px 15px 13px; box-shadow: 0 10px 30px rgba(19,19,22,.16); }
  .iip .t { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: ${c}; margin-bottom: 7px; }
  .iip ul { margin: 0; padding-left: 15px; }
  .iip li { font-size: 11.5px; line-height: 1.5; color: ${$}; margin: 5px 0; }
  .iip li b { color: ${I}; font-weight: 650; }
  .faint { color: ${c}; }
  .late { color: ${z}; font-weight: 650; }
  b.late { font-weight: 700; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .nw { white-space: nowrap; }
  .note { font-size: 11.5px; color: ${c}; margin: 8px 0; }

  /* KPI strip — 3 across, 2 down (the app's own KpiPanel shape), not one thin row of six. */
  .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
  @media (max-width: 780px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .tile { background: ${M}; border-radius: 10px; padding: 11px 15px 10px; }
  .tile .l { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: ${c}; }
  .tile .v { font-size: 22px; font-weight: 650; margin-top: 2px; }
  .tile .v small { font-size: 12px; font-weight: 600; color: ${c}; margin-left: 2px; }
  .tile.bad .v { color: ${z}; }
  .tile.trend .v { font-size: 18px; }
  .tile .sub { font-size: 10.5px; color: ${c}; margin-top: 2px; }
  /* "49 of 78" — the denominator is context, not the headline, so it never competes with the
     figure it qualifies. Kept out of .bad's red for the same reason. */
  .tile .v .of { font-size: 13px; font-weight: 600; color: ${c}; }
  .tile.bad .v .of { color: ${c}; }

  /* scoreboard */
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: ${c}; text-align: left; padding: 5px 8px 5px 0; border-bottom: 1px solid ${x}; }
  td { padding: 7px 8px 7px 0; border-bottom: 1px solid ${F}; vertical-align: middle; font-size: 12.5px; }
  th.num { text-align: right; }
  .sb .rk { width: 34px; color: ${c}; font-variant-numeric: tabular-nums; }
  .sb .mname { font-weight: 650; white-space: nowrap; }
  .sw { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 7px; vertical-align: -1px; }
  .sbwrap { overflow-x: auto; }
  .sbwrap table { min-width: 960px; }
  .sb .spark { width: 104px; padding-right: 4px; cursor: pointer; border-radius: 4px; }
  .sb .spark svg { display: block; }
  .sb .spark:hover, .sb .spark:focus-visible { background: ${M}; outline: none; box-shadow: 0 0 0 1px ${x}; }

  /* The full-size read of one sparkline. Drawn by the runtime on demand, so it costs the file
     nothing until somebody asks for it — and it is where a PER-ROW scale is finally the right
     answer, because there is only one row in it. */
  .skwrap { position: fixed; inset: 0; z-index: 90; background: rgba(19,19,22,.34); display: flex; align-items: center; justify-content: center; padding: 20px; }
  .skbox { background: ${T}; border: 1px solid ${x}; border-radius: 12px; box-shadow: 0 18px 50px rgba(19,19,22,.28); width: min(820px, 100%); max-height: 88vh; overflow: auto; padding: 16px 18px 18px; }
  .skbox .skh { display: flex; align-items: center; gap: 9px; margin-bottom: 2px; }
  .skbox .skh b { font-size: 14px; }
  .skbox .skx { margin-left: auto; cursor: pointer; border: 1px solid ${x}; background: ${M}; color: ${$}; border-radius: 7px; font: inherit; font-size: 12px; padding: 3px 9px; }
  .skbox .sksub { font-size: 11.5px; color: ${c}; margin-bottom: 10px; }
  .skbox .skfig { font-size: 11.5px; color: ${$}; margin-top: 8px; display: flex; flex-wrap: wrap; gap: 3px 18px; }
  .skbox .skfig b { font-weight: 650; }
  .skbox svg { display: block; width: 100%; height: auto; }
  .skbox .ax { font-size: 9.5px; fill: ${c}; }
  .skbox .grid { stroke: ${F}; stroke-width: 1; }
  .sb tr.unas td { color: ${c}; }
  /* the owner scoreboard is the page's widest table: 14 columns of mostly numbers */
  .sbwrap table.ow { min-width: 1180px; }
  .sbwrap table.ow2 { min-width: 860px; }
  .sb tr.thin td { color: ${c}; }
  .sb .cz { width: 124px; padding-right: 6px; }
  .sb .dag { color: ${z}; font-weight: 700; margin-left: 2px; cursor: help; }
  .sb .cz svg { display: block; border-radius: 2px; }
  h3.owh { font-size: 13px; font-weight: 650; margin: 26px 0 4px; letter-spacing: -.005em; }
  details.sub { margin-top: 10px; border-top: 1px solid ${F}; }
  details.sub > summary { cursor: pointer; padding: 7px 0; font-weight: 650; font-size: 12.5px; list-style: none; }
  details.sub > summary::-webkit-details-marker { display: none; }
  details.sub > summary::before { content: 'B8'; display: inline-block; width: 13px; color: ${c}; }
  details.sub[open] > summary::before { content: 'BE'; }

  /* who-answers board. Same table furniture as the scoreboard — it is a second board, not a
     second design — with a meter instead of a sparkline: one bounded ratio reads better as a
     filled bar than as twenty daily columns. */
  .pp .pname { font-weight: 650; white-space: nowrap; }
  .pp .hnd { font-weight: 400; color: ${c}; font-size: 11px; margin-left: 5px; }
  /* The role sits under the name, not in a column: it says why these rows and not others, and a
     low answered rate means a different thing for a lane owner than for the merchant chasing them. */
  .pp .prole { display: block; font-weight: 400; font-size: 10.5px; color: ${c}; letter-spacing: .01em; }
  .pp td.num, .pp th.num { font-variant-numeric: tabular-nums; }
  .pp .mtr { width: 92px; }
  .pp .mtr .bar { height: 7px; border-radius: 999px; background: ${x}; overflow: hidden; }
  .pp .bar > i { display: block; height: 100%; border-radius: 999px; background: ${S}; }
  .pp .wait { font-weight: 700; }
  .pp .none { color: ${c}; }
  .sbcap { font-size: 10px; color: ${c}; font-weight: 600; }

  .chip { font-size: 9.5px; font-weight: 700; letter-spacing: .04em; border-radius: 999px; padding: 2px 7px; white-space: nowrap; }
  .chip.green { background: ${R.green.bg}; color: ${R.green.ink}; }
  .chip.amber { background: ${R.amber.bg}; color: ${R.amber.ink}; }
  .chip.red { background: ${R.red.bg}; color: ${R.red.ink}; }

  /* controls */
  /* THE CHOICES SIT BESIDE THE MAP, NOT ABOVE IT. Three full-width control bars used to push the
     plot 166px down the page (235px once they wrapped) while the 320px right-hand column held only
     the detail panel — 80px of content over 634px of nothing. Same pixels, better spent: the
     controls fill the column, and the map starts under its own heading. */
  .ctl { grid-area: 2 / 2 / 3 / 3; background: ${M}; border-radius: 10px; padding: 9px 11px; display: flex; flex-direction: column; gap: 7px; }
  .crow { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 6px; align-items: start; }
  .crow > .cap { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: ${c}; padding-top: 6px; margin: 0; white-space: nowrap; }
  .ctl input.f, .ctl select.f { width: 100%; }
  .grp { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
  .grp > .cap { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: ${c}; margin-right: 3px; }
  button.f { font: inherit; font-size: 11.5px; line-height: 1; padding: 5px 9px; border-radius: 999px; border: 1px solid ${x}; background: ${T}; color: ${$}; cursor: pointer; }
  button.f:hover { border-color: #c9c8c2; }
  button.f[aria-pressed="true"] { background: ${S}; border-color: ${S}; color: #fff; font-weight: 650; }
  input.f, select.f { font: inherit; font-size: 11.5px; padding: 5px 8px; border-radius: 7px; border: 1px solid ${x}; background: ${T}; color: ${I}; }
  input.f { width: 190px; }
  .vsum { font-size: 11.5px; color: ${$}; font-variant-numeric: tabular-nums; }
  .vsum b { font-weight: 700; }

  /* the map */
  .maprow { display: grid; grid-template-columns: minmax(0,1fr) 320px; grid-template-rows: auto 1fr; gap: 16px; align-items: start; }
  .mapcol { grid-area: 1 / 1 / 3 / 2; min-width: 0; }
  /* the count of what is drawn belongs WITH the drawing, not in the column you just looked away
     from — and on one line with the caption, where the two stop repeating each other */
  .mapfoot { display: flex; flex-wrap: wrap; gap: 2px 18px; align-items: baseline; }
  .mapfoot .note { margin: 8px 0 0; }
  /* scrollbar-gutter is load-bearing, not polish: the runtime sizes the columns from the box's
     clientWidth, and without a reserved gutter that measurement is taken before the vertical
     scrollbar appears — so the plot came out ~15px too wide and scrolled sideways for nothing. */
  .mapbox { overflow: auto; scrollbar-gutter: stable; max-height: 680px; border: 1px solid ${x}; border-radius: 10px; background: ${T}; }
  /* The lane column FREEZES while the plot scrolls sideways — sticky inside the same scroller, so
     the two panels share one vertical scroll for free and can never drift apart. It has to paint
     an opaque ground of its own, or the dots slide under it. */
  #map .mapflex { display: flex; width: max-content; }
  #map .maplab { position: sticky; left: 0; z-index: 3; background: ${T}; box-shadow: 1px 0 0 ${x}; }
  #map svg { display: block; }
  #map text { font: 11px system-ui, sans-serif; fill: ${$}; }
  #map text.lane { font-size: 11.5px; fill: ${I}; }
  #map text.lanen { font-size: 10.5px; fill: ${c}; font-variant-numeric: tabular-nums; }
  #map .ax text { font-size: 9.5px; fill: ${c}; }
  #map .ax text.gut { font-style: italic; }
  #map .zebra { fill: #faf9f7; }
  #map .sep { stroke: ${x}; stroke-dasharray: 3 3; }
  #map .d { cursor: pointer; }
  #map .d:hover circle:first-child, #map .d:hover path { opacity: .72; }
  #map .d.sel circle:first-child, #map .d.sel path:first-child { stroke-width: 2.6; }
  #map .chip circle { fill: ${M}; stroke: ${x}; }
  #map .chip text { font-size: 9px; font-weight: 700; fill: ${$}; }
  #map .chip { cursor: default; }
  #map .gbar { cursor: pointer; }
  #map .gbar:hover rect { opacity: .55; }
  #map .gbar text { font-size: 10.5px; font-weight: 650; fill: ${$}; }
  /* the ladder — an ORDINAL y axis, so there is no value scale and no gridlines: the rank pitch
     is the grid, and a line crossing another is the whole point of the chart. */
  #ladder svg { display: block; }
  #ladder .ln { fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
  #ladder .m.hi .ln { stroke-width: 3.6; }
  #ladder .m.dim { opacity: .26; }
  #ladder .mk { stroke: ${T}; stroke-width: 1.2; }
  #ladder text.ax { font: 9.5px system-ui, sans-serif; fill: ${c}; }
  #ladder text.rk { font: 10.5px system-ui, sans-serif; font-weight: 700; fill: ${c}; }
  #ladder text.nm { font: 11.5px system-ui, sans-serif; font-weight: 650; }
  #ladder text.sc { font: 11px system-ui, sans-serif; fill: ${$}; font-variant-numeric: tabular-nums; }
  #ladder text.mv { font: 10.5px system-ui, sans-serif; font-weight: 700; }
  #ladder text.mv.up { fill: ${H}; }
  #ladder text.mv.dn { fill: ${z}; }
  #ladder text.mv.fl { fill: ${c}; }
  #ladder .wl { fill: none; stroke: ${c}; stroke-width: 1.3; stroke-dasharray: 5 4; }
  #ladder text.wlb { font: 9.5px system-ui, sans-serif; fill: ${c}; }
  #ladder .m { cursor: pointer; }

  /* detail */
  .detail { grid-area: 1 / 2 / 2 / 3; border: 1px solid ${x}; border-radius: 10px; padding: 13px 14px; background: ${M}; min-height: 240px; max-height: 340px; overflow: auto; }
  .detail .hint { font-size: 11.5px; color: ${c}; margin: 0; }
  @media (max-width: 900px) {
    /* stacked, the controls must come FIRST — stranding them below a 680px-tall map and a detail
       panel would mean scrolling away from the thing you are filtering to filter it. */
    .maprow { grid-template-columns: minmax(0,1fr); grid-template-rows: auto auto auto; }
    .ctl { grid-area: 1 / 1 / 2 / 2; flex-direction: row; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
    .mapcol { grid-area: 2 / 1 / 3 / 2; }
    .detail { grid-area: 3 / 1 / 4 / 2; min-height: 0; max-height: none; }
    .crow { display: flex; gap: 4px; align-items: center; }
    .crow > .cap { padding-top: 0; }
    .ctl input.f { width: 190px; }
    .ctl select.f { width: auto; max-width: 100%; }
    .grp.wide { flex: 1 1 100%; }
  }
  .dt-h { font-size: 13px; margin-bottom: 9px; line-height: 1.35; }
  .dt-h .sw { width: 10px; height: 10px; }
  .dt-t th { text-transform: none; letter-spacing: 0; font-size: 10.5px; font-weight: 600; border: 0; padding: 3px 10px 3px 0; width: 108px; vertical-align: top; }
  .dt-t td { border: 0; padding: 3px 0; font-size: 12px; }
  .dt-r { margin-top: 11px; border-top: 1px solid ${x}; padding-top: 9px; }
  .dt-rh { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: ${c}; margin-bottom: 6px; }
  .rm { margin-bottom: 8px; font-size: 12px; }
  .rm-b { font-size: 10.5px; color: ${c}; }

  /* table view */
  .tv td { font-size: 12px; }
  .tv tr { cursor: pointer; }
  .tv tr:hover td { background: ${M}; }

  /* load */
  .strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 14px 0 18px; }
  .scard { background: ${M}; border-radius: 10px; padding: 10px 13px; font-size: 12px; }
  .scard .l { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: ${c}; margin-bottom: 3px; }
  .scard .big { font-size: 15px; font-weight: 650; }
  .scard .row { display: flex; justify-content: space-between; gap: 8px; padding: 1.5px 0; }
  .scard .row .n { font-variant-numeric: tabular-nums; color: ${$}; white-space: nowrap; }
  .loadwrap { overflow-x: auto; }
  .loadt th.wk, .loadt td.cell { text-align: center; padding-left: 2px; padding-right: 2px; min-width: 42px; }
  .loadt td.cell { font-variant-numeric: tabular-nums; font-size: 11.5px; }
  .cell.ok { background: ${D.ok.bg}; color: ${D.ok.ink}; }
  .cell.near { background: ${D.near.bg}; color: ${D.near.ink}; }
  .cell.over { background: ${D.over.bg}; color: ${D.over.ink}; font-weight: 700; }
  .cell.nil { color: ${D.nil.ink}; }
  .cell .od { font-size: 9px; vertical-align: super; }
  .loadt .rname { font-weight: 600; }
  .loadt .team, .loadt .cap { color: ${$}; font-size: 11.5px; white-space: nowrap; }
  .alts { font-size: 11.5px; }
  .alts .via { color: ${c}; font-size: 10.5px; margin-bottom: 2px; }
  .alts .v { display: block; }
  .alts .v b { font-weight: 650; }
  .alts .v .n { color: ${c}; font-variant-numeric: tabular-nums; }
  .tag { font-size: 9px; font-weight: 700; border-radius: 4px; padding: 1px 4px; margin-left: 4px; vertical-align: 1px; }
  .tag.ih { background: ${R.green.bg}; color: ${R.green.ink}; }
  .tag.ia { background: #e3edfa; color: #1c5cab; }
  .nomatch { color: ${c}; font-size: 11px; }
  details.grid > summary { cursor: pointer; font-size: 12.5px; font-weight: 600; color: ${S}; margin: 10px 0; }

  .foot { margin-top: 30px; border-top: 1px solid ${x}; padding-top: 12px; font-size: 10.5px; color: ${c}; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 10.5px; color: ${c}; margin: 8px 0 0; }
  .legend b { color: ${$}; font-weight: 650; }
  noscript .ns { background: ${R.amber.bg}; color: ${R.amber.ink}; padding: 9px 12px; border-radius: 8px; display: block; font-size: 12px; margin: 14px 0; }
`;function se(a,t,s,l=104,r=22){const d=Math.max(1,a.length),m=s>0?s:1,p=l/d,g=Math.round(Math.max(1,p-1)*10)/10;let f="";return a.forEach((u,i)=>{if(u==null||u<=0)return;const o=Math.round(i*p*10)/10,n=Math.round(Math.max(1.5,Math.min(1,u/m)*(r-2))*10)/10;f+=`M${o} ${Math.round((r-n)*10)/10}h${g}v${n}h-${g}z`}),`<svg width="${l}" height="${r}" viewBox="0 0 ${l} ${r}" aria-hidden="true">`+(f?`<path d="${f}" fill="${t}" opacity=".85"/>`:"")+"</svg>"}function re(a,t,s,l,r=104,d=22){const m=Math.max(1,a.length),p=l>0?l:1,g=r/m,f=Math.round(Math.max(1,g-1)*10)/10;let u="",i="";return a.forEach((o,n)=>{if(!(o>0))return;const k=Math.round(n*g*10)/10,b=Math.round(Math.max(2.5,Math.min(1,o/p)*(d-2))*10)/10;u+=`M${k} ${Math.round((d-b)*10)/10}h${f}v${b}h-${f}z`;const e=t[n]||0;if(e<=0)return;const w=Math.round(Math.max(1.5,Math.min(1,e/o)*b)*10)/10;i+=`M${k} ${Math.round((d-w)*10)/10}h${f}v${w}h-${f}z`}),`<svg width="${r}" height="${d}" viewBox="0 0 ${r} ${d}" aria-hidden="true">`+(u?`<path d="${u}" fill="${x}"/>`:"")+(i?`<path d="${i}" fill="${s}"/>`:"")+"</svg>"}function ne(a,t,s,l=104,r=22){const d=a.length;if(!d)return`<svg width="${l}" height="${r}"></svg>`;const m=s>0?s:1,p=u=>d<2?0:u*l/(d-1),g=u=>r-1-Math.min(1,u/m)*(r-3),f=a.map((u,i)=>`${i?"L":"M"}${p(i).toFixed(1)} ${g(u).toFixed(1)}`).join("");return`<svg width="${l}" height="${r}" viewBox="0 0 ${l} ${r}" aria-hidden="true"><path d="M0 ${r-1}h${l}" stroke="${F}" stroke-width="1" fill="none"/><path d="${f}" fill="none" stroke="${t}" stroke-width="1.6"/><circle cx="${p(d-1).toFixed(1)}" cy="${g(a[d-1]).toFixed(1)}" r="2" fill="${t}"/></svg>`}function oe(a){const t=a.kpis,s=a.metrics.portfolio.daily,l=s.length?s[0].back.open:0,r=s.length?s[s.length-1].back.open:0,d=r-l,m=a.metrics.dailyDays.length,p=(b,e,w=!1,A="",L="")=>`<div class="tile${w?" bad":""}"><div class="l">${h(b)}</div><div class="v">${e}${A?`<small>${h(A)}</small>`:""}</div>${L?`<div class="sub">${L}</div>`:""}</div>`,g=s.reduce((b,e)=>b+e.back.added,0),f=s.reduce((b,e)=>b+e.back.cleared,0),u=s.reduce((b,e)=>b+e.clear.due,0),i=s.reduce((b,e)=>b+e.clear.met,0),o=f>0?Math.round(10*g/f)/10:null,n=u>0?Math.round(1e3*i/u)/10:null,k=b=>m?String(Math.round(10*b/m)/10):"—";return O("kpis",E("The headline numbers","Reading the tiles",["Every tile counts the SAME task set the rest of the page walks — overdue leaf work on schedulable orders. The masthead ⓘ says exactly what that excludes.","<b>Arriving vs cleared</b> and <b>Cleared on its day</b> are FLOWS over the last 20 working days; <b>Backlog trend</b> is the STOCK either side of that window. They do not close arithmetically — day one's pile is a level the window's flows never explain — so the tiles state the rates and never invite you to balance them.","Red marks a <b>breach</b>, never merely a number above zero. Every overdue task is late by definition, so reddening the median for being positive would redden it always.","<b>Nothing recorded</b> is the INTERSECTION of three near-identical absences — never started, nothing reported, never remarked. Measured on this document they are 98% the same tasks, so they ship as one count rather than three percentages in a row."]),`<div class="kpis">
    ${p("Overdue tasks",String(t.overdueTasks),t.overdueTasks>0)}
    ${p("Orders affected",String(t.ordersOverdue),!1,"",t.halfBacklogOrders>0?`${t.halfBacklogOrders} of them hold half the late work`:"")}
    ${p("Merchants affected",String(t.merchantsAffected))}
    ${p("Missed shipments",String(t.missed),t.missed>0,"",t.missed>0?`median ${t.missedMedianDays} days past &middot; worst ${t.missedWorstDays}`:"")}
    <div class="tile trend"><div class="l">Backlog trend</div><div class="v">${l} &rarr; <b class="${d>0?"late":""}">${r}</b></div><div class="sub">${d>=0?"+":""}${d} over ${m} working days</div></div>
    ${p("Never remarked",`${a.metrics.portfolio.follow.silentPct}`,a.metrics.portfolio.follow.silentPct>50,"%","of overdue work")}
    ${p("Days late · median",String(t.medianLate),!1," wd",`p90 ${t.p90Late} &middot; worst ${t.worstLate} working days`)}
    ${p("Arriving vs cleared",o==null?"—":o.toFixed(1),o!=null&&o>1,o==null?"":"×",`${k(g)} fell late per working day against ${k(f)} cleared`)}
    ${p("Cleared on its day",n==null?"—":`${n}`,n!=null&&n<50,n==null?"":"%",`${i} of ${u} tasks that fell due in the window`)}
    ${p("ACT NOW orders",`${t.actNowOrders} <span class="of">of ${t.ordersOverdue}</span>`,t.actNowOrders*2>t.ordersOverdue,"",`holding ${t.actNowTasks} of the overdue tasks`)}
    ${p("Ships at risk · 30d",`${t.shipsNext30AtRisk} <span class="of">of ${t.shipsNext30}</span>`,t.shipsNext30AtRisk>0,"","shipping within 30 days, already carrying overdue work")}
    ${p("Nothing recorded",String(t.darkTasks),t.darkTasks*2>t.overdueTasks,"","no start, nothing reported, never remarked")}
    ${t.dataErrors?p("Data errors",String(t.dataErrors),!0):""}
  </div>`)}function ie(a){const t=new Map(a.metrics.merchants.map(i=>[i.merchant,i])),s=a.metrics.merchants.reduce((i,o)=>o.daily.reduce((n,k)=>Math.max(n,k.rem.n),i),0),l=a.metrics.merchants.reduce((i,o)=>o.daily.reduce((n,k)=>Math.max(n,k.back.open),i),0),r=a.metrics.merchants.flatMap(i=>i.daily.map(o=>o.clear.due)).filter(i=>i>0).sort((i,o)=>i-o),d=r.length?r[Math.min(r.length-1,Math.floor(.9*r.length))]:1,p=(i=>{const o=10**Math.floor(Math.log10(Math.max(1,i)));for(const n of[1,2,5,10])if(i<=n*o)return n*o;return 10*o})(d),g=a.board.map(i=>{const o=t.get(i.merchant);if(!o)return"";const n=o.daily.reduce((y,v)=>y+v.clear.due,0),k=o.daily.reduce((y,v)=>y+v.clear.met,0),b=n?Math.round(k/n*100):null,e=o.daily.map(y=>y.back.open),w=o.daily.map(y=>y.rem.n),A=o.follow,L=a.metrics.merchants.indexOf(o),N=(y,v)=>`<td class="spark" data-act="sk" data-m="${L}" data-s="${y}" tabindex="0">${v}</td>`;return`<tr${i.unassigned?' class="unas"':""}>
      <td class="rk">${i.rank}</td>
      <td class="mname"><span class="sw" style="background:${o.color}"></span>${h(o.display)}</td>
      <td class="num">${i.overdue}</td>
      <td class="num faint">${i.active}</td>
      <td class="num">${i.avgDelay}</td>
      <td class="num">${i.worst}</td>
      <td class="num">${b==null?'<span class="faint">—</span>':b+"%"}</td>
      ${N("c",re(o.daily.map(y=>y.clear.due),o.daily.map(y=>y.clear.met),o.color,p))}
      <td class="num">${o.remarkStat.perWorkingDay}</td>
      ${N("r",se(w,o.color,s))}
      <td class="num${A.silentPct>80?" late":""}">${A.silentPct}%</td>
      <td class="num">${A.medianLag==null?'<span class="faint">—</span>':A.medianLag}<span class="faint"> (${A.responded})</span></td>
      ${N("b",ne(e,o.color,l))}
      <td class="num">${e.length?e[e.length-1]:0}</td>
    </tr>`}).join(""),f=a.metrics.dailyDays.length,u=a.metrics;return O("merchants",E(`Merchants <span class="faint" style="font-weight:400;font-size:11.5px">last ${f} working days</span>`,"Reading the merchant table",["<b>Cleared</b> — of the work scheduled to finish on a day, how much was reported done by that day. A finish is stamped with the STATUS DATE it was recorded under, not the day the work ended, so a merchant who files Friday's finishes on Monday reads as Monday.","<b>The three little charts share ONE scale down the column</b>, so their heights are comparable between merchants. They used to be scaled to each row&rsquo;s own maximum, which made a merchant averaging 0.2 remarks a day draw the same bars as one averaging 6, and a backlog going 1 &rarr; 43 look like one going 334 &rarr; 442. <b>Click any of them</b> to open that merchant full size.","<b>Due &amp; cleared</b> — bar height is how much work fell due that day, the coloured part is how much of it was cleared. So a day with nothing due has no bar at all, and a day that cleared nothing is a full grey one; a single task cleared is a small full bar, not a triumph.","<b>Never remarked</b> — the share of their overdue tasks nobody has written a word about. This is the figure that separates merchants.",`<b>Response</b> — median working days from a task falling late to its first remark, over the count that got one (in brackets). Portfolio-wide only ${u.portfolio.follow.responded} of ${u.portfolio.follow.late} late tasks have been answered, so a speed figure alone would rank noise. Nothing records the day a task was ASSIGNED, so "did they follow up the day they got it" cannot be measured; this is the honest substitute.`,`<b>Remarks</b> count against the merchant who owns the ORDER, never whoever typed them — the author field is a display name, the merchant field is a scope key, and they need not match. Remark dates are wall-clock, so these charts run on a different clock from Cleared, deliberately. ${u.firstRemark?`The first remark here is dated ${W(new Date(u.firstRemark+"T00:00:00Z"))}; the blank before it is absence of the feature, not silence.`:"No remarks have been recorded yet."}`]),`<div class="sbwrap"><table class="sb">
    <thead><tr>
      <th>#</th><th>Merchant</th><th class="num">Overdue</th><th class="num">Active</th>
      <th class="num">Avg late</th><th class="num">Worst</th>
      <th class="num">Cleared</th><th class="sbcap">due &amp; cleared</th>
      <th class="num">Remarks/day</th><th class="sbcap">per day</th>
      <th class="num">Never remarked</th><th class="num">Response</th>
      <th class="sbcap">backlog</th><th class="num">Now</th>
    </tr></thead>
    <tbody>${g}</tbody>
  </table></div>`)}function le(a){const t=a.metrics.people.filter(e=>e.tagged>0||e.wrote>0),s=a.metrics.rosterJoined?t.filter(e=>e.role!=null&&j[e.role]):t,l=t.length-s.length,r=t.filter(e=>e.role!=null&&!j[e.role]).length,d=["<b>Who is listed</b> — merchants, team leads and resource owners. Administrators and anyone the account list cannot name are left out: this is a board about answering the work, and it counts only the people the work is asked of.","<b>Asked</b> — tags that asked them for a REPLY. A remark tags each person as either <b>Reply needed</b> or <b>FYI</b>; every tag written before that choice existed (15 Sep 2026) counts here, which is how it was read when it was written. Each tag counts once, so being asked twice on one task is two.","<b>Informed</b> — FYI tags: they were told something and nothing was owed, so these never reach the rate, the reply time or waiting.","<b>Answered</b> — of the asks, the ones where they then posted on that same task. It is a reply in the place the question was asked, which is the only follow-up this document can see; an answer given in person or on the phone is invisible here and that is a real limit of the measure.","<b>Waiting on them</b> — tasks where an ask is still unanswered by them, read over the WHOLE thread: a later note by somebody else does not close it. Unlike the other columns this is a state, not a history: it is what is open right now, and it is the column to act on.","<b>Median reply</b> — calendar days from the ask to their reply, over the ones they answered. Calendar, not working, days: a remark carries a wall-clock date.","Whether an FYI was <b>seen</b> is not in this file: read receipts live on the server, and this report is built from the schedule document alone.","<b>Wrote</b> / <b>threads</b> / <b>last word</b> describe how much they say, not how well they answer — a prolific author with a low answered rate is talking about their own work, not responding to other people.","This board counts <b>every remark in the document</b>, not only the overdue ones — the question is about a habit, and scoring someone only on late work would flatter whoever is asked about it least."];a.metrics.rosterJoined||d.push("<b>⚠ Names are unjoined.</b> The account list could not be read when this file was built, so the role filter could not be applied and everyone who has spoken is listed. A mention carries a login handle and an authored remark carries a display name, and those are different columns — so one person may appear as two rows here, one for what they wrote and one for what they were asked.");const m=E('Who answers <span class="faint" style="font-weight:400;font-size:11.5px">merchants &middot; leads &middot; owners, whole document</span>',"Reading the who-answers board",d);if(!s.length)return O("people",m,`<p class="note">${t.length?"Nobody in these roles has written or been asked about a remark yet.":"Nobody has written a remark yet, so there is nothing to answer for."}</p>`);const p=e=>Math.round(e*100),g=s.map(e=>{const w=e.rate==null?'<td class="num none">—</td><td class="mtr"></td>':`<td class="num">${p(e.rate)}%</td><td class="mtr"><div class="bar"><i style="width:${p(e.rate)}%"></i></div></td>`,A=e.role&&q[e.role]?`<span class="prole">${q[e.role]}</span>`:"";return`<tr>
      <td class="pname">${h(e.display)}${e.joined||e.display===e.key?"":`<span class="hnd">${h(e.key)}</span>`}${A}</td>
      <td class="num">${e.asked||'<span class="none">—</span>'}</td>
      <td class="num">${e.asked?e.answered:'<span class="none">—</span>'}</td>
      ${w}
      <td class="num">${e.medianLag==null?'<span class="none">—</span>':e.medianLag+"d"}</td>
      <td class="num wait">${e.waiting||'<span class="none">0</span>'}</td>
      <td class="num">${e.informed||'<span class="none">—</span>'}</td>
      <td class="num">${e.wrote}</td>
      <td class="num">${e.threads}</td>
      <td class="num">${e.lastWord}</td>
    </tr>`}).join(""),f=s.reduce((e,w)=>e+w.asked,0),u=s.reduce((e,w)=>e+w.answered,0),i=s.reduce((e,w)=>e+w.waiting,0),o=s.reduce((e,w)=>e+w.informed,0),n=o?` Plus ${o} FYI mention${o===1?"":"s"} that asked nothing.`:"",k=l?` Not listed: ${r?`${r} administrator${r===1?"":"s"}`:""}${r&&l>r?" and ":""}${l>r?`${l-r} name${l-r===1?"":"s"} the account list could not match`:""}.`:"",b=f?`Across these ${s.length} people: <b>${u} of ${f}</b> asks answered (${p(u/f)}%), <b>${i}</b> task${i===1?"":"s"} still waiting on somebody.${n}${k}`:"Nobody in these roles has been `-mentioned yet."+k;return O("people",m,`<div class="sbwrap"><table class="pp">
    <thead><tr>
      <th>Person</th>
      <th class="num">Asked</th><th class="num">Answered</th>
      <th class="num">Rate</th><th class="sbcap"></th>
      <th class="num">Median reply</th><th class="num">Waiting on them</th>
      <th class="num">Informed</th>
      <th class="num">Wrote</th><th class="num">Threads</th><th class="num">Last word</th>
    </tr></thead>
    <tbody>${g}</tbody>
  </table></div>
  <p class="note">${b}</p>`)}function de(a,t=116,s=15){const l=a.causeClean+a.causeUpstream+a.causePickup+a.causeOverrun;if(!l)return'<span class="faint">—</span>';const r=[[a.causeClean,H],[a.causeUpstream,C.none],[a.causePickup,U],[a.causeOverrun,z]];let d=0;const m=r.map(([g,f])=>{if(!g)return"";const u=g/l*t,i=`<rect x="${d.toFixed(1)}" y="0" width="${Math.max(u,.6).toFixed(1)}" height="${s}" fill="${f}"/>`;return d+=u,i}).join(""),p=`${a.causeClean} clean · ${a.causeUpstream} fed late · ${a.causePickup} waited at their door · ${a.causeOverrun} ran over`;return`<svg width="${t}" height="${s}" viewBox="0 0 ${t} ${s}" role="img" aria-label="${h(p)}"><title>${h(p)}</title>${m}</svg>`}function ce(a){var b;const t=a.owner,s=t.portfolio,l=t.onTimeUsable,r=(e,w)=>e==null?'<span class="faint">—</span>':`<span class="${e<w?"late":""}">${e}%</span>`,d=e=>e.qRows?e.qRework+e.qReject<=0?`<span class="faint">none in ${e.qRows.toLocaleString()} rcpt</span>`:`<span class="${(e.qYieldPct??100)<97?"late":""}">${e.qYieldPct}%</span><span class="faint"> · ${e.qRows.toLocaleString()} rcpt</span>`:'<span class="faint">—</span>',m=t.owners.filter(e=>e.tasks>0).map(e=>e.coveragePct),p=m.length?Math.min(...m):0,g=m.length?Math.max(...m):0,f=((b=t.owners.find(e=>e.sentinel))==null?void 0:b.pairs)??0,u=20,i=t.owners.map(e=>`<tr class="${e.sentinel?"unas":""}${e.ranked?"":" thin"}">
      <td class="rk">${e.rank?`${e.rank}${e.coveragePct<u?`<span class="dag" title="ranked on ${e.pairs} of ${e.tasks} tasks (${e.coveragePct}%) — thin evidence">&dagger;</span>`:""}`:'<span class="faint">—</span>'}</td>
      <td class="mname">${h(e.display)}<span class="faint" style="font-weight:400"> · ${e.lanes} lane${e.lanes===1?"":"s"}</span></td>
      <td class="num">${e.pairs}<span class="faint"> of ${e.tasks}</span></td>
      <td class="num${e.coveragePct<20?" late":""}">${e.coveragePct}%</td>
      <td class="num">${e.ranked?r(e.withinPct,40):'<span class="faint">no evidence</span>'}</td>
      <td class="num">${e.ratioMed==null?'<span class="faint">—</span>':`${e.ratioMed}&times;`}</td>
      <td class="num faint">${e.ratioP90==null?"—":`${e.ratioP90}&times;`}</td>
      <td class="num${(e.spread??0)>=5?" late":""}">${e.spread==null?'<span class="faint">—</span>':`${e.spread}&times;`}</td>
      <td class="num">${e.pickupMed==null?'<span class="faint">—</span>':e.pickupMed}<span class="faint"> / ${e.pickupP90??"—"}</span></td>
      ${l?`<td class="num">${r(e.onTimePct,40)}</td>`:""}
      <td class="cz">${de(e)}</td>
      <td class="num${(e.ownSharePct??0)>=70?" late":""}">${e.ownSharePct==null?'<span class="faint">—</span>':`${e.ownSharePct}%`}</td>
      <td class="num">${d(e)}</td>
      <td class="num">${e.overdue}<span class="faint"> · ${e.overdueMed}d</span></td>
      <td class="num">${e.stalled}<span class="faint"> / ${e.stalled3x}</span></td>
    </tr>`).join(""),o=t.calib.length?`<div class="sbwrap"><table class="sb ow2">
    <thead><tr>
      <th>Lane</th><th>Section</th><th>Owner</th><th class="num">Measured</th>
      <th class="num">Plan says</th><th class="num">Actually takes</th><th class="num">Ratio</th>
      <th class="num">p90</th><th class="num">Suggested</th>
    </tr></thead><tbody>${t.calib.slice(0,P).map(e=>`<tr>
      <td class="mname">${h(e.name)}</td>
      <td class="faint">${h(e.team)}</td>
      <td class="faint">${h(e.owner)}</td>
      <td class="num faint">${e.pairs}</td>
      <td class="num">${e.planMed}d</td>
      <td class="num">${e.actualMed}d</td>
      <td class="num${e.ratioMed>=2?" late":""}">${e.ratioMed}&times;</td>
      <td class="num faint">${e.ratioP90}&times;</td>
      <td class="num"><b>${e.suggest}d</b></td>
    </tr>`).join("")}</tbody></table></div>`:`<p class="note">No lane has reached ${_} completed tasks, so no duration standard can be re-set from evidence yet.</p>`,n=(e,w,A)=>{const L=w.filter(v=>v.pairs>0);if(!L.length)return"";const N=L.slice(0,A),y=L.length-N.length;return`<details class="sub"><summary>By ${h(e.toLowerCase())} <span class="faint">${N.length}${y>0?` of ${L.length}`:""}</span></summary>
      <div class="sbwrap"><table class="sb ow2"><thead><tr>
        <th>#</th><th>${h(e)}</th><th class="num">n</th>
        <th class="num">Within duration</th><th class="num">Ratio</th><th class="num">Spread</th>
        <th class="num">Overdue now</th>
      </tr></thead><tbody>${N.map(v=>`<tr${v.sentinel?' class="unas"':""}>
        <td class="rk">${v.rank||"&mdash;"}</td>
        <td class="mname">${h(v.display)}</td>
        <td class="num">${v.pairs}</td>
        <td class="num">${v.ranked?r(v.withinPct,40):'<span class="faint">below floor</span>'}</td>
        <td class="num">${v.ratioMed==null?"&mdash;":`${v.ratioMed}&times;`}</td>
        <td class="num">${v.spread==null?"&mdash;":`${v.spread}&times;`}</td>
        <td class="num">${v.overdue}</td>
      </tr>`).join("")}</tbody></table></div>
      ${y>0?`<p class="note">${y} further row${y===1?"":"s"} carry measured work but sit below the ${B}-task evidence floor; every ranked row is listed.</p>`:""}
    </details>`},k=t.belowFloor.length?` ${h(t.belowFloor.join(", "))} ${t.belowFloor.length===1?"holds":"hold"} fewer than ${B} completed tasks and ${t.belowFloor.length===1?"is":"are"} listed without a rank rather than scored on nothing.`:"";return O("owners",E('Resource owners <span class="faint" style="font-weight:400;font-size:11.5px">how the work ran</span>',"Reading the resource-owner table",[`<b>Within duration</b> is the headline, and it is the one figure here that owes nothing to the plan's dates: the recorded working days from actual start to actual finish, against the duration that task was allowed. Portfolio-wide <b>${s.within} of ${s.pairs} (${s.withinPct}%)</b> came back inside it.`,`<b>Measured</b> and <b>Coverage</b> lead on purpose. Nothing can be said about a task nobody reported, and only <b>${s.pairs} of ${s.tasks}</b> candidate tasks (${s.coveragePct}%) carry both an actual start and an actual finish. Per owner that runs from ${p}% to ${g}%, so these ranks rest on very different amounts of evidence. A <b>&dagger;</b> on a rank means it was earned on under ${u}% of that owner's book — the rank is real, but it is a rank among the tasks somebody reported.${k}`,"<b>Ratio</b> is elapsed &divide; allowed, as a MEDIAN — the worst single task on this document ran far past a hundred times its duration, and a mean would report that one task as everybody's problem. <b>Spread</b> is p90 &divide; median: how unpredictable the lane is. In critical-chain terms spread is what forces buffer size, so a predictable owner at 1.5&times; is easier to plan around than an erratic one averaging 1.0&times;.","<b>Pickup</b> is median / p90 working days from the moment a predecessor recorded its finish to the moment this owner recorded a start — the work sitting at their door, separated from the work in their hands. A negative pickup means they started before upstream finished (genuine overlap, or reporting slop); those are counted, never averaged into a delay.",`<b>Cause</b> splits every measured task by its single largest contributor, so no delay is counted twice: <span style="color:${H}">&#9632;</span> nothing to explain &middot; <span style="color:${C.none}">&#9632;</span> fed late by upstream &middot; <span style="color:${U}">&#9632;</span> waited at their door &middot; <span style="color:${z}">&#9632;</span> ran over in their hands. <b>Theirs</b> is the last two as a share of the explained tasks — the part it is fair to hold this owner to.`,l?`<b>On time</b> compares a recorded finish with that task's scheduled finish. It appears because it was measured to separate people here — a ${t.onTimeSpread}-point spread across ranked owners. Read it with care all the same: no frozen baseline exists in this model, so a scheduled finish is <i>today's</i> plan looking back, and re-planning moves it.`:`<b>On time against the plan is deliberately not shown.</b> It was computed and it did not separate anyone — ${t.onTimeSpread} points between the best and worst ranked owner — because no frozen baseline exists in this model and a scheduled finish is today's recomputed plan looking back. The duration test above is the honest substitute.`,`<b>Stalled</b> is started, never finished, and already past its allowed duration, with the count past <i>three times</i> it beside. A COUNT and never a rate, on purpose: ${s.stalled} open tasks qualify, which is most of the open work, so as a percentage it would rank nobody. Treat it as a worklist.`,`<b>Rework (ERP)</b> is the one figure here the app cannot know: nothing in the task model records rework, so it comes from the ERP's job-receipt ledger (${a.qualityMeta.rows.toLocaleString()} receipts, distilled ${h(a.qualityMeta.date)}) joined to each lane by its ERP vendor code. It is the LIFETIME record of the vendors on this owner's lanes — not a statement about the tasks in this document, and a vendor working for two owners counts for both. Read it as first-pass yield over the receipts named beside it; "none in N" means the ERP has recorded no rework across N receipts, which is not the same as a perfect record.`,"<b>Two clocks, and these actuals are report dates.</b> An actual start or finish is stamped with the STATUS DATE the progress was recorded under, not the day the work happened — so an owner who files a week of finishes on one Friday reads as one long task and several instant ones. Every elapsed span here is REPORTED elapsed.",`<b>Unowned</b> is a real bucket, not a rounding error: ${f} measured tasks sit on lanes with nobody named as responsible. It is listed and never attributed to a person — and note that it flatters, because unowned lanes skew towards short in-house steps.`]),`<div class="sbwrap"><table class="sb ow">
    <thead><tr>
      <th>#</th><th>Owner</th><th class="num">Measured</th><th class="num">Coverage</th>
      <th class="num">Within duration</th><th class="num">Ratio</th><th class="num">p90</th><th class="num">Spread</th>
      <th class="num">Pickup med / p90</th>
      ${l?'<th class="num">On time</th>':""}
      <th class="sbcap">cause</th><th class="num">Theirs</th>
      <th class="num">Rework (ERP)</th>
      <th class="num">Overdue now</th><th class="num">Stalled / 3&times;</th>
    </tr></thead>
    <tbody>${i}</tbody>
  </table></div>
  <h3 class="owh">Where the plan's own standard is wrong</h3>
  <p class="note">Lanes with at least ${_} completed tasks, worst-fitting standard first. Where a lane consistently takes longer than the duration the plan allows it, the standard is what needs changing, not the vendor — <b>Suggested</b> is the median of what the work actually took.</p>
  ${o}
  ${t.calib.length>P?`<p class="note">${t.calib.length-P} further lane${t.calib.length-P===1?"":"s"} clear the floor; the ${P} worst-fitting standards are shown.</p>`:""}
  <h3 class="owh">The same evidence, cut other ways</h3>
  ${n("Section",t.teams,12)}
  ${n("Lane",t.lanes,12)}
  ${n("Vendor",t.vendors,12)}`)}function he(a){const t=a.metrics,s=t.dict.r.map((r,d)=>`<option value="${d}">${h(r)}</option>`).join(""),l=t.merchants.map((r,d)=>`<button class="f" data-act="merch" data-v="${d}" aria-pressed="false"><span class="sw" style="background:${r.color}"></span>${h(r.display)}</button>`).join("");return O("map",E("The delay map","Reading the map",["Every overdue task is one dot. <b>Where</b> it sits is when it fell due (across) and who owns it (down) &middot; <b>how big</b> it is, how many working days late &middot; <b>filled</b>, that someone has reported progress &middot; <b>ringed</b>, that someone has remarked on it.","<b>Click any dot</b> to read the task, its order, its resource and its latest remarks. Every filter narrows the map, the curve below and the counts together.","Work that fell due <b>before the window</b> has no column to sit in. It is counted in the bar at the left of each lane; click the bar to list it."]),`<div class="maprow">
    <div class="mapcol">
      <div class="mapbox"><div id="map"></div></div>
      <div class="mapfoot">
        <p class="note" id="mapnote"></p>
        <div class="vsum"><b id="vcount">0</b> of <span id="vtot">0</span> shown &middot; avg <b id="vlate">0</b> wd late &middot; <b id="vsilent">0</b>% never remarked &middot; <b id="vprog">0</b> with progress</div>
      </div>
      <div class="legend">
        <span><b>size</b> working days late</span>
        <span><b>hollow</b> nothing reported</span>
        <span><b>filled</b> reported % done</span>
        <span><b>ring</b> <span style="color:${C.fresh}">fresh</span> / <span style="color:${C.aging}">ageing</span> / <span style="color:${C.stale}">stale</span> remark &middot; no ring = never remarked</span>
        <span><b>diamond</b> resource-independent task</span>
      </div>
    </div>
    <div class="detail" id="detail"></div>
    <div class="ctl">
      <div class="crow"><span class="cap">Scale</span><div class="grp">
        <button class="f" data-act="zoom" data-v="day" aria-pressed="true">Daily</button>
        <button class="f" data-act="zoom" data-v="week" aria-pressed="false">Weekly</button></div></div>
      <div class="crow"><span class="cap">Lanes</span><div class="grp">
        <button class="f" data-act="group" data-v="m" aria-pressed="true">Merchant</button>
        <button class="f" data-act="group" data-v="o" aria-pressed="false">Order</button>
        <button class="f" data-act="group" data-v="r" aria-pressed="false">Resource</button>
        <button class="f" data-act="group" data-v="w" aria-pressed="false">Owner</button>
        <button class="f" data-act="group" data-v="t" aria-pressed="false">Section</button></div></div>
      <div class="crow"><span class="cap">Late</span><div class="grp">
        <button class="f" data-act="delay" data-v="0" aria-pressed="false">due today</button>
        <button class="f" data-act="delay" data-v="1" aria-pressed="false">1–5</button>
        <button class="f" data-act="delay" data-v="6" aria-pressed="false">6–20</button>
        <button class="f" data-act="delay" data-v="21" aria-pressed="false">21+</button></div></div>
      <div class="crow"><span class="cap">Remarks</span><div class="grp">
        <button class="f" data-act="band" data-v="none" aria-pressed="false">silent</button>
        <button class="f" data-act="band" data-v="fresh" aria-pressed="false">fresh</button>
        <button class="f" data-act="band" data-v="aging" aria-pressed="false">ageing</button>
        <button class="f" data-act="band" data-v="stale" aria-pressed="false">stale</button></div></div>
      <div class="crow"><span class="cap">Progress</span><div class="grp">
        <button class="f" data-act="prog" data-v="some" aria-pressed="false">reported</button>
        <button class="f" data-act="prog" data-v="none" aria-pressed="false">nothing</button></div></div>
      <div class="crow"><span class="cap">Zone</span><div class="grp">
        <button class="f" data-act="zone" data-v="red" aria-pressed="false">ACT NOW</button>
        <button class="f" data-act="zone" data-v="amber" aria-pressed="false">WATCH</button>
        <button class="f" data-act="zone" data-v="green" aria-pressed="false">ON TRACK</button></div></div>
      <div class="grp wide">${l}</div>
      <select class="f" id="res"><option value="-1">Every resource</option>${s}</select>
      <input class="f" id="q" type="search" placeholder="Search task, order, resource">
      <div class="grp"><button class="f" data-act="clear">Reset filters</button>
        <button class="f" data-act="table" aria-pressed="false">Table view</button></div>
    </div>
  </div>
  <div id="tablewrap" hidden></div>`)}function pe(a){return O("ladder",E("The merchant ladder","Reading the ladder",["<b>One line per merchant, and the axis is RANK — 1st at the top.</b> A line falls when somebody passes it, which is the one thing a count of tasks can never show: a pile of survivors only ever grows.","Rank is the share of a merchant's overdue pile still <b>inside the act line — 20 working days late or less</b>. It is scale-free on purpose: carrying 442 late tasks is not a life sentence, only carrying OLD ones is. Clearing your oldest work lifts your line; cherry-picking the newest lowers it.","<b>Small piles are shrunk toward the portfolio share</b>, so four lucky tasks cannot win the table and a merchant with almost nothing in view is not flung to either end.",'<b>Every filter on the map reaches the ladder</b>, and the delay band <b>travels through time</b>: a task joins "21+" on its twenty-first working day and leaves "6–20" the same day. The merchant chips are the exception — they highlight rather than remove, because a table of one is not a table.','<b>Reconstructed from the pile as it stands today</b>, not from what the plan said at the time. A task cleared last week is absent from every column, including the old ones, so this is "how the standings look now, looking back" — not what the ladder read in July.']),`<div id="ladder"></div>
  <p class="note" id="ladnote"></p>`)}function ue(a){if(!a.process)return'<span class="nomatch">no process match in the vendor map</span>';const t=a.alternates,s=`<div class="via">${h(a.process)} — ${h(a.via)}</div>`;if(!t.length)return`<div class="alts">${s}<span class="nomatch">no known alternate vendor for this process</span></div>`;const l=r=>`<span class="v"><b>${h(r.name)}</b> <span class="n">×${r.count} WOs</span>${r.inHouse?'<span class="tag ih">in-house</span>':""}${r.inApp?'<span class="tag ia">in app</span>':""}</span>`;return`<div class="alts">${s}${t.map(l).join("")}</div>`}function me(a){return a.cells.map(t=>`<td class="cell ${ee(t.util)}">${K(t.util)}${t.overDays>0?`<span class="od" title="${t.overDays} over-booked day${t.overDays===1?"":"s"} inside this week">•</span>`:""}</td>`).join("")}function fe(a){const t=a.load,s=t.strip,l=s.drum?`<div class="scard"><div class="l">Drum (constraint)</div><div class="big">${h(s.drum.name)}</div><div class="row"><span>whole-window load</span><span class="n">${s.drum.util==null?"—":K(s.drum.util)+"%"}</span></div></div>`:'<div class="scard"><div class="l">Drum (constraint)</div><div class="big">—</div></div>',r=s.bottlenecks.length?s.bottlenecks.map(n=>`<div class="row"><span>${h(n.name)}</span><span class="n">${n.overDays} od · peak ${Math.round(n.peakUtil*100)}%</span></div>`).join(""):'<div class="row"><span>none over-booked</span></div>',d=t.firstCrunch?`<div class="big">${W(t.firstCrunch.date)}</div><div class="row"><span>${h(t.firstCrunch.name)}</span></div>`:'<div class="big">—</div>',m=`<div class="strip">
    ${l}
    <div class="scard"><div class="l">Bottlenecks (whole window)</div>${r}</div>
    <div class="scard"><div class="l">First crunch</div>${d}</div>
    <div class="scard"><div class="l">Over-booked</div><div class="big">${s.overRes} resources</div><div class="row"><span>day-slots</span><span class="n">${s.overSlots}</span></div></div>
  </div>`,p=["<b>Utilization</b> = scheduled demand ÷ capacity per week — green &lt;80% &middot; amber 80–100% &middot; red &gt;100%. A <b>•</b> marks single over-booked days hiding inside a green week.","Capacity = workers × units/day/worker where a rate is set, else worker lanes.",`The bottleneck strip reads the whole scheduling window, like the app's Load tab; the table reads the next ${a.weeks} weeks only.`,`<b>Alternate vendors</b> come from the ERP vendor map of ${h(t.mapDate)} — historical volumes, evidence of capability, not booked capacity.`];if(t.empty)return O("load",E(`Resource load <span class="faint" style="font-weight:400;font-size:11.5px">next ${a.weeks} weeks</span>`,"Reading the load table",p),`${m}<p class="note">Nothing is scheduled on or after the status date — no load to show.</p>`);const g=`<thead><tr>
      <th style="width:15%">Resource</th><th>Section</th><th>Capacity</th>
      ${t.weekLabels.map(n=>`<th class="wk">${h(n)}</th>`).join("")}
      <th class="num">Peak</th><th style="width:21%">Alternate vendors</th>
    </tr></thead>`,f=(n,k)=>`<tr>
      <td class="rname">${h(n.name)}</td>
      <td class="team">${h(n.team)}</td>
      <td class="cap">${h(n.capLabel)}</td>
      ${me(n)}
      <td class="num">${n.peakPct==null?"—":(n.peakPct>999?"999+":n.peakPct)+"%"}</td>
      <td>${k}</td>
    </tr>`,u=t.overloaded.map(n=>f(n,ue(n))).join(""),i=t.all.filter(n=>!n.over),o=i.map(n=>f(n,"")).join("");return O("load",E(`Resource load <span class="faint" style="font-weight:400;font-size:11.5px">next ${a.weeks} weeks</span>`,"Reading the load table",p),`${m}
  ${t.overloaded.length===0?`<p class="note">No resource is over capacity in the next ${a.weeks} weeks.</p>`:`<div class="loadwrap"><table class="loadt">${g}<tbody>${u}</tbody></table></div>`}
  ${i.length>0?`<details class="grid"><summary>The rest of the loaded resources — within capacity (${i.length}${t.overloaded.length?` of ${t.all.length}; the ${t.overloaded.length} over-booked are in the table above`:""})</summary>
    <div class="loadwrap"><table class="loadt">${g}<tbody>${o}</tbody></table></div></details>`:""}
  ${t.clamped?'<p class="note">The load window was clamped to the 2-year render cap — far-future demand is not shown.</p>':""}`)}function ge(a){const t=a.kpis.erroredIds,s=[`<b>Overdue</b> — a task whose scheduled finish is on or before the status date (${W(a.asofD)}) with nobody reporting it done: an actual finish, or a hand-entered 100% behind a real start. Planned-elapsed never counts as done; that heuristic would hide exactly the unreported tasks that are most overdue.`,"<b>Days late</b> — working days on the company calendar from the scheduled finish to the status date; 0 = due today. Every delay figure here is working days (wd).","<b>Two clocks, deliberately.</b> A finish carries the STATUS DATE it was recorded under — the only report-time the document holds, and the one the app itself uses. A remark carries its wall-clock day. So the clearance charts and the remark charts do not run on the same clock.",`<b>Excluded everywhere</b> — ship gates, milestones, summary rows, archived orders${t.length?`, and ${t.length} order${t.length===1?"":"s"} with schedule errors (${t.map(h).join(", ")})`:""}. Every figure walks the same task set, so the table, the map and the curve cannot disagree.`];return a.scopeNote&&s.push(`<b>Scope</b> — ${h(a.scopeNote)}.`),X("How to read this report",s)}function be(a){const t=a.metrics,s=Z(t.dots),l=t.merchants.map(d=>({display:d.display,color:d.color})),r=t.merchants.map(d=>({due:d.daily.map(m=>m.clear.due),met:d.daily.map(m=>m.clear.met),rem:d.daily.map(m=>m.rem.n),back:d.daily.map(m=>m.back.open)}));return J({days:t.dailyDays,weekDays:t.weekDays,weekEdges:t.weekEdges,merchants:l,series:r,dict:t.dict,dots:s,age:C})}function we(a){const t=[`as of <b>${W(a.asofD)}</b>`,a.docVersion!=null?`shared doc v${a.docVersion}`:"",a.scopeNote?h(a.scopeNote):"",`generated ${h(a.generatedAt)}`].filter(Boolean).join(" &nbsp;·&nbsp; "),s=a.kpis.overdueTasks>0;return`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Overdue work dashboard — ${h(W(a.asofD))}</title>
<style>${ae}</style></head>
<body><div class="doc" id="app">
  <div class="h1row"><h1>Overdue work dashboard</h1>${ge(a)}</div>
  <div class="meta">${t}</div>
  ${oe(a)}
  ${ie(a)}
  ${le(a)}
  ${ce(a)}
  ${s?`<noscript><span class="ns">The map, the backlog curve and the task detail need JavaScript. Everything above and the resource load below read fine without it.</span></noscript>
  ${he(a)}
  ${pe()}`:`<p class="note" style="margin-top:16px">Nothing is overdue — every active task's scheduled finish is still ahead of the status date. 🎉</p>`}
  ${fe(a)}
  <div class="foot">Generated by Order Control · status date ${h(a.asof)}${a.docVersion!=null?` · shared doc v${a.docVersion}`:""} · this file is self-contained — share it as it is.</div>
</div>
<script type="application/json" id="ocdata">${be(a)}<\/script>
${s?`<script>${te(Q)}<\/script>`:""}
</body></html>`}function ye(a){const t=we(a),s=new Blob([t],{type:"text/html;charset=utf-8"});G(`overdue-report-${a.asof}.html`,s);const l=URL.createObjectURL(s);window.open(l,"_blank"),setTimeout(()=>URL.revokeObjectURL(l),3e4)}export{ye as downloadOverdueReport,we as renderOverdueReport};
