import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameState, Player, Position } from "@12pions/shared";
import Board from "../components/Board";
import GameChrome from "../components/GameChrome";
import { serverUrl } from "../config";
import { TIME_CONTROLS, useSyncedClocks, type Clocks } from "../hooks/useTurnClock";
import "./PlayPage.css";

type Phase = "form" | "queue" | "game";

/** Must match server QUEUE_TIMEOUT_MS */
const QUEUE_TIMEOUT_MS = 3 * 60 * 1000;

interface RoomPlayer {
  name: string;
  side: Player;
}

interface RoomPayload {
  roomId: string;
  state: GameState;
  players: RoomPlayer[];
  you?: Player;
  disconnected?: string;
  clocks?: Clocks | null;
  timeControlMs?: number | null;
}

function getClientId(): string {
  const key = "12pions:clientId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function formatQueueRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function OnlinePage() {
  const [name, setName] = useState(() => localStorage.getItem("12pions:name") ?? "");
  const [timeControlMs, setTimeControlMs] = useState<number | null>(3 * 60 * 1000);
  const [phase, setPhase] = useState<Phase>("form");
  const [you, setYou] = useState<Player | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [selected, setSelected] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusExtra, setStatusExtra] = useState<string | undefined>();
  const [serverClocks, setServerClocks] = useState<Clocks | null>(null);
  const [clockSync, setClockSync] = useState(0);
  const [queueEndsAt, setQueueEndsAt] = useState<number | null>(null);
  const [queueRemainingMs, setQueueRemainingMs] = useState(QUEUE_TIMEOUT_MS);
  const socketRef = useRef<Socket | null>(null);
  const youRef = useRef<Player | null>(null);
  /** Prevents re-joining the queue after a mid-game reconnect */
  const intentRef = useRef<"idle" | "queue" | "game">("idle");

  const southName = useMemo(
    () => players.find((p) => p.side === "south")?.name ?? "Sud",
    [players],
  );
  const northName = useMemo(
    () => players.find((p) => p.side === "north")?.name ?? "Nord",
    [players],
  );

  const clocks = useSyncedClocks({
    serverClocks,
    turn: state?.turn ?? "south",
    running: phase === "game" && !!state && !state.winner && serverClocks != null,
    syncKey: clockSync,
  });

  const cleanupSocket = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  useEffect(() => () => cleanupSocket(), [cleanupSocket]);

  useEffect(() => {
    if (phase !== "queue" || queueEndsAt == null) return;
    const tick = () => {
      setQueueRemainingMs(Math.max(0, queueEndsAt - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [phase, queueEndsAt]);

  function applyRoom(payload: RoomPayload) {
    setState(payload.state);
    setPlayers(payload.players);
    setServerClocks(payload.clocks ?? null);
    setClockSync((n) => n + 1);
    const side = youRef.current;
    setSelected(
      payload.state.chainFrom && side && payload.state.turn === side
        ? payload.state.chainFrom
        : null,
    );
  }

  function resetToForm(message?: string) {
    intentRef.current = "idle";
    cleanupSocket();
    setPhase("form");
    setQueueEndsAt(null);
    setQueueRemainingMs(QUEUE_TIMEOUT_MS);
    if (message) setError(message);
  }

  function joinQueue(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 24) || "Anonyme";
    localStorage.setItem("12pions:name", trimmed);
    setName(trimmed);
    setError(null);
    setStatusExtra(undefined);
    setServerClocks(null);
    setQueueEndsAt(Date.now() + QUEUE_TIMEOUT_MS);
    setQueueRemainingMs(QUEUE_TIMEOUT_MS);

    intentRef.current = "queue";
    cleanupSocket();
    const clientId = getClientId();
    const socket = io(serverUrl || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (intentRef.current !== "queue") return;
      setPhase("queue");
      socket.emit("queue:join", { name: trimmed, timeControlMs, clientId });
    });

    socket.on("queue:waiting", () => {
      if (intentRef.current !== "queue") return;
      setPhase("queue");
    });

    socket.on("queue:timeout", (payload: { message?: string }) => {
      resetToForm(
        payload?.message ?? "Aucun adversaire trouvé. Réessayez plus tard.",
      );
    });

    socket.on("game:matched", (payload: RoomPayload) => {
      intentRef.current = "game";
      setQueueEndsAt(null);
      setPhase("game");
      const side = payload.you ?? null;
      youRef.current = side;
      setYou(side);
      applyRoom(payload);
    });

    socket.on("game:state", (payload: RoomPayload) => {
      applyRoom(payload);
      if (payload.disconnected) {
        setStatusExtra(`${payload.disconnected} s’est déconnecté`);
      }
    });

    socket.on("game:error", (payload: { message: string }) => {
      setError(payload.message);
    });

    socket.on("connect_error", () => {
      resetToForm("Connexion au serveur impossible");
    });
  }

  function cancelQueue() {
    socketRef.current?.emit("queue:leave");
    resetToForm();
  }

  function rematchOnline() {
    intentRef.current = "idle";
    cleanupSocket();
    setPhase("form");
    setState(null);
    setYou(null);
    youRef.current = null;
    setPlayers([]);
    setSelected(null);
    setError(null);
    setStatusExtra(undefined);
    setServerClocks(null);
    setQueueEndsAt(null);
  }

  function handleMove(from: Position, to: Position) {
    setError(null);
    socketRef.current?.emit("game:move", { from, to });
  }

  function handleForfeit() {
    socketRef.current?.emit("game:forfeit");
  }

  function handleEndChain() {
    socketRef.current?.emit("game:end-chain");
  }

  const canPlay =
    !!state &&
    !!you &&
    !state.winner &&
    state.turn === you;

  const cadenceLabel =
    TIME_CONTROLS.find((c) => c.ms === timeControlMs)?.label ?? "Sans limite";

  return (
    <main className="page play">
      <header className="play__header">
        <h1>Partie en ligne</h1>
        <p>Jouer en ligne contre un autre joueur.</p>
      </header>

      {phase === "form" && (
        <form className="play__form" onSubmit={joinQueue}>
          <div className="field">
            <label htmlFor="online-name">Votre pseudo</label>
            <input
              id="online-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="Ex. Awa"
              required
            />
          </div>
          <fieldset className="field play__time">
            <legend>Cadence</legend>
            <div className="play__time-options" role="radiogroup" aria-label="Cadence">
              {TIME_CONTROLS.map((opt) => {
                const id = `online-time-${opt.ms ?? "none"}`;
                const selected = timeControlMs === opt.ms;
                return (
                  <label key={id} className={`play__time-option ${selected ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="online-time"
                      value={opt.ms ?? ""}
                      checked={selected}
                      onChange={() => setTimeControlMs(opt.ms)}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <button type="submit" className="btn btn--primary">
            Trouver une partie
          </button>
          {error && <p className="play__error">{error}</p>}
        </form>
      )}

      {phase === "queue" && (
        <div className="play__queue">
          <div className="play__spinner" aria-hidden="true" />
          <p>Recherche d’un adversaire ({cadenceLabel})…</p>
          <p className="play__queue-timer" aria-live="polite">
            Temps restant : {formatQueueRemaining(queueRemainingMs)}
          </p>
          <button type="button" className="btn btn--secondary" onClick={cancelQueue}>
            Annuler
          </button>
        </div>
      )}

      {phase === "game" && state && (
        <div className="play__layout">
          <GameChrome
            state={state}
            southName={southName}
            northName={northName}
            you={you}
            clocks={clocks}
            statusExtra={statusExtra}
            onForfeit={you && !state.winner ? handleForfeit : undefined}
            onRematchOnline={rematchOnline}
            onEndChain={canPlay && state.chainFrom ? handleEndChain : undefined}
          >
            <Board
              state={state}
              interactive={canPlay}
              perspective={you ?? "south"}
              selected={selected}
              onSelect={setSelected}
              onMove={handleMove}
              highlightSide={you}
            />
          </GameChrome>
          {error && <p className="play__error">{error}</p>}
        </div>
      )}
    </main>
  );
}
