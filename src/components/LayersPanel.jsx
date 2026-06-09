import { Layers3 } from "lucide-react";

export default function LayersPanel({ shapes, setShapes, selectedId, setSelectedId }) {
  function toggleVisible(id) {
    setShapes((prev) =>
      prev.map((shape) =>
        shape.id === id ? { ...shape, visible: !shape.visible } : shape
      )
    );
  }

  return (
    <aside className="panel">
      <h2>
        <Layers3 size={20} /> Vrstvy
      </h2>

      {[...shapes].reverse().map((shape) => (
        <div
          key={shape.id}
          className={shape.id === selectedId ? "layer active-layer" : "layer"}
          onClick={() => setSelectedId(shape.id)}
        >
          <div>
            <strong>{shape.name}</strong>
            <small>{shape.type}</small>
          </div>

          <input
            type="checkbox"
            checked={shape.visible}
            onChange={(e) => {
              e.stopPropagation();
              toggleVisible(shape.id);
            }}
          />
        </div>
      ))}
    </aside>
  );
}