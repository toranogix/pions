import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, "scores.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface LeaderboardEntry {
  name: string;
  wins: number;
  losses: number;
  ratio: number;
}

function ensurePlayer(name: string): void {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return;
  db.prepare(
    `INSERT OR IGNORE INTO players (name) VALUES (?)`,
  ).run(trimmed);
}

export function recordWin(name: string): void {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return;
  ensurePlayer(trimmed);
  db.prepare(
    `UPDATE players SET wins = wins + 1, updated_at = datetime('now') WHERE name = ? COLLATE NOCASE`,
  ).run(trimmed);
}

export function recordLoss(name: string): void {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return;
  ensurePlayer(trimmed);
  db.prepare(
    `UPDATE players SET losses = losses + 1, updated_at = datetime('now') WHERE name = ? COLLATE NOCASE`,
  ).run(trimmed);
}

export function recordResult(winnerName: string, loserName: string): void {
  if (winnerName.trim()) recordWin(winnerName);
  if (loserName.trim()) recordLoss(loserName);
}

export function getLeaderboard(limit = 20): LeaderboardEntry[] {
  const rows = db
    .prepare(
      `SELECT name, wins, losses FROM players
       WHERE wins + losses > 0
       ORDER BY wins DESC, losses ASC, name ASC
       LIMIT ?`,
    )
    .all(limit) as { name: string; wins: number; losses: number }[];

  return rows.map((r) => ({
    name: r.name,
    wins: r.wins,
    losses: r.losses,
    ratio: r.wins + r.losses === 0 ? 0 : r.wins / (r.wins + r.losses),
  }));
}

export function recordAiResult(name: string, won: boolean): void {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return;
  if (won) recordWin(trimmed);
  else recordLoss(trimmed);
}
