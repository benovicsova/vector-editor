import { useMemo, useRef, useState } from "react";

import { CANVAS_WIDTH, CANVAS_HEIGHT, TOOL } from "../constants";
import { clamp, distance, getBoundingBox, uid } from "../utils/geometry";
import {
  ERASER_RADIUS,
  constrainLinePoint,
  createQuadFromDraft,
  createTriangleFromDraft,
  eraserTouchesShape,
  getAngle,
  getBoundsForShapes,
  getBoundsCenter,
  getConstrainedBox,
  getEditPoints,
  getRotation,
  getShapeCenter,
  isClosedPen,
  isDraftLargeEnough,
  moveShapeByDelta,
  scaleShapeFromCenter,
  shapeIntersectsBounds,
  unrotatePoint
} from "../utils/editorCanvasGeometry";

import ShapeRenderer from "./ShapeRenderer";
import EditorCanvasSelectionControls from "./EditorCanvasSelectionControls";
import EditorCanvasTextEditor from "./EditorCanvasTextEditor";

function normalizeBounds(start, current) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const w = Math.abs(current.x - start.x);
  const h = Math.abs(current.y - start.y);

  return { x, y, w, h };
}

export default function EditorCanvas({
  tool,
  setTool,
  shapes,
  setShapes,
  setShapesLive,
  selectedId,
  setSelectedId,
  selectedIds = [],
  setSelectedIds,
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
  focusedShapes = [],
  lockShape,
  unlockShape,
  eyedropperTarget = null,
  onPickColorFromShape
}) {
  const svgRef = useRef(null);

  const [camera, setCamera] = useState({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2
  });

  const [eraserPosition, setEraserPosition] = useState(null);
  const [textEditor, setTextEditor] = useState(null);
  const [eyedropperPreview, setEyedropperPreview] = useState(null);

  const updateShapesLive = setShapesLive || setShapes;

  const normalizedSelectedIds = useMemo(() => {
    const ids = new Set();

    for (const id of selectedIds) {
      if (shapes.some((shape) => shape.id === id)) ids.add(id);
    }

    if (selectedId && shapes.some((shape) => shape.id === selectedId)) {
      ids.add(selectedId);
    }

    return Array.from(ids);
  }, [selectedId, selectedIds, shapes]);

  const selectedShape = shapes.find((shape) => shape.id === selectedId) ?? null;
  const selectedBounds = selectedShape ? getBoundingBox(selectedShape) : null;
  const selectedCenter = selectedShape ? getShapeCenter(selectedShape) : null;
  const selectedRotation = selectedShape ? getRotation(selectedShape) : 0;

  const multipleSelectedShapes = normalizedSelectedIds
    .map((id) => shapes.find((shape) => shape.id === id))
    .filter(Boolean);

  const multiSelectionBounds = getBoundsForShapes(
    multipleSelectedShapes.length > 1 ? multipleSelectedShapes : []
  );

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

  function setSelection(nextIds) {
    const uniqueIds = Array.from(
      new Set(nextIds.filter((id) => shapes.some((shape) => shape.id === id)))
    );

    setSelectedIds?.(uniqueIds);
    setSelectedId(uniqueIds[0] || null);
  }

  function clearSelection() {
    setSelectedIds?.([]);
    setSelectedId(null);
  }

  function prepareLiveHistoryStep() {
    setShapes((prev) => prev);
  }

  function withShapeLock(shapeId, callback) {
    if (!lockShape) {
      callback();
      return;
    }

    lockShape(shapeId, (response) => {
      if (response === false || response?.success === false) return;
      callback();
    });
  }

  function getLock(shapeId) {
    return lockedShapes.find((item) => item.shapeId === shapeId) ?? null;
  }

  function getFocus(shapeId) {
    return focusedShapes.find((item) => item.shapeId === shapeId) ?? null;
  }

  function isLocked(shapeId) {
    return Boolean(getLock(shapeId));
  }

  function anyLocked(shapeIds = []) {
    return shapeIds.some((shapeId) => isLocked(shapeId));
  }

  function screenPointToSvgPoint(event, svgElement) {
    const svg =
      svgRef.current ||
      svgElement?.ownerSVGElement ||
      svgElement?.closest?.("svg") ||
      svgElement;

    if (!svg || typeof svg.createSVGPoint !== "function") {
      return {
        x: event.clientX,
        y: event.clientY
      };
    }

    const screenMatrix = svg.getScreenCTM();

    if (!screenMatrix) {
      return {
        x: event.clientX,
        y: event.clientY
      };
    }

    const point = svg.createSVGPoint();

    point.x = event.clientX;
    point.y = event.clientY;

    const transformedPoint = point.matrixTransform(screenMatrix.inverse());

    return {
      x: transformedPoint.x,
      y: transformedPoint.y
    };
  }

  function getSvgPoint(event) {
    return screenPointToSvgPoint(event, event.currentTarget);
  }

  function getPointerFromSvg(event) {
    return screenPointToSvgPoint(event, event.currentTarget);
  }

  function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) return distance(point, start);

    const t = Math.max(
      0,
      Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
    );

    return distance(point, {
      x: start.x + t * dx,
      y: start.y + t * dy
    });
  }

  function pointInPolygon(point, points = []) {
    if (points.length < 3) return false;

    let inside = false;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const pi = points[i];
      const pj = points[j];

      const intersects =
        pi.y > point.y !== pj.y > point.y &&
        point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y || 1) + pi.x;

      if (intersects) inside = !inside;
    }

    return inside;
  }

  function isPointNearPolyline(point, points = [], tolerance = 8) {
    if (points.length === 0) return false;
    if (points.length === 1) return distance(point, points[0]) <= tolerance;

    for (let i = 0; i < points.length - 1; i++) {
      if (distanceToSegment(point, points[i], points[i + 1]) <= tolerance) {
        return true;
      }
    }

    return false;
  }

  function getPointInShapeCoordinates(shape, point) {
    const rotation = getRotation(shape);

    if (!rotation) return point;

    return unrotatePoint(point, getShapeCenter(shape), rotation);
  }

  function shapeContainsPoint(shape, point) {
    const localPoint = getPointInShapeCoordinates(shape, point);
    const box = getBoundingBox(shape);
    const tolerance = Math.max((Number(shape.strokeWidth) || 1) / 2 + 6 / zoom, 6 / zoom);

    if (shape.type === "rect") {
      return (
        localPoint.x >= box.x - tolerance &&
        localPoint.x <= box.x + box.w + tolerance &&
        localPoint.y >= box.y - tolerance &&
        localPoint.y <= box.y + box.h + tolerance
      );
    }

    if (shape.type === "ellipse") {
      const cx = shape.x + shape.w / 2;
      const cy = shape.y + shape.h / 2;
      const rx = Math.max(Math.abs(shape.w / 2), 0.1);
      const ry = Math.max(Math.abs(shape.h / 2), 0.1);

      const normalized =
        ((localPoint.x - cx) * (localPoint.x - cx)) / (rx * rx) +
        ((localPoint.y - cy) * (localPoint.y - cy)) / (ry * ry);

      return normalized <= 1.12;
    }

    if (shape.type === "triangle" || shape.type === "quad") {
      return (
        pointInPolygon(localPoint, shape.points || []) ||
        isPointNearPolyline(localPoint, [...(shape.points || []), shape.points?.[0]].filter(Boolean), tolerance)
      );
    }

    if (shape.type === "line") {
      return isPointNearPolyline(localPoint, shape.points || [], tolerance);
    }

    if (shape.type === "pen") {
      if (isClosedPen(shape) && pointInPolygon(localPoint, shape.points || [])) {
        return true;
      }

      return isPointNearPolyline(localPoint, shape.points || [], tolerance);
    }

    if (shape.type === "text") {
      return (
        localPoint.x >= box.x - tolerance &&
        localPoint.x <= box.x + box.w + tolerance &&
        localPoint.y >= box.y - tolerance &&
        localPoint.y <= box.y + box.h + tolerance
      );
    }

    return false;
  }

  function getShapeAtPoint(point) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const shape = shapes[i];

      if (shape.visible === false) continue;
      if (shapeContainsPoint(shape, point)) return shape;
    }

    return null;
  }

  function eraseAt(point) {
    updateShapesLive((prev) =>
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
    clearSelection();

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

    withShapeLock(shape.id, () => {
      setTool(TOOL.SELECT);
      setSelection([shape.id]);

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
        setSelection([newShape.id]);
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
      setSelection([textEditor.shapeId]);
      setTextEditor(null);
    }
  }

  function cancelTextEditor() {
    if (textEditor?.mode === "edit") {
      unlockShape?.(textEditor.shapeId);
      setSelection([textEditor.shapeId]);
      setTool(TOOL.SELECT);
    }

    setTextEditor(null);
  }

  function startDrawingAt(point, event) {
    if (tool === TOOL.TEXT) {
      openTextEditorForCreate(point);
      return;
    }

    clearSelection();

    if (tool === TOOL.RECT) {
      setDraft({ type: "rect", x: point.x, y: point.y, w: 0, h: 0, rotation: 0, ...style });
      return;
    }

    if (tool === TOOL.ELLIPSE) {
      setDraft({ type: "ellipse", x: point.x, y: point.y, w: 0, h: 0, rotation: 0, ...style });
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

    if (tool === TOOL.QUAD) {
      setDraft({
        type: "quad-box",
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
        rotation: 0,
        ...style
      });
      return;
    }

    if (tool === TOOL.LINE) {
      setDraft({
        type: "line",
        points: [point, point],
        fill: "none",
        stroke,
        strokeWidth,
        rotation: 0,
        visible: true
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

      prepareLiveHistoryStep();
      updateShapesLive((prev) => [...prev, newShape]);

      setDragInfo({
        mode: "pen-draw",
        shapeId: newShape.id,
        startPoint: point,
        straight: Boolean(event?.shiftKey)
      });
    }
  }

  function focusShape(shape, append = false) {
    if (isLocked(shape.id)) return;

    setTool(TOOL.SELECT);
    setDraft(null);
    setDragInfo(null);
    setEraserPosition(null);

    if (append) {
      const baseIds = normalizedSelectedIds.length > 0 ? normalizedSelectedIds : selectedId ? [selectedId] : [];
      const nextIds = baseIds.includes(shape.id)
        ? baseIds.filter((id) => id !== shape.id)
        : [...baseIds, shape.id];

      setSelection(nextIds);
      return;
    }

    setSelection([shape.id]);
  }

  function finishActiveEdit() {
    if (dragInfo?.mode === "pen-draw") {
      updateShapesLive((prev) => {
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
      dragInfo?.mode === "scale-shape" ||
      dragInfo?.mode === "move-selection" ||
      dragInfo?.mode === "scale-selection"
    ) {
      const idsThatShouldStayLocked = new Set(
        [selectedId, ...(selectedIds || [])].filter(Boolean)
      );

      if (dragInfo.shapeId && !idsThatShouldStayLocked.has(dragInfo.shapeId)) {
        unlockShape?.(dragInfo.shapeId);
      }

      if (Array.isArray(dragInfo.shapeIds)) {
        for (const id of dragInfo.shapeIds) {
          if (!idsThatShouldStayLocked.has(id)) {
            unlockShape?.(id);
          }
        }
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

    const nextZoom = clamp(zoom * (event.deltaY < 0 ? 1.12 : 0.88), 0.2, 5);

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

    const point = getSvgPoint(event);

    if (textEditor) {
      commitTextEditor();
      return;
    }

    if (eyedropperTarget) {
      event.preventDefault();
      const pickedShape = getShapeAtPoint(point);

      if (pickedShape) {
        onPickColorFromShape?.(
          pickedShape,
          getEyedropperColorFromShape(pickedShape, point)
        );
      }

      setEyedropperPreview(null);
      return;
    }

    if (tool === TOOL.ERASE) {
      prepareLiveHistoryStep();
      clearSelection();
      setEraserPosition(point);
      setDragInfo({ mode: "erase" });
      eraseAt(point);
      return;
    }

    if (tool === TOOL.SELECT) {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
        clearSelection();
      }

      setDragInfo({
        mode: "select-rect",
        start: point,
        current: point,
        append: event.ctrlKey || event.metaKey || event.shiftKey,
        originalIds: normalizedSelectedIds
      });
      return;
    }

    if (tool === TOOL.FILL) {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
        clearSelection();
      }
      return;
    }

    startDrawingAt(point, event);
  }

  function getFallbackColorFromShape(shape) {
    if (!shape) return null;

    if (shape.type === "line") {
      return shape.stroke && shape.stroke !== "none" ? shape.stroke : null;
    }

    if (shape.type === "pen") {
      if (isClosedPen(shape) && shape.fill && shape.fill !== "none") {
        return shape.fill;
      }

      return shape.stroke && shape.stroke !== "none" ? shape.stroke : null;
    }

    if (shape.fill && shape.fill !== "none") return shape.fill;
    if (shape.stroke && shape.stroke !== "none") return shape.stroke;

    return null;
  }

  function getEyedropperColorFromShape(shape, point) {
    if (!shape) return null;

    const localPoint = point ? getPointInShapeCoordinates(shape, point) : null;
    const box = getBoundingBox(shape);
    const tolerance = Math.max((Number(shape.strokeWidth) || 1) / 2 + 6 / zoom, 6 / zoom);
    const hasFill = Boolean(shape.fill && shape.fill !== "none");
    const hasStroke = Boolean(shape.stroke && shape.stroke !== "none");

    if (!localPoint) {
      return getFallbackColorFromShape(shape);
    }

    if (shape.type === "line") {
      return hasStroke ? shape.stroke : null;
    }

    if (shape.type === "rect") {
      const nearLeft = Math.abs(localPoint.x - box.x) <= tolerance;
      const nearRight = Math.abs(localPoint.x - (box.x + box.w)) <= tolerance;
      const nearTop = Math.abs(localPoint.y - box.y) <= tolerance;
      const nearBottom = Math.abs(localPoint.y - (box.y + box.h)) <= tolerance;

      if ((nearLeft || nearRight || nearTop || nearBottom) && hasStroke) {
        return shape.stroke;
      }

      if (hasFill) return shape.fill;
      if (hasStroke) return shape.stroke;
      return null;
    }

    if (shape.type === "ellipse") {
      const cx = shape.x + shape.w / 2;
      const cy = shape.y + shape.h / 2;
      const rx = Math.max(Math.abs(shape.w / 2), 0.1);
      const ry = Math.max(Math.abs(shape.h / 2), 0.1);
      const normalized =
        ((localPoint.x - cx) * (localPoint.x - cx)) / (rx * rx) +
        ((localPoint.y - cy) * (localPoint.y - cy)) / (ry * ry);
      const strokeBand = Math.max(tolerance / Math.max(rx, ry), 0.02);

      if (Math.abs(normalized - 1) <= strokeBand * 2 && hasStroke) {
        return shape.stroke;
      }

      if (normalized <= 1 && hasFill) return shape.fill;
      if (hasStroke) return shape.stroke;
      return null;
    }

    if (shape.type === "triangle" || shape.type === "quad") {
      const closedPoints = [...(shape.points || []), shape.points?.[0]].filter(Boolean);

      if (isPointNearPolyline(localPoint, closedPoints, tolerance) && hasStroke) {
        return shape.stroke;
      }

      if (pointInPolygon(localPoint, shape.points || []) && hasFill) return shape.fill;
      if (hasStroke) return shape.stroke;
      return null;
    }

    if (shape.type === "pen") {
      if (isClosedPen(shape)) {
        const closedPoints = [...(shape.points || []), shape.points?.[0]].filter(Boolean);

        if (isPointNearPolyline(localPoint, closedPoints, tolerance) && hasStroke) {
          return shape.stroke;
        }

        if (pointInPolygon(localPoint, shape.points || []) && hasFill) return shape.fill;
        if (hasStroke) return shape.stroke;
        return null;
      }

      return hasStroke ? shape.stroke : null;
    }

    if (shape.type === "text") {
      if (hasFill) return shape.fill;
      if (hasStroke) return shape.stroke;
      return null;
    }

    return getFallbackColorFromShape(shape);
  }

  function updateEyedropperPreview(event, shape = null) {
    if (!eyedropperTarget) return;

    const point = getSvgPoint(event);
    const pickedShape = shape || getShapeAtPoint(point);
    const color = getEyedropperColorFromShape(pickedShape, point);

    setEyedropperPreview({
      x: point.x,
      y: point.y,
      color: color || "#ffffff",
      hasColor: Boolean(color)
    });
  }

  function handlePointerMove(event) {
    if (dragInfo?.mode === "pan") {
      updatePan(event);
      return;
    }

    const point = getSvgPoint(event);

    if (eyedropperTarget) {
      updateEyedropperPreview(event);
      return;
    }

    if (tool === TOOL.ERASE) {
      setEraserPosition(point);
    }

    if (dragInfo?.mode === "select-rect") {
      setDragInfo((prev) => ({ ...prev, current: point }));
      return;
    }

    if (dragInfo?.mode === "erase") {
      eraseAt(point);
      return;
    }

    if (draft?.type === "rect" || draft?.type === "ellipse") {
      setDraft((prev) => {
        const box = getConstrainedBox({ x: prev.x, y: prev.y }, point, event.shiftKey);
        return { ...prev, w: box.w, h: box.h };
      });
      return;
    }

    if (draft?.type === "triangle-box") {
      setDraft((prev) => ({ ...prev, x2: point.x, y2: point.y, equilateral: event.shiftKey }));
      return;
    }

    if (draft?.type === "quad-box") {
      setDraft((prev) => ({ ...prev, x2: point.x, y2: point.y }));
      return;
    }

    if (draft?.type === "line") {
      setDraft((prev) => ({
        ...prev,
        points: [prev.points[0], constrainLinePoint(prev.points[0], point, event.shiftKey)]
      }));
      return;
    }

    if (dragInfo?.mode === "pen-draw") {
      updateShapesLive((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragInfo.shapeId) return shape;

          if (event.shiftKey || dragInfo.straight) {
            return {
              ...shape,
              points: [dragInfo.startPoint, constrainLinePoint(dragInfo.startPoint, point, event.shiftKey || dragInfo.straight)]
            };
          }

          const last = shape.points[shape.points.length - 1];
          if (last && distance(last, point) < 7) return shape;

          return { ...shape, points: [...shape.points, point] };
        })
      );
      return;
    }

    if (dragInfo?.mode === "move-selection") {
      const dx = point.x - dragInfo.start.x;
      const dy = point.y - dragInfo.start.y;

      updateShapesLive((prev) =>
        prev.map((shape) => {
          const original = dragInfo.originalShapes.find((item) => item.id === shape.id);
          if (!original) return shape;
          return moveShapeByDelta(original, dx, dy);
        })
      );
      return;
    }

    if (dragInfo?.mode === "scale-selection") {
      const currentDistance = Math.max(distance(dragInfo.center, point), 1);
      const scale = currentDistance / dragInfo.startDistance;

      updateShapesLive((prev) =>
        prev.map((shape) => {
          const original = dragInfo.originalShapes.find((item) => item.id === shape.id);
          if (!original) return shape;
          return scaleShapeFromCenter(original, dragInfo.center, scale);
        })
      );
      return;
    }

    if (dragInfo?.mode === "rotate-shape") {
      const currentAngle = getAngle(dragInfo.center, point);
      const delta = currentAngle - dragInfo.startAngle;
      const nextRotation = dragInfo.originalRotation + delta;

      updateShapesLive((prev) =>
        prev.map((shape) =>
          shape.id === dragInfo.shapeId ? { ...shape, rotation: nextRotation } : shape
        )
      );
      return;
    }

    if (dragInfo?.mode === "scale-shape") {
      const localPoint = unrotatePoint(point, dragInfo.center, dragInfo.rotation);
      const currentDistance = Math.max(distance(dragInfo.center, localPoint), 1);
      const scale = currentDistance / dragInfo.startDistance;

      updateShapesLive((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragInfo.shapeId) return shape;
          return scaleShapeFromCenter(dragInfo.originalShape, dragInfo.center, scale);
        })
      );
      return;
    }

    if (dragInfo?.mode === "move-shape") {
      const dx = point.x - dragInfo.start.x;
      const dy = point.y - dragInfo.start.y;

      updateShapesLive((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragInfo.shapeId) return shape;
          return moveShapeByDelta(dragInfo.originalShape, dx, dy);
        })
      );
      return;
    }

    if (dragInfo?.mode === "move-point") {
      updateShapesLive((prev) =>
        prev.map((shape) => {
          if (shape.id !== dragInfo.shapeId) return shape;

          const localPoint = unrotatePoint(point, dragInfo.center, dragInfo.rotation);

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
            return { ...shape, x: localPoint.x, y: localPoint.y };
          }

          return {
            ...shape,
            points: shape.points.map((pt, index) =>
              index === dragInfo.pointIndex ? { x: localPoint.x, y: localPoint.y } : pt
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

    if (dragInfo?.mode === "select-rect") {
      const selectionBounds = normalizeBounds(dragInfo.start, dragInfo.current);
      const isClick = selectionBounds.w < 4 / zoom && selectionBounds.h < 4 / zoom;

      if (!isClick) {
        const idsInside = shapes
          .filter((shape) => shape.visible !== false)
          .filter((shape) => !isLocked(shape.id))
          .filter((shape) => shapeIntersectsBounds(shape, selectionBounds))
          .map((shape) => shape.id);

        const nextIds = dragInfo.append
          ? Array.from(new Set([...(dragInfo.originalIds || []), ...idsInside]))
          : idsInside;

        setSelection(nextIds.filter((shapeId) => !isLocked(shapeId)));
      }
    }

    if (draft?.type === "rect" && isDraftLargeEnough(draft)) {
      setShapes((prev) => [...prev, { id: uid(), visible: true, ...draft }]);
    }

    if (draft?.type === "ellipse" && isDraftLargeEnough(draft)) {
      setShapes((prev) => [...prev, { id: uid(), visible: true, ...draft }]);
    }

    if (draft?.type === "triangle-box" && isDraftLargeEnough(draft)) {
      setShapes((prev) => [...prev, createTriangleFromDraft(draft, style)]);
    }

    if (draft?.type === "quad-box" && isDraftLargeEnough(draft)) {
      setShapes((prev) => [...prev, createQuadFromDraft(draft, style)]);
    }

    if (draft?.type === "line" && isDraftLargeEnough(draft)) {
      setShapes((prev) => [...prev, { id: uid(), ...draft }]);
    }

    finishActiveEdit();

    if (hadDraft || wasDrawing || wasErasing) {
      clearSelection();
    }

    setDraft(null);
    setDragInfo(null);
  }

  function isDrawingTool() {
    return (
      tool === TOOL.RECT ||
      tool === TOOL.ELLIPSE ||
      tool === TOOL.TRIANGLE ||
      tool === TOOL.QUAD ||
      tool === TOOL.LINE ||
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

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      focusShape(shape, true);
      return;
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

    if (eyedropperTarget) {
      event.preventDefault();
      const point = getPointerFromSvg(event);
      const pickedShape = getShapeAtPoint(point) || shape;
      const pickedColor = getEyedropperColorFromShape(pickedShape, point);

      updateEyedropperPreview(event, pickedShape);
      onPickColorFromShape?.(pickedShape, pickedColor);
      setEyedropperPreview(null);
      return;
    }

    if (isDrawingTool()) {
      const point = getPointerFromSvg(event);
      startDrawingAt(point, event);
      return;
    }

    if (isLocked(shape.id)) return;

    if (tool === TOOL.FILL) {
      withShapeLock(shape.id, () => {
        setShapes((prev) =>
          prev.map((item) => {
            if (item.id !== shape.id) return item;

            if (item.type === "pen") {
              if (!isClosedPen(item)) {
                return { ...item, stroke: fill === "none" ? item.stroke : fill };
              }

              return { ...item, fill };
            }

            if (item.type === "line") {
              if (fill === "none") return item;
              return { ...item, stroke: fill };
            }

            if (item.type === "text") {
              if (fill === "none") return item;
              return { ...item, fill };
            }

            return { ...item, fill };
          })
        );

        unlockShape?.(shape.id);
      });
      return;
    }

    if (tool === TOOL.ERASE) {
      const point = getPointerFromSvg(event);

      prepareLiveHistoryStep();
      clearSelection();
      setEraserPosition(point);
      setDragInfo({ mode: "erase" });
      eraseAt(point);
      return;
    }

    if (tool !== TOOL.SELECT) return;

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      focusShape(shape, true);
      return;
    }

    const point = getPointerFromSvg(event);

    if (normalizedSelectedIds.length > 1 && normalizedSelectedIds.includes(shape.id)) {
      if (anyLocked(normalizedSelectedIds)) return;

      prepareLiveHistoryStep();
      setDragInfo({
        mode: "move-selection",
        shapeIds: normalizedSelectedIds,
        start: point,
        originalShapes: shapes
          .filter((item) => normalizedSelectedIds.includes(item.id))
          .map((item) => structuredClone(item))
      });
      return;
    }

    withShapeLock(shape.id, () => {
      setSelection([shape.id]);
      prepareLiveHistoryStep();

      setDragInfo({
        mode: "move-shape",
        shapeId: shape.id,
        start: point,
        originalShape: structuredClone(shape)
      });
    });
  }

  function startPointDrag(event, shape, pointIndex) {
    event.stopPropagation();

    if (tool !== TOOL.SELECT) return;
    if (isLocked(shape.id)) return;

    const center = getShapeCenter(shape);
    const rotation = getRotation(shape);

    withShapeLock(shape.id, () => {
      setSelection([shape.id]);
      prepareLiveHistoryStep();

      if (shape.type === "rect" || shape.type === "ellipse") {
        const points = getEditPoints(shape);
        const oppositePointMap = { 0: 2, 1: 3, 2: 0, 3: 1 };

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

      setDragInfo({ mode: "move-point", shapeId: shape.id, pointIndex, center, rotation });
    });
  }

  function startRotationDrag(event, shape) {
    event.stopPropagation();

    if (tool !== TOOL.SELECT) return;
    if (isLocked(shape.id)) return;

    const point = getPointerFromSvg(event);
    const center = getShapeCenter(shape);

    withShapeLock(shape.id, () => {
      setSelection([shape.id]);
      prepareLiveHistoryStep();

      setDragInfo({
        mode: "rotate-shape",
        shapeId: shape.id,
        center,
        startAngle: getAngle(center, point),
        originalRotation: getRotation(shape)
      });
    });
  }

  function startScaleDrag(event, shape) {
    event.stopPropagation();

    if (tool !== TOOL.SELECT) return;
    if (isLocked(shape.id)) return;

    const center = getShapeCenter(shape);
    const rotation = getRotation(shape);
    const point = getPointerFromSvg(event);
    const localPoint = unrotatePoint(point, center, rotation);
    const startDistance = Math.max(distance(center, localPoint), 1);

    withShapeLock(shape.id, () => {
      setSelection([shape.id]);
      prepareLiveHistoryStep();

      setDragInfo({
        mode: "scale-shape",
        shapeId: shape.id,
        center,
        rotation,
        startDistance,
        originalShape: structuredClone(shape)
      });
    });
  }

  function startMultiScaleDrag(event, center) {
    event.stopPropagation();

    if (anyLocked(normalizedSelectedIds)) return;

    const point = getPointerFromSvg(event);
    const startDistance = Math.max(distance(center, point), 1);

    prepareLiveHistoryStep();

    setDragInfo({
      mode: "scale-selection",
      shapeIds: normalizedSelectedIds,
      center,
      startDistance,
      originalShapes: shapes
        .filter((shape) => normalizedSelectedIds.includes(shape.id))
        .map((shape) => structuredClone(shape))
    });
  }

  const selectionRectBounds = dragInfo?.mode === "select-rect"
    ? normalizeBounds(dragInfo.start, dragInfo.current)
    : null;

  return (
    <main className="scratch-canvas-panel">
      <svg
        ref={svgRef}
        viewBox={viewBox.value}
        className={
          eyedropperTarget
            ? "canvas eyedropper-mode"
            : tool === TOOL.ERASE
              ? "canvas eraser-mode"
              : "canvas"
        }
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          setEraserPosition(null);
          setEyedropperPreview(null);
          handlePointerUp();
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <rect x="-5000" y="-5000" width="10000" height="10000" fill="white" />

        {shapes.map((shape) => {
          if (shape.visible === false) return null;

          const lock = getLock(shape.id);
          const focus = getFocus(shape.id);
          const presence = lock || focus;

          return (
            <g
              key={shape.id}
              onDoubleClick={(event) => handleShapeDoubleClick(event, shape)}
              onPointerMove={(event) => updateEyedropperPreview(event, shape)}
            >
              <ShapeRenderer
                shape={shape}
                locked={Boolean(lock)}
                onPointerDown={(event) => handleShapePointerDown(event, shape)}
              />

              {presence && (
                <g pointerEvents="none">
                  <rect
                    x={getBoundingBox(shape).x}
                    y={getBoundingBox(shape).y - 28 / zoom}
                    width={
                      Math.max(
                        (presence.userName || "Používateľ").length * 9,
                        72
                      ) / zoom
                    }
                    height={22 / zoom}
                    rx={8 / zoom}
                    fill={presence.userColor || "#3b82f6"}
                    opacity="0.94"
                  />

                  <text
                    x={getBoundingBox(shape).x + 8 / zoom}
                    y={getBoundingBox(shape).y - 12 / zoom}
                    fill="white"
                    fontSize={13 / zoom}
                    fontWeight="800"
                  >
                    {presence.userName || "Používateľ"}
                  </text>

                  <rect
                    x={getBoundingBox(shape).x - 5 / zoom}
                    y={getBoundingBox(shape).y - 5 / zoom}
                    width={getBoundingBox(shape).w + 10 / zoom}
                    height={getBoundingBox(shape).h + 10 / zoom}
                    fill="none"
                    stroke={presence.userColor || "#3b82f6"}
                    strokeWidth={lock ? 3 / zoom : 2 / zoom}
                    strokeDasharray={
                      lock ? `${8 / zoom} ${5 / zoom}` : `${5 / zoom} ${4 / zoom}`
                    }
                  />
                </g>
              )}
            </g>
          );
        })}

        {draft?.type === "rect" && <ShapeRenderer shape={draft} preview />}
        {draft?.type === "ellipse" && <ShapeRenderer shape={draft} preview />}

        {draft?.type === "triangle-box" && (
          <ShapeRenderer shape={createTriangleFromDraft(draft, style)} preview />
        )}

        {draft?.type === "quad-box" && (
          <ShapeRenderer shape={createQuadFromDraft(draft, style)} preview />
        )}

        {draft?.type === "line" && <ShapeRenderer shape={draft} preview />}

        {selectionRectBounds && (
          <rect
            x={selectionRectBounds.x}
            y={selectionRectBounds.y}
            width={selectionRectBounds.w}
            height={selectionRectBounds.h}
            fill="rgba(133, 92, 214, 0.08)"
            stroke="#855cd6"
            strokeDasharray={`${6 / zoom} ${4 / zoom}`}
            strokeWidth={2 / zoom}
            pointerEvents="none"
          />
        )}

        {eyedropperTarget && eyedropperPreview && (
          <g pointerEvents="none">
            <circle
              cx={eyedropperPreview.x}
              cy={eyedropperPreview.y}
              r={12 / zoom}
              fill="white"
              stroke="#4c1d95"
              strokeWidth={2 / zoom}
            />

            <circle
              cx={eyedropperPreview.x}
              cy={eyedropperPreview.y}
              r={7 / zoom}
              fill={eyedropperPreview.color}
              stroke="#cbd5e1"
              strokeWidth={1 / zoom}
            />

            <line
              x1={eyedropperPreview.x - 18 / zoom}
              y1={eyedropperPreview.y}
              x2={eyedropperPreview.x + 18 / zoom}
              y2={eyedropperPreview.y}
              stroke="#4c1d95"
              strokeWidth={1.2 / zoom}
            />

            <line
              x1={eyedropperPreview.x}
              y1={eyedropperPreview.y - 18 / zoom}
              x2={eyedropperPreview.x}
              y2={eyedropperPreview.y + 18 / zoom}
              stroke="#4c1d95"
              strokeWidth={1.2 / zoom}
            />
          </g>
        )}

        <EditorCanvasSelectionControls
          tool={tool}
          zoom={zoom}
          selectedShape={selectedShape}
          selectedBounds={selectedBounds}
          selectedCenter={selectedCenter}
          selectedRotation={selectedRotation}
          selectedIds={normalizedSelectedIds}
          multiSelectionBounds={multiSelectionBounds}
          onStartPointDrag={startPointDrag}
          onStartRotationDrag={startRotationDrag}
          onStartScaleDrag={startScaleDrag}
          onStartMultiScaleDrag={startMultiScaleDrag}
        />

        <EditorCanvasTextEditor
          textEditor={textEditor}
          setTextEditor={setTextEditor}
          fill={fill}
          stroke={stroke}
          onConfirm={commitTextEditor}
          onCancel={cancelTextEditor}
        />

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
