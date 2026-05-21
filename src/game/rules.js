import { hydrateCard } from "./cards.js";
import { conveyorTurnEntry } from "./conveyors.js";

const REGISTER_COUNT = 5;
const DESTRUCTION_DAMAGE = 10;
const DIRECTIONS = ["north", "east", "south", "west"];

export function blockedRegisterCount(robot) {
  if (!robot || robot.eliminated) return 0;
  return Math.max(0, Math.min(REGISTER_COUNT, (robot.damage || 0) - 4));
}

export function isRegisterLocked(robot, index) {
  return index >= REGISTER_COUNT - blockedRegisterCount(robot);
}

export function isProgramComplete(game, player) {
  const robot = robotForPlayer(game, player.id);
  if (!robot || robot.eliminated) return true;
  return normalizeProgram(player.program).every(Boolean);
}

export function resolveSegment(game, registerIndex = game.register || 0) {
  const events = [];
  game.phase = "resolution";
  game.status = "resolution";
  game.register = registerIndex;

  const actions = programmedCards(game, registerIndex);
  for (const action of actions) {
    executeCard(game, action.robot, action.card, events);
  }

  resolveConveyorWave(game, ["fast"], "fast_conveyors", events);
  resolveConveyorWave(game, ["fast", "normal"], "all_conveyors", events);
  resolveLasers(game, events);

  game.register = registerIndex + 1;
  if (game.register >= REGISTER_COUNT) {
    finishTurn(game, events);
  }
  resetSegmentDestroyedRobots(game);
  game.eventLog.push(...events);
  game.updatedAt = new Date().toISOString();
  return events;
}

function programmedCards(game, registerIndex) {
  return game.players
    .map((player) => {
      const robot = robotForPlayer(game, player.id);
      const cardId = player.program?.[registerIndex];
      if (!robot || robot.eliminated || !cardId) return null;
      return { player, robot, card: hydrateCard(cardId) };
    })
    .filter(Boolean)
    .sort((a, b) => b.card.priority - a.card.priority);
}

function executeCard(game, robot, card, events) {
  if (card.action === "rotate") {
    robot.direction = rotateDirection(robot.direction, card.turn);
    events.push({ type: "robot_rotated", robotId: robot.id, cardId: card.id, direction: robot.direction });
    return;
  }
  if (card.action === "move") {
    const distance = Math.abs(card.distance);
    const direction = card.distance >= 0 ? robot.direction : oppositeDirection(robot.direction);
    for (let step = 0; step < distance; step += 1) {
      if (!moveRobot(game, robot, direction, "card", events)) break;
      if (robot.destroyed || robot.eliminated) break;
    }
  }
}

function resolveConveyorWave(game, types, wave, events) {
  const movingRobots = liveRobots(game).filter((robot) => {
    const conveyor = tileAt(game.map, robot.x, robot.y)?.conveyor;
    return conveyor && types.includes(conveyor.type || "normal");
  });
  if (!movingRobots.length) return;

  const intentions = movingRobots.map((robot) => {
    const conveyor = tileAt(game.map, robot.x, robot.y).conveyor;
    const direction = conveyorOutputDirection(conveyor);
    return { robot, conveyor, direction, target: nextCell(robot.x, robot.y, direction) };
  });

  const targetCounts = new Map();
  for (const intention of intentions) {
    const key = cellKey(intention.target.x, intention.target.y);
    targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
  }
  const movingIds = new Set(intentions.map((intention) => intention.robot.id));

  for (const intention of intentions) {
    const key = cellKey(intention.target.x, intention.target.y);
    if (targetCounts.get(key) > 1) {
      events.push({ type: "conveyor_conflict", wave, robotId: intention.robot.id, x: intention.target.x, y: intention.target.y });
      continue;
    }
    if (moveRobot(game, intention.robot, intention.direction, "conveyor", events, { movingIds })) {
      applyConveyorArrivalRotation(game, intention.robot, intention.conveyor, intention.direction, events);
      events.push({ type: "conveyor_moved", wave, robotId: intention.robot.id, x: intention.robot.x, y: intention.robot.y });
    }
  }
}

function moveRobot(game, robot, direction, source, events, options = {}) {
  if (robot.eliminated) return false;
  const target = nextCell(robot.x, robot.y, direction);
  if (!canEnterCell(game, robot.x, robot.y, direction)) {
    events.push({ type: "movement_blocked", robotId: robot.id, source, reason: "wall" });
    return false;
  }
  if (!isInsideMap(game.map, target.x, target.y)) {
    destroyRobot(game, robot, "out_of_bounds", events);
    return true;
  }

  if (!robot.holographic) {
    const occupant = physicalRobotAt(game, target.x, target.y, options.movingIds);
    if (occupant && !pushRobot(game, occupant, direction, events, options)) {
      events.push({ type: "movement_blocked", robotId: robot.id, source, reason: "push_blocked" });
      return false;
    }
  }

  robot.x = target.x;
  robot.y = target.y;
  events.push({ type: "robot_moved", robotId: robot.id, source, x: robot.x, y: robot.y });
  if (isPit(game.map, robot.x, robot.y)) destroyRobot(game, robot, "pit", events);
  return true;
}

function pushRobot(game, robot, direction, events, options) {
  if (robot.holographic || robot.eliminated) return true;
  return moveRobot(game, robot, direction, "push", events, options);
}

function applyConveyorArrivalRotation(game, robot, sourceConveyor, moveDirection, events) {
  if (robot.eliminated) return;
  let turn = conveyorTurnForMovement(sourceConveyor, "conveyor");
  const arrival = tileAt(game.map, robot.x, robot.y)?.conveyor;
  if (!turn && arrival?.shape === "turn") turn = conveyorTurnDelta(arrival);
  if (!turn && arrival?.shape === "merge") {
    const entrySide = oppositeDirection(moveDirection);
    turn = mergeArrivalTurn(arrival, entrySide);
  }
  if (!turn) return;
  robot.direction = rotateDirection(robot.direction, turn);
  events.push({ type: "conveyor_rotated", robotId: robot.id, turn, direction: robot.direction });
}

function finishTurn(game, events) {
  for (const robot of liveRobots(game)) {
    resolveCheckpointAndRepair(game, robot, events);
  }
  for (const robot of liveRobots(game).filter((item) => item.holographic)) {
    const alone = liveRobots(game).filter((item) => item.x === robot.x && item.y === robot.y).length === 1;
    if (alone) {
      robot.holographic = false;
      events.push({ type: "robot_materialized", robotId: robot.id });
    }
  }
  for (const player of game.players) {
    const robot = robotForPlayer(game, player.id);
    const nextProgram = lockedProgramForNextTurn(player, robot);
    const lockedIds = new Set(nextProgram.filter(Boolean));
    discardCards(game, player.hand.filter((card) => !lockedIds.has(card.id)));
    player.program = nextProgram;
    player.hand = drawCardsForTurn(game, robotForPlayer(game, player.id));
  }
  game.turn += 1;
  game.register = 0;
  game.phase = "programming";
  game.status = "programming";
}

function resolveCheckpointAndRepair(game, robot, events) {
  const tile = tileAt(game.map, robot.x, robot.y);
  if (!tile) return;
  if (tile.checkpoint === robot.checkpoint + 1) {
    robot.checkpoint = tile.checkpoint;
    events.push({ type: "checkpoint_reached", robotId: robot.id, checkpoint: robot.checkpoint });
  }
  const repair = tile.repair || 0;
  if (repair > 0 && robot.damage > 0) {
    const before = robot.damage;
    robot.damage = Math.max(0, robot.damage - repair);
    events.push({ type: "robot_repaired", robotId: robot.id, amount: before - robot.damage });
  }
}

function resolveLasers(game, events) {
  const shots = [
    ...fixedLaserShots(game),
    ...robotLaserShots(game)
  ];
  for (const shot of shots) {
    const hit = firstLaserHit(game, shot.x, shot.y, shot.direction);
    events.push({
      type: "laser_fired",
      source: shot.source,
      sourceId: shot.sourceId,
      direction: shot.direction,
      power: shot.power,
      hitRobotId: hit?.robot.id || null
    });
    if (hit) damageRobot(game, hit.robot, shot.power, shot.source, events);
  }
}

function fixedLaserShots(game) {
  return game.map.tiles
    .filter((tile) => tile.laser?.emitter)
    .map((tile) => ({
      source: "board_laser",
      sourceId: cellKey(tile.x, tile.y),
      x: tile.x,
      y: tile.y,
      direction: tile.laser.direction || "north",
      power: laserPower(tile.laser)
    }));
}

function robotLaserShots(game) {
  return liveRobots(game)
    .filter((robot) => !robot.holographic && !robot.destroyed)
    .map((robot) => ({
      source: "robot_laser",
      sourceId: robot.id,
      x: robot.x,
      y: robot.y,
      direction: robot.direction,
      power: 1
    }));
}

function firstLaserHit(game, x, y, direction) {
  let current = { x, y };
  while (canEnterCell(game, current.x, current.y, direction)) {
    current = nextCell(current.x, current.y, direction);
    if (!isInsideMap(game.map, current.x, current.y)) return null;
    const robot = physicalRobotAt(game, current.x, current.y);
    if (robot) return { robot, x: current.x, y: current.y };
  }
  return null;
}

function damageRobot(game, robot, amount, source, events) {
  if (!robot || robot.eliminated || robot.holographic) return;
  const damage = Math.max(1, Number(amount) || 1);
  robot.damage += damage;
  events.push({ type: "robot_damaged", robotId: robot.id, amount: damage, source, damage: robot.damage });
  if (robot.damage >= DESTRUCTION_DAMAGE) {
    destroyRobot(game, robot, "damage", events);
  }
}

function destroyRobot(game, robot, reason, events) {
  events.push({ type: "robot_destroyed", robotId: robot.id, reason });
  robot.lives -= 1;
  robot.destroyed = true;
  if (robot.lives <= 0) {
    robot.eliminated = true;
    return;
  }
  const respawn = respawnTile(game.map, robot);
  robot.x = respawn.x;
  robot.y = respawn.y;
  robot.direction = respawn.direction || "north";
  robot.damage = 2;
  robot.holographic = true;
  events.push({ type: "robot_respawned", robotId: robot.id, x: robot.x, y: robot.y });
}

function resetSegmentDestroyedRobots(game) {
  for (const robot of game.robots) {
    if (!robot.eliminated) robot.destroyed = false;
  }
}

function laserPower(laser = {}) {
  return Math.max(1, Math.min(3, Number(laser.power) || 1));
}


function lockedProgramForNextTurn(player, robot) {
  const previousProgram = normalizeProgram(player.program);
  return previousProgram.map((cardId, index) => isRegisterLocked(robot, index) ? cardId : null);
}

function drawCardsForTurn(game, robot) {
  if (!robot || robot.eliminated) return [];
  return drawCards(game, Math.max(0, 9 - robot.damage));
}

function drawCards(game, count) {
  const cards = [];
  while (cards.length < count) {
    if (game.deck.length === 0) {
      game.deck = shuffle(game.discardPile, game.rng.seed + Date.now());
      game.discardPile = [];
    }
    const card = game.deck.shift();
    if (!card) break;
    cards.push(card);
  }
  return cards;
}

function discardCards(game, cards) {
  for (const card of cards) {
    if (card) game.discardPile.push(card);
  }
}

function normalizeProgram(program = []) {
  return Array.from({ length: REGISTER_COUNT }, (_, index) => program[index] || null);
}

function canEnterCell(game, x, y, direction) {
  const target = nextCell(x, y, direction);
  if (!isInsideMap(game.map, target.x, target.y)) return true;
  const currentTile = tileAt(game.map, x, y);
  const targetTile = tileAt(game.map, target.x, target.y);
  return !currentTile?.walls?.includes(direction) && !targetTile?.walls?.includes(oppositeDirection(direction));
}

function conveyorOutputDirection(conveyor) {
  if (conveyor.shape === "turn") return conveyorTurnEntry(conveyor)?.to || rotateDirection(conveyor.from || "east", conveyorTurnDelta(conveyor));
  return conveyor.direction || "east";
}

function conveyorTurnForMovement(conveyor, source) {
  if (conveyor.shape !== "turn") return 0;
  return source === "conveyor" ? conveyorTurnDelta(conveyor) : 0;
}

function conveyorTurnDelta(conveyor) {
  return conveyor.turn === "left" ? -1 : 1;
}

function mergeArrivalTurn(conveyor, entrySide) {
  const turningEntry = conveyor.inputs?.[1];
  if (entrySide !== turningEntry) return 0;
  return directionTurnDelta(oppositeDirection(entrySide), conveyor.direction || "east");
}

function directionTurnDelta(fromDirection, toDirection) {
  const fromIndex = DIRECTIONS.indexOf(fromDirection);
  const toIndex = DIRECTIONS.indexOf(toDirection);
  if (fromIndex < 0 || toIndex < 0) return 0;
  const delta = (toIndex - fromIndex + DIRECTIONS.length) % DIRECTIONS.length;
  if (delta === 1) return 1;
  if (delta === 3) return -1;
  if (delta === 2) return 2;
  return 0;
}

function physicalRobotAt(game, x, y, movingIds = new Set()) {
  return liveRobots(game).find((robot) => robot.x === x && robot.y === y && !robot.holographic && !movingIds.has(robot.id));
}

function liveRobots(game) {
  return game.robots.filter((robot) => !robot.eliminated && !robot.destroyed);
}

function robotForPlayer(game, playerId) {
  return game.robots.find((robot) => robot.playerId === playerId);
}

function respawnTile(map, robot) {
  if (robot.checkpoint > 0) {
    const checkpoint = map.tiles.find((tile) => tile.checkpoint === robot.checkpoint);
    if (checkpoint) return checkpoint;
  }
  return findSpawn(map);
}

function findSpawn(map) {
  return map.tiles.find((tile) => tile.spawn) || { x: 0, y: 0, direction: "east" };
}

function tileAt(map, x, y) {
  return map.tiles.find((tile) => tile.x === x && tile.y === y) || null;
}

function isPit(map, x, y) {
  return tileAt(map, x, y)?.floor === "pit";
}

function isInsideMap(map, x, y) {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

function nextCell(x, y, direction) {
  const vector = directionToVector(direction);
  return { x: x + vector.x, y: y + vector.y };
}

function directionToVector(direction) {
  return {
    north: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    south: { x: 0, y: 1 },
    west: { x: -1, y: 0 }
  }[direction] || { x: 0, y: 0 };
}

function rotateDirection(direction, turn) {
  const index = DIRECTIONS.indexOf(direction);
  return DIRECTIONS[(Math.max(0, index) + turn + DIRECTIONS.length) % DIRECTIONS.length];
}

function oppositeDirection(direction) {
  return { north: "south", east: "west", south: "north", west: "east" }[direction] || direction;
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function shuffle(items, seed) {
  const result = [...items];
  let state = seed || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
