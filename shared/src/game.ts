export const BOARD_SIZE = 5;
export const CENTER = { row: 2, col: 2 } as const;
export const DRAW_MOVE_LIMIT = 40;

export type Player = "south" | "north";
export type PieceKind = "pawn" | "dame";

export interface Piece {
  player: Player;
  kind: PieceKind;
}

export type Cell = Piece | null;
export type Board = Cell[][];

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  /** Captured piece position, if any */
  capture?: Position;
}

export interface GameState {
  board: Board;
  turn: Player;
  /** When set, player must continue a capture chain from this square */
  chainFrom: Position | null;
  /** Direction of last jump in chain (to forbid 180° reverse) */
  lastJumpDir: Position | null;
  winner: Player | "draw" | null;
  movesWithoutCapture: number;
  captured: Record<Player, number>;
}

export const opponent = (p: Player): Player => (p === "south" ? "north" : "south");

export const promotionRow = (p: Player): number => (p === "south" ? 0 : 4);

export function posKey(p: Position): string {
  return `${p.row},${p.col}`;
}

export function samePos(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  );

  // North (burgundy): rows 0–1 + row 2 cols 0–1
  for (let col = 0; col < BOARD_SIZE; col++) {
    board[0][col] = { player: "north", kind: "pawn" };
    board[1][col] = { player: "north", kind: "pawn" };
  }
  board[2][0] = { player: "north", kind: "pawn" };
  board[2][1] = { player: "north", kind: "pawn" };

  // South (terracotta): rows 3–4 + row 2 cols 3–4
  for (let col = 0; col < BOARD_SIZE; col++) {
    board[3][col] = { player: "south", kind: "pawn" };
    board[4][col] = { player: "south", kind: "pawn" };
  }
  board[2][3] = { player: "south", kind: "pawn" };
  board[2][4] = { player: "south", kind: "pawn" };

  // Center stays empty
  board[CENTER.row][CENTER.col] = null;

  return board;
}

export function createInitialState(first: Player = "south"): GameState {
  return {
    board: createInitialBoard(),
    turn: first,
    chainFrom: null,
    lastJumpDir: null,
    winner: null,
    movesWithoutCapture: 0,
    captured: { south: 0, north: 0 },
  };
}

const ORTHO: Position[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

/** Unit step toward the opponent's last rank */
export function forwardDir(player: Player): Position {
  return player === "south" ? { row: -1, col: 0 } : { row: 1, col: 0 };
}

/** Pawns may not retreat toward their own camp (only dames may) */
function isBackwardForPawn(player: Player, dir: Position): boolean {
  const fwd = forwardDir(player);
  return dir.row === -fwd.row && dir.col === -fwd.col;
}

function isReverse(dir: Position, last: Position | null): boolean {
  if (!last) return false;
  return dir.row === -last.row && dir.col === -last.col;
}

function maybePromote(piece: Piece, row: number): Piece {
  if (piece.kind === "dame") return piece;
  if (row === promotionRow(piece.player)) {
    return { player: piece.player, kind: "dame" };
  }
  return piece;
}

/** Quiet (non-capture) moves for a piece at `from`. Not available during a chain */
function quietMoves(board: Board, from: Position, piece: Piece): Move[] {
  const moves: Move[] = [];

  if (piece.kind === "pawn") {
    for (const d of ORTHO) {
      if (isBackwardForPawn(piece.player, d)) continue;
      const r = from.row + d.row;
      const c = from.col + d.col;
      if (inBounds(r, c) && board[r][c] === null) {
        moves.push({ from, to: { row: r, col: c } });
      }
    }
    return moves;
  }

  // Dame: slide any number of empty squares
  for (const d of ORTHO) {
    let r = from.row + d.row;
    let c = from.col + d.col;
    while (inBounds(r, c) && board[r][c] === null) {
      moves.push({ from, to: { row: r, col: c } });
      r += d.row;
      c += d.col;
    }
  }
  return moves;
}

/** Capture moves for a piece at `from`, respecting chain reverse rule */
function captureMoves(
  board: Board,
  from: Position,
  piece: Piece,
  lastJumpDir: Position | null,
): Move[] {
  const moves: Move[] = [];
  const enemy = opponent(piece.player);

  if (piece.kind === "pawn") {
    for (const d of ORTHO) {
      if (isBackwardForPawn(piece.player, d)) continue;
      if (isReverse(d, lastJumpDir)) continue;
      const midR = from.row + d.row;
      const midC = from.col + d.col;
      const landR = from.row + 2 * d.row;
      const landC = from.col + 2 * d.col;
      if (!inBounds(landR, landC)) continue;
      const mid = board[midR][midC];
      if (mid && mid.player === enemy && board[landR][landC] === null) {
        moves.push({
          from,
          to: { row: landR, col: landC },
          capture: { row: midR, col: midC },
        });
      }
    }
    return moves;
  }

  // Dame: all orthogonal directions (may retreat). After the captured piece,
  // she may land on any empty square beyond it until blocked
  for (const d of ORTHO) {
    if (isReverse(d, lastJumpDir)) continue;
    let r = from.row + d.row;
    let c = from.col + d.col;
    // Slide over empty squares until we hit a piece
    while (inBounds(r, c) && board[r][c] === null) {
      r += d.row;
      c += d.col;
    }
    if (!inBounds(r, c)) continue;
    const mid = board[r][c];
    if (!mid || mid.player !== enemy) continue;
    // Land on any empty square past the captured piece
    let landR = r + d.row;
    let landC = c + d.col;
    while (inBounds(landR, landC) && board[landR][landC] === null) {
      moves.push({
        from,
        to: { row: landR, col: landC },
        capture: { row: r, col: c },
      });
      landR += d.row;
      landC += d.col;
    }
  }
  return moves;
}

export function getMovesForPiece(state: GameState, from: Position): Move[] {
  if (state.winner) return [];
  const piece = state.board[from.row][from.col];
  if (!piece || piece.player !== state.turn) return [];

  // Mid-chain: only captures from chainFrom
  if (state.chainFrom) {
    if (!samePos(from, state.chainFrom)) return [];
    return captureMoves(state.board, from, piece, state.lastJumpDir);
  }

  return [
    ...quietMoves(state.board, from, piece),
    ...captureMoves(state.board, from, piece, null),
  ];
}

export function getAllLegalMoves(state: GameState): Move[] {
  if (state.winner) return [];
  const moves: Move[] = [];

  if (state.chainFrom) {
    return getMovesForPiece(state, state.chainFrom);
  }

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = state.board[row][col];
      if (cell && cell.player === state.turn) {
        moves.push(...getMovesForPiece(state, { row, col }));
      }
    }
  }
  return moves;
}

function countPieces(board: Board, player: Player): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell?.player === player) n++;
    }
  }
  return n;
}

function applyPromotion(board: Board, pos: Position): void {
  const piece = board[pos.row][pos.col];
  if (!piece) return;
  board[pos.row][pos.col] = maybePromote(piece, pos.row);
}

export function applyMove(state: GameState, move: Move): GameState {
  const legal = getMovesForPiece(state, move.from).find(
    (m) =>
      samePos(m.to, move.to) &&
      ((!m.capture && !move.capture) ||
        (m.capture && move.capture && samePos(m.capture, move.capture)) ||
        (m.capture && !move.capture && samePos(m.to, move.to))),
  );

  // Also accept move identified only by from/to
  const matched =
    legal ??
    getMovesForPiece(state, move.from).find((m) => samePos(m.to, move.to));

  if (!matched) {
    throw new Error("Coup illégal");
  }

  const board = cloneBoard(state.board);
  const piece = board[matched.from.row][matched.from.col]!;
  board[matched.from.row][matched.from.col] = null;
  board[matched.to.row][matched.to.col] = piece;

  let captured = { ...state.captured };
  let movesWithoutCapture = state.movesWithoutCapture;
  let chainFrom: Position | null = null;
  let lastJumpDir: Position | null = null;
  let turn = state.turn;

  if (matched.capture) {
    board[matched.capture.row][matched.capture.col] = null;
    captured = {
      ...captured,
      [state.turn]: captured[state.turn] + 1,
    };
    movesWithoutCapture = 0;

    const dir = {
      row: Math.sign(matched.to.row - matched.from.row) || 0,
      col: Math.sign(matched.to.col - matched.from.col) || 0,
    };

    applyPromotion(board, matched.to);
    const afterPiece = board[matched.to.row][matched.to.col]!;

    const further = captureMoves(board, matched.to, afterPiece, dir);
    if (further.length > 0) {
      chainFrom = matched.to;
      lastJumpDir = dir;
    } else {
      turn = opponent(state.turn);
    }
  } else {
    applyPromotion(board, matched.to);
    movesWithoutCapture += 1;
    turn = opponent(state.turn);
  }

  let winner: GameState["winner"] = null;

  if (countPieces(board, opponent(state.turn)) === 0) {
    winner = state.turn;
  } else if (movesWithoutCapture >= DRAW_MOVE_LIMIT) {
    winner = "draw";
  } else if (!chainFrom) {
    // Check if the next player has any move
    const nextState: GameState = {
      board,
      turn,
      chainFrom: null,
      lastJumpDir: null,
      winner: null,
      movesWithoutCapture,
      captured,
    };
    if (getAllLegalMoves(nextState).length === 0) {
      winner = state.turn;
    }
  }

  return {
    board,
    turn: winner ? state.turn : turn,
    chainFrom: winner ? null : chainFrom,
    lastJumpDir: winner ? null : lastJumpDir,
    winner,
    movesWithoutCapture,
    captured,
  };
}

export function tryApplyMove(
  state: GameState,
  from: Position,
  to: Position,
): GameState | null {
  try {
    return applyMove(state, { from, to });
  } catch {
    return null;
  }
}

/** End a capture chain voluntarily (allowed, captures are never forced) */
export function endChain(state: GameState): GameState {
  if (!state.chainFrom || state.winner) {
    throw new Error("Aucune chaîne en cours");
  }

  const turn = opponent(state.turn);
  const next: GameState = {
    ...state,
    board: cloneBoard(state.board),
    turn,
    chainFrom: null,
    lastJumpDir: null,
    captured: { ...state.captured },
  };

  if (getAllLegalMoves(next).length === 0) {
    return {
      ...next,
      winner: state.turn,
      turn: state.turn,
    };
  }

  return next;
}

/** Serialize for network transfer */
export function serializeState(state: GameState): GameState {
  return {
    ...state,
    board: cloneBoard(state.board),
    chainFrom: state.chainFrom ? { ...state.chainFrom } : null,
    lastJumpDir: state.lastJumpDir ? { ...state.lastJumpDir } : null,
    captured: { ...state.captured },
  };
}
