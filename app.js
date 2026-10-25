'use strict';
/* Nutrition – App-Gerüst im Aufbau von docs/UI_VORLAGE.md: Anmeldung, „Mein Tag“ (Energie- und Makrokarte,
   Woche), Tagebuch-Tagesansicht mit Werteboard und Mahlzeiten, Eintragen mit Produktsuche (BLS, OFF, eigene),
   Barcode, „Zuletzt“ und Schnelleintrag, Produktseite mit Eintragen nach Menge oder Portion, Einträge bearbeiten,
   kopieren und löschen, Formular für eigene Produkte, Platzhalter für Rezepte, Berichte und Planer,
   „Mehr“ mit Konto und Quellenangaben.
   Routen: #/ (Mein Tag), #/diary, #/add?meal=1&tab=&q=, #/quick?meal=, #/entry?id=, #/product?id=&meal=,
   #/product/edit?id=|ean=|name=, #/recipes, #/reports, #/planner, #/more */

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
let backHash = null;  // abweichendes Ziel des Schließen-Knopfs auf Unterseiten (z. B. zurück zur Suche)

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
function chrome({ title, tab = '', week = false, sub = false, nav = true, back = null }) {
  $('#title').textContent = title;
  backHash = back;
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
      <ul>${list.map(e => `<li><a class="entry" href="#/entry?id=${e.id}"><span class="thumb">${icon('food')}</span>
        <span class="what"><b>${esc(e.label)}</b><span>${e.grams ? `${num(e.grams)} g` : '&nbsp;'}</span></span>
        <span class="kc"><b>${num(e.kcal)} kcal</b><span>${hhmm(new Date(e.eaten_at))}</span></span></a></li>`).join('')}</ul>
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

// ---------- Eintragen: Suche über BLS, gespeicherte OFF-Produkte und eigene Produkte ----------

const SOURCES = { own: 'Eigen', off: 'OFF', bls: 'BLS' };
const PRODUCT_COLS = 'id,source,source_ref,name,brand,kj,kcal,fat,carbs,sugar,protein,fiber,salt';
let addHash = '#/add';  // letzte Suche samt Begriff; Ziel des Schließen-Knopfs auf Produktseiten
let searchRun = 0;  // nur die zuletzt gestartete Suche darf die Treffer schreiben
let searchTimer;  // Verzögerung beim Tippen; route() stoppt sie, damit sie nach dem Seitenwechsel nicht mehr feuert

// Suchbegriff in Wörter zerlegen; Zeichen mit Bedeutung in PostgREST-Filtern trennen ebenfalls
const searchWords = q => q.toLowerCase().split(/[\s,.:;()"'*%\\]+/).filter(w => w.length >= 2).slice(0, 5);

// Jedes Wort muss in Name oder Marke vorkommen. Eigene und OFF-Produkte (owner gesetzt) zuerst laden,
// damit sie nicht hinter BLS-Zeilen abgeschnitten werden. Eine zweite Abfrage holt die Namen, die mit dem
// ersten Wort beginnen – sonst fielen sie bei häufigen Wörtern („milch“) aus den ersten 80 heraus.
// Die Reihenfolge danach legt rank fest.
async function searchProducts(q) {
  const words = searchWords(q);
  const cond = words.map(w => { const p = encodeURIComponent(`*${w}*`); return `or(name.ilike.${p},brand.ilike.${p})`; });
  const query = c => `nut_products?select=${PRODUCT_COLS}&and=(${c.join(',')})&order=owner.asc.nullslast,name.asc`;
  const [front, all] = await Promise.all([
    Cloud.rest(`${query([`name.ilike.${encodeURIComponent(`${words[0]}*`)}`, ...cond.slice(1)])}&limit=40`),
    Cloud.rest(`${query(cond)}&limit=80`),
  ]);
  const rows = [...new Map([...front, ...all].map(p => [p.id, p])).values()];
  const rank = p => ({ own: 0, off: 1, bls: 2 })[p.source] * 10
    + (p.name.toLowerCase().startsWith(words[0]) ? 0 : 3) + Math.min(p.name.length / 30, 4);
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'de'));
}

const val1 = v => (v == null ? '–' : num(v, 1));  // fehlende Werte als Strich, nicht als 0
const nutLine = p => `${p.kcal == null ? '–' : num(p.kcal)} kcal · KH ${val1(p.carbs)} · F ${val1(p.fat)} · P ${val1(p.protein)}`;
const srcBadge = p => `<i class="src ${p.source}">${SOURCES[p.source]}</i>`;

const hitHtml = (p, meal) => `<li><a class="hit" href="#/product?id=${p.id}&meal=${meal}"><span class="thumb">${icon('food')}</span>
  <span class="what"><b>${esc(p.name)}</b><span>${srcBadge(p)}${p.brand ? `${esc(p.brand)} · ` : ''}${nutLine(p)}</span></span>
  ${icon('right', 'go')}</a></li>`;

const newProductCard = q => `<a class="card newprod" href="#/product/edit?name=${encodeURIComponent(q.trim())}">${icon('plus')}
  <span><b>Eigenes Produkt anlegen</b><span class="small">Nährwerte von der Packung übernehmen</span></span></a>`;

const quickCard = meal => `<a class="card newprod" href="#/quick?meal=${meal}">${icon('edit')}
  <span><b>Schnelleintrag</b><span class="small">kcal und Makros direkt eingeben</span></span></a>`;

const searchHint = meal => `<div class="empty-state">${icon('search')}<b>Lebensmittel suchen</b>
  <p class="hint">Durchsucht den BLS 4.0, deine eigenen und die schon gescannten Produkte.
  Markenprodukte findest du am schnellsten über den Barcode.</p></div>${newProductCard('')}${quickCard(meal)}`;

async function runSearch(q, meal) {
  const run = ++searchRun, box = $('#results');
  if (!box) return;  // Eintragen-Seite nicht mehr offen
  const term = q.trim();
  addHash = `#/add?meal=${meal}&tab=search${term ? `&q=${encodeURIComponent(term)}` : ''}`;
  history.replaceState(null, '', addHash);  // Begriff merken, ohne die Seite neu aufzubauen
  view.querySelectorAll('.pills a').forEach(a => a.classList.toggle('on', a.dataset.tab === 'search'));
  if (!searchWords(term).length) { box.innerHTML = searchHint(meal); return; }
  box.innerHTML = '<p class="hint pad">Suche …</p>';
  try {
    const hits = await searchProducts(term);
    if (run !== searchRun) return;
    box.innerHTML = (hits.length ? `<ul class="card hits">${hits.map(p => hitHtml(p, meal)).join('')}</ul>`
      : `<div class="empty-state">${icon('search')}<b>Nichts gefunden</b><p class="hint">Anders schreiben, Barcode scannen oder selbst anlegen.</p></div>`)
      + newProductCard(term) + quickCard(meal);
  } catch (e) {
    if (run !== searchRun) return;
    if (e instanceof LoginNeeded) route();
    else box.innerHTML = `<p class="error pad">${esc(e.message)}</p>`;
  }
}

function renderAdd(params) {
  chrome({ title: 'Eintragen', sub: true });
  const meal = MEALS[params.get('meal')] ? params.get('meal') : mealForNow();
  const tabs = [['search', 'search', 'Suche'], ['fav', 'star', 'Favoriten'], ['last', 'history', 'Zuletzt'], ['short', 'bolt', 'Shortcuts']];
  const tab = tabs.some(t => t[0] === params.get('tab')) ? params.get('tab') : 'search';
  const q = params.get('q') || '';
  const texts = {
    fav: ['Favoriten', 'Favoriten folgen in Paket P4.'],
    short: ['Shortcuts', 'Schnellwahl mit einem Tipp folgt in Paket P4.'],
  };
  view.innerHTML = `
    <div class="journal">
      <nav class="pills">${tabs.map(([k, , name]) =>
        `<a href="#/add?meal=${meal}&tab=${k}" data-tab="${k}" class="${k === tab ? 'on' : ''}">${name}</a>`).join('')}</nav>
      <div class="searchrow">
        <label class="searchbox">${icon('search')}<input type="search" placeholder="Lebensmittel suchen" aria-label="Lebensmittel suchen"
          enterkeyhint="search" autocomplete="off" value="${esc(q)}"></label>
        <button id="scanBtn" class="icon-btn" aria-label="Barcode scannen">${icon('barcode')}</button>
      </div>
      <div class="when">
        <label>${icon('calendar')}<input id="wDay" type="date" aria-label="Tag" value="${entryDay || isoDay(day)}"></label>
        <label>${icon('meal')}<select id="wMeal" aria-label="Mahlzeit">${mealOptions(meal)}</select></label>
        <label>${icon('clock')}<input id="wTime" type="time" aria-label="Uhrzeit" value="${entryTime || hhmm(new Date())}"></label>
      </div>
    </div>
    <div id="results">${texts[tab] ? `<div class="empty-state">${icon(tabs.find(t => t[0] === tab)[1])}
      <b>${texts[tab][0]}</b><p class="hint">${texts[tab][1]}</p></div>` : ''}</div>`;
  // Tag, Mahlzeit und Uhrzeit gelten als Vorgabe für das Eintragen auf der Produktseite
  const input = view.querySelector('.searchbox input');
  $('#wDay').addEventListener('change', e => { entryDay = e.target.value; });
  $('#wTime').addEventListener('change', e => { entryTime = e.target.value; });
  $('#wMeal').addEventListener('change', e => {
    const term = input.value.trim();  // aktueller Begriff, nicht der beim Aufbau der Seite
    location.hash = `#/add?meal=${e.target.value}&tab=${tab}${term ? `&q=${encodeURIComponent(term)}` : ''}`;
  });
  input.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(input.value, meal), 300); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(input.value, meal); input.blur(); } });
  $('#scanBtn').addEventListener('click', openScanner);
  if (tab === 'search') {
    runSearch(q, meal);
    if (!q) input.focus();
  } else if (tab === 'last') {
    showRecent(meal);
  }
  // Tippen auf einem anderen Reiter wechselt zur Suche
  input.addEventListener('focus', () => { if (tab !== 'search') runSearch(input.value, meal); }, { once: true });
}

// Zuletzt: Produkte der letzten Einträge, jedes nur einmal (gelöschte Produkte fallen heraus)
async function showRecent(meal) {
  const run = ++searchRun, box = $('#results');
  box.innerHTML = '<p class="hint pad">Lade …</p>';
  try {
    const rows = await Cloud.rest(`nut_diary?select=product_id,nut_products(${PRODUCT_COLS})&product_id=not.is.null&order=eaten_at.desc&limit=200`);
    if (run !== searchRun) return;
    // Map behält die Reihenfolge des ersten Auftretens, also die neuesten zuerst
    const list = [...new Map(rows.filter(r => r.nut_products).map(r => [r.product_id, r.nut_products])).values()].slice(0, 40);
    box.innerHTML = list.length ? `<ul class="card hits">${list.map(p => hitHtml(p, meal)).join('')}</ul>`
      : `<div class="empty-state">${icon('history')}<b>Zuletzt gegessen</b><p class="hint">Hier erscheinen die Lebensmittel, die du zuletzt eingetragen hast.</p></div>`;
  } catch (e) {
    if (run !== searchRun) return;
    if (e instanceof LoginNeeded) route();
    else box.innerHTML = `<p class="error pad">${esc(e.message)}</p>`;
  }
}

// Barcode: Kamera (wenn der Browser BarcodeDetector kann) oder Eingabe von Hand; Treffer → Produktseite,
// unbekannt → Formular für ein eigenes Produkt mit vorbelegtem Barcode
function openScanner() {
  const dlg = document.createElement('dialog');
  dlg.className = 'scan';
  dlg.innerHTML = `<form>
    <h2>Barcode</h2>
    ${Off.canScan ? '<video playsinline muted></video>'
      : '<p class="hint">Dieser Browser kann keine Barcodes mit der Kamera lesen. Bitte die Ziffern eintippen.</p>'}
    <label>EAN (Ziffern unter dem Strichcode) <input name="ean" inputmode="numeric" autocomplete="off" pattern="\\d{8,14}" required></label>
    <p class="error" hidden></p>
    <div class="form-actions"><button type="button" class="text" data-close>Abbrechen</button><button type="submit">Suchen</button></div>
  </form>`;
  document.body.append(dlg);
  const ctrl = new AbortController();
  const form = dlg.querySelector('form'), input = form.elements.namedItem('ean');
  const err = dlg.querySelector('.error'), ok = form.querySelector('[type=submit]');
  dlg.addEventListener('close', () => { ctrl.abort(); dlg.remove(); });
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  const lookup = async ean => {
    err.hidden = true;
    ok.disabled = true;
    input.value = ean;
    try {
      const pid = await Off.byBarcode(ean);
      dlg.close();
      location.hash = pid ? `#/product?id=${pid}` : `#/product/edit?ean=${ean}`;
    } catch (e) {
      if (e instanceof LoginNeeded) { dlg.close(); route(); return; }
      err.textContent = e.message;
      err.hidden = false;
      ok.disabled = false;
    }
  };
  form.addEventListener('submit', e => { e.preventDefault(); lookup(input.value.trim()); });
  dlg.showModal();
  if (Off.canScan) {
    Off.scan(dlg.querySelector('video'), ctrl.signal)
      .then(code => { if (code) lookup(code); })
      .catch(e => { err.textContent = `Kamera nicht verfügbar (${e.message}). Bitte die Ziffern eintippen.`; err.hidden = false; });
  }
}

// ---------- Produktseite und eigene Produkte ----------

const NUTR = [['fat', 'Fett', 1], ['carbs', 'Kohlenhydrate', 1], ['sugar', 'davon Zucker', 1], ['protein', 'Protein', 1],
  ['fiber', 'Ballaststoffe', 1], ['salt', 'Salz', 2]];
const FORM_FIELDS = [['kj', 'Energie (kJ)'], ['kcal', 'Energie (kcal)'], ['fat', 'Fett (g)'], ['carbs', 'Kohlenhydrate (g)'],
  ['sugar', 'davon Zucker (g)'], ['protein', 'Protein (g)'], ['fiber', 'Ballaststoffe (g)'], ['salt', 'Salz (g)']];

async function loadProduct(idText) {
  const id = Number(idText);
  const rows = Number.isInteger(id) && id > 0
    ? await Cloud.rest(`nut_products?select=${PRODUCT_COLS},nut_servings(id,label,grams)&id=eq.${id}`) : [];
  if (!rows.length) throw new Error('Produkt nicht gefunden.');
  return rows[0];
}

const sourceNote = p => p.source === 'bls' ? 'Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut, Lizenz CC BY 4.0'
  : p.source === 'off' ? `Open Food Facts, Lizenz ODbL · <a href="https://world.openfoodfacts.org/product/${encodeURIComponent(p.source_ref)}"
      target="_blank" rel="noopener">Produkt auf openfoodfacts.org</a>`
  : 'Eigenes Produkt';

async function renderProduct(params, isCurrent) {
  chrome({ title: 'Produkt', sub: true, back: addHash });
  const p = await loadProduct(params.get('id'));
  if (!isCurrent()) return;
  const servings = (p.nut_servings || []).sort((a, b) => a.grams - b.grams);  // kleinste Portion als Vorgabe
  const meal = MEALS[params.get('meal')] ? params.get('meal') : mealForNow();
  const energy = p.kj == null && p.kcal == null ? '–' : `${num(p.kj)} kJ / ${num(p.kcal)} kcal`;
  view.innerHTML = `
    <section class="card product-head"><span class="thumb lg">${icon('food')}</span>
      <div><h2>${esc(p.name)}</h2><p class="small">${srcBadge(p)}${[p.brand && esc(p.brand),
        p.source !== 'bls' && p.source_ref && `EAN ${esc(p.source_ref)}`].filter(Boolean).join(' · ')}</p></div>
    </section>
    <form id="eform" class="card pform" novalidate><h2>Eintragen</h2>
      ${servings.length ? amountFields(servings, 1, 0) : amountFields([], 100)}
      ${whenFields(entryDay || isoDay(day), meal, entryTime || hhmm(new Date()))}
      <p class="entry-sum" id="esum"></p>
      ${p.kcal == null && p.kj == null ? '<p class="hint">Für dieses Produkt fehlt die Energieangabe. Es wird mit 0 kcal eingetragen.</p>' : ''}
      <p class="error" hidden></p>
      <div class="form-actions"><button type="submit">${icon('plus')}Eintragen</button></div>
    </form>
    <section class="card"><h2>Nährwerte je 100 g</h2>
      <table class="nutr"><tr><th>Energie</th><td>${energy}</td></tr>
        ${NUTR.map(([k, name, d]) => `<tr${k === 'sugar' ? ' class="sub"' : ''}><th>${name}</th><td>${p[k] == null ? '–' : `${num(p[k], d)} g`}</td></tr>`).join('')}</table>
    </section>
    ${servings.length ? `<section class="card"><h2>Portionen</h2><table class="nutr">${servings.map(s => `<tr><th>${esc(s.label)}</th>
      <td>${num(s.grams)} g${p.kcal == null ? '' : ` · ${num((p.kcal * s.grams) / 100)} kcal`}</td></tr>`).join('')}</table></section>` : ''}
    <p class="hint pad">Quelle: ${sourceNote(p)}</p>
    ${p.source === 'bls' ? '' : `<a class="btn-wide" href="#/product/edit?id=${p.id}">${icon('edit')}Bearbeiten</a>`}`;
  const f = $('#eform');
  const values = () => scaleValues(per100(p), gramsOf(f) / 100);
  const show = () => { $('#esum').textContent = sumLine(values(), gramsOf(f)); };
  f.addEventListener('input', show);
  show();
  f.addEventListener('submit', e => {
    e.preventDefault();
    saveEntry(f, () => ({ product_id: p.id, label: p.name, grams: round1(gramsOf(f)), origin: 'app', ...values() }));
  });
}

const servingRow = (s = {}) => `<div class="srv">
  <input name="slabel" placeholder="z. B. 1 Scheibe" aria-label="Portion" maxlength="60" value="${esc(s.label)}">
  <input name="sgrams" type="number" min="0.1" step="any" inputmode="decimal" placeholder="g" aria-label="Gramm" value="${esc(s.grams)}">
  <button type="button" class="icon-btn" data-remove aria-label="Portion entfernen">${icon('close')}</button></div>`;

async function renderProductEdit(params, isCurrent) {
  const id = params.get('id');
  chrome({ title: id ? 'Produkt bearbeiten' : 'Eigenes Produkt', sub: true, back: id ? `#/product?id=${encodeURIComponent(id)}` : addHash });
  const ean = Off.validEan(params.get('ean') || '') ? params.get('ean') : '';
  const p = id ? await loadProduct(id) : { source: 'own', name: params.get('name') || '', source_ref: ean, nut_servings: [] };
  if (!isCurrent()) return;
  if (p.source === 'bls') throw new Error('BLS-Produkte lassen sich nicht bearbeiten.');
  view.innerHTML = `
    <form id="pform" class="pform" novalidate>
      ${!id && ean ? '<p class="hint pad">Open Food Facts kennt diesen Barcode nicht. Übernimm die Werte von der Packung.</p>' : ''}
      ${p.source === 'off' ? '<p class="hint pad">Die Daten stammen von Open Food Facts. Änderungen gelten nur in deiner App.</p>' : ''}
      <section class="card">
        <label>Name <input name="name" required maxlength="120" value="${esc(p.name)}"></label>
        <label>Marke <input name="brand" maxlength="80" value="${esc(p.brand)}"></label>
        <label>Barcode (EAN) <input name="ean" inputmode="numeric" pattern="\\d{8,14}" value="${esc(p.source_ref)}"${p.source === 'off' ? ' readonly' : ''}></label>
      </section>
      <section class="card"><h2>Nährwerte je 100 g</h2><div class="grid2">
        ${FORM_FIELDS.map(([k, label]) => `<label>${label}<input name="${k}" type="number" min="0" step="any" inputmode="decimal"
          value="${esc(p[k])}"${k === 'kcal' ? ' required' : ''}></label>`).join('')}
      </div></section>
      <section class="card"><h2>Portionen</h2><div id="servings">${(p.nut_servings || []).map(servingRow).join('')}</div>
        <button type="button" class="text" id="addServing">${icon('plus')} Portion hinzufügen</button></section>
      <p class="error pad" id="perr" hidden></p>
      <div class="form-actions">
        ${id ? '<button type="button" class="text danger" id="delProduct">Löschen</button>' : ''}
        <button type="submit">Speichern</button></div>
    </form>`;
  const f = $('#pform'), el = n => f.elements.namedItem(n), perr = $('#perr');
  const fail = msg => { perr.textContent = msg; perr.hidden = false; };

  // kJ und kcal: das jeweils andere Feld mitrechnen, solange es in diesem Formular nicht selbst getippt wurde
  const link = (from, to, factor) => el(from).addEventListener('input', () => {
    el(from).dataset.manual = '1';
    if (el(to).dataset.manual) return;
    const v = parseFloat(el(from).value);
    el(to).value = Number.isFinite(v) ? Math.round(v * factor) : '';
  });
  link('kcal', 'kj', 4.184);
  link('kj', 'kcal', 1 / 4.184);

  $('#addServing').addEventListener('click', () => $('#servings').insertAdjacentHTML('beforeend', servingRow()));
  $('#servings').addEventListener('click', e => { if (e.target.closest('[data-remove]')) e.target.closest('.srv').remove(); });

  f.addEventListener('submit', async e => {
    e.preventDefault();
    perr.hidden = true;
    if (!f.checkValidity()) {
      const bad = f.querySelector(':invalid');
      bad.focus();
      return fail(bad.name === 'ean' ? 'Ein Barcode hat 8 bis 14 Ziffern.'
        : bad.name === 'name' ? 'Bitte einen Namen eingeben.'
        : bad.validity.valueMissing ? 'Bitte die Energie (kcal) angeben.'
        : `${bad.closest('label')?.firstChild.textContent.trim() || 'Gramm'}: bitte eine Zahl ab 0 eingeben.`);
    }
    const val = k => (el(k).value.trim() === '' ? null : Number(el(k).value));
    const body = { name: el('name').value.trim(), brand: el('brand').value.trim() || null,
      ...Object.fromEntries(FORM_FIELDS.map(([k]) => [k, val(k)])) };
    if (p.source === 'own') body.source_ref = el('ean').value.trim() || null;
    const servings = [...f.querySelectorAll('.srv')]
      .map(r => ({ label: r.querySelector('[name=slabel]').value.trim(), grams: Number(r.querySelector('[name=sgrams]').value) }))
      .filter(s => s.label && s.grams > 0);
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      let pid = p.id;
      if (pid) {
        await Cloud.rest(`nut_products?id=eq.${pid}`, { method: 'PATCH', body, prefer: 'return=minimal' });
      } else {
        [{ id: pid }] = await Cloud.rest('nut_products?select=id', { method: 'POST', body: { ...body, source: 'own' }, prefer: 'return=representation' });
        p.id = pid;  // scheitern danach die Portionen, ändert ein zweites Speichern dieses Produkt statt ein neues anzulegen
      }
      // erst neue Portionen anlegen, dann die alten löschen: bricht es dazwischen ab, geht nichts verloren
      const old = (p.nut_servings || []).map(s => s.id);
      if (servings.length) {
        p.nut_servings = await Cloud.rest('nut_servings?select=id', { method: 'POST',
          body: servings.map(s => ({ ...s, product_id: pid })), prefer: 'return=representation' });
      } else {
        p.nut_servings = [];
      }
      if (old.length) await Cloud.rest(`nut_servings?id=in.(${old.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
      location.hash = `#/product?id=${pid}`;
    } catch (ex) {
      if (ex instanceof LoginNeeded) { route(); return; }
      fail(ex.status === 409 ? 'Zu diesem Barcode gibt es schon ein eigenes Produkt.' : ex.message);
      btn.disabled = false;
    }
  });

  $('#delProduct')?.addEventListener('click', async () => {
    if (!confirm(`„${p.name}“ löschen?`)) return;
    try {
      await Cloud.rest(`nut_products?id=eq.${p.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      location.hash = addHash;
    } catch (ex) {
      if (ex instanceof LoginNeeded) { route(); return; }
      fail(ex.status === 409 ? 'Das Produkt steckt in einem Rezept und kann nicht gelöscht werden.' : ex.message);
    }
  });
}

// ---------- Tagebucheinträge: Eintragen, Schnelleintrag, Bearbeiten, Kopieren, Löschen ----------
// Name und Nährwerte werden beim Eintragen festgeschrieben (siehe Schema). Eine geänderte Menge skaliert die
// gespeicherten Werte, statt das Produkt neu zu laden – so bleiben auch Einträge gelöschter Produkte bearbeitbar.

const ENTRY_VALUES = ['kj', 'kcal', 'fat', 'carbs', 'protein'];
const QUICK_FIELDS = [['kcal', 'Energie (kcal)'], ['carbs', 'Kohlenhydrate (g)'], ['fat', 'Fett (g)'], ['protein', 'Protein (g)']];
// Auf der Eintragen-Seite gewählter Tag und Uhrzeit (leer = angezeigter Tag bzw. jetzt); route() leert beide auf
// Hauptseiten, damit Abbrechen den angezeigten Tag nicht verstellt
let entryDay = '';
let entryTime = '';

const fv = (f, n) => f.elements.namedItem(n);
const round1 = v => Math.round(v * 10) / 10;
const dateAt = (iso, hm) => {
  const [y, m, d] = iso.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
};
const mealOptions = meal => Object.entries(MEALS)
  .map(([k, n]) => `<option value="${k}"${Number(k) === Number(meal) ? ' selected' : ''}>${n}</option>`).join('');
// replace statt neuer Verlaufseintrag: „Zurück“ führt danach nicht ins schon benutzte Formular
const backToDay = () => { location.replace(mainHash === '#/' ? '#/' : '#/diary'); };

// Werte je 100 g; fehlt kcal oder kJ, wird aus dem anderen umgerechnet, fehlende Makros zählen als 0
const per100 = p => ({ kj: Number(p.kj ?? (p.kcal ?? 0) * 4.184), kcal: Number(p.kcal ?? (p.kj ?? 0) / 4.184),
  fat: Number(p.fat || 0), carbs: Number(p.carbs || 0), protein: Number(p.protein || 0) });
const scaleValues = (base, factor) => Object.fromEntries(ENTRY_VALUES.map(k => [k, round1(base[k] * factor)]));
const sumLine = (v, grams) => `${num(grams, 1)} g · ${num(v.kcal)} kcal · KH ${num(v.carbs, 1)} · F ${num(v.fat, 1)} · P ${num(v.protein, 1)}`;

// Menge mit Einheit: Gramm oder eine Portion des Produkts (Wert der Option = Gramm je Einheit); sel = Index der Portion
const amountFields = (servings, qty, sel = -1) => `<div class="grid2">
  <label>Menge<input name="qty" type="number" min="0.01" step="any" inputmode="decimal" required value="${esc(qty)}"></label>
  <label>Einheit<select name="unit"><option value="1">Gramm</option>${servings.map((s, i) =>
    `<option value="${esc(s.grams)}"${i === sel ? ' selected' : ''}>${esc(s.label)} (${num(s.grams)} g)</option>`).join('')}</select></label></div>`;
const gramsOf = f => Number(fv(f, 'qty').value) * Number(fv(f, 'unit').value) || 0;

const whenFields = (iso, meal, hm) => `<div class="grid3">
  <label>Tag<input name="day" type="date" required value="${iso}"></label>
  <label>Mahlzeit<select name="meal">${mealOptions(meal)}</select></label>
  <label>Uhrzeit<input name="time" type="time" required value="${hm}"></label></div>`;

const macroFields = (e = {}) => `<div class="grid2">${QUICK_FIELDS.map(([k, label]) => `<label>${label}<input name="${k}" type="number"
  min="0" step="any" inputmode="decimal" value="${esc(e[k])}"${k === 'kcal' ? ' required' : ''}></label>`).join('')}</div>`;
const macroValues = f => {
  const v = k => round1(Number(fv(f, k).value || 0));
  return { kcal: v('kcal'), kj: round1(v('kcal') * 4.184), carbs: v('carbs'), fat: v('fat'), protein: v('protein') };
};

// Prüft das Formular, schreibt den Eintrag (id: ändern, sonst neu) und zeigt danach dessen Tag
async function saveEntry(f, build, id = null) {
  const err = f.querySelector('.error');
  err.hidden = true;
  if (!f.checkValidity()) {
    const bad = f.querySelector(':invalid');
    bad.focus();
    err.textContent = bad.name === 'day' || bad.name === 'time' ? 'Bitte Tag und Uhrzeit angeben.'
      : bad.validity.valueMissing && bad.name === 'kcal' ? 'Bitte die Energie (kcal) angeben.'
      : `${bad.closest('label')?.firstChild.textContent.trim() || 'Menge'}: bitte eine gültige Zahl eingeben.`;
    err.hidden = false;
    return;
  }
  const at = dateAt(fv(f, 'day').value, fv(f, 'time').value);
  const body = { eaten_at: at.toISOString(), meal: Number(fv(f, 'meal').value), ...build() };
  const buttons = f.querySelectorAll('button');
  buttons.forEach(b => { b.disabled = true; });
  try {
    await Cloud.rest(id ? `nut_diary?id=eq.${id}` : 'nut_diary', { method: id ? 'PATCH' : 'POST', body, prefer: 'return=minimal' });
    day = dateAt(isoDay(at), '12:00');
    if (closedMeals.delete(String(body.meal))) saveClosed();  // sonst bliebe der neue Eintrag zugeklappt
    backToDay();
  } catch (ex) {
    if (ex instanceof LoginNeeded) { route(); return; }
    err.textContent = ex.message;
    err.hidden = false;
    buttons.forEach(b => { b.disabled = false; });
  }
}

function renderQuick(params) {
  chrome({ title: 'Schnelleintrag', sub: true, back: addHash });
  const meal = MEALS[params.get('meal')] ? params.get('meal') : mealForNow();
  view.innerHTML = `
    <form id="qform" class="pform" novalidate>
      <section class="card">
        <label>Bezeichnung<input name="label" maxlength="120" placeholder="Schnelleintrag"></label>
        ${macroFields()}
      </section>
      <section class="card">${whenFields(entryDay || isoDay(day), meal, entryTime || hhmm(new Date()))}</section>
      <p class="error pad" hidden></p>
      <div class="form-actions"><button type="submit">${icon('plus')}Eintragen</button></div>
    </form>`;
  const f = $('#qform');
  fv(f, 'kcal').focus();
  f.addEventListener('submit', e => {
    e.preventDefault();
    saveEntry(f, () => ({ label: fv(f, 'label').value.trim() || 'Schnelleintrag', origin: 'quick', ...macroValues(f) }));
  });
}

async function renderEntry(params, isCurrent) {
  chrome({ title: 'Eintrag', sub: true });
  const id = Number(params.get('id'));
  const rows = Number.isInteger(id) && id > 0
    ? await Cloud.rest(`nut_diary?select=id,eaten_at,meal,label,grams,${ENTRY_VALUES.join(',')},origin,product_id,recipe_id,`
      + `nut_products(nut_servings(label,grams))&id=eq.${id}`) : [];
  if (!isCurrent()) return;
  if (!rows.length) throw new Error('Eintrag nicht gefunden.');
  const e = rows[0], at = new Date(e.eaten_at);
  const byAmount = Number(e.grams) > 0;  // mit Menge: Werte skalieren; ohne (Schnelleintrag): Werte direkt bearbeiten
  const servings = e.nut_products?.nut_servings || [];
  view.innerHTML = `
    <form id="entryForm" class="pform" novalidate>
      <section class="card">
        ${byAmount ? `<div class="product-head"><span class="thumb lg">${icon('food')}</span><div><h2>${esc(e.label)}</h2>
            ${e.product_id ? `<a class="small" href="#/product?id=${e.product_id}&meal=${e.meal}">Produkt ansehen</a>` : ''}</div></div>
          ${amountFields(servings, e.grams)}
          <p class="entry-sum" id="esum"></p>`
        : `<label>Bezeichnung<input name="label" maxlength="120" value="${esc(e.label)}"></label>${macroFields(e)}`}
      </section>
      <section class="card">${whenFields(isoDay(at), e.meal, hhmm(at))}</section>
      <p class="hint pad">„Kopieren“ trägt den Eintrag zusätzlich mit Tag, Mahlzeit und Uhrzeit aus dem Formular ein.</p>
      <p class="error pad" hidden></p>
      <div class="form-actions">
        <button type="button" class="text danger" id="delEntry">Löschen</button>
        <button type="submit" class="text" value="copy">Kopieren</button>
        <button type="submit" value="save">Speichern</button></div>
    </form>`;
  const f = $('#entryForm');
  const perGram = Object.fromEntries(ENTRY_VALUES.map(k => [k, Number(e[k] || 0) / Number(e.grams || 1)]));
  const values = () => {
    if (byAmount) return scaleValues(perGram, gramsOf(f));
    const v = macroValues(f);
    if (v.kcal === Number(e.kcal)) v.kj = Number(e.kj);  // kJ nur neu berechnen, wenn kcal geändert wurde
    return v;
  };
  if (byAmount) {
    const show = () => { $('#esum').textContent = sumLine(values(), gramsOf(f)); };
    f.addEventListener('input', show);
    show();
  }
  f.addEventListener('submit', ev => {
    ev.preventDefault();
    const copy = ev.submitter?.value === 'copy';
    saveEntry(f, () => {
      const body = { ...values(), ...(byAmount ? { grams: round1(gramsOf(f)) } : { label: fv(f, 'label').value.trim() || e.label }) };
      return copy ? { label: e.label, product_id: e.product_id, recipe_id: e.recipe_id,
        origin: e.origin === 'quick' ? 'quick' : 'app', ...body } : body;
    }, copy ? null : e.id);
  });
  $('#delEntry').addEventListener('click', async () => {
    if (!confirm(`„${e.label}“ löschen?`)) return;
    try {
      await Cloud.rest(`nut_diary?id=eq.${e.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      backToDay();
    } catch (ex) {
      if (ex instanceof LoginNeeded) { route(); return; }
      const err = f.querySelector('.error');
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

// ---------- Platzhalter und Mehr ----------

function renderPlaceholder({ title, tab, ic, text, sub = false }) {
  chrome({ title, tab, sub });
  view.innerHTML = `<section class="card empty-state">${icon(ic)}<b>${esc(title)}</b><p class="hint">${esc(text)}</p></section>`;
}

// ---------- Installation als App ----------
// Chrome meldet über beforeinstallprompt, dass die Seite als echte App (eigenes Fenster) installiert werden kann.
// Wer stattdessen „Zum Startbildschirm hinzufügen“ nutzt, bevor die Seite als installierbar gilt, bekommt nur
// eine Verknüpfung, die mit Adressleiste im Browser startet. Der Knopf unter „Mehr“ vermeidet das.
let installPrompt = null;
let installed = false;  // in diesem Tab gerade installiert (der Tab selbst bleibt ein Browser-Tab)
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const refreshMore = () => { if (location.hash.startsWith('#/more')) route(); };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; refreshMore(); });
window.addEventListener('appinstalled', () => { installPrompt = null; installed = true; refreshMore(); });

function installCard() {
  if (isStandalone()) return '<section class="card"><h2>App</h2><p class="small">Läuft als installierte App.</p></section>';
  if (installed) return '<section class="card"><h2>App</h2><p class="small">Installiert. Öffne sie ab jetzt über das Symbol auf dem Startbildschirm.</p></section>';
  // iPadOS meldet sich wie ein Mac, verrät sich aber über den Touchscreen
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const how = ios ? 'In Safari: Teilen → „Zum Home-Bildschirm“.'
    : installPrompt ? 'Installiert die App mit eigenem Fenster ohne Adressleiste.'
    : 'In Chrome: Menü ⋮ → „App installieren“. Steht dort nur „Zum Startbildschirm hinzufügen“, '
      + 'die Seite einmal neu laden und ein paar Sekunden warten – dann erscheint hier ein Knopf.';
  return `<section class="card install"><h2>Als App installieren</h2>
    ${installPrompt ? `<button id="installBtn">${icon('plus')}App installieren</button>` : ''}
    <p class="small">${how}</p>
    <p class="small">Startet die App mit Adressleiste, ist nur eine Verknüpfung angelegt:
      Symbol vom Startbildschirm entfernen und hier neu installieren.</p></section>`;
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
    ${installCard()}
    <section class="card">
      <h2>Datenquellen</h2>
      <p class="small">Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut (2025), Lizenz CC BY 4.0,
        DOI 10.25826/Data20251217-134202-0.</p>
      <p class="small">Produktdaten von Open Food Facts (openfoodfacts.org), Lizenz ODbL.</p>
    </section>`;
  $('#logout').addEventListener('click', async () => { await Cloud.signOut(); route(); });
  $('#installBtn')?.addEventListener('click', async () => {
    const p = installPrompt;
    installPrompt = null;  // das Ereignis lässt sich nur einmal verwenden
    p.prompt();
    await p.userChoice.catch(() => {});
    refreshMore();
  });
}

// ---------- Router ----------

let routeRun = 0;  // nur der zuletzt gestartete Aufruf darf die Ansicht schreiben

async function route() {
  const run = ++routeRun;
  const isCurrent = () => run === routeRun;
  clearTimeout(searchTimer);
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const tab = path.split('/')[0] || 'day';
  const params = new URLSearchParams(query);
  if (!['add', 'search', 'planner', 'product', 'quick', 'entry'].includes(tab)) {
    mainHash = location.hash || '#/';
    entryDay = '';
    entryTime = '';
  }

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
    else if (tab === 'quick') renderQuick(params);
    else if (tab === 'entry') await renderEntry(params, isCurrent);
    else if (path === 'product/edit') await renderProductEdit(params, isCurrent);
    else if (tab === 'product') await renderProduct(params, isCurrent);
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
const setDay = iso => { day = dateAt(iso, '12:00'); route(); };
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
$('#back').addEventListener('click', () => { location.hash = backHash || mainHash; });
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
