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

  // DOM Elements
  const routesGrid = document.getElementById('routesGrid');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const filterPills = document.querySelectorAll('.pill-btn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const liveClockEl = document.getElementById('liveClock');
  const busMascot = document.getElementById('busMascot');
  const honkTooltip = document.getElementById('honkTooltip');

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

    // Blink headlights twice-thrice with 0.5s initial pause before turning on when entering dark mode
    if (theme === 'dark' && animateHeadlights && busMascot) {
      busMascot.classList.remove('headlights-blinking');
      // Force reflow to re-trigger CSS keyframes
      void busMascot.offsetWidth;
      busMascot.classList.add('headlights-blinking');
      setTimeout(() => {
        if (busMascot) busMascot.classList.remove('headlights-blinking');
      }, 1900);
    }
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
      updateLiveMapRadar();
    }, 5000);
  }

  // ==========================================================================
  // MEGA-ULTRA DYNAMIC RADAR: Theoretical Bus Positions on Chusovoy Scheme Map
  // Calculates real-time progress between terminal and intermediate stops!
  // ==========================================================================

  // Map nodes normalized percentages (X%, Y%) precisely calibrated on official Chusovoy scheme (1024x724)
  // Left bank (Старый город / ЧМЗ / Завод):
  //   Горбольница, Поликлиника, пл.ЧМЗ, Автостанция, Революционная, Сплавщиков
  // Bridge crossing:
  //   Заводская проходная (X: 44.5%, Y: 53.0%) ➔ Мост через р.Чусовая ➔ Правый берег (X: 52.0%, Y: 56.5%)
  // Right bank (Новый город):
  //   Школа №13, пл.Металлургов, Севастопольская, Кирова, Архиповка, Коммунистическая, Кошково
  const MAP_STOPS_COORDS = {
    // Left bank (West of river):
    "Горбольница": { x: 18.2, y: 45.2 },
    "Поликлиника": { x: 19.5, y: 35.5 },
    "ул.Переездная": { x: 14.8, y: 42.5 },
    "Церковь": { x: 12.0, y: 38.5 },
    "КДЦ": { x: 20.5, y: 40.5 },
    "ул.Южная": { x: 25.8, y: 44.5 },
    "ул.Коммунальная": { x: 27.5, y: 51.5 },
    "РМЗ": { x: 22.0, y: 55.0 },
    "пл.ЧМЗ": { x: 33.5, y: 44.8 },
    "ПлощадьЧМЗ": { x: 33.5, y: 44.8 },
    "Автостанция": { x: 32.5, y: 41.5 },
    "АС Чусовой": { x: 32.5, y: 41.5 },
    "Администрация": { x: 26.0, y: 35.0 },
    "Дом спорта": { x: 34.5, y: 35.0 },
    "ДКЖ": { x: 42.5, y: 31.5 },
    "Французская": { x: 39.5, y: 49.0 },
    "Заводская проходная": { x: 44.5, y: 53.0 },
    "ул.Революционная": { x: 6.5, y: 33.5 },
    "магазин «БРАВО»": { x: 10.5, y: 32.5 },
    "Кладбище": { x: 18.5, y: 26.0 },
    "ул.Сплавщиков": { x: 6.8, y: 61.5 },
    "Сплавщиков": { x: 6.8, y: 61.5 },
    "ул.Черноморская": { x: 12.0, y: 62.0 },
    "ул.Каспийская": { x: 12.0, y: 65.5 },
    "ул.Вильвенская": { x: 12.0, y: 69.5 },
    "Молокозавод": { x: 14.5, y: 70.0 },

    // The Bridge across Chusovaya river (БЕЗОПАСНЫЙ ПЕРЕЕЗД ЧЕРЕЗ МОСТ):
    "Мост_Левый": { x: 44.5, y: 53.0 },
    "Мост_Правый": { x: 52.0, y: 56.5 },

    // Upper North road on left/top (Вокзал, Архиповка):
    "ул.Матросова": { x: 48.5, y: 28.0 },
    "ж/д вокзал": { x: 53.5, y: 24.5 },
    "Ж.Д. Вокзал": { x: 53.5, y: 24.5 },
    "ПЧ-16": { x: 59.5, y: 23.0 },
    "п.Архиповка": { x: 64.0, y: 23.0 },
    "Архиповка": { x: 64.0, y: 23.0 },

    // Right bank (East / New town):
    "пер.Краснофлотский": { x: 59.5, y: 45.0 },
    "пер.Чунжинский": { x: 59.5, y: 49.0 },
    "ул.Чкалова": { x: 58.5, y: 54.0 },
    "Техникум": { x: 63.5, y: 60.5 },
    "ул.Юности": { x: 68.0, y: 60.5 },
    "50лет ВЛКСМ": { x: 62.0, y: 73.0 },
    "ул.Мира": { x: 68.0, y: 68.5 },
    "Ротонда": { x: 73.5, y: 71.5 },
    "Преображенска": { x: 82.5, y: 73.5 },
    "ул.Сивкова": { x: 84.5, y: 65.0 },
    "ул.Чайковского": { x: 76.5, y: 58.5 },
    "Юбилейная": { x: 77.0, y: 54.5 },
    "ул.Пермская": { x: 79.5, y: 52.0 },
    "ул.Победы": { x: 76.5, y: 49.0 },
    "пл.Металлургов": { x: 71.5, y: 44.0 },
    "ул.Луначарского": { x: 76.5, y: 43.0 },
    "ул.Парковая": { x: 79.5, y: 43.0 },
    "ул.Севастопольская": { x: 83.5, y: 46.0 },
    "Школа №13": { x: 84.5, y: 56.5 },
    "школа 13": { x: 84.5, y: 56.5 },
    "к/с Горняк": { x: 70.5, y: 38.0 },
    "ул.Кирова": { x: 65.0, y: 35.0 },
    "пер.Кольцова": { x: 62.0, y: 37.0 },

    // Southern Right Bank (Коммунистическая, Кошково):
    "Закурье": { x: 54.5, y: 77.5 },
    "п.Совхозный": { x: 54.5, y: 77.5 },
    "Кошково": { x: 55.5, y: 85.0 },
    "п.Кошково": { x: 55.5, y: 85.0 },
    "Мелькомбинат": { x: 55.5, y: 85.0 },
    "Спорткомплекс": { x: 68.0, y: 83.5 },
    "ул.Коммунистическая": { x: 63.5, y: 83.5 },

    // Suburban branches:
    "п.Всесвятская": { x: 26.5, y: 18.0 },
    "п.Кучино": { x: 12.0, y: 84.0 },
    "п.Мыс": { x: 56.0, y: 92.0 },
    "п.Копально": { x: 12.0, y: 84.0 },
    "п.Центральный": { x: 12.0, y: 84.0 },
    "ст.Калино": { x: 56.0, y: 92.0 },
    "с.Сёла": { x: 56.0, y: 92.0 },
    "ГЛК Такман": { x: 64.0, y: 23.0 }
  };

  // Route paths definition: strictly follow road lines and Cross the Bridge!
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

    // 22: Школа 13 ➔ Мост ➔ Вокзал ➔ Архиповка
    "22": ["Школа №13", "пл.Металлургов", "ул.Чкалова", "Мост_Правый", "Мост_Левый", "пл.ЧМЗ", "ДКЖ", "ж/д вокзал", "п.Архиповка"],

    // Пригородные:
    "101": ["АС Чусовой", "Дом спорта", "Кладбище", "п.Всесвятская"],
    "322": ["АС Чусовой", "пл.ЧМЗ", "РМЗ", "ул.Сплавщиков", "п.Кучино"],
    "323": ["АС Чусовой", "Французская", "Мост_Левый", "Мост_Правый", "Закурье", "Кошково", "п.Мыс"],
    "324": ["АС Чусовой", "Французская", "Мост_Левый", "Мост_Правый", "Закурье", "Кошково", "ст.Калино"],
    "325": ["АС Чусовой", "пл.ЧМЗ", "РМЗ", "ул.Сплавщиков", "п.Копально"],
    "365": ["АС Чусовой", "пл.ЧМЗ", "РМЗ", "ул.Сплавщиков", "п.Центральный"],
    "373": ["АС Чусовой", "Французская", "Мост_Левый", "Мост_Правый", "Закурье", "Кошково", "с.Сёла"],
    "474": ["АС Чусовой", "Дом спорта", "Кладбище", "п.Всесвятская"]
  };

  function getStopCoord(name) {
    if (!name) return null;
    if (MAP_STOPS_COORDS[name]) return MAP_STOPS_COORDS[name];
    // fuzzy match
    for (let key in MAP_STOPS_COORDS) {
      if (name.includes(key) || key.includes(name)) return MAP_STOPS_COORDS[key];
    }
    return null;
  }

  // Calculate current live bus positions based on schedule
  function updateLiveMapRadar() {
    const overlay = document.getElementById('busesLiveOverlay');
    const countBadge = document.getElementById('activeBusesCount');
    if (!overlay || !allRoutes.length) return;

    const now = getNow();
    const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const weekendToday = isWeekend(now);

    const activeBuses = [];

    allRoutes.forEach(route => {
      route.sections.forEach(sec => {
        if (sec.type === 'weekday' && weekendToday) return;
        if (sec.type === 'weekend' && !weekendToday) return;

        const stops = sec.stops;
        if (!stops || stops.length < 2) return;

        sec.schedule.forEach(trip => {
          const firstStop = stops[0];
          const lastStop = stops[stops.length - 1];
          const tStartObj = trip[firstStop];
          const tEndObj = trip[lastStop];

          if (!tStartObj || !tStartObj.time) return;

          const [sh, sm] = tStartObj.time.split(':').map(Number);
          const startMin = sh * 60 + sm;

          // Estimate end time if not given (typical trip 20-35 mins)
          let endMin = startMin + 25;
          if (tEndObj && tEndObj.time) {
            const [eh, em] = tEndObj.time.split(':').map(Number);
            endMin = eh * 60 + em;
            if (endMin < startMin) endMin += 1440; // overnight
          }

          // Check if bus is actively en route right now (with 3 min window before departure)
          if (nowMinutes >= startMin - 1 && nowMinutes <= endMin + 1) {
            const progress = Math.max(0, Math.min(1, (nowMinutes - startMin) / Math.max(1, endMin - startMin)));

            // Compute interpolated position along route path
            const pathNames = ROUTE_PATHS[route.number] || stops;
            const validCoords = [];
            pathNames.forEach(st => {
              const c = getStopCoord(st);
              if (c) validCoords.push(c);
            });

            if (validCoords.length >= 2) {
              const totalSegments = validCoords.length - 1;
              const segProgress = progress * totalSegments;
              const curSeg = Math.floor(segProgress);
              const frac = segProgress - curSeg;

              const p1 = validCoords[Math.min(curSeg, totalSegments - 1)];
              const p2 = validCoords[Math.min(curSeg + 1, totalSegments)];

              const curX = p1.x + (p2.x - p1.x) * frac;
              const curY = p1.y + (p2.y - p1.y) * frac;

              // Direction angle for headlights
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const angleDeg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);

              activeBuses.push({
                num: route.number,
                name: route.name,
                from: firstStop,
                to: lastStop,
                x: curX,
                y: curY,
                angle: angleDeg,
                startTime: tStartObj.time,
                progressPct: Math.round(progress * 100),
                note: tStartObj.note
              });
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
      overlayHtml += `
        <div class="live-map-bus" style="left: ${b.x}%; top: ${b.y}%;" title="Маршрут №${b.num}">
          <div class="map-bus-tooltip">
            <strong>№${b.num} ${b.from} ➔ ${b.to}</strong><br>
            Отпр: ${b.startTime} • В пути ${b.progressPct}% ${b.note ? '• ' + b.note : ''}
          </div>
          <div class="map-bus-pin">
            <div class="map-bus-badge">№ ${b.num}</div>
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

  // Initialization
  function init() {
    applyTheme(getPreferredTheme());
    updateClock();
    setupEventListeners();
    renderRoutes();
    updateLedScoreboard();
    updateLiveMapRadar();
  }

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

