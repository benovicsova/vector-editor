import {
  MousePointer2,
  Square,
  Circle,
  Triangle,
  Pencil,
  Undo2,
  Redo2,
  PaintBucket,
  Slash,
  Copy,
  Trash2,
  BringToFront,
  SendToBack,
  Eye,
  EyeOff,
  Eraser,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Users,
  LogIn,
  Image,
  Save,
  FolderOpen
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
  onExportPng,
  onExportJson,
  onImportJson,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  selectedShape,
  onDuplicate,
  onDelete,
  onMoveForward,
  onMoveBackward,
  onToggleVisible,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  roomId,
  onCreateRoom,
  onJoinRoom,
  connectionStatus
}) {
  return (
    <header className="scratch-topbar">
      <div className="topbar-group">
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
          title="Kreslenie čiary"
        >
          <Pencil />
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

      <div className="topbar-group">
        <IconButton onClick={onZoomOut} title="Oddialiť">
          <ZoomOut />
        </IconButton>

        <button
          className="zoom-label"
          onClick={onResetZoom}
          title="Resetovať priblíženie"
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

      <div className="topbar-group">
        <label className="scratch-color" title="Farba výplne">
          <PaintBucket size={16} />
          <input
            type="color"
            value={fill === "none" ? "#ffffff" : fill}
            onChange={(e) => setFill(e.target.value)}
          />
        </label>

        <button
          className={fill === "none" ? "icon-button active" : "icon-button"}
          onClick={() => setFill("none")}
          title="Bez výplne"
        >
          <Slash />
        </button>

        <label className="scratch-color" title="Farba obrysu">
          <span className="stroke-preview" />
          <input
            type="color"
            value={stroke}
            onChange={(e) => setStroke(e.target.value)}
          />
        </label>

        <input
          className="stroke-width"
          type="number"
          min="1"
          max="30"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(Number(e.target.value))}
          title="Hrúbka obrysu"
        />
      </div>

      <div className="topbar-separator" />

      <div className="topbar-group">
        <IconButton disabled={!selectedShape} onClick={onDuplicate} title="Kopírovať">
          <Copy />
        </IconButton>

        <IconButton disabled={!selectedShape} onClick={onDelete} title="Vymazať">
          <Trash2 />
        </IconButton>

        <IconButton
          disabled={!selectedShape}
          onClick={onMoveForward}
          title="Posunúť dopredu"
        >
          <BringToFront />
        </IconButton>

        <IconButton
          disabled={!selectedShape}
          onClick={onMoveBackward}
          title="Posunúť dozadu"
        >
          <SendToBack />
        </IconButton>

        <IconButton
          disabled={!selectedShape}
          onClick={onToggleVisible}
          title="Viditeľnosť"
        >
          {selectedShape?.visible ? <Eye /> : <EyeOff />}
        </IconButton>
      </div>

      <div className="topbar-separator" />

      <div className="topbar-group room-tools">
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
          title={
            connectionStatus === "online"
              ? "Server pripojený"
              : "Server odpojený"
          }
        />
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-group">
        <IconButton onClick={onExportPng} title="Export PNG">
          <Image />
        </IconButton>

        <IconButton onClick={onExportJson} title="Export JSON">
          <Save />
        </IconButton>

        <label className="icon-button file-icon" title="Import JSON">
          <FolderOpen />
          <input
            type="file"
            accept="application/json"
            onChange={onImportJson}
            hidden
          />
        </label>
      </div>
    </header>
  );
}

function IconButton({ active, disabled, onClick, title, children }) {
  return (
    <button
      className={active ? "icon-button active" : "icon-button"}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}