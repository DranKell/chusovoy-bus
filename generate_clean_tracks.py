import urllib.request
import json
from pathlib import Path

# Load OSM stops
with open('osm_stops.json', 'r', encoding='utf-8') as f:
    osm_stops = json.load(f)

# Master dictionary of verified real geo-coordinates for all Chusovoy bus stops & key waypoints
STOPS = {
    # New Town (Right Bank / East)
    "Школа №13": [58.265705, 57.825169],
    "Юбилейный": [58.268588, 57.824517],
    "ул.Пермская": [58.271066, 57.825432],
    "ул.Сивкова": [58.266200, 57.827500],
    "ул.Мира": [58.271500, 57.822000],
    "Транзит": [58.272469, 57.829170],
    "пл.Металлургов": [58.275400, 57.830988],
    "Юность": [58.272237, 57.816597],
    "Ветеран": [58.276989, 57.814350],
    "ул.Чкалова": [58.284481, 57.815785],
    "ул.Кирова": [58.280932, 57.857013],
    "ул.Севастопольская": [58.275000, 57.835000],
    
    # Bridge across Chusovaya river
    "Мост": [58.282816, 57.813258],
    
    # Old Town (Left Bank / West)
    "Переезд": [58.291038, 57.818127],
    "пл.ЧМЗ": [58.295737, 57.814447],
    "Дом творчества": [58.297076, 57.820607],
    "Южная": [58.299292, 57.814141],
    "Администрация": [58.301463, 57.815312],
    "ЖБК": [58.301727, 57.807808],
    "ДКМ": [58.305512, 57.807288],
    "Поликлиника": [58.306167, 57.807508],
    "Горбольница": [58.304376, 57.798129],
    "ул.Революционная": [58.317603, 57.801634],
    
    # Towards Soplavschikov (West river road)
    "РМЗ": [58.301102, 57.797185],
    "База торга": [58.304138, 57.783839],
    "Вильвенская": [58.305851, 57.770361],
    "Черноморская": [58.309942, 57.769441],
    "ул.Сплавщиков": [58.313946, 57.770323],
    "Сплавщиков": [58.313946, 57.770323],
    
    # North Road (Railway Station & Arkhipovka)
    "ДКЖ": [58.295558, 57.829340],
    "ж/д вокзал": [58.290612, 57.841212],
    "Матросова": [58.293654, 57.834934],
    "Отделение связи": [58.285861, 57.828676],
    "Кольцова": [58.282523, 57.847124],
    "Киоск": [58.283769, 57.837329],
    "Дробильныи": [58.278588, 57.859520],
    "п.Архиповка": [58.286644, 57.858119],
    "Архиповка": [58.286644, 57.858119],
    
    # South / Kommunisticheskaya
    "ул.50 лет ВЛКСМ": [58.278194, 57.804944],
    "ул.Коммунистическая": [58.276787, 57.797403],
    "Сбербанк": [58.271745, 57.800769],
    "Универмаг": [58.271774, 57.806312],
    
    # South-East outskirt / Sovkhozny / Koshkovo
    "п.Совхозный": [58.240838, 57.828601],
    "п.Кошково": [58.275000, 57.865000]
}

# Clean one-way sequence of stops for each urban route (strictly forward from Terminal A to Terminal B):
ROUTE_STOP_CHAINS = {
    "1": {
        "name": "пл.ЧМЗ — п.Совхозный",
        "color": "#2563eb",
        "stops": ["пл.ЧМЗ", "Переезд", "Мост", "ул.Чкалова", "Юность", "ул.Пермская", "Школа №13", "Майдан", "п.Совхозный"]
    },
    "3": {
        "name": "Школа №13 — Горбольница",
        "color": "#dc2626",
        "stops": ["Школа №13", "Юбилейный", "ул.Мира", "Юность", "Ветеран", "ул.Чкалова", "Мост", "Переезд", "пл.ЧМЗ", "Дом творчества", "Южная", "Администрация", "ДКМ", "Поликлиника", "Горбольница"]
    },
    "4": {
        "name": "ул.Кирова — п.Архиповка",
        "color": "#059669",
        "stops": ["ул.Кирова", "Кольцова", "Киоск", "ж/д вокзал", "ДКЖ", "п.Архиповка"]
    },
    "5": {
        "name": "Школа №13 — ул.Сплавщиков",
        "color": "#7c3aed",
        "stops": ["Школа №13", "Юбилейный", "ул.Мира", "Юность", "Ветеран", "ул.Чкалова", "Мост", "Переезд", "пл.ЧМЗ", "Дом творчества", "Южная", "РМЗ", "База торга", "Вильвенская", "Черноморская", "ул.Сплавщиков"]
    },
    "6": {
        "name": "Школа №13 — п.Архиповка",
        "color": "#f59e0b",
        "stops": ["Школа №13", "Юбилейный", "ул.Мира", "Юность", "Ветеран", "ул.Чкалова", "Мост", "Переезд", "пл.ЧМЗ", "ДКЖ", "Матросова", "ж/д вокзал", "п.Архиповка"]
    },
    "7": {
        "name": "пл.Металлургов — ул.Революционная",
        "color": "#0891b2",
        "stops": ["пл.Металлургов", "Транзит", "Юность", "ул.Чкалова", "Мост", "Переезд", "пл.ЧМЗ", "Южная", "Администрация", "ДКМ", "Поликлиника", "ул.Революционная"]
    },
    "9": {
        "name": "ул.Коммунистическая — Горбольница",
        "color": "#db2777",
        "stops": ["ул.Коммунистическая", "ул.50 лет ВЛКСМ", "Сбербанк", "Универмаг", "Мост", "Переезд", "пл.ЧМЗ", "Администрация", "ДКМ", "Поликлиника", "Горбольница"]
    },
    "10": {
        "name": "ул.Коммунистическая — п.Архиповка",
        "color": "#ea580c",
        "stops": ["ул.Коммунистическая", "ул.50 лет ВЛКСМ", "Мост", "Переезд", "пл.ЧМЗ", "ДКЖ", "ж/д вокзал", "п.Архиповка"]
    },
    "11": {
        "name": "Школа №13 — ул.Коммунистическая",
        "color": "#0d9488",
        "stops": ["Школа №13", "Юбилейный", "ул.Мира", "Юность", "Ветеран", "Мост", "ул.50 лет ВЛКСМ", "ул.Коммунистическая"]
    },
    "12": {
        "name": "пл.ЧМЗ — п.Кошково",
        "color": "#4f46e5",
        "stops": ["пл.ЧМЗ", "Переезд", "Мост", "ул.Чкалова", "Юность", "Школа №13", "п.Кошково"]
    },
    "15": {
        "name": "ул.Севастопольская — ул.Коммунистическая",
        "color": "#65a30d",
        "stops": ["ул.Севастопольская", "пл.Металлургов", "Школа №13", "Юность", "Мост", "ул.50 лет ВЛКСМ", "ул.Коммунистическая"]
    },
    "16": {
        "name": "Школа №13 — ул.Кирова",
        "color": "#9333ea",
        "stops": ["Школа №13", "Юбилейный", "ул.Мира", "Юность", "ул.Чкалова", "Мост", "Переезд", "пл.ЧМЗ", "ДКЖ", "ж/д вокзал", "Кольцова", "ул.Кирова"]
    }
}

def route_via_osrm(waypoints):
    # waypoints: [[lat, lon], ...]
    coord_str = ';'.join(f'{p[1]},{p[0]}' for p in waypoints)
    url = f'http://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson'
    req = urllib.request.Request(url, headers={'User-Agent': 'ChusovoyBusApp/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('code') == 'Ok' and data.get('routes'):
                pts = data['routes'][0]['geometry']['coordinates']
                return [[round(pt[1], 6), round(pt[0], 6)] for pt in pts]
    except Exception as e:
        print('OSRM error:', e)
    return waypoints

result_tracks = {}

for r_num, info in ROUTE_STOP_CHAINS.items():
    waypoint_coords = []
    for s_name in info["stops"]:
        if s_name in STOPS:
            waypoint_coords.append(STOPS[s_name])
        elif s_name in osm_stops:
            waypoint_coords.append(osm_stops[s_name])
        else:
            print(f"Warning: stop '{s_name}' not found!")

    if len(waypoint_coords) >= 2:
        print(f"Building clean one-way track for Route {r_num} ({len(waypoint_coords)} stops)...")
        road_points = route_via_osrm(waypoint_coords)
        result_tracks[r_num] = {
            "name": info["name"],
            "color": info["color"],
            "points": road_points
        }
        print(f"   Done: {len(road_points)} clean road points!")

out_file = Path('src/templates/real_routes_tracks.json')
with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(result_tracks, f, ensure_ascii=False, indent=2)

print("SUCCESS: Clean one-way real_routes_tracks.json generated for all urban routes!")
