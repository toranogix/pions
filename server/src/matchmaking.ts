import { randomUUID } from "node:crypto";
import {applyMove, createInitialState, endChain, getAllLegalMoves, type GameState, type Player, type Position} from "@12pions/shared";
import { recordResult } from "./db.js";

export interface QueuedPlayer {
  socketId: string;
  name: string;
}

export interface RoomPlayer {
  socketId: string;
  name: string;
  side: Player;
}

export interface Room {
  id: string;
  players: RoomPlayer[];
  state: GameState;
  scored: boolean;
}

const queue: QueuedPlayer[] = [];
const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();

export function getQueueLength(): number {
  return queue.length;
}

export function enqueue(socketId: string, name: string): { waiting: true } | { matched: Room } {
  // Remove if already queued
  const idx = queue.findIndex((q) => q.socketId === socketId);
  if (idx >= 0) queue.splice(idx, 1);

  queue.push({ socketId, name: name.trim().slice(0, 24) || "Anonyme" });

  if (queue.length >= 2) {
    const a = queue.shift()!;
    const b = queue.shift()!;
    const room = createRoom(a, b);
    return { matched: room };
  }

  return { waiting: true };
}

export function leaveQueue(socketId: string): void {
  const idx = queue.findIndex((q) => q.socketId === socketId);
  if (idx >= 0) queue.splice(idx, 1);
}

function createRoom(a: QueuedPlayer, b: QueuedPlayer): Room {
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

  const room: Room = {
    id,
    players,
    state: createInitialState("south"),
    scored: false,
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

  try {
    room.state = applyMove(room.state, { from, to });
  } catch {
    return { ok: false, error: "Coup illégal" };
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

  try {
    room.state = endChain(room.state);
  } catch {
    return { ok: false, error: "Impossible de terminer la chaîne" };
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
    // Keep room briefly so opponent sees result; remove mapping for leaver
    return result;
  }

  if (roomId) {
    const room = rooms.get(roomId);
    if (room && room.players.every((p) => p.socketId !== socketId || true)) {
      // If both gone, delete
      const stillConnected = room.players.some((p) => socketToRoom.has(p.socketId));
      if (!stillConnected && room.state.winner) {
        rooms.delete(roomId);
      }
    }
  }

  return {};
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
  };
}
