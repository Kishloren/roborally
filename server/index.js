import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import QRCode from "qrcode";
import {
  createGame,
  getPublicState,
  joinGame,
  resolveNextRegister,
  setRobotOrientation,
  setPlayerReady,
  startGame,
  submitProgram
} from "../src/game/game.js";
import { createStorage } from "../src/storage/jsonStorage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 6282);
const basePath = normalizeBasePath(process.env.BASE_PATH || "");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { path: `${basePath}/socket.io` });
const storage = createStorage(rootDir);
const router = express.Router();

router.use(express.json());
router.use("/vendor/phaser", express.static(path.join(rootDir, "node_modules/phaser/dist")));
router.use("/socket.io", express.static(path.join(rootDir, "node_modules/socket.io/client-dist")));
router.use("/backoffice", express.static(path.join(rootDir, "public/editor")));
router.use(express.static(path.join(rootDir, "public")));
app.use(basePath || "/", router);

let activeGame = await loadOrCreateGame();

app.get("/", (_req, res) => {
  res.redirect(`${basePath}/display/`);
});

router.get("/", (_req, res) => {
  res.redirect(`${basePath}/display/`);
});

router.get("/api/game/state", (_req, res) => {
  res.json(getPublicState(activeGame));
});

router.get("/api/maps", async (_req, res) => {
  res.json(await storage.listMaps());
});

router.get("/api/maps/:mapId", async (req, res) => {
  try {
    res.json(await storage.readMap(req.params.mapId));
  } catch (error) {
    res.status(error.code === "ENOENT" ? 404 : 400).json({ ok: false, error: error.message });
  }
});

router.post("/api/maps", async (req, res) => {
  try {
    const map = await storage.writeMap({
      id: req.body?.id,
      name: req.body?.name,
      width: req.body?.width || 12,
      height: req.body?.height || 12,
      tileSize: req.body?.tileSize || 72,
      tiles: req.body?.tiles || []
    });
    res.json({ ok: true, map });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.put("/api/maps/:mapId", async (req, res) => {
  try {
    const map = await storage.writeMap({ ...req.body, id: req.params.mapId });
    res.json({ ok: true, map });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post("/api/game/new", async (req, res) => {
  const mapId = req.body?.mapId || "factory-01";
  const map = await storage.readMap(mapId);
  activeGame = createGame({ map });
  await storage.writeSave(activeGame);
  broadcastState();
  res.json(getPublicState(activeGame));
});

router.post("/api/game/save", async (_req, res) => {
  await storage.writeSave(activeGame);
  res.json({ ok: true, saveId: activeGame.id });
});

router.post("/api/game/resolve-next", async (_req, res) => {
  try {
    const step = resolveNextRegister(activeGame);
    await storage.writeSave(activeGame);
    broadcastState();
    res.json({ ok: true, step, events: step.events, state: getPublicState(activeGame) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post("/api/game/start", async (_req, res) => {
  try {
    startGame(activeGame);
    await storage.writeSave(activeGame);
    broadcastState();
    res.json({ ok: true, state: getPublicState(activeGame) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post("/api/game/reset", async (_req, res) => {
  try {
    activeGame = createGame({ map: activeGame.map });
    await storage.writeSave(activeGame);
    broadcastState();
    res.json({ ok: true, state: getPublicState(activeGame) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.get("/api/game/qr", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  const target = getPlayerUrl(req, req.query?.t);
  const dataUrl = await QRCode.toDataURL(target, { margin: 1, width: 320 });
  res.json({ url: target, qr: dataUrl });
});

router.post("/api/player/join", async (req, res) => {
  try {
    const result = joinGame(activeGame, req.body || {});
    await storage.writeSave(activeGame);
    broadcastState();
    res.json({ ok: true, playerId: result.player.id, state: getPublicState(activeGame) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post("/api/player/ready", async (req, res) => {
  try {
    setPlayerReady(activeGame, req.body?.playerId, Boolean(req.body?.ready));
    await storage.writeSave(activeGame);
    broadcastState();
    res.json({ ok: true, state: getPublicState(activeGame) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post("/api/player/orientation", async (req, res) => {
  try {
    setRobotOrientation(activeGame, req.body?.playerId, req.body?.direction);
    await storage.writeSave(activeGame);
    broadcastState();
    res.json({ ok: true, state: getPublicState(activeGame) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post("/api/player/program", async (req, res) => {
  try {
    submitProgram(activeGame, req.body?.playerId, req.body?.cards);
    await storage.writeSave(activeGame);
    broadcastState();
    res.json({ ok: true, state: getPublicState(activeGame) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

io.on("connection", (socket) => {
  socket.emit("game:state", getPublicState(activeGame));

  socket.on("player:join", async ({ name, robotId, clientToken } = {}, reply) => {
    try {
      const result = joinGame(activeGame, { name, robotId, clientToken, socketId: socket.id });
      socket.data.playerId = result.player.id;
      await storage.writeSave(activeGame);
      broadcastState();
      reply?.({ ok: true, playerId: result.player.id, state: getPublicState(activeGame) });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("player:bind", async ({ playerId, clientToken } = {}, reply) => {
    try {
      const player = activeGame.players.find((item) => item.id === playerId && item.clientToken === clientToken);
      if (!player) throw new Error("Session joueur introuvable.");
      player.connected = true;
      player.socketId = socket.id;
      socket.data.playerId = player.id;
      await storage.writeSave(activeGame);
      broadcastState();
      reply?.({ ok: true, state: getPublicState(activeGame) });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("player:ready", async ({ ready } = {}, reply) => {
    try {
      setPlayerReady(activeGame, socket.data.playerId, Boolean(ready));
      await storage.writeSave(activeGame);
      broadcastState();
      reply?.({ ok: true });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("player:orientation", async ({ direction } = {}, reply) => {
    try {
      setRobotOrientation(activeGame, socket.data.playerId, direction);
      await storage.writeSave(activeGame);
      broadcastState();
      reply?.({ ok: true });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("player:program", async ({ cards } = {}, reply) => {
    try {
      submitProgram(activeGame, socket.data.playerId, cards);
      await storage.writeSave(activeGame);
      broadcastState();
      reply?.({ ok: true });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("disconnect", async () => {
    const player = activeGame.players.find((item) => item.id === socket.data.playerId);
    if (!player) return;
    player.connected = false;
    await storage.writeSave(activeGame);
    broadcastState();
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`RoboRally server listening on http://localhost:${port}${basePath}`);
});

async function loadOrCreateGame() {
  const latest = await storage.readLatestSave();
  if (process.env.RESUME_SAVE === "1" && latest) return latest;
  const map = latest?.map || await storage.readMap(process.env.DEFAULT_MAP_ID || "factory-01");
  const game = createGame({ map });
  await storage.writeSave(game);
  return game;
}

function broadcastState() {
  io.emit("game:state", getPublicState(activeGame));
}

function getPlayerUrl(req, nonce) {
  const host = req.headers.host || `localhost:${port}`;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const cacheBust = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${String(nonce || "").slice(-8)}`;
  return `${protocol}://${host}${basePath}/player/?join=${cacheBust}&game=${activeGame.id}&v=${cacheBust}`;
}

function normalizeBasePath(value) {
  const clean = String(value || "").trim();
  if (!clean || clean === "/") return "";
  return `/${clean.replace(/^\/+|\/+$/g, "")}`;
}
