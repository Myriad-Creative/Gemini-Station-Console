import fs from "fs";
import path from "path";

type Config = {
  repo_root: string | null;
  level_bands: [number, number][];
  coverage_threshold_per_slot: number;
  zscore_threshold: number;
  rarity_labels: Record<number, string>;
  weights: {
    global: Record<string, number>;
    perSlot?: Record<string, Record<string, number>>;
    abilityWeight: number;
  };
};

const defaultConfig: Config = {
  repo_root: null,
  level_bands: [[1,9],[10,19],[20,29],[30,39],[40,49],[50,59],[60,69],[70,79],[80,89],[90,99],[100,100]],
  coverage_threshold_per_slot: 10,
  zscore_threshold: 2.0,
  rarity_labels: { 0: "Common", 1: "Uncommon", 2: "Rare", 3: "Epic", 4: "Legendary" },
  weights: { global: {}, perSlot: {}, abilityWeight: 1 }
};

export function getConfig(): Config {
  const configPath = path.resolve(process.cwd(), "config.json");
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw);
    return { ...defaultConfig, ...cfg, weights: { ...defaultConfig.weights, ...(cfg.weights || {}) } };
  }
  return defaultConfig;
}

export function saveConfig(partial: Partial<Config>) {
  const configPath = path.resolve(process.cwd(), "config.json");
  const merged = { ...getConfig(), ...partial };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
}
