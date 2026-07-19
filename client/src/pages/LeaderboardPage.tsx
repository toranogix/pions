import { useEffect, useState } from "react";
import { apiUrl } from "../config";
import "./LeaderboardPage.css";

interface Entry {
  name: string;
  wins: number;
  losses: number;
  ratio: number;
}

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/leaderboard"));
        if (!res.ok) throw new Error("Impossible de charger le classement");
        const data = (await res.json()) as { players: Entry[] };
        if (!cancelled) setPlayers(data.players);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur réseau");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page leaderboard">
      <header className="leaderboard__header">
        <h1>Classement</h1>
        <p>Les meilleurs joueurs de 12 Pions.</p>
      </header>

      {loading && <p>Chargement…</p>}
      {error && <p className="leaderboard__error">{error}</p>}

      {!loading && !error && players.length === 0 && (
        <p className="leaderboard__empty">
          Aucun score pour l’instant. Jouez une partie pour apparaître ici.
        </p>
      )}

      {players.length > 0 && (
        <table className="leaderboard__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Joueur</th>
              <th>V</th>
              <th>D</th>
              <th>Ratio</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.name}>
                <td>{i + 1}</td>
                <td>{p.name}</td>
                <td>{p.wins}</td>
                <td>{p.losses}</td>
                <td>{Math.round(p.ratio * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
