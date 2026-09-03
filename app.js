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
  trackerBoard: document.getElementById('trackerBoard'),
  totalHearts: document.getElementById('totalHearts'),
  totalPoints: document.getElementById('totalPoints'),
  progressFill: document.getElementById('progressFill'),
  mission: document.getElementById('mission'),
  habitDialog: document.getElementById('habitDialog'),
  habitForm: document.getElementById('habitForm'),
  habitDialogTitle: document.getElementById('habitDialogTitle'),
  habitId: document.getElementById('habitId'),
  habitName: document.getElementById('habitName'),
  habitPoints: document.getElementById('habitPoints'),
  habitDelete: document.getElementById('habitDelete'),
  slotDialog: document.getElementById('slotDialog'),
  slotDialogTitle: document.getElementById('slotDialogTitle'),
  slotDialogMeta: document.getElementById('slotDialogMeta'),
  slotOptions: document.getElementById('slotOptions'),
  slotId: document.getElementById('slotId'),
  exportBackup: document.getElementById('exportBackup'),
  importBackup: document.getElementById('importBackup'),
};

let state = loadState();
let pendingSlotId = null;
let editingHabitId = null;
let activeSlotId = null;

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
  return `${date.toLocaleDateString([], { month: 'short' })} ${day}${ordinalSuffix(day)}`;
}

function formatWeekRange(weekStartKey) {
  const start = fromKey(weekStartKey);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startMonth = start.toLocaleDateString([], { month: 'long' });
  const endMonth = end.toLocaleDateString([], { month: 'long' });

  if (sameMonth) {
    return `${startMonth} ${start.getDate()}–${end.getDate()}`;
  }

  return `${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}`;
}

function formatPoints(points) {
  const hearts = points / 2;
  return Number.isInteger(hearts) ? String(hearts) : hearts.toFixed(1);
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
    slots: [blankSlot()],
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
  if (!week.slots.length) week.slots.push(blankSlot());
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
        habits: [],
        weeks: {},
      };
    }

    const parsed = JSON.parse(raw);

    if (parsed && parsed.version === 2) {
      return {
        version: 2,
        currentWeekStart: parsed.currentWeekStart || mondayKey(new Date()),
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
      habits,
      weeks,
    };
  } catch {
    return {
      version: 2,
      currentWeekStart: mondayKey(new Date()),
      habits: [],
      weeks: {},
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureWeek(weekKey) {
  if (!state.weeks[weekKey]) {
    state.weeks[weekKey] = blankWeek();
  }

  const week = normalizeWeek(state.weeks[weekKey]);
  if (!week.slots.length) week.slots.push(blankSlot());
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

function makeCornerCell() {
  const corner = document.createElement('div');
  corner.className = 'board-corner';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'board-eyebrow';
  eyebrow.textContent = 'DAILY HABIT TRACKER';
  const title = document.createElement('strong');
  title.textContent = 'Tap a habit row to edit, then tap hearts to track the week.';
  corner.append(eyebrow, title);
  return corner;
}

function makeSlotHeader(slot, week) {
  const habit = getHabit(slot.habitId);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `slot-header ${habit ? 'slot-header--filled' : 'slot-header--empty'}`;

  const top = document.createElement('span');
  top.className = 'slot-header-top';

  const name = document.createElement('span');
  name.className = 'slot-name';
  name.textContent = habit ? habit.name : '+ Habit';

  const badge = document.createElement('span');
  badge.className = 'slot-badge';
  badge.textContent = habit ? `${habit.pointsPerTap} pt` : 'Add';

  top.append(name, badge);

  const hint = document.createElement('span');
  hint.className = 'slot-hint';
  hint.textContent = habit ? 'Tap to swap' : 'Tap to create';

  button.append(top, hint);
  button.addEventListener('click', () => openSlotDialog(slot.id, week));
  return button;
}

function makeAddHeader(week) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'slot-add';
  const plus = document.createElement('span');
  plus.className = 'slot-plus';
  plus.textContent = '+';
  const text = document.createElement('span');
  text.className = 'slot-hint';
  text.textContent = 'Add';
  button.append(plus, text);
  button.addEventListener('click', () => addNewSlotAndPick(week));
  return button;
}

function makeDayCell(slot, dayIndex, week) {
  const habit = getHabit(slot.habitId);
  const value = slot.cells[dayIndex] || 0;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `day-cell ${habit ? 'day-cell--active' : 'day-cell--empty'} ${value ? 'day-cell--filled' : ''}`;

  if (!habit) {
    const plus = document.createElement('span');
    plus.className = 'cell-plus';
    plus.textContent = '+';
    button.appendChild(plus);
    button.addEventListener('click', () => openSlotDialog(slot.id, week));
  } else if (value > 0) {
    button.appendChild(heartElement(value));
    button.addEventListener('click', () => toggleDay(slot.id, dayIndex));
  } else {
    const ghost = document.createElement('span');
    ghost.className = 'cell-ghost';
    ghost.textContent = 'Tap';
    button.appendChild(ghost);
    button.addEventListener('click', () => toggleDay(slot.id, dayIndex));
  }

  return button;
}

function makeSpacerCell() {
  const spacer = document.createElement('div');
  spacer.className = 'board-spacer';
  return spacer;
}

function render() {
  const week = currentWeek();
  const totals = weekTotals(week);
  const maxPoints = week.slots.reduce((sum, slot) => {
    const habit = getHabit(slot.habitId);
    return sum + (habit ? habit.pointsPerTap * 7 : 0);
  }, 0);
  const progressRatio = maxPoints ? Math.min(1, totals.points / maxPoints) : 0;

  els.weekTitle.textContent = formatWeekRange(state.currentWeekStart);
  els.totalHearts.textContent = formatPoints(totals.points);
  els.totalPoints.textContent = `${totals.points} / ${maxPoints || 0}`;
  if (els.progressFill) els.progressFill.style.width = `${Math.max(6, progressRatio * 100)}%`;
  els.mission.value = week.mission || '';

  const slotCount = week.slots.length + 1;
  els.trackerBoard.style.setProperty('--slot-count', String(slotCount));
  els.trackerBoard.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'board-row board-row--header';
  header.appendChild(makeCornerCell());
  week.slots.forEach((slot) => header.appendChild(makeSlotHeader(slot, week)));
  header.appendChild(makeAddHeader(week));
  els.trackerBoard.appendChild(header);

  DAYS.forEach((day, dayIndex) => {
    const row = document.createElement('div');
    row.className = 'board-row';

    const dayLabel = document.createElement('button');
    dayLabel.type = 'button';
    dayLabel.className = 'day-label-cell';
    dayLabel.innerHTML = `<span class="day-short">${day.short}</span><span class="day-name">${day.name}</span>`;
    dayLabel.title = day.name;
    dayLabel.addEventListener('click', () => {
      // Weekday labels stay informational in v1.
    });
    row.appendChild(dayLabel);

    week.slots.forEach((slot) => row.appendChild(makeDayCell(slot, dayIndex, week)));
    row.appendChild(makeSpacerCell());
    els.trackerBoard.appendChild(row);
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

function openHabitDialog(habit = null) {
  editingHabitId = habit?.id || null;
  els.habitDialogTitle.textContent = habit ? 'Edit Habit' : 'Create New Habit';
  els.habitId.value = habit?.id || '';
  els.habitName.value = habit?.name || '';
  els.habitPoints.value = String(habit?.pointsPerTap || 1);
  els.habitDelete.hidden = !habit;
  els.habitDialog.showModal();
  setTimeout(() => els.habitName.focus(), 40);
}

function closeHabitDialog() {
  if (els.habitDialog.open) els.habitDialog.close();
  editingHabitId = null;
}

function upsertHabit({ id, name, pointsPerTap }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return null;

  const habit = normalizeHabit({
    id: id || uid(),
    name: cleanName,
    pointsPerTap: Number(pointsPerTap) === 2 ? 2 : 1,
    createdAt: new Date().toISOString(),
  });

  ensureUniqueHabitInState(habit);
  return habit;
}

function openSlotDialog(slotId) {
  const week = currentWeek();
  const slot = getSlot(week, slotId);
  if (!slot) return;

  activeSlotId = slotId;
  els.slotId.value = slotId;
  const habit = getHabit(slot.habitId);
  els.slotDialogTitle.textContent = habit ? 'Swap or edit this habit' : 'Choose a habit';
  els.slotDialogMeta.textContent = habit
    ? `${habit.name} • ${habit.pointsPerTap} point${habit.pointsPerTap > 1 ? 's' : ''} per tap`
    : 'This box is empty right now.';

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
      openHabitDialog(habit);
    });
    els.slotOptions.appendChild(editBtn);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'danger';
    clearBtn.textContent = 'Clear this box';
    clearBtn.addEventListener('click', () => {
      clearSlot(slotId);
      closeSlotDialog();
    });
    els.slotOptions.appendChild(clearBtn);
  }

  const listTitle = document.createElement('div');
  listTitle.className = 'slot-list-title';
  listTitle.textContent = state.habits.length ? 'Saved habits' : 'No saved habits yet';
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
        const habitBtn = document.createElement('button');
        habitBtn.type = 'button';
        habitBtn.className = `saved-habit ${savedHabit.id === slot.habitId ? 'saved-habit--selected' : ''}`;
        habitBtn.innerHTML = `<span>${savedHabit.name}</span><small>${savedHabit.pointsPerTap} point${savedHabit.pointsPerTap > 1 ? 's' : ''} per tap</small>`;
        habitBtn.addEventListener('click', () => {
          assignHabitToSlot(slotId, savedHabit.id);
          closeSlotDialog();
        });
        els.slotOptions.appendChild(habitBtn);
      });
  }

  els.slotDialog.showModal();
}

function closeSlotDialog() {
  if (els.slotDialog.open) els.slotDialog.close();
  activeSlotId = null;
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

els.habitForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const habit = upsertHabit({
    id: els.habitId.value || editingHabitId,
    name: els.habitName.value,
    pointsPerTap: Number(els.habitPoints.value),
  });

  if (habit && pendingSlotId) {
    assignHabitToSlot(pendingSlotId, habit.id);
  }

  pendingSlotId = null;
  closeHabitDialog();
});

els.habitDelete.addEventListener('click', () => {
  const habitId = els.habitId.value || editingHabitId;
  if (!habitId) return;
  deleteHabit(habitId);
  pendingSlotId = null;
  closeHabitDialog();
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

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'prev-week') moveWeek(-1);
    if (action === 'next-week') moveWeek(1);
    if (action === 'today') jumpToToday();
    if (action === 'copy-previous') copyPreviousWeek();
    if (action === 'backup') document.getElementById('backupDialog').showModal();
    if (action === 'close-backup') document.getElementById('backupDialog').close();
    if (action === 'close-habit') closeHabitDialog();
    if (action === 'close-slot') closeSlotDialog();
  });
});

els.slotDialog.addEventListener('close', () => {
  activeSlotId = null;
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
