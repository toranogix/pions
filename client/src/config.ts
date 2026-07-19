/** Base URL of the Node/Socket.IO server. Empty = same origin (local / monolith). */
export const serverUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function apiUrl(path: string): string {
  return `${serverUrl}${path}`;
}
