"""
OSM Geo Toolkit for Chusovoy Bus Network
Универсальный инструмент для запроса дорог, геометрии и остановок через Overpass API.

Примеры использования из консоли:
  python osm_tool.py corner 58.2721 57.818 --radius 150
  python osm_tool.py street "улица Космонавтов"
  python osm_tool.py stops 58.26 57.80 58.28 57.83
  python osm_tool.py bbox 58.263 57.823 58.266 57.827
"""

import urllib.request
import urllib.parse
import json
import argparse
import sys

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "ChusovoyBusGeoTool/2.0"

def query_overpass(query: str, timeout: int = 25):
    """Выполняет запрос к Overpass API и возвращает распарсенный JSON."""
    url = OVERPASS_URL + "?data=" + urllib.parse.quote(query)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[ERROR] Overpass query failed: {e}", file=sys.stderr)
        return None

def find_ways_around(lat: float, lon: float, radius: int = 150):
    """Ищет все дороги в радиусе вокруг заданной точки (перекресток / поворот)."""
    q = f"""[out:json];
way(around:{radius}, {lat}, {lon})["highway"];
out geom;"""
    data = query_overpass(q)
    if not data:
        return []
    
    results = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        pts = [[p["lat"], p["lon"]] for p in el.get("geometry", [])]
        results.append({
            "id": el["id"],
            "name": tags.get("name"),
            "highway": tags.get("highway"),
            "oneway": tags.get("oneway"),
            "points_count": len(pts),
            "points": pts
        })
    return results

def find_street_geometry(street_name: str, bbox: str = "58.25,57.75,58.33,57.88"):
    """Находит сегменты улицы по названию внутри заданного bbox г. Чусовой."""
    q = f"""[out:json];
way["name"~"{street_name}"]({bbox});
out geom;"""
    data = query_overpass(q)
    if not data:
        return []
    
    results = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        pts = [[p["lat"], p["lon"]] for p in el.get("geometry", [])]
        results.append({
            "id": el["id"],
            "name": tags.get("name"),
            "highway": tags.get("highway"),
            "points_count": len(pts),
            "points": pts
        })
    return results

def find_bus_stops(lat_min: float, lon_min: float, lat_max: float, lon_max: float):
    """Ищет все остановки в заданном прямоугольнике координат."""
    q = f"""[out:json];
node["highway"="bus_stop"]({lat_min},{lon_min},{lat_max},{lon_max});
out tags;"""
    data = query_overpass(q)
    if not data:
        return []
    
    stops = []
    for el in data.get("elements", []):
        name = el.get("tags", {}).get("name")
        if name:
            stops.append({
                "name": name,
                "lat": el.get("lat"),
                "lon": el.get("lon")
            })
    return stops

def main():
    parser = argparse.ArgumentParser(description="Универсальный инструмент для запросов дорожной сети OSM")
    subparsers = parser.add_subparsers(dest="command", help="Команды")

    # Command: corner
    corner_p = subparsers.add_parser("corner", help="Найти дороги на перекрестке/в радиусе")
    corner_p.add_argument("lat", type=float, help="Широта центра")
    corner_p.add_argument("lon", type=float, help="Долгота центра")
    corner_p.add_argument("--radius", type=int, default=150, help="Радиус поиска в метрах (по умолч. 150)")

    # Command: street
    street_p = subparsers.add_parser("street", help="Найти геометрию улицы по имени")
    street_p.add_argument("name", type=str, help="Название улицы (или фрагмент)")

    # Command: stops
    stops_p = subparsers.add_parser("stops", help="Найти остановки по bbox")
    stops_p.add_argument("lat_min", type=float)
    stops_p.add_argument("lon_min", type=float)
    stops_p.add_argument("lat_max", type=float)
    stops_p.add_argument("lon_max", type=float)

    args = parser.parse_args()

    if args.command == "corner":
        ways = find_ways_around(args.lat, args.lon, args.radius)
        print(f"\nНайдено дорог: {len(ways)}")
        for w in ways:
            print(f"\nWay {w['id']}: name='{w['name']}' hw='{w['highway']}' points={w['points_count']}")
            print(f"  Начало: {w['points'][0] if w['points'] else 'None'}")
            print(f"  Конец:  {w['points'][-1] if w['points'] else 'None'}")
            print(f"  Координаты: {w['points']}")

    elif args.command == "street":
        ways = find_street_geometry(args.name)
        print(f"\nНайдено участков улицы '{args.name}': {len(ways)}")
        for w in ways:
            print(f"\nWay {w['id']}: name='{w['name']}' hw='{w['highway']}' points={w['points_count']}")
            print(f"  Начало: {w['points'][0] if w['points'] else 'None'}")
            print(f"  Конец:  {w['points'][-1] if w['points'] else 'None'}")
            print(f"  Координаты: {w['points']}")

    elif args.command == "stops":
        stops = find_bus_stops(args.lat_min, args.lon_min, args.lat_max, args.lon_max)
        print(f"\nНайдено остановок: {len(stops)}")
        for s in stops:
            print(f"  {s['name']}: [{s['lat']}, {s['lon']}]")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
