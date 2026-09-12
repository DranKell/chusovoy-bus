"""
SVG City Map Builder for Chusovoy Bus Network
Constructs a modern, ultra-crisp vector map of Chusovoy (viewBox="0 0 1600 1000")
Includes:
- Chusovaya and Usva rivers geometry
- Road network (Main streets, Automobile Bridge, Railroad)
- Official Emblems of Perm Krai & Chusovoy District (top-left)
- Route color-coded lines matching the official legend
- Stops markers
"""

import json

# Official color palette for routes
ROUTE_COLORS = {
    "1": "#2563eb",   # Royal Blue
    "3": "#dc2626",   # Permian Red
    "4": "#059669",   # Emerald Green
    "5": "#7c3aed",   # Purple
    "6": "#d97706",   # Amber
    "7": "#0891b2",   # Cyan
    "9": "#db2777",   # Deep Pink
    "10": "#ea580c",  # Orange
    "11": "#0d9488",  # Teal
    "12": "#4f46e5",  # Indigo
    "15": "#65a30d",  # Lime
    "16": "#9333ea",  # Violet
    "17": "#e11d48",  # Rose
    "22": "#0284c7"   # Sky Blue
}

# Calibrated Stop Coordinates on 1600 x 1000 Canvas:
# Bridge is at X: 730..840, Y: 530..560
# West/Old Town is X: 100..700
# East/New Town is X: 850..1500
STOPS = {
    # Old Town / Left Bank (West)
    "ул.Революционная": (110, 330),
    "магазин «БРАВО»": (170, 320),
    "Церковь": (200, 380),
    "Поликлиника": (310, 350),
    "Горбольница": (290, 450),
    "ул.Переездная": (240, 420),
    "КДЦ": (330, 400),
    "Администрация": (410, 350),
    "Дом спорта": (540, 350),
    "Автостанция": (510, 410),
    "пл.ЧМЗ": (530, 440),
    "Французская": (630, 480),
    "ул.Южная": (410, 440),
    "ул.Коммунальная": (440, 510),
    "РМЗ": (350, 540),
    "ул.Сплавщиков": (110, 610),
    "ул.Черноморская": (190, 615),
    "ул.Каспийская": (190, 650),
    "ул.Вильвенская": (190, 690),
    "Молокозавод": (230, 695),
    "Кладбище": (290, 260),

    # Bridge
    "Мост_Левый": (710, 525),
    "Мост_Правый": (830, 555),

    # North Road (Вокзал, Архиповка, Такман)
    "ДКЖ": (680, 310),
    "ул.Матросова": (770, 275),
    "ж/д вокзал": (850, 240),
    "ПЧ-16": (950, 225),
    "п.Архиповка": (1030, 225),
    "ГЛК Такман": (1180, 160),

    # New Town / Right Bank (East)
    "пл.Металлургов": (1140, 435),
    "ул.Луначарского": (1220, 425),
    "ул.Парковая": (1270, 425),
    "ул.Севастопольская": (1330, 455),
    "ул.Победы": (1220, 485),
    "ул.Пермская": (1270, 515),
    "Юбилейная": (1230, 540),
    "Школа №13": (1350, 560),
    "ул.Чайковского": (1220, 580),
    "ул.Сивкова": (1350, 645),
    "Преображенска": (1320, 730),
    "Ротонда": (1170, 710),
    "ул.Мира": (1090, 680),
    "Техникум": (1015, 600),
    "ул.Юности": (1090, 600),
    "ул.Чкалова": (935, 535),
    "пер.Чунжинский": (950, 485),
    "пер.Краснофлотский": (950, 445),
    "пер.Кольцова": (990, 365),
    "к/с Горняк": (1120, 375),
    "ул.Кирова": (1040, 345),

    # South East (Коммунистическая, Кошково)
    "50лет ВЛКСМ": (990, 725),
    "Спорткомплекс": (1090, 830),
    "ул.Коммунистическая": (1015, 830),
    "Закурье": (870, 770),
    "п.Совхозный": (870, 770),
    "п.Кошково": (890, 850),
    "Мелькомбинат": (890, 850)
}

# Smooth Polylines for each route
# Using Stop keys that form the exact sequence along streets
ROUTE_WAYPOINTS = {
    "1": ["пл.ЧМЗ", "Французская", "Мост_Левый", "Мост_Правый", "ул.Чкалова", "50лет ВЛКСМ", "Закурье"],
    "3": ["Школа №13", "ул.Сивкова", "Преображенска", "Ротонда", "ул.Мира", "Юбилейная", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "КДЦ", "Поликлиника", "Горбольница"],
    "4": ["ул.Кирова", "к/с Горняк", "ул.Луначарского", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "Дом спорта", "ДКЖ", "ул.Матросова", "ж/д вокзал", "ПЧ-16", "п.Архиповка"],
    "5": ["Школа №13", "ул.Чайковского", "Юбилейная", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "ул.Южная", "ул.Коммунальная", "РМЗ", "ул.Черноморская", "ул.Сплавщиков"],
    "6": ["Школа №13", "ул.Сивкова", "Преображенска", "ул.Мира", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "ДКЖ", "ж/д вокзал", "п.Архиповка"],
    "7": ["пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "КДЦ", "Поликлиника", "Церковь", "магазин «БРАВО»", "ул.Революционная"],
    "9": ["ул.Коммунистическая", "Спорткомплекс", "ул.Мира", "Юбилейная", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "КДЦ", "Поликлиника", "Горбольница"],
    "10": ["ул.Коммунистическая", "Спорткомплекс", "ул.Мира", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "ДКЖ", "ж/д вокзал", "п.Архиповка"],
    "11": ["Школа №13", "ул.Сивкова", "Преображенска", "Ротонда", "ул.Мира", "50лет ВЛКСМ", "Спорткомплекс", "ул.Коммунистическая"],
    "12": ["пл.ЧМЗ", "Французская", "Мост_Левый", "Мост_Правый", "ул.Чкалова", "50лет ВЛКСМ", "Закурье", "п.Кошково"],
    "15": ["ул.Севастопольская", "ул.Парковая", "пл.Металлургов", "Юбилейная", "Школа №13", "ул.Сивкова", "Преображенска", "ул.Мира", "Спорткомплекс", "ул.Коммунистическая"],
    "16": ["Школа №13", "ул.Сивкова", "Преображенска", "ул.Мира", "Техникум", "ул.Чкалова", "пер.Чунжинский", "пер.Краснофлотский", "пер.Кольцова", "ул.Кирова"],
    "17": ["Школа №13", "ул.Чайковского", "Юбилейная", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "Мост_Левый", "Мост_Правый", "50лет ВЛКСМ", "Закурье", "п.Кошково"],
    "22": ["Школа №13", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "пл.ЧМЗ", "ДКЖ", "ж/д вокзал", "п.Архиповка", "ГЛК Такман"]
}

def generate_svg():
    svg = []
    svg.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" class="city-vector-map" id="cityVectorMap">')
    svg.append('  <defs>')
    # Glow filters and gradients
    svg.append('    <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">')
    svg.append('      <feGaussianBlur stdDeviation="3.5" result="blur" />')
    svg.append('      <feComposite in="SourceGraphic" in2="blur" operator="over" />')
    svg.append('    </filter>')
    svg.append('    <linearGradient id="riverGrad" x1="0%" y1="0%" x2="100%" y2="100%">')
    svg.append('      <stop offset="0%" stop-color="#1e3a5f" stop-opacity="0.85" />')
    svg.append('      <stop offset="100%" stop-color="#0f2b48" stop-opacity="0.95" />')
    svg.append('    </linearGradient>')
    svg.append('    <linearGradient id="bridgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">')
    svg.append('      <stop offset="0%" stop-color="#fbbf24" />')
    svg.append('      <stop offset="50%" stop-color="#f59e0b" />')
    svg.append('      <stop offset="100%" stop-color="#d97706" />')
    svg.append('    </linearGradient>')
    svg.append('  </defs>')

    # 1. Base Map Canvas (Subtle map styling)
    svg.append('  <!-- Canvas Base -->')
    svg.append('  <rect width="1600" height="1000" fill="#0d1117" class="map-bg"/>')
    svg.append('  <g class="map-districts-shading">')
    # West Old Town shading
    svg.append('    <path d="M 80 200 L 680 200 L 730 540 L 450 750 L 80 750 Z" fill="#161b22" opacity="0.6" rx="20"/>')
    # East New Town shading
    svg.append('    <path d="M 850 300 L 1480 300 L 1480 880 L 850 880 Z" fill="#161b22" opacity="0.6" rx="20"/>')
    svg.append('  </g>')

    # 2. Rivers (Chusovaya and Usva)
    # Chusovaya curves through center: flowing from south (790, 1000) northward and curving west (780, 540) then north-west
    svg.append('  <!-- Rivers Network -->')
    svg.append('  <path d="M 760 1000 C 780 800, 810 650, 770 540 C 740 460, 660 380, 600 320 C 530 250, 480 180, 450 0 L 530 0 C 560 160, 610 220, 670 280 C 740 350, 830 440, 850 540 C 880 670, 860 810, 840 1000 Z" fill="url(#riverGrad)" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.4"/>')
    # Usva River flowing into Chusovaya from north-east
    svg.append('  <path d="M 1200 0 C 1120 100, 950 180, 810 260 C 740 300, 680 320, 600 320 L 620 360 C 710 360, 780 320, 850 280 C 980 210, 1140 130, 1240 0 Z" fill="url(#riverGrad)" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.4"/>')

    # River Labels
    svg.append('  <text x="750" y="880" fill="#38bdf8" font-size="14" font-weight="700" letter-spacing="4" opacity="0.5" transform="rotate(-75 750 880)">Р. ЧУСОВАЯ</text>')
    svg.append('  <text x="960" y="220" fill="#38bdf8" font-size="13" font-weight="700" letter-spacing="3" opacity="0.5" transform="rotate(-20 960 220)">Р. УСЬВА</text>')

    # 3. Automobile Bridge across Chusovaya
    svg.append('  <!-- Chusovaya Automobile Bridge -->')
    svg.append('  <g class="map-bridge" id="chusovayaBridge">')
    svg.append('    <line x1="710" y1="525" x2="830" y2="555" stroke="#f59e0b" stroke-width="12" stroke-linecap="round"/>')
    svg.append('    <line x1="710" y1="525" x2="830" y2="555" stroke="#ffffff" stroke-width="2" stroke-dasharray="6,6"/>')
    svg.append('    <text x="770" y="520" fill="#fef08a" font-size="11" font-weight="800" text-anchor="middle" letter-spacing="1">АВТОМОБИЛЬНЫЙ МОСТ</text>')
    svg.append('  </g>')

    # 4. District Headers & Landmark Labels
    svg.append('  <!-- District Labels -->')
    svg.append('  <text x="350" y="230" fill="#64748b" font-size="18" font-weight="800" letter-spacing="2">СТАРЫЙ ГОРОД (ЧМЗ / ПОЛИКЛИНИКА)</text>')
    svg.append('  <text x="1100" y="270" fill="#64748b" font-size="18" font-weight="800" letter-spacing="2">НОВЫЙ ГОРОД (МИРА / СИВКОВА / МЕТАЛЛУРГОВ)</text>')
    svg.append('  <text x="850" y="215" fill="#94a3b8" font-size="13" font-weight="700">Ж/Д ВОКЗАЛ ЧУСОВСКАЯ</text>')

    # 5. Base Street Grid (Neutral Background Roads)
    svg.append('  <!-- Base Road Network -->')
    # Build a set of all street segments from routes
    road_segments = set()
    for r_num, wp in ROUTE_WAYPOINTS.items():
        for i in range(len(wp) - 1):
            p1 = STOPS[wp[i]]
            p2 = STOPS[wp[i+1]]
            seg = tuple(sorted([p1, p2]))
            road_segments.add(seg)

    for (p1, p2) in road_segments:
        svg.append(f'  <line x1="{p1[0]}" y1="{p1[1]}" x2="{p2[0]}" y2="{p2[1]}" stroke="#334155" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>')
        svg.append(f'  <line x1="{p1[0]}" y1="{p1[1]}" x2="{p2[0]}" y2="{p2[1]}" stroke="#1e293b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')

    # 6. Route Paths (Colored Vector Trajectories)
    svg.append('  <!-- Interactive Route Trajectories -->')
    for r_num, wp in ROUTE_WAYPOINTS.items():
        color = ROUTE_COLORS.get(r_num, "#f59e0b")
        points_d = []
        for idx, stop_name in enumerate(wp):
            pt = STOPS[stop_name]
            cmd = "M" if idx == 0 else "L"
            points_d.append(f"{cmd} {pt[0]} {pt[1]}")
        d_str = " ".join(points_d)

        # Inactive base track
        svg.append(f'  <path id="routePath-{r_num}" class="vector-route-path" data-route="{r_num}" d="{d_str}" fill="none" stroke="{color}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.35" style="transition: all 0.3s ease;"/>')

    # 7. Bus Stops (Nodes on the map)
    svg.append('  <!-- Bus Stops Stations -->')
    for name, (x, y) in STOPS.items():
        if "Мост" in name:
            continue
        is_terminal = any(name in [wp[0], wp[-1]] for wp in ROUTE_WAYPOINTS.values())
        radius = 5.5 if is_terminal else 3.8
        color = "#f59e0b" if is_terminal else "#e2e8f0"
        stroke = "#0f172a"

        svg.append(f'  <g class="map-stop-node" data-stop="{name}">')
        svg.append(f'    <circle cx="{x}" cy="{y}" r="{radius}" fill="{color}" stroke="{stroke}" stroke-width="2"/>')
        # Labels for key stops
        if is_terminal or name in ["пл.Металлургов", "пл.ЧМЗ", "Школа №13", "ул.Мира", "ж/д вокзал", "Горбольница"]:
            align = "start" if x < 800 else "end"
            dx = 8 if x < 800 else -8
            svg.append(f'    <text x="{x + dx}" y="{y - 7}" fill="#f1f5f9" font-size="10.5" font-weight="700" text-anchor="{align}" class="map-stop-label">{name}</text>')
        svg.append('  </g>')

    # 8. Emblems of Perm Krai & Chusovoy (Top Left Crests)
    svg.append('  <!-- Municipal Crests: Perm Krai & Chusovoy District (Top Left) -->')
    svg.append('  <g class="map-crests-group" transform="translate(30, 25)">')
    # Emblem Container Panel
    svg.append('    <rect width="360" height="76" rx="12" fill="#1e293b" fill-opacity="0.9" stroke="#334155" stroke-width="1.5"/>')

    # Perm Krai Bear Crest (Silver Bear on Red Shield with Gospel)
    svg.append('    <g transform="translate(14, 10)">')
    svg.append('      <!-- Red Heraldic Shield -->')
    svg.append('      <path d="M 0 0 L 36 0 C 36 28, 30 46, 18 54 C 6 46, 0 28, 0 0 Z" fill="#dc2626" stroke="#fbbf24" stroke-width="1.5"/>')
    # Silver Walking Bear
    svg.append('      <path d="M 8 32 C 10 26, 16 26, 18 28 C 22 24, 28 26, 30 32 L 28 36 L 24 36 L 22 33 L 16 33 L 14 36 L 8 36 Z" fill="#ffffff"/>')
    # Golden Bible / Gospel on bear back
    svg.append('      <rect x="15" y="20" width="8" height="6" rx="1" fill="#fef08a" stroke="#d97706" stroke-width="0.8"/>')
    # Orthodox Cross
    svg.append('      <line x1="19" y1="14" x2="19" y2="20" stroke="#fef08a" stroke-width="1.2"/>')
    svg.append('      <line x1="16.5" y1="16.5" x2="21.5" y2="16.5" stroke="#fef08a" stroke-width="1.2"/>')
    svg.append('    </g>')

    # Chusovoy Coat of Arms (Blue river, smelting furnace fire, crossed oars)
    svg.append('    <g transform="translate(62, 10)">')
    svg.append('      <!-- Shield -->')
    svg.append('      <path d="M 0 0 L 36 0 C 36 28, 30 46, 18 54 C 6 46, 0 28, 0 0 Z" fill="#0284c7" stroke="#fbbf24" stroke-width="1.5"/>')
    # Flaming metallurgical furnace bowl
    svg.append('      <path d="M 6 36 L 30 36 C 28 42, 22 46, 18 46 C 14 46, 8 42, 6 36 Z" fill="#334155" stroke="#f59e0b" stroke-width="1"/>')
    svg.append('      <path d="M 12 34 Q 18 22 24 34 Q 21 28 18 31 Q 15 28 12 34 Z" fill="#ea580c"/>')
    # Silver River Wavy Band
    svg.append('      <path d="M 2 16 Q 18 22 34 16 L 34 22 Q 18 28 2 22 Z" fill="#ffffff" opacity="0.85"/>')
    svg.append('    </g>')

    # Typography text next to emblems
    svg.append('    <g transform="translate(112, 24)">')
    svg.append('      <text x="0" y="0" fill="#f8fafc" font-size="12" font-weight="900" letter-spacing="0.5">ЧУСОВСКОЙ ГОРОДСКОЙ ОКРУГ</text>')
    svg.append('      <text x="0" y="16" fill="#fbbf24" font-size="10.5" font-weight="700">ОФИЦИАЛЬНАЯ СХЕМА АВТОБУСНЫХ МАРШРУТОВ</text>')
    svg.append('      <text x="0" y="31" fill="#94a3b8" font-size="9" font-weight="600">МУП «ЧУСОВСКОЕ АТП» • ПЕРМСКИЙ КРАЙ</text>')
    svg.append('    </g>')
    svg.append('  </g>')

    # Close SVG
    svg.append('</svg>')
    return "\n".join(svg)

if __name__ == "__main__":
    svg_content = generate_svg()
    out_path = "src/templates/city_map.svg"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"Generated {out_path} ({len(svg_content)} bytes)")
