import { getBoundingBox } from "../utils/geometry";

function pointsToPath(points, closed = false) {
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

function isClosedPen(shape) {
  if (shape.type !== "pen") return false;
  if (!shape.points || shape.points.length < 3) return false;

  const first = shape.points[0];
  const last = shape.points[shape.points.length - 1];

  const dx = first.x - last.x;
  const dy = first.y - last.y;

  return Math.sqrt(dx * dx + dy * dy) <= 20;
}

function getStroke(shape) {
  if (shape.stroke === "none") return "none";
  return shape.stroke || "#1f2937";
}

function getStrokeWidth(shape) {
  if (shape.stroke === "none") return 0;
  return Math.max(Number(shape.strokeWidth) || 1, 1);
}

function getShapeCenter(shape) {
  const box = getBoundingBox(shape);

  return {
    x: box.x + box.w / 2,
    y: box.y + box.h / 2
  };
}

function RotationWrapper({ shape, children }) {
  const rotation = Number(shape.rotation) || 0;

  if (!rotation) return children;

  const center = getShapeCenter(shape);

  return (
    <g transform={`rotate(${rotation} ${center.x} ${center.y})`}>
      {children}
    </g>
  );
}

export default function ShapeRenderer({
  shape,
  preview,
  locked,
  onPointerDown
}) {
  const common = {
    onPointerDown,
    opacity: 1,
    className: locked ? "shape locked-shape" : "shape"
  };

  const stroke = getStroke(shape);
  const strokeWidth = getStrokeWidth(shape);
  const fill = shape.fill || "none";

  if (shape.type === "rect") {
    const x = Math.min(shape.x, shape.x + shape.w);
    const y = Math.min(shape.y, shape.y + shape.h);
    const w = Math.abs(shape.w);
    const h = Math.abs(shape.h);

    return (
      <RotationWrapper shape={shape}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={preview ? "8 6" : undefined}
          pointerEvents="all"
          {...common}
        />
      </RotationWrapper>
    );
  }

  if (shape.type === "ellipse") {
    return (
      <RotationWrapper shape={shape}>
        <ellipse
          cx={shape.x + shape.w / 2}
          cy={shape.y + shape.h / 2}
          rx={Math.abs(shape.w / 2)}
          ry={Math.abs(shape.h / 2)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={preview ? "8 6" : undefined}
          pointerEvents="all"
          {...common}
        />
      </RotationWrapper>
    );
  }

  if (shape.type === "triangle" || shape.type === "quad") {
    return (
      <RotationWrapper shape={shape}>
        <polygon
          points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={preview ? "8 6" : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="all"
          {...common}
        />
      </RotationWrapper>
    );
  }

  if (shape.type === "line") {
    return (
      <RotationWrapper shape={shape}>
        <line
          x1={shape.points[0].x}
          y1={shape.points[0].y}
          x2={shape.points[1].x}
          y2={shape.points[1].y}
          stroke={stroke}
          strokeWidth={Math.max(strokeWidth, 2)}
          strokeDasharray={preview ? "8 6" : undefined}
          strokeLinecap="round"
          pointerEvents="visibleStroke"
          {...common}
        />
      </RotationWrapper>
    );
  }

  if (shape.type === "pen") {
    const closed = isClosedPen(shape);
    const penFill = closed ? fill : "none";

    return (
      <RotationWrapper shape={shape}>
        <path
          d={pointsToPath(shape.points, closed)}
          fill={penFill}
          stroke={stroke}
          strokeWidth={Math.max(strokeWidth, 1)}
          strokeDasharray={preview ? "8 6" : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="all"
          {...common}
        />
      </RotationWrapper>
    );
  }

  if (shape.type === "text") {
    return (
      <RotationWrapper shape={shape}>
        <text
          x={shape.x}
          y={shape.y}
          fill={shape.fill && shape.fill !== "none" ? shape.fill : stroke}
          fontSize={shape.fontSize || 32}
          fontFamily={shape.fontFamily || "Arial"}
          fontWeight="700"
          pointerEvents="all"
          {...common}
        >
          {shape.text}
        </text>
      </RotationWrapper>
    );
  }

  return null;
}