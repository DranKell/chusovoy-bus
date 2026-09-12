import urllib.request
import json

# Detailed coordinates of the exact white polyline path from the user's screenshot:
# 1. Comes down from улица Юности (NW of the green triangle)
# 2. Turns into Лысьвенская улица past the green triangle (around house 81/83)
# 3. Turns right along house 83 / Автомойка
# 4. Curves around house 78 and house 76 towards Севастопольская
# 5. Passes остановка "Юбилейный" (58.2685877, 57.8245175)
# 6. Exits back onto the main road (Лысьвенская ул.) towards АТП / Школа №13

# The precise waypoints of this loop:
loop_waypoints = [
    [58.27100, 57.82100], # Улица Юности approaching intersection
    [58.27000, 57.82240], # Turn off main road along green park triangle
    [58.26985, 57.82310], # North of house 83
    [58.26960, 57.82390], # Corner near house 83A / Автомойка
    [58.26895, 57.82405], # West of house 78
    [58.26890, 57.82520], # Turn towards Севастопольская east of house 76
    [58.26858, 57.82535], # Corner onto the stop road
    [58.2685877, 57.8245175], # Exactly at остановка "Юбилейный" in front of house 78!
    [58.26820, 57.82350], # Joining main road
    [58.265705, 57.825169] # Arriving at АТП / Школа №13
]

coord_str = ';'.join(f'{p[1]},{p[0]}' for p in loop_waypoints)
url = f'http://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson'
req = urllib.request.Request(url, headers={'User-Agent': 'ChusovoyBusRouter/1.0'})
try:
    with urllib.request.urlopen(req, timeout=12) as r:
        res = json.loads(r.read().decode('utf-8'))
        snapped_loop = [[p[1], p[0]] for p in res['routes'][0]['geometry']['coordinates']]
        print(f"Generated precise loop through Юности -> дома 83/78/76 -> Юбилейный -> АТП: {len(snapped_loop)} points")
        with open('yunost_pocket_loop.json', 'w') as f:
            json.dump(snapped_loop, f, indent=2)
except Exception as e:
    print('OSRM error, using raw waypoints:', e)
    with open('yunost_pocket_loop.json', 'w') as f:
        json.dump(loop_waypoints, f, indent=2)
