extends Control

# FILENAME: ItemTableViewer.gd

@onready var tree: Tree = $Tree

func _ready() -> void:
	load_items()

func load_items() -> void:
	var json_file = FileAccess.open("res://data/database/items/items.json", FileAccess.READ)
	if not json_file:
		push_error("❌ Could not open items.json")
		return

	var json_text = json_file.get_as_text()
	var result = JSON.parse_string(json_text)
	if result is Array:
		populate_tree(result)
	else:
		push_error("❌ Failed to parse items.json as array!")

func populate_tree(items: Array) -> void:
	tree.clear()
	tree.columns = 5
	tree.hide_root = true

	# 🛠 True column headers
	tree.column_titles_visible = true
	tree.set_column_title(0, "Name")
	tree.set_column_title(1, "Description")
	tree.set_column_title(2, "Level Req")
	tree.set_column_title(3, "Rarity")
	tree.set_column_title(4, "Weight")

	# 🛠 Add entries
	for item in items:
		var entry = tree.create_item()
		entry.set_text(0, item.get("name", "Unknown"))
		entry.set_text(1, item.get("description", "Unknown"))
		entry.set_text(2, str(item.get("level_requirement", 0)))
		entry.set_text(3, item.get("rarity", "Common"))
		entry.set_text(4, str(item.get("weight", 0)))
