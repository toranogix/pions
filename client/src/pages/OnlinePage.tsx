import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameState, Player, Position } from "@12pions/shared";
import Board from "../components/Board";
import GameChrome from "../components/GameChrome";
import { serverUrl } from "../config";
import { TIME_CONTROLS, useSyncedClocks, type Clocks } from "../hooks/useTurnClock";
import "./PlayPage.css";

type Phase = "form" | "queue" | "game";

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
  const socketRef = useRef<Socket | null>(null);
  const youRef = useRef<Player | null>(null);

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

  function joinQueue(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 24) || "Anonyme";
    localStorage.setItem("12pions:name", trimmed);
    setName(trimmed);
    setError(null);
    setStatusExtra(undefined);
    setServerClocks(null);

    cleanupSocket();
    const socket = io(serverUrl || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setPhase("queue");
      socket.emit("queue:join", { name: trimmed, timeControlMs });
    });

    socket.on("queue:waiting", () => {
      setPhase("queue");
    });

    socket.on("game:matched", (payload: RoomPayload) => {
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
      setError("Connexion au serveur impossible");
      setPhase("form");
    });
  }

  function cancelQueue() {
    socketRef.current?.emit("queue:leave");
    cleanupSocket();
    setPhase("form");
  }

  function rematchOnline() {
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
            onForfeit={canPlay ? handleForfeit : undefined}
            onRematchOnline={rematchOnline}
            onEndChain={canPlay && state.chainFrom ? handleEndChain : undefined}
          />
          <Board
            state={state}
            interactive={canPlay}
            selected={selected}
            onSelect={setSelected}
            onMove={handleMove}
            highlightSide={you}
          />
          {error && <p className="play__error">{error}</p>}
        </div>
      )}
    </main>
  );
}
