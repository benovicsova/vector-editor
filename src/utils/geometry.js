export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointsToString(points) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

export function getBoundingBox(shape) {
  if (shape.type === "rect" || shape.type === "ellipse") {
    const x = Math.min(shape.x, shape.x + shape.w);
    const y = Math.min(shape.y, shape.y + shape.h);
    const w = Math.abs(shape.w);
    const h = Math.abs(shape.h);

    return { x, y, w, h };
  }

  const xs = shape.points.map((p) => p.x);
  const ys = shape.points.map((p) => p.y);

  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys)
  };
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
      { x: left, y: bottom },
      { x: right, y: bottom }
    ],
    ...style,
    visible: true
  };
}

export function duplicateShape(shape) {
  const copy = {
    ...shape,
    id: uid(),
    points: shape.points ? shape.points.map((p) => ({ ...p })) : undefined
  };

  if (copy.type === "rect" || copy.type === "ellipse") {
    copy.x += 20;
    copy.y += 20;
  } else {
    copy.points = copy.points.map((p) => ({
      x: p.x + 20,
      y: p.y + 20
    }));
  }

  return copy;
}