/**
 * BusSchedule Interactive Application
 * Search, Nearest Trip Calculation, Favorites, Direction Switcher
 */

(function () {
  'use strict';

  // Global State
  let allRoutes = window.SCHEDULE_DATA || [];
  let favorites = JSON.parse(localStorage.getItem('fav_bus_routes') || '[]');
  let currentFilter = 'all'; // all, today, urban, suburban, fav
  let searchQuery = '';
  let activeModalRoute = null;
  let activeModalSectionIdx = 0;
  let selectedSchemeRoute = 'none'; // 'none' (clean map), 'all', or specific route number like '3', '6'

  // DOM Elements
  const routesGrid = document.getElementById('routesGrid');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const filterPills = document.querySelectorAll('.pill-btn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const liveClockEl = document.getElementById('liveClock');
  const busMascot = document.getElementById('busMascot');
  const honkTooltip = document.getElementById('honkTooltip');

  // Scheme Modal Elements
  const schemeRouteTilesContainer = document.getElementById('schemeRouteTiles');
  const schemeActiveRouteInfo = document.getElementById('schemeActiveRouteInfo');
  const schemeFilterAllBtn = document.getElementById('schemeFilterAll');
  const schemeFilterNoneBtn = document.getElementById('schemeFilterNone');

  // Modal Elements
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalRouteNum = document.getElementById('modalRouteNum');
  const modalRouteName = document.getElementById('modalRouteName');
  const modalRouteStreets = document.getElementById('modalRouteStreets');
  const modalTabs = document.getElementById('modalTabs');
  const modalTableContainer = document.getElementById('modalTableContainer');
  const modalNextBanner = document.getElementById('modalNextBanner');

  // Time & Day Helper functions
  function getNow() {
    return new Date();
  }

  function isWeekend(date = new Date()) {
    const day = date.getDay();
    return day === 0 || day === 6; // Sun = 0, Sat = 6
  }

  function formatTime(date) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function updateClock() {
    if (liveClockEl) {
      liveClockEl.innerHTML = `<span class="pulse-dot"></span> ${formatTime(getNow())}`;
    }
  }

  // Parses 'HH:MM' string to Date object for today
  function parseTimeToToday(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;

    const now = getNow();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    return d;
  }

  // Calculate nearest departure for a route
  function getNextDeparture(route) {
    const now = getNow();
    let bestTrip = null;
    let minDiffMs = Infinity;

    // Determine relevant sections based on today (weekend vs weekday)
    const weekendToday = isWeekend(now);

    route.sections.forEach(sec => {
      // Check if section matches today
      if (sec.type === 'weekday' && weekendToday) return;
      if (sec.type === 'weekend' && !weekendToday) return;

      const firstStop = sec.stops[0];
      if (!firstStop) return;

      sec.schedule.forEach((trip, tripIdx) => {
        const timeObj = trip[firstStop];
        if (!timeObj || !timeObj.time) return;

        // If note restricts day (e.g., 'Сб.', 'Пн.-Пт.')
        if (timeObj.note) {
          const note = timeObj.note.toLowerCase();
          if (note.includes('сб') && now.getDay() !== 6) return;
          if (note.includes('вс') && now.getDay() !== 0) return;
          if (note.includes('пн.-пт.') && weekendToday) return;
        }

        const tripDate = parseTimeToToday(timeObj.time);
        if (!tripDate) return;

        const diffMs = tripDate.getTime() - now.getTime();
        // Look for departures today within next hours
        if (diffMs > 0 && diffMs < minDiffMs) {
          minDiffMs = diffMs;
          bestTrip = {
            time: timeObj.time,
            stop: firstStop,
            diffMinutes: Math.round(diffMs / 60000),
            note: timeObj.note,
            sectionTitle: sec.title,
            tripIdx: tripIdx
          };
        }
      });
    });

    return bestTrip;
  }

  // Update Realistic Electronic LED Board (Общее информационное табло Чусового)
  function updateLedScoreboard() {
    const ledTrackEl = document.getElementById('ledTickerText');
    if (!ledTrackEl) return;

    // Pleasant informational ticker with enterprise info, address, phones, and passenger wish
    ledTrackEl.textContent = 'МУП «ЧУСОВСКОЕ АТП» • ПАССАЖИРСКИЕ ПЕРЕВОЗКИ ЧУСОВСКОГО ГОРОДСКОГО ОКРУГА • АДРЕС: Г. ЧУСОВОЙ, УЛ. ЮЖНАЯ, 10-А • ДИСПЕТЧЕР: +7 (34256) 5-15-40, 5-18-80 • СПРАВОЧНАЯ: +7 (34256) 4-22-25 • АКТУАЛЬНОЕ ОНЛАЙН-РАСПИСАНИЕ И ИНТЕРАКТИВНАЯ КАРТА МАРШРУТОВ • УДАЧНОЙ ДОРОГИ, СЧАСТЛИВОГО ПУТИ И ПРИЯТНЫХ ПОЕЗДОК!';
  }

  // Update Route Specific LED Board in Modal Dialog (Табло конкретного автобуса)
  function updateModalLedBoard(route, activeSection) {
    const modalLedNum = document.getElementById('modalLedRouteNum');
    const modalLedTrack = document.getElementById('modalLedTickerText');
    if (!modalLedNum || !modalLedTrack || !route) return;

    modalLedNum.textContent = `№ ${route.number}`;

    const stops = (activeSection && activeSection.stops && activeSection.stops.length > 0)
      ? activeSection.stops
      : (route.sections[0]?.stops || []);

    const startStop = stops[0] || '';
    const endStop = stops[stops.length - 1] || '';
    const viaText = route.streets ? ` • ЧЕРЕЗ: ${route.streets.toUpperCase()}` : '';

    let text = '';
    if (startStop && endStop) {
      text = `[ ${startStop.toUpperCase()} ➔ ${endStop.toUpperCase()} ]${viaText} • ПОЛНЫЙ МАРШРУТ: ${stops.join(' ➔ ').toUpperCase()} • `;
    } else {
      text = `${route.name.toUpperCase()}${viaText} • `;
    }

    modalLedTrack.textContent = text;
  }

  // Theme Management
  function getPreferredTheme() {
    const stored = localStorage.getItem('bus_theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme, animateHeadlights = false) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bus_theme', theme);
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      themeToggleBtn.setAttribute('title', theme === 'dark' ? 'Включить дневную тему' : 'Включить ночную тему');
    }

    // Manage recurring headlights blink in dark theme
    if (theme === 'dark') {
      if (animateHeadlights) {
        triggerHeadlightsBlink();
      }
      scheduleNextHeadlightsBlink();
    } else {
      clearTimeout(headlightsTimer);
      if (busMascot) busMascot.classList.remove('headlights-blinking');
    }
  }

  let headlightsTimer = null;

  function triggerHeadlightsBlink() {
    if (!busMascot) return;
    busMascot.classList.remove('headlights-blinking');
    void busMascot.offsetWidth; // force DOM reflow
    busMascot.classList.add('headlights-blinking');
    setTimeout(() => {
      if (busMascot) busMascot.classList.remove('headlights-blinking');
    }, 1900);
  }

  function scheduleNextHeadlightsBlink() {
    clearTimeout(headlightsTimer);
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme !== 'dark') return;

    // Random delay: rnd * 60 seconds (min 8s, max 60s so it's lively and clearly visible)
    const randomSec = Math.max(8, Math.round(Math.random() * 60));
    headlightsTimer = setTimeout(() => {
      const nowTheme = document.documentElement.getAttribute('data-theme');
      if (nowTheme === 'dark') {
        triggerHeadlightsBlink();
        scheduleNextHeadlightsBlink(); // loop forever while in dark theme
      }
    }, randomSec * 1000);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
  }

  // Sound / Mascot Easter Egg
  function honkHorn() {
    if (honkTooltip) {
      honkTooltip.classList.add('show');
      setTimeout(() => honkTooltip.classList.remove('show'), 900);
    }

    // Gentle web audio beep
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(360, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      }
    } catch (e) {
      // Audio not supported or allowed
    }
  }

  // Favorites Management
  function toggleFavorite(num, e) {
    if (e) e.stopPropagation();
    const idx = favorites.indexOf(num);
    if (idx > -1) {
      favorites.splice(idx, 1);
    } else {
      favorites.push(num);
    }
    localStorage.setItem('fav_bus_routes', JSON.stringify(favorites));
    renderRoutes();
  }

  // Rendering Route Cards
  function renderRoutes() {
    if (!routesGrid) return;

    let filtered = allRoutes.filter(route => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const numMatch = route.number.toLowerCase().includes(q);
        const nameMatch = route.name.toLowerCase().includes(q);
        const streetsMatch = (route.streets || '').toLowerCase().includes(q);
        const stopMatch = route.sections.some(s => s.stops.some(st => st.toLowerCase().includes(q)));
        if (!numMatch && !nameMatch && !streetsMatch && !stopMatch) return false;
      }

      // Category / Pill filter
      if (currentFilter === 'fav') {
        return favorites.includes(route.number);
      }
      if (currentFilter === 'urban') {
        return route.category === 'urban';
      }
      if (currentFilter === 'suburban') {
        return route.category === 'suburban';
      }
      if (currentFilter === 'today') {
        const weekend = isWeekend();
        return route.sections.some(sec => {
          if (sec.type === 'weekday' && weekend) return false;
          if (sec.type === 'weekend' && !weekend) return false;
          return true;
        });
      }

      return true;
    });

    if (filtered.length === 0) {
      routesGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🚏</div>
          <div class="empty-title">Маршруты не найдены</div>
          <div class="empty-desc">Попробуйте изменить поисковый запрос или выбрать другой фильтр</div>
        </div>
      `;
      return;
    }

    let html = '';
    filtered.forEach(route => {
      const isFav = favorites.includes(route.number);
      const isSuburban = route.category === 'suburban';
      const nextBus = getNextDeparture(route);

      let nextBusHtml = '';
      if (nextBus) {
        let diffStr = '';
        if (nextBus.diffMinutes < 60) {
          diffStr = `через ${nextBus.diffMinutes} мин`;
        } else {
          const h = Math.floor(nextBus.diffMinutes / 60);
          const m = nextBus.diffMinutes % 60;
          diffStr = `через ${h} ч ${m} мин`;
        }
        nextBusHtml = `
          <div class="next-bus-indicator has-bus" title="Отправление: ${nextBus.stop}">
            <span>⏰ Рейс в</span>
            <span class="next-time-value">${nextBus.time}</span>
            <span style="font-size:0.75rem;opacity:0.85;">(${diffStr})</span>
          </div>
        `;
      } else {
        nextBusHtml = `
          <div class="next-bus-indicator">
            <span>🌙 Рейсов нет</span>
          </div>
        `;
      }

      html += `
        <div class="route-card" data-route-num="${route.number}">
          <div>
            <div class="card-top">
              <div class="badge-route-number">№ ${route.number}</div>
              <div class="card-tags">
                <span class="tag ${isSuburban ? 'tag-suburban' : 'tag-urban'}">
                  ${isSuburban ? 'Пригород' : 'Городской'}
                </span>
                <button class="fav-btn ${isFav ? 'is-fav' : ''}" data-fav-num="${route.number}" title="${isFav ? 'Удалить из избранного' : 'Добавить в избранное'}">
                  ${isFav ? '★' : '☆'}
                </button>
              </div>
            </div>

            <div class="card-body">
              <div class="route-destination">${route.name}</div>
              ${route.streets ? `<div class="route-via"><strong>Через:</strong> ${route.streets}</div>` : ''}
            </div>
          </div>

          <div class="card-footer">
            ${nextBusHtml}
            <span class="view-schedule-link">Расписание →</span>
          </div>
        </div>
      `;
    });

    routesGrid.innerHTML = html;

    // Attach click listeners to cards
    routesGrid.querySelectorAll('.route-card').forEach(card => {
      card.addEventListener('click', () => {
        const num = card.getAttribute('data-route-num');
        const route = allRoutes.find(r => r.number === num);
        if (route) openModal(route);
      });
    });

    // Attach click listeners to favorite buttons
    routesGrid.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const num = btn.getAttribute('data-fav-num');
        toggleFavorite(num, e);
      });
    });
  }

  // Modal Handling
  function openModal(route) {
    activeModalRoute = route;
    activeModalSectionIdx = 0;

    modalRouteNum.textContent = `№ ${route.number}`;
    modalRouteName.textContent = route.name;
    modalRouteStreets.textContent = route.streets ? `Через: ${route.streets}` : '';

    renderModalSections();

    modalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
    activeModalRoute = null;
  }

  function renderModalSections() {
    if (!activeModalRoute) return;

    const sections = activeModalRoute.sections;

    // Highlight next bus banner
    const nextBus = getNextDeparture(activeModalRoute);
    if (nextBus) {
      modalNextBanner.innerHTML = `
        <span>⏰ <strong>Ближайший рейс:</strong> ${nextBus.time} (${nextBus.stop})</span>
        <span>отправление через ${nextBus.diffMinutes} мин</span>
      `;
      modalNextBanner.style.display = 'flex';
    } else {
      modalNextBanner.style.display = 'none';
    }

    // Render Tabs if more than 1 section
    if (sections.length > 1) {
      modalTabs.style.display = 'flex';
      modalTabs.innerHTML = sections.map((sec, idx) => `
        <button class="modal-tab-btn ${idx === activeModalSectionIdx ? 'active' : ''}" data-idx="${idx}">
          ${sec.title}
        </button>
      `).join('');

      modalTabs.querySelectorAll('.modal-tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
          activeModalSectionIdx = parseInt(tab.getAttribute('data-idx'), 10);
          renderModalSections();
        });
      });
    } else {
      modalTabs.style.display = 'none';
    }

    // Render Active Section Table
    const activeSec = sections[activeModalSectionIdx] || sections[0];

    // Update Route LED Marquee Display
    updateModalLedBoard(activeModalRoute, activeSec);

    if (!activeSec || !activeSec.schedule || activeSec.schedule.length === 0) {
      modalTableContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">Нет данных расписания</p>';
      return;
    }

    const stops = activeSec.stops;
    let tableHtml = `
      <div class="table-responsive">
        <table class="schedule-table">
          <thead>
            <tr>
              <th style="width: 48px; text-align:center;">#</th>
              ${stops.map((s, idx) => {
                const isTerminal = idx === 0 || idx === stops.length - 1;
                const dotClass = isTerminal ? 'stop-marker-dot terminal' : 'stop-marker-dot station';
                const dotTitle = isTerminal ? 'Конечная остановка' : 'Промежуточная остановка';
                return `<th><span class="${dotClass}" title="${dotTitle}"></span>${s}</th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    const now = getNow();
    let nearestTripRowIdx = -1;
    let minDiff = Infinity;

    // Check if this section contains the next trip
    activeSec.schedule.forEach((trip, rIdx) => {
      const firstStop = stops[0];
      const tObj = trip[firstStop];
      if (tObj && tObj.time) {
        const d = parseTimeToToday(tObj.time);
        if (d) {
          const diff = d.getTime() - now.getTime();
          if (diff > 0 && diff < minDiff) {
            minDiff = diff;
            nearestTripRowIdx = rIdx;
          }
        }
      }
    });

    activeSec.schedule.forEach((trip, rIdx) => {
      const isNextRow = rIdx === nearestTripRowIdx;
      tableHtml += `<tr class="${isNextRow ? 'next-trip-row' : ''}">`;
      tableHtml += `<td style="text-align:center;color:var(--text-muted);font-size:0.8rem;">${rIdx + 1}</td>`;

      stops.forEach(s => {
        const tObj = trip[s];
        if (tObj && tObj.time) {
          tableHtml += `
            <td>
              <div class="cell-time">
                <span>${tObj.time}</span>
                ${tObj.note ? `<span class="trip-note">${tObj.note}</span>` : ''}
              </div>
            </td>
          `;
        } else {
          tableHtml += `<td><span style="color:var(--text-faint);">—</span></td>`;
        }
      });

      tableHtml += `</tr>`;
    });

    tableHtml += `
          </tbody>
        </table>
      </div>
    `;

    modalTableContainer.innerHTML = tableHtml;

    // Auto-scroll to next row if exists
    setTimeout(() => {
      const nextRowEl = modalTableContainer.querySelector('.next-trip-row');
      if (nextRowEl) {
        nextRowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  // Event Listeners
  function setupEventListeners() {
    // Theme
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Bus Mascot Honk
    if (busMascot) {
      busMascot.addEventListener('click', honkHorn);
    }

    // Search Input
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        if (clearSearchBtn) {
          clearSearchBtn.classList.toggle('active', searchQuery.length > 0);
        }
        renderRoutes();
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.classList.remove('active');
        renderRoutes();
        searchInput.focus();
      });
    }

    // Filter Pills
    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentFilter = pill.getAttribute('data-filter');
        renderRoutes();
      });
    });

    // Scheme Modal Handlers
    const openSchemeBtn = document.getElementById('openSchemeBtn');
    const floatingSchemeBtn = document.getElementById('floatingSchemeBtn');
    const schemeModalBackdrop = document.getElementById('schemeModalBackdrop');
    const schemeCloseBtn = document.getElementById('schemeCloseBtn');
    const schemeImage = document.getElementById('schemeImage');

    function openSchemeModal() {
      if (schemeModalBackdrop) {
        schemeModalBackdrop.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
          initLeafletMap();
          if (leafletMap) {
            leafletMap.invalidateSize();
          }
          renderSchemeRouteTiles();
          // By default, activate Route 6 if nothing selected
          if (selectedSchemeRoute === 'none' || selectedSchemeRoute === 'all') {
            setSchemeActiveRoute('6');
          } else {
            setSchemeActiveRoute(selectedSchemeRoute);
          }
        }, 100);
      }
    }

    function closeSchemeModal() {
      if (schemeModalBackdrop) {
        schemeModalBackdrop.classList.remove('open');
        document.body.style.overflow = '';
      }
      if (schemeImage) {
        schemeImage.classList.remove('zoomed');
      }
    }

    if (openSchemeBtn) {
      openSchemeBtn.addEventListener('click', openSchemeModal);
    }
    if (floatingSchemeBtn) {
      floatingSchemeBtn.addEventListener('click', openSchemeModal);
    }
    if (schemeCloseBtn) {
      schemeCloseBtn.addEventListener('click', closeSchemeModal);
    }
    if (schemeModalBackdrop) {
      schemeModalBackdrop.addEventListener('click', (e) => {
        if (e.target === schemeModalBackdrop) closeSchemeModal();
      });
    }

    // Filter all / none toolbar buttons
    if (schemeFilterAllBtn) {
      schemeFilterAllBtn.addEventListener('click', () => {
        setSchemeActiveRoute('all');
      });
    }
    if (schemeFilterNoneBtn) {
      schemeFilterNoneBtn.addEventListener('click', () => {
        setSchemeActiveRoute('none');
      });
    }

    const schemeMapContainer = document.getElementById('schemeMapContainer');

    function toggleSchemeZoom() {
      if (schemeMapContainer) {
        schemeMapContainer.classList.toggle('zoomed');
      }
    }

    if (schemeImage) {
      schemeImage.addEventListener('click', toggleSchemeZoom);
    }

    const schemeZoomBtn = document.getElementById('schemeZoomBtn');
    if (schemeZoomBtn) {
      schemeZoomBtn.addEventListener('click', toggleSchemeZoom);
    }

    // Modal Close
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeModal);
    }
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
      });
    }

    // Keyboard ESC to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (modalBackdrop && modalBackdrop.classList.contains('open')) closeModal();
        if (schemeModalBackdrop && schemeModalBackdrop.classList.contains('open')) closeSchemeModal();
      }
    });

    // Clock ticker and live radar update
    setInterval(() => {
      updateClock();
      updateLedScoreboard();
    }, 5000);

    // High-resolution live radar update (1000ms for smooth GPS-like animation)
    setInterval(() => {
      updateLiveMapRadar();
    }, 1000);
  }

  // ==========================================================================
  // MEGA-ULTRA DYNAMIC RADAR: Theoretical Bus Positions on Chusovoy Scheme Map
  // Real-time GPS-simulated movement along exact street polylines & bridge!
  // ==========================================================================

  // Map nodes normalized percentages (X%, Y%) calibrated precisely on vector city map (1600x1000)
  const MAP_STOPS_COORDS = {
    // Old Town / Left Bank (West)
    "ул.Революционная": { x: 6.88, y: 33.0 },
    "магазин «БРАВО»": { x: 10.62, y: 32.0 },
    "Церковь": { x: 12.5, y: 38.0 },
    "Поликлиника": { x: 19.38, y: 35.0 },
    "Горбольница": { x: 18.12, y: 45.0 },
    "ул.Переездная": { x: 15.0, y: 42.0 },
    "КДЦ": { x: 20.62, y: 40.0 },
    "Администрация": { x: 25.62, y: 35.0 },
    "Дом спорта": { x: 33.75, y: 35.0 },
    "Автостанция": { x: 31.87, y: 41.0 },
    "АС Чусовой": { x: 31.87, y: 41.0 },
    "пл.ЧМЗ": { x: 33.12, y: 44.0 },
    "ПлощадьЧМЗ": { x: 33.12, y: 44.0 },
    "Французская": { x: 39.38, y: 48.0 },
    "ул.Южная": { x: 25.62, y: 44.0 },
    "ул.Коммунальная": { x: 27.5, y: 51.0 },
    "РМЗ": { x: 21.88, y: 54.0 },
    "ул.Сплавщиков": { x: 6.88, y: 61.0 },
    "Сплавщиков": { x: 6.88, y: 61.0 },
    "ул.Черноморская": { x: 11.88, y: 61.5 },
    "ул.Каспийская": { x: 11.88, y: 65.0 },
    "ул.Вильвенская": { x: 11.88, y: 69.0 },
    "Молокозавод": { x: 14.38, y: 69.5 },
    "Кладбище": { x: 18.12, y: 26.0 },

    // Bridge
    "Мост_Левый": { x: 44.38, y: 52.5 },
    "Мост_Правый": { x: 51.88, y: 55.5 },

    // North Road (Вокзал, Архиповка, Такман)
    "ДКЖ": { x: 42.5, y: 31.0 },
    "ул.Матросова": { x: 48.12, y: 27.5 },
    "ж/д вокзал": { x: 53.12, y: 24.0 },
    "Ж.Д. Вокзал": { x: 53.12, y: 24.0 },
    "ПЧ-16": { x: 59.38, y: 22.5 },
    "п.Архиповка": { x: 64.38, y: 22.5 },
    "Архиповка": { x: 64.38, y: 22.5 },
    "ГЛК Такман": { x: 73.75, y: 16.0 },

    // New Town / Right Bank (East)
    "пл.Металлургов": { x: 71.25, y: 43.5 },
    "ул.Луначарского": { x: 76.25, y: 42.5 },
    "ул.Парковая": { x: 79.38, y: 42.5 },
    "ул.Севастопольская": { x: 83.12, y: 45.5 },
    "ул.Победы": { x: 76.25, y: 48.5 },
    "ул.Пермская": { x: 79.38, y: 51.5 },
    "Юбилейная": { x: 76.88, y: 54.0 },
    "Школа №13": { x: 84.38, y: 56.0 },
    "школа 13": { x: 84.38, y: 56.0 },
    "ул.Чайковского": { x: 76.25, y: 58.0 },
    "ул.Сивкова": { x: 84.38, y: 64.5 },
    "Преображенска": { x: 82.5, y: 73.0 },
    "Ротонда": { x: 73.12, y: 71.0 },
    "ул.Мира": { x: 68.12, y: 68.0 },
    "Техникум": { x: 63.44, y: 60.0 },
    "ул.Юности": { x: 68.12, y: 60.0 },
    "ул.Чкалова": { x: 58.44, y: 53.5 },
    "пер.Чунжинский": { x: 59.38, y: 48.5 },
    "пер.Краснофлотский": { x: 59.38, y: 44.5 },
    "пер.Кольцова": { x: 61.88, y: 36.5 },
    "к/с Горняк": { x: 70.0, y: 37.5 },
    "ул.Кирова": { x: 65.0, y: 34.5 },

    // South East (Коммунистическая, Кошково)
    "50лет ВЛКСМ": { x: 61.88, y: 72.5 },
    "Спорткомплекс": { x: 68.12, y: 83.0 },
    "ул.Коммунистическая": { x: 63.44, y: 83.0 },
    "Закурье": { x: 54.37, y: 77.0 },
    "п.Совхозный": { x: 54.37, y: 77.0 },
    "п.Кошково": { x: 55.62, y: 85.0 },
    "Кошково": { x: 55.62, y: 85.0 },
    "Мелькомбинат": { x: 55.62, y: 85.0 }
  };

  // Route paths definition: strictly follow road lines and Cross the Bridge!
  // Defined from canonical Start Stop to End Stop
  const ROUTE_PATHS = {
    // 1: пл.ЧМЗ ➔ Мост ➔ Закурье (п.Совхозный)
    "1": ["пл.ЧМЗ", "Французская", "Мост_Левый", "Мост_Правый", "ул.Чкалова", "50лет ВЛКСМ", "Закурье"],

    // 3: Школа 13 ➔ ул.Мира ➔ пл.Металлургов ➔ Мост ➔ пл.ЧМЗ ➔ Поликлиника ➔ Горбольница
    "3": ["Школа №13", "ул.Сивкова", "Преображенска", "Ротонда", "ул.Мира", "Юбилейная", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "КДЦ", "Поликлиника", "Горбольница"],

    // 4: ул.Кирова ➔ Чкалова ➔ пл.ЧМЗ ➔ ДКЖ ➔ Вокзал ➔ Архиповка
    "4": ["ул.Кирова", "к/с Горняк", "ул.Луначарского", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "Дом спорта", "ДКЖ", "ул.Матросова", "ж/д вокзал", "ПЧ-16", "п.Архиповка"],

    // 5: Школа 13 ➔ пл.Металлургов ➔ Мост ➔ пл.ЧМЗ ➔ РМЗ ➔ Сплавщиков
    "5": ["Школа №13", "ул.Чайковского", "Юбилейная", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "ул.Южная", "ул.Коммунальная", "РМЗ", "ул.Черноморская", "ул.Сплавщиков"],

    // 6: Школа 13 ➔ Мост ➔ пл.ЧМЗ ➔ Вокзал ➔ Архиповка
    "6": ["Школа №13", "ул.Сивкова", "Преображенска", "ул.Мира", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "ДКЖ", "ж/д вокзал", "п.Архиповка"],

    // 7: пл.Металлургов ➔ Мост ➔ пл.ЧМЗ ➔ Поликлиника ➔ Революционная
    "7": ["пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "КДЦ", "Поликлиника", "Церковь", "магазин «БРАВО»", "ул.Революционная"],

    // 9: ул.Коммунистическая ➔ ул.Мира ➔ Мост ➔ пл.ЧМЗ ➔ Поликлиника ➔ Горбольница
    "9": ["ул.Коммунистическая", "Спорткомплекс", "ул.Мира", "Юбилейная", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "КДЦ", "Поликлиника", "Горбольница"],

    // 10: ул.Коммунистическая ➔ Мост ➔ пл.ЧМЗ ➔ Вокзал ➔ Архиповка
    "10": ["ул.Коммунистическая", "Спорткомплекс", "ул.Мира", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "ДКЖ", "ж/д вокзал", "п.Архиповка"],

    // 11: Школа 13 ➔ Сивкова ➔ Мира ➔ 50лет ВЛКСМ ➔ Коммунистическая (Внутри Нового города, без заезда в реку!)
    "11": ["Школа №13", "ул.Сивкова", "Преображенска", "Ротонда", "ул.Мира", "50лет ВЛКСМ", "Спорткомплекс", "ул.Коммунистическая"],

    // 12: пл.ЧМЗ ➔ Мост ➔ Закурье ➔ Кошково
    "12": ["пл.ЧМЗ", "Французская", "Мост_Левый", "Мост_Правый", "ул.Чкалова", "50лет ВЛКСМ", "Закурье", "п.Кошково"],

    // 15: Севастопольская ➔ Металлургов ➔ Школа 13 ➔ Сивкова ➔ Мира ➔ Коммунистическая (Новый город!)
    "15": ["ул.Севастопольская", "ул.Парковая", "пл.Металлургов", "Юбилейная", "Школа №13", "ул.Сивкова", "Преображенска", "ул.Мира", "Спорткомплекс", "ул.Коммунистическая"],

    // 16: Школа 13 ➔ Сивкова ➔ Мира ➔ Чкалова ➔ пер.Кольцова ➔ ул.Кирова (Новый город!)
    "16": ["Школа №13", "ул.Сивкова", "Преображенска", "ул.Мира", "Техникум", "ул.Чкалова", "пер.Чунжинский", "пер.Краснофлотский", "пер.Кольцова", "ул.Кирова"],

    // 17: Школа 13 ➔ Мост ➔ Закурье ➔ Кошково
    "17": ["Школа №13", "ул.Чайковского", "Юбилейная", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "Французская", "пл.ЧМЗ", "Мост_Левый", "Мост_Правый", "50лет ВЛКСМ", "Закурье", "п.Кошково"],

    // 22: Школа 13 ➔ Мост ➔ Вокзал ➔ Архиповка ➔ ГЛК Такман
    "22": ["Школа №13", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "пл.ЧМЗ", "ДКЖ", "ж/д вокзал", "п.Архиповка", "ГЛК Такман"]
  };

  function getStopCoord(name) {
    if (!name) return null;
    const clean = name.trim();
    if (MAP_STOPS_COORDS[clean]) return MAP_STOPS_COORDS[clean];
    // fuzzy match
    for (let key in MAP_STOPS_COORDS) {
      if (clean.includes(key) || key.includes(clean)) return MAP_STOPS_COORDS[key];
    }
    return null;
  }

  // Calculate distance-weighted position along a polyline
  function interpolateAlongPolyline(points, progress) {
    if (!points || points.length < 2) return null;
    const clampedProgress = Math.max(0, Math.min(1, progress));

    // Calculate segment lengths
    const segLengths = [];
    let totalDist = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      segLengths.push(dist);
      totalDist += dist;
    }

    if (totalDist === 0) {
      return { x: points[0].x, y: points[0].y, angle: 0 };
    }

    const targetDist = clampedProgress * totalDist;
    let accumulatedDist = 0;

    for (let i = 0; i < segLengths.length; i++) {
      const segLen = segLengths[i];
      if (accumulatedDist + segLen >= targetDist || i === segLengths.length - 1) {
        const segFrac = segLen > 0 ? (targetDist - accumulatedDist) / segLen : 0;
        const p1 = points[i];
        const p2 = points[i + 1];
        const curX = p1.x + (p2.x - p1.x) * segFrac;
        const curY = p1.y + (p2.y - p1.y) * segFrac;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const angleDeg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);

        return {
          x: curX,
          y: curY,
          angle: angleDeg
        };
      }
      accumulatedDist += segLen;
    }

    const last = points[points.length - 1];
    return { x: last.x, y: last.y, angle: 0 };
  }

  // ==========================================================================
  // LEAFLET OPENSTREETMAP INTERACTIVE BUS MAP & ROAD-SNAPPED TRACKS
  // ==========================================================================
  let leafletMap = null;
  let activeTrackPolyline = null;
  let activeBusMarkers = [];
  let stopMarkersGroup = null;

  // Real road-snapped tracks passed from generator
  const REAL_TRACKS = window.REAL_ROUTES_TRACKS || {};

  // Route brand color mapping
  const ROUTE_BRAND_COLORS = {
    "1": "#2563eb",
    "3": "#dc2626",
    "4": "#059669",
    "5": "#7c3aed",
    "6": "#f59e0b",
    "7": "#0891b2",
    "9": "#db2777",
    "10": "#ea580c",
    "11": "#0d9488",
    "12": "#4f46e5",
    "15": "#65a30d",
    "16": "#9333ea",
    "17": "#e11d48",
    "22": "#0284c7"
  };

  // Initialize Leaflet Map
  function initLeafletMap() {
    const container = document.getElementById('leafletMapContainer');
    if (!container || leafletMap) return;

    // Chusovoy center: 58.285, 57.820, zoom 13
    leafletMap = L.map('leafletMapContainer', {
      center: [58.2869, 57.8148],
      zoom: 13,
      zoomControl: true,
      attributionControl: false
    });

    // Standard free OpenStreetMap tiles (100% free, no API key required)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(leafletMap);

    stopMarkersGroup = L.layerGroup().addTo(leafletMap);
  }

  // Render right sidebar route selection tiles
  function renderSchemeRouteTiles() {
    if (!schemeRouteTilesContainer) return;

    // Filter urban routes only
    const urbanRoutes = allRoutes.filter(r => r.category !== 'suburban');

    let html = '';
    urbanRoutes.forEach(r => {
      const isSelected = (selectedSchemeRoute === r.number);
      const activeClass = isSelected ? 'active' : '';
      const hasTrack = Boolean(REAL_TRACKS[r.number]);
      const color = ROUTE_BRAND_COLORS[r.number] || '#d97706';

      html += `
        <button class="route-tile-btn ${activeClass} ${!hasTrack ? 'is-dev' : ''}" data-route="${r.number}" style="--tile-brand-color: ${color};">
          <div class="tile-top-row">
            <span class="tile-number" style="border-left: 3px solid ${color};">№${r.number}</span>
            ${hasTrack ? '<span class="tile-live-count">✓ Готов</span>' : '<span class="tile-badge-dev">В разработке</span>'}
          </div>
          <div class="tile-name">${r.name}</div>
        </button>
      `;
    });

    schemeRouteTilesContainer.innerHTML = html;

    // Attach click events to tiles
    const tileBtns = schemeRouteTilesContainer.querySelectorAll('.route-tile-btn');
    tileBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const routeNum = btn.dataset.route;
        if (selectedSchemeRoute === routeNum) {
          setSchemeActiveRoute('none');
        } else {
          setSchemeActiveRoute(routeNum);
        }
      });
    });

    updateActiveRouteSummary();
  }

  // Change selected scheme route
  function setSchemeActiveRoute(routeNum) {
    selectedSchemeRoute = routeNum;

    // Update tile button active states
    if (schemeRouteTilesContainer) {
      const tileBtns = schemeRouteTilesContainer.querySelectorAll('.route-tile-btn');
      tileBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.route === routeNum);
      });
    }

    // Update toolbar controls active states
    if (schemeFilterAllBtn) schemeFilterAllBtn.classList.toggle('active', routeNum === 'all');
    if (schemeFilterNoneBtn) schemeFilterNoneBtn.classList.toggle('active', routeNum === 'none');

    updateActiveRouteSummary();
    drawRouteOnMap(routeNum);
    updateLiveMapRadar();
  }

  // Draw road-aligned polyline on Leaflet map
  function drawRouteOnMap(routeNum) {
    if (!leafletMap) return;

    // Remove existing track and markers
    if (activeTrackPolyline) {
      leafletMap.removeLayer(activeTrackPolyline);
      activeTrackPolyline = null;
    }
    if (stopMarkersGroup) {
      stopMarkersGroup.clearLayers();
    }

    if (routeNum === 'none' || routeNum === 'all') {
      return;
    }

    const trackData = REAL_TRACKS[routeNum];
    if (!trackData || !trackData.points || !trackData.points.length) {
      return;
    }

    const color = trackData.color || ROUTE_BRAND_COLORS[routeNum] || '#f59e0b';

    // Outer glow line
    const glowLine = L.polyline(trackData.points, {
      color: color,
      weight: 9,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round'
    });

    // Main sharp line
    const mainLine = L.polyline(trackData.points, {
      color: color,
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    });

    activeTrackPolyline = L.featureGroup([glowLine, mainLine]).addTo(leafletMap);

    // Fit map bounds to show route nicely
    leafletMap.fitBounds(mainLine.getBounds(), { padding: [40, 40], maxZoom: 15 });

    // Mark Start and End stops
    const pts = trackData.points;
    const startPt = pts[0];
    const endPt = pts[pts.length - 1];

    const startIcon = L.divIcon({
      className: 'leaflet-stop-pin',
      html: `<div style="background:#10b981; width:14px; height:14px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 8px rgba(0,0,0,0.5);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    const endIcon = L.divIcon({
      className: 'leaflet-stop-pin',
      html: `<div style="background:#ef4444; width:14px; height:14px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 8px rgba(0,0,0,0.5);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    L.marker(startPt, { icon: startIcon }).bindTooltip(`Конечная: ${trackData.name.split('—')[0].trim()}`, { direction: 'top' }).addTo(stopMarkersGroup);
    L.marker(endPt, { icon: endIcon }).bindTooltip(`Конечная: ${trackData.name.split('—')[1] ? trackData.name.split('—')[1].trim() : ''}`, { direction: 'top' }).addTo(stopMarkersGroup);
  }

  // Update active route description in sidebar footer
  function updateActiveRouteSummary() {
    if (!schemeActiveRouteInfo) return;

    if (selectedSchemeRoute === 'none') {
      schemeActiveRouteInfo.innerHTML = '<div class="active-route-info-empty">Маршрут не выбран. Карта чистая.</div>';
      return;
    }

    if (selectedSchemeRoute === 'all') {
      schemeActiveRouteInfo.innerHTML = '<div class="active-route-info-card"><strong>Все городские маршруты</strong><span>Выберите конкретный маршрут для просмотра точной трассы</span></div>';
      return;
    }

    const hasTrack = Boolean(REAL_TRACKS[selectedSchemeRoute]);
    const route = allRoutes.find(r => r.number === selectedSchemeRoute);

    if (!hasTrack) {
      schemeActiveRouteInfo.innerHTML = `
        <div class="active-route-info-card" style="border-left: 3px solid #64748b; padding-left: 0.5rem;">
          <strong style="color: #94a3b8;">Маршрут №${selectedSchemeRoute} — В разработке</strong>
          <span>Траектория движения в процессе выравнивания. Доступны маршруты: №6, №5.</span>
        </div>
      `;
      return;
    }

    if (route) {
      schemeActiveRouteInfo.innerHTML = `
        <div class="active-route-info-card" style="border-left: 3px solid ${ROUTE_BRAND_COLORS[route.number]}; padding-left: 0.5rem;">
          <strong>№${route.number} ${route.name}</strong>
          ${route.streets ? `<span>Через: ${route.streets}</span>` : ''}
          <span style="color:#10b981; font-weight:700; margin-top:3px;">● Трасса выровнена по дорогам Чусового</span>
        </div>
      `;
    }
  }

  // Calculate distance between two lat/lon points in km
  function distanceLatLon(lat1, lon1, lat2, lon2) {
    const p = 0.017453292519943295;
    const a = 0.5 - Math.cos((lat2 - lat1) * p)/2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p))/2;
    return 12742 * Math.asin(Math.sqrt(a));
  }

  // Calculate coordinates along polyline based on progress 0..1
  function interpolateLeafletPolyline(points, progress) {
    if (!points || points.length < 2) return null;
    const clampedProgress = Math.max(0, Math.min(1, progress));

    const segLens = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const d = distanceLatLon(points[i][0], points[i][1], points[i+1][0], points[i+1][1]);
      segLens.push(d);
      total += d;
    }

    if (total === 0) return { lat: points[0][0], lon: points[0][1], angle: 0 };

    const target = clampedProgress * total;
    let accum = 0;

    for (let i = 0; i < segLens.length; i++) {
      const sl = segLens[i];
      if (accum + sl >= target || i === segLens.length - 1) {
        const frac = sl > 0 ? (target - accum) / sl : 0;
        const p1 = points[i];
        const p2 = points[i+1];
        const lat = p1[0] + (p2[0] - p1[0]) * frac;
        const lon = p1[1] + (p2[1] - p1[1]) * frac;

        // Angle
        const dLon = (p2[1] - p1[1]);
        const dLat = (p2[0] - p1[0]);
        const angle = Math.round(Math.atan2(dLon, dLat) * 180 / Math.PI);

        return { lat, lon, angle };
      }
      accum += sl;
    }

    const last = points[points.length - 1];
    return { lat: last[0], lon: last[1], angle: 0 };
  }

  // Live bus movement on Leaflet map
  function updateLiveMapRadar() {
    if (!leafletMap) return;

    // Clear previous bus markers
    activeBusMarkers.forEach(m => leafletMap.removeLayer(m));
    activeBusMarkers = [];

    // If 'none' or route without track, don't show buses
    if (selectedSchemeRoute === 'none' || (selectedSchemeRoute !== 'all' && !REAL_TRACKS[selectedSchemeRoute])) {
      return;
    }

    const now = getNow();
    const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const weekendToday = isWeekend(now);

    const routesToCheck = (selectedSchemeRoute === 'all') ? Object.keys(REAL_TRACKS) : [selectedSchemeRoute];

    routesToCheck.forEach(rNum => {
      const trackData = REAL_TRACKS[rNum];
      if (!trackData) return;

      const route = allRoutes.find(r => r.number === rNum);
      if (!route) return;

      route.sections.forEach(sec => {
        if (sec.type === 'weekday' && weekendToday) return;
        if (sec.type === 'weekend' && !weekendToday) return;

        const stops = sec.stops;
        if (!stops || stops.length < 2) return;

        // Two endpoints of the route
        const firstStop = stops[0];
        const lastStop = stops[stops.length - 1];

        // Search for currently active buses in both directions (Outbound: firstStop -> lastStop, Inbound: lastStop -> firstStop)
        let activeBuses = [];
        let nearestOutbound = null;
        let nearestInbound = null;
        let minDiffOut = Infinity;
        let minDiffIn = Infinity;

        sec.schedule.forEach(trip => {
          // Outbound: starts from firstStop
          const tOutObj = trip[firstStop];
          if (tOutObj && tOutObj.time) {
            const [h, m] = tOutObj.time.split(':').map(Number);
            const startOutMin = h * 60 + m;
            let endOutMin = startOutMin + 26; // default 26 min trip

            // If arrival time at lastStop is specified, use exact time
            const tEndObj = trip[lastStop];
            if (tEndObj && tEndObj.time) {
              const [eh, em] = tEndObj.time.split(':').map(Number);
              const exactEnd = eh * 60 + em;
              if (exactEnd > startOutMin) endOutMin = exactEnd;
            }

            if (nowMinutes >= startOutMin && nowMinutes <= endOutMin) {
              const rawProgress = (nowMinutes - startOutMin) / (endOutMin - startOutMin);
              activeBuses.push({
                direction: 'outbound',
                dest: lastStop,
                origin: firstStop,
                tStart: tOutObj.time,
                progress: Math.max(0.02, Math.min(0.98, rawProgress)),
                isLive: true
              });
            } else {
              const diff = Math.abs(nowMinutes - startOutMin);
              if (diff < minDiffOut) {
                minDiffOut = diff;
                nearestOutbound = {
                  direction: 'outbound',
                  dest: lastStop,
                  origin: firstStop,
                  tStart: tOutObj.time,
                  progress: 0.28,
                  isLive: false
                };
              }
            }
          }

          // Inbound: starts from lastStop
          const tInObj = trip[lastStop];
          if (tInObj && tInObj.time) {
            const [h, m] = tInObj.time.split(':').map(Number);
            const startInMin = h * 60 + m;
            const endInMin = startInMin + 26;

            if (nowMinutes >= startInMin && nowMinutes <= endInMin) {
              const rawProgress = (nowMinutes - startInMin) / (endInMin - startInMin);
              // Reverse progress along polyline: goes from 1.0 down to 0.0
              activeBuses.push({
                direction: 'inbound',
                dest: firstStop,
                origin: lastStop,
                tStart: tInObj.time,
                progress: Math.max(0.02, Math.min(0.98, 1.0 - rawProgress)),
                isLive: true
              });
            } else {
              const diff = Math.abs(nowMinutes - startInMin);
              if (diff < minDiffIn) {
                minDiffIn = diff;
                nearestInbound = {
                  direction: 'inbound',
                  dest: firstStop,
                  origin: lastStop,
                  tStart: tInObj.time,
                  progress: 0.72,
                  isLive: false
                };
              }
            }
          }
        });

        // Determine buses to show: active ones, or show 2 demonstration buses (outbound + inbound) if off-peak
        let busesToShow = activeBuses;
        if (busesToShow.length === 0) {
          if (nearestOutbound) busesToShow.push(nearestOutbound);
          if (nearestInbound) busesToShow.push(nearestInbound);
        }

        busesToShow.forEach(({ direction, dest, origin, tStart, progress, isLive }) => {
          const busPos = interpolateLeafletPolyline(trackData.points, progress);
          if (busPos) {
            const busColor = trackData.color || ROUTE_BRAND_COLORS[rNum] || '#f59e0b';
            // Inbound bus moves backwards along polyline, so flip angle by 180 deg
            const angleOffset = direction === 'inbound' ? 90 : -90;
            const headingAngle = busPos.angle + angleOffset;
            const dirArrow = direction === 'inbound' ? '◀' : '▶';

            const iconHtml = `
              <div class="leaflet-bus-marker-wrap">
                <div class="leaflet-bus-badge" style="background: ${busColor}; font-weight:800;">
                  № ${rNum} ${dirArrow}
                </div>
                <div class="leaflet-bus-svg-wrap" style="transform: rotate(${headingAngle}deg);">
                  <svg width="34" height="22" viewBox="0 0 50 30" fill="none">
                    <rect x="4" y="5" width="40" height="20" rx="4" fill="${busColor}" stroke="#fff" stroke-width="2" />
                    <rect x="10" y="3" width="28" height="4" rx="1.5" fill="#ffffff" />
                    <rect x="8" y="9" width="30" height="7" rx="1.5" fill="#1e252d" />
                    <circle cx="43" cy="15" r="3.5" fill="#fef08a" />
                  </svg>
                </div>
              </div>
            `;

            const busIcon = L.divIcon({
              className: 'leaflet-bus-icon',
              html: iconHtml,
              iconSize: [46, 46],
              iconAnchor: [23, 23]
            });

            const marker = L.marker([busPos.lat, busPos.lon], { icon: busIcon })
              .bindTooltip(`
                <strong>Маршрут №${rNum} (${direction === 'outbound' ? 'Прямой' : 'Обратный'})</strong><br>
                <span>Направление: ➔ <b>${dest}</b></span><br>
                <small>${isLive ? '🟢 В рейсе • Отпр. в ' + tStart : '⏰ Плановый рейс: ' + tStart}</small>
              `, { direction: 'top' })
              .addTo(leafletMap);

            activeBusMarkers.push(marker);
          }
        });
      });
    });
  }

  // Check and display fallback banner if offline snapshot is in use
  function checkFallbackStatus() {
    const meta = window.SCHEDULE_META;
    if (meta && meta.isFallback) {
      const banner = document.getElementById('fallbackBanner');
      const dateEl = document.getElementById('fallbackBannerDate');
      if (banner) {
        if (dateEl && meta.fallbackDate) {
          dateEl.textContent = meta.fallbackDate;
        }
        banner.style.display = 'flex';
      }
    }
  }

  // Initialization
  function init() {
    applyTheme(getPreferredTheme());
    updateClock();
    setupEventListeners();
    renderRoutes();
    updateLedScoreboard();
    updateLiveMapRadar();
    checkFallbackStatus();
  }

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

