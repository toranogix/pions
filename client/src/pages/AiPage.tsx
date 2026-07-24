import { useEffect, useRef, useState, startTransition, useCallback } from "react";
import {AI_LEVELS, applyMove, chooseAiMove, createInitialState, endChain, type AiDifficulty, type GameState, type Player, type Position} from "@12pions/shared";
import Board from "../components/Board";
import GameChrome from "../components/GameChrome";
import { apiUrl } from "../config";
import { TIME_CONTROLS, useTurnClock } from "../hooks/useTurnClock";
import "./PlayPage.css";

const HUMAN: Player = "south";
const AI: Player = "north";

const DIFFICULTY_ORDER: AiDifficulty[] = ["easy", "medium", "hard", "master"];

function loadDifficulty(): AiDifficulty {
  const saved = localStorage.getItem("12pions:aiDifficulty");
  if (saved && saved in AI_LEVELS) return saved as AiDifficulty;
  return "medium";
}

export default function AiPage() {
  const [name, setName] = useState(() => localStorage.getItem("12pions:name") ?? "");
  const [timeControlMs, setTimeControlMs] = useState<number | null>(3 * 60 * 1000);
  const [difficulty, setDifficulty] = useState<AiDifficulty>(loadDifficulty);
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<GameState>(() => createInitialState(HUMAN));
  const [selected, setSelected] = useState<Position | null>(null);
  const [thinking, setThinking] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const scoredRef = useRef(false);
  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;

  const humanName = name.trim() || "Vous";
  const level = AI_LEVELS[difficulty];

  const handleTimeout = useCallback((loser: Player) => {
    setState((prev) => {
      if (prev.winner) return prev;
      const winner = loser === "south" ? "north" : "south";
      return { ...prev, winner, chainFrom: null, lastJumpDir: null };
    });
    setThinking(false);
    setSelected(null);
  }, []);

  const clocks = useTurnClock({
    running: started && !state.winner,
    timeControlMs: started ? timeControlMs : null,
    turn: state.turn,
    resetToken: gameKey,
    onTimeout: handleTimeout,
  });

  function startGame(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 24);
    if (trimmed) localStorage.setItem("12pions:name", trimmed);
    localStorage.setItem("12pions:aiDifficulty", difficulty);
    setName(trimmed);
    scoredRef.current = false;
    setState(createInitialState(HUMAN));
    setSelected(null);
    setGameKey((k) => k + 1);
    setStarted(true);
  }

  function newGame() {
    scoredRef.current = false;
    setState(createInitialState(HUMAN));
    setSelected(null);
    setGameKey((k) => k + 1);
  }

  function handleMove(from: Position, to: Position) {
    if (state.winner || state.turn !== HUMAN || thinking) return;
    try {
      const next = applyMove(state, { from, to });
      startTransition(() => {
        setState(next);
        setSelected(next.chainFrom);
      });
    } catch {
      // ignore illegal
    }
  }

  function handleEndChain() {
    if (state.winner || state.turn !== HUMAN || !state.chainFrom || thinking) return;
    try {
      setState(endChain(state));
      setSelected(null);
    } catch {
      // ignore
    }
  }

  function handleForfeit() {
    if (state.winner) return;
    setThinking(false);
    setSelected(null);
    setState((prev) =>
      prev.winner
        ? prev
        : { ...prev, winner: AI, chainFrom: null, lastJumpDir: null },
    );
  }

  // AI turn
  useEffect(() => {
    if (!started || state.winner || state.turn !== AI) return;

    let cancelled = false;
    const currentLevel = AI_LEVELS[difficultyRef.current];
    setThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseAiMove(state, difficultyRef.current);
      if (cancelled || !move) {
        setThinking(false);
        return;
      }
      try {
        const next = applyMove(state, move);
        setState(next);
        setSelected(next.chainFrom && next.turn === HUMAN ? next.chainFrom : null);
      } finally {
        if (!cancelled) setThinking(false);
      }
    }, currentLevel.thinkMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [started, state]);

  // Record score once
  useEffect(() => {
    if (!state.winner || state.winner === "draw" || scoredRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    scoredRef.current = true;
    const won = state.winner === HUMAN;
    void fetch(apiUrl("/api/ai-result"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, won }),
    });
  }, [state.winner, name]);

  const canPlay = started && !state.winner && state.turn === HUMAN && !thinking;

  return (
    <main className="page play">
      <header className="play__header">
        <h1>Contre l’ordinateur</h1>
        <p>Vous jouez les pions blancs.</p>
      </header>

      {!started && (
        <form className="play__form" onSubmit={startGame}>
          <div className="field">
            <label htmlFor="ai-name">Pseudo (optionnel, pour le classement)</label>
            <input
              id="ai-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="Ex. Moussa"
            />
          </div>
          <fieldset className="field play__time">
            <legend>Niveau</legend>
            <div className="play__time-options" role="radiogroup" aria-label="Niveau">
              {DIFFICULTY_ORDER.map((key) => {
                const opt = AI_LEVELS[key];
                const id = `ai-level-${key}`;
                const selected = difficulty === key;
                return (
                  <label key={id} className={`play__time-option ${selected ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="ai-level"
                      value={key}
                      checked={selected}
                      onChange={() => setDifficulty(key)}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="field play__time">
            <legend>Cadence</legend>
            <div className="play__time-options" role="radiogroup" aria-label="Cadence">
              {TIME_CONTROLS.map((opt) => {
                const id = `ai-time-${opt.ms ?? "none"}`;
                const selected = timeControlMs === opt.ms;
                return (
                  <label key={id} className={`play__time-option ${selected ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="ai-time"
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
            Commencer
          </button>
        </form>
      )}

      {started && (
        <div className="play__layout">
          <GameChrome
            state={state}
            southName={humanName}
            northName={`Ordinateur · ${level.label}`}
            you={HUMAN}
            clocks={clocks}
            // statusExtra={thinking ? "L’ordi réfléchit…" : undefined}
            onForfeit={!state.winner ? handleForfeit : undefined}
            onNewGame={newGame}
            onEndChain={canPlay && state.chainFrom ? handleEndChain : undefined}
          >
            <Board
              state={state}
              interactive={canPlay}
              perspective={HUMAN}
              selected={selected}
              onSelect={setSelected}
              onMove={handleMove}
              highlightSide={HUMAN}
            />
          </GameChrome>
        </div>
      )}
    </main>
  );
}
