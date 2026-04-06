extends Node
class_name PlayerReputation


const DEFAULT_LOCAL_OWNER_ID: String = "player_local"
const MIN_REPUTATION_POINTS: int = -50000
const MAX_REPUTATION_POINTS: int = 100000

const DEFAULT_FACTION_POINTS: Dictionary = {
	"Terran": 60000,
	"Martian": -18000,
	"JayCo": 52000,
	"Gemini Station": 0,
	"Eris": -35000,
	"Sedna": 13000,
	"Ceres": -8000,
	"Black Dawn": -25000,
	"SMAP": 100000,
	"Mob": -50000
}


# Legacy local-owner cache kept for backward compatibility.
var faction_points: Dictionary = DEFAULT_FACTION_POINTS.duplicate(true)

# owner_id -> Dictionary[faction_name: String, points: int]
var _states: Dictionary = {}


func _ready() -> void:
	_connect_session_signals()
	_connect_player_context_registry_signals()

	var default_owner_id: String = _resolve_default_owner_id()
	_ensure_state_for_owner(default_owner_id)
	_sync_local_cache()


func get_points(faction: String) -> int:
	var default_owner_id: String = _resolve_default_owner_id()
	return get_points_for_owner(default_owner_id, faction)


func get_points_for_owner(owner_id: String, faction: String) -> int:
	var resolved_owner_id: String = _resolve_owner_id(owner_id)
	var trimmed_faction: String = faction.strip_edges()
	if trimmed_faction == "":
		return 0

	var state: Dictionary = _ensure_state_for_owner(resolved_owner_id)
	return int(state.get(trimmed_faction, 0))


func set_points(faction: String, points: int) -> void:
	var default_owner_id: String = _resolve_default_owner_id()
	set_points_for_owner(default_owner_id, faction, points)


func set_points_for_owner(owner_id: String, faction: String, points: int) -> void:
	var resolved_owner_id: String = _resolve_owner_id(owner_id)
	var trimmed_faction: String = faction.strip_edges()
	if trimmed_faction == "":
		return

	var state: Dictionary = _ensure_state_for_owner(resolved_owner_id)
	var clamped_points: int = int(clamp(points, MIN_REPUTATION_POINTS, MAX_REPUTATION_POINTS))
	state[trimmed_faction] = clamped_points
	_states[resolved_owner_id] = state

	if _should_sync_legacy_cache_for_owner(resolved_owner_id) == true:
		_sync_local_cache()


func adjust_points(faction: String, delta: int) -> void:
	var default_owner_id: String = _resolve_default_owner_id()
	adjust_points_for_owner(default_owner_id, faction, delta)


func adjust_points_for_owner(owner_id: String, faction: String, delta: int) -> void:
	var resolved_owner_id: String = _resolve_owner_id(owner_id)
	var trimmed_faction: String = faction.strip_edges()
	if trimmed_faction == "":
		return
	if delta == 0:
		return

	var state: Dictionary = _ensure_state_for_owner(resolved_owner_id)
	var current_points: int = int(state.get(trimmed_faction, 0))
	var next_points: int = int(clamp(current_points + delta, MIN_REPUTATION_POINTS, MAX_REPUTATION_POINTS))
	state[trimmed_faction] = next_points
	_states[resolved_owner_id] = state

	if _should_sync_legacy_cache_for_owner(resolved_owner_id) == true:
		_sync_local_cache()


func get_relationship(faction: String) -> Reputation.Relationship:
	var default_owner_id: String = _resolve_default_owner_id()
	return get_relationship_for_owner(default_owner_id, faction)


func get_relationship_for_owner(owner_id: String, faction: String) -> Reputation.Relationship:
	var points: int = get_points_for_owner(owner_id, faction)
	return Reputation.get_relationship(points)


func is_hostile_to_player(faction: String) -> bool:
	var default_owner_id: String = _resolve_default_owner_id()
	return is_hostile_to_player_for_owner(default_owner_id, faction)


func is_hostile_to_player_for_owner(owner_id: String, faction: String) -> bool:
	var relationship: int = int(get_relationship_for_owner(owner_id, faction))
	return relationship <= int(Reputation.Relationship.UNFRIENDLY)


func get_state() -> Dictionary:
	var default_owner_id: String = _resolve_default_owner_id()
	return get_state_for_owner(default_owner_id)


func get_state_for_owner(owner_id: String) -> Dictionary:
	var resolved_owner_id: String = _resolve_owner_id(owner_id)
	var state: Dictionary = _ensure_state_for_owner(resolved_owner_id)
	return state.duplicate(true)


func set_state(state: Dictionary) -> void:
	var default_owner_id: String = _resolve_default_owner_id()
	set_state_for_owner(default_owner_id, state)


func set_state_for_owner(owner_id: String, state: Dictionary) -> void:
	var resolved_owner_id: String = _resolve_owner_id(owner_id)
	var normalized_state: Dictionary = _normalize_state(state)
	_states[resolved_owner_id] = normalized_state

	if _should_sync_legacy_cache_for_owner(resolved_owner_id) == true:
		_sync_local_cache()


func reset_state_for_owner(owner_id: String) -> void:
	var resolved_owner_id: String = _resolve_owner_id(owner_id)
	_states[resolved_owner_id] = DEFAULT_FACTION_POINTS.duplicate(true)

	if _should_sync_legacy_cache_for_owner(resolved_owner_id) == true:
		_sync_local_cache()


func _resolve_default_owner_id() -> String:
	var session_owner_id: String = ""
	if SessionManager != null and SessionManager.has_method("get_local_player_id") == true:
		session_owner_id = String(SessionManager.get_local_player_id()).strip_edges()

	if session_owner_id != "":
		return session_owner_id

	var registry_owner_id: String = ""
	if PlayerContextRegistry != null and PlayerContextRegistry.has_method("get_local_player_id") == true:
		registry_owner_id = String(PlayerContextRegistry.get_local_player_id()).strip_edges()

	if registry_owner_id != "":
		return registry_owner_id

	return DEFAULT_LOCAL_OWNER_ID


func _resolve_owner_id(owner_id: String) -> String:
	var trimmed_owner_id: String = owner_id.strip_edges()
	if trimmed_owner_id != "":
		return trimmed_owner_id
	return _resolve_default_owner_id()


func _ensure_state_for_owner(owner_id: String) -> Dictionary:
	var resolved_owner_id: String = _resolve_owner_id(owner_id)
	if _states.has(resolved_owner_id) == false:
		var initial_state: Dictionary = DEFAULT_FACTION_POINTS.duplicate(true)
		_states[resolved_owner_id] = initial_state
		return initial_state

	var state_value: Variant = _states.get(resolved_owner_id, {})
	if typeof(state_value) != TYPE_DICTIONARY:
		var repaired_state: Dictionary = DEFAULT_FACTION_POINTS.duplicate(true)
		_states[resolved_owner_id] = repaired_state
		return repaired_state

	var normalized_state: Dictionary = _normalize_state(state_value as Dictionary)
	_states[resolved_owner_id] = normalized_state
	return normalized_state


func _normalize_state(state: Dictionary) -> Dictionary:
	var normalized: Dictionary = DEFAULT_FACTION_POINTS.duplicate(true)

	for key_value: Variant in state.keys():
		var faction_name: String = String(key_value).strip_edges()
		if faction_name == "":
			continue

		var raw_points_value: Variant = state.get(key_value, 0)
		var raw_points: int = int(raw_points_value)
		normalized[faction_name] = int(clamp(raw_points, MIN_REPUTATION_POINTS, MAX_REPUTATION_POINTS))

	return normalized


func _should_sync_legacy_cache_for_owner(owner_id: String) -> bool:
	var resolved_owner_id: String = _resolve_owner_id(owner_id)
	var default_owner_id: String = _resolve_default_owner_id()
	return resolved_owner_id == default_owner_id


func _sync_local_cache() -> void:
	var default_owner_id: String = _resolve_default_owner_id()
	var local_state: Dictionary = _ensure_state_for_owner(default_owner_id)
	faction_points = local_state.duplicate(true)


func _connect_session_signals() -> void:
	if SessionManager == null:
		return

	var identity_callable: Callable = Callable(self, "_on_session_local_identity_changed")
	if SessionManager.has_signal("local_identity_changed") == true:
		if SessionManager.is_connected("local_identity_changed", identity_callable) == false:
			SessionManager.connect("local_identity_changed", identity_callable)


func _connect_player_context_registry_signals() -> void:
	if PlayerContextRegistry == null:
		return

	var local_changed_callable: Callable = Callable(self, "_on_registry_local_player_changed")
	if PlayerContextRegistry.has_signal("local_player_changed") == true:
		if PlayerContextRegistry.is_connected("local_player_changed", local_changed_callable) == false:
			PlayerContextRegistry.connect("local_player_changed", local_changed_callable)


func _on_session_local_identity_changed(_player_id: String, _peer_id: int) -> void:
	_sync_local_cache()


func _on_registry_local_player_changed(_player_id: String) -> void:
	_sync_local_cache()
