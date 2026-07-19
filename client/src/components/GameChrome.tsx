import type { GameState, Player } from "@12pions/shared";
import { formatClock, type Clocks } from "../hooks/useTurnClock";
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
}: GameChromeProps) {
  const hasClocks = clocks != null;

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
        <span className={`chrome__swatch chrome__swatch--${side}`} />
        <div className="chrome__player-meta">
          <strong>{name}</strong>
          <small>
            {sideLabel(side, you)} · capturés {state.captured[side]}
          </small>
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

  return (
    <div className="chrome">
      <div className="chrome__players">
        {renderPlayer("north", northName)}
        {renderPlayer("south", southName)}
      </div>

      {(status || statusExtra) && !state.winner && (
        <p className="chrome__status">
          {status}
          {status && statusExtra ? ` · ${statusExtra}` : statusExtra ?? ""}
        </p>
      )}

      <div className="chrome__actions">
        {onEndChain && state.chainFrom && !state.winner && (
          <button type="button" className="btn btn--secondary" onClick={onEndChain}>
            Terminer la chaîne
          </button>
        )}
        {onForfeit && !state.winner && (
          <button type="button" className="btn btn--secondary" onClick={onForfeit}>
            Abandonner
          </button>
        )}
      </div>

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
