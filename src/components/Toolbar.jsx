import { useEffect, useRef, useState } from "react";

import {
  MousePointer2,
  Square,
  Circle,
  Triangle,
  Pencil,
  Type,
  Undo2,
  Redo2,
  PaintBucket,
  Eraser,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Image,
  Save,
  Upload,
  Users,
  LogIn,
  Minus,
  Diamond,
  Ban,
  Palette
} from "lucide-react";

import { COLOR_PALETTE, TOOL } from "../constants";

const DEFAULT_RECENT_COLORS = [
  "#855cd6",
  "#1f2937",
  "#ef4444",
  "#22c55e",
  "#3b82f6"
];

function normalizePalette(colors) {
  const merged = [...colors, ...COLOR_PALETTE, ...DEFAULT_RECENT_COLORS]
    .filter(Boolean)
    .filter((color) => color !== "none");

  return [...new Set(merged)].slice(0, 5);
}

function readRecentColors(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];

    if (Array.isArray(parsed)) {
      return normalizePalette(parsed);
    }

    return normalizePalette([]);
  } catch {
    return normalizePalette([]);
  }
}

function saveRecentColors(storageKey, colors) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(colors));
  } catch {
    // localStorage nemusí byť dostupný, aplikácia má fungovať aj bez neho
  }
}

export default function Toolbar({
  tool,
  setTool,
  fill,
  setFill,
  stroke,
  setStroke,
  strokeWidth,
  setStrokeWidth,
  projectName,
  setProjectName,
  onExportPng,
  onExportJson,
  onImportJson,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  roomId,
  onCreateRoom,
  onJoinRoom,
  connectionStatus
}) {
  const [draftFill, setDraftFill] = useState(
    fill === "none" ? "#ffffff" : fill
  );
  const [draftStroke, setDraftStroke] = useState(
    stroke === "none" ? "#1f2937" : stroke
  );

  const [recentFillColors, setRecentFillColors] = useState(() =>
    readRecentColors("vector-editor-fill-colors")
  );
  const [recentStrokeColors, setRecentStrokeColors] = useState(() =>
    readRecentColors("vector-editor-stroke-colors")
  );

  const [openColorMenu, setOpenColorMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0
  });

  const fillButtonRef = useRef(null);
  const strokeButtonRef = useRef(null);
  const menuRef = useRef(null);
  const fillPickerRef = useRef(null);
  const strokePickerRef = useRef(null);

  useEffect(() => {
    setDraftFill(fill === "none" ? "#ffffff" : fill);
  }, [fill]);

  useEffect(() => {
    setDraftStroke(stroke === "none" ? "#1f2937" : stroke);
  }, [stroke]);

  useEffect(() => {
    function handlePointerDown(event) {
      const target = event.target;

      if (menuRef.current?.contains(target)) return;
      if (fillButtonRef.current?.contains(target)) return;
      if (strokeButtonRef.current?.contains(target)) return;

      setOpenColorMenu(null);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpenColorMenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function rememberFillColor(color) {
    const next = normalizePalette([color, ...recentFillColors]);

    setRecentFillColors(next);
    saveRecentColors("vector-editor-fill-colors", next);
  }

  function rememberStrokeColor(color) {
    const next = normalizePalette([color, ...recentStrokeColors]);

    setRecentStrokeColors(next);
    saveRecentColors("vector-editor-stroke-colors", next);
  }

  function commitFillColor(nextColor = draftFill) {
    if (!nextColor) return;

    setDraftFill(nextColor);
    setFill(nextColor);
    rememberFillColor(nextColor);
    setOpenColorMenu(null);
  }

  function commitStrokeColor(nextColor = draftStroke) {
    if (!nextColor) return;

    setDraftStroke(nextColor);
    setStroke(nextColor);
    rememberStrokeColor(nextColor);
    setOpenColorMenu(null);
  }

  function openMenu(type, event) {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();

    setMenuPosition({
      top: rect.bottom + 8,
      left: Math.min(rect.left, window.innerWidth - 230)
    });

    setOpenColorMenu((current) => (current === type ? null : type));
  }

  function chooseMenuColor(color) {
    if (openColorMenu === "fill") {
      commitFillColor(color);
      return;
    }

    if (openColorMenu === "stroke") {
      commitStrokeColor(color);
    }
  }

  function openNativeColorPicker() {
    if (openColorMenu === "fill") {
      fillPickerRef.current?.click();
      return;
    }

    if (openColorMenu === "stroke") {
      strokePickerRef.current?.click();
    }
  }

  const activeMenuColors =
    openColorMenu === "stroke" ? recentStrokeColors : recentFillColors;

  return (
    <>
      <header className="scratch-topbar">
        <div className="toolbar-row toolbar-row-main toolbar-single-row">
          <ToolbarGroup title="Nástroje" className="main-tools">
            <IconButton
              active={tool === TOOL.SELECT}
              onClick={() => setTool(TOOL.SELECT)}
              title="Výber"
            >
              <MousePointer2 />
            </IconButton>

            <IconButton
              active={tool === TOOL.PEN}
              onClick={() => setTool(TOOL.PEN)}
              title="Voľné kreslenie"
            >
              <Pencil />
            </IconButton>

            <IconButton
              active={tool === TOOL.LINE}
              onClick={() => setTool(TOOL.LINE)}
              title="Rovná čiara"
            >
              <Minus />
            </IconButton>

            <IconButton
              active={tool === TOOL.FILL}
              onClick={() => setTool(TOOL.FILL)}
              title="Vyplniť objekt"
            >
              <PaintBucket />
            </IconButton>

            <IconButton
              active={tool === TOOL.ERASE}
              onClick={() => setTool(TOOL.ERASE)}
              title="Guma"
            >
              <Eraser />
            </IconButton>

            <IconButton
              active={tool === TOOL.TEXT}
              onClick={() => setTool(TOOL.TEXT)}
              title="Text"
            >
              <Type />
            </IconButton>
          </ToolbarGroup>

          <ToolbarGroup title="Tvary">
            <IconButton
              active={tool === TOOL.RECT}
              onClick={() => setTool(TOOL.RECT)}
              title="Obdĺžnik"
            >
              <Square />
            </IconButton>

            <IconButton
              active={tool === TOOL.ELLIPSE}
              onClick={() => setTool(TOOL.ELLIPSE)}
              title="Elipsa"
            >
              <Circle />
            </IconButton>

            <IconButton
              active={tool === TOOL.TRIANGLE}
              onClick={() => setTool(TOOL.TRIANGLE)}
              title="Trojuholník"
            >
              <Triangle />
            </IconButton>

            <IconButton
              active={tool === TOOL.QUAD}
              onClick={() => setTool(TOOL.QUAD)}
              title="Štvoruholník"
            >
              <Diamond />
            </IconButton>
          </ToolbarGroup>

          <ToolbarGroup title="História">
            <IconButton onClick={onUndo} disabled={!canUndo} title="Späť">
              <Undo2 />
            </IconButton>

            <IconButton onClick={onRedo} disabled={!canRedo} title="Znovu">
              <Redo2 />
            </IconButton>
          </ToolbarGroup>

          <ToolbarGroup title="Farby" className="color-tools">
            <button
              ref={fillButtonRef}
              className={
                openColorMenu === "fill"
                  ? "color-menu-button active"
                  : "color-menu-button"
              }
              type="button"
              title="Farba výplne"
              onClick={(event) => openMenu("fill", event)}
            >
              <PaintBucket size={16} />

              <span
                className="toolbar-color-preview"
                style={{
                  background: fill === "none" ? "#ffffff" : draftFill
                }}
              />
            </button>

            <button
              className={fill === "none" ? "icon-button active" : "icon-button"}
              onClick={() => setFill("none")}
              title="Bez výplne"
              type="button"
            >
              <span className="no-fill-preview" />
            </button>

            <button
              ref={strokeButtonRef}
              className={
                openColorMenu === "stroke"
                  ? "color-menu-button active"
                  : "color-menu-button"
              }
              type="button"
              title="Farba obrysu / čiary"
              onClick={(event) => openMenu("stroke", event)}
            >
              <span
                className="stroke-preview"
                style={{
                  background: stroke === "none" ? "transparent" : draftStroke
                }}
              />

              <span
                className="toolbar-color-preview"
                style={{
                  background: stroke === "none" ? "#ffffff" : draftStroke
                }}
              />
            </button>

            <button
              className={
                stroke === "none" ? "icon-button active" : "icon-button"
              }
              onClick={() => setStroke("none")}
              title="Bez obrysu"
              type="button"
            >
              <Ban />
            </button>

            <input
              className="stroke-width"
              type="number"
              min="1"
              max="30"
              value={strokeWidth}
              onChange={(event) => setStrokeWidth(Number(event.target.value))}
              title="Hrúbka čiary"
            />

            <input
              ref={fillPickerRef}
              className="hidden-color-picker"
              type="color"
              value={draftFill}
              onChange={(event) => setDraftFill(event.target.value)}
              onBlur={(event) => commitFillColor(event.currentTarget.value)}
            />

            <input
              ref={strokePickerRef}
              className="hidden-color-picker"
              type="color"
              value={draftStroke}
              onChange={(event) => setDraftStroke(event.target.value)}
              onBlur={(event) => commitStrokeColor(event.currentTarget.value)}
            />
          </ToolbarGroup>

          <ToolbarGroup title="Zoom" className="zoom-tools">
            <IconButton onClick={onZoomOut} title="Oddialiť">
              <ZoomOut />
            </IconButton>

            <button
              className="zoom-label"
              onClick={onResetZoom}
              title="Resetovať priblíženie"
              type="button"
            >
              {Math.round(zoom * 100)}%
            </button>

            <IconButton onClick={onZoomIn} title="Priblížiť">
              <ZoomIn />
            </IconButton>

            <IconButton onClick={onResetZoom} title="Resetovať priblíženie">
              <RotateCcw />
            </IconButton>
          </ToolbarGroup>

          <ToolbarGroup title="Projekt" className="text-inputs">
            <input
              className="project-name-input"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Projekt"
              title="Názov projektu"
            />
          </ToolbarGroup>

          <ToolbarGroup title="Miestnosť" className="room-tools">
            <IconButton onClick={onCreateRoom} title="Vytvoriť miestnosť">
              <Users />
            </IconButton>

            <IconButton onClick={onJoinRoom} title="Pripojiť sa k miestnosti">
              <LogIn />
            </IconButton>

            {roomId && (
              <span
                className="room-label-compact"
                title={`Aktuálna miestnosť: ${roomId}`}
              >
                {roomId}
              </span>
            )}

            <span
              className={
                connectionStatus === "online"
                  ? "connection-dot compact online"
                  : "connection-dot compact offline"
              }
              title={
                connectionStatus === "online"
                  ? "Server pripojený"
                  : "Server odpojený"
              }
            />
          </ToolbarGroup>

          <ToolbarGroup title="Súbor" className="export-tools">
            <label className="icon-button" title="Otvoriť JSON projekt">
              <Upload />

              <input
                type="file"
                accept=".json,application/json"
                onChange={onImportJson}
                style={{ display: "none" }}
              />
            </label>

            <IconButton onClick={onExportPng} title="Export PNG">
              <Image />
            </IconButton>

            <IconButton onClick={onExportJson} title="Export JSON">
              <Save />
            </IconButton>
          </ToolbarGroup>
        </div>
      </header>

      {openColorMenu && (
        <div
          ref={menuRef}
          className="floating-color-menu"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`
          }}
        >
          <div className="floating-color-title">
            {openColorMenu === "fill" ? "Výplň" : "Obrys / čiara"}
          </div>

          <div className="floating-color-grid">
            {activeMenuColors.map((color) => (
              <button
                key={`${openColorMenu}-${color}`}
                className="floating-color-dot"
                type="button"
                style={{ background: color }}
                title={color}
                onClick={() => chooseMenuColor(color)}
              />
            ))}

            <button
              className="floating-color-new"
              type="button"
              onClick={openNativeColorPicker}
              title="Vybrať novú farbu"
            >
              <Palette size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ToolbarGroup({ title, className = "", children }) {
  return (
    <div className={`toolbar-group-box ${className}`} title={title}>
      {children}
    </div>
  );
}

function IconButton({ active, disabled, onClick, title, children }) {
  return (
    <button
      className={active ? "icon-button active" : "icon-button"}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}