const basePath = detectBasePath("player");
const socket = window.io?.({ path: `${basePath}/socket.io` });

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
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
let programSyncKey = "";
let handOrder = [];
let latestState = null;
let previousState = null;
let playerScene = null;
let dragState = null;
let boardView = { x: 0, y: 0, scale: 1, baseScale: 1, isPanning: false, panX: 0, panY: 0, pointers: new Map(), pinchDistance: 0 };
let boardMetrics = null;
let boardContainerRef = null;
let layout = null;
let playerGame = null;
let resizeTimer = null;
let pollingTimer = null;
let debugViewport = { width: 0, height: 0, dpr: 1, renderResolution: 1, source: "init" };
let titleSceneRef = null;

window.addEventListener("resize", enforceLandscapeLock);
window.addEventListener("orientationchange", enforceLandscapeLock);
window.addEventListener("fullscreenchange", enforceLandscapeLock);
window.visualViewport?.addEventListener("resize", enforceLandscapeLock);

if (socket) {
  socket.on("game:state", (state) => {
    previousState = latestState;
    latestState = state;
    render(previousState);
  });
  socket.on("connect", stopPolling);
  socket.on("connect_error", startPolling);
  socket.on("disconnect", startPolling);
} else {
  startPolling();
}

// Initialisation Phaser en bas de fichier, une fois les classes de scene declarees.

async function joinGame() {
  if (socket?.connected) {
    try {
      handleJoinReply(await emitWithAck("player:join", { name: "Player" }));
      return;
    } catch {
      startPolling();
    }
  }
  handleJoinReply(await postJson(`${basePath}/api/player/join`, { name: "Player" }));
}

function handleJoinReply(reply) {
  if (!reply.ok) {
    titleSceneRef?.setStatus(reply.error || "Connexion refusee.");
    return;
  }
  playerId = reply.playerId;
  window.localStorage.setItem("roborally.playerId", playerId);
  previousState = latestState;
  latestState = reply.state;
  render(previousState);
  scheduleViewportResize();
  titleSceneRef?.startGame();
}

function hasCurrentPlayer() {
  return Boolean(playerId && latestState?.players.some((item) => item.id === playerId));
}

function render(previous = null) {
  const player = latestState?.players.find((item) => item.id === playerId);
  if (!latestState || !playerScene) return;

  if (player) {
    syncHandOrder(player.hand);
    syncProgramFromServer(latestState, player);
  }
  drawInterface(playerScene, latestState, player, previous);
}

function drawInterface(scene, state, player, previous = null) {
  scene.tweens.killAll();
  scene.time.removeAllEvents();
  scene.children.removeAll();
  layout = getLayout(scene);
  drawBoard(scene, state, previous);
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

function drawBoard(scene, state, previous = null) {
  const boardRect = layout.board;
  const map = state.map;
  if (boardView.mapId !== map.id) {
    boardView.initialized = false;
    boardView.mapId = map.id;
  }
  const specialTiles = new Map(map.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const robotsByCell = new Map(state.robots.map((robot) => [`${robot.x},${robot.y}`, robot]));
  const previousRobots = new Map((previous?.robots || []).map((robot) => [robot.id, robot]));
  const changedEvents = newEvents(previous, state);
  const robotSprites = new Map();
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
      if (robot) {
        const sprite = addRobot(scene, previousRobots.get(robot.id) || robot, px, py, tileSize);
        robotSprites.set(robot.id, sprite);
        boardContainer.add(sprite);
      }
    }
  }
  playEventTimeline(scene, boardContainer, state, changedEvents, robotSprites, tileSize);
  clampBoardView();
  boardContainer.setPosition(boardView.x, boardView.y);
  boardContainer.setScale(boardView.scale);
}

function drawLaserEffect(scene, boardContainer, state, event, tileSize) {
  const robots = new Map(state.robots.map((robot) => [robot.id, robot]));
  const start = laserStartPoint(event, robots, tileSize);
  const hitRobot = robots.get(event.hitRobotId);
  if (!start || !hitRobot) return;
  const end = cellCenter(hitRobot.x, hitRobot.y, tileSize);
  const beam = scene.add.graphics();
  beam.lineStyle(Math.max(4, (event.power || 1) * 3), 0xfff27a, 0.95);
  beam.beginPath();
  beam.moveTo(start.x, start.y);
  beam.lineTo(end.x, end.y);
  beam.strokePath();
  boardContainer.add(beam);
  scene.tweens.add({
    targets: beam,
    alpha: 0,
    duration: 320,
    ease: "Cubic.easeOut",
    onComplete: () => beam.destroy()
  });
}

function laserStartPoint(event, robots, tileSize) {
  if (event.source === "board_laser") {
    const [x, y] = String(event.sourceId || "").split(",").map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) return cellCenter(x, y, tileSize);
  }
  const sourceRobot = robots.get(event.sourceId);
  return sourceRobot ? cellCenter(sourceRobot.x, sourceRobot.y, tileSize) : null;
}

function cellCenter(x, y, tileSize) {
  return { x: x * tileSize + tileSize / 2, y: y * tileSize + tileSize / 2 };
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
    const card = findPlayerCard(player, cardId);
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
  const marker = scene.add.container(robot.x * tileSize + tileSize / 2, robot.y * tileSize + tileSize / 2);
  let body;
  if (scene.textures.exists("robot_tiles")) {
    const frame = robotFrameIndex(robot);
    body = scene.add.image(0, 0, "robot_tiles", frame);
    body.setDisplaySize(tileSize * 0.82, tileSize * 0.82);
    marker.add(body);
  } else {
    body = scene.add.rectangle(0, 0, tileSize * 0.52, tileSize * 0.44, 0xd93f5f).setStrokeStyle(2, 0xf7d154);
    const nose = scene.add.triangle(tileSize * 0.25, 0, 0, -tileSize * 0.16, 0, tileSize * 0.16, tileSize * 0.24, 0, 0xf7d154);
    marker.add([body, nose]);
  }
  marker.alpha = robot.holographic ? 0.58 : 1;
  marker.rotation = rotationFromEast(robot.direction);
  marker.setData("body", body);
  return marker;
}

function robotFrameIndex(robot) {
  const match = String(robot?.id || "").match(/(\d+)$/);
  const index = match ? Number(match[1]) - 1 : 0;
  return Phaser.Math.Clamp(index, 0, 7);
}

function playEventTimeline(scene, boardContainer, state, events, robotSprites, tileSize) {
  if (!events.length) {
    syncRobotSpritesToState(robotSprites, state, tileSize);
    return;
  }
  let cursor = 0;
  for (const event of events) {
    const delay = cursor;
    const duration = timelineEventDuration(event);
    scene.time.delayedCall(delay, () => playTimelineEvent(scene, boardContainer, state, event, robotSprites, tileSize, duration));
    cursor += duration;
  }
  scene.time.delayedCall(cursor + 20, () => syncRobotSpritesToState(robotSprites, state, tileSize));
}

function playTimelineEvent(scene, boardContainer, state, event, robotSprites, tileSize, duration) {
  const sprite = robotSprites.get(event.robotId);
  if (event.type === "robot_moved" && sprite) {
    tweenRobot(scene, sprite, event.x, event.y, tileSize, duration);
  } else if ((event.type === "robot_rotated" || event.type === "conveyor_rotated") && sprite) {
    tweenRobotRotation(scene, sprite, event.direction, duration);
  } else if (event.type === "robot_respawned" && sprite) {
    sprite.setPosition(event.x * tileSize + tileSize / 2, event.y * tileSize + tileSize / 2);
    flashRobot(scene, sprite);
  } else if (event.type === "robot_damaged" && sprite) {
    flashRobot(scene, sprite);
  } else if (event.type === "robot_materialized" && sprite) {
    scene.tweens.add({ targets: sprite, alpha: 1, duration: Math.max(250, duration), ease: "Cubic.easeOut" });
  } else if (event.type === "laser_fired" && event.hitRobotId) {
    drawLaserEffect(scene, boardContainer, state, event, tileSize);
  }
}

function timelineEventDuration(event) {
  if (event.type === "robot_moved" || event.type === "robot_rotated" || event.type === "conveyor_rotated") return 1000;
  if (event.type === "laser_fired") return event.hitRobotId ? 360 : 80;
  if (event.type === "robot_damaged" || event.type === "robot_respawned" || event.type === "robot_materialized") return 320;
  return 80;
}

function tweenRobot(scene, sprite, x, y, tileSize, duration) {
  scene.tweens.add({
    targets: sprite,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    duration,
    ease: "Cubic.easeInOut"
  });
}

function tweenRobotRotation(scene, sprite, direction, duration) {
  const targetRotation = rotationFromEast(direction);
  scene.tweens.add({
    targets: sprite,
    rotation: nearestAngle(sprite.rotation, targetRotation),
    duration,
    ease: "Cubic.easeInOut"
  });
}

function flashRobot(scene, sprite) {
  const body = sprite.getData("body") || sprite;
  scene.tweens.add({ targets: body, alpha: 0.25, yoyo: true, repeat: 3, duration: 80 });
}

function syncRobotSpritesToState(robotSprites, state, tileSize) {
  for (const robot of state.robots) {
    const sprite = robotSprites.get(robot.id);
    if (!sprite) continue;
    sprite.setPosition(robot.x * tileSize + tileSize / 2, robot.y * tileSize + tileSize / 2);
    sprite.rotation = rotationFromEast(robot.direction);
    sprite.alpha = robot.holographic ? 0.58 : 1;
  }
}

function newEvents(previous, state) {
  if (!previous || previous.id !== state.id) return [];
  const previousLength = previous.eventLog?.length || 0;
  return (state.eventLog || []).slice(Math.min(previousLength, state.eventLog?.length || 0));
}

function nearestAngle(from, to) {
  return from + Phaser.Math.Angle.Wrap(to - from);
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

function findPlayerCard(player, cardId) {
  if (!cardId) return null;
  return player.hand.find((item) => item.id === cardId)
    || player.programCards?.find((item) => item?.id === cardId)
    || null;
}

function syncProgramFromServer(state, player) {
  const syncKey = `${state.id}:${state.turn}:${state.phase}`;
  if (syncKey !== programSyncKey) {
    program = Array(5).fill(null);
    programSyncKey = syncKey;
  }
  const robot = state.robots.find((item) => item.playerId === player.id);
  const serverProgram = player.program || [];
  for (let index = 0; index < 5; index += 1) {
    if (isRegisterLocked(robot, index) || player.programSubmitted) {
      program[index] = serverProgram[index] || null;
    }
  }
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

async function requestPlayerFullscreen(scene) {
  lockLandscape(scene);
  if (scene?.scale?.startFullscreen && !scene.scale.isFullscreen) {
    try {
      scene.scale.startFullscreen();
      scheduleViewportResize();
      return;
    } catch {}
  }
  const target = playerGame?.canvas || document.documentElement;
  if (document.fullscreenElement || !target.requestFullscreen) return;
  await target.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  scheduleViewportResize();
}

function lockLandscape(scene) {
  const landscape = window.Phaser?.Scale?.LANDSCAPE || "landscape-primary";
  if (scene?.scale?.lockOrientation) {
    try {
      scene.scale.lockOrientation(landscape);
      return;
    } catch {}
  }
  screen.orientation?.lock?.(landscape).catch(() => {});
}

function enforceLandscapeLock() {
  lockLandscape(playerScene || titleSceneRef);
  applyLandscapeViewportTransform();
  playerGame?.scale.refresh();
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
  applyLandscapeViewportTransform();
  console.info("[RoboRally player viewport]", debugViewport.width, debugViewport.height, "portrait ignored", debugViewport.portraitIgnored, "design", DESIGN_WIDTH, DESIGN_HEIGHT, "dpr", window.devicePixelRatio);
  playerGame?.scale.refresh();
}

function getStableViewport() {
  const visual = window.visualViewport;
  const rawWidth = Math.max(1, Math.round(visual?.width || window.innerWidth || document.documentElement.clientWidth || 800));
  const rawHeight = Math.max(1, Math.round(visual?.height || window.innerHeight || document.documentElement.clientHeight || 360));
  const width = Math.max(rawWidth, rawHeight);
  const height = Math.min(rawWidth, rawHeight);
  debugViewport = {
    rawWidth,
    rawHeight,
    width,
    height,
    portraitIgnored: rawHeight > rawWidth,
    dpr: window.devicePixelRatio || 1,
    renderResolution: getRenderResolution({ width, height }),
    source: visual ? "visualViewport" : "window"
  };
  return {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    renderResolution: 1
  };
}

function getRenderResolution({ width, height }) {
  return 1;
}

function applyLandscapeViewportTransform() {
  getStableViewport();
  const stage = document.getElementById("player-stage");
  if (!stage) return;
  const { rawWidth, rawHeight, portraitIgnored } = debugViewport;
  stage.style.position = "absolute";
  stage.style.left = "0";
  stage.style.top = "0";
  stage.style.transformOrigin = "top left";
  if (portraitIgnored) {
    stage.style.width = `${rawHeight}px`;
    stage.style.height = `${rawWidth}px`;
    stage.style.transform = `translateX(${rawWidth}px) rotate(90deg)`;
  } else {
    stage.style.width = `${rawWidth}px`;
    stage.style.height = `${rawHeight}px`;
    stage.style.transform = "none";
  }
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
    if (isLocalRegisterLocked(dragState.fromIndex)) return;
    [program[dragState.fromIndex], program[target.index]] = [program[target.index], program[dragState.fromIndex]];
    return;
  }

  const currentIndex = program.indexOf(dragState.cardId);
  if (currentIndex >= 0) program[currentIndex] = null;
  program[target.index] = dragState.cardId;
}

function calibratedPointer(pointer) {
  return {
    phaserX: pointer.x,
    phaserY: pointer.y,
    x: pointer.x,
    y: pointer.y
  };
}

function isRegisterLocked(robot, index) {
  const blocked = Math.max(0, Math.min(5, (robot?.damage ?? 0) - 4));
  return index >= 5 - blocked;
}

function isLocalRegisterLocked(index) {
  const player = latestState?.players.find((item) => item.id === playerId);
  const robot = latestState?.robots.find((item) => item.playerId === player?.id);
  return isRegisterLocked(robot, index);
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
  const response = await fetch(`${basePath}/api/game/state`, { cache: "no-store" });
  previousState = latestState;
  latestState = await response.json();
  render(previousState);
}

function startPolling() {
  if (pollingTimer) return;
  pollState().catch(() => {});
  pollingTimer = window.setInterval(() => {
    pollState().catch(() => {});
  }, 1000);
}

function stopPolling() {
  if (!pollingTimer) return;
  window.clearInterval(pollingTimer);
  pollingTimer = null;
}

function emitWithAck(eventName, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(1500).emit(eventName, payload, (error, reply) => {
      if (error) reject(error);
      else resolve(reply);
    });
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return response.json();
}

let BootScene;
let TitleScene;
let PlayerScene;

function definePlayerScenes() {
BootScene = class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    this.load.spritesheet("boot_robots", `${basePath}/shared/assets/images/robots.png`, { frameWidth: 256, frameHeight: 256 });
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#050607");
    const robot = this.add.image(width / 2, height / 2, "boot_robots", 0);
    robot.setDisplaySize(Math.min(width, height) * 0.28, Math.min(width, height) * 0.28);
    this.tweens.add({ targets: robot, alpha: 0.45, yoyo: true, repeat: -1, duration: 720, ease: "Sine.easeInOut" });
    const enterTitle = async () => {
      await requestPlayerFullscreen(this);
      lockLandscape(this);
      scheduleViewportResize();
      this.scene.start("TitleScene");
    };
    this.input.once("pointerdown", enterTitle);
    this.time.delayedCall(1000, () => {
      if (document.fullscreenElement) this.scene.start("TitleScene");
    });
  }
};

TitleScene = class TitleScene extends Phaser.Scene {
  constructor() {
    super("TitleScene");
    this.statusText = null;
    this.startButton = null;
  }

  preload() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#050607");
    this.add.image(width / 2, height * 0.32, "boot_robots", 0)
      .setDisplaySize(Math.min(width, height) * 0.22, Math.min(width, height) * 0.22);
    this.add.text(width / 2, height * 0.52, "ROBORALLY", {
      fontFamily: "Arial",
      fontSize: `${Math.max(32, Math.floor(height * 0.11))}px`,
      fontStyle: "bold",
      color: "#f2c14e"
    }).setOrigin(0.5);
    this.statusText = this.add.text(width / 2, height * 0.77, "Chargement...", {
      fontFamily: "Arial",
      fontSize: `${Math.max(14, Math.floor(height * 0.035))}px`,
      color: "#dce5ec"
    }).setOrigin(0.5);
    const barWidth = Math.min(width * 0.46, 460);
    const barHeight = Math.max(8, height * 0.018);
    const barX = (width - barWidth) / 2;
    const barY = height * 0.66;
    this.add.rectangle(barX, barY, barWidth, barHeight, 0x20272d).setOrigin(0);
    const fill = this.add.rectangle(barX, barY, 0, barHeight, 0xf2c14e).setOrigin(0);
    this.load.on("progress", (value) => {
      fill.width = barWidth * value;
    });
    this.load.on("loaderror", (file) => {
      this.setStatus(`Asset introuvable: ${file?.src || file?.key || "inconnu"}`);
    });
    loadPlayerAssets(this);
  }

  create() {
    titleSceneRef = this;
    requestPlayerFullscreen(this);
    lockLandscape(this);
    this.setStatus("Pret");
    this.createStartButton();
  }

  createStartButton() {
    const { width, height } = this.scale;
    const buttonWidth = Math.min(width * 0.24, 240);
    const buttonHeight = Math.max(42, height * 0.09);
    const button = this.add.rectangle(width / 2, height * 0.78, buttonWidth, buttonHeight, 0xf2c14e)
      .setInteractive({ useHandCursor: true });
    button.setStrokeStyle(2, 0xffffff, 0.25);
    const label = this.add.text(button.x, button.y, "DEMARRER", {
      fontFamily: "Arial",
      fontSize: `${Math.max(15, Math.floor(buttonHeight * 0.34))}px`,
      fontStyle: "bold",
      color: "#101316"
    }).setOrigin(0.5);
    this.startButton = button;
    button.on("pointerdown", async () => {
      button.disableInteractive();
      label.setText("CONNEXION...");
      this.setStatus("Connexion a la partie");
      await joinGame();
      if (!hasCurrentPlayer()) {
        button.setInteractive({ useHandCursor: true });
      }
    });
  }

  setStatus(message) {
    this.statusText?.setText(message);
  }

  startGame() {
    if (!hasCurrentPlayer()) return;
    titleSceneRef = null;
    this.scene.start("PlayerScene");
  }
};

PlayerScene = class PlayerScene extends Phaser.Scene {
  constructor() {
    super("PlayerScene");
  }

  create() {
    playerScene = this;
    configureDrag(this);
    this.scale.on("resize", () => {
      lockLandscape(this);
    });
    lockLandscape(this);
    render(previousState);
  }
};

function loadPlayerAssets(scene) {
  scene.load.spritesheet("program_cards", `${basePath}/shared/assets/images/cartes.png`, { frameWidth: 310, frameHeight: 460 });
  scene.load.spritesheet("floor_tiles", `${basePath}/shared/assets/images/sols.png`, { frameWidth: 66, frameHeight: 66 });
  scene.load.spritesheet("pit_tiles", `${basePath}/shared/assets/images/pits.png`, { frameWidth: 66, frameHeight: 66 });
  scene.load.spritesheet("conveyor_tiles", `${basePath}/shared/assets/images/conv.png`, { frameWidth: 66, frameHeight: 66 });
  scene.load.spritesheet("gear_tiles", `${basePath}/shared/assets/images/gears.png`, { frameWidth: 66, frameHeight: 66 });
  scene.load.spritesheet("wall_tiles", `${basePath}/shared/assets/images/walls.png`, { frameWidth: 66, frameHeight: 66 });
  scene.load.spritesheet("zone_tiles", `${basePath}/shared/assets/images/zones.png`, { frameWidth: 66, frameHeight: 66 });
  scene.load.spritesheet("laser_tiles", `${basePath}/shared/assets/images/lasers.png`, { frameWidth: 66, frameHeight: 66 });
  scene.load.spritesheet("crusher_tiles", `${basePath}/shared/assets/images/crush.png`, { frameWidth: 66, frameHeight: 66 });
  scene.load.spritesheet("robot_tiles", `${basePath}/shared/assets/images/robots.png`, { frameWidth: 256, frameHeight: 256 });
}
}

async function initPlayerInterface() {
  await loadPhaser();
  definePlayerScenes();
  applyLandscapeViewportTransform();
  playerGame = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: "player-stage",
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    resolution: 1,
    backgroundColor: "#050607",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      fullscreenTarget: "player-stage",
      expandParent: true
    },
    scene: [BootScene, TitleScene, PlayerScene]
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

initPlayerInterface().catch((error) => {
  console.error("RoboRally player init failed", error);
});
