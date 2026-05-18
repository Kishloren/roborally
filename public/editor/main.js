const basePath = detectBasePath("backoffice");
const mapsList = document.querySelector("#maps-list");
const toolList = document.querySelector("#tool-list");
const mapNameInput = document.querySelector("#map-name");
const mapWidthInput = document.querySelector("#map-width");
const mapHeightInput = document.querySelector("#map-height");
const newMapButton = document.querySelector("#new-map");
const resizeButton = document.querySelector("#resize-map");
const saveState = document.querySelector("#save-state");
const stage = document.querySelector("#editor-stage");

const FLOOR_FRAMES = [0, 6, 13, 14, 15, 16];
const PIT_FRAMES = { single: 11 };
const ZONE_FRAMES = { repair1: 0, repair2: 1, spawn: 2, checkpoints: [6, 7, 8, 9, 12, 13, 14, 15] };
const LASER_FRAMES = { beamsNorthSouth: [0, 1, 2], emittersNorth: [8, 9, 10] };
const CONVEYOR_FRAMES = { straight: 0, turnRight: 1, fastStraight: 8, fastTurnRight: 9 };
const DIRECTIONS = ["north", "east", "south", "west"];

const TOOLS = [
  { id: "erase", label: "Effacer", hint: "Retour au sol", icon: "X" },
  { id: "pit", label: "Trou", hint: "Case fatale", icon: "P" },
  { id: "conveyor", label: "Convoyeur", hint: "Droit", icon: "->" },
  { id: "conveyor-turn", label: "Convoyeur", hint: "Virage", icon: "L" },
  { id: "fast-conveyor", label: "Convoyeur rapide", hint: "Droit", icon: "=>" },
  { id: "fast-conveyor-turn", label: "Convoyeur rapide", hint: "Virage", icon: "F" },
  { id: "rotator-cw", label: "Rotator horaire", hint: "Frame 4", icon: "R" },
  { id: "rotator-ccw", label: "Rotator antihoraire", hint: "Frame 5", icon: "A" },
  { id: "wall", label: "Mur", hint: "Cote de case", icon: "|" },
  { id: "repair1", label: "Repair 1", hint: "Zone", icon: "1" },
  { id: "repair2", label: "Repair 2", hint: "Zone", icon: "2" },
  { id: "spawn", label: "Depart", hint: "Numero auto", icon: "S" },
  { id: "checkpoint", label: "Checkpoint", hint: "Numero auto", icon: "C" },
  { id: "laser-emitter", label: "Laser emetteur", hint: "Simple", icon: "E" },
  { id: "laser-beam", label: "Rayon laser", hint: "Nord-sud", icon: "I" },
  { id: "pusher", label: "Pousseur", hint: "Direction", icon: ">" },
  { id: "crusher", label: "Ecraseur", hint: "Case", icon: "!" }
];

let editorGame = null;
let sceneRef = null;
let currentMap = null;
let selectedTool = TOOLS[1];
let rotationIndex = 1;
let tileSize = 64;
let offsetX = 0;
let offsetY = 0;
let saveTimer = null;
let activeCell = null;

await loadPhaser();
renderToolList();
await loadMaps();
initEditor();

newMapButton.addEventListener("click", createNewMap);
mapNameInput.addEventListener("input", () => {
  if (!currentMap) return;
  currentMap.name = mapNameInput.value.trim() || currentMap.id;
  scheduleSave();
});
resizeButton.addEventListener("click", resizeCurrentMap);
window.addEventListener("keydown", handleKeyDown);

stage.addEventListener("dragover", (event) => event.preventDefault());
stage.addEventListener("drop", (event) => {
  event.preventDefault();
  const tool = TOOLS.find((item) => item.id === event.dataTransfer.getData("text/plain"));
  if (tool) selectedTool = tool;
  syncSelectedTool();
  const point = eventToBoardPoint(event);
  if (point) {
    setActiveCell(point.x, point.y);
    applyTool(point.x, point.y);
  }
});

function initEditor() {
  const { width, height } = stage.getBoundingClientRect();
  editorGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "editor-stage",
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
    backgroundColor: "#171c20",
    scale: { mode: Phaser.Scale.RESIZE },
    scene: {
      preload,
      create
    }
  });
  window.addEventListener("resize", () => {
    const rect = stage.getBoundingClientRect();
    editorGame.scale.resize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
    renderMap();
  });
}

function preload() {
  this.load.spritesheet("floor_tiles", `${basePath}/shared/assets/images/sols.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("pit_tiles", `${basePath}/shared/assets/images/pits.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("conveyor_tiles", `${basePath}/shared/assets/images/conv.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("gear_tiles", `${basePath}/shared/assets/images/gears.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("wall_tiles", `${basePath}/shared/assets/images/walls.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("zone_tiles", `${basePath}/shared/assets/images/zones.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("laser_tiles", `${basePath}/shared/assets/images/lasers.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("pusher_tiles", `${basePath}/shared/assets/images/pushers.png`, { frameWidth: 66, frameHeight: 66 });
  this.load.spritesheet("crusher_tiles", `${basePath}/shared/assets/images/crush.png`, { frameWidth: 66, frameHeight: 66 });
}

function create() {
  sceneRef = this;
  this.input.on("pointerdown", (pointer) => {
    const point = pointerToBoardPoint(pointer.x, pointer.y);
    if (point) setActiveCell(point.x, point.y);
  });
  renderMap();
}

async function loadMaps() {
  const response = await fetch(`${basePath}/api/maps`);
  const maps = await response.json();
  renderMapsList(maps);
  if (maps[0]) {
    await loadMap(maps[0].id);
  } else {
    await createNewMap();
  }
}

async function loadMap(id) {
  const response = await fetch(`${basePath}/api/maps/${encodeURIComponent(id)}`);
  currentMap = await response.json();
  activeCell = null;
  mapNameInput.value = currentMap.name;
  mapWidthInput.value = currentMap.width;
  mapHeightInput.value = currentMap.height;
  renderMapsList(await (await fetch(`${basePath}/api/maps`)).json());
  renderMap();
  setSaveState("Charge");
}

async function createNewMap() {
  const id = `map-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;
  const payload = { id, name: "Nouvelle carte", width: 12, height: 12, tileSize: 72, tiles: [] };
  const response = await fetch(`${basePath}/api/maps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  currentMap = result.map;
  activeCell = null;
  mapNameInput.value = currentMap.name;
  mapWidthInput.value = currentMap.width;
  mapHeightInput.value = currentMap.height;
  renderMapsList(await (await fetch(`${basePath}/api/maps`)).json());
  renderMap();
  setSaveState("Cree");
}

function renderMapsList(maps) {
  mapsList.replaceChildren(...maps.map((map) => {
    const button = document.createElement("button");
    button.className = `map-button ${currentMap?.id === map.id ? "active" : ""}`;
    button.innerHTML = `<span class="tool-title">${escapeHtml(map.name)}</span><span class="tool-subtitle">${map.width}x${map.height} - ${escapeHtml(map.id)}</span>`;
    button.addEventListener("click", () => loadMap(map.id));
    return button;
  }));
}

function renderToolList() {
  toolList.replaceChildren(...TOOLS.map((tool) => {
    const button = document.createElement("button");
    button.className = `tool-button ${selectedTool.id === tool.id ? "active" : ""}`;
    button.draggable = true;
    button.title = `${tool.label} - ${tool.hint}`;
    button.setAttribute("aria-label", `${tool.label} - ${tool.hint}`);
    button.innerHTML = `<span class="tool-swatch">${escapeHtml(tool.icon)}</span><span><span class="tool-title">${escapeHtml(tool.label)}</span><span class="tool-subtitle">${escapeHtml(tool.hint)}</span></span>`;
    button.addEventListener("click", () => {
      selectedTool = tool;
      syncSelectedTool();
    });
    button.addEventListener("dragstart", (event) => {
      selectedTool = tool;
      syncSelectedTool();
      event.dataTransfer.setData("text/plain", tool.id);
      event.dataTransfer.effectAllowed = "copy";
    });
    return button;
  }));
}

function syncSelectedTool() {
  document.querySelectorAll(".tool-button").forEach((button, index) => {
    button.classList.toggle("active", TOOLS[index].id === selectedTool.id);
  });
}

function resizeCurrentMap() {
  if (!currentMap) return;
  const width = clampNumber(mapWidthInput.value, 1, 64, currentMap.width);
  const height = clampNumber(mapHeightInput.value, 1, 64, currentMap.height);
  currentMap.width = width;
  currentMap.height = height;
  currentMap.tiles = currentMap.tiles.filter((tile) => tile.x < width && tile.y < height);
  if (activeCell && (activeCell.x >= width || activeCell.y >= height)) activeCell = null;
  renderMap();
  scheduleSave();
}

function renderMap() {
  if (!sceneRef || !currentMap) return;
  const scene = sceneRef;
  scene.children.removeAll();
  const width = scene.scale.width;
  const height = scene.scale.height;
  tileSize = Math.floor(Math.min((width - 112) / currentMap.width, (height - 112) / currentMap.height));
  tileSize = Math.max(22, Math.min(66, tileSize));
  offsetX = Math.floor((width - currentMap.width * tileSize) / 2);
  offsetY = Math.floor((height - currentMap.height * tileSize) / 2);
  const tiles = new Map(currentMap.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));

  scene.add.rectangle(0, 0, width, height, 0x171c20).setOrigin(0);
  for (let y = 0; y < currentMap.height; y += 1) {
    for (let x = 0; x < currentMap.width; x += 1) {
      const tile = tiles.get(`${x},${y}`) || { x, y };
      const px = offsetX + x * tileSize;
      const py = offsetY + y * tileSize;
      drawTile(scene, tile, px, py);
      const cell = scene.add.rectangle(px, py, tileSize, tileSize).setOrigin(0).setStrokeStyle(1, 0x303941);
      cell.setInteractive();
      cell.on("pointerover", () => cell.setStrokeStyle(2, 0xf2c14e));
      cell.on("pointerout", () => cell.setStrokeStyle(isActiveCell(x, y) ? 3 : 1, isActiveCell(x, y) ? 0xf2c14e : 0x303941));
      if (isActiveCell(x, y)) {
        scene.add.rectangle(px + 2, py + 2, tileSize - 4, tileSize - 4).setOrigin(0).setStrokeStyle(3, 0xf2c14e);
      }
    }
  }
}

function drawTile(scene, tile, px, py) {
  addFloor(scene, tile, px, py);
  if (tile.floor === "pit") addImage(scene, "pit_tiles", PIT_FRAMES.single, px, py);
  if (tile.conveyor) addConveyor(scene, tile.conveyor, px, py);
  if (tile.rotator) addImage(scene, "gear_tiles", tile.rotator.direction === "ccw" ? 5 : 4, px, py);
  if (tile.repair === 1) addImage(scene, "zone_tiles", ZONE_FRAMES.repair1, px, py);
  if (tile.repair === 2) addImage(scene, "zone_tiles", ZONE_FRAMES.repair2, px, py);
  if (tile.spawn) addImage(scene, "zone_tiles", ZONE_FRAMES.spawn, px, py);
  if (tile.checkpoint) addImage(scene, "zone_tiles", ZONE_FRAMES.checkpoints[tile.checkpoint - 1] ?? ZONE_FRAMES.checkpoints[0], px, py);
  if (tile.laser) addLaser(scene, tile.laser, px, py);
  if (tile.walls) tile.walls.forEach((wall) => addWall(scene, wall, px, py));
  if (tile.pusher) addMachine(scene, "pusher_tiles", tile.pusher.direction, px, py, "P");
  if (tile.crusher) addMachine(scene, "crusher_tiles", "north", px, py, "!");
  if (tile.spawn || tile.checkpoint) {
    scene.add.text(px + tileSize / 2, py + tileSize / 2, String(tile.spawn || tile.checkpoint), {
      fontFamily: "Arial",
      fontSize: `${Math.max(12, Math.round(tileSize * 0.34))}px`,
      fontStyle: "bold",
      color: "#101316"
    }).setOrigin(0.5);
  }
}

function addFloor(scene, tile, px, py) {
  if (!scene.textures.exists("floor_tiles")) {
    scene.add.rectangle(px, py, tileSize, tileSize, 0x323a40).setOrigin(0);
    return;
  }
  const floor = scene.add.image(px + tileSize / 2, py + tileSize / 2, "floor_tiles", FLOOR_FRAMES[stableTileValue(tile.x, tile.y) % FLOOR_FRAMES.length]);
  floor.setDisplaySize(tileSize, tileSize);
  floor.rotation = (stableTileValue(tile.x + 17, tile.y + 31) % 4) * Math.PI / 2;
}

function addImage(scene, key, frame, px, py) {
  if (!scene.textures.exists(key)) return;
  scene.add.image(px + tileSize / 2, py + tileSize / 2, key, frame).setDisplaySize(tileSize, tileSize);
}

function addConveyor(scene, conveyor, px, py) {
  if (!scene.textures.exists("conveyor_tiles")) return;
  const straight = conveyor.type === "fast" ? CONVEYOR_FRAMES.fastStraight : CONVEYOR_FRAMES.straight;
  const turn = conveyor.type === "fast" ? CONVEYOR_FRAMES.fastTurnRight : CONVEYOR_FRAMES.turnRight;
  const sprite = scene.add.image(px + tileSize / 2, py + tileSize / 2, "conveyor_tiles", conveyor.shape === "turn" ? turn : straight);
  sprite.setDisplaySize(tileSize, tileSize);
  sprite.rotation = conveyor.shape === "turn" ? turnRotation(conveyor.from || "east") : rotationFromWest(conveyor.direction || "west");
  if (conveyor.shape === "turn") {
    sprite.setFlipX(conveyor.turn === "left");
    sprite.setFlipY(conveyor.type === "fast");
  }
}

function addLaser(scene, laser, px, py) {
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

function addWall(scene, wall, px, py) {
  if (!scene.textures.exists("wall_tiles")) return;
  const sprite = scene.add.image(px + tileSize / 2, py + tileSize / 2, "wall_tiles", 7);
  sprite.setDisplaySize(tileSize, tileSize);
  sprite.rotation = { west: 0, north: Math.PI / 2, east: Math.PI, south: -Math.PI / 2 }[wall] || 0;
}

function addMachine(scene, key, direction, px, py, fallbackLabel) {
  if (scene.textures.exists(key)) {
    const sprite = scene.add.image(px + tileSize / 2, py + tileSize / 2, key, 0);
    sprite.setDisplaySize(tileSize, tileSize);
    sprite.rotation = directionRotationFromNorth(direction);
    return;
  }
  scene.add.text(px + tileSize / 2, py + tileSize / 2, fallbackLabel, { fontFamily: "Arial", fontSize: "22px", color: "#f2c14e" }).setOrigin(0.5);
}

function applyTool(x, y) {
  if (!currentMap || x < 0 || y < 0 || x >= currentMap.width || y >= currentMap.height) return;
  const tile = getMutableTile(x, y);
  const direction = currentDirection();

  if (selectedTool.id === "erase") {
    removeTile(x, y);
  } else if (selectedTool.id === "pit") {
    replaceTile(x, y, { x, y, floor: "pit" });
  } else if (selectedTool.id === "conveyor") {
    setBaseTile(tile);
    tile.conveyor = { type: "normal", direction };
  } else if (selectedTool.id === "conveyor-turn") {
    setBaseTile(tile);
    tile.conveyor = { type: "normal", shape: "turn", from: direction, turn: "right" };
  } else if (selectedTool.id === "fast-conveyor") {
    setBaseTile(tile);
    tile.conveyor = { type: "fast", direction };
  } else if (selectedTool.id === "fast-conveyor-turn") {
    setBaseTile(tile);
    tile.conveyor = { type: "fast", shape: "turn", from: direction, turn: "left" };
  } else if (selectedTool.id === "rotator-cw") {
    setBaseTile(tile);
    tile.rotator = { direction: "cw" };
  } else if (selectedTool.id === "rotator-ccw") {
    setBaseTile(tile);
    tile.rotator = { direction: "ccw" };
  } else if (selectedTool.id === "wall") {
    setBaseTile(tile);
    tile.walls = toggleValue(tile.walls || [], direction);
    if (tile.walls.length === 0) delete tile.walls;
  } else if (selectedTool.id === "repair1") {
    setBaseTile(tile);
    tile.repair = 1;
  } else if (selectedTool.id === "repair2") {
    setBaseTile(tile);
    tile.repair = 2;
  } else if (selectedTool.id === "spawn") {
    setBaseTile(tile);
    tile.spawn = nextNumber("spawn", 8);
    tile.direction = direction;
  } else if (selectedTool.id === "checkpoint") {
    setBaseTile(tile);
    tile.checkpoint = nextNumber("checkpoint", 8);
  } else if (selectedTool.id === "laser-emitter") {
    setBaseTile(tile);
    tile.laser = { emitter: "single", direction, power: 1 };
  } else if (selectedTool.id === "laser-beam") {
    setBaseTile(tile);
    tile.laser = { beam: direction === "east" || direction === "west" ? "east-west" : "north-south", power: 1 };
  } else if (selectedTool.id === "pusher") {
    setBaseTile(tile);
    tile.pusher = { direction, activeRegisters: [2, 4] };
  } else if (selectedTool.id === "crusher") {
    setBaseTile(tile);
    tile.crusher = { activeRegisters: [1, 3, 5] };
  }

  pruneEmptyTiles();
  renderMap();
  scheduleSave();
}

function setActiveCell(x, y) {
  if (!currentMap || x < 0 || y < 0 || x >= currentMap.width || y >= currentMap.height) return;
  activeCell = { x, y };
  renderMap();
}

function isActiveCell(x, y) {
  return activeCell?.x === x && activeCell?.y === y;
}

function handleKeyDown(event) {
  if (isTextInput(event.target) || !activeCell) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    removeTile(activeCell.x, activeCell.y);
    renderMap();
    scheduleSave();
    return;
  }
  if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    rotateActiveTile();
    return;
  }
  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    flipActiveTile();
  }
}

function rotateActiveTile() {
  const tile = activeTile();
  if (!tile) return;
  if (tile.conveyor?.shape === "turn") tile.conveyor.from = nextDirection(tile.conveyor.from || "east");
  else if (tile.conveyor) tile.conveyor.direction = nextDirection(tile.conveyor.direction || "west");
  if (tile.walls) tile.walls = tile.walls.map(nextDirection);
  if (tile.laser?.direction) tile.laser.direction = nextDirection(tile.laser.direction);
  if (tile.laser?.beam) tile.laser.beam = tile.laser.beam === "north-south" ? "east-west" : "north-south";
  if (tile.pusher?.direction) tile.pusher.direction = nextDirection(tile.pusher.direction);
  if (tile.direction) tile.direction = nextDirection(tile.direction);
  renderMap();
  scheduleSave();
}

function flipActiveTile() {
  const tile = activeTile();
  if (!tile) return;
  let changed = false;
  if (tile.conveyor?.shape === "turn") {
    tile.conveyor.turn = tile.conveyor.turn === "left" ? "right" : "left";
    changed = true;
  }
  if (tile.rotator) {
    tile.rotator.direction = tile.rotator.direction === "ccw" ? "cw" : "ccw";
    changed = true;
  }
  if (tile.walls?.length) {
    tile.walls = tile.walls.map(oppositeDirection);
    changed = true;
  }
  if (tile.laser?.direction) {
    tile.laser.direction = oppositeDirection(tile.laser.direction);
    changed = true;
  }
  if (tile.pusher?.direction) {
    tile.pusher.direction = oppositeDirection(tile.pusher.direction);
    changed = true;
  }
  if (tile.direction) {
    tile.direction = oppositeDirection(tile.direction);
    changed = true;
  }
  if (!changed) return;
  renderMap();
  scheduleSave();
}

function activeTile() {
  return currentMap?.tiles.find((tile) => tile.x === activeCell?.x && tile.y === activeCell?.y) || null;
}

function getMutableTile(x, y) {
  let tile = currentMap.tiles.find((item) => item.x === x && item.y === y);
  if (!tile) {
    tile = { x, y, floor: "normal" };
    currentMap.tiles.push(tile);
  }
  return tile;
}

function setBaseTile(tile) {
  tile.floor = "normal";
  delete tile.conveyor;
  delete tile.rotator;
  delete tile.repair;
  delete tile.spawn;
  delete tile.direction;
  delete tile.checkpoint;
  delete tile.laser;
  delete tile.pusher;
  delete tile.crusher;
}

function replaceTile(x, y, nextTile) {
  removeTile(x, y);
  currentMap.tiles.push(nextTile);
}

function removeTile(x, y) {
  currentMap.tiles = currentMap.tiles.filter((tile) => tile.x !== x || tile.y !== y);
}

function pruneEmptyTiles() {
  currentMap.tiles = currentMap.tiles.filter((tile) => Object.keys(tile).some((key) => !["x", "y", "floor"].includes(key)) || tile.floor === "pit");
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveState("Sauvegarde...");
  saveTimer = setTimeout(saveCurrentMap, 180);
}

async function saveCurrentMap() {
  if (!currentMap) return;
  try {
    const response = await fetch(`${basePath}/api/maps/${encodeURIComponent(currentMap.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentMap)
    });
    const result = await response.json();
    if (!result.ok) throw new Error(result.error);
    currentMap = result.map;
    setSaveState("Sauvegarde");
  } catch (error) {
    setSaveState(`Erreur: ${error.message}`);
  }
}

function setSaveState(text) {
  saveState.textContent = text;
}

function eventToBoardPoint(event) {
  const rect = editorGame.canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (editorGame.scale.width / rect.width);
  const y = (event.clientY - rect.top) * (editorGame.scale.height / rect.height);
  return pointerToBoardPoint(x, y);
}

function pointerToBoardPoint(x, y) {
  const cellX = Math.floor((x - offsetX) / tileSize);
  const cellY = Math.floor((y - offsetY) / tileSize);
  if (cellX < 0 || cellY < 0 || !currentMap || cellX >= currentMap.width || cellY >= currentMap.height) return null;
  return { x: cellX, y: cellY };
}

function currentDirection() {
  return DIRECTIONS[rotationIndex];
}

function nextNumber(key, max) {
  const used = new Set(currentMap.tiles.map((tile) => tile[key]).filter(Boolean));
  for (let value = 1; value <= max; value += 1) {
    if (!used.has(value)) return value;
  }
  return max;
}

function toggleValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function rotationFromWest(direction) {
  return { west: 0, north: Math.PI / 2, east: Math.PI, south: -Math.PI / 2 }[direction] || 0;
}

function directionRotationFromNorth(direction) {
  return { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 }[direction] || 0;
}

function nextDirection(direction) {
  const index = DIRECTIONS.indexOf(direction);
  return DIRECTIONS[(Math.max(0, index) + 1) % DIRECTIONS.length];
}

function oppositeDirection(direction) {
  return { north: "south", east: "west", south: "north", west: "east" }[direction] || direction;
}

function turnRotation(from) {
  return { east: Math.PI, north: Math.PI / 2, west: 0, south: Math.PI * 1.5 }[from] || 0;
}

function isTextInput(target) {
  return target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
}

function stableTileValue(x, y) {
  return Math.abs((x * 73856093) ^ (y * 19349663));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
