const qrImage = document.querySelector("#join-qr");
const joinLink = document.querySelector("#join-link");
const startGameButton = document.querySelector("#start-game");
const resolveNextButton = document.querySelector("#resolve-next");
const mapList = document.querySelector("#map-list");
const players = document.querySelector("#players");
const displayError = document.querySelector("#display-error");
const basePath = detectBasePath("display");
const socket = window.io?.({ path: `${basePath}/socket.io` });

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

startGameButton.addEventListener("click", startGame);
resolveNextButton.addEventListener("click", resolveNextRegister);

try {
  await loadPhaser();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-canvas",
    width: 1560,
    height: 1080,
    backgroundColor: "#101316",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER
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
  socket.on("game:state", applyState);
  socket.on("connect", stopPolling);
  socket.on("connect_error", () => {
    showDisplayError("Socket.IO indisponible, bascule en polling HTTP.");
    startPolling();
  });
} else {
  startPolling();
}

function preload() {
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
    if (latestState) renderBoard(this, latestState);
  });
  if (latestState) {
    renderPlayers(latestState);
    renderBoard(this, latestState);
  }
}

function update() {}

async function loadQr() {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = await fetchJson(`${basePath}/api/game/qr?t=${encodeURIComponent(nonce)}`, { cache: "no-store" });
  qrImage.removeAttribute("src");
  qrImage.src = payload.qr;
  joinLink.href = payload.url;
}

async function pollState() {
  try {
    const response = await fetch(`${basePath}/api/game/state`);
    applyState(await response.json());
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
  resolveNextButton.disabled = true;
  try {
    const payload = await fetchJson(`${basePath}/api/game/resolve-next`, { method: "POST" });
    if (!payload.ok) throw new Error(payload.error || "Resolution impossible");
    applyState(payload.state);
    window.setTimeout(() => {
      resolutionAnimationLocked = false;
      updateControls(latestState);
    }, timelineDurationForEvents(payload.events || []));
  } catch (error) {
    console.warn(error);
    resolutionAnimationLocked = false;
    updateControls(latestState);
  }
}

async function startGame() {
  startGameButton.disabled = true;
  try {
    const payload = await fetchJson(`${basePath}/api/game/start`, { method: "POST" });
    if (!payload.ok) throw new Error(payload.error || "Demarrage impossible");
    applyState(payload.state);
  } catch (error) {
    showDisplayError(`Demarrage impossible: ${error.message || error}`);
  } finally {
    updateControls(latestState);
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
  updateDisplayMode(state);
  renderPlayers(state);
  renderMapList();
  updateControls(state);
  if (sceneRef) renderBoard(sceneRef, state, previousState);
}

function updateDisplayMode(state) {
  document.querySelector("#side-panel")?.classList.toggle("game-running", state?.phase !== "lobby");
}

function updateControls(state) {
  const playerCount = state?.players?.length || 0;
  startGameButton.disabled = state?.phase !== "lobby" || playerCount === 0;
  resolveNextButton.disabled = resolutionAnimationLocked || !["ready_to_resolve", "resolution"].includes(state?.phase);
}

function timelineDurationForEvents(events) {
  return Math.max(350, events.reduce((total, event) => total + timelineEventDuration(event), 0) + 80);
}

function renderMapList() {
  if (!mapList || !availableMaps.length) return;
  const currentId = latestState?.map?.id;
  mapList.replaceChildren(
    ...availableMaps.map((mapInfo) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `map-card${mapInfo.id === currentId ? " active" : ""}`;
      button.innerHTML = `
        <img class="map-thumb" alt="" src="${mapInfo.thumbnail || defaultMapThumbnailDataUrl(mapInfo)}" />
        <span>
          <span class="map-name">${escapeHtml(mapInfo.name || mapInfo.id)}</span>
          <span class="map-meta">${mapInfo.width || "?"}x${mapInfo.height || "?"}</span>
        </span>
      `;
      button.addEventListener("click", () => selectMap(mapInfo.id));
      return button;
    })
  );
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

function defaultMapThumbnailDataUrl(mapInfo) {
  const width = Math.max(1, mapInfo.width || 12);
  const height = Math.max(1, mapInfo.height || 12);
  const cell = 8;
  const canvas = document.createElement("canvas");
  canvas.width = width * cell;
  canvas.height = height * cell;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#2f373d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#46515a";
  ctx.lineWidth = 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      ctx.strokeRect(x * cell + 0.5, y * cell + 0.5, cell, cell);
    }
  }

  return canvas.toDataURL("image/png");
}

function showDisplayError(message) {
  if (!displayError) return;
  displayError.textContent = message;
  displayError.classList.remove("hidden");
}

function hideDisplayError() {
  displayError?.classList.add("hidden");
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

function renderPlayers(state) {
  const robotsByPlayer = new Map((state.robots || []).map((robot) => [robot.playerId, robot]));
  const showProgram = shouldShowProgram(state);
  players.replaceChildren(
    ...state.players.map((player) => {
      const robot = robotsByPlayer.get(player.id);
      const health = healthValue(robot);
      const checkpoint = checkpointValue(robot);
      const row = document.createElement("div");
      row.className = "player-row";
      row.innerHTML = `
        <div class="robot-icon" aria-hidden="true">
          <span class="robot-icon-sprite" style="${robotSpriteStyle(player.robotId, robot?.direction)}"></span>
        </div>
        <div class="player-health-disk">${healthDiskMarkup(9, health, checkpoint)}</div>
        <div class="player-summary">
          ${showProgram ? `<div class="player-program" style="${programColumnStyle(state.register)}">${programCards(player.programCards, state.register)}</div>` : ""}
        </div>
      `;
      return row;
    })
  );
}

function shouldShowProgram(state) {
  return ["ready_to_resolve", "resolution"].includes(state?.phase)
    && state.players.length > 0
    && state.players.every((player) => player.programSubmitted);
}

function robotSpriteStyle(robotId, direction = "east") {
  const frame = Math.max(0, Math.min(7, Number(String(robotId || "").replace("robot_", "")) - 1 || 0));
  const position = frame === 0 ? 0 : frame * 100 / 7;
  return [
    `background-image:url('${basePath}/shared/assets/images/robots.png')`,
    "background-size:800% 100%",
    `background-position:${position}% 0`,
    `transform:rotate(${directionAngle(direction)}rad)`
  ].join(";");
}

function healthValue(robot) {
  return Math.max(0, 9 - (Number(robot?.damage) || 0));
}

function checkpointValue(robot) {
  return Number(robot?.checkpoint) || 0;
}

function healthDiskMarkup(max, current, checkpoint) {
  const textureKey = createHealthDisk(max, current, checkpoint);
  if (!textureKey || !sceneRef?.textures.exists(textureKey)) {
    return "";
  }
  const src = sceneRef.textures.getBase64(textureKey);
  return `<img class="health-disk" alt="${current}/${max} PV" src="${src}" />`;
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

function programCards(cards = [], currentRegister = 0) {
  return cards.map((card, index) => card
    ? `<span class="mini-card${index === currentRegister ? " current" : ""}"><span>${card.priority}</span><strong>${cardSymbol(card)}</strong></span>`
    : `<span class="mini-card empty${index === currentRegister ? " current" : ""}"></span>`
  ).join("");
}

function programColumnStyle(currentRegister = 0) {
  const index = Math.max(0, Math.min(4, Number(currentRegister) || 0));
  const cardWidth = 40;
  const gap = 4;
  const x = index * (cardWidth + gap);
  return `--current-register-x:${x}px;--current-register-width:${cardWidth}px;`;
}

function cardSymbol(card) {
  if (card.type === "move_1" || card.type === "move_2" || card.type === "move_3") return `↑${card.distance || 1}`;
  if (card.type === "backup") return "↓";
  if (card.type === "rotate_right") return "↱";
  if (card.type === "rotate_left") return "↰";
  if (card.type === "u_turn") return "↶";
  return "?";
}

function renderBoard(scene, state, previous = null) {
  scene.tweens.killAll();
  scene.time.removeAllEvents();
  scene.children.removeAll();
  if (!state?.map) {
    showDisplayError("Etat de partie invalide: carte absente.");
    return;
  }
  const width = scene.scale.width || 1560;
  const height = scene.scale.height || 1080;
  const tileSize = Math.max(24, Math.floor(Math.min(width / state.map.width, height / state.map.height)));
  const offsetX = Math.floor((width - state.map.width * tileSize) / 2);
  const offsetY = Math.floor((height - state.map.height * tileSize) / 2);
  const specialTiles = new Map(state.map.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const previousRobots = new Map((previous?.robots || []).map((robot) => [robot.id, robot]));
  const changedEvents = newEvents(previous, state);
  const robotSprites = new Map();

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const tile = specialTiles.get(`${x},${y}`) || { x, y, floor: "normal" };
      const px = offsetX + x * tileSize;
      const py = offsetY + y * tileSize;
      drawBoardTile(scene, tile, px, py, tileSize);
    }
  }

  for (const robot of state.robots) {
    const basis = previousRobots.get(robot.id) || robot;
    const frame = Math.max(0, Math.min(7, Number(String(robot.id || "").replace("robot_", "")) - 1 || 0));
    const key = scene.textures.exists("robot_tiles") ? "robot_tiles" : "robot_idle";
    const sprite = scene.add.image(
      offsetX + basis.x * tileSize + tileSize / 2,
      offsetY + basis.y * tileSize + tileSize / 2,
      key,
      key === "robot_tiles" ? frame : undefined
    ).setDisplaySize(tileSize * 0.82, tileSize * 0.82);
    sprite.alpha = basis.holographic ? 0.55 : 1;
    sprite.rotation = directionAngle(basis.direction);
    robotSprites.set(robot.id, sprite);
  }
  playEventTimeline(scene, state, changedEvents, robotSprites, tileSize, offsetX, offsetY);
}

function drawLaserEffect(scene, state, event, tileSize, offsetX, offsetY) {
  const robots = new Map(state.robots.map((robot) => [robot.id, robot]));
  const start = laserStartPoint(event, robots, tileSize, offsetX, offsetY);
  const hitRobot = robots.get(event.hitRobotId);
  if (!start || !hitRobot) return;
  const end = cellCenter(hitRobot.x, hitRobot.y, tileSize, offsetX, offsetY);
  const beam = scene.add.graphics();
  beam.lineStyle(Math.max(5, (event.power || 1) * 4), 0xfff27a, 0.95);
  beam.beginPath();
  beam.moveTo(start.x, start.y);
  beam.lineTo(end.x, end.y);
  beam.strokePath();
  scene.tweens.add({
    targets: beam,
    alpha: 0,
    duration: 320,
    ease: "Cubic.easeOut",
    onComplete: () => beam.destroy()
  });
}

function laserStartPoint(event, robots, tileSize, offsetX, offsetY) {
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
  let cursor = 0;
  for (const event of events) {
    const delay = cursor;
    const duration = timelineEventDuration(event);
    scene.time.delayedCall(delay, () => playTimelineEvent(scene, state, event, robotSprites, tileSize, offsetX, offsetY, duration));
    cursor += duration;
  }
  scene.time.delayedCall(cursor + 20, () => syncRobotSpritesToState(robotSprites, state, tileSize, offsetX, offsetY));
}

function playTimelineEvent(scene, state, event, robotSprites, tileSize, offsetX, offsetY, duration) {
  const sprite = robotSprites.get(event.robotId);
  if (event.type === "robot_moved" && sprite) {
    tweenRobot(scene, sprite, event.x, event.y, tileSize, offsetX, offsetY, duration);
  } else if ((event.type === "robot_rotated" || event.type === "conveyor_rotated") && sprite) {
    tweenRobotRotation(scene, sprite, event.direction, duration);
  } else if (event.type === "robot_respawned" && sprite) {
    sprite.setPosition(offsetX + event.x * tileSize + tileSize / 2, offsetY + event.y * tileSize + tileSize / 2);
    flashRobot(scene, sprite);
  } else if (event.type === "robot_damaged" && sprite) {
    flashRobot(scene, sprite);
  } else if (event.type === "robot_materialized" && sprite) {
    scene.tweens.add({ targets: sprite, alpha: 1, duration: Math.max(250, duration), ease: "Cubic.easeOut" });
  } else if (event.type === "laser_fired" && event.hitRobotId) {
    drawLaserEffect(scene, state, event, tileSize, offsetX, offsetY);
  }
}

function timelineEventDuration(event) {
  if (event.type === "robot_moved" || event.type === "robot_rotated" || event.type === "conveyor_rotated") return 1000;
  if (event.type === "laser_fired") return event.hitRobotId ? 360 : 80;
  if (event.type === "robot_damaged" || event.type === "robot_respawned" || event.type === "robot_materialized") return 320;
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
  }
}

function drawBoardTile(scene, tile, px, py, tileSize) {
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
  const previousLength = previous.eventLog?.length || 0;
  return (state.eventLog || []).slice(Math.min(previousLength, state.eventLog?.length || 0));
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
