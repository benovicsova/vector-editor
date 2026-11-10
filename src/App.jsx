import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import { COLOR_PALETTE, TOOL } from "./constants";
import { initialShapes } from "./data/initialShapes";

import Toolbar from "./components/Toolbar";
import EditorCanvas from "./components/EditorCanvas";
import ObjectsPanel from "./components/ObjectsPanel";
import RoomModal from "./components/RoomModal";
import ProjectNameModal from "./components/ProjectNameModal";

import { duplicateShape } from "./utils/geometry";
import { moveShapeByDelta } from "./utils/editorCanvasGeometry";
import { uid } from "./utils/geometry";
import { exportPng } from "./utils/exportProject";
import { exportSvg, parseProjectSvg } from "./utils/svgProject";
import { buildCanvasPatch, createOwnStep, applyOwnStep } from "./utils/collaborationHistory";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
const AUTOSAVE_KEY = "vector-editor:autosave:v2";

function readAutosave() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || "null");
    return parsed && Array.isArray(parsed.shapes) ? parsed : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [restoredProject] = useState(readAutosave);
  const [tool, setTool] = useState(TOOL.RECT);

  const [history, setHistory] = useState([restoredProject?.shapes || initialShapes]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const shapes = history[historyIndex];

  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const [fill, setFill] = useState("#855cd6");
  const [stroke, setStroke] = useState("#1f2937");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [recentColors, setRecentColors] = useState(COLOR_PALETTE);

  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState(32);

  const [projectName, setProjectName] = useState(restoredProject?.name || "");
  const [userName, setUserName] = useState("");

  const [zoom, setZoom] = useState(1);

  const [draft, setDraft] = useState(null);
  const [dragInfo, setDragInfo] = useState(null);

  const [roomId, setRoomId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const [lockedShapes, setLockedShapes] = useState([]);
  const [focusedShapes, setFocusedShapes] = useState([]);
  const [roomUsers, setRoomUsers] = useState([]);
  const [ownUndoCount, setOwnUndoCount] = useState(0);
  const [ownRedoCount, setOwnRedoCount] = useState(0);
  const [eyedropperTarget, setEyedropperTarget] = useState(null);
  const eyedropperTargetRef = useRef({ mode: null, ids: [] });

  const [roomModal, setRoomModal] = useState(null);
  const [joinInput, setJoinInput] = useState("");
  const [roomError, setRoomError] = useState("");
  const [userNameInput, setUserNameInput] = useState("");

  const [projectNameModal, setProjectNameModal] = useState(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");

  const [showObjectsPanel, setShowObjectsPanel] = useState(true);

  const socketRef = useRef(null);
  const roomIdRef = useRef("");
  const focusedShapeIdRef = useRef("");
  const selectionLockIdsRef = useRef([]);
  const shapesRef = useRef(shapes);
  const dragInfoRef = useRef(dragInfo);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const clipboardRef = useRef(null);
  const ownUndoRef = useRef([]);
  const ownRedoRef = useRef([]);
  const liveEditRef = useRef(null);

  const selectedShape = shapes.find((shape) => shape.id === selectedId) ?? null;

  const panelShapes = shapes.filter((shape) => {
    if (dragInfo?.mode === "pen-draw" && shape.id === dragInfo.shapeId) {
      return false;
    }

    return true;
  });

  useEffect(() => {
    shapesRef.current = shapes;
    dragInfoRef.current = dragInfo;
    historyRef.current = history;
    historyIndexRef.current = historyIndex;
  }, [shapes, dragInfo, history, historyIndex]);

  // Auto-save only the project data, never ephemeral locks or presence.
  useEffect(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        version: 2,
        name: projectName,
        shapes,
        savedAt: new Date().toISOString()
      }));
    } catch (error) {
      console.warn("Automatické uloženie nie je dostupné:", error);
    }
  }, [shapes, projectName]);

  useEffect(() => {
    if (!dragInfo) liveEditRef.current = null;
  }, [dragInfo]);

  useEffect(() => {
    if (!selectedShape) return;

    if (selectedShape.type === "pen" || selectedShape.type === "line") {
      setFill(selectedShape.fill || "none");
      setStroke(selectedShape.stroke || "#1f2937");
      setStrokeWidth(selectedShape.strokeWidth || 4);
      return;
    }

    if (selectedShape.type === "text") {
      setFill(selectedShape.fill || selectedShape.stroke || "#1f2937");
      setStroke(selectedShape.stroke || "#1f2937");
      setStrokeWidth(selectedShape.strokeWidth || 4);
      setFontFamily(selectedShape.fontFamily || "Arial");
      setFontSize(selectedShape.fontSize || 32);
      return;
    }

    setFill(selectedShape.fill || "none");
    setStroke(selectedShape.stroke || "#1f2937");
    setStrokeWidth(selectedShape.strokeWidth || 4);
  }, [selectedShape]);

  useEffect(() => {
    const socket = socketRef.current;
    const roomId = roomIdRef.current;

    const nextLockIds = Array.from(
      new Set([...(selectedIds || []), selectedId].filter(Boolean))
    );

    if (!socket || !roomId) {
      selectionLockIdsRef.current = nextLockIds;
      focusedShapeIdRef.current = nextLockIds[0] || "";
      return;
    }

    const previousLockIds = selectionLockIdsRef.current;

    for (const shapeId of previousLockIds) {
      if (!nextLockIds.includes(shapeId)) {
        socket.emit("shape-unlock", {
          roomId,
          shapeId
        });
      }
    }

    for (const shapeId of nextLockIds) {
      if (!previousLockIds.includes(shapeId)) {
        socket.emit(
          "shape-lock",
          {
            roomId,
            shapeId,
            userName: getCurrentUserName()
          },
          (response) => {
            if (!response?.success) {
              setSelectedIds((prev) => prev.filter((id) => id !== shapeId));
              setSelectedId((prev) => (prev === shapeId ? null : prev));
              setRoomError(
                response?.message || "Tento tvar práve drží iný používateľ."
              );
              setRoomModal({ type: "error" });
            }
          }
        );
      }
    }

    selectionLockIdsRef.current = nextLockIds;
    focusedShapeIdRef.current = nextLockIds[0] || "";
  }, [selectedId, selectedIds, roomId, userName]);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("online");
    });

    socket.on("disconnect", () => {
      setConnectionStatus("offline");
      setLockedShapes([]);
      setFocusedShapes([]);
      setRoomUsers([]);
      focusedShapeIdRef.current = "";
      selectionLockIdsRef.current = [];
    });

    socket.on("canvas-update", ({ shapes: remoteShapes }) => {
      if (!Array.isArray(remoteShapes)) return;

      const localEditingShapeId = dragInfoRef.current?.shapeId;
      const localShapes = shapesRef.current;

      let nextShapes = remoteShapes;

      if (localEditingShapeId) {
        const localShape = localShapes.find(
          (shape) => shape.id === localEditingShapeId
        );

        if (localShape) {
          const remoteHasShape = remoteShapes.some(
            (shape) => shape.id === localEditingShapeId
          );

          nextShapes = remoteShapes.map((shape) =>
            shape.id === localEditingShapeId ? localShape : shape
          );

          if (!remoteHasShape) {
            nextShapes = [...nextShapes, localShape];
          }
        }
      }

      shapesRef.current = nextShapes;
      historyRef.current = [nextShapes];
      historyIndexRef.current = 0;
      setHistory([nextShapes]);
      setHistoryIndex(0);
      setSelectedId((prev) =>
        prev && nextShapes.some((shape) => shape.id === prev) ? prev : null
      );
    });

    socket.on("user-joined", ({ users }) => {
      if (Array.isArray(users)) setRoomUsers(users);
    });

    socket.on("user-left", ({ users }) => {
      if (Array.isArray(users)) setRoomUsers(users);
    });

    socket.on("shape-locked", ({ shapeId, socketId, userName, userColor }) => {
      if (socketId && socketId === socket.id) return;

      setLockedShapes((prev) => {
        const nextLock = {
          shapeId,
          socketId,
          userName: userName || "Používateľ",
          userColor: userColor || "#ef4444"
        };

        if (prev.some((item) => item.shapeId === shapeId)) {
          return prev.map((item) => (item.shapeId === shapeId ? nextLock : item));
        }

        return [...prev, nextLock];
      });
    });

    socket.on("shape-unlocked", ({ shapeId }) => {
      setLockedShapes((prev) => prev.filter((item) => item.shapeId !== shapeId));
    });

    socket.on("shape-focused", ({ shapeId, socketId, userName, userColor }) => {
      if (socketId && socketId === socket.id) return;

      setFocusedShapes((prev) => {
        const nextFocus = {
          shapeId,
          socketId,
          userName: userName || "Používateľ",
          userColor: userColor || "#3b82f6"
        };

        if (prev.some((item) => item.shapeId === shapeId)) {
          return prev.map((item) =>
            item.shapeId === shapeId ? nextFocus : item
          );
        }

        return [...prev, nextFocus];
      });
    });

    socket.on("shape-blurred", ({ shapeId }) => {
      setFocusedShapes((prev) =>
        prev.filter((item) => item.shapeId !== shapeId)
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target;

      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      const key = event.key.toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;

      // Uloženie funguje aj vtedy, keď je kurzor v políčku názvu projektu.
      if (ctrlOrMeta && key === "s") {
        event.preventDefault();
        handleExportPng();
        return;
      }

      if (isTyping) return;

      // Ctrl/Cmd + A: označí všetky viditeľné objekty na plátne.
      // Pri zoskupených tvaroch normalizeSelection zachová celú skupinu.
      if (ctrlOrMeta && key === "a") {
        event.preventDefault();
        if (event.repeat) return;

        const allVisibleIds = shapesRef.current
          .filter((shape) => shape.visible !== false)
          .map((shape) => shape.id);

        normalizeSelection(allVisibleIds);
        setTool(TOOL.SELECT);
        return;
      }

      // Posúvanie označených objektov šípkami. Shift = väčší krok.
      // Nemeníme správanie šípok v textových poliach ani skratky prehliadača.
      if (!ctrlOrMeta && !event.altKey && [
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"
      ].includes(event.key)) {
        const ids = getCurrentSelectionIds();
        if (ids.length === 0) return;

        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step
          : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step
          : event.key === "ArrowDown" ? step : 0;
        moveSelectedWithKeyboard(dx, dy);
        return;
      }

      if (ctrlOrMeta && key === "z") {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }

        return;
      }

      if (ctrlOrMeta && key === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (ctrlOrMeta && key === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }

      if (ctrlOrMeta && (key === "c" || key === "x")) {
        const ids = selectedIds.length > 0
          ? selectedIds
          : selectedId ? [selectedId] : [];
        const selected = shapesRef.current.filter((shape) => ids.includes(shape.id));
        if (!selected.length) return;

        event.preventDefault();

        // With Cut, never copy/delete another participant's locked object.
        if (key === "x" && selected.some((shape) => isShapeLocked(shape.id))) {
          return;
        }

        clipboardRef.current = structuredClone(selected);
        if (key === "x") deleteSelected();
        return;
      }

      if (ctrlOrMeta && key === "v") {
        event.preventDefault();
        pasteShape();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedId) return;

        event.preventDefault();
        deleteSelected();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedId, selectedIds, lockedShapes, selectedShape, shapes, projectName]);

  function getCurrentUserName() {
    return userName.trim() || "Používateľ";
  }

  function rememberColor(color) {
    if (!color || color === "none") return;

    setRecentColors((prev) => {
      if (prev.includes(color)) {
        return prev;
      }

      const baseColors = prev.length > 0 ? prev : COLOR_PALETTE;
      return [...baseColors.slice(1), color].slice(0, 5);
    });
  }

  function clearSelection() {
    setSelectedId(null);
    setSelectedIds([]);
  }

  function normalizeSelection(ids) {
    const uniqueIds = new Set(ids.filter(Boolean));
    const grouped = new Set(shapesRef.current
      .filter((shape) => uniqueIds.has(shape.id) && shape.groupId)
      .map((shape) => shape.groupId));
    for (const shape of shapesRef.current) {
      if (shape.groupId && grouped.has(shape.groupId)) uniqueIds.add(shape.id);
    }
    const nextIds = [...uniqueIds];
    setSelectedIds(nextIds);
    setSelectedId(nextIds[0] || null);
  }

  function getShapeLock(shapeId) {
    return lockedShapes.find((item) => item.shapeId === shapeId) ?? null;
  }

  function isOwnPresence(item) {
    return Boolean(item?.socketId && socketRef.current?.id === item.socketId);
  }

  function isShapeLocked(shapeId) {
    const lock = getShapeLock(shapeId);

    if (!lock) return false;

    return !isOwnPresence(lock);
  }

  function filterOwnPresence(items = []) {
    return items.filter((item) => !isOwnPresence(item));
  }

  function setLocalShapeLock(lock) {
    if (!lock?.shapeId) return;

    setLockedShapes((prev) => {
      const nextLock = {
        shapeId: lock.shapeId,
        socketId: lock.socketId,
        userName: lock.userName || getCurrentUserName(),
        userColor: lock.userColor || "#855cd6"
      };

      if (prev.some((item) => item.shapeId === lock.shapeId)) {
        return prev.map((item) =>
          item.shapeId === lock.shapeId ? nextLock : item
        );
      }

      return [...prev, nextLock];
    });
  }

  function removeLocalShapeLock(shapeId) {
    setLockedShapes((prev) => prev.filter((item) => item.shapeId !== shapeId));
  }

  function syncShapes(nextShapes, beforeShapes) {
    if (!roomIdRef.current || !socketRef.current) return;
    const patch = buildCanvasPatch(beforeShapes, nextShapes);
    if (!patch) return;
    socketRef.current.emit("canvas-update", {
      roomId: roomIdRef.current,
      patch
    });
  }

  function updateHistoryControls() {
    setOwnUndoCount(ownUndoRef.current.length);
    setOwnRedoCount(ownRedoRef.current.length);
  }

  function recordOwnStep(before, after, updatingLive = false) {
    const delta = createOwnStep(before, after);
    if (!delta) return;

    if (updatingLive && liveEditRef.current?.step) {
      // Merge only the IDs changed in THIS local pointer update. This avoids
      // accidentally recording a collaborator's concurrent modification.
      const combined = new Map(
        liveEditRef.current.step.entries.map((entry) => [entry.id, entry])
      );
      for (const entry of delta.entries) {
        const previous = combined.get(entry.id);
        combined.set(entry.id, {
          id: entry.id,
          before: previous?.before ?? entry.before,
          after: entry.after
        });
      }
      const updated = { entries: [...combined.values()] };
      liveEditRef.current.step = updated;
      ownUndoRef.current[ownUndoRef.current.length - 1] = updated;
    } else {
      ownUndoRef.current.push(delta);
      if (ownUndoRef.current.length > 100) ownUndoRef.current.shift();
      ownRedoRef.current = [];
      if (updatingLive && liveEditRef.current) {
        liveEditRef.current.step = delta;
      }
    }
    updateHistoryControls();
  }

  function applyCanvasState(nextShapes, beforeShapes, shouldSync = true) {
    shapesRef.current = nextShapes;
    historyRef.current = [nextShapes];
    historyIndexRef.current = 0;
    setHistory([nextShapes]);
    setHistoryIndex(0);
    if (shouldSync) syncShapes(nextShapes, beforeShapes);
  }

  function commitShapes(nextShapes, shouldSync = true) {
    const before = shapesRef.current;
    // Gesture starts: keep one undo record for the entire drag operation.
    if (nextShapes === before) {
      liveEditRef.current = { before: structuredClone(before), step: null };
      return;
    }
    liveEditRef.current = null;
    recordOwnStep(before, nextShapes);
    applyCanvasState(nextShapes, before, shouldSync);
  }

  function setShapesDirect(updater) {
    const before = shapesRef.current;
    const after = typeof updater === "function" ? updater(before) : updater;
    commitShapes(after);
  }

  function setShapesLive(updater) {
    const before = shapesRef.current;
    const after = typeof updater === "function" ? updater(before) : updater;
    if (before === after) return;
    recordOwnStep(before, after, Boolean(liveEditRef.current));
    applyCanvasState(after, before);
  }

  function handleToolChange(nextTool) {
    setTool(nextTool);
    setEyedropperTarget(null);

    if (nextTool !== TOOL.SELECT) {
      clearSelection();
    }
  }

  function lockShape(shapeId, onSuccess) {
    if (!shapeId) return;

    if (!roomIdRef.current || !socketRef.current) {
      onSuccess?.();
      return;
    }

    const existingLock = getShapeLock(shapeId);

    if (existingLock) {
      setRoomError(`Tento tvar práve upravuje ${existingLock.userName}.`);
      setRoomModal({ type: "error" });
      return;
    }

    socketRef.current.emit(
      "shape-lock",
      {
        roomId: roomIdRef.current,
        shapeId,
        userName: getCurrentUserName()
      },
      (response) => {
        if (!response?.success) {
          setRoomError(
            response?.message || "Tento tvar práve upravuje iný používateľ."
          );
          setRoomModal({ type: "error" });
          return;
        }

        onSuccess?.(response);
      }
    );
  }

  function unlockShape(shapeId) {
    if (!shapeId) return;

    removeLocalShapeLock(shapeId);

    if (!roomIdRef.current || !socketRef.current) return;

    socketRef.current.emit("shape-unlock", {
      roomId: roomIdRef.current,
      shapeId
    });
  }

  function updateSelectedShapeStyle(property, value, forcedIds = null) {
    const idsToUpdate = Array.isArray(forcedIds) && forcedIds.length > 0
      ? forcedIds
      : selectedIds.length > 0
        ? selectedIds
        : selectedId
          ? [selectedId]
          : [];

    if (idsToUpdate.length === 0) return;
    if (idsToUpdate.some((id) => isShapeLocked(id))) return;

    setShapesDirect((prev) =>
      prev.map((shape) => {
        if (!idsToUpdate.includes(shape.id)) return shape;

        if (property === "fill") {
          if (shape.type === "line") {
            if (value === "none") return shape;
            return {
              ...shape,
              stroke: value
            };
          }

          if (shape.type === "pen") {
            const first = shape.points?.[0];
            const last = shape.points?.[shape.points.length - 1];
            const isClosed =
              first &&
              last &&
              shape.points?.length >= 3 &&
              Math.hypot(first.x - last.x, first.y - last.y) <= 20;

            if (!isClosed) {
              if (value === "none") return shape;
              return {
                ...shape,
                stroke: value
              };
            }

            return {
              ...shape,
              fill: value
            };
          }

          if (shape.type === "text") {
            if (value === "none") return shape;
            return {
              ...shape,
              fill: value
            };
          }

          return {
            ...shape,
            fill: value
          };
        }

        if (property === "stroke") {
          return {
            ...shape,
            stroke: value
          };
        }

        return {
          ...shape,
          [property]: value
        };
      })
    );
  }

  function getCurrentSelectionIds() {
    if (selectedIds.length > 0) return selectedIds;
    if (selectedId) return [selectedId];
    return [];
  }

  function moveSelectedWithKeyboard(dx, dy) {
    const initialIds = getCurrentSelectionIds();
    if (!initialIds.length) return;

    // Ak je označený člen skupiny, posunieme celú skupinu.
    const ids = new Set(initialIds);
    const groupIds = new Set(
      shapesRef.current
        .filter((shape) => ids.has(shape.id) && shape.groupId)
        .map((shape) => shape.groupId)
    );
    for (const shape of shapesRef.current) {
      if (shape.groupId && groupIds.has(shape.groupId)) ids.add(shape.id);
    }

    // V spoločnej miestnosti nesmieme posunúť ani časť skupiny,
    // keď jej niektorý objekt vlastní iný používateľ.
    if ([...ids].some((id) => isShapeLocked(id))) return;

    setShapesDirect((previousShapes) => previousShapes.map((shape) =>
      ids.has(shape.id) ? moveShapeByDelta(shape, dx, dy) : shape
    ));
  }

  function handleStartEyedropper(mode) {
    if (!mode) {
      eyedropperTargetRef.current = { mode: null, ids: [] };
      setEyedropperTarget(null);
      return;
    }

    const ids = getCurrentSelectionIds();

    eyedropperTargetRef.current = {
      mode,
      ids
    };

    setEyedropperTarget(mode);
  }

  function getColorFromShapeForEyedropper(shape) {
    if (!shape) return null;

    if (shape.type === "line") {
      return shape.stroke && shape.stroke !== "none" ? shape.stroke : null;
    }

    if (shape.type === "pen") {
      const first = shape.points?.[0];
      const last = shape.points?.[shape.points.length - 1];
      const isClosed =
        first &&
        last &&
        shape.points?.length >= 3 &&
        Math.hypot(first.x - last.x, first.y - last.y) <= 20;

      if (isClosed && shape.fill && shape.fill !== "none") return shape.fill;
      if (shape.stroke && shape.stroke !== "none") return shape.stroke;
      return null;
    }

    if (shape.fill && shape.fill !== "none") return shape.fill;
    if (shape.stroke && shape.stroke !== "none") return shape.stroke;

    return null;
  }

  function handlePickColorFromShape(shape, pickedColorFromPoint) {
    const target = eyedropperTargetRef.current;
    const targetMode = target.mode || eyedropperTarget;
    const targetIds = target.ids?.length ? target.ids : getCurrentSelectionIds();

    if (!targetMode) return;

    const pickedColor = pickedColorFromPoint || getColorFromShapeForEyedropper(shape);

    if (!pickedColor || pickedColor === "none") {
      handleStartEyedropper(null);
      return;
    }

    if (targetMode === "stroke") {
      handleStrokeChange(pickedColor, { ids: targetIds });
    } else {
      handleFillChange(pickedColor, { ids: targetIds });
    }

    handleStartEyedropper(null);
  }

  function updateSelectedTextTypography(property, value) {
    if (!selectedId || selectedShape?.type !== "text") return;
    if (isShapeLocked(selectedId)) return;

    lockShape(selectedId, () => {
      setShapesDirect((prev) =>
        prev.map((shape) =>
          shape.id === selectedId
            ? {
                ...shape,
                [property]: value
              }
            : shape
        )
      );

      unlockShape(selectedId);
    });
  }

  function handleFillChange(nextFill, options = {}) {
    setFill(nextFill);

    if (options.remember !== false && nextFill !== "none") {
      rememberColor(nextFill);
    }

    updateSelectedShapeStyle("fill", nextFill, options.ids);
  }

  function handleStrokeChange(nextStroke, options = {}) {
    setStroke(nextStroke);

    if (options.remember !== false && nextStroke !== "none") {
      rememberColor(nextStroke);
    }

    updateSelectedShapeStyle("stroke", nextStroke, options.ids);
  }

  function handleStrokeWidthChange(nextStrokeWidth) {
    const normalizedStrokeWidth = Math.max(1, Number(nextStrokeWidth) || 1);

    setStrokeWidth(normalizedStrokeWidth);
    updateSelectedShapeStyle("strokeWidth", normalizedStrokeWidth);
  }

  function handleFontFamilyChange(nextFontFamily) {
    setFontFamily(nextFontFamily);
    updateSelectedTextTypography("fontFamily", nextFontFamily);
  }

  function handleFontSizeChange(nextFontSize) {
    const normalizedFontSize = Math.max(8, Number(nextFontSize) || 8);

    setFontSize(normalizedFontSize);
    updateSelectedTextTypography("fontSize", normalizedFontSize);
  }

  function createRoom() {
    setRoomError("");
    setUserNameInput(userName || "");
    setRoomModal({ type: "create" });
  }

  function confirmCreateRoom() {
    const normalizedUserName = userNameInput.trim();

    if (!normalizedUserName) {
      setRoomError("Zadaj svoje meno.");
      return;
    }

    setUserName(normalizedUserName);

    if (!socketRef.current) {
      setRoomError("Server nie je dostupný.");
      setRoomModal({ type: "error" });
      return;
    }

    socketRef.current.emit(
      "create-room",
      {
        shapes,
        userName: normalizedUserName
      },
      (response) => {
        if (!response?.success) {
          setRoomError("Miestnosť sa nepodarilo vytvoriť.");
          setRoomModal({ type: "error" });
          return;
        }

        setRoomId(response.roomId);
        roomIdRef.current = response.roomId;
        setLockedShapes(filterOwnPresence(response.lockedShapes ?? []));
        setFocusedShapes(filterOwnPresence(response.focusedShapes ?? []));
        setRoomUsers(Array.isArray(response.users) ? response.users : []);
        ownUndoRef.current = [];
        ownRedoRef.current = [];
        liveEditRef.current = null;
        updateHistoryControls();

        setRoomModal({
          type: "created",
          roomId: response.roomId
        });
      }
    );
  }

  function openJoinRoomModal() {
    setJoinInput("");
    setUserNameInput(userName || "");
    setRoomError("");
    setRoomModal({ type: "join" });
  }

  function joinRoom() {
    const normalizedRoomId = joinInput.trim();
    const normalizedUserName = userNameInput.trim();

    setRoomError("");

    if (!normalizedUserName) {
      setRoomError("Zadaj svoje meno.");
      return;
    }

    if (!/^\d{4}$/.test(normalizedRoomId)) {
      setRoomError("ID miestnosti musí byť 4-ciferné číslo.");
      return;
    }

    if (!socketRef.current) {
      setRoomError("Server nie je dostupný.");
      return;
    }

    setUserName(normalizedUserName);

    socketRef.current.emit(
      "join-room",
      {
        roomId: normalizedRoomId,
        userName: normalizedUserName
      },
      (response) => {
        if (!response?.success) {
          setRoomError(response?.message || "Nepodarilo sa pripojiť k miestnosti.");
          return;
        }

        setRoomId(response.roomId);
        roomIdRef.current = response.roomId;
        setLockedShapes(filterOwnPresence(response.lockedShapes ?? []));
        setFocusedShapes(filterOwnPresence(response.focusedShapes ?? []));
        setRoomUsers(Array.isArray(response.users) ? response.users : []);
        ownUndoRef.current = [];
        ownRedoRef.current = [];
        liveEditRef.current = null;
        updateHistoryControls();

        if (Array.isArray(response.shapes)) {
          setHistory([response.shapes]);
          setHistoryIndex(0);
          historyRef.current = [response.shapes];
          historyIndexRef.current = 0;
          shapesRef.current = response.shapes;
          clearSelection();
          setDraft(null);
          setDragInfo(null);
        }

        setRoomModal({
          type: "joined",
          roomId: response.roomId
        });
      }
    );
  }

  function closeRoomModal() {
    setRoomModal(null);
    setRoomError("");
  }

  function performOwnHistory(direction) {
    liveEditRef.current = null;
    const source = direction === "undo" ? ownUndoRef.current : ownRedoRef.current;
    const destination = direction === "undo" ? ownRedoRef.current : ownUndoRef.current;
    if (source.length === 0) return;

    const step = source.pop();
    const before = shapesRef.current;
    // Vlastný výber býva tiež zamknutý na serveri, ale nesmie blokovať
    // vlastné undo/redo. Blokujeme iba zámky cudzích používateľov.
    const lockedIds = new Set(
      lockedShapes
        .filter((item) => !isOwnPresence(item))
        .map((item) => item.shapeId)
    );
    const result = applyOwnStep(before, step, direction, lockedIds);

    if (!result.changed) {
      // A collaborator changed/locked the affected object. Do not overwrite it.
      updateHistoryControls();
      return;
    }

    destination.push(step);
    updateHistoryControls();
    applyCanvasState(result.shapes, before);
    clearSelection();
  }

  // A group is a shared groupId on the original objects. Nothing is flattened,
  // so SVG/PNG export and collaboration continue to use the original shapes.
  function groupSelected() {
    const ids = getCurrentSelectionIds();
    if (ids.length < 2 || ids.some((id) => isShapeLocked(id))) return;

    // Do not detach a member from an existing group accidentally.
    const expanded = new Set(ids);
    for (const shape of shapesRef.current) {
      if (expanded.has(shape.id) && shape.groupId) {
        for (const peer of shapesRef.current) {
          if (peer.groupId === shape.groupId) expanded.add(peer.id);
        }
      }
    }
    if ([...expanded].some((id) => isShapeLocked(id))) return;

    const groupId = `group-${uid()}`;
    setShapesDirect((prev) => prev.map((shape) =>
      expanded.has(shape.id) ? { ...shape, groupId } : shape
    ));
    normalizeSelection([...expanded]);
    setTool(TOOL.SELECT);
  }

  function ungroupSelected() {
    const ids = getCurrentSelectionIds();
    const groups = new Set(shapesRef.current
      .filter((shape) => ids.includes(shape.id) && shape.groupId)
      .map((shape) => shape.groupId));
    if (!groups.size) return;
    const affected = shapesRef.current.filter((shape) => groups.has(shape.groupId));
    if (affected.some((shape) => isShapeLocked(shape.id))) return;

    setShapesDirect((prev) => prev.map((shape) => {
      if (!groups.has(shape.groupId)) return shape;
      const { groupId, ...ungroupedShape } = shape;
      return ungroupedShape;
    }));
    normalizeSelection(affected.map((shape) => shape.id));
    setTool(TOOL.SELECT);
  }

  function undo() {
    performOwnHistory("undo");
  }

  function redo() {
    performOwnHistory("redo");
  }

  function zoomIn() {
    setZoom((prev) => Math.min(prev + 0.25, 4));
  }

  function zoomOut() {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }

  function resetZoom() {
    setZoom(1);
  }

  // Duplikáty majú vlastné ID a sú voči originálom posunuté o 12 jednotiek
  // plátna. Funguje to rovnako pre tvary s x/y aj pre cesty s bodmi.
  function makeOffsetCopy(shape, offset = 12) {
    const copy = duplicateShape(shape);

    if (typeof shape.x === "number") copy.x = shape.x + offset;
    if (typeof shape.y === "number") copy.y = shape.y + offset;

    if (Array.isArray(shape.points)) {
      copy.points = shape.points.map((point) => ({
        ...point,
        x: point.x + offset,
        y: point.y + offset
      }));
    }

    return copy;
  }

  function duplicateSelected() {
    const ids = getCurrentSelectionIds();
    if (!ids.length) return;

    const originals = shapesRef.current.filter((shape) => ids.includes(shape.id));
    if (!originals.length || originals.some((shape) => isShapeLocked(shape.id))) return;

    const copiedGroupIds = new Map();
    const copies = originals.map((shape) => {
      const copy = makeOffsetCopy(shape);
      copy.name = shape.name ? `${shape.name} kópia` : undefined;

      if (shape.groupId) {
        if (!copiedGroupIds.has(shape.groupId)) {
          copiedGroupIds.set(shape.groupId, `group-${uid()}`);
        }
        copy.groupId = copiedGroupIds.get(shape.groupId);
      } else {
        delete copy.groupId;
      }

      return copy;
    });

    // Jeden zápis znamená jeden vlastný krok v histórii Undo/Redo.
    setShapesDirect((prev) => [...prev, ...copies]);
    normalizeSelection(copies.map((shape) => shape.id));
    setTool(TOOL.SELECT);
  }

  function duplicateShapeById(shapeId) {
    const shape = shapesRef.current.find((item) => item.id === shapeId);
    if (!shape || isShapeLocked(shapeId)) return;

    // Duplikovanie tlačidlom vrstvy duplikuje len daný objekt.
    const copy = makeOffsetCopy(shape);
    delete copy.groupId;
    copy.name = shape.name ? `${shape.name} kópia` : undefined;

    setShapesDirect((prev) => [...prev, copy]);
    normalizeSelection([copy.id]);
    setTool(TOOL.SELECT);
  }

  function pasteShape() {
    if (!clipboardRef.current) return;

    const originals = Array.isArray(clipboardRef.current)
      ? clipboardRef.current
      : [clipboardRef.current];
    if (originals.length === 0) return;

    // Keep a full copy of each original object. Each paste creates fresh IDs
    // and moves the entire selection by the same offset.
    const copiedGroupIds = new Map();
    const copies = originals.map((shape) => {
      const copy = duplicateShape(shape);
      if (shape.groupId) {
        if (!copiedGroupIds.has(shape.groupId)) copiedGroupIds.set(shape.groupId, `group-${uid()}`);
        copy.groupId = copiedGroupIds.get(shape.groupId);
      }
      return copy;
    });
    setShapesDirect((prev) => [...prev, ...copies]);
    clipboardRef.current = structuredClone(copies);
    normalizeSelection(copies.map((shape) => shape.id));
    setTool(TOOL.SELECT);
  }

  function deleteSelected() {
    const idsToDelete = selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [];
    if (!idsToDelete.length) return;
    const allowedIds = shapesRef.current
      .filter((shape) => idsToDelete.includes(shape.id) && !isShapeLocked(shape.id))
      .map((shape) => shape.id).reverse();

    // Record EACH deletion as a separate own undo operation.
    for (const shapeId of allowedIds) {
      setShapesDirect((prev) => prev.filter((shape) => shape.id !== shapeId));
    }
    clearSelection();
  }

  function deleteShapeById(shapeId) {
    if (!shapeId) return;
    if (isShapeLocked(shapeId)) return;

    lockShape(shapeId, () => {
      setShapesDirect((prev) => prev.filter((shape) => shape.id !== shapeId));
      unlockShape(shapeId);

      if (selectedId === shapeId || selectedIds.includes(shapeId)) {
        setSelectedIds((prev) => prev.filter((id) => id !== shapeId));
        if (selectedId === shapeId) setSelectedId(null);
      }
    });
  }

  function moveLayer(direction) {
    if (!selectedShape) return;
    moveLayerById(selectedShape.id, direction);
  }

  function moveLayerById(shapeId, direction) {
    if (!shapeId) return;
    if (isShapeLocked(shapeId)) return;

    const previousSelectedId = shapeId;

    lockShape(shapeId, () => {
      const currentShapes = shapesRef.current;
      const index = currentShapes.findIndex((shape) => shape.id === shapeId);
      const swapIndex = direction === "up" ? index + 1 : index - 1;

      if (swapIndex < 0 || swapIndex >= currentShapes.length) {
        unlockShape(shapeId);
        setSelectedId(previousSelectedId);
        setTool(TOOL.SELECT);
        return;
      }

      const next = [...currentShapes];
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];

      setShapesDirect(next);

      requestAnimationFrame(() => {
        setSelectedId(previousSelectedId);
        setTool(TOOL.SELECT);
      });

      unlockShape(shapeId);
    });
  }

  function moveLayerToExtreme(direction) {
    if (!selectedShape) return;
    moveLayerToExtremeById(selectedShape.id, direction);
  }

  function moveLayerToExtremeById(shapeId, direction) {
    if (!shapeId) return;
    if (isShapeLocked(shapeId)) return;

    const previousSelectedId = shapeId;

    lockShape(shapeId, () => {
      const currentShapes = [...shapesRef.current];
      const index = currentShapes.findIndex((shape) => shape.id === shapeId);

      if (index < 0) {
        unlockShape(shapeId);
        setSelectedId(previousSelectedId);
        setTool(TOOL.SELECT);
        return;
      }

      const [item] = currentShapes.splice(index, 1);

      if (direction === "front") {
        currentShapes.push(item);
      } else {
        currentShapes.unshift(item);
      }

      setShapesDirect(currentShapes);

      requestAnimationFrame(() => {
        setSelectedId(previousSelectedId);
        setTool(TOOL.SELECT);
      });

      unlockShape(shapeId);
    });
  }

  function reorderLayers(draggedId, targetId, insertAfter = false) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    if (isShapeLocked(draggedId) || isShapeLocked(targetId)) return;

    setShapesDirect((prev) => {
      const from = prev.findIndex((shape) => shape.id === draggedId);
      if (from < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      const to = next.findIndex((shape) => shape.id === targetId);
      if (to < 0) return prev;
      // The panel shows layers in reverse order (frontmost first).
      next.splice(to + (insertAfter ? 0 : 1), 0, moved);
      return next;
    });
  }

  function toggleVisible() {
    if (!selectedShape) return;
    toggleShapeVisibleFromPanel(selectedShape.id);

    if (selectedShape.visible !== false) {
      setSelectedId(null);
      setShowObjectsPanel(true);
    }
  }

  function toggleShapeVisibleFromPanel(shapeId) {
    const shape = shapesRef.current.find((item) => item.id === shapeId);
    if (!shape) return;
    if (isShapeLocked(shapeId)) return;

    lockShape(shapeId, () => {
      setShapesDirect((prev) =>
        prev.map((item) =>
          item.id === shapeId ? { ...item, visible: item.visible === false } : item
        )
      );

      requestAnimationFrame(() => {
        setSelectedId(shapeId);
        setTool(TOOL.SELECT);
      });

      unlockShape(shapeId);
    });
  }

  function renameShapeFromPanel(shapeId, nextName) {
    if (isShapeLocked(shapeId)) return;
    setShapesLive((prev) =>
      prev.map((shape) =>
        shape.id === shapeId
          ? {
              ...shape,
              name: nextName
            }
          : shape
      )
    );
  }

  function selectShapeFromPanel(shapeId) {
    const shape = shapesRef.current.find((item) => item.id === shapeId);
    if (!shape) return;

    if (shape.visible === false) {
      setShapesDirect((prev) =>
        prev.map((item) =>
          item.id === shapeId ? { ...item, visible: true } : item
        )
      );
    }

    normalizeSelection([shapeId]);
    setTool(TOOL.SELECT);
  }

  function focusPanelInput(shapeId) {
    if (isShapeLocked(shapeId)) return;
    normalizeSelection([shapeId]);
    setTool(TOOL.SELECT);
  }

  function getShapeDefaultLabel(shape, index) {
    const number = index + 1;

    if (shape.type === "rect") return `Obdĺžnik ${number}`;
    if (shape.type === "ellipse") return `Elipsa ${number}`;
    if (shape.type === "triangle") return `Trojuholník ${number}`;
    if (shape.type === "quad") return `Štvoruholník ${number}`;
    if (shape.type === "line") return `Čiara ${number}`;
    if (shape.type === "pen") return `Kresba ${number}`;
    if (shape.type === "text") return `Text ${number}`;

    return `Objekt ${number}`;
  }

  function handleExportPng() {
    const normalizedName = projectName.trim();

    if (!normalizedName) {
      setProjectNameDraft("");
      setProjectNameModal({ action: "png" });
      return;
    }

    exportPng({
      shapes,
      projectName: normalizedName
    });
  }

  function handleExportSvg() {
    const normalizedName = projectName.trim();

    if (!normalizedName) {
      setProjectNameDraft("");
      setProjectNameModal({ action: "svg" });
      return;
    }

    exportSvg({ shapes, projectName: normalizedName });
  }

  function confirmProjectNameModal() {
    const normalizedName = projectNameDraft.trim() || "projekt";

    setProjectName(normalizedName);
    setProjectNameModal(null);

    if (projectNameModal?.action === "png") {
      exportPng({
        shapes,
        projectName: normalizedName
      });
    }

    if (projectNameModal?.action === "svg") {
      exportSvg({ shapes, projectName: normalizedName });
    }
  }

  async function handleImportSvg(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const result = parseProjectSvg(await file.text());
      if (roomIdRef.current && !window.confirm("Načítaním SVG nahradíš spoločné plátno v aktuálnej miestnosti. Pokračovať?")) return;
      if (result.warnings.length > 0) {
        const accepted = window.confirm(
          `Niektoré prvky SVG nie sú podporované a pri importe sa vynechajú:\n` +
          result.warnings.slice(0, 5).join("\n") +
          `\n\nChceš importovať iba podporované objekty?`
        );
        if (!accepted) return;
      }

      // Load only after successful parse and explicit confirmation.
      ownUndoRef.current = [];
      ownRedoRef.current = [];
      liveEditRef.current = null;
      updateHistoryControls();
      commitShapes(result.shapes);
      setProjectName(result.name || file.name.replace(/\.svg$/i, ""));
      clearSelection();
      setDraft(null);
      setDragInfo(null);
      setShowObjectsPanel(true);
    } catch (error) {
      console.error("Import SVG zlyhal:", error);
      alert(error?.message || "Import SVG súboru zlyhal.");
    }
  }

  return (
    <div className="scratch-app">
      <Toolbar
        tool={tool}
        setTool={handleToolChange}
        fill={fill}
        setFill={handleFillChange}
        stroke={stroke}
        setStroke={handleStrokeChange}
        recentColors={recentColors}
        strokeWidth={strokeWidth}
        setStrokeWidth={handleStrokeWidthChange}
        eyedropperTarget={eyedropperTarget}
        onStartEyedropper={handleStartEyedropper}
        fontFamily={fontFamily}
        setFontFamily={handleFontFamilyChange}
        fontSize={fontSize}
        setFontSize={handleFontSizeChange}
        projectName={projectName}
        setProjectName={setProjectName}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onImportSvg={handleImportSvg}
        onUndo={undo}
        onRedo={redo}
        onGroup={groupSelected}
        onUngroup={ungroupSelected}
        canGroup={getCurrentSelectionIds().length > 1 && getCurrentSelectionIds().every((id) => !isShapeLocked(id))}
        canUngroup={getCurrentSelectionIds().some((id) => shapes.some((shape) => shape.id === id && shape.groupId))}
        canUndo={ownUndoCount > 0}
        canRedo={ownRedoCount > 0}
        selectedShape={selectedShape}
        onDuplicate={duplicateSelected}
        onDelete={deleteSelected}
        onMoveForward={() => moveLayer("up")}
        onMoveBackward={() => moveLayer("down")}
        onBringToFront={() => moveLayerToExtreme("front")}
        onSendToBack={() => moveLayerToExtreme("back")}
        onToggleVisible={toggleVisible}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        roomId={roomId}
        onCreateRoom={createRoom}
        onJoinRoom={openJoinRoomModal}
        connectionStatus={connectionStatus}
        roomUsers={roomUsers}
        currentSocketId={socketRef.current?.id}
        showObjectsPanel={showObjectsPanel}
        onToggleObjectsPanel={() => setShowObjectsPanel((prev) => !prev)}
      />

      <ObjectsPanel
        showObjectsPanel={showObjectsPanel}
        setShowObjectsPanel={setShowObjectsPanel}
        panelShapes={panelShapes}
        selectedId={selectedId}
        getShapeDefaultLabel={getShapeDefaultLabel}
        onSelectShape={selectShapeFromPanel}
        onRenameShape={renameShapeFromPanel}
        onToggleVisible={toggleShapeVisibleFromPanel}
        onDuplicateShape={duplicateShapeById}
        onDeleteShape={deleteShapeById}
        onMoveLayer={moveLayerById}
        onMoveLayerToExtreme={moveLayerToExtremeById}
        onReorderLayers={reorderLayers}
        lockedShapeIds={lockedShapes.map((lock) => lock.shapeId)}
        onFocusInput={focusPanelInput}
      />

      <EditorCanvas
        tool={tool}
        setTool={handleToolChange}
        shapes={shapes}
        setShapes={setShapesDirect}
        setShapesLive={setShapesLive}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fontFamily={fontFamily}
        fontSize={fontSize}
        draft={draft}
        setDraft={setDraft}
        dragInfo={dragInfo}
        setDragInfo={setDragInfo}
        zoom={zoom}
        setZoom={setZoom}
        lockedShapes={lockedShapes}
        focusedShapes={focusedShapes}
        lockShape={lockShape}
        unlockShape={unlockShape}
        eyedropperTarget={eyedropperTarget}
        onPickColorFromShape={handlePickColorFromShape}
      />

      <RoomModal
        roomModal={roomModal}
        joinInput={joinInput}
        setJoinInput={setJoinInput}
        userNameInput={userNameInput}
        setUserNameInput={setUserNameInput}
        roomError={roomError}
        setRoomError={setRoomError}
        onCreateConfirm={confirmCreateRoom}
        onJoinConfirm={joinRoom}
        onClose={closeRoomModal}
      />

      {projectNameModal && (
        <ProjectNameModal
          value={projectNameDraft}
          setValue={setProjectNameDraft}
          onConfirm={confirmProjectNameModal}
          onCancel={() => setProjectNameModal(null)}
        />
      )}
    </div>
  );
}
