// Waldwacht – Editor für Dungeons, Räume, Objekte, Gegner, Gegnerarten und Kristalltypen.
// Wird vom Spiel erst geladen, wenn im Menü „EDITOR“ gewählt wird, und nutzt dessen Daten, Grafik und Funktionen
// (DATEN, baueHintergrund, zeichneBild, Sprites, GEGNERBILD, pruefeDaten, uebernehmeEigene, starteDungeon …).
// Gespeichert wird im Browser (localStorage, EIGENE_SCHLUESSEL) im selben JSON-Format wie der Block spieldaten:
//   { format: 1, dungeons: { id: dungeon }, gegnerarten: { id: gegnerart }, kristalltypen: { id: kristalltyp } }
// Räume im Editor-Format: karte nur mit Gelände (# . ~), Objekte und Gegner als Listen mit feld [spalte, zeile],
// dazu pos [x, y] für die Dungeon-Karte. Eingebaute Dungeons lassen sich als Kopie übernehmen (werden dabei umgewandelt).
'use strict';
const Editor = (() => {
  // ---------- Zustand ----------
  let offen = false, wurzel = null, eigene = ladeEigene(), rueckgaengig = [];
  const Z = {
    ansicht: 'dungeon',            // dungeon | gegner | kristalle
    dungeon: null, raum: null,
    werkzeug: { art: 'kachel', wert: '#' },   // bei Objekten optional vorlage: Einstellungen für neu gesetzte
    form: 'pinsel',                // pinsel | rechteck (Umschalt hält Rechteck)
    auswahl: null,                 // { liste: 'objekte' | 'gegner', i }
    gegnerArt: null, kristallTyp: null,
    maus: null, malt: false, rechteck: null,
    fuellen: { hindernisse: 'mittel', buesche: true, abgruende: false, gegner: 3, arten: ['fuchs'], auto: true },
  };
  try { Object.assign(Z.fuellen, JSON.parse(localStorage.getItem('waldwacht.editor') || '{}')); } catch (e) { /* Voreinstellung */ }

  const LICHT = ['hell', 'daemmrig', 'dunkel', 'finster'];
  const TUERARTEN = { keine: 'keine', offen: 'offen', schloss: 'Schloss', kampf: 'Kampf (offen, wenn geräumt)', bedingung: 'Bedingung' };
  const RICHTUNGSNAME = { n: 'Norden', o: 'Osten', s: 'Süden', w: 'Westen' };
  const GRUNDBILDER = { fuchs: { fuss: [11, 6], koerper: [26, 20] }, hase: { fuss: [8, 5], koerper: [18, 16] }, huhn: { fuss: [8, 5], koerper: [18, 18] } };
  // Einstellungen je Objekt, abhängig von den Eigenschaften seiner Art: [name, typ, Beschriftung, Erklärung]
  const PARAMETER = {
    lesbar: [['text', 'lang', 'Text', 'Erscheint, wenn der Held davorsteht und Aktion drückt.']],
    oeffnbar: [['inhalt', 'gegenstand', 'Inhalt']],
    platte: [
      ['signal', 'signalname', 'Signal (Name)', 'Unter diesem Namen fragen Türen, Fackeln und Objekte die Platte ab. Mehrere Platten mit demselben Namen: eine genügt.'],
      ['wer', { block: 'nur ein Block', alle: 'Block, Held oder Gegner' }, 'Wer drückt sie?'],
      ['merken', { '': 'nur solange etwas daraufsteht', '1': 'einmal drücken genügt – bleibt unten' }, 'Wirkung',
        'Bleibt sie unten, gilt ihr Signal danach im ganzen Dungeon. Sonst nur, solange man im Raum ist und etwas daraufsteht.'],
    ],
    kristall: [['kristalltyp', 'kristalltyp', 'Kristalltyp', 'Ein Schwertschlag schaltet alle Kristalle dieses Typs eine Farbe weiter – im ganzen Dungeon.']],
    pflock: [['kristalltyp', 'kristalltyp', 'Kristalltyp'], ['farbe', 'pflockfarbe', 'Oben bei Farbe', 'Der Pflock steht oben (versperrt den Weg), solange sein Kristalltyp diese Farbe zeigt.']],
    leuchtet: [['an_wenn', 'brennt', 'Brennt'], ['merken', 'janein', 'einmal entzündet = brennt weiter']],
  };
  const VORGABE = {
    schild: { text: 'Text des Schilds' }, truhe: { inhalt: 'schluessel' }, platte: { signal: 'platte', wer: 'block' },
    kristall: { kristalltyp: 'kristall' }, pflock: { kristalltyp: 'kristall', farbe: 'blau' },
  };
  const KACHELZEICHEN = Object.fromEntries(Object.entries(DATEN.kacheln).map(([ch, art]) => [art, ch]));

  // ---------- Hilfen ----------
  const $ = sel => wurzel.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const kopie = o => JSON.parse(JSON.stringify(o));
  const dg = () => eigene.dungeons[Z.dungeon];
  const raum = () => dg() && dg().raeume[Z.raum];
  const innen = (c, r) => c >= 1 && c <= SPALTEN - 2 && r >= 2 && r <= ZEILEN - 2;
  const zufallAus = liste => liste[Math.floor(Math.random() * liste.length)];
  function slug(t) {
    return t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'neu';
  }
  const ohneFeld = o => { const { feld, ...rest } = o; return kopie(rest); };
  const bildUrl = (() => { const cache = new WeakMap(); return c => { if (!cache.has(c)) cache.set(c, c.toDataURL()); return cache.get(c); }; })();
  const farbName = f => (KFARBEN[f] || { name: f }).name;
  const typText = id => { const k = kristallTyp(id); return `${k.name} (${k.farben.map(farbName).join(' → ')})`; };

  // ---------- Bedingungen als Formular ----------
  // Darstellbar sind: immer · ein Signal · mehrere, verknüpft mit „alle“ oder „eines“, jedes auch verneint.
  // Tiefer Verschachteltes bleibt erhalten und ist nur über „Erweitert“ (JSON) änderbar.
  function zerlege(b) {
    if (b === undefined || b === null) return { modus: 'immer', verkn: 'alle', teile: [] };
    const teil = x => typeof x === 'string' ? { s: x, nicht: false }
      : x && typeof x.nicht === 'string' && Object.keys(x).length === 1 ? { s: x.nicht, nicht: true } : null;
    if (teil(b)) return { modus: 'wenn', verkn: 'alle', teile: [teil(b)] };
    for (const verkn of ['alle', 'eine']) if (Array.isArray(b[verkn]) && Object.keys(b).length === 1 && b[verkn].every(teil)) return { modus: 'wenn', verkn, teile: b[verkn].map(teil) };
    return null;
  }
  function baueBedingung(z) {
    if (z.modus !== 'wenn' || !z.teile.length) return undefined;
    const t = z.teile.map(x => x.nicht ? { nicht: x.s } : x.s);
    return t.length === 1 ? t[0] : { [z.verkn]: t };
  }
  // Signale, die in diesem Dungeon ausgelöst werden – zur Auswahl, gruppiert und erklärt
  function signalOptionen(dazu = []) {
    const d = DATEN.dungeons[Z.dungeon], { quellen } = d ? dungeonSignale(DATEN, d) : { quellen: {} }, nrVon = id => (dg().raeume[id] || {}).nr || id;
    const gruppen = { 'Raum': [['geraeumt', 'Raum geräumt (keine Gegner mehr)']], 'Platten': [], 'Kristalle': [], 'Gegner': [], 'Ereignisse': [], 'Nirgends ausgelöst (Tippfehler?)': [] };
    for (const [name, wo] of Object.entries(quellen)) {
      if (wo[0].art === 'platte') gruppen.Platten.push([name, `Platte „${name}“ gedrückt (Raum ${[...new Set(wo.map(w => nrVon(w.raum)))].join(', ')})`]);
      else if (wo[0].art === 'ereignis') gruppen.Ereignisse.push([name, `„${name}“ (von einem Ereignis gesetzt)`]);
      else if (wo[0].art === 'gegner') gruppen.Gegner.push([name, `„${name}“ besiegt (${[...new Set(wo.map(w => w.gegner))].join(', ')}, Raum ${[...new Set(wo.map(w => nrVon(w.raum)))].join(', ')})`]);
    }
    for (const [id, k] of Object.entries(DATEN.kristalltypen)) for (const f of k.farben) gruppen.Kristalle.push([id + '=' + f, `Kristall ${k.name} zeigt ${farbName(f)}`]);
    const bekannt = new Set(Object.values(gruppen).flat().map(o => o[0]));
    for (const s of dazu) if (s && !bekannt.has(s)) { gruppen['Nirgends ausgelöst (Tippfehler?)'].push([s, s]); bekannt.add(s); }
    return gruppen;
  }
  function bedingungsFormular(schluessel, b, { nie = false, istNie = false } = {}) {
    const z = zerlege(b);
    if (!z) return `<div class="bed"><p class="klein">Verschachtelte Bedingung – nur unter „Erweitert“ (Raum als JSON) änderbar:</p><code>${esc(JSON.stringify(b))}</code></div>`;
    const modus = istNie ? 'nie' : z.modus, gruppen = signalOptionen(z.teile.map(t => t.s));
    const optionen = wert => Object.entries(gruppen).filter(([, l]) => l.length).map(([g, l]) =>
      `<optgroup label="${esc(g)}">${l.map(([w, txt]) => `<option value="${esc(w)}"${w === wert ? ' selected' : ''}>${esc(txt)}</option>`).join('')}</optgroup>`).join('') +
      '<option value="@neu">＋ neues Signal (Name eingeben) …</option>';
    const modi = { immer: 'immer', ...(nie ? { nie: 'nie' } : {}), wenn: 'nur wenn …' };
    return `<div class="bed" data-bed="${schluessel}">
      <select data-bm>${Object.entries(modi).map(([k, v]) => `<option value="${k}"${k === modus ? ' selected' : ''}>${v}</option>`).join('')}</select>
      ${modus === 'wenn' ? z.teile.map((t, i) => `<div class="bteil">
        <select data-bs>${optionen(t.s)}</select>
        <select data-bn><option value="">gilt</option><option value="nicht"${t.nicht ? ' selected' : ''}>gilt nicht</option></select>
        <button data-a="bedweg" data-i="${i}" title="Zeile entfernen">×</button></div>`).join('') +
        (z.teile.length > 1 ? `<select data-bv><option value="alle"${z.verkn === 'alle' ? ' selected' : ''}>alle Zeilen müssen gelten</option><option value="eine"${z.verkn === 'eine' ? ' selected' : ''}>eine Zeile genügt</option></select>` : '') +
        '<button data-a="bedplus">＋ weitere Zeile</button>' : ''}</div>`;
  }
  function liesBedingung(div) {   // Formular → { modus, verkn, teile }; leeres „nur wenn“ bekommt eine erste Zeile
    const modus = div.querySelector('[data-bm]').value, v = div.querySelector('[data-bv]');
    const teile = modus === 'wenn' ? [...div.querySelectorAll('.bteil')].map(z => ({ s: z.querySelector('[data-bs]').value, nicht: z.querySelector('[data-bn]').value === 'nicht' })) : [];
    if (modus === 'wenn' && !teile.length) teile.push({ s: 'geraeumt', nicht: false });
    return { modus, verkn: v ? v.value : 'alle', teile };
  }
  function schreibeBedingung(div, aendern) {
    const z = liesBedingung(div), neu = z.teile.find(t => t.s === '@neu');
    if (neu) {
      const name = signalName(prompt('Name des Signals (z. B. tor-offen). Eine Platte oder ein Ereignis muss es auslösen:', ''));
      if (!name) { renderRechts(); return; }
      neu.s = name;
    }
    aendern && aendern(z);
    const [bereich, k] = div.dataset.bed.split('.'), r = raum();
    if (bereich === 'tuer') {   // setzeTuer merkt sich den alten Stand selbst
      const b = baueBedingung(z);
      setzeTuer(k, b === undefined ? 'offen' : 'bedingung', b, r.tueren[k] && r.tueren[k].merken); return;
    }
    merke();
    const a = r[Z.auswahl.liste][Z.auswahl.i];
    if (k === 'an_wenn') { if (z.modus === 'nie') a.an = false; else delete a.an; }
    const b = baueBedingung(z);
    if (b === undefined) delete a[k]; else a[k] = b;
    vorlageAus(a); aenderung(); renderRechts();
  }
  const signalName = t => (t || '').trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

  // ---------- Speichern, Rückgängig ----------
  function merke() { rueckgaengig.push(JSON.stringify(eigene)); if (rueckgaengig.length > 60) rueckgaengig.shift(); }
  function speichern() {
    try { localStorage.setItem(EIGENE_SCHLUESSEL, JSON.stringify(eigene)); } catch (e) { alert('Speichern im Browser fehlgeschlagen: ' + e.message); }
    try { localStorage.setItem('waldwacht.editor', JSON.stringify(Z.fuellen)); } catch (e) { /* egal */ }
    uebernehmeEigene(eigene, true);
    if (Z.dungeon) vergissHintergruende(Z.dungeon);
  }
  function aenderung() { speichern(); zeichneRaum(); zeichneKarte(); zeigeWarnungen(); }
  function zurueck() {
    if (!rueckgaengig.length) return;
    eigene = JSON.parse(rueckgaengig.pop());
    if (!dg()) Z.dungeon = Object.keys(eigene.dungeons)[0] || null;
    if (dg() && !raum()) Z.raum = Object.keys(dg().raeume)[0];
    Z.auswahl = null; speichern(); render();
  }

  // ---------- Räume und Dungeons anlegen ----------
  const rahmenKarte = () => Array.from({ length: ZEILEN }, (_, r) => r <= 1 || r === ZEILEN - 1 ? '#'.repeat(SPALTEN) : '#' + '.'.repeat(SPALTEN - 2) + '#');
  function neueRaumId(d) { let n = 1; while (d.raeume['r' + n]) n++; return 'r' + n; }
  function leererRaum(nr, pos) { return { nr: String(nr), titel: 'RAUM ' + nr, licht: 'hell', pos, tueren: {}, karte: rahmenKarte(), objekte: [], gegner: [] }; }
  function sortiere(r) { const k = (a, b) => a.feld[1] - b.feld[1] || a.feld[0] - b.feld[0]; r.objekte.sort(k); r.gegner.sort(k); }
  function normalisiereRaum(r) {   // Legenden-Zeichen in Listen umwandeln (Editor-Format)
    const legende = { ...DATEN.zeichen, ...(r.zeichen || {}) }, objekte = [], gegner = [];
    r.karte = r.karte.map((zeile, y) => [...zeile].map((ch, x) => {
      if (DATEN.kacheln[ch] !== undefined) return ch;
      const e = legende[ch];
      if (e && e.objekt) objekte.push({ ...e, feld: [x, y] });
      else if (e && e.gegner) gegner.push({ gegner: e.gegner, feld: [x, y] });
      return '.';
    }).join(''));
    r.objekte = [...objekte, ...(r.objekte || [])]; r.gegner = [...gegner, ...(r.gegner || [])];
    delete r.zeichen; sortiere(r);
  }
  function setzePositionen(d) {   // Lage auf der Dungeon-Karte aus den Türen ableiten
    const pos = { [d.start.raum]: [0, 0] }, offen = [d.start.raum];
    while (offen.length) {
      const id = offen.shift();
      for (const [dir, t] of Object.entries(d.raeume[id].tueren)) if (d.raeume[t.ziel] && !pos[t.ziel]) {
        pos[t.ziel] = [pos[id][0] + RICHTUNG[dir][0], pos[id][1] + RICHTUNG[dir][1]]; offen.push(t.ziel);
      }
    }
    let x = Math.max(0, ...Object.values(pos).map(p => p[0])) + 2;
    for (const [id, r] of Object.entries(d.raeume)) r.pos = pos[id] || [x++, 0];
  }
  function neuerDungeon() {
    const titel = prompt('Name des neuen Dungeons:', 'MEIN DUNGEON');
    if (!titel) return;
    merke();
    const id = 'eigen-' + Date.now().toString(36);
    eigene.dungeons[id] = { titel: titel.toUpperCase(), untertitel: '', start: { raum: 'r1', feld: [9.5, 8.5] }, raeume: { r1: leererRaum(1, [0, 0]) } };
    Z.dungeon = id; Z.raum = 'r1'; Z.auswahl = null;
    speichern(); render();
  }
  function kopiereDungeon(quelle) {
    const q = DATEN.dungeons[quelle];
    if (!q) return;
    merke();
    const d = kopie(q); delete d.eigen;
    for (const r of Object.values(d.raeume)) normalisiereRaum(r);
    if (!Object.values(d.raeume).every(r => r.pos)) setzePositionen(d);
    d.titel = (d.titel + ' (KOPIE)').slice(0, 40);
    const id = 'eigen-' + Date.now().toString(36);
    eigene.dungeons[id] = d; Z.dungeon = id; Z.raum = d.start.raum; Z.auswahl = null;
    speichern(); render();
  }
  function raumBei(x, y) { const d = dg(); return d ? Object.entries(d.raeume).find(([, r]) => r.pos && r.pos[0] === x && r.pos[1] === y) : null; }
  function nachbar(dir) { const r = raum(); return r && r.pos ? raumBei(r.pos[0] + RICHTUNG[dir][0], r.pos[1] + RICHTUNG[dir][1]) : null; }
  function legeRaumAn(x, y, verbindeMit) {
    const d = dg(), id = neueRaumId(d), nr = Object.keys(d.raeume).length + 1, r = leererRaum(nr, [x, y]);
    d.raeume[id] = r;
    if (verbindeMit) {   // Tür zum Raum, von dem aus angelegt wurde
      const [vid, v] = verbindeMit, dir = Object.keys(RICHTUNG).find(k => v.pos[0] + RICHTUNG[k][0] === x && v.pos[1] + RICHTUNG[k][1] === y);
      if (dir) { v.tueren[dir] = { ziel: id }; r.tueren[GEGENUEBER[dir]] = { ziel: vid }; }
    }
    if (Z.fuellen.auto) befuelle(r, false);
    Z.raum = id; Z.auswahl = null;
  }
  function loescheRaum() {
    const d = dg();
    if (Object.keys(d.raeume).length <= 1) { alert('Der letzte Raum kann nicht gelöscht werden.'); return; }
    if (!confirm(`Raum „${raum().titel}“ löschen?`)) return;
    merke();
    delete d.raeume[Z.raum];
    for (const r of Object.values(d.raeume)) for (const [dir, t] of Object.entries(r.tueren)) if (t.ziel === Z.raum) delete r.tueren[dir];
    if (d.start.raum === Z.raum) d.start = { raum: Object.keys(d.raeume)[0], feld: [9.5, 8.5] };
    Z.raum = Object.keys(d.raeume)[0]; Z.auswahl = null;
    speichern(); render();
  }

  // ---------- Türen ----------
  function tuerArt(t) {
    if (!t) return 'keine';
    if (t.schloss) return 'schloss';
    if (t.offen_wenn === 'geraeumt') return 'kampf';
    if (t.offen_wenn !== undefined) return 'bedingung';
    return 'offen';
  }
  function setzeTuer(dir, art, bedingung, merken) {
    const r = raum(), nb = nachbar(dir);
    if (!nb) return;
    merke();
    const [nid, n] = nb, g = GEGENUEBER[dir];
    if (art === 'keine') { delete r.tueren[dir]; delete n.tueren[g]; }
    else {
      const t = { ziel: nid };
      if (art === 'schloss') t.schloss = true;
      if (art === 'kampf') t.offen_wenn = 'geraeumt';
      if (art === 'bedingung') {   // ohne Vorgabe: das erste Signal von Platte, Gegner oder Ereignis, sonst „geräumt“ (als Liste,
        // damit es nicht als Kampftür gilt)
        const q = Object.entries(dungeonSignale(DATEN, DATEN.dungeons[Z.dungeon]).quellen), erstes = ['platte', 'gegner', 'ereignis'].map(k => q.find(([, wo]) => wo[0].art === k)).find(Boolean);
        t.offen_wenn = bedingung === undefined ? (erstes ? erstes[0] : { alle: ['geraeumt'] }) : bedingung; if (merken) t.merken = true;
      }
      r.tueren[dir] = t;
      n.tueren[g] = n.tueren[g] ? { ...n.tueren[g], ziel: Z.raum } : { ziel: Z.raum };
    }
    aenderung(); renderRechts();
  }

  // ---------- Automatisch befüllen ----------
  // Rahmen bleibt, Inneres wird neu: Abgründe, Hindernisse, Gegner. Die Felder vor den Türen bleiben frei, und alle
  // Türen (und der Startpunkt) müssen untereinander erreichbar bleiben – sonst wird der letzte Schritt zurückgenommen.
  function befuelle(r, nachfragen = true) {
    if (nachfragen && (r.objekte.length || r.gegner.length) && !confirm('Inhalt des Raums ersetzen?')) return;
    const f = Z.fuellen, karte = rahmenKarte().map(z => [...z]), objekte = [], gegner = [];
    const schutz = new Set(), ziele = [];
    for (const dir of Object.keys(r.tueren)) {
      const [x, y, w, h] = TUER_RECHTECK[dir], [dx, dy] = RICHTUNG[dir];
      for (let rr = y / T; rr < (y + h) / T; rr++) for (let c = x / T; c < (x + w) / T; c++) for (let k = 1; k <= 3; k++) {
        const cc = c - dx * k, ry = rr - dy * k;
        if (innen(cc, ry)) { schutz.add(cc + ',' + ry); if (k === 1) ziele.push([cc, ry]); }
      }
    }
    const d = dg();
    if (d && d.start.raum === Z.raum && raum() === r) {
      const [sx, sy] = d.start.feld.map(Math.floor);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) schutz.add((sx + a) + ',' + (sy + b));
      ziele.push([sx, sy]);
    }
    if (!ziele.length) ziele.push([9, 8]);
    const belegt = (c, rr) => objekte.some(o => o.feld[0] === c && o.feld[1] === rr) || gegner.some(g => g.feld[0] === c && g.feld[1] === rr);
    const begehbar = (c, rr) => karte[rr][c] === '.' && !objekte.some(o => o.feld[0] === c && o.feld[1] === rr && DATEN.objektarten[o.objekt].fest && !DATEN.objektarten[o.objekt].schneidbar);
    const zusammen = () => {
      const [c0, r0] = ziele[0], da = new Set([c0 + ',' + r0]), offen = [[c0, r0]];
      while (offen.length) {
        const [c, rr] = offen.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = (c + dx) + ',' + (rr + dy);
          if (!da.has(n) && innen(c + dx, rr + dy) && begehbar(c + dx, rr + dy)) { da.add(n); offen.push([c + dx, rr + dy]); }
        }
      }
      return ziele.every(([c, rr]) => da.has(c + ',' + rr));
    };
    const freiesFeld = (abstand = 0) => {
      for (let i = 0; i < 200; i++) {
        const c = 1 + Math.floor(Math.random() * (SPALTEN - 2)), rr = 2 + Math.floor(Math.random() * (ZEILEN - 3));
        if (karte[rr][c] !== '.' || schutz.has(c + ',' + rr) || belegt(c, rr)) continue;
        if (abstand && ziele.some(([zc, zr]) => Math.abs(zc - c) + Math.abs(zr - rr) < abstand)) continue;
        return [c, rr];
      }
      return null;
    };
    if (f.abgruende) for (let i = 0, n = 1 + Math.floor(Math.random() * 2); i < n; i++) {
      const w = 2 + Math.floor(Math.random() * 3), h = 2 + Math.floor(Math.random() * 2), p = freiesFeld();
      if (!p) continue;
      const geaendert = [];
      for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) {
        const c = p[0] + a, rr = p[1] + b;
        if (innen(c, rr) && !schutz.has(c + ',' + rr) && karte[rr][c] === '.') { karte[rr][c] = '~'; geaendert.push([c, rr]); }
      }
      if (!zusammen()) for (const [c, rr] of geaendert) karte[rr][c] = '.';
    }
    const arten = ['stein', 'stein', 'beerenbusch', 'stumpf', 'holzstapel', ...(f.buesche ? ['busch', 'busch', 'busch'] : [])];
    const anzahl = { keine: 0, wenig: 6, mittel: 12, viel: 22 }[f.hindernisse] || 0;
    for (let i = 0, gesetzt = 0; i < anzahl * 4 && gesetzt < anzahl; i++) {
      const p = freiesFeld();
      if (!p) break;
      objekte.push({ objekt: zufallAus(arten), feld: p });
      if (zusammen()) gesetzt++; else objekte.pop();
    }
    const gegnerArten = f.arten.filter(a => DATEN.gegnerarten[a]);
    for (let i = 0; i < f.gegner && gegnerArten.length; i++) { const p = freiesFeld(4); if (p) gegner.push({ gegner: zufallAus(gegnerArten), feld: p }); }
    r.karte = karte.map(z => z.join('')); r.objekte = objekte; r.gegner = gegner; sortiere(r);
  }

  // ---------- Malen im Raum ----------
  const neuesObjekt = (art, feld) => ({ objekt: art, feld, ...kopie(Z.werkzeug.art === 'objekt' && Z.werkzeug.wert === art && Z.werkzeug.vorlage || VORGABE[art] || {}) });
  function vorlageAus(a) {   // wer ein Objekt einstellt, setzt danach weitere mit denselben Einstellungen
    if (Z.werkzeug.art === 'objekt' && Z.werkzeug.wert === a.objekt) { const { objekt, ...v } = ohneFeld(a); Z.werkzeug.vorlage = v; renderVorlage(); }
  }
  function pipette(c, rr) {   // Werkzeug samt Einstellungen von dem übernehmen, was auf dem Feld liegt
    const r = raum(), o = r.objekte.find(x => x.feld[0] === c && x.feld[1] === rr), g = r.gegner.find(x => x.feld[0] === c && x.feld[1] === rr);
    if (o) { const { objekt, ...v } = ohneFeld(o); Z.werkzeug = { art: 'objekt', wert: objekt, vorlage: v }; }
    else if (g) Z.werkzeug = { art: 'gegner', wert: g.gegner };
    else if (r.karte[rr]) Z.werkzeug = { art: 'kachel', wert: r.karte[rr][c] };
    renderWerkzeuge();
  }
  // Ein Feld bearbeiten. erster: Beginn eines Strichs (merkt sich den Stand für Rückgängig), still: ohne Neuzeichnen (Rechteck)
  function anwenden(c, rr, erster, rechts, still = false) {
    const r = raum();
    if (!r) return;
    const w = rechts ? { art: 'radierer' } : Z.werkzeug;
    const iO = r.objekte.findIndex(o => o.feld[0] === c && o.feld[1] === rr), iG = r.gegner.findIndex(g => g.feld[0] === c && g.feld[1] === rr);
    if (w.art === 'pipette') { if (erster) pipette(c, rr); return; }
    if (Z.werkzeug.art === 'weg') {   // Wegpunkte für den ausgewählten Gegner; rechts nimmt den letzten weg
      const g = Z.auswahl && Z.auswahl.liste === 'gegner' && r.gegner[Z.auswahl.i];
      if (!erster || !g || !innen(c, rr)) return;
      merke();
      if (rechts) { if (g.weg) { g.weg.pop(); if (!g.weg.length) delete g.weg; } }
      else g.weg = [...(g.weg || [g.feld]), [c, rr]];
      aenderung(); renderRechts(); return;
    }
    if (w.art === 'auswahl') {
      if (erster) { Z.auswahl = iO >= 0 ? { liste: 'objekte', i: iO } : iG >= 0 ? { liste: 'gegner', i: iG } : null; renderRechts(); zeichneRaum(); }
      return;
    }
    if (w.art === 'start') { if (erster && innen(c, rr)) { merke(); dg().start = { raum: Z.raum, feld: [c + 0.5, rr + 0.5] }; aenderung(); renderRechts(); } return; }
    if (!innen(c, rr)) return;
    const setzeKachel = ch => { const z = [...r.karte[rr]]; z[c] = ch; r.karte[rr] = z.join(''); };
    const raus = () => { if (iO >= 0) r.objekte.splice(iO, 1); const j = r.gegner.findIndex(g => g.feld[0] === c && g.feld[1] === rr); if (j >= 0) r.gegner.splice(j, 1); };
    if (erster) merke();
    if (w.art === 'kachel') {
      if (r.karte[rr][c] === w.wert && (w.wert === '.' || (iO < 0 && iG < 0))) return;
      if (w.wert !== '.') raus();
      setzeKachel(w.wert);
    } else if (w.art === 'objekt') {
      const neu = neuesObjekt(w.wert, [c, rr]);
      if (iO >= 0 && r.objekte[iO].objekt === w.wert) {   // gleiches Objekt: Einstellungen übernehmen oder nur auswählen
        if (JSON.stringify(ohneFeld(r.objekte[iO])) === JSON.stringify(ohneFeld(neu))) { if (erster) { Z.auswahl = { liste: 'objekte', i: iO }; renderRechts(); zeichneRaum(); } return; }
        r.objekte[iO] = neu;
      } else { raus(); setzeKachel('.'); r.objekte.push(neu); sortiere(r); }
      if (erster) Z.auswahl = { liste: 'objekte', i: r.objekte.findIndex(o => o.feld[0] === c && o.feld[1] === rr) };
    } else if (w.art === 'gegner') {
      if (iG >= 0 && r.gegner[iG].gegner === w.wert) return;
      raus(); setzeKachel('.');
      r.gegner.push({ gegner: w.wert, feld: [c, rr] }); sortiere(r);
      if (erster) Z.auswahl = { liste: 'gegner', i: r.gegner.findIndex(g => g.feld[0] === c && g.feld[1] === rr) };
    } else if (w.art === 'radierer') {
      if (iO >= 0 || iG >= 0) raus(); else setzeKachel('.');
      Z.auswahl = null;
    }
    if (still) return;
    aenderung();
    if (erster) renderRechts();
  }
  const rechteckFelder = ({ a, b }) => {
    const f = [];
    for (let rr = Math.min(a[1], b[1]); rr <= Math.max(a[1], b[1]); rr++) for (let c = Math.min(a[0], b[0]); c <= Math.max(a[0], b[0]); c++) f.push([c, rr]);
    return f;
  };
  function fuelleRechteck(re) {
    merke();
    for (const [c, rr] of rechteckFelder(re)) anwenden(c, rr, false, re.rechts, true);
    Z.auswahl = null; aenderung(); renderRechts();
  }

  // ---------- Zeichnen ----------
  function vorschauObjekt(g, o, r) {
    const t = DATEN.objektarten[o.objekt], [c, rr] = o.feld, x = c * T, y = rr * T;
    if (!t) { g.fillStyle = '#d0574a'; g.fillRect(x + 8, y + 8, 16, 16); return; }
    if (t.platte) g.drawImage(PLATTE[0], x, y);
    else if (t.pflock) g.drawImage((PFLOCK[o.farbe] || PFLOCK.blau)[1], x, y);
    else if (t.kristall) g.drawImage(KRISTALL[kristallTyp(o.kristalltyp).farben[0]] || KRISTALL.blau, x + 2, y - 2);
    else if (t.oeffnbar) g.drawImage(TRUHE_ZU, x + 4, y + 9);
    else if (t.bild === '@fackel') g.drawImage(FACKEL[o.an === false ? 0 : 1], x + 8, y);
    else if (t.bild === '@schild') g.drawImage(SCHILD, x + 4, y + 10);
    else if (t.bild === '@block') g.drawImage(BLOCK, x, y);
    else if (t.kette) {
      const gleich = dc => r && r.objekte.some(p => p.objekt === o.objekt && p.feld[1] === rr && p.feld[0] === c + dc);
      zeichneBild(g, t.bilder[!gleich(-1) ? 0 : !gleich(1) ? 2 : 1], x, y);
    }
    else zeichneBild(g, t.bild, x, y, t.spiegeln === 'schachbrett' && (c + rr) % 2 === 1);
  }
  function zeichneRaum() {
    const cv = $('#ed-raum'), r = raum();
    if (!cv) return;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#120d14'; g.fillRect(0, 0, BREITE, HOEHE);
    if (!r) return;
    const kachel = r.karte.map(z => [...z].map(ch => DATEN.kacheln[ch] || 'boden'));
    for (const dir of Object.keys(r.tueren)) {
      const [x, y, w, h] = TUER_RECHTECK[dir];
      for (let rr = y / T; rr < (y + h) / T; rr++) for (let c = x / T; c < (x + w) / T; c++) kachel[rr][c] = 'boden';
    }
    const schluessel = 'editor/' + Z.dungeon + '/' + Z.raum, merkmal = schluessel + r.karte.join('') + Object.keys(r.tueren).join() + r.objekte.map(o => o.feld).join(';');
    if (Z.bgMerkmal !== merkmal) {   // Hintergrund nur neu zeichnen, wenn sich Gelände, Türen oder Objektfelder ändern
      Z.bgMerkmal = merkmal;
      Z.bg = baueHintergrund({ kachel, def: r, schluessel, objekte: r.objekte.map(o => ({ c: o.feld[0], r: o.feld[1] })) });
    }
    g.drawImage(Z.bg, 0, 0);
    for (const o of r.objekte) vorschauObjekt(g, o, r);
    r.gegner.forEach((e, i) => {   // Wege: alle schwach, der ausgewählte Gegner deutlich
      if (!e.weg) return;
      const an = Z.auswahl && Z.auswahl.liste === 'gegner' && Z.auswahl.i === i, m = p => [p[0] * T + T / 2, p[1] * T + T / 2];
      g.strokeStyle = an ? '#f4cd5e' : 'rgba(244,205,94,.35)'; g.lineWidth = an ? 3 : 2; g.setLineDash([]);
      g.beginPath(); e.weg.forEach((p, k) => g[k ? 'lineTo' : 'moveTo'](...m(p))); g.stroke();
      g.setLineDash([5, 5]); g.beginPath(); g.moveTo(...m(e.weg[e.weg.length - 1])); g.lineTo(...m(e.weg[0])); g.stroke(); g.setLineDash([]);
      if (an) e.weg.forEach((p, k) => { const [x, y] = m(p); g.fillStyle = '#f4cd5e'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = '#120d14'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText(k + 1, x, y + 4); });
    });
    for (const e of r.gegner) {
      const b = GEGNERBILD[e.gegner], art = DATEN.gegnerarten[e.gegner] || {}, k = art.groesse || 1;
      if (b) g.drawImage(b[0], e.feld[0] * T + 16 - 16 * k, e.feld[1] * T + 16 - 24 * k, 32 * k, 32 * k);
      else { g.fillStyle = '#d0574a'; g.fillRect(e.feld[0] * T + 6, e.feld[1] * T + 6, 20, 20); }
      const sig = e.signal || art.signal;
      if (sig || art.boss) { g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#f4cd5e'; g.fillText(art.boss ? 'BOSS ' + (art.boss.name || '') : 'Signal: ' + sig, e.feld[0] * T + 16, e.feld[1] * T - 10 * k); }
    }
    const licht = typeof r.licht === 'number' ? r.licht : (CFG.licht.stufen[r.licht] ?? 1);   // Dunkelheit nur andeuten
    if (licht < 1) { g.fillStyle = `rgba(18,13,20,${(1 - licht) * 0.45})`; g.fillRect(0, 0, BREITE, HOEHE); }
    const d = dg();
    if (d.start.raum === Z.raum) { g.globalAlpha = 0.8; zeichneBild(g, 'held_0', d.start.feld[0] * T - 16, d.start.feld[1] * T + 8 - 48); g.globalAlpha = 1; }
    g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
    for (const [dir, t] of Object.entries(r.tueren)) {   // Türart beschriften
      const [x, y, w, h] = TUER_RECHTECK[dir], art = tuerArt(t);
      const farbe = { offen: '#a9b2b0', schloss: '#e0a33a', kampf: '#d0574a', bedingung: '#8098cc' }[art];
      g.fillStyle = farbe; g.globalAlpha = 0.55; g.fillRect(x, y, w, h); g.globalAlpha = 1;
      g.fillStyle = '#120d14'; g.fillText({ offen: '', schloss: 'S', kampf: 'K', bedingung: '?' }[art], x + w / 2, y + h / 2 + 4);
    }
    g.strokeStyle = 'rgba(255,251,236,.08)'; g.lineWidth = 1;
    for (let c = 1; c < SPALTEN; c++) { g.beginPath(); g.moveTo(c * T + 0.5, 0); g.lineTo(c * T + 0.5, HOEHE); g.stroke(); }
    for (let rr = 1; rr < ZEILEN; rr++) { g.beginPath(); g.moveTo(0, rr * T + 0.5); g.lineTo(BREITE, rr * T + 0.5); g.stroke(); }
    const a = Z.auswahl && r[Z.auswahl.liste][Z.auswahl.i];
    if (a) { g.strokeStyle = '#f4cd5e'; g.lineWidth = 3; g.strokeRect(a.feld[0] * T + 1.5, a.feld[1] * T + 1.5, T - 3, T - 3); }
    if (Z.rechteck) {   // Rechteck, das gerade aufgezogen wird
      const { a: p, b: q, rechts } = Z.rechteck, x = Math.min(p[0], q[0]) * T, y = Math.min(p[1], q[1]) * T, w = (Math.abs(p[0] - q[0]) + 1) * T, h = (Math.abs(p[1] - q[1]) + 1) * T;
      g.fillStyle = rechts ? 'rgba(208,87,74,.25)' : 'rgba(244,205,94,.2)'; g.fillRect(x, y, w, h);
      g.strokeStyle = rechts ? '#d0574a' : '#f4cd5e'; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(x + 1, y + 1, w - 2, h - 2); g.setLineDash([]);
    } else if (Z.maus && innen(...Z.maus)) { g.strokeStyle = 'rgba(255,251,236,.7)'; g.lineWidth = 2; g.strokeRect(Z.maus[0] * T + 1, Z.maus[1] * T + 1, T - 2, T - 2); }
  }
  const KZ = { w: 46, h: 34 };   // Zelle der Dungeon-Karte
  function kartenRahmen() {
    const p = Object.values(dg().raeume).map(r => r.pos || [0, 0]);
    return { x0: Math.min(...p.map(q => q[0])) - 1, y0: Math.min(...p.map(q => q[1])) - 1, x1: Math.max(...p.map(q => q[0])) + 1, y1: Math.max(...p.map(q => q[1])) + 1 };
  }
  function zeichneKarte() {
    const cv = $('#ed-karte');
    if (!cv || !dg()) return;
    const b = kartenRahmen(), g = cv.getContext('2d');
    cv.width = (b.x1 - b.x0 + 1) * KZ.w; cv.height = (b.y1 - b.y0 + 1) * KZ.h;
    g.fillStyle = '#1c1e26'; g.fillRect(0, 0, cv.width, cv.height);
    g.font = '11px sans-serif'; g.textAlign = 'center';
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const px = (x - b.x0) * KZ.w, py = (y - b.y0) * KZ.h, rm = raumBei(x, y);
      if (!rm) { g.strokeStyle = '#2e313b'; g.setLineDash([3, 3]); g.strokeRect(px + 6.5, py + 6.5, KZ.w - 13, KZ.h - 13); g.setLineDash([]); g.fillStyle = '#454a55'; g.fillText('+', px + KZ.w / 2, py + KZ.h / 2 + 4); continue; }
      const [id, r] = rm, an = id === Z.raum;
      g.fillStyle = an ? '#e0a33a' : '#626a72'; g.fillRect(px + 5, py + 5, KZ.w - 10, KZ.h - 10);
      g.fillStyle = '#120d14'; g.fillText(r.nr || id, px + KZ.w / 2, py + KZ.h / 2 + 4);
      if (dg().start.raum === id) { g.fillStyle = '#f4cd5e'; g.fillText('★', px + 12, py + 15); }
      for (const [dir, t] of Object.entries(r.tueren)) {   // Verbindungen
        const [dx, dy] = RICHTUNG[dir], art = tuerArt(t);
        g.fillStyle = { offen: '#cfd6cf', schloss: '#f4cd5e', kampf: '#d0574a', bedingung: '#8098cc' }[art];
        if (dx) g.fillRect(dx > 0 ? px + KZ.w - 6 : px, py + KZ.h / 2 - 3, 6, 6); else g.fillRect(px + KZ.w / 2 - 3, dy > 0 ? py + KZ.h - 6 : py, 6, 6);
      }
    }
  }
  function zeigeWarnungen() {
    const el = $('#ed-warnungen');
    if (!el || !Z.dungeon) return;
    const w = pruefeDaten({ ...DATEN, dungeons: { [Z.dungeon]: DATEN.dungeons[Z.dungeon] } }, true);
    el.innerHTML = w.length ? '<b>Hinweise:</b><ul>' + w.map(m => '<li>' + esc(m.replace(Z.dungeon + '/', '').replace(Z.dungeon + ':', 'Dungeon:')) + '</li>').join('') + '</ul>' : '<span class="ok">Keine Fehler gefunden.</span>';
  }

  // ---------- Werkzeugleiste ----------
  function symbol(zeichnen) { const c = document.createElement('canvas'); c.width = c.height = T; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; zeichnen(g); return c; }
  function renderWerkzeuge() {
    const el = $('#ed-werkzeuge');
    el.innerHTML = '';
    const knopf = (art, wert, titel, bild) => {
      const b = document.createElement('button');
      b.className = 'wz' + (Z.werkzeug.art === art && Z.werkzeug.wert === wert ? ' an' : ''); b.title = titel;
      if (bild) b.appendChild(bild); else b.textContent = titel;
      b.onclick = () => { Z.werkzeug = { art, wert }; renderWerkzeuge(); };
      return b;
    };
    const gruppe = (name, knoepfe) => { const d = document.createElement('div'); d.className = 'gruppe'; d.innerHTML = `<span>${name}</span>`; knoepfe.forEach(k => d.appendChild(k)); el.appendChild(d); };
    gruppe('Werkzeug', [knopf('auswahl', null, 'Auswählen'), knopf('pipette', null, 'Pipette'), knopf('radierer', null, 'Radierer'), knopf('start', null, 'Startpunkt')]);
    const form = (wert, titel) => { const b = document.createElement('button'); b.className = 'wz' + (Z.form === wert ? ' an' : ''); b.textContent = titel; b.onclick = () => { Z.form = wert; renderWerkzeuge(); }; return b; };
    gruppe('Form', [form('pinsel', 'Pinsel'), form('rechteck', 'Rechteck')]);
    gruppe('Gelände', [
      knopf('kachel', KACHELZEICHEN.mauer, 'Mauer', symbol(g => mauerKrone(g, 0, 0, zufall(3)))),
      knopf('kachel', KACHELZEICHEN.boden, 'Boden', symbol(g => zeichneBild(g, 'gras_0', 0, 0))),
      knopf('kachel', KACHELZEICHEN.abgrund, 'Abgrund', symbol(g => abgrundKachel(g, 0, 0, () => false))),
    ]);
    gruppe('Objekte', Object.keys(DATEN.objektarten).map(a => knopf('objekt', a, a, symbol(g => { g.translate(0, 2); vorschauObjekt(g, { objekt: a, feld: [0, 0], ...(VORGABE[a] || {}) }); }))));
    gruppe('Gegner', Object.keys(DATEN.gegnerarten).map(a => knopf('gegner', a, a, symbol(g => g.drawImage(GEGNERBILD[a][0], 0, 0)))));
    renderVorlage();
  }
  function renderVorlage() {   // Zeile unter der Werkzeugleiste: was gerade gesetzt wird, mit welchen Einstellungen
    const el = $('#ed-vorlage'), w = Z.werkzeug;
    if (!el) return;
    if (w.art === 'weg') { el.innerHTML = 'Weg zeichnen: Felder anklicken, der Gegner läuft sie der Reihe nach ab und beginnt dann von vorn · rechte Maustaste nimmt den letzten Punkt weg · fertig: anderes Werkzeug wählen'; return; }
    const namen = { auswahl: 'Auswählen: Objekt oder Gegner anklicken, rechts einstellen.', pipette: 'Pipette: Feld anklicken – übernimmt Gelände, Gegner oder Objekt samt Einstellungen.',
      radierer: 'Radierer: entfernt Objekte und Gegner, sonst wird das Feld zu Boden.', start: 'Startpunkt: Feld anklicken, dort beginnt der Dungeon.' };
    let text = namen[w.art];
    if (w.art === 'kachel') text = 'Setzt Gelände: ' + DATEN.kacheln[w.wert];
    if (w.art === 'gegner') text = 'Setzt Gegner: ' + w.wert;
    if (w.art === 'objekt') {
      const v = w.vorlage || VORGABE[w.wert] || {}, teile = [];
      if (v.kristalltyp) teile.push('Typ ' + kristallTyp(v.kristalltyp).name);
      if (v.farbe) teile.push('oben bei ' + farbName(v.farbe));
      if (v.signal) teile.push('Signal „' + v.signal + '“' + (v.merken ? ', bleibt unten' : ''));
      if (v.inhalt) teile.push('Inhalt ' + v.inhalt);
      if (v.sichtbar_wenn !== undefined) teile.push('erscheint nur unter Bedingung');
      if (v.an === false) teile.push('brennt nicht');
      text = 'Setzt: ' + w.wert + (teile.length ? ' · ' + teile.join(' · ') : '') + (w.vorlage ? ' <span class="marke">wie Vorlage</span>' : '');
    }
    el.innerHTML = text + ` <span class="klein">· ${Z.form === 'rechteck' ? 'Rechteck aufziehen' : 'Ziehen malt, Umschalt+Ziehen = Rechteck'} · Alt+Klick = Pipette · rechte Maustaste entfernt</span>`;
  }

  // ---------- Formulare ----------
  function feld(label, inhalt, hilfe = '') { return `<div class="feld"><span>${label}</span>${inhalt}${hilfe ? `<small class="erkl">${hilfe}</small>` : ''}</div>`; }
  const textfeld = (name, wert, platz = '') => `<input data-f="${name}" value="${esc(wert)}" placeholder="${esc(platz)}">`;
  const zahlfeld = (name, wert, schritt = 1) => `<input type="number" step="${schritt}" data-f="${name}" value="${esc(wert)}">`;
  const auswahlfeld = (name, wert, optionen) => `<select data-f="${name}">${Object.entries(optionen).map(([k, v]) => `<option value="${esc(k)}"${k === wert ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  const haken = (name, wert) => `<input type="checkbox" data-f="${name}"${wert ? ' checked' : ''}>`;

  function renderLinks() {
    const el = $('#ed-links');
    const eig = Object.entries(eigene.dungeons), eingebaut = Object.entries(DATEN.dungeons).filter(([, d]) => !d.eigen);
    el.innerHTML = `
      <h3>Dungeon</h3>
      <select id="ed-dungeonwahl">${eig.length ? eig.map(([id, d]) => `<option value="${id}"${id === Z.dungeon ? ' selected' : ''}>${esc(d.titel)}</option>`).join('') : '<option>– noch keiner –</option>'}</select>
      <div class="knoepfe">
        <button data-a="neu">Neu</button>
        <select data-a="kopie"><option value="">Kopie von …</option>${[...eingebaut, ...eig].map(([id, d]) => `<option value="${id}">${esc(d.titel)}</option>`).join('')}</select>
      </div>
      ${dg() ? `
      <div class="knoepfe"><button data-a="umbenennen">Umbenennen</button><button data-a="dungeonloeschen" class="gefahr">Löschen</button></div>
      <h3>Karte <small>(Klick: Raum wählen, + anlegen)</small></h3>
      <div class="kartenrahmen"><canvas id="ed-karte"></canvas></div>
      <div class="knoepfe"><button data-a="testdungeon" class="haupt">▶ Dungeon testen</button></div>
      <div id="ed-warnungen" class="warnungen"></div>` : '<p>Lege einen neuen Dungeon an oder übernimm einen bestehenden als Kopie.</p>'}
      <h3>Datei</h3>
      <div class="knoepfe"><button data-a="export">Export</button><button data-a="import">Import</button><input type="file" id="ed-datei" accept=".json,application/json" hidden></div>
      <p class="klein">Gespeichert wird automatisch in diesem Browser. Export sichert alles als Datei – zum Weitergeben oder fürs Repo.</p>`;
    zeichneKarte(); zeigeWarnungen();
  }

  const HILFE_SIGNALE = `<details class="erklaerung"><summary>Wie funktionieren Signale und Bedingungen?</summary>
    <p><b>Signale</b> sind Namen für Schalterzustände. Sie entstehen durch
    <b>Platten</b> (ihr Signal gilt, solange etwas daraufsteht – oder dauerhaft, wenn „einmal drücken genügt“),
    <b>Kristalle</b> (jeder Kristalltyp zeigt gerade eine seiner Farben) und <b>Ereignisse</b> (unter „Erweitert“).
    Dazu kommt immer „Raum geräumt“.</p>
    <p><b>Bedingungen</b> fragen Signale ab: Türen gehen auf, Fackeln brennen, Objekte erscheinen, solange die Bedingung gilt.
    „bleibt offen“ bzw. „brennt weiter“ heißt: einmal erfüllt, für immer erfüllt. Ein Signal gilt im ganzen Dungeon.</p>
    <p>Unten links stehen Hinweise, wenn etwas nicht zusammenpasst – etwa eine Tür, die auf ein Signal wartet, das nirgends ausgelöst wird.</p></details>`;
  function parameterFeld(a, [name, typ, label, hilfe]) {
    const w = a[name];
    if (typ === 'lang') return feld(label, `<textarea data-f="a.${name}" rows="4">${esc(w)}</textarea>`, hilfe);
    if (typ === 'gegenstand') return feld(label, auswahlfeld('a.' + name, w, Object.fromEntries(Object.entries(DATEN.gegenstaende).map(([k]) => [k, k]))), hilfe);
    if (typ === 'janein') return `<label class="klein"><input type="checkbox" data-f="a.${name}"${w ? ' checked' : ''}> ${label}</label>`;
    if (typ === 'signalname') {
      const vorhanden = Object.entries(dungeonSignale(DATEN, DATEN.dungeons[Z.dungeon]).quellen).filter(([, wo]) => wo[0].art !== 'kristall').map(([n]) => n);
      return feld(label, `<input data-f="a.${name}" data-signal value="${esc(w)}" list="ed-signalliste"><datalist id="ed-signalliste">${vorhanden.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`, hilfe);
    }
    if (typ === 'kristalltyp') return feld(label, auswahlfeld('a.' + name, w, Object.fromEntries(Object.keys(DATEN.kristalltypen).map(k => [k, typText(k)]))) +
      ' <button data-ansicht="kristalle" class="klein">Kristalltypen verwalten …</button>', hilfe);
    if (typ === 'pflockfarbe') return feld(label, auswahlfeld('a.' + name, w, Object.fromEntries(kristallTyp(a.kristalltyp).farben.map(f => [f, farbName(f)]))), hilfe);
    if (typ === 'brennt') return feld(label, bedingungsFormular('a.an_wenn', a.an_wenn, { nie: true, istNie: a.an === false }), hilfe);
    if (typeof typ === 'object') return feld(label, auswahlfeld('a.' + name, w === true ? '1' : w === undefined ? '' : w, typ), hilfe);
    return feld(label, textfeld('a.' + name, w), hilfe);
  }
  function wellenFormular(r) {   // je Welle eine Zeile, je Gegnerart die Anzahl
    const arten = Object.keys(DATEN.gegnerarten);
    return (r.wellen || []).map((w, i) => `<div class="welle"><b>${i + 1}.</b>${arten.map(k => `<label title="${esc(k)}"><img src="${bildUrl(GEGNERBILD[k][0])}" alt="${esc(k)}"><input type="number" min="0" max="12" data-welle="${i}" data-wart="${esc(k)}" value="${w.filter(x => x === k).length}"></label>`).join('')}
      <button data-a="welleweg" data-i="${i}" title="Welle entfernen">×</button></div>`).join('') +
      `<div class="knoepfe"><button data-a="welleplus">＋ Welle</button></div>`;
  }
  function renderRechts() {
    const el = $('#ed-rechts'), r = raum(), d = dg();
    if (!r) { el.innerHTML = ''; return; }
    const tueren = Object.keys(RICHTUNG).map(dir => {
      const nb = nachbar(dir), t = r.tueren[dir], art = tuerArt(t);
      if (!nb) return `<div class="tuer"><b>${RICHTUNGSNAME[dir]}</b> <span class="klein">kein Nachbarraum</span> <button data-a="nachbar" data-dir="${dir}">Raum anlegen</button></div>`;
      return `<div class="tuer"><b>${RICHTUNGSNAME[dir]}</b> → ${esc(nb[1].nr)} ${esc(nb[1].titel)}<br>
        <select data-tuer="${dir}">${Object.entries(TUERARTEN).map(([k, v]) => `<option value="${k}"${k === art ? ' selected' : ''}>${v}</option>`).join('')}</select>
        ${art === 'bedingung' ? `<div class="klein">offen, solange:</div>${bedingungsFormular('tuer.' + dir, t.offen_wenn)}
          <label class="klein"><input type="checkbox" data-tuermerk="${dir}"${t.merken ? ' checked' : ''}> bleibt offen, wenn einmal erfüllt</label>` : ''}
        ${art === 'schloss' ? '<div class="klein">braucht einen kleinen Schlüssel (Truhe mit Inhalt „schluessel“)</div>' : ''}</div>`;
    }).join('');
    const a = Z.auswahl && r[Z.auswahl.liste][Z.auswahl.i];
    let auswahl = '<p class="klein">Mit „Auswählen“ ein Objekt oder einen Gegner anklicken, um es einzustellen. Frisch gesetzte Objekte sind gleich ausgewählt.</p>';
    if (a && Z.auswahl.liste === 'gegner') {
      const art = DATEN.gegnerarten[a.gegner] || {}, kegel = art.bemerkt && art.bemerkt.art === 'kegel';
      auswahl = feld('Gegnerart', auswahlfeld('a.gegner', a.gegner, Object.fromEntries(Object.keys(DATEN.gegnerarten).map(k => [k, k])))) +
        parameterFeld(a, ['signal', 'signalname', 'Signal beim Besiegen', 'Z. B. für eine Tür, die erst nach diesem Gegner aufgeht. Ein Gegner mit Signal kommt nicht wieder.']) +
        feld('Blickrichtung zu Beginn', auswahlfeld('a.blick', a.blick || '', { '': 'zum Helden', hoch: 'nach oben', runter: 'nach unten', links: 'nach links', rechts: 'nach rechts' }), kegel ? 'Wichtig für den Sichtkegel.' : '') +
        feld('Weg (Patrouille)', `<span class="klein">${a.weg ? a.weg.length + ' Punkte' : 'kein Weg'}</span> <button data-a="wegzeichnen">${a.weg ? 'Weg ergänzen' : 'Weg zeichnen'}</button>${a.weg ? ' <button data-a="wegloeschen">Weg löschen</button>' : ''}`,
          art.ruhig === 'patrouille' ? 'Felder anklicken – er läuft sie der Reihe nach ab und beginnt dann von vorn.' : 'Diese Gegnerart patrouilliert nicht (Bewegung „läuft einen Weg ab“ in der Gegnerart).') +
        `<button data-a="auswahlweg" class="gefahr">Entfernen</button>`;
    }
    else if (a) {
      const t = DATEN.objektarten[a.objekt] || {};
      const felder = Object.entries(PARAMETER).filter(([eig]) => t[eig]).flatMap(([, f]) => f);
      auswahl = `<p><b>${esc(a.objekt)}</b> auf Feld ${a.feld.join(', ')}</p>` + felder.map(f => parameterFeld(a, f)).join('') +
        feld('Erscheint', bedingungsFormular('a.sichtbar_wenn', a.sichtbar_wenn),
          'Solange die Bedingung nicht gilt, ist das Objekt gar nicht da – unsichtbar und nicht im Weg. Gilt sie, erscheint es mit einer Rauchwolke. Beispiel: Truhe mit „Raum geräumt“ erscheint nach dem Kampf.') +
        `<div class="knoepfe"><button data-a="alleGleichen" title="Alle Objekte dieser Art im Raum bekommen diese Einstellungen">Auf alle ${esc(a.objekt)} im Raum übertragen</button><button data-a="auswahlweg" class="gefahr">Entfernen</button></div>`;
    }
    const f = Z.fuellen;
    el.innerHTML = `
      <h3>Raum ${esc(r.nr)} <small>(${esc(Z.raum)})</small></h3>
      ${feld('Titel', textfeld('r.titel', r.titel))}
      <div class="zeile">${feld('Nr.', textfeld('r.nr', r.nr))}${feld('Licht', auswahlfeld('r.licht', typeof r.licht === 'number' ? 'hell' : (r.licht || 'hell'), { hell: 'hell', daemmrig: 'dämmrig', dunkel: 'dunkel', finster: 'finster' }))}</div>
      <label class="klein"><input type="checkbox" data-f="r.kampf"${r.kampf ? ' checked' : ''}> Kampfraum (Türen erst offen, wenn geräumt; Gegner kommen nicht wieder)</label>
      ${feld('Einstiegstext', `<textarea data-f="r.einstieg" rows="2" placeholder="erscheint beim ersten Betreten">${esc(r.einstieg)}</textarea>`)}
      ${feld('Wellen', wellenFormular(r), 'Nach den Gegnern im Raum kommen die Wellen nacheinander. Am besten zusammen mit „Kampfraum“.')}
      <div class="knoepfe"><button data-a="testraum" class="haupt">▶ Raum testen</button><button data-a="startraum"${d.start.raum === Z.raum ? ' disabled' : ''}>Als Startraum</button><button data-a="raumloeschen" class="gefahr">Löschen</button></div>
      <h3>Türen</h3>${tueren}
      <h3>Auswahl</h3>${auswahl}
      ${HILFE_SIGNALE}
      <h3>Automatisch befüllen</h3>
      <div class="zeile">${feld('Hindernisse', auswahlfeld('f.hindernisse', f.hindernisse, { keine: 'keine', wenig: 'wenig', mittel: 'mittel', viel: 'viel' }))}${feld('Gegner', zahlfeld('f.gegner', f.gegner))}</div>
      <label class="klein"><input type="checkbox" data-f="f.buesche"${f.buesche ? ' checked' : ''}> Büsche</label>
      <label class="klein"><input type="checkbox" data-f="f.abgruende"${f.abgruende ? ' checked' : ''}> Abgründe</label>
      <div class="arten">${Object.keys(DATEN.gegnerarten).map(k => `<label class="klein"><input type="checkbox" data-fart="${k}"${f.arten.includes(k) ? ' checked' : ''}> ${k}</label>`).join('')}</div>
      <div class="knoepfe"><button data-a="befuellen">Raum befüllen</button></div>
      <label class="klein"><input type="checkbox" data-f="f.auto"${f.auto ? ' checked' : ''}> neue Räume automatisch befüllen</label>
      <h3>Erweitert</h3>
      <details><summary class="klein">Raum als JSON (Ereignisse, Lichtkarte …)</summary>
        <textarea id="ed-json" rows="12">${esc(JSON.stringify(r, null, 1))}</textarea>
        <div class="knoepfe"><button data-a="json">JSON übernehmen</button></div></details>`;
  }

  // Eingaben im rechten Bereich: r.* Raum, a.* ausgewähltes Objekt/Gegner, f.* Befüllen; Bedingungen und Wellen eigens
  function eingabe(e) {
    const t = e.target, r = raum();
    const bed = t.closest('.bed');
    if (bed) { schreibeBedingung(bed); return; }
    if (t.dataset.tuer) { const dir = t.dataset.tuer; setzeTuer(dir, t.value, undefined, r.tueren[dir] && r.tueren[dir].merken); return; }
    if (t.dataset.tuermerk) { const dir = t.dataset.tuermerk; setzeTuer(dir, 'bedingung', r.tueren[dir].offen_wenn, t.checked); return; }
    if (t.dataset.welle !== undefined) {
      merke();
      const i = Number(t.dataset.welle), n = Math.max(0, Math.min(12, Math.round(Number(t.value) || 0))), alt = r.wellen[i];
      r.wellen[i] = Object.keys(DATEN.gegnerarten).flatMap(k => Array(k === t.dataset.wart ? n : alt.filter(x => x === k).length).fill(k));
      aenderung(); return;
    }
    if (t.dataset.fart) { const f = Z.fuellen; f.arten = t.checked ? [...new Set([...f.arten, t.dataset.fart])] : f.arten.filter(a => a !== t.dataset.fart); speichern(); return; }
    const name = t.dataset.f;
    if (!name) return;
    const [bereich, schluessel] = name.split('.');
    let wert = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value;
    if (bereich === 'f') { Z.fuellen[schluessel] = wert; speichern(); return; }
    merke();
    if (bereich === 'r') {
      if (schluessel === 'kampf') {   // Kampfraum: offene Türen werden Kampftüren und umgekehrt
        for (const tuer of Object.values(r.tueren)) {
          if (wert && tuerArt(tuer) === 'offen') tuer.offen_wenn = 'geraeumt';
          if (!wert && tuerArt(tuer) === 'kampf') delete tuer.offen_wenn;
        }
      }
      if (wert === '' || wert === false) delete r[schluessel]; else r[schluessel] = wert;
      if (schluessel === 'kampf') renderRechts();
    } else if (bereich === 'a') {
      const a = r[Z.auswahl.liste][Z.auswahl.i];
      if (t.dataset.signal !== undefined) {   // Signalnamen: klein, ohne Leer- und Sonderzeichen (bei Gegnern darf es leer sein)
        wert = signalName(wert);
        if (!wert && Z.auswahl.liste !== 'gegner') { alert('Bitte einen Namen eingeben, z. B. tor-offen.'); renderRechts(); return; }
        t.value = wert;
      }
      if (schluessel === 'merken' && t.tagName === 'SELECT') wert = wert === '1';
      if (wert === undefined || wert === '' || wert === false) delete a[schluessel]; else a[schluessel] = wert;
      if (schluessel === 'kristalltyp' && a.farbe !== undefined && !kristallTyp(wert).farben.includes(a.farbe)) a.farbe = kristallTyp(wert).farben[0];
      if (Z.auswahl.liste === 'objekte') vorlageAus(a);
      if (['kristalltyp', 'signal', 'merken', 'gegner'].includes(schluessel)) { aenderung(); renderRechts(); return; }
    }
    aenderung();
  }

  // ---------- Gegnerarten ----------
  const grundfarben = {};   // je Grundbild die vorkommenden Farben, häufigste zuerst
  function farbenVon(bild) {
    if (grundfarben[bild]) return grundfarben[bild];
    const zaehler = {};
    for (const n of [0, 1]) {
      const [c, g] = atlasKopie(`${bild}_${n}`), d = g.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const h = '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''); zaehler[h] = (zaehler[h] || 0) + 1; }
    }
    return grundfarben[bild] = Object.entries(zaehler).sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 8);
  }
  // Formular aus Bausteinen: [Pfad, Typ, Beschriftung, Erklärung, Optionen]. Pfade wie "ki.reihe" oder "schuss.pause.0".
  const MODUL_VORGABE = {
    sprung: { reichweite: 150, zielen: 0.5, dauer: 0.32, tempo: 300, pause: [2, 3] },
    schuss: { reichweite: 300, zielen: 0.6, tempo: 170, schaden: 1, anzahl: 1, pause: [1.6, 2.4] },
    rammen: { reichweite: 300, zielen: 0.55, tempo: 320, dauer: 1.4, betaeubt: 1.6, pause: [1, 1.6] },
    stampfen: { reichweite: 80, zielen: 0.8, radius: 70, schaden: 2, pause: [2.5, 3.5] },
    schild: { drehtempo: 120 }, explodiert: { zeit: 1, radius: 56, schaden: 2 }, boss: { name: 'BOSS', phasen: [] },
  };
  const PAUSE = k => [[k + '.pause.0', 'zahl', 'Pause von (s)', '', 0.1], [k + '.pause.1', 'zahl', 'Pause bis (s)', '', 0.1]];
  const ANKUENDIGUNG = k => [k + '.zielen', 'zahl', 'Ankündigung (s)', 'So lange zittert er mit „!“ vorher – Zeit zum Ausweichen.', 0.05];
  const MODULE = {
    sprung: ['Sprungangriff', 'Hält an, zittert, springt dorthin, wo du gerade stehst.', [[ 'sprung.reichweite', 'zahl', 'Reichweite (px)'], ANKUENDIGUNG('sprung'), ['sprung.dauer', 'zahl', 'Sprungdauer (s)', '', 0.02], ['sprung.tempo', 'zahl', 'Sprungtempo'], ...PAUSE('sprung')]],
    schuss: ['Schuss', 'Wirft Kugeln, die du mit dem Schwert zurückschlagen kannst. Braucht freie Sicht.', [['schuss.reichweite', 'zahl', 'Reichweite (px)'], ANKUENDIGUNG('schuss'), ['schuss.tempo', 'zahl', 'Kugeltempo'], ['schuss.schaden', 'zahl', 'Schaden (½ Herzen)'], ['schuss.anzahl', 'wahl', 'Kugeln', '', { 1: 'eine', 3: 'drei im Fächer' }], ...PAUSE('schuss')]],
    rammen: ['Rammen', 'Nur wenn du in einer Linie mit ihm stehst. Rennt geradeaus; prallt er gegen ein Hindernis, ist er betäubt.', [['rammen.reichweite', 'zahl', 'Reichweite (px)'], ANKUENDIGUNG('rammen'), ['rammen.tempo', 'zahl', 'Tempo'], ['rammen.dauer', 'zahl', 'höchstens (s)', '', 0.1], ['rammen.betaeubt', 'zahl', 'danach betäubt (s)', '', 0.1], ...PAUSE('rammen')]],
    stampfen: ['Stampfen', 'Ein roter Kreis kündigt es an, dann tut es im Kreis weh.', [['stampfen.reichweite', 'zahl', 'Auslösen ab Abstand (px)'], ANKUENDIGUNG('stampfen'), ['stampfen.radius', 'zahl', 'Radius (px)'], ['stampfen.schaden', 'zahl', 'Schaden (½ Herzen)'], ...PAUSE('stampfen')]],
  };
  const holen = (o, pfad) => pfad.split('.').reduce((x, k) => x == null ? undefined : x[k], o);
  function setzen(o, pfad, wert) {
    const teile = pfad.split('.'), letztes = teile.pop();
    const ziel = teile.reduce((x, k, i) => (x[k] = x[k] ?? (/^\d+$/.test(teile[i + 1] ?? letztes) ? [] : {})), o);
    if (wert === undefined) delete ziel[letztes]; else ziel[letztes] = wert;
  }
  function gFeld([pfad, typ, label, hilfe = '', opt]) {
    const w = holen(eigeneArt() || DATEN.gegnerarten[Z.gegnerArt], pfad);
    if (typ === 'haken') return `<label class="klein"><input type="checkbox" data-gp="${pfad}" data-gt="haken"${w ? ' checked' : ''}> ${label}${hilfe ? ` <span class="erkl-inline">– ${hilfe}</span>` : ''}</label>`;
    let inhalt;
    if (typ === 'wahl') inhalt = `<select data-gp="${pfad}" data-gt="wahl">${Object.entries(opt).map(([k, v]) => `<option value="${esc(k)}"${String(w ?? '') === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
    else if (typ === 'prozent') inhalt = `<input type="number" min="0" max="100" data-gp="${pfad}" data-gt="prozent" value="${Math.round((w || 0) * 100)}">`;
    else if (typ === 'text' || typ === 'signal') inhalt = `<input data-gp="${pfad}" data-gt="${typ}" value="${esc(w ?? '')}">`;
    else inhalt = `<input type="number" step="${opt || 1}" data-gp="${pfad}" data-gt="zahl" value="${esc(w ?? '')}">`;
    return feld(label, inhalt, hilfe);
  }
  const zeilen = felder => { let html = '', paar = []; for (const f of felder) { if (f[1] === 'haken') { html += gFeld(f); continue; } paar.push(gFeld(f)); if (paar.length === 2) { html += `<div class="zeile">${paar.join('')}</div>`; paar = []; } } return html + (paar.length ? `<div class="zeile">${paar[0]}<div></div></div>` : ''); };
  const eigeneArt = () => eigene.gegnerarten[Z.gegnerArt];
  function renderGegner() {
    const el = $('#ed-gegneransicht'), alle = Object.entries(DATEN.gegnerarten);
    if (!Z.gegnerArt || !DATEN.gegnerarten[Z.gegnerArt]) Z.gegnerArt = alle[0][0];
    const id = Z.gegnerArt, a = DATEN.gegnerarten[id], eigen = !!eigeneArt();
    const artWahl = (ohne = false) => ({ ...(ohne ? { '': '– keine –' } : {}), ...Object.fromEntries(Object.keys(DATEN.gegnerarten).filter(k => k !== id).map(k => [k, k])) });
    const b = a.bemerkt || {}, bArt = b.art || 'immer';
    const modul = (k, titel, erkl, felder) => `<div class="modul"><label class="klein kopf"><input type="checkbox" data-gmod="${k}"${a[k] ? ' checked' : ''}> <b>${titel}</b></label>
      <small class="erkl">${erkl}</small>${a[k] ? zeilen(felder) : ''}</div>`;
    const phasen = ((a.boss || {}).phasen || []).map((p, i) => {
      const [rArt, rN] = Object.entries(p.ruft || {})[0] || ['', 0];
      return `<div class="phase"><b>Phase ${i + 2}</b>
        <div class="zeile">${feld('ab LP (%)', `<input type="number" min="1" max="99" data-phase="${i}" data-pf="ab" value="${Math.round(p.ab * 100)}">`)}${feld('Tempo ×', `<input type="number" step="0.05" data-phase="${i}" data-pf="tempo" value="${p.tempo ?? 1}">`)}</div>
        <div class="zeile">${feld('Pausen ×', `<input type="number" step="0.05" data-phase="${i}" data-pf="pause" value="${p.pause ?? 1}">`)}${feld('ruft Verstärkung', `<select data-phase="${i}" data-pf="ruftArt">${Object.entries({ '': '– keine –', ...Object.fromEntries(Object.keys(DATEN.gegnerarten).filter(k => k !== id).map(k => [k, k])) }).map(([k, v]) => `<option value="${k}"${k === rArt ? ' selected' : ''}>${v}</option>`).join('')}</select>`)}</div>
        <div class="zeile">${feld('Anzahl', `<input type="number" min="0" max="8" data-phase="${i}" data-pf="ruftN" value="${rN}">`)}${feld('Banner-Text', `<input data-phase="${i}" data-pf="text" value="${esc(p.text || '')}">`)}</div>
        <button data-a="phaseweg" data-i="${i}">Phase entfernen</button></div>`;
    }).join('');
    el.innerHTML = `
      <div class="spalte"><h3>Gegnerarten</h3>
        <div class="liste">${alle.map(([k, g]) => `<button data-art="${k}" class="${k === id ? 'an' : ''}"><img class="kbild" src="${bildUrl(GEGNERBILD[k][0])}" alt=""> ${esc(k)} <small>${eigene.gegnerarten[k] ? 'eigen' : 'eingebaut'}${g.boss ? ' · Boss' : ''}</small></button>`).join('')}</div>
        <div class="knoepfe"><button data-a="artneu">Neue Art</button><button data-a="artkopie">Kopie</button>${eigen ? '<button data-a="artloeschen" class="gefahr">Löschen</button>' : ''}</div></div>
      <div class="spalte breit"><h3>${esc(id)} ${eigen ? '' : '<small>(eingebaut – als Kopie bearbeiten)</small>'}</h3>
        <div class="vorschau"><canvas id="ed-gvorschau" width="128" height="128"></canvas></div>
        <fieldset${eigen ? '' : ' disabled'}>
        <h3>Grundwerte</h3>
        ${zeilen([['bild', 'wahl', 'Grundbild', '', Object.fromEntries(Object.keys(GRUNDBILDER).map(k => [k, k]))], ['lp', 'zahl', 'Lebenspunkte'],
          ['tempo', 'zahl', 'Tempo (px/s)'], ['schaden', 'zahl', 'Schaden bei Berührung (½ Herzen)'],
          ['beute.herz', 'prozent', 'Herz fallen lassen (%)'], ['groesse', 'wahl', 'Größe', '', { 1: 'normal', 1.5: '1,5-fach', 2: 'doppelt' }],
          ['gewicht', 'zahl', 'Gewicht', '1 normal · 0 rührt sich nicht · 2 fliegt weit (in Abgründe)', 0.1]])}
        <h3>KI</h3>
        ${zeilen([['ki.wegfindung', 'haken', 'Wegfindung', 'läuft um Hindernisse und Abgründe herum statt geradeaus'],
          ['ki.reihe', 'haken', 'Angriffs-Reihenfolge', `höchstens ${CFG.gegner.angreiferMax} greifen gleichzeitig an, die anderen warten im Kreis`],
          ['ki.abstand', 'wahl', 'Untereinander', '', { abstossen: 'halten Abstand', draengen: 'drängen sich (dürfen überlappen)' }]])}
        <p class="klein">Ohne Haken: einfacher Gegner, läuft geradewegs auf dich zu.</p>
        <h3>Wahrnehmung und Bewegung</h3>
        ${zeilen([['bemerkt.art', 'wahl', 'Bemerkt dich', '', { immer: 'sofort', sicht: 'wenn er dich sieht', kegel: 'nur im Sichtkegel (nach vorn)', geraeusch: 'wenn er Schwerthiebe hört', beruehrung: 'schläft, bis er getroffen oder berührt wird' }],
          ...(['sicht', 'kegel', 'geraeusch'].includes(bArt) ? [['bemerkt.weite', 'zahl', bArt === 'geraeusch' ? 'Hörweite (px)' : 'Sichtweite (px)']] : []),
          ...(bArt === 'kegel' ? [['bemerkt.kegel', 'zahl', 'Kegelbreite (Grad)']] : []),
          ...(['sicht', 'kegel'].includes(bArt) ? [['bemerkt.nurLicht', 'haken', 'sieht dich im Dunkeln nur im Licht (Laterne verrät dich)']] : []),
          ['ruhig', 'wahl', 'Bewegung, solange ruhig', '', { stehen: 'steht', pendeln_w: 'pendelt waagerecht', pendeln_s: 'pendelt senkrecht', patrouille: 'läuft einen Weg ab (je Gegner im Raum)', umherirren: 'irrt umher' }],
          ['alarm', 'wahl', 'Bewegung, wenn bemerkt', '', { jagen: 'jagt dich', fliehen: 'flieht', bleiben: 'macht weiter wie bisher (greift aber an)', schleichen: 'kommt nur, wenn du wegschaust' }]])}
        <h3>Angriffe</h3>
        <p class="klein">Berührung schadet immer (Schaden oben). Dazu beliebig viele Angriffe, jeder mit Ankündigung.</p>
        ${Object.entries(MODULE).map(([k, [t, e, f]]) => modul(k, t, e, f)).join('')}
        <h3>Verteidigung</h3>
        ${modul('schild', 'Schild', 'Treffer von vorn prallen ab. Er dreht sich langsam zu dir – lauf um ihn herum.', [['schild.drehtempo', 'zahl', 'Drehtempo (Grad/s)']])}
        ${zeilen([['ruestung', 'wahl', 'Rüstung', '', { '': 'keine', schlag: 'erster Treffer betäubt nur, dann verwundbar', betaeubt: 'nur verwundbar, wenn betäubt (Rammen, Kugel)' }]])}
        <h3>Bei Niederlage</h3>
        ${zeilen([['signal', 'signal', 'Signal auslösen', 'Alle Gegner dieser Art lösen es aus und kommen dann nicht wieder. Für einzelne Gegner: im Raum anklicken.']])}
        <div class="modul"><label class="klein kopf"><input type="checkbox" data-gmod="teilen"${a.teilen ? ' checked' : ''}> <b>Teilt sich</b></label>
          ${a.teilen ? `<div class="zeile">${feld('in', `<select data-gp="teilen.art" data-gt="wahl">${Object.entries(artWahl()).map(([k, v]) => `<option value="${k}"${k === a.teilen.art ? ' selected' : ''}>${v}</option>`).join('')}</select>`)}${gFeld(['teilen.anzahl', 'zahl', 'Anzahl'])}</div>` : ''}</div>
        ${modul('explodiert', 'Explodiert', 'Nach der Niederlage blinkt ein roter Kreis, dann explodiert er – trifft auch andere Gegner.', [['explodiert.zeit', 'zahl', 'Zeit bis zur Explosion (s)', '', 0.1], ['explodiert.radius', 'zahl', 'Radius (px)'], ['explodiert.schaden', 'zahl', 'Schaden (½ Herzen)']])}
        <h3>Boss</h3>
        <div class="modul"><label class="klein kopf"><input type="checkbox" data-gmod="boss"${a.boss ? ' checked' : ''}> <b>Ist ein Boss</b></label>
          <small class="erkl">Lebensbalken unten im Bild, kommt nach dem Sieg nicht wieder. Phasen: unter einem Anteil der Lebenspunkte wird er schneller, greift öfter an oder ruft Verstärkung.</small>
          ${a.boss ? `${gFeld(['boss.name', 'text', 'Name im Lebensbalken'])}${phasen}<button data-a="phaseplus">＋ Phase</button>` : ''}</div>
        <h3>Farben</h3><div class="farben">${farbenVon(a.bild).map(f => `<label title="${f}"><input type="color" data-farbe="${f}" value="${(a.farben || {})[f] || f}"></label>`).join('')}
        <button data-a="farbenzurueck">Original</button></div>
        </fieldset>
        <p class="klein">Änderungen wirken sofort im Spiel. Gegner setzt man im Raum über die Werkzeugleiste.</p></div>`;
    zeichneGegnerVorschau();
  }
  function zeichneGegnerVorschau() {
    const cv = $('#ed-gvorschau');
    if (!cv || !offen || Z.ansicht !== 'gegner') return;
    const g = cv.getContext('2d'), b = GEGNERBILD[Z.gegnerArt];
    g.imageSmoothingEnabled = false; g.fillStyle = '#2a552c'; g.fillRect(0, 0, 128, 128);
    if (b) g.drawImage(b[Math.floor(performance.now() / 250) % 2], 0, 0, 32, 32, 0, 16, 128, 128);
    requestAnimationFrame(zeichneGegnerVorschau);
  }
  function gegnerEingabe(e) {
    const t = e.target, a = eigeneArt();
    if (!a) return;
    merke();
    if (t.dataset.farbe) { a.farben = { ...(a.farben || {}) }; if (t.value === t.dataset.farbe) delete a.farben[t.dataset.farbe]; else a.farben[t.dataset.farbe] = t.value; if (!Object.keys(a.farben).length) delete a.farben; }
    else if (t.dataset.gmod) {   // Baustein an/aus
      const k = t.dataset.gmod;
      if (!t.checked) delete a[k];
      else a[k] = k === 'teilen' ? { art: Object.keys(DATEN.gegnerarten).find(x => x !== Z.gegnerArt), anzahl: 2 } : kopie(MODUL_VORGABE[k]);
      speichern(); renderGegner(); return;
    }
    else if (t.dataset.phase !== undefined) {
      const p = a.boss.phasen[Number(t.dataset.phase)], f = t.dataset.pf;
      if (f === 'ab') p.ab = Math.max(1, Math.min(99, Number(t.value))) / 100;
      else if (f === 'tempo' || f === 'pause') p[f] = Number(t.value) || 1;
      else if (f === 'text') { if (t.value.trim()) p.text = t.value.trim().toUpperCase(); else delete p.text; }
      else {
        const [art, n] = Object.entries(p.ruft || {})[0] || ['', 0], neuArt = f === 'ruftArt' ? t.value : art, neuN = f === 'ruftN' ? Number(t.value) : (n || 1);
        if (neuArt && neuN > 0) p.ruft = { [neuArt]: neuN }; else delete p.ruft;
      }
      a.boss.phasen.sort((x, y) => y.ab - x.ab);
      speichern(); renderGegner(); return;
    }
    else if (t.dataset.gp) {
      const pfad = t.dataset.gp, typ = t.dataset.gt;
      let wert = typ === 'haken' ? t.checked : typ === 'zahl' ? Number(t.value) : typ === 'prozent' ? Math.max(0, Math.min(100, Number(t.value))) / 100 : t.value;
      if (typ === 'wahl' && /^[\d.]+$/.test(wert)) wert = Number(wert);
      if (typ === 'signal') wert = signalName(wert) || undefined;
      if (pfad === 'bild') { a.bild = wert; Object.assign(a, kopie(GRUNDBILDER[wert])); delete a.farben; speichern(); renderGegner(); return; }
      if (pfad === 'bemerkt.art' && wert === 'immer') { delete a.bemerkt; speichern(); renderGegner(); return; }
      if (pfad === 'bemerkt.art' && !a.bemerkt) a.bemerkt = { weite: 200, kegel: 80 };
      if (pfad === 'ruestung' && !wert) wert = undefined;
      if ((pfad === 'groesse' && wert === 1) || (pfad === 'gewicht' && wert === 1)) wert = undefined;
      if (typ === 'haken' && !wert && !pfad.startsWith('ki.')) wert = undefined;
      setzen(a, pfad, wert);
      if (pfad === 'boss.name' && a.boss) a.boss.name = String(a.boss.name || '').toUpperCase();
      speichern();
      if (typ === 'wahl' || typ === 'haken' || typ === 'signal') renderGegner();
      return;
    }
    speichern();
  }
  function neueArt(vorlage) {
    const name = prompt('Name der Gegnerart (Kleinbuchstaben, ohne Leerzeichen):', vorlage ? vorlage + '2' : 'wolf');
    if (!name) return;
    let id = slug(name);
    while (DATEN.gegnerarten[id]) id += '2';
    merke();
    eigene.gegnerarten[id] = vorlage ? kopie(DATEN.gegnerarten[vorlage]) : { bild: 'fuchs', lp: 2, tempo: 55, schaden: 1, ...kopie(GRUNDBILDER.fuchs), beute: { herz: 0.2 }, ki: { wegfindung: true, reihe: true } };
    Z.gegnerArt = id; speichern(); renderGegner(); renderWerkzeuge();
  }

  // ---------- Kristalltypen ----------
  // Ein Typ ist eine Farbfolge. Alle Kristalle eines Typs zeigen dieselbe Farbe; ein Schlag auf einen schaltet alle weiter.
  // Pflöcke gehören zu einem Typ und stehen oben, solange er ihre Farbe zeigt.
  function kristallNutzung(id) {
    let kristalle = 0, pfloecke = 0;
    const d = DATEN.dungeons[Z.dungeon];
    if (d) for (const r of Object.values(d.raeume)) for (const o of r.objekte || []) if (o.kristalltyp === id) { if (o.objekt === 'kristall') kristalle++; else pfloecke++; }
    return { kristalle, pfloecke };
  }
  function renderKristalle() {
    const el = $('#ed-kristallansicht'), alle = Object.entries(DATEN.kristalltypen);
    if (!Z.kristallTyp || !DATEN.kristalltypen[Z.kristallTyp]) Z.kristallTyp = alle[0][0];
    const id = Z.kristallTyp, k = DATEN.kristalltypen[id], eigen = !!eigene.kristalltypen[id], n = kristallNutzung(id);
    const bild = (f, oben) => `<img class="kbild" src="${bildUrl(oben === undefined ? KRISTALL[f] : PFLOCK[f][oben ? 1 : 0])}" alt="">`;
    el.innerHTML = `
      <div class="spalte"><h3>Kristalltypen</h3>
        <div class="liste">${alle.map(([kid, t]) => `<button data-ktyp="${kid}" class="${kid === id ? 'an' : ''}">${t.farben.map(f => bild(f)).join('')} ${esc(t.name)} <small>${eigene.kristalltypen[kid] ? 'eigen' : 'eingebaut'}</small></button>`).join('')}</div>
        <div class="knoepfe"><button data-a="ktypneu">Neuer Typ</button><button data-a="ktypkopie">Kopie</button>${eigen ? '<button data-a="ktyploeschen" class="gefahr">Löschen</button>' : ''}</div>
        <p class="klein">Im Raum wählst du bei jedem Kristall und Pflock seinen Typ. Mit der Pipette (Alt+Klick) übernimmst du Typ und Farbe für weitere.</p></div>
      <div class="spalte breit"><h3>${esc(k.name)} ${eigen ? '' : '<small>(eingebaut – als Kopie bearbeiten)</small>'}</h3>
        <fieldset${eigen ? '' : ' disabled'}>
        ${feld('Name', `<input data-k="name" value="${esc(k.name)}">`)}
        <h3>Farben in Schaltreihenfolge</h3>
        <ol class="kfarben">${k.farben.map((f, i) => `<li>${bild(f)} ${bild(f, true)} <b>${farbName(f)}</b>${i === 0 ? ' <small>(zu Beginn)</small>' : ''}
          <span class="knoepfe"><button data-a="kfarbe" data-i="${i}" data-r="-1"${i === 0 ? ' disabled' : ''} title="nach vorn">▲</button><button data-a="kfarbe" data-i="${i}" data-r="1"${i === k.farben.length - 1 ? ' disabled' : ''} title="nach hinten">▼</button><button data-a="kfarbeweg" data-i="${i}"${k.farben.length <= 2 ? ' disabled' : ''} title="entfernen">×</button></span></li>`).join('')}</ol>
        <div class="knoepfe">${Object.keys(KFARBEN).filter(f => !k.farben.includes(f)).map(f => `<button data-a="kfarbeplus" data-f="${f}">${bild(f)} + ${farbName(f)}</button>`).join('')}</div>
        </fieldset>
        <p class="klein">Ablauf: ${k.farben.map(farbName).join(' → ')} → ${farbName(k.farben[0])} … Jeder Schwertschlag auf einen Kristall dieses Typs schaltet <b>alle</b> Kristalle des Typs weiter, im ganzen Dungeon.
          Ein Pflock steht oben, solange sein Typ seine Farbe zeigt. Türen und Objekte können die Farbe als Bedingung abfragen („Kristall ${esc(k.name)} zeigt …“).</p>
        <p class="klein">Im aktuellen Dungeon: ${n.kristalle} Kristalle, ${n.pfloecke} Pflöcke dieses Typs.</p></div>`;
  }
  function kristallAktion(a, el) {
    const id = Z.kristallTyp, k = eigene.kristalltypen[id];
    if (a === 'ktypneu' || a === 'ktypkopie') {
      const vorlage = a === 'ktypkopie' ? DATEN.kristalltypen[id] : null;
      const name = prompt('Name des Kristalltyps:', vorlage ? vorlage.name + ' 2' : 'Rot/Grün/Blau');
      if (!name) return;
      let nid = slug(name); while (DATEN.kristalltypen[nid]) nid += '2';
      merke(); eigene.kristalltypen[nid] = { name, farben: vorlage ? [...vorlage.farben] : ['rot', 'gruen', 'blau'] };
      Z.kristallTyp = nid;
    } else if (a === 'ktyploeschen') {
      const n = Object.values(eigene.dungeons).reduce((s, d) => s + Object.values(d.raeume).reduce((t, r) => t + (r.objekte || []).filter(o => o.kristalltyp === id).length, 0), 0);
      if (!confirm(n ? `${n} Kristalle oder Pflöcke in eigenen Dungeons nutzen diesen Typ. Trotzdem löschen?` : 'Kristalltyp löschen?')) return;
      merke(); delete eigene.kristalltypen[id]; Z.kristallTyp = null;
    } else if (!k) return;
    else if (a === 'kfarbe') { merke(); const i = Number(el.dataset.i), j = i + Number(el.dataset.r); [k.farben[i], k.farben[j]] = [k.farben[j], k.farben[i]]; }
    else if (a === 'kfarbeweg') { merke(); k.farben.splice(Number(el.dataset.i), 1); }
    else if (a === 'kfarbeplus') { merke(); k.farben.push(el.dataset.f); }
    speichern(); renderKristalle(); renderWerkzeuge();
  }

  // ---------- Aktionen (Knöpfe) ----------
  function aktion(a, el) {
    const d = dg();
    if (a.startsWith('ktyp') || a.startsWith('kfarbe')) { kristallAktion(a, el); return; }
    switch (a) {
      case 'neu': neuerDungeon(); break;
      case 'umbenennen': { const t = prompt('Neuer Name:', d.titel); if (t) { merke(); d.titel = t.toUpperCase(); speichern(); renderLinks(); } break; }
      case 'dungeonloeschen':
        if (confirm(`Dungeon „${d.titel}“ wirklich löschen?`)) { merke(); delete eigene.dungeons[Z.dungeon]; Z.dungeon = Object.keys(eigene.dungeons)[0] || null; Z.raum = Z.dungeon ? dg().start.raum : null; speichern(); render(); }
        break;
      case 'testdungeon': teste(null); break;
      case 'testraum': teste(Z.raum); break;
      case 'startraum': merke(); d.start = { raum: Z.raum, feld: [9.5, 8.5] }; aenderung(); renderRechts(); break;
      case 'raumloeschen': loescheRaum(); break;
      case 'nachbar': { merke(); const r = raum(), [dx, dy] = RICHTUNG[el.dataset.dir]; legeRaumAn(r.pos[0] + dx, r.pos[1] + dy, [Z.raum, r]); speichern(); render(); break; }
      case 'befuellen': merke(); befuelle(raum()); Z.auswahl = null; aenderung(); renderRechts(); break;
      case 'auswahlweg': merke(); raum()[Z.auswahl.liste].splice(Z.auswahl.i, 1); Z.auswahl = null; aenderung(); renderRechts(); break;
      case 'alleGleichen': {
        const r = raum(), a = r.objekte[Z.auswahl.i], { objekt, ...v } = ohneFeld(a), gleiche = r.objekte.filter(o => o !== a && o.objekt === objekt);
        if (!gleiche.length) { alert('Es gibt keine weiteren Objekte dieser Art im Raum.'); break; }
        merke(); gleiche.forEach(o => { for (const k of Object.keys(o)) if (k !== 'objekt' && k !== 'feld') delete o[k]; Object.assign(o, kopie(v)); });
        aenderung(); break;
      }
      case 'bedplus': schreibeBedingung(el.closest('.bed'), z => z.teile.push({ s: z.teile.length ? z.teile[z.teile.length - 1].s : 'geraeumt', nicht: false })); break;
      case 'bedweg': schreibeBedingung(el.closest('.bed'), z => { z.teile.splice(Number(el.dataset.i), 1); if (!z.teile.length) z.modus = 'immer'; }); break;
      case 'welleplus': { merke(); const r = raum(); r.wellen = [...(r.wellen || []), [Object.keys(DATEN.gegnerarten)[0]]]; aenderung(); renderRechts(); break; }
      case 'welleweg': { merke(); const r = raum(); r.wellen.splice(Number(el.dataset.i), 1); if (!r.wellen.length) delete r.wellen; aenderung(); renderRechts(); break; }
      case 'json':
        try {
          const neu = JSON.parse($('#ed-json').value);
          if (!Array.isArray(neu.karte) || !neu.tueren) throw new Error('karte und tueren fehlen');
          merke(); d.raeume[Z.raum] = neu; normalisiereRaum(neu); if (!neu.objekte) neu.objekte = []; if (!neu.gegner) neu.gegner = [];
          Z.auswahl = null; speichern(); render();
        } catch (e) { alert('Kein gültiger Raum: ' + e.message); }
        break;
      case 'export': {
        const blob = new Blob([JSON.stringify(eigene, null, 2)], { type: 'application/json' }), link = document.createElement('a');
        link.href = URL.createObjectURL(blob); link.download = 'waldwacht-eigene.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        break;
      }
      case 'import': $('#ed-datei').click(); break;
      case 'artneu': neueArt(null); break;
      case 'artkopie': neueArt(Z.gegnerArt); break;
      case 'artloeschen': {
        const benutzt = Object.values(eigene.dungeons).some(dd => Object.values(dd.raeume).some(r => r.gegner.some(g => g.gegner === Z.gegnerArt) || (r.wellen || []).flat().includes(Z.gegnerArt)));
        if (!confirm(benutzt ? 'Diese Art wird in eigenen Dungeons benutzt. Trotzdem löschen?' : 'Gegnerart löschen?')) break;
        merke(); delete eigene.gegnerarten[Z.gegnerArt]; Z.gegnerArt = null; speichern(); renderGegner(); renderWerkzeuge(); break;
      }
      case 'phaseplus': { const a = eigeneArt(); if (!a) break; merke(); const letzte = a.boss.phasen[a.boss.phasen.length - 1]; a.boss.phasen.push({ ab: letzte ? Math.max(0.1, letzte.ab - 0.25) : 0.5, tempo: 1.2, pause: 0.8 }); speichern(); renderGegner(); break; }
      case 'phaseweg': { const a = eigeneArt(); if (!a) break; merke(); a.boss.phasen.splice(Number(el.dataset.i), 1); speichern(); renderGegner(); break; }
      case 'wegzeichnen': Z.werkzeug = { art: 'weg' }; renderWerkzeuge(); break;
      case 'wegloeschen': { merke(); delete raum().gegner[Z.auswahl.i].weg; aenderung(); renderRechts(); break; }
      case 'farbenzurueck': if (eigene.gegnerarten[Z.gegnerArt]) { merke(); delete eigene.gegnerarten[Z.gegnerArt].farben; speichern(); renderGegner(); } break;
    }
  }
  function importiere(datei) {
    const leser = new FileReader();
    leser.onload = () => {
      try {
        const e = JSON.parse(leser.result);
        if (e.format !== 1 || !e.dungeons) throw new Error('keine Waldwacht-Datei');
        const doppelt = [...Object.keys(e.dungeons).filter(k => eigene.dungeons[k]), ...Object.keys(e.gegnerarten || {}).filter(k => eigene.gegnerarten[k]), ...Object.keys(e.kristalltypen || {}).filter(k => eigene.kristalltypen[k])];
        if (doppelt.length && !confirm(`${doppelt.length} Einträge gibt es schon und werden überschrieben. Weiter?`)) return;
        merke();
        Object.assign(eigene.dungeons, e.dungeons); Object.assign(eigene.gegnerarten, e.gegnerarten || {}); Object.assign(eigene.kristalltypen, e.kristalltypen || {});
        for (const d of Object.values(e.dungeons)) for (const r of Object.values(d.raeume)) for (const o of r.objekte || []) migriereObjekt(o);
        if (!dg()) { Z.dungeon = Object.keys(eigene.dungeons)[0] || null; Z.raum = Z.dungeon ? dg().start.raum : null; }
        speichern(); render();
      } catch (err) { alert('Import fehlgeschlagen: ' + err.message); }
    };
    leser.readAsText(datei);
  }
  function teste(raumId) { schliesse(); vergissHintergruende(Z.dungeon); starteDungeon(Z.dungeon, raumId); S.ausEditor = true; }

  // ---------- Aufbau ----------
  const CSS = `
  #editor{position:fixed;inset:0;z-index:20;background:#120d14;color:#cfd6cf;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    display:flex;flex-direction:column;touch-action:auto;user-select:text}
  #editor header{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#1c1e26;border-bottom:1px solid #2e313b;flex-wrap:wrap}
  #editor header h2{margin:0 12px 0 0;font-size:16px;color:#f4cd5e}
  #editor .ansichten{display:flex;flex:1;overflow:auto;gap:12px;padding:12px}
  #editor h3{margin:14px 0 6px;font-size:13px;color:#f4cd5e} #editor h3 small{color:#848e92;font-weight:normal}
  #editor .spalte{flex:0 0 250px;overflow:auto} #editor #ed-rechts{flex-basis:290px} #editor .spalte.breit{flex:1 1 320px} #editor .mitte{flex:1 1 auto;min-width:320px;overflow:auto}
  #editor button,#editor select,#editor input,#editor textarea{font:inherit;color:#ece8d6;background:#2e313b;border:1px solid #454a55;border-radius:4px;padding:4px 7px}
  #editor button{cursor:pointer} #editor button:hover{border-color:#a9b2b0} #editor button:disabled{opacity:.4;cursor:default}
  #editor button.an{background:#5e3826;border-color:#e0a33a} #editor button.haupt{background:#376a31;border-color:#58933b} #editor button.gefahr{border-color:#a3343a}
  #editor textarea{width:100%;box-sizing:border-box;resize:vertical} #editor select{max-width:100%}
  #editor .knoepfe{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0} #editor .zeile{display:flex;gap:8px} #editor .zeile>*{flex:1}
  #editor .feld{display:block;margin:6px 0} #editor .feld>span{display:block;color:#a9b2b0;font-size:12px;margin-bottom:2px}
  #editor .feld input,#editor .feld select{width:100%;box-sizing:border-box} #editor .feld i{font-style:normal;color:#8098cc;cursor:help}
  #editor .klein{font-size:12px;color:#a9b2b0} #editor label.klein{display:block;margin:3px 0}
  #editor .kartenrahmen{overflow:auto;max-height:260px;border:1px solid #2e313b} #editor #ed-karte{display:block;cursor:pointer}
  #editor #ed-raum{display:block;width:100%;max-width:960px;image-rendering:pixelated;cursor:crosshair;border:1px solid #2e313b}
  #editor #ed-werkzeuge{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px}
  #editor .gruppe{display:flex;flex-wrap:wrap;gap:3px;align-items:center} #editor .gruppe>span{font-size:11px;color:#848e92;margin-right:2px}
  #editor .wz{padding:2px;min-width:38px;min-height:38px} #editor .wz canvas{display:block;image-rendering:pixelated;width:32px;height:32px}
  #editor .tuer{margin:6px 0;padding:6px;background:#1c1e26;border-radius:4px} #editor .tuer select{margin-top:3px}
  #editor .warnungen ul{margin:4px 0;padding-left:18px;color:#d0574a} #editor .ok{color:#8abd4f}
  #editor .liste{display:flex;flex-direction:column;gap:3px} #editor .liste button{text-align:left} #editor .liste small{color:#848e92}
  #editor .vorschau canvas{image-rendering:pixelated;border:1px solid #2e313b} #editor fieldset{border:0;padding:0;margin:0}
  #editor .farben{display:flex;gap:6px;flex-wrap:wrap;align-items:center} #editor .farben input{width:40px;height:30px;padding:0}
  #editor details textarea{font:12px monospace}
  #editor .erkl{display:block;color:#848e92;font-size:11.5px;line-height:1.35;margin-top:3px}
  #editor .bed{display:flex;flex-direction:column;gap:4px;padding:5px;background:#16181f;border:1px solid #2e313b;border-radius:4px}
  #editor .bed select{width:100%} #editor .bteil{display:flex;gap:4px} #editor .bteil select[data-bs]{flex:1;min-width:0} #editor .bteil select[data-bn]{width:auto}
  #editor .bed button{align-self:flex-start} #editor .bed code{font-size:11px;word-break:break-all}
  #editor .erklaerung{margin:10px 0;padding:6px 8px;background:#1c1e26;border-radius:4px;font-size:12px} #editor .erklaerung summary{cursor:pointer;color:#8098cc}
  #editor .erklaerung p{margin:6px 0}
  #editor .vorlage{font-size:12px;margin:-2px 0 6px;color:#ece8d6} #editor .marke{background:#5e3826;border:1px solid #e0a33a;border-radius:3px;padding:0 4px;font-size:11px}
  #editor .welle{display:flex;gap:4px;align-items:center;margin:3px 0} #editor .welle label{display:flex;align-items:center}
  #editor .welle img{width:22px;height:22px;image-rendering:pixelated} #editor .welle input{width:42px;padding:2px}
  #editor .kbild{width:24px;height:24px;image-rendering:pixelated;vertical-align:middle;object-fit:contain}
  #editor .modul{margin:6px 0;padding:6px 8px;background:#1c1e26;border-radius:4px} #editor .modul .kopf{margin:0}
  #editor .phase{margin:6px 0;padding:6px;border:1px solid #2e313b;border-radius:4px} #editor .erkl-inline{color:#848e92}
  #editor .kfarben{padding-left:20px} #editor .kfarben li{margin:4px 0} #editor .kfarben .knoepfe{display:inline-flex;margin:0 0 0 8px}
  @media (max-width:900px){#editor .ansichten{flex-direction:column} #editor .spalte{flex:none}}`;
  function baue() {
    const stil = document.createElement('style'); stil.textContent = CSS; document.head.appendChild(stil);
    wurzel = document.createElement('div'); wurzel.id = 'editor';
    wurzel.innerHTML = `
      <header><h2>Waldwacht-Editor</h2>
        <button data-ansicht="dungeon">Dungeons &amp; Räume</button><button data-ansicht="gegner">Gegnerarten</button><button data-ansicht="kristalle">Kristalltypen</button>
        <span style="flex:1"></span><button data-a2="zurueck" title="Strg+Z">↶ Rückgängig</button><button data-a2="spiel">Zum Spiel</button></header>
      <div class="ansichten" id="ed-dungeonansicht">
        <div class="spalte" id="ed-links"></div>
        <div class="mitte"><div id="ed-werkzeuge"></div><div id="ed-vorlage" class="vorlage"></div><canvas id="ed-raum" width="${BREITE}" height="${HOEHE}"></canvas>
          <p class="klein">Rand und Türen sind fest, Türen stellst du rechts ein. Ein eingestelltes Objekt ist die Vorlage für alle weiteren seiner Art.</p></div>
        <div class="spalte" id="ed-rechts"></div>
      </div>
      <div class="ansichten" id="ed-gegneransicht"></div>
      <div class="ansichten" id="ed-kristallansicht"></div>`;
    document.body.appendChild(wurzel);
    wurzel.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.ansicht) { Z.ansicht = b.dataset.ansicht; render(); }
      else if (b.dataset.a2 === 'zurueck') zurueck();
      else if (b.dataset.a2 === 'spiel') { schliesse(); }
      else if (b.dataset.art) { Z.gegnerArt = b.dataset.art; renderGegner(); }
      else if (b.dataset.ktyp) { Z.kristallTyp = b.dataset.ktyp; renderKristalle(); }
      else if (b.dataset.a) aktion(b.dataset.a, b);
    });
    wurzel.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'ed-dungeonwahl') { Z.dungeon = t.value; Z.raum = dg().start.raum; Z.auswahl = null; render(); }
      else if (t.dataset.a === 'kopie' && t.value) kopiereDungeon(t.value);
      else if (t.id === 'ed-datei' && t.files[0]) importiere(t.files[0]);
      else if (t.closest('#ed-rechts')) eingabe(e);
      else if (t.closest('#ed-gegneransicht')) gegnerEingabe(e);
      else if (t.dataset.k === 'name' && eigene.kristalltypen[Z.kristallTyp]) { merke(); eigene.kristalltypen[Z.kristallTyp].name = t.value.trim() || Z.kristallTyp; speichern(); renderKristalle(); }
    });
    // Raum-Leinwand: malen mit Maus/Stift/Finger
    const cvRaum = $('#ed-raum'), feldUnter = e => { const b = cvRaum.getBoundingClientRect(); return [Math.floor((e.clientX - b.left) / b.width * SPALTEN), Math.floor((e.clientY - b.top) / b.height * ZEILEN)]; };
    cvRaum.addEventListener('contextmenu', e => e.preventDefault());
    cvRaum.addEventListener('pointerdown', e => {
      e.preventDefault(); cvRaum.setPointerCapture(e.pointerId);
      const f = feldUnter(e), rechts = e.button === 2;
      if (e.altKey) { pipette(...f); return; }
      if ((Z.form === 'rechteck' || e.shiftKey) && Z.werkzeug.art !== 'weg' && (rechts || ['kachel', 'objekt', 'gegner', 'radierer'].includes(Z.werkzeug.art))) { Z.rechteck = { a: f, b: f, rechts }; zeichneRaum(); return; }
      Z.malt = { rechts, letztes: f.join() }; anwenden(...f, true, rechts);
    });
    cvRaum.addEventListener('pointermove', e => {
      Z.maus = feldUnter(e);
      if (Z.rechteck) Z.rechteck.b = Z.maus.map((v, i) => Math.max(i ? 2 : 1, Math.min(i ? ZEILEN - 2 : SPALTEN - 2, v)));
      else if (Z.malt && Z.maus.join() !== Z.malt.letztes) { Z.malt.letztes = Z.maus.join(); anwenden(...Z.maus, false, Z.malt.rechts); }
      zeichneRaum();
    });
    cvRaum.addEventListener('pointerup', () => {
      if (Z.rechteck) { const re = Z.rechteck; Z.rechteck = null; fuelleRechteck(re); }
      if (Z.malt) { Z.malt = false; renderRechts(); }
    });
    cvRaum.addEventListener('pointerleave', () => { Z.maus = null; zeichneRaum(); });
    // Dungeon-Karte: Raum wählen oder anlegen (wird bei jedem Zeichnen neu erzeugt, darum delegiert)
    wurzel.addEventListener('pointerdown', e => {
      if (e.target.id !== 'ed-karte') return;
      const b = e.target.getBoundingClientRect(), k = kartenRahmen();
      const x = k.x0 + Math.floor((e.clientX - b.left) / KZ.w), y = k.y0 + Math.floor((e.clientY - b.top) / KZ.h), rm = raumBei(x, y);
      if (rm) { Z.raum = rm[0]; Z.auswahl = null; render(); return; }
      merke();
      const r = raum(), neben = r && r.pos && Math.abs(r.pos[0] - x) + Math.abs(r.pos[1] - y) === 1;
      legeRaumAn(x, y, neben ? [Z.raum, r] : null); speichern(); render();
    });
    addEventListener('keydown', e => {
      if (!offen) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.target.closest('input,textarea')) { e.preventDefault(); zurueck(); }
    });
  }
  function render() {
    $('#ed-dungeonansicht').style.display = Z.ansicht === 'dungeon' ? '' : 'none';
    $('#ed-gegneransicht').style.display = Z.ansicht === 'gegner' ? '' : 'none';
    $('#ed-kristallansicht').style.display = Z.ansicht === 'kristalle' ? '' : 'none';
    wurzel.querySelectorAll('[data-ansicht]').forEach(b => b.classList.toggle('an', b.dataset.ansicht === Z.ansicht));
    renderWerkzeuge();
    if (Z.ansicht === 'gegner') { renderGegner(); return; }
    if (Z.ansicht === 'kristalle') { renderKristalle(); return; }
    renderLinks(); renderRechts(); zeichneRaum();
  }
  function oeffne() {
    if (!wurzel) baue();
    eigene = ladeEigene();
    for (const d of Object.values(eigene.dungeons)) for (const r of Object.values(d.raeume)) for (const o of r.objekte || []) migriereObjekt(o);
    if (!Z.dungeon || !dg()) { Z.dungeon = Object.keys(eigene.dungeons)[0] || null; Z.raum = Z.dungeon ? dg().start.raum : null; }
    if (Z.dungeon && !raum()) Z.raum = dg().start.raum;
    offen = true; S = null;
    gehalten.clear(); gedrueckt.clear();
    document.body.classList.add('editor'); wurzel.style.display = '';
    render();
  }
  function schliesse() { offen = false; wurzel.style.display = 'none'; document.body.classList.remove('editor'); skaliere(); }
  return { oeffne, schliesse, get offen() { return offen; } };
})();
