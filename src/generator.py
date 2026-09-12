"""
Static Site Generator for Chusovoy Bus Schedule.
Compiles templates/index.html + style.css + app.js + parsed data
into a standalone, zero-dependency, ultra-fast static HTML file.
"""

import os
import json
import datetime
from pathlib import Path
from typing import List, Dict, Any

TEMPLATES_DIR = Path(__file__).parent / "templates"

def build_static_site(data_input: Any, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    
    if isinstance(data_input, dict):
        routes = data_input.get("routes", [])
        is_fallback = data_input.get("isFallback", False)
        fallback_date = data_input.get("fallbackDate")
    else:
        routes = data_input
        is_fallback = False
        fallback_date = None

    html_template_path = TEMPLATES_DIR / "index.html"
    css_path = TEMPLATES_DIR / "style.css"
    js_path = TEMPLATES_DIR / "app.js"
    
    with open(html_template_path, "r", encoding="utf-8") as f:
        html_template = f.read()
    with open(css_path, "r", encoding="utf-8") as f:
        css_content = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js_content = f.read()
        
    # Время Пермского края (UTC+5 / Asia/Yekaterinburg)
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo("Asia/Yekaterinburg")
        now = datetime.datetime.now(tz)
    except Exception:
        tz = datetime.timezone(datetime.timedelta(hours=5))
        now = datetime.datetime.now(tz)

    now_str = now.strftime("%d.%m.%Y %H:%M")
    date_str = now.strftime("%d %B %Y").replace(
        "January", "января").replace("February", "февраля").replace(
        "March", "марта").replace("April", "апреля").replace(
        "May", "мая").replace("June", "июня").replace(
        "July", "июля").replace("August", "августа").replace(
        "September", "сентября").replace("October", "октября").replace(
        "November", "ноября").replace("December", "декабря")
        
    json_data = json.dumps(routes, ensure_ascii=False, separators=(',', ':'))
    meta_json = json.dumps({
        "isFallback": bool(is_fallback),
        "fallbackDate": fallback_date or now_str
    }, ensure_ascii=False)
    
    tracks_file = TEMPLATES_DIR / "real_routes_tracks.json"
    tracks_json = tracks_file.read_text(encoding="utf-8") if tracks_file.exists() else "{}"

    # Render template
    rendered = html_template.replace("{{INLINED_STYLE}}", css_content)
    rendered = rendered.replace("{{INLINED_SCRIPT}}", js_content)
    rendered = rendered.replace("{{SCHEDULE_DATA_JSON}}", json_data)
    rendered = rendered.replace("{{SCHEDULE_META_JSON}}", meta_json)
    rendered = rendered.replace("{{REAL_ROUTES_TRACKS_JSON}}", tracks_json)
    rendered = rendered.replace("{{BUILD_DATE}}", date_str)
    rendered = rendered.replace("{{BUILD_TIMESTAMP}}", now_str)
    
    out_file = output_dir / "index.html"
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(rendered)

    # Copy scheme vector and legacy image to dist
    for asset_name in ["city_map.svg", "scheme_bus_routes.jpg"]:
        asset_path = TEMPLATES_DIR / asset_name
        if asset_path.exists():
            import shutil
            shutil.copy2(asset_path, output_dir / asset_name)
        
    # Also dump data.json for API / testing
    data_file = output_dir / "schedule.json"
    with open(data_file, "w", encoding="utf-8") as f:
        f.write(json.dumps({
            "meta": {
                "isFallback": bool(is_fallback),
                "fallbackDate": fallback_date,
                "generatedAt": now_str
            },
            "routes": routes
        }, ensure_ascii=False, indent=2))
        
    return out_file
