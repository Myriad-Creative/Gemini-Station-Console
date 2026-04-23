# Environmental Elements System Spec

## Purpose

This document defines a new data-driven subsystem for sector-scoped worldbuilding content that should not be authored directly inside individual `.tscn` location scenes.

The first required use cases are:

- authoring `HazardBarrier2D` content from the console map
- authoring large filled environmental regions such as nebula clouds, gas pockets, debris fields, and radiation pools

Required barrier workflow:

- draw barrier paths visually on the system map
- assign a hazard barrier profile
- adjust width and visual multipliers
- save to a data file
- have the game spawn that barrier automatically when the sector loads

Required region workflow:

- draw polygon or ellipse-style regions visually on the system map
- assign a visual profile
- optionally assign a status effect or hazard behavior
- support regions that are very large, including roughly half-sector scale
- save to a data file
- have the game spawn that region automatically when the sector loads

This system should be designed to support future environment content as well:

- hazard barriers
- filled environmental regions
- debris walls
- asteroid/debris/gas environmental strips
- future stage-driven decorative environment placements

The core goal is to move this class of content out of hand-authored scene files and into a sector-level data model.

## Why This Should Exist

### Current architecture

Zones are already data-driven and sector-scoped:

- `Zone.gd` is a runtime `Node2D` that reads its data from `ZoneDB`
- `SectorLoader.gd` loads a sector and then attaches zones for that sector
- zone contents such as stages and mob spawns are read from `Zones.json`

Relevant runtime references:

- `res://scripts/system/sectors/SectorLoader.gd`
- `res://scripts/system/environment/Zone.gd`
- `res://data/database/zones/Zones.json`

Barrier fields are not using that model today. They are authored directly inside scenes as `HazardBarrier2D` instances with embedded `Curve2D` resources.

Examples:

- `res://scenes/world/tutorial/tutorial.tscn`
- `res://scenes/entities/Terran/Venture/Venture_loc.tscn`
- `res://scenes/entities/Ceres/Ceres_Mining_Outpost/Ceres_Mining_Outpost_loc.tscn`

That is workable for handcrafted scenes, but it is a poor fit for console-driven worldbuilding because:

- the source of truth is scene text, not JSON data
- editing requires patching `.tscn` subresources and child nodes
- sector-level placement cannot be managed cleanly from the map
- the data is harder to inspect, validate, and bulk-edit

### Desired architecture

Environmental elements should work the same way zones work:

- sector-scoped
- data-driven
- spawned at runtime by the sector loader
- editable from the console map
- saved into a dedicated JSON file

## Scope

### Phase 1

Implement a new subsystem for **sector-scoped environmental elements**, with the first supported element type:

- `hazard_barrier`
- `environment_region`

### Phase 2

Extend the same system to support other element types, for example:

- `stage_instance`
- `stage_scatter`
- `visual_debris_field`
- `visual_gas_field`

Phase 1 does not need to solve all future types. It only needs to avoid painting us into a corner.

## Proposed Data File

Create a new file:

- `res://data/database/environment/EnvironmentalElements.json`

This file should be the source of truth for sector-level environmental content authored from the console.

## Proposed JSON Shape

Use a flat array with explicit `sector_id` on each entry.

This is preferable to nesting by sector because:

- it is easier to edit in the console
- each element can have a stable `id`
- filtering, validation, and diffing are simpler
- the DB layer can still build a sector index in memory

### Top-level structure

```json
{
  "version": 1,
  "elements": [
    {
      "id": "tutorial_barrier_01",
      "type": "hazard_barrier",
      "name": "Tutorial Debris Wall",
      "active": true,
      "sector_id": [0, 0],
      "tags": ["tutorial", "asteroid", "barrier"],
      "notes": "Blocks the tutorial exit lane.",
      "data": {
        "profile_id": "asteroid_debris_wall",
        "band_width": 1200,
        "closed_loop": false,
        "points": [
          [-42000, -18000],
          [-12000, -12000],
          [9000, -8000],
          [28000, -15000]
        ],
        "visual_width_multiplier": 2.69,
        "visual_density_multiplier": 1.52,
        "visual_scale_multiplier": 1.0,
        "visual_alpha_multiplier": 1.38
      }
    },
    {
      "id": "minor_nebula_region_01",
      "type": "environment_region",
      "name": "Minor Nebula Cloud",
      "active": true,
      "sector_id": [1, 0],
      "tags": ["nebula", "gas", "cloud"],
      "notes": "Large yellow nebula cloud that slows and obscures the player.",
      "data": {
        "profile_id": "neb_minor_yellow",
        "shape": "polygon",
        "points": [
          [-28000, -12000],
          [-12000, -22000],
          [14000, -18000],
          [26000, 2000],
          [8000, 18000],
          [-18000, 12000]
        ],
        "status_effect_id": 103,
        "remove_effect_on_exit": true,
        "affect_players": true,
        "affect_npcs": true,
        "visual_density_multiplier": 1.4,
        "visual_scale_multiplier": 1.2,
        "visual_alpha_multiplier": 0.85
      }
    }
  ]
}
```

## Required Element Fields

Every element should support these common fields:

```json
{
  "id": "string",
  "type": "string",
  "name": "string",
  "active": true,
  "sector_id": [0, 0],
  "tags": [],
  "notes": "",
  "data": {}
}
```

### Field definitions

- `id`
  - unique across the file
  - stable identifier used by the console and save logic
- `type`
  - identifies the element handler
  - phase 1 requires `hazard_barrier` and `environment_region`
- `name`
  - editor-facing display name
  - not required by runtime logic, but important for tooling
- `active`
  - if `false`, element is skipped by the runtime spawner
- `sector_id`
  - sector coordinates as `[x, y]`
  - sector-local placement is derived from `data`
- `tags`
  - optional editor-facing categorization
- `notes`
  - optional editor-facing author notes
- `data`
  - type-specific payload

## Hazard Barrier Element Schema

For `type = "hazard_barrier"`, `data` should use this shape:

```json
{
  "profile_id": "asteroid_debris_wall",
  "band_width": 1200,
  "closed_loop": false,
  "points": [
    [-42000, -18000],
    [-12000, -12000],
    [9000, -8000],
    [28000, -15000]
  ],
  "visual_width_multiplier": 2.69,
  "visual_density_multiplier": 1.52,
  "visual_scale_multiplier": 1.0,
  "visual_alpha_multiplier": 1.38,
  "use_profile_blocker_width_ratio": true,
  "blocker_width_ratio": 0.58,
  "status_effect_id": -1,
  "remove_effect_on_exit": true,
  "affect_players": true,
  "affect_npcs": true
}
```

### Required hazard barrier fields

- `profile_id`
  - maps directly to `HazardBarrier2D.barrier_profile_id`
  - should resolve via `HazardBarrierProfilesDB`
- `band_width`
  - maps directly to `HazardBarrier2D.band_width`
- `points`
  - ordered array of **sector-local anchor points**
  - these are not relative to a separate origin
  - these are not world coordinates
  - these are local coordinates within the sector node

### Optional hazard barrier fields

- `closed_loop`
  - maps to `HazardBarrier2D.closed_loop`
- `visual_width_multiplier`
- `visual_density_multiplier`
- `visual_scale_multiplier`
- `visual_alpha_multiplier`
- `use_profile_blocker_width_ratio`
- `blocker_width_ratio`
- `status_effect_id`
- `remove_effect_on_exit`
- `affect_players`
- `affect_npcs`

These optional fields should default to the current `HazardBarrier2D` defaults if missing.

## Environment Region Element Schema

`environment_region` is the correct element type for large filled areas rather than line-like strips. This is the type to use for:

- nebula clouds
- gas fields
- radiation zones
- debris pools
- sensor-disruption fields
- any other area effect that behaves like a region instead of a wall

An `environment_region` is a filled shape, not a band around a path.

### Region shape models

Phase 1 should support these region shapes:

- `polygon`
- `ellipse`

Optional later additions:

- `circle`
- `rect`

### Polygon example

```json
{
  "profile_id": "neb_minor_yellow",
  "shape": "polygon",
  "points": [
    [-28000, -12000],
    [-12000, -22000],
    [14000, -18000],
    [26000, 2000],
    [8000, 18000],
    [-18000, 12000]
  ],
  "status_effect_id": 103,
  "remove_effect_on_exit": true,
  "affect_players": true,
  "affect_npcs": true,
  "visual_density_multiplier": 1.4,
  "visual_scale_multiplier": 1.2,
  "visual_alpha_multiplier": 0.85
}
```

### Ellipse example

```json
{
  "profile_id": "neb_minor_yellow",
  "shape": "ellipse",
  "center": [0, 0],
  "width": 90000,
  "height": 50000,
  "rotation_deg": 18,
  "status_effect_id": 103,
  "remove_effect_on_exit": true,
  "affect_players": true,
  "affect_npcs": true,
  "visual_density_multiplier": 1.25,
  "visual_scale_multiplier": 1.1,
  "visual_alpha_multiplier": 0.75
}
```

### Required environment region fields

- `profile_id`
  - visual/material profile to use for the region
  - this should resolve through the existing environment profile system
  - for nebula/gas/debris visuals, a stage-style visual profile is likely the best fit
- `shape`
  - required
  - phase 1 valid values: `polygon`, `ellipse`

For `shape = "polygon"`:

- `points`
  - required
  - ordered array of **sector-local points**
  - minimum `3` points

For `shape = "ellipse"`:

- `center`
  - required
  - sector-local center point
- `width`
  - required
  - full ellipse width, not radius
- `height`
  - required
  - full ellipse height, not radius
- `rotation_deg`
  - optional

### Optional environment region fields

- `status_effect_id`
  - recommended default: `0`
  - `0` means no status effect
  - positive integer means apply that effect while inside the region
- `remove_effect_on_exit`
- `affect_players`
- `affect_npcs`
- `visual_density_multiplier`
- `visual_scale_multiplier`
- `visual_alpha_multiplier`
- `visual_width_multiplier`
  - optional if the rendering model uses profile width as part of scatter sizing
- `priority`
  - optional future hook if overlapping regions need explicit resolution

### Design intent for large regions

The system should explicitly support large environment regions, including:

- small local clouds
- multi-zone fields
- regions occupying roughly half a sector
- regions approaching full-sector scale

Do not treat “large” as invalid by default. Large regions are a valid worldbuilding use case.

## Coordinate Rules

This must be explicit so the console and game match.

### Sector position model

Environmental elements are **sector-scoped**.

- `sector_id` determines which sector node receives the element
- `points` are in **sector-local space**
- runtime world position is derived automatically because the sector node already has the correct world offset

This matches how sectors are positioned in `SectorLoader.gd`:

- sector node position = `Vector2(sector_id.x, sector_id.y) * SECTOR_SIZE`

### Why points should be sector-local

For barriers, storing a separate origin plus local offsets is unnecessary complexity.

Using sector-local anchor points directly is better because:

- it matches the console map model naturally
- dragging a point only changes that point
- dragging the whole barrier can be implemented by offsetting all points
- no extra transform layer is needed at runtime

### Large-region policy

Environmental regions should also use sector-local coordinates.

Important rules:

- region data should not be artificially clamped to a small authoring radius
- a half-sector region is a valid shape
- a region may extend beyond the exact visual footprint of a sector if authored that way
- validation should warn only for clearly absurd values, not for intentionally large shapes

Recommended validation threshold:

- do not warn for sizes up to full-sector scale
- only warn when extents exceed a clearly suspicious threshold such as `2x` sector size

## Runtime Game-Side Responsibilities

This is the part the game-side coder needs to implement.

### 1. Create a DB/service layer

Add:

- `res://scripts/system/environment/EnvironmentalElementsDB.gd`

This should follow the same general pattern as `HazardBarrierProfilesDB.gd` and `ZoneDB`.

Responsibilities:

- load `res://data/database/environment/EnvironmentalElements.json`
- validate the root shape
- expose lookup helpers
- build a sector index in memory
- return active elements for a sector

### Recommended API

```gdscript
extends RefCounted
class_name EnvironmentalElementsDB

const DB_PATH: String = "res://data/database/environment/EnvironmentalElements.json"

static func reload() -> void
static func has_element(element_id: String) -> bool
static func get_element(element_id: String) -> Dictionary
static func get_elements_for_sector(sector_id: Vector2i) -> Array[Dictionary]
static func get_all_elements() -> Array[Dictionary]
```

### 2. Add a sector attach hook

In `res://scripts/system/sectors/SectorLoader.gd`, add a new hook immediately after zones are attached:

Current order:

1. instantiate sector
2. `_attach_zones_for_sector(...)`
3. `AsteroidBelt.ensure_belt_chunk_for_sector(...)`
4. `Sun.ensure_sun_for_sector(...)`

Recommended order:

1. instantiate sector
2. `_attach_zones_for_sector(...)`
3. `_attach_environmental_elements_for_sector(...)`
4. `AsteroidBelt.ensure_belt_chunk_for_sector(...)`
5. `Sun.ensure_sun_for_sector(...)`

Suggested function:

```gdscript
func _attach_environmental_elements_for_sector(sector_instance: Node2D, sector_id: Vector2i) -> void:
```

This should:

- create a holder node named `EnvironmentalElements` if absent
- query `EnvironmentalElementsDB.get_elements_for_sector(sector_id)`
- instantiate each active element into that holder

### 3. Add an element spawner helper

Add:

- `res://scripts/system/environment/EnvironmentalElementSpawner.gd`

Responsibilities:

- take one element dictionary
- instantiate the correct runtime scene/node based on `type`
- apply common and type-specific fields
- return the spawned node

Recommended API:

```gdscript
extends RefCounted
class_name EnvironmentalElementSpawner

static func spawn_into_sector(parent: Node2D, element_cfg: Dictionary) -> Node
```

Internally:

- read `type`
- dispatch to a type-specific builder

For phase 1:

```gdscript
match type:
    "hazard_barrier":
        return _spawn_hazard_barrier(parent, element_cfg)
    "environment_region":
        return _spawn_environment_region(parent, element_cfg)
    _:
        push_warning(...)
        return null
```

### 4. Hazard barrier spawn behavior

For `hazard_barrier`:

- instantiate `res://scripts/system/environment/HazardBarrier2D.tscn`
- set the node name to something stable, for example:
  - `EnvHazardBarrier_<element_id>`
- assign exported properties from `data`
- build a fresh `Curve2D`
- assign the curve to the barrier’s child `Path2D`
- call `rebuild_from_path()`

### Recommended runtime implementation

```gdscript
static func _spawn_hazard_barrier(parent: Node2D, element_cfg: Dictionary) -> Node2D:
    var data: Dictionary = element_cfg.get("data", {})
    var barrier_scene: PackedScene = load("res://scripts/system/environment/HazardBarrier2D.tscn")
    var barrier: HazardBarrier2D = barrier_scene.instantiate() as HazardBarrier2D
    if barrier == null:
        push_warning("[EnvironmentalElementSpawner] Could not instantiate HazardBarrier2D.")
        return null

    var element_id: String = String(element_cfg.get("id", "")).strip_edges()
    barrier.name = "EnvHazardBarrier_%s" % element_id
    parent.add_child(barrier)

    barrier.barrier_profile_id = String(data.get("profile_id", "wreck_plasma_orange")).strip_edges()
    barrier.band_width = float(data.get("band_width", 480.0))
    barrier.closed_loop = bool(data.get("closed_loop", false))
    barrier.visual_width_multiplier = float(data.get("visual_width_multiplier", 1.0))
    barrier.visual_density_multiplier = float(data.get("visual_density_multiplier", 1.0))
    barrier.visual_scale_multiplier = float(data.get("visual_scale_multiplier", 1.0))
    barrier.visual_alpha_multiplier = float(data.get("visual_alpha_multiplier", 1.0))
    barrier.use_profile_blocker_width_ratio = bool(data.get("use_profile_blocker_width_ratio", true))
    barrier.blocker_width_ratio = float(data.get("blocker_width_ratio", 0.58))
    barrier.status_effect_id = int(data.get("status_effect_id", -1))
    barrier.remove_effect_on_exit = bool(data.get("remove_effect_on_exit", true))
    barrier.affect_players = bool(data.get("affect_players", true))
    barrier.affect_npcs = bool(data.get("affect_npcs", true))

    var path: Path2D = barrier.get_node_or_null("Path2D") as Path2D
    if path == null:
        push_warning("[EnvironmentalElementSpawner] Hazard barrier '%s' is missing Path2D." % element_id)
        return barrier

    var curve := Curve2D.new()
    var points_value: Variant = data.get("points", [])
    if typeof(points_value) == TYPE_ARRAY:
        for point_value: Variant in points_value:
            if typeof(point_value) == TYPE_ARRAY:
                var point_array: Array = point_value as Array
                if point_array.size() >= 2:
                    curve.add_point(Vector2(float(point_array[0]), float(point_array[1])))

    path.curve = curve
    barrier.rebuild_from_path()
    return barrier
```

### Important runtime note

`HazardBarrier2D` already supports runtime rebuilding from its `Path2D`:

- `_ensure_curve()`
- `rebuild_from_path()`

That means this system does **not** need to generate scene subresources or patch `.tscn` text in order to work at runtime.

### 5. Add a runtime region scene

Add:

- `res://scripts/system/environment/EnvironmentalRegion2D.tscn`
- `res://scripts/system/environment/EnvironmentalRegion2D.gd`

This should be the runtime node used for `environment_region`.

### Recommended runtime responsibilities for `EnvironmentalRegion2D`

At minimum, this node should:

- create or manage an `Area2D` for overlap detection
- generate a `CollisionPolygon2D` that matches the region shape
- render a filled region visual
- optionally scatter profile-based sprites/material quads inside the region footprint
- apply and remove status effects for bodies inside the region

This node should be conceptually similar to `HazardBarrier2D`, but region-based rather than path-band-based.

### Recommended node structure

```text
EnvironmentalRegion2D (Node2D)
  VisualRoot (Node2D)
    FillPolygon (Polygon2D or mesh-backed fill)
    EdgeOutline (optional Line2D or polygon outline)
    ScatterRoot (Node2D)
  HazardArea (Area2D)
    HazardCollision (CollisionPolygon2D)
```

### Recommended `EnvironmentalRegion2D` exports

```gdscript
@export var profile_id: String = ""
@export var shape_type: String = "polygon"
@export var closed_polygon: bool = true

@export var status_effect_id: int = 0
@export var remove_effect_on_exit: bool = true
@export var affect_players: bool = true
@export var affect_npcs: bool = true

@export_range(0.05, 4.0, 0.01) var visual_density_multiplier: float = 1.0
@export_range(0.10, 4.0, 0.01) var visual_scale_multiplier: float = 1.0
@export_range(0.05, 2.0, 0.01) var visual_alpha_multiplier: float = 1.0
```

### Recommended region-shape setup helpers

The script should provide methods like:

```gdscript
func set_polygon_points(points: PackedVector2Array) -> void
func set_ellipse(center: Vector2, width: float, height: float, rotation_deg: float = 0.0) -> void
func rebuild_region() -> void
```

### Recommended visual profile resolution for regions

For region visuals, the preferred source should be the same merged visual-profile system already used by hazard barriers:

- `HazardBarrierProfilesDB.get_merged_profile(profile_id)`

That keeps the console and game aligned around a single profile vocabulary and allows:

- direct barrier profile ids
- direct stage profile ids
- barrier profiles with `base_stage_profile`

For region rendering, the game-side coder should interpret the merged profile as a visual material definition rather than as proof that the region must behave like a barrier.

### Recommended `environment_region` spawn behavior

For `environment_region`:

- instantiate `EnvironmentalRegion2D.tscn`
- set the node name to something stable such as:
  - `EnvRegion_<element_id>`
- assign profile and effect fields
- build the region polygon from the requested shape
- call `rebuild_region()`

### Recommended runtime implementation

```gdscript
static func _spawn_environment_region(parent: Node2D, element_cfg: Dictionary) -> Node2D:
    var data: Dictionary = element_cfg.get("data", {})
    var region_scene: PackedScene = load("res://scripts/system/environment/EnvironmentalRegion2D.tscn")
    var region: Node2D = region_scene.instantiate() as Node2D
    if region == null:
        push_warning("[EnvironmentalElementSpawner] Could not instantiate EnvironmentalRegion2D.")
        return null

    var element_id: String = String(element_cfg.get("id", "")).strip_edges()
    region.name = "EnvRegion_%s" % element_id
    parent.add_child(region)

    region.profile_id = String(data.get("profile_id", "")).strip_edges()
    region.status_effect_id = int(data.get("status_effect_id", 0))
    region.remove_effect_on_exit = bool(data.get("remove_effect_on_exit", true))
    region.affect_players = bool(data.get("affect_players", true))
    region.affect_npcs = bool(data.get("affect_npcs", true))
    region.visual_density_multiplier = float(data.get("visual_density_multiplier", 1.0))
    region.visual_scale_multiplier = float(data.get("visual_scale_multiplier", 1.0))
    region.visual_alpha_multiplier = float(data.get("visual_alpha_multiplier", 1.0))

    var shape_type: String = String(data.get("shape", "polygon")).strip_edges().to_lower()
    match shape_type:
        "polygon":
            var polygon_points := PackedVector2Array()
            var points_value: Variant = data.get("points", [])
            if typeof(points_value) == TYPE_ARRAY:
                for point_value: Variant in points_value:
                    if typeof(point_value) == TYPE_ARRAY:
                        var point_array: Array = point_value as Array
                        if point_array.size() >= 2:
                            polygon_points.append(Vector2(float(point_array[0]), float(point_array[1])))
            region.set_polygon_points(polygon_points)
        "ellipse":
            var center_array: Array = data.get("center", [0, 0])
            var center := Vector2(float(center_array[0]), float(center_array[1]))
            var width := float(data.get("width", 1000.0))
            var height := float(data.get("height", 1000.0))
            var rotation_deg := float(data.get("rotation_deg", 0.0))
            region.set_ellipse(center, width, height, rotation_deg)
        _:
            push_warning("[EnvironmentalElementSpawner] Unsupported environment region shape '%s'." % shape_type)

    region.rebuild_region()
    return region
```

## Validation Rules

The DB/service layer should validate and warn clearly.

### Global rules

- root must be a dictionary
- `elements` must be an array
- every element must have a non-empty `id`
- `id` must be unique
- every element must have a non-empty `type`
- every element must have a valid `sector_id`

### Hazard barrier rules

- `profile_id` must be non-empty
- `profile_id` should resolve through `HazardBarrierProfilesDB`
- `band_width` must be greater than `0`
- `points` must contain at least `2` points
- every point must have finite numeric `x` and `y`

### Environment region rules

- `profile_id` must be non-empty
- `profile_id` should resolve through the merged environment-profile lookup
- `shape` must be a supported value

For `polygon`:

- `points` must contain at least `3` points
- every point must have finite numeric `x` and `y`

For `ellipse`:

- `center` must be present and valid
- `width` must be greater than `0`
- `height` must be greater than `0`

### Large-region validation policy

Do not emit warnings just because a region is large.

Warnings should be reserved for:

- invalid data
- unsupported shape types
- obviously suspicious extents

A region occupying half a sector is expected and valid.

### Console-facing warnings

The console should surface warnings for:

- duplicate IDs
- unknown profiles
- too few points
- invalid numeric fields
- unsupported region shapes
- elements placed outside a reasonable sector range, if desired

## Console Contract

The console-side coder will need the game-side data shape to remain stable.

### System map requirements

The system map should eventually support:

- rendering environmental elements separately from scene-authored barriers
- selecting an element
- dragging points
- dragging the whole barrier by offsetting all points
- creating a new barrier by clicking multiple points
- creating a polygon region by clicking multiple points
- creating an ellipse region by click-dragging bounds or entering width/height
- choosing a barrier profile from `HazardBarrierProfiles.json`
- changing `band_width`
- toggling `closed_loop`
- editing optional visual multipliers
- assigning an optional status effect to a region
- supporting large shapes without downscaling them into tiny local props
- saving changes into `EnvironmentalElements.json`

### Map payload recommendation

When the console map API is extended, environmental elements should be returned as their own top-level collection rather than mixed into `sceneBarriers`.

Recommended payload shape:

```ts
type SystemMapEnvironmentalElement = {
  id: string;
  type: string;
  name: string;
  active: boolean;
  sector: { x: number; y: number };
  tags: string[];
  notes: string;
  source: "environmental_elements";
  data: Record<string, unknown>;
};
```

For hazard barriers, the console can additionally expand a specialized view model:

```ts
type SystemMapEnvironmentalHazardBarrier = {
  id: string;
  type: "hazard_barrier";
  name: string;
  active: boolean;
  sector: { x: number; y: number };
  profileId: string;
  bandWidth: number;
  closedLoop: boolean;
  points: { x: number; y: number }[];
  visualWidthMultiplier: number;
  visualDensityMultiplier: number;
  visualScaleMultiplier: number;
  visualAlphaMultiplier: number;
  tags: string[];
  notes: string;
};
```

For regions, the console can expand a specialized view model:

```ts
type SystemMapEnvironmentalRegion = {
  id: string;
  type: "environment_region";
  name: string;
  active: boolean;
  sector: { x: number; y: number };
  profileId: string;
  shape: "polygon" | "ellipse";
  points?: { x: number; y: number }[];
  center?: { x: number; y: number };
  width?: number;
  height?: number;
  rotationDeg?: number;
  statusEffectId: number;
  removeEffectOnExit: boolean;
  affectPlayers: boolean;
  affectNpcs: boolean;
  visualDensityMultiplier: number;
  visualScaleMultiplier: number;
  visualAlphaMultiplier: number;
  tags: string[];
  notes: string;
};
```

### Region authoring expectations

The console should treat `environment_region` as a first-class visual editor tool, not as a secondary afterthought.

Recommended authoring tools:

- polygon draw mode
- ellipse draw mode
- vertex drag mode
- whole-region drag mode
- delete selected vertex
- insert vertex on polygon edge
- duplicate region
- assign profile
- assign status effect
- adjust multipliers
- toggle active/inactive

For the user’s stated workflow, the important requirement is that a large cloud-like region can be drawn directly on the map and saved without reducing it to a narrow curve.

## Coexistence With Existing Scene Barriers

This system should **not** break existing scene-authored barriers.

### Recommended behavior

- existing barriers inside scenes continue to work unchanged
- new sector-level barriers from `EnvironmentalElements.json` also spawn
- the map can display both
- the map should distinguish the source:
  - `scene`
  - `environmental_elements`

### Important policy decision

Do not silently migrate scene-authored barriers into the new system at runtime.

If migration is desired later, make it an explicit tool:

- “Convert scene barrier to environmental element”

That tool can copy:

- points
- profile
- width
- visual multipliers
- sector
- source scene path for reference

But migration should be explicit, not automatic.

## Recommended Phase Breakdown

### Phase 1: game-side foundation

Implement:

- `EnvironmentalElements.json`
- `EnvironmentalElementsDB.gd`
- `EnvironmentalElementSpawner.gd`
- `SectorLoader.gd` hook
- hazard barrier runtime spawning
- environment region runtime spawning

Goal:

- hand-authored test data in `EnvironmentalElements.json` spawns a visible `HazardBarrier2D` or `EnvironmentalRegion2D` in the correct sector

### Phase 2: console read/write

Implement:

- API route to load environmental elements
- API route to save environmental elements
- map rendering for environmental barriers
- map rendering for filled environmental regions
- editor UI for creating, selecting, dragging, deleting, and saving hazard barriers
- editor UI for creating, selecting, dragging, deleting, and saving environmental regions

Goal:

- draw a barrier or region in the console map, save it, reload the console, and see it persist

### Phase 3: migration helpers

Optional:

- inspect existing scene barriers
- export them into environmental elements
- optionally remove them from scenes after manual confirmation

## Example Minimal Test Data

Use this as the first test after the game-side loader exists:

```json
{
  "version": 1,
  "elements": [
    {
      "id": "test_hazard_barrier_01",
      "type": "hazard_barrier",
      "name": "Test Hazard Barrier",
      "active": true,
      "sector_id": [0, 0],
      "tags": ["test"],
      "notes": "Runtime smoke test barrier.",
      "data": {
        "profile_id": "asteroid_debris_wall",
        "band_width": 900,
        "closed_loop": false,
        "points": [
          [-15000, -5000],
          [-5000, 0],
          [6000, 3000],
          [18000, 8000]
        ]
      }
    },
    {
      "id": "test_nebula_region_01",
      "type": "environment_region",
      "name": "Test Nebula Region",
      "active": true,
      "sector_id": [0, 0],
      "tags": ["test", "nebula"],
      "notes": "Runtime smoke test region.",
      "data": {
        "profile_id": "neb_minor_yellow",
        "shape": "ellipse",
        "center": [25000, -10000],
        "width": 110000,
        "height": 60000,
        "rotation_deg": 12,
        "status_effect_id": 103,
        "remove_effect_on_exit": true,
        "affect_players": true,
        "affect_npcs": true
      }
    }
  ]
}
```

Expected result:

- when sector `(0, 0)` loads, the barrier appears
- the region appears as a filled cloud-like area
- its visuals match `asteroid_debris_wall`
- the region visuals match `neb_minor_yellow`
- the barrier collision/hazard behavior matches `HazardBarrier2D`
- the region applies its configured effect while inside the area
- unloading and reloading the sector re-creates it cleanly

## Final Recommendation

Do not build new barrier authoring on top of scene patching.

The correct long-term model is:

- **zones** = data-driven sector content
- **environmental elements** = data-driven sector environment content
- **scenes** = handcrafted special-case spaces and bespoke encounters

That gives the console a clean authoring surface and keeps the runtime aligned with the way sectors and zones already work.
