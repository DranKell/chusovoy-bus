import urllib.request
import urllib.parse
import json

overpass_url = "https://overpass-api.de/api/interpreter"
# Bounding box around Chusovoy: south, west, north, east
# Lat: 58.24 to 58.34, Lon: 57.70 to 57.90
query = """
[out:json][timeout:30];
(
  node["highway"="bus_stop"](58.24, 57.70, 58.34, 57.90);
  relation["type"="route"]["route"="bus"](58.24, 57.70, 58.34, 57.90);
);
out tags center;
"""

req = urllib.request.Request(
    overpass_url,
    data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
    headers={"User-Agent": "ChusovoyBusResearch/1.0"}
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        elements = data.get("elements", [])
        print(f"Total elements fetched: {len(elements)}")
        stops = [e for e in elements if e.get("type") == "node"]
        routes = [e for e in elements if e.get("type") == "relation"]
        print(f"Stops count: {len(stops)}, Routes count: {len(routes)}")
        
        with open("osm_chusovoy_sample.json", "w", encoding="utf-8") as f:
            json.dump(elements, f, ensure_ascii=False, indent=2)
            
        print("\n--- Example Stops in Chusovoy OSM ---")
        for s in stops[:12]:
            tags = s.get("tags", {})
            name = tags.get("name")
            if name:
                print(f"  {name}: lat={s.get('lat')}, lon={s.get('lon')}")
                
        print("\n--- Example Routes in Chusovoy OSM ---")
        for r in routes[:8]:
            tags = r.get("tags", {})
            print(f"  №{tags.get('ref')}: {tags.get('name')} (from: {tags.get('from')}, to: {tags.get('to')})")
except Exception as e:
    print("Error:", e)
