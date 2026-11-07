/** Editable, standards-compliant SVG document IO for the vector editor.
 * JSON is NOT used as an exchange/file format. Custom data-ve-* attributes
 * preserve editor-specific IDs, names, group membership and pen points.
 */
const NS = "http://www.w3.org/2000/svg";
const DEFAULT_NAME = "projekt";
const PAD = 32;
const TYPE_TAGS = new Set(["rect", "ellipse", "circle", "line", "polygon", "polyline", "path", "text"]);
const CONTAINER_TAGS = new Set(["svg", "g", "a", "switch"]);
const IGNORED_TAGS = new Set(["title", "desc", "defs", "metadata", "style"]);

const number = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const clean = (v, fallback = "") => String(v ?? fallback);
const escapeXml = (s) => clean(s).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&apos;");
const attr = (name, value) => ` ${name}="${escapeXml(value)}"`;
const pointText = (points) => (points || []).map((p) => `${number(p.x)},${number(p.y)}`).join(" ");
const displayName = (name) => clean(name).trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, "-") || DEFAULT_NAME;
const uniqId = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `svg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function rectOf(shape) {
  if (["rect", "ellipse"].includes(shape.type)) {
    const x = number(shape.x), y = number(shape.y), w = number(shape.w), h = number(shape.h);
    return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) };
  }
  if (shape.type === "text") {
    const size = Math.max(number(shape.fontSize, 32), 8);
    return { x: number(shape.x), y: number(shape.y) - size, w: Math.max(1, clean(shape.text).length * size * 0.75), h: size * 1.3 };
  }
  const points = Array.isArray(shape.points) ? shape.points : [];
  if (!points.length) return { x: 0, y: 0, w: 1, h: 1 };
  const xs = points.map((p) => number(p.x)), ys = points.map((p) => number(p.y));
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

function rotatedBounds(shape) {
  const r = rectOf(shape), angle = number(shape.rotation) * Math.PI / 180;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const pts = [ [r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h] ];
  const xs = pts.map(([x, y]) => cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle));
  const ys = pts.map(([x, y]) => cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle));
  const extra = Math.max(1, number(shape.strokeWidth, 1)) / 2 + 2;
  return { x: Math.min(...xs) - extra, y: Math.min(...ys) - extra, x2: Math.max(...xs) + extra, y2: Math.max(...ys) + extra };
}

function getDocumentBounds(shapes) {
  const visible = shapes.filter((s) => s && s.visible !== false);
  if (!visible.length) return { x: 0, y: 0, width: 1200, height: 800 };
  const boxes = visible.map(rotatedBounds);
  const x = Math.floor(Math.min(...boxes.map((b) => b.x)) - PAD);
  const y = Math.floor(Math.min(...boxes.map((b) => b.y)) - PAD);
  return { x, y, width: Math.max(1, Math.ceil(Math.max(...boxes.map((b) => b.x2)) + PAD - x)), height: Math.max(1, Math.ceil(Math.max(...boxes.map((b) => b.y2)) + PAD - y)) };
}

function closedPen(shape) {
  const pts = shape.points || [];
  return pts.length > 2 && Math.hypot(number(pts[0].x) - number(pts.at(-1).x), number(pts[0].y) - number(pts.at(-1).y)) <= 20;
}

function penPath(points, closed) {
  if (!points?.length) return "";
  if (points.length === 1) return `M ${number(points[0].x)} ${number(points[0].y)} L ${number(points[0].x) + 0.01} ${number(points[0].y) + 0.01}`;
  let d = `M ${number(points[0].x)} ${number(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    d += ` Q ${number(a.x)} ${number(a.y)} ${(number(a.x) + number(b.x)) / 2} ${(number(a.y) + number(b.y)) / 2}`;
  }
  d += ` L ${number(points.at(-1).x)} ${number(points.at(-1).y)}`;
  return closed ? `${d} Z` : d;
}

function elementForShape(shape) {
  const exportFill = shape.type === "pen" && !closedPen(shape) ? "none" :
    shape.type === "text" && (!shape.fill || shape.fill === "none") ? (shape.stroke || "#1f2937") : (shape.fill || "none");
  const base = [
    attr("data-ve-type", shape.type), attr("data-ve-id", shape.id || uniqId()),
    attr("data-ve-name", shape.name || ""),
    ...(shape.groupId ? [attr("data-ve-group", shape.groupId)] : []),
    ...(shape.visible === false ? [attr("visibility", "hidden")] : []),
    attr("stroke", shape.stroke || "none"), attr("stroke-width", Math.max(1, number(shape.strokeWidth, 1))),
    attr("fill", exportFill), attr("data-ve-fill", shape.fill || "none"), attr("stroke-linecap", "round"), attr("stroke-linejoin", "round")
  ];
  const r = rectOf(shape), rotation = number(shape.rotation);
  if (rotation) base.push(attr("transform", `rotate(${rotation} ${r.x + r.w / 2} ${r.y + r.h / 2})`));
  const common = base.join("");
  if (shape.type === "rect") return `<rect${common}${attr("x", r.x)}${attr("y", r.y)}${attr("width", r.w)}${attr("height", r.h)}/>`;
  if (shape.type === "ellipse") return `<ellipse${common}${attr("cx", number(shape.x) + number(shape.w) / 2)}${attr("cy", number(shape.y) + number(shape.h) / 2)}${attr("rx", Math.abs(number(shape.w) / 2))}${attr("ry", Math.abs(number(shape.h) / 2))}/>`;
  if (shape.type === "triangle" || shape.type === "quad") return `<polygon${common}${attr("points", pointText(shape.points))}/>`;
  if (shape.type === "line") {
    if (!shape.points?.length || shape.points.length < 2) return "";
    const [a, b] = shape.points;
    return `<line${common}${attr("x1", number(a.x))}${attr("y1", number(a.y))}${attr("x2", number(b.x))}${attr("y2", number(b.y))}/>`;
  }
  if (shape.type === "pen") {
    const closed = closedPen(shape);
    const path = penPath(shape.points, closed);
    return `<path${common}${attr("d", path)}${attr("data-ve-points", pointText(shape.points))}/>`;
  }
  if (shape.type === "text") {
    const size = Math.max(8, number(shape.fontSize, 32));
    return `<text${common}${attr("x", number(shape.x))}${attr("y", number(shape.y))}${attr("font-size", size)}${attr("font-family", shape.fontFamily || "Arial")}${attr("font-weight", "700")}>${escapeXml(shape.text)}</text>`;
  }
  return "";
}

export function serializeProjectSvg({ shapes = [], projectName = DEFAULT_NAME }) {
  if (!Array.isArray(shapes)) throw new Error("Neplatné objekty projektu.");
  const bounds = getDocumentBounds(shapes);
  // Adjacent members of a logical group are exported as a real SVG <g>.
  // If layers interleave groups, we preserve layer order and keep group IDs
  // on each member so importing restores the complete logical group.
  let activeGroup = null;
  const parts = [];
  for (const shape of shapes) {
    const item = elementForShape(shape);
    if (!item) continue;
    const nextGroup = shape.groupId || null;
    if (nextGroup !== activeGroup) {
      if (activeGroup) parts.push("</g>");
      if (nextGroup) parts.push(`<g${attr("data-ve-group", nextGroup)}>`);
      activeGroup = nextGroup;
    }
    parts.push(item);
  }
  if (activeGroup) parts.push("</g>");
  const content = parts.join("\n  ");
  // Hidden layers still exist in file but don't appear in external SVG viewers.
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="${NS}" xmlns:ve="https://vector-editor.local/metadata" version="1.1"` +
    `${attr("width", bounds.width)}${attr("height", bounds.height)}` +
    `${attr("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)}` +
    `${attr("data-ve-version", "1")}${attr("data-ve-project-name", projectName)}>` +
    `\n  <title>${escapeXml(projectName)}</title>\n  ${content}\n</svg>\n`;
}

export function exportSvg({ shapes = [], projectName = DEFAULT_NAME }) {
  const svg = serializeProjectSvg({ shapes, projectName });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${displayName(projectName)}.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function parsePoints(text) {
  const nums = (clean(text).match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || []).map(Number);
  if (nums.length % 2 !== 0) throw new Error("Neplatné súradnice bodov v SVG.");
  const points = [];
  for (let i = 0; i < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
  return points;
}

function styleValue(node, key, fallback) {
  const direct = node.getAttribute(key);
  if (direct != null) return direct;
  const declaration = clean(node.getAttribute("style")).split(";").map((item) => item.trim().split(":"));
  const match = declaration.find(([k]) => k?.trim() === key);
  if (match) return match.slice(1).join(":").trim();
  return fallback;
}

function parseRotation(node) {
  const val = clean(node.getAttribute("transform"));
  if (!val) return 0;
  const m = /^\s*rotate\(\s*([-+\d.eE]+)(?:[\s,]+[-+\d.eE]+[\s,]+[-+\d.eE]+)?\s*\)\s*$/.exec(val);
  if (!m) throw new Error("SVG obsahuje nepodporovanú transformáciu. Použi SVG uložené z editora.");
  return number(m[1]);
}

function parsePathPoints(node) {
  if (node.hasAttribute("data-ve-points")) return parsePoints(node.getAttribute("data-ve-points"));
  // For foreign SVG, safely sample a path geometry in a detached SVG element.
  const d = node.getAttribute("d");
  if (!d) return [];
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", d);
  const length = path.getTotalLength();
  if (!Number.isFinite(length)) throw new Error("Krivku z SVG sa nepodarilo načítať.");
  const steps = Math.max(2, Math.min(400, Math.ceil(length / 4)));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const point = path.getPointAtLength(length * i / steps);
    points.push({ x: point.x, y: point.y });
  }
  return points;
}

function parseShape(node, inherited = {}) {
  const tag = node.localName.toLowerCase();
  const storedType = node.getAttribute("data-ve-type");
  const type = storedType || ({ polygon: "quad", polyline: "pen", path: "pen", circle: "ellipse" }[tag] || tag);
  if (!["rect", "ellipse", "triangle", "quad", "line", "pen", "text"].includes(type)) throw new Error(`Nepodporovaný objekt SVG: ${tag}`);
  const fill = styleValue(node, "fill", inherited.fill ?? (tag === "line" || tag === "path" || tag === "polyline" ? "none" : "#000000"));
  const stroke = styleValue(node, "stroke", inherited.stroke ?? "none");
  const strokeWidth = number(styleValue(node, "stroke-width", inherited.strokeWidth ?? 1), 1);
  const shape = {
    id: node.getAttribute("data-ve-id") || uniqId(),
    type,
    name: node.getAttribute("data-ve-name") || "",
    visible: styleValue(node, "visibility", inherited.visibility ?? "visible") !== "hidden" && styleValue(node, "display", inherited.display ?? "inline") !== "none",
    fill: node.getAttribute("data-ve-fill") ?? fill, stroke, strokeWidth: Math.max(1, strokeWidth),
    rotation: parseRotation(node)
  };
  const groupId = node.getAttribute("data-ve-group") || inherited.groupId;
  if (groupId) shape.groupId = groupId;
  if (tag === "rect") Object.assign(shape, { x: number(node.getAttribute("x")), y: number(node.getAttribute("y")), w: number(node.getAttribute("width")), h: number(node.getAttribute("height")) });
  if (tag === "ellipse") {
    const cx = number(node.getAttribute("cx")), cy = number(node.getAttribute("cy"));
    const rx = number(node.getAttribute("rx")), ry = number(node.getAttribute("ry"));
    Object.assign(shape, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 });
  }
  if (tag === "circle") {
    const cx = number(node.getAttribute("cx")), cy = number(node.getAttribute("cy")), r = number(node.getAttribute("r"));
    Object.assign(shape, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
  }
  if (tag === "line") shape.points = [{ x: number(node.getAttribute("x1")), y: number(node.getAttribute("y1")) }, { x: number(node.getAttribute("x2")), y: number(node.getAttribute("y2")) }];
  if (tag === "polygon" || tag === "polyline") {
    shape.points = parsePoints(node.getAttribute("points"));
    if (tag === "polygon" && !storedType) {
      shape.type = shape.points.length === 3 ? "triangle" : shape.points.length === 4 ? "quad" : "pen";
      if (shape.type === "pen" && shape.points.length) shape.points.push({ ...shape.points[0] });
    }
    if (tag === "polyline") shape.type = "pen";
  }
  if (tag === "path") {
    shape.points = parsePathPoints(node);
    if (!storedType && /[zZ]\s*$/.test(node.getAttribute("d") || "") && shape.points.length > 2) {
      shape.points.push({ ...shape.points[0] });
    }
  }
  if (tag === "text") {
    Object.assign(shape, { x: number(node.getAttribute("x")), y: number(node.getAttribute("y")), fontSize: Math.max(8, number(styleValue(node, "font-size", 32), 32)), fontFamily: styleValue(node, "font-family", "Arial"), text: node.textContent || "" });
  }
  return shape;
}

export function parseProjectSvg(xmlText) {
  if (typeof xmlText !== "string" || xmlText.length > 8_000_000) throw new Error("SVG súbor je príliš veľký alebo neplatný.");
  const xml = new DOMParser().parseFromString(xmlText, "image/svg+xml");
  if (xml.querySelector("parsererror") || xml.documentElement?.localName?.toLowerCase() !== "svg") throw new Error("Súbor nie je platný SVG dokument.");
  const root = xml.documentElement;
  const results = [], unsupported = new Set(), seenIds = new Set();
  const ownFormat = root.hasAttribute("data-ve-version");
  function scan(node, inherited = {}) {
    for (const child of Array.from(node.children)) {
      const tag = child.localName.toLowerCase();
      if (IGNORED_TAGS.has(tag)) {
        if (!ownFormat && (tag === "style" || tag === "defs")) unsupported.add(`${tag} (externé štýly/definície)`);
        continue;
      }
      if (CONTAINER_TAGS.has(tag)) {
        const transform = child.getAttribute("transform");
        if (transform) { unsupported.add(`transformácia skupiny: ${transform}`); continue; }
        const groupId = child.getAttribute("data-ve-group") || (tag === "g" ? (inherited.groupId || `svg-group-${uniqId()}`) : inherited.groupId);
        scan(child, {
          ...inherited,
          groupId,
          fill: styleValue(child, "fill", inherited.fill),
          stroke: styleValue(child, "stroke", inherited.stroke),
          strokeWidth: styleValue(child, "stroke-width", inherited.strokeWidth),
          visibility: styleValue(child, "visibility", inherited.visibility),
          display: styleValue(child, "display", inherited.display)
        });
      } else if (TYPE_TAGS.has(tag)) {
        try {
          if (!ownFormat && ["filter", "mask", "clip-path", "opacity"].some((name) => child.hasAttribute(name)))
            throw new Error(`Nepodporovaný efekt prvku: ${tag}`);
          if (!ownFormat && ["fill", "stroke"].some((name) => /url\s*\(/i.test(styleValue(child, name, ""))))
            throw new Error(`Nepodporovaná farebná definícia prvku: ${tag}`);
          const shape = parseShape(child, inherited);
          if (seenIds.has(shape.id)) shape.id = uniqId();
          seenIds.add(shape.id);
          results.push(shape);
        } catch (error) { unsupported.add(error.message); }
      } else unsupported.add(tag);
    }
  }
  scan(root);
  if (!results.length && unsupported.size) throw new Error(`SVG nie je možné upravovať: ${Array.from(unsupported).slice(0, 3).join(", ")}`);
  if (!results.length) throw new Error("SVG neobsahuje podporované objekty.");
  if (ownFormat && unsupported.size) throw new Error(`Projekt sa nepodarilo úplne načítať: ${Array.from(unsupported).join(", ")}`);
  return {
    shapes: results,
    name: root.getAttribute("data-ve-project-name") || root.querySelector(":scope > title")?.textContent || "",
    warnings: Array.from(unsupported),
    nativeProject: ownFormat
  };
}
