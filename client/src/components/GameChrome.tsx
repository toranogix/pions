import type { GameState, Player } from "@12pions/shared";
import "./GameChrome.css";

interface GameChromeProps {
  state: GameState;
  southName: string;
  northName: string;
  you?: Player | null;
  statusExtra?: string;
  onForfeit?: () => void;
  onNewGame?: () => void;
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
  statusExtra,
  onForfeit,
  onNewGame,
  onEndChain,
}: GameChromeProps) {
  let status = "";
  if (state.winner === "draw") {
    status = "Partie nulle";
  } else if (state.winner) {
    const name = state.winner === "south" ? southName : northName;
    status = `${name} a gagné`;
  } else if (state.chainFrom) {
    status = "Prise en chaîne — continuez ou terminez votre tour";
  } else {
    const name = state.turn === "south" ? southName : northName;
    status = `Tour de ${name}`;
  }

  return (
    <div className="chrome">
      <div className="chrome__players">
        <div
          className={`chrome__player chrome__player--north ${
            state.turn === "north" && !state.winner ? "is-active" : ""
          }`}
        >
          <span className="chrome__swatch chrome__swatch--north" />
          <div>
            <strong>{northName}</strong>
            <small>{sideLabel("north", you)} · capturés {state.captured.north}</small>
          </div>
        </div>
        <div
          className={`chrome__player chrome__player--south ${
            state.turn === "south" && !state.winner ? "is-active" : ""
          }`}
        >
          <span className="chrome__swatch chrome__swatch--south" />
          <div>
            <strong>{southName}</strong>
            <small>{sideLabel("south", you)} · capturés {state.captured.south}</small>
          </div>
        </div>
      </div>

      <p className="chrome__status">
        {status}
        {statusExtra ? ` · ${statusExtra}` : ""}
      </p>

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
        {onNewGame && state.winner && (
          <button type="button" className="btn btn--primary" onClick={onNewGame}>
            Nouvelle partie
          </button>
        )}
      </div>
    </div>
  );
}
