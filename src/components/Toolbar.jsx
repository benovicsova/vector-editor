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
  Save
} from "lucide-react";

import { TOOL } from "../constants";

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
  userName,
  setUserName,
  onExportPng,
  onExportJson,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom
}) {
  return (
    <header className="scratch-topbar">
      <div className="toolbar-row toolbar-row-main">
        <div className="topbar-group main-tools">
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
            title="Čiara / kreslenie"
          >
            <Pencil />
          </IconButton>

          <IconButton
            active={tool === TOOL.TEXT}
            onClick={() => setTool(TOOL.TEXT)}
            title="Text"
          >
            <Type />
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
        </div>

        <div className="topbar-separator" />

        <div className="topbar-group">
          <IconButton onClick={onUndo} disabled={!canUndo} title="Späť">
            <Undo2 />
          </IconButton>

          <IconButton onClick={onRedo} disabled={!canRedo} title="Znovu">
            <Redo2 />
          </IconButton>
        </div>

        <div className="topbar-separator" />

        <div className="topbar-group color-tools">
          <label className="scratch-color" title="Farba výplne / textu">
            <PaintBucket size={17} />
            <input
              type="color"
              value={fill === "none" ? "#ffffff" : fill}
              onChange={(event) => setFill(event.target.value)}
            />
          </label>

          <button
            className={fill === "none" ? "icon-button active" : "icon-button"}
            onClick={() => setFill("none")}
            title="Bez výplne"
            type="button"
          >
            <span className="no-fill-preview" />
          </button>

          <label className="scratch-color" title="Farba čiary / obrysu">
            <span className="stroke-preview" style={{ background: stroke }} />
            <input
              type="color"
              value={stroke}
              onChange={(event) => setStroke(event.target.value)}
            />
          </label>

          <input
            className="stroke-width"
            type="number"
            min="1"
            max="30"
            value={strokeWidth}
            onChange={(event) => setStrokeWidth(Number(event.target.value))}
            title="Hrúbka čiary"
          />
        </div>

        <div className="topbar-separator" />

        <div className="topbar-group zoom-tools">
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
        </div>

        <div className="topbar-separator" />

        <div className="topbar-group text-inputs">
          <input
            className="project-name-input"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Projekt"
            title="Názov projektu"
          />

          <input
            className="user-name-input"
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
            placeholder="Meno"
            title="Meno používateľa"
          />
        </div>

        <div className="topbar-group export-tools">
          <IconButton onClick={onExportPng} title="Export PNG">
            <Image />
          </IconButton>

          <IconButton onClick={onExportJson} title="Export JSON">
            <Save />
          </IconButton>
        </div>
      </div>
    </header>
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