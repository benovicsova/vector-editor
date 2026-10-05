import {
  clamp,
  distance,
  getBoundingBox,
  createTriangleFromBox,
  uid
} from "./geometry";

export const ERASER_RADIUS = 22;
export const MIN_SHAPE_SIZE = 4;

export const FONT_OPTIONS = [
  "Arial",
  "Verdana",
  "Tahoma",
  "Georgia",
  "Times New Roman",
  "Courier New"
];

export function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) {
    return distance(point, a);
  }

  const t = clamp(
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy),
    0,
    1
  );

  const projection = {
    x: a.x + t * dx,
    y: a.y + t * dy
  };

  return distance(point, projection);
}

export function isPointNearPolyline(point, points, radius) {
  if (!points || points.length === 0) return false;

  if (points.length === 1) {
    return distance(point, points[0]) <= radius;
  }

  for (let i = 0; i < points.length - 1; i++) {
    if (distanceToSegment(point, points[i], points[i + 1]) <= radius) {
      return true;
    }
  }

  return false;
}

export function isPointInsidePolygon(point, points) {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

export function isClosedPen(shape) {
  if (shape.type !== "pen") return false;
  if (!shape.points || shape.points.length < 3) return false;

  const first = shape.points[0];
  const last = shape.points[shape.points.length - 1];

  return distance(first, last) <= 20;
}

export function eraserTouchesShape(point, shape, radius) {
  const strokeWidth = Number(shape.strokeWidth) || 1;

  if (shape.type === "pen") {
    if (shape.fill !== "none" && isClosedPen(shape) && isPointInsidePolygon(point, shape.points)) {
      return true;
    }

    return isPointNearPolyline(point, shape.points, radius + strokeWidth / 2);
  }

  if (shape.type === "line") {
    return isPointNearPolyline(point, shape.points, radius + strokeWidth / 2);
  }

  if (shape.type === "text") {
    const box = getBoundingBox(shape);

    return (
      point.x >= box.x - radius &&
      point.x <= box.x + box.w + radius &&
      point.y >= box.y - radius &&
      point.y <= box.y + box.h + radius
    );
  }

  if (shape.type === "triangle" || shape.type === "quad") {
    const closedPoints = [...shape.points, shape.points[0]];

    if (shape.fill !== "none" && isPointInsidePolygon(point, shape.points)) {
      return true;
    }

    return isPointNearPolyline(point, closedPoints, radius + strokeWidth / 2);
  }

  if (shape.type === "rect") {
    const box = getBoundingBox(shape);

    const insideExpandedBox =
      point.x >= box.x - radius &&
      point.x <= box.x + box.w + radius &&
      point.y >= box.y - radius &&
      point.y <= box.y + box.h + radius;

    if (!insideExpandedBox) return false;
    if (shape.fill !== "none") return true;

    const edges = [
      [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }],
      [{ x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }],
      [{ x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }],
      [{ x: box.x, y: box.y + box.h }, { x: box.x, y: box.y }]
    ];

    return edges.some(([a, b]) =>
      distanceToSegment(point, a, b) <= radius + strokeWidth / 2
    );
  }

  if (shape.type === "ellipse") {
    const box = getBoundingBox(shape);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rx = Math.max(box.w / 2, 1);
    const ry = Math.max(box.h / 2, 1);

    const normalized =
      ((point.x - cx) * (point.x - cx)) / ((rx + radius) * (rx + radius)) +
      ((point.y - cy) * (point.y - cy)) / ((ry + radius) * (ry + radius));

    if (normalized > 1) return false;
    if (shape.fill !== "none") return true;

    const outline =
      ((point.x - cx) * (point.x - cx)) / (rx * rx) +
      ((point.y - cy) * (point.y - cy)) / (ry * ry);

    return Math.abs(outline - 1) < 0.25;
  }

  return false;
}

export function getConstrainedBox(start, current, shouldConstrain) {
  const dx = current.x - start.x;
  const dy = current.y - start.y;

  if (!shouldConstrain) {
    return { w: dx, h: dy };
  }

  const size = Math.max(Math.abs(dx), Math.abs(dy));

  return {
    w: Math.sign(dx || 1) * size,
    h: Math.sign(dy || 1) * size
  };
}

export function constrainLinePoint(start, current, shouldConstrain) {
  if (!shouldConstrain) return current;

  const dx = current.x - start.x;
  const dy = current.y - start.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: current.x, y: start.y };
  }

  return { x: start.x, y: current.y };
}

export function isDraftLargeEnough(draft) {
  if (!draft) return false;

  if (draft.type === "rect" || draft.type === "ellipse") {
    return Math.abs(draft.w) >= MIN_SHAPE_SIZE || Math.abs(draft.h) >= MIN_SHAPE_SIZE;
  }

  if (draft.type === "triangle-box" || draft.type === "quad-box") {
    return (
      Math.abs(draft.x2 - draft.x1) >= MIN_SHAPE_SIZE ||
      Math.abs(draft.y2 - draft.y1) >= MIN_SHAPE_SIZE
    );
  }

  if (draft.type === "line") {
    return distance(draft.points[0], draft.points[1]) >= MIN_SHAPE_SIZE;
  }

  return true;
}

export function getShapeCenter(shape) {
  const box = getBoundingBox(shape);

  return {
    x: box.x + box.w / 2,
    y: box.y + box.h / 2
  };
}

export function getAngle(center, point) {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

export function rotatePoint(point, center, angleDegrees) {
  const angle = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}

export function unrotatePoint(point, center, angleDegrees) {
  return rotatePoint(point, center, -angleDegrees);
}

export function getRotation(shape) {
  return Number(shape?.rotation) || 0;
}

export function createTriangleFromDraft(draft, style) {
  if (!draft.equilateral) {
    return createTriangleFromBox(draft.x1, draft.y1, draft.x2, draft.y2, {
      ...style,
      rotation: 0
    });
  }

  const dx = draft.x2 - draft.x1;
  const dy = draft.y2 - draft.y1;

  const signX = Math.sign(dx || 1);
  const signY = Math.sign(dy || 1);

  const sideFromWidth = Math.abs(dx);
  const sideFromHeight = (Math.abs(dy) * 2) / Math.sqrt(3);
  const side = Math.max(sideFromWidth, sideFromHeight, 1);
  const height = (Math.sqrt(3) / 2) * side;

  const x2 = draft.x1 + signX * side;
  const y2 = draft.y1 + signY * height;

  const left = Math.min(draft.x1, x2);
  const right = Math.max(draft.x1, x2);
  const top = Math.min(draft.y1, y2);
  const bottom = Math.max(draft.y1, y2);

  return {
    id: uid(),
    type: "triangle",
    points: [
      { x: (left + right) / 2, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom }
    ],
    visible: true,
    ...style,
    rotation: 0
  };
}

export function createQuadFromDraft(draft, style) {
  const x1 = draft.x1;
  const y1 = draft.y1;
  const x2 = draft.x2;
  const y2 = draft.y2;

  return {
    id: uid(),
    type: "quad",
    points: [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 }
    ],
    visible: true,
    ...style,
    rotation: 0
  };
}

export function moveShapeByDelta(shape, dx, dy) {
  if (shape.type === "rect" || shape.type === "ellipse" || shape.type === "text") {
    return {
      ...shape,
      x: shape.x + dx,
      y: shape.y + dy
    };
  }

  return {
    ...shape,
    points: shape.points.map((pt) => ({
      x: pt.x + dx,
      y: pt.y + dy
    }))
  };
}

export function scaleShapeFromCenter(shape, center, scale) {
  if (shape.type === "rect" || shape.type === "ellipse") {
    return {
      ...shape,
      x: center.x + (shape.x - center.x) * scale,
      y: center.y + (shape.y - center.y) * scale,
      w: shape.w * scale,
      h: shape.h * scale
    };
  }

  if (shape.type === "text") {
    return {
      ...shape,
      x: center.x + (shape.x - center.x) * scale,
      y: center.y + (shape.y - center.y) * scale,
      fontSize: Math.max(8, (shape.fontSize || 32) * scale)
    };
  }

  return {
    ...shape,
    points: shape.points.map((point) => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale
    }))
  };
}

export function getEditPoints(shape) {
  if (!shape) return [];

  if (shape.type === "rect" || shape.type === "ellipse") {
    const x1 = shape.x;
    const y1 = shape.y;
    const x2 = shape.x + shape.w;
    const y2 = shape.y + shape.h;

    return [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 }
    ];
  }

  if (shape.type === "text") {
    return [{ x: shape.x, y: shape.y }];
  }

  if (shape.type === "line") {
    return shape.points;
  }

  return shape.points || [];
}

export function getScalePoint(shape, zoom) {
  const box = getBoundingBox(shape);

  return {
    x: box.x + box.w + 30 / zoom,
    y: box.y + box.h + 30 / zoom
  };
}

export function getBoundsForShapes(shapes) {
  if (!shapes || shapes.length === 0) return null;

  const boxes = shapes.map((shape) => getBoundingBox(shape));

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

export function getBoundsCenter(bounds) {
  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2
  };
}

export function shapeIntersectsBounds(shape, bounds) {
  if (!bounds) return false;

  const box = getBoundingBox(shape);

  return !(
    box.x + box.w < bounds.x ||
    box.x > bounds.x + bounds.w ||
    box.y + box.h < bounds.y ||
    box.y > bounds.y + bounds.h
  );
}
