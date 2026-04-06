# File: res://data/database/abilities/AbilityRegistry.gd
extends Node
class_name AbilityRegistry

# Lazy cache for instantiated abilities (id -> ability Resource)
var ability_map: Dictionary = {}

var _json_dir: String = "res://data/database/abilities/json"
var _ids_cache: Array = []

func _ready() -> void:
	# Build ID cache from AbilityDB (preferred) or discover from JSON dir.
	_ids_cache = _discover_ids()

func get_ability(id: int) -> Resource:
	# Return from local cache if already loaded
	if ability_map.has(id):
		return ability_map[id]
	# Delegate to AbilityDB (JSON-backed) via autoload instance
	var adb: AbilityDB = _get_abilitydb()
	if adb != null:
		var res: Resource = adb.get_ability(id)
		if res != null:
			ability_map[id] = res
			return res
	return null

func get_all_ids() -> Array:
	# Return a copy to avoid callers mutating our cache
	var out: Array = []
	for v in _ids_cache:
		out.append(v)
	return out

# ─────────────────────────────────────────────────────────────────────────────
# Internals
# ─────────────────────────────────────────────────────────────────────────────
func _get_abilitydb() -> AbilityDB:
	var n: Node = get_node_or_null("/root/AbilitiesDB")
	if n != null and n is AbilityDB:
		return n as AbilityDB
	return null

func _discover_ids() -> Array:
	# Prefer AbilityDB if it exposes get_all_ids(); else scan JSON directory.
	var ids: Array = []
	var adb: AbilityDB = _get_abilitydb()
	if adb != null and adb.has_method("get_all_ids"):
		var got: Array = adb.get_all_ids()
		for x in got:
			ids.append(int(x))
		return ids

	# Fallback: discover NNN_*.json files and derive IDs
	var dir: DirAccess = DirAccess.open(_json_dir)
	if dir == null:
		return ids
	dir.list_dir_begin()
	while true:
		var fn: String = dir.get_next()
		if fn == "":
			break
		if dir.current_is_dir():
			continue
		if fn.ends_with(".json") and fn.begins_with("_") == false:
			var parts: PackedStringArray = fn.split("_", false, 1)
			if parts.size() >= 1 and String(parts[0]).is_valid_int():
				ids.append(int(parts[0]))
	dir.list_dir_end()
	return ids
