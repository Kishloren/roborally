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
      return maps.map(({ id, name, width, height }) => ({ id, name, width, height }));
    },

    async readMap(mapId) {
      await ensureDirs();
      return readJson(path.join(mapsDir, `${mapId}.json`));
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
