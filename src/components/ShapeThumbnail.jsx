import { getBoundingBox } from "../utils/geometry";
import { pointsToPath } from "../utils/exportProject";

function getStroke(shape) {
  if (shape.stroke === "none") return "none";
  return shape.stroke || "#1f2937";
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

export default function ShapeThumbnail({ shape }) {
  const box = getBoundingBox(shape);

  const padding = Math.max(Number(shape.strokeWidth) || 2, 2) + 10;
  const viewX = box.x - padding;
  const viewY = box.y - padding;
  const viewW = Math.max(box.w + padding * 2, 1);
  const viewH = Math.max(box.h + padding * 2, 1);

  const stroke = getStroke(shape);
  const fill = shape.fill || "none";
  const strokeWidth = shape.stroke === "none" ? 0 : Math.max(Number(shape.strokeWidth) || 1, 1);
  const rotation = Number(shape.rotation) || 0;
  const center = {
    x: box.x + box.w / 2,
    y: box.y + box.h / 2
  };

  return (
    <svg
      className="objects-thumbnail"
      viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={viewX} y={viewY} width={viewW} height={viewH} fill="white" />

      <g transform={`rotate(${rotation} ${center.x} ${center.y})`}>
        {shape.type === "rect" && (
          <rect
            x={Math.min(shape.x, shape.x + shape.w)}
            y={Math.min(shape.y, shape.y + shape.h)}
            width={Math.abs(shape.w)}
            height={Math.abs(shape.h)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}

        {shape.type === "ellipse" && (
          <ellipse
            cx={shape.x + shape.w / 2}
            cy={shape.y + shape.h / 2}
            rx={Math.abs(shape.w / 2)}
            ry={Math.abs(shape.h / 2)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}

        {(shape.type === "triangle" || shape.type === "quad") && (
          <polygon
            points={shape.points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {shape.type === "line" && (
          <line
            x1={shape.points[0].x}
            y1={shape.points[0].y}
            x2={shape.points[1].x}
            y2={shape.points[1].y}
            stroke={stroke}
            strokeWidth={Math.max(strokeWidth, 2)}
            strokeLinecap="round"
          />
        )}

        {shape.type === "pen" && (
          <path
            d={pointsToPath(shape.points, isClosedPen(shape))}
            fill={isClosedPen(shape) ? fill : "none"}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {shape.type === "text" && (
          <text
            x={shape.x}
            y={shape.y}
            fill={shape.fill && shape.fill !== "none" ? shape.fill : stroke}
            fontSize={shape.fontSize || 32}
            fontFamily={shape.fontFamily || "Arial"}
            fontWeight="700"
          >
            {shape.text || "Text"}
          </text>
        )}
      </g>

      {shape.visible === false && (
        <rect
          x={viewX}
          y={viewY}
          width={viewW}
          height={viewH}
          fill="rgba(255,255,255,0.68)"
        />
      )}
    </svg>
  );
}
