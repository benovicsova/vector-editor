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
import { exportJson, exportPng } from "./utils/exportProject";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

export default function App() {
  const [tool, setTool] = useState(TOOL.RECT);

  const [history, setHistory] = useState([initialShapes]);
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

  const [projectName, setProjectName] = useState("");
  const [userName, setUserName] = useState("");

  const [zoom, setZoom] = useState(1);

  const [draft, setDraft] = useState(null);
  const [dragInfo, setDragInfo] = useState(null);

  const [roomId, setRoomId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const [lockedShapes, setLockedShapes] = useState([]);
  const [focusedShapes, setFocusedShapes] = useState([]);
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

      setHistory([nextShapes]);
      setHistoryIndex(0);
      setSelectedId((prev) =>
        prev && nextShapes.some((shape) => shape.id === prev) ? prev : null
      );
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

      if (isTyping) return;

      const key = event.key.toLowerCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;

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

      if (ctrlOrMeta && key === "c") {
        if (!selectedShape) return;

        event.preventDefault();
        clipboardRef.current = structuredClone(selectedShape);
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
  }, [selectedId, lockedShapes, selectedShape]);

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
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

    setSelectedIds(uniqueIds);
    setSelectedId(uniqueIds[0] || null);
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

  function syncShapes(nextShapes) {
    if (!roomIdRef.current) return;
    if (!socketRef.current) return;

    socketRef.current.emit("canvas-update", {
      roomId: roomIdRef.current,
      shapes: nextShapes
    });
  }

  function commitShapes(nextShapes, shouldSync = true) {
    setHistory((prev) => {
      const currentIndex = historyIndexRef.current;
      const sliced = prev.slice(0, currentIndex + 1);
      const nextHistory = [...sliced, nextShapes];

      historyRef.current = nextHistory;
      historyIndexRef.current = nextHistory.length - 1;

      return nextHistory;
    });

    setHistoryIndex((prev) => {
      const nextIndex = prev + 1;
      historyIndexRef.current = nextIndex;
      return nextIndex;
    });

    shapesRef.current = nextShapes;

    if (shouldSync) {
      syncShapes(nextShapes);
    }
  }

  function setShapesDirect(updater) {
    const currentShapes = shapesRef.current;
    const nextShapes =
      typeof updater === "function" ? updater(currentShapes) : updater;

    commitShapes(nextShapes);
  }

  function setShapesLive(updater) {
    const currentShapes = shapesRef.current;
    const nextShapes =
      typeof updater === "function" ? updater(currentShapes) : updater;

    setHistory((prev) => {
      const nextHistory = prev.map((item, index) =>
        index === historyIndexRef.current ? nextShapes : item
      );

      historyRef.current = nextHistory;
      return nextHistory;
    });

    shapesRef.current = nextShapes;
    syncShapes(nextShapes);
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

  function undo() {
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;

    if (currentIndex <= 0) return;

    const nextIndex = currentIndex - 1;
    const nextShapes = currentHistory[nextIndex];

    historyIndexRef.current = nextIndex;
    shapesRef.current = nextShapes;

    setHistoryIndex(nextIndex);
    clearSelection();
    syncShapes(nextShapes);
  }

  function redo() {
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;

    if (currentIndex >= currentHistory.length - 1) return;

    const nextIndex = currentIndex + 1;
    const nextShapes = currentHistory[nextIndex];

    historyIndexRef.current = nextIndex;
    shapesRef.current = nextShapes;

    setHistoryIndex(nextIndex);
    clearSelection();
    syncShapes(nextShapes);
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

  function duplicateSelected() {
    if (!selectedShape) return;
    duplicateShapeById(selectedShape.id);
  }

  function duplicateShapeById(shapeId) {
    const shape = shapesRef.current.find((item) => item.id === shapeId);
    if (!shape) return;
    if (isShapeLocked(shapeId)) return;

    clipboardRef.current = structuredClone(shape);

    lockShape(shapeId, () => {
      const copy = {
        ...duplicateShape(shape),
        name: shape.name ? `${shape.name} kópia` : undefined
      };

      const nextShapes = [...shapesRef.current, copy];

      setShapesDirect(nextShapes);
      normalizeSelection([copy.id]);
      setTool(TOOL.SELECT);
      unlockShape(shapeId);
    });
  }

  function pasteShape() {
    if (!clipboardRef.current) return;

    const copy = duplicateShape(clipboardRef.current);
    const nextShapes = [...shapesRef.current, copy];

    clipboardRef.current = structuredClone(copy);

    setShapesDirect(nextShapes);
    normalizeSelection([copy.id]);
  }

  function deleteSelected() {
    const idsToDelete = selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [];

    if (idsToDelete.length === 0) return;

    const currentShapes = shapesRef.current;
    const orderedIds = currentShapes
      .filter((shape) => idsToDelete.includes(shape.id) && !isShapeLocked(shape.id))
      .map((shape) => shape.id)
      .reverse();

    if (orderedIds.length === 0) return;

    const nextHistoryItems = [];
    let workingShapes = currentShapes;

    for (const shapeId of orderedIds) {
      workingShapes = workingShapes.filter((shape) => shape.id !== shapeId);
      nextHistoryItems.push(workingShapes);
    }

    const currentIndex = historyIndexRef.current;
    const nextHistory = [
      ...historyRef.current.slice(0, currentIndex + 1),
      ...nextHistoryItems
    ];
    const nextIndex = nextHistory.length - 1;

    historyRef.current = nextHistory;
    historyIndexRef.current = nextIndex;
    shapesRef.current = workingShapes;

    setHistory(nextHistory);
    setHistoryIndex(nextIndex);
    syncShapes(workingShapes);
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

  function handleExportJson() {
    const normalizedName = projectName.trim();

    if (!normalizedName) {
      setProjectNameDraft("");
      setProjectNameModal({ action: "json" });
      return;
    }

    exportJson({ shapes, projectName: normalizedName, setProjectName });
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

    if (projectNameModal?.action === "json") {
      exportJson({ shapes, projectName: normalizedName, setProjectName });
    }
  }

  function handleImportJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        if (Array.isArray(data)) {
          commitShapes(data);
          clearSelection();
          setDraft(null);
          setDragInfo(null);
          setShowObjectsPanel(true);
          return;
        }

        if (Array.isArray(data.shapes)) {
          commitShapes(data.shapes);
          setProjectName(data.name || "");
          clearSelection();
          setDraft(null);
          setDragInfo(null);
          setShowObjectsPanel(true);
          return;
        }

        alert("Tento JSON súbor nemá správny formát projektu.");
      } catch {
        alert("Import JSON súboru zlyhal.");
      }
    };

    reader.readAsText(file);
    event.target.value = "";
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
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onUndo={undo}
        onRedo={redo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
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
