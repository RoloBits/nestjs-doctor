export const SCHEMA = `
// ── Schema: Canvas-based interactive ER diagram ──

// Row size estimation
var TYPE_BYTES = {
  "integer": 4, "int": 4, "int4": 4, "Int": 4, "serial": 4,
  "bigint": 8, "BigInt": 8, "int8": 8, "bigserial": 8,
  "smallint": 2, "int2": 2, "tinyint": 1,
  "float": 8, "double": 8, "Float": 8, "Decimal": 8, "decimal": 8,
  "real": 4, "float4": 4, "float8": 8, "numeric": 8,
  "boolean": 1, "Boolean": 1, "bool": 1,
  "varchar": 256, "String": 256, "text": 256, "char": 64, "character varying": 256,
  "uuid": 16, "UUID": 16,
  "timestamp": 8, "DateTime": 8, "Date": 8, "date": 4, "time": 8,
  "timestamptz": 8, "timestamp without time zone": 8, "timestamp with time zone": 8,
  "json": 512, "Json": 512, "jsonb": 512,
  "enum": 4, "Enum": 4,
  "bytea": 256, "Bytes": 256,
};

function estimateRowSize(entity) {
  var total = 0;
  for (var i = 0; i < entity.columns.length; i++) {
    var t = entity.columns[i].type;
    var base = t.replace(/\\(.*\\)/, "").replace(/\\[.*\\]/, "").trim();
    total += TYPE_BYTES[base] || 64;
  }
  return total;
}

function formatBytes(b) {
  if (b >= 1024) return "~" + (b / 1024).toFixed(1) + " KB";
  return "~" + b + " B";
}

// Canvas state
var sCanvas, sCtx, sDpr, sW, sH;
var sCamX = 0, sCamY = 0, sZoom = 1;
var sDragging = null, sPanning = false, sPanStart = {x: 0, y: 0};
var sDragMoved = false;
var sDragOffset = {x: 0, y: 0};
var sHoveredEntity = null, sHoveredRelation = null;
var sSelectedEntity = null;
var sNodes = [];
var sNodeMap = {};
var sEdgeRoutes = {};
var sEdgeKeys = [];
var sAllNodes = [];
var sAllNodeMap = {};
var sFocusedMode = false;
var sShowCols = null;
var sShowAllCols = false;
// When on, picking a table in the diagram drives the list beside it.
var sSyncSidebar = true;
// The fit zoom of the current layout.
var sMinZoom = 0.2;

// Schema tooltip element
var sTooltipEl = null;
var sRelBadgeEl = null;

// Dirty-flag redraw (zero CPU at idle)
var sSchemaDirty = false;
function sScheduleRedraw() {
  if (!sSchemaDirty) {
    sSchemaDirty = true;
    requestAnimationFrame(function() { sSchemaDirty = false; schemaDraw(); });
  }
}

/** Lowest zoom either control allows, low enough to fit a large diagram. */
function sZoomFloor() {
  return Math.min(sMinZoom, 0.05);
}

var sLastZoomUi = null;
/** Keeps the zoom bar in step with the camera, whatever changed it. */
function sSyncZoomUi() {
  var pct = Math.round(sZoom * 100);
  if (pct === sLastZoomUi) return;
  sLastZoomUi = pct;
  var range = document.getElementById("schema-zoom-range");
  var label = document.getElementById("schema-zoom-value");
  if (range) range.value = String(Math.max(5, Math.min(500, pct)));
  if (label) {
    label.textContent = pct + "%";
    label.setAttribute("aria-label", pct + "% \\u00b7 fit to view");
  }
}

function sScreenToWorld(sx, sy) {
  return {
    x: (sx - sW / 2) / sZoom + sW / 2 - sCamX,
    y: (sy - sH / 2) / sZoom + sH / 2 - sCamY
  };
}

function sHitTestEntity(wx, wy) {
  for (var i = sNodes.length - 1; i >= 0; i--) {
    var n = sNodes[i];
    if (wx >= n.x - n.w / 2 && wx <= n.x + n.w / 2 &&
        wy >= n.y - n.h / 2 && wy <= n.y + n.h / 2) {
      return n;
    }
  }
  return null;
}

function sGetRelatedEntities(entityName) {
  var related = new Set();
  related.add(entityName);
  for (var i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === entityName) related.add(rel.toEntity);
    if (rel.toEntity === entityName) related.add(rel.fromEntity);
  }
  return related;
}

// Point-to-segment distance for polyline hit-testing
function sPointToSegmentDist(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  var projX = ax + t * dx;
  var projY = ay + t * dy;
  return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

function sHitTestRelation(wx, wy) {
  var threshold = 8 / sZoom;
  for (var k = 0; k < sEdgeKeys.length; k++) {
    var key = sEdgeKeys[k];
    var points = sEdgeRoutes[key];
    if (!points || points.length < 2) continue;
    for (var p = 0; p < points.length - 1; p++) {
      var d = sPointToSegmentDist(wx, wy, points[p].x, points[p].y, points[p + 1].x, points[p + 1].y);
      if (d < threshold) {
        var parts = key.split("|");
        for (var r = 0; r < schema.relations.length; r++) {
          var rel = schema.relations[r];
          if (rel.fromEntity === parts[0] && rel.toEntity === parts[1]) return rel;
          if (rel.fromEntity === parts[1] && rel.toEntity === parts[0]) return rel;
        }
      }
    }
  }
  return null;
}

function sRelLabel(type) {
  if (type === "one-to-one") return "1:1";
  if (type === "one-to-many") return "1:N";
  if (type === "many-to-one") return "N:1";
  return "N:M";
}

// Manhattan edge routing
var S_EDGE_MARGIN = 14;

function sEdgeKey(fromName, toName) {
  return fromName < toName ? fromName + "|" + toName : toName + "|" + fromName;
}

function sSegmentHitsBox(ax, ay, bx, by, box, margin) {
  var left = box.x - box.w / 2 - margin;
  var right = box.x + box.w / 2 + margin;
  var top = box.y - box.h / 2 - margin;
  var bottom = box.y + box.h / 2 + margin;

  // Horizontal segment
  if (Math.abs(ay - by) < 1) {
    if (ay < top || ay > bottom) return false;
    var minX = Math.min(ax, bx);
    var maxX = Math.max(ax, bx);
    return maxX > left && minX < right;
  }
  // Vertical segment
  if (Math.abs(ax - bx) < 1) {
    if (ax < left || ax > right) return false;
    var minY = Math.min(ay, by);
    var maxY = Math.max(ay, by);
    return maxY > top && minY < bottom;
  }
  return false;
}

function sSegmentHitsAnyBox(ax, ay, bx, by, excludeA, excludeB) {
  for (var i = 0; i < sNodes.length; i++) {
    var n = sNodes[i];
    if (n.name === excludeA || n.name === excludeB) continue;
    if (sSegmentHitsBox(ax, ay, bx, by, n, S_EDGE_MARGIN)) return true;
  }
  return false;
}

function sComputePort(from, to) {
  var dx = to.x - from.x;
  var dy = to.y - from.y;
  var px, py, dir;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) { px = from.x + from.w / 2; py = from.y; dir = "right"; }
    else { px = from.x - from.w / 2; py = from.y; dir = "left"; }
  } else {
    if (dy >= 0) { px = from.x; py = from.y + from.h / 2; dir = "down"; }
    else { px = from.x; py = from.y - from.h / 2; dir = "up"; }
  }
  return { x: px, y: py, dir: dir };
}

function sStepOut(port) {
  if (port.dir === "right") return { x: port.x + S_EDGE_MARGIN, y: port.y };
  if (port.dir === "left") return { x: port.x - S_EDGE_MARGIN, y: port.y };
  if (port.dir === "down") return { x: port.x, y: port.y + S_EDGE_MARGIN };
  return { x: port.x, y: port.y - S_EDGE_MARGIN };
}

function sRouteManhattan(fromNode, toNode) {
  var portA = sComputePort(fromNode, toNode);
  var portB = sComputePort(toNode, fromNode);
  var stepA = sStepOut(portA);
  var stepB = sStepOut(portB);

  var fromName = fromNode.name;
  var toName = toNode.name;

  // Try L-shape: H then V
  var midX1 = stepB.x, midY1 = stepA.y;
  if (!sSegmentHitsAnyBox(stepA.x, stepA.y, midX1, midY1, fromName, toName) &&
      !sSegmentHitsAnyBox(midX1, midY1, stepB.x, stepB.y, fromName, toName)) {
    return sSimplifyPath([portA, stepA, {x: midX1, y: midY1}, stepB, portB]);
  }

  // Try L-shape: V then H
  var midX2 = stepA.x, midY2 = stepB.y;
  if (!sSegmentHitsAnyBox(stepA.x, stepA.y, midX2, midY2, fromName, toName) &&
      !sSegmentHitsAnyBox(midX2, midY2, stepB.x, stepB.y, fromName, toName)) {
    return sSimplifyPath([portA, stepA, {x: midX2, y: midY2}, stepB, portB]);
  }

  // U-shaped detour along a shared horizontal or vertical line
  var bestPath = null;
  var bestLen = Infinity;
  var rails = [
    { axis: "y", v: Math.min(stepA.y, stepB.y) - 80 },
    { axis: "y", v: Math.max(stepA.y, stepB.y) + 80 },
    { axis: "x", v: Math.min(stepA.x, stepB.x) - 80 },
    { axis: "x", v: Math.max(stepA.x, stepB.x) + 80 }
  ];
  for (var o = 0; o < rails.length; o++) {
    var path = rails[o].axis === "y"
      ? [portA, stepA, {x: stepA.x, y: rails[o].v}, {x: stepB.x, y: rails[o].v}, stepB, portB]
      : [portA, stepA, {x: rails[o].v, y: stepA.y}, {x: rails[o].v, y: stepB.y}, stepB, portB];
    var blocked = false;
    for (var s = 0; s < path.length - 1; s++) {
      if (sSegmentHitsAnyBox(path[s].x, path[s].y, path[s + 1].x, path[s + 1].y, fromName, toName)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      var len = 0;
      for (var s = 0; s < path.length - 1; s++) {
        len += Math.abs(path[s + 1].x - path[s].x) + Math.abs(path[s + 1].y - path[s].y);
      }
      if (len < bestLen) { bestLen = len; bestPath = path; }
    }
  }

  if (bestPath) return sSimplifyPath(bestPath);

  // Fallback: direct L-shape (no obstacle avoidance)
  return sSimplifyPath([portA, stepA, {x: stepB.x, y: stepA.y}, stepB, portB]);
}

function sSimplifyPath(points) {
  if (points.length <= 2) return points;
  var result = [points[0]];
  for (var i = 1; i < points.length - 1; i++) {
    var prev = result[result.length - 1];
    var next = points[i + 1];
    var curr = points[i];
    // Skip collinear points
    var sameX = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;
    var sameY = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
    if (!sameX && !sameY) result.push(curr);
  }
  result.push(points[points.length - 1]);
  return result;
}

// ── Schema: channel routing over the layered grid ──
var S_LANE = 8;
var sCompGrids = null;

function sBuildGrids() {
  sCompGrids = {};
  var groups = {};
  var i, m;
  for (i = 0; i < sNodes.length; i++) {
    var cid = sNodes[i]._comp;
    if (cid === undefined || cid < 0) continue;
    if (!groups[cid]) groups[cid] = [];
    groups[cid].push(sNodes[i]);
  }
  for (var gKey in groups) {
    if (!Object.prototype.hasOwnProperty.call(groups, gKey)) continue;
    var nodes = groups[gKey];
    var byX = {};
    for (i = 0; i < nodes.length; i++) {
      var cx = Math.round(nodes[i].x);
      if (!byX[cx]) byX[cx] = [];
      byX[cx].push(nodes[i]);
    }
    var xs = [];
    for (var xk in byX) {
      if (Object.prototype.hasOwnProperty.call(byX, xk)) xs.push(Number(xk));
    }
    xs.sort(function(a, b) { return a - b; });
    var cols = [];
    var colOf = {};
    for (i = 0; i < xs.length; i++) {
      var members = byX[xs[i]];
      var boxes = [];
      for (m = 0; m < members.length; m++) {
        boxes.push({
          top: members[m].y - members[m].h / 2 - 8,
          bot: members[m].y + members[m].h / 2 + 8
        });
        colOf[members[m].name] = i;
      }
      boxes.sort(function(a, b) { return a.top - b.top; });
      cols.push({ left: xs[i] - S_BOX_W / 2, right: xs[i] + S_BOX_W / 2, boxes: boxes });
    }
    var gutters = [];
    for (i = 0; i <= cols.length; i++) {
      var gl = i === 0 ? cols[0].left - 60 : cols[i - 1].right;
      var gr = i === cols.length ? cols[cols.length - 1].right + 60 : cols[i].left;
      gutters.push({ left: gl, right: gr, center: (gl + gr) / 2, runs: [] });
    }
    sCompGrids[gKey] = { cols: cols, gutters: gutters, colOf: colOf };
  }
}

/** One y clear across every given column: merged intervals, nearest gap. */
function sCorridorY(colList, target) {
  var iv = [];
  var i;
  for (i = 0; i < colList.length; i++) {
    var bx = colList[i].boxes;
    for (var j = 0; j < bx.length; j++) iv.push({ top: bx[j].top, bot: bx[j].bot });
  }
  if (iv.length === 0) return target;
  iv.sort(function(a, b) { return a.top - b.top; });
  var merged = [iv[0]];
  for (i = 1; i < iv.length; i++) {
    var last = merged[merged.length - 1];
    if (iv[i].top <= last.bot + 12) {
      if (iv[i].bot > last.bot) last.bot = iv[i].bot;
    } else {
      merged.push({ top: iv[i].top, bot: iv[i].bot });
    }
  }
  var cands = [merged[0].top - 10];
  for (i = 0; i + 1 < merged.length; i++) cands.push((merged[i].bot + merged[i + 1].top) / 2);
  cands.push(merged[merged.length - 1].bot + 10);
  var best = cands[0];
  for (i = 1; i < cands.length; i++) {
    if (Math.abs(cands[i] - target) < Math.abs(best - target)) best = cands[i];
  }
  return best;
}

/** Row centre of a named column when visible; header centre otherwise. */
function sPortRowY(node, colName) {
  var top = node.y - node.h / 2;
  var showCols = sColumnsShown(sNodes.length);
  var visible = sVisibleColCount(node, showCols);
  if (colName) {
    var key = sKeyName(colName);
    for (var i = 0; i < node.entity.columns.length && i < visible; i++) {
      if (sKeyName(node.entity.columns[i].name) === key) return top + 24 + i * 16 + 8;
    }
  }
  return top + 12;
}

/** Guesses the FK column on the child and the PK column on the parent. */
function sRelPortNames(rel) {
  var child = sNodeMap[rel.fromEntity];
  var fkName = null;
  if (child && rel.propertyName) {
    var keys = sFkKeys(rel.propertyName);
    for (var i = 0; i < child.entity.columns.length; i++) {
      var kn = sKeyName(child.entity.columns[i].name);
      if (kn === keys[0] || kn === keys[1]) { fkName = child.entity.columns[i].name; break; }
    }
  }
  var parent = sNodeMap[rel.toEntity];
  var pkName = null;
  if (parent) {
    for (i = 0; i < parent.entity.columns.length; i++) {
      if (parent.entity.columns[i].isPrimary) { pkName = parent.entity.columns[i].name; break; }
    }
  }
  return { fk: fkName, pk: pkName };
}

function sChannelRouteAll() {
  var i, j, r;
  var jobs = [];
  var seen = {};
  for (i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === rel.toEntity) continue;
    var a = sNodeMap[rel.fromEntity];
    var b = sNodeMap[rel.toEntity];
    if (!a || !b) continue;
    var key = sEdgeKey(rel.fromEntity, rel.toEntity);
    if (seen[key]) continue;
    seen[key] = true;
    var grid = a._comp !== undefined && a._comp === b._comp ? sCompGrids[a._comp] : null;
    if (!grid || grid.colOf[a.name] === undefined || grid.colOf[b.name] === undefined) {
      sEdgeRoutes[key] = sRouteManhattan(a, b);
      sEdgeKeys.push(key);
      continue;
    }
    var names = sRelPortNames(rel);
    var ca = grid.colOf[a.name];
    var cb = grid.colOf[b.name];
    var sideA, sideB;
    if (ca === cb) {
      sideA = "right";
      sideB = "right";
    } else {
      sideA = ca < cb ? "right" : "left";
      sideB = ca < cb ? "left" : "right";
    }
    jobs.push({
      key: key, a: a, b: b, grid: grid, ca: ca, cb: cb,
      sideA: sideA, sideB: sideB,
      ya: sPortRowY(a, names.fk), yb: sPortRowY(b, names.pk)
    });
  }

  // Spread ports so a hub's edges fan out instead of stacking on one point
  var byPort = {};
  for (i = 0; i < jobs.length; i++) {
    var jb = jobs[i];
    var ka = jb.a.name + "|" + jb.sideA;
    var kb = jb.b.name + "|" + jb.sideB;
    if (!byPort[ka]) byPort[ka] = [];
    if (!byPort[kb]) byPort[kb] = [];
    byPort[ka].push({ job: jb, end: "a" });
    byPort[kb].push({ job: jb, end: "b" });
  }
  for (var pk in byPort) {
    if (!Object.prototype.hasOwnProperty.call(byPort, pk)) continue;
    var ends = byPort[pk];
    if (ends.length < 2) continue;
    ends.sort(function(u, v) {
      var uy = u.end === "a" ? u.job.b.y : u.job.a.y;
      var vy = v.end === "a" ? v.job.b.y : v.job.a.y;
      return uy - vy;
    });
    var node = ends[0].end === "a" ? ends[0].job.a : ends[0].job.b;
    var spread = Math.min(S_LANE, (node.h - 16) / ends.length);
    for (j = 0; j < ends.length; j++) {
      var off = (j - (ends.length - 1) / 2) * spread;
      var lo = node.y - node.h / 2 + 8;
      var hi = node.y + node.h / 2 - 8;
      if (ends[j].end === "a") {
        ends[j].job.ya = Math.max(lo, Math.min(hi, ends[j].job.ya + off));
      } else {
        ends[j].job.yb = Math.max(lo, Math.min(hi, ends[j].job.yb + off));
      }
    }
  }

  // Build gutter runs for every edge
  var corridorUse = {};
  for (i = 0; i < jobs.length; i++) {
    jb = jobs[i];
    var runs = [];
    if (jb.ca === jb.cb) {
      runs.push({ g: jb.grid.gutters[jb.ca + 1], fromY: jb.ya, toY: jb.yb });
    } else {
      var step = jb.ca < jb.cb ? 1 : -1;
      var between = jb.grid.cols.slice(Math.min(jb.ca, jb.cb) + 1, Math.max(jb.ca, jb.cb));
      var gFirst = jb.grid.gutters[step === 1 ? jb.ca + 1 : jb.ca];
      var gLast = jb.grid.gutters[step === 1 ? jb.cb : jb.cb + 1];
      if (between.length === 0) {
        runs.push({ g: gLast, fromY: jb.ya, toY: jb.yb });
      } else {
        var yCorr = sCorridorY(between, (jb.ya + jb.yb) / 2);
        var bucket = String(Math.round(yCorr / 4));
        var used = corridorUse[bucket] || 0;
        corridorUse[bucket] = used + 1;
        yCorr += (used % 2 === 0 ? 1 : -1) * Math.ceil(used / 2) * 5;
        runs.push({ g: gFirst, fromY: jb.ya, toY: yCorr });
        runs.push({ g: gLast, fromY: yCorr, toY: jb.yb });
      }
    }
    jb.runs = runs;
    for (r = 0; r < runs.length; r++) runs[r].g.runs.push(runs[r]);
  }

  // Lane assignment: spread the vertical runs sharing a gutter
  for (var gk in sCompGrids) {
    if (!Object.prototype.hasOwnProperty.call(sCompGrids, gk)) continue;
    var gutters = sCompGrids[gk].gutters;
    for (i = 0; i < gutters.length; i++) {
      var gut = gutters[i];
      var live = [];
      for (j = 0; j < gut.runs.length; j++) {
        if (Math.abs(gut.runs[j].fromY - gut.runs[j].toY) >= 0.5) live.push(gut.runs[j]);
      }
      gut.runs = [];
      live.sort(function(u, v) {
        return (u.fromY + u.toY) / 2 - (v.fromY + v.toY) / 2;
      });
      var lane = live.length > 1
        ? Math.min(S_LANE, (gut.right - gut.left - 12) / (live.length - 1))
        : 0;
      for (j = 0; j < live.length; j++) {
        live[j].x = gut.center + (j - (live.length - 1) / 2) * lane;
      }
    }
  }

  // Materialize the polylines
  for (i = 0; i < jobs.length; i++) {
    jb = jobs[i];
    var pts = [{
      x: jb.sideA === "right" ? jb.a.x + jb.a.w / 2 : jb.a.x - jb.a.w / 2,
      y: jb.ya
    }];
    var curY = jb.ya;
    for (r = 0; r < jb.runs.length; r++) {
      var rn = jb.runs[r];
      if (Math.abs(rn.fromY - rn.toY) < 0.5) continue;
      pts.push({ x: rn.x, y: curY });
      pts.push({ x: rn.x, y: rn.toY });
      curY = rn.toY;
    }
    pts.push({
      x: jb.sideB === "right" ? jb.b.x + jb.b.w / 2 : jb.b.x - jb.b.w / 2,
      y: jb.yb
    });
    sEdgeRoutes[jb.key] = sSimplifyPath(pts);
    sEdgeKeys.push(jb.key);
  }
}

function sRouteAllEdges() {
  sEdgeRoutes = {};
  sEdgeKeys = [];
  if (sCompGrids) {
    sChannelRouteAll();
    return;
  }
  var seen = {};
  for (var i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === rel.toEntity) continue;
    var a = sNodeMap[rel.fromEntity];
    var b = sNodeMap[rel.toEntity];
    if (!a || !b) continue;
    if (sFocusedMode && sSelectedEntity &&
        rel.fromEntity !== sSelectedEntity && rel.toEntity !== sSelectedEntity) continue;
    var key = sEdgeKey(rel.fromEntity, rel.toEntity);
    if (seen[key]) continue;
    seen[key] = true;
    sEdgeRoutes[key] = sRouteManhattan(a, b);
    sEdgeKeys.push(key);
  }
}

function sRerouteEdgesForNode(name) {
  for (var k = 0; k < sEdgeKeys.length; k++) {
    var key = sEdgeKeys[k];
    var parts = key.split("|");
    if (parts[0] === name || parts[1] === name) {
      var a = sNodeMap[parts[0]];
      var b = sNodeMap[parts[1]];
      if (a && b) sEdgeRoutes[key] = sRouteManhattan(a, b);
    }
  }
}

// Polyline midpoint for label placement
function sPolylineMidpoint(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  var totalLen = 0;
  for (var i = 0; i < points.length - 1; i++) {
    totalLen += Math.sqrt(
      (points[i + 1].x - points[i].x) * (points[i + 1].x - points[i].x) +
      (points[i + 1].y - points[i].y) * (points[i + 1].y - points[i].y)
    );
  }
  var half = totalLen / 2;
  var walked = 0;
  for (var i = 0; i < points.length - 1; i++) {
    var segLen = Math.sqrt(
      (points[i + 1].x - points[i].x) * (points[i + 1].x - points[i].x) +
      (points[i + 1].y - points[i].y) * (points[i + 1].y - points[i].y)
    );
    if (walked + segLen >= half) {
      var t = segLen > 0 ? (half - walked) / segLen : 0;
      return {
        x: points[i].x + t * (points[i + 1].x - points[i].x),
        y: points[i].y + t * (points[i + 1].y - points[i].y)
      };
    }
    walked += segLen;
  }
  return { x: points[points.length - 1].x, y: points[points.length - 1].y };
}

/** Groups nodes into connected components using the relation edges. */
function sComputeComponents(nodes) {
  var index = {};
  var parent = [];
  for (var i = 0; i < nodes.length; i++) {
    index[nodes[i].name] = i;
    parent.push(i);
  }
  function find(a) {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  }
  for (var i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === rel.toEntity) continue;
    var a = index[rel.fromEntity];
    var b = index[rel.toEntity];
    if (a === undefined || b === undefined) continue;
    var ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }
  var groups = {};
  for (var i = 0; i < nodes.length; i++) {
    var root = find(i);
    if (!groups[root]) groups[root] = [];
    groups[root].push(nodes[i]);
  }
  var out = [];
  for (var key in groups) {
    if (Object.prototype.hasOwnProperty.call(groups, key)) out.push(groups[key]);
  }
  return out;
}

/** Positions one component from its own origin: layered left-to-right. */
var S_BOX_W = 180;
var S_COL_GAP = 110;
var S_ROW_GAP = 44;
var S_COL_CAP = 2400;

function sLayoutComponent(nodes) {
  var i, j, t, p, q;
  if (nodes.length === 1) {
    nodes[0].x = nodes[0].w / 2;
    nodes[0].y = nodes[0].h / 2;
    return { w: nodes[0].w, h: nodes[0].h };
  }
  var idx = {};
  for (i = 0; i < nodes.length; i++) idx[nodes[i].name] = i;
  var n = nodes.length;
  var out = [], und = [];
  for (i = 0; i < n; i++) { out.push([]); und.push([]); }
  var seenE = {};
  for (i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === rel.toEntity) continue;
    var ea = idx[rel.fromEntity], eb = idx[rel.toEntity];
    if (ea === undefined || eb === undefined) continue;
    var ek = ea < eb ? ea + "|" + eb : eb + "|" + ea;
    if (seenE[ek]) continue;
    seenE[ek] = true;
    out[ea].push(eb);
    und[ea].push(eb); und[eb].push(ea);
  }

  // Break cycles: depth-first, back edges are dropped from the working copy
  var color = [], acyc = [];
  for (i = 0; i < n; i++) { color.push(0); acyc.push([]); }
  function dfsBreak(u) {
    color[u] = 1;
    for (var e = 0; e < out[u].length; e++) {
      var v = out[u][e];
      if (color[v] === 1) continue;
      acyc[u].push(v);
      if (color[v] === 0) dfsBreak(v);
    }
    color[u] = 2;
  }
  for (i = 0; i < n; i++) if (color[i] === 0) dfsBreak(i);

  // Layer by longest path from sinks: referenced hubs land in column 0
  var layer = [];
  for (i = 0; i < n; i++) layer.push(-1);
  function assignLayer(u) {
    if (layer[u] >= 0) return layer[u];
    layer[u] = 0;
    var best = 0;
    for (var e = 0; e < acyc[u].length; e++) {
      var d = assignLayer(acyc[u][e]) + 1;
      if (d > best) best = d;
    }
    layer[u] = best;
    return best;
  }
  for (i = 0; i < n; i++) assignLayer(i);

  // Order each column by neighbor barycenter, four alternating sweeps
  var maxLayer = 0;
  for (i = 0; i < n; i++) if (layer[i] > maxLayer) maxLayer = layer[i];
  var cols = [];
  for (i = 0; i <= maxLayer; i++) cols.push([]);
  for (i = 0; i < n; i++) cols[layer[i]].push(i);
  function sweepPair(fixed, moving) {
    var pos = {};
    for (p = 0; p < fixed.length; p++) pos[fixed[p]] = p;
    var keyed = [];
    for (p = 0; p < moving.length; p++) {
      var u = moving[p], sum = 0, cnt = 0;
      for (q = 0; q < und[u].length; q++) {
        if (pos[und[u][q]] !== undefined) { sum += pos[und[u][q]]; cnt++; }
      }
      keyed.push({ u: u, k: cnt ? sum / cnt : p, o: p });
    }
    keyed.sort(function(x, y) { return x.k - y.k || x.o - y.o; });
    for (p = 0; p < keyed.length; p++) moving[p] = keyed[p].u;
  }
  for (t = 0; t < 4; t++) {
    for (i = 1; i < cols.length; i++) sweepPair(cols[i - 1], cols[i]);
    for (i = cols.length - 2; i >= 0; i--) sweepPair(cols[i + 1], cols[i]);
  }

  // Split an over-tall column into side-by-side runs, keeping the order
  var phys = [];
  for (i = 0; i < cols.length; i++) {
    var run = [], runH = 0;
    for (j = 0; j < cols[i].length; j++) {
      var u2 = cols[i][j];
      var hh = nodes[u2].h + S_ROW_GAP;
      if (runH > 0 && runH + hh > S_COL_CAP) { phys.push(run); run = []; runH = 0; }
      run.push(u2);
      runH += hh;
    }
    if (run.length > 0) phys.push(run);
  }

  // Coordinates: fixed-width columns, stacked rows, then three relax passes
  var xCur = 0;
  for (i = 0; i < phys.length; i++) {
    var yCur = 0;
    for (j = 0; j < phys[i].length; j++) {
      var nd = nodes[phys[i][j]];
      nd.x = xCur + nd.w / 2;
      nd.y = yCur + nd.h / 2;
      yCur += nd.h + S_ROW_GAP;
    }
    xCur += S_BOX_W + S_COL_GAP;
  }
  for (t = 0; t < 3; t++) {
    for (i = 0; i < phys.length; i++) {
      var want = [];
      for (j = 0; j < phys[i].length; j++) {
        var u3 = phys[i][j];
        var s2 = 0, c2 = 0;
        for (q = 0; q < und[u3].length; q++) { s2 += nodes[und[u3][q]].y; c2++; }
        want.push(c2 > 0 ? s2 / c2 : nodes[u3].y);
      }
      for (j = 0; j < phys[i].length; j++) nodes[phys[i][j]].y = want[j];
      // The top-down sweep resolves overlaps without reordering the column
      var floorY = -Infinity;
      for (j = 0; j < phys[i].length; j++) {
        var nd2 = nodes[phys[i][j]];
        var top = Math.max(nd2.y - nd2.h / 2, floorY);
        nd2.y = top + nd2.h / 2;
        floorY = top + nd2.h + S_ROW_GAP;
      }
    }
  }

  // Normalize to origin and report the extent
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (i = 0; i < n; i++) {
    minX = Math.min(minX, nodes[i].x - nodes[i].w / 2);
    maxX = Math.max(maxX, nodes[i].x + nodes[i].w / 2);
    minY = Math.min(minY, nodes[i].y - nodes[i].h / 2);
    maxY = Math.max(maxY, nodes[i].y + nodes[i].h / 2);
  }
  for (i = 0; i < n; i++) { nodes[i].x -= minX; nodes[i].y -= minY; }
  return { w: maxX - minX, h: maxY - minY };
}

/** Packs unrelated tables into a compact grid instead of one long rank. */
function sLayoutIsolatedBlock(nodes, gutter) {
  var cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  var cellW = 0, cellH = 0;
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].w > cellW) cellW = nodes[i].w;
    if (nodes[i].h > cellH) cellH = nodes[i].h;
  }
  var rows = Math.ceil(nodes.length / cols);
  for (var j = 0; j < nodes.length; j++) {
    nodes[j].x = (j % cols) * (cellW + gutter) + cellW / 2;
    nodes[j].y = Math.floor(j / cols) * (cellH + gutter) + cellH / 2;
  }
  return {
    w: cols * cellW + (cols - 1) * gutter,
    h: rows * cellH + (rows - 1) * gutter
  };
}

/** Shelf-packs component boxes into a roughly square area. */
function sPackBoxes(boxes, targetW, gutter) {
  var x = 0, y = 0, shelfH = 0;
  for (var i = 0; i < boxes.length; i++) {
    var box = boxes[i];
    if (x > 0 && x + box.w > targetW) {
      x = 0;
      y += shelfH + gutter;
      shelfH = 0;
    }
    box.ox = x;
    box.oy = y;
    x += box.w + gutter;
    if (box.h > shelfH) shelfH = box.h;
  }
}

function sComputeOverviewLayout() {
  var GUTTER = 80;
  var components = sComputeComponents(sNodes);
  var boxes = [];
  var isolated = [];
  var i;

  for (i = 0; i < components.length; i++) {
    if (components[i].length === 1) {
      components[i][0]._comp = -1;
      isolated.push(components[i][0]);
      continue;
    }
    for (var ci = 0; ci < components[i].length; ci++) components[i][ci]._comp = i;
    var size = sLayoutComponent(components[i]);
    boxes.push({ nodes: components[i], w: size.w, h: size.h });
  }

  boxes.sort(function(a, b) { return b.h - a.h || b.w - a.w; });

  if (isolated.length > 0) {
    var isoSize = sLayoutIsolatedBlock(isolated, 28);
    boxes.push({ nodes: isolated, w: isoSize.w, h: isoSize.h });
  }

  var area = 0;
  for (i = 0; i < boxes.length; i++) area += boxes[i].w * boxes[i].h;
  var targetW = Math.max(900, Math.sqrt(area) * 1.6);
  sPackBoxes(boxes, targetW, GUTTER);

  for (i = 0; i < boxes.length; i++) {
    var placed = boxes[i];
    for (var j = 0; j < placed.nodes.length; j++) {
      placed.nodes[j].x += placed.ox;
      placed.nodes[j].y += placed.oy;
    }
  }

  sBuildGrids();
  sRouteAllEdges();
}

function sComputeStarLayout(centerName) {
  var center = sNodeMap[centerName];
  if (!center) return;
  var cx = sW / 2;
  var cy = sH / 2;
  center.x = cx;
  center.y = cy;

  var neighbors = [];
  for (var i = 0; i < sNodes.length; i++) {
    if (sNodes[i].name !== centerName) neighbors.push(sNodes[i]);
  }
  if (neighbors.length === 0) return;

  var maxW = 180;
  var maxH = 52;
  for (var i = 0; i < sNodes.length; i++) {
    if (sNodes[i].w > maxW) maxW = sNodes[i].w;
    if (sNodes[i].h > maxH) maxH = sNodes[i].h;
  }

  var isLandscape = sW >= sH;

  if (neighbors.length === 1) {
    if (isLandscape) {
      neighbors[0].x = cx + maxW + 100;
      neighbors[0].y = cy;
    } else {
      neighbors[0].x = cx;
      neighbors[0].y = cy + maxH + 80;
    }
    return;
  }

  if (neighbors.length === 2) {
    if (isLandscape) {
      var hGap = maxW + 100;
      neighbors[0].x = cx - hGap;
      neighbors[0].y = cy;
      neighbors[1].x = cx + hGap;
      neighbors[1].y = cy;
    } else {
      var vGap = maxH + 80;
      neighbors[0].x = cx;
      neighbors[0].y = cy - vGap;
      neighbors[1].x = cx;
      neighbors[1].y = cy + vGap;
    }
    return;
  }

  var rx = sW * 0.4 - maxW / 2;
  var ry = sH * 0.4 - maxH / 2;
  var minR = maxW / 2 + maxH / 2 + 40;
  if (rx < minR) rx = minR;
  if (ry < minR) ry = minR;

  var startAngle = isLandscape ? 0 : -Math.PI / 2;

  for (var i = 0; i < neighbors.length; i++) {
    var angle = startAngle + (2 * Math.PI * i) / neighbors.length;
    neighbors[i].x = cx + rx * Math.cos(angle);
    neighbors[i].y = cy + ry * Math.sin(angle);
  }
}

/** Columns drawn per table before the "+N more" line, unless all are shown. */
var S_DEFAULT_MAX_COLS = 7;

var S_PK_COLOR = "#ea2845";
var S_FK_COLOR = "#8b5cf6";
var S_IDX_COLOR = "#f59e0b";

/** Names a relation's property and that property with an Id suffix. */
function sKeyName(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sFkKeys(propertyName) {
  var base = sKeyName(propertyName);
  return [base, base + "id"];
}

function sForeignKeyColumns(entity) {
  var names = Object.create(null);
  for (var i = 0; i < entity.relations.length; i++) {
    var prop = entity.relations[i].propertyName;
    if (!prop) continue;
    var keys = sFkKeys(prop);
    names[keys[0]] = true;
    names[keys[1]] = true;
  }
  return names;
}

function sColumnKind(column, foreignKeys) {
  if (column.isPrimary) return "pk";
  if (foreignKeys[sKeyName(column.name)]) return "fk";
  if (column.isUnique || column.hasIndex) return "idx";
  return null;
}

/** Draws the key, link or index glyph that marks what a column is. */
function sDrawColumnIcon(ctx, kind, cx, cy) {
  ctx.save();
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "pk") {
    ctx.strokeStyle = S_PK_COLOR;
    ctx.beginPath();
    ctx.arc(cx - 2, cy, 2.1, 0, Math.PI * 2);
    ctx.moveTo(cx + 0.1, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx + 2.4, cy);
    ctx.lineTo(cx + 2.4, cy + 1.8);
    ctx.moveTo(cx + 4, cy);
    ctx.lineTo(cx + 4, cy + 1.8);
    ctx.stroke();
  } else if (kind === "fk") {
    ctx.strokeStyle = S_FK_COLOR;
    ctx.beginPath();
    ctx.arc(cx - 2.4, cy, 2, 0, Math.PI * 2);
    ctx.moveTo(cx - 0.4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx + 2.2, cy - 1.7);
    ctx.lineTo(cx + 4, cy);
    ctx.lineTo(cx + 2.2, cy + 1.7);
    ctx.stroke();
  } else if (kind === "idx") {
    ctx.strokeStyle = S_IDX_COLOR;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 2.4);
    ctx.lineTo(cx + 4, cy - 2.4);
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 1.6, cy);
    ctx.moveTo(cx - 4, cy + 2.4);
    ctx.lineTo(cx - 0.6, cy + 2.4);
    ctx.stroke();
  }
  ctx.restore();
}

function sVisibleColCount(node, showCols) {
  if (!showCols) return 0;
  var total = node.entity.columns.length;
  return sShowAllCols ? total : Math.min(total, S_DEFAULT_MAX_COLS);
}

function sNodeHeight(node, showCols) {
  if (!showCols) return 52;
  var visible = sVisibleColCount(node, showCols);
  var hidden = node.entity.columns.length - visible;
  return 24 + visible * 16 + (hidden > 0 ? 16 : 0) + 8;
}

/** The overview shows columns; a focused star shows them for a small set. */
function sColumnsShown(count) {
  if (sShowCols !== null) return sShowCols;
  return !sFocusedMode || count <= 5;
}

/** Single source of truth for box size, used by both layout and drawing. */
function sApplyNodeSizes(nodes) {
  var showCols = sColumnsShown(nodes.length);
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].w = 180;
    nodes[i].h = sNodeHeight(nodes[i], showCols);
  }
  return showCols;
}

/**
 * Truncation depends only on the fixed box width and font, never on zoom, so
 * every label is measured once here instead of on every frame.
 */
function sCacheNodeLabels(nodes) {
  if (!sCtx) return;
  var BOX_W = 180;
  var maxNameW = BOX_W - 20 - 8;
  var maxMetaW = BOX_W - 16;
  function clip(text, maxW) {
    if (sCtx.measureText(text).width <= maxW) return text;
    var out = text;
    while (sCtx.measureText(out).width > maxW && out.length > 3) {
      out = out.slice(0, -1);
    }
    return out + "\\u2026";
  }
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    sCtx.font = "bold 12px " + RPT_FONT;
    n.nameStr = clip(n.name, maxNameW);
    sCtx.font = "11px " + RPT_FONT;
    n.metaStr = clip(n.entity.columns.length + " cols  \\u00b7  " + n.sizeLabel, maxMetaW);
    sCtx.font = "10px " + RPT_FONT;
    n.colTypes = [];
    for (var c = 0; c < n.entity.columns.length; c++) {
      n.colTypes.push(clip(n.entity.columns[c].type, 60));
    }
    var foreignKeys = sForeignKeyColumns(n.entity);
    sCtx.font = "11px " + RPT_FONT;
    n.colNames = [];
    n.colKinds = [];
    for (var k = 0; k < n.entity.columns.length; k++) {
      n.colNames.push(clip(n.entity.columns[k].name, 83));
      n.colKinds.push(sColumnKind(n.entity.columns[k], foreignKeys));
    }
  }
}

function sSetVisibleSubset(entityName) {
  if (!sFocusedMode) return;
  sCompGrids = null;

  var emptyState = document.getElementById("schema-empty-state");

  if (!entityName) {
    sNodes = [];
    sNodeMap = {};
    sEdgeRoutes = {};
    sEdgeKeys = [];
    if (emptyState) emptyState.style.display = "flex";
    sCanvas.style.display = "none";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  sCanvas.style.display = "block";

  var related = sGetRelatedEntities(entityName);
  sNodes = [];
  sNodeMap = {};
  for (var i = 0; i < sAllNodes.length; i++) {
    if (related.has(sAllNodes[i].name)) {
      sNodes.push(sAllNodes[i]);
      sNodeMap[sAllNodes[i].name] = sAllNodes[i];
    }
  }

  sApplyNodeSizes(sNodes);

  sComputeStarLayout(entityName);
  sRouteAllEdges();
  sCenterCamera();
  sScheduleRedraw();
}

function sCenterCamera() {
  if (sNodes.length === 0) return;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < sNodes.length; i++) {
    var n = sNodes[i];
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  }
  var graphW = maxX - minX;
  var graphH = maxY - minY;
  var cx = (minX + maxX) / 2;
  var cy = (minY + maxY) / 2;

  var padW = sW * 0.85;
  var padH = sH * 0.85;
  var fit = Math.min(1.5, Math.min(padW / (graphW || 1), padH / (graphH || 1)));
  // Records the fit so the controls can zoom out this far.
  sMinZoom = Math.min(0.2, fit);
  sZoom = Math.max(sMinZoom, fit);
  // Stops the fit at the zoom where 11px column text is still legible.
  var showingCols = sColumnsShown(sNodes.length);
  if (showingCols && sZoom < 0.75) {
    sZoom = 0.75;
    // Anchors the top left of the diagram instead of centring it.
    var pad = 40;
    sCamX = (pad - sW / 2) / sZoom + sW / 2 - minX;
    sCamY = (pad - sH / 2) / sZoom + sH / 2 - minY;
    return;
  }
  sCamX = sW / 2 - cx;
  sCamY = sH / 2 - cy;
}

// Drawing
function schemaDraw() {
  sSyncZoomUi();
  if (sNodes.length === 0) return;
  sCtx.save();
  sCtx.clearRect(0, 0, sW, sH);
  sCtx.translate(sW / 2, sH / 2);
  sCtx.scale(sZoom, sZoom);
  sCtx.translate(-sW / 2 + sCamX, -sH / 2 + sCamY);

  var selectedRelated = sSelectedEntity ? sGetRelatedEntities(sSelectedEntity) : null;
  var hovRelFrom = sHoveredRelation ? sHoveredRelation.fromEntity : null;
  var hovRelTo = sHoveredRelation ? sHoveredRelation.toEntity : null;

  // Draw relation lines as solid polylines
  var drawnEdges = {};
  for (var i = 0; i < schema.relations.length; i++) {
    var rel = schema.relations[i];
    if (rel.fromEntity === rel.toEntity) continue;
    var a = sNodeMap[rel.fromEntity];
    var b = sNodeMap[rel.toEntity];
    if (!a || !b) continue;
    if (sFocusedMode && sSelectedEntity &&
        rel.fromEntity !== sSelectedEntity && rel.toEntity !== sSelectedEntity) continue;

    var key = sEdgeKey(rel.fromEntity, rel.toEntity);
    if (drawnEdges[key]) continue;
    drawnEdges[key] = true;

    var points = sEdgeRoutes[key];
    if (!points || points.length < 2) continue;

    var isHovered = (sHoveredRelation && sEdgeKey(sHoveredRelation.fromEntity, sHoveredRelation.toEntity) === key);
    var dimmed = selectedRelated && !(selectedRelated.has(rel.fromEntity) && selectedRelated.has(rel.toEntity));

    sCtx.globalAlpha = dimmed ? 0.12 : 1;

    // Draw polyline with rounded corners
    sCtx.beginPath();
    sCtx.moveTo(points[0].x, points[0].y);
    var cornerR = 3 / sZoom;
    for (var p = 1; p < points.length - 1; p++) {
      sCtx.arcTo(points[p].x, points[p].y, points[p + 1].x, points[p + 1].y, cornerR);
    }
    sCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

    if (isHovered) {
      sCtx.save();
      sCtx.shadowColor = "#ffffff";
      sCtx.shadowBlur = 8;
      sCtx.strokeStyle = "#ffffff";
      sCtx.lineWidth = 2.5 / sZoom;
      sCtx.stroke();
      sCtx.restore();
    } else {
      sCtx.strokeStyle = "#555";
      sCtx.lineWidth = 1.5 / sZoom;
      sCtx.stroke();
    }

    // Cardinality label at polyline midpoint
    if (sZoom >= 0.35) {
      var mid = sPolylineMidpoint(points);
      var labelStr = sRelLabel(rel.type);
      sCtx.font = (10 / sZoom) + "px " + RPT_FONT;
      sCtx.textAlign = "center";
      sCtx.textBaseline = "bottom";
      sCtx.fillStyle = isHovered ? "#ffffff" : "#666";
      sCtx.fillText(labelStr, mid.x, mid.y - 4 / sZoom);
    }
  }
  sCtx.globalAlpha = 1;

  // Draw entity boxes
  var BOX_W = 180;
  var HDR_H = 24;
  var COL_ROW_H = 16;
  var showCols = sApplyNodeSizes(sNodes);

  for (var i = 0; i < sNodes.length; i++) {
    var n = sNodes[i];
    var cols = n.entity.columns;
    var visibleColCount = sVisibleColCount(n, showCols);
    var hasMore = cols.length > visibleColCount;
    var BOX_H = n.h;

    var x = n.x - BOX_W / 2;
    var y = n.y - BOX_H / 2;
    var isSelected = (sSelectedEntity === n.name);
    var isHovered = (sHoveredEntity && sHoveredEntity.name === n.name);
    var isHoverConnected = (hovRelFrom === n.name || hovRelTo === n.name);
    var dimmed = selectedRelated && !selectedRelated.has(n.name);

    sCtx.globalAlpha = dimmed ? 0.15 : 1;

    // Shadow for selected
    if (isSelected) {
      sCtx.save();
      sCtx.shadowColor = "rgba(234,40,69,0.4)";
      sCtx.shadowBlur = 12;
    }

    // Body background (full box)
    sCtx.beginPath();
    sCtx.rect(x, y, BOX_W, BOX_H);
    sCtx.fillStyle = "#151515";
    sCtx.fill();

    // Border
    sCtx.strokeStyle = isSelected ? "#ea2845" : (isHoverConnected || isHovered) ? "#ffffff" : "rgba(255,255,255,0.06)";
    sCtx.lineWidth = (isSelected || isHoverConnected || isHovered) ? 2 : 1;
    sCtx.stroke();

    if (isSelected) sCtx.restore();

    // Header background (top portion)
    sCtx.fillStyle = "#0d0d0d";
    sCtx.fillRect(x, y, BOX_W, HDR_H);

    // Separator line between header and body
    sCtx.beginPath();
    sCtx.moveTo(x + 1, y + HDR_H);
    sCtx.lineTo(x + BOX_W - 1, y + HDR_H);
    sCtx.strokeStyle = "rgba(255,255,255,0.06)";
    sCtx.lineWidth = 1;
    sCtx.stroke();

    // Red square icon (visual anchor)
    var iconSize = 6;
    var iconX = x + 8;
    var iconY = y + HDR_H / 2 - iconSize / 2;
    sCtx.fillStyle = "#ea2845";
    sCtx.fillRect(iconX, iconY, iconSize, iconSize);

    // Entity name (after icon). Below this zoom the glyphs are sub-pixel mush.
    if (sZoom >= 0.15) {
      sCtx.fillStyle = "#e0e0e0";
      sCtx.font = "bold 12px " + RPT_FONT;
      sCtx.textAlign = "left";
      sCtx.textBaseline = "middle";
      sCtx.fillText(n.nameStr || n.name, iconX + iconSize + 6, y + HDR_H / 2);
    }

    // Body text is skipped below this zoom, where a row is about one pixel tall.
    var showBodyText = sZoom >= 0.35;
    if (showCols && showBodyText) {
      // Draw column rows below header
      var colY = y + HDR_H;
      for (var c = 0; c < visibleColCount; c++) {
        var col = cols[c];
        // Key, link or index glyph, then the column name beside it
        var kind = n.colKinds ? n.colKinds[c] : null;
        if (kind) {
          sDrawColumnIcon(sCtx, kind, x + 13, colY + COL_ROW_H / 2);
        }
        sCtx.fillStyle = kind === "pk" ? "#e0e0e0" : "#ccc";
        sCtx.font = "11px " + RPT_FONT;
        sCtx.textAlign = "left";
        sCtx.textBaseline = "middle";
        sCtx.fillText(n.colNames ? n.colNames[c] : col.name, x + 21, colY + COL_ROW_H / 2);
        // Column type (right-aligned, dimmer)
        sCtx.fillStyle = "#3b82f6";
        sCtx.font = "10px " + RPT_FONT;
        sCtx.textAlign = "right";
        sCtx.fillText(n.colTypes ? n.colTypes[c] : col.type, x + BOX_W - 10, colY + COL_ROW_H / 2);
        colY += COL_ROW_H;
      }
      // "+N more" indicator
      if (hasMore) {
        sCtx.fillStyle = "#666";
        sCtx.font = "10px " + RPT_FONT;
        sCtx.textAlign = "left";
        sCtx.fillText("+" + (cols.length - visibleColCount) + " more", x + 10, colY + COL_ROW_H / 2);
      }
    } else if (!showCols && showBodyText) {
      // Meta line: "N cols · ~X KB"
      sCtx.fillStyle = "#666";
      sCtx.font = "11px " + RPT_FONT;
      sCtx.fillText(n.metaStr || "", x + 8, y + HDR_H + (BOX_H - HDR_H) / 2);
    }
  }
  sCtx.globalAlpha = 1;
  sCtx.restore();
}

// Tooltip
function sShowTooltip(entity, screenX, screenY) {
  if (!sTooltipEl) return;
  var colsHtml = "";
  var maxCols = Math.min(entity.columns.length, 12);
  for (var i = 0; i < maxCols; i++) {
    var c = entity.columns[i];
    colsHtml += '<li><span class="col-name">' + escHtml(c.name) + '</span> <span class="col-type">' + escHtml(c.type) + '</span></li>';
  }
  if (entity.columns.length > maxCols) {
    colsHtml += '<li style="color:var(--text-dim)">+ ' + (entity.columns.length - maxCols) + ' more</li>';
  }
  var tableInfo = entity.tableName && entity.tableName !== entity.name
    ? '<div class="tt-table">Table: ' + escHtml(entity.tableName) + '</div>'
    : '';
  sTooltipEl.innerHTML = '<div class="tt-name">' + escHtml(entity.name) + '</div>' +
    tableInfo +
    '<ul class="tt-cols">' + colsHtml + '</ul>' +
    '<div class="tt-size">' + formatBytes(estimateRowSize(entity)) + ' est. row size</div>';
  sTooltipEl.style.display = "block";

  // Position tooltip near cursor but keep it within viewport
  var mainRect = sCanvas.parentElement.getBoundingClientRect();
  var tx = screenX + 16;
  var ty = screenY - 10;
  sTooltipEl.style.left = tx + "px";
  sTooltipEl.style.top = ty + "px";

  // Adjust if tooltip goes off-screen
  requestAnimationFrame(function() {
    var ttRect = sTooltipEl.getBoundingClientRect();
    if (ttRect.right > mainRect.right - 8) {
      sTooltipEl.style.left = (screenX - ttRect.width - 8) + "px";
    }
    if (ttRect.bottom > mainRect.bottom - 8) {
      sTooltipEl.style.top = (screenY - ttRect.height - 8) + "px";
    }
  });
}

function sHideTooltip() {
  if (sTooltipEl) sTooltipEl.style.display = "none";
}

function sShowRelBadge(rel, screenX, screenY) {
  if (!sRelBadgeEl) return;
  var label = sRelLabel(rel.type);
  sRelBadgeEl.innerHTML =
    '<span class="rb-type">' + label + '</span>' +
    escHtml(rel.fromEntity) + '<span class="rb-arrow">&rarr;</span>' + escHtml(rel.toEntity) +
    ' <span style="color:var(--text-dim);font-size:10px">' + escHtml(rel.propertyName) + '</span>';
  sRelBadgeEl.style.display = "block";
  var tx = screenX + 16;
  var ty = screenY - 10;
  sRelBadgeEl.style.left = tx + "px";
  sRelBadgeEl.style.top = ty + "px";
  requestAnimationFrame(function() {
    var mainRect = sCanvas.parentElement.getBoundingClientRect();
    var r = sRelBadgeEl.getBoundingClientRect();
    if (r.right > mainRect.right - 8) sRelBadgeEl.style.left = (screenX - r.width - 8) + "px";
    if (r.bottom > mainRect.bottom - 8) sRelBadgeEl.style.top = (screenY - r.height - 8) + "px";
  });
}

function sHideRelBadge() {
  if (sRelBadgeEl) sRelBadgeEl.style.display = "none";
}

// Canvas resize for schema
function sResize() {
  var container = sCanvas.parentElement;
  var prevW = sW, prevH = sH;
  sW = container.clientWidth;
  sH = container.clientHeight;
  // Keep whatever was in the middle of the viewport in the middle of it.
  if (prevW && prevH) {
    sCamX += (sW - prevW) / 2;
    sCamY += (sH - prevH) / 2;
  }
  sCanvas.width = sW * sDpr;
  sCanvas.height = sH * sDpr;
  sCanvas.style.width = sW + "px";
  sCanvas.style.height = sH + "px";
  sCtx.setTransform(sDpr, 0, 0, sDpr, 0, 0);
  if (sFocusedMode && sSelectedEntity && sNodes.length > 0) {
    sComputeStarLayout(sSelectedEntity);
    sRouteAllEdges();
    sCenterCamera();
  }
  sScheduleRedraw();
}

// Sidebar click → pan to entity
function sPanToEntity(name) {
  var node = sNodeMap[name];
  if (!node) return;
  sCamX = sW / 2 - node.x;
  sCamY = sH / 2 - node.y;
  sScheduleRedraw();
}

// Sidebar highlight sync
function sSyncSidebarHighlight(entityName) {
  var rows = document.querySelectorAll(".st-row[data-entity]");
  for (var i = 0; i < rows.length; i++) {
    var match = rows[i].dataset.entity === entityName;
    rows[i].classList.toggle("st-selected", match);
    if (match) {
      rows[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}

function renderSchema() {
  var sidebarEl = document.getElementById("schema-entity-list");
  sCanvas = document.getElementById("schema-canvas");
  sTooltipEl = document.getElementById("schema-tooltip");
  sRelBadgeEl = document.getElementById("schema-rel-badge");
  if (!sidebarEl || !sCanvas || schema.entities.length === 0) return;

  sCtx = sCanvas.getContext("2d");
  sDpr = window.devicePixelRatio || 1;

  // Build nodes from entities
  for (var i = 0; i < schema.entities.length; i++) {
    var entity = schema.entities[i];
    var node = {
      name: entity.name,
      entity: entity,
      x: 0, y: 0,
      w: 180, h: 52,
      sizeLabel: formatBytes(estimateRowSize(entity))
    };
    sNodes.push(node);
    sNodeMap[entity.name] = node;
  }

  sAllNodes = sNodes.slice();
  sAllNodeMap = {};
  for (var i = 0; i < sAllNodes.length; i++) {
    sAllNodeMap[sAllNodes[i].name] = sAllNodes[i];
  }
  sCacheNodeLabels(sAllNodes);
  // Starting mode only. The toolbar toggle switches it from here on.
  sFocusedMode = schema.entities.length > 7;

  // Set count badge
  document.getElementById("schema-entity-count").textContent = schema.entities.length;

  // Set dynamic sidebar title
  var sTitleEl = document.getElementById("schema-sidebar-title");
  if (sTitleEl && schema.orm) {
    sTitleEl.textContent = schema.orm.charAt(0).toUpperCase() + schema.orm.slice(1) + " Tables";
  }

  // SVG icon constants
  var ICON_TABLE = RPT.icon({ name: "schemaTable" });
  var ICON_TABLE_OPEN = RPT.icon({ name: "schemaTableOpen" });
  var ICON_FOLDER_CLOSED = RPT.icon({ name: "schemaFolder" });
  var ICON_FOLDER_OPEN = RPT.icon({ name: "schemaFolderOpen" });
  var ICON_KEY = RPT.icon({ name: "schemaKey" });
  var ICON_COLUMN = RPT.icon({ name: "schemaColumn" });
  var ICON_FK = RPT.icon({ name: "schemaFk" });
  var ICON_INDEX = RPT.icon({ name: "schemaIndex" });

  // Tree row builder
  function sBuildTreeRow(depth, toggleId, icon, labelHtml, extra, classes, dataAttrs, iconTip) {
    return RPT.treeRow({
      depth: depth,
      toggleId: toggleId,
      icon: icon,
      iconTip: iconTip ? escHtml(iconTip) : undefined,
      label: labelHtml,
      extra: extra,
      classes: classes,
      dataAttrs: dataAttrs
    });
  }

  var TIP_PK = "Primary key \\u00b7 identifies the row";
  var TIP_FK = "Foreign key \\u00b7 points at another table";
  var TIP_IDX = "Indexed \\u00b7 unique or carries an index";

  // Build sidebar tree
  var sidebarHtml = "";
  var rootId = "root-tables";
  sidebarHtml += sBuildTreeRow(0, rootId, ICON_FOLDER_OPEN, '<span class="st-group-name">tables</span>', '<span class="st-count">' + schema.entities.length + '</span>', "", "");
  sidebarHtml += '<div class="st-children st-open" id="st-' + rootId + '">';

  for (var i = 0; i < schema.entities.length; i++) {
    var entity = schema.entities[i];
    var entityId = "entity-" + i;
    var displayName = entity.tableName || entity.name;
    sidebarHtml += sBuildTreeRow(1, entityId, ICON_TABLE, '<span class="st-entity-name">' + escHtml(displayName) + '</span>', "", "", ' data-entity="' + escHtml(entity.name) + '"');
    sidebarHtml += '<div class="st-children" id="st-' + entityId + '">';

    // Columns group
    if (entity.columns.length > 0) {
      var colGroupId = entityId + "-cols";
      sidebarHtml += sBuildTreeRow(2, colGroupId, ICON_FOLDER_CLOSED, '<span class="st-group-name">columns</span>', '<span class="st-count">' + entity.columns.length + '</span>', "", "");
      sidebarHtml += '<div class="st-children" id="st-' + colGroupId + '">';
      var entityForeignKeys = sForeignKeyColumns(entity);
      for (var c = 0; c < entity.columns.length; c++) {
        var col = entity.columns[c];
        var colKind = sColumnKind(col, entityForeignKeys);
        var colIcon = colKind === "pk" ? ICON_KEY
          : colKind === "fk" ? ICON_FK
          : colKind === "idx" ? ICON_INDEX
          : ICON_COLUMN;
        var colExtra = '<span class="st-col-type">' + escHtml(col.type) + '</span>';
        if (col.defaultValue) {
          colExtra += '<span class="st-col-default">= ' + escHtml(col.defaultValue) + '</span>';
        }
        var colTags = [];
        if (col.isNullable) colTags.push("null");
        if (col.isGenerated) colTags.push("gen");
        if (col.isUnique && !col.isPrimary) colTags.push("uniq");
        if (col.hasIndex && !(col.isPrimary || col.isUnique)) colTags.push("idx");
        if (colTags.length > 0) {
          colExtra += '<span class="st-col-tags">' + colTags.join(" \\u00B7 ") + '</span>';
        }
        var colTip = colKind === "pk" ? TIP_PK
          : colKind === "fk" ? TIP_FK
          : colKind === "idx" ? TIP_IDX
          : "";
        sidebarHtml += sBuildTreeRow(3, null, colIcon, escHtml(col.name), colExtra, "", "", colTip);
      }
      sidebarHtml += '</div>';
    }

    // Primary keys group
    var pks = [];
    for (var c = 0; c < entity.columns.length; c++) {
      if (entity.columns[c].isPrimary) pks.push(entity.columns[c]);
    }
    if (pks.length > 0) {
      var pkGroupId = entityId + "-keys";
      sidebarHtml += sBuildTreeRow(2, pkGroupId, ICON_FOLDER_CLOSED, '<span class="st-group-name">keys</span>', '<span class="st-count">' + pks.length + '</span>', "", "");
      sidebarHtml += '<div class="st-children" id="st-' + pkGroupId + '">';
      var pkColNames = [];
      for (var p = 0; p < pks.length; p++) { pkColNames.push(pks[p].name); }
      var pkLabel = escHtml((entity.tableName || entity.name).toLowerCase() + '_pkey');
      sidebarHtml += sBuildTreeRow(3, null, ICON_KEY, pkLabel, '<span class="st-col-type">(' + escHtml(pkColNames.join(", ")) + ')</span>', "", "", TIP_PK);
      sidebarHtml += '</div>';
    }

    // Foreign keys group (relations from this entity)
    if (entity.relations.length > 0) {
      var fkGroupId = entityId + "-fks";
      sidebarHtml += sBuildTreeRow(2, fkGroupId, ICON_FOLDER_CLOSED, '<span class="st-group-name">foreign keys</span>', '<span class="st-count">' + entity.relations.length + '</span>', "", "");
      sidebarHtml += '<div class="st-children" id="st-' + fkGroupId + '">';
      for (var r = 0; r < entity.relations.length; r++) {
        var rel = entity.relations[r];
        var relLabel = sRelLabel(rel.type);
        var fkName = escHtml((entity.tableName || entity.name).toLowerCase() + '_' + rel.propertyName + '_fkey');
        sidebarHtml += sBuildTreeRow(3, null, ICON_FK, fkName, '<span class="st-col-type">(' + escHtml(rel.propertyName) + ')</span>' + '<span class="st-rel-type">' + relLabel + '</span>', "", "", TIP_FK);
      }
      sidebarHtml += '</div>';
    }

    // Indexes group (unique non-PK columns)
    var indexes = [];
    for (var c = 0; c < entity.columns.length; c++) {
      var idxCol = entity.columns[c];
      if (!idxCol.isPrimary && (idxCol.isUnique || idxCol.hasIndex)) indexes.push(idxCol);
    }
    if (indexes.length > 0) {
      var idxGroupId = entityId + "-idx";
      sidebarHtml += sBuildTreeRow(2, idxGroupId, ICON_FOLDER_CLOSED, '<span class="st-group-name">indexes</span>', '<span class="st-count">' + indexes.length + '</span>', "", "");
      sidebarHtml += '<div class="st-children" id="st-' + idxGroupId + '">';
      for (var x = 0; x < indexes.length; x++) {
        sidebarHtml += sBuildTreeRow(3, null, ICON_INDEX, escHtml(indexes[x].name), '<span class="st-col-type">' + escHtml(indexes[x].type) + '</span>', "", "", TIP_IDX);
      }
      sidebarHtml += '</div>';
    }

    sidebarHtml += '</div>'; // close entity children
  }
  sidebarHtml += '</div>'; // close root children
  sidebarEl.innerHTML = sidebarHtml;

  // Tree click handler
  sidebarEl.addEventListener("click", function(e) {
    var toggleAlreadyHandled = false;
    var toggleEl = e.target.closest(".st-toggle");
    if (toggleEl) {
      var toggleId = toggleEl.dataset.toggle;
      var childDiv = document.getElementById("st-" + toggleId);
      if (childDiv) {
        var isOpen = childDiv.classList.toggle("st-open");
        toggleEl.textContent = isOpen ? "\\u25BE" : "\\u25B8";
        // Swap folder icon if this row has one
        var iconEl = toggleEl.parentElement.querySelector(".st-icon");
        if (iconEl) {
          var groupName = toggleEl.parentElement.querySelector(".st-group-name");
          if (groupName) {
            iconEl.innerHTML = isOpen ? ICON_FOLDER_OPEN : ICON_FOLDER_CLOSED;
          } else if (toggleEl.closest(".st-row[data-entity]")) {
            iconEl.innerHTML = isOpen ? ICON_TABLE_OPEN : ICON_TABLE;
          }
        }
        toggleAlreadyHandled = true;
      }
      // If this toggle is on a non-entity row, stop here
      var row = toggleEl.closest(".st-row");
      if (!row || !row.dataset.entity) {
        e.stopPropagation();
        return;
      }
    }

    // Clicking anywhere on a group row (not just the arrow) toggles it
    if (!toggleEl) {
      var clickedRow = e.target.closest(".st-row");
      if (clickedRow && !clickedRow.dataset.entity) {
        var rowToggle = clickedRow.querySelector(".st-toggle");
        if (rowToggle) {
          var tid = rowToggle.dataset.toggle;
          var cd = document.getElementById("st-" + tid);
          if (cd) {
            var open = cd.classList.toggle("st-open");
            rowToggle.textContent = open ? "\\u25BE" : "\\u25B8";
            var ico = clickedRow.querySelector(".st-icon");
            if (ico) {
              var gn = clickedRow.querySelector(".st-group-name");
              if (gn) ico.innerHTML = open ? ICON_FOLDER_OPEN : ICON_FOLDER_CLOSED;
            }
          }
          return;
        }
      }
    }

    var entityRow = e.target.closest(".st-row[data-entity]");
    if (!entityRow) return;
    var entityName = entityRow.dataset.entity;

    // Always select clicked entity (never deselect on close)
    sSelectedEntity = entityName;
    if (sSyncSidebar) sSyncSidebarHighlight(sSelectedEntity);

    // Toggle entity subtree open/closed (skip if arrow already handled it)
    if (!toggleAlreadyHandled) {
      var entityToggle = entityRow.querySelector(".st-toggle");
      if (entityToggle) {
        var eToggleId = entityToggle.dataset.toggle;
        var eChildDiv = document.getElementById("st-" + eToggleId);
        if (eChildDiv) {
          var isOpen = eChildDiv.classList.toggle("st-open");
          entityToggle.textContent = isOpen ? "\\u25BE" : "\\u25B8";
          var eIconEl = entityRow.querySelector(".st-icon");
          if (eIconEl) eIconEl.innerHTML = isOpen ? ICON_TABLE_OPEN : ICON_TABLE;
        }
      }
    }

    if (sFocusedMode) {
      sSetVisibleSubset(sSelectedEntity);
    } else {
      if (sSelectedEntity) sPanToEntity(sSelectedEntity);
      sScheduleRedraw();
    }
  });

  // Expand All / Collapse All buttons
  var expandAllBtn = document.getElementById("schema-expand-all");
  var collapseAllBtn = document.getElementById("schema-collapse-all");
  var entityListEl = document.getElementById("schema-entity-list");

  /** Closes every table, leaving the root list itself open. */
  function sCollapseTree() {
    if (!entityListEl) return;
    var children = entityListEl.querySelectorAll(".st-children");
    for (var i = 0; i < children.length; i++) {
      var isRoot = children[i].id && children[i].id.indexOf("st-root-") === 0;
      if (isRoot) continue;
      children[i].classList.remove("st-open");
    }
    var toggles = entityListEl.querySelectorAll(".st-toggle");
    for (var j = 0; j < toggles.length; j++) {
      var owned = document.getElementById("st-" + toggles[j].dataset.toggle);
      var open = owned ? owned.classList.contains("st-open") : false;
      toggles[j].textContent = open ? "\\u25BE" : "\\u25B8";
    }
    var entityRows = entityListEl.querySelectorAll(".st-row[data-entity]");
    for (var k = 0; k < entityRows.length; k++) {
      var ico = entityRows[k].querySelector(".st-icon");
      if (ico) ico.innerHTML = ICON_TABLE;
    }
  }

  /** Opens one table and its columns, and scrolls the list to it. */
  function sRevealEntity(name) {
    if (!entityListEl) return;
    var rows = entityListEl.querySelectorAll(".st-row[data-entity]");
    var row = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].dataset.entity === name) { row = rows[i]; break; }
    }
    if (!row) return;
    var toggle = row.querySelector(".st-toggle");
    var subtree = toggle ? document.getElementById("st-" + toggle.dataset.toggle) : null;
    if (subtree) {
      subtree.classList.add("st-open");
      toggle.textContent = "\\u25BE";
      var icon = row.querySelector(".st-icon");
      if (icon) icon.innerHTML = ICON_TABLE_OPEN;
      var groupRow = subtree.querySelector(".st-row");
      var groupToggle = groupRow ? groupRow.querySelector(".st-toggle") : null;
      if (groupToggle) {
        var group = document.getElementById("st-" + groupToggle.dataset.toggle);
        if (group) {
          group.classList.add("st-open");
          groupToggle.textContent = "\\u25BE";
          var groupIcon = groupRow.querySelector(".st-icon");
          if (groupIcon) groupIcon.innerHTML = ICON_FOLDER_OPEN;
        }
      }
    }
    // Put the table at the top of the list, just under the sticky header, so
    // its own columns are what follows it.
    var panel = document.getElementById("schema-sidebar");
    if (!panel) return;
    var sticky = panel.querySelector(".schema-sidebar-sticky");
    var stickyH = sticky ? sticky.getBoundingClientRect().height : 0;
    var delta = row.getBoundingClientRect().top - panel.getBoundingClientRect().top - stickyH;
    panel.scrollTop = panel.scrollTop + delta;
  }

  /** Mirrors the diagram's selection into the list, when asked to. */
  function sReflectSelection() {
    if (!sSyncSidebar) return;
    sSyncSidebarHighlight(sSelectedEntity);
    if (sSelectedEntity) {
      sRevealEntity(sSelectedEntity);
    } else {
      sCollapseTree();
    }
  }

  var syncBox = document.getElementById("schema-sync-sidebar");
  if (syncBox) {
    sSyncSidebar = syncBox.checked;
    syncBox.addEventListener("change", function() {
      sSyncSidebar = syncBox.checked;
      if (sSyncSidebar) sReflectSelection();
    });
  }

  var schemaSearchEl = document.getElementById("schema-search");
  if (schemaSearchEl) {
    schemaSearchEl.addEventListener("input", function() {
      var q = this.value.trim().toLowerCase();
      var entityRows = entityListEl.querySelectorAll(".st-row[data-entity]");
      for (var er = 0; er < entityRows.length; er++) {
        var row = entityRows[er];
        var label = row.querySelector(".st-label").textContent.toLowerCase();
        var show = q === "" || label.indexOf(q) >= 0 || row.dataset.entity.toLowerCase().indexOf(q) >= 0;
        row.style.display = show ? "" : "none";
        var kids = row.nextElementSibling;
        if (kids && kids.classList.contains("st-children")) {
          kids.style.display = show ? "" : "none";
        }
      }
    });
  }

  var sidebarCollapseBtn = document.getElementById("schema-sidebar-collapse");
  var sidebarShowBtn = document.getElementById("schema-sidebar-show");
  var schemaTab = document.getElementById("tab-schema");
  function sSetSidebarCollapsed(collapsed) {
    if (!schemaTab) return;
    schemaTab.classList.toggle("sidebar-collapsed", collapsed);
    sResize();
  }
  if (sidebarCollapseBtn) {
    sidebarCollapseBtn.addEventListener("click", function() { sSetSidebarCollapsed(true); });
  }
  if (sidebarShowBtn) {
    sidebarShowBtn.addEventListener("click", function() { sSetSidebarCollapsed(false); });
  }

  if (expandAllBtn && entityListEl) {
    expandAllBtn.addEventListener("click", function() {
      window.__ndTrack?.("schema_tree_expanded");
      var children = entityListEl.querySelectorAll(".st-children");
      for (var i = 0; i < children.length; i++) {
        children[i].classList.add("st-open");
      }
      var toggles = entityListEl.querySelectorAll(".st-toggle");
      for (var j = 0; j < toggles.length; j++) {
        toggles[j].textContent = "\\u25BE";
      }
      var entityRows = entityListEl.querySelectorAll(".st-row[data-entity]");
      for (var k = 0; k < entityRows.length; k++) {
        var ico = entityRows[k].querySelector(".st-icon");
        if (ico) ico.innerHTML = ICON_TABLE_OPEN;
      }
    });
  }

  if (collapseAllBtn && entityListEl) {
    collapseAllBtn.addEventListener("click", sCollapseTree);
  }

  // Diagram control buttons
  function sRecalcNodeSizes() {
    sApplyNodeSizes(sNodes);
  }

  var viewToggleBtn = document.getElementById("schema-toggle-view");

  function sSyncViewToggle() {
    if (!viewToggleBtn) return;
    viewToggleBtn.classList.toggle("active", !sFocusedMode);
    viewToggleBtn.setAttribute("aria-pressed", String(!sFocusedMode));
    viewToggleBtn.setAttribute("aria-label", sFocusedMode ? "Show all tables" : "Focus one table");
    viewToggleBtn.setAttribute("data-tip", sFocusedMode
      ? "All tables \\u00b7 lay out the whole schema at once"
      : "Focus \\u00b7 show one table and what it relates to");
  }

  function sShowAllTables() {
    sFocusedMode = false;
    var emptyState = document.getElementById("schema-empty-state");
    if (emptyState) emptyState.style.display = "none";
    sCanvas.style.display = "block";
    sNodes = sAllNodes.slice();
    sNodeMap = {};
    for (var i = 0; i < sNodes.length; i++) {
      sNodeMap[sNodes[i].name] = sNodes[i];
    }
    sRecalcNodeSizes();
    sComputeOverviewLayout();
    sCenterCamera();
    sSyncViewToggle();
    sScheduleRedraw();
  }

  function sFocusOneTable() {
    sFocusedMode = true;
    sSetVisibleSubset(sSelectedEntity);
    sSyncViewToggle();
    sScheduleRedraw();
  }

  if (viewToggleBtn) {
    viewToggleBtn.addEventListener("click", function() {
      if (sFocusedMode) {
        sShowAllTables();
      } else {
        sFocusOneTable();
      }
    });
  }

  var showAllBtn = document.getElementById("schema-show-all");
  if (showAllBtn) {
    showAllBtn.addEventListener("click", sShowAllTables);
  }

  var recenterBtn = document.getElementById("schema-recenter");
  if (recenterBtn) {
    recenterBtn.addEventListener("click", function() {
      sCenterCamera();
      sScheduleRedraw();
    });
  }

  // Relayout after a size change so the taller boxes do not overlap.
  function sRelayoutForSizeChange() {
    sRecalcNodeSizes();
    if (sFocusedMode && sSelectedEntity) {
      sSetVisibleSubset(sSelectedEntity);
    } else if (!sFocusedMode) {
      sComputeOverviewLayout();
      sCenterCamera();
      sScheduleRedraw();
    }
  }

  var toggleColsBtn = document.getElementById("schema-toggle-cols");
  if (toggleColsBtn) {
    toggleColsBtn.addEventListener("click", function() {
      sShowAllCols = !sShowAllCols;
      if (sShowAllCols) sShowCols = true;
      toggleColsBtn.classList.toggle("active", sShowAllCols);
      toggleColsBtn.setAttribute("aria-pressed", String(sShowAllCols));
      toggleColsBtn.setAttribute("aria-label", sShowAllCols
        ? "Show the first " + S_DEFAULT_MAX_COLS + " columns"
        : "Show every column");
      toggleColsBtn.setAttribute("data-tip", sShowAllCols
        ? "First " + S_DEFAULT_MAX_COLS + " \\u00b7 go back to a short column list"
        : "Every column \\u00b7 stop cutting the list at seven");
      sRelayoutForSizeChange();
    });
  }

  var zoomRange = document.getElementById("schema-zoom-range");
  var zoomInBtn = document.getElementById("schema-zoom-in");
  var zoomOutBtn = document.getElementById("schema-zoom-out");
  var zoomValueBtn = document.getElementById("schema-zoom-value");

  function sSetZoom(next) {
    sZoom = Math.max(sZoomFloor(), Math.min(5, next));
    sSyncZoomUi();
    sScheduleRedraw();
  }

  if (zoomRange) {
    zoomRange.addEventListener("input", function() {
      sSetZoom(Number(zoomRange.value) / 100);
    });
  }
  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", function() { sSetZoom(sZoom * 1.2); });
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", function() { sSetZoom(sZoom / 1.2); });
  }
  if (zoomValueBtn) {
    zoomValueBtn.addEventListener("click", function() {
      sCenterCamera();
      sSyncZoomUi();
      sScheduleRedraw();
    });
  }

  var expandTablesBtn = document.getElementById("schema-expand-tables");
  if (expandTablesBtn) {
    expandTablesBtn.addEventListener("click", function() {
      sShowCols = true;
      sRecalcNodeSizes();
      if (sFocusedMode && sSelectedEntity) {
        sSetVisibleSubset(sSelectedEntity);
      } else {
        sComputeOverviewLayout();
        sCenterCamera();
        sScheduleRedraw();
      }
    });
  }

  var minimizeTablesBtn = document.getElementById("schema-minimize-tables");
  if (minimizeTablesBtn) {
    minimizeTablesBtn.addEventListener("click", function() {
      sShowCols = false;
      sRecalcNodeSizes();
      if (sFocusedMode && sSelectedEntity) {
        sSetVisibleSubset(sSelectedEntity);
      } else {
        sComputeOverviewLayout();
        sCenterCamera();
        sScheduleRedraw();
      }
    });
  }

  // Canvas setup
  sResize();
  window.addEventListener("resize", function() {
    if (activeTab === "schema") sResize();
  });

  // Layout initialization
  sSyncViewToggle();
  if (sFocusedMode) {
    var emptyState = document.getElementById("schema-empty-state");
    if (emptyState) emptyState.style.display = "flex";
    sCanvas.style.display = "none";
    sNodes = [];
    sNodeMap = {};
    sEdgeRoutes = {};
    sEdgeKeys = [];
  } else {
    sApplyNodeSizes(sNodes);
    sComputeOverviewLayout();
    sCenterCamera();
  }

  // Mouse interactions
  sCanvas.addEventListener("mousedown", function(e) {
    var rect = sCanvas.getBoundingClientRect();
    var sx = e.clientX - rect.left;
    var sy = e.clientY - rect.top;
    var pos = sScreenToWorld(sx, sy);
    var hit = sHitTestEntity(pos.x, pos.y);
    sDragMoved = false;
    sPanStart = { x: e.clientX, y: e.clientY };
    if (hit) {
      sDragging = hit;
      sDragOffset = { x: hit.x - pos.x, y: hit.y - pos.y };
      sHideTooltip();
      sHideRelBadge();
    } else {
      sPanning = true;
    }
  });

  sCanvas.addEventListener("mousemove", function(e) {
    var rect = sCanvas.getBoundingClientRect();
    var sx = e.clientX - rect.left;
    var sy = e.clientY - rect.top;
    var pos = sScreenToWorld(sx, sy);

    if ((sDragging || sPanning) && !sDragMoved &&
        Math.abs(e.clientX - sPanStart.x) < 4 &&
        Math.abs(e.clientY - sPanStart.y) < 4) return;

    if (sDragging) {
      sDragMoved = true;
      sDragging.x = pos.x + sDragOffset.x;
      sDragging.y = pos.y + sDragOffset.y;
      sRerouteEdgesForNode(sDragging.name);
      sScheduleRedraw();
      sHideTooltip();
      sHideRelBadge();
    } else if (sPanning) {
      sDragMoved = true;
      sCamX += (e.clientX - sPanStart.x) / sZoom;
      sCamY += (e.clientY - sPanStart.y) / sZoom;
      sPanStart = { x: e.clientX, y: e.clientY };
      sScheduleRedraw();
      sHideTooltip();
      sHideRelBadge();
    } else {
      // Hover detection
      var hitEntity = sHitTestEntity(pos.x, pos.y);
      var hitRel = hitEntity ? null : sHitTestRelation(pos.x, pos.y);

      if (hitEntity !== sHoveredEntity) {
        sHoveredEntity = hitEntity;
        sCanvas.style.cursor = hitEntity ? "pointer" : "grab";
        if (hitEntity) {
          sShowTooltip(hitEntity.entity, sx, sy);
        } else {
          sHideTooltip();
        }
        sScheduleRedraw();
      } else if (hitEntity) {
        // Update tooltip position while hovering
        sTooltipEl.style.left = (sx + 16) + "px";
        sTooltipEl.style.top = (sy - 10) + "px";
      }

      if (hitRel !== sHoveredRelation) {
        sHoveredRelation = hitRel;
        if (!hitEntity) sCanvas.style.cursor = hitRel ? "pointer" : "grab";
        if (hitRel) {
          sShowRelBadge(hitRel, sx, sy);
        } else {
          sHideRelBadge();
        }
        sScheduleRedraw();
      } else if (hitRel) {
        sRelBadgeEl.style.left = (sx + 16) + "px";
        sRelBadgeEl.style.top = (sy - 10) + "px";
      }
    }
  });

  sCanvas.addEventListener("mouseup", function() {
    if (sDragging && !sDragMoved) {
      sSelectedEntity = sSelectedEntity === sDragging.name ? null : sDragging.name;
      sReflectSelection();
      if (sFocusedMode) {
        sSetVisibleSubset(sSelectedEntity);
      } else {
        sScheduleRedraw();
      }
    } else if (sPanning && !sDragMoved && sSelectedEntity) {
      // A click on empty canvas clears the selection.
      sSelectedEntity = null;
      sReflectSelection();
      if (sFocusedMode) {
        sSetVisibleSubset(null);
      } else {
        sScheduleRedraw();
      }
    }
    sDragging = null;
    sPanning = false;
    sDragMoved = false;
  });

  sCanvas.addEventListener("mouseleave", function() {
    sHoveredEntity = null;
    sHoveredRelation = null;
    sHideTooltip();
    sHideRelBadge();
    sScheduleRedraw();
  });

  sCanvas.addEventListener("wheel", function(e) {
    e.preventDefault();
    // ctrlKey or metaKey means a pinch, which zooms; anything else pans.
    if (e.ctrlKey || e.metaKey) {
      var factor = e.deltaY > 0 ? 0.92 : 1.08;
      sZoom = Math.max(sZoomFloor(), Math.min(5, sZoom * factor));
    } else {
      sCamX -= e.deltaX / sZoom;
      sCamY -= e.deltaY / sZoom;
      sHideTooltip();
      sHideRelBadge();
    }
    sScheduleRedraw();
  }, { passive: false });

  // Initial draw
  sScheduleRedraw();

  // ── Schema diagnostics panel ──
  var sDiagCountEl = document.getElementById("schema-diag-count");
  var sDiagHeaderEl = document.getElementById("schema-diag-header");
  var sDiagBodyEl = document.getElementById("schema-diag-body");
  var sDiagListEl = document.getElementById("schema-diag-list");
  var sDiagChevronEl = document.getElementById("schema-diag-chevron");

  if (sDiagCountEl && sDiagHeaderEl && sDiagBodyEl && sDiagListEl && sDiagChevronEl) {
    var schemaDiags = [];
    for (var di = 0; di < diagnostics.length; di++) {
      if (diagnostics[di].category === "schema") schemaDiags.push(diagnostics[di]);
    }

    var diagCount = schemaDiags.length;
    sDiagCountEl.textContent = diagCount + (diagCount === 1 ? " issue" : " issues");
    if (diagCount > 0) {
      sDiagCountEl.classList.add("has-issues");
    }

    if (diagCount === 0) {
      sDiagListEl.innerHTML = '<div class="sd-empty">No schema issues found</div>';
    } else {
      var diagHtml = "";
      for (var si = 0; si < schemaDiags.length; si++) {
        var sd = schemaDiags[si];
        var sevColor = sd.severity === "error" ? "var(--sev-error)" : sd.severity === "warning" ? "var(--sev-warning)" : "var(--sev-info)";

        // Extract entity name from message
        var sdEntityName = "";
        var onMatch = sd.message.match(/on '([^']+)'/);
        var firstMatch = sd.message.match(/'([^']+)'/);
        if (onMatch && sAllNodeMap[onMatch[1]]) {
          sdEntityName = onMatch[1];
        } else if (firstMatch && sAllNodeMap[firstMatch[1]]) {
          sdEntityName = firstMatch[1];
        }

        diagHtml += '<div class="sd-item">';
        diagHtml += '<span class="sev-dot" style="background:' + sevColor + '"></span>';
        diagHtml += '<span class="sd-rule">' + escHtml(sd.rule) + '</span>';
        if (sdEntityName) {
          diagHtml += '<span class="sd-entity" data-entity="' + escHtml(sdEntityName) + '">' + escHtml(sdEntityName) + '</span>';
        }
        diagHtml += '<span class="sd-msg">' + escHtml(sd.message) + '</span>';
        diagHtml += '</div>';
      }
      sDiagListEl.innerHTML = diagHtml;
    }

    // Toggle panel
    sDiagHeaderEl.addEventListener("click", function() {
      var isOpen = sDiagBodyEl.style.display !== "none";
      sDiagBodyEl.style.display = isOpen ? "none" : "block";
      sDiagChevronEl.classList.toggle("open", !isOpen);
      sResize();
    });

    // Entity click navigation
    sDiagListEl.addEventListener("click", function(e) {
      var entityEl = e.target.closest(".sd-entity");
      if (!entityEl) return;
      var name = entityEl.dataset.entity;
      if (!name) return;

      sSelectedEntity = name;
      sSyncSidebarHighlight(name);
      if (sFocusedMode) {
        sSetVisibleSubset(name);
      } else {
        sPanToEntity(name);
        sScheduleRedraw();
      }
    });
  }
}
`;
