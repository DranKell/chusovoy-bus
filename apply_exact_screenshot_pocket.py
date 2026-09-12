import json
import urllib.request

with open('src/templates/real_routes_tracks.json', 'r', encoding='utf-8') as f:
    tracks = json.load(f)

with open('yunost_pocket_loop.json', 'r', encoding='utf-8') as f:
    pocket_loop = json.load(f)

def route_via_osrm(pts):
    coord_str = ';'.join(f'{p[1]},{p[0]}' for p in pts)
    url = f'http://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson'
    req = urllib.request.Request(url, headers={'User-Agent': 'ChusovoyBusRouter/1.0'})
    with urllib.request.urlopen(req, timeout=12) as r:
        res = json.loads(r.read().decode('utf-8'))
        return [[p[1], p[0]] for p in res['routes'][0]['geometry']['coordinates']]

# Bridge and Veteran
bridge = [58.282816, 57.813258]
veteran = [58.2769898, 57.8143397]
yunost = [58.272237, 57.816597]

# Segment from Bridge to Veteran to entry of pocket loop at ул. Юности
entry_to_pocket = pocket_loop[0] # [58.27100, 57.82100]
bridge_to_pocket = route_via_osrm([bridge, veteran, yunost, entry_to_pocket])

# The entire return segment into New Town via Veteran -> Юности -> карман вокруг 83/78/76 к Юбилейному -> АТП / Школа 13:
full_return_segment = bridge_to_pocket + pocket_loop[1:]
print(f"Full return segment with exact screenshot pocket: {len(full_return_segment)} points")

# Now connect this return segment into routes 3, 5, 6!
chmz = [58.295737, 57.814447]

# Route 6: Arkhipovka -> Vokzal -> ChMZ -> Bridge -> Veteran -> pocket -> Yubileyny -> School 13/ATP
arkhipovka = [58.2865811, 57.8579903]
vokzal = [58.290612, 57.841212]
dkzh = [58.295558, 57.829340]
r6_outbound_to_bridge = route_via_osrm([arkhipovka, vokzal, dkzh, chmz, bridge])
# User's outbound track (School 13 to Arkhipovka) + return via exact pocket
user_r6_outbound = tracks['6']['points'][:32] # 32 points up to Arkhipovka
tracks['6']['points'] = user_r6_outbound + r6_outbound_to_bridge[1:] + full_return_segment[1:]
print(f"Updated Route 6 with exact screenshot pocket: {len(tracks['6']['points'])} points")

# Route 5: Soplavschikov -> ChMZ -> Bridge -> Veteran -> pocket -> Yubileyny -> School 13/ATP
splav = [58.3142616, 57.7711894]
r5_outbound_to_bridge = route_via_osrm([splav, chmz, bridge])
user_r5_outbound = tracks['5']['points'][:55] # 55 points up to Soplavschikov
tracks['5']['points'] = user_r5_outbound + r5_outbound_to_bridge[1:] + full_return_segment[1:]
print(f"Updated Route 5 with exact screenshot pocket: {len(tracks['5']['points'])} points")

# Route 3: Gorbolnitsa -> ChMZ -> Bridge -> Veteran -> pocket -> Yubileyny -> School 13/ATP
gorbolnitsa = [58.304376, 57.798129]
r3_outbound_to_bridge = route_via_osrm([gorbolnitsa, chmz, bridge])
user_r3_outbound = tracks['3']['points'][:48] # up to Gorbolnitsa
tracks['3']['points'] = user_r3_outbound + r3_outbound_to_bridge[1:] + full_return_segment[1:]
print(f"Updated Route 3 with exact screenshot pocket: {len(tracks['3']['points'])} points")

with open('src/templates/real_routes_tracks.json', 'w', encoding='utf-8') as f:
    json.dump(tracks, f, ensure_ascii=False, indent=2)

print("SUCCESS: real_routes_tracks.json now follows the EXACT screenshot path!")
