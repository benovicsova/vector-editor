import { useEffect, useRef } from "react";

import { FONT_OPTIONS } from "../utils/editorCanvasGeometry";

export default function EditorCanvasTextEditor({
  textEditor,
  setTextEditor,
  fill,
  stroke,
  onConfirm,
  onCancel
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!textEditor) return;

    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [textEditor]);

  if (!textEditor) return null;

  return (
    <foreignObject
      x={textEditor.x}
      y={textEditor.y - textEditor.fontSize - 90}
      width={360}
      height={textEditor.fontSize + 135}
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className="svg-text-editor"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="text-editor-row">
          <input
            ref={inputRef}
            className="svg-text-input"
            value={textEditor.text}
            onChange={(event) =>
              setTextEditor((prev) => ({
                ...prev,
                text: event.target.value
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onConfirm();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
            style={{
              fontFamily: textEditor.fontFamily,
              fontSize: `${textEditor.fontSize}px`,
              color: fill === "none" ? stroke : fill
            }}
            placeholder="Napíš text..."
          />
        </div>

        <div className="text-editor-row">
          <select
            className="svg-text-select"
            value={textEditor.fontFamily}
            onChange={(event) =>
              setTextEditor((prev) => ({
                ...prev,
                fontFamily: event.target.value
              }))
            }
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>

          <input
            className="svg-text-size"
            type="number"
            min="8"
            max="180"
            value={textEditor.fontSize}
            onChange={(event) =>
              setTextEditor((prev) => ({
                ...prev,
                fontSize: Math.max(8, Number(event.target.value) || 8)
              }))
            }
          />

          <button className="svg-text-confirm" type="button" onClick={onConfirm}>
            OK
          </button>

          <button className="svg-text-cancel" type="button" onClick={onCancel}>
            ×
          </button>
        </div>
      </div>
    </foreignObject>
  );
}
