import { useEffect, useMemo, useRef, useState } from "react";

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
const MIN_SHAPE_SIZE = 4;

const FONT_OPTIONS = [
  "Arial",
  "Verdana",
  "Tahoma",
  "Georgia",
  "Times New Roman",
  "Courier New"
];

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

  if (shape.type === "text") {
    const box = getBoundingBox(shape);

    return (
      point.x >= box.x - radius &&
      point.x <= box.x + box.w + radius &&
      point.y >= box.y - radius &&
      point.y <= box.y + box.h + radius
    );
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

function isDraftLargeEnough(draft) {
  if (!draft) return false;

  if (draft.type === "rect" || draft.type === "ellipse") {
    return Math.abs(draft.w) >= MIN_SHAPE_SIZE || Math.abs(draft.h) >= MIN_SHAPE_SIZE;
  }

  if (draft.type === "triangle-box") {
    return (
      Math.abs(draft.x2 - draft.x1) >= MIN_SHAPE_SIZE ||
      Math.abs(draft.y2 - draft.y1) >= MIN_SHAPE_SIZE
    );
  }

  return true;
}

function getShapeCenter(shape) {
  const box = getBoundingBox(shape);

  return {
    x: box.x + box.w / 2,
    y: box.y + box.h / 2
  };
}

function getAngle(center, point) {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

function rotatePoint(point, center, angleDegrees) {
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

function unrotatePoint(point, center, angleDegrees) {
  return rotatePoint(point, center, -angleDegrees);
}

function getRotation(shape) {
  return Number(shape?.rotation) || 0;
}

function createTriangleFromDraft(draft, style) {
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
  fontFamily,
  fontSize,
  draft,
  setDraft,
  dragInfo,
  setDragInfo,
  zoom,
  setZoom,
  lockedShapes = [],
  lockShape,
  unlockShape
}) {
  const [camera, setCamera] = useState({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2
  });

  const [eraserPosition, setEraserPosition] = useState(null);
  const [textEditor, setTextEditor] = useState(null);

  const inputRef = useRef(null);

  const selectedShape = shapes.find((s) => s.id === selectedId) ?? null;
  const selectedBounds = selectedShape ? getBoundingBox(selectedShape) : null;
  const selectedCenter = selectedShape ? getShapeCenter(selectedShape) : null;
  const selectedRotation = selectedShape ? getRotation(selectedShape) : 0;

  useEffect(() => {
    if (textEditor && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [textEditor]);

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

  function getLock(shapeId) {
    return lockedShapes.find((item) => item.shapeId === shapeId) ?? null;
  }

  function isLocked(shapeId) {
    return Boolean(getLock(shapeId));
  }

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
      prev.filter((shape) => {
        if (isLocked(shape.id)) return true;
        return !eraserTouchesShape(point, shape, ERASER_RADIUS / zoom);
      })
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

  function openTextEditorForCreate(point) {
    setTool(TOOL.TEXT);
    setSelectedId(null);

    setTextEditor({
      mode: "create",
      x: point.x,
      y: point.y,
      text: "",
      fontFamily: fontFamily || "Arial",
      fontSize: fontSize || 32
    });
  }

  function openTextEditorForEdit(shape) {
    if (isLocked(shape.id)) return;

    lockShape?.(shape.id, () => {
      setTool(TOOL.SELECT);
      setSelectedId(shape.id);

      setTextEditor({
        mode: "edit",
        shapeId: shape.id,
        x: shape.x,
        y: shape.y,
        text: shape.text || "",
        fontFamily: shape.fontFamily || fontFamily || "Arial",
        fontSize: shape.fontSize || fontSize || 32
      });
    });
  }

  function commitTextEditor() {
    if (!textEditor) return;

    const text = textEditor.text.trim();

    if (textEditor.mode === "create") {
      if (text) {
        const newShape = {
          id: uid(),
          type: "text",
          text,
          x: textEditor.x,
          y: textEditor.y,
          fill: fill === "none" ? stroke : fill,
          stroke,
          strokeWidth,
          fontFamily: textEditor.fontFamily || "Arial",
          fontSize: Math.max(8, Number(textEditor.fontSize) || 32),
          rotation: 0,
          visible: true
        };

        setShapes((prev) => [...prev, newShape]);
        setSelectedId(newShape.id);
        setTool(TOOL.SELECT);
      }

      setTextEditor(null);
      return;
    }

    if (textEditor.mode === "edit") {
      if (text) {
        setShapes((prev) =>
          prev.map((shape) =>
            shape.id === textEditor.shapeId
              ? {
                  ...shape,
                  text,
                  fontFamily: textEditor.fontFamily || "Arial",
                  fontSize: Math.max(8, Number(textEditor.fontSize) || 32)
                }
              : shape
          )
        );
      }

      unlockShape?.(textEditor.shapeId);
      setTool(TOOL.SELECT);
      setSelectedId(textEditor.shapeId);
      setTextEditor(null);
    }
  }

  function cancelTextEditor() {
    if (textEditor?.mode === "edit") {
      unlockShape?.(textEditor.shapeId);
      setSelectedId(textEditor.shapeId);
      setTool(TOOL.SELECT);
    }

    setTextEditor(null);
  }

  function startDrawingAt(point, event) {
    if (tool === TOOL.TEXT) {
      openTextEditorForCreate(point);
      return;
    }

    setSelectedId(null);

    if (tool === TOOL.RECT) {
      setDraft({
        type: "rect",
        x: point.x,
        y: point.y,
        w: 0,
        h: 0,
        rotation: 0,
        ...style
      });
      return;
    }

    if (tool === TOOL.ELLIPSE) {
      setDraft({
        type: "ellipse",
        x: point.x,
        y: point.y,
        w: 0,
        h: 0,
        rotation: 0,
        ...style
      });
      return;
    }

    if (tool === TOOL.TRIANGLE) {
      setDraft({
        type: "triangle-box",
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
        equilateral: Boolean(event?.shiftKey),
        rotation: 0,
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
        rotation: 0,
        visible: true
      };

      setShapes((prev) => [...prev, newShape]);

      setDragInfo({
        mode: "pen-draw",
        shapeId: newShape.id,
        startPoint: point,
        straight: Boolean(event?.shiftKey)
      });
    }
  }

  function focusShape(shape) {
    if (isLocked(shape.id)) return;

    setTool(TOOL.SELECT);
    setSelectedId(shape.id);
    setDraft(null);
    setDragInfo(null);
    setEraserPosition(null);
  }

  function finishActiveEdit() {
    if (dragInfo?.mode === "pen-draw") {
      setShapes((prev) => {
        const shape = prev.find((item) => item.id === dragInfo.shapeId);

        if (!shape || shape.points.length < 2) {
          return prev.filter((item) => item.id !== dragInfo.shapeId);
        }

        return prev;
      });

      return;
    }

    if (
      dragInfo?.mode === "move-shape" ||
      dragInfo?.mode === "move-point" ||
      dragInfo?.mode === "rotate-shape" ||
      dragInfo?.mode === "scale-shape"
    ) {
      setShapes((prev) => prev);

      if (dragInfo.shapeId) {
        unlockShape?.(dragInfo.shapeId);
      }
    }
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

    if (textEditor) {
      commitTextEditor();
      return;
    }

    if (tool === TOOL.ERASE) {
      setSelectedId(null);
      setEraserPosition(p);
      setDragInfo({ mode: "erase" });
      eraseAt(p);
      return;
    }

    if (tool === TOOL.SELECT || tool === TOOL.FILL) {
      setSelectedId(null);
      return;
    }

    startDrawingAt(p, event);
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
      setDraft((prev) => ({
        ...prev,
        x2: p.x,
        y2: p.y,
        equilateral: event.shiftKey
      }));

      return;
    }

    if (dragInfo?.mode === "pen-draw") {
      setShapesLive((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragInfo.shapeId) return shape;

          if (event.shiftKey || dragInfo.straight) {
            return {
              ...shape,
              points: [dragInfo.startPoint, p]
            };
          }

          const last = shape.points[shape.points.length - 1];

          if (last && distance(last, p) < 7) return shape;

          return {
            ...shape,
            points: [...shape.points, p]
          };
        })
      );

      return;
    }

    if (dragInfo?.mode === "rotate-shape") {
      const currentAngle = getAngle(dragInfo.center, p);
      const delta = currentAngle - dragInfo.startAngle;
      const nextRotation = dragInfo.originalRotation + delta;

      setShapesLive((prev) =>
        prev.map((shape) =>
          shape.id === dragInfo.shapeId
            ? {
                ...shape,
                rotation: nextRotation
              }
            : shape
        )
      );

      return;
    }

    if (dragInfo?.mode === "scale-shape") {
      const localPoint = unrotatePoint(p, dragInfo.center, dragInfo.rotation);
      const currentDistance = Math.max(distance(dragInfo.center, localPoint), 1);
      const scale = currentDistance / dragInfo.startDistance;

      setShapesLive((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragInfo.shapeId) return shape;

          if (shape.type !== "triangle") return shape;

          return {
            ...shape,
            points: dragInfo.originalPoints.map((point) => ({
              x: dragInfo.center.x + (point.x - dragInfo.center.x) * scale,
              y: dragInfo.center.y + (point.y - dragInfo.center.y) * scale
            }))
          };
        })
      );

      return;
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

          if (shape.type === "text") {
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

      return;
    }

    if (dragInfo?.mode === "move-point") {
      setShapesLive((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragInfo.shapeId) return shape;

          const localPoint = unrotatePoint(
            p,
            dragInfo.center,
            dragInfo.rotation
          );

          if (shape.type === "rect" || shape.type === "ellipse") {
            const next = { ...shape };
            const anchor = dragInfo.anchor;

            const box = getConstrainedBox(anchor, localPoint, event.shiftKey);

            next.x = anchor.x;
            next.y = anchor.y;
            next.w = box.w;
            next.h = box.h;

            return next;
          }

          if (shape.type === "text") {
            return {
              ...shape,
              x: localPoint.x,
              y: localPoint.y
            };
          }

          return {
            ...shape,
            points: shape.points.map((pt, i) =>
              i === dragInfo.pointIndex
                ? {
                    x: localPoint.x,
                    y: localPoint.y
                  }
                : pt
            )
          };
        })
      );
    }
  }

  function handlePointerUp() {
    const hadDraft = Boolean(draft);
    const wasDrawing = dragInfo?.mode === "pen-draw";
    const wasErasing = dragInfo?.mode === "erase";

    if (draft?.type === "rect" && isDraftLargeEnough(draft)) {
      const shape = {
        id: uid(),
        visible: true,
        ...draft
      };

      setShapes((prev) => [...prev, shape]);
    }

    if (draft?.type === "ellipse" && isDraftLargeEnough(draft)) {
      const shape = {
        id: uid(),
        visible: true,
        ...draft
      };

      setShapes((prev) => [...prev, shape]);
    }

    if (draft?.type === "triangle-box" && isDraftLargeEnough(draft)) {
      const shape = createTriangleFromDraft(draft, style);

      setShapes((prev) => [...prev, shape]);
    }

    finishActiveEdit();

    if (hadDraft || wasDrawing || wasErasing) {
      setSelectedId(null);
    }

    setDraft(null);
    setDragInfo(null);
  }

  function isDrawingTool() {
    return (
      tool === TOOL.RECT ||
      tool === TOOL.ELLIPSE ||
      tool === TOOL.TRIANGLE ||
      tool === TOOL.PEN ||
      tool === TOOL.TEXT
    );
  }

  function handleShapeDoubleClick(event, shape) {
    event.stopPropagation();
    event.preventDefault();

    if (textEditor) {
      commitTextEditor();
    }

    if (shape.type === "text") {
      openTextEditorForEdit(shape);
      return;
    }

    focusShape(shape);
  }

  function handleShapePointerDown(event, shape) {
    event.stopPropagation();

    if (event.button === 2) {
      startPan(event);
      return;
    }

    if (textEditor) {
      commitTextEditor();
      return;
    }

    if (event.detail >= 2) {
      handleShapeDoubleClick(event, shape);
      return;
    }

    if (isDrawingTool()) {
      const p = getPointerFromSvg(event);
      startDrawingAt(p, event);
      return;
    }

    if (isLocked(shape.id)) {
      return;
    }

    if (tool === TOOL.FILL) {
      lockShape?.(shape.id, () => {
        setShapes((prev) =>
          prev.map((item) => {
            if (item.id !== shape.id) return item;

            if (item.type === "pen") {
              if (fill === "none") return item;

              return {
                ...item,
                stroke: fill
              };
            }

            if (item.type === "text") {
              if (fill === "none") return item;

              return {
                ...item,
                fill
              };
            }

            return {
              ...item,
              fill
            };
          })
        );

        unlockShape?.(shape.id);
      });

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

    lockShape?.(shape.id, () => {
      setSelectedId(shape.id);

      if (shape.type === "rect" || shape.type === "ellipse") {
        setDragInfo({
          mode: "move-shape",
          shapeId: shape.id,
          start: p,
          original: {
            x: shape.x,
            y: shape.y
          }
        });

        return;
      }

      if (shape.type === "text") {
        setDragInfo({
          mode: "move-shape",
          shapeId: shape.id,
          start: p,
          original: {
            x: shape.x,
            y: shape.y
          }
        });

        return;
      }

      setDragInfo({
        mode: "move-shape",
        shapeId: shape.id,
        start: p,
        originalPoints: shape.points.map((pt) => ({ ...pt }))
      });
    });
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

    if (shape.type === "text") {
      return [{ x: shape.x, y: shape.y }];
    }

    return shape.points;
  }

  function getTriangleScalePoint(shape) {
    const box = getBoundingBox(shape);

    return {
      x: box.x + box.w + 30 / zoom,
      y: box.y + box.h + 30 / zoom
    };
  }

  function startPointDrag(event, shape, pointIndex) {
    event.stopPropagation();

    if (tool !== TOOL.SELECT) return;
    if (isLocked(shape.id)) return;

    const center = getShapeCenter(shape);
    const rotation = getRotation(shape);

    lockShape?.(shape.id, () => {
      setSelectedId(shape.id);

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
          anchor: points[oppositePointMap[pointIndex]],
          center,
          rotation
        });

        return;
      }

      setDragInfo({
        mode: "move-point",
        shapeId: shape.id,
        pointIndex,
        center,
        rotation
      });
    });
  }

  function startRotationDrag(event, shape) {
    event.stopPropagation();

    if (tool !== TOOL.SELECT) return;
    if (isLocked(shape.id)) return;

    const p = getPointerFromSvg(event);
    const center = getShapeCenter(shape);

    lockShape?.(shape.id, () => {
      setSelectedId(shape.id);

      setDragInfo({
        mode: "rotate-shape",
        shapeId: shape.id,
        center,
        startAngle: getAngle(center, p),
        originalRotation: getRotation(shape)
      });
    });
  }

  function startScaleDrag(event, shape) {
    event.stopPropagation();

    if (tool !== TOOL.SELECT) return;
    if (isLocked(shape.id)) return;
    if (shape.type !== "triangle") return;

    const center = getShapeCenter(shape);
    const rotation = getRotation(shape);
    const p = getPointerFromSvg(event);
    const localPoint = unrotatePoint(p, center, rotation);
    const startDistance = Math.max(distance(center, localPoint), 1);

    lockShape?.(shape.id, () => {
      setSelectedId(shape.id);

      setDragInfo({
        mode: "scale-shape",
        shapeId: shape.id,
        center,
        rotation,
        startDistance,
        originalPoints: shape.points.map((pt) => ({ ...pt }))
      });
    });
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

        {shapes.map((shape) => {
          if (!shape.visible) return null;

          const lock = getLock(shape.id);

          return (
            <g
              key={shape.id}
              onDoubleClick={(event) => handleShapeDoubleClick(event, shape)}
            >
              <ShapeRenderer
                shape={shape}
                locked={Boolean(lock)}
                onPointerDown={(e) => handleShapePointerDown(e, shape)}
              />

              {lock && (
                <text
                  x={getBoundingBox(shape).x}
                  y={getBoundingBox(shape).y - 10}
                  fill="#ef4444"
                  fontSize={16 / zoom}
                  fontWeight="700"
                  pointerEvents="none"
                >
                  {lock.userName}
                </text>
              )}
            </g>
          );
        })}

        {draft?.type === "rect" && <ShapeRenderer shape={draft} preview />}
        {draft?.type === "ellipse" && <ShapeRenderer shape={draft} preview />}

        {draft?.type === "triangle-box" && (
          <ShapeRenderer
            shape={createTriangleFromDraft(draft, style)}
            preview
          />
        )}

        {selectedShape && selectedBounds && selectedCenter && tool === TOOL.SELECT && (
          <g transform={`rotate(${selectedRotation} ${selectedCenter.x} ${selectedCenter.y})`}>
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

            <line
              x1={selectedBounds.x + selectedBounds.w / 2}
              y1={selectedBounds.y - 6}
              x2={selectedBounds.x + selectedBounds.w / 2}
              y2={selectedBounds.y - 42 / zoom}
              stroke="#855cd6"
              strokeWidth={2 / zoom}
              strokeDasharray={`${5 / zoom} ${4 / zoom}`}
            />

            <circle
              cx={selectedBounds.x + selectedBounds.w / 2}
              cy={selectedBounds.y - 48 / zoom}
              r={10 / zoom}
              fill="#855cd6"
              stroke="white"
              strokeWidth={3 / zoom}
              className="rotate-point"
              onPointerDown={(event) => startRotationDrag(event, selectedShape)}
            />

            {selectedShape.type === "triangle" && (
              <circle
                cx={getTriangleScalePoint(selectedShape).x}
                cy={getTriangleScalePoint(selectedShape).y}
                r={10 / zoom}
                fill="#f97316"
                stroke="white"
                strokeWidth={3 / zoom}
                className="scale-point"
                onPointerDown={(event) => startScaleDrag(event, selectedShape)}
              />
            )}

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
          </g>
        )}

        {textEditor && (
          <foreignObject
            x={textEditor.x}
            y={textEditor.y - textEditor.fontSize - 90}
            width={360}
            height={textEditor.fontSize + 135}
          >
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              className="svg-text-editor"
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="text-editor-row">
                <input
                  ref={inputRef}
                  className="svg-text-input"
                  value={textEditor.text}
                  onChange={(event) =>
                    setTextEditor((prev) => ({
                      ...prev,
                      text: event.target.value
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitTextEditor();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelTextEditor();
                    }
                  }}
                  style={{
                    fontFamily: textEditor.fontFamily,
                    fontSize: `${textEditor.fontSize}px`,
                    color: fill === "none" ? stroke : fill
                  }}
                  placeholder="Napíš text..."
                />
              </div>

              <div className="text-editor-row">
                <select
                  className="svg-text-select"
                  value={textEditor.fontFamily}
                  onChange={(event) =>
                    setTextEditor((prev) => ({
                      ...prev,
                      fontFamily: event.target.value
                    }))
                  }
                >
                  {FONT_OPTIONS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>

                <input
                  className="svg-text-size"
                  type="number"
                  min="8"
                  max="180"
                  value={textEditor.fontSize}
                  onChange={(event) =>
                    setTextEditor((prev) => ({
                      ...prev,
                      fontSize: Math.max(8, Number(event.target.value) || 8)
                    }))
                  }
                />

                <button
                  className="svg-text-confirm"
                  type="button"
                  onClick={commitTextEditor}
                >
                  OK
                </button>

                <button
                  className="svg-text-cancel"
                  type="button"
                  onClick={cancelTextEditor}
                >
                  ×
                </button>
              </div>
            </div>
          </foreignObject>
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