// ═══════════════════════════════════════════════════════════════
// DietPrep — Frontend logic, now talking to the Python backend API
// ═══════════════════════════════════════════════════════════════

const API_BASE = (() => {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocal) {
    return 'http://127.0.0.1:8000/api';
  }
  // Change the fallback to your new Render URL!
  return 'https://dietprep-backend.onrender.com/api';
})();

// ── IN-MEMORY STATE (hydrated from backend on load) ─────────────
let state = {
  profile: null,
  goal: 'loss',
  foodLog: [],
  workoutLog: [],
  weightLog: [],
  streak: 0,
  loggedDates: []
};
let foodDB = [];

// ── API HELPERS ───────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} failed`);
  return res.json();
}
async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} failed`);
  return res.json();
}

// ── LOAD ALL DATA FROM BACKEND ───────────────────────────────
async function loadAllData() {
  try {
    const [profile, foodLog, workoutLog, weightLog, streakData, db] = await Promise.all([
      apiGet('/profile'),
      apiGet('/food-log'),
      apiGet('/workout-log'),
      apiGet('/weight-log'),
      apiGet('/streak'),
      apiGet('/food-db')
    ]);
    state.profile = profile || null;
    state.goal = profile ? profile.goal : 'loss';
    state.foodLog = foodLog;
    state.workoutLog = workoutLog;
    state.weightLog = weightLog;
    state.loggedDates = streakData.logged_dates;
    foodDB = db;
    return true;
  } catch (e) {
    console.error('Failed to load data from backend:', e);
    alert('⚠️ Could not connect to the backend API.\n\nMake sure the Python server is running:\n  cd backend\n  uvicorn main:app --reload\n\nThen refresh this page.');
    return false;
  }
}

// ── HELPERS ───────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];
const uid = () => Math.random().toString(36).slice(2, 8);

function calcBMR(p) {
  if (!p) return 2000;
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + 5;
  const tdee = bmr * p.activity;
  if (state.goal === 'loss') return Math.round(tdee - 350);
  if (state.goal === 'gain') return Math.round(tdee + 250);
  return Math.round(tdee);
}
function calcBMI(p) {
  if (!p) return null;
  return +(p.weight / ((p.height / 100) ** 2)).toFixed(1);
}
function bmiCategory(bmi) {
  if (bmi < 18.5) return ['Underweight', '#5dcaa5'];
  if (bmi < 25) return ['Normal', '#00c9a7'];
  if (bmi < 30) return ['Overweight', '#f59e0b'];
  return ['Obese', '#f43f5e'];
}
function todayFoodLog() { return state.foodLog.filter(f => f.date === today()); }
function todayWorkoutLog() { return state.workoutLog.filter(w => w.date === today()); }
function todayTotalCal() { return todayFoodLog().reduce((s, f) => s + f.cal, 0); }

function computeStreak() {
  const sorted = [...new Set(state.loggedDates)].sort().reverse();
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    if (sorted.includes(ds)) streak++; else break;
  }
  state.streak = streak;
  return streak;
}

function renderStreakDots() {
  const el = document.getElementById('d-streak-dots');
  if (!el) return;
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const label = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
    const cls = ds === today() ? 'today' : state.loggedDates.includes(ds) ? 'done' : 'miss';
    html += `<div class="sdot ${cls}">${label}</div>`;
  }
  el.innerHTML = html;
}
function renderBadges() {
  const el = document.getElementById('d-badges');
  if (!el) return;
  const badges = [
    { emoji: '🌱', name: 'First log', earned: state.loggedDates.length >= 1 },
    { emoji: '🔥', name: '3-day streak', earned: state.streak >= 3 },
    { emoji: '⚡', name: '7-day streak', earned: state.streak >= 7 },
    { emoji: '💪', name: 'Workout week', earned: state.workoutLog.length >= 7 },
    { emoji: '🎯', name: 'Goal hit', earned: todayTotalCal() > 0 && Math.abs(todayTotalCal() - calcBMR(state.profile)) < 150 }
  ];
  el.innerHTML = badges.map(b => `<div class="badge-item"><div class="badge-icon ${b.earned ? 'badge-earned' : 'badge-locked'}">${b.emoji}</div><div class="badge-label">${b.name}</div></div>`).join('');
}

// ── NAV ───────────────────────────────────────────────────────
function goto(name) {
  if (name !== 'onboard' && !state.profile) { goto('onboard'); return; }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(t => {
    if (t.getAttribute('onclick') === "goto('" + name + "')") t.classList.add('active');
  });
  document.querySelector('.scroll-area').scrollTop = 0;
  if (name === 'dashboard') renderDashboard();
  if (name === 'food') renderFoodLog();
  if (name === 'workout') renderWorkout();
  if (name === 'progress') renderProgress();
  if (name === 'admin') renderAdminFoodList('');
}

// ── ONBOARDING ────────────────────────────────────────────────
let selectedGoal = state.goal || 'loss';
function selectGoal(g) {
  selectedGoal = g;
  ['loss', 'gain', 'maintain'].forEach(x => document.getElementById('goal-' + x).classList.remove('selected'));
  document.getElementById('goal-' + g).classList.add('selected');
}
async function saveProfile() {
  const name = document.getElementById('ob-name').value.trim() || 'User';
  const age = +document.getElementById('ob-age').value;
  const weight = +document.getElementById('ob-weight').value;
  const height = +document.getElementById('ob-height').value;
  const activity = +document.getElementById('ob-activity').value;
  if (!age || !weight || !height) { alert('Please fill all fields'); return; }

  const profile = { name, age, weight, height, activity, goal: selectedGoal };
  try {
    await apiPost('/profile', profile);
  } catch (e) {
    alert('Could not save profile — is the backend running?');
    return;
  }
  state.profile = profile;
  state.goal = selectedGoal;
  document.getElementById('nav-name').textContent = name;
  document.getElementById('user-avatar-letter').textContent = name.charAt(0).toUpperCase();
  goto('dashboard');
}

// ── DASHBOARD ─────────────────────────────────────────────────
function renderDashboard() {
  if (!state.profile) return;
  const p = state.profile;
  const target = calcBMR(p);
  const consumed = todayTotalCal();
  const bmi = calcBMI(p);
  const [bmiCat, bmiColor] = bmiCategory(bmi);
  const streak = computeStreak();
  const pct = Math.min(100, Math.round(consumed / target * 100));
  const hr = new Date().getHours();
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';

  document.getElementById('dash-greeting').textContent = `${greeting}, ${p.name}! 👋`;
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('d-cal-today').innerHTML = `${consumed} <span style="font-size:11px;opacity:0.6;">kcal</span>`;
  document.getElementById('d-cal-remain-h').innerHTML = `${Math.max(0, target - consumed)} <span style="font-size:11px;opacity:0.6;">kcal</span>`;
  document.getElementById('d-cal-consumed-b').textContent = `${consumed} kcal`;
  document.getElementById('d-cal-target').textContent = `of ${target} kcal`;
  const bar = document.getElementById('d-cal-bar');
  bar.style.width = pct + '%';
  bar.className = 'pbar ' + (consumed > target ? 'over' : 'ok');
  document.getElementById('d-cal-pct-b').textContent = `${pct}% of daily goal`;
  document.getElementById('d-streak-big').textContent = streak;
  document.getElementById('nav-streak').textContent = `🔥 ${streak} days`;
  document.getElementById('nav-name').textContent = p.name;
  document.getElementById('user-avatar-letter').textContent = p.name.charAt(0).toUpperCase();
  document.getElementById('bmi-val').textContent = bmi;
  document.getElementById('bmi-val').style.color = bmiColor;
  document.getElementById('bmi-cat').textContent = bmiCat;
  const msgs = { 'Underweight': 'Eat more dal, paneer & eggs.', 'Normal': 'Keep it up! Balanced diet 🎯', 'Overweight': 'Try a 350 kcal deficit daily.', 'Obese': 'Consult a nutritionist.' };
  document.getElementById('bmi-msg').textContent = msgs[bmiCat] || '';

  const circ = 289;
  const arc = document.getElementById('ring-arc');
  arc.style.strokeDashoffset = circ - (circ * pct / 100);
  document.getElementById('ring-pct').textContent = pct + '%';

  renderStreakDots();
  renderBadges();
}

// ── FOOD ──────────────────────────────────────────────────────
let selectedFood = null;
function clearSelectedFood() {
  selectedFood = null;
  const calInput = document.getElementById('food-cal-manual');
  const nameInput = document.getElementById('food-name-manual');
  if (calInput) {
    calInput.readOnly = false;
    calInput.value = '';
  }
  if (nameInput) {
    nameInput.readOnly = false;
  }
}
function updateSelectedFoodCalories() {
  if (!selectedFood) return;
  const qty = +document.getElementById('food-qty').value || 100;
  const r = qty / 100;
  const calInput = document.getElementById('food-cal-manual');
  const nameInput = document.getElementById('food-name-manual');
  calInput.value = Math.round(selectedFood.cal * r);
  calInput.readOnly = true;
  if (nameInput) {
    nameInput.value = '';
    nameInput.readOnly = true;
  }
}
function searchFood(q) {
  if (selectedFood && q !== selectedFood.name) {
    clearSelectedFood();
  }
  const box = document.getElementById('food-results');
  if (!q || q.length < 1) { box.style.display = 'none'; return; }
  const results = foodDB.filter(f => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  if (!results.length) { box.style.display = 'none'; return; }
  box.innerHTML = results.map(f => `<div class="sri" onclick="pickFood('${f.name.replace(/'/g, "\\'")}')"><span>${f.name}</span><span style="color:var(--text3);font-size:11px;">${f.cal} kcal/100g</span></div>`).join('');
  box.style.display = 'block';
}
function pickFood(name) {
  selectedFood = foodDB.find(f => f.name === name);
  document.getElementById('food-search').value = name;
  document.getElementById('food-results').style.display = 'none';
  updateSelectedFoodCalories();
}
async function addFoodLog() {
  const meal = document.getElementById('meal-type').value;
  const qty = +document.getElementById('food-qty').value || 100;
  let name, cal, protein, carbs, fat;
  if (selectedFood) {
    name = selectedFood.name;
    const r = qty / 100;
    cal = Math.round(selectedFood.cal * r);
    protein = +(selectedFood.protein * r).toFixed(1);
    carbs = +(selectedFood.carbs * r).toFixed(1);
    fat = +(selectedFood.fat * r).toFixed(1);
  } else {
    name = document.getElementById('food-name-manual').value.trim();
    cal = +document.getElementById('food-cal-manual').value;
    if (!name || !cal) { alert('Pick a food or enter name + calories'); return; }
    protein = 0; carbs = 0; fat = 0;
  }
  const entry = { id: uid(), meal, name, qty, cal, protein, carbs, fat, date: today() };
  try {
    await apiPost('/food-log', entry);
  } catch (e) {
    alert('Could not save — is the backend running?');
    return;
  }
  state.foodLog.push(entry);
  if (!state.loggedDates.includes(today())) state.loggedDates.push(today());
  selectedFood = null;
  document.getElementById('food-search').value = '';
  document.getElementById('food-name-manual').value = '';
  document.getElementById('food-cal-manual').value = '';
  renderFoodLog();
}
function renderFoodLog() {
  const logs = todayFoodLog();
  const tCal = logs.reduce((s, f) => s + f.cal, 0);
  const tP = +logs.reduce((s, f) => s + f.protein, 0).toFixed(1);
  const tC = +logs.reduce((s, f) => s + f.carbs, 0).toFixed(1);
  const tF = +logs.reduce((s, f) => s + f.fat, 0).toFixed(1);
  document.getElementById('food-total-cal').textContent = tCal;
  document.getElementById('macro-protein').textContent = tP + 'g';
  document.getElementById('macro-carbs').textContent = tC + 'g';
  document.getElementById('macro-fat').textContent = tF + 'g';
  const el = document.getElementById('food-log-list');
  if (!logs.length) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px 0;">Nothing logged yet — add your first meal above</div>'; return; }
  let html = '';
  ['Breakfast', 'Lunch', 'Dinner', 'Snack'].forEach(m => {
    const items = logs.filter(f => f.meal === m);
    if (!items.length) return;
    html += `<div class="meal-section-label">${m}</div>`;
    items.forEach(f => {
      html += `<div class="food-item"><div><div class="food-name">${f.name}</div><div class="food-meta">${f.qty}g · P:${f.protein}g C:${f.carbs}g F:${f.fat}g</div></div><div style="display:flex;align-items:center;gap:8px;"><div class="food-cal">${f.cal} kcal</div><button class="btn btn-sm btn-danger" onclick="removeFoodLog('${f.id}')">✕</button></div></div>`;
    });
  });
  el.innerHTML = html;
}
async function removeFoodLog(id) {
  try { await apiDelete(`/food-log/${id}`); } catch (e) { alert('Could not delete on server'); }
  state.foodLog = state.foodLog.filter(f => f.id !== id);
  renderFoodLog();
}

// ── WORKOUT ───────────────────────────────────────────────────
const calBurned = { bodyweight: 5, barbell: 6, dumbbell: 5, machine: 4, cardio: 8, flexibility: 3 };
async function addExercise() {
  const raw = [...document.getElementById('ex-select').options].find(o => o.selected).value;
  const [name, type] = raw.split('|');
  const sets = +document.getElementById('ex-sets').value || 3;
  const reps = document.getElementById('ex-reps').value || '12';
  const wt = document.getElementById('ex-weight').value;
  const burned = Math.round((calBurned[type] || 5) * sets * (isNaN(reps) ? 15 : +reps) * 0.04 * (state.profile?.weight || 70) / 70 * 10);
  const entry = { id: uid(), name, sets, reps, weight: wt || null, burned, date: today() };
  try {
    await apiPost('/workout-log', entry);
  } catch (e) {
    alert('Could not save — is the backend running?');
    return;
  }
  state.workoutLog.push(entry);
  if (!state.loggedDates.includes(today())) state.loggedDates.push(today());
  renderWorkout();
}
function renderWorkout() {
  const logs = todayWorkoutLog();
  const totalBurned = logs.reduce((s, w) => s + w.burned, 0);
  document.getElementById('workout-burned').textContent = totalBurned + ' kcal';
  const el = document.getElementById('workout-list');
  if (!logs.length) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px 0;">No exercises yet — log your first set above</div>'; return; }
  el.innerHTML = logs.map(w => `<div class="exercise-row"><div><div class="exercise-name">${w.name}</div><div class="exercise-detail">${w.sets} sets × ${w.reps}${w.weight ? ' @ ' + w.weight + 'kg' : ''}</div></div><div style="display:flex;align-items:center;gap:8px;"><span style="font-size:13px;font-weight:700;color:var(--saffron);">~${w.burned} kcal</span><button class="btn btn-sm btn-danger" onclick="removeExercise('${w.id}')">✕</button></div></div>`).join('');
}
async function removeExercise(id) {
  try { await apiDelete(`/workout-log/${id}`); } catch (e) { alert('Could not delete on server'); }
  state.workoutLog = state.workoutLog.filter(w => w.id !== id);
  renderWorkout();
}

// ── PROGRESS ─────────────────────────────────────────────────
let wChart = null, cChart = null;
async function logWeight() {
  const val = +document.getElementById('weight-input').value;
  if (!val) { alert('Enter a valid weight'); return; }
  const entry = { date: today(), val };
  try {
    await apiPost('/weight-log', entry);
  } catch (e) {
    alert('Could not save — is the backend running?');
    return;
  }
  const idx = state.weightLog.findIndex(w => w.date === today());
  if (idx >= 0) state.weightLog[idx].val = val; else state.weightLog.push(entry);
  if (state.profile) state.profile.weight = val;
  document.getElementById('weight-input').value = '';
  renderProgress();
}
function renderProgress() {
  const wLogs = state.weightLog.slice(-10);
  if (wChart) wChart.destroy();
  Chart.defaults.color = '#9B96C0';
  Chart.defaults.font.family = 'Space Grotesk';
  wChart = new Chart(document.getElementById('weightChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: wLogs.length ? wLogs.map(w => w.date.slice(5)) : ['No data'],
      datasets: [{ label: 'Weight', data: wLogs.length ? wLogs.map(w => w.val) : [0], borderColor: '#00C9A7', backgroundColor: 'rgba(0,201,167,0.08)', borderWidth: 2.5, pointBackgroundColor: '#00C9A7', pointRadius: 4, fill: true, tension: 0.35 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, grid: { color: 'rgba(26,16,96,0.06)' }, ticks: { color: '#9B96C0' } }, x: { grid: { color: 'rgba(26,16,96,0.06)' }, ticks: { color: '#9B96C0' } } } }
  });
  const target = calcBMR(state.profile);
  const days7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    days7.push({ date: ds.slice(5), cal: state.foodLog.filter(f => f.date === ds).reduce((s, f) => s + f.cal, 0) });
  }
  if (cChart) cChart.destroy();
  cChart = new Chart(document.getElementById('calChart').getContext('2d'), {
    type: 'bar',
    data: { labels: days7.map(d => d.date), datasets: [{ label: 'Intake', data: days7.map(d => d.cal), backgroundColor: 'rgba(255,107,0,0.7)', borderRadius: 8 }, { label: 'Target', data: Array(7).fill(target), type: 'line', borderColor: '#1A1060', borderWidth: 2, borderDash: [4, 4], pointRadius: 0, fill: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(26,16,96,0.06)' }, ticks: { color: '#9B96C0' } }, x: { grid: { color: 'rgba(26,16,96,0.06)' }, ticks: { color: '#9B96C0' } } } }
  });
}

// ── AI REPORT ────────────────────────────────────────────────
async function generateReport() {
  const btn = document.getElementById('report-btn');
  const container = document.getElementById('report-container');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Analysing your week…';
  container.innerHTML = '';
  const p = state.profile;
  const target = calcBMR(p);
  let totalCal = 0, goalDays = 0, loggedDays = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const dayCal = state.foodLog.filter(f => f.date === ds).reduce((s, f) => s + f.cal, 0);
    totalCal += dayCal;
    if (dayCal > 0) { loggedDays++; if (Math.abs(dayCal - target) < 200) goalDays++; }
  }
  const avgCal = loggedDays ? Math.round(totalCal / loggedDays) : 0;
  const weekMs = 7 * 864e5;
  const allProtein = state.foodLog.filter(f => Date.now() - new Date(f.date) < weekMs).reduce((s, f) => s + f.protein, 0);
  const workoutsThisWeek = state.workoutLog.filter(w => Date.now() - new Date(w.date) < weekMs).length;
  const prompt = `You are a friendly health coach for an Indian college student. Write a concise weekly health report in JSON format ONLY (no markdown, no preamble).\n\nData: goal hits ${goalDays}/7 days (target ${target} kcal), avg intake ${avgCal} kcal, days logged ${loggedDays}/7, total protein this week ${Math.round(allProtein)}g (ideal ~${Math.round((p?.weight || 70) * 1.6 * 7)}g), workouts ${workoutsThisWeek}.\nProfile: ${p?.name}, ${p?.age}yo, ${p?.weight}kg, goal: ${state.goal === 'loss' ? 'weight loss' : state.goal === 'gain' ? 'muscle gain' : 'maintenance'}.\n\nRespond ONLY with this JSON:\n{"summary":"2 sentences on overall week","good":"what went well, mention specific Indian foods","warn":"1-2 improvement areas with specific advice","meals":"3 suggested Indian meals for next week with brief reason","motivation":"1 uplifting sentence"}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }) });
    const data = await res.json();
    const raw = data.content?.map(c => c.text || '').join('');
    let report;
    try { report = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
    catch (e) { report = { summary: raw, good: '', warn: '', meals: '', motivation: '' }; }
    container.innerHTML = `
      ${report.summary ? `<div class="report-section report-info"><div class="report-title">📊 Weekly summary</div><div class="report-body">${report.summary}</div></div>` : ''}
      ${report.good ? `<div class="report-section report-good"><div class="report-title">✅ What went well</div><div class="report-body">${report.good}</div></div>` : ''}
      ${report.warn ? `<div class="report-section report-warn"><div class="report-title">⚠️ Improve here</div><div class="report-body">${report.warn}</div></div>` : ''}
      ${report.meals ? `<div class="report-section report-info"><div class="report-title">🍛 Meals for next week</div><div class="report-body">${report.meals}</div></div>` : ''}
      ${report.motivation ? `<div class="report-section report-good"><div class="report-title">💪 Keep going</div><div class="report-body">${report.motivation}</div></div>` : ''}`;
  } catch (e) {
    container.innerHTML = `<div class="report-section report-warn"><div class="report-title">Error</div><div class="report-body">Could not connect to AI. Check your internet.</div></div>`;
  }
  btn.disabled = false; btn.innerHTML = '✨ Regenerate report';
}

// ── ADMIN (Food DB) ─────────────────────────────────────────────
async function adminAddFood() {
  const name = document.getElementById('admin-food-name').value.trim();
  const cal = +document.getElementById('admin-cal').value;
  const protein = +document.getElementById('admin-protein').value || 0;
  const carbs = +document.getElementById('admin-carbs').value || 0;
  const fat = +document.getElementById('admin-fat').value || 0;
  const type = document.getElementById('admin-type').value;
  if (!name || !cal) { alert('Name and calories are required'); return; }
  const item = { name, cal, protein, carbs, fat, type };
  try {
    await apiPost('/food-db', item);
  } catch (e) {
    alert('Could not add — item may already exist, or backend is not running');
    return;
  }
  foodDB.push(item);
  ['admin-food-name', 'admin-cal', 'admin-protein', 'admin-carbs', 'admin-fat'].forEach(id => document.getElementById(id).value = '');
  renderAdminFoodList('');
  document.getElementById('admin-search').value = '';
}
function adminFilter(q) { renderAdminFoodList(q); }
function renderAdminFoodList(q) {
  const items = q ? foodDB.filter(f => f.name.toLowerCase().includes(q.toLowerCase())) : foodDB;
  document.getElementById('food-count').textContent = foodDB.length;
  document.getElementById('admin-food-list').innerHTML = items.map(f => `<div class="food-db-item"><div style="flex:1;"><span style="font-weight:600;color:var(--text);">${f.name}</span><span class="tag ${f.type === 'veg' ? 'tag-veg' : 'tag-non'}" style="margin-left:8px;">${f.type === 'veg' ? 'VEG' : 'NON-VEG'}</span></div><div style="display:flex;gap:10px;font-size:12px;color:var(--text2);flex-wrap:wrap;align-items:center;"><span>${f.cal} kcal</span><span>P:${f.protein}g</span><span>C:${f.carbs}g</span><span>F:${f.fat}g</span><button class="btn btn-sm btn-danger" onclick="adminDeleteFood('${f.name.replace(/'/g, "\\'")}')">Delete</button></div></div>`).join('') || '<div style="color:var(--text3);text-align:center;padding:16px;">No results</div>';
}
async function adminDeleteFood(name) {
  if (!confirm('Delete "' + name + '"?')) return;
  try { await apiDelete(`/food-db/${encodeURIComponent(name)}`); } catch (e) { alert('Could not delete on server'); }
  foodDB = foodDB.filter(f => f.name !== name);
  renderAdminFoodList(document.getElementById('admin-search').value);
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) document.getElementById('food-results').style.display = 'none';
});

(async function init() {
  const ok = await loadAllData();
  if (!ok) return;
  if (state.profile) {
    const p = state.profile;
    document.getElementById('ob-name').value = p.name || '';
    document.getElementById('ob-age').value = p.age || 21;
    document.getElementById('ob-weight').value = p.weight || 65;
    document.getElementById('ob-height').value = p.height || 170;
    document.getElementById('ob-activity').value = p.activity || 1.375;
    selectGoal(state.goal || 'loss');
    document.getElementById('nav-name').textContent = p.name;
    document.getElementById('user-avatar-letter').textContent = p.name.charAt(0).toUpperCase();
    goto('dashboard');
  } else {
    renderAdminFoodList('');
  }
})();
