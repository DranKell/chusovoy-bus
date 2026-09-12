import urllib.request
import json

def route_osrm(points):
    c_str = ';'.join(f'{p[1]},{p[0]}' for p in points)
    url = f'http://router.project-osrm.org/route/v1/driving/{c_str}?overview=full&geometries=geojson'
    req = urllib.request.Request(url, headers={'User-Agent': 'ChusovoyBusRouter/1.0'})
    with urllib.request.urlopen(req, timeout=12) as r:
        res = json.loads(r.read().decode('utf-8'))
        return [[p[1], p[0]] for p in res['routes'][0]['geometry']['coordinates']]

# User exact GeoJSON coordinates for Юности - Юбилейный - АТП (converted from [lon, lat] to [lat, lon]):
USER_EXACT_YUNOST_ATP = [
  [58.2696603, 57.8209781],
  [58.26896, 57.8223265],
  [58.2685039, 57.8231778],
  [58.2683253, 57.8233347],
  [58.2681007, 57.8233689],
  [58.2673832, 57.8237011],
  [58.2663184, 57.8242378],
  [58.265705, 57.825169] # Arriving at Школа 13 / АТП
]

# 1. Connect user exact segment smoothly along the road
exact_yunost_atp_road = route_osrm(USER_EXACT_YUNOST_ATP)
print(f"Exact road segment from Юности to АТП: {len(exact_yunost_atp_road)} points")

# Common transit nodes in Chusovoy
bridge = [58.282816, 57.813258]
veteran = [58.2769898, 57.8143397]
yunost_entry = [58.272237, 57.816597]
chmz = [58.295737, 57.814447]

# Segment from Bridge through Veteran to Юность entry:
bridge_to_yunost = route_osrm([bridge, veteran, yunost_entry, USER_EXACT_YUNOST_ATP[0]])
full_return_segment = bridge_to_yunost + exact_yunost_atp_road[1:]
print(f"Full return through Veteran -> Yunost -> exact user coords -> АТП: {len(full_return_segment)} points")

with open('src/templates/real_routes_tracks.json', 'r', encoding='utf-8') as f:
    tracks = json.load(f)

# Route 6: User outbound (School 13 -> Arkhipovka) + return via Bridge -> Veteran -> exact user coords -> АТП
arkhipovka = [58.2865811, 57.8579903]
vokzal = [58.290612, 57.841212]
dkzh = [58.295558, 57.829340]
r6_return_to_bridge = route_osrm([arkhipovka, vokzal, dkzh, chmz, bridge])
user_r6_outbound = tracks['6']['points'][:32] # 32 points up to Arkhipovka
tracks['6']['points'] = user_r6_outbound + r6_return_to_bridge[1:] + full_return_segment[1:]
print(f"Route 6 updated: {len(tracks['6']['points'])} points")

# Route 5: User outbound (School 13 -> Splavschikov) + return via Bridge -> Veteran -> exact user coords -> АТП
splav = [58.3142616, 57.7711894]
r5_return_to_bridge = route_osrm([splav, chmz, bridge])
user_r5_outbound = tracks['5']['points'][:55] # 55 points up to Splavschikov
tracks['5']['points'] = user_r5_outbound + r5_return_to_bridge[1:] + full_return_segment[1:]
print(f"Route 5 updated: {len(tracks['5']['points'])} points")

# Route 3: User outbound (School 13 -> Gorbolnitsa) + return via Bridge -> Veteran -> exact user coords -> АТП
gorbolnitsa = [58.304376, 57.798129]
r3_return_to_bridge = route_osrm([gorbolnitsa, chmz, bridge])
user_r3_outbound = tracks['3']['points'][:48] # up to Gorbolnitsa
tracks['3']['points'] = user_r3_outbound + r3_return_to_bridge[1:] + full_return_segment[1:]
print(f"Route 3 updated: {len(tracks['3']['points'])} points")

with open('src/templates/real_routes_tracks.json', 'w', encoding='utf-8') as f:
    json.dump(tracks, f, ensure_ascii=False, indent=2)

print("SUCCESS: real_routes_tracks.json updated with user's EXACT coordinates!")
