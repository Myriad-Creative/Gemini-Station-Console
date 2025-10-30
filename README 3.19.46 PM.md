# Gemini Balance Console (TypeScript / Next.js)

Read-only console to analyze Gemini Station content: mods, missions, mobs, items, abilities.

## Run locally
- **macOS:** double-click **Start Gemini Balance Console.command** (first run may require right-click → Open)
- **Windows:** double-click **Start Gemini Balance Console.bat**

Then open <http://localhost:3000>.

## Set data source
Open **Settings**:
- **Repo folder path** → your `Gemini-Station` root (contains `data/` and `scripts/`) → **Reload from folder**.
- Or **Upload ZIP** of your repo (auto-detects the actual repo directory inside the zip).

## Features
- Dashboard (missions by band, **coverage by band**, rarity distribution)
- Mods Explorer (icons, rarity coloring, **hover card** with full stats/desc, sorting)
- Items Explorer (icons, filters, sorting)
- Missions Explorer (filter by band)
- Holes report (band × slot × rarity, colored, total, required=10 by default)
- Outliers report with z-score explanation

## Config
See `config.json` for level bands, thresholds, rarity labels, and weights.
