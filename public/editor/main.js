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
const stackList = document.querySelector("#stack-list");
const activeCellLabel = document.querySelector("#active-cell-label");
const copyLayerButton = document.querySelector("#copy-layer");
const cutLayerButton = document.querySelector("#cut-layer");
const pasteLayerButton = document.querySelector("#paste-layer");
const segmentSelector = document.querySelector("#segment-selector");
const orderCardList = document.querySelector("#order-card-list");
const testBlankBoardInput = document.querySelector("#test-blank-board");
const testRobotList = document.querySelector("#test-robot-list");
const testStatus = document.querySelector("#test-status");

const TEST_MAP_ID = "test";
const FLOOR_FRAMES = [0, 6, 13, 14, 15, 16];
const PIT_FRAMES = { single: 11 };
const ZONE_FRAMES = { repair1: 0, repair2: 1, spawn: 2, checkpoints: [6, 7, 8, 9, 12, 13, 14, 15] };
const LASER_FRAMES = { beamsNorthSouth: [0, 1, 2], emittersNorth: [8, 9, 10] };
const CONVEYOR_FRAMES = { straight: 0, turnRight: 1, merge: 2, fastStraight: 8, fastTurnRight: 9, fastMerge: 10 };
const CRUSHER_FRAMES = { plain: 21, topSegmentStart: 23, conveyor: 28, bottomSegmentStart: 30 };
const DIRECTIONS = ["north", "east", "south", "west"];
const ICON_SIZE = 32;
const IMAGE_SOURCES = {
  floor_tiles: "sols.png",
  pit_tiles: "pits.png",
  conveyor_tiles: "conv.png",
  gear_tiles: "gears.png",
  wall_tiles: "walls.png",
  zone_tiles: "zones.png",
  laser_tiles: "lasers.png",
  pusher_tiles: "pushers.png",
  crusher_tiles: "crush.png",
  robot_tiles: "robots.png"
};
const ORDER_CARD_EXAMPLES = [
  { type: "move_3", frame: 0, priority: 790, action: "move", distance: 3 },
  { type: "move_2", frame: 1, priority: 670, action: "move", distance: 2 },
  { type: "move_1", frame: 2, priority: 490, action: "move", distance: 1 },
  { type: "rotate_left", frame: 3, priority: 70, action: "rotate", turn: -1 },
  { type: "rotate_right", frame: 4, priority: 80, action: "rotate", turn: 1 },
  { type: "backup", frame: 5, priority: 430, action: "move", distance: -1 },
  { type: "u_turn", frame: 6, priority: 10, action: "rotate", turn: 2 }
];
const TEST_ANIMATION_DURATION = 1000;
const TEST_ANIMATION_EASE = "Cubic.easeInOut";

const TOOLS = [
  { id: "erase", label: "Effacer", hint: "Retour au sol", icon: "X", sprite: { key: "floor_tiles", frame: 0 } },
  { id: "pit", label: "Trou", hint: "Case fatale", icon: "P", sprite: { key: "pit_tiles", frame: PIT_FRAMES.single } },
  { id: "conveyor", label: "Convoyeur", hint: "Droit", icon: "->", sprite: { key: "conveyor_tiles", frame: CONVEYOR_FRAMES.straight, rotation: 180 } },
  { id: "conveyor-turn", label: "Convoyeur", hint: "Virage", icon: "L", sprite: { key: "conveyor_tiles", frame: CONVEYOR_FRAMES.turnRight } },
  { id: "conveyor-merge", label: "Convoyeur 2 entrees", hint: "W+S vers E", icon: "M", sprite: { key: "conveyor_tiles", frame: CONVEYOR_FRAMES.merge } },
  { id: "fast-conveyor", label: "Convoyeur rapide", hint: "Droit", icon: "=>", sprite: { key: "conveyor_tiles", frame: CONVEYOR_FRAMES.fastStraight, rotation: 180 } },
  { id: "fast-conveyor-turn", label: "Convoyeur rapide", hint: "Virage", icon: "F", sprite: { key: "conveyor_tiles", frame: CONVEYOR_FRAMES.fastTurnRight, flipY: true } },
  { id: "fast-conveyor-merge", label: "Convoyeur rapide 2 entrees", hint: "W+S vers E", icon: "Q", sprite: { key: "conveyor_tiles", frame: CONVEYOR_FRAMES.fastMerge } },
  { id: "rotator-cw", label: "Rotator horaire", hint: "Frame 4", icon: "R", sprite: { key: "gear_tiles", frame: 4 } },
  { id: "rotator-ccw", label: "Rotator antihoraire", hint: "Frame 5", icon: "A", sprite: { key: "gear_tiles", frame: 5 } },
  { id: "wall", label: "Mur", hint: "Cote de case", icon: "|", sprite: { key: "wall_tiles", frame: 7 } },
  { id: "repair1", label: "Repair 1", hint: "Zone", icon: "1", sprite: { key: "zone_tiles", frame: ZONE_FRAMES.repair1 } },
  { id: "repair2", label: "Repair 2", hint: "Zone", icon: "2", sprite: { key: "zone_tiles", frame: ZONE_FRAMES.repair2 } },
  { id: "spawn", label: "Depart", hint: "Numero auto", icon: "S", sprite: { key: "zone_tiles", frame: ZONE_FRAMES.spawn } },
  { id: "checkpoint", label: "Checkpoint", hint: "Numero auto", icon: "C", sprite: { key: "zone_tiles", frame: ZONE_FRAMES.checkpoints[0] } },
  { id: "laser-emitter", label: "Laser emetteur", hint: "Simple", icon: "E", sprite: { key: "laser_tiles", frame: LASER_FRAMES.emittersNorth[0] } },
  { id: "laser-beam", label: "Rayon laser", hint: "Nord-sud", icon: "I", sprite: { key: "laser_tiles", frame: LASER_FRAMES.beamsNorthSouth[0] } },
  { id: "pusher", label: "Pousseur", hint: "Direction", icon: ">", sprite: { key: "pusher_tiles", frame: 0 } },
  { id: "crusher", label: "Ecraseur", hint: "Plain", icon: "!", sprite: { key: "crusher_tiles", frame: CRUSHER_FRAMES.plain } },
  { id: "crusher-conveyor", label: "Ecraseur convoyeur", hint: "W->E", icon: "K", sprite: { key: "crusher_tiles", frame: CRUSHER_FRAMES.conveyor } }
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
let selectedLayerId = null;
let clipboardLayer = null;
let testRobots = [];
let selectedTestRobotId = null;
let selectedRobotPaletteId = 1;
let selectedOrderCardType = ORDER_CARD_EXAMPLES[0].type;
let lastTestAction = "";
let robotAnimation = null;
let robotAnimationQueue = [];
let currentSegment = 1;
const imageInfo = new Map();

await loadPhaser();
await loadSpriteInfo();
renderToolList();
renderTestRobotOptions();
renderOrderCards();
await loadMaps();
initEditor();

newMapButton.addEventListener("click", createNewMap);
mapNameInput.addEventListener("input", () => {
  if (!currentMap) return;
  currentMap.name = mapNameInput.value.trim() || currentMap.id;
  scheduleSave();
});
resizeButton.addEventListener("click", resizeCurrentMap);
copyLayerButton.addEventListener("click", copySelectedLayer);
cutLayerButton.addEventListener("click", cutSelectedLayer);
pasteLayerButton.addEventListener("click", pasteClipboardLayer);
segmentSelector.addEventListener("change", handleSegmentChange);
testBlankBoardInput.addEventListener("change", renderMap);
window.addEventListener("keydown", handleKeyDown);

stage.addEventListener("dragover", handleStageDragOver);
stage.addEventListener("drop", handleStageDrop);

function handleStageDragOver(event) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function handleStageDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const point = eventToBoardPoint(event);
  const robotId = draggedRobotId(event);
  if (robotId && point) {
    placeTestRobot(robotId, point.x, point.y);
    return;
  }
  const toolId = event.dataTransfer?.getData("text/plain") || "";
  const tool = TOOLS.find((item) => item.id === toolId);
  if (tool) selectedTool = tool;
  syncSelectedTool();
  if (point) {
    setActiveCell(point.x, point.y);
    applyTool(point.x, point.y);
  }
}

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
  this.load.spritesheet("robot_tiles", `${basePath}/shared/assets/images/robots.png`, { frameWidth: 256, frameHeight: 256 });
}

function create() {
  sceneRef = this;
  wireCanvasDropTarget();
  this.input.on("pointerdown", (pointer) => {
    const point = pointerToBoardPoint(pointer.x, pointer.y);
    if (!point) return;
    if (selectTestRobotAt(point.x, point.y)) return;
    setActiveCell(point.x, point.y);
  });
  renderMap();
}

async function loadMaps() {
  const response = await fetch(`${basePath}/api/maps`);
  const maps = await response.json();
  renderMapsList(maps);
  if (maps.some((map) => map.id === TEST_MAP_ID)) {
    await loadMap(TEST_MAP_ID);
  } else {
    await createTestMap();
  }
}

async function loadMap(id) {
  const response = await fetch(`${basePath}/api/maps/${encodeURIComponent(id)}`);
  currentMap = await response.json();
  activeCell = null;
  selectedLayerId = null;
  mapNameInput.value = currentMap.name;
  mapWidthInput.value = currentMap.width;
  mapHeightInput.value = currentMap.height;
  renderMapsList(await (await fetch(`${basePath}/api/maps`)).json());
  renderMap();
  setSaveState("Charge");
}

async function createTestMap() {
  const payload = { id: TEST_MAP_ID, name: "test", width: 12, height: 12, tileSize: 72, tiles: [] };
  const response = await fetch(`${basePath}/api/maps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  currentMap = result.map;
  activeCell = null;
  selectedLayerId = null;
  mapNameInput.value = currentMap.name;
  mapWidthInput.value = currentMap.width;
  mapHeightInput.value = currentMap.height;
  renderMapsList(await (await fetch(`${basePath}/api/maps`)).json());
  renderMap();
  setSaveState("Test cree");
}

async function createNewMap() {
  const payload = { id: TEST_MAP_ID, name: "test", width: 12, height: 12, tileSize: 72, tiles: [] };
  const response = await fetch(`${basePath}/api/maps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  currentMap = result.map;
  activeCell = null;
  selectedLayerId = null;
  mapNameInput.value = currentMap.name;
  mapWidthInput.value = currentMap.width;
  mapHeightInput.value = currentMap.height;
  renderMapsList(await (await fetch(`${basePath}/api/maps`)).json());
  renderMap();
  setSaveState("Test reinitialise");
}

function renderMapsList(maps) {
  const visibleMaps = maps.filter((map) => map.id === TEST_MAP_ID);
  mapsList.replaceChildren(...visibleMaps.map((map) => {
    const button = document.createElement("button");
    button.className = `map-button ${currentMap?.id === map.id ? "active" : ""}`;
    button.innerHTML = `<span class="tool-title">${escapeHtml(map.name)}</span><span class="tool-subtitle">${map.width}x${map.height} - ${escapeHtml(map.id)}</span>`;
    button.addEventListener("click", () => loadMap(TEST_MAP_ID));
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
    const swatch = document.createElement("span");
    swatch.className = "tool-swatch";
    swatch.textContent = tool.icon;
    applySpriteIcon(swatch, tool.sprite);
    const label = document.createElement("span");
    label.innerHTML = `<span class="tool-title">${escapeHtml(tool.label)}</span><span class="tool-subtitle">${escapeHtml(tool.hint)}</span>`;
    button.append(swatch, label);
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

function renderTestRobotOptions() {
  testRobotList.replaceChildren(...Array.from({ length: 8 }, (_, index) => {
    const id = index + 1;
    const button = document.createElement("button");
    button.className = `robot-button ${selectedRobotPaletteId === id ? "active" : ""}`;
    button.draggable = true;
    button.dataset.robotId = String(id);
    button.title = `Robot ${id}`;
    button.setAttribute("aria-label", `Robot ${id}`);
    const swatch = document.createElement("span");
    swatch.className = "robot-swatch";
    swatch.draggable = false;
    swatch.style.backgroundPosition = `-${index * 34}px 0`;
    button.append(swatch);
    button.addEventListener("click", () => {
      selectedRobotPaletteId = id;
      syncSelectedRobotPalette();
    });
    button.addEventListener("dragstart", (event) => {
      selectedRobotPaletteId = id;
      syncSelectedRobotPalette();
      event.dataTransfer.setData("application/x-roborally-robot", String(id));
      event.dataTransfer.setData("text/plain", `robot:${id}`);
      event.dataTransfer.effectAllowed = "copy";
    });
    return button;
  }));
}

function renderOrderCards() {
  const cards = [
    ...ORDER_CARD_EXAMPLES.map((card) => {
      const button = document.createElement("button");
      button.className = `order-card ${selectedOrderCardType === card.type ? "active" : ""}`;
      button.type = "button";
      button.title = card.type;
      button.setAttribute("aria-label", card.type);
      button.style.backgroundPosition = `${(card.frame / 6) * 100}% 0`;
      const priority = document.createElement("span");
      priority.className = "order-card-priority";
      priority.textContent = String(card.priority);
      button.append(priority);
      button.addEventListener("click", () => {
        selectedOrderCardType = card.type;
        applyOrderCard(card);
        renderOrderCards();
        updateTestStatus();
      });
      return button;
    }),
    emptyOrderCard()
  ];
  orderCardList.replaceChildren(...cards);
}

function emptyOrderCard() {
  const item = document.createElement("div");
  item.className = "order-card order-card-empty";
  return item;
}

function syncSelectedTool() {
  document.querySelectorAll(".tool-button").forEach((button, index) => {
    button.classList.toggle("active", TOOLS[index].id === selectedTool.id);
  });
}

function syncSelectedRobotPalette() {
  document.querySelectorAll(".robot-button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.robotId) === selectedRobotPaletteId);
  });
}

function resizeCurrentMap() {
  if (!currentMap) return;
  const width = clampNumber(mapWidthInput.value, 1, 64, currentMap.width);
  const height = clampNumber(mapHeightInput.value, 1, 64, currentMap.height);
  currentMap.width = width;
  currentMap.height = height;
  currentMap.tiles = currentMap.tiles.filter((tile) => tile.x < width && tile.y < height);
  if (activeCell && (activeCell.x >= width || activeCell.y >= height)) {
    activeCell = null;
    selectedLayerId = null;
  }
  renderMap();
  scheduleSave();
}

function handleSegmentChange(event) {
  currentSegment = clampNumber(event.target.value, 1, 5, 1);
  updateTestStatus();
}

function wireCanvasDropTarget() {
  if (!editorGame?.canvas || editorGame.canvas.dataset.robotDropTarget === "true") return;
  editorGame.canvas.dataset.robotDropTarget = "true";
  editorGame.canvas.addEventListener("dragover", handleStageDragOver);
  editorGame.canvas.addEventListener("drop", handleStageDrop);
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
  const tiles = new Map((testBlankBoardInput.checked ? [] : currentMap.tiles).map((tile) => [`${tile.x},${tile.y}`, tile]));

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
  drawTestRobots(scene);
  renderStack();
  updateTestStatus();
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
  if (tile.crusher) addCrusher(scene, tile.crusher, px, py);
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
  if (conveyor.shape === "merge") {
    const merge = scene.add.image(px + tileSize / 2, py + tileSize / 2, "conveyor_tiles", conveyor.type === "fast" ? CONVEYOR_FRAMES.fastMerge : CONVEYOR_FRAMES.merge);
    merge.setDisplaySize(tileSize, tileSize);
    merge.rotation = rotationFromEast(conveyor.direction || "east");
    merge.setFlipY(Boolean(conveyor.flipped));
    return;
  }
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

function addCrusher(scene, crusher, px, py) {
  if (!scene.textures.exists("crusher_tiles")) {
    scene.add.text(px + tileSize / 2, py + tileSize / 2, "!", { fontFamily: "Arial", fontSize: "22px", color: "#f2c14e" }).setOrigin(0.5);
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

function drawTestRobots(scene) {
  for (const robot of testRobots) {
    if (robot.x < 0 || robot.y < 0 || robot.x >= currentMap.width || robot.y >= currentMap.height) continue;
    if (robotAnimation?.robotId === robot.id) {
      drawAnimatedTestRobot(scene, robot);
      continue;
    }
    drawStaticTestRobot(scene, robot);
  }
}

function drawStaticTestRobot(scene, robot) {
    const px = offsetX + robot.x * tileSize + tileSize / 2;
    const py = offsetY + robot.y * tileSize + tileSize / 2;
    const size = tileSize * 0.86;
    const selected = robot.id === selectedTestRobotId;
    if (scene.textures.exists("robot_tiles")) {
      const sprite = scene.add.image(px, py, "robot_tiles", robot.frame);
      sprite.setDisplaySize(size, size);
      sprite.rotation = rotationFromEast(robot.direction);
      sprite.setInteractive(new Phaser.Geom.Rectangle(-size / 2, -size / 2, size, size), Phaser.Geom.Rectangle.Contains);
      sprite.on("pointerdown", (_pointer, _localX, _localY, event) => {
        event?.stopPropagation();
        selectTestRobotOnBoard(robot);
      });
    } else {
      const fallback = scene.add.triangle(px, py, -size * 0.35, -size * 0.25, -size * 0.35, size * 0.25, size * 0.35, 0, 0xf2c14e);
      fallback.setInteractive(new Phaser.Geom.Rectangle(-size / 2, -size / 2, size, size), Phaser.Geom.Rectangle.Contains);
      fallback.on("pointerdown", (_pointer, _localX, _localY, event) => {
        event?.stopPropagation();
        selectTestRobotOnBoard(robot);
      });
    }
    if (selected) {
      const marker = scene.add.circle(px, py, size * 0.55).setStrokeStyle(3, 0xf2c14e);
      marker.setInteractive(new Phaser.Geom.Circle(0, 0, size * 0.6), Phaser.Geom.Circle.Contains);
      marker.on("pointerdown", (_pointer, _localX, _localY, event) => {
        event?.stopPropagation();
        selectTestRobotOnBoard(robot);
      });
    }
    const hitZone = scene.add.zone(px, py, tileSize, tileSize).setOrigin(0.5).setInteractive();
    hitZone.on("pointerdown", (_pointer, _localX, _localY, event) => {
      event?.stopPropagation();
      selectTestRobotOnBoard(robot);
    });
}

function drawAnimatedTestRobot(scene, robot) {
  const animation = robotAnimation;
  const size = tileSize * 0.86;
  const from = boardCellCenter(animation.from.x, animation.from.y);
  const to = boardCellCenter(animation.to.x, animation.to.y);
  const fromRotation = rotationFromEast(animation.from.direction);
  const toRotation = rotationForTween(fromRotation, rotationFromEast(animation.to.direction));
  const container = scene.add.container(from.x, from.y);
  let body = null;
  if (scene.textures.exists("robot_tiles")) {
    body = scene.add.image(0, 0, "robot_tiles", robot.frame);
    body.setDisplaySize(size, size);
  } else {
    body = scene.add.triangle(0, 0, -size * 0.35, -size * 0.25, -size * 0.35, size * 0.25, size * 0.35, 0, 0xf2c14e);
  }
  body.rotation = fromRotation;
  container.add(body);
  if (robot.id === selectedTestRobotId) {
    container.add(scene.add.circle(0, 0, size * 0.55).setStrokeStyle(3, 0xf2c14e));
  }
  scene.tweens.add({
    targets: container,
    x: to.x,
    y: to.y,
    duration: TEST_ANIMATION_DURATION,
    ease: TEST_ANIMATION_EASE
  });
  scene.tweens.add({
    targets: body,
    rotation: toRotation,
    duration: TEST_ANIMATION_DURATION,
    ease: TEST_ANIMATION_EASE,
    onComplete: () => {
      if (robotAnimation === animation) {
        robotAnimation = robotAnimationQueue.shift() || null;
        renderMap();
      }
    }
  });
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
    ensureNormalFloor(tile);
    tile.conveyor = { type: "normal", direction };
  } else if (selectedTool.id === "conveyor-turn") {
    ensureNormalFloor(tile);
    tile.conveyor = { type: "normal", shape: "turn", from: direction, turn: "right" };
  } else if (selectedTool.id === "conveyor-merge") {
    ensureNormalFloor(tile);
    tile.conveyor = mergeConveyorForDirection(direction, "normal");
  } else if (selectedTool.id === "fast-conveyor") {
    ensureNormalFloor(tile);
    tile.conveyor = { type: "fast", direction };
  } else if (selectedTool.id === "fast-conveyor-turn") {
    ensureNormalFloor(tile);
    tile.conveyor = { type: "fast", shape: "turn", from: direction, turn: "left" };
  } else if (selectedTool.id === "fast-conveyor-merge") {
    ensureNormalFloor(tile);
    tile.conveyor = mergeConveyorForDirection(direction, "fast");
  } else if (selectedTool.id === "rotator-cw") {
    ensureNormalFloor(tile);
    tile.rotator = { direction: "cw" };
  } else if (selectedTool.id === "rotator-ccw") {
    ensureNormalFloor(tile);
    tile.rotator = { direction: "ccw" };
  } else if (selectedTool.id === "wall") {
    ensureNormalFloor(tile);
    tile.walls = toggleValue(tile.walls || [], direction);
    if (tile.walls.length === 0) delete tile.walls;
  } else if (selectedTool.id === "repair1") {
    ensureNormalFloor(tile);
    tile.repair = 1;
    delete tile.spawn;
    delete tile.checkpoint;
  } else if (selectedTool.id === "repair2") {
    ensureNormalFloor(tile);
    tile.repair = 2;
    delete tile.spawn;
    delete tile.checkpoint;
  } else if (selectedTool.id === "spawn") {
    ensureNormalFloor(tile);
    delete tile.repair;
    delete tile.checkpoint;
    tile.spawn = nextNumber("spawn", 8);
    tile.direction = direction;
  } else if (selectedTool.id === "checkpoint") {
    ensureNormalFloor(tile);
    delete tile.repair;
    delete tile.spawn;
    delete tile.direction;
    tile.checkpoint = nextNumber("checkpoint", 8);
  } else if (selectedTool.id === "laser-emitter") {
    ensureNormalFloor(tile);
    tile.laser = { emitter: "single", direction, power: 1 };
  } else if (selectedTool.id === "laser-beam") {
    ensureNormalFloor(tile);
    tile.laser = { beam: direction === "east" || direction === "west" ? "east-west" : "north-south", power: 1 };
  } else if (selectedTool.id === "pusher") {
    ensureNormalFloor(tile);
    tile.pusher = { direction, activeRegisters: [2, 4] };
  } else if (selectedTool.id === "crusher") {
    ensureNormalFloor(tile);
    tile.crusher = { variant: "plain", activeRegisters: [2, 4] };
  } else if (selectedTool.id === "crusher-conveyor") {
    ensureNormalFloor(tile);
    tile.crusher = { variant: "conveyor", direction, activeRegisters: [2, 4] };
  }

  selectedLayerId = defaultLayerForTool(selectedTool.id, direction);
  pruneEmptyTiles();
  renderMap();
  scheduleSave();
}

function setActiveCell(x, y) {
  if (!currentMap || x < 0 || y < 0 || x >= currentMap.width || y >= currentMap.height) return;
  normalizeSelectedCrusherBeforeLeaving();
  activeCell = { x, y };
  selectedLayerId = firstLayerId(activeTile());
  renderMap();
}

function isActiveCell(x, y) {
  return activeCell?.x === x && activeCell?.y === y;
}

function handleKeyDown(event) {
  if (isTextInput(event.target)) return;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === "c") {
      event.preventDefault();
      copySelectedLayer();
      return;
    }
    if (key === "x") {
      event.preventDefault();
      cutSelectedLayer();
      return;
    }
    if (key === "v") {
      event.preventDefault();
      pasteClipboardLayer();
      return;
    }
  }
  if (!activeCell) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelectedLayer();
    renderMap();
    scheduleSave();
    return;
  }
  if (/^[1-5]$/.test(event.key)) {
    event.preventDefault();
    toggleCrusherRegister(Number(event.key));
    return;
  }
  if (key === "r") {
    event.preventDefault();
    if (rotateSelectedTestRobot()) return;
    rotateActiveTile();
    return;
  }
  if (key === "f") {
    event.preventDefault();
    flipActiveTile();
  }
}

function rotateActiveTile() {
  const tile = activeTile();
  if (!tile) return;
  const layer = selectedLayerId || firstLayerId(tile);
  if (layer === "conveyor" && tile.conveyor?.shape === "merge") {
    tile.conveyor.direction = nextDirection(tile.conveyor.direction || "east");
    tile.conveyor.inputs = mergeInputsFor(tile.conveyor.direction, Boolean(tile.conveyor.flipped));
  } else if (layer === "conveyor" && tile.conveyor?.shape === "turn") tile.conveyor.from = nextDirection(tile.conveyor.from || "east");
  else if (layer === "conveyor" && tile.conveyor) tile.conveyor.direction = nextDirection(tile.conveyor.direction || "west");
  else if (layer?.startsWith("wall:")) rotateWall(tile, layer.split(":")[1]);
  else if (layer === "laser" && tile.laser?.direction) tile.laser.direction = nextDirection(tile.laser.direction);
  else if (layer === "laser" && tile.laser?.beam) tile.laser.beam = tile.laser.beam === "north-south" ? "east-west" : "north-south";
  else if (layer === "pusher" && tile.pusher?.direction) tile.pusher.direction = nextDirection(tile.pusher.direction);
  else if (layer === "crusher" && tile.crusher?.variant === "conveyor") tile.crusher.direction = nextDirection(tile.crusher.direction || "east");
  else if (layer === "zone" && tile.direction) tile.direction = nextDirection(tile.direction);
  else return;
  renderMap();
  scheduleSave();
}

function flipActiveTile() {
  const tile = activeTile();
  if (!tile) return;
  let changed = false;
  const layer = selectedLayerId || firstLayerId(tile);
  if (layer === "conveyor" && tile.conveyor?.shape === "merge") {
    tile.conveyor.flipped = !tile.conveyor.flipped;
    tile.conveyor.inputs = mergeInputsFor(tile.conveyor.direction || "east", Boolean(tile.conveyor.flipped));
    changed = true;
  }
  if (layer === "conveyor" && tile.conveyor?.shape === "turn") {
    tile.conveyor.turn = tile.conveyor.turn === "left" ? "right" : "left";
    changed = true;
  }
  if (layer === "rotator" && tile.rotator) {
    tile.rotator.direction = tile.rotator.direction === "ccw" ? "cw" : "ccw";
    changed = true;
  }
  if (layer?.startsWith("wall:")) {
    flipWall(tile, layer.split(":")[1]);
    changed = true;
  }
  if (layer === "laser" && tile.laser?.direction) {
    tile.laser.direction = oppositeDirection(tile.laser.direction);
    changed = true;
  }
  if (layer === "pusher" && tile.pusher?.direction) {
    tile.pusher.direction = oppositeDirection(tile.pusher.direction);
    changed = true;
  }
  if (layer === "crusher" && tile.crusher?.variant === "conveyor") {
    tile.crusher.direction = oppositeDirection(tile.crusher.direction || "east");
    changed = true;
  }
  if (layer === "zone" && tile.direction) {
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

function tileAt(x, y) {
  return currentMap?.tiles.find((tile) => tile.x === x && tile.y === y) || null;
}

function renderStack() {
  if (!activeCell) {
    activeCellLabel.textContent = "Aucune case";
    stackList.replaceChildren();
    updateClipboardButtons();
    return;
  }
  const tile = activeTile();
  const layers = tileLayers(tile);
  activeCellLabel.textContent = `x:${activeCell.x} y:${activeCell.y}`;
  if (!layers.length) {
    stackList.replaceChildren(emptyStackButton());
    selectedLayerId = null;
    updateClipboardButtons();
    return;
  }
  if (!layers.some((layer) => layer.id === selectedLayerId)) selectedLayerId = layers[0].id;
  stackList.replaceChildren(...layers.map((layer) => {
    const button = document.createElement("button");
    button.className = `stack-item ${layer.id === selectedLayerId ? "active" : ""}`;
    button.title = layer.title;
    const swatch = document.createElement("span");
    swatch.className = "tool-swatch";
    swatch.textContent = layer.icon || "";
    applySpriteIcon(swatch, layer.sprite);
    const label = document.createElement("span");
    label.innerHTML = `<span class="tool-title">${escapeHtml(layer.title)}</span><span class="tool-subtitle">${escapeHtml(layer.subtitle)}</span>`;
    button.append(swatch, label);
    button.addEventListener("click", () => {
      normalizeSelectedCrusherBeforeLeaving();
      selectedLayerId = layer.id;
      renderStack();
    });
    return button;
  }));
  updateClipboardButtons();
}

function emptyStackButton() {
  const item = document.createElement("div");
  item.className = "tool-subtitle";
  item.textContent = "Sol standard";
  return item;
}

function tileLayers(tile) {
  if (!tile) return [];
  const layers = [];
  if (tile.floor === "pit") {
    layers.push({ id: "floor", title: "Trou", subtitle: "Sol", icon: "P", sprite: { key: "pit_tiles", frame: PIT_FRAMES.single } });
  }
  if (tile.conveyor) {
    const fast = tile.conveyor.type === "fast";
    const turn = tile.conveyor.shape === "turn";
    const merge = tile.conveyor.shape === "merge";
    layers.push({
      id: "conveyor",
      title: merge ? `Convoyeur ${fast ? "rapide " : ""}2 entrees` : fast ? "Convoyeur rapide" : "Convoyeur",
      subtitle: merge ? `${(tile.conveyor.inputs || []).join("+")} -> ${tile.conveyor.direction || "east"}${tile.conveyor.flipped ? " flip" : ""}` : turn ? `Virage ${tile.conveyor.from || "east"} ${tile.conveyor.turn || "right"}` : `Direction ${tile.conveyor.direction || "west"}`,
      icon: merge ? (fast ? "Q" : "M") : fast ? "F" : "C",
      sprite: {
        key: "conveyor_tiles",
        frame: merge ? (fast ? CONVEYOR_FRAMES.fastMerge : CONVEYOR_FRAMES.merge) : turn ? (fast ? CONVEYOR_FRAMES.fastTurnRight : CONVEYOR_FRAMES.turnRight) : (fast ? CONVEYOR_FRAMES.fastStraight : CONVEYOR_FRAMES.straight),
        rotation: merge ? rotationFromEastDegrees(tile.conveyor.direction || "east") : turn ? 0 : 180,
        flipX: turn && tile.conveyor.turn === "left",
        flipY: merge ? Boolean(tile.conveyor.flipped) : turn && fast
      }
    });
  }
  if (tile.rotator) {
    layers.push({
      id: "rotator",
      title: "Rotator",
      subtitle: tile.rotator.direction === "ccw" ? "Antihoraire" : "Horaire",
      icon: "R",
      sprite: { key: "gear_tiles", frame: tile.rotator.direction === "ccw" ? 5 : 4 }
    });
  }
  if (tile.repair || tile.spawn || tile.checkpoint) {
    const frame = tile.repair === 1 ? ZONE_FRAMES.repair1
      : tile.repair === 2 ? ZONE_FRAMES.repair2
        : tile.spawn ? ZONE_FRAMES.spawn
          : ZONE_FRAMES.checkpoints[tile.checkpoint - 1] ?? ZONE_FRAMES.checkpoints[0];
    layers.push({
      id: "zone",
      title: tile.repair ? `Repair ${tile.repair}` : tile.spawn ? `Depart ${tile.spawn}` : `Checkpoint ${tile.checkpoint}`,
      subtitle: tile.direction ? `Direction ${tile.direction}` : "Zone",
      icon: String(tile.repair || tile.spawn || tile.checkpoint || "Z"),
      sprite: { key: "zone_tiles", frame }
    });
  }
  for (const wall of tile.walls || []) {
    layers.push({
      id: `wall:${wall}`,
      title: "Mur",
      subtitle: `Cote ${wall}`,
      icon: "|",
      sprite: { key: "wall_tiles", frame: 7, rotation: wallIconRotation(wall) }
    });
  }
  if (tile.laser) {
    const power = Math.max(1, Math.min(3, tile.laser.power || 1));
    layers.push({
      id: "laser",
      title: tile.laser.emitter ? "Emetteur laser" : "Rayon laser",
      subtitle: tile.laser.direction || tile.laser.beam || "Laser",
      icon: "L",
      sprite: {
        key: "laser_tiles",
        frame: tile.laser.emitter ? LASER_FRAMES.emittersNorth[power - 1] : LASER_FRAMES.beamsNorthSouth[power - 1],
        rotation: tile.laser.beam === "east-west" ? 90 : 0
      }
    });
  }
  if (tile.pusher) {
    layers.push({ id: "pusher", title: "Pousseur", subtitle: `Direction ${tile.pusher.direction || "north"}`, icon: ">", sprite: { key: "pusher_tiles", frame: 0 } });
  }
  if (tile.crusher) {
    const onConveyor = tile.crusher.variant === "conveyor";
    const activeRegisters = normalizeCrusherRegisters(tile.crusher.activeRegisters);
    layers.push({
      id: "crusher",
      title: onConveyor ? "Ecraseur convoyeur" : "Ecraseur",
      subtitle: `${onConveyor ? `Direction ${tile.crusher.direction || "east"} - ` : ""}Segments ${activeRegisters.join("-") || "aucun"}`,
      icon: onConveyor ? "K" : "!",
      sprite: {
        key: "crusher_tiles",
        frame: onConveyor ? CRUSHER_FRAMES.conveyor : CRUSHER_FRAMES.plain,
        rotation: onConveyor ? rotationFromEastDegrees(tile.crusher.direction || "east") : 0
      }
    });
  }
  return layers;
}

function firstLayerId(tile) {
  return tileLayers(tile)[0]?.id || null;
}

function defaultLayerForTool(toolId, direction) {
  if (toolId === "erase") return null;
  if (toolId === "pit") return "floor";
  if (toolId.includes("conveyor")) return "conveyor";
  if (toolId.includes("rotator")) return "rotator";
  if (toolId === "wall") return `wall:${direction}`;
  if (["repair1", "repair2", "spawn", "checkpoint"].includes(toolId)) return "zone";
  if (toolId.startsWith("laser")) return "laser";
  if (toolId === "pusher") return "pusher";
  if (toolId === "crusher" || toolId === "crusher-conveyor") return "crusher";
  return null;
}

function deleteSelectedLayer() {
  const tile = activeTile();
  if (!tile) return;
  const layer = selectedLayerId || firstLayerId(tile);
  if (!layer || layer === "floor") {
    removeTile(activeCell.x, activeCell.y);
  } else if (layer === "conveyor") {
    delete tile.conveyor;
  } else if (layer === "rotator") {
    delete tile.rotator;
  } else if (layer === "zone") {
    delete tile.repair;
    delete tile.spawn;
    delete tile.direction;
    delete tile.checkpoint;
  } else if (layer.startsWith("wall:")) {
    const wall = layer.split(":")[1];
    tile.walls = (tile.walls || []).filter((item) => item !== wall);
    if (!tile.walls.length) delete tile.walls;
  } else if (layer === "laser") {
    delete tile.laser;
  } else if (layer === "pusher") {
    delete tile.pusher;
  } else if (layer === "crusher") {
    delete tile.crusher;
  }
  pruneEmptyTiles();
  selectedLayerId = firstLayerId(activeTile());
}

function toggleCrusherRegister(register) {
  const tile = activeTile();
  if (!tile?.crusher || (selectedLayerId || firstLayerId(tile)) !== "crusher") return;
  const current = normalizeCrusherRegisters(tile.crusher.activeRegisters);
  if (current.includes(register)) {
    tile.crusher.activeRegisters = current.filter((item) => item !== register);
  } else {
    tile.crusher.activeRegisters = [...current, register].sort((a, b) => a - b).slice(-2);
  }
  renderMap();
  scheduleSave();
}

function placeTestRobot(id, x, y) {
  robotAnimation = null;
  robotAnimationQueue = [];
  selectedTestRobotId = id;
  selectedRobotPaletteId = id;
  const existing = testRobots.find((item) => item.id === id);
  if (existing) {
    existing.x = x;
    existing.y = y;
  } else {
    testRobots.push({ id, frame: id - 1, x, y, direction: "east" });
  }
  renderTestRobotOptions();
  renderMap();
}

function selectTestRobotAt(x, y) {
  const robot = testRobots.find((item) => item.x === x && item.y === y);
  if (!robot) return false;
  selectTestRobotOnBoard(robot);
  return true;
}

function selectTestRobotOnBoard(robot) {
  if (robotAnimation) return;
  selectedTestRobotId = robot.id;
  selectedRobotPaletteId = robot.id;
  activeCell = { x: robot.x, y: robot.y };
  selectedLayerId = firstLayerId(activeTile());
  renderTestRobotOptions();
  renderMap();
}

function selectedTestRobot() {
  return testRobots.find((item) => item.id === selectedTestRobotId) || null;
}

function activeTestRobot() {
  const selected = selectedTestRobot();
  if (selected) return selected;
  if (testRobots.length !== 1) return null;
  selectedTestRobotId = testRobots[0].id;
  selectedRobotPaletteId = testRobots[0].id;
  return testRobots[0];
}

function applyOrderCard(card) {
  if (robotAnimation) return false;
  const robot = activeTestRobot();
  if (!robot) {
    lastTestAction = "Pose un robot avant d'appliquer une carte.";
    return false;
  }
  const from = { x: robot.x, y: robot.y, direction: robot.direction };
  if (card.action === "rotate") {
    robot.direction = rotateDirection(robot.direction, card.turn);
    lastTestAction = `${card.type}: rotation vers ${robot.direction}`;
  } else if (card.action === "move") {
    const moved = moveTestRobot(robot, card.distance);
    lastTestAction = `${card.type}: ${moved} case${moved > 1 ? "s" : ""}`;
  }
  const afterOrder = { x: robot.x, y: robot.y, direction: robot.direction };
  const animations = [robotAnimationStep(robot.id, from, afterOrder)];
  const conveyor = applySlowConveyor(robot);
  if (conveyor.applied) {
    animations.push(robotAnimationStep(robot.id, afterOrder, { x: robot.x, y: robot.y, direction: robot.direction }));
    lastTestAction += ` + convoyeur lent ${conveyor.label}`;
  }
  queueRobotAnimations(animations);
  activeCell = { x: robot.x, y: robot.y };
  selectedLayerId = firstLayerId(activeTile());
  renderMap();
  return true;
}

function moveTestRobot(robot, distance) {
  const direction = distance >= 0 ? robot.direction : oppositeDirection(robot.direction);
  const steps = Math.abs(distance);
  let moved = 0;
  for (let index = 0; index < steps; index += 1) {
    const next = nextCell(robot.x, robot.y, direction);
    if (!isInsideMap(next.x, next.y)) break;
    robot.x = next.x;
    robot.y = next.y;
    moved += 1;
  }
  return moved;
}

function applySlowConveyor(robot) {
  const tile = tileAt(robot.x, robot.y);
  const conveyor = tile?.conveyor;
  if (!conveyor || conveyor.type === "fast") return { applied: false, label: "" };
  const output = conveyorOutputDirection(conveyor);
  const next = nextCell(robot.x, robot.y, output);
  if (!isInsideMap(next.x, next.y)) return { applied: false, label: "bloque" };
  robot.x = next.x;
  robot.y = next.y;
  if (conveyor.shape === "turn") {
    robot.direction = rotateDirection(robot.direction, conveyorTurnDelta(conveyor));
  }
  return { applied: true, label: conveyor.shape === "turn" ? `vers ${output} avec rotation` : `vers ${output}` };
}

function robotAnimationStep(robotId, from, to) {
  if (!stateChanged(from, to)) return null;
  return { robotId, from, to };
}

function queueRobotAnimations(animations) {
  const steps = animations.filter(Boolean);
  robotAnimation = steps.shift() || null;
  robotAnimationQueue = steps;
}

function rotateSelectedTestRobot() {
  if (robotAnimation) return false;
  const robot = selectedTestRobot();
  if (!robot) return false;
  const from = { x: robot.x, y: robot.y, direction: robot.direction };
  robot.direction = nextDirection(robot.direction);
  queueRobotAnimations([robotAnimationStep(robot.id, from, { x: robot.x, y: robot.y, direction: robot.direction })]);
  lastTestAction = `Rotation manuelle vers ${robot.direction}`;
  renderMap();
  return true;
}

function updateTestStatus() {
  const robot = selectedTestRobot();
  if (!robot) {
    setTestMessage(`Segment ${currentSegment}. Glisse un robot sur la grille.${lastTestAction ? ` ${lastTestAction}` : ""}`);
    return;
  }
  setTestMessage(`Segment ${currentSegment}. Robot ${robot.id}: x:${robot.x} y:${robot.y} ${robot.direction}.${lastTestAction ? ` ${lastTestAction}` : " R pour tourner."}`);
}

function setTestMessage(message) {
  testStatus.textContent = message;
}

function normalizeSelectedCrusherBeforeLeaving() {
  const tile = activeTile();
  if (!tile?.crusher || selectedLayerId !== "crusher") return;
  normalizeCrusher(tile.crusher);
}

function normalizeMapCrushers() {
  for (const tile of currentMap?.tiles || []) {
    if (tile.crusher) normalizeCrusher(tile.crusher);
  }
}

function normalizeCrusher(crusher) {
  const registers = normalizeCrusherRegisters(crusher.activeRegisters);
  crusher.activeRegisters = registers.length ? registers : [1];
}

function copySelectedLayer() {
  const snapshot = selectedLayerSnapshot();
  if (!snapshot) return false;
  clipboardLayer = snapshot;
  updateClipboardButtons();
  setSaveState("Copie");
  return true;
}

function cutSelectedLayer() {
  if (!copySelectedLayer()) return;
  deleteSelectedLayer();
  renderMap();
  scheduleSave();
  setSaveState("Coupe");
}

function pasteClipboardLayer() {
  if (!clipboardLayer || !activeCell || !currentMap) return;
  pasteLayerSnapshot(activeCell.x, activeCell.y, clipboardLayer);
  pruneEmptyTiles();
  renderMap();
  scheduleSave();
  setSaveState("Colle");
}

function selectedLayerSnapshot() {
  const tile = activeTile();
  const layer = selectedLayerId || firstLayerId(tile);
  if (!tile || !layer) return null;
  if (layer === "floor" && tile.floor === "pit") return cloneLayer({ kind: "floor", floor: "pit" });
  if (layer === "conveyor" && tile.conveyor) return cloneLayer({ kind: "conveyor", conveyor: tile.conveyor });
  if (layer === "rotator" && tile.rotator) return cloneLayer({ kind: "rotator", rotator: tile.rotator });
  if (layer === "zone" && (tile.repair || tile.spawn || tile.checkpoint)) {
    return cloneLayer({
      kind: "zone",
      repair: tile.repair,
      spawn: tile.spawn,
      direction: tile.direction,
      checkpoint: tile.checkpoint
    });
  }
  if (layer.startsWith("wall:")) return cloneLayer({ kind: "wall", wall: layer.split(":")[1] });
  if (layer === "laser" && tile.laser) return cloneLayer({ kind: "laser", laser: tile.laser });
  if (layer === "pusher" && tile.pusher) return cloneLayer({ kind: "pusher", pusher: tile.pusher });
  if (layer === "crusher" && tile.crusher) return cloneLayer({ kind: "crusher", crusher: tile.crusher });
  return null;
}

function pasteLayerSnapshot(x, y, snapshot) {
  if (snapshot.kind === "floor") {
    if (snapshot.floor === "pit") replaceTile(x, y, { x, y, floor: "pit" });
    selectedLayerId = "floor";
    return;
  }

  const tile = getMutableTile(x, y);
  ensureNormalFloor(tile);
  if (snapshot.kind === "conveyor") {
    tile.conveyor = cloneValue(snapshot.conveyor);
    selectedLayerId = "conveyor";
  } else if (snapshot.kind === "rotator") {
    tile.rotator = cloneValue(snapshot.rotator);
    selectedLayerId = "rotator";
  } else if (snapshot.kind === "zone") {
    delete tile.repair;
    delete tile.spawn;
    delete tile.direction;
    delete tile.checkpoint;
    if (snapshot.repair) tile.repair = snapshot.repair;
    if (snapshot.spawn) tile.spawn = snapshot.spawn;
    if (snapshot.direction) tile.direction = snapshot.direction;
    if (snapshot.checkpoint) tile.checkpoint = snapshot.checkpoint;
    selectedLayerId = "zone";
  } else if (snapshot.kind === "wall") {
    tile.walls = tile.walls || [];
    if (!tile.walls.includes(snapshot.wall)) tile.walls.push(snapshot.wall);
    selectedLayerId = `wall:${snapshot.wall}`;
  } else if (snapshot.kind === "laser") {
    tile.laser = cloneValue(snapshot.laser);
    selectedLayerId = "laser";
  } else if (snapshot.kind === "pusher") {
    tile.pusher = cloneValue(snapshot.pusher);
    selectedLayerId = "pusher";
  } else if (snapshot.kind === "crusher") {
    tile.crusher = cloneValue(snapshot.crusher);
    selectedLayerId = "crusher";
  }
}

function updateClipboardButtons() {
  const canCopy = Boolean(selectedLayerSnapshot());
  copyLayerButton.disabled = !canCopy;
  cutLayerButton.disabled = !canCopy;
  pasteLayerButton.disabled = !clipboardLayer || !activeCell;
}

function cloneLayer(layer) {
  return cloneValue(layer);
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function getMutableTile(x, y) {
  let tile = currentMap.tiles.find((item) => item.x === x && item.y === y);
  if (!tile) {
    tile = { x, y, floor: "normal" };
    currentMap.tiles.push(tile);
  }
  return tile;
}

function ensureNormalFloor(tile) {
  tile.floor = "normal";
}

function setBaseTile(tile) {
  ensureNormalFloor(tile);
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
  normalizeMapCrushers();
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

function draggedRobotId(event) {
  const custom = Number(event.dataTransfer?.getData("application/x-roborally-robot"));
  if (custom >= 1 && custom <= 8) return custom;
  const text = event.dataTransfer?.getData("text/plain") || "";
  const match = /^robot:([1-8])$/.exec(text);
  return match ? Number(match[1]) : 0;
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

function crusherSegmentMarkers(activeRegisters = []) {
  return normalizeCrusherRegisters(activeRegisters).map((register, index) => ({
    register,
    frame: index === 0 ? CRUSHER_FRAMES.topSegmentStart + register - 1 : CRUSHER_FRAMES.bottomSegmentStart + register - 1
  }));
}

function normalizeCrusherRegisters(activeRegisters = []) {
  return [...new Set(activeRegisters.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 5))]
    .sort((a, b) => a - b)
    .slice(0, 2);
}

function rotateWall(tile, wall) {
  if (!tile.walls?.includes(wall)) return;
  const next = nextDirection(wall);
  tile.walls = tile.walls.filter((item) => item !== wall);
  if (!tile.walls.includes(next)) tile.walls.push(next);
  selectedLayerId = `wall:${next}`;
}

function flipWall(tile, wall) {
  if (!tile.walls?.includes(wall)) return;
  const next = oppositeDirection(wall);
  tile.walls = tile.walls.filter((item) => item !== wall);
  if (!tile.walls.includes(next)) tile.walls.push(next);
  selectedLayerId = `wall:${next}`;
}

function rotationFromWest(direction) {
  return { west: 0, north: Math.PI / 2, east: Math.PI, south: -Math.PI / 2 }[direction] || 0;
}

function rotationFromEast(direction) {
  return { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 }[direction] || 0;
}

function boardCellCenter(x, y) {
  return {
    x: offsetX + x * tileSize + tileSize / 2,
    y: offsetY + y * tileSize + tileSize / 2
  };
}

function rotationForTween(from, to) {
  let target = to;
  while (target - from > Math.PI) target -= Math.PI * 2;
  while (target - from < -Math.PI) target += Math.PI * 2;
  return target;
}

function rotationFromEastDegrees(direction) {
  return { east: 0, south: 90, west: 180, north: -90 }[direction] || 0;
}

function directionRotationFromNorth(direction) {
  return { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 }[direction] || 0;
}

function wallIconRotation(wall) {
  return { west: 0, north: 90, east: 180, south: -90 }[wall] || 0;
}

function nextDirection(direction) {
  const index = DIRECTIONS.indexOf(direction);
  return DIRECTIONS[(Math.max(0, index) + 1) % DIRECTIONS.length];
}

function rotateDirection(direction, turn) {
  const index = Math.max(0, DIRECTIONS.indexOf(direction));
  return DIRECTIONS[(index + turn + DIRECTIONS.length) % DIRECTIONS.length];
}

function nextCell(x, y, direction) {
  return {
    north: { x, y: y - 1 },
    east: { x: x + 1, y },
    south: { x, y: y + 1 },
    west: { x: x - 1, y }
  }[direction] || { x, y };
}

function isInsideMap(x, y) {
  return Boolean(currentMap && x >= 0 && y >= 0 && x < currentMap.width && y < currentMap.height);
}

function stateChanged(from, to) {
  return from.x !== to.x || from.y !== to.y || from.direction !== to.direction;
}

function conveyorOutputDirection(conveyor) {
  if (conveyor.shape === "turn") return rotateDirection(conveyor.from || "east", conveyorTurnDelta(conveyor));
  return conveyor.direction || "east";
}

function conveyorTurnDelta(conveyor) {
  return conveyor.turn === "left" ? 1 : -1;
}

function rotateDirections(directions) {
  return directions.map(nextDirection);
}

function mergeConveyorForDirection(direction, type = "normal", flipped = false) {
  return {
    type,
    shape: "merge",
    inputs: mergeInputsFor(direction, flipped),
    direction,
    flipped
  };
}

function mergeInputsFor(direction, flipped = false) {
  const steps = (DIRECTIONS.indexOf(direction) - DIRECTIONS.indexOf("east") + DIRECTIONS.length) % DIRECTIONS.length;
  let inputs = flipped ? ["west", "north"] : ["west", "south"];
  for (let index = 0; index < steps; index += 1) inputs = rotateDirections(inputs);
  return inputs;
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

async function loadSpriteInfo() {
  await Promise.all(Object.entries(IMAGE_SOURCES).map(([key, file]) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      imageInfo.set(key, {
        url: `${basePath}/shared/assets/images/${file}`,
        width: image.naturalWidth,
        height: image.naturalHeight,
        frameSize: 66
      });
      resolve();
    };
    image.onerror = resolve;
    image.src = `${basePath}/shared/assets/images/${file}`;
  })));
}

function applySpriteIcon(element, sprite) {
  if (!sprite) return;
  const info = imageInfo.get(sprite.key);
  if (!info) return;
  const columns = Math.max(1, Math.floor(info.width / info.frameSize));
  const col = sprite.frame % columns;
  const row = Math.floor(sprite.frame / columns);
  const scale = ICON_SIZE / info.frameSize;
  element.textContent = "";
  element.style.backgroundImage = `url("${info.url}")`;
  element.style.backgroundSize = `${info.width * scale}px ${info.height * scale}px`;
  element.style.backgroundPosition = `-${col * ICON_SIZE}px -${row * ICON_SIZE}px`;
  element.style.transform = [
    sprite.rotation ? `rotate(${sprite.rotation}deg)` : "",
    sprite.flipX ? "scaleX(-1)" : "",
    sprite.flipY ? "scaleY(-1)" : ""
  ].filter(Boolean).join(" ");
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
