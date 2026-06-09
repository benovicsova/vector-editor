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

export default function ShapeRenderer({ shape, selected, preview, onPointerDown }) {
  const common = {
    onPointerDown,
    opacity: preview ? 0.55 : selected ? 0.95 : 1,
    className: "shape"
  };

  if (shape.type === "rect") {
    const x = Math.min(shape.x, shape.x + shape.w);
    const y = Math.min(shape.y, shape.y + shape.h);
    const w = Math.abs(shape.w);
    const h = Math.abs(shape.h);

    return (
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={shape.fill}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        {...common}
      />
    );
  }

  if (shape.type === "ellipse") {
    return (
      <ellipse
        cx={shape.x + shape.w / 2}
        cy={shape.y + shape.h / 2}
        rx={Math.abs(shape.w / 2)}
        ry={Math.abs(shape.h / 2)}
        fill={shape.fill}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        {...common}
      />
    );
  }

  if (shape.type === "triangle") {
    return (
      <polygon
        points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={shape.fill}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        {...common}
      />
    );
  }

  if (shape.type === "pen") {
    return (
      <path
        d={pointsToPath(shape.points)}
        fill="none"
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        {...common}
      />
    );
  }

  return null;
}