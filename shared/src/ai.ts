import type { GameState, Move, Player } from "./game.js";
import {applyMove, getAllLegalMoves, opponent, BOARD_SIZE} from "./game.js";

const PAWN_VALUE = 10;
const DAME_VALUE = 28;

function evaluate(state: GameState, perspective: Player): number {
  if (state.winner === perspective) return 10_000;
  if (state.winner === opponent(perspective)) return -10_000;
  if (state.winner === "draw") return 0;

  let score = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = state.board[r][c];
      if (!cell) continue;
      const value = cell.kind === "dame" ? DAME_VALUE : PAWN_VALUE;
      // Prefer advancing pawns toward promotion
      const advance =
        cell.kind === "pawn"
          ? cell.player === "south"
            ? 4 - r
            : r
          : 0;
      const s = value + advance * 0.4;
      score += cell.player === perspective ? s : -s;
    }
  }

  if (!state.chainFrom) {
    const myMoves = getAllLegalMoves({
      ...state,
      turn: perspective,
      chainFrom: null,
      lastJumpDir: null,
    });
    const oppMoves = getAllLegalMoves({
      ...state,
      turn: opponent(perspective),
      chainFrom: null,
      lastJumpDir: null,
    });
    score += (myMoves.length - oppMoves.length) * 0.35;
  }

  return score;
}

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  perspective: Player,
): number {
  if (depth === 0 || state.winner) {
    return evaluate(state, perspective);
  }

  const moves = getAllLegalMoves(state);
  if (moves.length === 0) {
    return evaluate(state, perspective);
  }

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const val = minimax(
        next,
        depth - 1,
        alpha,
        beta,
        next.turn === perspective,
        perspective,
      );
      best = Math.max(best, val);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    const next = applyMove(state, move);
    const val = minimax(
      next,
      depth - 1,
      alpha,
      beta,
      next.turn === perspective,
      perspective,
    );
    best = Math.min(best, val);
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseAiMove(state: GameState, depth = 3): Move | null {
  const moves = getAllLegalMoves(state);
  if (moves.length === 0) return null;

  const perspective = state.turn;
  let bestMove = moves[0]!;
  let bestScore = -Infinity;

  // Shuffle lightly for variety among equal scores
  const shuffled = [...moves].sort(() => Math.random() - 0.5);

  for (const move of shuffled) {
    const next = applyMove(state, move);
    const score = minimax(
      next,
      depth - 1,
      -Infinity,
      Infinity,
      next.turn === perspective,
      perspective,
    );
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}
