import fs from "node:fs/promises";
import path from "node:path";

export function createStorage(rootDir) {
  const dataDir = path.join(rootDir, "data");
  const mapsDir = path.join(dataDir, "maps");
  const savesDir = path.join(dataDir, "saves");

  return {
    async listMaps() {
      await ensureDirs();
      const files = await fs.readdir(mapsDir);
      const maps = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => readJson(path.join(mapsDir, file)))
      );
      return maps.map(({ id, name, width, height, thumbnail }) => ({
        id,
        name,
        width,
        height,
        thumbnail
      }));
    },

    async readMap(mapId) {
      await ensureDirs();
      return readJson(path.join(mapsDir, `${mapId}.json`));
    },

    async writeMap(map) {
      await ensureDirs();
      const clean = normalizeMap(map);
      const target = path.join(mapsDir, `${clean.id}.json`);
      await fs.writeFile(target, JSON.stringify(clean, null, 2), "utf8");
      return clean;
    },

    async writeSave(game) {
      await ensureDirs();
      const target = path.join(savesDir, `game-${game.id}.json`);
      const latest = path.join(savesDir, "latest.json");
      const payload = JSON.stringify({ ...game, updatedAt: new Date().toISOString() }, null, 2);
      await fs.writeFile(target, payload, "utf8");
      await fs.writeFile(latest, payload, "utf8");
    },

    async readLatestSave() {
      await ensureDirs();
      try {
        return await readJson(path.join(savesDir, "latest.json"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    }
  };

  async function ensureDirs() {
    await fs.mkdir(mapsDir, { recursive: true });
    await fs.mkdir(savesDir, { recursive: true });
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function normalizeMap(map) {
  const id = String(map?.id || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!id) throw new Error("Map id invalide");
  const width = clampInteger(map.width, 1, 64, 12);
  const height = clampInteger(map.height, 1, 64, 12);
  const tiles = Array.isArray(map.tiles)
    ? map.tiles
        .filter((tile) => Number.isInteger(tile.x) && Number.isInteger(tile.y) && tile.x >= 0 && tile.y >= 0 && tile.x < width && tile.y < height)
        .map((tile) => ({ ...tile, x: tile.x, y: tile.y }))
    : [];
  return {
    id,
    name: String(map.name || id).trim() || id,
    width,
    height,
    tileSize: clampInteger(map.tileSize, 24, 160, 72),
    thumbnail: validThumbnail(map.thumbnail) ? map.thumbnail : "",
    tiles
  };
}

function validThumbnail(value) {
  return typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(value);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
