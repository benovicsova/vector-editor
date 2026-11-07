import { getBoundingBox } from "../utils/geometry";

function pointsToPath(points = [], closed = false) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.01} ${points[0].y + 0.01}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    d += ` Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return closed ? `${d} Z` : d;
}

function isClosedPen(shape) {
  if (shape.type !== "pen" || !Array.isArray(shape.points) || shape.points.length < 3) return false;
  const first = shape.points[0];
  const last = shape.points[shape.points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) <= 20;
}

function RotationWrapper({ shape, children }) {
  const rotation = Number(shape.rotation) || 0;
  if (!rotation) return <>{children}</>;
  const box = getBoundingBox(shape);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return <g transform={`rotate(${rotation} ${cx} ${cy})`}>{children}</g>;
}

export default function ShapeRenderer({ shape, preview = false, locked = false, onPointerDown, zoom = 1 }) {
  if (!shape) return null;
  const stroke = shape.stroke === "none" ? "none" : (shape.stroke || "#1f2937");
  const fill = shape.fill || "none";
  const strokeWidth = stroke === "none" ? 0 : Math.max(Number(shape.strokeWidth) || 1, 1);
  const strokeDasharray = preview ? "8 6" : undefined;
  const common = {
    onPointerDown,
    className: locked ? "shape locked-shape" : "shape"
  };

  if (shape.type === "rect") {
    return <RotationWrapper shape={shape}>
      <rect x={Math.min(shape.x, shape.x + shape.w)} y={Math.min(shape.y, shape.y + shape.h)}
        width={Math.abs(shape.w)} height={Math.abs(shape.h)} fill={fill}
        stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray}
        pointerEvents="all" {...common} />
    </RotationWrapper>;
  }
  if (shape.type === "ellipse") {
    return <RotationWrapper shape={shape}>
      <ellipse cx={shape.x + shape.w / 2} cy={shape.y + shape.h / 2}
        rx={Math.abs(shape.w / 2)} ry={Math.abs(shape.h / 2)} fill={fill}
        stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray}
        pointerEvents="all" {...common} />
    </RotationWrapper>;
  }
  if (shape.type === "triangle" || shape.type === "quad") {
    return <RotationWrapper shape={shape}>
      <polygon points={(shape.points || []).map((p) => `${p.x},${p.y}`).join(" ")}
        fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray}
        strokeLinejoin="round" pointerEvents="all" {...common} />
    </RotationWrapper>;
  }
  if (shape.type === "line") {
    if (!shape.points || shape.points.length < 2) return null;
    const [a, b] = shape.points;
    return <RotationWrapper shape={shape}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={stroke} strokeWidth={Math.max(strokeWidth, 1)}
        strokeLinecap="round" strokeDasharray={strokeDasharray} pointerEvents="none" />
      {/* Hit target follows ONLY the line, never its bounding rectangle. */}
      {!preview && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke="transparent" strokeWidth={Math.max(strokeWidth, 12 / zoom)} strokeLinecap="round"
        pointerEvents="stroke" {...common} />}
    </RotationWrapper>;
  }
  if (shape.type === "pen") {
    const closed = isClosedPen(shape);
    const d = pointsToPath(shape.points, closed);
    return <RotationWrapper shape={shape}>
      <path d={d} fill={closed ? fill : "none"} stroke={stroke}
        strokeWidth={Math.max(strokeWidth, 1)} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={strokeDasharray}
        pointerEvents={closed ? "visiblePainted" : "none"}
        {...(closed ? common : {})} />
      {/* A narrow invisible stroke captures clicks along a freehand curve. */}
      {!preview && <path d={d} fill="none" stroke="transparent"
        strokeWidth={Math.max(strokeWidth, 12 / zoom)} strokeLinejoin="round" strokeLinecap="round"
        pointerEvents="stroke" {...common} />}
    </RotationWrapper>;
  }
  if (shape.type === "text") {
    return <RotationWrapper shape={shape}>
      <text x={shape.x} y={shape.y}
        fill={fill !== "none" ? fill : stroke}
        fontSize={shape.fontSize || 32} fontFamily={shape.fontFamily || "Arial"}
        fontWeight="700" pointerEvents="visiblePainted" {...common}>
        {shape.text}
      </text>
    </RotationWrapper>;
  }
  return null;
}
