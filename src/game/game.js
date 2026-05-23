import { createProgramDeck, hydrateCard } from "./cards.js";
import { blockedRegisterCount, isProgramComplete, resolveNextStep } from "./rules.js";

const MAX_PLAYERS = 8;
const HAND_SIZE = 9;
const REGISTER_COUNT = 5;
const directions = ["north", "east", "south", "west"];

export function createGame({ map }) {
  const deck = shuffle(createProgramDeck(), Date.now());
  return {
    schemaVersion: 1,
    id: createGameId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "lobby",
    turn: 0,
    register: 0,
    phase: "lobby",
    map,
    players: [],
    robots: [],
    deck,
    discardPile: [],
    eventLog: [],
    rng: { seed: Date.now() }
  };
}

export function getPublicState(game) {
  return {
    schemaVersion: game.schemaVersion,
    id: game.id,
    status: game.status,
    turn: game.turn,
    register: game.register,
    phase: game.phase,
    map: game.map,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      robotId: player.robotId,
      ready: player.ready,
      connected: player.connected,
      programSubmitted: isProgramComplete(game, player),
      blockedRegisters: blockedRegisterCount(game.robots.find((robot) => robot.playerId === player.id)),
      program: normalizeProgram(player.program).map((cardId) => cardId || null),
      programCards: normalizeProgram(player.program).map((cardId) => cardId ? hydrateCard(cardId) : null),
      hand: player.hand
    })),
    robots: game.robots,
    eventLog: game.eventLog.slice(-100)
  };
}

export function joinGame(game, { name, robotId, socketId }) {
  if (game.players.length >= MAX_PLAYERS) throw new Error("La partie est complete.");
  const cleanName = String(name || "").trim().slice(0, 24) || `Player ${game.players.length + 1}`;
  const resolvedRobotId = resolveRobotId(game, robotId);
  const spawn = findSpawn(game.map);
  const player = {
    id: createId("player"),
    name: cleanName,
    robotId: resolvedRobotId,
    socketId,
    ready: false,
    connected: true,
    hand: drawCards(game, HAND_SIZE),
    program: []
  };
  const robot = {
    id: resolvedRobotId,
    playerId: player.id,
    name: cleanName,
    x: spawn.x,
    y: spawn.y,
    direction: spawn.direction || "north",
    damage: 0,
    lives: 3,
    holographic: true,
    pendingOrientation: true,
    eliminated: false,
    destroyed: false,
    poweredDown: false,
    checkpoint: 0
  };

  game.players.push(player);
  game.robots.push(robot);
  game.eventLog.push({ type: "player_joined", playerId: player.id, at: new Date().toISOString() });
  return { player, robot };
}

export function setRobotOrientation(game, playerId, direction) {
  const player = findPlayer(game, playerId);
  const robot = game.robots.find((item) => item.playerId === player.id);
  if (!robot || robot.eliminated) throw new Error("Robot indisponible.");
  if (!directions.includes(direction)) throw new Error("Orientation invalide.");
  if (!robot.pendingOrientation) return { player, robot };
  robot.direction = direction;
  robot.pendingOrientation = false;
  game.eventLog.push({ type: "robot_orientation_set", robotId: robot.id, direction, at: new Date().toISOString() });
  return { player, robot };
}

export function setPlayerReady(game, playerId, ready) {
  const player = findPlayer(game, playerId);
  player.ready = ready;
  if (game.status === "lobby" && game.players.length > 0 && game.players.every((item) => item.ready)) {
    startGame(game);
  }
}

export function startGame(game) {
  if (game.status !== "lobby") return game;
  if (game.players.length === 0) throw new Error("Aucun joueur dans la partie.");
  game.status = "programming";
  game.phase = "programming";
  game.turn = Math.max(1, game.turn || 0);
  game.register = 0;
  for (const player of game.players) {
    player.ready = false;
    player.program = [];
  }
  game.eventLog.push({ type: "game_started", at: new Date().toISOString() });
  game.updatedAt = new Date().toISOString();
  return game;
}

export function submitProgram(game, playerId, cardIds) {
  const player = findPlayer(game, playerId);
  const robot = game.robots.find((item) => item.playerId === playerId);
  if (!robot || robot.eliminated) throw new Error("Robot indisponible.");
  if (robot.pendingOrientation) throw new Error("Choisis d'abord l'orientation du robot.");
  if (game.phase !== "programming") throw new Error("La partie n'est pas en phase de programmation.");
  if (!Array.isArray(cardIds) || cardIds.length !== REGISTER_COUNT) {
    throw new Error(`Programme attendu: ${REGISTER_COUNT} cartes.`);
  }
  const normalizedCards = normalizeProgram(cardIds);
  const lockedIndexes = lockedRegisterIndexes(robot);
  const handIds = new Set(player.hand.map((card) => card.id));
  const usedUnlockedCards = new Set();
  for (let index = 0; index < REGISTER_COUNT; index += 1) {
    const cardId = normalizedCards[index];
    if (lockedIndexes.includes(index)) {
      if (player.program[index] && cardId !== player.program[index]) {
        throw new Error(`Registre ${index + 1} bloque.`);
      }
      if (!player.program[index] && !cardId) {
        throw new Error(`Registre ${index + 1} bloque sans carte precedente.`);
      }
      normalizedCards[index] = player.program[index] || cardId;
      continue;
    }
    if (!cardId) throw new Error(`Registre ${index + 1} incomplet.`);
    if (!handIds.has(cardId)) throw new Error(`Carte absente de la main: ${cardId}`);
    if (usedUnlockedCards.has(cardId)) throw new Error(`Carte utilisee plusieurs fois: ${cardId}`);
    usedUnlockedCards.add(cardId);
  }
  player.program = normalizedCards;
  game.eventLog.push({ type: "program_submitted", playerId, at: new Date().toISOString() });
  if (game.players.every((item) => isProgramComplete(game, item))) {
    game.status = "ready_to_resolve";
    game.phase = "ready_to_resolve";
  }
}

export function resolveNextRegister(game) {
  if (!["ready_to_resolve", "resolution"].includes(game.phase)) {
    throw new Error("La partie n'est pas prete pour la resolution.");
  }
  return resolveNextStep(game);
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

function normalizeProgram(program = []) {
  return Array.from({ length: REGISTER_COUNT }, (_, index) => program[index] || null);
}

function lockedRegisterIndexes(robot) {
  const blocked = blockedRegisterCount(robot);
  return Array.from({ length: blocked }, (_, index) => REGISTER_COUNT - blocked + index);
}

function findPlayer(game, playerId) {
  const player = game.players.find((item) => item.id === playerId);
  if (!player) throw new Error("Joueur introuvable.");
  return player;
}

function resolveRobotId(game, robotId) {
  const requested = String(robotId || "").trim();
  const fallback = firstAvailableRobotId(game);
  const resolved = /^robot_[1-8]$/.test(requested) ? requested : fallback;
  if (!resolved) throw new Error("Aucun robot disponible.");
  if (game.players.some((player) => player.robotId === resolved)) {
    throw new Error("Ce robot est deja choisi.");
  }
  return resolved;
}

function firstAvailableRobotId(game) {
  const used = new Set(game.players.map((player) => player.robotId));
  for (let index = 1; index <= MAX_PLAYERS; index += 1) {
    const robotId = `robot_${index}`;
    if (!used.has(robotId)) return robotId;
  }
  return null;
}

function findSpawn(map) {
  const fallback = { x: 0, y: 0, direction: "east" };
  return map.tiles.find((tile) => tile.spawn) || fallback;
}

function createGameId() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
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

export function directionToVector(direction) {
  return {
    north: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    south: { x: 0, y: 1 },
    west: { x: -1, y: 0 }
  }[direction];
}

export function rotateDirection(direction, turn) {
  const index = directions.indexOf(direction);
  return directions[(index + turn + directions.length) % directions.length];
}
