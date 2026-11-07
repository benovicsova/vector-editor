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
  PanelRightOpen,
  GripVertical
} from "lucide-react";

import { useState } from "react";
import ShapeThumbnail from "./ShapeThumbnail";

export default function ObjectsPanel({
  showObjectsPanel,
  setShowObjectsPanel,
  panelShapes,
  selectedId,
  getShapeDefaultLabel,
  onSelectShape,
  onRenameShape,
  onToggleVisible,
  onDuplicateShape,
  onDeleteShape,
  onMoveLayer,
  onMoveLayerToExtreme,
  onFocusInput,
  onReorderLayers,
  lockedShapeIds = []
}) {
  const [draggedId, setDraggedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  return (
    <>
      <button
        className={showObjectsPanel ? "objects-side-toggle open" : "objects-side-toggle closed"}
        type="button"
        onClick={() => setShowObjectsPanel((prev) => !prev)}
        title={showObjectsPanel ? "Skryť panel objektov" : "Zobraziť panel objektov"}
      >
        {showObjectsPanel ? <PanelRightClose /> : <PanelRightOpen />}
      </button>

      <aside className={showObjectsPanel ? "objects-panel open" : "objects-panel collapsed"}>
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
                className={[
                  "objects-item",
                  selectedId === shape.id ? "selected" : "",
                  hoveredId === shape.id && draggedId !== shape.id ? "drop-target" : "",
                  draggedId === shape.id ? "dragged" : ""
                ].filter(Boolean).join(" ")}
                draggable={!lockedShapeIds.includes(shape.id)}
                onDragStart={(event) => {
                  if (lockedShapeIds.includes(shape.id)) { event.preventDefault(); return; }
                  setDraggedId(shape.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", shape.id);
                }}
                onDragOver={(event) => {
                  if (!draggedId || lockedShapeIds.includes(shape.id)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setHoveredId(shape.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = event.dataTransfer.getData("text/plain") || draggedId;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  // Upper half: place this layer above the hovered layer.
                  const placeBelow = event.clientY > bounds.top + bounds.height / 2;
                  if (source && source !== shape.id) onReorderLayers?.(source, shape.id, placeBelow);
                  setDraggedId(null);
                  setHoveredId(null);
                }}
                onDragEnd={() => { setDraggedId(null); setHoveredId(null); }}
              >
                <span className="objects-drag-handle" title="Potiahni objekt vyššie alebo nižšie">
                  <GripVertical size={15} />
                </span>
                <button
                  className="objects-thumbnail-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectShape(shape.id);
                  }}
                  title="Vybrať objekt"
                >
                  <ShapeThumbnail shape={shape} />
                </button>

                <input
                  className="objects-rename-input"
                  value={shape.name ?? getShapeDefaultLabel(shape, index)}
                  onChange={(event) => onRenameShape(shape.id, event.target.value)}
                  onFocus={(event) => {
                    event.stopPropagation();
                    onFocusInput(shape.id);
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
                    onClick={() => onToggleVisible(shape.id)}
                  >
                    {shape.visible === false ? <EyeOff /> : <Eye />}
                  </MiniButton>

                  <MiniButton title="Duplikovať" onClick={() => onDuplicateShape(shape.id)}>
                    <Copy />
                  </MiniButton>

                  <MiniButton title="Vymazať" danger onClick={() => onDeleteShape(shape.id)}>
                    <Trash2 />
                  </MiniButton>

                  <MiniDivider />

                  <MiniButton title="O 1 dopredu" onClick={() => onMoveLayer(shape.id, "up")}>
                    <BringToFront />
                  </MiniButton>

                  <MiniButton title="O 1 dozadu" onClick={() => onMoveLayer(shape.id, "down")}>
                    <SendToBack />
                  </MiniButton>

                  <MiniButton
                    title="Úplne dopredu"
                    onClick={() => onMoveLayerToExtreme(shape.id, "front")}
                  >
                    <ChevronsUp />
                  </MiniButton>

                  <MiniButton
                    title="Úplne dozadu"
                    onClick={() => onMoveLayerToExtreme(shape.id, "back")}
                  >
                    <ChevronsDown />
                  </MiniButton>
                </div>
              </div>
            ))}
        </div>
      </aside>
    </>
  );
}

function MiniButton({ title, onClick, children, active, danger }) {
  return (
    <button
      className={["objects-mini-button", active ? "active" : "", danger ? "danger" : ""].join(" ")}
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
