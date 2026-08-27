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
function sHitTestRelation(wx, wy) {
  var threshold = 8 / sZoom;
  for (var k = 0; k < sEdgeKeys.length; k++) {
    var key = sEdgeKeys[k];
    var points = sEdgeRoutes[key];
    if (!points || points.length < 2) continue;
    for (var p = 0; p < points.length - 1; p++) {
      var d = RPT.pointToSegmentDist(wx, wy, points[p].x, points[p].y, points[p + 1].x, points[p + 1].y);
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

// ── Schema: channel routing over the layered grid ──
var sCompGrids = null;

function sBuildGrids() {
  sCompGrids = RPT.buildGrids(sNodes);
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
  var out = RPT.channelRouteAll(schema.relations, sNodes, sNodeMap, sCompGrids, sPortRowY, sRelPortNames);
  sEdgeRoutes = out.routes;
  sEdgeKeys = out.keys;
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
    var key = RPT.edgeKey(rel.fromEntity, rel.toEntity);
    if (seen[key]) continue;
    seen[key] = true;
    sEdgeRoutes[key] = RPT.routeManhattan(sNodes, a, b);
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
      if (a && b) sEdgeRoutes[key] = RPT.routeManhattan(sNodes, a, b);
    }
  }
}

/** Groups nodes into connected components using the relation edges. */
var S_BOX_W = RPT.SCHEMA_BOX_W;

function sComputeOverviewLayout() {
  RPT.computeOverviewLayout(schema.relations, sNodes);
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
var S_DEFAULT_MAX_COLS = RPT.SCHEMA_DEFAULT_MAX_COLS;

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
  return RPT.visibleColCount(node, showCols, sShowAllCols);
}

function sNodeHeight(node, showCols) {
  return RPT.nodeHeight(node, showCols, sShowAllCols);
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

    var key = RPT.edgeKey(rel.fromEntity, rel.toEntity);
    if (drawnEdges[key]) continue;
    drawnEdges[key] = true;

    var points = sEdgeRoutes[key];
    if (!points || points.length < 2) continue;

    var isHovered = (sHoveredRelation && RPT.edgeKey(sHoveredRelation.fromEntity, sHoveredRelation.toEntity) === key);
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
      var mid = RPT.polylineMidpoint(points);
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
