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
        renderSchemeRouteTiles();
        updateLiveMapRadar();
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

  // Route brand color mapping
  const ROUTE_BRAND_COLORS = {
    "1": "#2563eb",
    "3": "#dc2626",
    "4": "#059669",
    "5": "#7c3aed",
    "6": "#d97706",
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

  // Render right sidebar route selection tiles
  function renderSchemeRouteTiles() {
    if (!schemeRouteTilesContainer) return;

    // Filter urban routes only
    const urbanRoutes = allRoutes.filter(r => r.category !== 'suburban');

    let html = '';
    urbanRoutes.forEach(r => {
      const isSelected = (selectedSchemeRoute === r.number);
      const activeClass = isSelected ? 'active' : '';
      const color = ROUTE_BRAND_COLORS[r.number] || '#d97706';

      html += `
        <button class="route-tile-btn ${activeClass}" data-route="${r.number}" style="--tile-brand-color: ${color};">
          <div class="tile-top-row">
            <span class="tile-number" style="border-left: 3px solid ${color};">№${r.number}</span>
            <span class="tile-live-count" id="tileCount-${r.number}"></span>
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
          // Toggle off: set to none (clean map)
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
    updateLiveMapRadar();
  }

  // Update active route description in sidebar footer
  function updateActiveRouteSummary() {
    if (!schemeActiveRouteInfo) return;

    if (selectedSchemeRoute === 'none') {
      schemeActiveRouteInfo.innerHTML = '<div class="active-route-info-empty">Маршрут не выбран. Карта чистая.</div>';
      return;
    }

    if (selectedSchemeRoute === 'all') {
      schemeActiveRouteInfo.innerHTML = '<div class="active-route-info-card"><strong>Все городские маршруты</strong><span>Отображаются все активные машины на линиях</span></div>';
      return;
    }

    const route = allRoutes.find(r => r.number === selectedSchemeRoute);
    if (route) {
      schemeActiveRouteInfo.innerHTML = `
        <div class="active-route-info-card">
          <strong>№${route.number} ${route.name}</strong>
          ${route.streets ? `<span>Через: ${route.streets}</span>` : ''}
        </div>
      `;
    }
  }

  // Calculate current live bus positions based on schedule
  function updateLiveMapRadar() {
    const overlay = document.getElementById('busesLiveOverlay');
    if (!overlay || !allRoutes.length) return;

    // If 'none' selected, clear map and return
    if (selectedSchemeRoute === 'none') {
      overlay.innerHTML = '';
      return;
    }

    const now = getNow();
    const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const weekendToday = isWeekend(now);

    const activeBuses = [];

    allRoutes.forEach(route => {
      // На интерактивной схеме города показываем только городские автобусы
      if (route.category === 'suburban') return;

      // Filter: if specific route is selected, skip all others!
      if (selectedSchemeRoute !== 'all' && selectedSchemeRoute !== route.number) {
        return;
      }

      route.sections.forEach(sec => {
        if (sec.type === 'weekday' && weekendToday) return;
        if (sec.type === 'weekend' && !weekendToday) return;

        const stops = sec.stops;
        if (!stops || stops.length < 2) return;

        sec.schedule.forEach((trip, tripIndex) => {
          // Find first stop with valid departure time
          let startStop = null;
          let tStartObj = null;
          let endStop = null;
          let tEndObj = null;

          for (let s of stops) {
            if (trip[s] && trip[s].time) {
              if (!startStop) {
                startStop = s;
                tStartObj = trip[s];
              }
              endStop = s;
              tEndObj = trip[s];
            }
          }

          if (!startStop || !tStartObj || !tStartObj.time) return;

          const [sh, sm] = tStartObj.time.split(':').map(Number);
          const startMin = sh * 60 + sm;

          // Trip duration estimation
          let endMin = startMin + 25;
          if (tEndObj && tEndObj.time && endStop !== startStop) {
            const [eh, em] = tEndObj.time.split(':').map(Number);
            let calculatedEnd = eh * 60 + em;
            if (calculatedEnd < startMin) calculatedEnd += 1440;
            if (calculatedEnd > startMin) endMin = calculatedEnd;
          }

          // Check if bus is actively en route right now (with 1 min margin)
          if (nowMinutes >= startMin && nowMinutes <= endMin) {
            const progress = Math.max(0, Math.min(1, (nowMinutes - startMin) / Math.max(1, endMin - startMin)));

            // Construct exact waypoint coordinates for this route
            const baseRoutePath = ROUTE_PATHS[route.number];
            let pathSequence = [];

            if (baseRoutePath && baseRoutePath.length > 0) {
              pathSequence = [...baseRoutePath];

              // Direction handling: if schedule sequence indicates reverse direction, reverse waypoints
              const firstBase = baseRoutePath[0];
              const lastBase = baseRoutePath[baseRoutePath.length - 1];

              // Check if departure is closer to lastBase than firstBase
              const isReverse = (startStop.includes(lastBase) || lastBase.includes(startStop)) &&
                                !(startStop.includes(firstBase) || firstBase.includes(startStop));

              if (isReverse) {
                pathSequence.reverse();
              }
            } else {
              pathSequence = [...stops];
            }

            // Convert names to coordinates
            const validCoords = [];
            pathSequence.forEach(st => {
              const c = getStopCoord(st);
              if (c) validCoords.push(c);
            });

            if (validCoords.length >= 2) {
              const pos = interpolateAlongPolyline(validCoords, progress);
              if (pos) {
                activeBuses.push({
                  id: `bus-${route.number}-${tripIndex}-${startStop}`,
                  num: route.number,
                  name: route.name,
                  from: startStop,
                  to: endStop || stops[stops.length - 1],
                  x: Number(pos.x.toFixed(2)),
                  y: Number(pos.y.toFixed(2)),
                  angle: pos.angle,
                  startTime: tStartObj.time,
                  progressPct: Math.round(progress * 100),
                  note: tStartObj.note || (tEndObj ? tEndObj.note : '')
                });
              }
            }
          }
        });
      });
    });

    if (countBadge) {
      countBadge.textContent = activeBuses.length;
    }

    // Render SVG Live Radar Bus Icons on top of Map
    let overlayHtml = '';
    activeBuses.forEach(b => {
      const busColor = ROUTE_BRAND_COLORS[b.num] || 'var(--accent-primary)';
      overlayHtml += `
        <div class="live-map-bus" id="${b.id}" style="left: ${b.x}%; top: ${b.y}%;" title="Маршрут №${b.num}">
          <div class="map-bus-tooltip">
            <strong>№${b.num} ${b.from} ➔ ${b.to}</strong><br>
            Отпр: ${b.startTime} • В пути ${b.progressPct}% ${b.note ? '• ' + b.note : ''}
          </div>
          <div class="map-bus-pin">
            <div class="map-bus-badge" style="background: ${busColor}; border-color: #ffffff;">№ ${b.num}</div>
            <div class="map-bus-vehicle" style="transform: rotate(${b.angle}deg);">
              <svg class="map-bus-svg" viewBox="0 0 50 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Glowing Headlights Cone Projection in Dark Mode -->
                <polygon class="map-bus-headlight-beam" points="44,15 75,5 75,25" fill="url(#headlightRay)" />
                <!-- Bus Chassis in Permian Red Livery -->
                <rect x="4" y="5" width="40" height="20" rx="4" fill="#cf2323" stroke="#fff" stroke-width="1" />
                <!-- White Aerodynamic Roof -->
                <rect x="10" y="3" width="28" height="4" rx="1.5" fill="#ffffff" />
                <!-- Dark Tinted Windows -->
                <rect x="8" y="9" width="30" height="7" rx="1.5" fill="#1e252d" />
                <!-- Headlight Lamp with Glowing effect -->
                <circle cx="43" cy="15" r="2.5" fill="#fef08a" class="map-bus-lamp-glow" />
                <!-- Rear Light -->
                <circle cx="5" cy="15" r="1.5" fill="#ef4444" />
              </svg>
            </div>
          </div>
        </div>
      `;
    });

    overlay.innerHTML = overlayHtml;
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

