import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../constants";
import { pointsToString } from "./geometry";

function pointsToPath(points) {
  if (points.length === 0) return "";
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

  return path;
}

function shapeToSvg(shape) {
  if (shape.type === "rect") {
    const x = Math.min(shape.x, shape.x + shape.w);
    const y = Math.min(shape.y, shape.y + shape.h);
    const w = Math.abs(shape.w);
    const h = Math.abs(shape.h);

    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" />`;
  }

  if (shape.type === "ellipse") {
    return `<ellipse cx="${shape.x + shape.w / 2}" cy="${shape.y + shape.h / 2}" rx="${Math.abs(shape.w / 2)}" ry="${Math.abs(shape.h / 2)}" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" />`;
  }

  if (shape.type === "triangle") {
    return `<polygon points="${pointsToString(shape.points)}" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" />`;
  }

  if (shape.type === "pen") {
    return `<path d="${pointsToPath(shape.points)}" fill="none" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" />`;
  }

  return "";
}

export function exportSvg(shapes) {
  const body = shapes
    .filter((shape) => shape.visible)
    .map(shapeToSvg)
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
  ${body}
</svg>`;
}