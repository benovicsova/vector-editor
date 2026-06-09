import {
  Copy,
  Trash2,
  PaintBucket,
  Slash,
  BringToFront,
  SendToBack,
  Eye,
  EyeOff
} from "lucide-react";

import { duplicateShape } from "../utils/geometry";

export default function InspectorPanel({
  shapes,
  setShapes,
  selectedId,
  setSelectedId
}) {
  const selectedShape = shapes.find((s) => s.id === selectedId);

  function updateSelected(patch) {
    setShapes((prev) =>
      prev.map((shape) =>
        shape.id === selectedId ? { ...shape, ...patch } : shape
      )
    );
  }

  function removeSelected() {
    setShapes((prev) => prev.filter((shape) => shape.id !== selectedId));
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selectedShape) return;

    const copy = duplicateShape(selectedShape);
    setShapes((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  }

  function moveLayer(direction) {
    const index = shapes.findIndex((shape) => shape.id === selectedId);
    if (index === -1) return;

    const next = [...shapes];
    const swapIndex = direction === "up" ? index + 1 : index - 1;

    if (swapIndex < 0 || swapIndex >= next.length) return;

    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setShapes(next);
  }

  if (!selectedShape) {
    return (
      <aside className="scratch-inspector">
        <div className="inspector-empty">Vyber objekt</div>
      </aside>
    );
  }

  return (
    <aside className="scratch-inspector">
      <input
        className="object-name"
        value={selectedShape.name}
        onChange={(e) => updateSelected({ name: e.target.value })}
      />

      <div className="inspector-actions">
        <button title="Kopírovať" onClick={duplicateSelected}>
          <Copy />
        </button>

        <button title="Zmazať" onClick={removeSelected}>
          <Trash2 />
        </button>

        <button title="Dopredu" onClick={() => moveLayer("up")}>
          <BringToFront />
        </button>

        <button title="Dozadu" onClick={() => moveLayer("down")}>
          <SendToBack />
        </button>

        <button
          title="Viditeľnosť"
          onClick={() => updateSelected({ visible: !selectedShape.visible })}
        >
          {selectedShape.visible ? <Eye /> : <EyeOff />}
        </button>
      </div>

      <div className="inspector-colors">
        {selectedShape.fill !== "none" ? (
          <label className="scratch-color">
            <PaintBucket size={16} />
            <input
              type="color"
              value={selectedShape.fill}
              onChange={(e) => updateSelected({ fill: e.target.value })}
              title="Výplň objektu"
            />
          </label>
        ) : (
          <button
            title="Pridať výplň"
            onClick={() => updateSelected({ fill: "#ffffff" })}
          >
            <PaintBucket />
          </button>
        )}

        <button
          className={selectedShape.fill === "none" ? "active" : ""}
          title="Bez výplne"
          onClick={() => updateSelected({ fill: "none" })}
        >
          <Slash />
        </button>

        <label className="scratch-color">
          <span className="stroke-preview" />
          <input
            type="color"
            value={selectedShape.stroke}
            onChange={(e) => updateSelected({ stroke: e.target.value })}
            title="Obrys objektu"
          />
        </label>

        <input
          className="stroke-width"
          type="number"
          min="1"
          max="30"
          value={selectedShape.strokeWidth}
          onChange={(e) => updateSelected({ strokeWidth: Number(e.target.value) })}
          title="Hrúbka obrysu"
        />
      </div>
    </aside>
  );
}