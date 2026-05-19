const joinPanel = document.querySelector("#join-panel");
const programPanel = document.querySelector("#program-panel");
const joinButton = document.querySelector("#join-button");
const basePath = detectBasePath("player");
const socket = window.io?.({ path: `${basePath}/socket.io` });

const CARD_SOURCE = { width: 310, height: 460 };
const FLOOR_FRAMES = [0, 6, 13, 14, 15, 16];
const PIT_FRAMES = { single: 11, vertical: [3, 10], horizontal: [17, 18] };
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

let playerId = window.localStorage.getItem("roborally.playerId");
let program = Array(5).fill(null);
let handOrder = [];
let latestState = null;
let playerScene = null;
let dragState = null;
let boardView = { x: 0, y: 0, scale: 1, baseScale: 1, isPanning: false, panX: 0, panY: 0, pointers: new Map(), pinchDistance: 0 };
let boardMetrics = null;
let boardContainerRef = null;
let layout = null;
let playerGame = null;
let resizeTimer = null;
let debugViewport = { width: 0, height: 0, dpr: 1, renderResolution: 1, source: "init" };

joinButton.addEventListener("click", joinGame);
window.addEventListener("resize", scheduleViewportResize);
window.addEventListener("orientationchange", scheduleViewportResize);
window.visualViewport?.addEventListener("resize", scheduleViewportResize);
window.visualViewport?.addEventListener("scroll", scheduleViewportResize);
window.addEventListener("pointerdown", requestPlayerFullscreen, { once: true });
window.addEventListener("touchstart", requestPlayerFullscreen, { once: true, passive: true });

document.addEventListener("click", () => {
  requestPlayerFullscreen();
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

initPlayerInterface();

async function joinGame() {
  requestPlayerFullscreen();
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
  if (!latestState || !playerScene) return;

  if (player) syncHandOrder(player.hand);
  drawInterface(playerScene, latestState, player);
}

function drawInterface(scene, state, player) {
  scene.children.removeAll();
  layout = getLayout(scene);
  drawBoard(scene, state);
  drawPanel(scene, state, player);
}

function getLayout(scene) {
  const width = scene.scale.width;
  const height = scene.scale.height;
  const boardWidth = Math.floor(width * 2 / 3);
  return {
    width,
    height,
    board: { x: 0, y: 0, width: boardWidth, height },
    panel: { x: boardWidth, y: 0, width: width - boardWidth, height }
  };
}

function drawBoard(scene, state) {
  const boardRect = layout.board;
  const map = state.map;
  const specialTiles = new Map(map.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const robotsByCell = new Map(state.robots.map((robot) => [`${robot.x},${robot.y}`, robot]));
  const tileSize = Math.floor(Math.min(boardRect.width, boardRect.height) / Math.max(map.width, map.height));
  const boardWidth = map.width * tileSize;
  const boardHeight = map.height * tileSize;
  const viewportPadding = 24;
  boardMetrics = { tileSize, boardWidth, boardHeight };
  if (!boardView.initialized) {
    boardView.baseScale = Math.min((boardRect.width - viewportPadding * 2) / boardWidth, (boardRect.height - viewportPadding * 2) / boardHeight, 1);
    boardView.scale = boardView.baseScale;
    boardView.x = boardRect.x + (boardRect.width - boardWidth * boardView.scale) / 2;
    boardView.y = boardRect.y + (boardRect.height - boardHeight * boardView.scale) / 2;
    boardView.initialized = true;
  }

  scene.add.rectangle(boardRect.x, boardRect.y, boardRect.width, boardRect.height, 0x171c20).setOrigin(0);
  const maskShape = scene.add.rectangle(boardRect.x, boardRect.y, boardRect.width, boardRect.height, 0xffffff)
    .setOrigin(0)
    .setVisible(false);
  const boardContainer = scene.add.container(boardView.x, boardView.y);
  boardContainerRef = boardContainer;
  boardContainer.setScale(boardView.scale);
  boardContainer.setMask(maskShape.createGeometryMask());

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = specialTiles.get(`${x},${y}`) || {};
      const robot = robotsByCell.get(`${x},${y}`);
      const px = x * tileSize;
      const py = y * tileSize;
      if (tile.floor === "pit") {
        boardContainer.add(addPitTile(scene, tile, px, py, tileSize));
      } else {
        boardContainer.add(addFloorTile(scene, tile, x, y, px, py, tileSize));
        boardContainer.add(addZoneTile(scene, tile, px, py, tileSize));
        if (tile.conveyor) boardContainer.add(addConveyorTile(scene, tile.conveyor, px, py, tileSize));
        if (tile.rotator) boardContainer.add(addRotatorTile(scene, tile.rotator, px, py, tileSize));
        if (tile.laser) boardContainer.add(addLaserTile(scene, tile.laser, px, py, tileSize));
        if (tile.crusher) boardContainer.add(addCrusherTile(scene, tile.crusher, px, py, tileSize));
        if (tile.walls) boardContainer.add(addWallTiles(scene, tile.walls, px, py, tileSize));
      }
      boardContainer.add(scene.add.rectangle(px, py, tileSize, tileSize).setOrigin(0).setStrokeStyle(1, 0x3a424a));
      if (robot) boardContainer.add(addRobot(scene, robot, px, py, tileSize));
    }
  }
  clampBoardView();
  boardContainer.setPosition(boardView.x, boardView.y);
  boardContainer.setScale(boardView.scale);
}

function drawPanel(scene, state, player) {
  const panelRect = layout.panel;
  scene.add.rectangle(panelRect.x, panelRect.y, panelRect.width, panelRect.height, 0x101316).setOrigin(0);
  scene.add.line(panelRect.x, 0, 0, 0, 0, layout.height, 0x303941).setOrigin(0);

  if (!player) {
    scene.add.text(panelRect.x + panelRect.width / 2, layout.height * 0.47, "Rejoins la partie", {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#dce5ec"
    }).setOrigin(0.5);
    return;
  }

  const robot = state.robots.find((item) => item.playerId === player.id);
  const cardWidth = Math.floor(Math.min((panelRect.width - 56) / 5, (panelRect.height - 168) / 4.1));
  const cardHeight = Math.floor(cardWidth * CARD_SOURCE.height / CARD_SOURCE.width);
  const gap = Math.floor(cardWidth * 0.12);
  const startX = panelRect.x + Math.floor((panelRect.width - cardWidth * 5 - gap * 4) / 2);
  const handY = Math.max(18, layout.height * 0.08);
  const registerY = layout.height - cardHeight - 76;
  const visibleHand = getOrderedHand(player).filter((card) => !program.includes(card.id));

  visibleHand.forEach((card, index) => {
    const x = startX + (index % 5) * (cardWidth + gap);
    const y = handY + Math.floor(index / 5) * (cardHeight + gap);
    addCard(scene, card, x, y, cardWidth, "hand", index);
  });

  program.forEach((cardId, index) => {
    const x = startX + index * (cardWidth + gap);
    const locked = isRegisterLocked(robot, index);
    scene.add.circle(x + cardWidth / 2, registerY - 14, 6, locked ? 0xd92534 : 0x29c46a)
      .setStrokeStyle(2, 0xffffff, 0.35);
    const card = player.hand.find((item) => item.id === cardId);
    if (card) {
      addCard(scene, card, x, registerY, cardWidth, "register", index, locked);
    } else {
      const slot = scene.add.rectangle(x, registerY, cardWidth, cardHeight, 0x171c20)
        .setOrigin(0)
        .setStrokeStyle(2, 0x39434c);
      slot.setData("zone", "register");
      slot.setData("index", index);
      slot.setData("locked", locked);
      slot.setInteractive({ dropZone: true });
      scene.add.text(x + cardWidth / 2, registerY + cardHeight / 2, String(index + 1), {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#eef3f6"
      }).setOrigin(0.5);
    }
  });

  const submit = scene.add.rectangle(panelRect.x + 24, layout.height - 46, panelRect.width - 48, 34, 0xf2c14e)
    .setOrigin(0)
    .setInteractive({ useHandCursor: true });
  scene.add.text(submit.x + submit.width / 2, submit.y + submit.height / 2, "VALIDER", {
    fontFamily: "Arial",
    fontSize: "15px",
    fontStyle: "bold",
    color: "#101316"
  }).setOrigin(0.5);
  submit.on("pointerdown", submitProgram);
}

function addCard(scene, card, x, y, width, zone, index, locked = false) {
  const height = width * CARD_SOURCE.height / CARD_SOURCE.width;
  const container = scene.add.container(x, y);
  const image = scene.add.image(0, 0, "program_cards", cardFrameIndex(card)).setOrigin(0);
  image.setDisplaySize(width, height);
  image.setInteractive(new Phaser.Geom.Rectangle(0, 0, CARD_SOURCE.width, CARD_SOURCE.height), Phaser.Geom.Rectangle.Contains);
  const priority = scene.add.text(width * 0.5, height * ((15 + 32.5) / 460), String(card.priority), {
    fontFamily: "Arial",
    fontSize: `${Math.max(10, Math.floor(width * 0.16))}px`,
    fontStyle: "bold",
    color: "#ffffff"
  }).setOrigin(0.5);

  container.add([image, priority]);
  container.setSize(width, height);
  container.setData("zone", zone);
  container.setData("index", index);
  container.setData("cardId", card.id);
  container.setData("locked", locked);
  container.setData("width", width);
  container.setData("height", height);
  image.setData("cardContainer", container);
  image.setData("width", width);
  image.setData("height", height);
  if (!locked) scene.input.setDraggable(image);
  return container;
}

function addRobot(scene, robot, px, py, tileSize) {
  const marker = scene.add.container(px + tileSize / 2, py + tileSize / 2);
  const body = scene.add.rectangle(0, 0, tileSize * 0.52, tileSize * 0.44, 0xd93f5f).setStrokeStyle(2, 0xf7d154);
  const nose = scene.add.triangle(tileSize * 0.25, 0, 0, -tileSize * 0.16, 0, tileSize * 0.16, tileSize * 0.24, 0, 0xf7d154);
  marker.add([body, nose]);
  marker.rotation = Phaser.Math.DegToRad(directionDegrees(robot.direction));
  return marker;
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

function cardFrameIndex(card) {
  return { move_3: 0, move_2: 1, move_1: 2, rotate_left: 3, rotate_right: 4, backup: 5, u_turn: 6 }[card.type] ?? 0;
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
    return scene.add.rectangle(px, py, tileSize, tileSize, 0x323a40).setOrigin(0);
  }
  const floor = scene.add.image(px + tileSize / 2, py + tileSize / 2, "floor_tiles", floorFrameFor(x, y));
  floor.setDisplaySize(tileSize, tileSize);
  floor.rotation = floorRotationFor(x, y);
  return floor;
}

function addPitTile(scene, tile, px, py, tileSize) {
  if (!scene.textures.exists("pit_tiles")) {
    return scene.add.rectangle(px, py, tileSize, tileSize, 0x050708).setOrigin(0);
  }
  const pit = scene.add.image(px + tileSize / 2, py + tileSize / 2, "pit_tiles", pitFrameFor(tile));
  pit.setDisplaySize(tileSize, tileSize);
  return pit;
}

function addZoneTile(scene, tile, px, py, tileSize) {
  if (!scene.textures.exists("zone_tiles")) return [];
  const frame = zoneFrameFor(tile);
  if (frame === null) return [];
  const zone = scene.add.image(px + tileSize / 2, py + tileSize / 2, "zone_tiles", frame);
  zone.setDisplaySize(tileSize, tileSize);
  return zone;
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
  if (!scene.textures.exists("conveyor_tiles")) return [];
  const transform = conveyorTransform(conveyor);
  const sprite = scene.add.image(px + tileSize / 2, py + tileSize / 2, "conveyor_tiles", transform.frame);
  sprite.setDisplaySize(tileSize, tileSize);
  sprite.rotation = transform.rotation;
  sprite.setFlipX(transform.flipX);
  sprite.setFlipY(Boolean(transform.flipY));
  return sprite;
}

function addRotatorTile(scene, rotator, px, py, tileSize) {
  if (!scene.textures.exists("gear_tiles")) return [];
  const frame = rotator.direction === "ccw" || rotator.direction === "counterclockwise" ? 5 : 4;
  const gear = scene.add.image(px + tileSize / 2, py + tileSize / 2, "gear_tiles", frame);
  gear.setDisplaySize(tileSize, tileSize);
  return gear;
}

function addLaserTile(scene, laser, px, py, tileSize) {
  if (!scene.textures.exists("laser_tiles")) return [];
  const items = [];
  const power = Math.max(1, Math.min(3, laser.power || 1));
  if (laser.beam) {
    const beam = scene.add.image(px + tileSize / 2, py + tileSize / 2, "laser_tiles", LASER_FRAMES.beamsNorthSouth[power - 1]);
    beam.setDisplaySize(tileSize, tileSize);
    beam.rotation = laser.beam === "east-west" ? Math.PI / 2 : 0;
    items.push(beam);
  }
  if (laser.emitter) {
    const emitter = scene.add.image(px + tileSize / 2, py + tileSize / 2, "laser_tiles", LASER_FRAMES.emittersNorth[power - 1]);
    emitter.setDisplaySize(tileSize, tileSize);
    emitter.rotation = directionRotationFromNorth(laser.direction || "north");
    items.push(emitter);
  }
  return items;
}

function addCrusherTile(scene, crusher, px, py, tileSize) {
  if (!scene.textures.exists("crusher_tiles")) return [];
  const items = [];
  const rotation = crusher.variant === "conveyor" ? rotationFromEast(crusher.direction || "east") : 0;
  const frame = crusher.variant === "conveyor" ? CRUSHER_FRAMES.conveyor : CRUSHER_FRAMES.plain;
  const sprite = scene.add.image(px + tileSize / 2, py + tileSize / 2, "crusher_tiles", frame);
  sprite.setDisplaySize(tileSize, tileSize);
  sprite.rotation = rotation;
  items.push(sprite);
  for (const marker of crusherSegmentMarkers(crusher.activeRegisters)) {
    const icon = scene.add.image(px + tileSize / 2, py + tileSize / 2, "crusher_tiles", marker.frame);
    icon.setDisplaySize(tileSize, tileSize);
    icon.rotation = rotation;
    items.push(icon);
  }
  return items;
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

function directionRotationFromNorth(direction) {
  return { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 }[direction] || 0;
}

function addWallTiles(scene, walls, px, py, tileSize) {
  if (!scene.textures.exists("wall_tiles")) return [];
  const items = [];
  for (const wall of walls) {
    const sprite = scene.add.image(px + tileSize / 2, py + tileSize / 2, "wall_tiles", 7);
    sprite.setDisplaySize(tileSize, tileSize);
    sprite.rotation = wallRotation(wall);
    items.push(sprite);
  }
  return items;
}

function wallRotation(wall) {
  return { west: 0, north: Math.PI / 2, east: Math.PI, south: -Math.PI / 2 }[wall] || 0;
}

function conveyorTransform(conveyor) {
  if (conveyor.shape === "merge") {
    return {
      frame: conveyor.type === "fast" ? CONVEYOR_FRAMES.fastMerge : CONVEYOR_FRAMES.merge,
      rotation: rotationFromEast(conveyor.direction || "east"),
      flipX: false,
      flipY: Boolean(conveyor.flipped)
    };
  }
  if (conveyor.shape === "turn" || conveyor.turn) return conveyorTurnTransform(conveyor);
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
  return transforms[`${from}:${to}`] || { frame: turnFrame, rotation: 0, flipX: false, flipY: conveyor.type === "fast" };
}

function rotationFromWest(direction) {
  return { west: 0, north: Math.PI / 2, east: Math.PI, south: -Math.PI / 2 }[direction] || 0;
}

function rotationFromEast(direction) {
  return { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 }[direction] || 0;
}

function turnDirectionForFrameOne(direction, turn) {
  const directions = ["north", "east", "south", "west"];
  const index = directions.indexOf(direction);
  const delta = turn === "right" ? -1 : 1;
  return directions[(index + delta + directions.length) % directions.length];
}

function configureDrag(scene) {
  scene.input.addPointer(2);
  scene.input.on("pointerdown", requestPlayerFullscreen);
  scene.input.on("pointerdown", (pointer) => {
    const corrected = calibratedPointer(pointer);
    const boardRect = layout?.board;
    if (boardRect && corrected.x >= boardRect.x && corrected.x <= boardRect.x + boardRect.width && corrected.y >= boardRect.y && corrected.y <= boardRect.y + boardRect.height) {
      boardView.pointers.set(pointer.id, { x: corrected.x, y: corrected.y });
      boardView.pinchDistance = currentPinchDistance();
      boardView.isPanning = true;
      boardView.panX = corrected.x;
      boardView.panY = corrected.y;
    }
  });

  scene.input.on("pointermove", (pointer) => {
    const corrected = calibratedPointer(pointer);
    if (boardView.pointers.has(pointer.id)) {
      boardView.pointers.set(pointer.id, { x: corrected.x, y: corrected.y });
    }
    if (boardView.pointers.size >= 2) {
      const nextDistance = currentPinchDistance();
      if (boardView.pinchDistance > 0 && nextDistance > 0) {
        const center = currentPinchCenter();
        zoomBoard(center.x, center.y, nextDistance / boardView.pinchDistance);
      }
      boardView.pinchDistance = nextDistance;
      return;
    }
    if (!boardView.isPanning || dragState) return;
    const dx = corrected.x - boardView.panX;
    const dy = corrected.y - boardView.panY;
    boardView.panX = corrected.x;
    boardView.panY = corrected.y;
    boardView.x += dx;
    boardView.y += dy;
    clampBoardView();
    boardContainerRef?.setPosition(boardView.x, boardView.y);
  });

  scene.input.on("pointerup", (pointer) => {
    boardView.pointers.delete(pointer.id);
    boardView.pinchDistance = currentPinchDistance();
    boardView.isPanning = boardView.pointers.size > 0;
  });

  scene.input.on("wheel", (pointer, _objects, _dx, dy) => {
    const corrected = calibratedPointer(pointer);
    const boardRect = layout?.board;
    if (!boardRect || corrected.x < boardRect.x || corrected.x > boardRect.x + boardRect.width || corrected.y < boardRect.y || corrected.y > boardRect.y + boardRect.height) return;
    zoomBoard(corrected.x, corrected.y, dy < 0 ? 1.12 : 0.88);
  });

  scene.input.on("dragstart", (pointer, target) => {
    const corrected = calibratedPointer(pointer);
    const container = getDraggedCardContainer(target);
    if (!container) return;
    dragState = {
      cardId: container.getData("cardId"),
      fromZone: container.getData("zone"),
      fromIndex: container.getData("index"),
      target,
      container,
      originX: container.x,
      originY: container.y,
      grabX: corrected.x - container.x,
      grabY: corrected.y - container.y
    };
    container.setDepth(100);
  });

  scene.input.on("drag", (pointer, target) => {
    const container = getDraggedCardContainer(target);
    if (!dragState || !container || container !== dragState.container) return;
    const corrected = calibratedPointer(pointer);
    container.x = corrected.x - dragState.grabX;
    container.y = corrected.y - dragState.grabY;
  });

  scene.input.on("dragend", (pointer, target) => {
    const container = getDraggedCardContainer(target);
    if (!dragState || !container || container !== dragState.container) return;
    const corrected = calibratedPointer(pointer);
    const width = container.getData("width") || 0;
    const height = container.getData("height") || 0;
    const drop = findDropTarget(container.x + width / 2, container.y + height / 2) || findDropTarget(corrected.x, corrected.y);
    if (drop) applyDrop(drop);
    container.setDepth(0);
    dragState = null;
    render();
  });
}

function getDraggedCardContainer(target) {
  return target?.getData?.("cardContainer") || target || null;
}

function requestPlayerFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  root.requestFullscreen({ navigationUI: "hide" })
    .then(() => {
      lockLandscape();
      scheduleViewportResize();
    })
    .catch(() => {});
}

function lockLandscape() {
  screen.orientation?.lock?.("landscape").catch(() => {});
}

function findDropTarget(x, y) {
  const player = latestState?.players.find((item) => item.id === playerId);
  if (!player) return null;
  const robot = latestState.robots.find((item) => item.playerId === player.id);
  const panelRect = layout.panel;
  const cardWidth = Math.floor(Math.min((panelRect.width - 56) / 5, (panelRect.height - 168) / 4.1));
  const cardHeight = Math.floor(cardWidth * CARD_SOURCE.height / CARD_SOURCE.width);
  const gap = Math.floor(cardWidth * 0.12);
  const startX = panelRect.x + Math.floor((panelRect.width - cardWidth * 5 - gap * 4) / 2);
  const registerY = layout.height - cardHeight - 76;
  const handY = Math.max(18, layout.height * 0.08);

  for (let index = 0; index < 5; index += 1) {
    const rx = startX + index * (cardWidth + gap);
    if (pointInRect(x, y, rx, registerY, cardWidth, cardHeight)) {
      return { zone: "register", index, locked: isRegisterLocked(robot, index) };
    }
  }

  const visibleHand = getOrderedHand(player).filter((card) => !program.includes(card.id));
  for (let index = 0; index < visibleHand.length; index += 1) {
    const hx = startX + (index % 5) * (cardWidth + gap);
    const hy = handY + Math.floor(index / 5) * (cardHeight + gap);
    if (pointInRect(x, y, hx, hy, cardWidth, cardHeight)) {
      return { zone: "hand", cardId: visibleHand[index].id };
    }
  }

  return null;
}

function pointInRect(x, y, rx, ry, rw, rh) {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

function zoomBoard(focusX, focusY, factor) {
  if (!boardMetrics) return;
  const previousScale = boardView.scale;
  const nextScale = Phaser.Math.Clamp(previousScale * factor, boardView.baseScale, boardView.baseScale * 3.5);
  const localX = (focusX - boardView.x) / previousScale;
  const localY = (focusY - boardView.y) / previousScale;
  boardView.scale = nextScale;
  boardView.x = focusX - localX * nextScale;
  boardView.y = focusY - localY * nextScale;
  clampBoardView();
  boardContainerRef?.setPosition(boardView.x, boardView.y);
  boardContainerRef?.setScale(boardView.scale);
}

function clampBoardView() {
  if (!boardMetrics || !layout) return;
  const boardRect = layout.board;
  const scaledWidth = boardMetrics.boardWidth * boardView.scale;
  const scaledHeight = boardMetrics.boardHeight * boardView.scale;
  const minX = boardRect.x + boardRect.width - scaledWidth;
  const minY = boardRect.y + boardRect.height - scaledHeight;
  boardView.x = scaledWidth <= boardRect.width
    ? boardRect.x + (boardRect.width - scaledWidth) / 2
    : Phaser.Math.Clamp(boardView.x, minX, boardRect.x);
  boardView.y = scaledHeight <= boardRect.height
    ? boardRect.y + (boardRect.height - scaledHeight) / 2
    : Phaser.Math.Clamp(boardView.y, minY, boardRect.y);
}

function currentPinchDistance() {
  const points = [...boardView.pointers.values()];
  if (points.length < 2) return 0;
  return Phaser.Math.Distance.Between(points[0].x, points[0].y, points[1].x, points[1].y);
}

function currentPinchCenter() {
  const points = [...boardView.pointers.values()];
  if (points.length < 2) return points[0] || { x: layout.width / 3, y: layout.height / 2 };
  return {
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2
  };
}

function scheduleViewportResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizePlayerGame, 80);
}

function resizePlayerGame() {
  const viewport = getStableViewport();
  applyViewportSize(viewport);
  console.info("[RoboRally player viewport]", viewport.width, viewport.height, "resolution", viewport.renderResolution, "dpr", window.devicePixelRatio);
  if (playerGame) {
    playerGame.scale.resize(viewport.logicalWidth, viewport.logicalHeight);
    applyCanvasDisplaySize(viewport);
  }
  boardView.initialized = false;
  render();
}

function getStableViewport() {
  const visual = window.visualViewport;
  const candidates = [
    viewportCandidate("screen", Math.max(screen.width, screen.height), Math.min(screen.width, screen.height)),
    viewportCandidate("outer", window.outerWidth, window.outerHeight),
    viewportCandidate("inner", window.innerWidth, window.innerHeight),
    viewportCandidate("document", document.documentElement.clientWidth, document.documentElement.clientHeight),
    viewportCandidate("visualViewport", visual?.width, visual?.height)
  ].filter((candidate) => candidate.width > 0 && candidate.height > 0);
  const best = candidates
    .filter((candidate) => candidate.width >= 500 && candidate.height >= 250)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0]
    || candidates.sort((a, b) => b.width * b.height - a.width * a.height)[0]
    || viewportCandidate("fallback", 800, 360);
  const width = Math.round(best.width);
  const height = Math.round(best.height);
  debugViewport = {
    width: Math.max(1, width),
    height: Math.max(1, height),
    dpr: window.devicePixelRatio || 1,
    renderResolution: getRenderResolution({ width: Math.max(1, width), height: Math.max(1, height) }),
    source: best.source,
    candidates
  };
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    renderResolution: debugViewport.renderResolution,
    logicalWidth: Math.round(Math.max(1, width) * debugViewport.renderResolution),
    logicalHeight: Math.round(Math.max(1, height) * debugViewport.renderResolution)
  };
}

function getRenderResolution({ width, height }) {
  const dpr = window.devicePixelRatio || 1;
  const fullHdScale = Math.max(1920 / width, 1080 / height, 1);
  return Number(Math.min(Math.max(fullHdScale, 1), dpr, 4).toFixed(2));
}

function viewportCandidate(source, rawWidth, rawHeight) {
  const width = Math.round(Number(rawWidth) || 0);
  const height = Math.round(Number(rawHeight) || 0);
  return {
    source,
    width: Math.max(width, height),
    height: Math.min(width, height)
  };
}

function applyViewportSize({ width, height }) {
  document.documentElement.style.width = `${width}px`;
  document.documentElement.style.height = `${height}px`;
  document.body.style.width = `${width}px`;
  document.body.style.height = `${height}px`;
  const app = document.querySelector("#player-app");
  const stage = document.querySelector("#player-stage");
  if (app) {
    app.style.width = `${width}px`;
    app.style.height = `${height}px`;
  }
  if (stage) {
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
  }
}

function applyCanvasDisplaySize({ width, height }) {
  const canvas = playerGame?.canvas;
  if (!canvas) return;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function applyDrop(target) {
  if (!dragState || target.locked) return;
  if (target.zone === "hand") {
    if (dragState.fromZone === "hand") swapHandCards(dragState.cardId, target.cardId);
    if (dragState.fromZone === "register") program[dragState.fromIndex] = null;
    return;
  }

  if (target.zone !== "register") return;
  if (dragState.fromZone === "register") {
    [program[dragState.fromIndex], program[target.index]] = [program[target.index], program[dragState.fromIndex]];
    return;
  }

  const currentIndex = program.indexOf(dragState.cardId);
  if (currentIndex >= 0) program[currentIndex] = null;
  program[target.index] = dragState.cardId;
}

function calibratedPointer(pointer) {
  const raw = rawLogicalPointer(pointer);
  return {
    phaserX: pointer.x,
    phaserY: pointer.y,
    rawX: raw.x,
    rawY: raw.y,
    deltaX: raw.x - pointer.x,
    deltaY: raw.y - pointer.y,
    x: raw.x,
    y: raw.y
  };
}

function rawLogicalPointer(pointer) {
  const event = pointer.event;
  const canvas = playerGame?.canvas;
  if (!event || !canvas) return { x: pointer.x, y: pointer.y };
  const rect = canvas.getBoundingClientRect();
  const eventPoint = eventClientPoint(event);
  if (!eventPoint) return { x: pointer.x, y: pointer.y };
  return {
    x: (eventPoint.clientX - rect.left) * (playerGame.scale.width / rect.width),
    y: (eventPoint.clientY - rect.top) * (playerGame.scale.height / rect.height)
  };
}

function eventClientPoint(event) {
  if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    return { clientX: event.clientX, clientY: event.clientY };
  }
  const touch = event.changedTouches?.[0] || event.touches?.[0];
  if (touch && Number.isFinite(touch.clientX) && Number.isFinite(touch.clientY)) {
    return { clientX: touch.clientX, clientY: touch.clientY };
  }
  return null;
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

async function initPlayerInterface() {
  await loadPhaser();
  const viewport = getStableViewport();
  applyViewportSize(viewport);
  playerGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "player-stage",
    width: viewport.logicalWidth,
    height: viewport.logicalHeight,
    resolution: 1,
    backgroundColor: "#101316",
    scale: {
      mode: Phaser.Scale.NONE
    },
    scene: {
      preload() {
        this.load.spritesheet("program_cards", `${basePath}/shared/assets/images/cartes.png`, { frameWidth: 310, frameHeight: 460 });
        this.load.spritesheet("floor_tiles", `${basePath}/shared/assets/images/sols.png`, { frameWidth: 66, frameHeight: 66 });
        this.load.spritesheet("pit_tiles", `${basePath}/shared/assets/images/pits.png`, { frameWidth: 66, frameHeight: 66 });
        this.load.spritesheet("conveyor_tiles", `${basePath}/shared/assets/images/conv.png`, { frameWidth: 66, frameHeight: 66 });
        this.load.spritesheet("gear_tiles", `${basePath}/shared/assets/images/gears.png`, { frameWidth: 66, frameHeight: 66 });
        this.load.spritesheet("wall_tiles", `${basePath}/shared/assets/images/walls.png`, { frameWidth: 66, frameHeight: 66 });
        this.load.spritesheet("zone_tiles", `${basePath}/shared/assets/images/zones.png`, { frameWidth: 66, frameHeight: 66 });
        this.load.spritesheet("laser_tiles", `${basePath}/shared/assets/images/lasers.png`, { frameWidth: 66, frameHeight: 66 });
        this.load.spritesheet("crusher_tiles", `${basePath}/shared/assets/images/crush.png`, { frameWidth: 66, frameHeight: 66 });
      },
      create() {
        playerScene = this;
        configureDrag(this);
        this.scale.on("resize", () => {
          boardView.initialized = false;
          render();
        });
        applyCanvasDisplaySize(viewport);
        resizePlayerGame();
        render();
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
