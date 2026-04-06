# FILENAME: ItemsDatabase.gd 

extends Node
class_name ItemsDatabase

var items := {}

func _ready() -> void:
	load_items()

func load_items() -> void:
	var file := FileAccess.open("res://data/database/items/items.json", FileAccess.READ)
	if file:
		var content: String = file.get_as_text()
		var parsed: Array = JSON.parse_string(content)
		if parsed is Array:
			for item in parsed:
				var id: int = int(item.get("id", -1))
				if id != -1:
					items[id] = item
			#print("✅ Loaded %d items into memory." % items.size())
		else:
			push_error("❌ Failed to parse items JSON correctly.")
	else:
		push_error("❌ Failed to open items.json.")

# Optional: quick lookup method
func get_item(item_id: int) -> Dictionary:
	return items.get(int(item_id), {})
