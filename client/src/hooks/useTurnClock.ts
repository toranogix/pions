import { useEffect, useRef, useState } from "react";
import type { Player } from "@12pions/shared";

export type Clocks = Record<Player, number>;

export const TIME_CONTROLS = [
  { label: "Sans limite", ms: null },
  { label: "3 min", ms: 3 * 60 * 1000 },
  { label: "10 min", ms: 10 * 60 * 1000 },
] as const;

export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Client-side chess clock: only the side to move ticks down */
export function useTurnClock(options: {
  running: boolean;
  timeControlMs: number | null;
  turn: Player;
  resetToken: number;
  onTimeout: (loser: Player) => void;
}): Clocks | null {
  const { running, timeControlMs, turn, resetToken, onTimeout } = options;
  const [clocks, setClocks] = useState<Clocks | null>(null);
  const turnRef = useRef(turn);
  const onTimeoutRef = useRef(onTimeout);
  const timedOutRef = useRef(false);

  turnRef.current = turn;
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    timedOutRef.current = false;
    if (timeControlMs == null) {
      setClocks(null);
      return;
    }
    setClocks({ south: timeControlMs, north: timeControlMs });
  }, [timeControlMs, resetToken]);

  useEffect(() => {
    if (!running || timeControlMs == null || clocks == null) return;

    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      const side = turnRef.current;

      setClocks((prev) => {
        if (!prev || timedOutRef.current) return prev;
        const remaining = prev[side];
        if (remaining <= 0) return prev;
        const nextVal = Math.max(0, remaining - delta);
        if (nextVal <= 0) {
          timedOutRef.current = true;
          queueMicrotask(() => onTimeoutRef.current(side));
        }
        return { ...prev, [side]: nextVal };
      });
    }, 100);

    return () => window.clearInterval(id);
  }, [running, timeControlMs, clocks == null]);

  return clocks;
}

/** Smooth local countdown from server-synced remaining times */
export function useSyncedClocks(options: {
  serverClocks: Clocks | null;
  turn: Player;
  running: boolean;
  syncKey: number;
}): Clocks | null {
  const { serverClocks, turn, running, syncKey } = options;
  const [clocks, setClocks] = useState<Clocks | null>(serverClocks);
  const turnRef = useRef(turn);
  turnRef.current = turn;

  useEffect(() => {
    setClocks(serverClocks);
  }, [serverClocks, syncKey]);

  useEffect(() => {
    if (!running || !clocks) return;

    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      const side = turnRef.current;
      setClocks((prev) => {
        if (!prev) return prev;
        return { ...prev, [side]: Math.max(0, prev[side] - delta) };
      });
    }, 100);

    return () => window.clearInterval(id);
  }, [running, clocks != null, syncKey]);

  return clocks;
}
