import urllib.request
import urllib.parse
import json

overpass_url = "https://overpass-api.de/api/interpreter"
# Bounding box around Chusovoy:
# South: 58.25, West: 57.73, North: 58.33, East: 57.88
query = """
[out:json][timeout:50];
(
  way["waterway"="river"](58.25, 57.73, 58.33, 57.88);
  way["highway"~"primary|secondary|tertiary|residential|trunk"](58.25, 57.73, 58.33, 57.88);
  node["highway"="bus_stop"](58.25, 57.73, 58.33, 57.88);
);
out geom;
"""

req = urllib.request.Request(
    overpass_url,
    data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
    headers={"User-Agent": "ChusovoyMapBuilder/1.0"}
)

try:
    print("Requesting OSM data for Chusovoy...")
    with urllib.request.urlopen(req, timeout=50) as r:
        data = json.loads(r.read().decode("utf-8"))
        elements = data.get("elements", [])
        print(f"Total elements fetched: {len(elements)}")
        with open("osm_geometry.json", "w", encoding="utf-8") as f:
            json.dump(elements, f, ensure_ascii=False)
        print("Saved to osm_geometry.json")
except Exception as e:
    print("Error:", e)
