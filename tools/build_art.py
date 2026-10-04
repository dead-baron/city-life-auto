"""Build every game art asset from the City Life Auto concept sheets.

Usage: python3 tools/build_art.py <concept_dir> [repo_root=.]

Outputs
  assets/atlas0.png + assets/sprites.json   vehicles, crates, loot bags, street props (2 px per world px)
  assets/prefabs.png                        whole building lots cut from the building sheet (native res,
                                            drawn at PREFAB_SCALE world px per source px)
  assets/ground.png                         seamless 128x128 ground textures (1 px per world px)
  assets/logo.png                           title logo with transparent background
  shared/prefab-data.js                     generated: prefab footprints/doors in tiles + atlas rects

Vehicle liveries with real-world trademarks (USPS, UPS, FedEx, DHL, Amazon, Brinks, Garda, FBI)
are skipped on purpose.
"""
import json
import os
import sys
import tempfile
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scipy import ndimage
from segment import segment, crop

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..')
ASSETS = os.path.join(ROOT, 'assets')
SCALE = 2          # sprite atlas px per world px
PREFAB_SCALE = 2   # world px per building-sheet source px
TILE = 32

# ----------------------------------------------------------------------------- vehicles
# model -> footprint area in world px^2. Each model keeps the art's own proportions
# (no stretching), so the collision box is exactly the sprite's outline.
AREAS = {'compact': 84 * 44, 'sedan': 100 * 48, 'taxi': 100 * 48, 'sports': 96 * 48, 'pickup': 110 * 50,
         'van': 112 * 54, 'police': 100 * 48, 'swat': 120 * 58, 'ambulance': 116 * 54, 'bike': 48 * 20,
         'speedboat': 104 * 48, 'dinghy': 80 * 40, 'bus': 190 * 60, 'armored': 118 * 56,
         'flatbed': 150 * 56, 'boxtruck': 150 * 58, 'dumptruck': 140 * 60, 'mixer': 146 * 60, 'tanker': 160 * 58,
         'garbage': 140 * 60, 'firetruck': 176 * 64, 'towtruck': 134 * 58}

# Vehicles cut from a box on a sheet (largest object inside the box): (sheet, box, front, model)
VEHICLE_BOXES = [
    ('ae847b9b-image.png', (512, 180, 580, 334), 'down', 'bus'),
    ('ae847b9b-image.png', (376, 178, 436, 336), 'down', 'armored'),
]

VEHICLE_SOURCES = [
    ('5c049cb0-image.png', 'up', 'compact', None, []),
    ('07cfc704-image.png', 'up', 'sedan', None, []),
    ('433db6b5-image.png', 'down', 'taxi', None, []),
    ('51155b7e-image.png', 'down', 'sports', None, []),
    ('2486798a-image.png', 'down', 'van', None, [7, 8, 9, 10, 11]),
    ('c4bd5f1c-image.png', 'up', 'pickup', [0, 1, 2], []),
    ('1a76d8fe-image.png', 'down', 'police', [0], []),
    ('a1ca5305-image.png', 'down', 'police', [0, 1, 2], []),
    ('1a76d8fe-image.png', 'down', 'swat', [1], []),
    ('a1ca5305-image.png', 'down', 'swat', [6], []),
    ('a1ca5305-image.png', 'down', 'ambulance', [14, 16, 17, 19, 20], []),
    ('7254f892-image.png', 'up', 'bike', None, []),
    ('75494cb5-image.png', 'up', 'speedboat', None, []),
    ('75494cb5-image.png', 'up', 'dinghy', [0, 3, 6, 9], []),
    # the work-truck sheets (cab at the top on c4f76655, at the bottom on 75d72db4)
    ('c4f76655-image.png', 'up', 'flatbed', [27, 28], []),
    ('c4f76655-image.png', 'up', 'boxtruck', [0, 1], []),
    ('75d72db4-image.png', 'down', 'boxtruck', [14, 15], []),
    ('75d72db4-image.png', 'down', 'dumptruck', [0, 1, 2], []),
    ('c4f76655-image.png', 'up', 'dumptruck', [3, 4, 20, 21, 22], []),
    ('75d72db4-image.png', 'down', 'mixer', [3, 4], []),
    ('c4f76655-image.png', 'up', 'mixer', [5], []),
    ('75d72db4-image.png', 'down', 'tanker', [5, 6, 7, 21], []),
    ('c4f76655-image.png', 'up', 'tanker', [2, 23, 24], []),
    ('c4f76655-image.png', 'up', 'garbage', [25], []),
    ('c4f76655-image.png', 'up', 'towtruck', [10], []),
    ('a1ca5305-image.png', 'down', 'firetruck', [21, 22, 23, 24], []),
    ('a1ca5305-image.png', 'down', 'police', [3, 4, 5], []),
    ('fdea928c-image.png', 'up', 'pickup', None, []),
]

ITEM_SOURCES = [
    ('0893c72f-image.png', 0, 'crate1', 30), ('0893c72f-image.png', 2, 'crate2', 30),
    ('0893c72f-image.png', 4, 'crate3', 30), ('0893c72f-image.png', 6, 'crate4', 30),
    ('0893c72f-image.png', 8, 'produce', 30),
    ('0893c72f-image.png', 36, 'bag1', 30), ('0893c72f-image.png', 38, 'bag2', 30),
    ('0893c72f-image.png', 40, 'bag3', 30), ('0893c72f-image.png', 42, 'bag4', 32),
]

# ----------------------------------------------------------------------------- street props
PROPS_SHEET = 'ae847b9b-image.png'
PANELS = {'furn': (602, 42, 1052, 350), 'env': (585, 390, 1025, 622), 'food': (1035, 390, 1440, 622),
          'park': (1100, 660, 1440, 862), 'trash': (392, 660, 730, 862), 'ind': (740, 660, 1095, 862)}
# name: (panel, index, longest side in world px)
PROPS = {
    'tree_a': ('env', 0, 78), 'tree_b': ('env', 5, 78), 'palm_a': ('env', 8, 62), 'palm_b': ('env', 9, 58),
    'palm_c': ('env', 11, 58), 'palm_d': ('env', 17, 50), 'shrub_a': ('env', 1, 40), 'shrub_b': ('env', 4, 38),
    'palm_s': ('env', 6, 44), 'flowerbed': ('env', 15, 60), 'planter_sq': ('env', 14, 32), 'planter_g': ('env', 3, 34),
    'bench_a': ('furn', 0, 40), 'bench_b': ('furn', 1, 40), 'bench_m': ('furn', 2, 40), 'trashcan': ('furn', 3, 16),
    'dumpster_s': ('furn', 5, 42), 'mailbox': ('furn', 6, 18), 'dumpster_m': ('furn', 11, 50),
    'planter_fl': ('furn', 12, 46), 'atm': ('furn', 10, 20), 'news_a': ('furn', 19, 16), 'news_b': ('furn', 22, 16),
    'news_c': ('furn', 27, 16), 'hydrant': ('furn', 17, 16), 'hydrant_y': ('furn', 20, 16), 'cone': ('furn', 15, 14),
    'bikerack': ('furn', 21, 30), 'bush_a': ('furn', 31, 30), 'bush_b': ('furn', 32, 30), 'bush_c': ('furn', 33, 36),
    'umbrella_r': ('food', 0, 46), 'umbrella_b': ('food', 1, 46), 'umbrella_g': ('food', 2, 46), 'umbrella_y': ('food', 3, 46),
    'foodcart': ('food', 4, 44), 'foodcart_b': ('food', 5, 44), 'stall': ('food', 6, 66), 'vend_a': ('food', 11, 26),
    'vend_cola': ('food', 12, 26), 'vend_c': ('food', 13, 26), 'produce_a': ('food', 7, 30), 'produce_b': ('food', 10, 30),
    'pbench': ('park', 0, 42), 'flowers_a': ('park', 1, 48), 'flowers_big': ('park', 9, 52), 'fountain': ('park', 10, 84),
    'mosaic': ('park', 11, 60), 'potted': ('park', 12, 24),
    'bags': ('trash', 0, 40), 'cart': ('trash', 9, 36), 'dump_g': ('trash', 11, 46), 'dump_b': ('trash', 13, 46),
    'dump_o': ('trash', 15, 46), 'tires': ('trash', 20, 40), 'pallet_s': ('trash', 21, 30),
    'pallet': ('ind', 0, 38), 'pipes': ('ind', 1, 46), 'rubble': ('ind', 2, 38), 'lumber': ('ind', 3, 60),
    'barrier': ('ind', 6, 46), 'wheelbarrow': ('ind', 7, 36), 'gravel': ('ind', 9, 38), 'sandbags': ('ind', 10, 42),
    'pallet_b': ('ind', 11, 44), 'drum': ('ind', 12, 22), 'spool': ('ind', 13, 30), 'planks': ('ind', 14, 38),
}

# ----------------------------------------------------------------------------- building prefabs
BUILDINGS = 'a750d4b7-image.png'
# key: (src box, solid fractions x0,y0,x1,y1, door x fractions, ground, rotatable)
PREFABS = {
    'apt1': ((368, 43, 530, 276), (.18, .08, .90, .78), [.5], 'lot', True),
    'apt2': ((543, 43, 710, 276), (.12, .04, .88, .80), [.5], 'lot', True),
    'hospital': ('REF', (.01, .0, .99, .80), [.5], 'plaza', False),   # composed by make_hospital()
    'fire': ((221, 325, 418, 466), (.16, .05, .95, .97), [.4], 'lot', False),
    'gas': ((433, 325, 638, 546), (.67, .01, .93, .20), [.8], 'lot', False),
    'strip': ((876, 325, 1153, 474), (.04, .15, .96, .82), [.17, .39, .61, .83], 'lot', False),
    'club': ((338, 588, 520, 793), (.10, .05, .86, .71), [.45], 'plaza', False),
    'dealer': ((765, 588, 998, 733), (.22, .05, .92, .89), [.57], 'lot', False),
    'repair': ((1011, 588, 1226, 743), (.15, .06, .80, .84), [.4], 'lot', False),
    'industrial': ((11, 835, 316, 1076), (.05, .03, .96, .68), [.5], 'lot', True),
    'construction': ((558, 835, 793, 1076), (.29, .07, .96, .68), [.15], 'dirt', True),
    'church': ((806, 835, 970, 1076), (.13, .03, .90, .68), [.5], 'plaza', False),
    'school': ((985, 835, 1208, 983), (.06, .05, .94, .92), [.5], 'lot', False),
    'park': ((1221, 835, 1438, 1076), (.30, .11, .66, .46), [.5], 'grass', True),
}

# ----------------------------------------------------------------------------- scene lots
# Whole lots cut from the concept scene paintings (a house with its garden and driveway, a club
# with its red carpet, a police station with its steps). key: (sheet, box, solid fractions,
# door x fractions, ground, rotatable, target width in tiles). The scale per scene follows from
# the target width; the lot's height from the crop's aspect.
SCENE_PREFABS = {
    'fuel':       ('e71fca5d-image.png', (330, 120, 1360, 515), (.60, .05, .98, .85), [.8], 'lot', False, 19),
    'clubnova':   ('00ceb559-image.png', (150, 20, 1300, 760), (.03, .0, .97, .62), [.5], 'plaza', False, 18),
    'clubeclipse':('34eae673-image.png', (380, 40, 1300, 640), (.03, .0, .97, .78), [.5], 'plaza', False, 17),
    'police2':    ('6fed2123-image.png', (150, 30, 1000, 700), (.03, .03, .97, .75), [.5], 'plaza', False, 16),
    'police3':    ('a3d2f043-image.png', (80, 60, 700, 760), (.05, .08, .95, .82), [.6], 'plaza', False, 14),
    'motors':     ('6d268385-image.png', (380, 40, 1220, 760), (.11, .05, .88, .5), [.5], 'lot', False, 15),
    'trail':      ('66327ad5-image.png', (380, 40, 1110, 560), (.03, .04, .97, .9), [.5], 'lot', False, 16),
    'boutique':   ('3c723498-image.png', (290, 0, 1210, 600), (.03, .0, .97, .78), [.5], 'plaza', False, 17),
    'quickstop':  ('f3c20cb7-image.png', (420, 100, 1060, 650), (.05, .05, .95, .86), [.45], 'lot', False, 15),
    'apt3':       ('d1c9a548-image.png', (180, 0, 1440, 620), (.0, .0, 1.0, .62), [.25], 'plaza', False, 19),
    'apt4':       ('2ec4379d-image.png', (380, 40, 1185, 760), (.03, .22, .97, .9), [.45], 'grass', False, 16),
    'house4':     ('1715a193-image.png', (340, 40, 1200, 800), (.03, .22, .97, .67), [.34], 'grass', False, 16),
    'house5':     ('f98d9a92-image.png', (380, 40, 1420, 800), (.02, .32, .70, .74), [.4], 'grass', False, 16),
    'house6':     ('9fb6ffb3-image.png', (100, 40, 1380, 820), (.15, .2, .85, .65), [.5], 'grass', False, 19),
    'bank2':      ('ae8c09d0-image.png', (540, 0, 1536, 420), (.03, .0, .97, .72), [.45], 'plaza', False, 19),
    'junkyard':   ('30cb641b-image.png', (0, 0, 1536, 800), (.02, .02, .2, .3), [.25], 'dirt', False, 19),
    'tackle2':    ('e9e1ec76-image.png', (200, 80, 1300, 490), (.1, .1, .75, .55), [.45], 'dirt', False, 17),
    'shack':      ('63fc3283-image.png', (480, 260, 1090, 760), (.05, .05, .95, .65), [.5], 'dirt', False, 13),
    'farmstead':  ('2f8031eb-image.png', (150, 40, 1448, 700), (.58, .1, .85, .45), [.2], 'dirt', False, 19),
    'site':       ('94484028-image.png', (380, 20, 1400, 760), (.02, .02, .25, .3), [.15], 'dirt', False, 18),
    'beachbar':   ('5841fda7-image.png', (300, 60, 1460, 720), (.25, .12, .62, .5), [.45], 'sand', False, 18),
    'pool':       ('d638bb4b-image.png', (240, 60, 1520, 740), (.0, .0, .25, .45), [.12], 'grass', False, 19),
    'liquor':     ('a8217af8-image.png', (200, 20, 1300, 780), (.04, .02, .92, .84), [.28], 'plaza', False, 16),
    'shops1':     ('4bb52753-image.png', (0, 0, 1440, 400), (.0, .0, 1.0, .72), [.10, .31, .53, .70, .88], 'plaza', False, 24),
    'shops2':     ('9cec10ef-image.png', (0, 0, 1536, 400), (.0, .0, 1.0, .72), [.10, .31, .57, .74, .91], 'plaza', False, 25),
    # round 7: the building-sheet lots that looked smeared when upscaled, redrawn from the concept scenes
    'house1'     : ('bfa2eaae-image.png', (149, 61, 600, 395), (0.02, 0.02, 0.8, 0.62), [0.49], 'grass', False, 16),  # suburban house, pool and patio
    'house2'     : ('bfa2eaae-image.png', (900, 70, 1290, 395), (0.11, 0.02, 0.75, 0.62), [0.6], 'grass', False, 15),  # house with a pickup in the drive
    'house3'     : ('bfa2eaae-image.png', (1300, 61, 1645, 395), (0.12, 0.18, 0.81, 0.72), [0.49], 'grass', False, 14),  # house with two cars out front
    'house7'     : ('bfa2eaae-image.png', (0, 520, 420, 924), (0.36, 0.06, 0.86, 0.56), [0.64], 'grass', False, 15),  # house with a fenced side yard
    'house8'     : ('bfa2eaae-image.png', (430, 520, 800, 924), (0.03, 0.16, 0.73, 0.63), [0.38], 'grass', False, 13),  # house, two cars on the drive
    'house9'     : ('bfa2eaae-image.png', (961, 559, 1380, 909), (0.25, 0.06, 0.72, 0.67), [0.38], 'grass', False, 15),  # brick-roofed house with a pergola
    'conv'       : ('c23df171-image.png', (46, 0, 471, 289), (0, 0, 1, 0.62), [0.5], 'lot', False, 16),  # corner convenience store
    'rest1'      : ('a7108177-image.png', (1178, 0, 1649, 258), (0, 0, 1, 0.42), [0.45], 'plaza', False, 16),  # awning restaurant with a patio
    'rest2'      : ('1b15795c-image.png', (0, 0, 391, 335), (0, 0, 1, 0.72), [0.55], 'plaza', False, 14),  # coffee shop
    'diner'      : ('1b15795c-image.png', (1040, 0, 1375, 279), (0, 0, 1, 0.78), [0.45], 'plaza', False, 13),  # City Diner
    'hotel'      : ('da2b614f-image.png', (714, 0, 1117, 289), (0, 0, 1, 0.6), [0.5], 'plaza', False, 15),  # Grand Palace hotel
    'bank'       : ('8e6fd787-image.png', (607, 0, 1075, 461), (0, 0, 1, 0.66), [0.5], 'plaza', False, 15),  # First National Bank
    'warehouse'  : ('1f061cf5-image.png', (182, 0, 532, 327), (0, 0, 1, 0.8), [0.78], 'lot', False, 14),  # brick warehouse, loading door
    'tower2'     : ('69353c0e-image.png', (77, 0, 363, 195), (0, 0, 1, 0.8), [0.5], 'plaza', False, 12),  # office block
    'tower1'     : ('69353c0e-image.png', (915, 0, 1145, 195), (0, 0, 1, 0.8), [0.5], 'plaza', False, 10),  # office block
    'police'     : ('03063643-image.png', (440, 38, 1080, 445), (0, 0, 1, 0.68), [0.5], 'plaza', False, 16),  # police station front, flags and steps
    'bistro'     : ('da2b614f-image.png', (410, 0, 646, 289), (0, 0, 1, 0.4), [0.5], 'plaza', False, 10),  # Le Petit Bistro
    'royale'     : ('da2b614f-image.png', (91, 0, 327, 289), (0, 0, 1, 0.62), [0.5], 'plaza', False, 10),  # Royale fashion
    'vellori'    : ('8e6fd787-image.png', (328, 0, 607, 461), (0, 0, 1, 0.72), [0.5], 'plaza', False, 10),  # Vellori boutique
    'monarch'    : ('8e6fd787-image.png', (1082, 0, 1424, 461), (0, 0, 1, 0.72), [0.5], 'plaza', False, 12),  # Monarch boutique
    'shanty1'    : ('3a84dd63-image.png', (21, 77, 356, 384), (0.05, 0, 0.95, 0.7), [0.45], 'dirt', False, 12),  # shanty, tin roofs
    'shanty2'    : ('3a84dd63-image.png', (461, 0, 838, 384), (0, 0, 1, 0.8), [0.5], 'dirt', False, 12),  # tarp shacks
    'shanty3'    : ('3a84dd63-image.png', (838, 0, 1243, 384), (0, 0, 1, 0.75), [0.6], 'dirt', False, 13),  # shanty with a graffiti roof
    # round 7: the neon strip (walk-in clubs after dark) and the boulevard shopfronts
    'neonclub'   : ('a1c88191-image.png', (49, 0, 405, 349), (0, 0, 1, 0.72), [0.45], 'plaza', False, 14),  # CLUB - dance drink repeat
    'neontap'    : ('a1c88191-image.png', (482, 0, 824, 349), (0, 0, 1, 0.72), [0.45], 'plaza', False, 14),  # Neon Tap bar
    'midnight'   : ('a1c88191-image.png', (1040, 0, 1446, 349), (0, 0, 1, 0.72), [0.58], 'plaza', False, 16),  # The Midnight cocktail club
    'luna'       : ('a1c88191-image.png', (447, 649, 866, 984), (0, 0, 1, 0.62), [0.42], 'plaza', False, 16),  # Luna Lounge
    'arcade'     : ('a1c88191-image.png', (866, 649, 1117, 984), (0, 0, 1, 0.7), [0.5], 'plaza', False, 10),  # arcade
    'latebite'   : ('a1c88191-image.png', (1110, 649, 1382, 984), (0, 0, 1, 0.7), [0.5], 'plaza', False, 11),  # Late Bite burgers
    'tattoo'     : ('a1c88191-image.png', (84, 649, 391, 984), (0, 0, 1, 0.7), [0.5], 'plaza', False, 12),  # tattoo parlour
    'crown'      : ('59f534a1-image.png', (24, 0, 379, 323), (0, 0, 1, 0.72), [0.5], 'plaza', False, 13),  # Crown boutique
    'greenbistro': ('59f534a1-image.png', (387, 0, 685, 323), (0, 0, 1, 0.6), [0.5], 'plaza', False, 12),  # bistro, green awnings
    'theatre'    : ('59f534a1-image.png', (685, 0, 1113, 323), (0, 0, 1, 0.72), [0.5], 'plaza', False, 16),  # the arched theatre
    'diamond'    : ('59f534a1-image.png', (1113, 0, 1443, 323), (0, 0, 1, 0.72), [0.5], 'plaza', False, 13),  # jeweller
    'redawning'  : ('59f534a1-image.png', (1443, 0, 1774, 323), (0, 0, 1, 0.62), [0.5], 'plaza', False, 13),  # red-awning cafe
    'market'     : ('ee728fc6-image.png', (400, 30, 1300, 600), (0.04, 0.04, 0.96, 0.9), [0.5], 'plaza', False, 17),  # FreshMart supermarket front
}

MAX_LOT_TH = 16   # a city block is ~16 tiles deep
NO_GLOW = {'market'}

# Vehicles painted into a lot (a car on a house's driveway, customers at the pumps) are painted
# out - the hole filled by tiling a patch of the same driveway / forecourt next to it - and become
# a parking spot instead, where a real, drivable car is sometimes parked.
# key: [(car box in source px, sample box in source px)], spots: key: [(x, y, heading)] in source px
SCENE_PATCHES = {
    'house1': [((200, 244, 292, 350), (200, 351, 292, 366))],
    'house2': [((960, 248, 1032, 348), (960, 349, 1032, 372))],
    'house3': [((1478, 288, 1582, 362), (1478, 363, 1582, 372))],
    'house8': [((486, 766, 600, 872), (486, 873, 600, 896))],
    'house9': [((962, 686, 1040, 798), (962, 645, 1040, 685))],
    'house4': [((980, 546, 1090, 745), (980, 746, 1090, 795))],
    'house5': [((960, 616, 1094, 800), (840, 616, 958, 800))],
    'house6': [((1112, 505, 1335, 605), (1112, 606, 1335, 625))],
    'fuel': [((490, 415, 568, 515), (360, 419, 418, 515)), ((670, 415, 751, 515), (360, 419, 418, 515))],
    'beachbar': [((996, 320, 1096, 490), (1095, 495, 1190, 555))],
}
SCENE_CARS = {
    'house1': [(246, 292, 1.571)], 'house2': [(996, 295, 1.571)], 'house3': [(1508, 325, 1.571), (1552, 325, 1.571)],
    'house8': [(518, 815, 1.571), (566, 815, 1.571)], 'house9': [(1001, 728, 1.571)], 'house4': [(1035, 640, 1.571)],
    'house5': [(1028, 710, 1.571)], 'fuel': [(529, 467, 1.571), (710, 467, 1.571)], 'beachbar': [(1046, 405, 1.571)],
}


def paint_out(img, patches):
    """Fill each car box by tiling its sample patch (mirrored every other time so seams match)."""
    for (x0, y0, x1, y1), (sx0, sy0, sx1, sy1) in patches:
        smp = img.crop((sx0, sy0, sx1, sy1))
        sw, sh = smp.size
        flips = [smp, smp.transpose(Image.FLIP_TOP_BOTTOM)]
        k = 0
        for yy in range(y0, y1, sh):
            for xx in range(x0, x1, sw):
                t = flips[k % 2] if sh < sw else (smp if (xx - x0) // sw % 2 == 0 else smp.transpose(Image.FLIP_LEFT_RIGHT))
                img.paste(t.crop((0, 0, min(sw, x1 - xx), min(sh, y1 - yy))), (xx, yy))
            k += 1
        # soften the patch edges a little
        edge = img.crop((x0 - 3, y0 - 3, x1 + 3, y1 + 3)).filter(ImageFilter.GaussianBlur(1.2))
        mask = Image.new('L', edge.size, 0)
        ImageDraw.Draw(mask).rectangle([0, 0, edge.width - 1, edge.height - 1], outline=255, width=5)
        img.paste(edge, (x0 - 3, y0 - 3), mask)
    return img

# ----------------------------------------------------------------------------- ground textures
# name: (sheet, box, extra brightness) -> seamless 128x128 at 1 px per world px
GROUND = {
    'asphalt': ('1000056784.png', (74, 82, 318, 326)),
    'asphalt_worn': ('1000056784.png', (803, 88, 1047, 332)),
    'concrete': ('1000056787.png', (167, 556, 440, 822)),
    'brick': ('1000056784.png', (78, 612, 334, 868)),
    'slate': ('1000056787.png', (926, 563, 1116, 753)),
    'water': ('d46d170d-image.png', (141, 468, 259, 584)),
    'deep': ('d46d170d-image.png', (268, 723, 382, 845)),
}


DECK_SRC = ('69353c0e-image.png', (220, 399, 390, 416))


def find_src(name):
    for d in (SRC, '/mnt/user-data/uploads'):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(name)


def fit(img, w, h):
    return img.resize((max(1, int(round(w))), max(1, int(round(h)))), Image.LANCZOS)


def seamless(img):
    """Blend an image with its half-offset copy so it tiles without seams."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    b = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    yy = np.abs(np.linspace(-1, 1, h))[:, None]
    xx = np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip(1 - np.maximum(xx, yy), 0, 1) ** 0.7
    m = np.clip(m * 1.6, 0, 1)[..., None]
    out = a * m + b * (1 - m)
    return Image.fromarray(out.astype(np.uint8))


def shelf_pack(items, width=2048, pad=2):
    items = sorted(items, key=lambda s: -s[1].height)
    frames, sheets, cur = {}, [], []
    x = y = rowh = 0

    def flush():
        if not cur:
            return
        h = max(yy + img.height for _, img, xx, yy in cur)
        a = Image.new('RGBA', (width, h), (0, 0, 0, 0))
        for name, img, xx, yy in cur:
            a.paste(img, (xx, yy))
            frames[name] = {'a': len(sheets), 'x': xx, 'y': yy, 'w': img.width, 'h': img.height}
        sheets.append(a)
        cur.clear()

    for name, img in items:
        if x + img.width + pad > width:
            x, y, rowh = 0, y + rowh + pad, 0
        if y + img.height > 2048:
            flush()
            x = y = rowh = 0
        cur.append((name, img, x, y))
        x += img.width + pad
        rowh = max(rowh, img.height)
    flush()
    return frames, sheets


def save_png(img, path, colors=256):
    img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)

# Rooftop equipment modules cut from the style-guide roof tiles (inside the parapet), stamped onto
# procedural flat roofs: name -> (sheet, box, longest side in world px)
ROOF_SHEET = '1000056778.png'
ROOF_MODULES = {
    'ac': ((604, 38, 840, 240), 92), 'heli': ((606, 598, 842, 776), 150), 'tanks': ((904, 596, 1122, 776), 96),
    'sky': ((1180, 598, 1410, 772), 104), 'access': ((1180, 842, 1410, 1016), 90),
}


def feather(img, px):
    """Fade the outer px pixels to transparent so a module blends into the roof surface."""
    w, h = img.size
    xx = np.minimum(np.arange(w), np.arange(w)[::-1])[None, :]
    yy = np.minimum(np.arange(h), np.arange(h)[::-1])[:, None]
    a = np.clip(np.minimum(xx, yy) / px, 0, 1)
    out = img.convert('RGBA')
    out.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    return out


def build_sprites():
    sprites, counts, aspects = [], {}, {}
    cache = {}

    def seg(sheet):
        if sheet not in cache:
            cache[sheet] = segment(find_src(sheet))
        return cache[sheet]

    raw = []
    for sheet, front, model, idxs, excl in VEHICLE_SOURCES:
        im, lab, objs = seg(sheet)
        for i in (idxs if idxs is not None else range(len(objs))):
            if i in excl or i >= len(objs):
                continue
            c = crop(im, lab, objs[i])
            c = c.rotate(-90 if front == 'up' else 90, expand=True, resample=Image.BICUBIC)
            c = c.crop(c.getbbox())
            raw.append((model, c))
            aspects.setdefault(model, []).append(c.width / c.height)
    with tempfile.TemporaryDirectory() as td:
        for sheet, box, front, model in VEHICLE_BOXES:
            pth = os.path.join(td, 'box.png')
            Image.open(find_src(sheet)).convert('RGB').crop(box).save(pth)
            im, lab, objs = segment(pth, thresh=20, min_area=400, max_aspect=6)
            o = max(objs, key=lambda q: q['area'])
            c = crop(im, lab, o)
            c = c.rotate(-90 if front == 'up' else 90, expand=True, resample=Image.BICUBIC)
            c = c.crop(c.getchannel('A').getbbox())
            raw.append((model, c))
            aspects.setdefault(model, []).append(c.width / c.height)
    lengths = {}
    for m, a in aspects.items():
        r = float(np.median(a))
        w = (AREAS[m] / r) ** 0.5
        lengths[m] = [int(round(w * r)), int(round(w))]
    for model, c in raw:
        n = counts.get(model, 0)
        counts[model] = n + 1
        L, W = lengths[model]
        sprites.append((f'veh_{model}_{n}', fit(c, L * SCALE, W * SCALE)))
    for sheet, i, name, size in ITEM_SOURCES:
        im, lab, objs = seg(sheet)
        c = crop(im, lab, objs[i])
        r = c.width / c.height
        w, h = (size, size / r) if r >= 1 else (size * r, size)
        sprites.append((name, fit(c, w * SCALE, h * SCALE)))

    sheet_img = Image.open(find_src(PROPS_SHEET)).convert('RGB')
    panel_objs = {}
    with tempfile.TemporaryDirectory() as td:
        for k, box in PANELS.items():
            p = os.path.join(td, k + '.png')
            sheet_img.crop(box).save(p)
            panel_objs[k] = segment(p, thresh=20, min_area=120, max_aspect=10)
    prop_sizes = {}
    for name, (panel, idx, size) in PROPS.items():
        im, lab, objs = panel_objs[panel]
        c = crop(im, lab, objs[idx])
        r = c.width / c.height
        w, h = (size, size / r) if r >= 1 else (size * r, size)
        prop_sizes[name] = [round(w), round(h)]
        sprites.append(('prop_' + name, fit(c, w * SCALE, h * SCALE)))
    roof_src = Image.open(find_src(ROOF_SHEET)).convert('RGB')
    for name, (box, size) in ROOF_MODULES.items():
        c = roof_src.crop(box)
        r = c.width / c.height
        w, h = (size, size / r) if r >= 1 else (size * r, size)
        prop_sizes['roof_' + name] = [round(w), round(h)]
        sprites.append(('prop_roof_' + name, feather(fit(c, w * SCALE, h * SCALE), 10)))
        print('  roof module', name, 'mean', tuple(int(v) for v in np.asarray(c).reshape(-1, 3).mean(0)))
    frames, sheets = shelf_pack(sprites)
    files = []
    for i, a in enumerate(sheets):
        fn = f'atlas{i}.png'
        save_png(a, os.path.join(ASSETS, fn))
        files.append(fn)
    with open(os.path.join(ASSETS, 'sprites.json'), 'w') as f:
        json.dump({'scale': SCALE, 'atlases': files, 'frames': frames, 'variants': counts, 'props': prop_sizes}, f, separators=(',', ':'))
    print('sprites', len(frames), 'vehicle lengths', lengths)
    return lengths, prop_sizes


SR_WEIGHTS = os.environ.get('SR_WEIGHTS', os.path.join(ROOT, 'tools', 'weights', 'realesr-general-x4v3.pth'))


def sharpen_lot(img, tw, th):
    """Concept-sheet lot -> crisp art at 1 art px per world px (tw*32 x th*32).

    The sheet stores each lot at ~half world resolution; stretching it 2x looked soft in game.
    Real-ESRGAN (numpy port in sr_upscale.py) upscales 4x with clean edges, then we downsample
    to exact world size so every building pixel maps 1:1 to a world pixel."""
    W, H = tw * TILE, th * TILE
    if os.path.exists(SR_WEIGHTS):
        from sr_upscale import upscale_pil
        up = upscale_pil(img, SR_WEIGHTS).convert('RGB')
    else:
        print('  (no SR weights at', SR_WEIGHTS, '- falling back to Lanczos + unsharp)')
        up = img.resize((img.width * 4, img.height * 4), Image.LANCZOS)
    out = up.resize((W, H), Image.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.0, percent=60, threshold=2))


# Hospital: front facade cut from the rainy-night street reference (lit lobby, red cross, entrance
# canopy, planter beds) under a procedural parapet roof with a helipad, AC and tanks.
HOSPITAL_REF = 'd6e9ec95-image.png'         # the rainy-night hospital street scene
HOSPITAL_FACADE = (213, 0, 1520, 300)        # lit lobby, red cross, canopy, planters and the pavement in front
HOSPITAL_TILES = (18, 15)
ROOF_TEX = ('1b15795c-image.png', (100, 20, 330, 120))  # a patch of the concept's tar-and-gravel roof


def make_hospital():
    tw, th = HOSPITAL_TILES
    W, H = tw * TILE, th * TILE
    fac = Image.open(find_src(HOSPITAL_REF)).convert('RGB').crop(HOSPITAL_FACADE)
    fh = round(fac.height * W / fac.width)
    fac = fac.resize((W, fh), Image.LANCZOS)
    roof_h = round(H * 0.80) - fh
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # the roof surface: the concept painting's own roofing, tiled (mirrored so the seams match)
    tex = Image.open(find_src(ROOF_TEX[0])).convert('RGB').crop(ROOF_TEX[1])
    tex = tex.resize((tex.width * 3 // 4, tex.height * 3 // 4), Image.LANCZOS)
    tile = Image.new('RGB', (tex.width * 2, tex.height * 2))
    tile.paste(tex, (0, 0)); tile.paste(tex.transpose(Image.FLIP_LEFT_RIGHT), (tex.width, 0))
    tile.paste(tex.transpose(Image.FLIP_TOP_BOTTOM), (0, tex.height)); tile.paste(tex.transpose(Image.ROTATE_180), (tex.width, tex.height))
    r = Image.new('RGB', (W, roof_h))
    for yy in range(0, roof_h, tile.height):
        for xx in range(0, W, tile.width):
            r.paste(tile, (xx, yy))
    d = ImageDraw.Draw(r)
    d.rectangle([0, 0, W - 1, roof_h - 1], outline=(26, 27, 32))
    for k in range(1, 9):  # parapet with bevel
        c = (176, 174, 168) if k < 3 else (150, 148, 142) if k < 7 else (110, 110, 112)
        d.rectangle([k, k, W - 1 - k, roof_h + 20], outline=c)
    d.rectangle([9, 9, W - 10, 12], fill=(60, 61, 66))
    mods = Image.open(find_src(ROOF_SHEET)).convert('RGB')
    def stamp(name, cx, cy, size):
        box, _ = ROOF_MODULES[name]
        c = mods.crop(box)
        rr = c.width / c.height
        w, h = (size, round(size / rr)) if rr >= 1 else (round(size * rr), size)
        im = feather(c.resize((w, h), Image.LANCZOS), 8)
        r.paste(im, (int(cx - w / 2), int(cy - h / 2)), im)
    stamp('heli', W * 0.26, roof_h * 0.47, 170)
    stamp('ac', W * 0.58, roof_h * 0.33, 96)
    stamp('ac', W * 0.74, roof_h * 0.33, 96)
    stamp('tanks', W * 0.86, roof_h * 0.62, 90)
    stamp('sky', W * 0.62, roof_h * 0.70, 110)
    # roof-top red cross beacon so the hospital reads from above too
    cx, cy, a, b2 = int(W * 0.44), int(roof_h * 0.72), 22, 7
    d = ImageDraw.Draw(r)
    d.rectangle([cx - a - 4, cy - a - 4, cx + a + 4, cy + a + 4], fill=(236, 236, 232), outline=(40, 40, 44))
    d.rectangle([cx - a, cy - b2, cx + a, cy + b2], fill=(206, 24, 34))
    d.rectangle([cx - b2, cy - a, cx + b2, cy + a], fill=(206, 24, 34))
    out.paste(r, (0, 0))
    out.paste(fac, (0, roof_h))
    return out, tw, th


def emissive(img, solid, tw, th):
    """Night layer for a lot: facade windows turn warm, lit windows and neon signs keep their
    colour, plus a soft halo. Drawn additively by the client after dark."""
    a = np.asarray(img.convert('RGB'), np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    v = a.max(-1)
    s = (v - a.min(-1)) / np.maximum(v, 1e-3)
    H, W = r.shape
    y0 = int((solid[1] + 0.68 * (solid[3] - solid[1])) * H)
    y1 = min(H, int(solid[3] * H + TILE * 0.6))
    fac = np.zeros_like(r, bool)
    fac[y0:y1] = True
    glass = (b > r + 0.05) & (b >= g - 0.03) & (v > 0.1) & (v < 0.8) & (s > 0.25) & fac
    warm = (r > 0.8) & (g > 0.6) & (b < 0.55) & (s > 0.45) & fac
    neon = (s > 0.62) & (v > 0.78)
    glass = ndimage.binary_opening(glass, np.ones((2, 2)))
    neon = ndimage.binary_opening(neon, np.ones((2, 2)))
    out = np.zeros_like(a)
    out[glass] = np.array([1.0, 0.76, 0.40]) * (0.75 + 0.25 * v[glass, None])
    out[warm] = a[warm]
    out[neon] = a[neon]
    halo = np.stack([ndimage.gaussian_filter(out[..., k], 4) for k in range(3)], -1)
    res = np.clip(out * 0.8 + halo * 0.8, 0, 1)
    if 'A' in img.getbands():
        res *= (np.asarray(img.getchannel('A'), np.float32) / 255)[..., None]
    return Image.fromarray((res * 255).astype(np.uint8), 'RGB')


def build_prefabs():
    src = Image.open(find_src(BUILDINGS)).convert('RGB')
    items, meta, glows = [], {}, {}
    for key, (box, solid, doors, ground, rot) in PREFABS.items():
        if box == 'REF':
            lot, tw, th = make_hospital()
        else:
            img = src.crop(box)
            sw, sh = img.size
            tw = max(1, round(sw * PREFAB_SCALE / TILE))
            th = max(1, round(sh * PREFAB_SCALE / TILE))
            # soft lot edges so each lot melts into the surrounding paving / lawn
            lot = feather(sharpen_lot(img, tw, th), 5)
        sx0, sy0, sx1, sy1 = solid
        so = [int(np.floor(sx0 * tw)), int(np.floor(sy0 * th)), int(np.ceil(sx1 * tw)), int(np.ceil(sy1 * th))]
        print('  prefab', key, tw, th)
        items.append((key, lot))
        glows[key] = emissive(lot, solid, tw, th)
        meta[key] = {'tw': tw, 'th': th, 'solid': so, 'doors': doors, 'ground': ground, 'rot': rot}
    for key, (sheet, box, solid, doors, ground, rot, tw) in SCENE_PREFABS.items():
        full = Image.open(find_src(sheet)).convert('RGB')
        if key in SCENE_PATCHES:
            full = paint_out(full, SCENE_PATCHES[key])
        img = full.crop(box)
        th = max(1, min(MAX_LOT_TH, round(tw * img.height / img.width)))
        lot = img.resize((tw * TILE, th * TILE), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=0.8, percent=50, threshold=2))
        lot = feather(lot, 5)
        sx0, sy0, sx1, sy1 = solid
        so = [int(np.floor(sx0 * tw)), int(np.floor(sy0 * th)), int(np.ceil(sx1 * tw)), int(np.ceil(sy1 * th))]
        print('  scene lot', key, tw, th)
        items.append((key, lot))
        # a cutaway (the supermarket shows its aisles) has no windows to light: its glow would be noise
        glows[key] = Image.new('RGB', lot.size, (0, 0, 0)) if key in NO_GLOW else emissive(lot, solid, tw, th)
        meta[key] = {'tw': tw, 'th': th, 'solid': so, 'doors': doors, 'ground': ground, 'rot': rot, 'scene': True}
        if key in SCENE_CARS:
            bw, bh = box[2] - box[0], box[3] - box[1]
            meta[key]['cars'] = [[round((x - box[0]) / bw, 3), round((y - box[1]) / bh, 3), a] for x, y, a in SCENE_CARS[key]]
    frames, sheets = shelf_pack(items, width=2048)
    for i, sh in enumerate(sheets):
        sh.save(os.path.join(ASSETS, f'prefabs{i}.webp'), quality=93, method=6)
        gl = Image.new('RGB', sh.size, (0, 0, 0))
        for k, f in frames.items():
            if f['a'] == i:
                gl.paste(glows[k], (f['x'], f['y']))
        gl.save(os.path.join(ASSETS, f'prefabs{i}_glow.webp'), quality=88, method=6)
    for k, f in frames.items():
        meta[k]['src'] = [f['a'], f['x'], f['y'], f['w'], f['h']]
    return meta, len(sheets)


# Seamless 128px pixel-art ground textures in the palette of the concept "park / greenery" and
# beach tiles (the sheets have no clean patch big enough to tile): periodic value noise quantized
# to 4 tones at 2 world px per art px, plus blade/grain highlights.
NATURAL = {
    'grass': (['#2f5c21', '#3a6e28', '#467f2e', '#559036'], ['#72ad42', '#8cc04c'], '#24481b'),
    'sand': (['#c9ab72', '#d6ba80', '#e0c68f', '#ead3a0'], ['#f4e3bb', '#fff1cf'], '#a98b56'),
    'dirt': (['#6d5232', '#7c5f3b', '#8a6a44', '#98774e'], ['#a8875c', '#b4936a'], '#4d3a22'),
}


def natural_tex(name, n=64, seed=7):
    tones, hl, dark = NATURAL[name]
    rng = np.random.default_rng(seed + len(name))
    yy, xx = np.mgrid[0:n, 0:n] / n * 2 * np.pi
    v = np.zeros((n, n))
    for _ in range(14):
        fx, fy = rng.integers(1, 7, 2)
        v += rng.uniform(0.3, 1) * np.sin(fx * xx + rng.uniform(0, 6.3)) * np.sin(fy * yy + rng.uniform(0, 6.3))
    v += rng.normal(0, 0.55, (n, n))
    q = np.digitize(v, np.quantile(v, [0.25, 0.5, 0.78]))
    pal = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in tones], np.uint8)
    img = pal[q]
    # highlights (blade tips / bright grains) and dark specks, sparse
    for c, frac in ((hl[0], 0.05), (hl[1], 0.02), (dark, 0.04)):
        m = rng.random((n, n)) < frac
        img[m] = [int(c[i:i + 2], 16) for i in (1, 3, 5)]
    if name == 'grass':  # short blades: a bright pixel with a darker one under it
        ys, xs = np.nonzero(rng.random((n, n)) < 0.035)
        for y, x in zip(ys, xs):
            img[y, x] = [156, 204, 82]
            img[(y + 1) % n, x] = [44, 90, 31]
    return Image.fromarray(img).resize((n * 2, n * 2), Image.NEAREST)


def build_ground():
    tiles = []
    for name, (sheet, box) in GROUND.items():
        img = Image.open(find_src(sheet)).convert('RGB').crop(box)
        img = seamless(img.resize((128, 128), Image.LANCZOS))
        tiles.append((name, img))
    for name in ('grass', 'sand', 'dirt'):
        tiles.append((name, natural_tex(name)))
    # the elevated highway's deck: the asphalt of the concept's highway scene - its colours (four
    # tones by brightness, plus its light grains) laid out as seamless grain noise
    src = np.asarray(Image.open(find_src(DECK_SRC[0])).convert('RGB').crop(DECK_SRC[1])).reshape(-1, 3).astype(float)
    lum = src @ [0.3, 0.59, 0.11]
    qs = np.quantile(lum, [0, 0.2, 0.45, 0.7, 0.92, 1])
    # (the scene is lit for night: lifted to daylight brightness)
    lift = lambda c: tuple(min(255, int(v * 1.45 + 6)) for v in c)
    tones = ['#%02x%02x%02x' % lift(src[(lum >= qs[k]) & (lum <= qs[k + 1])].mean(0)) for k in range(4)]
    grain = '#%02x%02x%02x' % lift(src[lum >= qs[4]].mean(0))
    NATURAL['deck'] = (tones, [grain, grain], tones[0])
    tiles.append(('deck', natural_tex('deck')))
    out = Image.new('RGB', (128 * len(tiles), 128))
    rects = {}
    for i, (name, img) in enumerate(tiles):
        out.paste(img, (i * 128, 0))
        rects[name] = [i * 128, 0, 128, 128]
    out.save(os.path.join(ASSETS, 'ground.png'), optimize=True)
    return rects


def build_logo():
    lim, llab, lobjs = segment(find_src('1245b1cc-image.png'), thresh=18, min_area=500)
    mask = np.zeros(llab.shape, bool)
    for o in lobjs:
        if o['area'] > 2000:
            mask |= (llab == o['label'])
    mask = ndimage.binary_fill_holes(mask)
    arr = np.array(lim.convert('RGBA'))
    arr[..., 3] = (mask * 255).astype('uint8')
    logo = Image.fromarray(arr)
    logo = logo.crop(logo.getbbox())
    logo.thumbnail((640, 640), Image.LANCZOS)
    save_png(logo, os.path.join(ASSETS, 'logo.png'))


def main():
    os.makedirs(ASSETS, exist_ok=True)
    lengths, prop_sizes = build_sprites()
    prefabs, nsheets = build_prefabs()
    ground = build_ground()
    build_logo()
    js = ('// GENERATED by tools/build_art.py - do not edit by hand.\n'
          '// Building prefabs cut from the concept building sheet. Sizes/footprints are in tiles\n'
          '// (32 world px); src is [sheet, x, y, w, h] inside assets/prefabs<sheet>.webp, stored at\n'
          '// 1 art px per world px (Real-ESRGAN upscaled from the concept sheet).\n'
          f'export const PREFAB_SHEETS = {nsheets};\n'
          f'export const PREFAB_SCALE = {PREFAB_SCALE};\n'
          f'export const PREFABS = {json.dumps(prefabs, indent=1)};\n'
          f'export const GROUND_TEX = {json.dumps(ground)};\n'
          f'export const PROP_SIZES = {json.dumps(prop_sizes)};\n'
          f'export const VEHICLE_ART_SIZE = {json.dumps(lengths)};\n')
    with open(os.path.join(ROOT, 'shared', 'prefab-data.js'), 'w') as f:
        f.write(js)
    print('prefabs', {k: (v['tw'], v['th']) for k, v in prefabs.items()})


if __name__ == '__main__':
    main()
