'use strict';
/* Nutrition – App-Gerüst im Aufbau von docs/UI_VORLAGE.md: Anmeldung, „Mein Tag“ (Energie- und Makrokarte,
   Woche), Tagebuch-Tagesansicht mit Werteboard und Mahlzeiten, Eintragen mit Produktsuche (BLS, OFF, eigene),
   Barcode, „Zuletzt“ und Schnelleintrag, Produktseite mit Eintragen nach Menge oder Portion, Einträge bearbeiten,
   kopieren und löschen, Formular für eigene Produkte, Rezepte aus Zutaten, Favoriten und Shortcuts,
   Platzhalter für Berichte und Planer, „Mehr“ mit Konto und Quellenangaben.
   Routen: #/ (Mein Tag), #/diary, #/add?meal=1&tab=&q=, #/quick?meal=, #/entry?id=, #/product?id=&meal=,
   #/product/edit?id=|ean=|name=, #/recipes, #/recipe?id=&meal=, #/recipe/edit?id=, #/shortcut?id=,
   #/reports, #/planner, #/more */

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
  view.classList.toggle('days', week);  // Wischen über die Seite wechselt den Tag
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
      <ul>${list.map(e => `<li data-swipe="entry" data-id="${e.id}"><a class="entry" href="#/entry?id=${e.id}"><span class="thumb">${icon('food')}</span>
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
const RECIPE_COLS = `id,name,portions,notes,nut_recipe_items(id,grams,product_id,nut_products(${PRODUCT_COLS}))`;
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

// Bild, Name und Zeile mit Quelle, Marke und Nährwerten; auch im Zutaten-Dialog der Rezepte
const hitInner = p => `<span class="thumb">${icon('food')}</span>
  <span class="what"><b>${esc(p.name)}</b><span>${srcBadge(p)}${p.brand ? `${esc(p.brand)} · ` : ''}${nutLine(p)}</span></span>`;
const hitHtml = (p, meal) => `<li data-swipe="hit"><a class="hit" href="#/product?id=${p.id}&meal=${meal}">${hitInner(p)}
  ${icon('right', 'go')}</a></li>`;

const newProductCard = q => `<a class="card newprod" href="#/product/edit?name=${encodeURIComponent(q.trim())}">${icon('plus')}
  <span><b>Eigenes Produkt anlegen</b><span class="small">Nährwerte von der Packung übernehmen</span></span></a>`;

// Fddb nur als Nachschlagehilfe: öffnet die Suche in einem neuen Tab, die App ruft dort nichts ab
const fddbUrl = q => `https://fddb.info/db/de/suche/?udd=0&cat=site-de&search=${encodeURIComponent(q.trim())}`;
const fddbCard = q => (q.trim() ? `<a class="card newprod" href="${esc(fddbUrl(q))}" target="_blank" rel="noopener">${icon('search')}
  <span><b>Bei Fddb nachsehen</b><span class="small">Werte dort kopieren und beim eigenen Produkt einfügen</span></span></a>` : '');

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
    // scheitert nur die Rezeptsuche, bleiben die Produkttreffer sichtbar
    const [hits, recipes] = await Promise.all([searchProducts(term),
      searchRecipes(term).catch(e => { if (e instanceof LoginNeeded) throw e; return []; })]);
    if (run !== searchRun) return;
    box.innerHTML = (hits.length || recipes.length ? `<ul class="card hits">${recipes.map(r => recipeHitHtml(r, meal)).join('')}${
      hits.map(p => hitHtml(p, meal)).join('')}</ul>`
      : `<div class="empty-state">${icon('search')}<b>Nichts gefunden</b><p class="hint">Anders schreiben, Barcode scannen oder selbst anlegen.</p></div>`)
      + newProductCard(term) + fddbCard(term) + quickCard(meal);
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
    <div id="results"></div>`;
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
    showProducts(meal, 'nut_diary?order=eaten_at.desc&limit=200',
      ['history', 'Zuletzt gegessen', 'Hier erscheinen die Lebensmittel, die du zuletzt eingetragen hast.']);
  } else if (tab === 'fav') {
    showProducts(meal, 'nut_favorites?order=id.desc',
      ['star', 'Noch keine Favoriten', 'Auf der Produktseite mit dem Stern als Favorit markieren.']);
  } else {
    fillShortcuts($('#results'), () => entryDay || isoDay(day), backToDay);
  }
  // Tippen auf einem anderen Reiter wechselt zur Suche
  input.addEventListener('focus', () => { if (tab !== 'search') runSearch(input.value, meal); }, { once: true });
}

// Zuletzt (aus dem Tagebuch) und Favoriten: Produkte und Rezepte der Abfrage, jedes nur einmal (gelöschte und
// Schnelleinträge fallen heraus)
async function showProducts(meal, query, [ic, title, text]) {
  const run = ++searchRun, box = $('#results');
  box.innerHTML = '<p class="hint pad">Lade …</p>';
  try {
    const rows = await Cloud.rest(`${query}&select=product_id,recipe_id,nut_products(${PRODUCT_COLS})`
      + '&or=(product_id.not.is.null,recipe_id.not.is.null)');
    // Rezepte samt Zutaten in einer zweiten Abfrage, jedes nur einmal (statt einmal je Tagebuchzeile)
    const rids = [...new Set(rows.map(r => r.recipe_id).filter(Boolean))];
    const recipes = new Map((rids.length ? await Cloud.rest(`nut_recipes?select=${RECIPE_COLS}&id=in.(${rids.join(',')})`) : [])
      .map(r => [r.id, r]));
    if (run !== searchRun) return;
    // Map behält die Reihenfolge des ersten Auftretens, also die neuesten zuerst
    const list = [...new Map(rows.filter(r => r.nut_products || recipes.has(r.recipe_id)).map(r => (r.recipe_id
      ? [`r${r.recipe_id}`, () => recipeHitHtml(recipes.get(r.recipe_id), meal)]
      : [`p${r.product_id}`, () => hitHtml(r.nut_products, meal)]))).values()].slice(0, 40);
    box.innerHTML = list.length ? `<ul class="card hits">${list.map(html => html()).join('')}</ul>`
      : `<div class="empty-state">${icon(ic)}<b>${title}</b><p class="hint">${text}</p></div>`;
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
  const pid = Number(params.get('id'));
  const [p, favRows] = await Promise.all([loadProduct(params.get('id')),
    Number.isInteger(pid) && pid > 0 ? Cloud.rest(`nut_favorites?select=id&product_id=eq.${pid}`) : []]);
  if (!isCurrent()) return;
  const fav = favRows.length > 0;
  const servings = (p.nut_servings || []).sort((a, b) => a.grams - b.grams);  // kleinste Portion als Vorgabe
  const meal = MEALS[params.get('meal')] ? params.get('meal') : mealForNow();
  const energy = p.kj == null && p.kcal == null ? '–' : `${num(p.kj)} kJ / ${num(p.kcal)} kcal`;
  view.innerHTML = `
    <section class="card product-head"><span class="thumb lg">${icon('food')}</span>
      <div><h2>${esc(p.name)}</h2><p class="small">${srcBadge(p)}${[p.brand && esc(p.brand),
        p.source !== 'bls' && p.source_ref && `EAN ${esc(p.source_ref)}`].filter(Boolean).join(' · ')}</p></div>
      <button type="button" class="icon-btn fav" id="favBtn" aria-label="Favorit" aria-pressed="${fav}">${icon('star')}</button>
    </section>
    ${entryFormHtml(servings.length ? amountFields(servings, 1, 0) : amountFields([], 100), meal,
      p.kcal == null && p.kj == null ? '<p class="hint">Für dieses Produkt fehlt die Energieangabe. Es wird mit 0 kcal eingetragen.</p>' : '')}
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
  bindFavShortcut(f, p.name, { product_id: p.id }, fav);
}

// Formular „Eintragen“ der Produkt- und Rezeptseite; amount = Mengenfelder, note = Hinweis über der Fehlerzeile
const entryFormHtml = (amount, meal, note = '') => `<form id="eform" class="card pform" novalidate><h2>Eintragen</h2>
    ${amount}
    ${whenFields(entryDay || isoDay(day), meal, entryTime || hhmm(new Date()))}
    <p class="entry-sum" id="esum"></p>
    ${note}
    <p class="error" hidden></p>
    <div class="form-actions"><button type="button" class="text" id="toShortcut">${icon('bolt')}Als Shortcut</button>
      <button type="submit">${icon('plus')}Eintragen</button></div>
  </form>`;

// Stern (#favBtn) und „Als Shortcut“ (#toShortcut) auf Produkt- und Rezeptseite; ref = { product_id } oder { recipe_id }
function bindFavShortcut(f, name, ref, fav) {
  const [[key, refId]] = Object.entries(ref);
  const fail = msg => { const err = f.querySelector('.error'); err.textContent = msg; err.hidden = false; };
  $('#favBtn').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await (fav ? Cloud.rest(`nut_favorites?${key}=eq.${refId}`, { method: 'DELETE', prefer: 'return=minimal' })
        : Cloud.rest('nut_favorites', { method: 'POST', body: ref, prefer: 'return=minimal' }));
      fav = !fav;
    } catch (ex) {
      if (ex instanceof LoginNeeded) { route(); return; }
      if (ex.status === 409) fav = true;  // schon Favorit (anderes Gerät): Stern einfach setzen
      else { fail(ex.message); btn.disabled = false; return; }
    }
    btn.setAttribute('aria-pressed', fav);
    toast(fav ? 'Zu den Favoriten hinzugefügt' : 'Aus den Favoriten entfernt');
    btn.disabled = false;
  });
  // Shortcut mit Menge und Mahlzeit aus dem Formular anlegen; Name und feste Uhrzeit danach auf der Shortcut-Seite
  $('#toShortcut').addEventListener('click', async e => {
    const btn = e.currentTarget;
    if (!(gramsOf(f) > 0)) { fail('Bitte eine Menge angeben.'); return; }
    btn.disabled = true;
    try {
      const [{ id }] = await Cloud.rest('nut_shortcuts?select=id', { method: 'POST', prefer: 'return=representation',
        body: { name, ...ref, grams: round1(gramsOf(f)), meal: Number(fv(f, 'meal').value) } });
      location.hash = `#/shortcut?id=${id}`;
    } catch (ex) {
      if (ex instanceof LoginNeeded) { route(); return; }
      fail(ex.message);
      btn.disabled = false;
    }
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
      <section class="card"><h2>Nährwerte je 100 g</h2>
        <div class="fddb-row"><a class="small" id="fddbLink" href="${esc(fddbUrl(p.name))}" target="_blank" rel="noopener">Bei Fddb nachsehen</a>
          <button type="button" class="text" id="fddbPaste">Werte einfügen</button></div>
        <p class="hint" id="fddbNote" hidden></p><div class="grid2">
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

  el('name').addEventListener('input', () => { $('#fddbLink').href = fddbUrl(el('name').value); });
  $('#fddbPaste').addEventListener('click', () => openFddbPaste(({ vals, basis }) => {
    Object.entries(vals).forEach(([k, v]) => { el(k).value = v; el(k).dataset.manual = '1'; });
    // nur kcal oder nur kJ kopiert: das andere Feld wie beim Tippen mitrechnen
    if ((vals.kcal == null) !== (vals.kj == null)) {
      const from = vals.kcal == null ? 'kj' : 'kcal', to = from === 'kj' ? 'kcal' : 'kj';
      delete el(to).dataset.manual;
      el(from).dispatchEvent(new Event('input'));
    }
    const other = basis && !/^100 ?g$/i.test(basis);  // z. B. 100 ml
    $('#fddbNote').textContent = other ? `Fddb gibt die Werte für ${basis} an, die App rechnet sie als 100 g.` : '';
    $('#fddbNote').hidden = !other;
  }));

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

// Nährwertblock einer Fddb-Produktseite lesen. Je nach Browser kommen Bezeichnung und Wert beim Kopieren in einer
// Zeile (Tabulator) oder untereinander, deshalb wird Leerraum vereinheitlicht. „k. A.“ bleibt ungefüllt.
const FDDB_LABELS = [['kj', 'Brennwert', 'kJ'], ['kcal', 'Kalorien', 'kcal'], ['fat', 'Fett', 'g'], ['carbs', 'Kohlenhydrate', 'g'],
  ['sugar', 'davon Zucker', 'g'], ['protein', 'Protein', 'g'], ['fiber', 'Ballaststoffe', 'g'], ['salt', 'Salz', 'g']];

function parseFddb(text) {
  let t = text.replace(/\s+/g, ' ');
  const start = t.search(/Nährwerte für/i);  // Kopfzeile davor (Name, Kurzwerte) überspringen
  if (start >= 0) t = t.slice(start);
  const vals = {};
  for (const [k, label, unit] of FDDB_LABELS) {
    const m = t.match(new RegExp(`\\b${label}:? (\\d[\\d.]*(?:,\\d+)?) ?${unit}\\b`, 'i'));
    if (!m) continue;
    // „2.250“ = Tausenderpunkt, „3.5“ = Dezimalpunkt (englische Seite), „3,5“ = Dezimalkomma
    const raw = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(m[1]) ? m[1].replace(/\./g, '') : m[1];
    vals[k] = Number(raw.replace(',', '.'));
  }
  return { vals, basis: t.match(/^Nährwerte für (.+?) (?:Brennwert|Kalorien)\b/i)?.[1] || '' };
}

function openFddbPaste(apply) {
  const dlg = document.createElement('dialog');
  dlg.className = 'scan';
  dlg.innerHTML = `<form>
    <h2>Werte von Fddb einfügen</h2>
    <p class="hint">Auf der Produktseite bei Fddb den Abschnitt „Nährwerte für 100 g“ markieren, kopieren und hier einfügen.</p>
    <label>Kopierter Text <textarea name="txt" rows="7" required></textarea></label>
    <p class="error" hidden></p>
    <div class="form-actions"><button type="button" class="text" data-close>Abbrechen</button><button type="submit">Übernehmen</button></div>
  </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form'), err = dlg.querySelector('.error');
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  form.addEventListener('submit', e => {
    e.preventDefault();
    const res = parseFddb(form.elements.namedItem('txt').value);
    if (!Object.keys(res.vals).length) {
      err.textContent = 'Keine Nährwerte erkannt. Bitte den Block ab „Nährwerte für …“ kopieren.';
      err.hidden = false;
      return;
    }
    apply(res);
    dlg.close();
  });
  dlg.showModal();
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
      + `nut_products(nut_servings(label,grams)),nut_recipes(${RECIPE_COLS})&id=eq.${id}`) : [];
  if (!isCurrent()) return;
  if (!rows.length) throw new Error('Eintrag nicht gefunden.');
  const e = rows[0], at = new Date(e.eaten_at);
  const byAmount = Number(e.grams) > 0;  // mit Menge: Werte skalieren; ohne (Schnelleintrag): Werte direkt bearbeiten
  const portion = e.nut_recipes && recipeInfo(e.nut_recipes).portion;  // Portion nach dem heutigen Stand des Rezepts
  const servings = portion ? [{ label: 'Portion', grams: portion }] : e.nut_products?.nut_servings || [];
  view.innerHTML = `
    <form id="entryForm" class="pform" novalidate>
      <section class="card">
        ${byAmount ? `<div class="product-head"><span class="thumb lg">${icon('food')}</span><div><h2>${esc(e.label)}</h2>
            ${e.product_id ? `<a class="small" href="#/product?id=${e.product_id}&meal=${e.meal}">Produkt ansehen</a>`
              : e.recipe_id ? `<a class="small" href="#/recipe?id=${e.recipe_id}&meal=${e.meal}">Rezept ansehen</a>` : ''}</div></div>
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

// ---------- Shortcuts: ein Tipp trägt ein Produkt oder Rezept mit fester Menge und Mahlzeit ein ----------

const SHORTCUT_COLS = `id,name,grams,meal,fixed_time,nut_products(${PRODUCT_COLS}),nut_recipes(${RECIPE_COLS})`;
// Ziel eines Shortcuts: Name, Verweis für den Eintrag und Werte je 100 g
const shortcutTarget = s => (s.nut_recipes
  ? { name: s.nut_recipes.name, ref: { recipe_id: s.nut_recipes.id }, base: recipeInfo(s.nut_recipes).base }
  : { name: s.nut_products.name, ref: { product_id: s.nut_products.id }, base: per100(s.nut_products) });
const shortcutValues = s => scaleValues(shortcutTarget(s).base, Number(s.grams) / 100);
const shortcutRow = s => `<li><button type="button" class="hit shortcut" data-sc="${s.id}"><span class="thumb">${icon('bolt')}</span>
  <span class="what"><b>${esc(s.name)}</b><span>${num(s.grams)} g · ${num(shortcutValues(s).kcal)} kcal · ${MEALS[s.meal]}</span></span>
  <span class="time">${s.fixed_time ? s.fixed_time.slice(0, 5) : 'jetzt'}</span></button>
  <a class="icon-btn sc-edit" href="#/shortcut?id=${s.id}" aria-label="${esc(s.name)} bearbeiten">${icon('edit')}</a></li>`;

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
}

// Eintrag am Tag iso; Uhrzeit fest oder jetzt. Danach zeigt die App diesen Tag.
async function runShortcut(s, iso) {
  const at = dateAt(iso, s.fixed_time ? s.fixed_time.slice(0, 5) : hhmm(new Date())), t = shortcutTarget(s);
  await Cloud.rest('nut_diary', { method: 'POST', prefer: 'return=minimal', body: { eaten_at: at.toISOString(), meal: s.meal,
    label: t.name, grams: Number(s.grams), ...t.ref, origin: 'app', ...shortcutValues(s) } });
  day = dateAt(iso, '12:00');
  if (closedMeals.delete(String(s.meal))) saveClosed();
  toast(`„${s.name}“ eingetragen`);
}

// Liste mit Fuß (Neuer Shortcut, Bearbeiten) in box; dayIso() liefert den Tag beim Tippen, done() läuft danach
async function fillShortcuts(box, dayIso, done) {
  const run = ++searchRun;
  box.innerHTML = '<p class="hint pad">Lade …</p>';
  let list;
  try {
    list = await Cloud.rest(`nut_shortcuts?select=${SHORTCUT_COLS}&grams=not.is.null&order=sort.asc,name.asc`);
  } catch (e) {
    if (run !== searchRun) return;
    if (e instanceof LoginNeeded) route();
    else box.innerHTML = `<p class="error pad">${esc(e.message)}</p>`;
    return;
  }
  if (run !== searchRun) return;
  list = list.filter(s => s.nut_products || s.nut_recipes);
  box.innerHTML = `<div class="sc">${list.length ? `<ul class="card hits shortcuts">${list.map(shortcutRow).join('')}</ul>`
    : `<div class="empty-state">${icon('bolt')}<b>Noch keine Shortcuts</b></div>`}
    <p class="hint pad">Ein Tipp trägt sofort ein. Neue Shortcuts legst du auf der Produkt- oder Rezeptseite mit „Als Shortcut“ an.</p>
    <div class="form-actions"><a class="text" href="#/add?tab=search">${icon('plus')}Neuer Shortcut</a>
      ${list.length ? `<button type="button" class="text" data-edit>${icon('edit')}Bearbeiten</button>` : ''}</div></div>`;
  const sc = box.firstElementChild;
  sc.addEventListener('click', async e => {
    if (e.target.closest('[data-edit]')) { sc.classList.toggle('editing'); return; }
    const btn = e.target.closest('[data-sc]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      await runShortcut(list.find(s => String(s.id) === btn.dataset.sc), dayIso());
      done();
    } catch (ex) {
      btn.disabled = false;
      if (ex instanceof LoginNeeded) route();
      else toast(ex.message);
    }
  });
}

// Seitenleiste vom rechten Rand; schließt über Hintergrund, Schließen-Knopf oder Wischen nach rechts
function openShortcuts() {
  if ($('dialog.drawer[open]')) return;  // geschlossene entfernt erst das close-Ereignis
  const dlg = document.createElement('dialog');
  dlg.className = 'drawer';
  dlg.innerHTML = `<div class="drawer-head"><h2>Shortcuts</h2>
    <button type="button" class="icon-btn" data-close aria-label="Schließen">${icon('close')}</button></div><div class="drawer-body"></div>`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close], a')) dlg.close(); });
  addSwipe(dlg, () => ({
    move: dx => { dlg.style.transition = 'none'; dlg.style.transform = `translateX(${Math.max(0, dx)}px)`; },
    end: dx => { dlg.style.transition = dlg.style.transform = ''; if (dx > 80) dlg.close(); },
  }));
  dlg.showModal();
  fillShortcuts(dlg.querySelector('.drawer-body'), () => isoDay(day), () => { dlg.close(); route(); });
}

async function renderShortcut(params, isCurrent) {
  chrome({ title: 'Shortcut', sub: true });
  const id = Number(params.get('id'));
  const rows = Number.isInteger(id) && id > 0 ? await Cloud.rest(`nut_shortcuts?select=${SHORTCUT_COLS}&id=eq.${id}`) : [];
  if (!isCurrent()) return;
  if (!rows.length) throw new Error('Shortcut nicht gefunden.');
  const s = rows[0];
  view.innerHTML = `
    <form id="scForm" class="pform" novalidate>
      <section class="card">
        <label>Name<input name="name" required maxlength="80" value="${esc(s.name)}"></label>
        ${s.nut_recipes ? `<p class="small">Rezept: ${esc(s.nut_recipes.name)} · 1 Portion = ${num(recipeInfo(s.nut_recipes).portion)} g</p>`
          : s.nut_products ? `<p class="small">Produkt: ${esc(s.nut_products.name)}</p>` : ''}
        <div class="grid2">
          <label>Menge (g)<input name="grams" type="number" min="0.1" step="any" inputmode="decimal" required value="${esc(s.grams)}"></label>
          <label>Mahlzeit<select name="meal">${mealOptions(s.meal)}</select></label>
        </div>
        <label>Feste Uhrzeit (leer = beim Tippen)<input name="time" type="time" value="${s.fixed_time ? s.fixed_time.slice(0, 5) : ''}"></label>
      </section>
      <p class="error pad" hidden></p>
      <div class="form-actions">
        <button type="button" class="text danger" id="delSc">Löschen</button>
        <button type="submit">Speichern</button></div>
    </form>`;
  const f = $('#scForm'), err = f.querySelector('.error');
  const send = async (opt, ok) => {
    err.hidden = true;
    f.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      await Cloud.rest(`nut_shortcuts?id=eq.${s.id}`, { ...opt, prefer: 'return=minimal' });
      toast(ok);
      location.replace(mainHash);  // „Zurück“ führt nicht ins Formular
    } catch (ex) {
      if (ex instanceof LoginNeeded) { route(); return; }
      err.textContent = ex.message;
      err.hidden = false;
      f.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  };
  f.addEventListener('submit', e => {
    e.preventDefault();
    if (!f.checkValidity()) {
      err.textContent = fv(f, 'name').validity.valid ? 'Bitte eine Menge über 0 angeben.' : 'Bitte einen Namen eingeben.';
      err.hidden = false;
      return;
    }
    send({ method: 'PATCH', body: { name: fv(f, 'name').value.trim() || s.name, grams: Number(fv(f, 'grams').value),
      meal: Number(fv(f, 'meal').value), fixed_time: fv(f, 'time').value || null } }, 'Shortcut gespeichert');
  });
  $('#delSc').addEventListener('click', () => { if (confirm(`Shortcut „${s.name}“ löschen?`)) send({ method: 'DELETE' }, 'Shortcut gelöscht'); });
}

// ---------- Rezepte: Zutaten (Produkte mit Gramm) und Portionen ----------
// Ein Rezept wird wie ein Produkt eingetragen: Werte je 100 g aus der Summe der Zutaten, eine Portion als Einheit.
// Name und Werte werden beim Eintragen festgeschrieben; spätere Änderungen am Rezept verändern alte Tage nicht.

// Zutaten, Gesamtgewicht, Gramm je Portion und Werte je 100 g (Grundlage wie per100 bei Produkten)
function recipeInfo(r) {
  const items = (r.nut_recipe_items || []).filter(i => i.nut_products);
  const grams = sum(items, 'grams');
  const total = Object.fromEntries(ENTRY_VALUES.map(k => [k, 0]));
  items.forEach(i => { const b = per100(i.nut_products); ENTRY_VALUES.forEach(k => { total[k] += (b[k] * Number(i.grams)) / 100; }); });
  return { items, grams, portion: grams / Number(r.portions || 1),
    base: Object.fromEntries(ENTRY_VALUES.map(k => [k, grams ? (100 * total[k]) / grams : 0])) };
}

const portionsText = n => `${num(n, 1)} ${Number(n) === 1 ? 'Portion' : 'Portionen'}`;
const recipeHitHtml = (r, meal) => {
  const ri = recipeInfo(r);
  return `<li data-swipe="hit"><a class="hit" href="#/recipe?id=${r.id}${meal ? `&meal=${meal}` : ''}"><span class="thumb">${icon('recipes')}</span>
    <span class="what"><b>${esc(r.name)}</b><span><i class="src recipe">Rezept</i>${portionsText(r.portions)} · ${
      num((ri.base.kcal * ri.portion) / 100)} kcal je Portion</span></span>
    ${icon('right', 'go')}</a></li>`;
};

// Eigene Rezepte, deren Name jedes Wort enthält
const searchRecipes = q => Cloud.rest(`nut_recipes?select=${RECIPE_COLS}&and=(${searchWords(q)
  .map(w => `name.ilike.${encodeURIComponent(`*${w}*`)}`).join(',')})&order=name.asc&limit=20`);

async function loadRecipe(idText) {
  const id = Number(idText);
  const rows = Number.isInteger(id) && id > 0 ? await Cloud.rest(`nut_recipes?select=${RECIPE_COLS}&id=eq.${id}`) : [];
  if (!rows.length) throw new Error('Rezept nicht gefunden.');
  return rows[0];
}

async function renderRecipes(isCurrent) {
  chrome({ title: 'Rezepte', tab: 'recipes' });
  const list = await Cloud.rest(`nut_recipes?select=${RECIPE_COLS}&order=name.asc`);
  if (!isCurrent()) return;
  view.innerHTML = `${list.length ? `<ul class="card hits">${list.map(r => recipeHitHtml(r, '')).join('')}</ul>`
    : `<section class="card empty-state">${icon('recipes')}<b>Noch keine Rezepte</b>
        <p class="hint">Ein Rezept fasst Zutaten mit Gramm zusammen und wird nach Portionen oder Gramm eingetragen.</p></section>`}
    <a class="card newprod" href="#/recipe/edit">${icon('plus')}
      <span><b>Neues Rezept</b><span class="small">Zutaten suchen und Gramm angeben</span></span></a>`;
}

// Rezeptseite: Eintragen nach Portion oder Gramm, Nährwerte, Zutaten. Aus Suche/Favoriten (mit meal) zurück zur Suche.
async function renderRecipe(params, isCurrent) {
  chrome({ title: 'Rezept', sub: true, back: params.get('meal') ? addHash : '#/recipes' });
  const rid = Number(params.get('id'));
  const [r, favRows] = await Promise.all([loadRecipe(params.get('id')),
    Number.isInteger(rid) && rid > 0 ? Cloud.rest(`nut_favorites?select=id&recipe_id=eq.${rid}`) : []]);
  if (!isCurrent()) return;
  const ri = recipeInfo(r);
  const meal = MEALS[params.get('meal')] ? params.get('meal') : mealForNow();
  // Zellen kcal, KH, Fett, Protein für factor × 100 g
  const cells = factor => ['kcal', 'carbs', 'fat', 'protein'].map(k => `<td>${num(ri.base[k] * factor, k === 'kcal' ? 0 : 1)}</td>`).join('');
  view.innerHTML = `
    <section class="card product-head"><span class="thumb lg">${icon('recipes')}</span>
      <div><h2>${esc(r.name)}</h2><p class="small"><i class="src recipe">Rezept</i>${portionsText(r.portions)} · gesamt ${num(ri.grams)} g</p></div>
      <button type="button" class="icon-btn fav" id="favBtn" aria-label="Favorit" aria-pressed="${favRows.length > 0}">${icon('star')}</button>
    </section>
    ${entryFormHtml(ri.grams ? amountFields([{ label: 'Portion', grams: ri.portion }], 1, 0) : amountFields([], 100), meal,
      ri.grams ? '' : '<p class="hint">Das Rezept hat keine Zutaten. Es wird mit 0 kcal eingetragen.</p>')}
    <section class="card"><h2>Nährwerte</h2>
      <table class="nutr rtab"><tr><th></th><td>kcal</td><td>KH</td><td>Fett</td><td>Protein</td></tr>
        <tr><th>1 Portion (${num(ri.portion)} g)</th>${cells(ri.portion / 100)}</tr>
        <tr><th>100 g</th>${cells(1)}</tr></table>
    </section>
    <section class="card"><h2>Zutaten</h2><table class="nutr">${ri.items.map(i => `<tr><th>${esc(i.nut_products.name)}</th>
      <td>${num(i.grams)} g · ${num((per100(i.nut_products).kcal * i.grams) / 100)} kcal</td></tr>`).join('')}</table></section>
    ${r.notes ? `<section class="card"><h2>Notizen</h2><p class="notes">${esc(r.notes)}</p></section>` : ''}
    <a class="btn-wide" href="#/recipe/edit?id=${r.id}">${icon('edit')}Bearbeiten</a>`;
  const f = $('#eform');
  const values = () => scaleValues(ri.base, gramsOf(f) / 100);
  const show = () => { $('#esum').textContent = sumLine(values(), gramsOf(f)); };
  f.addEventListener('input', show);
  show();
  f.addEventListener('submit', e => {
    e.preventDefault();
    saveEntry(f, () => ({ recipe_id: r.id, label: r.name, grams: round1(gramsOf(f)), origin: 'app', ...values() }));
  });
  bindFavShortcut(f, r.name, { recipe_id: r.id }, favRows.length > 0);
}

const ingRow = (p, grams = '') => `<div class="srv ing" data-pid="${p.id}">
  <span class="ing-name"><b>${esc(p.name)}</b><span class="small">${p.kcal == null ? '–' : num(p.kcal)} kcal je 100 g</span></span>
  <input name="igrams" type="number" min="0.1" step="any" inputmode="decimal" placeholder="g" aria-label="Gramm ${esc(p.name)}" required value="${esc(grams)}">
  <button type="button" class="icon-btn" data-remove aria-label="Zutat entfernen">${icon('close')}</button></div>`;

async function renderRecipeEdit(params, isCurrent) {
  const id = params.get('id');
  chrome({ title: id ? 'Rezept bearbeiten' : 'Neues Rezept', sub: true, back: id ? `#/recipe?id=${encodeURIComponent(id)}` : '#/recipes' });
  const r = id ? await loadRecipe(id) : { name: '', portions: 1, notes: '', nut_recipe_items: [] };
  if (!isCurrent()) return;
  const prods = new Map();  // Produkt je Zutatenzeile (data-pid) für die Summe
  const items = recipeInfo(r).items;
  items.forEach(i => prods.set(String(i.product_id), i.nut_products));
  view.innerHTML = `
    <form id="rform" class="pform" novalidate>
      <section class="card">
        <label>Name <input name="name" required maxlength="120" value="${esc(r.name)}"></label>
        <label>Portionen <input name="portions" type="number" min="0.1" step="any" inputmode="decimal" required value="${esc(r.portions)}"></label>
        <label>Notizen <textarea name="notes" rows="3" maxlength="2000">${esc(r.notes)}</textarea></label>
      </section>
      <section class="card"><h2>Zutaten</h2><div id="ings">${items.map(i => ingRow(i.nut_products, i.grams)).join('')}</div>
        <button type="button" class="text" id="addIng">${icon('plus')} Zutat hinzufügen</button>
        <p class="entry-sum" id="rsum"></p></section>
      <p class="error pad" id="rerr" hidden></p>
      <div class="form-actions">
        ${id ? '<button type="button" class="text danger" id="delRecipe">Löschen</button>' : ''}
        <button type="submit">Speichern</button></div>
    </form>`;
  const f = $('#rform'), rerr = $('#rerr');
  const fail = msg => { rerr.textContent = msg; rerr.hidden = false; };
  const rows = () => [...f.querySelectorAll('.ing')]
    .map(row => ({ product_id: Number(row.dataset.pid), grams: Number(row.querySelector('input').value) }));
  const show = () => {
    const ri = recipeInfo({ portions: Number(fv(f, 'portions').value) || 1,
      nut_recipe_items: rows().filter(i => i.grams > 0).map(i => ({ ...i, nut_products: prods.get(String(i.product_id)) })) });
    $('#rsum').textContent = ri.grams ? `Gesamt ${num(ri.grams)} g · ${num((ri.base.kcal * ri.grams) / 100)} kcal`
      + ` · je Portion ${num(ri.portion)} g · ${num((ri.base.kcal * ri.portion) / 100)} kcal` : '';
  };
  f.addEventListener('input', show);
  show();
  $('#addIng').addEventListener('click', () => openProductPicker(p => {
    prods.set(String(p.id), p);
    $('#ings').insertAdjacentHTML('beforeend', ingRow(p));
    $('#ings').lastElementChild.querySelector('input').focus();
  }));
  $('#ings').addEventListener('click', e => { if (e.target.closest('[data-remove]')) { e.target.closest('.ing').remove(); show(); } });

  f.addEventListener('submit', async e => {
    e.preventDefault();
    rerr.hidden = true;
    if (!f.checkValidity()) {
      const bad = f.querySelector(':invalid');
      bad.focus();
      return fail(bad.name === 'name' ? 'Bitte einen Namen eingeben.'
        : bad.name === 'portions' ? 'Bitte die Zahl der Portionen angeben (über 0).'
        : `${bad.getAttribute('aria-label')}: bitte eine Menge über 0 eingeben.`);
    }
    const list = rows();
    if (!list.length) return fail('Bitte mindestens eine Zutat hinzufügen.');
    const body = { name: fv(f, 'name').value.trim(), portions: Number(fv(f, 'portions').value), notes: fv(f, 'notes').value.trim() || null };
    if (!body.name) return fail('Bitte einen Namen eingeben.');
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      let rid = r.id;
      if (rid) {
        await Cloud.rest(`nut_recipes?id=eq.${rid}`, { method: 'PATCH', body, prefer: 'return=minimal' });
      } else {
        [{ id: rid }] = await Cloud.rest('nut_recipes?select=id', { method: 'POST', body, prefer: 'return=representation' });
        r.id = rid;  // scheitern danach die Zutaten, ändert ein zweites Speichern dieses Rezept statt ein neues anzulegen
      }
      // erst neue Zutaten anlegen, dann die alten löschen: bricht es dazwischen ab, geht nichts verloren. Bis das
      // Löschen geklappt hat, zählen alte und neue Zeilen als vorhanden, damit ein zweites Speichern beide entfernt.
      const old = r.nut_recipe_items || [];
      const added = await Cloud.rest('nut_recipe_items?select=id', { method: 'POST',
        body: list.map(i => ({ ...i, recipe_id: rid })), prefer: 'return=representation' });
      r.nut_recipe_items = [...old, ...added];
      if (old.length) await Cloud.rest(`nut_recipe_items?id=in.(${old.map(i => i.id).join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
      r.nut_recipe_items = added;
      location.replace(`#/recipe?id=${rid}`);  // „Zurück“ führt nicht ins Formular
    } catch (ex) {
      if (ex instanceof LoginNeeded) { route(); return; }
      fail(ex.message);
      btn.disabled = false;
    }
  });

  $('#delRecipe')?.addEventListener('click', async () => {
    if (!confirm(`Rezept „${r.name}“ löschen? Einträge im Tagebuch bleiben erhalten, Favorit und Shortcuts dazu werden entfernt.`)) return;
    try {
      await Cloud.rest(`nut_recipes?id=eq.${r.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      location.replace('#/recipes');
    } catch (ex) {
      if (ex instanceof LoginNeeded) { route(); return; }
      fail(ex.message);
    }
  });
}

// Zutat wählen: Produktsuche im Dialog; pick(Produkt) übernimmt den Treffer
function openProductPicker(pick) {
  const dlg = document.createElement('dialog');
  dlg.className = 'scan picker';
  dlg.innerHTML = `<form>
    <h2>Zutat hinzufügen</h2>
    <label>Lebensmittel <input name="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="z. B. Haferflocken"></label>
    <ul class="hits picks"></ul>
    <div class="form-actions"><button type="button" class="text" data-close>Abbrechen</button></div>
  </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form'), input = form.elements.namedItem('q'), box = dlg.querySelector('.picks');
  let hits = [], run = 0, timer;
  const search = async () => {
    clearTimeout(timer);
    const me = ++run, term = input.value.trim();
    if (!searchWords(term).length) { box.innerHTML = ''; return; }
    box.innerHTML = '<li class="hint pad">Suche …</li>';
    try {
      const found = await searchProducts(term);
      if (me !== run) return;
      hits = found.slice(0, 30);
      box.innerHTML = hits.length ? hits.map((p, i) => `<li><button type="button" class="hit pick" data-i="${i}">${hitInner(p)}</button></li>`).join('')
        : '<li class="hint pad">Nichts gefunden. Eigene Produkte legst du über Eintragen → Suche an.</li>';
    } catch (e) {
      if (me !== run) return;
      if (e instanceof LoginNeeded) { dlg.close(); route(); return; }
      box.innerHTML = `<li class="error pad">${esc(e.message)}</li>`;
    }
  };
  dlg.addEventListener('close', () => { clearTimeout(timer); run++; dlg.remove(); });
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 300); });
  form.addEventListener('submit', e => { e.preventDefault(); search(); });
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    dlg.close();  // zuerst: das Schließen gibt den Fokus an den Auslöser zurück, pick setzt ihn danach neu
    pick(hits[Number(b.dataset.i)]);
  });
  dlg.showModal();
  input.focus();
}

// ---------- Wischgesten ----------
// Zeiger-Ereignisse decken Finger und Maus ab. touch-action: pan-y (style.css) überlässt senkrechtes Scrollen dem
// Browser, der die Geste dann mit pointercancel beendet; eine waagerechte Bewegung gehört der Geste.

const SWIPE_SLOP = 10;  // px Bewegung, bevor die Richtung feststeht
let swipedAt = 0;  // Ende der letzten Geste; der Klick direkt danach wird verschluckt

// pick(Ziel, pointerdown) liefert für den Startpunkt { move(dx), end(dx) } oder null (keine Geste)
function addSwipe(area, pick) {
  let g = null;
  area.addEventListener('pointerdown', e => {
    if (g?.on || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('input, select, textarea')) return;  // zweiter Finger stört die laufende Geste nicht
    const h = pick(e.target, e);
    g = h && { h, id: e.pointerId, x: e.clientX, y: e.clientY, on: false };
  });
  area.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.on) {
      if (Math.hypot(dx, dy) < SWIPE_SLOP) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { g = null; return; }  // eher senkrecht: scrollen
      g.on = true;
      try { area.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg: Geste läuft ohne Capture weiter */ }
    }
    g.h.move(dx);
  });
  const stop = e => {
    if (!g || e.pointerId !== g.id) return;
    const { h, on, x } = g;
    g = null;
    if (!on) return;
    swipedAt = Date.now();
    h.end(e.type === 'pointerup' ? e.clientX - x : 0);  // abgebrochen: zurückschnappen
  };
  area.addEventListener('pointerup', stop);
  area.addEventListener('pointercancel', stop);
  area.addEventListener('dragstart', e => e.preventDefault());  // Maus: Links nicht als Drag & Drop ziehen
}

// Ganze Fläche folgt dem Finger gedämpft; ab 60 px blättert step um eins vor (nach links) oder zurück
const slide = (el, step) => ({
  move: dx => { el.style.transition = 'none'; el.style.transform = `translateX(${dx / 3}px)`; },
  end: dx => { el.style.transition = el.style.transform = ''; if (Math.abs(dx) >= 60) step(dx < 0 ? 1 : -1); },
});

// Zeilen: Eintrag nach rechts = Bearbeiten (gelb), nach links = Löschen (rot); Suchtreffer in beide Richtungen = Ansehen
const SWIPE_BG = {
  entry: `<span class="swipe-bg right edit">${icon('edit')}Bearbeiten</span><span class="swipe-bg left del">Löschen${icon('trash')}</span>`,
  hit: `<span class="swipe-bg right show">${icon('right')}Ansehen</span><span class="swipe-bg left show">Ansehen${icon('right')}</span>`,
};
const SWIPE_DO = {
  entry: (row, dir, a) => (dir === 'right' ? (location.hash = a.getAttribute('href'))
    : deleteEntry(row.dataset.id, row.querySelector('.what b').textContent)),
  hit: (_row, _dir, a) => { location.hash = a.getAttribute('href'); },
};

function rowSwipe(row) {
  const a = row.querySelector('a');
  if (!row.querySelector('.swipe-bg')) row.insertAdjacentHTML('afterbegin', SWIPE_BG[row.dataset.swipe]);
  return {
    move: dx => { a.style.transition = 'none'; a.style.transform = `translateX(${dx}px)`; row.dataset.dir = dx > 0 ? 'right' : 'left'; },
    end: dx => {
      a.style.transition = a.style.transform = '';
      if (Math.abs(dx) >= Math.min(120, row.offsetWidth * 0.3)) SWIPE_DO[row.dataset.swipe](row, dx > 0 ? 'right' : 'left', a);
    },
  };
}

async function deleteEntry(id, label) {
  if (!confirm(`„${label}“ löschen?`)) return;
  try {
    await Cloud.rest(`nut_diary?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    route();
  } catch (ex) {
    if (ex instanceof LoginNeeded) route();
    else alert(ex.message);
  }
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
  if (!['add', 'search', 'planner', 'product', 'quick', 'entry', 'shortcut', 'recipe'].includes(tab)) {
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
    else if (tab === 'shortcut') await renderShortcut(params, isCurrent);
    else if (path === 'product/edit') await renderProductEdit(params, isCurrent);
    else if (tab === 'product') await renderProduct(params, isCurrent);
    else if (path === 'recipe/edit') await renderRecipeEdit(params, isCurrent);
    else if (tab === 'recipe') await renderRecipe(params, isCurrent);
    else if (tab === 'recipes') await renderRecipes(isCurrent);
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
addSwipe(view, (t, e) => {
  const row = t.closest('[data-swipe]');
  if (row) return rowSwipe(row);
  if (!view.classList.contains('days')) return null;
  // vom rechten Rand nach links: Shortcut-Menü statt Tageswechsel
  if (e.clientX > innerWidth - 24) return { move() {}, end: dx => { if (dx < -40) openShortcuts(); } };
  return slide(view, shiftDay);
});
$('#openShortcuts').addEventListener('click', openShortcuts);
addSwipe($('#weekDays'), () => slide($('#weekDays'), n => shiftDay(7 * n)));
document.addEventListener('click', e => { if (Date.now() - swipedAt < 400) { e.preventDefault(); e.stopPropagation(); } }, true);
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
