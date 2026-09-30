import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  Eye,
  EyeOff,
  Copy,
  Trash2,
  BringToFront,
  SendToBack,
  ChevronsUp,
  ChevronsDown,
  PanelRightClose,
  PanelRightOpen
} from "lucide-react";

import { CANVAS_WIDTH, CANVAS_HEIGHT, TOOL } from "./constants";
import { initialShapes } from "./data/initialShapes";

import Toolbar from "./components/Toolbar";
import EditorCanvas from "./components/EditorCanvas";

import { downloadTextFile } from "./utils/fileDownload";
import { duplicateShape, getBoundingBox } from "./utils/geometry";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
const DEFAULT_PROJECT_NAME = "projekt-vektor-editor";

export default function App() {
  const [tool, setTool] = useState(TOOL.RECT);

  const [history, setHistory] = useState([initialShapes]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const shapes = history[historyIndex];

  const [selectedId, setSelectedId] = useState(null);

  const [fill, setFill] = useState("#855cd6");
  const [stroke, setStroke] = useState("#1f2937");
  const [strokeWidth, setStrokeWidth] = useState(4);

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

  const [roomModal, setRoomModal] = useState(null);
  const [joinInput, setJoinInput] = useState("");
  const [roomError, setRoomError] = useState("");

  const [showObjectsPanel, setShowObjectsPanel] = useState(true);

  const socketRef = useRef(null);
  const roomIdRef = useRef("");
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

    if (selectedShape.type === "pen") {
      setFill(selectedShape.stroke || "#1f2937");
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
  }, [selectedId]);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("online");
    });

    socket.on("disconnect", () => {
      setConnectionStatus("offline");
      setLockedShapes([]);
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

    socket.on("shape-locked", ({ shapeId, userName }) => {
      setLockedShapes((prev) => {
        if (prev.some((item) => item.shapeId === shapeId)) return prev;

        return [
          ...prev,
          {
            shapeId,
            userName: userName || "Používateľ"
          }
        ];
      });
    });

    socket.on("shape-unlocked", ({ shapeId }) => {
      setLockedShapes((prev) => prev.filter((item) => item.shapeId !== shapeId));
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

  function isShapeLocked(shapeId) {
    return lockedShapes.some((item) => item.shapeId === shapeId);
  }

  function getShapeLock(shapeId) {
    return lockedShapes.find((item) => item.shapeId === shapeId) ?? null;
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
      const sliced = prev.slice(0, historyIndexRef.current + 1);
      return [...sliced, nextShapes];
    });

    setHistoryIndex((prev) => prev + 1);

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

    setHistory((prev) =>
      prev.map((item, index) =>
        index === historyIndexRef.current ? nextShapes : item
      )
    );

    shapesRef.current = nextShapes;
    syncShapes(nextShapes);
  }

  function handleToolChange(nextTool) {
    setTool(nextTool);

    if (nextTool !== TOOL.SELECT) {
      setSelectedId(null);
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

        onSuccess?.();
      }
    );
  }

  function unlockShape(shapeId) {
    if (!shapeId) return;
    if (!roomIdRef.current || !socketRef.current) return;

    socketRef.current.emit("shape-unlock", {
      roomId: roomIdRef.current,
      shapeId
    });
  }

  function updateSelectedShapeStyle(property, value) {
    if (!selectedId) return;
    if (isShapeLocked(selectedId)) return;

    lockShape(selectedId, () => {
      setShapesDirect((prev) =>
        prev.map((shape) => {
          if (shape.id !== selectedId) return shape;

          if (shape.type === "pen" && property === "fill") {
            if (value === "none") return shape;

            return {
              ...shape,
              stroke: value
            };
          }

          if (shape.type === "text" && property === "stroke") {
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

      unlockShape(selectedId);
    });
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

  function handleFillChange(nextFill) {
    setFill(nextFill);
    updateSelectedShapeStyle("fill", nextFill);
  }

  function handleStrokeChange(nextStroke) {
    setStroke(nextStroke);
    updateSelectedShapeStyle("stroke", nextStroke);
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

  function askForUserNameIfNeeded() {
    const current = userName.trim();

    if (current) return current;

    const entered = window.prompt("Zadaj svoje meno:", "Používateľ");

    if (!entered) return "";

    const normalized = entered.trim();

    if (!normalized) return "";

    setUserName(normalized);
    return normalized;
  }

  function createRoom() {
    setRoomError("");

    const normalizedUserName = askForUserNameIfNeeded();
    if (!normalizedUserName) return;

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
        setLockedShapes(response.lockedShapes ?? []);

        setRoomModal({
          type: "created",
          roomId: response.roomId
        });
      }
    );
  }

  function openJoinRoomModal() {
    const normalizedUserName = askForUserNameIfNeeded();
    if (!normalizedUserName) return;

    setJoinInput("");
    setRoomError("");
    setRoomModal({ type: "join" });
  }

  function joinRoom() {
    const normalizedRoomId = joinInput.trim();
    const normalizedUserName = askForUserNameIfNeeded();

    if (!normalizedUserName) return;

    setRoomError("");

    if (!/^\d{4}$/.test(normalizedRoomId)) {
      setRoomError("ID miestnosti musí byť 4-ciferné číslo.");
      return;
    }

    if (!socketRef.current) {
      setRoomError("Server nie je dostupný.");
      return;
    }

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

        const confirmJoin = window.confirm(
          `Naozaj sa chceš pripojiť do miestnosti ${response.roomId}?`
        );

        if (!confirmJoin) return;

        setRoomId(response.roomId);
        roomIdRef.current = response.roomId;
        setLockedShapes(response.lockedShapes ?? []);

        if (Array.isArray(response.shapes)) {
          setHistory([response.shapes]);
          setHistoryIndex(0);
          setSelectedId(null);
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

    setHistoryIndex(nextIndex);
    setSelectedId(null);
    syncShapes(nextShapes);
  }

  function redo() {
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;

    if (currentIndex >= currentHistory.length - 1) return;

    const nextIndex = currentIndex + 1;
    const nextShapes = currentHistory[nextIndex];

    setHistoryIndex(nextIndex);
    setSelectedId(null);
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
      setSelectedId(copy.id);
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
    setSelectedId(copy.id);
  }

  function deleteSelected() {
    if (!selectedId) return;
    deleteShapeById(selectedId);
  }

  function deleteShapeById(shapeId) {
    if (!shapeId) return;
    if (isShapeLocked(shapeId)) return;

    lockShape(shapeId, () => {
      setShapesDirect((prev) => prev.filter((shape) => shape.id !== shapeId));
      unlockShape(shapeId);

      if (selectedId === shapeId) {
        setSelectedId(null);
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

    setSelectedId(shapeId);
    setTool(TOOL.SELECT);
  }

  function getShapeDefaultLabel(shape, index) {
    const number = index + 1;

    if (shape.type === "rect") return `Obdĺžnik ${number}`;
    if (shape.type === "ellipse") return `Elipsa ${number}`;
    if (shape.type === "triangle") return `Trojuholník ${number}`;
    if (shape.type === "pen") return `Čiara ${number}`;
    if (shape.type === "text") return `Text ${number}`;

    return `Objekt ${number}`;
  }

  function pointsToPath(points) {
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

    return path;
  }

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function getExportBounds(visibleShapes) {
    if (visibleShapes.length === 0) {
      return {
        x: 0,
        y: 0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT
      };
    }

    const boxes = visibleShapes.map((shape) => getBoundingBox(shape));

    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.w));
    const maxY = Math.max(...boxes.map((box) => box.y + box.h));

    const padding = 60;

    return {
      x: minX - padding,
      y: minY - padding,
      width: Math.max(maxX - minX + padding * 2, 1),
      height: Math.max(maxY - minY + padding * 2, 1)
    };
  }

  function shapeToSvg(shape) {
    const fillValue = shape.fill || "none";
    const strokeValue = shape.stroke || "#1f2937";
    const strokeWidthValue = Math.max(Number(shape.strokeWidth) || 1, 1);

    if (shape.type === "rect") {
      const x = Math.min(shape.x, shape.x + shape.w);
      const y = Math.min(shape.y, shape.y + shape.h);
      const w = Math.abs(shape.w);
      const h = Math.abs(shape.h);

      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${escapeXml(fillValue)}" stroke="${escapeXml(strokeValue)}" stroke-width="${strokeWidthValue}" />`;
    }

    if (shape.type === "ellipse") {
      return `<ellipse cx="${shape.x + shape.w / 2}" cy="${shape.y + shape.h / 2}" rx="${Math.abs(shape.w / 2)}" ry="${Math.abs(shape.h / 2)}" fill="${escapeXml(fillValue)}" stroke="${escapeXml(strokeValue)}" stroke-width="${strokeWidthValue}" />`;
    }

    if (shape.type === "triangle") {
      const points = shape.points.map((p) => `${p.x},${p.y}`).join(" ");

      return `<polygon points="${points}" fill="${escapeXml(fillValue)}" stroke="${escapeXml(strokeValue)}" stroke-width="${strokeWidthValue}" stroke-linejoin="round" stroke-linecap="round" />`;
    }

    if (shape.type === "pen") {
      return `<path d="${pointsToPath(shape.points)}" fill="none" stroke="${escapeXml(strokeValue)}" stroke-width="${strokeWidthValue}" stroke-linejoin="round" stroke-linecap="round" />`;
    }

    if (shape.type === "text") {
      const textFill = shape.fill && shape.fill !== "none" ? shape.fill : strokeValue;

      return `<text x="${shape.x}" y="${shape.y}" fill="${escapeXml(textFill)}" font-size="${shape.fontSize || 32}" font-family="${escapeXml(shape.fontFamily || "Arial")}" font-weight="700">${escapeXml(shape.text || "")}</text>`;
    }

    return "";
  }

  function createExportSvg() {
    const visibleShapes = shapes.filter((shape) => shape.visible !== false);
    const bounds = getExportBounds(visibleShapes);

    const svgShapes = visibleShapes.map((shape) => shapeToSvg(shape)).join("\n");

    return {
      svgText: `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">
  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="white" />
  ${svgShapes}
</svg>`,
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height)
    };
  }

  function getSafeFileName(name) {
    const normalized = String(name || "")
      .trim()
      .replace(/[<>:"/\\|?*]+/g, "-")
      .replace(/\s+/g, "-");

    return normalized || DEFAULT_PROJECT_NAME;
  }

  function handleExportPng() {
    const { svgText, width, height } = createExportSvg();

    const svgBlob = new Blob([svgText], {
      type: "image/svg+xml;charset=utf-8"
    });

    const url = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");

      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);

      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) return;

        const safeName = getSafeFileName(projectName || DEFAULT_PROJECT_NAME);
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = `${safeName}.png`;
        link.click();

        URL.revokeObjectURL(downloadUrl);
      }, "image/png");
    };

    image.src = url;
  }

  function handleExportJson() {
    let name = projectName.trim();

    if (!name) {
      const enteredName = window.prompt("Zadaj názov projektu:", DEFAULT_PROJECT_NAME);

      if (!enteredName) return;

      name = enteredName.trim();

      if (!name) return;

      setProjectName(name);
    }

    const safeName = getSafeFileName(name);

    downloadTextFile(
      `${safeName}.json`,
      JSON.stringify(
        {
          name,
          shapes
        },
        null,
        2
      ),
      "application/json"
    );
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
          setSelectedId(null);
          return;
        }

        if (Array.isArray(data.shapes)) {
          commitShapes(data.shapes);
          setProjectName(data.name || "");
          setSelectedId(null);
        }
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
        strokeWidth={strokeWidth}
        setStrokeWidth={handleStrokeWidthChange}
        fontFamily={fontFamily}
        setFontFamily={handleFontFamilyChange}
        fontSize={fontSize}
        setFontSize={handleFontSizeChange}
        projectName={projectName}
        setProjectName={setProjectName}
        userName={userName}
        setUserName={setUserName}
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

      <button
        className={
          showObjectsPanel
            ? "objects-side-toggle open"
            : "objects-side-toggle closed"
        }
        type="button"
        onClick={() => setShowObjectsPanel((prev) => !prev)}
        title={showObjectsPanel ? "Skryť panel objektov" : "Zobraziť panel objektov"}
      >
        {showObjectsPanel ? <PanelRightClose /> : <PanelRightOpen />}
      </button>

      <aside
        className={
          showObjectsPanel ? "objects-panel open" : "objects-panel collapsed"
        }
      >
        <div className="objects-panel-header">
          <strong>Objekty a vrstvy</strong>

          <button
            className="objects-panel-close"
            type="button"
            onClick={() => setShowObjectsPanel(false)}
            title="Skryť panel"
          >
            ×
          </button>
        </div>

        {panelShapes.length === 0 && (
          <div className="objects-empty">Zatiaľ tu nie sú žiadne objekty.</div>
        )}

        <div className="objects-list">
          {panelShapes
            .map((shape, index) => ({ shape, index }))
            .reverse()
            .map(({ shape, index }) => (
              <div
                key={shape.id}
                className={
                  selectedId === shape.id
                    ? "objects-item selected"
                    : "objects-item"
                }
              >
                <button
                  className="objects-thumbnail-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectShapeFromPanel(shape.id);
                  }}
                  title="Vybrať objekt"
                >
                  <ShapeThumbnail shape={shape} />
                </button>

                <input
                  className="objects-rename-input"
                  value={shape.name ?? getShapeDefaultLabel(shape, index)}
                  onChange={(event) =>
                    renameShapeFromPanel(shape.id, event.target.value)
                  }
                  onFocus={(event) => {
                    event.stopPropagation();
                    setSelectedId(shape.id);
                    setTool(TOOL.SELECT);
                  }}
                  title="Premenovať objekt"
                />

                <div
                  className="objects-actions-row"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <MiniButton
                    title="Skryť / zobraziť"
                    active={shape.visible !== false}
                    onClick={() => toggleShapeVisibleFromPanel(shape.id)}
                  >
                    {shape.visible === false ? <EyeOff /> : <Eye />}
                  </MiniButton>

                  <MiniButton
                    title="Duplikovať"
                    onClick={() => duplicateShapeById(shape.id)}
                  >
                    <Copy />
                  </MiniButton>

                  <MiniButton
                    title="Vymazať"
                    danger
                    onClick={() => deleteShapeById(shape.id)}
                  >
                    <Trash2 />
                  </MiniButton>

                  <MiniDivider />

                  <MiniButton
                    title="O 1 dopredu"
                    onClick={() => moveLayerById(shape.id, "up")}
                  >
                    <BringToFront />
                  </MiniButton>

                  <MiniButton
                    title="O 1 dozadu"
                    onClick={() => moveLayerById(shape.id, "down")}
                  >
                    <SendToBack />
                  </MiniButton>

                  <MiniButton
                    title="Úplne dopredu"
                    onClick={() => moveLayerToExtremeById(shape.id, "front")}
                  >
                    <ChevronsUp />
                  </MiniButton>

                  <MiniButton
                    title="Úplne dozadu"
                    onClick={() => moveLayerToExtremeById(shape.id, "back")}
                  >
                    <ChevronsDown />
                  </MiniButton>
                </div>
              </div>
            ))}
        </div>
      </aside>

      <EditorCanvas
        tool={tool}
        setTool={handleToolChange}
        shapes={shapes}
        setShapes={setShapesDirect}
        setShapesLive={setShapesLive}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
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
        lockShape={lockShape}
        unlockShape={unlockShape}
      />

      {roomModal && (
        <div style={modalStyles.backdrop} onMouseDown={closeRoomModal}>
          <div style={modalStyles.card} onMouseDown={(event) => event.stopPropagation()}>
            {roomModal.type === "created" && (
              <>
                <div style={modalStyles.icon}>👥</div>
                <h2 style={modalStyles.title}>Miestnosť vytvorená</h2>
                <p style={modalStyles.text}>
                  Zdieľaj toto 4-ciferné číslo s ďalším používateľom.
                </p>

                <div style={modalStyles.roomCode}>{roomModal.roomId}</div>

                <button style={modalStyles.primaryButton} onClick={closeRoomModal}>
                  Hotovo
                </button>
              </>
            )}

            {roomModal.type === "join" && (
              <>
                <div style={modalStyles.icon}>↪</div>
                <h2 style={modalStyles.title}>Pripojiť sa k miestnosti</h2>
                <p style={modalStyles.text}>Zadaj 4-ciferné ID miestnosti.</p>

                <input
                  style={modalStyles.input}
                  value={joinInput}
                  onChange={(event) => {
                    const value = event.target.value.replace(/\D/g, "").slice(0, 4);
                    setJoinInput(value);
                    setRoomError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      joinRoom();
                    }
                  }}
                  autoFocus
                  placeholder="1234"
                  inputMode="numeric"
                  maxLength={4}
                />

                {roomError && <div style={modalStyles.error}>{roomError}</div>}

                <div style={modalStyles.actions}>
                  <button style={modalStyles.secondaryButton} onClick={closeRoomModal}>
                    Zrušiť
                  </button>

                  <button style={modalStyles.primaryButton} onClick={joinRoom}>
                    Pripojiť
                  </button>
                </div>
              </>
            )}

            {roomModal.type === "joined" && (
              <>
                <div style={modalStyles.icon}>✓</div>
                <h2 style={modalStyles.title}>Pripojené</h2>
                <p style={modalStyles.text}>Si pripojená k miestnosti:</p>

                <div style={modalStyles.roomCode}>{roomModal.roomId}</div>

                <button style={modalStyles.primaryButton} onClick={closeRoomModal}>
                  Pokračovať
                </button>
              </>
            )}

            {roomModal.type === "error" && (
              <>
                <div style={modalStyles.icon}>!</div>
                <h2 style={modalStyles.title}>Chyba</h2>
                <p style={modalStyles.text}>{roomError || "Nastala chyba."}</p>

                <button style={modalStyles.primaryButton} onClick={closeRoomModal}>
                  Zavrieť
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniButton({ title, onClick, children, active, danger }) {
  return (
    <button
      className={[
        "objects-mini-button",
        active ? "active" : "",
        danger ? "danger" : ""
      ].join(" ")}
      type="button"
      title={title}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

function MiniDivider() {
  return <span className="objects-mini-divider" />;
}

function ShapeThumbnail({ shape }) {
  const box = getBoundingBox(shape);

  const padding = Math.max(Number(shape.strokeWidth) || 2, 2) + 10;
  const viewX = box.x - padding;
  const viewY = box.y - padding;
  const viewW = Math.max(box.w + padding * 2, 1);
  const viewH = Math.max(box.h + padding * 2, 1);

  const stroke = shape.stroke || "#1f2937";
  const fill = shape.fill || "none";
  const strokeWidth = Math.max(Number(shape.strokeWidth) || 1, 1);
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
      <rect
        x={viewX}
        y={viewY}
        width={viewW}
        height={viewH}
        fill="white"
      />

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

        {shape.type === "triangle" && (
          <polygon
            points={shape.points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {shape.type === "pen" && (
          <path
            d={pointsToThumbnailPath(shape.points)}
            fill="none"
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

function pointsToThumbnailPath(points) {
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

  return path;
}

const modalStyles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  card: {
    width: "min(420px, 100%)",
    background: "white",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
    textAlign: "center"
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    background: "#f3f0ff",
    color: "#5b35b1",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 26,
    fontWeight: 800,
    marginBottom: 14
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: "#111827"
  },
  text: {
    margin: "10px 0 18px",
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 1.5
  },
  roomCode: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 150,
    height: 64,
    borderRadius: 18,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    color: "#5b35b1",
    fontSize: 34,
    fontWeight: 900,
    letterSpacing: "0.16em",
    marginBottom: 22
  },
  input: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    border: "1px solid #d1d5db",
    outline: "none",
    textAlign: "center",
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "0.16em",
    color: "#111827",
    marginBottom: 10
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 12
  },
  actions: {
    display: "flex",
    gap: 10,
    justifyContent: "center",
    marginTop: 8
  },
  primaryButton: {
    height: 42,
    border: "none",
    borderRadius: 14,
    padding: "0 18px",
    background: "#855cd6",
    color: "white",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer"
  },
  secondaryButton: {
    height: 42,
    border: "1px solid #d1d5db",
    borderRadius: 14,
    padding: "0 18px",
    background: "white",
    color: "#374151",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer"
  }
};