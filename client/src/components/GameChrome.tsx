import { useState, type ReactNode } from "react";
import type { GameState, Player } from "@12pions/shared";
import { formatClock, type Clocks } from "../hooks/useTurnClock";
import ConfirmModal from "./ConfirmModal";
import VictoryModal from "./VictoryModal";
import "./GameChrome.css";

interface GameChromeProps {
  state: GameState;
  southName: string;
  northName: string;
  you?: Player | null;
  clocks?: Clocks | null;
  statusExtra?: string;
  onForfeit?: () => void;
  onNewGame?: () => void;
  onRematchOnline?: () => void;
  onEndChain?: () => void;
  children: ReactNode;
}

function sideLabel(side: Player, you?: Player | null) {
  if (you === side) return "vous";
  return side === "south" ? "Sud" : "Nord";
}

export default function GameChrome({
  state,
  southName,
  northName,
  you = null,
  clocks = null,
  statusExtra,
  onForfeit,
  onNewGame,
  onRematchOnline,
  onEndChain,
  children,
}: GameChromeProps) {
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const hasClocks = clocks != null;
  const top: Player = you === "north" ? "south" : "north";
  const bottom: Player = you === "north" ? "north" : "south";

  function renderPlayer(side: Player, name: string) {
    const active = state.turn === side && !state.winner;
    const low =
      hasClocks && clocks[side] <= 30_000 && clocks[side] > 0 && active;
    const empty = hasClocks && clocks[side] <= 0;

    return (
      <div
        className={`chrome__player chrome__player--${side} ${
          active ? "is-active" : ""
        } ${low ? "is-low" : ""} ${empty ? "is-flag" : ""}`}
      >
        <div className="chrome__player-info">
          <span className={`chrome__swatch chrome__swatch--${side}`} />
          <div className="chrome__player-meta">
            <strong>{name}</strong>
            <small>
              {sideLabel(side, you)} · capturés {state.captured[side]}
            </small>
          </div>
        </div>
        {hasClocks && (
          <time
            className={`chrome__clock ${active ? "is-ticking" : ""}`}
            dateTime={`PT${Math.ceil(clocks[side] / 1000)}S`}
            aria-label={`Temps restant ${name}`}
          >
            {formatClock(clocks[side])}
          </time>
        )}
      </div>
    );
  }

  function confirmAbandon() {
    setConfirmForfeit(false);
    onForfeit?.();
  }

  return (
    <div className="chrome">
      {renderPlayer(top, top === "south" ? southName : northName)}

      <div className="chrome__board">{children}</div>

      {renderPlayer(bottom, bottom === "south" ? southName : northName)}

      {statusExtra && !state.winner && (
        <p className="chrome__status">{statusExtra}</p>
      )}

      <div className="chrome__actions">
        {onEndChain && state.chainFrom && !state.winner && (
          <button type="button" className="btn btn--secondary" onClick={onEndChain}>
            Terminer la chaîne
          </button>
        )}
        {onForfeit && !state.winner && (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setConfirmForfeit(true)}
          >
            Abandonner la partie
          </button>
        )}
      </div>

      {confirmForfeit && !state.winner && (
        <ConfirmModal
          title="Abandonner la partie ?"
          message="Voulez-vous vraiment abandonner ? Cette action est définitive."
          confirmLabel="Abandonner"
          cancelLabel="Annuler"
          onConfirm={confirmAbandon}
          onCancel={() => setConfirmForfeit(false)}
        />
      )}

      {state.winner && (
        <VictoryModal
          winner={state.winner}
          southName={southName}
          northName={northName}
          you={you}
          onRematchAi={onNewGame}
          onRematchOnline={onRematchOnline}
        />
      )}
    </div>
  );
}
