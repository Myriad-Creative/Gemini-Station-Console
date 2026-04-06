# File: res://data/database/abilities/AbilityDB.gd
extends Node
class_name AbilityDB

# Autoload is named "AbilitiesDB" in your project. That's fine; this is the class.

# JSON-backed ability definitions. Lazily instantiated and cached.
var _abilities: Dictionary = {}          # id:int -> Ability Resource
var _index: Dictionary = {}              # id:int -> json_path:String (res:// or relative)
var _script_to_id: Dictionary = {}       # script_path:String -> id:int
var _json_dir: String = "res://data/database/abilities/json"

# Back-compat alias for systems that still read AbilitiesDB.ABILITIES
var ABILITIES: Dictionary = {}           # will alias _abilities in _ready()

# File: res://data/database/abilities/AbilityDB.gd

func _ready() -> void:
	# Load index if present; if the index is missing OR invalid, fall back to discovery.
	var index_path: String = _json_dir + "/_AbilityIndex.json"
	var loaded_index: bool = false

	_index.clear()

	if FileAccess.file_exists(index_path):
		var file: FileAccess = FileAccess.open(index_path, FileAccess.READ)
		if file == null:
			push_warning("⚠️ AbilityDB: Could not open index: %s. Falling back to directory scan." % index_path)
		else:
			var txt: String = file.get_as_text()
			file.close()

			var parsed: Variant = JSON.parse_string(txt)
			if typeof(parsed) == TYPE_DICTIONARY:
				var dict: Dictionary = parsed as Dictionary
				var keys: Array = dict.keys()
				for k in keys:
					var id_val: int = int(k)
					var rel_path: String = String(dict[k])
					_index[id_val] = rel_path
				loaded_index = _index.size() > 0
			else:
				push_warning("⚠️ AbilityDB: Index JSON invalid: %s. Falling back to directory scan." % index_path)

	if loaded_index == false:
		# Discover JSON files by pattern NNN_*.json and derive ids
		var dir: DirAccess = DirAccess.open(_json_dir)
		if dir != null:
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
						var id_val: int = int(parts[0])
						_index[id_val] = _json_dir + "/" + fn
			dir.list_dir_end()
		else:
			push_warning("⚠️ AbilityDB: Could not open abilities JSON dir: %s" % _json_dir)

	# Build script_path -> id index for reverse lookup
	_build_script_index()

	# Back-compat: alias public ABILITIES dict to internal cache
	ABILITIES = _abilities

	# Preserve old behavior for DebugConsole "grant all": preload all into ABILITIES
	var ids: Array = get_all_ids()
	for id_val in ids:
		var v_id: int = int(id_val)
		var res: Resource = get_ability(v_id)
		if res == null:
			# Ignore missing entries gracefully
			pass


func get_ability(id: int) -> Resource:
	# Lazy-load ability resource from JSON, cache and return.
	if _abilities.has(id):
		return _abilities[id]
	if _index.has(id) == false:
		return null
	var json_path: String = String(_index[id])
	var res: Resource = _load_ability_from_json(json_path, id)
	if res != null:
		_abilities[id] = res
	return res

func get_tid_for(ability: Resource) -> int:
	# Robustly recover the numeric id for a given ability instance.
	if ability == null:
		return -1

	# 1) Preferred: embedded metadata from our loader
	if ability.has_meta("_id"):
		var meta_id: Variant = ability.get_meta("_id")
		if typeof(meta_id) == TYPE_INT:
			return int(meta_id)

	# 2) Identity in cache (in case the same instance)
	var keys_cache: Array = _abilities.keys()
	for k in keys_cache:
		var kid: int = int(k)
		if _abilities[kid] == ability:
			return kid

	# 3) Fallback by script resource path using prebuilt index
	var sc: Script = ability.get_script() as Script
	if sc != null:
		var sp: String = sc.resource_path
		if sp != "" and _script_to_id.has(sp):
			return int(_script_to_id[sp])

	# Not found
	return -1

func get_by_id(id: int) -> Resource:
	return get_ability(id)

func get_all_ids() -> Array:
	# Stable list of ids (ints)
	var out: Array = []
	var keys: Array = _index.keys()
	for k in keys:
		out.append(int(k))
	return out

# ─────────────────────────────────────────────────────────────────────────────
# Internals
# ─────────────────────────────────────────────────────────────────────────────

func _build_script_index() -> void:
	_script_to_id.clear()
	var keys: Array = _index.keys()
	for k in keys:
		var id_val: int = int(k)
		var rel_path: String = String(_index[id_val])
		var abs_path: String = rel_path
		if abs_path.begins_with("res://") == false:
			abs_path = "res://" + rel_path
		if FileAccess.file_exists(abs_path):
			var file: FileAccess = FileAccess.open(abs_path, FileAccess.READ)
			if file != null:
				var txt: String = file.get_as_text()
				file.close()
				var data_var: Variant = JSON.parse_string(txt)
				if typeof(data_var) == TYPE_DICTIONARY:
					var data: Dictionary = data_var as Dictionary
					var script_path: String = String(data.get("script", ""))
					if script_path != "":
						_script_to_id[script_path] = id_val

func _load_ability_from_json(json_path: String, id: int) -> Resource:
	var abs_path: String = json_path
	if json_path.begins_with("res://") == false:
		abs_path = "res://" + json_path
	if FileAccess.file_exists(abs_path) == false:
		return null
	var file: FileAccess = FileAccess.open(abs_path, FileAccess.READ)
	if file == null:
		return null
	var txt: String = file.get_as_text()
	file.close()
	var data_var: Variant = JSON.parse_string(txt)
	if typeof(data_var) != TYPE_DICTIONARY:
		return null
	var data: Dictionary = data_var as Dictionary
	var script_path: String = String(data.get("script", ""))
	if script_path == "":
		return null
	if ResourceLoader.exists(script_path) == false:
		return null
	var script_res: Script = load(script_path) as Script
	if script_res == null:
		return null
	var ability: Resource = script_res.new()

	# Embed numeric id for reliable reverse lookup
	if ability != null:
		ability.set_meta("_id", id)

	# Apply properties with coercion
	var props_var: Variant = data.get("properties", {})
	if typeof(props_var) == TYPE_DICTIONARY:
		var props: Dictionary = props_var as Dictionary
		var keys: Array = props.keys()
		for key_var in keys:
			var key: String = String(key_var)
			var raw_val: Variant = props[key]
			var coerced: Variant = _coerce_value(raw_val)
			if ability.has_method("set"):
				var can_set: bool = false
				var plist: Array = ability.get_property_list()
				for p_var in plist:
					var p: Dictionary = p_var
					if p.has("name"):
						var pname: String = String(p["name"])
						if pname == key:
							can_set = true
							break
				if can_set:
					ability.set(key, coerced)
				else:
					# Property missing on the script; ignore silently
					pass
	return ability

func _coerce_value(v: Variant) -> Variant:
	var t: int = typeof(v)
	if t == TYPE_STRING:
		var s: String = String(v)
		# Treat res:// paths as resources to load
		if s.begins_with("res://"):
			if ResourceLoader.exists(s):
				var res: Resource = load(s)
				if res != null:
					return res
			return s
		return s
	if t == TYPE_DICTIONARY:
		var vin: Dictionary = v as Dictionary
		var out: Dictionary = {}
		var keys: Array = vin.keys()
		for k in keys:
			out[k] = _coerce_value(vin[k])
		return out
	if t == TYPE_ARRAY:
		var arr_in: Array = v as Array
		var arr: Array = []
		for item in arr_in:
			var coerced_item: Variant = _coerce_value(item)
			arr.append(coerced_item)
		return arr
	# Numbers, bools, null flow through
	return v
