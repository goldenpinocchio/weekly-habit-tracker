const STORAGE_KEY = 'habit-planner-v2';

const DAYS = [
  { short: 'M', name: 'Mon' },
  { short: 'T', name: 'Tue' },
  { short: 'W', name: 'Wed' },
  { short: 'T', name: 'Thu' },
  { short: 'F', name: 'Fri' },
  { short: 'S', name: 'Sat' },
  { short: 'S', name: 'Sun' },
];

const els = {
  weekTitle: document.getElementById('weekTitle'),
  weekCopyPrompt: document.getElementById('weekCopyPrompt'),
  trackerBoard: document.getElementById('trackerBoard'),
  weekHearts: document.getElementById('weekHearts'),
  weekSubtitle: document.getElementById('weekSubtitle'),
  allTimeHearts: document.getElementById('allTimeHearts'),
  summaryCard: document.querySelector('.summary-card--home'),
  mission: document.getElementById('mission'),
  missionSave: document.getElementById('missionSave'),
  monthTitle: document.getElementById('monthTitle'),
  monthOverview: document.getElementById('monthOverview'),
  monthTotalHearts: document.getElementById('monthTotalHearts'),
  screenHabits: document.getElementById('screenHabits'),
  screenMonth: document.getElementById('screenMonth'),
  screenSettings: document.getElementById('screenSettings'),
  habitDialog: document.getElementById('habitDialog'),
  habitForm: document.getElementById('habitForm'),
  habitDialogTitle: document.getElementById('habitDialogTitle'),
  habitId: document.getElementById('habitId'),
  habitName: document.getElementById('habitName'),
  habitPoints: document.getElementById('habitPoints'),
  habitPointsPreview: document.getElementById('habitPointsPreview'),
  habitDelete: document.getElementById('habitDelete'),
  slotDialog: document.getElementById('slotDialog'),
  slotDialogTitle: document.getElementById('slotDialogTitle'),
  slotOptions: document.getElementById('slotOptions'),
  slotId: document.getElementById('slotId'),
  slotManage: document.getElementById('slotManage'),
  slotDelete: document.getElementById('slotDelete'),
  exportBackup: document.getElementById('exportBackup'),
  importBackup: document.getElementById('importBackup'),
};

let state = loadState();
state.activeScreen = state.activeScreen || 'habits';
state.selectedMonthKey = state.selectedMonthKey || monthKey(new Date());
let pendingSlotId = null;
let editingHabitId = null;
let activeSlotId = null;
let habitManageMode = false;
let habitDialogScrollY = 0;
let habitSaveFlashTimer = null;
let habitDialogReturnSlotId = null;
let habitDialogReturnManageMode = false;

function uid() {
  return crypto.randomUUID();
}

function mondayKey(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return toKey(d);
}

function toKey(date) {
  return date.toISOString().slice(0, 10);
}

function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function ordinalSuffix(day) {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatDayLabel(date) {
  const day = date.getDate();
  return `${date.toLocaleDateString('en-US', { month: 'short' })} ${day}${ordinalSuffix(day)}`;
}

function formatWeekRange(weekStartKey) {
  const start = fromKey(weekStartKey);
  const end = addDays(start, 6);
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return {
      text: `${startMonth} ${startDay}${ordinalSuffix(startDay)} - ${endDay}${ordinalSuffix(endDay)}`,
      split: false,
    };
  }

  return {
    startMonth,
    startDay: `${startDay}${ordinalSuffix(startDay)}`,
    endMonth,
    endDay: `${endDay}${ordinalSuffix(endDay)}`,
    split: true,
  };
}

function renderWeekTitle(weekRange) {
  if (!weekRange.split) return weekRange.text;

  return `
    <span class="week-title-grid">
      <span class="week-title-month">${weekRange.startMonth}</span>
      <span class="week-title-day">${weekRange.startDay}</span>
      <span class="week-title-dash">-</span>
      <span class="week-title-month week-title-month--second">${weekRange.endMonth}</span>
      <span class="week-title-day">${weekRange.endDay}</span>
      <span class="week-title-dash week-title-dash--spacer" aria-hidden="true"></span>
    </span>
  `;
}

function formatPoints(points) {
  const hearts = points / 2;
  return Number.isInteger(hearts) ? String(hearts) : hearts.toFixed(1);
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fromMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatMonthTitle(key) {
  return fromMonthKey(key).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

function formatWeekCardRange(weekStartKey) {
  const start = fromKey(weekStartKey);
  const end = addDays(start, 6);
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = `${start.getDate()}${ordinalSuffix(start.getDate())}`;
  const endDay = `${end.getDate()}${ordinalSuffix(end.getDate())}`;

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${startDay} - ${endDay}`;
  }

  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

function isWeekEmpty(week) {
  return !week.mission && week.slots.every((slot) => !slot.habitId && slot.cells.every((cell) => cell === 0));
}

function totalAllTimePoints() {
  return Object.values(state.weeks).reduce((sum, week) => sum + weekTotals(normalizeWeek(week)).points, 0);
}

function getSelectedMonthWeekKeys() {
  const current = fromMonthKey(state.selectedMonthKey);
  const firstOfMonth = new Date(current.getFullYear(), current.getMonth(), 1);
  const month = firstOfMonth.getMonth();
  const keys = [];
  let cursor = new Date(firstOfMonth);

  while (cursor.getDay() !== 1) {
    cursor.setDate(cursor.getDate() + 1);
  }

  while (cursor.getMonth() === month) {
    keys.push(toKey(cursor));
    cursor = addDays(cursor, 7);
  }

  return keys;
}

function monthWeekTotals() {
  const keys = getSelectedMonthWeekKeys();
  return keys.map((weekKey) => {
    const week = state.weeks[weekKey] ? normalizeWeek(state.weeks[weekKey]) : blankWeek();
    return {
      weekKey,
      range: formatWeekCardRange(weekKey),
      points: weekTotals(week).points,
    };
  });
}

function renderWeekTitle(weekRange) {
  if (!weekRange.split) return weekRange.text;

  return `
    <span class="week-title-grid">
      <span class="week-title-month">${weekRange.startMonth}</span>
      <span class="week-title-day">${weekRange.startDay}</span>
      <span class="week-title-dash">-</span>
      <span class="week-title-month week-title-month--second">${weekRange.endMonth}</span>
      <span class="week-title-day">${weekRange.endDay}</span>
      <span class="week-title-dash week-title-dash--spacer" aria-hidden="true"></span>
    </span>
  `;
}

function blankSlot() {
  return {
    id: uid(),
    habitId: null,
    cells: Array(7).fill(0),
  };
}

function blankWeek() {
  return {
    mission: '',
    slots: Array.from({ length: 5 }, () => blankSlot()),
  };
}

function normalizeHabit(raw = {}) {
  return {
    id: raw.id || uid(),
    name: String(raw.name || 'Untitled habit').trim() || 'Untitled habit',
    pointsPerTap: Number(raw.pointsPerTap) === 2 ? 2 : 1,
    createdAt: raw.createdAt || new Date().toISOString(),
    archived: !!raw.archived,
  };
}

function normalizeCells(raw) {
  const cells = Array(7).fill(0);
  if (!Array.isArray(raw)) return cells;
  raw.slice(0, 7).forEach((value, index) => {
    cells[index] = value === 2 ? 2 : value === 1 ? 1 : 0;
  });
  return cells;
}

function normalizeSlot(raw = {}) {
  return {
    id: raw.id || uid(),
    habitId: raw.habitId || null,
    cells: normalizeCells(raw.cells),
  };
}

function normalizeWeek(raw = {}) {
  const week = {
    mission: raw.mission || raw.note || '',
    slots: Array.isArray(raw.slots) ? raw.slots.map(normalizeSlot) : [],
  };
  while (week.slots.length < 5) week.slots.push(blankSlot());
  return week;
}

function legacyPointsPerTap(habit = {}) {
  if (habit.pattern === 'x-once') return 2;
  return 1;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        version: 2,
        currentWeekStart: mondayKey(new Date()),
        activeScreen: 'habits',
        selectedMonthKey: monthKey(new Date()),
        habits: [],
        weeks: {},
      };
    }

    const parsed = JSON.parse(raw);

    if (parsed && parsed.version === 2) {
      return {
        version: 2,
        currentWeekStart: parsed.currentWeekStart || mondayKey(new Date()),
        activeScreen: parsed.activeScreen || 'habits',
        selectedMonthKey: parsed.selectedMonthKey || monthKey(new Date()),
        habits: Array.isArray(parsed.habits) ? parsed.habits.map(normalizeHabit) : [],
        weeks: Object.fromEntries(
          Object.entries(parsed.weeks || {}).map(([key, week]) => [key, normalizeWeek(week)])
        ),
      };
    }

    // Legacy v1 migration.
    const habits = [];
    const seenHabitIds = new Set();
    const weeks = {};

    for (const [weekKey, week] of Object.entries(parsed?.weeks || {})) {
      const legacyHabits = Array.isArray(week?.habits) ? week.habits : [];
      const slots = legacyHabits.map((habit) => {
        const mappedHabit = normalizeHabit({
          id: habit.id,
          name: habit.name,
          pointsPerTap: legacyPointsPerTap(habit),
          createdAt: habit.createdAt,
          archived: habit.active === false,
        });
        if (!seenHabitIds.has(mappedHabit.id)) {
          seenHabitIds.add(mappedHabit.id);
          habits.push(mappedHabit);
        }
        return {
          id: uid(),
          habitId: mappedHabit.id,
          cells: normalizeCells(parsed?.weeks?.[weekKey]?.completions?.[habit.id]),
        };
      });

      weeks[weekKey] = {
        mission: week?.note || '',
        slots: slots.length ? slots : [blankSlot()],
      };
    }

    return {
      version: 2,
      currentWeekStart: parsed.currentWeekStart || mondayKey(new Date()),
      activeScreen: parsed.activeScreen || 'habits',
      selectedMonthKey: parsed.selectedMonthKey || monthKey(new Date()),
      habits,
      weeks,
    };
  } catch {
    return {
      version: 2,
      currentWeekStart: mondayKey(new Date()),
      activeScreen: 'habits',
      selectedMonthKey: monthKey(new Date()),
      habits: [],
      weeks: {},
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveMission() {
  currentWeek().mission = els.mission.value;
  saveState();
  els.mission.blur();
}

function ensureWeek(weekKey) {
  if (!state.weeks[weekKey]) {
    state.weeks[weekKey] = blankWeek();
  }

  const week = normalizeWeek(state.weeks[weekKey]);
  while (week.slots.length < 5) week.slots.push(blankSlot());
  week.slots = week.slots.map(normalizeSlot);
  state.weeks[weekKey] = week;
  return week;
}

function currentWeek() {
  return ensureWeek(state.currentWeekStart);
}

function getHabit(habitId) {
  return state.habits.find((habit) => habit.id === habitId) || null;
}

function getSlot(week, slotId) {
  return week.slots.find((slot) => slot.id === slotId) || null;
}

function ensureUniqueHabitInState(habit) {
  const existing = state.habits.find((item) => item.id === habit.id);
  if (existing) {
    Object.assign(existing, habit);
    return existing;
  }
  state.habits.push(habit);
  return habit;
}

function weekTotals(week) {
  const points = week.slots.reduce(
    (sum, slot) => sum + slot.cells.reduce((inner, value) => inner + value, 0),
    0
  );
  return {
    points,
    hearts: points / 2,
  };
}

function heartElement(stateValue) {
  const heart = document.createElement('span');
  heart.className = `heart heart--${stateValue === 2 ? 'full' : 'half'}`;
  return heart;
}

function renderHeartPreview(target, pointsPerTap) {
  if (!target) return;
  target.replaceChildren();
  const value = Number(pointsPerTap) === 2 ? 2 : 1;
  const heart = heartElement(value);
  heart.classList.add('habit-points-preview__heart');
  target.appendChild(heart);
}

function makeCornerCell() {
  const corner = document.createElement('div');
  corner.className = 'board-corner';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'board-eyebrow';
  eyebrow.textContent = 'HABITS';
  corner.append(eyebrow);
  return corner;
}

function makeDayHeaderCell(day) {
  const cell = document.createElement('div');
  cell.className = 'day-header-cell';
  cell.innerHTML = `<span class="day-short">${day.short}</span>`;
  cell.title = day.name;
  return cell;
}

function makeHabitHeader(slot, week) {
  const habit = getHabit(slot.habitId);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `habit-header ${habit ? 'habit-header--filled' : 'habit-header--empty'}`;

  const top = document.createElement('span');
  top.className = 'slot-header-top';

  const name = document.createElement('span');
  name.className = 'slot-name';
  name.textContent = habit ? habit.name : '+ Habit';

  top.append(name);

  button.append(top);
  button.addEventListener('click', () => openSlotDialog(slot.id, week));
  return button;
}

function makeHabitCell(slot, dayIndex, week) {
  const habit = getHabit(slot.habitId);
  const value = slot.cells[dayIndex] || 0;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `day-cell ${habit ? 'day-cell--active' : 'day-cell--empty'} ${value ? 'day-cell--filled' : ''}`;

  if (value > 0) {
    button.appendChild(heartElement(value));
  } else {
    const ghost = document.createElement('span');
    ghost.className = 'cell-ghost';
    ghost.textContent = '♡';
    button.appendChild(ghost);
  }

  button.addEventListener('click', () => {
    if (!habit) {
      openSlotDialog(slot.id, week);
      return;
    }
    toggleDay(slot.id, dayIndex);
  });

  return button;
}

function makeEmptyDayCell() {
  const cell = document.createElement('div');
  cell.className = 'day-cell day-cell--empty day-cell--blank';
  const ghost = document.createElement('span');
  ghost.className = 'cell-ghost';
  ghost.textContent = '♡';
  cell.appendChild(ghost);
  return cell;
}

function render() {
  const week = currentWeek();
  const totals = weekTotals(week);
  const maxHearts = week.slots.reduce((sum, slot) => sum + (getHabit(slot.habitId) ? 7 : 0), 0);
  const allTimePoints = totalAllTimePoints();
  const weekRange = formatWeekRange(state.currentWeekStart);
  const monthItems = monthWeekTotals();
  const monthTotalPoints = monthItems.reduce((sum, item) => sum + item.points, 0);
  const weekHasContent = !isWeekEmpty(week);

  els.weekTitle.innerHTML = renderWeekTitle(weekRange);
  els.weekTitle.classList.toggle('week-title--split', weekRange.split);
  els.weekHearts.textContent = `${formatPoints(totals.points)} / ${maxHearts || 0}`;
  els.allTimeHearts.textContent = formatPoints(allTimePoints);
  els.weekCopyPrompt.hidden = weekHasContent;
  els.mission.value = week.mission || '';

  els.monthTitle.textContent = formatMonthTitle(state.selectedMonthKey);
  els.monthOverview.innerHTML = monthItems.length
    ? monthItems
        .map(
          (item) => `
            <button type="button" class="month-week-card" data-action="jump-week" data-week="${item.weekKey}">
              <span class="month-week-card__range">${item.range}</span>
              <strong>${formatPoints(item.points)}</strong>
              <small>hearts</small>
            </button>
          `
        )
        .join('')
    : '<p class="subtle">No weeks yet.</p>';
  els.monthTotalHearts.textContent = formatPoints(monthTotalPoints);

  els.trackerBoard.style.setProperty('--habit-count', String(week.slots.length));
  els.trackerBoard.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'board-row board-row--header';
  const corner = makeCornerCell();
  corner.classList.add('board-corner--top');
  header.appendChild(corner);
  DAYS.forEach((day) => header.appendChild(makeDayHeaderCell(day)));
  els.trackerBoard.appendChild(header);

  week.slots.forEach((slot) => {
    const row = document.createElement('div');
    row.className = 'board-row';
    row.appendChild(makeHabitHeader(slot, week));
    DAYS.forEach((_, dayIndex) => row.appendChild(makeHabitCell(slot, dayIndex, week)));
    els.trackerBoard.appendChild(row);
  });

  const screenMap = {
    habits: els.screenHabits,
    month: els.screenMonth,
    settings: els.screenSettings,
  };
  Object.entries(screenMap).forEach(([key, el]) => {
    if (!el) return;
    el.hidden = state.activeScreen !== key;
  });

  document.querySelectorAll('.nav-item[data-screen]').forEach((button) => {
    button.classList.toggle('nav-item--active', button.dataset.screen === state.activeScreen);
  });
}

function toggleDay(slotId, dayIndex) {
  const week = currentWeek();
  const slot = getSlot(week, slotId);
  if (!slot) return;

  const habit = getHabit(slot.habitId);
  if (!habit) return;

  const current = slot.cells[dayIndex] || 0;
  if (habit.pointsPerTap === 2) {
    slot.cells[dayIndex] = current === 2 ? 0 : 2;
  } else {
    slot.cells[dayIndex] = current >= 2 ? 0 : current + 1;
  }

  saveState();
  render();
}

function moveWeek(delta) {
  state.currentWeekStart = toKey(addDays(fromKey(state.currentWeekStart), delta * 7));
  ensureWeek(state.currentWeekStart);
  saveState();
  render();
}

function jumpToToday() {
  state.currentWeekStart = mondayKey(new Date());
  ensureWeek(state.currentWeekStart);
  saveState();
  render();
}

function copyPreviousWeek() {
  const currentKey = state.currentWeekStart;
  const previousKey = toKey(addDays(fromKey(currentKey), -7));
  const previousWeek = ensureWeek(previousKey);
  const currentWeekState = ensureWeek(currentKey);

  currentWeekState.slots = previousWeek.slots.map((slot) => ({
    id: uid(),
    habitId: slot.habitId,
    cells: Array(7).fill(0),
  }));

  if (!currentWeekState.slots.length) {
    currentWeekState.slots = [blankSlot()];
  }

  saveState();
  render();
}

function clearCurrentWeek() {
  state.weeks[state.currentWeekStart] = blankWeek();
  saveState();
  render();
}

function setActiveScreen(screen) {
  state.activeScreen = screen;
  saveState();
  render();
}

function moveMonth(delta) {
  state.selectedMonthKey = monthKey(addMonths(fromMonthKey(state.selectedMonthKey), delta));
  saveState();
  render();
}

function jumpToWeek(weekKey) {
  state.currentWeekStart = weekKey;
  ensureWeek(state.currentWeekStart);
  state.activeScreen = 'habits';
  saveState();
  render();
}

function addNewSlotAndPick(week) {
  const newSlot = blankSlot();
  week.slots.push(newSlot);
  saveState();
  render();
  openSlotDialog(newSlot.id, week);
}

function assignHabitToSlot(slotId, habitId) {
  const week = currentWeek();
  const slot = getSlot(week, slotId);
  if (!slot) return;
  slot.habitId = habitId || null;
  saveState();
  render();
}

function clearSlot(slotId) {
  const week = currentWeek();
  const slot = getSlot(week, slotId);
  if (!slot) return;
  slot.habitId = null;
  slot.cells = Array(7).fill(0);
  saveState();
  render();
}

function removeSlot(slotId) {
  const week = currentWeek();
  const index = week.slots.findIndex((slot) => slot.id === slotId);
  if (index < 0) return;
  week.slots.splice(index, 1);
  if (week.slots.length === 0) {
    week.slots.push(blankSlot());
  }
  saveState();
  render();
}

function deleteHabit(habitId) {
  state.habits = state.habits.filter((habit) => habit.id !== habitId);
  for (const week of Object.values(state.weeks)) {
    week.slots.forEach((slot) => {
      if (slot.habitId === habitId) {
        slot.habitId = null;
        slot.cells = Array(7).fill(0);
      }
    });
  }
  saveState();
  render();
}

function openHabitDialog(habit = null, returnSlotId = null, returnManageMode = false) {
  editingHabitId = habit?.id || null;
  habitDialogReturnSlotId = returnSlotId;
  habitDialogReturnManageMode = returnManageMode;
  habitDialogScrollY = window.scrollY;
  els.habitDialogTitle.textContent = habit ? 'Edit Habit' : 'Create New Habit';
  els.habitId.value = habit?.id || '';
  els.habitName.value = habit?.name || '';
  els.habitPoints.value = String(habit?.pointsPerTap || 1);
  els.habitDelete.hidden = !habit;
  renderHeartPreview(els.habitPointsPreview, els.habitPoints.value);
  els.habitDialog.showModal();
  setTimeout(() => {
    try {
      els.habitName.focus({ preventScroll: true });
    } catch {
      els.habitName.focus();
    }
  }, 40);
}

function closeHabitDialog() {
  if (els.habitDialog.open) els.habitDialog.close();
  editingHabitId = null;
  requestAnimationFrame(() => {
    window.scrollTo({ top: habitDialogScrollY, left: 0, behavior: 'auto' });
  });
}

function flashHabitSaveFeedback() {
  if (!els.habitForm) return;
  clearTimeout(habitSaveFlashTimer);
  els.habitForm.classList.remove('modal-card--saved');
  void els.habitForm.offsetWidth;
  els.habitForm.classList.add('modal-card--saved');
  habitSaveFlashTimer = window.setTimeout(() => {
    els.habitForm.classList.remove('modal-card--saved');
  }, 650);
}

function upsertHabit({ id, name, pointsPerTap }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return null;

  const existing = id ? getHabit(id) : null;
  const habit = normalizeHabit({
    id: existing?.id || id || uid(),
    name: cleanName,
    pointsPerTap: Number(pointsPerTap) === 2 ? 2 : 1,
    createdAt: existing?.createdAt || new Date().toISOString(),
    archived: existing?.archived || false,
  });

  ensureUniqueHabitInState(habit);
  return habit;
}

function renderSlotDialog(slotId) {
  const week = currentWeek();
  const slot = getSlot(week, slotId);
  if (!slot) return;

  activeSlotId = slotId;
  els.slotId.value = slotId;
  const habit = getHabit(slot.habitId);
  els.slotDialogTitle.textContent = habit ? 'Swap or edit this habit' : 'Choose a habit';
  if (els.slotManage) {
    els.slotManage.hidden = state.habits.length === 0;
    els.slotManage.className = habitManageMode ? 'primary' : '';
    els.slotManage.textContent = habitManageMode ? 'Done editing habits' : 'Edit habits';
  }
  if (els.slotDelete) {
    els.slotDelete.hidden = false;
    els.slotDelete.textContent = 'Delete row';
  }

  els.slotOptions.innerHTML = '';

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'primary';
  createBtn.textContent = '+ Create new habit';
  createBtn.addEventListener('click', () => {
    pendingSlotId = slotId;
    closeSlotDialog();
    openHabitDialog();
  });
  els.slotOptions.appendChild(createBtn);

  if (habit) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit current habit';
    editBtn.addEventListener('click', () => {
      closeSlotDialog();
      openHabitDialog(habit, slotId, habitManageMode);
    });
    els.slotOptions.appendChild(editBtn);
  }

  if (state.habits.length > 0) {
    const manageBtn = document.createElement('button');
    manageBtn.type = 'button';
    manageBtn.className = habitManageMode ? 'primary' : '';
    manageBtn.textContent = habitManageMode ? 'Done editing habits' : 'Edit habits';
    manageBtn.addEventListener('click', () => {
      habitManageMode = !habitManageMode;
      renderSlotDialog(slotId);
    });
    els.slotOptions.appendChild(manageBtn);
  }

  if (habit) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'danger';
    clearBtn.textContent = 'Clear this habit';
    clearBtn.addEventListener('click', () => {
      clearSlot(slotId);
      closeSlotDialog();
    });
    els.slotOptions.appendChild(clearBtn);
  }

  const listTitle = document.createElement('div');
  listTitle.className = 'slot-list-title';
  listTitle.textContent = state.habits.length ? 'Saved Habits' : 'No Saved Habits Yet';
  els.slotOptions.appendChild(listTitle);

  if (state.habits.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'subtle';
    empty.textContent = 'Create one habit and it will stay available for future weeks.';
    els.slotOptions.appendChild(empty);
  } else {
    state.habits
      .filter((item) => !item.archived)
      .forEach((savedHabit) => {
        const row = document.createElement('div');
        row.className = `saved-habit-row ${savedHabit.id === slot.habitId ? 'saved-habit-row--selected' : ''}`;

        const habitBtn = document.createElement('button');
        habitBtn.type = 'button';
        habitBtn.className = `saved-habit ${savedHabit.id === slot.habitId ? 'saved-habit--selected' : ''}`;
        habitBtn.setAttribute('aria-label', `${savedHabit.name}, ${savedHabit.pointsPerTap} point${savedHabit.pointsPerTap > 1 ? 's' : ''} per tap`);
        const habitName = document.createElement('span');
        habitName.className = 'saved-habit__name';
        habitName.textContent = savedHabit.name;
        const habitHeart = document.createElement('span');
        habitHeart.className = 'saved-habit__heart';
        habitHeart.appendChild(heartElement(savedHabit.pointsPerTap === 2 ? 2 : 1));
        habitBtn.append(habitName, habitHeart);
        habitBtn.addEventListener('click', () => {
          if (habitManageMode) {
            closeSlotDialog();
            openHabitDialog(savedHabit, slotId, habitManageMode);
            return;
          }
          assignHabitToSlot(slotId, savedHabit.id);
          closeSlotDialog();
        });
        row.appendChild(habitBtn);

        if (habitManageMode) {
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'saved-habit-delete';
          deleteBtn.title = `Delete ${savedHabit.name}`;
          deleteBtn.setAttribute('aria-label', `Delete ${savedHabit.name}`);
          deleteBtn.textContent = '';
          deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const deleted = confirmDeleteHabit(savedHabit.id);
            if (deleted && els.slotDialog.open && activeSlotId) {
              renderSlotDialog(activeSlotId);
            }
          });
          row.appendChild(deleteBtn);
        }

        els.slotOptions.appendChild(row);
      });
  }
}

function openSlotDialog(slotId) {
  renderSlotDialog(slotId);
  els.slotDialog.showModal();
}

function closeSlotDialog() {
  if (els.slotDialog.open) els.slotDialog.close();
  activeSlotId = null;
  habitManageMode = false;
}

function confirmDeleteHabit(habitId) {
  const habit = getHabit(habitId);
  if (!habit) return false;
  const ok = window.confirm(`Do you want to delete this habit? This will remove “${habit.name}” from every week.`);
  if (!ok) return false;
  deleteHabit(habitId);
  return true;
}

function exportBackup() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `habit-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importBackup(file) {
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file');
  }

  const next = {
    version: 2,
    currentWeekStart: parsed.currentWeekStart || mondayKey(new Date()),
    activeScreen: parsed.activeScreen || 'habits',
    selectedMonthKey: parsed.selectedMonthKey || monthKey(new Date()),
    habits: Array.isArray(parsed.habits) ? parsed.habits.map(normalizeHabit) : [],
    weeks: Object.fromEntries(
      Object.entries(parsed.weeks || {}).map(([key, week]) => [key, normalizeWeek(week)])
    ),
  };

  state = next;
  saveState();
  render();
}

els.mission.addEventListener('input', () => {
  currentWeek().mission = els.mission.value;
  saveState();
});

els.missionSave.addEventListener('click', saveMission);

els.habitForm.addEventListener('submit', (event) => {
  event.preventDefault();
  document.activeElement?.blur?.();
  const isNewHabit = !editingHabitId;
  const returnSlotId = habitDialogReturnSlotId;
  const returnManageMode = habitDialogReturnManageMode;
  const habit = upsertHabit({
    id: els.habitId.value || editingHabitId,
    name: els.habitName.value,
    pointsPerTap: Number(els.habitPoints.value),
  });

  if (habit && pendingSlotId) {
    assignHabitToSlot(pendingSlotId, habit.id);
    pendingSlotId = null;
  }

  if (!habit) return;

  if (isNewHabit) {
    closeHabitDialog();
    return;
  }

  if (returnSlotId) {
    els.habitDialog.close();
    editingHabitId = null;
    habitDialogReturnSlotId = null;
    habitDialogReturnManageMode = false;
    requestAnimationFrame(() => {
      window.scrollTo({ top: habitDialogScrollY, left: 0, behavior: 'auto' });
      habitManageMode = returnManageMode;
      openSlotDialog(returnSlotId);
    });
    return;
  }

  render();
  flashHabitSaveFeedback();

  setTimeout(() => {
    try {
      els.habitName.focus({ preventScroll: true });
    } catch {
      els.habitName.focus();
    }
  }, 20);
});

els.habitPoints.addEventListener('change', () => {
  renderHeartPreview(els.habitPointsPreview, els.habitPoints.value);
  els.habitPoints.blur();
});

els.habitDelete.addEventListener('click', () => {
  const habitId = els.habitId.value || editingHabitId;
  if (!habitId) return;
  const deleted = confirmDeleteHabit(habitId);
  if (!deleted) return;
  pendingSlotId = null;
  closeHabitDialog();
});

if (els.slotManage) {
  els.slotManage.addEventListener('click', () => {
    habitManageMode = !habitManageMode;
    if (activeSlotId) renderSlotDialog(activeSlotId);
  });
}

els.slotDelete.addEventListener('click', () => {
  if (!activeSlotId) return;
  const ok = window.confirm('Delete this row? This will remove the row from the week.');
  if (!ok) return;
  removeSlot(activeSlotId);
  closeSlotDialog();
});


document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'prev-week') moveWeek(-1);
    if (action === 'next-week') moveWeek(1);
    if (action === 'prev-month') moveMonth(-1);
    if (action === 'next-month') moveMonth(1);
    if (action === 'today') jumpToToday();
    if (action === 'add-habit') addNewSlotAndPick(currentWeek());
    if (action === 'copy-previous-week' || action === 'copy-previous-inline') copyPreviousWeek();
    if (action === 'clear-week') clearCurrentWeek();
    if (action === 'close-habit') closeHabitDialog();
    if (action === 'close-slot') closeSlotDialog();
  });
});

Array.from(document.querySelectorAll('[data-screen]')).forEach((button) => {
  button.addEventListener('click', () => setActiveScreen(button.dataset.screen));
});

els.monthOverview.addEventListener('click', (event) => {
  const card = event.target.closest('[data-action="jump-week"]');
  if (!card) return;
  jumpToWeek(card.dataset.week);
});

els.exportBackup.addEventListener('click', exportBackup);
els.importBackup.addEventListener('change', async () => {
  const [file] = els.importBackup.files || [];
  try {
    await importBackup(file);
    els.importBackup.value = '';
  } catch (error) {
    alert(`Could not import backup: ${error.message}`);
  }
});

els.slotDialog.addEventListener('close', () => {
  activeSlotId = null;
  habitManageMode = false;
});

// Boot.
ensureWeek(state.currentWeekStart);
saveState();
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
