extends Resource
class_name ItemResource

@export var id: String
@export var name: String
@export var description: String
@export var category: String
@export var size: int
@export var img: String

@export var value: int = 0
@export var stackable: bool = true
@export var max_stack_size: int = 99
@export var rarity: String = "common"  # common, rare, epic, legendary

# (Optional for later)
@export var usable: bool = false
@export var use_effect: String
@export var level_requirement: int = 0
