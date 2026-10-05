import { downloadTextFile } from "./fileDownload";

const DEFAULT_PROJECT_NAME = "projekt";
const EXPORT_PADDING = 40;

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeColor(value, fallback = "#1f2937") {
  if (!value || value === "none") return fallback;
  return value;
}

function getSafeFileName(name) {
  const normalized = String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-");

  return normalized || DEFAULT_PROJECT_NAME;
}

export function pointsToPath(points, closed = false) {
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];

    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;

    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;

  if (closed) {
    path += " Z";
  }

  return path;
}

function drawPointsToCanvasPath(context, points, closed = false) {
  if (!points || points.length === 0) return;

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  if (points.length === 1) {
    context.lineTo(points[0].x + 0.01, points[0].y + 0.01);
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];

      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;

      context.quadraticCurveTo(current.x, current.y, midX, midY);
    }

    const last = points[points.length - 1];
    context.lineTo(last.x, last.y);
  }

  if (closed) {
    context.closePath();
  }
}

function isClosedPen(shape) {
  if (shape.type !== "pen") return false;
  if (!Array.isArray(shape.points)) return false;
  if (shape.points.length < 3) return false;

  const first = shape.points[0];
  const last = shape.points[shape.points.length - 1];

  if (!first || !last) return false;

  return Math.hypot(first.x - last.x, first.y - last.y) <= 20;
}

function getTextBounds(shape) {
  const text = String(shape.text || "");
  const fontSize = Math.max(safeNumber(shape.fontSize, 32), 8);

  return {
    x: safeNumber(shape.x, 0),
    y: safeNumber(shape.y, 0) - fontSize,
    width: Math.max(text.length * fontSize * 0.65, fontSize),
    height: fontSize * 1.4
  };
}

function getPointsBounds(points = []) {
  if (!points.length) {
    return {
      x: 0,
      y: 0,
      width: 1,
      height: 1
    };
  }

  const xs = points.map((point) => safeNumber(point.x, 0));
  const ys = points.map((point) => safeNumber(point.y, 0));

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1)
  };
}

function getShapeBounds(shape) {
  if (!shape) {
    return {
      x: 0,
      y: 0,
      width: 1,
      height: 1
    };
  }

  const strokeWidth = Math.max(safeNumber(shape.strokeWidth, 1), 1);
  const padding = strokeWidth + 4;

  if (shape.type === "rect" || shape.type === "ellipse") {
    const x1 = safeNumber(shape.x, 0);
    const y1 = safeNumber(shape.y, 0);
    const x2 = x1 + safeNumber(shape.w, 0);
    const y2 = y1 + safeNumber(shape.h, 0);

    return {
      x: Math.min(x1, x2) - padding,
      y: Math.min(y1, y2) - padding,
      width: Math.max(Math.abs(x2 - x1), 1) + padding * 2,
      height: Math.max(Math.abs(y2 - y1), 1) + padding * 2
    };
  }

  if (
    shape.type === "triangle" ||
    shape.type === "quad" ||
    shape.type === "pen" ||
    shape.type === "line"
  ) {
    const bounds = getPointsBounds(shape.points || []);

    return {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    };
  }

  if (shape.type === "text") {
    const bounds = getTextBounds(shape);

    return {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    };
  }

  return {
    x: 0,
    y: 0,
    width: 1,
    height: 1
  };
}

function getShapeCenter(shape) {
  const bounds = getShapeBounds(shape);

  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}

function getVisibleShapes(shapes = []) {
  return shapes.filter((shape) => shape && shape.visible !== false);
}

function getExportBounds(shapes = []) {
  const visibleShapes = getVisibleShapes(shapes);

  if (visibleShapes.length === 0) {
    return {
      x: 0,
      y: 0,
      width: 1200,
      height: 800
    };
  }

  const boxes = visibleShapes.map((shape) => getShapeBounds(shape));

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));

  return {
    x: Math.floor(minX - EXPORT_PADDING),
    y: Math.floor(minY - EXPORT_PADDING),
    width: Math.ceil(maxX - minX + EXPORT_PADDING * 2),
    height: Math.ceil(maxY - minY + EXPORT_PADDING * 2)
  };
}

function withRotation(context, shape, draw) {
  const rotation = safeNumber(shape.rotation, 0);

  if (!rotation) {
    draw();
    return;
  }

  const center = getShapeCenter(shape);

  context.save();
  context.translate(center.x, center.y);
  context.rotate((rotation * Math.PI) / 180);
  context.translate(-center.x, -center.y);

  draw();

  context.restore();
}

function setupStrokeAndFill(context, shape) {
  const stroke = shape.stroke === "none" ? "none" : normalizeColor(shape.stroke);
  const fill = shape.fill || "none";
  const strokeWidth = Math.max(safeNumber(shape.strokeWidth, 1), 1);

  context.lineWidth = strokeWidth;
  context.lineJoin = "round";
  context.lineCap = "round";

  if (stroke !== "none") {
    context.strokeStyle = stroke;
  }

  if (fill !== "none") {
    context.fillStyle = fill;
  }

  return {
    stroke,
    fill
  };
}

function drawShape(context, shape) {
  if (!shape || shape.visible === false) return;

  withRotation(context, shape, () => {
    const { stroke, fill } = setupStrokeAndFill(context, shape);

    if (shape.type === "rect") {
      const x = Math.min(
        safeNumber(shape.x, 0),
        safeNumber(shape.x, 0) + safeNumber(shape.w, 0)
      );
      const y = Math.min(
        safeNumber(shape.y, 0),
        safeNumber(shape.y, 0) + safeNumber(shape.h, 0)
      );
      const w = Math.abs(safeNumber(shape.w, 0));
      const h = Math.abs(safeNumber(shape.h, 0));

      context.beginPath();
      context.rect(x, y, w, h);

      if (fill !== "none") context.fill();
      if (stroke !== "none") context.stroke();

      return;
    }

    if (shape.type === "ellipse") {
      const cx = safeNumber(shape.x, 0) + safeNumber(shape.w, 0) / 2;
      const cy = safeNumber(shape.y, 0) + safeNumber(shape.h, 0) / 2;
      const rx = Math.max(Math.abs(safeNumber(shape.w, 0) / 2), 0.1);
      const ry = Math.max(Math.abs(safeNumber(shape.h, 0) / 2), 0.1);

      context.beginPath();
      context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

      if (fill !== "none") context.fill();
      if (stroke !== "none") context.stroke();

      return;
    }

    if (shape.type === "triangle" || shape.type === "quad") {
      if (!Array.isArray(shape.points) || shape.points.length === 0) return;

      context.beginPath();
      context.moveTo(shape.points[0].x, shape.points[0].y);

      for (let i = 1; i < shape.points.length; i++) {
        context.lineTo(shape.points[i].x, shape.points[i].y);
      }

      context.closePath();

      if (fill !== "none") context.fill();
      if (stroke !== "none") context.stroke();

      return;
    }

    if (shape.type === "line") {
      if (!Array.isArray(shape.points) || shape.points.length < 2) return;

      context.beginPath();
      context.moveTo(shape.points[0].x, shape.points[0].y);
      context.lineTo(shape.points[1].x, shape.points[1].y);

      if (stroke !== "none") context.stroke();

      return;
    }

    if (shape.type === "pen") {
      if (!Array.isArray(shape.points) || shape.points.length === 0) return;

      const closed = isClosedPen(shape);

      drawPointsToCanvasPath(context, shape.points, closed);

      if (closed && fill !== "none") context.fill();
      if (stroke !== "none") context.stroke();

      return;
    }

    if (shape.type === "text") {
      const text = String(shape.text || "");
      if (!text) return;

      const fontSize = Math.max(safeNumber(shape.fontSize, 32), 8);
      const fontFamily = shape.fontFamily || "Arial";
      const textFill =
        shape.fill && shape.fill !== "none"
          ? shape.fill
          : normalizeColor(shape.stroke, "#1f2937");

      context.fillStyle = textFill;
      context.font = `700 ${fontSize}px ${fontFamily}`;
      context.textBaseline = "alphabetic";
      context.fillText(text, safeNumber(shape.x, 0), safeNumber(shape.y, 0));
    }
  });
}

function forceOpaqueWhiteBackground(canvas) {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;

  const outputContext = outputCanvas.getContext("2d", {
    alpha: false
  });

  if (!outputContext) return canvas;

  outputContext.setTransform(1, 0, 0, 1, 0, 0);
  outputContext.globalCompositeOperation = "source-over";
  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.drawImage(canvas, 0, 0);

  return outputCanvas;
}

function triggerBlobDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = blobUrl;
  link.download = fileName;
  link.rel = "noopener";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 120000);
}

export function exportProjectAsPng({
  shapes = [],
  projectName = DEFAULT_PROJECT_NAME
}) {
  try {
    const visibleShapes = getVisibleShapes(shapes);
    const bounds = getExportBounds(visibleShapes);

    const width = Math.max(Math.ceil(bounds.width), 1);
    const height = Math.max(Math.ceil(bounds.height), 1);

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
      alpha: true
    });

    if (!context) {
      alert("PNG export zlyhal.");
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, width, height);

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(-bounds.x, -bounds.y);

    for (const shape of visibleShapes) {
      drawShape(context, shape);
    }

    context.restore();

    const finalCanvas = forceOpaqueWhiteBackground(canvas);
    const fileName = `${getSafeFileName(projectName || DEFAULT_PROJECT_NAME)}.png`;

    finalCanvas.toBlob(
      (blob) => {
        if (!blob) {
          alert("PNG export zlyhal.");
          return;
        }

        triggerBlobDownload(blob, fileName);
      },
      "image/png",
      1
    );
  } catch (error) {
    console.error("PNG export zlyhal:", error);
    alert("PNG export zlyhal.");
  }
}

export function exportProjectAsJson({
  shapes = [],
  projectName = DEFAULT_PROJECT_NAME,
  setProjectName
}) {
  let name = String(projectName || "").trim();

  if (!name) {
    name = DEFAULT_PROJECT_NAME;
    setProjectName?.(name);
  }

  const safeName = getSafeFileName(name);

  downloadTextFile(
    `${safeName}.json`,
    JSON.stringify(
      {
        name,
        shapes
      },
      null,
      2
    ),
    "application/json"
  );
}

export function importProjectFromJsonFile({
  file,
  commitShapes,
  setProjectName,
  setSelectedId,
  setDraft,
  setDragInfo,
  setShowObjectsPanel
}) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      if (Array.isArray(data)) {
        commitShapes(data);
        setSelectedId?.(null);
        setDraft?.(null);
        setDragInfo?.(null);
        setShowObjectsPanel?.(true);
        return;
      }

      if (Array.isArray(data.shapes)) {
        commitShapes(data.shapes);
        setProjectName?.(data.name || "");
        setSelectedId?.(null);
        setDraft?.(null);
        setDragInfo?.(null);
        setShowObjectsPanel?.(true);
        return;
      }

      alert("Tento JSON súbor nemá správny formát projektu.");
    } catch (error) {
      console.error("Import JSON error:", error);
      alert("Import JSON súboru zlyhal.");
    }
  };

  reader.readAsText(file);
}

export const exportPng = exportProjectAsPng;
export const exportJson = exportProjectAsJson;
export const importJson = importProjectFromJsonFile;