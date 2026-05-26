const basePath = detectBasePath("display");
const socket = window.io?.({ path: `${basePath}/socket.io` });
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const CARD_SOURCE = { width: 310, height: 460 };
const BOARD_ZONE = { x: 20, y: 20, width: 1240, height: 1040 };
const INFO_ZONE = { x: 1300, y: 20, width: 600, height: 1040 };
const PANEL_PAD = 8;

const FLOOR_FRAMES = [0, 6, 13, 14, 15, 16];
const PIT_FRAMES = { single: 11 };
const ZONE_FRAMES = { repair1: 0, repair2: 1, spawn: 2, checkpoints: [6, 7, 8, 9, 12, 13, 14, 15] };
const LASER_FRAMES = { beamsNorthSouth: [0, 1, 2], emittersNorth: [8, 9, 10] };
const CONVEYOR_FRAMES = { straight: 0, turnRight: 1, merge: 2, fastStraight: 8, fastTurnRight: 9, fastMerge: 10 };
const CRUSHER_FRAMES = { plain: 21, topSegmentStart: 23, conveyor: 28, bottomSegmentStart: 30 };
const TURN_TRANSFORMS = {
  "east:north": { frame: CONVEYOR_FRAMES.turnRight, rotation: Math.PI, flipX: false },
  "north:west": { frame: CONVEYOR_FRAMES.turnRight, rotation: Math.PI / 2, flipX: false },
  "west:south": { frame: CONVEYOR_FRAMES.turnRight, rotation: 0, flipX: false },
  "south:east": { frame: CONVEYOR_FRAMES.turnRight, rotation: Math.PI * 1.5, flipX: false },
  "east:south": { frame: CONVEYOR_FRAMES.turnRight, rotation: Math.PI, flipX: true },
  "south:west": { frame: CONVEYOR_FRAMES.turnRight, rotation: Math.PI * 1.5, flipX: true },
  "west:north": { frame: CONVEYOR_FRAMES.turnRight, rotation: 0, flipX: true },
  "north:east": { frame: CONVEYOR_FRAMES.turnRight, rotation: Math.PI / 2, flipX: true }
};
const FAST_TURN_TRANSFORMS = {
  "east:north": { frame: CONVEYOR_FRAMES.fastTurnRight, rotation: Math.PI, flipX: false, flipY: true },
  "north:west": { frame: CONVEYOR_FRAMES.fastTurnRight, rotation: Math.PI / 2, flipX: false, flipY: true },
  "west:south": { frame: CONVEYOR_FRAMES.fastTurnRight, rotation: 0, flipX: false, flipY: true },
  "south:east": { frame: CONVEYOR_FRAMES.fastTurnRight, rotation: Math.PI * 1.5, flipX: false, flipY: true },
  "east:south": { frame: CONVEYOR_FRAMES.fastTurnRight, rotation: Math.PI, flipX: true, flipY: true },
  "south:west": { frame: CONVEYOR_FRAMES.fastTurnRight, rotation: Math.PI * 1.5, flipX: true, flipY: true },
  "west:north": { frame: CONVEYOR_FRAMES.fastTurnRight, rotation: 0, flipX: true, flipY: true },
  "north:east": { frame: CONVEYOR_FRAMES.fastTurnRight, rotation: Math.PI / 2, flipX: true, flipY: true }
};

let latestState = null;
let previousState = null;
let sceneRef = null;
let pollingTimer = null;
let availableMaps = [];
let resolutionAnimationLocked = false;
let qrPayload = null;
let displayErrorMessage = "";
let boardLayer = null;
let robotLayer = null;
let uiLayer = null;
let boardRenderKey = "";
let robotSprites = new Map();
let boardMetrics = null;
let activeResolutionStep = null;
let restartButtonVisible = false;
let restartConfirmVisible = false;

try {
  await loadPhaser();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "display-stage",
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    backgroundColor: "#101316",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: {
      preload,
      create,
      update
    }
  });
} catch (error) {
  showDisplayError(`Phaser indisponible: ${error.message || error}`);
}
loadQr();
loadMaps();
pollState();

if (socket) {
  socket.on("game:state", handleIncomingState);
  socket.on("connect", stopPolling);
  socket.on("connect_error", () => {
    showDisplayError("Socket.IO indisponible, bascule en polling HTTP.");
    startPolling();
  });
  socket.on("disconnect", startPolling);
} else {
  startPolling();
}

function preload() {
  this.load.image("display_background", `${basePath}/shared/assets/images/fondDisplay.png`);
  this.load.spritesheet("program_cards", `${basePath}/shared/assets/images/cartes.png`, { frameWidth: 310, frameHeight: 460 });
  this.load.spritesheet("floor_tiles", `${basePath}/shared/assets/images/sols.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("pit_tiles", `${basePath}/shared/assets/images/pits.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("conveyor_tiles", `${basePath}/shared/assets/images/conv.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("gear_tiles", `${basePath}/shared/assets/images/gears.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("wall_tiles", `${basePath}/shared/assets/images/walls.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("zone_tiles", `${basePath}/shared/assets/images/zones.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("laser_tiles", `${basePath}/shared/assets/images/lasers.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("crusher_tiles", `${basePath}/shared/assets/images/crush.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("robot_tiles", `${basePath}/shared/assets/images/robots.png`, { frameWidth: 256, frameHeight: 256 });
}

function create() {
  sceneRef = this;
  createGeneratedSprites(this);
  this.scale.on("resize", () => {
    renderDisplay(this, latestState, previousState);
  });
  this.input.once("pointerdown", () => requestDisplayFullscreen(this));
  this.input.keyboard?.on("keydown", (event) => {
    if (event.code !== "ControlLeft" || event.repeat) return;
    restartButtonVisible = true;
    renderDisplay(this, latestState, previousState);
  });
  if (qrPayload) setQrTexture(qrPayload.qr);
  renderDisplay(this, latestState, previousState);
}

function update() {}

async function loadQr() {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  qrPayload = await fetchJson(`${basePath}/api/game/qr?t=${encodeURIComponent(nonce)}`, { cache: "no-store" });
  setQrTexture(qrPayload.qr);
  renderDisplay(sceneRef, latestState, previousState);
}

function setQrTexture(dataUrl) {
  if (!sceneRef || !dataUrl) return;
  const key = "join_qr";
  if (sceneRef.textures.exists(key)) sceneRef.textures.remove(key);
  sceneRef.textures.addBase64(key, dataUrl);
  window.setTimeout(() => renderDisplay(sceneRef, latestState, previousState), 50);
}

async function pollState() {
  try {
    const response = await fetch(`${basePath}/api/game/state`);
    handleIncomingState(await response.json());
  } catch (error) {
    showDisplayError(`Etat indisponible: ${error.message || error}`);
  }
}

async function loadMaps() {
  try {
    const response = await fetch(`${basePath}/api/maps`);
    availableMaps = await response.json();
    renderMapList();
  } catch (error) {
    showDisplayError(`Liste des plateaux indisponible: ${error.message || error}`);
  }
}

function startPolling() {
  if (pollingTimer) return;
  pollingTimer = window.setInterval(pollState, 1000);
}

function stopPolling() {
  if (!pollingTimer) return;
  window.clearInterval(pollingTimer);
  pollingTimer = null;
}

async function resolveNextRegister() {
  resolutionAnimationLocked = true;
  try {
    const payload = await fetchJson(`${basePath}/api/game/resolve-next`, { method: "POST" });
    if (!payload.ok) throw new Error(payload.error || "Resolution impossible");
    activeResolutionStep = payload.step;
    handleIncomingState(payload.state);
    window.setTimeout(() => {
      activeResolutionStep = null;
      resolutionAnimationLocked = false;
      drawStaticDisplay(sceneRef, latestState);
    }, timelineDurationForEvents(payload.events || []));
  } catch (error) {
    console.warn(error);
    resolutionAnimationLocked = false;
    renderDisplay(sceneRef, latestState, previousState);
  }
}

async function startGame() {
  try {
    const payload = await fetchJson(`${basePath}/api/game/start`, { method: "POST" });
    if (!payload.ok) throw new Error(payload.error || "Demarrage impossible");
    applyState(payload.state);
  } catch (error) {
    showDisplayError(`Demarrage impossible: ${error.message || error}`);
  }
}

async function resetGame() {
  try {
    const payload = await fetchJson(`${basePath}/api/game/reset`, { method: "POST" });
    if (!payload.ok) throw new Error(payload.error || "Reset impossible");
    restartConfirmVisible = false;
    restartButtonVisible = false;
    boardRenderKey = "";
    activeResolutionStep = null;
    resolutionAnimationLocked = false;
    previousState = null;
    applyState(payload.state);
    await loadQr();
  } catch (error) {
    restartConfirmVisible = false;
    showDisplayError(`Reset impossible: ${error.message || error}`);
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error(`Reponse non JSON (${response.status}) sur ${url}: ${text.slice(0, 80)}`);
  }
  return JSON.parse(text);
}

function applyState(state) {
  hideDisplayError();
  previousState = latestState;
  latestState = state;
  renderDisplay(sceneRef, state, previousState);
}

function handleIncomingState(state) {
  if (isDuplicateState(state)) return;
  applyState(state);
}

function isDuplicateState(state) {
  if (!state || !latestState || state.id !== latestState.id) return false;
  const incomingEventSeq = lastEventSeq(state);
  const currentEventSeq = lastEventSeq(latestState);
  return incomingEventSeq <= currentEventSeq
    && state.phase === latestState.phase
    && state.register === latestState.register
    && JSON.stringify(state.resolution || null) === JSON.stringify(latestState.resolution || null)
    && (state.players?.length || 0) === (latestState.players?.length || 0);
}

function canStartGame(state) {
  return state?.phase === "lobby" && (state?.players?.length || 0) > 0;
}

function canResolveNext(state) {
  return !resolutionAnimationLocked && ["ready_to_resolve", "resolution"].includes(state?.phase);
}

function timelineDurationForEvents(events) {
  return Math.max(350, timelineEntries(events).reduce((total, entry) => total + timelineEntryDuration(entry), 0) + 80);
}

function renderMapList() {
  renderDisplay(sceneRef, latestState, previousState);
}

async function selectMap(mapId) {
  try {
    const response = await fetch(`${basePath}/api/game/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapId })
    });
    const state = await response.json();
    previousState = null;
    applyState(state);
    await loadQr();
  } catch (error) {
    showDisplayError(`Chargement du plateau impossible: ${error.message || error}`);
  }
}

function showDisplayError(message) {
  displayErrorMessage = message;
  renderDisplay(sceneRef, latestState, previousState);
}

function hideDisplayError() {
  displayErrorMessage = "";
}

async function loadPhaser() {
  if (window.Phaser) return;
  try {
    await loadScript(`${basePath}/vendor/phaser/phaser.min.js`);
  } catch {
    await loadScript("https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js");
  }
}

function detectBasePath(section) {
  const marker = `/${section}/`;
  const index = window.location.pathname.indexOf(marker);
  return index > 0 ? window.location.pathname.slice(0, index) : "";
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

async function requestDisplayFullscreen(scene) {
  const target = scene?.game?.canvas || document.documentElement;
  if (!document.fullscreenElement && target.requestFullscreen) {
    try {
      await target.requestFullscreen({ navigationUI: "hide" });
    } catch {
      // Les navigateurs refusent le fullscreen hors geste utilisateur. On ignore
      // volontairement ce refus pour ne jamais bloquer l'affichage du display.
    }
  }
}

function renderDisplay(scene, state, previous = null) {
  if (!scene) return;
  ensureDisplayLayers(scene);
  if (state) updateBoardAndRobots(scene, state, previous);
  renderUi(scene, state);
}

function drawStaticDisplay(scene, state) {
  if (!scene) return;
  ensureDisplayLayers(scene);
  if (state) syncRobotSpritesToState(robotSprites, state, boardMetrics?.tileSize || 0, boardMetrics?.offsetX || 0, boardMetrics?.offsetY || 0);
  renderUi(scene, state);
}

function ensureDisplayLayers(scene) {
  if (boardLayer && robotLayer && uiLayer) return;
  scene.add.image(0, 0, "display_background").setOrigin(0).setDisplaySize(DESIGN_WIDTH, DESIGN_HEIGHT);
  boardLayer = scene.add.container(0, 0);
  robotLayer = scene.add.container(0, 0);
  uiLayer = scene.add.container(0, 0);
}

function renderUi(scene, state) {
  uiLayer.removeAll(true);
  drawSidePanel(scene, state);
  drawRestartControls(scene);
  if (displayErrorMessage) drawDisplayError(scene, displayErrorMessage);
}

function updateBoardAndRobots(scene, state, previous) {
  const metrics = calculateBoardMetrics(scene, state);
  const nextKey = `${state.id}:${state.map.id}:${state.map.width}:${state.map.height}:${metrics.tileSize}:${metrics.offsetX}:${metrics.offsetY}`;
  if (nextKey !== boardRenderKey) {
    boardLayer.removeAll(true);
    robotLayer.removeAll(true);
    robotSprites.clear();
    drawBoardStatic(scene, state, metrics);
    createRobotSprites(scene, state, previous, metrics);
    boardRenderKey = nextKey;
  } else {
    ensureRobotSprites(scene, state, previous, metrics);
  }
  boardMetrics = metrics;
  const events = newEvents(previous, state);
  playEventTimeline(scene, state, events, robotSprites, metrics.tileSize, metrics.offsetX, metrics.offsetY);
}

function drawSidePanel(scene, state) {
  const panel = panelRect(scene);
  if (state?.phase === "lobby") drawLobbyPanel(scene, panel, state);
  else drawGamePanel(scene, panel, state);
}

function panelRect() {
  return { ...INFO_ZONE };
}

function drawLobbyPanel(scene, panel, state) {
  const x = panel.x + PANEL_PAD;
  const qrSize = Math.min(312, panel.width - PANEL_PAD * 2);
  if (scene.textures.exists("join_qr")) {
    const qr = scene.add.image(x, PANEL_PAD, "join_qr").setOrigin(0).setDisplaySize(qrSize, qrSize);
    uiLayer.add(qr);
    qr.setInteractive({ useHandCursor: true });
    qr.on("pointerdown", () => {
      if (qrPayload?.url) window.open(qrPayload.url, "_blank", "noopener,noreferrer");
    });
  } else {
    uiLayer.add(scene.add.rectangle(x, PANEL_PAD, qrSize, qrSize, 0xffffff).setOrigin(0));
  }
  drawPanelTitle(scene, x, qrSize + 24, "PLATEAUX");
  const listY = qrSize + 44;
  availableMaps.slice(0, 6).forEach((mapInfo, index) => {
    drawMapButton(scene, x, listY + index * 72, panel.width - PANEL_PAD * 2, mapInfo, mapInfo.id === state?.map?.id);
  });
  drawActionButton(scene, x, panel.height - 52, panel.width - PANEL_PAD * 2, 42, "DEMARRER LA PARTIE", canStartGame(state), startGame);
}

function drawMapButton(scene, x, y, width, mapInfo, active) {
  const button = scene.add.rectangle(x, y, width, 64, active ? 0x2a2619 : 0x171c20).setOrigin(0);
  uiLayer.add(button);
  button.setStrokeStyle(1, active ? 0xf2c14e : 0x39434c);
  button.setInteractive({ useHandCursor: true });
  button.on("pointerdown", () => selectMap(mapInfo.id));
  uiLayer.add(scene.add.rectangle(x + 8, y + 8, 64, 48, 0x101316).setOrigin(0).setStrokeStyle(1, 0x303941));
  uiLayer.add(scene.add.text(x + 84, y + 12, mapInfo.name || mapInfo.id, {
    fontFamily: "Arial",
    fontSize: "16px",
    fontStyle: "bold",
    color: "#dce5ec"
  }).setOrigin(0));
  uiLayer.add(scene.add.text(x + 84, y + 36, `${mapInfo.width || "?"}x${mapInfo.height || "?"}`, {
    fontFamily: "Arial",
    fontSize: "12px",
    color: "#8f9ba5"
  }).setOrigin(0));
}

function drawGamePanel(scene, panel, state) {
  const x = panel.x + PANEL_PAD;
  const readyPlayers = (state?.players || []).filter((player) => player.programSubmitted).length;
  const totalPlayers = state?.players?.length || 0;
  const resolveReady = canResolveNext(state);
  drawActionButton(scene, x, panel.y + PANEL_PAD, panel.width - PANEL_PAD * 2, 42, resolveReady ? "ACTION SUIVANTE" : "EN ATTENTE", resolveReady, resolveNextRegister);
  const statusLabel = resolveReady
    ? "PROGRAMMES PRETS"
    : `${readyPlayers}/${totalPlayers} PROGRAMMES`;
  uiLayer.add(scene.add.text(x, panel.y + PANEL_PAD + 48, statusLabel, {
    fontFamily: "Arial",
    fontSize: "14px",
    fontStyle: "bold",
    color: resolveReady ? "#34dcb6" : "#8f9ba5"
  }).setOrigin(0));
  const robotsByPlayer = new Map((state?.robots || []).map((robot) => [robot.playerId, robot]));
  const showProgram = shouldShowProgram(state);
  const players = state?.players || [];
  const rowGap = 8;
  const availableRowHeight = Math.floor((panel.height - 88 - Math.max(0, players.length - 1) * rowGap) / Math.max(1, players.length || 1));
  const rowHeight = Math.max(86, Math.min(118, availableRowHeight));
  players.forEach((player, index) => {
    const y = panel.y + 88 + index * (rowHeight + rowGap);
    const robot = robotsByPlayer.get(player.id);
    drawPlayerRow(scene, x, y, panel.width - PANEL_PAD * 2, rowHeight, player, robot, showProgram, state.register || 0, state);
  });
}

function drawActionButton(scene, x, y, width, height, label, enabled, action) {
  const button = scene.add.rectangle(x, y, width, height, enabled ? 0x171c20 : 0x111518).setOrigin(0);
  uiLayer.add(button);
  button.setStrokeStyle(1, enabled ? 0xf2c14e : 0x4a4f54);
  uiLayer.add(scene.add.text(x + width / 2, y + height / 2, label, {
    fontFamily: "Arial",
    fontSize: "15px",
    fontStyle: "bold",
    color: enabled ? "#f2c14e" : "#727b83"
  }).setOrigin(0.5));
  if (enabled) {
    button.setInteractive({ useHandCursor: true });
    button.on("pointerdown", action);
  }
}

function drawRestartControls(scene) {
  if (!restartButtonVisible && !restartConfirmVisible) return;
  const x = INFO_ZONE.x + INFO_ZONE.width - 154;
  const y = INFO_ZONE.y + INFO_ZONE.height - 54;
  if (restartButtonVisible && !restartConfirmVisible) {
    drawActionButton(scene, x, y, 146, 42, "RESTART", true, () => {
      restartConfirmVisible = true;
      renderDisplay(scene, latestState, previousState);
    });
  }
  if (restartConfirmVisible) drawRestartConfirmation(scene);
}

function drawRestartConfirmation(scene) {
  const boxWidth = 760;
  const boxHeight = 260;
  const x = (DESIGN_WIDTH - boxWidth) / 2;
  const y = (DESIGN_HEIGHT - boxHeight) / 2;
  const backdrop = scene.add.rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT, 0x000000, 0.68).setOrigin(0);
  uiLayer.add(backdrop);
  const box = scene.add.rectangle(x, y, boxWidth, boxHeight, 0x171c20, 0.98).setOrigin(0);
  box.setStrokeStyle(2, 0xff3b42, 0.95);
  uiLayer.add(box);
  uiLayer.add(scene.add.text(x + boxWidth / 2, y + 52, "RESTART COMPLET", {
    fontFamily: "Arial",
    fontSize: "30px",
    fontStyle: "bold",
    color: "#ffdddd"
  }).setOrigin(0.5));
  uiLayer.add(scene.add.text(x + boxWidth / 2, y + 106, "Les joueurs seront sortis de la partie et devront rescanner le QR code.", {
    fontFamily: "Arial",
    fontSize: "18px",
    color: "#dce5ec",
    wordWrap: { width: boxWidth - 80 },
    align: "center"
  }).setOrigin(0.5));
  drawActionButton(scene, x + 118, y + 176, 220, 48, "ANNULER", true, () => {
    restartConfirmVisible = false;
    renderDisplay(scene, latestState, previousState);
  });
  drawActionButton(scene, x + boxWidth - 338, y + 176, 220, 48, "CONFIRMER", true, resetGame);
}

function drawPlayerRow(scene, x, y, width, rowHeight, player, robot, showProgram, register, state) {
  uiLayer.add(scene.add.rectangle(x, y, width, rowHeight, 0x171c20, 0.52).setOrigin(0).setStrokeStyle(1, 0x39434c, 0.7));
  const centerY = y + rowHeight / 2;
  const robotSize = Math.min(74, rowHeight - 12);
  const frame = robotFrame(player.robotId);
  const icon = scene.add.image(x + 38, centerY, "robot_tiles", frame).setDisplaySize(robotSize, robotSize);
  uiLayer.add(icon);
  icon.rotation = directionAngle(robot?.direction || "east");
  const disk = createHealthDisk(9, healthValue(robot), checkpointValue(robot));
  if (disk) uiLayer.add(scene.add.image(x + 92, centerY, disk).setDisplaySize(Math.min(44, rowHeight - 26), Math.min(44, rowHeight - 26)));
  if (showProgram) drawProgram(scene, x + 136, y + 6, width - 146, rowHeight - 12, player.programCards || [], register);
  else if (state?.phase === "programming" && player.programSubmitted) {
    drawWaitingForPlayers(scene, x + 136, y, width - 146, rowHeight);
  }
  if (robot?.eliminated) drawEliminatedOverlay(scene, x, y, width, rowHeight);
}

function drawWaitingForPlayers(scene, x, y, width, height) {
  const box = scene.add.rectangle(x, y + 8, width, height - 16, 0x0f2b28, 0.82).setOrigin(0);
  uiLayer.add(box);
  box.setStrokeStyle(1, 0x34dcb6, 0.65);
  uiLayer.add(scene.add.text(x + width / 2, y + height / 2, "EN ATTENTE DES AUTRES JOUEURS", {
    fontFamily: "Arial",
    fontSize: "15px",
    fontStyle: "bold",
    color: "#d8fff7"
  }).setOrigin(0.5));
}

function drawEliminatedOverlay(scene, x, y, width, height) {
  const overlay = scene.add.rectangle(x, y, width, height, 0x2b0707, 0.58).setOrigin(0);
  uiLayer.add(overlay);
  const slashA = scene.add.line(0, 0, x + 6, y + height - 8, x + width - 6, y + 8, 0xff2020, 0.95).setOrigin(0);
  slashA.setLineWidth(5);
  uiLayer.add(slashA);
  const slashB = scene.add.line(0, 0, x + 6, y + 8, x + width - 6, y + height - 8, 0xff2020, 0.65).setOrigin(0);
  slashB.setLineWidth(3);
  uiLayer.add(slashB);
  uiLayer.add(scene.add.text(x + width - 12, y + height / 2, "ELIMINE", {
    fontFamily: "Arial",
    fontSize: "16px",
    fontStyle: "bold",
    color: "#ffdddd"
  }).setOrigin(1, 0.5));
}

function drawProgram(scene, x, y, width, height, cards, register) {
  const gap = 6;
  const cardHeight = Math.max(44, height);
  const widthFromHeight = Math.floor(cardHeight * CARD_SOURCE.width / CARD_SOURCE.height);
  const maxWidth = Math.floor((width - gap * 4) / 5);
  const cardWidth = Math.max(30, Math.min(widthFromHeight, maxWidth));
  const startX = x + Math.max(0, width - (cardWidth * 5 + gap * 4));
  uiLayer.add(scene.add.rectangle(startX + Math.max(0, Math.min(4, register)) * (cardWidth + gap), y - 6, cardWidth, cardHeight + 12, 0x34dcb6, 0.78).setOrigin(0));
  const highlight = latestState?.resolution?.stage === "cards" || activeResolutionStep?.stage === "robot_card";
  cards.forEach((card, index) => {
    const cx = startX + index * (cardWidth + gap);
    const state = cardDisplayState(card, index, register);
    if (!card) {
      uiLayer.add(scene.add.rectangle(cx, y, cardWidth, cardHeight, 0x11171b, 0.75).setOrigin(0).setStrokeStyle(1, state === "active" || state === "next" ? 0xfff27a : 0x3f4a52));
      return;
    }
    const image = scene.add.image(cx, y, "program_cards", cardFrameIndex(card)).setOrigin(0).setDisplaySize(cardWidth, cardHeight);
    image.alpha = state === "spent" ? 0.35 : 1;
    uiLayer.add(image);
    const active = state === "active" || state === "next";
    const strokeColor = state === "active" ? 0xffffff : state === "next" ? 0xfff27a : state === "spent" ? 0x3f4a52 : 0xf2c14e;
    const frame = scene.add.rectangle(cx, y, cardWidth, cardHeight, 0x000000, 0).setOrigin(0).setStrokeStyle(active ? 3 : 1, strokeColor);
    uiLayer.add(frame);
    const priority = scene.add.text(cx + cardWidth * 0.5, y + cardHeight * ((15 + 32.5) / 460), String(card.priority), {
      fontFamily: "Arial",
      fontSize: `${Math.max(10, Math.floor(cardWidth * 0.16))}px`,
      fontStyle: "bold",
      color: "#ffffff"
    }).setOrigin(0.5);
    priority.alpha = state === "spent" ? 0.35 : 1;
    uiLayer.add(priority);
    if (state === "next" && highlight) {
      image.setTint(0xffffcc);
      scene.tweens.add({ targets: image, alpha: 0.86, yoyo: true, repeat: -1, duration: 520 });
    }
    if (state === "active") {
      scene.tweens.add({ targets: [image, priority], alpha: 0.25, yoyo: true, repeat: -1, duration: 110 });
    }
  });
}

function cardDisplayState(card, index, register) {
  if (!card || index !== register) return "normal";
  if (activeResolutionStep?.stage === "robot_card" && activeResolutionStep.events?.some((event) => event.type === "card_activated" && event.cardId === card.id)) {
    return "active";
  }
  if (isResolvedCard(card, register)) return "spent";
  if (isNextCard(card, register)) return "next";
  return "normal";
}

function isResolvedCard(card, register) {
  return (latestState?.eventLog || []).some((event) => event.type === "card_resolved" && event.cardId === card.id && event.register === register);
}

function isNextCard(card, register) {
  const resolution = latestState?.resolution || (
    latestState?.phase === "ready_to_resolve" ? { register: latestState.register || 0, stage: "cards", cardIndex: 0 } : null
  );
  if (!resolution || resolution.stage !== "cards" || resolution.register !== register) return false;
  const ordered = programmedActionsForRegister(latestState, register);
  return ordered[resolution.cardIndex]?.card.id === card.id;
}

function programmedActionsForRegister(state, register) {
  return (state?.players || [])
    .map((player) => ({ player, card: player.programCards?.[register] }))
    .filter((action) => action.card)
    .sort((a, b) => b.card.priority - a.card.priority);
}

function drawPanelTitle(scene, x, y, label) {
  uiLayer.add(scene.add.text(x, y, label, {
    fontFamily: "Arial",
    fontSize: "12px",
    fontStyle: "bold",
    color: "#8f9ba5"
  }).setOrigin(0));
}

function drawDisplayError(scene, message) {
  const box = scene.add.rectangle(24, 24, 640, 54, 0x2a1117).setOrigin(0).setStrokeStyle(1, 0xff5c6c);
  uiLayer.add(box);
  uiLayer.add(scene.add.text(box.x + 14, box.y + 12, message, {
    fontFamily: "Arial",
    fontSize: "16px",
    color: "#ffd7dc",
    wordWrap: { width: 610 }
  }).setOrigin(0));
}

function shouldShowProgram(state) {
  return ["ready_to_resolve", "resolution"].includes(state?.phase)
    && state.players.length > 0
    && state.players.every((player) => player.programSubmitted);
}

function robotFrame(robotId) {
  return Math.max(0, Math.min(7, Number(String(robotId || "").replace("robot_", "")) - 1 || 0));
}

function healthValue(robot) {
  return Math.max(0, 9 - (Number(robot?.damage) || 0));
}

function checkpointValue(robot) {
  return Number(robot?.checkpoint) || 0;
}

function createHealthDisk(max, current, checkpoint = 0) {
  if (!sceneRef) return "";
  const cleanMax = Math.max(1, Math.round(Number(max) || 1));
  const cleanCurrent = Math.max(0, Math.min(cleanMax, Math.round(Number(current) || 0)));
  const cleanCheckpoint = Math.max(0, Math.round(Number(checkpoint) || 0));
  const textureKey = `health_disk_${cleanMax}_${cleanCurrent}_${cleanCheckpoint}`;
  if (sceneRef.textures.exists(textureKey)) return textureKey;

  const size = 64;
  const center = size / 2;
  const radius = 28;
  const gap = 0.035;
  const litColor = cleanCurrent >= cleanMax - 2 ? 0x19c37d : cleanCurrent <= 5 ? 0xff4d5e : 0xffa927;
  const texture = sceneRef.textures.createCanvas(textureKey, size, size);
  const context = texture.getContext();
  context.clearRect(0, 0, size, size);

  for (let index = 0; index < cleanMax; index += 1) {
    const start = -Math.PI / 2 + index * Math.PI * 2 / cleanMax + gap;
    const end = -Math.PI / 2 + (index + 1) * Math.PI * 2 / cleanMax - gap;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, start, end, false);
    context.closePath();
    context.fillStyle = `#${(index < cleanCurrent ? litColor : 0x293038).toString(16).padStart(6, "0")}`;
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = "#101316";
    context.stroke();
  }

  context.beginPath();
  context.arc(center, center, radius * 0.42, 0, Math.PI * 2);
  context.fillStyle = "#101316";
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(220,229,236,0.55)";
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = "#dce5ec";
  context.beginPath();
  context.arc(center, center, 12, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#101316";
  context.beginPath();
  context.arc(center, center, 11, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#dce5ec";
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "bold 17px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(cleanCheckpoint > 0 ? String(cleanCheckpoint) : "D", center, center + 0.5);
  texture.refresh();
  return textureKey;
}

function cardSymbol(card) {
  if (card.type === "move_1" || card.type === "move_2" || card.type === "move_3") return `↑${card.distance || 1}`;
  if (card.type === "backup") return "↓";
  if (card.type === "rotate_right") return "↱";
  if (card.type === "rotate_left") return "↰";
  if (card.type === "u_turn") return "↶";
  return "?";
}

function cardFrameIndex(card) {
  const frames = {
    move_3: 0,
    move_2: 1,
    move_1: 2,
    rotate_left: 3,
    rotate_right: 4,
    backup: 5,
    u_turn: 6
  };
  return frames[card.type] ?? 0;
}

function renderBoard(scene, state, previous = null) {
  if (!state?.map) {
    showDisplayError("Etat de partie invalide: carte absente.");
    return;
  }
  const metrics = calculateBoardMetrics(scene, state);
  drawBoardStatic(scene, state, metrics);
  createRobotSprites(scene, state, previous, metrics);
  playEventTimeline(scene, state, newEvents(previous, state), robotSprites, metrics.tileSize, metrics.offsetX, metrics.offsetY);
}

function calculateBoardMetrics(scene, state) {
  const width = BOARD_ZONE.width;
  const height = BOARD_ZONE.height;
  const tileSize = Math.max(24, Math.floor(Math.min(width / state.map.width, height / state.map.height)));
  return {
    width,
    height,
    tileSize,
    offsetX: BOARD_ZONE.x + Math.floor((width - state.map.width * tileSize) / 2),
    offsetY: BOARD_ZONE.y + Math.floor((height - state.map.height * tileSize) / 2)
  };
}

function drawBoardStatic(scene, state, metrics) {
  const specialTiles = new Map(state.map.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const tile = specialTiles.get(`${x},${y}`) || { x, y, floor: "normal" };
      const px = metrics.offsetX + x * metrics.tileSize;
      const py = metrics.offsetY + y * metrics.tileSize;
      drawBoardTile(scene, tile, px, py, metrics.tileSize);
    }
  }
}

function createRobotSprites(scene, state, previous, metrics) {
  const previousRobots = new Map((previous?.robots || []).map((robot) => [robot.id, robot]));
  for (const robot of state.robots) {
    const basis = previousRobots.get(robot.id) || robot;
    const frame = Math.max(0, Math.min(7, Number(String(robot.id || "").replace("robot_", "")) - 1 || 0));
    const key = scene.textures.exists("robot_tiles") ? "robot_tiles" : "robot_idle";
    const sprite = scene.add.image(
      metrics.offsetX + basis.x * metrics.tileSize + metrics.tileSize / 2,
      metrics.offsetY + basis.y * metrics.tileSize + metrics.tileSize / 2,
      key,
      key === "robot_tiles" ? frame : undefined
    ).setDisplaySize(metrics.tileSize * 0.82, metrics.tileSize * 0.82);
    sprite.alpha = basis.holographic ? 0.55 : 1;
    sprite.rotation = directionAngle(basis.direction);
    if (basis.eliminated) {
      sprite.setTint(0xff3030);
      sprite.alpha = 0.25;
    }
    robotSprites.set(robot.id, sprite);
    robotLayer.add(sprite);
  }
}

function ensureRobotSprites(scene, state, previous, metrics) {
  const animatedIds = new Set(newEvents(previous, state)
    .filter((event) => event.robotId && ["robot_moved", "robot_rotated", "conveyor_rotated", "robot_respawned"].includes(event.type))
    .map((event) => event.robotId));
  const currentIds = new Set(state.robots.map((robot) => robot.id));
  for (const [robotId, sprite] of robotSprites.entries()) {
    if (!currentIds.has(robotId)) {
      sprite.destroy();
      robotSprites.delete(robotId);
    }
  }
  const missing = state.robots.filter((robot) => !robotSprites.has(robot.id));
  if (missing.length) createRobotSprites(scene, { ...state, robots: missing }, previous, metrics);
  for (const robot of state.robots) {
    const sprite = robotSprites.get(robot.id);
    if (!sprite) continue;
    sprite.setDisplaySize(metrics.tileSize * 0.82, metrics.tileSize * 0.82);
    if (!animatedIds.has(robot.id)) {
      sprite.setPosition(metrics.offsetX + robot.x * metrics.tileSize + metrics.tileSize / 2, metrics.offsetY + robot.y * metrics.tileSize + metrics.tileSize / 2);
      sprite.rotation = directionAngle(robot.direction);
      sprite.alpha = robot.holographic ? 0.55 : 1;
      if (robot.eliminated) {
        sprite.setTint(0xff3030);
        sprite.alpha = 0.25;
      } else {
        sprite.clearTint();
      }
    }
  }
}

function drawLaserEffect(scene, state, event, tileSize, offsetX, offsetY) {
  const robots = new Map(state.robots.map((robot) => [robot.id, robot]));
  const start = laserStartPoint(event, robots, tileSize, offsetX, offsetY);
  const hitRobot = robots.get(event.hitRobotId);
  const end = hitRobot
    ? cellCenter(hitRobot.x, hitRobot.y, tileSize, offsetX, offsetY)
    : Number.isFinite(event.endX) && Number.isFinite(event.endY)
      ? cellCenter(event.endX, event.endY, tileSize, offsetX, offsetY)
      : null;
  if (!start || !end || (start.x === end.x && start.y === end.y)) return;
  const beam = scene.add.graphics();
  beam.lineStyle(Math.max(5, (event.power || 1) * 4), 0xff2020, 0.95);
  beam.beginPath();
  beam.moveTo(start.x, start.y);
  beam.lineTo(end.x, end.y);
  beam.strokePath();
  robotLayer.add(beam);
  scene.tweens.add({
    targets: beam,
    alpha: 0,
    duration: 320,
    ease: "Cubic.easeOut",
    onComplete: () => beam.destroy()
  });
}

function laserStartPoint(event, robots, tileSize, offsetX, offsetY) {
  if (Number.isFinite(event.sourceX) && Number.isFinite(event.sourceY)) {
    return cellCenter(event.sourceX, event.sourceY, tileSize, offsetX, offsetY);
  }
  if (event.source === "board_laser") {
    const [x, y] = String(event.sourceId || "").split(",").map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) return cellCenter(x, y, tileSize, offsetX, offsetY);
  }
  const sourceRobot = robots.get(event.sourceId);
  return sourceRobot ? cellCenter(sourceRobot.x, sourceRobot.y, tileSize, offsetX, offsetY) : null;
}

function cellCenter(x, y, tileSize, offsetX, offsetY) {
  return { x: offsetX + x * tileSize + tileSize / 2, y: offsetY + y * tileSize + tileSize / 2 };
}

function playEventTimeline(scene, state, events, robotSprites, tileSize, offsetX, offsetY) {
  if (!events.length) {
    syncRobotSpritesToState(robotSprites, state, tileSize, offsetX, offsetY);
    return;
  }
  prepareSpritesForTimeline(robotSprites, events, tileSize, offsetX, offsetY);
  let cursor = 0;
  for (const entry of timelineEntries(events)) {
    const delay = cursor;
    const duration = timelineEntryDuration(entry);
    scene.time.delayedCall(delay, () => playTimelineEntry(scene, state, entry, robotSprites, tileSize, offsetX, offsetY, duration));
    cursor += duration;
  }
  scene.time.delayedCall(cursor + 20, () => syncRobotSpritesToState(robotSprites, state, tileSize, offsetX, offsetY));
}

function timelineEntries(events) {
  const entries = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.type !== "robot_moved" || !event.moveGroup) {
      entries.push(event);
      continue;
    }
    const group = [event];
    let nextIndex = index + 1;
    while (nextIndex < events.length && events[nextIndex].type === "robot_moved" && events[nextIndex].moveGroup === event.moveGroup) {
      group.push(events[nextIndex]);
      nextIndex += 1;
    }
    entries.push(group);
    index = nextIndex - 1;
  }
  return entries;
}

function timelineEntryDuration(entry) {
  if (Array.isArray(entry)) return Math.max(...entry.map(timelineEventDuration));
  return timelineEventDuration(entry);
}

function prepareSpritesForTimeline(robotSprites, events, tileSize, offsetX, offsetY) {
  const prepared = new Set();
  for (const event of events) {
    const sprite = robotSprites.get(event.robotId);
    if (!sprite || prepared.has(event.robotId)) continue;
    if (event.type === "robot_moved" && Number.isFinite(event.fromX) && Number.isFinite(event.fromY)) {
      sprite.setPosition(offsetX + event.fromX * tileSize + tileSize / 2, offsetY + event.fromY * tileSize + tileSize / 2);
      prepared.add(event.robotId);
    } else if ((event.type === "robot_rotated" || event.type === "conveyor_rotated") && event.fromDirection) {
      sprite.rotation = directionAngle(event.fromDirection);
      prepared.add(event.robotId);
    }
  }
}

function playTimelineEvent(scene, state, event, robotSprites, tileSize, offsetX, offsetY, duration) {
  const sprite = robotSprites.get(event.robotId);
  if (event.type === "robot_moved" && sprite) {
    if (Number.isFinite(event.fromX) && Number.isFinite(event.fromY)) {
      sprite.setPosition(offsetX + event.fromX * tileSize + tileSize / 2, offsetY + event.fromY * tileSize + tileSize / 2);
    }
    tweenRobot(scene, sprite, event.x, event.y, tileSize, offsetX, offsetY, duration);
  } else if ((event.type === "robot_rotated" || event.type === "conveyor_rotated") && sprite) {
    if (event.fromDirection) sprite.rotation = directionAngle(event.fromDirection);
    tweenRobotRotation(scene, sprite, event.direction, duration);
  } else if (event.type === "robot_respawned" && sprite) {
    sprite.setPosition(offsetX + event.x * tileSize + tileSize / 2, offsetY + event.y * tileSize + tileSize / 2);
    flashRobot(scene, sprite);
  } else if (event.type === "robot_damaged" && sprite) {
    flashRobot(scene, sprite);
  } else if (event.type === "robot_materialized" && sprite) {
    scene.tweens.add({ targets: sprite, alpha: 1, duration: Math.max(250, duration), ease: "Cubic.easeOut" });
  } else if (event.type === "laser_fired") {
    drawLaserEffect(scene, state, event, tileSize, offsetX, offsetY);
  } else if (event.type === "robot_destroyed" && sprite) {
    flashRobot(scene, sprite);
  }
}

function playTimelineEntry(scene, state, entry, robotSprites, tileSize, offsetX, offsetY, duration) {
  if (Array.isArray(entry)) {
    entry.forEach((event) => playTimelineEvent(scene, state, event, robotSprites, tileSize, offsetX, offsetY, duration));
    return;
  }
  playTimelineEvent(scene, state, entry, robotSprites, tileSize, offsetX, offsetY, duration);
}

function timelineEventDuration(event) {
  if (event.type === "robot_moved" || event.type === "robot_rotated" || event.type === "conveyor_rotated") return 1000;
  if (event.type === "laser_fired") return 360;
  if (event.type === "robot_damaged" || event.type === "robot_destroyed" || event.type === "robot_respawned" || event.type === "robot_materialized") return 320;
  return 80;
}

function tweenRobot(scene, sprite, x, y, tileSize, offsetX, offsetY, duration) {
  scene.tweens.add({
    targets: sprite,
    x: offsetX + x * tileSize + tileSize / 2,
    y: offsetY + y * tileSize + tileSize / 2,
    duration,
    ease: "Cubic.easeInOut"
  });
}

function tweenRobotRotation(scene, sprite, direction, duration) {
  const targetRotation = directionAngle(direction);
  scene.tweens.add({
    targets: sprite,
    rotation: nearestAngle(sprite.rotation, targetRotation),
    duration,
    ease: "Cubic.easeInOut"
  });
}

function flashRobot(scene, sprite) {
  scene.tweens.add({ targets: sprite, alpha: 0.2, yoyo: true, repeat: 3, duration: 80 });
}

function syncRobotSpritesToState(robotSprites, state, tileSize, offsetX, offsetY) {
  for (const robot of state.robots) {
    const sprite = robotSprites.get(robot.id);
    if (!sprite) continue;
    sprite.setPosition(offsetX + robot.x * tileSize + tileSize / 2, offsetY + robot.y * tileSize + tileSize / 2);
    sprite.rotation = directionAngle(robot.direction);
    sprite.alpha = robot.holographic ? 0.55 : 1;
    if (robot.eliminated) {
      sprite.setTint(0xff3030);
      sprite.alpha = 0.25;
    } else {
      sprite.clearTint();
    }
  }
}

function drawBoardTile(scene, tile, px, py, tileSize) {
  const before = scene.children.length;
  if (tile.floor === "pit") {
    addPitTile(scene, tile, px, py, tileSize);
  } else {
    addFloorTile(scene, tile, px, py, tileSize);
    addZoneTile(scene, tile, px, py, tileSize);
    if (tile.conveyor) addConveyorTile(scene, tile.conveyor, px, py, tileSize);
    if (tile.rotator) addRotatorTile(scene, tile.rotator, px, py, tileSize);
    if (tile.laser) addLaserTile(scene, tile.laser, px, py, tileSize);
    if (tile.crusher) addCrusherTile(scene, tile.crusher, px, py, tileSize);
    if (tile.pusher) addGeneratedOriented(scene, "pusher", tile.pusher.direction, px, py, tileSize);
    if (tile.walls) addWallTiles(scene, tile.walls, px, py, tileSize);
  }
  moveNewChildrenToLayer(scene, before, boardLayer);
}

function moveNewChildrenToLayer(scene, fromIndex, layer) {
  const created = scene.children.list.slice(fromIndex);
  for (const child of created) {
    layer.add(child);
  }
}

function addFloorTile(scene, tile, px, py, tileSize) {
  if (scene.textures.exists("floor_tiles")) {
    const floor = scene.add.image(px + tileSize / 2, py + tileSize / 2, "floor_tiles", FLOOR_FRAMES[stableTileValue(tile.x, tile.y) % FLOOR_FRAMES.length]);
    floor.setDisplaySize(tileSize, tileSize);
    floor.rotation = (stableTileValue(tile.x + 17, tile.y + 31) % 4) * Math.PI / 2;
    return;
  }
  scene.add.image(px, py, "floor_normal").setOrigin(0).setDisplaySize(tileSize, tileSize);
}

function addPitTile(scene, tile, px, py, tileSize) {
  if (scene.textures.exists("pit_tiles")) {
    scene.add.image(px + tileSize / 2, py + tileSize / 2, "pit_tiles", PIT_FRAMES.single).setDisplaySize(tileSize, tileSize);
    return;
  }
  scene.add.image(px, py, "floor_pit").setOrigin(0).setDisplaySize(tileSize, tileSize);
}

function addZoneTile(scene, tile, px, py, tileSize) {
  if (!scene.textures.exists("zone_tiles")) {
    if (tile.checkpoint) scene.add.image(px, py, `checkpoint_${Math.min(tile.checkpoint, 2)}`).setOrigin(0).setDisplaySize(tileSize, tileSize);
    if (tile.spawn) scene.add.image(px, py, `spawn_${Math.min(tile.spawn, 8)}`).setOrigin(0).setDisplaySize(tileSize, tileSize);
    return;
  }
  const frame = zoneFrameFor(tile);
  if (frame === null) return;
  scene.add.image(px + tileSize / 2, py + tileSize / 2, "zone_tiles", frame).setDisplaySize(tileSize, tileSize);
}

function zoneFrameFor(tile) {
  if (tile.repair === 1) return ZONE_FRAMES.repair1;
  if (tile.repair === 2) return ZONE_FRAMES.repair2;
  if (tile.spawn) return ZONE_FRAMES.spawn;
  if (tile.checkpoint) return ZONE_FRAMES.checkpoints[tile.checkpoint - 1] ?? ZONE_FRAMES.checkpoints[0];
  return null;
}

function addConveyorTile(scene, conveyor, px, py, tileSize) {
  if (!scene.textures.exists("conveyor_tiles")) return;
  const transform = conveyorTransform(conveyor);
  const sprite = scene.add.image(px + tileSize / 2, py + tileSize / 2, "conveyor_tiles", transform.frame);
  sprite.setDisplaySize(tileSize, tileSize);
  sprite.rotation = transform.rotation;
  sprite.setFlipX(Boolean(transform.flipX));
  sprite.setFlipY(Boolean(transform.flipY));
}

function addRotatorTile(scene, rotator, px, py, tileSize) {
  if (!scene.textures.exists("gear_tiles")) return;
  const frame = rotator.direction === "ccw" || rotator.direction === "counterclockwise" ? 5 : 4;
  scene.add.image(px + tileSize / 2, py + tileSize / 2, "gear_tiles", frame).setDisplaySize(tileSize, tileSize);
}

function addLaserTile(scene, laser, px, py, tileSize) {
  if (!scene.textures.exists("laser_tiles")) return;
  const power = Math.max(1, Math.min(3, laser.power || 1));
  if (laser.beam) {
    const beam = scene.add.image(px + tileSize / 2, py + tileSize / 2, "laser_tiles", LASER_FRAMES.beamsNorthSouth[power - 1]);
    beam.setDisplaySize(tileSize, tileSize);
    beam.rotation = laser.beam === "east-west" ? Math.PI / 2 : 0;
  }
  if (laser.emitter) {
    const emitter = scene.add.image(px + tileSize / 2, py + tileSize / 2, "laser_tiles", LASER_FRAMES.emittersNorth[power - 1]);
    emitter.setDisplaySize(tileSize, tileSize);
    emitter.rotation = directionRotationFromNorth(laser.direction || "north");
  }
}

function addCrusherTile(scene, crusher, px, py, tileSize) {
  if (!scene.textures.exists("crusher_tiles")) {
    scene.add.image(px, py, "crusher_idle").setOrigin(0).setDisplaySize(tileSize, tileSize);
    return;
  }
  const rotation = crusher.variant === "conveyor" ? rotationFromEast(crusher.direction || "east") : 0;
  const frame = crusher.variant === "conveyor" ? CRUSHER_FRAMES.conveyor : CRUSHER_FRAMES.plain;
  const sprite = scene.add.image(px + tileSize / 2, py + tileSize / 2, "crusher_tiles", frame);
  sprite.setDisplaySize(tileSize, tileSize);
  sprite.rotation = rotation;
  for (const marker of crusherSegmentMarkers(crusher.activeRegisters)) {
    const icon = scene.add.image(px + tileSize / 2, py + tileSize / 2, "crusher_tiles", marker.frame);
    icon.setDisplaySize(tileSize, tileSize);
    icon.rotation = rotation;
  }
}

function addWallTiles(scene, walls, px, py, tileSize) {
  if (!scene.textures.exists("wall_tiles")) return;
  for (const wall of walls) {
    const sprite = scene.add.image(px + tileSize / 2, py + tileSize / 2, "wall_tiles", 7);
    sprite.setDisplaySize(tileSize, tileSize);
    sprite.rotation = { west: 0, north: Math.PI / 2, east: Math.PI, south: -Math.PI / 2 }[wall] || 0;
  }
}

function addGeneratedOriented(scene, key, direction, x, y, tileSize) {
  const sprite = scene.add.image(x, y, `${key}_idle`).setOrigin(0).setDisplaySize(tileSize, tileSize);
  sprite.rotation = directionAngle(direction);
}

function conveyorTransform(conveyor) {
  if (conveyor.shape === "merge") {
    return {
      frame: conveyor.type === "fast" ? CONVEYOR_FRAMES.fastMerge : CONVEYOR_FRAMES.merge,
      rotation: rotationFromEast(conveyor.direction || "east"),
      flipY: Boolean(conveyor.flipped)
    };
  }
  if (conveyor.shape === "turn" || conveyor.turn) return conveyorTurnTransform(conveyor);
  return {
    frame: conveyor.type === "fast" ? CONVEYOR_FRAMES.fastStraight : CONVEYOR_FRAMES.straight,
    rotation: rotationFromWest(conveyor.direction || "west")
  };
}

function conveyorTurnTransform(conveyor) {
  const from = conveyor.from || "east";
  const to = conveyor.to || turnDirectionForFrameOne(from, conveyor.turn || "right");
  const transforms = conveyor.type === "fast" ? FAST_TURN_TRANSFORMS : TURN_TRANSFORMS;
  const turnFrame = conveyor.type === "fast" ? CONVEYOR_FRAMES.fastTurnRight : CONVEYOR_FRAMES.turnRight;
  return transforms[`${from}:${to}`] || { frame: turnFrame, rotation: 0, flipX: false, flipY: conveyor.type === "fast" };
}

function turnDirectionForFrameOne(direction, turn) {
  const directions = ["north", "east", "south", "west"];
  const index = directions.indexOf(direction);
  const delta = turn === "right" ? -1 : 1;
  return directions[(index + delta + directions.length) % directions.length];
}

function crusherSegmentMarkers(activeRegisters = []) {
  return [...new Set(activeRegisters.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 5))]
    .sort((a, b) => a - b)
    .slice(0, 2)
    .map((register, index) => ({
      register,
      frame: index === 0 ? CRUSHER_FRAMES.topSegmentStart + register - 1 : CRUSHER_FRAMES.bottomSegmentStart + register - 1
    }));
}

function newEvents(previous, state) {
  if (!previous || previous.id !== state.id) return [];
  const previousSeq = lastEventSeq(previous);
  return (state.eventLog || []).filter((event) => (event.seq || 0) > previousSeq);
}

function lastEventSeq(state) {
  const events = state?.eventLog || [];
  return events.reduce((max, event, index) => Math.max(max, Number(event.seq) || index + 1), 0);
}

function nearestAngle(from, to) {
  return from + Phaser.Math.Angle.Wrap(to - from);
}

function addOriented(scene, key, direction, x, y, tileSize) {
  const sprite = scene.add.image(x + tileSize / 2, y + tileSize / 2, `${key}_idle`).setDisplaySize(58, 58);
  sprite.rotation = directionAngle(direction);
}

function directionAngle(direction) {
  return { north: -Math.PI / 2, east: 0, south: Math.PI / 2, west: Math.PI }[direction] || 0;
}

function directionRotationFromNorth(direction) {
  return { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 }[direction] || 0;
}

function rotationFromWest(direction) {
  return { west: 0, north: Math.PI / 2, east: Math.PI, south: -Math.PI / 2 }[direction] || 0;
}

function rotationFromEast(direction) {
  return { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 }[direction] || 0;
}

function stableTileValue(x, y) {
  return Math.abs((x * 73856093) ^ (y * 19349663));
}

function createGeneratedSprites(scene) {
  makeTile(scene, "floor_normal", 72, 72, 0x343b40, 0x4b555c);
  makeTile(scene, "floor_pit", 72, 72, 0x050708, 0x1b2024);
  makeTile(scene, "checkpoint_1", 72, 72, 0x286a6d, 0x68d2d6, "1");
  makeTile(scene, "checkpoint_2", 72, 72, 0x6d5828, 0xffd166, "2");
  for (let i = 1; i <= 8; i += 1) makeTile(scene, `spawn_${i}`, 72, 72, 0x29384a, 0x8ab4f8, String(i));
  makeRobot(scene, "robot_idle", 64, 64);
  makeTile(scene, "pusher_idle", 64, 64, 0x46505a, 0xb8c4ce, "P");
  makeTile(scene, "crusher_idle", 72, 72, 0x442e37, 0xff9f1c, "X");
}

function makeTile(scene, key, width, height, fill, stroke, label = "") {
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(fill, 1);
  graphics.fillRect(0, 0, width, height);
  graphics.lineStyle(2, stroke, 1);
  graphics.strokeRect(1, 1, width - 2, height - 2);
  if (label) {
    graphics.fillStyle(stroke, 1);
    graphics.fillCircle(width / 2, height / 2, 18);
  }
  graphics.generateTexture(key, width, height);
  graphics.destroy();
}

function makeRobot(scene, key, width, height) {
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);

  graphics.fillStyle(0x20262b, 1);
  graphics.fillRoundedRect(8, 12, 48, 40, 8);
  graphics.lineStyle(3, 0xf7d154, 1);
  graphics.strokeRoundedRect(8, 12, 48, 40, 8);

  graphics.fillStyle(0xd93f5f, 1);
  graphics.fillTriangle(50, 32, 30, 18, 30, 46);
  graphics.fillRect(18, 25, 18, 14);

  graphics.fillStyle(0x8fd7ff, 1);
  graphics.fillCircle(22, 32, 5);

  graphics.generateTexture(key, width, height);
  graphics.destroy();
}
