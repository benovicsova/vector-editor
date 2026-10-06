import { useEffect, useMemo, useRef, useState } from "react";

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
  Palette,
  Pipette
} from "lucide-react";

import { COLOR_PALETTE, TOOL } from "../constants";

const DEFAULT_COLORS = [
  "#855cd6",
  "#1f2937",
  "#ef4444",
  "#22c55e",
  "#3b82f6"
];

const COLOR_MENU_WIDTH = 300;
const COLOR_MENU_HEIGHT = 104;
const WINDOW_PADDING = 10;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeColors(colors = []) {
  const source = Array.isArray(colors) && colors.length > 0 ? colors : DEFAULT_COLORS;

  return [...new Set([...source, ...COLOR_PALETTE, ...DEFAULT_COLORS])]
    .filter(Boolean)
    .filter((color) => color !== "none")
    .slice(0, 5);
}

function getMenuPosition(buttonElement) {
  const buttonRect = buttonElement.getBoundingClientRect();
  const groupRect =
    buttonElement.closest(".color-tools")?.getBoundingClientRect() ?? buttonRect;

  const maxLeft = Math.max(
    WINDOW_PADDING,
    window.innerWidth - COLOR_MENU_WIDTH - WINDOW_PADDING
  );
  const maxTop = Math.max(
    WINDOW_PADDING,
    window.innerHeight - COLOR_MENU_HEIGHT - WINDOW_PADDING
  );

  let left = groupRect.left;
  let top = groupRect.bottom + 8;

  left = clamp(left, WINDOW_PADDING, maxLeft);

  if (top > maxTop) {
    top = groupRect.top - COLOR_MENU_HEIGHT - 8;
  }

  top = clamp(top, WINDOW_PADDING, maxTop);

  return { top, left };
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
  recentColors = COLOR_PALETTE,
  eyedropperTarget,
  onStartEyedropper,
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
  const [draftFill, setDraftFill] = useState(fill === "none" ? "#ffffff" : fill);
  const [draftStroke, setDraftStroke] = useState(
    stroke === "none" ? "#1f2937" : stroke
  );
  const [customFill, setCustomFill] = useState(fill === "none" ? "#ffffff" : fill);
  const [customStroke, setCustomStroke] = useState(
    stroke === "none" ? "#1f2937" : stroke
  );

  const [openColorMenu, setOpenColorMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const fillButtonRef = useRef(null);
  const strokeButtonRef = useRef(null);
  const menuRef = useRef(null);

  const menuColors = useMemo(() => normalizeColors(recentColors), [recentColors]);

  useEffect(() => {
    if (fill === "none") {
      setDraftFill("#ffffff");
      return;
    }

    setDraftFill(fill);
    setCustomFill(fill);
  }, [fill]);

  useEffect(() => {
    if (stroke === "none") {
      setDraftStroke("#1f2937");
      return;
    }

    setDraftStroke(stroke);
    setCustomStroke(stroke);
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
        onStartEyedropper?.(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onStartEyedropper]);

  useEffect(() => {
    function repositionMenu() {
      if (openColorMenu === "fill" && fillButtonRef.current) {
        setMenuPosition(getMenuPosition(fillButtonRef.current));
        return;
      }

      if (openColorMenu === "stroke" && strokeButtonRef.current) {
        setMenuPosition(getMenuPosition(strokeButtonRef.current));
      }
    }

    if (!openColorMenu) return undefined;

    window.addEventListener("resize", repositionMenu);
    window.addEventListener("scroll", repositionMenu, true);

    return () => {
      window.removeEventListener("resize", repositionMenu);
      window.removeEventListener("scroll", repositionMenu, true);
    };
  }, [openColorMenu]);

  function openMenu(type, event) {
    event.preventDefault();
    event.stopPropagation();

    setMenuPosition(getMenuPosition(event.currentTarget));
    setOpenColorMenu(type);

    if (type === "fill") {
      setCustomFill(draftFill);
    }

    if (type === "stroke") {
      setCustomStroke(draftStroke);
    }
  }

  function commitFillColor(color, options = {}) {
    if (!color) return;

    const remember = options.remember !== false;

    setDraftFill(color === "none" ? "#ffffff" : color);
    if (color !== "none") {
      setCustomFill(color);
    }
    setFill(color, { remember });
  }

  function commitStrokeColor(color, options = {}) {
    if (!color) return;

    const remember = options.remember !== false;

    setDraftStroke(color === "none" ? "#1f2937" : color);
    if (color !== "none") {
      setCustomStroke(color);
    }
    setStroke(color, { remember });
  }

  function commitColorForActiveMenu(color, options = {}) {
    if (openColorMenu === "stroke") {
      commitStrokeColor(color, options);
      return;
    }

    commitFillColor(color, options);
  }

  function updateCustomColor(color) {
    if (!color) return;

    if (openColorMenu === "stroke") {
      setCustomStroke(color);
      commitStrokeColor(color, { remember: false });
      return;
    }

    setCustomFill(color);
    commitFillColor(color, { remember: false });
  }

  function submitCustomColor(color) {
    if (!color) return;

    commitColorForActiveMenu(color, { remember: true });
  }

  function toggleFillTransparency() {
    if (fill === "none") {
      commitFillColor(customFill || DEFAULT_COLORS[0], { remember: false });
      return;
    }

    commitFillColor("none", { remember: false });
  }

  function toggleStrokeTransparency() {
    if (stroke === "none") {
      commitStrokeColor(customStroke || "#1f2937", { remember: false });
      return;
    }

    commitStrokeColor("none", { remember: false });
  }

  function startEyedropper(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!openColorMenu) return;

    onStartEyedropper?.(openColorMenu);
  }

  const customColorValue = openColorMenu === "stroke" ? customStroke : customFill;

  return (
    <>
      <header className="scratch-topbar">
        <div className="toolbar-row toolbar-row-main toolbar-single-row">
          <ToolbarGroup title="Nástroje" className="main-tools">
            <IconButton active={tool === TOOL.SELECT} onClick={() => setTool(TOOL.SELECT)} title="Výber">
              <MousePointer2 />
            </IconButton>

            <IconButton active={tool === TOOL.PEN} onClick={() => setTool(TOOL.PEN)} title="Voľné kreslenie">
              <Pencil />
            </IconButton>

            <IconButton active={tool === TOOL.LINE} onClick={() => setTool(TOOL.LINE)} title="Rovná čiara">
              <Minus />
            </IconButton>

            <IconButton active={tool === TOOL.FILL} onClick={() => setTool(TOOL.FILL)} title="Vyplniť objekt">
              <PaintBucket />
            </IconButton>

            <IconButton active={tool === TOOL.ERASE} onClick={() => setTool(TOOL.ERASE)} title="Guma">
              <Eraser />
            </IconButton>

            <IconButton active={tool === TOOL.TEXT} onClick={() => setTool(TOOL.TEXT)} title="Text">
              <Type />
            </IconButton>
          </ToolbarGroup>

          <ToolbarGroup title="Tvary">
            <IconButton active={tool === TOOL.RECT} onClick={() => setTool(TOOL.RECT)} title="Obdĺžnik">
              <Square />
            </IconButton>

            <IconButton active={tool === TOOL.ELLIPSE} onClick={() => setTool(TOOL.ELLIPSE)} title="Elipsa">
              <Circle />
            </IconButton>

            <IconButton active={tool === TOOL.TRIANGLE} onClick={() => setTool(TOOL.TRIANGLE)} title="Trojuholník">
              <Triangle />
            </IconButton>

            <IconButton active={tool === TOOL.QUAD} onClick={() => setTool(TOOL.QUAD)} title="Štvoruholník">
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
              className={openColorMenu === "fill" ? "color-menu-button active" : "color-menu-button"}
              type="button"
              title="Farba výplne"
              onClick={(event) => openMenu("fill", event)}
            >
              <PaintBucket size={16} />
              <span
                className="toolbar-color-preview"
                style={{ background: fill === "none" ? "#ffffff" : draftFill }}
              />
            </button>

            <button
              className={fill === "none" ? "icon-button active" : "icon-button"}
              onClick={toggleFillTransparency}
              title="Bez výplne"
              type="button"
            >
              <span className="no-fill-preview" />
            </button>

            <button
              ref={strokeButtonRef}
              className={openColorMenu === "stroke" ? "color-menu-button active" : "color-menu-button"}
              type="button"
              title="Farba obrysu / čiary"
              onClick={(event) => openMenu("stroke", event)}
            >
              <span
                className="stroke-preview"
                style={{ background: stroke === "none" ? "transparent" : draftStroke }}
              />
              <span
                className="toolbar-color-preview"
                style={{ background: stroke === "none" ? "#ffffff" : draftStroke }}
              />
            </button>

            <button
              className={stroke === "none" ? "icon-button active" : "icon-button"}
              onClick={toggleStrokeTransparency}
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
          </ToolbarGroup>

          <ToolbarGroup title="Zoom" className="zoom-tools">
            <IconButton onClick={onZoomOut} title="Oddialiť">
              <ZoomOut />
            </IconButton>

            <button className="zoom-label" onClick={onResetZoom} title="Resetovať priblíženie" type="button">
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
              <span className="room-label-compact" title={`Aktuálna miestnosť: ${roomId}`}>
                {roomId}
              </span>
            )}

            <span
              className={
                connectionStatus === "online"
                  ? "connection-dot compact online"
                  : "connection-dot compact offline"
              }
              title={connectionStatus === "online" ? "Server pripojený" : "Server odpojený"}
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
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="floating-color-title">
            {openColorMenu === "fill" ? "Výplň" : "Obrys / čiara"}
          </div>

          <div className="floating-color-content">
            <div className="floating-color-grid">
              {menuColors.map((color) => (
                <button
                  key={`${openColorMenu}-${color}`}
                  className="floating-color-dot"
                  type="button"
                  style={{ background: color }}
                  title={color}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    commitColorForActiveMenu(color, { remember: true });
                  }}
                />
              ))}
            </div>

            <div className="floating-color-tools">
              <label className="floating-color-native" title="Vybrať novú farbu">
                <Palette size={16} />
                <input
                  type="color"
                  value={customColorValue}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => updateCustomColor(event.target.value)}
                  onBlur={(event) => submitCustomColor(event.target.value)}
                  onMouseUp={(event) => submitCustomColor(event.currentTarget.value)}
                />
              </label>

              <button
                className={
                  eyedropperTarget === openColorMenu
                    ? "floating-color-eyedropper active"
                    : "floating-color-eyedropper"
                }
                type="button"
                title="Kvapkadlo"
                onClick={startEyedropper}
              >
                <Pipette size={16} />
              </button>
            </div>
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
