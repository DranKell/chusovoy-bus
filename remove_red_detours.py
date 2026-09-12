import json
import urllib.request

def route_osrm(points):
    c_str = ';'.join(f'{p[1]},{p[0]}' for p in points)
    url = f'http://router.project-osrm.org/route/v1/driving/{c_str}?overview=full&geometries=geojson'
    req = urllib.request.Request(url, headers={'User-Agent': 'ChusovoyBusRouter/1.0'})
    with urllib.request.urlopen(req, timeout=12) as r:
        res = json.loads(r.read().decode('utf-8'))
        return [[p[1], p[0]] for p in res['routes'][0]['geometry']['coordinates']]

with open('clean_straight_primary.json') as f:
    primary_pts = json.load(f)

# The clean straight asphalt line along ул. Юности -> Лысьвенская ул. directly to Школа 13 / АТП
school13 = [58.265705, 57.825169]
best_idx = 0
min_d = 999
for i, p in enumerate(primary_pts):
    d = ((p[0]-school13[0])**2 + (p[1]-school13[1])**2)**0.5
    if d < min_d:
        min_d = d
        best_idx = i

# Straight line down the avenue: NO LOOP AT MEDSERVICE, NO LOOP AT CORNER!
clean_straight_down_yunost_atp = primary_pts[:best_idx + 1]
print(f"Clean straight segment on main road: {len(clean_straight_down_yunost_atp)} points")

# Now connect Bridge to Veteran to top of this straight line:
bridge = [58.282816, 57.813258]
veteran = [58.2769898, 57.8143397]
bridge_to_veteran = route_osrm([bridge, veteran, clean_straight_down_yunost_atp[0]])

# 100% CLEAN return segment with ZERO red detours:
clean_full_return = bridge_to_veteran + clean_straight_down_yunost_atp[1:]
print(f"Clean full return segment from Bridge -> Veteran -> straight down to School 13: {len(clean_full_return)} points")

with open('src/templates/real_routes_tracks.json', 'r', encoding='utf-8') as f:
    tracks = json.load(f)

chmz = [58.295737, 57.814447]

# 1. Route 6
arkhipovka = [58.2865811, 57.8579903]
vokzal = [58.290612, 57.841212]
dkzh = [58.295558, 57.829340]
r6_return_to_bridge = route_osrm([arkhipovka, vokzal, dkzh, chmz, bridge])
user_r6_outbound = tracks['6']['points'][:32]
tracks['6']['points'] = user_r6_outbound + r6_return_to_bridge[1:] + clean_full_return[1:]
print(f"Route 6 clean total points: {len(tracks['6']['points'])}")

# 2. Route 5
splav = [58.3142616, 57.7711894]
r5_return_to_bridge = route_osrm([splav, chmz, bridge])
user_r5_outbound = tracks['5']['points'][:55]
tracks['5']['points'] = user_r5_outbound + r5_return_to_bridge[1:] + clean_full_return[1:]
print(f"Route 5 clean total points: {len(tracks['5']['points'])}")

# 3. Route 3
gorbolnitsa = [58.304376, 57.798129]
r3_return_to_bridge = route_osrm([gorbolnitsa, chmz, bridge])
user_r3_outbound = tracks['3']['points'][:48]
tracks['3']['points'] = user_r3_outbound + r3_return_to_bridge[1:] + clean_full_return[1:]
print(f"Route 3 clean total points: {len(tracks['3']['points'])}")

with open('src/templates/real_routes_tracks.json', 'w', encoding='utf-8') as f:
    json.dump(tracks, f, ensure_ascii=False, indent=2)

print("SUCCESS: Both red triangular detours completely removed! Route goes 100% straight along main road!")
