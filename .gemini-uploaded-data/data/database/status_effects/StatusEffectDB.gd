# File: res://data/database/status_effects/StatusEffectDB.gd
extends Node
class_name StatusEffectDatabase

# JSON-backed status effects.
# Keep the autoload name as "StatusEffectDB" to avoid collisions with this class_name.
# Data lives in: res://data/database/status_effects/json/

var _effects: Dictionary = {}        # id:int -> effect Resource (instantiated)
var _index: Dictionary = {}          # id:int -> json_path:String
var _script_to_id: Dictionary = {}   # script_path:String -> id:int
var _json_dir: String = "res://data/database/status_effects/json"

# Back-compat alias (mirrors AbilityDB.ABILITIES pattern)
var EFFECTS: Dictionary = {}         # will alias _effects in _ready()

func _ready() -> void:
	# Load explicit index if present, else discover files.
	var index_path: String = _json_dir + "/_StatusEffectIndex.json"
	if FileAccess.file_exists(index_path):
		var f: FileAccess = FileAccess.open(index_path, FileAccess.READ)
		if f != null:
			var txt: String = f.get_as_text()
			f.close()
			var parsed: Variant = JSON.parse_string(txt)
			if typeof(parsed) == TYPE_DICTIONARY:
				_index.clear()
				var keys: Array = (parsed as Dictionary).keys()
				for k in keys:
					var id_val: int = int(k)
					var rel: String = String((parsed as Dictionary)[k])
					_index[id_val] = rel
	else:
		_discover_json_files()

	_build_script_index()

	# Alias for back-compat
	EFFECTS = _effects

	# Optional preload all (kept lazy by default):
	# for id_val in get_all_ids():
	# 	var vid: int = int(id_val)
	# 	var res: Resource = get_by_id(vid)
	# 	if res == null:
	# 		pass

# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

func get_by_id(id: int) -> Resource:
	return get_effect(id)

func get_effect(id: int) -> Resource:
	if _effects.has(id):
		return _effects[id]
	if _index.has(id) == false:
		return null
	var json_path: String = String(_index[id])
	var res: Resource = _load_effect_from_json(json_path, id)
	if res != null:
		_effects[id] = res
	return res

func get_all_ids() -> Array:
	var out: Array = []
	var keys: Array = _index.keys()
	for k in keys:
		out.append(int(k))
	return out

func get_tid_for(effect: Resource) -> int:
	if effect == null:
		return -1
	# 1) metadata
	if effect.has_meta("_id"):
		var meta_id: Variant = effect.get_meta("_id")
		if typeof(meta_id) == TYPE_INT:
			return int(meta_id)
	# 2) identity in cache
	var keys_cache: Array = _effects.keys()
	for k in keys_cache:
		var kid: int = int(k)
		if _effects[kid] == effect:
			return kid
	# 3) script path
	var sc: Script = effect.get_script() as Script
	if sc != null:
		var sp: String = sc.resource_path
		if sp != "" and _script_to_id.has(sp):
			return int(_script_to_id[sp])
	return -1

# ─────────────────────────────────────────────────────────────────────────────
# Internals
# ─────────────────────────────────────────────────────────────────────────────

func _discover_json_files() -> void:
	_index.clear()
	var dir: DirAccess = DirAccess.open(_json_dir)
	if dir == null:
		return
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
			var f: FileAccess = FileAccess.open(abs_path, FileAccess.READ)
			if f != null:
				var txt: String = f.get_as_text()
				f.close()
				var data_var: Variant = JSON.parse_string(txt)
				if typeof(data_var) == TYPE_DICTIONARY:
					var data: Dictionary = data_var as Dictionary
					var script_path: String = String(data.get("script", ""))
					if script_path != "":
						_script_to_id[script_path] = id_val

func _load_effect_from_json(json_path: String, id: int) -> Resource:
	var abs_path: String = json_path
	if json_path.begins_with("res://") == false:
		abs_path = "res://" + json_path
	if FileAccess.file_exists(abs_path) == false:
		return null
	var f: FileAccess = FileAccess.open(abs_path, FileAccess.READ)
	if f == null:
		return null
	var txt: String = f.get_as_text()
	f.close()
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

	var effect: Resource = script_res.new()
	# Embed numeric id for reliable reverse lookup
	effect.set_meta("_id", id)

	# Apply JSON properties
	var props_var: Variant = data.get("properties", {})
	if typeof(props_var) == TYPE_DICTIONARY:
		var props: Dictionary = props_var as Dictionary
		var keys: Array = props.keys()
		for key_var in keys:
			var key: String = String(key_var)
			var raw_val: Variant = props[key]
			var coerced: Variant = _coerce_value(raw_val)
			if effect.has_method("set"):
				var can_set: bool = false
				var plist: Array = effect.get_property_list()
				for p_var in plist:
					var p: Dictionary = p_var
					if p.has("name"):
						var pname: String = String(p["name"])
						if pname == key:
							can_set = true
							break
				if can_set:
					effect.set(key, coerced)
				else:
					# Missing property on the script; ignore gracefully
					pass
	return effect

func _coerce_value(v: Variant) -> Variant:
	var t: int = typeof(v)
	if t == TYPE_STRING:
		var s: String = String(v)
		if s.begins_with("res://"):
			if ResourceLoader.exists(s):
				var r: Resource = load(s)
				if r != null:
					return r
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
			arr.append(_coerce_value(item))
		return arr
	return v
