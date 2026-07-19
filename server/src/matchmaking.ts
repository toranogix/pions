import { randomUUID } from "node:crypto";
import {applyMove, createInitialState, endChain, getAllLegalMoves, type GameState, type Player, type Position} from "@12pions/shared";
import { recordResult } from "./db.js";

export type TimeControlMs = number | null;

export interface QueuedPlayer {
  socketId: string;
  name: string;
  timeControlMs: TimeControlMs;
}

export interface RoomPlayer {
  socketId: string;
  name: string;
  side: Player;
}

export interface Clocks {
  south: number;
  north: number;
}

export interface Room {
  id: string;
  players: RoomPlayer[];
  state: GameState;
  scored: boolean;
  timeControlMs: TimeControlMs;
  clocks: Clocks | null;
  turnStartedAt: number | null;
}

const queue: QueuedPlayer[] = [];
const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();

const VALID_TIME_CONTROLS = new Set([3 * 60 * 1000, 10 * 60 * 1000]);

export function normalizeTimeControl(value: unknown): TimeControlMs {
  if (value == null || value === "" || value === 0) return null;
  const n = Number(value);
  if (!VALID_TIME_CONTROLS.has(n)) return null;
  return n;
}

export function getQueueLength(): number {
  return queue.length;
}

export function enqueue(
  socketId: string,
  name: string,
  timeControlMs: TimeControlMs = null,
): { waiting: true } | { matched: Room } {
  const idx = queue.findIndex((q) => q.socketId === socketId);
  if (idx >= 0) queue.splice(idx, 1);

  const player: QueuedPlayer = {
    socketId,
    name: name.trim().slice(0, 24) || "Anonyme",
    timeControlMs,
  };

  const matchIdx = queue.findIndex((q) => q.timeControlMs === timeControlMs);
  if (matchIdx >= 0) {
    const opponent = queue.splice(matchIdx, 1)[0]!;
    const room = createRoom(opponent, player, timeControlMs);
    return { matched: room };
  }

  queue.push(player);
  return { waiting: true };
}

export function leaveQueue(socketId: string): void {
  const idx = queue.findIndex((q) => q.socketId === socketId);
  if (idx >= 0) queue.splice(idx, 1);
}

function createRoom(a: QueuedPlayer, b: QueuedPlayer, timeControlMs: TimeControlMs): Room {
  const id = randomUUID();
  const southFirst = Math.random() < 0.5;
  const players: RoomPlayer[] = southFirst
    ? [
        { socketId: a.socketId, name: a.name, side: "south" },
        { socketId: b.socketId, name: b.name, side: "north" },
      ]
    : [
        { socketId: a.socketId, name: a.name, side: "north" },
        { socketId: b.socketId, name: b.name, side: "south" },
      ];

  const now = Date.now();
  const room: Room = {
    id,
    players,
    state: createInitialState("south"),
    scored: false,
    timeControlMs,
    clocks: timeControlMs == null ? null : { south: timeControlMs, north: timeControlMs },
    turnStartedAt: timeControlMs == null ? null : now,
  };

  rooms.set(id, room);
  socketToRoom.set(a.socketId, id);
  socketToRoom.set(b.socketId, id);
  return room;
}

export function getRoomForSocket(socketId: string): Room | undefined {
  const id = socketToRoom.get(socketId);
  if (!id) return undefined;
  return rooms.get(id);
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

function liveClocks(room: Room, at = Date.now()): Clocks | null {
  if (!room.clocks) return null;
  const clocks = { ...room.clocks };
  if (room.turnStartedAt != null && !room.state.winner) {
    const elapsed = Math.max(0, at - room.turnStartedAt);
    const side = room.state.turn;
    clocks[side] = Math.max(0, clocks[side] - elapsed);
  }
  return clocks;
}

function flagCurrentPlayer(room: Room, at = Date.now()): boolean {
  if (!room.clocks || room.turnStartedAt == null || room.state.winner) return false;
  const side = room.state.turn;
  const remaining = room.clocks[side] - Math.max(0, at - room.turnStartedAt);
  if (remaining > 0) return false;
  room.clocks[side] = 0;
  const winner = side === "south" ? "north" : "south";
  room.state = { ...room.state, winner, chainFrom: null, lastJumpDir: null };
  room.turnStartedAt = null;
  maybeScore(room);
  return true;
}

/** Deduct elapsed time from the player who just finished their turn */
function passClock(room: Room, previousTurn: Player, at = Date.now()): void {
  if (!room.clocks || room.turnStartedAt == null) return;
  const elapsed = Math.max(0, at - room.turnStartedAt);
  room.clocks[previousTurn] = Math.max(0, room.clocks[previousTurn] - elapsed);
  room.turnStartedAt = room.state.winner ? null : at;
}

export function playMove(
  socketId: string,
  from: Position,
  to: Position,
): { ok: true; room: Room } | { ok: false; error: string } {
  const room = getRoomForSocket(socketId);
  if (!room) return { ok: false, error: "Aucune partie en cours" };
  if (room.state.winner) return { ok: false, error: "Partie terminée" };

  const player = room.players.find((p) => p.socketId === socketId);
  if (!player) return { ok: false, error: "Joueur introuvable" };
  if (player.side !== room.state.turn) {
    return { ok: false, error: "Ce n'est pas votre tour" };
  }

  if (flagCurrentPlayer(room)) {
    return { ok: true, room };
  }

  const previousTurn = room.state.turn;
  try {
    room.state = applyMove(room.state, { from, to });
  } catch {
    return { ok: false, error: "Coup illégal" };
  }

  if (room.clocks && (room.state.turn !== previousTurn || room.state.winner)) {
    passClock(room, previousTurn);
  }

  maybeScore(room);
  return { ok: true, room };
}

export function endPlayerChain(
  socketId: string,
): { ok: true; room: Room } | { ok: false; error: string } {
  const room = getRoomForSocket(socketId);
  if (!room) return { ok: false, error: "Aucune partie en cours" };
  if (room.state.winner) return { ok: false, error: "Partie terminée" };

  const player = room.players.find((p) => p.socketId === socketId);
  if (!player) return { ok: false, error: "Joueur introuvable" };
  if (player.side !== room.state.turn) {
    return { ok: false, error: "Ce n'est pas votre tour" };
  }
  if (!room.state.chainFrom) {
    return { ok: false, error: "Aucune chaîne à terminer" };
  }

  if (flagCurrentPlayer(room)) {
    return { ok: true, room };
  }

  const previousTurn = room.state.turn;
  try {
    room.state = endChain(room.state);
  } catch {
    return { ok: false, error: "Impossible de terminer la chaîne" };
  }

  if (room.clocks && (room.state.turn !== previousTurn || room.state.winner)) {
    passClock(room, previousTurn);
  }

  maybeScore(room);
  return { ok: true, room };
}

function maybeScore(room: Room): void {
  if (room.scored || !room.state.winner || room.state.winner === "draw") return;
  room.scored = true;
  const winner = room.players.find((p) => p.side === room.state.winner);
  const loser = room.players.find((p) => p.side !== room.state.winner);
  if (winner && loser) {
    recordResult(winner.name, loser.name);
  }
}

export function forfeit(
  socketId: string,
): { room: Room; forfeiter: RoomPlayer } | null {
  const room = getRoomForSocket(socketId);
  if (!room || room.state.winner) return null;

  const forfeiter = room.players.find((p) => p.socketId === socketId);
  if (!forfeiter) return null;

  const winnerSide = forfeiter.side === "south" ? "north" : "south";
  room.state = { ...room.state, winner: winnerSide, chainFrom: null };
  room.turnStartedAt = null;
  maybeScore(room);
  return { room, forfeiter };
}

export function disconnectSocket(socketId: string): {
  room?: Room;
  forfeiter?: RoomPlayer;
} {
  leaveQueue(socketId);
  const result = forfeit(socketId);
  const roomId = socketToRoom.get(socketId);
  socketToRoom.delete(socketId);

  if (result) {
    return result;
  }

  if (roomId) {
    const room = rooms.get(roomId);
    if (room) {
      const stillConnected = room.players.some((p) => socketToRoom.has(p.socketId));
      if (!stillConnected && room.state.winner) {
        rooms.delete(roomId);
      }
    }
  }

  return {};
}

/** Check all timed games for flag falls; returns rooms that changed */
export function checkTimeouts(): Room[] {
  const updated: Room[] = [];
  for (const room of rooms.values()) {
    if (flagCurrentPlayer(room)) {
      updated.push(room);
    }
  }
  return updated;
}

export function roomPayload(room: Room) {
  return {
    roomId: room.id,
    state: room.state,
    players: room.players.map((p) => ({
      name: p.name,
      side: p.side,
    })),
    legalMoveCount: getAllLegalMoves(room.state).length,
    timeControlMs: room.timeControlMs,
    clocks: liveClocks(room),
  };
}
