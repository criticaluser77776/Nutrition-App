'use strict';
/* Nutrition – App-Gerüst im Aufbau von docs/UI_VORLAGE.md: Anmeldung, „Mein Tag“ (Energie- und Makrokarte,
   Woche), Tagebuch-Tagesansicht mit Werteboard und Mahlzeiten, Eintragen (Platzhalter für Suche/Barcode),
   Platzhalter für Rezepte, Berichte und Planer, „Mehr“ mit Konto und Quellenangaben.
   Routen: #/ (Mein Tag), #/diary, #/add?meal=1, #/recipes, #/reports, #/planner, #/more */

const MEALS = { 1: 'Frühstück', 2: 'Mittagessen', 3: 'Abendessen', 4: 'Snacks' };
const MACROS = [  // Reihenfolge und Farben wie in der Legende; kcal je Gramm für die Aufteilung nach Energie
  { k: 'carbs', name: 'KH', long: 'Kohlenhydrate', c: 'var(--carbs)', kcal: 4 },
  { k: 'fat', name: 'Fett', long: 'Fett', c: 'var(--fat)', kcal: 9 },
  { k: 'protein', name: 'Protein', long: 'Protein', c: 'var(--protein)', kcal: 4 },
];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const $ = sel => document.querySelector(sel);
const view = $('#view');
let day = new Date();  // angezeigter Tag in „Mein Tag“ und im Tagebuch
let macroMode = 'kcal';  // Makrokarte: Aufteilung nach kcal oder Gramm
let mainHash = '#/';  // zuletzt gezeigte Hauptseite; Ziel des Schließen-Knopfs

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n, d = 0) => Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: d });
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isoWeekday = d => (d.getDay() + 6) % 7 + 1;  // 1 = Montag … 7 = Sonntag
const hhmm = d => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const icon = (name, cls = '') => `<svg class="ic ${cls}"><use href="#i-${name}"/></svg>`;
const dayStart = (d, plus = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus);
const rangeQuery = (from, to) =>
  `eaten_at=gte.${encodeURIComponent(from.toISOString())}&eaten_at=lt.${encodeURIComponent(to.toISOString())}`;

// zugeklappte Mahlzeiten (nur Komfort, daher Fehler beim Speichern egal)
const closedMeals = new Set((() => { try { return JSON.parse(localStorage.getItem('nut.closed')) || []; } catch { return []; } })());
const saveClosed = () => { try { localStorage.setItem('nut.closed', JSON.stringify([...closedMeals])); } catch { /* egal */ } };

function dayTitle(d) {
  const diff = Math.round((new Date(isoDay(d)) - new Date(isoDay(new Date()))) / 864e5);
  if (diff === 0) return 'Heute';
  if (diff === -1) return 'Gestern';
  if (diff === 1) return 'Morgen';
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

// Mahlzeit passend zur Uhrzeit vorschlagen (Eintragen ohne ?meal=)
const mealForNow = () => { const h = new Date().getHours(); return h < 10 ? 1 : h < 15 ? 2 : h < 21 ? 3 : 4; };

// ---------- Kopfbereich ----------

// Leisten je Seite ein- und ausblenden: Hauptseiten mit Navigation, Unterseiten mit Schließen-Knopf
function chrome({ title, tab = '', week = false, sub = false, nav = true }) {
  $('#title').textContent = title;
  $('#back').hidden = !sub;
  $('#actions').hidden = !week;
  $('#week').hidden = !week;
  $('#tabs').hidden = !nav || sub;
  $('#fab').hidden = !nav || sub || tab === 'more';
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  if (week) renderWeekStrip();
}

function renderWeekStrip() {
  const monday = dayStart(day, 1 - isoWeekday(day));
  const today = isoDay(new Date());
  $('#weekDays').innerHTML = WEEKDAYS.map((w, i) => {
    const d = dayStart(monday, i);
    const cls = [isoDay(d) === isoDay(day) ? 'sel' : '', isoDay(d) === today ? 'today' : ''].join(' ');
    return `<button class="${cls}" data-day="${isoDay(d)}" aria-label="${d.toLocaleDateString('de-DE')}">${w}<b>${d.getDate()}</b></button>`;
  }).join('');
  $('#pickDay').value = isoDay(day);
}

// ---------- Anmeldung ----------

function renderLogin(msg = '') {
  chrome({ title: 'Nutrition', nav: false });
  view.innerHTML = `
    <form id="login" class="card login">
      <img class="logo" src="icons/icon.svg" alt="">
      <h2>Anmelden</h2>
      ${msg ? `<p class="error">${esc(msg)}</p>` : ''}
      <label>E-Mail <input name="email" type="email" autocomplete="username" required></label>
      <label>Passwort <input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Anmelden</button>
    </form>`;
  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      await Cloud.signIn(f.get('email'), f.get('password'));
      route();
    } catch (err) {
      renderLogin(err.message);
    }
  });
}

// ---------- Daten eines Tages ----------

async function loadDay(d) {
  const [entries, goals] = await Promise.all([
    Cloud.rest(`nut_diary?select=id,eaten_at,meal,label,grams,kcal,fat,carbs,protein&${rangeQuery(dayStart(d), dayStart(d, 1))}&order=eaten_at`),
    Cloud.rest(`nut_goals?select=kcal,protein,fat,carbs&weekday=eq.${isoWeekday(d)}`),
  ]);
  return { entries, goal: goals[0] || {}, total: totals(entries) };
}

const sum = (list, k) => list.reduce((a, e) => a + Number(e[k] || 0), 0);
const totals = list => ({ kcal: sum(list, 'kcal'), protein: sum(list, 'protein'), fat: sum(list, 'fat'), carbs: sum(list, 'carbs') });

// ---------- Mein Tag ----------

// Kreisbogen über 270°, unten offen; pct 0…1
function gauge(pct, over) {
  const C = 2 * Math.PI * 42, arc = 0.75 * C;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(135 50 50)" fill="none" stroke-width="8" stroke-linecap="round">
    <circle class="track" cx="50" cy="50" r="42" stroke-dasharray="${arc} ${C}"/>
    ${pct > 0 ? `<circle class="fill ${over ? 'over' : ''}" cx="50" cy="50" r="42" stroke-dasharray="${arc * Math.min(1, pct)} ${C}"/>` : ''}
  </g></svg>`;
}

// Ring aus Segmenten; parts = [{ v, c }]
function pie(parts) {
  const C = 2 * Math.PI * 38, all = parts.reduce((a, p) => a + p.v, 0);
  if (!all) return `<svg class="pie" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38" fill="none" stroke="var(--line)" stroke-width="16"/></svg>`;
  let off = 0;
  return `<svg class="pie" viewBox="0 0 100 100" aria-hidden="true">${parts.map(p => {
    const len = (C * p.v) / all, s = `<circle cx="50" cy="50" r="38" fill="none" stroke="${p.c}" stroke-width="16"
      stroke-dasharray="${len} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len;
    return s;
  }).join('')}</svg>`;
}

// Woche und Ziele in zwei Abfragen; der angezeigte Tag wird daraus gefiltert
async function renderDay(isCurrent) {
  chrome({ title: dayTitle(day), tab: 'day', week: true });
  const monday = dayStart(day, 1 - isoWeekday(day));
  const [weekRows, weekGoals] = await Promise.all([
    Cloud.rest(`nut_diary?select=eaten_at,kcal,fat,carbs,protein&${rangeQuery(monday, dayStart(monday, 7))}`),
    Cloud.rest('nut_goals?select=weekday,kcal,protein,fat,carbs'),
  ]);
  if (!isCurrent()) return;  // inzwischen anderer Tag oder Tab gewählt
  drawDay(weekRows, weekGoals);
}

function drawDay(weekRows, weekGoals) {
  const goal = weekGoals.find(x => x.weekday === isoWeekday(day)) || {};
  const total = totals(weekRows.filter(r => isoDay(new Date(r.eaten_at)) === isoDay(day)));
  const g = Number(goal.kcal || 0), burned = 0;  // Aktivitäten kommen später
  const rest = g - total.kcal + burned;
  const goalbars = MACROS.map(m => {
    const mg = Number(goal[m.k] || 0), pct = mg ? Math.min(100, (100 * total[m.k]) / mg) : 0;
    return `<div class="goalbar" style="--c:${m.c}"><b>${m.long}</b>
      <div class="meter"><i style="width:${pct}%" class="${mg && total[m.k] > mg ? 'over' : ''}"></i></div>
      <span>${num(total[m.k])}${mg ? ` / ${num(mg)}` : ''} g</span></div>`;
  }).join('');

  const parts = MACROS.map(m => ({ ...m, v: total[m.k] * (macroMode === 'kcal' ? m.kcal : 1) }));
  const partSum = parts.reduce((a, p) => a + p.v, 0);
  const legend = parts.map(p => `<div style="--c:${p.c}"><b>${p.name}</b>
    <span>${macroMode === 'kcal' ? `${num(p.v)} kcal` : `${num(total[p.k])} g`}</span>
    <span>${partSum ? num((100 * p.v) / partSum) : 0} %</span></div>`).join('');

  // Woche: kcal je Tag gegen das Tagesziel
  const perDay = Array(7).fill(0);
  weekRows.forEach(r => { perDay[isoWeekday(new Date(r.eaten_at)) - 1] += Number(r.kcal || 0); });
  const goalOf = wd => Number(weekGoals.find(x => x.weekday === wd)?.kcal || 0);
  const top = Math.max(1, ...perDay, ...WEEKDAYS.map((_, i) => goalOf(i + 1))) * 1.1;
  const bars = perDay.map((v, i) => {
    const wg = goalOf(i + 1);
    return `<div class="${i + 1 === isoWeekday(day) ? 'sel' : ''}" title="${num(v)} kcal">
      <span class="col"><i style="height:${(100 * v) / top}%" class="${wg && v > wg ? 'over' : ''}"></i>
        ${wg ? `<hr style="bottom:${(100 * wg) / top}%">` : ''}</span>${WEEKDAYS[i]}</div>`;
  }).join('');

  view.innerHTML = `
    <div class="section-head"><h2>Dein Tag</h2><a href="#/diary">Details</a></div>
    <section class="card">
      <div class="energy">
        <div class="side l">
          <div class="stat"><b>${num(total.kcal)}</b><span>gegessen</span></div>
          <div class="stat"><b class="sm">${g ? `${num((100 * total.kcal) / g)} %` : '–'}</b><span>erreicht</span></div>
        </div>
        <div class="gauge">${gauge(g ? total.kcal / g : 0, g && rest < 0)}
          <div class="mid"><b>${g ? num(Math.abs(rest)) : num(total.kcal)}</b>
            <span>${g ? (rest < 0 ? 'kcal zu viel' : 'kcal übrig') : 'kcal'}</span></div></div>
        <div class="side">
          <div class="stat"><b>${num(burned)}</b><span>verbrannt</span></div>
          <a class="stat" href="#/planner" style="color:inherit;text-decoration:none"><b class="sm">${g ? num(g) : '–'}</b><span>Ziel</span></a>
        </div>
      </div>
      <div class="goalbars">${goalbars}</div>
      ${g ? '' : '<p class="hint">Noch kein Tagesziel für diesen Wochentag (Planer folgt).</p>'}
    </section>
    <section class="card">
      <div class="seg" role="tablist">
        <button data-mode="kcal" class="${macroMode === 'kcal' ? 'on' : ''}">Nährstoffe (kcal)</button>
        <button data-mode="g" class="${macroMode === 'g' ? 'on' : ''}">Nährstoffe (Gramm)</button>
      </div>
      <div class="macros">${pie(parts)}<div class="legend">${legend}</div></div>
    </section>
    <div class="section-head"><h2>Deine Woche</h2><a href="#/reports">Details</a></div>
    <section class="card"><div class="weekchart">${bars}</div></section>`;
  view.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    macroMode = b.dataset.mode;
    drawDay(weekRows, weekGoals);  // nur neu zeichnen, die Daten sind schon da
  }));
}

// ---------- Tagebuch ----------

async function renderDiary(isCurrent) {
  chrome({ title: dayTitle(day), tab: 'diary', week: true });
  const { entries, goal, total } = await loadDay(day);
  if (!isCurrent()) return;
  const g = Number(goal.kcal || 0), burned = 0;
  const rest = g - total.kcal + burned;

  const meals = Object.entries(MEALS).map(([m, name]) => {
    const list = entries.filter(e => e.meal === Number(m));
    if (!list.length) {
      return `<section class="card meal empty"><a class="meal-head" href="#/add?meal=${m}">${icon('plus')}
        <span class="name"><b>${name}</b><span>Noch nichts eingetragen</span></span></a></section>`;
    }
    const closed = closedMeals.has(m);
    return `<section class="card meal${closed ? ' closed' : ''}" data-meal="${m}">
      <button class="meal-head" aria-expanded="${!closed}">${icon('down', 'chev')}
        <span class="name"><b>${name}</b><span>${list.length} ${list.length === 1 ? 'Eintrag' : 'Einträge'}</span></span>
        <span class="kc"><b>${num(sum(list, 'kcal'))} kcal</b>
          <span>KH ${num(sum(list, 'carbs'))} · F ${num(sum(list, 'fat'))} · P ${num(sum(list, 'protein'))}</span></span>
      </button>
      <ul>${list.map(e => `<li><span class="thumb">${icon('food')}</span>
        <span class="what"><b>${esc(e.label)}</b><span>${e.grams ? `${num(e.grams)} g` : '&nbsp;'}</span></span>
        <span class="kc"><b>${num(e.kcal)} kcal</b><span>${hhmm(new Date(e.eaten_at))}</span></span></li>`).join('')}</ul>
      <a class="meal-add" href="#/add?meal=${m}">${icon('plus')}Mahlzeit eintragen</a>
    </section>`;
  }).join('');

  view.innerHTML = `
    <section class="card board">
      <div><b>${g ? num(g) : '–'}</b><span>Ziel</span></div><div class="op">−</div>
      <div><b>${num(total.kcal)}</b><span>gegessen</span></div><div class="op">+</div>
      <div><b>${num(burned)}</b><span>verbrannt</span></div><div class="op">=</div>
      <div class="rest${g && rest < 0 ? ' over' : ''}"><b>${g ? num(rest) : '–'}</b><span>${g && rest < 0 ? 'zu viel' : 'übrig'}</span></div>
    </section>
    ${g ? '' : '<p class="hint" style="margin:-4px 8px 12px">Noch kein Tagesziel für diesen Wochentag (Planer folgt).</p>'}
    ${meals}`;
  view.querySelectorAll('.meal[data-meal] .meal-head').forEach(h => h.addEventListener('click', () => {
    const card = h.closest('.meal'), m = card.dataset.meal;
    const closed = card.classList.toggle('closed');
    h.setAttribute('aria-expanded', !closed);
    closed ? closedMeals.add(m) : closedMeals.delete(m);
    saveClosed();
  }));
}

// ---------- Eintragen (Platzhalter für P2/P3) ----------

function renderAdd(params) {
  chrome({ title: 'Eintragen', sub: true });
  const meal = MEALS[params.get('meal')] ? params.get('meal') : mealForNow();
  const tabs = [['search', 'search', 'Suche'], ['fav', 'star', 'Favoriten'], ['last', 'history', 'Zuletzt'], ['short', 'bolt', 'Shortcuts']];
  const tab = tabs.some(t => t[0] === params.get('tab')) ? params.get('tab') : 'search';
  const texts = {
    search: ['Lebensmittel suchen', 'Suche über BLS, Open Food Facts und eigene Produkte, Barcode-Scan und Schnelleintrag folgen in Paket P2/P3.'],
    fav: ['Favoriten', 'Favoriten folgen in Paket P4.'],
    last: ['Zuletzt gegessen', 'Die Liste der zuletzt eingetragenen Lebensmittel folgt in Paket P3.'],
    short: ['Shortcuts', 'Schnellwahl mit einem Tipp folgt in Paket P4.'],
  };
  view.innerHTML = `
    <div class="journal">
      <nav class="pills">${tabs.map(([k, , name]) =>
        `<a href="#/add?meal=${meal}&tab=${k}" class="${k === tab ? 'on' : ''}">${name}</a>`).join('')}</nav>
      <div class="searchrow">
        <label class="searchbox">${icon('search')}<input type="search" placeholder="Lebensmittel suchen" aria-label="Lebensmittel suchen"></label>
        <button class="icon-btn" aria-label="Barcode scannen" disabled>${icon('barcode')}</button>
      </div>
      <div class="when">
        <div>${icon('calendar')}${esc(dayTitle(day))}${icon('down', 'dd')}</div>
        <div>${icon('meal')}${MEALS[meal]}${icon('down', 'dd')}</div>
        <div>${icon('clock')}${hhmm(new Date())}${icon('down', 'dd')}</div>
      </div>
    </div>
    <div class="empty-state">${icon(tabs.find(t => t[0] === tab)[1])}<b>${texts[tab][0]}</b><p class="hint">${texts[tab][1]}</p></div>`;
}

// ---------- Platzhalter und Mehr ----------

function renderPlaceholder({ title, tab, ic, text, sub = false }) {
  chrome({ title, tab, sub });
  view.innerHTML = `<section class="card empty-state">${icon(ic)}<b>${esc(title)}</b><p class="hint">${esc(text)}</p></section>`;
}

function renderMore() {
  chrome({ title: 'Mehr', tab: 'more' });
  view.innerHTML = `
    <section class="card account">
      <span class="avatar">${esc((Cloud.email[0] || '?').toUpperCase())}</span>
      <div><b>Konto</b><span class="small">${esc(Cloud.email)}</span></div>
    </section>
    <section class="card list">
      <a href="#/planner">${icon('target')}Energie- und Nährwertplaner${icon('right', 'go')}</a>
      <a href="#/reports">${icon('reports')}Berichte${icon('right', 'go')}</a>
      <button id="logout">${icon('logout')}Abmelden</button>
    </section>
    <section class="card">
      <h2>Datenquellen</h2>
      <p class="small">Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut (2025), Lizenz CC BY 4.0,
        DOI 10.25826/Data20251217-134202-0.</p>
      <p class="small">Produktdaten von Open Food Facts (openfoodfacts.org), Lizenz ODbL.</p>
    </section>`;
  $('#logout').addEventListener('click', async () => { await Cloud.signOut(); route(); });
}

// ---------- Router ----------

let routeRun = 0;  // nur der zuletzt gestartete Aufruf darf die Ansicht schreiben

async function route() {
  const run = ++routeRun;
  const isCurrent = () => run === routeRun;
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const tab = path.split('/')[0] || 'day';
  const params = new URLSearchParams(query);
  if (!['add', 'search', 'planner'].includes(tab)) mainHash = location.hash || '#/';

  if (!Cloud.configured) {
    chrome({ title: 'Nutrition', nav: false });
    view.innerHTML = '<section class="card"><p class="error">Keine Supabase-Verbindung eingerichtet (config.js).</p></section>';
    return;
  }
  if (!Cloud.loggedIn) { renderLogin(); return; }
  try {
    const member = await Cloud.isMember();
    if (!isCurrent()) return;
    if (!member) {
      await Cloud.signOut();
      renderLogin('Dieses Konto ist für die App nicht freigeschaltet.');
      return;
    }
    if (tab === 'add' || tab === 'search') renderAdd(params);
    else if (tab === 'recipes') renderPlaceholder({ title: 'Rezepte', tab, ic: 'recipes', text: 'Eigene Rezepte aus Zutaten mit Portionen folgen in Paket P4.' });
    else if (tab === 'reports') renderPlaceholder({ title: 'Berichte', tab, ic: 'reports', text: 'Tages-, Wochen- und Diätbericht folgen in Paket P6.' });
    else if (tab === 'planner') renderPlaceholder({ title: 'Planer', ic: 'target', sub: true, text: 'Energie- und Nährwertziele je Wochentag folgen in Paket P5.' });
    else if (tab === 'more') renderMore();
    else if (tab === 'diary') await renderDiary(isCurrent);
    else await renderDay(isCurrent);
  } catch (e) {
    if (!isCurrent()) return;
    if (e instanceof LoginNeeded) renderLogin(e.message);
    else view.innerHTML = `<section class="card"><p class="error">${esc(e.message)}</p></section>`;
  }
}

// Kalendertag verschieben (setDate statt ±24 h: stimmt auch an Tagen mit Zeitumstellung)
const shiftDay = n => { day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + n, 12); route(); };
const setDay = iso => { const [y, m, d] = iso.split('-').map(Number); day = new Date(y, m - 1, d, 12); route(); };
$('#prevDay').addEventListener('click', () => shiftDay(-1));
$('#nextDay').addEventListener('click', () => shiftDay(1));
$('#weekDays').addEventListener('click', e => { const b = e.target.closest('button[data-day]'); if (b) setDay(b.dataset.day); });
$('#pickDay').addEventListener('change', e => { if (e.target.value) setDay(e.target.value); });
$('#pickDay').closest('label').addEventListener('click', e => {
  // Das Feld ist unsichtbar und nimmt keine Klicks an; Kalender über showPicker öffnen, sonst Fokus und Klick
  e.preventDefault();
  const input = $('#pickDay');
  try { input.showPicker(); } catch { input.focus(); input.click(); }
});
$('#back').addEventListener('click', () => { location.hash = mainHash; });
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
