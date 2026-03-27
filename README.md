# Gemini Balance Console (TypeScript / Next.js)

Read-only console to analyze Gemini Station content: mods, missions, mobs, items, abilities.

## Run locally
- **macOS:** double-click **Start Gemini Balance Console.command** (first run may require right-click → Open)
- **Windows:** double-click **Start Gemini Balance Console.bat**

Then open <http://localhost:3000>.

## Data sources
The console now loads directly from fixed JSON endpoints:
- Mods: `https://json-service-production-e4bb.up.railway.app/json/Mods.json`
- Items: `https://json-service-production-e4bb.up.railway.app/json/items.json`
Open **Settings** to view the currently loaded URLs and force a reload.

## Features
- Dashboard (missions by band, **coverage by band**, rarity distribution)
- Mods Explorer (icons, rarity coloring, **hover card** with full stats/desc, sorting)
- Items Explorer (icons, filters, sorting)
- Missions Explorer (filter by band)
- Mob Lab:
  - Import a `mobs.json` file with tolerant JSON5 parsing
  - Browse mobs by name, ID, level, faction, and AI type
  - Clone mobs, create blank mobs, edit runtime fields, and manage stat blocks
  - Live duplicate-ID alerts plus validation for invalid JSON blocks
  - Download the updated `mobs.json`, copy the full file JSON, or copy the current mob JSON
- Mission Lab:
  - Import a missions zip or a selected missions folder
  - Tolerant mission parsing with per-file diagnostics for trailing commas, control-character cleanup, and parse failures
  - Shared Browser + Map filters for folder, category, arc, tag, faction, class, level range, mode, objective type, prerequisites, and repeatable state
  - Prerequisite graph view and focused top-to-bottom chain cards
  - Read-only mission detail drawer with step/objective structure, rewards, descriptions, conversations summary, and source path
- Holes report (band × slot × rarity, colored, total, required=10 by default)
- Outliers report with z-score explanation

## Mission Lab Usage
1. Open `/mission-lab` from the top navigation.
2. Import either:
   - a missions `.zip`, or
   - a missions folder selected in the browser via the folder picker.
3. Use the Browser tab to search, sort, filter, and open mission details.
4. Use the Map tab for:
   - the full filtered prerequisite graph, or
   - a focused top-to-bottom chain view for the selected mission.
5. Use Diagnostics to review:
   - successful imports,
   - files imported with warnings,
   - files that failed tolerant parsing,
   - strict JSON-invalid files,
   - duplicate IDs,
   - missing prerequisite targets,
   - placeholder arcs/tags,
   - graph cycles.

Mission Lab is intentionally isolated from the manifest/data URL loader used by the rest of the console. Imports are read-only and held in a separate in-memory Mission Lab workspace until cleared.

## Mob Lab Usage
1. Open `/mob-lab` from the top navigation.
2. Either:
   - import an existing `mobs.json` file, or
   - start a blank workspace for new mob creation.
3. Use the left browser to search, sort, filter, and select mobs.
4. Edit the selected mob’s:
   - ID, display name, level, faction, AI type, scene, and sprite
   - abilities, services, comms directory, loot tables, hail fields, flags, and stat block
   - scan JSON and extra JSON for runtime-only fields not covered by the dedicated inputs
5. Use the export actions to:
   - download the updated `mobs.json`,
   - copy the whole updated file JSON, or
   - copy just the current mob JSON.

Mob Lab is isolated from the console’s existing read-only mob parsing and from the separate mod/mission authoring tools.

## Config
See `config.json` for level bands, thresholds, rarity labels, and weights.
