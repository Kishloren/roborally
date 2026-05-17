const joinPanel = document.querySelector("#join-panel");
const programPanel = document.querySelector("#program-panel");
const joinButton = document.querySelector("#join-button");
const playerMap = document.querySelector("#player-map");
const controlPanel = document.querySelector("#control-panel");
const hand = document.querySelector("#hand");
const registers = document.querySelector("#registers");
const submitButton = document.querySelector("#submit-button");
const basePath = detectBasePath("player");
const socket = window.io?.({ path: `${basePath}/socket.io` });
const FLOOR_FRAMES = [0, 6, 13, 14, 15, 16];
const PIT_FRAMES = {
  single: 11,
  vertical: [3, 10],
  horizontal: [17, 18]
};
const ZONE_FRAMES = {
  repair1: 0,
  repair2: 1,
  spawn: 2,
  checkpoints: [6, 7, 8, 9, 12, 13, 14, 15]
};
const LASER_FRAMES = {
  beamsNorthSouth: [0, 1, 2],
  emittersNorth: [8, 9, 10]
};
const CONVEYOR_FRAMES = {
  straight: 0,
  turnRight: 1,
  fastStraight: 8,
  fastTurnRight: 9
};
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

let playerId = window.localStorage.getItem("roborally.playerId");
let program = Array(5).fill(null);
let handOrder = [];
let latestState = null;
let dragState = null;
let playerMapScene = null;

joinButton.addEventListener("click", joinGame);
submitButton.addEventListener("click", submitProgram);
window.addEventListener("resize", render);

document.addEventListener("click", () => {
  document.documentElement.requestFullscreen?.().catch(() => {});
}, { once: true });

if (socket) {
  socket.on("game:state", (state) => {
    latestState = state;
    render();
  });
} else {
  pollState();
  window.setInterval(pollState, 1000);
}

initPlayerMap();

async function joinGame() {
  if (socket) {
    socket.emit("player:join", { name: "Player" }, handleJoinReply);
    return;
  }
  handleJoinReply(await postJson(`${basePath}/api/player/join`, { name: "Player" }));
}

function handleJoinReply(reply) {
  if (!reply.ok) {
    alert(reply.error);
    return;
  }
  playerId = reply.playerId;
  window.localStorage.setItem("roborally.playerId", playerId);
  latestState = reply.state;
  render();
}

function render() {
  const player = latestState?.players.find((item) => item.id === playerId);
  joinPanel.classList.toggle("hidden", Boolean(player));
  programPanel.classList.toggle("hidden", !latestState);
  if (!latestState) return;

  updateLayoutSizes(latestState.map);
  playerMapScene?.game.scale.refresh();
  renderMap(latestState);
  if (!player) {
    hand.replaceChildren();
    registers.replaceChildren();
    return;
  }

  syncHandOrder(player.hand);
  renderHand(player);
  renderRegisters(player);
}

function renderHand(player) {
  hand.replaceChildren(...getOrderedHand(player).filter((card) => !program.includes(card.id)).map((card, index) => {
    const button = document.createElement("button");
    button.className = "card";
    button.innerHTML = renderCardFace(card);
    button.style.backgroundPosition = cardBackgroundPosition(card);
    button.setAttribute("aria-label", `${card.label} ${card.priority}`);
    button.dataset.zone = "hand";
    button.dataset.cardId = card.id;
    button.dataset.index = String(index);
    button.addEventListener("pointerdown", startDrag);
    return button;
  }));
}

function renderRegisters(player) {
  const robot = latestState.robots.find((item) => item.playerId === player.id);
  registers.replaceChildren(...program.map((cardId, index) => {
    const locked = isRegisterLocked(robot, index);
    const wrapper = document.createElement("div");
    wrapper.className = "register-slot";

    const lock = document.createElement("span");
    lock.className = `register-lock ${locked ? "locked" : "open"}`;
    lock.setAttribute("aria-label", locked ? `Registre ${index + 1} bloque` : `Registre ${index + 1} libre`);

    const slot = document.createElement("button");
    const card = player.hand.find((item) => item.id === cardId);
    slot.className = card ? "register card" : "register";
    slot.innerHTML = card ? renderCardFace(card) : String(index + 1);
    if (card) slot.style.backgroundPosition = cardBackgroundPosition(card);
    slot.setAttribute("aria-label", card ? `Registre ${index + 1}: ${card.label}` : `Registre ${index + 1}`);
    slot.dataset.zone = "register";
    slot.dataset.index = String(index);
    slot.dataset.locked = locked ? "true" : "false";
    if (card) slot.dataset.cardId = card.id;
    if (!locked) slot.addEventListener("pointerdown", startDrag);

    wrapper.append(lock, slot);
    return wrapper;
  }));
}

function syncHandOrder(cards) {
  const ids = cards.map((card) => card.id);
  handOrder = handOrder.filter((id) => ids.includes(id));
  for (const id of ids) {
    if (!handOrder.includes(id)) handOrder.push(id);
  }
}

function getOrderedHand(player) {
  const byId = new Map(player.hand.map((card) => [card.id, card]));
  return handOrder.map((id) => byId.get(id)).filter(Boolean);
}

function renderMap(state) {
  if (!playerMapScene) return;
  const map = state.map;
  const specialTiles = new Map(map.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const robotsByCell = new Map(state.robots.map((robot) => [`${robot.x},${robot.y}`, robot]));
  const scene = playerMapScene;
  const tileSize = 54;
  const boardWidth = map.width * tileSize;
  const boardHeight = map.height * tileSize;
  const offsetX = Math.floor((720 - boardWidth) / 2);
  const offsetY = Math.floor((720 - boardHeight) / 2);

  scene.children.removeAll();

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = specialTiles.get(`${x},${y}`) || {};
      const robot = robotsByCell.get(`${x},${y}`);
      const px = offsetX + x * tileSize;
      const py = offsetY + y * tileSize;
      if (tile.floor === "pit") {
        addPitTile(scene, tile, px, py, tileSize);
      } else {
        addFloorTile(scene, tile, x, y, px, py, tileSize);
        addZoneTile(scene, tile, px, py, tileSize);
        if (tile.conveyor) addConveyorTile(scene, tile.conveyor, px, py, tileSize);
        if (tile.rotator) addRotatorTile(scene, tile.rotator, px, py, tileSize);
        if (tile.laser) addLaserTile(scene, tile.laser, px, py, tileSize);
        if (tile.walls) addWallTiles(scene, tile.walls, px, py, tileSize);
      }
      scene.add.rectangle(px, py, tileSize, tileSize).setOrigin(0).setStrokeStyle(1, 0x3a424a);

      if (robot) {
        const marker = scene.add.container(px + tileSize / 2, py + tileSize / 2);
        const body = scene.add.rectangle(0, 0, tileSize * 0.52, tileSize * 0.44, 0xd93f5f)
          .setStrokeStyle(2, 0xf7d154);
        const nose = scene.add.triangle(tileSize * 0.25, 0, 0, -tileSize * 0.16, 0, tileSize * 0.16, tileSize * 0.24, 0, 0xf7d154);
        marker.add([body, nose]);
        marker.rotation = Phaser.Math.DegToRad(directionDegrees(robot.direction));
      }
    }
  }
}

function updateLayoutSizes(map) {
  const boardTileSize = Math.max(
    24,
    Math.floor(Math.min(playerMap.clientWidth / map.width, playerMap.clientHeight / map.height))
  );
  const cardWidth = Math.max(32, Math.floor(controlPanel.clientWidth / 5.55));
  const app = document.querySelector("#player-app");
  app.style.setProperty("--board-tile-size", `${boardTileSize}px`);
  app.style.setProperty("--card-width", `${cardWidth}px`);
}

function renderCardFace(card) {
  return `<span class="card-priority">${card.priority}</span>`;
}

function cardBackgroundPosition(card) {
  return `${cardFrameIndex(card) * 100 / 6}% 0`;
}

function cardFrameIndex(card) {
  return {
    move_3: 0,
    move_2: 1,
    move_1: 2,
    rotate_left: 3,
    rotate_right: 4,
    backup: 5,
    u_turn: 6
  }[card.type] ?? 0;
}

function directionDegrees(direction) {
  return { north: -90, east: 0, south: 90, west: 180 }[direction] || 0;
}

function floorFrameFor(x, y) {
  return FLOOR_FRAMES[stableTileValue(x, y) % FLOOR_FRAMES.length];
}

function floorRotationFor(x, y) {
  return (stableTileValue(x + 17, y + 31) % 4) * Math.PI / 2;
}

function stableTileValue(x, y) {
  return Math.abs((x * 73856093) ^ (y * 19349663));
}

function addFloorTile(scene, tile, x, y, px, py, tileSize) {
  if (!scene.textures.exists("floor_tiles")) {
    scene.add.rectangle(px, py, tileSize, tileSize, 0x323a40).setOrigin(0);
    return;
  }
  const floor = scene.add.image(
    px + tileSize / 2,
    py + tileSize / 2,
    "floor_tiles",
    floorFrameFor(x, y)
  );
  floor.setDisplaySize(tileSize, tileSize);
  floor.rotation = floorRotationFor(x, y);
}

function addPitTile(scene, tile, px, py, tileSize) {
  if (!scene.textures.exists("pit_tiles")) {
    scene.add.rectangle(px, py, tileSize, tileSize, 0x050708).setOrigin(0);
    return;
  }
  const frame = pitFrameFor(tile);
  const pit = scene.add.image(px + tileSize / 2, py + tileSize / 2, "pit_tiles", frame);
  pit.setDisplaySize(tileSize, tileSize);
}

function addZoneTile(scene, tile, px, py, tileSize) {
  if (!scene.textures.exists("zone_tiles")) return;
  const frame = zoneFrameFor(tile);
  if (frame === null) return;
  const zone = scene.add.image(px + tileSize / 2, py + tileSize / 2, "zone_tiles", frame);
  zone.setDisplaySize(tileSize, tileSize);
}

function zoneFrameFor(tile) {
  if (tile.repair === 1 || tile.zone === "repair1") return ZONE_FRAMES.repair1;
  if (tile.repair === 2 || tile.zone === "repair2") return ZONE_FRAMES.repair2;
  if (tile.spawn) return ZONE_FRAMES.spawn;
  if (tile.checkpoint) return ZONE_FRAMES.checkpoints[tile.checkpoint - 1] ?? null;
  return null;
}

function pitFrameFor(tile) {
  if (tile.pitGroup === "vertical") return PIT_FRAMES.vertical[tile.pitIndex || 0];
  if (tile.pitGroup === "horizontal") return PIT_FRAMES.horizontal[tile.pitIndex || 0];
  return PIT_FRAMES.single;
}

function addConveyorTile(scene, conveyor, px, py, tileSize) {
  if (!scene.textures.exists("conveyor_tiles")) return;
  const transform = conveyorTransform(conveyor);
  const sprite = scene.add.image(
    px + tileSize / 2,
    py + tileSize / 2,
    "conveyor_tiles",
    transform.frame
  );
  sprite.setDisplaySize(tileSize, tileSize);
  sprite.rotation = transform.rotation;
  sprite.setFlipX(transform.flipX);
  sprite.setFlipY(Boolean(transform.flipY));
}

function addRotatorTile(scene, rotator, px, py, tileSize) {
  if (!scene.textures.exists("gear_tiles")) return;
  const frame = rotator.direction === "ccw" || rotator.direction === "counterclockwise" ? 5 : 4;
  const gear = scene.add.image(px + tileSize / 2, py + tileSize / 2, "gear_tiles", frame);
  gear.setDisplaySize(tileSize, tileSize);
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

function directionRotationFromNorth(direction) {
  return {
    north: 0,
    east: Math.PI / 2,
    south: Math.PI,
    west: -Math.PI / 2
  }[direction] || 0;
}

function addWallTiles(scene, walls, px, py, tileSize) {
  if (!scene.textures.exists("wall_tiles")) return;
  for (const wall of walls) {
    const sprite = scene.add.image(px + tileSize / 2, py + tileSize / 2, "wall_tiles", 7);
    sprite.setDisplaySize(tileSize, tileSize);
    sprite.rotation = wallRotation(wall);
  }
}

function wallRotation(wall) {
  return {
    west: 0,
    north: Math.PI / 2,
    east: Math.PI,
    south: -Math.PI / 2
  }[wall] || 0;
}

function conveyorTransform(conveyor) {
  if (conveyor.shape === "turn" || conveyor.turn) {
    return conveyorTurnTransform(conveyor);
  }
  return {
    frame: conveyor.type === "fast" ? CONVEYOR_FRAMES.fastStraight : CONVEYOR_FRAMES.straight,
    rotation: rotationFromWest(conveyor.direction || "west"),
    flipX: false,
    flipY: false
  };
}

function conveyorTurnTransform(conveyor) {
  const from = conveyor.from || "east";
  const to = conveyor.to || turnDirectionForFrameOne(from, conveyor.turn || "right");
  const transforms = conveyor.type === "fast" ? FAST_TURN_TRANSFORMS : TURN_TRANSFORMS;
  const turnFrame = conveyor.type === "fast" ? CONVEYOR_FRAMES.fastTurnRight : CONVEYOR_FRAMES.turnRight;
  return transforms[`${from}:${to}`] || {
    frame: turnFrame,
    rotation: 0,
    flipX: false,
    flipY: conveyor.type === "fast"
  };
}

function rotationFromWest(direction) {
  return {
    west: 0,
    north: Math.PI / 2,
    east: Math.PI,
    south: -Math.PI / 2
  }[direction] || 0;
}

function rotationFromEast(direction) {
  return {
    east: 0,
    south: Math.PI / 2,
    west: Math.PI,
    north: -Math.PI / 2
  }[direction] || 0;
}

function turnDirectionForFrameOne(direction, turn) {
  const directions = ["north", "east", "south", "west"];
  const index = directions.indexOf(direction);
  const delta = turn === "right" ? -1 : 1;
  return directions[(index + delta + directions.length) % directions.length];
}

function startDrag(event) {
  const source = event.currentTarget;
  const cardId = source.dataset.cardId;
  if (!cardId) return;

  source.setPointerCapture?.(event.pointerId);
  source.classList.add("dragging-source");
  const ghost = source.cloneNode(true);
  ghost.classList.add("drag-ghost");
  document.body.append(ghost);

  dragState = {
    pointerId: event.pointerId,
    cardId,
    fromZone: source.dataset.zone,
    fromIndex: Number(source.dataset.index),
    source,
    ghost
  };

  moveGhost(event);
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", cancelDrag);
}

function moveDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  moveGhost(event);
}

function endDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState.ghost.style.display = "none";
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-zone]");
  applyDrop(target);
  cleanupDrag();
  render();
}

function cancelDrag(event) {
  if (dragState && event.pointerId === dragState.pointerId) {
    cleanupDrag();
    render();
  }
}

function moveGhost(event) {
  dragState.ghost.style.left = `${event.clientX}px`;
  dragState.ghost.style.top = `${event.clientY}px`;
}

function applyDrop(target) {
  if (!target) return;
  const targetZone = target.dataset.zone;
  const targetIndex = Number(target.dataset.index);
  if (target.dataset.locked === "true") return;

  if (targetZone === "hand") {
    const targetCardId = target.dataset.cardId;
    if (dragState.fromZone === "hand" && targetCardId) swapHandCards(dragState.cardId, targetCardId);
    if (dragState.fromZone === "register") program[dragState.fromIndex] = null;
    return;
  }

  if (targetZone !== "register") return;
  if (dragState.fromZone === "register") {
    if (dragState.source.dataset.locked === "true") return;
    [program[dragState.fromIndex], program[targetIndex]] = [program[targetIndex], program[dragState.fromIndex]];
    return;
  }

  const currentIndex = program.indexOf(dragState.cardId);
  if (currentIndex >= 0) program[currentIndex] = null;
  program[targetIndex] = dragState.cardId;
}

function isRegisterLocked(robot, index) {
  const damage = robot?.damage ?? 0;
  return damage >= 9 - index;
}

function swapHandCards(firstId, secondId) {
  if (firstId === secondId) return;
  const firstIndex = handOrder.indexOf(firstId);
  const secondIndex = handOrder.indexOf(secondId);
  if (firstIndex < 0 || secondIndex < 0) return;
  [handOrder[firstIndex], handOrder[secondIndex]] = [handOrder[secondIndex], handOrder[firstIndex]];
}

function cleanupDrag() {
  dragState.source.classList.remove("dragging-source");
  dragState.ghost.remove();
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", cancelDrag);
  dragState = null;
}

async function submitProgram() {
  if (program.some((cardId) => !cardId)) {
    alert("Choisis 5 cartes.");
    return;
  }
  if (socket) {
    socket.emit("player:program", { cards: program }, (reply) => {
      if (!reply.ok) alert(reply.error);
    });
    return;
  }
  const reply = await postJson(`${basePath}/api/player/program`, { playerId, cards: program });
  if (!reply.ok) alert(reply.error);
}

async function pollState() {
  const response = await fetch(`${basePath}/api/game/state`);
  latestState = await response.json();
  render();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return response.json();
}

async function initPlayerMap() {
  await loadPhaser();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "player-map",
    width: 720,
    height: 720,
    backgroundColor: "#171c20",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: {
      preload() {
        this.load.spritesheet("floor_tiles", `${basePath}/shared/assets/images/sols.png`, {
          frameWidth: 66,
          frameHeight: 66
        });
        this.load.spritesheet("pit_tiles", `${basePath}/shared/assets/images/pits.png`, {
          frameWidth: 66,
          frameHeight: 66
        });
        this.load.spritesheet("conveyor_tiles", `${basePath}/shared/assets/images/conv.png`, {
          frameWidth: 66,
          frameHeight: 66
        });
        this.load.spritesheet("gear_tiles", `${basePath}/shared/assets/images/gears.png`, {
          frameWidth: 66,
          frameHeight: 66
        });
        this.load.spritesheet("wall_tiles", `${basePath}/shared/assets/images/walls.png`, {
          frameWidth: 66,
          frameHeight: 66
        });
        this.load.spritesheet("zone_tiles", `${basePath}/shared/assets/images/zones.png`, {
          frameWidth: 66,
          frameHeight: 66
        });
        this.load.spritesheet("laser_tiles", `${basePath}/shared/assets/images/lasers.png`, {
          frameWidth: 66,
          frameHeight: 66
        });
      },
      create() {
        playerMapScene = this;
        if (latestState) renderMap(latestState);
      }
    }
  });
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
