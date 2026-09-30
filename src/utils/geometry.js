export function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createTriangleFromBox(x1, y1, x2, y2, style) {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);

  return {
    id: uid(),
    type: "triangle",
    points: [
      { x: (left + right) / 2, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom }
    ],
    visible: true,
    ...style
  };
}

export function getBoundingBox(shape) {
  if (shape.type === "rect" || shape.type === "ellipse") {
    const x = Math.min(shape.x, shape.x + shape.w);
    const y = Math.min(shape.y, shape.y + shape.h);
    const w = Math.abs(shape.w);
    const h = Math.abs(shape.h);

    return { x, y, w, h };
  }

  if (shape.type === "line") {
    const minX = Math.min(shape.x1, shape.x2);
    const minY = Math.min(shape.y1, shape.y2);
    const maxX = Math.max(shape.x1, shape.x2);
    const maxY = Math.max(shape.y1, shape.y2);

    return {
      x: minX,
      y: minY,
      w: Math.max(maxX - minX, 1),
      h: Math.max(maxY - minY, 1)
    };
  }

  if (shape.type === "text") {
    const fontSize = shape.fontSize || 32;
    const text = shape.text || "";
    const width = Math.max(text.length * fontSize * 0.62, fontSize);
    const height = fontSize * 1.3;

    return {
      x: shape.x,
      y: shape.y - fontSize,
      w: width,
      h: height
    };
  }

  if (shape.points?.length) {
    const xs = shape.points.map((p) => p.x);
    const ys = shape.points.map((p) => p.y);

    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      w: Math.max(maxX - minX, 1),
      h: Math.max(maxY - minY, 1)
    };
  }

  return { x: 0, y: 0, w: 1, h: 1 };
}

export function duplicateShape(shape) {
  const copy = structuredClone(shape);

  copy.id = uid();

  if (copy.type === "rect" || copy.type === "ellipse") {
    copy.x += 24;
    copy.y += 24;
  }

  if (
    copy.type === "triangle" ||
    copy.type === "pen" ||
    copy.type === "curve"
  ) {
    copy.points = copy.points.map((point) => ({
      x: point.x + 24,
      y: point.y + 24
    }));
  }

  if (copy.type === "line") {
    copy.x1 += 24;
    copy.y1 += 24;
    copy.x2 += 24;
    copy.y2 += 24;
  }

  if (copy.type === "text") {
    copy.x += 24;
    copy.y += 24;
  }

  return copy;
}