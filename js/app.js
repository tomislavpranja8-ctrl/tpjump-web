/* TP Jump — web (PWA) version. Team Performance. */
'use strict';
{
// ───────────────────────── utils
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID().toUpperCase();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase();
};
const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const VERSION = '1.0.0';

// ───────────────────────── settings & language
const DEF = { lang: 'hr', defaultType: 'cmj', attempts: 3, countdown: 3, autoStop: 6, dropHeight: 30, lastAthlete: '' };
const S = Object.assign({}, DEF, LS.get('tpjump-settings', {}));
const saveS = () => LS.set('tpjump-settings', S);
const t = (hr, en) => S.lang === 'hr' ? hr : en;
const locale = () => S.lang === 'hr' ? 'hr-HR' : 'en-GB';
const TYPES = ['cmj', 'sj', 'dj'];
const SHORT = { cmj: 'CMJ', sj: 'SJ', dj: 'DJ' };
const TCOL = { cmj: 'var(--accent)', sj: 'var(--blue)', dj: 'var(--green)' };
const typeName = ty => ({ cmj: t('Skok s pripremom', 'Countermovement jump'), sj: t('Skok iz čučnja', 'Squat jump'), dj: t('Saskok-odskok', 'Drop jump') }[ty]);
const typeHint = (ty, dh) => ({
  cmj: t('Ruke na bokovima · visina iz vremena leta', 'Hands on hips · height from flight time'),
  sj: t('Zadrška 90° oko 3 s, bez zamaha', 'Hold 90° for ~3 s, no countermovement'),
  dj: t(`Visina, kontakt i RSI · sanduk ${Math.round(dh)} cm`, `Height, contact and RSI · box ${Math.round(dh)} cm`)
}[ty]);
const fmtDate = (iso, withTime) => {
  const d = new Date(iso);
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: withTime === 'y' ? 'numeric' : undefined }) +
    (withTime === true ? ' ' + d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '');
};
const shortDate = iso => {
  const d = new Date(iso), now = new Date();
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 864e5;
  if (diff === 0) return t('danas', 'today') + ' ' + d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return t('jučer', 'yesterday');
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
};
const num = (v, d) => v == null || isNaN(v) ? '—' : v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
const Fcm = v => num(v, 1), Fms = s => num(s * 1000, 0), Frsi = v => num(v, 2);

// ───────────────────────── jump math (flight-time method, Bosco 1983)
const G = 9.81;
const M = {
  height: ft => ft > 0 ? G * ft * ft / 8 * 100 : 0,
  rsi: (hcm, ct) => ct > 0 ? (hcm / 100) / ct : null,
  sayers: (hcm, kg) => 60.7 * hcm + 45.3 * kg - 2055,
  vel: hcm => Math.sqrt(2 * G * hcm / 100)
};
const score = r => r.type === 'dj' ? (r.rsi ?? 0) : r.heightCm;
const fmtScore = (r, unit = true) => r.type === 'dj' ? Frsi(r.rsi) : Fcm(r.heightCm) + (unit ? ' cm' : '');

// ───────────────────────── data store (same JSON shape as the iOS backup)
const DB = { athletes: [], results: [], groups: [] };
function applySnap(s) {
  DB.athletes = Array.isArray(s.athletes) ? s.athletes : [];
  DB.results = Array.isArray(s.results) ? s.results : [];
  const g = Array.isArray(s.groups) ? [...s.groups] : [];
  DB.athletes.forEach(a => { if (a.group && !g.includes(a.group)) g.push(a.group); });
  DB.groups = g;
}
applySnap(LS.get('tpjump-data', {}));
const save = () => LS.set('tpjump-data', clean({ athletes: DB.athletes, results: DB.results, groups: DB.groups }));
function clean(o) { return JSON.parse(JSON.stringify(o, (k, v) => v === null ? undefined : v)); }
const athlete = id => DB.athletes.find(a => a.id === id);
const sortedAthletes = () => [...DB.athletes].sort((a, b) => a.name.localeCompare(b.name, locale()));
const resultsFor = (aid, ty) => DB.results.filter(r => r.athleteID === aid && (!ty || r.type === ty)).sort((a, b) => b.date.localeCompare(a.date));
const bestFor = (aid, ty) => resultsFor(aid, ty).reduce((m, r) => !m || score(r) > score(m) ? r : m, null);
const inSession = sid => DB.results.filter(r => r.sessionID === sid).sort((a, b) => (a.attempt ?? 0) - (b.attempt ?? 0) || a.date.localeCompare(b.date));
const prevBest = r => {
  const v = DB.results.filter(x => x.athleteID === r.athleteID && x.type === r.type && x.date < r.date && (!r.sessionID || x.sessionID !== r.sessionID)).map(score);
  return v.length ? Math.max(...v) : null;
};
const lastDate = aid => DB.results.filter(r => r.athleteID === aid).map(r => r.date).sort().pop();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ───────────────────────── icons
const P = {
  house: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3.5v11L16 14"/>',
  photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>', back: '<path d="M15 5 8 12l7 7"/>', chev: '<path d="m9 5 7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>', pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4M12 17h.01"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', up: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', arrow: '<path d="M12 20V5M5.5 11.5 12 5l6.5 6.5"/>',
  addp: '<circle cx="10" cy="8" r="4"/><path d="M3 20c.7-4 3.5-6 7-6 1.5 0 2.8.3 3.9 1M18 14v6M15 17h6"/>',
  cmj: '<circle cx="12" cy="4" r="2"/><path d="M12 7v7M8 10l4-2 4 2M9 21l3-7 3 7M4 17h3M17 17h3"/>',
  sj: '<circle cx="12" cy="4.5" r="2"/><path d="M8 11h8M12 7.5V13l-4 3v5M12 13l4 3v5"/>',
  dj: '<path d="M2 14h7v7"/><circle cx="16" cy="4.5" r="2"/><path d="M16 7.5V13l-3 3M16 13l3 3v5M13 21h8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const I = (n, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
const AVC = ['#FF7A1A', '#4C9BFF', '#3DD68C', '#B78CFF', '#FFD166', '#5ED3F3'];
const avColor = id => AVC[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % AVC.length];
const initials = n => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
const av = (a, size) => `<div class="av" style="background:${avColor(a.id)}${size ? `;width:${size}px;height:${size}px;font-size:${Math.round(size * .34)}px` : ''}">${esc(initials(a.name))}</div>`;

// ───────────────────────── UI state
const ui = { tab: 'home', stack: [], resFilter: null, search: '', group: null, chartType: 'cmj' };
let flow = null;
const app = $('#app'), layer = $('#layer');

function newFlow(type, athleteID) {
  const aid = athleteID || (athlete(S.lastAthlete) ? S.lastAthlete : null);
  return { sessionID: uuid(), stage: 'setup', athleteID: aid, type: type || S.defaultType, planned: Math.max(1, S.attempts), dropHeight: S.dropHeight, countdown: S.countdown, saved: [], resultID: null, file: null, fpsHint: null, error: '' };
}

// ───────────────────────── render
function render() {
  if (An.active && !(flow && flow.stage === 'analyze')) An.close();
  if (Cam.active && !(flow && flow.stage === 'camera')) Cam.close();
  document.title = 'TP Jump';
  let html;
  if (flow) {
    if (flow.stage === 'setup') html = vSetup();
    else if (flow.stage === 'camera') { if (!Cam.active) Cam.open(); return; }
    else if (flow.stage === 'analyze') { if (!An.active) An.open(flow.file); return; }
    else html = vFlowResult();
  } else {
    while (ui.stack.length) { const tp = ui.stack[ui.stack.length - 1]; if (tp.k === 'profile' ? athlete(tp.id) : DB.results.some(r => r.id === tp.id)) break; ui.stack.pop(); }
    const top = ui.stack[ui.stack.length - 1];
    if (top && top.k === 'profile') html = vProfile(top.id);
    else if (top && top.k === 'result') html = vResultDetail(top.id);
    else html = ({ home: vHome, athletes: vAthletes, results: vResults, settings: vSettings })[ui.tab]();
    html += vTabs();
  }
  app.innerHTML = html;
  afterRender();
}
function afterRender() {
  document.querySelectorAll('[data-chart]').forEach(drawChart);
  const s = $('#athsearch');
  if (s && ui._focusSearch) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); ui._focusSearch = false; }
}

const vTabs = () => {
  const it = (k, l, ic) => `<button class="tab ${ui.tab === k && !ui.stack.length ? 'on' : ''}" data-a="tab" data-v="${k}">${I(ic)}<span>${l}</span></button>`;
  return `<nav class="tabs"><div class="in">${it('home', t('Početna', 'Home'), 'house')}${it('athletes', t('Sportaši', 'Athletes'), 'people')}<button class="plus" data-a="start" aria-label="${t('Novi test', 'New test')}">${I('plus', 2.6)}</button>${it('results', t('Rezultati', 'Results'), 'chart')}${it('settings', t('Postavke', 'Settings'), 'gear')}</div></nav>`;
};

function resultRow(r) {
  const a = athlete(r.athleteID) || { id: r.athleteID, name: '?' };
  const val = r.type === 'dj' ? `<span class="d">${Frsi(r.rsi)}</span><small>RSI</small>` : `<span class="d">${Fcm(r.heightCm)}</span><small>cm</small>`;
  return `<button class="row" data-a="open-result" data-id="${r.id}">${av(a)}<div class="main"><b>${esc(a.name)}</b><span><b style="display:inline;color:${TCOL[r.type]}">${SHORT[r.type]}</b> · ${shortDate(r.date)}${r.attempt ? ' · ' + t('pokušaj', 'attempt') + ' ' + r.attempt : ''}</span></div><div class="val">${val}</div></button>`;
}

function vHome() {
  const last = athlete(S.lastAthlete);
  const recent = [...DB.results].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  return `<main class="screen">
  <div class="top"><div class="brand"><div class="logo" style="color:var(--bg)">${I('arrow', 3)}</div><div><div class="d" style="font-size:24px;line-height:1.1">TP Jump</div><div class="xs muted">Team Performance</div></div></div>
  <button class="pillbtn" data-a="lang" aria-label="${t('Promijeni jezik', 'Change language')}">${S.lang.toUpperCase()}</button></div>
  ${installCard()}
  <button class="start" data-a="start"><div style="min-width:0"><div class="d">${t('Započni mjerenje', 'Start measuring')}</div><div class="s">${t('Video', 'Video')}${last ? ' · ' + t('zadnji: ', 'last: ') + esc(last.name) : ''}</div></div><div class="ic">${I('video')}</div></button>
  <section class="sec"><p class="label">${t('Testovi', 'Tests')}</p><div class="tests">${TYPES.map(ty => `<button class="test ${ty}" data-a="start" data-type="${ty}"><span style="color:${TCOL[ty]}">${I(ty, 1.8)}</span><span class="d">${SHORT[ty]}</span><span class="xs">${ty === 'dj' ? t('Saskok-odskok · RSI', 'Drop jump · RSI') : typeName(ty)}</span></button>`).join('')}</div></section>
  <section class="sec"><div class="sec-head"><p class="label">${t('Zadnja mjerenja', 'Recent measurements')}</p>${recent.length ? `<button class="link" data-a="tab" data-v="results">${t('Sve', 'All')}</button>` : ''}</div>
  ${recent.length ? `<div class="list">${recent.map(resultRow).join('')}</div>` : `<div class="list empty">${I('chart')}${DB.athletes.length ? t('Još nema mjerenja.', 'No measurements yet.') : t('Dodaj sportaša i snimi prvi skok.', 'Add an athlete and record the first jump.')}</div>`}</section>
  </main>`;
}

let deferredInstall = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function installCard() {
  if (standalone() || LS.get('tpjump-hide-install', false)) return '';
  return `<div class="install"><div class="main"><b>${t('Instaliraj TP Jump', 'Install TP Jump')}</b>${deferredInstall ? t('Radi kao aplikacija, i bez interneta.', 'Works like an app, even offline.') : t('Chrome izbornik ⋮ → „Instaliraj aplikaciju” ili „Dodaj na početni zaslon”.', 'Chrome menu ⋮ → “Install app” or “Add to Home screen”.')}</div>${deferredInstall ? `<button data-a="install">${t('Instaliraj', 'Install')}</button>` : `<button class="iconbtn" style="background:none;color:var(--muted)" data-a="hide-install" aria-label="${t('Sakrij', 'Hide')}">${I('x')}</button>`}</div>`;
}

function athleteSummary(a) {
  const parts = TYPES.map(ty => { const b = bestFor(a.id, ty); return b ? `${SHORT[ty]} ${fmtScore(b, false)}` : null; }).filter(Boolean);
  return parts.length ? parts.join(' · ') : t('Još nema skokova', 'No jumps yet');
}
function vAthletes() {
  const q = ui.search.trim().toLocaleLowerCase();
  const list = sortedAthletes().filter(a => (!ui.group || a.group === ui.group) && (!q || a.name.toLocaleLowerCase().includes(q)));
  const chip = (label, g, on) => `<button class="chip ${on ? 'on' : ''}" data-a="group" data-v="${esc(g ?? '')}">${esc(label)}</button>`;
  return `<main class="screen">
  <div class="top"><h1>${t('Sportaši', 'Athletes')}</h1><div style="display:flex;gap:4px"><button class="iconbtn" data-a="csv-all" aria-label="${t('Izvezi sve (CSV)', 'Export all (CSV)')}">${I('down')}</button><button class="iconbtn accent" data-a="add-athlete" aria-label="${t('Dodaj sportaša', 'Add athlete')}">${I('addp')}</button></div></div>
  <label class="search">${I('search')}<input id="athsearch" type="search" value="${esc(ui.search)}" placeholder="${t('Traži sportaša', 'Search athlete')}" autocomplete="off"></label>
  <div class="chips">${chip(t('Svi', 'All') + ' · ' + DB.athletes.length, null, !ui.group)}${DB.groups.map(g => chip(`${g} · ${DB.athletes.filter(a => a.group === g).length}`, g, ui.group === g)).join('')}<button class="chip" data-a="new-group" aria-label="${t('Nova grupa', 'New group')}">+ ${t('Grupa', 'Group')}</button></div>
  ${list.length ? `<div class="list">${list.map(a => `<button class="row" data-a="open-profile" data-id="${a.id}">${av(a)}<div class="main"><b>${esc(a.name)}</b><span>${esc(athleteSummary(a))}</span></div><span class="dim" style="width:18px">${I('chev')}</span></button>`).join('')}</div>`
    : `<div class="list empty">${I('people')}${DB.athletes.length ? t('Nema rezultata pretrage.', 'No matches.') : t('Još nema sportaša. Dodirni + za dodavanje.', 'No athletes yet. Tap + to add one.')}</div>`}
  </main>`;
}

function vResults() {
  const f = ui.resFilter;
  const list = DB.results.filter(r => !f || r.type === f).sort((a, b) => b.date.localeCompare(a.date));
  return `<main class="screen"><h1>${t('Rezultati', 'Results')}</h1>
  <div class="seg">${[null, ...TYPES].map(ty => `<button class="${f === ty ? 'on' : ''}" data-a="resfilter" data-v="${ty ?? ''}">${ty ? SHORT[ty] : t('Sve', 'All')}</button>`).join('')}</div>
  ${list.length ? `<div class="list">${list.map(resultRow).join('')}</div>` : `<div class="list empty">${I('chart')}${t('Još nema rezultata.', 'No results yet.')}</div>`}</main>`;
}

function vSettings() {
  const sel = (key, opts) => `<select data-set="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(S[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const secs = [0, 3, 5, 10].map(s => [s, s ? s + ' s' : t('Isključeno', 'Off')]);
  return `<main class="screen"><h1>${t('Postavke', 'Settings')}</h1>
  ${installCard()}
  <section class="sec"><p class="label">${t('Jezik', 'Language')}</p><div class="seg"><button class="${S.lang === 'hr' ? 'on' : ''}" data-a="setlang" data-v="hr">Hrvatski</button><button class="${S.lang === 'en' ? 'on' : ''}" data-a="setlang" data-v="en">English</button></div></section>
  <section class="sec"><p class="label">${t('Mjerenje i kamera', 'Measuring and camera')}</p><div class="form">
    <div class="frow"><span>${t('Zadani test', 'Default test')}</span>${sel('defaultType', TYPES.map(ty => [ty, SHORT[ty]]))}</div>
    <div class="frow"><span>${t('Pokušaja po testu', 'Attempts per test')}</span>${sel('attempts', [1, 2, 3, 4, 5, 6, 8, 10].map(n => [n, n]))}</div>
    <div class="frow"><span>${t('Odbrojavanje', 'Countdown')}</span>${sel('countdown', secs)}</div>
    <div class="frow"><span>${t('Automatski stop snimanja', 'Auto-stop recording')}</span>${sel('autoStop', [0, 4, 6, 8, 10, 15].map(s => [s, s ? s + ' s' : t('Isključeno', 'Off')]))}</div>
  </div></section>
  <section class="sec"><p class="label">${t('Podaci', 'Data')}</p><div class="form">
    <div class="frow"><span>${t('Izvezi sve rezultate (CSV)', 'Export all results (CSV)')}</span><button class="link" data-a="csv-all">${t('Izvezi', 'Export')}</button></div>
    <div class="frow"><span>${t('Sigurnosna kopija', 'Backup')}</span><button class="link" data-a="backup">${t('Spremi', 'Save')}</button></div>
    <div class="frow"><span>${t('Vrati iz sigurnosne kopije', 'Restore from backup')}</span><button class="link" data-a="restore">${t('Odaberi', 'Choose')}</button></div>
  </div><p class="note">${t('Podaci se čuvaju samo u ovom pregledniku na ovom uređaju. Redovito spremi sigurnosnu kopiju. Kopija je kompatibilna s iOS verzijom TP Jumpa.', 'Data is stored only in this browser on this device. Save a backup regularly. The backup is compatible with the iOS version of TP Jump.')}</p></section>
  <p class="foot">${t('Visina iz vremena leta: h = g·t²/8 · RSI = visina (m) / kontakt (s) · Snaga: Sayers (1999)', 'Height from flight time: h = g·t²/8 · RSI = height (m) / contact (s) · Power: Sayers (1999)')}<br>TP Jump web ${VERSION} · Team Performance</p>
  </main>`;
}

// ── profile
function vProfile(id) {
  const a = athlete(id);
  if (!a) return '';
  const all = resultsFor(id);
  const meta = [a.group, a.birthYear ? t('god. ', 'b. ') + a.birthYear : null, a.bodyMassKg ? num(a.bodyMassKg, 1).replace(/[,.]0$/, '') + ' kg' : null, t(`${all.length} skokova`, `${all.length} jumps`)].filter(Boolean).join(' · ');
  return `<main class="screen">
  <div class="bar"><button class="back" data-a="pop">${I('back')}<span>${t('Sportaši', 'Athletes')}</span></button><span></span><button class="iconbtn accent" data-a="edit-athlete" data-id="${id}" aria-label="${t('Uredi sportaša', 'Edit athlete')}">${I('edit')}</button></div>
  <div class="phead">${av(a)}<h2>${esc(a.name)}</h2><div class="small muted">${esc(meta)}</div></div>
  <div class="bests">${TYPES.map(ty => { const b = bestFor(id, ty); return `<div class="best"><span class="k" style="color:${TCOL[ty]}">${SHORT[ty]}</span><span class="d">${b ? (ty === 'dj' ? Frsi(b.rsi) : Fcm(b.heightCm)) : '—'}</span><small>${b ? (ty === 'dj' ? 'RSI · ' : 'cm · ') + fmtDate(b.date) : t('nema', 'none')}</small></div>`; }).join('')}</div>
  <section class="sec card"><div class="sec-head"><b>${t('Napredak', 'Progress')}</b><div class="seg" style="width:170px">${TYPES.map(ty => `<button class="${ui.chartType === ty ? 'on' : ''}" data-a="charttype" data-v="${ty}">${SHORT[ty]}</button>`).join('')}</div></div>
  <div class="chart" data-chart="${id}"></div></section>
  <div class="btns"><button class="btn" data-a="start" data-ath="${id}">${I('video')}${t('Novi test', 'New test')}</button>
  <div class="btnrow"><button class="btn sec2" data-a="pdf" data-id="${id}">${t('Izvještaj PDF', 'PDF report')}</button><button class="btn sec2" data-a="csv-one" data-id="${id}">${t('Izvezi CSV', 'Export CSV')}</button></div></div>
  <section class="sec"><p class="label">${t('Svi skokovi', 'All jumps')}</p>${all.length ? `<div class="list">${all.map(resultRow).join('')}</div>` : `<div class="list empty">${t('Još nema skokova', 'No jumps yet')}</div>`}</section>
  </main>`;
}
function dailyBest(aid, ty) {
  const m = new Map();
  resultsFor(aid, ty).forEach(r => { const k = r.date.slice(0, 10); if (!m.has(k) || score(r) > score(m.get(k))) m.set(k, r); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, r]) => ({ k, v: score(r) }));
}
function chartSVG(pts, W, H, color, light) {
  const pad = { l: 40, r: 14, t: 14, b: 26 };
  const vs = pts.map(p => p.v); let lo = Math.min(...vs), hi = Math.max(...vs);
  const span = hi - lo || Math.max(hi * 0.1, 1); lo -= span * 0.15; hi += span * 0.15;
  const x = i => pad.l + (pts.length === 1 ? (W - pad.l - pad.r) / 2 : i * (W - pad.l - pad.r) / (pts.length - 1));
  const y = v => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ink = light ? '#666' : '#8793AA', grid = light ? '#ddd' : '#22304A';
  const dig = pts[0].v < 10 ? 2 : 1;
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const lab = i => { const [yy, mm, dd] = pts[i].k.split('-'); return `${+dd}.${+mm}.`; };
  const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor((W - 60) / 56))));
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
  ${ticks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${grid}"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${ink}">${num(v, dig)}</text>`).join('')}
  <path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
  ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="${color}"/>${i % every === 0 || i === pts.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${ink}">${lab(i)}</text>` : ''}`).join('')}
  </svg>`;
}
function drawChart(el) {
  const ty = ui.chartType, pts = dailyBest(el.dataset.chart, ty);
  if (pts.length < 2) { el.innerHTML = `<div class="empty" style="padding-top:60px">${t('Graf se prikazuje kad postoje mjerenja iz barem 2 dana.', 'The chart appears once there are measurements from at least 2 days.')}</div>`; return; }
  el.innerHTML = chartSVG(pts, el.clientWidth || 320, el.clientHeight || 200, ({ cmj: '#FF7A1A', sj: '#4C9BFF', dj: '#3DD68C' })[ty]);
}

// ── result views
function resultBody(r) {
  const a = athlete(r.athleteID) || { id: r.athleteID, name: '—' };
  const prev = prevBest(r);
  let pill;
  if (prev == null) pill = `<span class="pill blue">${t('Prvo mjerenje ovog testa', 'First measurement of this test')}</span>`;
  else if (score(r) > prev) pill = `<span class="pill">${t('Osobni rekord', 'Personal best')} · +${r.type === 'dj' ? Frsi(score(r) - prev) : Fcm(score(r) - prev) + ' cm'}</span>`;
  else pill = `<span class="pill muted">${t('Najbolji dosad: ', 'Best so far: ')}${r.type === 'dj' ? Frsi(prev) : Fcm(prev) + ' cm'}</span>`;
  const tile = (l, v, u) => `<div class="tile ${v === '—' ? 'dash' : ''}"><span>${l}</span><b class="d">${v}</b><small>${u}</small></div>`;
  let tiles;
  if (r.type === 'dj') tiles = tile(t('Visina skoka', 'Jump height'), Fcm(r.heightCm), 'cm') + tile(t('Vrijeme kontakta', 'Contact time'), r.contactTime != null ? Fms(r.contactTime) : '—', 'ms') + tile(t('Vrijeme leta', 'Flight time'), Fms(r.flightTime), 'ms') + tile(t('Visina sanduka', 'Box height'), r.dropHeightCm != null ? num(r.dropHeightCm, 0) : '—', 'cm');
  else {
    tiles = tile(t('Vrijeme leta', 'Flight time'), Fms(r.flightTime), 'ms') + tile(t('Brzina odraza', 'Take-off velocity'), num(M.vel(r.heightCm), 2), 'm/s');
    const m = a.bodyMassKg;
    if (m > 0) { const p = M.sayers(r.heightCm, m); tiles += tile(t('Vršna snaga (Sayers)', 'Peak power (Sayers)'), num(p, 0), 'W') + tile(t('Relativna snaga', 'Relative power'), num(p / m, 1), 'W/kg'); }
    else tiles += tile(t('Vršna snaga', 'Peak power'), '—', t('unesi masu', 'add body mass')) + tile(t('Relativna snaga', 'Relative power'), '—', t('unesi masu', 'add body mass'));
  }
  return `<div class="hero"><div class="lab">${SHORT[r.type]} · ${esc(a.name)}${r.attempt ? ' · ' + t('pokušaj', 'attempt') + ' ' + r.attempt : ''}</div>
  <div class="num">${r.type === 'dj' ? Frsi(r.rsi) + '<small>RSI</small>' : Fcm(r.heightCm) + '<small>cm</small>'}</div>${pill}
  <div class="xs muted">${fmtDate(r.date, true)} · ${num(r.fps, 0)} fps</div></div><div class="tiles">${tiles}</div>`;
}
function sessionList(sid, planned, currentId) {
  const rs = inSession(sid);
  if (!rs.length) return '';
  const best = rs.reduce((m, r) => !m || score(r) > score(m) ? r : m, null);
  const n = Math.max(planned || 0, rs.length);
  let rows = '';
  for (let i = 1; i <= n; i++) {
    const r = rs.find(x => x.attempt === i) || (planned ? null : rs[i - 1]);
    if (r) rows += `<div class="att ${r === best && rs.length > 1 ? 'best' : ''}"><span class="n">${i}</span><div class="main"><b>${r.type === 'dj' ? 'RSI ' + Frsi(r.rsi) : Fcm(r.heightCm) + ' cm'}</b><span>${r.type === 'dj' ? Fcm(r.heightCm) + ' cm · ' + t('kontakt', 'contact') + ' ' + Fms(r.contactTime) + ' ms' : t('let', 'flight') + ' ' + Fms(r.flightTime) + ' ms'}${r === best && rs.length > 1 ? ' · ' + t('najbolji', 'best') : ''}</span></div>${r.id === currentId ? `<span class="xs" style="color:var(--accent)">●</span>` : ''}</div>`;
    else rows += `<div class="att"><span class="n" style="color:var(--dim)">${i}</span><div class="main"><span>${t('Još nije snimljen', 'Not recorded yet')}</span></div></div>`;
  }
  const avg = rs.reduce((s, r) => s + score(r), 0) / rs.length;
  if (rs.length > 1) rows += `<div class="att"><span class="n">⌀</span><div class="main"><b>${t('Prosjek', 'Average')}</b></div><b class="d">${rs[0].type === 'dj' ? Frsi(avg) : Fcm(avg) + ' cm'}</b></div>`;
  return `<section class="sec"><p class="label">${t('Pokušaji u ovom testu', 'Attempts in this test')}</p><div class="list">${rows}</div></section>`;
}
function vResultDetail(id) {
  const r = DB.results.find(x => x.id === id);
  if (!r) return '';
  return `<main class="screen"><div class="bar"><button class="back x" data-a="pop" aria-label="${t('Zatvori', 'Close')}">${I('x')}</button><div class="t"><b>${t('Rezultat', 'Result')}</b></div><button class="iconbtn accent" data-a="share" data-id="${id}" aria-label="${t('Podijeli rezultat', 'Share result')}">${I('share')}</button></div>
  ${resultBody(r)}${r.sessionID ? sessionList(r.sessionID, 0, r.id) : ''}
  <button class="btn danger" data-a="del-result" data-id="${id}">${I('trash')}${t('Obriši ovaj skok', 'Delete this jump')}</button></main>`;
}
function vFlowResult() {
  const r = DB.results.find(x => x.id === flow.resultID);
  if (!r) { flow = null; return vHome(); }
  const more = flow.saved.length < flow.planned;
  const next = flow.saved.length + 1;
  return `<main class="screen flow"><div class="bar"><button class="back x" data-a="finish" aria-label="${t('Zatvori', 'Close')}">${I('x')}</button><div class="t"><b>${t('Rezultat', 'Result')}</b></div><button class="iconbtn accent" data-a="share" data-id="${r.id}" aria-label="${t('Podijeli rezultat', 'Share result')}">${I('share')}</button></div>
  ${resultBody(r)}${sessionList(flow.sessionID, flow.planned, r.id)}
  <div class="btns">${more ? `<button class="btn" data-a="go-camera">${I('video')}${t(`Snimi pokušaj ${next}`, `Record attempt ${next}`)}</button><div class="btnrow"><button class="btn sec2" data-a="import">${I('photo')}${t('Uvezi video', 'Import video')}</button><button class="btn sec2" data-a="finish">${t('Završi test', 'Finish test')}</button></div>` : `<button class="btn" data-a="finish">${I('check')}${t('Završi test', 'Finish test')}</button>`}</div></main>`;
}

// ── setup
function vSetup() {
  const a = athlete(flow.athleteID);
  const cd = [0, 3, 5, 10];
  return `<main class="screen flow">
  <div class="bar"><button class="back x" data-a="finish" aria-label="${t('Zatvori', 'Close')}">${I('x')}</button><div class="t"><b>${t('Novi test', 'New test')}</b></div><span style="width:44px"></span></div>
  <button class="card ath" data-a="pick-athlete">${a ? av(a, 48) : `<div class="addav">${I('addp')}</div>`}<div class="main"><span>${t('Sportaš', 'Athlete')}</span><b>${a ? esc(a.name) : t('Odaberi sportaša', 'Choose athlete')}</b></div><span class="act">${a ? t('Promijeni', 'Change') : t('Odaberi', 'Choose')}</span></button>
  <section class="sec"><p class="label">${t('Test', 'Test')}</p>${TYPES.map(ty => `<button class="opt ${flow.type === ty ? 'on' : ''}" data-a="settype" data-v="${ty}"><span class="d">${SHORT[ty]}</span><div class="main"><b>${typeName(ty)}</b><span>${typeHint(ty, flow.dropHeight)}</span></div><span class="radio">${flow.type === ty ? I('check', 3.2) : ''}</span></button>`).join('')}</section>
  <div class="form">
    <div class="frow"><span>${t('Broj pokušaja', 'Attempts')}</span><div class="step"><button data-a="att" data-v="-1" aria-label="${t('Manje pokušaja', 'Fewer attempts')}">${I('minus', 3)}</button><span class="d">${flow.planned}</span><button data-a="att" data-v="1" aria-label="${t('Više pokušaja', 'More attempts')}">${I('plus', 3)}</button></div></div>
    <div class="frow"><span>${t('Odbrojavanje prije snimanja', 'Countdown before recording')}</span><select data-flow="countdown">${cd.map(s => `<option value="${s}" ${flow.countdown === s ? 'selected' : ''}>${s ? s + ' s' : t('Isključeno', 'Off')}</option>`).join('')}</select></div>
    ${flow.type === 'dj' ? `<div class="frow"><span>${t('Visina sanduka (cm)', 'Box height (cm)')}</span><input data-flow="dropHeight" type="number" inputmode="decimal" min="0" max="150" value="${flow.dropHeight}"></div>` : ''}
  </div>
  <p class="note">${t('Najtočnije: snimi skok kamerom mobitela u slow-motion načinu (120/240 fps) pa ga uvezi. Snimanje u pregledniku obično ide do 30–60 fps.', 'Most accurate: record the jump with the phone camera in slow-motion (120/240 fps) and import it. Recording in the browser usually reaches 30–60 fps.')}</p>
  ${flow.error ? `<p class="err">${esc(flow.error)}</p>` : ''}
  <div class="btns"><button class="btn" data-a="import" ${a ? '' : 'disabled'}>${I('photo')}${t('Uvezi video iz Galerije', 'Import video from gallery')}</button>
  <button class="btn sec2" data-a="go-camera" ${a ? '' : 'disabled'}>${I('video')}${t('Snimi u aplikaciji', 'Record in the app')}</button></div>
  </main>`;
}

// ───────────────────────── sheets & dialogs
function closeLayer() { layer.innerHTML = ''; }
function dialog(msg, okLabel, danger) {
  return new Promise(res => {
    layer.insertAdjacentHTML('beforeend', `<div class="dialog" id="dlg"><div class="box"><p>${esc(msg)}</p><div class="acts"><button data-r="0">${t('Odustani', 'Cancel')}</button><button class="${danger ? 'red' : 'go'}" data-r="1">${esc(okLabel)}</button></div></div></div>`);
    const d = $('#dlg');
    d.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b || e.target === d) { d.remove(); res(b ? b.dataset.r === '1' : false); } });
  });
}
function promptDlg(msg, ph) {
  return new Promise(res => {
    layer.insertAdjacentHTML('beforeend', `<div class="dialog" id="dlg"><form class="box"><p>${esc(msg)}</p><div class="field"><input id="dlgin" placeholder="${esc(ph)}" autocomplete="off"></div><div class="acts"><button type="button" data-r="0">${t('Odustani', 'Cancel')}</button><button class="go" data-r="1">${t('Dodaj', 'Add')}</button></div></form></div>`);
    const d = $('#dlg'), f = d.querySelector('form'), inp = $('#dlgin');
    setTimeout(() => inp.focus(), 50);
    f.addEventListener('submit', e => { e.preventDefault(); d.remove(); res(inp.value.trim()); });
    d.addEventListener('click', e => { if (e.target.closest('[data-r="0"]') || e.target === d) { d.remove(); res(null); } });
  });
}
let toastT;
function toast(msg) {
  const old = $('.toast'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="toast">${esc(msg)}</div>`);
  clearTimeout(toastT); toastT = setTimeout(() => { const x = $('.toast'); if (x) x.remove(); }, 2600);
}

function athleteSheet(id, onSaved) {
  const a = id ? athlete(id) : null;
  layer.innerHTML = `<div class="scrim" id="sheet"><div class="sheet" role="dialog"><div class="sh"><button data-s="cancel">${t('Odustani', 'Cancel')}</button><b>${a ? t('Uredi sportaša', 'Edit athlete') : t('Dodaj sportaša', 'Add athlete')}</b><button data-s="save" style="font-weight:700">${t('Spremi', 'Save')}</button></div>
  <form class="sb" id="af">
    <div class="field"><label for="f-name">${t('Ime i prezime', 'Name and surname')}</label><input id="f-name" value="${esc(a?.name)}" autocomplete="off" required></div>
    <div class="field"><label for="f-group">${t('Grupa', 'Group')}</label><select id="f-group"><option value="">${t('Bez grupe', 'No group')}</option>${DB.groups.map(g => `<option ${a?.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select><input id="f-newgroup" placeholder="${t('ili upiši novu grupu', 'or type a new group')}" autocomplete="off"></div>
    <div class="btnrow"><div class="field"><label for="f-year">${t('Godina rođenja', 'Year of birth')}</label><input id="f-year" type="number" inputmode="numeric" min="1930" max="2030" value="${a?.birthYear ?? ''}"></div>
    <div class="field"><label for="f-mass">${t('Tjelesna masa (kg)', 'Body mass (kg)')}</label><input id="f-mass" type="number" inputmode="decimal" step="0.1" min="0" max="250" value="${a?.bodyMassKg ?? ''}"></div></div>
    <p class="note">${t('Masa je potrebna za izračun snage (Sayers).', 'Body mass is needed for power (Sayers).')}</p>
    ${a ? `<button type="button" class="btn danger" data-s="delete">${I('trash')}${t('Obriši sportaša', 'Delete athlete')}</button>` : ''}
    <button type="submit" hidden></button>
  </form></div></div>`;
  const sh = $('#sheet');
  if (!a) setTimeout(() => $('#f-name').focus(), 80);
  const doSave = () => {
    const name = $('#f-name').value.trim();
    if (!name) { $('#f-name').focus(); return; }
    const group = $('#f-newgroup').value.trim() || $('#f-group').value || undefined;
    const y = parseInt($('#f-year').value, 10), m = parseFloat(String($('#f-mass').value).replace(',', '.'));
    const rec = Object.assign(a || { id: uuid(), createdAt: isoNow() }, { name, group, birthYear: isNaN(y) ? undefined : y, bodyMassKg: isNaN(m) || m <= 0 ? undefined : m });
    if (!a) DB.athletes.push(rec);
    if (group && !DB.groups.includes(group)) DB.groups.push(group);
    save(); closeLayer(); onSaved && onSaved(rec); render();
  };
  $('#af').addEventListener('submit', e => { e.preventDefault(); doSave(); });
  sh.addEventListener('click', async e => {
    if (e.target === sh) return closeLayer();
    const b = e.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 'cancel') closeLayer();
    else if (b.dataset.s === 'save') doSave();
    else if (b.dataset.s === 'delete' && await dialog(t('Obrisati sportaša i sve njegove rezultate?', 'Delete the athlete and all their results?'), t('Obriši', 'Delete'), true)) {
      DB.athletes = DB.athletes.filter(x => x.id !== a.id); DB.results = DB.results.filter(r => r.athleteID !== a.id); save();
      closeLayer(); ui.stack = ui.stack.filter(s => s.id !== a.id); render();
    }
  });
}

function pickerSheet() {
  let q = '';
  layer.innerHTML = `<div class="scrim" id="sheet"><div class="sheet"><div class="sh"><button data-s="close">${t('Zatvori', 'Close')}</button><b>${t('Odaberi sportaša', 'Choose athlete')}</b><span style="width:60px"></span></div><div class="sb">
  <label class="search">${I('search')}<input id="pq" type="search" placeholder="${t('Traži sportaša', 'Search athlete')}" autocomplete="off"></label>
  <div class="list"><button class="row" data-s="add"><div class="addav" style="width:36px;height:36px">${I('plus', 2.6)}</div><div class="main"><b style="color:var(--accent)">${t('Dodaj sportaša', 'Add athlete')}</b></div></button><div id="plist"></div></div></div></div></div>`;
  const draw = () => {
    const l = sortedAthletes().filter(a => !q || a.name.toLocaleLowerCase().includes(q));
    $('#plist').innerHTML = l.map(a => `<button class="row" data-s="pick" data-id="${a.id}">${av(a, 36)}<div class="main"><b>${esc(a.name)}</b>${a.group ? `<span>${esc(a.group)}</span>` : ''}</div>${flow.athleteID === a.id ? `<span style="color:var(--accent);width:20px">${I('check', 3)}</span>` : ''}</button>`).join('');
  };
  draw();
  $('#pq').addEventListener('input', e => { q = e.target.value.trim().toLocaleLowerCase(); draw(); });
  const sh = $('#sheet');
  sh.addEventListener('click', e => {
    if (e.target === sh) return closeLayer();
    const b = e.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 'close') closeLayer();
    else if (b.dataset.s === 'pick') { setAth(b.dataset.id); closeLayer(); render(); }
    else if (b.dataset.s === 'add') athleteSheet(null, rec => setAth(rec.id));
  });
}
function setAth(id) { if (flow) flow.athleteID = id; S.lastAthlete = id; saveS(); }

// ───────────────────────── files: CSV, backup, PDF, share
function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
function exportCSV(aid) {
  const hr = S.lang === 'hr', sep = hr ? ';' : ',';
  const n = (v, d) => v == null || isNaN(v) ? '' : (hr ? v.toFixed(d).replace('.', ',') : v.toFixed(d));
  const e = s => /[;,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [['athlete', 'group', 'date', 'test', 'attempt', 'jump_height_cm', 'flight_time_ms', 'contact_time_ms', 'rsi', 'drop_height_cm', 'takeoff_velocity_ms', 'peak_power_w', 'fps', 'note'].join(sep)];
  const rows = DB.results.filter(r => !aid || r.athleteID === aid).sort((a, b) => ((athlete(a.athleteID)?.name || '').localeCompare(athlete(b.athleteID)?.name || '')) || a.date.localeCompare(b.date));
  if (!rows.length) return toast(t('Nema rezultata za izvoz.', 'No results to export.'));
  for (const r of rows) {
    const a = athlete(r.athleteID); const d = new Date(r.date), p = x => String(x).padStart(2, '0');
    const pw = r.type !== 'dj' && a?.bodyMassKg > 0 ? M.sayers(r.heightCm, a.bodyMassKg) : null;
    lines.push([e(a?.name || '?'), e(a?.group || ''), `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`, SHORT[r.type], r.attempt ?? '', n(r.heightCm, 1), n(r.flightTime * 1000, 0), n(r.contactTime != null ? r.contactTime * 1000 : null, 0), n(r.rsi, 2), n(r.dropHeightCm, 0), n(M.vel(r.heightCm), 2), n(pw, 0), n(r.fps, 0), e(r.note || '')].join(sep));
  }
  const a = aid && athlete(aid);
  download(a ? `TPJump-${a.name.replace(/\s+/g, '_')}-${stamp()}.csv` : `TPJump-${stamp()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}
function backup() {
  const d = new Date().toISOString().slice(0, 10);
  download(`TPJump-backup-${d}.json`, JSON.stringify(clean({ athletes: DB.athletes, results: DB.results, groups: DB.groups }), null, 2), 'application/json');
}
function restore() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!Array.isArray(s.athletes) || !Array.isArray(s.results)) throw new Error('format');
      if (!await dialog(t('Zamijeniti sve podatke onima iz kopije?', 'Replace all data with the backup?'), t('Vrati podatke', 'Restore'), true)) return;
      applySnap(s); save(); render(); toast(t('Podaci su vraćeni.', 'Data restored.'));
    } catch { toast(t('Datoteka nije valjana sigurnosna kopija.', 'The file is not a valid backup.')); }
  };
  inp.click();
}
function shareText(r) {
  const a = athlete(r.athleteID);
  let s = `TP Jump · ${SHORT[r.type]} · ${a?.name || ''}\n${fmtDate(r.date, true)}\n` + t('Visina skoka', 'Jump height') + `: ${Fcm(r.heightCm)} cm\n` + t('Vrijeme leta', 'Flight time') + `: ${Fms(r.flightTime)} ms`;
  if (r.type === 'dj' && r.rsi != null) s += `\n` + t('Vrijeme kontakta', 'Contact time') + `: ${Fms(r.contactTime)} ms\nRSI: ${Frsi(r.rsi)}`;
  return s;
}
async function share(r) {
  const text = shareText(r);
  try { if (navigator.share) { await navigator.share({ title: 'TP Jump', text }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast(t('Rezultat kopiran.', 'Result copied.')); } catch { toast(text); }
}
function pdfReport(aid) {
  const a = athlete(aid); if (!a) return;
  const all = resultsFor(aid);
  const meta = [a.group, a.birthYear ? t('god. ', 'b. ') + a.birthYear : null, a.bodyMassKg ? num(a.bodyMassKg, 1) + ' kg' : null].filter(Boolean).join(' · ');
  let h = `<div class="hd"><div><h1>${esc(a.name)}</h1><div>${esc(meta)}</div></div><div style="text-align:right"><b>TP Jump</b><br>${fmtDate(new Date().toISOString(), 'y')}</div></div>`;
  h += `<div class="bx">${TYPES.map(ty => { const b = bestFor(aid, ty); return `<div>${SHORT[ty]} – ${t('najbolji', 'best')}<b>${b ? fmtScore(b) : '—'}</b>${b ? fmtDate(b.date, 'y') : ''}</div>`; }).join('')}</div>`;
  for (const ty of TYPES) {
    const rs = all.filter(r => r.type === ty); if (!rs.length) continue;
    const pts = dailyBest(aid, ty);
    h += `<h3>${ty === 'dj' ? 'DJ – RSI' : SHORT[ty] + ' – ' + t('visina (cm)', 'height (cm)')}</h3>`;
    if (pts.length >= 2) h += chartSVG(pts, 700, 150, '#FF7A1A', true);
    h += `<table><thead><tr><th>${t('Datum', 'Date')}</th><th class="n">#</th><th class="n">${t('Visina', 'Height')}</th><th class="n">${t('Let', 'Flight')}</th><th class="n">${t('Kontakt', 'Contact')}</th><th class="n">RSI</th></tr></thead><tbody>${rs.map(r => `<tr><td>${fmtDate(r.date, true)}</td><td class="n">${r.attempt ?? ''}</td><td class="n">${Fcm(r.heightCm)} cm</td><td class="n">${Fms(r.flightTime)} ms</td><td class="n">${r.contactTime != null ? Fms(r.contactTime) + ' ms' : ''}</td><td class="n">${r.rsi != null ? Frsi(r.rsi) : ''}</td></tr>`).join('')}</tbody></table>`;
  }
  h += `<div class="ft">${t('Visina iz vremena leta: h = g·t²/8 · RSI = visina (m) / kontakt (s) · Team Performance', 'Height from flight time: h = g·t²/8 · RSI = height (m) / contact (s) · Team Performance')}</div>`;
  $('#print').innerHTML = h;
  const old = document.title; document.title = `TPJump-${a.name.replace(/\s+/g, '_')}`;
  setTimeout(() => { try { window.print(); } catch { toast(t('Ispis nije podržan.', 'Printing is not supported.')); } document.title = old; }, 50);
}

// ───────────────────────── video import
const vidInput = document.createElement('input');
vidInput.type = 'file'; vidInput.accept = 'video/*';
vidInput.onchange = () => {
  const f = vidInput.files[0]; vidInput.value = '';
  if (!f || !flow) return;
  flow.file = f; flow.fpsHint = null; flow.error = ''; flow.stage = 'analyze'; render();
};

// ───────────────────────── frame analyzer
const FPS_OPTS = [25, 30, 50, 60, 100, 120, 200, 240, 480, 960];
const MARKS = { contact: { c: 'var(--purple)', l: 'K' }, takeoff: { c: 'var(--blue)', l: 'O' }, landing: { c: 'var(--green)', l: 'D' } };
const markName = m => ({ contact: t('Kontakt', 'Contact'), takeoff: t('Odraz', 'Take-off'), landing: t('Doskok', 'Landing') }[m]);
const snapFps = v => FPS_OPTS.reduce((b, x) => Math.abs(x - v) < Math.abs(b - v) ? x : b, 240);

function mp4Times(buf) {
  return new Promise((res, rej) => {
    if (!window.MP4Box) return rej(new Error('no mp4box'));
    const f = MP4Box.createFile();
    f.onError = e => rej(new Error(String(e)));
    f.onReady = info => {
      try {
        const vt = (info.videoTracks || [])[0];
        if (!vt) return rej(new Error('no video track'));
        const s = f.getTrackSamplesInfo(vt.id) || [];
        if (s.length < 2) return rej(new Error('no samples'));
        const ts = s.map(x => x.cts / x.timescale).sort((a, b) => a - b);
        res({ times: ts, width: vt.track_width || vt.video?.width, height: vt.track_height || vt.video?.height });
      } catch (e) { rej(e); }
    };
    buf.fileStart = 0;
    try { f.appendBuffer(buf); f.flush(); } catch (e) { rej(e); }
  });
}
const once = (el, ev, ms) => new Promise((res, rej) => {
  let to; const h = () => { clearTimeout(to); el.removeEventListener(ev, h); res(); };
  el.addEventListener(ev, h);
  if (ms) to = setTimeout(() => { el.removeEventListener(ev, h); rej(new Error('timeout ' + ev)); }, ms);
});
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
const nextFrameTime = (v, ms = 700) => new Promise(res => {
  if (!hasRVFC) return res(null);
  const to = setTimeout(() => res(null), ms);
  v.requestVideoFrameCallback((now, md) => { clearTimeout(to); res(md.mediaTime); });
});

const An = {
  active: false,
  async open(file) {
    const A = this;
    Object.assign(A, { active: true, file, times: null, idx: 0, fps: 240, cfps: 30, marks: {}, zoom: false, playing: false, target: null, seeking: false, thumbs: [], slowAsked: false, closed: false });
    const name = athlete(flow.athleteID)?.name || '';
    const nextN = flow.saved.length + 1;
    app.innerHTML = `<div class="an">
      <div class="bar"><button class="back" data-a="an-back" aria-label="${t('Natrag', 'Back')}">${I('back')}</button><div class="t"><b>${SHORT[flow.type]} · ${t('pokušaj', 'attempt')} ${nextN}/${flow.planned}</b><span>${esc(name)}</span></div><button class="iconbtn" data-a="an-help" style="color:var(--muted)" aria-label="${t('Pomoć', 'Help')}">${I('help')}</button></div>
      <div class="stage" id="stage"><video id="v" muted playsinline preload="auto" disablepictureinpicture></video>
        <div class="ov"><div><div class="mk" id="mk"></div><label class="chipb" id="fpsbox">${'<select id="fpssel" aria-label="fps"></select>'}</label></div>
        <div><span class="chipb d" id="flab" style="font-weight:600">—</span><span class="chipb" id="zlab">${t('Dvoklik = zoom', 'Double-tap = zoom')}</span></div></div></div>
      <div class="loading" id="anload"><div><div class="spin"></div><div id="anmsg">${t('Učitavam frameove…', 'Reading frames…')}</div></div></div>
      <div class="body hidden" id="anbody">
        <div id="slowmo"></div>
        <div class="tl" id="tl"><canvas id="tlc"></canvas><div class="ph" id="ph"></div><div id="dots"></div></div>
        <div class="steps"><button data-a="an-step" data-v="-10">−10</button><button data-a="an-step" data-v="-1">−1</button><button class="pl" data-a="an-play" id="plbtn" aria-label="${t('Reproduciraj usporeno', 'Play slow motion')}">${I('play')}</button><button data-a="an-step" data-v="1">+1</button><button data-a="an-step" data-v="10">+10</button></div>
        <div class="marks" id="marks"></div>
        <p class="note">${t('Odraz = prvi frame s oba stopala u zraku. Doskok = prvi frame dodira s podom. Povuci prstom po slici za pomicanje frame po frame.', 'Take-off = first frame with both feet in the air. Landing = first frame touching the ground. Swipe over the image to move frame by frame.')}${flow.type === 'dj' ? ' ' + t('Kontakt = prvi dodir s podom nakon saskoka.', 'Contact = first touch after the drop.') : ''}</p>
        <div class="res" id="res"></div>
        <button class="btn" data-a="an-save" id="ansave" disabled>${t('Spremi pokušaj', 'Save attempt')}</button>
      </div></div>`;
    A.v = $('#v'); A.url = URL.createObjectURL(file); A.v.src = A.url;
    $('#fpssel').innerHTML = FPS_OPTS.map(f => `<option value="${f}">${f} fps</option>`).join('');
    $('#fpssel').addEventListener('change', e => { A.fps = +e.target.value; A.slowAsked = true; A.update(); });
    A.v.addEventListener('seeked', () => A.onSeeked());
    try {
      await Promise.race([once(A.v, 'loadedmetadata'), new Promise((_, r) => A.v.addEventListener('error', () => r(new Error('decode')), { once: true }))]);
      if (!isFinite(A.v.duration)) { A.v.currentTime = 1e7; await once(A.v, 'durationchange', 5000).catch(() => {}); A.v.currentTime = 0; await once(A.v, 'seeked', 5000).catch(() => {}); }
      let times = null;
      if (file.size < 900e6 && /mp4|quicktime|3gp|m4v|mov/i.test(file.type + file.name)) {
        try { times = (await mp4Times(await file.arrayBuffer())).times; } catch (e) { console.warn('mp4box', e); }
      }
      if (A.closed) return;
      if (times) {
        // align container timestamps with the player's timeline using the first presented frame
        const t0 = times[0];
        A.v.currentTime = 0; await once(A.v, 'seeked', 4000).catch(() => {});
        const m0 = await nextFrameTime(A.v, 400);
        const base = m0 != null && m0 < 1 ? m0 : 0;
        times = times.map(x => x - t0 + base);
      } else times = await A.scan();
      if (A.closed) return;
      if (!times || times.length < 2) throw new Error('frames');
      A.times = times;
      const span = times[times.length - 1] - times[0];
      A.cfps = span > 0 ? (times.length - 1) / span : 30;
      A.fps = flow.fpsHint ? Math.round(flow.fpsHint) : snapFps(A.cfps);
      if (!FPS_OPTS.includes(A.fps)) $('#fpssel').insertAdjacentHTML('afterbegin', `<option value="${A.fps}">${A.fps} fps</option>`);
      if (flow.fpsHint || A.cfps > 75) A.slowAsked = true;
      $('#anload').remove(); $('#anbody').classList.remove('hidden');
      A.bind(); A.show(0); A.update(); A.makeThumbs();
    } catch (e) {
      console.error(e);
      if (A.closed) return;
      $('#anmsg').innerHTML = `<b style="color:var(--text)">${t('Video se ne može pročitati.', 'Could not read the video.')}</b><br>${t('Pokušaj s MP4 videom snimljenim kamerom mobitela.', 'Try an MP4 recorded with the phone camera.')}`;
      const sp = $('#anload .spin'); if (sp) sp.remove();
    }
  },
  async scan() {
    // Fallback (e.g. WebM): play slowly and collect the timestamp of every presented frame.
    const v = this.v;
    if (!hasRVFC) { const n = Math.max(2, Math.round(v.duration * 30)); return Array.from({ length: n }, (_, i) => i / 30); }
    $('#anmsg').textContent = t('Analiziram frameove…', 'Scanning frames…');
    const set = new Set(); v.currentTime = 0; await once(v, 'seeked', 5000).catch(() => {});
    v.playbackRate = 0.5;
    await new Promise(res => {
      const cb = (now, md) => { set.add(Math.round(md.mediaTime * 1e6) / 1e6); if (!v.ended && !this.closed) v.requestVideoFrameCallback(cb); };
      v.requestVideoFrameCallback(cb); v.addEventListener('ended', res, { once: true });
      v.play().catch(res);
    });
    v.pause(); v.playbackRate = 1;
    const raw = [...set].sort((a, b) => a - b);
    if (raw.length < 3) return raw;
    // fill frames the scan may have missed (the one on screen at t=0, or dropped while playing)
    const d = raw.slice(1).map((x, i) => x - raw[i]).sort((a, b) => a - b), dt = d[d.length >> 1];
    const ts = [];
    for (let x = raw[0] - dt; x >= dt * 0.5 - 1e-6; x -= dt) ts.unshift(x);
    if (raw[0] >= dt * 0.5) ts.unshift(0);
    raw.forEach((x, i) => { if (i) { const gap = x - raw[i - 1], k = Math.round(gap / dt); if (gap > 1.5 * dt) for (let j = 1; j < k; j++) ts.push(raw[i - 1] + j * gap / k); } ts.push(x); });
    return ts;
  },
  bind() {
    const A = this, st = $('#stage');
    let sx = null, sIdx = 0, moved = false, lastTap = 0;
    st.addEventListener('pointerdown', e => { sx = e.clientX; sIdx = A.idx; moved = false; st.setPointerCapture(e.pointerId); });
    st.addEventListener('pointermove', e => {
      if (sx == null) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 4) moved = true;
      if (moved) { A.stop(); A.show(sIdx + Math.round(dx / 6)); }
    });
    st.addEventListener('pointerup', e => {
      if (!moved) {
        const now = Date.now();
        if (now - lastTap < 320) {
          const r = st.getBoundingClientRect();
          A.zoom = !A.zoom;
          A.v.style.transformOrigin = `${((e.clientX - r.left) / r.width * 100).toFixed(1)}% ${((e.clientY - r.top) / r.height * 100).toFixed(1)}%`;
          A.v.style.transform = A.zoom ? 'scale(2.5)' : '';
          $('#zlab').textContent = A.zoom ? '2.5× zoom' : t('Dvoklik = zoom', 'Double-tap = zoom');
          lastTap = 0;
        } else lastTap = now;
      }
      sx = null;
    });
    st.addEventListener('pointercancel', () => { sx = null; });
    const tl = $('#tl');
    const tlMove = e => { const r = tl.getBoundingClientRect(); A.stop(); A.show(Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * (A.times.length - 1))); };
    let tlDown = false;
    tl.addEventListener('pointerdown', e => { if (e.target.closest('.dot')) return; tlDown = true; tl.setPointerCapture(e.pointerId); tlMove(e); });
    tl.addEventListener('pointermove', e => { if (tlDown) tlMove(e); });
    tl.addEventListener('pointerup', () => { tlDown = false; });
    A.ro = new ResizeObserver(() => A.drawTL()); A.ro.observe(tl);
    A.key = e => {
      if (e.target.matches('input,select')) return;
      if (e.key === 'ArrowLeft') { A.stop(); A.show(A.idx - (e.shiftKey ? 10 : 1)); e.preventDefault(); }
      if (e.key === 'ArrowRight') { A.stop(); A.show(A.idx + (e.shiftKey ? 10 : 1)); e.preventDefault(); }
      if (e.key === ' ') { A.toggle(); e.preventDefault(); }
    };
    document.addEventListener('keydown', A.key);
  },
  mid(i) { const T = this.times, n = T.length; const d = i < n - 1 ? T[i + 1] - T[i] : (T[n - 1] - T[0]) / (n - 1); return T[i] + d / 2; },
  show(i) {
    if (!this.times) return;
    i = clamp(i, 0, this.times.length - 1);
    this.idx = i; this.target = this.mid(i);
    if (!this.seeking) this.doSeek();
    this.update();
  },
  doSeek() { if (this.target == null) return; this.seeking = true; const tt = this.target; this.target = null; this.v.currentTime = tt; },
  onSeeked() { this.seeking = false; if (this.target != null && !this.playing) this.doSeek(); },
  nearest(time) {
    const T = this.times; let lo = 0, hi = T.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= time + 1e-6) lo = m; else hi = m - 1; }
    return lo;
  },
  toggle() { this.playing ? this.stop() : this.play(); },
  play() {
    const A = this, v = A.v;
    if (A.idx >= A.times.length - 1) A.show(0);
    A.playing = true; A.target = null;
    v.playbackRate = clamp(30 / A.cfps, 0.0625, 1);
    v.play().catch(() => A.stop());
    const loop = (now, md) => { if (!A.playing) return; A.idx = A.nearest(md.mediaTime); A.update(); v.requestVideoFrameCallback(loop); };
    if (hasRVFC) v.requestVideoFrameCallback(loop);
    else { const tick = () => { if (!A.playing) return; A.idx = A.nearest(v.currentTime); A.update(); requestAnimationFrame(tick); }; tick(); }
    v.onended = () => A.stop();
    A.update();
  },
  stop() {
    if (!this.playing) return;
    this.playing = false; this.v.pause();
    if (this.times) { this.idx = this.nearest(this.v.currentTime); this.show(this.idx); }
  },
  need() { return flow.type === 'dj' ? ['contact', 'takeoff', 'landing'] : ['takeoff', 'landing']; },
  calc() {
    const m = this.marks, fps = this.fps;
    const ft = m.takeoff != null && m.landing != null && m.landing > m.takeoff ? (m.landing - m.takeoff) / fps : null;
    const ct = flow.type === 'dj' && m.contact != null && m.takeoff != null && m.takeoff > m.contact ? (m.takeoff - m.contact) / fps : null;
    const h = ft != null ? M.height(ft) : null;
    const rsi = h != null && ct != null ? M.rsi(h, ct) : null;
    return { ft, ct, h, rsi, ok: flow.type === 'dj' ? rsi != null : h != null };
  },
  update() {
    const A = this; if (!A.times) return;
    const n = A.times.length;
    $('#flab').textContent = `Frame ${A.idx + 1} / ${n} · ${(A.idx / A.fps).toFixed(3)} s`;
    const sel = $('#fpssel'); if (+sel.value !== A.fps) sel.value = A.fps;
    $('#fpsbox').className = 'chipb ' + (A.fps >= 240 ? 'fpsok' : 'fpslow');
    $('#mk').innerHTML = A.need().filter(m => A.marks[m] === A.idx).map(m => `<span style="background:${MARKS[m].c}">${markName(m)}</span>`).join('');
    $('#plbtn').innerHTML = I(A.playing ? 'pause' : 'play');
    $('#ph').style.left = (A.idx / Math.max(n - 1, 1) * 100) + '%';
    $('#dots').innerHTML = A.need().filter(m => A.marks[m] != null).map(m => `<button class="dot" data-a="an-goto" data-v="${A.marks[m]}" style="left:${A.marks[m] / Math.max(n - 1, 1) * 100}%;background:${MARKS[m].c}" aria-label="${t('Idi na: ', 'Go to: ') + markName(m)}">${MARKS[m].l}</button>`).join('');
    $('#marks').innerHTML = A.need().map(m => { const f = A.marks[m], on = f != null; return `<button class="mb ${on ? 'on' : ''}" data-a="an-mark" data-v="${m}" style="color:${on ? 'var(--bg)' : MARKS[m].c};background:${on ? MARKS[m].c : `color-mix(in srgb, ${MARKS[m].c} 12%, transparent)`}"><b>${markName(m)}</b><span>${on ? 'frame ' + (f + 1) + (f === A.idx ? ' ✓' : '') : t('označi', 'mark')}</span></button>`; }).join('');
    const c = A.calc(), allMarked = A.need().every(m => A.marks[m] != null);
    const metric = (l, v, u, big, right) => `<div class="m ${big ? 'big' : ''}" style="${right ? 'text-align:right' : ''}"><span>${l}</span><b class="d">${v}</b>${u ? `<small>${u}</small>` : ''}</div>`;
    $('#res').innerHTML = (flow.type === 'dj'
      ? metric('RSI', c.rsi != null ? Frsi(c.rsi) : '—', '', true) + metric(t('Visina', 'Height'), c.h != null ? Fcm(c.h) : '—', 'cm') + metric(t('Kontakt', 'Contact'), c.ct != null ? Fms(c.ct) : '—', 'ms', false, true)
      : metric(t('Visina skoka', 'Jump height'), c.h != null ? Fcm(c.h) : '—', 'cm', true) + metric(t('Vrijeme leta', 'Flight time'), c.ft != null ? Fms(c.ft) : '—', 'ms', false, true))
      + (allMarked && !c.ok ? `<span class="warn">${t('Provjeri redoslijed oznaka', 'Check the order of the marks')}</span>` : '');
    $('#ansave').disabled = !c.ok;
    $('#slowmo').innerHTML = A.slowAsked ? '' : `<div class="slowmo"><div><b>${t(`Video je spremljen pri ${Math.round(A.cfps)} fps.`, `The video is stored at ${Math.round(A.cfps)} fps.`)}</b> ${t('Ako je snimljen u slow-motion načinu, odaberi stvarni fps snimanja – inače će visina biti pogrešna.', 'If it was recorded in slow motion, choose the real recording fps – otherwise the height will be wrong.')}</div><div class="q"><button data-a="an-fps" data-v="120">120 fps</button><button data-a="an-fps" data-v="240">240 fps</button><button data-a="an-fps" data-v="480">480 fps</button><button class="alt" data-a="an-fps" data-v="${snapFps(A.cfps)}">${t('Normalan video', 'Normal video')}</button></div></div>`;
  },
  drawTL() {
    const A = this, c = $('#tlc'); if (!c || !A.times) return;
    const dpr = devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    g.fillStyle = '#1E2A42'; g.fillRect(0, 0, W, H);
    const k = A.thumbs.length;
    if (k) { const w = W / k; A.thumbs.forEach((b, i) => { if (!b) return; const s = Math.max(w / b.width, H / b.height); const dw = b.width * s, dh = b.height * s; g.save(); g.beginPath(); g.rect(i * w, 0, w - 1, H); g.clip(); g.globalAlpha = 0.75; g.drawImage(b, i * w + (w - dw) / 2, (H - dh) / 2, dw, dh); g.restore(); }); }
    const n = A.times.length, x = f => f / Math.max(n - 1, 1) * W, m = A.marks;
    if (m.contact != null && m.takeoff > m.contact) { g.fillStyle = 'rgba(183,140,255,.3)'; g.fillRect(x(m.contact), 0, x(m.takeoff) - x(m.contact), H); }
    if (m.takeoff != null && m.landing > m.takeoff) { g.fillStyle = 'rgba(76,155,255,.3)'; g.fillRect(x(m.takeoff), 0, x(m.landing) - x(m.takeoff), H); }
  },
  async makeThumbs() {
    const A = this, v2 = document.createElement('video');
    v2.muted = true; v2.preload = 'auto'; v2.src = A.url;
    try {
      await once(v2, 'loadedmetadata', 8000);
      const n = A.times.length, K = 10;
      A.thumbs = new Array(K).fill(null);
      for (let i = 0; i < K && !A.closed; i++) {
        v2.currentTime = A.mid(Math.round(i * (n - 1) / (K - 1)));
        await once(v2, 'seeked', 5000);
        A.thumbs[i] = await createImageBitmap(v2, { resizeHeight: 80 }).catch(() => null);
        A.drawTL();
      }
    } catch (e) { console.warn('thumbs', e); }
    v2.removeAttribute('src'); v2.load();
  },
  mark(m) { this.stop(); this.marks[m] = this.idx; this.update(); this.drawTL(); },
  save() {
    const c = this.calc(); if (!c.ok || !flow.athleteID) return;
    const r = clean({ id: uuid(), athleteID: flow.athleteID, type: flow.type, date: isoNow(), flightTime: c.ft, contactTime: c.ct ?? undefined, dropHeightCm: flow.type === 'dj' ? flow.dropHeight : undefined, fps: this.fps, heightCm: c.h, rsi: c.rsi ?? undefined, sessionID: flow.sessionID, attempt: flow.saved.length + 1 });
    DB.results.push(r); save();
    flow.saved.push(r.id); flow.resultID = r.id; flow.stage = 'result'; flow.file = null;
    render();
  },
  close() {
    const A = this; A.active = false; A.closed = true; A.playing = false;
    try { A.v.pause(); A.v.removeAttribute('src'); A.v.load(); } catch {}
    if (A.url) URL.revokeObjectURL(A.url);
    if (A.ro) A.ro.disconnect();
    if (A.key) document.removeEventListener('keydown', A.key);
    A.thumbs = []; A.times = null;
  }
};

// ───────────────────────── in-app camera
const Cam = {
  active: false,
  async open() {
    const C = this;
    Object.assign(C, { active: true, rec: null, chunks: [], timer: null, cd: null, stream: null, closed: false });
    app.innerHTML = `<div class="cam"><video id="cv" playsinline muted autoplay></video>
      <div class="guide"><span>${t('stopala unutar kadra', 'keep feet in frame')}</span></div><div class="count hidden" id="cnt"></div>
      <div class="ov"><div class="topr"><button class="iconbtn" data-a="cam-close" style="background:rgba(0,0,0,.5);border-radius:50%" aria-label="${t('Zatvori', 'Close')}">${I('x')}</button><span class="chipb" id="cinfo">…</span></div>
      <div class="bot"><span class="chipb" id="chint">${t('Kamera bočno, u visini stopala, mobitel na stativu', 'Camera side-on at foot height, phone on a tripod')}</span>
      <button class="rec" id="recbtn" data-a="cam-rec" aria-label="${t('Snimi', 'Record')}"><i></i></button>
      <button class="chipb" data-a="import" style="font-size:13px">${t('ili uvezi video', 'or import a video')}</button></div></div></div>`;
    const tries = [
      { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 240, min: 90 } },
      { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 120 } },
      { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
      {}
    ];
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('nogum');
      let s = null;
      for (const c of tries) { try { s = await navigator.mediaDevices.getUserMedia({ audio: false, video: Object.assign({ facingMode: { ideal: 'environment' } }, c) }); break; } catch {} }
      if (!s) throw new Error('nocam');
      if (C.closed) { s.getTracks().forEach(x => x.stop()); return; }
      C.stream = s;
      const tr = s.getVideoTracks()[0];
      try { const cap = tr.getCapabilities?.(); const cur = tr.getSettings().frameRate || 0; if (cap?.frameRate?.max > cur) await tr.applyConstraints({ frameRate: { ideal: cap.frameRate.max } }); } catch {}
      const st = tr.getSettings();
      C.fps = Math.round(st.frameRate || 30);
      $('#cv').srcObject = s;
      $('#cinfo').innerHTML = `<span style="color:${C.fps >= 120 ? 'var(--green)' : 'var(--accent)'}">${C.fps} fps</span> · ${st.width || '?'}×${st.height || '?'}`;
      if (C.fps < 100) $('#chint').textContent = t(`Preglednik daje samo ${C.fps} fps – za točnost uvezi slow-motion video.`, `The browser only gives ${C.fps} fps – for accuracy import a slow-motion video.`);
    } catch (e) {
      $('#cinfo').textContent = t('Kamera nije dostupna', 'Camera unavailable');
      $('#chint').textContent = t('Dopusti pristup kameri ili uvezi video iz Galerije.', 'Allow camera access or import a video from the gallery.');
    }
  },
  toggle() {
    const C = this;
    if (C.rec) return C.stopRec();
    if (C.cd || !C.stream) return;
    const go = () => C.startRec();
    let n = flow.countdown;
    if (!n) return go();
    const el = $('#cnt'); el.classList.remove('hidden'); el.textContent = n;
    C.cd = setInterval(() => { n--; if (n <= 0) { clearInterval(C.cd); C.cd = null; el.classList.add('hidden'); go(); } else el.textContent = n; }, 1000);
  },
  startRec() {
    const C = this;
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = types.find(x => window.MediaRecorder && MediaRecorder.isTypeSupported(x)) || '';
    try { C.rec = new MediaRecorder(C.stream, { mimeType: mime || undefined, videoBitsPerSecond: 16e6 }); } catch { C.rec = new MediaRecorder(C.stream); }
    C.chunks = [];
    C.rec.ondataavailable = e => { if (e.data.size) C.chunks.push(e.data); };
    C.rec.onstop = () => {
      const type = C.rec.mimeType || mime || 'video/webm';
      const file = new File(C.chunks, 'snimka.' + (type.includes('mp4') ? 'mp4' : 'webm'), { type });
      C.rec = null;
      if (!flow || C.closed) return;
      flow.file = file; flow.fpsHint = C.fps; flow.stage = 'analyze'; render();
    };
    C.rec.start(250);
    $('#recbtn').classList.add('on');
    const t0 = Date.now();
    C.timer = setInterval(() => { const s = (Date.now() - t0) / 1000; $('#cinfo').innerHTML = `<span style="color:var(--red)">●</span> ${s.toFixed(1)} s · ${C.fps} fps`; if (S.autoStop && s >= S.autoStop) C.stopRec(); }, 100);
  },
  stopRec() { clearInterval(this.timer); this.timer = null; if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); },
  close() {
    const C = this; C.active = false; C.closed = true;
    clearInterval(C.timer); clearInterval(C.cd);
    if (C.rec && C.rec.state !== 'inactive') { C.rec.onstop = null; C.rec.stop(); }
    if (C.stream) C.stream.getTracks().forEach(x => x.stop());
    C.stream = null;
  }
};

// ───────────────────────── actions
const A = {
  tab: el => { ui.tab = el.dataset.v; ui.stack = []; render(); scrollTo(0, 0); },
  start: el => { flow = newFlow(el.dataset.type, el.dataset.ath); render(); scrollTo(0, 0); },
  lang: () => { S.lang = S.lang === 'hr' ? 'en' : 'hr'; saveS(); document.documentElement.lang = S.lang; render(); },
  setlang: el => { S.lang = el.dataset.v; saveS(); document.documentElement.lang = S.lang; render(); },
  install: async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; render(); },
  'hide-install': () => { LS.set('tpjump-hide-install', true); render(); },
  'open-result': el => { ui.stack.push({ k: 'result', id: el.dataset.id }); render(); scrollTo(0, 0); },
  'open-profile': el => { ui.stack.push({ k: 'profile', id: el.dataset.id }); render(); scrollTo(0, 0); },
  pop: () => { ui.stack.pop(); render(); },
  group: el => { ui.group = el.dataset.v || null; render(); },
  'new-group': async () => { const n = await promptDlg(t('Nova grupa', 'New group'), t('npr. U19', 'e.g. U19')); if (n && !DB.groups.includes(n)) { DB.groups.push(n); save(); } if (n) ui.group = n; render(); },
  'add-athlete': () => athleteSheet(null),
  'edit-athlete': el => athleteSheet(el.dataset.id),
  resfilter: el => { ui.resFilter = el.dataset.v || null; render(); },
  charttype: el => { ui.chartType = el.dataset.v; render(); },
  'csv-all': () => exportCSV(null),
  'csv-one': el => exportCSV(el.dataset.id),
  pdf: el => pdfReport(el.dataset.id),
  backup, restore,
  share: el => { const r = DB.results.find(x => x.id === el.dataset.id); if (r) share(r); },
  'del-result': async el => { if (await dialog(t('Obrisati ovaj skok?', 'Delete this jump?'), t('Obriši', 'Delete'), true)) { DB.results = DB.results.filter(r => r.id !== el.dataset.id); save(); ui.stack.pop(); render(); } },
  // flow
  finish: () => { if (flow && flow.saved.length) ui.tab = 'results'; flow = null; ui.stack = []; render(); scrollTo(0, 0); },
  'pick-athlete': () => pickerSheet(),
  settype: el => { flow.type = el.dataset.v; render(); },
  att: el => { flow.planned = clamp(flow.planned + +el.dataset.v, 1, 10); render(); },
  import: () => { if (flow && flow.athleteID) vidInput.click(); },
  'go-camera': () => { if (!flow.athleteID) return; flow.stage = 'camera'; render(); },
  'cam-close': () => { flow.stage = flow.saved.length ? 'result' : 'setup'; render(); },
  'cam-rec': () => Cam.toggle(),
  'an-back': () => { flow.stage = flow.saved.length ? 'result' : 'setup'; flow.file = null; render(); },
  'an-help': () => toast(t('Odraz = prvi frame s oba stopala u zraku · Doskok = prvi frame dodira s podom', 'Take-off = first frame with both feet in the air · Landing = first frame touching the ground')),
  'an-step': el => { An.stop(); An.show(An.idx + +el.dataset.v); },
  'an-play': () => An.toggle(),
  'an-mark': el => An.mark(el.dataset.v),
  'an-goto': el => { An.stop(); An.show(+el.dataset.v); },
  'an-fps': el => { An.fps = +el.dataset.v; An.slowAsked = true; An.update(); },
  'an-save': () => An.save()
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const f = A[el.dataset.a]; if (f) f(el);
});
app.addEventListener('input', e => {
  if (e.target.id === 'athsearch') { ui.search = e.target.value; ui._focusSearch = true; render(); }
  if (e.target.dataset.flow === 'dropHeight') { const v = parseFloat(e.target.value); if (!isNaN(v)) { flow.dropHeight = v; S.dropHeight = v; saveS(); } }
});
app.addEventListener('change', e => {
  const k = e.target.dataset.set;
  if (k) { S[k] = k === 'defaultType' ? e.target.value : +e.target.value; saveS(); toast(t('Spremljeno', 'Saved')); }
  if (e.target.dataset.flow === 'countdown') flow.countdown = +e.target.value;
  if (e.target.dataset.flow === 'dropHeight') render();
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (!flow) render(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; toast(t('TP Jump je instaliran.', 'TP Jump is installed.')); if (!flow) render(); });
let rT; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => document.querySelectorAll('[data-chart]').forEach(drawChart), 150); });
window.addEventListener('beforeunload', e => { if (flow && (flow.stage === 'analyze' || flow.stage === 'camera')) { e.preventDefault(); e.returnValue = ''; } });

// ───────────────────────── service worker
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast(t('Nova verzija je spremna – zatvori i ponovno otvori aplikaciju.', 'A new version is ready – close and reopen the app.')); });
    });
  }).catch(() => {});
}

document.documentElement.lang = S.lang;
window.TPJ = { DB, M, An };
render();
}
