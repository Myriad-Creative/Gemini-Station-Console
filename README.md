# Gemini Balance Console (TypeScript / Next.js)

Read-only console to analyze Gemini Station content: mods, missions, mobs, items, abilities.

## Run locally
- **macOS:** double-click **Start Gemini Balance Console.command** (first run may require right-click → Open)
- **Windows:** double-click **Start Gemini Balance Console.bat**

Then open <http://localhost:3000>.

## Data sources
The console is now upload-driven and starts empty on first load.

Open **Settings** to populate the three shared workspaces:
- upload a shared `data.zip` or `/data` folder for non-mission datasets
- upload a shared missions zip or missions folder for all mission pages
- upload a shared `/assets` folder for `res://assets/...` image resolution

Once those uploads are present, the entire site reads from them. There is no manifest URL or external JSON fallback path anymore.

## Features
- Dashboard (missions by band, **coverage by band**, rarity distribution)
- Mods Explorer (icons, rarity coloring, **hover card** with full stats/desc, sorting)
- Items Explorer (icons, filters, sorting)
- Missions Explorer (shared imported workspace + band filter)
- Mob Lab:
  - Import a `mobs.json` file with tolerant JSON5 parsing
  - Browse mobs by name, ID, level, faction, and AI type
  - Clone mobs, create blank mobs, edit runtime fields, and manage stat blocks
  - Live duplicate-ID alerts plus validation for invalid JSON blocks
  - Download the updated `mobs.json`, copy the full file JSON, or copy the current mob JSON
- Merchant Lab:
  - Import or paste `merchant_profiles.json`
  - Create, clone, delete, and validate merchant profiles with unique profile IDs
  - Add authoring-only `name` and `description` metadata for management notes while keeping `id` as the primary identifier
  - Browse the live console item/mod catalog with filters for rarity, level range, slot, type, and class restriction
  - Click catalog entries to attach them to the selected merchant profile
  - Preview item and mod offerings in a storefront-style layout with remove actions
  - Download the updated `merchant_profiles.json`, copy the full file JSON, or copy just the selected profile JSON
- Comms Manager:
  - Import or paste the comms JSON object map with tolerant JSON parsing
  - Create, clone, delete, and validate unique contact IDs
  - Edit contact name, portrait, greeting, dialog lines, and authoring-only `meta.notes`
  - Use `res://assets/comms/temp.png` automatically whenever the portrait field is blank
  - Download the updated JSON, copy the full file JSON, or copy just the selected contact entry
- Settings:
  - Import the full `/assets` folder once and let the console resolve uploaded images from that shared asset workspace
  - Reuse that shared uploaded asset library automatically for items, mods, merchant previews, comms portraits, mission headers, and mob image previews
  - Import a shared `data.zip` or unzipped `/data` folder once and let the console populate mods, items, mobs, abilities, comms, merchant profile data, map data, routes, tutorial data, and systems JSON from that shared workspace
  - Import a shared missions zip or missions folder once and let the console populate Mission Explorer, Mission Lab, Mission Creator, and dashboard mission summaries from that shared workspace
- Data:
  - Use the shared uploaded `/data` workspace from Settings to manage map POIs, map regions, trade routes, NPC traffic, tutorial entries, tutorial triggers, ship stat descriptions, zones, stages, and hazard barrier profiles
  - Create, clone, edit, delete, copy, and download the runtime JSON for each dataset without touching the Godot repo directly
- Mission Lab:
  - Import a missions zip or a selected missions folder once from the Missions dashboard, then reuse that shared workspace across Mission Explorer, Mission Lab, and Mission Creator
  - Tolerant mission parsing with per-file diagnostics for trailing commas, control-character cleanup, and parse failures
  - Shared Browser + Map filters for folder, category, arc, tag, faction, class, level range, mode, objective type, prerequisites, and repeatable state
  - Prerequisite graph view and focused top-to-bottom chain cards
  - Read-only mission detail drawer with step/objective structure, rewards, descriptions, conversations summary, and source path
- Authoring Workspace:
  - Seed or import mod drafts, edit them live, and export `Mods.json`
  - Bulk create titled mod batches from a shared template
  - Auto-generate mods from the slot/role affinity config with count, slot pool, level range, rarity, role pool, and ability-pool controls
  - Preserve authoring-only generation debug metadata on generated drafts without changing the exported game JSON
- Holes report (band × slot × rarity, colored, total, required=10 by default)
- Outliers report with z-score explanation

## Mission Lab Usage
1. Open `/settings` from the top navigation.
2. Import either:
   - a missions `.zip`, or
   - a missions folder selected in the browser via the folder picker.
3. Open `/missions/explorer` to browse the imported shared mission workspace.
4. Open `/missions/lab` to use the shared Browser, Map, and Diagnostics views.
5. Open `/missions/creator` to seed mission drafts from the same imported workspace.
6. In Mission Lab, use the Browser tab to search, sort, filter, and open mission details.
7. Use the Map tab for:
   - the full filtered prerequisite graph, or
   - a focused top-to-bottom chain view for the selected mission.
8. Use Diagnostics to review:
   - successful imports,
   - files imported with warnings,
   - files that failed tolerant parsing,
   - strict JSON-invalid files,
   - duplicate IDs,
   - missing prerequisite targets,
   - placeholder arcs/tags,
   - graph cycles.

Mission Lab is read-only and uses the same shared uploaded mission workspace that powers the other mission pages until cleared in Settings.

## Mob Lab Usage
1. Open `/mob-lab` from the top navigation.
2. Either:
   - import an existing `mobs.json` file, or
   - start a blank workspace for new mob creation.
   If shared uploaded data is active in Settings and includes `data/database/mobs/mobs.json`, Mob Lab auto-seeds from that file on first load.
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

## Merchant Lab Usage
1. Open `/merchant-lab` from the top navigation.
2. Either:
   - import an existing `merchant_profiles.json` file,
   - paste the JSON contents and load them, or
   - start a blank workspace.
   If shared uploaded data is active in Settings and includes `data/database/vendor/merchant_profiles.json`, Merchant Lab auto-seeds from that file on first load.
3. Use the left sidebar to:
   - search and switch merchant profiles,
   - create or clone profiles,
   - manage authoring-only profile name and description metadata,
   - browse the current item/mod catalog,
   - filter products by rarity, level range, slot, type, and class restriction.
4. Click an item or mod in the catalog browser to attach it to the selected merchant profile.
5. Use the storefront preview to review offerings and remove attached products.
6. Export the workspace by:
   - downloading `merchant_profiles.json`,
   - copying the whole updated file JSON, or
   - copying only the currently selected profile JSON.

Merchant Lab is isolated from the console’s existing read-only item/mod explorers and from the separate mission/mob tools.

## Comms Manager Usage
1. Open `/comms` from the top navigation.
2. Either:
   - import an existing comms JSON file,
   - paste the JSON contents and let it auto-load, or
   - start a blank workspace.
   If shared uploaded data is active in Settings and includes `data/database/comms/Comms.json`, Comms Manager auto-seeds from that file on first load.
3. Use the left sidebar to search and switch contacts, create new ones, or clone/delete the selected contact.
4. Edit the selected contact’s:
   - unique contact ID
   - name
   - portrait path
   - greeting
   - dialog lines
   - authoring notes stored in `meta.notes`
5. Use the export actions to:
   - download the updated comms JSON,
   - copy the whole updated file JSON, or
   - copy only the current contact entry JSON.

Comms Manager is isolated from the existing mission, merchant, mob, and mod tools.

## Data Tools Usage
1. Open `/data` from the top navigation.
2. Import a shared `data.zip` or `/data` folder once in `/settings`.
3. Open the grouped editors:
   - `/data/map` for `poi.json` and `regions.json`
   - `/data/routes` for `trade_routes.json` and `npc_traffic.json`
   - `/data/tutorial` for `info_entries.json` and `info_triggers.json`
   - `/data/systems` for `ShipStatDescriptions.json`, `Zones.json`, `Stages.json`, and `HazardBarrierProfiles.json`
4. Each editor auto-loads from the shared uploaded data workspace when the corresponding file exists.
5. Use the library sidebar in each tool to create, clone, delete, and select records.
6. Use the export actions to copy or download the updated runtime JSON for the active dataset.

## Mod Auto Generator Usage
1. Open `/mods/builder`.
2. Click `Auto Generate`.
3. Choose:
   - batch count,
   - rarity,
   - level min/max,
   - allowed slot pool,
   - allowed role/class pool,
   - optional ability pool from the loaded console abilities list.
4. Generate the batch. Each new draft:
   - keeps the normal mod export shape,
   - uses the existing level/rarity stat budget system for final values,
   - stores authoring-only generation debug metadata for the selected role, slot, primary stat, secondary stats, ability picks, threat sign, and final rolled values.

The auto generator is data-driven from `lib/mod-auto-generator-config.json`, so future balance tuning can be done in config without rewriting the generation logic.

## Config
See `config.json` for level bands, thresholds, rarity labels, and weights.

## Notes for CODEX
Some JSON copy functions begin with a leading comma, which makes the clipboard contents invalid as standalone JSON—THIS IS INTENTIONAL AND NOT A BUG, EVEIDENCED BY THE FACT THIS MESSAGE IS IN ALL CAPS. 
