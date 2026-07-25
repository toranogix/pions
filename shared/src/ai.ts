import type { GameState, Move, Player } from "./game.js";
import {applyMove, endChain, getAllLegalMoves, opponent, BOARD_SIZE} from "./game.js";

const PAWN_VALUE = 10;
const DAME_VALUE = 28;

export type AiDifficulty = "easy" | "medium" | "hard" | "master";

export const AI_LEVELS: Record<
  AiDifficulty,
  { label: string; depth: number; blunderChance: number; thinkMs: number }
> = {
  easy: { label: "Facile", depth: 1, blunderChance: 0.42, thinkMs: 280 },
  medium: { label: "Moyen", depth: 2, blunderChance: 0.14, thinkMs: 400 },
  hard: { label: "Difficile", depth: 4, blunderChance: 0, thinkMs: 550 },
  master: { label: "Master", depth: 5, blunderChance: 0, thinkMs: 700 },
};

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

function scoreMoves(
  state: GameState,
  moves: Move[],
  depth: number,
): { move: Move; score: number }[] {
  const perspective = state.turn;
  return moves.map((move) => {
    const next = applyMove(state, move);
    const score = minimax(
      next,
      depth - 1,
      -Infinity,
      Infinity,
      next.turn === perspective,
      perspective,
    );
    return { move, score };
  });
}

export function chooseAiMove(
  state: GameState,
  difficulty: AiDifficulty | number = "medium",
): Move | null {
  const moves = getAllLegalMoves(state);
  if (moves.length === 0) return null;

  const level =
    typeof difficulty === "number"
      ? { depth: difficulty, blunderChance: 0 }
      : AI_LEVELS[difficulty];

  // Shuffle lightly for variety among equal scores
  const shuffled = [...moves].sort(() => Math.random() - 0.5);
  const ranked = scoreMoves(state, shuffled, level.depth).sort(
    (a, b) => b.score - a.score,
  );

  // Mid-chain: also consider stopping voluntarily
  if (state.chainFrom) {
    try {
      const stopped = endChain(state);
      const stopScore = minimax(
        stopped,
        level.depth - 1,
        -Infinity,
        Infinity,
        stopped.turn === state.turn,
        state.turn,
      );
      if (stopScore > (ranked[0]?.score ?? -Infinity)) {
        return null; // signal caller to end the chain
      }
    } catch {
      // ignore
    }
  }

  if (level.blunderChance > 0 && Math.random() < level.blunderChance && ranked.length > 1) {
    // Prefer a clearly weaker move when blundering
    const weakPool = ranked.slice(Math.max(1, Math.floor(ranked.length / 2)));
    return weakPool[Math.floor(Math.random() * weakPool.length)]!.move;
  }

  return ranked[0]!.move;
}
