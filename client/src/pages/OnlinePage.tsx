import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameState, Player, Position } from "@12pions/shared";
import Board from "../components/Board";
import GameChrome from "../components/GameChrome";
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
}

export default function OnlinePage() {
  const [name, setName] = useState(() => localStorage.getItem("12pions:name") ?? "");
  const [phase, setPhase] = useState<Phase>("form");
  const [you, setYou] = useState<Player | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [selected, setSelected] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusExtra, setStatusExtra] = useState<string | undefined>();
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

  const cleanupSocket = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  useEffect(() => () => cleanupSocket(), [cleanupSocket]);

  function joinQueue(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 24) || "Anonyme";
    localStorage.setItem("12pions:name", trimmed);
    setName(trimmed);
    setError(null);
    setStatusExtra(undefined);

    cleanupSocket();
    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setPhase("queue");
      socket.emit("queue:join", { name: trimmed });
    });

    socket.on("queue:waiting", () => {
      setPhase("queue");
    });

    socket.on("game:matched", (payload: RoomPayload) => {
      setPhase("game");
      const side = payload.you ?? null;
      youRef.current = side;
      setYou(side);
      setState(payload.state);
      setPlayers(payload.players);
      setSelected(
        payload.state.chainFrom && side && payload.state.turn === side
          ? payload.state.chainFrom
          : null,
      );
    });

    socket.on("game:state", (payload: RoomPayload) => {
      setState(payload.state);
      setPlayers(payload.players);
      const side = youRef.current;
      setSelected(
        payload.state.chainFrom && side && payload.state.turn === side
          ? payload.state.chainFrom
          : null,
      );
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

  return (
    <main className="page play">
      <header className="play__header">
        <h1>Partie en ligne</h1>
        <p>Matchmaking rapide contre un autre joueur.</p>
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
          <button type="submit" className="btn btn--primary">
            Trouver une partie
          </button>
          {error && <p className="play__error">{error}</p>}
        </form>
      )}

      {phase === "queue" && (
        <div className="play__queue">
          <div className="play__spinner" aria-hidden="true" />
          <p>Recherche d’un adversaire…</p>
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
            statusExtra={statusExtra}
            onForfeit={canPlay ? handleForfeit : undefined}
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
