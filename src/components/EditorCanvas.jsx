import { useMemo, useState } from "react";

import { CANVAS_WIDTH, CANVAS_HEIGHT, TOOL } from "../constants";
import {
  clamp,
  distance,
  getBoundingBox,
  createTriangleFromBox,
  uid
} from "../utils/geometry";

import ShapeRenderer from "./ShapeRenderer";

const ERASER_RADIUS = 22;

function distanceToSegment(point, a, b) {
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

function isPointNearPolyline(point, points, radius) {
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

function isPointInsidePolygon(point, points) {
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

function eraserTouchesShape(point, shape, radius) {
  if (shape.type === "pen") {
    return isPointNearPolyline(point, shape.points, radius + shape.strokeWidth / 2);
  }

  if (shape.type === "triangle") {
    const closedPoints = [...shape.points, shape.points[0]];

    if (shape.fill !== "none" && isPointInsidePolygon(point, shape.points)) {
      return true;
    }

    return isPointNearPolyline(point, closedPoints, radius + shape.strokeWidth / 2);
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
      distanceToSegment(point, a, b) <= radius + shape.strokeWidth / 2
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

function getConstrainedBox(start, current, shouldConstrain) {
  const dx = current.x - start.x;
  const dy = current.y - start.y;

  if (!shouldConstrain) {
    return {
      w: dx,
      h: dy
    };
  }

  const size = Math.max(Math.abs(dx), Math.abs(dy));

  return {
    w: Math.sign(dx || 1) * size,
    h: Math.sign(dy || 1) * size
  };
}

export default function EditorCanvas({
  tool,
  setTool,
  shapes,
  setShapes,
  setShapesLive,
  selectedId,
  setSelectedId,
  fill,
  stroke,
  strokeWidth,
  draft,
  setDraft,
  dragInfo,
  setDragInfo,
  zoom,
  setZoom
}) {
  const [camera, setCamera] = useState({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2
  });

  const [eraserPosition, setEraserPosition] = useState(null);

  const selectedShape = shapes.find((s) => s.id === selectedId) ?? null;
  const selectedBounds = selectedShape ? getBoundingBox(selectedShape) : null;

  const viewBox = useMemo(() => {
    const visibleWidth = CANVAS_WIDTH / zoom;
    const visibleHeight = CANVAS_HEIGHT / zoom;

    return {
      x: camera.x - visibleWidth / 2,
      y: camera.y - visibleHeight / 2,
      width: visibleWidth,
      height: visibleHeight,
      value: `${camera.x - visibleWidth / 2} ${camera.y - visibleHeight / 2} ${visibleWidth} ${visibleHeight}`
    };
  }, [zoom, camera]);

  const style = { fill, stroke, strokeWidth };

  function screenPointToSvgPoint(event, svg) {
    const point = svg.createSVGPoint();

    point.x = event.clientX;
    point.y = event.clientY;

    const transformedPoint = point.matrixTransform(svg.getScreenCTM().inverse());

    return {
      x: transformedPoint.x,
      y: transformedPoint.y
    };
  }

  function getSvgPoint(event) {
    return screenPointToSvgPoint(event, event.currentTarget);
  }

  function getPointerFromSvg(event) {
    const svg = event.currentTarget.ownerSVGElement;
    return screenPointToSvgPoint(event, svg);
  }

  function eraseAt(point) {
    setShapes((prev) =>
      prev.filter((shape) => !eraserTouchesShape(point, shape, ERASER_RADIUS / zoom))
    );
  }

  function startPan(event) {
    event.preventDefault();

    setDraft(null);
    setEraserPosition(null);

    setDragInfo({
      mode: "pan",
      startClient: {
        x: event.clientX,
        y: event.clientY
      },
      originalCamera: {
        x: camera.x,
        y: camera.y
      }
    });
  }

  function updatePan(event) {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();

    const dx = event.clientX - dragInfo.startClient.x;
    const dy = event.clientY - dragInfo.startClient.y;

    const worldDx = (dx / rect.width) * viewBox.width;
    const worldDy = (dy / rect.height) * viewBox.height;

    setCamera({
      x: dragInfo.originalCamera.x - worldDx,
      y: dragInfo.originalCamera.y - worldDy
    });
  }

  function startDrawingAt(point) {
    setSelectedId(null);

    if (tool === TOOL.RECT) {
      setDraft({ type: "rect", x: point.x, y: point.y, w: 0, h: 0, ...style });
      return;
    }

    if (tool === TOOL.ELLIPSE) {
      setDraft({ type: "ellipse", x: point.x, y: point.y, w: 0, h: 0, ...style });
      return;
    }

    if (tool === TOOL.TRIANGLE) {
      setDraft({
        type: "triangle-box",
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
        ...style
      });
      return;
    }

    if (tool === TOOL.PEN) {
      const newShape = {
        id: uid(),
        type: "pen",
        points: [point],
        fill: "none",
        stroke,
        strokeWidth,
        visible: true
      };

      setShapes((prev) => [...prev, newShape]);
      setSelectedId(newShape.id);
      setDragInfo({ mode: "pen-draw", shapeId: newShape.id });
    }
  }

  function focusShape(shape) {
    setTool(TOOL.SELECT);
    setSelectedId(shape.id);
    setDraft(null);
    setDragInfo(null);
    setEraserPosition(null);
  }

  function handleWheel(event) {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();

    const mouseRatioX = (event.clientX - rect.left) / rect.width;
    const mouseRatioY = (event.clientY - rect.top) / rect.height;

    const mouseBeforeZoom = {
      x: viewBox.x + mouseRatioX * viewBox.width,
      y: viewBox.y + mouseRatioY * viewBox.height
    };

    const nextZoom = clamp(
      zoom * (event.deltaY < 0 ? 1.12 : 0.88),
      0.2,
      5
    );

    const nextWidth = CANVAS_WIDTH / nextZoom;
    const nextHeight = CANVAS_HEIGHT / nextZoom;

    setZoom(nextZoom);

    setCamera({
      x: mouseBeforeZoom.x - mouseRatioX * nextWidth + nextWidth / 2,
      y: mouseBeforeZoom.y - mouseRatioY * nextHeight + nextHeight / 2
    });
  }

  function handlePointerDown(event) {
    if (event.button === 2) {
      startPan(event);
      return;
    }

    const p = getSvgPoint(event);

    if (tool === TOOL.ERASE) {
      setSelectedId(null);
      setEraserPosition(p);
      setDragInfo({ mode: "erase" });
      eraseAt(p);
      return;
    }

    if (tool === TOOL.SELECT || tool === TOOL.FILL) {
      if (event.target === event.currentTarget) setSelectedId(null);
      return;
    }

    startDrawingAt(p);
  }

  function handlePointerMove(event) {
    if (dragInfo?.mode === "pan") {
      updatePan(event);
      return;
    }

    const p = getSvgPoint(event);

    if (tool === TOOL.ERASE) {
      setEraserPosition(p);
    }

    if (dragInfo?.mode === "erase") {
      eraseAt(p);
      return;
    }

    if (draft?.type === "rect" || draft?.type === "ellipse") {
      setDraft((prev) => {
        const box = getConstrainedBox(
          { x: prev.x, y: prev.y },
          p,
          event.shiftKey
        );

        return {
          ...prev,
          w: box.w,
          h: box.h
        };
      });

      return;
    }

    if (draft?.type === "triangle-box") {
      setDraft((prev) => {
        const box = getConstrainedBox(
          { x: prev.x1, y: prev.y1 },
          p,
          event.shiftKey
        );

        return {
          ...prev,
          x2: prev.x1 + box.w,
          y2: prev.y1 + box.h
        };
      });

      return;
    }

    if (dragInfo?.mode === "pen-draw") {
      setShapesLive((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragInfo.shapeId) return shape;

          const last = shape.points[shape.points.length - 1];
          if (last && distance(last, p) < 25) return shape;

          return { ...shape, points: [...shape.points, p] };
        })
      );
    }

    if (dragInfo?.mode === "move-shape") {
      const dx = p.x - dragInfo.start.x;
      const dy = p.y - dragInfo.start.y;

      setShapesLive((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragInfo.shapeId) return shape;

          if (shape.type === "rect" || shape.type === "ellipse") {
            return {
              ...shape,
              x: dragInfo.original.x + dx,
              y: dragInfo.original.y + dy
            };
          }

          return {
            ...shape,
            points: dragInfo.originalPoints.map((pt) => ({
              x: pt.x + dx,
              y: pt.y + dy
            }))
          };
        })
      );
    }

    if (dragInfo?.mode === "move-point") {
      setShapesLive((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragInfo.shapeId) return shape;

          if (shape.type === "rect" || shape.type === "ellipse") {
            const next = { ...shape };
            const anchor = dragInfo.anchor;

            const box = getConstrainedBox(anchor, p, event.shiftKey);

            next.x = anchor.x;
            next.y = anchor.y;
            next.w = box.w;
            next.h = box.h;

            return next;
          }

          return {
            ...shape,
            points: shape.points.map((pt, i) =>
              i === dragInfo.pointIndex ? { x: p.x, y: p.y } : pt
            )
          };
        })
      );
    }
  }

  function handlePointerUp() {
    if (draft?.type === "rect") {
      const shape = {
        id: uid(),
        visible: true,
        ...draft
      };

      setShapes((prev) => [...prev, shape]);
      setSelectedId(shape.id);
    }

    if (draft?.type === "ellipse") {
      const shape = {
        id: uid(),
        visible: true,
        ...draft
      };

      setShapes((prev) => [...prev, shape]);
      setSelectedId(shape.id);
    }

    if (draft?.type === "triangle-box") {
      const shape = createTriangleFromBox(draft.x1, draft.y1, draft.x2, draft.y2, style);

      setShapes((prev) => [...prev, shape]);
      setSelectedId(shape.id);
    }

    setDraft(null);
    setDragInfo(null);
  }

  function handleShapePointerDown(event, shape) {
    event.stopPropagation();

    if (event.button === 2) {
      startPan(event);
      return;
    }

    if (event.detail >= 2) {
      focusShape(shape);
      return;
    }

    if (
      tool === TOOL.RECT ||
      tool === TOOL.ELLIPSE ||
      tool === TOOL.TRIANGLE ||
      tool === TOOL.PEN
    ) {
      const p = getPointerFromSvg(event);
      startDrawingAt(p);
      return;
    }

    if (tool === TOOL.FILL) {
      setShapes((prev) =>
        prev.map((item) =>
          item.id === shape.id ? { ...item, fill } : item
        )
      );

      setSelectedId(shape.id);
      return;
    }

    if (tool === TOOL.ERASE) {
      const p = getPointerFromSvg(event);

      setSelectedId(null);
      setEraserPosition(p);
      setDragInfo({ mode: "erase" });
      eraseAt(p);
      return;
    }

    if (tool !== TOOL.SELECT) {
      return;
    }

    const p = getPointerFromSvg(event);
    setSelectedId(shape.id);

    if (shape.type === "rect" || shape.type === "ellipse") {
      setDragInfo({
        mode: "move-shape",
        shapeId: shape.id,
        start: p,
        original: { x: shape.x, y: shape.y }
      });
    } else {
      setDragInfo({
        mode: "move-shape",
        shapeId: shape.id,
        start: p,
        originalPoints: shape.points.map((pt) => ({ ...pt }))
      });
    }
  }

  function handleShapeDoubleClick(event, shape) {
    event.stopPropagation();
    focusShape(shape);
  }

  function getEditPoints(shape) {
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

    return shape.points;
  }

  function startPointDrag(event, shape, pointIndex) {
    event.stopPropagation();

    if (tool !== TOOL.SELECT) return;

    if (shape.type === "rect" || shape.type === "ellipse") {
      const points = getEditPoints(shape);

      const oppositePointMap = {
        0: 2,
        1: 3,
        2: 0,
        3: 1
      };

      setDragInfo({
        mode: "move-point",
        shapeId: shape.id,
        pointIndex,
        anchor: points[oppositePointMap[pointIndex]]
      });
    } else {
      setDragInfo({
        mode: "move-point",
        shapeId: shape.id,
        pointIndex
      });
    }
  }

  return (
    <main className="scratch-canvas-panel">
      <svg
        viewBox={viewBox.value}
        className={tool === TOOL.ERASE ? "canvas eraser-mode" : "canvas"}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          setEraserPosition(null);
          handlePointerUp();
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <rect
          x="-5000"
          y="-5000"
          width="10000"
          height="10000"
          fill="white"
        />

        {shapes.map((shape) =>
          shape.visible ? (
            <g
              key={shape.id}
              onDoubleClick={(event) => handleShapeDoubleClick(event, shape)}
            >
              <ShapeRenderer
                shape={shape}
                selected={shape.id === selectedId}
                onPointerDown={(e) => handleShapePointerDown(e, shape)}
              />
            </g>
          ) : null
        )}

        {draft?.type === "rect" && <ShapeRenderer shape={draft} preview />}
        {draft?.type === "ellipse" && <ShapeRenderer shape={draft} preview />}

        {draft?.type === "triangle-box" && (
          <ShapeRenderer
            shape={createTriangleFromBox(draft.x1, draft.y1, draft.x2, draft.y2, style)}
            preview
          />
        )}

        {selectedShape && selectedBounds && tool === TOOL.SELECT && (
          <>
            <rect
              x={selectedBounds.x - 6}
              y={selectedBounds.y - 6}
              width={selectedBounds.w + 12}
              height={selectedBounds.h + 12}
              fill="none"
              stroke="#855cd6"
              strokeDasharray="8 6"
              strokeWidth={2 / zoom}
            />

            {getEditPoints(selectedShape).map((p, index) => (
              <circle
                key={index}
                cx={p.x}
                cy={p.y}
                r={9 / zoom}
                fill="white"
                stroke="#855cd6"
                strokeWidth={3 / zoom}
                className="point"
                onPointerDown={(e) => startPointDrag(e, selectedShape, index)}
              />
            ))}
          </>
        )}

        {tool === TOOL.ERASE && eraserPosition && (
          <circle
            cx={eraserPosition.x}
            cy={eraserPosition.y}
            r={ERASER_RADIUS / zoom}
            fill="rgba(133, 92, 214, 0.12)"
            stroke="#855cd6"
            strokeWidth={2 / zoom}
            strokeDasharray={`${6 / zoom} ${4 / zoom}`}
            pointerEvents="none"
          />
        )}
      </svg>
    </main>
  );
}