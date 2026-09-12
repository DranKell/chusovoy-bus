import urllib.request
import json

def route_via_osrm(pts):
    coord_str = ';'.join(f'{p[1]},{p[0]}' for p in pts)
    url = f'http://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson'
    req = urllib.request.Request(url, headers={'User-Agent': 'ChusovoyBusRouter/1.0'})
    with urllib.request.urlopen(req, timeout=15) as r:
        res = json.loads(r.read().decode('utf-8'))
        return [[p[1], p[0]] for p in res['routes'][0]['geometry']['coordinates']]

with open('src/templates/real_routes_tracks.json', 'r', encoding='utf-8') as f:
    tracks = json.load(f)

# Key coordinates in Chusovoy
bridge = [58.282816, 57.813258]
veteran = [58.2769898, 57.8143397]     # 57.8143397, 58.2769898
yunost = [58.272237, 57.816597]       # Юность
yubileyny = [58.268588, 57.824517]    # Юбилейный
school13 = [58.265705, 57.825169]     # АТП / Школа 13
chmz = [58.295737, 57.814447]

# 1. Common return loop from bridge: Bridge -> Veteran -> Yunost -> Yubileyny -> School 13
print("Routing return loop through Veteran -> Yunost -> Yubileyny -> School 13...")
return_loop_segment = route_via_osrm([bridge, veteran, yunost, yubileyny, school13])
print(f"Return segment: {len(return_loop_segment)} points")

# 2. Route 6: Outbound (user points to Arkhipovka) + Inbound (Arkhipovka -> Bridge -> Veteran -> Yunost -> Yubileyny -> School 13)
arkhipovka = [58.2865811, 57.8579903]
vokzal = [58.290612, 57.841212]
dkzh = [58.295558, 57.829340]

print("Routing Route 6 return from Arkhipovka...")
r6_return = route_via_osrm([arkhipovka, vokzal, dkzh, chmz, bridge])
full_r6 = tracks['6']['points'] + r6_return[1:] + return_loop_segment[1:]
tracks['6']['points'] = full_r6
print(f"Route 6 full circle: {len(full_r6)} points")

# 3. Route 5: Outbound (user points to Splavschikov) + Inbound (Splavschikov -> Bridge -> Veteran -> Yunost -> Yubileyny -> School 13)
splav = [58.3142616, 57.7711894]
print("Routing Route 5 return from Soplavschikov...")
r5_return = route_via_osrm([splav, chmz, bridge])
full_r5 = tracks['5']['points'] + r5_return[1:] + return_loop_segment[1:]
tracks['5']['points'] = full_r5
print(f"Route 5 full circle: {len(full_r5)} points")

# 4. Route 3: Outbound to Gorbolnitsa + Inbound (Gorbolnitsa -> Bridge -> Veteran -> Yunost -> Yubileyny -> School 13)
def decode_polyline(polyline_str):
    index, lat, lng = 0, 0, 0
    coordinates = []
    changes = {'latitude': 0, 'longitude': 0}
    while index < len(polyline_str):
        for unit in ['latitude', 'longitude']:
            shift, result = 0, 0
            while True:
                byte = ord(polyline_str[index]) - 63
                index += 1
                result |= (byte & 0x1f) << shift
                shift += 5
                if not byte >= 0x20:
                    break
            if (result & 1):
                changes[unit] = ~(result >> 1)
            else:
                changes[unit] = (result >> 1)
        lat += changes['latitude']
        lng += changes['longitude']
        coordinates.append([lat / 100000.0, lng / 100000.0])
    return coordinates

poly3 = r"""g|rbJw{|_JdDsAn@~@P~As@tiACp@]h@y@\ql@`VsDwf@m@wFMq@i@m@o@XeK~D{ThJeBVaTb@iJv@_H|@yMZ}@Yu@{@o@oAgAsEsCcOGuDOq@cCcE]I]`@x@rD@x@Uv@sSnTaCeAw@{@mF}UcCiG}BbD{H|HkKtKe@~@oG~RyFdQwLhHlJdw@F\ZJjDeCuJox@nF{C|FgQhG{Rj@oAlMwMrFoFzBkDjCfGjFhVT~CLr@d@VbWmXRa@@q@{@iEb@c@VJb@nAvBlJfExSj@zA~@rAt@^x@HxL_@jH_AtI}@fQYtBEdB[|a@_Q~@g@v@OpEmBz@y@r@mApOu`@`@[~RiH??"""
pts3 = decode_polyline(poly3)

gorbolnitsa = [58.304376, 57.798129]
print("Routing Route 3 return from Gorbolnitsa...")
r3_return = route_via_osrm([gorbolnitsa, chmz, bridge])
full_r3 = pts3[:48] + r3_return[1:] + return_loop_segment[1:]
tracks['3'] = {
    "color": "#dc2626",
    "name": "Школа №13 — Горбольница",
    "points": full_r3
}
print(f"Route 3 full circle: {len(full_r3)} points")

with open('src/templates/real_routes_tracks.json', 'w', encoding='utf-8') as f:
    json.dump(tracks, f, ensure_ascii=False, indent=2)

print("SUCCESS: real_routes_tracks.json updated with routes 3, 5, 6 including the return loop via Veteran -> Yunost -> Yubileyny -> School 13 / ATP!")
