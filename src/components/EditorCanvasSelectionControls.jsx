import { TOOL } from "../constants";
import {
  getEditPoints,
  getScalePoint,
  getBoundsCenter
} from "../utils/editorCanvasGeometry";

export default function EditorCanvasSelectionControls({
  tool,
  zoom,
  selectedShape,
  selectedBounds,
  selectedCenter,
  selectedRotation,
  selectedIds,
  multiSelectionBounds,
  onStartPointDrag,
  onStartRotationDrag,
  onStartScaleDrag,
  onStartMultiScaleDrag
}) {
  if (tool !== TOOL.SELECT) return null;

  if (multiSelectionBounds && selectedIds.length > 1) {
    const center = getBoundsCenter(multiSelectionBounds);
    const scalePoint = {
      x: multiSelectionBounds.x + multiSelectionBounds.w + 30 / zoom,
      y: multiSelectionBounds.y + multiSelectionBounds.h + 30 / zoom
    };

    return (
      <g>
        <rect
          x={multiSelectionBounds.x - 8}
          y={multiSelectionBounds.y - 8}
          width={multiSelectionBounds.w + 16}
          height={multiSelectionBounds.h + 16}
          fill="none"
          stroke="#f97316"
          strokeDasharray="8 6"
          strokeWidth={2 / zoom}
          pointerEvents="none"
        />

        <circle
          cx={scalePoint.x}
          cy={scalePoint.y}
          r={10 / zoom}
          fill="#f97316"
          stroke="white"
          strokeWidth={3 / zoom}
          className="scale-point"
          onPointerDown={(event) => onStartMultiScaleDrag(event, center)}
        />
      </g>
    );
  }

  if (!selectedShape || !selectedBounds || !selectedCenter || selectedIds.length > 1) {
    return null;
  }

  return (
    <g transform={`rotate(${selectedRotation} ${selectedCenter.x} ${selectedCenter.y})`}>
      <rect
        x={selectedBounds.x - 6}
        y={selectedBounds.y - 6}
        width={selectedBounds.w + 12}
        height={selectedBounds.h + 12}
        fill="none"
        stroke="#855cd6"
        strokeDasharray="8 6"
        strokeWidth={2 / zoom}
      />

      <line
        x1={selectedBounds.x + selectedBounds.w / 2}
        y1={selectedBounds.y - 6}
        x2={selectedBounds.x + selectedBounds.w / 2}
        y2={selectedBounds.y - 42 / zoom}
        stroke="#855cd6"
        strokeWidth={2 / zoom}
        strokeDasharray={`${5 / zoom} ${4 / zoom}`}
      />

      <circle
        cx={selectedBounds.x + selectedBounds.w / 2}
        cy={selectedBounds.y - 48 / zoom}
        r={10 / zoom}
        fill="#855cd6"
        stroke="white"
        strokeWidth={3 / zoom}
        className="rotate-point"
        onPointerDown={(event) => onStartRotationDrag(event, selectedShape)}
      />

      <circle
        cx={getScalePoint(selectedShape, zoom).x}
        cy={getScalePoint(selectedShape, zoom).y}
        r={10 / zoom}
        fill="#f97316"
        stroke="white"
        strokeWidth={3 / zoom}
        className="scale-point"
        onPointerDown={(event) => onStartScaleDrag(event, selectedShape)}
      />

      {getEditPoints(selectedShape).map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={9 / zoom}
          fill="white"
          stroke="#855cd6"
          strokeWidth={3 / zoom}
          className="point"
          onPointerDown={(event) => onStartPointDrag(event, selectedShape, index)}
        />
      ))}
    </g>
  );
}
