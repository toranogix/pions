import "./Board.css";
import type { GameState, Move, Player, Position } from "@12pions/shared";
import { BOARD_SIZE, getMovesForPiece, samePos } from "@12pions/shared";

interface BoardProps {
  state: GameState;
  interactive?: boolean;
  perspective?: Player;
  selected: Position | null;
  onSelect: (pos: Position | null) => void;
  onMove: (from: Position, to: Position) => void;
  highlightSide?: Player | null;
}

export default function Board({
  state,
  interactive = true,
  perspective = "south",
  selected,
  onSelect,
  onMove,
  highlightSide,
}: BoardProps) {
  const legal: Move[] =
    selected && interactive ? getMovesForPiece(state, selected) : [];

  // Own side at the bottom: north players see the board rotated 180°
  const flip = perspective === "north";
  const rowOrder = Array.from({ length: BOARD_SIZE }, (_, i) =>
    flip ? BOARD_SIZE - 1 - i : i,
  );
  const colOrder = Array.from({ length: BOARD_SIZE }, (_, i) =>
    flip ? BOARD_SIZE - 1 - i : i,
  );

  const isLegalTarget = (pos: Position) =>
    legal.some((m) => samePos(m.to, pos));

  function handleCellClick(row: number, col: number) {
    if (!interactive || state.winner) return;
    const pos = { row, col };
    const cell = state.board[row][col];

    if (selected && isLegalTarget(pos)) {
      onMove(selected, pos);
      onSelect(null);
      return;
    }

    if (state.chainFrom) {
      if (samePos(pos, state.chainFrom)) {
        onSelect(pos);
      }
      return;
    }

    if (cell && cell.player === state.turn) {
      if (highlightSide && cell.player !== highlightSide) return;
      onSelect(pos);
      return;
    }

    onSelect(null);
  }

  return (
    <div className="board" role="grid" aria-label="Plateau 12 Pions">
      {rowOrder.map((row) =>
        colOrder.map((col) => {
          const piece = state.board[row][col];
          const pos = { row, col };
          const selectedHere = selected && samePos(selected, pos);
          const target = isLegalTarget(pos);
          const chainHere =
            state.chainFrom && samePos(state.chainFrom, pos);
          const dark = (row + col) % 2 === 1;

          return (
            <button
              key={`${row}-${col}`}
              type="button"
              className={[
                "board__cell",
                dark ? "board__cell--dark" : "board__cell--light",
                selectedHere ? "board__cell--selected" : "",
                target ? "board__cell--target" : "",
                chainHere ? "board__cell--chain" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => handleCellClick(row, col)}
              disabled={!interactive || !!state.winner}
              aria-label={`Case ${row + 1}, ${col + 1}`}
            >
              {piece && (
                <span
                  className={[
                    "piece",
                    piece.player === "south" ? "piece--south" : "piece--north",
                    piece.kind === "dame" ? "piece--dame" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {piece.kind === "dame" ? "◆" : ""}
                </span>
              )}
              {target && !piece && <span className="board__dot" />}
            </button>
          );
        }),
      )}
    </div>
  );
}
