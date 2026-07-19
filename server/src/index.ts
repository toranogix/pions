import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { getLeaderboard, recordAiResult } from "./db.js";
import {disconnectSocket, enqueue, endPlayerChain, forfeit, getQueueLength, leaveQueue, playMove, roomPayload} from "./matchmaking.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, queue: getQueueLength() });
});

app.get("/api/leaderboard", (_req, res) => {
  res.json({ players: getLeaderboard(30) });
});

app.post("/api/ai-result", (req, res) => {
  const { name, won } = req.body as { name?: string; won?: boolean };
  if (!name || typeof won !== "boolean") {
    res.status(400).json({ error: "name et won requis" });
    return;
  }
  recordAiResult(name, won);
  res.json({ ok: true });
});

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
    next();
    return;
  }
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  socket.on("queue:join", (payload: { name?: string }) => {
    leaveQueue(socket.id);
    const result = enqueue(socket.id, payload?.name ?? "Anonyme");

    if ("waiting" in result) {
      socket.emit("queue:waiting", { position: getQueueLength() });
      return;
    }

    const room = result.matched;
    for (const p of room.players) {
      const s = io.sockets.sockets.get(p.socketId);
      if (s) {
        s.join(room.id);
        s.emit("game:matched", {
          ...roomPayload(room),
          you: p.side,
        });
      }
    }
  });

  socket.on("queue:leave", () => {
    leaveQueue(socket.id);
    socket.emit("queue:left");
  });

  socket.on("game:move", (payload: { from: { row: number; col: number }; to: { row: number; col: number } }) => {
      const result = playMove(socket.id, payload.from, payload.to);
      if (!result.ok) {
        socket.emit("game:error", { message: result.error });
        return;
      }
      io.to(result.room.id).emit("game:state", roomPayload(result.room));
    },
  );

  socket.on("game:end-chain", () => {
    const result = endPlayerChain(socket.id);
    if (!result.ok) {
      socket.emit("game:error", { message: result.error });
      return;
    }
    io.to(result.room.id).emit("game:state", roomPayload(result.room));
  });

  socket.on("game:forfeit", () => {
    const result = forfeit(socket.id);
    if (!result) return;
    io.to(result.room.id).emit("game:state", roomPayload(result.room));
  });

  socket.on("disconnect", () => {
    const result = disconnectSocket(socket.id);
    if (result.room) {
      io.to(result.room.id).emit("game:state", {
        ...roomPayload(result.room),
        disconnected: result.forfeiter?.name,
      });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`12 Pions server on http://localhost:${PORT}`);
});
