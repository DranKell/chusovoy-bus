#!/usr/bin/env python3
"""
Main Entrypoint for BusSchedule-Server.

Usage:
  python updater.py            # Download from Google Sheets and build dist/index.html
  python updater.py --serve    # Build and start local preview web server at http://localhost:8000
  python updater.py --port 8080
"""

import sys
import argparse
import http.server
import socketserver
import webbrowser
from pathlib import Path

# Local imports
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from src.parser import parse_all_routes
from src.generator import build_static_site

DIST_DIR = Path(__file__).parent / "dist"

def main():
    parser = argparse.ArgumentParser(description="Chusovoy Bus Schedule Generator & Server")
    parser.add_argument("--serve", action="store_true", help="Start local web server after build")
    parser.add_argument("--port", type=int, default=8000, help="Port for local preview server (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    args = parser.parse_args()

    print("🚌 ========================================================")
    print("🚌 Чусовой — Генератор онлайн-расписания автобусов")
    print("🚌 ========================================================\n")

    print("⏳ Загрузка данных из Google Таблиц...")
    routes = parse_all_routes()
    print(f"✅ Успешно обработано маршрутов: {len(routes)}")

    print(f"\n📦 Сборка веб-интерфейса в {DIST_DIR}...")
    output_html = build_static_site(routes, DIST_DIR)
    print(f"✅ Готово! Файл создан: {output_html}")
    print(f"   Размер: {output_html.stat().st_size / 1024:.1f} KB (полностью автономный SPA)")

    if args.serve:
        print(f"\n🌐 Запуск локального сервера предпросмотра на порту {args.port}...")
        
        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **kw):
                super().__init__(*a, directory=str(DIST_DIR), **kw)
            def log_message(self, format, *args):
                # Clean minimal logging
                sys.stderr.write(f"[{self.log_date_time_string()}] {args[0]}\n")

        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(("", args.port), Handler) as httpd:
            url = f"http://localhost:{args.port}"
            print(f"🚀 Сервер работает: {url}")
            print("   Нажмите CTRL+C для остановки\n")
            if not args.no_browser:
                try:
                    webbrowser.open(url)
                except Exception:
                    pass
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\n🛑 Сервер остановлен.")

if __name__ == "__main__":
    main()
