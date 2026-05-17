const qrImage = document.querySelector("#join-qr");
const joinUrl = document.querySelector("#join-url");
const players = document.querySelector("#players");
const basePath = detectBasePath("display");
const socket = window.io?.({ path: `${basePath}/socket.io` });

let latestState = null;
let sceneRef = null;

await loadPhaser();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-canvas",
  width: 1560,
  height: 1080,
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
loadQr();

if (socket) {
  socket.on("game:state", applyState);
} else {
  pollState();
  window.setInterval(pollState, 1000);
}

function preload() {}

function create() {
  sceneRef = this;
  createGeneratedSprites(this);
  if (latestState) renderBoard(this, latestState);
}

function update() {}

async function loadQr() {
  const response = await fetch(`${basePath}/api/game/qr`);
  const payload = await response.json();
  qrImage.src = payload.qr;
  joinUrl.textContent = payload.url;
}

async function pollState() {
  const response = await fetch(`${basePath}/api/game/state`);
  applyState(await response.json());
}

function applyState(state) {
  latestState = state;
  renderPlayers(state);
  if (sceneRef) renderBoard(sceneRef, state);
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
  players.replaceChildren(
    ...state.players.map((player) => {
      const row = document.createElement("div");
      row.className = "player-row";
      row.innerHTML = `<span>${escapeHtml(player.name)}</span><strong>${player.ready ? "Ready" : "Lobby"}</strong>`;
      return row;
    })
  );
}

function renderBoard(scene, state) {
  scene.children.removeAll();
  const tileSize = state.map.tileSize || 72;
  const offsetX = Math.floor((1560 - state.map.width * tileSize) / 2);
  const offsetY = Math.floor((1080 - state.map.height * tileSize) / 2);
  const specialTiles = new Map(state.map.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const tile = specialTiles.get(`${x},${y}`) || { x, y, floor: "normal" };
      const px = offsetX + x * tileSize;
      const py = offsetY + y * tileSize;
      scene.add.image(px, py, tile.floor === "pit" ? "floor_pit" : "floor_normal").setOrigin(0);
      if (tile.checkpoint) scene.add.image(px, py, `checkpoint_${tile.checkpoint}`).setOrigin(0);
      if (tile.spawn) scene.add.image(px, py, `spawn_${tile.spawn}`).setOrigin(0);
      if (tile.pusher) addOriented(scene, "pusher", tile.pusher.direction, px, py, tileSize);
      if (tile.crusher) scene.add.image(px, py, "crusher_idle").setOrigin(0);
    }
  }

  for (const robot of state.robots) {
    const px = offsetX + robot.x * tileSize + tileSize / 2;
    const py = offsetY + robot.y * tileSize + tileSize / 2;
    const sprite = scene.add.image(px, py, "robot_idle").setDisplaySize(52, 52);
    sprite.rotation = directionAngle(robot.direction);
  }
}

function addOriented(scene, key, direction, x, y, tileSize) {
  const sprite = scene.add.image(x + tileSize / 2, y + tileSize / 2, `${key}_idle`).setDisplaySize(58, 58);
  sprite.rotation = directionAngle(direction);
}

function directionAngle(direction) {
  return { north: -Math.PI / 2, east: 0, south: Math.PI / 2, west: Math.PI }[direction] || 0;
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
