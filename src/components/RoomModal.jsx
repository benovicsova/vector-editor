export default function RoomModal({
  roomModal,
  joinInput,
  setJoinInput,
  userNameInput,
  setUserNameInput,
  roomError,
  setRoomError,
  onCreateConfirm,
  onJoinConfirm,
  onClose
}) {
  if (!roomModal) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
        {roomModal.type === "create" && (
          <>
            <div className="modal-icon">👥</div>

            <h2 className="modal-title">Vytvoriť miestnosť</h2>

            <p className="modal-text">
              Zadaj meno, ktoré budú vidieť ostatní počas spoločného kreslenia.
            </p>

            <input
              className="modal-input"
              value={userNameInput}
              onChange={(event) => {
                setUserNameInput(event.target.value);
                setRoomError?.("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onCreateConfirm();
                }

                if (event.key === "Escape") {
                  onClose();
                }
              }}
              autoFocus
              placeholder="Tvoje meno"
            />

            {roomError && <div className="modal-error">{roomError}</div>}

            <div className="modal-actions">
              <button className="modal-secondary-button" type="button" onClick={onClose}>
                Zrušiť
              </button>

              <button className="modal-primary-button" type="button" onClick={onCreateConfirm}>
                Vytvoriť
              </button>
            </div>
          </>
        )}

        {roomModal.type === "created" && (
          <>
            <div className="modal-icon">✓</div>

            <h2 className="modal-title">Miestnosť vytvorená</h2>

            <p className="modal-text">
              Zdieľaj toto 4-ciferné číslo s ďalším používateľom.
            </p>

            <div className="modal-room-code">{roomModal.roomId}</div>

            <button className="modal-primary-button" type="button" onClick={onClose}>
              Hotovo
            </button>
          </>
        )}

        {roomModal.type === "join" && (
          <>
            <div className="modal-icon">↪</div>

            <h2 className="modal-title">Pripojiť sa k miestnosti</h2>

            <p className="modal-text">
              Zadaj svoje meno a 4-ciferné ID miestnosti.
            </p>

            <input
              className="modal-input"
              value={userNameInput}
              onChange={(event) => {
                setUserNameInput(event.target.value);
                setRoomError?.("");
              }}
              placeholder="Tvoje meno"
              autoFocus
            />

            <input
              className="modal-input modal-code-input"
              value={joinInput}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "").slice(0, 4);
                setJoinInput(value);
                setRoomError?.("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onJoinConfirm();
                }

                if (event.key === "Escape") {
                  onClose();
                }
              }}
              placeholder="1234"
              inputMode="numeric"
              maxLength={4}
            />

            {roomError && <div className="modal-error">{roomError}</div>}

            <div className="modal-actions">
              <button className="modal-secondary-button" type="button" onClick={onClose}>
                Zrušiť
              </button>

              <button className="modal-primary-button" type="button" onClick={onJoinConfirm}>
                Pripojiť
              </button>
            </div>
          </>
        )}

        {roomModal.type === "joined" && (
          <>
            <div className="modal-icon">✓</div>

            <h2 className="modal-title">Pripojené</h2>

            <p className="modal-text">Si pripojená k miestnosti:</p>

            <div className="modal-room-code">{roomModal.roomId}</div>

            <button className="modal-primary-button" type="button" onClick={onClose}>
              Pokračovať
            </button>
          </>
        )}

        {roomModal.type === "error" && (
          <>
            <div className="modal-icon">!</div>

            <h2 className="modal-title">Chyba</h2>

            <p className="modal-text">{roomError || "Nastala chyba."}</p>

            <button className="modal-primary-button" type="button" onClick={onClose}>
              Zavrieť
            </button>
          </>
        )}
      </div>
    </div>
  );
}
