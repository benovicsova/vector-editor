export default function ProjectNameModal({
  title = "Názov projektu",
  description = "Zadaj názov, pod ktorým sa projekt uloží.",
  value,
  setValue,
  onConfirm,
  onCancel
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-icon">💾</div>

        <h2 className="modal-title">{title}</h2>

        <p className="modal-text">{description}</p>

        <input
          className="modal-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onConfirm();
            }

            if (event.key === "Escape") {
              onCancel();
            }
          }}
          autoFocus
          placeholder="napr. projekt"
        />

        <div className="modal-actions">
          <button className="modal-secondary-button" type="button" onClick={onCancel}>
            Zrušiť
          </button>

          <button className="modal-primary-button" type="button" onClick={onConfirm}>
            Uložiť
          </button>
        </div>
      </div>
    </div>
  );
}
