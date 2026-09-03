const STORAGE_KEY = 'habit-planner-v1';
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const HABIT_PATTERNS = {
  'x-once': { label: 'X once', maxPoints: 2, states: ['', 'X'] },
  'slash-x': { label: '/ then X', maxPoints: 2, states: ['', '/', 'X'] },
  'backslash-once': { label: '\\ once', maxPoints: 1, states: ['', '\\'] },
};

const DEFAULT_PATTERN = 'slash-x';
const LEGACY_PATTERN_MAP = {
  x_once: 'x-once',
  slash_x: 'slash-x',
  backslash_once: 'backslash-once',
};

const els = {
  weekTitle: document.getElementById('weekTitle'),
  runningTotal: document.getElementById('runningTotal'),
  weekNote: document.getElementById('weekNote'),
  trackerGrid: document.getElementById('trackerGrid'),
  habitDialog: document.getElementById('habitDialog'),
  backupDialog: document.getElementById('backupDialog'),
  habitForm: document.getElementById('habitForm'),
  habitDialogTitle: document.getElementById('habitDialogTitle'),
  habitId: document.getElementById('habitId'),
  habitName: document.getElementById('habitName'),
  habitPattern: document.getElementById('habitPattern'),
  exportBackup: document.getElementById('exportBackup'),
  importBackup: document.getElementById('importBackup'),
};

const blankState = () => ({
  currentWeekStart: mondayKey(new Date()),
  weeks: {},
});

let state = loadState();
let editingHabitId = null;

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
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatRange(weekStartKey) {
  const start = fromKey(weekStartKey);
  const end = addDays(start, 6);
  return `${formatDayLabel(start)} - ${formatDayLabel(end)}`;
}

function formatTitle(weekStartKey) {
  return formatRange(weekStartKey);
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

function patternInfo(pattern) {
  return HABIT_PATTERNS[pattern] || HABIT_PATTERNS[LEGACY_PATTERN_MAP[pattern]] || HABIT_PATTERNS[DEFAULT_PATTERN];
}

function inferPatternFromLegacyPoints(points) {
  const value = Number(points);
  if (value === 1) return 'backslash-once';
  if (value === 2) return 'x-once';
  return DEFAULT_PATTERN;
}

function normalizeHabit(habit) {
  const pattern = HABIT_PATTERNS[habit.pattern]
    ? habit.pattern
    : LEGACY_PATTERN_MAP[habit.pattern] || inferPatternFromLegacyPoints(habit.points);
  return {
    ...habit,
    pattern,
  };
}

function normalizeCompletionArray(habit, rawCompletion) {
  const info = patternInfo(habit.pattern);
  const maxState = info.states.length - 1;
  const completion = Array(7).fill(0);

  if (!Array.isArray(rawCompletion)) return completion;

  rawCompletion.slice(0, 7).forEach((value, index) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      completion[index] = Math.min(Math.max(Math.round(value), 0), maxState);
    } else if (value === true) {
      completion[index] = maxState;
    } else {
      completion[index] = 0;
    }
  });

  return completion;
}

function normalizeWeek(week) {
  const normalized = {
    note: week?.note || '',
    habits: Array.isArray(week?.habits) ? week.habits.map(normalizeHabit) : [],
    completions: week?.completions && typeof week.completions === 'object' ? { ...week.completions } : {},
  };

  for (const habit of normalized.habits) {
    normalized.completions[habit.id] = normalizeCompletionArray(habit, normalized.completions[habit.id]);
  }

  return normalized;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankState();
    const parsed = JSON.parse(raw);
    const next = {
      currentWeekStart: parsed.currentWeekStart || mondayKey(new Date()),
      weeks: {},
    };

    for (const [weekStartKey, week] of Object.entries(parsed.weeks || {})) {
      next.weeks[weekStartKey] = normalizeWeek(week);
    }

    return next;
  } catch {
    return blankState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureWeek(weekStartKey) {
  if (!state.weeks[weekStartKey]) {
    state.weeks[weekStartKey] = normalizeWeek({});
  }

  state.weeks[weekStartKey] = normalizeWeek(state.weeks[weekStartKey]);
  const week = state.weeks[weekStartKey];

  for (const habit of week.habits) {
    if (!week.completions[habit.id]) {
      week.completions[habit.id] = Array(7).fill(0);
    } else {
      week.completions[habit.id] = normalizeCompletionArray(habit, week.completions[habit.id]);
    }
  }

  return week;
}

function currentWeek() {
  return ensureWeek(state.currentWeekStart);
}

function habitPointsForState(habit, stateValue) {
  const info = patternInfo(habit.pattern);
  const index = Math.min(Math.max(Number(stateValue) || 0, 0), info.states.length - 1);
  return index;
}

function calculateHabitTotal(week, habitId) {
  const habit = week.habits.find((item) => item.id === habitId);
  if (!habit) return 0;
  const values = week.completions[habitId] || [];
  return values.reduce((sum, value) => sum + habitPointsForState(habit, value), 0);
}

function calculateWeeklyTotals(week) {
  const runningTotal = week.habits.reduce((sum, habit) => sum + calculateHabitTotal(week, habit.id), 0);
  return { runningTotal };
}

function render() {
  const week = currentWeek();
  const { runningTotal } = calculateWeeklyTotals(week);

  els.weekTitle.textContent = formatTitle(state.currentWeekStart);
  els.runningTotal.textContent = String(runningTotal);
  els.weekNote.value = week.note || '';

  els.trackerGrid.innerHTML = '';

  const dayHeader = document.createElement('div');
  dayHeader.className = 'tracker-days';
  dayHeader.innerHTML = `<div></div>${DAYS.map((day) => `<div class="day-label">${day}</div>`).join('')}`;
  els.trackerGrid.appendChild(dayHeader);

  if (week.habits.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'subtle';
    empty.style.padding = '10px 2px 4px';
    empty.textContent = 'No habits yet. Tap + Habit to start your week.';
    els.trackerGrid.appendChild(empty);
    saveState();
    return;
  }

  const template = document.getElementById('habitRowTemplate');
  week.habits.forEach((habit) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const editBtn = row.querySelector('.habit-edit');
    const points = row.querySelector('.habit-points');
    const cells = row.querySelector('.day-cells');

    editBtn.textContent = habit.name;
    points.textContent = patternInfo(habit.pattern).label;

    editBtn.addEventListener('click', () => openHabitDialog(habit));

    const completion = week.completions[habit.id] || Array(7).fill(0);
    const maxState = patternInfo(habit.pattern).states.length - 1;

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const stateValue = Math.min(Math.max(Number(completion[dayIndex]) || 0, 0), maxState);
      const dayBtn = document.createElement('button');
      dayBtn.type = 'button';
      dayBtn.className = `day-cell ${stateValue > 0 ? 'on' : ''}`.trim();
      const symbol = patternInfo(habit.pattern).states[stateValue] || '';
      dayBtn.innerHTML = stateValue > 0 ? `<span class="cell-symbol">${symbol}</span><span class="cell-check" aria-hidden="true">✅</span>` : '';
      dayBtn.setAttribute('aria-label', `${habit.name} on ${DAY_NAMES[dayIndex]}${stateValue > 0 ? `, completed` : ''}`);
      dayBtn.addEventListener('click', () => {
        toggleCompletion(habit.id, dayIndex);
      });
      cells.appendChild(dayBtn);
    }

    els.trackerGrid.appendChild(row);
  });
}

function toggleCompletion(habitId, dayIndex) {
  const week = currentWeek();
  const habit = week.habits.find((item) => item.id === habitId);
  if (!habit) return;

  const maxState = patternInfo(habit.pattern).states.length - 1;
  week.completions[habitId] ??= Array(7).fill(0);

  const current = Math.min(Math.max(Number(week.completions[habitId][dayIndex]) || 0, 0), maxState);
  week.completions[habitId][dayIndex] = current >= maxState ? 0 : current + 1;

  saveState();
  render();
}

function openHabitDialog(habit = null) {
  editingHabitId = habit?.id || null;
  els.habitDialogTitle.textContent = habit ? 'Edit Habit' : 'Add Habit';
  els.habitId.value = habit?.id || '';
  els.habitName.value = habit?.name || '';
  els.habitPattern.value = habit?.pattern || DEFAULT_PATTERN;
  els.habitDialog.showModal();
  setTimeout(() => els.habitName.focus(), 50);
}

function closeHabitDialog() {
  els.habitDialog.close();
  editingHabitId = null;
}

function upsertHabit({ id, name, pattern }) {
  const week = currentWeek();
  const cleanName = name.trim();
  const cleanPattern = HABIT_PATTERNS[pattern] ? pattern : DEFAULT_PATTERN;
  if (!cleanName) return;

  if (id) {
    const habit = week.habits.find((item) => item.id === id);
    if (habit) {
      habit.name = cleanName;
      habit.pattern = cleanPattern;
      week.completions[id] = normalizeCompletionArray(habit, week.completions[id]);
    }
  } else {
    const newHabit = {
      id: crypto.randomUUID(),
      name: cleanName,
      pattern: cleanPattern,
      createdAt: new Date().toISOString(),
      active: true,
    };
    week.habits.push(newHabit);
    week.completions[newHabit.id] = Array(7).fill(0);
  }

  saveState();
  render();
}

function deleteHabit(id) {
  const week = currentWeek();
  week.habits = week.habits.filter((habit) => habit.id !== id);
  delete week.completions[id];
  saveState();
  render();
}

function copyWeekForward() {
  const currentKey = state.currentWeekStart;
  const nextKey = toKey(addDays(fromKey(currentKey), 7));
  const current = currentWeek();
  const nextHabits = current.habits.map((habit) => ({
    ...habit,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }));

  state.weeks[nextKey] = normalizeWeek({
    note: '',
    habits: nextHabits,
    completions: Object.fromEntries(nextHabits.map((habit) => [habit.id, Array(7).fill(0)])),
  });
  state.currentWeekStart = nextKey;
  saveState();
  render();
}

function exportBackup() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `habit-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup');

  const nextState = {
    currentWeekStart: parsed.currentWeekStart || mondayKey(new Date()),
    weeks: {},
  };

  for (const [weekStartKey, week] of Object.entries(parsed.weeks || {})) {
    nextState.weeks[weekStartKey] = normalizeWeek(week);
  }

  state = nextState;
  saveState();
  render();
}

function moveWeek(direction) {
  const current = fromKey(state.currentWeekStart);
  state.currentWeekStart = toKey(addDays(current, direction * 7));
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

// Events
els.weekNote.addEventListener('input', () => {
  currentWeek().note = els.weekNote.value;
  saveState();
});

els.habitForm.addEventListener('submit', (event) => {
  event.preventDefault();
  upsertHabit({
    id: els.habitId.value || editingHabitId,
    name: els.habitName.value,
    pattern: els.habitPattern.value,
  });
  closeHabitDialog();
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'add-habit') openHabitDialog();
    if (action === 'copy-week') copyWeekForward();
    if (action === 'backup') els.backupDialog.showModal();
    if (action === 'close-backup') els.backupDialog.close();
    if (action === 'close-habit') closeHabitDialog();
    if (action === 'delete-habit' && editingHabitId) {
      deleteHabit(editingHabitId);
      closeHabitDialog();
    }
    if (action === 'prev-week') moveWeek(-1);
    if (action === 'next-week') moveWeek(1);
    if (action === 'today') jumpToToday();
  });
});

els.exportBackup.addEventListener('click', exportBackup);
els.importBackup.addEventListener('change', async () => {
  const [file] = els.importBackup.files;
  try {
    await importBackup(file);
    els.backupDialog.close();
    els.importBackup.value = '';
  } catch (error) {
    alert(`Could not import backup: ${error.message}`);
  }
});

// Boot
ensureWeek(state.currentWeekStart);
saveState();
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
