"""
Universal Google Sheets Schedule Parser for Chusovoy Bus System.
Parses urban and suburban routes, preserving special trip remarks,
days of operation, and directional stops.
"""

import urllib.request
import csv
import io
import re
import json
import logging
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SHEET_ID = "1nzePEfu6Vxki9aJG8i3t4kulrf1NXOnTrL1xPdPnIhk"

# All known sheet GIDs in the spreadsheet
SHEET_GIDS = [
    "1493284544",  # Маршрут 1
    "1707236720",  # Маршрут 3 (будни/выходные)
    "724645823",   # Маршрут 4
    "1439884697",  # Маршрут 5
    "1807952400",  # Маршрут 6
    "1704743358",  # Маршрут 7
    "1031206989",  # Маршрут 9
    "412340678",   # Маршрут 10
    "242965799",   # Маршрут 11
    "982105709",   # Маршрут 12
    "1981236561",  # Маршрут 15
    "1776587544",  # Маршрут 16
    "1147588788",  # Маршрут 17
    "748410195",   # Маршрут 22 (Такман: утро / вечер)
    "740366988"    # Пригородные: 0/101, 322, 323, 324, 325, 365, 373, 474
]

TIME_REGEX = re.compile(r"^(\d{1,2})[-:](\d{2})(.*)$")

def clean_text(s: str) -> str:
    if not s:
        return ""
    s = s.replace("\xa0", " ").strip()
    s = re.sub(r'["\']+$|^["\']+', '', s).strip()
    return s

def parse_time_and_note(cell_value: str) -> Optional[Dict[str, str]]:
    """
    Parses cell value like '6-00 из АТП' or '10-00 Сб.' or '7-45'
    Returns {'time': '06:00', 'note': 'из АТП', 'raw': cell_value} or None.
    """
    cleaned = clean_text(cell_value)
    if not cleaned:
        return None
    
    m = TIME_REGEX.match(cleaned)
    if not m:
        return None
    
    hours, minutes, note = m.groups()
    h = int(hours)
    m_int = int(minutes)
    if not (0 <= h <= 24 and 0 <= m_int < 60):
        return None
    
    time_formatted = f"{h:02d}:{m_int:02d}"
    note_cleaned = clean_text(note)
    
    return {
        "time": time_formatted,
        "note": note_cleaned,
        "raw": cleaned
    }

def fetch_sheet_csv(sheet_id: str, gid: str) -> List[List[str]]:
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&gid={gid}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        content = resp.read().decode("utf-8")
    
    rows = list(csv.reader(io.StringIO(content)))
    cleaned_rows = []
    for row in rows:
        cleaned_row = [clean_text(c) for c in row]
        if any(cleaned_row):
            cleaned_rows.append(cleaned_row)
    return cleaned_rows

def parse_gid_740366988(rows: List[List[str]]) -> List[Dict[str, Any]]:
    """
    Complex suburban sheet with multiple routes side by side (left cols A-D, right cols E-I):
    Routes:
      Left: 0/101 (АС Чусовой - п.Всесвятская), 322 (п.Кучино), 325 (п.Копально), 365 (п.Центральный), 324 (ст.Калино)
      Right: 323 (п.Мыс: В п.Мыс / Из п.Мыс), 373 (с.Сёла: В с.Сёла / Из с.Сёла), 474 (п.В/чусовские Городки - ст.Комарихинская)
    """
    routes = []
    
    left_ranges = []
    for i, row in enumerate(rows):
        first_cell = row[0] if len(row) > 0 else ""
        second_cell = row[1] if len(row) > 1 else ""
        if i == 0 and "Всесвятская" in second_cell:
            left_ranges.append((0, "101", second_cell))
        elif re.match(r"^\d{3}$", first_cell) and "АС Чусовой" in second_cell:
            left_ranges.append((i, first_cell, second_cell))
    
    for idx, (start_row, r_num, r_name) in enumerate(left_ranges):
        end_row = left_ranges[idx + 1][0] if idx + 1 < len(left_ranges) else len(rows)
        streets = ""
        stops = []
        schedule = []
        
        for r_idx in range(start_row, end_row):
            row = rows[r_idx]
            left_cells = row[:4] if len(row) >= 4 else row
            
            for c in left_cells:
                if c.startswith("Через:"):
                    streets = c.replace("Через:", "").strip()
            
            if not stops:
                potential = [c for c in left_cells[1:4] if c and not parse_time_and_note(c) and not c.startswith("Через:") and c != "0"]
                if len(potential) >= 2 and any("АС" in p or "п." in p or "ст." in p for p in potential):
                    stops = potential
                    continue
            
            if stops:
                times_in_row = []
                for c_idx in range(1, 1 + len(stops)):
                    if c_idx < len(left_cells):
                        t_obj = parse_time_and_note(left_cells[c_idx])
                        times_in_row.append(t_obj)
                    else:
                        times_in_row.append(None)
                
                if any(times_in_row):
                    trip = {}
                    for s_idx, stop_name in enumerate(stops):
                        trip[stop_name] = times_in_row[s_idx]
                    schedule.append(trip)
        
        if schedule:
            routes.append({
                "number": r_num if r_num != "0" else "101",
                "name": r_name,
                "streets": streets,
                "category": "suburban",
                "scheduleType": "daily",
                "sections": [{
                    "title": "Ежедневно / По расписанию",
                    "type": "all",
                    "stops": stops,
                    "schedule": schedule
                }]
            })

    right_routes_info = [
        {"num": "323", "name": "АС Чусовой - п.Мыс", "start_row": 0, "end_row": 16},
        {"num": "373", "name": "АС Чусовой - с.Сёла", "start_row": 16, "end_row": 28},
        {"num": "474", "name": "п.В/чусовские Городки - ст.Комарихинская", "start_row": 28, "end_row": len(rows)}
    ]
    
    for r_def in right_routes_info:
        r_num = r_def["num"]
        r_name = r_def["name"]
        streets = ""
        sections = []
        current_section = None
        
        for r_idx in range(r_def["start_row"], r_def["end_row"]):
            row = rows[r_idx]
            right_cells = row[4:] if len(row) > 4 else []
            if not right_cells:
                continue
            
            for c in right_cells:
                if c.startswith("Через:"):
                    streets = c.replace("Через:", "").strip()
            
            for c in right_cells:
                if "НАПРАВЛЕНИЕ:" in c:
                    dir_name = c.replace("НАПРАВЛЕНИЕ:", "").strip()
                    if current_section and current_section["schedule"]:
                        sections.append(current_section)
                    current_section = {
                        "title": dir_name,
                        "type": "direction",
                        "stops": [],
                        "schedule": []
                    }
            
            potential_stops = []
            for c in right_cells:
                if c and not parse_time_and_note(c) and "НАПРАВЛЕНИЕ" not in c and not c.startswith("Через:") and c not in ["323", "373", "474"]:
                    if any(term in c for term in ["АС", "п.", "ст.", "с.", "Городки"]):
                        potential_stops.append(c)
            
            if len(potential_stops) >= 2:
                if current_section is None:
                    current_section = {
                        "title": "Расписание",
                        "type": "direction",
                        "stops": potential_stops,
                        "schedule": []
                    }
                else:
                    current_section["stops"] = potential_stops
                continue
            
            if current_section and current_section["stops"]:
                times_in_row = []
                for c in right_cells:
                    t_obj = parse_time_and_note(c)
                    if t_obj:
                        times_in_row.append(t_obj)
                
                if len(times_in_row) > 0 and len(times_in_row) <= len(current_section["stops"]):
                    trip = {}
                    for s_idx, t_val in enumerate(times_in_row):
                        if s_idx < len(current_section["stops"]):
                            trip[current_section["stops"][s_idx]] = t_val
                    current_section["schedule"].append(trip)
        
        if current_section and current_section["schedule"]:
            sections.append(current_section)
        
        if sections:
            routes.append({
                "number": r_num,
                "name": r_name,
                "streets": streets,
                "category": "suburban",
                "scheduleType": "directional",
                "sections": sections
            })
            
    return routes

def parse_gid_748410195(rows: List[List[str]]) -> List[Dict[str, Any]]:
    """
    Route 22 (Такман): split into morning / evening sections
    """
    route_number = "22"
    route_name = "Школа №13 - ГЛК Такман - Школа №13"
    streets = ""
    sections = []
    
    current_part = "morning"
    morning_stops = []
    evening_stops = []
    morning_schedule = []
    evening_schedule = []
    
    for row in rows:
        line_str = " ".join(row)
        if "Текущее время" in line_str:
            break
        
        for c in row:
            if c.startswith("Через:"):
                streets = c.replace("Через:", "").strip()
        
        if "утром" in line_str.lower():
            current_part = "morning"
        elif "вечером" in line_str.lower():
            current_part = "evening"
            
        if current_part == "morning" and not morning_stops:
            potential = [c for c in row if c and any(k in c for k in ["Школа", "Архиповка", "вокзал", "Такман"])]
            if len(potential) >= 3:
                morning_stops = potential
                continue
                
        if current_part == "evening" and not evening_stops:
            potential = [c for c in row if c and any(k in c for k in ["Школа", "Архиповка", "вокзал", "Такман"])]
            if len(potential) >= 2:
                evening_stops = potential
                continue
                
        if current_part == "morning" and morning_stops:
            times = [parse_time_and_note(c) for c in row if parse_time_and_note(c)]
            if times:
                trip = {}
                for idx, t in enumerate(times):
                    if idx < len(morning_stops):
                        trip[morning_stops[idx]] = t
                morning_schedule.append(trip)
                
        if current_part == "evening" and evening_stops:
            times = [parse_time_and_note(c) for c in row if parse_time_and_note(c)]
            if times:
                trip = {}
                for idx, t in enumerate(times):
                    if idx < len(evening_stops):
                        trip[evening_stops[idx]] = t
                evening_schedule.append(trip)
                
    if morning_schedule:
        sections.append({
            "title": "🌅 Утренний рейс (Сб-Вс)",
            "type": "morning",
            "stops": morning_stops,
            "schedule": morning_schedule
        })
    if evening_schedule:
        sections.append({
            "title": "🌆 Вечерний рейс (Сб-Вс)",
            "type": "evening",
            "stops": evening_stops,
            "schedule": evening_schedule
        })
        
    return [{
        "number": route_number,
        "name": route_name,
        "streets": streets,
        "category": "urban",
        "scheduleType": "split-time",
        "note": "Курсирует с субботы по воскресенье",
        "sections": sections
    }]

def parse_gid_1707236720(rows: List[List[str]]) -> List[Dict[str, Any]]:
    """
    Route 3: Weekday and Weekend schedules side-by-side in same rows.
    Cols B-C: Weekdays, Cols E-F: Weekends.
    """
    route_number = "3"
    route_name = "Школа №13 - Горбольница"
    streets = ""
    weekday_stops = []
    weekend_stops = []
    weekday_schedule = []
    weekend_schedule = []
    
    for r_idx, row in enumerate(rows):
        line_str = " ".join(row)
        if "Текущее время" in line_str:
            break
        
        for c in row:
            if c.startswith("Через:"):
                streets = c.replace("Через:", "").strip()
                
        if not weekday_stops and len(row) >= 3:
            if "Школа" in row[1] and "Горбольница" in row[2]:
                weekday_stops = [row[1], row[2]]
        if not weekend_stops and len(row) >= 6:
            if "Школа" in row[4] and "Горбольница" in row[5]:
                weekend_stops = [row[4], row[5]]
                continue
                
        if weekday_stops and len(row) >= 3:
            t1 = parse_time_and_note(row[1])
            t2 = parse_time_and_note(row[2])
            if t1 or t2:
                weekday_schedule.append({
                    weekday_stops[0]: t1,
                    weekday_stops[1]: t2
                })
                
        if weekend_stops and len(row) >= 6:
            t1 = parse_time_and_note(row[4])
            t2 = parse_time_and_note(row[5])
            if t1 or t2:
                weekend_schedule.append({
                    weekend_stops[0]: t1,
                    weekend_stops[1]: t2
                })
                
    sections = []
    if weekday_schedule:
        sections.append({
            "title": "📅 Рабочие дни (ПН-ПТ)",
            "type": "weekday",
            "stops": weekday_stops,
            "schedule": weekday_schedule
        })
    if weekend_schedule:
        sections.append({
            "title": "🎉 Выходные дни (СБ-ВС)",
            "type": "weekend",
            "stops": weekend_stops,
            "schedule": weekend_schedule
        })
        
    return [{
        "number": route_number,
        "name": route_name,
        "streets": streets,
        "category": "urban",
        "scheduleType": "split",
        "sections": sections
    }]

def parse_standard_sheet(rows: List[List[str]]) -> List[Dict[str, Any]]:
    """
    Standard sheet parser for routes 1, 4, 5, 6, 7, 9, 10, 11, 12, 15, 16, 17.
    """
    if not rows:
        return []
        
    route_number = ""
    route_name = ""
    streets = ""
    day_type = "daily"
    stops = []
    schedule = []
    
    for row in rows[:3]:
        if len(row) >= 2 and re.match(r"^\d{1,3}$", row[0]) and len(row[1]) > 2:
            route_number = row[0]
            route_name = row[1]
            break
            
    if not route_number:
        for row in rows[:3]:
            for c in row:
                if re.match(r"^\d{1,3}$", c):
                    route_number = c
                    break
            if route_number:
                break

    for row in rows:
        line_str = " ".join(row)
        if "Текущее время" in line_str:
            break
            
        for c in row:
            if c.startswith("Через:"):
                streets = c.replace("Через:", "").strip()
            if "рабочие дни" in c.lower():
                day_type = "weekday"
            if "выходные" in c.lower():
                day_type = "weekend"
                
        if not stops:
            potential = []
            for c in row:
                if not c or c == route_number or c.startswith("Через:") or "рабочие" in c.lower() or "ежедневно" in c.lower():
                    continue
                if parse_time_and_note(c):
                    continue
                if len(c) >= 2:
                    potential.append(c)
            if len(potential) >= 2:
                stops = potential
                continue
                
        if stops:
            trip = {}
            has_time = False
            
            time_objs = []
            for c in row:
                t = parse_time_and_note(c)
                if t:
                    time_objs.append(t)
            
            if time_objs:
                for idx, t in enumerate(time_objs):
                    if idx < len(stops):
                        trip[stops[idx]] = t
                        has_time = True
            
            if has_time:
                schedule.append(trip)
                
    if not route_name and stops:
        route_name = f"{stops[0]} — {stops[-1]}"
        
    title = "📅 Ежедневно" if day_type == "daily" else "📅 Рабочие дни (ПН-ПТ)"
    num_val = int(route_number) if route_number.isdigit() else 0
    category = "suburban" if num_val >= 100 else "urban"
    
    return [{
        "number": route_number or "?",
        "name": route_name,
        "streets": streets,
        "category": category,
        "scheduleType": day_type,
        "sections": [{
            "title": title,
            "type": day_type,
            "stops": stops,
            "schedule": schedule
        }]
    }]

FALLBACK_FILE = Path(__file__).parent.parent / "data_fallback.json"

def get_current_time_perm_str() -> str:
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo("Asia/Yekaterinburg")
        now = datetime.datetime.now(tz)
    except Exception:
        tz = datetime.timezone(datetime.timedelta(hours=5))
        now = datetime.datetime.now(tz)
    return now.strftime("%d.%m.%Y %H:%M")

def load_fallback_data() -> Dict[str, Any]:
    """Loads backup snapshot if Google Sheets is unreachable or missing."""
    if FALLBACK_FILE.exists():
        try:
            with open(FALLBACK_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "routes" in data:
                    return data
                elif isinstance(data, list):
                    return {
                        "routes": data,
                        "fallbackDate": "ранее сохранённой",
                        "isFallback": True
                    }
        except Exception as e:
            logger.error(f"Failed to read fallback file {FALLBACK_FILE}: {e}")
    
    # Check data_preview.json as secondary fallback
    preview_file = Path(__file__).parent.parent / "data_preview.json"
    if preview_file.exists():
        try:
            with open(preview_file, "r", encoding="utf-8") as f:
                routes = json.load(f)
                return {
                    "routes": routes,
                    "fallbackDate": "локальной копии",
                    "isFallback": True
                }
        except Exception as e:
            logger.error(f"Failed to read preview file: {e}")

    return {"routes": [], "isFallback": True, "fallbackDate": "неизвестно"}

def save_fallback_snapshot(routes: List[Dict[str, Any]]) -> None:
    """Saves valid routes snapshot with timestamp to data_fallback.json."""
    if not routes or len(routes) < 5:
        return
    try:
        snapshot = {
            "savedAt": get_current_time_perm_str(),
            "routesCount": len(routes),
            "routes": routes
        }
        with open(FALLBACK_FILE, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)
        logger.info(f"Fallback snapshot successfully updated in {FALLBACK_FILE} ({len(routes)} routes)")
    except Exception as e:
        logger.warning(f"Could not save fallback snapshot: {e}")

def parse_all_routes() -> Dict[str, Any]:
    """
    Downloads and parses all routes from Google Sheets.
    Returns a dict with 'routes', 'isFallback', and 'fallbackDate'.
    """
    all_routes = []
    fetch_errors = 0
    
    for gid in SHEET_GIDS:
        try:
            logger.info(f"Downloading & parsing GID: {gid}...")
            rows = fetch_sheet_csv(SHEET_ID, gid)
            if not rows:
                logger.warning(f"GID {gid} returned empty rows")
                fetch_errors += 1
                continue
                
            if gid == "740366988":
                routes = parse_gid_740366988(rows)
            elif gid == "748410195":
                routes = parse_gid_748410195(rows)
            elif gid == "1707236720":
                routes = parse_gid_1707236720(rows)
            else:
                routes = parse_standard_sheet(rows)
                
            for r in routes:
                logger.info(f"  -> Маршрут №{r['number']}: {r['name']} ({len(r['sections'])} секций)")
                all_routes.append(r)
        except Exception as e:
            fetch_errors += 1
            logger.error(f"Error parsing GID {gid}: {e}")
            
    def sort_key(r):
        try:
            return (0, int(r["number"]))
        except ValueError:
            return (1, r["number"])
            
    all_routes.sort(key=sort_key)

    # Minimum threshold: We normally expect ~15-20 routes across all GIDs.
    # If Google Sheets is unavailable, deleted or wiped out, switch to fallback snapshot.
    if len(all_routes) < 5:
        logger.warning(f"Parsed only {len(all_routes)} routes (too few or Google Sheets unavailable). Activating FALLBACK.")
        fb = load_fallback_data()
        fb_routes = fb.get("routes", [])
        fb_date = fb.get("savedAt") or fb.get("fallbackDate") or "ранее сохранённой"
        logger.info(f"Loaded {len(fb_routes)} routes from fallback snapshot ({fb_date}).")
        return {
            "routes": fb_routes,
            "isFallback": True,
            "fallbackDate": fb_date
        }

    # Successful live fetch: save snapshot for future offline resilience
    save_fallback_snapshot(all_routes)

    return {
        "routes": all_routes,
        "isFallback": False,
        "fallbackDate": None
    }

if __name__ == "__main__":
    result = parse_all_routes()
    routes = result["routes"]
    print(f"\nTotal parsed routes: {len(routes)} (isFallback={result.get('isFallback')})")
    with open("data_preview.json", "w", encoding="utf-8") as f:
        json.dump(routes, f, ensure_ascii=False, indent=2)
    print("Saved preview to data_preview.json")

