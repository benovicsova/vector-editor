import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import { CANVAS_WIDTH, CANVAS_HEIGHT, TOOL } from "./constants";
import { initialShapes } from "./data/initialShapes";

import Toolbar from "./components/Toolbar";
import EditorCanvas from "./components/EditorCanvas";

import { exportSvg } from "./utils/svgExport";
import { downloadTextFile } from "./utils/fileDownload";
import { duplicateShape } from "./utils/geometry";

const SOCKET_URL = "http://localhost:3001";

export default function App() {
  const [tool, setTool] = useState(TOOL.SELECT);

  const [history, setHistory] = useState([initialShapes]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const shapes = history[historyIndex];

  const [selectedId, setSelectedId] = useState(null);

  const [fill, setFill] = useState("#855cd6");
  const [stroke, setStroke] = useState("#1f2937");
  const [strokeWidth, setStrokeWidth] = useState(4);

  const [zoom, setZoom] = useState(1);

  const [draft, setDraft] = useState(null);
  const [dragInfo, setDragInfo] = useState(null);

  const [roomId, setRoomId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("offline");

  const [roomModal, setRoomModal] = useState(null);
  const [joinInput, setJoinInput] = useState("");
  const [roomError, setRoomError] = useState("");

  const socketRef = useRef(null);
  const roomIdRef = useRef("");

  const selectedShape = shapes.find((shape) => shape.id === selectedId) ?? null;

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("online");
    });

    socket.on("disconnect", () => {
      setConnectionStatus("offline");
    });

    socket.on("canvas-update", ({ shapes: remoteShapes }) => {
      if (!Array.isArray(remoteShapes)) return;

      setHistory([remoteShapes]);
      setHistoryIndex(0);
      setSelectedId(null);
      setDraft(null);
      setDragInfo(null);
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
  }, [selectedId, shapes]);

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
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, nextShapes];
    });

    setHistoryIndex((prev) => prev + 1);

    if (shouldSync) {
      syncShapes(nextShapes);
    }
  }

  function setShapesDirect(updater) {
    const nextShapes = typeof updater === "function" ? updater(shapes) : updater;
    commitShapes(nextShapes);
  }

  function setShapesLive(updater) {
    const nextShapes = typeof updater === "function" ? updater(shapes) : updater;

    setHistory((prev) =>
      prev.map((item, index) => (index === historyIndex ? nextShapes : item))
    );

    syncShapes(nextShapes);
  }

  function createRoom() {
    setRoomError("");

    if (!socketRef.current) {
      setRoomError("Server nie je dostupný.");
      setRoomModal({ type: "error" });
      return;
    }

    socketRef.current.emit("create-room", { shapes }, (response) => {
      if (!response?.success) {
        setRoomError("Miestnosť sa nepodarilo vytvoriť.");
        setRoomModal({ type: "error" });
        return;
      }

      setRoomId(response.roomId);
      roomIdRef.current = response.roomId;

      setRoomModal({
        type: "created",
        roomId: response.roomId
      });
    });
  }

  function openJoinRoomModal() {
    setJoinInput("");
    setRoomError("");
    setRoomModal({ type: "join" });
  }

  function joinRoom() {
    const normalizedRoomId = joinInput.trim();

    setRoomError("");

    if (!/^\d{4}$/.test(normalizedRoomId)) {
      setRoomError("ID miestnosti musí byť 4-ciferné číslo.");
      return;
    }

    if (!socketRef.current) {
      setRoomError("Server nie je dostupný.");
      return;
    }

    socketRef.current.emit("join-room", { roomId: normalizedRoomId }, (response) => {
      if (!response?.success) {
        setRoomError(response?.message || "Nepodarilo sa pripojiť k miestnosti.");
        return;
      }

      setRoomId(response.roomId);
      roomIdRef.current = response.roomId;

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
    });
  }

  function closeRoomModal() {
    setRoomModal(null);
    setRoomError("");
  }

  function undo() {
    if (historyIndex <= 0) return;

    const nextIndex = historyIndex - 1;
    const nextShapes = history[nextIndex];

    setHistoryIndex(nextIndex);
    setSelectedId(null);
    syncShapes(nextShapes);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;

    const nextIndex = historyIndex + 1;
    const nextShapes = history[nextIndex];

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

    const copy = duplicateShape(selectedShape);
    const nextShapes = [...shapes, copy];

    setShapesDirect(nextShapes);
    setSelectedId(copy.id);
  }

  function deleteSelected() {
    if (!selectedId) return;

    setShapesDirect((prev) => prev.filter((shape) => shape.id !== selectedId));
    setSelectedId(null);
  }

  function moveLayer(direction) {
    if (!selectedShape) return;

    const index = shapes.findIndex((shape) => shape.id === selectedId);
    const swapIndex = direction === "up" ? index + 1 : index - 1;

    if (swapIndex < 0 || swapIndex >= shapes.length) return;

    const next = [...shapes];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];

    setShapesDirect(next);
  }

  function toggleVisible() {
    if (!selectedShape) return;

    setShapesDirect((prev) =>
      prev.map((shape) =>
        shape.id === selectedId ? { ...shape, visible: !shape.visible } : shape
      )
    );
  }

  function handleExportPng() {
    const svgText = exportSvg(shapes);
    const svgBlob = new Blob([svgText], {
      type: "image/svg+xml;charset=utf-8"
    });

    const url = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");

      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      const context = canvas.getContext("2d");

      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);

      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) return;

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = "obrazok.png";
        link.click();

        URL.revokeObjectURL(downloadUrl);
      }, "image/png");
    };

    image.src = url;
  }

  function handleExportJson() {
    downloadTextFile(
      "projekt-vektor-editor.json",
      JSON.stringify(shapes, null, 2),
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
          setSelectedId(data[0]?.id ?? null);
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
        setTool={setTool}
        fill={fill}
        setFill={setFill}
        stroke={stroke}
        setStroke={setStroke}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
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
        onToggleVisible={toggleVisible}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        roomId={roomId}
        onCreateRoom={createRoom}
        onJoinRoom={openJoinRoomModal}
        connectionStatus={connectionStatus}
      />

      <EditorCanvas
        tool={tool}
        setTool={setTool}
        shapes={shapes}
        setShapes={setShapesDirect}
        setShapesLive={setShapesLive}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        draft={draft}
        setDraft={setDraft}
        dragInfo={dragInfo}
        setDragInfo={setDragInfo}
        zoom={zoom}
        setZoom={setZoom}
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