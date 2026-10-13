// Waldwacht – Editor für Dungeons, Räume, Objekte, Gegner und Gegnerarten.
// Wird vom Spiel erst geladen, wenn im Menü „EDITOR“ gewählt wird, und nutzt dessen Daten, Grafik und Funktionen
// (DATEN, baueHintergrund, zeichneBild, Sprites, GEGNERBILD, pruefeDaten, uebernehmeEigene, starteDungeon …).
// Gespeichert wird im Browser (localStorage, EIGENE_SCHLUESSEL) im selben JSON-Format wie der Block spieldaten:
//   { format: 1, dungeons: { id: dungeon }, gegnerarten: { id: gegnerart } }
// Räume im Editor-Format: karte nur mit Gelände (# . ~), Objekte und Gegner als Listen mit feld [spalte, zeile],
// dazu pos [x, y] für die Dungeon-Karte. Eingebaute Dungeons lassen sich als Kopie übernehmen (werden dabei umgewandelt).
'use strict';
const Editor = (() => {
  // ---------- Zustand ----------
  let offen = false, wurzel = null, eigene = ladeEigene(), rueckgaengig = [];
  const Z = {
    ansicht: 'dungeon',            // dungeon | gegner
    dungeon: null, raum: null,
    werkzeug: { art: 'kachel', wert: '#' },
    auswahl: null,                 // { liste: 'objekte' | 'gegner', i }
    gegnerArt: null,
    maus: null, malt: false,
    fuellen: { hindernisse: 'mittel', buesche: true, abgruende: false, gegner: 3, arten: ['fuchs'], auto: true },
  };
  try { Object.assign(Z.fuellen, JSON.parse(localStorage.getItem('waldwacht.editor') || '{}')); } catch (e) { /* Voreinstellung */ }

  const LICHT = ['hell', 'daemmrig', 'dunkel', 'finster'];
  const TUERARTEN = { keine: 'keine', offen: 'offen', schloss: 'Schloss', kampf: 'Kampf (offen, wenn geräumt)', bedingung: 'Bedingung' };
  const RICHTUNGSNAME = { n: 'Norden', o: 'Osten', s: 'Süden', w: 'Westen' };
  const GRUNDBILDER = { fuchs: { fuss: [11, 6], koerper: [26, 20] }, hase: { fuss: [8, 5], koerper: [18, 16] }, huhn: { fuss: [8, 5], koerper: [18, 18] } };
  // Parameter je Objekt, abhängig von den Eigenschaften seiner Art
  const PARAMETER = {
    lesbar: [['text', 'lang', 'Text']],
    oeffnbar: [['inhalt', 'gegenstand', 'Inhalt']],
    platte: [['signal', 'text', 'Signal (Name)'], ['wer', 'block|alle', 'Wer drückt sie?']],
    kristall: [['signal', 'text', 'Signal (Name)']],
    pflock: [['farbe', 'blau|orange', 'Farbe'], ['oben_wenn', 'bedingung', 'Oben, wenn']],
    leuchtet: [['an', 'janein', 'Brennt'], ['an_wenn', 'bedingung', 'Brennt nur, wenn'], ['merken', 'janein', 'einmal an = bleibt an']],
  };
  const VORGABE = {
    schild: { text: 'Text des Schilds' }, truhe: { inhalt: 'schluessel' }, platte: { signal: 'platte', wer: 'block' },
    kristall: { signal: 'kristall' }, pflock: { farbe: 'blau', oben_wenn: { nicht: 'kristall' } },
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
  function bedingungText(b) {
    if (b === undefined || b === null) return '';
    if (typeof b === 'string') return b;
    if (b.nicht !== undefined && typeof b.nicht === 'string') return 'nicht ' + b.nicht;
    if (b.alle && b.alle.every(x => typeof x === 'string')) return b.alle.join(' und ');
    if (b.eine && b.eine.every(x => typeof x === 'string')) return b.eine.join(' oder ');
    return JSON.stringify(b);
  }
  function textBedingung(t) {   // "signal" · "nicht signal" · "a und b" · "a oder b" · JSON
    t = t.trim();
    if (!t) return undefined;
    if (t.startsWith('{')) { try { return JSON.parse(t); } catch (e) { alert('Bedingung ist kein gültiges JSON.'); return undefined; } }
    if (/^nicht\s+\S+$/.test(t)) return { nicht: t.split(/\s+/)[1] };
    if (/\sund\s/.test(t)) return { alle: t.split(/\s+und\s+/) };
    if (/\soder\s/.test(t)) return { eine: t.split(/\s+oder\s+/) };
    return t;
  }
  function slug(t) {
    return t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'neu';
  }

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
      if (art === 'bedingung') { t.offen_wenn = bedingung === undefined ? 'signal' : bedingung; if (merken) t.merken = true; }
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
  function anwenden(c, rr, erster, rechts) {
    const r = raum();
    if (!r) return;
    const w = rechts ? { art: 'radierer' } : Z.werkzeug;
    const iO = r.objekte.findIndex(o => o.feld[0] === c && o.feld[1] === rr), iG = r.gegner.findIndex(g => g.feld[0] === c && g.feld[1] === rr);
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
      if (iO >= 0 && r.objekte[iO].objekt === w.wert) { if (erster) { Z.auswahl = { liste: 'objekte', i: iO }; renderRechts(); } return; }
      raus(); setzeKachel('.');
      r.objekte.push({ objekt: w.wert, feld: [c, rr], ...kopie(VORGABE[w.wert] || {}) }); sortiere(r);
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
    aenderung();
    if (erster) renderRechts();
  }

  // ---------- Zeichnen ----------
  function vorschauObjekt(g, o, r) {
    const t = DATEN.objektarten[o.objekt], [c, rr] = o.feld, x = c * T, y = rr * T;
    if (!t) { g.fillStyle = '#d0574a'; g.fillRect(x + 8, y + 8, 16, 16); return; }
    if (t.platte) g.drawImage(PLATTE[0], x, y);
    else if (t.pflock) g.drawImage(PFLOCK[o.farbe || 'blau'][1], x, y);
    else if (t.kristall) g.drawImage(KRISTALL[0], x + 2, y - 2);
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
    for (const e of r.gegner) {
      const b = GEGNERBILD[e.gegner];
      if (b) g.drawImage(b[0], e.feld[0] * T, e.feld[1] * T - 8);
      else { g.fillStyle = '#d0574a'; g.fillRect(e.feld[0] * T + 6, e.feld[1] * T + 6, 20, 20); }
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
    if (Z.maus && innen(...Z.maus)) { g.strokeStyle = 'rgba(255,251,236,.7)'; g.lineWidth = 2; g.strokeRect(Z.maus[0] * T + 1, Z.maus[1] * T + 1, T - 2, T - 2); }
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
    gruppe('Werkzeug', [knopf('auswahl', null, 'Auswählen'), knopf('radierer', null, 'Radierer'), knopf('start', null, 'Startpunkt')]);
    gruppe('Gelände', [
      knopf('kachel', KACHELZEICHEN.mauer, 'Mauer', symbol(g => mauerKrone(g, 0, 0, zufall(3)))),
      knopf('kachel', KACHELZEICHEN.boden, 'Boden', symbol(g => zeichneBild(g, 'gras_0', 0, 0))),
      knopf('kachel', KACHELZEICHEN.abgrund, 'Abgrund', symbol(g => abgrundKachel(g, 0, 0, () => false))),
    ]);
    gruppe('Objekte', Object.keys(DATEN.objektarten).map(a => knopf('objekt', a, a, symbol(g => { g.translate(0, 2); vorschauObjekt(g, { objekt: a, feld: [0, 0], ...(VORGABE[a] || {}) }); }))));
    gruppe('Gegner', Object.keys(DATEN.gegnerarten).map(a => knopf('gegner', a, a, symbol(g => g.drawImage(GEGNERBILD[a][0], 0, 0)))));
  }

  // ---------- Formulare ----------
  function feld(label, inhalt, hilfe = '') { return `<label class="feld"><span>${label}${hilfe ? ` <i title="${esc(hilfe)}">?</i>` : ''}</span>${inhalt}</label>`; }
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

  function renderRechts() {
    const el = $('#ed-rechts'), r = raum(), d = dg();
    if (!r) { el.innerHTML = ''; return; }
    const tueren = Object.keys(RICHTUNG).map(dir => {
      const nb = nachbar(dir), t = r.tueren[dir], art = tuerArt(t);
      if (!nb) return `<div class="tuer"><b>${RICHTUNGSNAME[dir]}</b> <span class="klein">kein Nachbarraum</span> <button data-a="nachbar" data-dir="${dir}">Raum anlegen</button></div>`;
      return `<div class="tuer"><b>${RICHTUNGSNAME[dir]}</b> → ${esc(nb[1].nr)} ${esc(nb[1].titel)}<br>
        <select data-tuer="${dir}">${Object.entries(TUERARTEN).map(([k, v]) => `<option value="${k}"${k === art ? ' selected' : ''}>${v}</option>`).join('')}</select>
        ${art === 'bedingung' ? `<input data-tuerbed="${dir}" value="${esc(bedingungText(t.offen_wenn))}" placeholder="signal"> <label class="klein"><input type="checkbox" data-tuermerk="${dir}"${t.merken ? ' checked' : ''}> bleibt offen</label>` : ''}</div>`;
    }).join('');
    const a = Z.auswahl && r[Z.auswahl.liste][Z.auswahl.i];
    let auswahl = '<p class="klein">Mit dem Werkzeug „Auswählen“ ein Objekt oder einen Gegner anklicken, um es einzustellen.</p>';
    if (a && Z.auswahl.liste === 'gegner') auswahl = feld('Gegnerart', auswahlfeld('a.gegner', a.gegner, Object.fromEntries(Object.keys(DATEN.gegnerarten).map(k => [k, k])))) + `<button data-a="auswahlweg" class="gefahr">Entfernen</button>`;
    else if (a) {
      const t = DATEN.objektarten[a.objekt] || {};
      const felder = Object.entries(PARAMETER).filter(([eig]) => t[eig]).flatMap(([, f]) => f);
      auswahl = `<p><b>${esc(a.objekt)}</b> auf Feld ${a.feld.join(', ')}</p>` + felder.map(([name, typ, label]) => {
        if (typ === 'lang') return feld(label, `<textarea data-f="a.${name}" rows="4">${esc(a[name])}</textarea>`);
        if (typ === 'gegenstand') return feld(label, auswahlfeld('a.' + name, a[name], Object.fromEntries(Object.keys(DATEN.gegenstaende).map(k => [k, k]))));
        if (typ === 'janein') return feld(label, haken('a.' + name, name === 'an' ? a[name] !== false : a[name]));
        if (typ === 'bedingung') return feld(label, `<input data-fb="a.${name}" value="${esc(bedingungText(a[name]))}" placeholder="z. B. kristall, nicht kristall">`);
        if (typ.includes('|')) return feld(label, auswahlfeld('a.' + name, a[name], Object.fromEntries(typ.split('|').map(k => [k, k]))));
        return feld(label, textfeld('a.' + name, a[name]));
      }).join('') + feld('Sichtbar, wenn', `<input data-fb="a.sichtbar_wenn" value="${esc(bedingungText(a.sichtbar_wenn))}" placeholder="immer">`, 'z. B. geraeumt – Truhe erscheint erst nach dem Kampf') +
        `<button data-a="auswahlweg" class="gefahr">Entfernen</button>`;
    }
    const f = Z.fuellen;
    el.innerHTML = `
      <h3>Raum ${esc(r.nr)} <small>(${esc(Z.raum)})</small></h3>
      ${feld('Titel', textfeld('r.titel', r.titel))}
      <div class="zeile">${feld('Nr.', textfeld('r.nr', r.nr))}${feld('Licht', auswahlfeld('r.licht', typeof r.licht === 'number' ? 'hell' : (r.licht || 'hell'), Object.fromEntries(LICHT.map(l => [l, l]))))}</div>
      <label class="klein"><input type="checkbox" data-f="r.kampf"${r.kampf ? ' checked' : ''}> Kampfraum (Türen erst offen, wenn geräumt; Gegner kommen nicht wieder)</label>
      ${feld('Einstiegstext', `<textarea data-f="r.einstieg" rows="2" placeholder="erscheint beim ersten Betreten">${esc(r.einstieg)}</textarea>`)}
      ${feld('Wellen', `<textarea data-f="r.wellen" rows="2" placeholder="je Zeile eine Welle: fuchs, fuchs, silber">${esc((r.wellen || []).map(w => w.join(', ')).join('\n'))}</textarea>`, 'Gegner erscheinen Welle für Welle; am besten mit Kampfraum')}
      <div class="knoepfe"><button data-a="testraum" class="haupt">▶ Raum testen</button><button data-a="startraum"${d.start.raum === Z.raum ? ' disabled' : ''}>Als Startraum</button><button data-a="raumloeschen" class="gefahr">Löschen</button></div>
      <h3>Türen</h3>${tueren}
      <h3>Auswahl</h3>${auswahl}
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

  // Eingaben im rechten Bereich: r.* Raum, a.* ausgewähltes Objekt/Gegner, f.* Befüllen
  function eingabe(e) {
    const t = e.target, r = raum();
    if (t.dataset.tuer) { const dir = t.dataset.tuer; setzeTuer(dir, t.value, t.value === 'bedingung' ? (r.tueren[dir] && r.tueren[dir].offen_wenn !== 'geraeumt' ? r.tueren[dir].offen_wenn : undefined) : undefined, r.tueren[dir] && r.tueren[dir].merken); return; }
    if (t.dataset.tuerbed || t.dataset.tuermerk) {
      const dir = t.dataset.tuerbed || t.dataset.tuermerk, alt = r.tueren[dir];
      setzeTuer(dir, 'bedingung', t.dataset.tuerbed ? textBedingung(t.value) : alt.offen_wenn, t.dataset.tuermerk ? t.checked : alt.merken);
      return;
    }
    if (t.dataset.fart) { const f = Z.fuellen; f.arten = t.checked ? [...new Set([...f.arten, t.dataset.fart])] : f.arten.filter(a => a !== t.dataset.fart); speichern(); return; }
    const name = t.dataset.f || t.dataset.fb;
    if (!name) return;
    const [bereich, schluessel] = name.split('.');
    let wert = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value;
    if (t.dataset.fb) wert = textBedingung(t.value);
    if (bereich === 'f') { Z.fuellen[schluessel] = wert; speichern(); return; }
    merke();
    if (bereich === 'r') {
      if (schluessel === 'wellen') wert = t.value.split('\n').map(z => z.split(',').map(s => s.trim()).filter(Boolean)).filter(w => w.length);
      if (schluessel === 'kampf') {   // Kampfraum: offene Türen werden Kampftüren und umgekehrt
        for (const tuer of Object.values(r.tueren)) {
          if (wert && tuerArt(tuer) === 'offen') tuer.offen_wenn = 'geraeumt';
          if (!wert && tuerArt(tuer) === 'kampf') delete tuer.offen_wenn;
        }
      }
      if (wert === '' || (Array.isArray(wert) && !wert.length) || wert === false) delete r[schluessel]; else r[schluessel] = wert;
      if (schluessel === 'kampf') renderRechts();
    } else if (bereich === 'a') {
      const a = r[Z.auswahl.liste][Z.auswahl.i];
      if (schluessel === 'an') { if (wert) delete a.an; else a.an = false; }
      else if (wert === undefined || wert === '' || wert === false) delete a[schluessel]; else a[schluessel] = wert;
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
  function renderGegner() {
    const el = $('#ed-gegneransicht'), alle = Object.entries(DATEN.gegnerarten);
    if (!Z.gegnerArt || !DATEN.gegnerarten[Z.gegnerArt]) Z.gegnerArt = alle[0][0];
    const id = Z.gegnerArt, a = DATEN.gegnerarten[id], eigen = !!eigene.gegnerarten[id], sp = a.sprung;
    const aus = eigen ? '' : ' disabled';
    el.innerHTML = `
      <div class="spalte"><h3>Gegnerarten</h3>
        <div class="liste">${alle.map(([k, g]) => `<button data-art="${k}" class="${k === id ? 'an' : ''}">${esc(k)} <small>${eigene.gegnerarten[k] ? 'eigen' : 'eingebaut'}</small></button>`).join('')}</div>
        <div class="knoepfe"><button data-a="artneu">Neue Art</button><button data-a="artkopie">Kopie</button>${eigen ? '<button data-a="artloeschen" class="gefahr">Löschen</button>' : ''}</div></div>
      <div class="spalte breit"><h3>${esc(id)} ${eigen ? '' : '<small>(eingebaut – als Kopie bearbeiten)</small>'}</h3>
        <div class="vorschau"><canvas id="ed-gvorschau" width="128" height="128"></canvas></div>
        <fieldset${aus}>
        <div class="zeile">${feld('Grundbild', auswahlfeld('g.bild', a.bild, Object.fromEntries(Object.keys(GRUNDBILDER).map(k => [k, k]))))}${feld('Lebenspunkte', zahlfeld('g.lp', a.lp))}</div>
        <div class="zeile">${feld('Tempo (px/s)', zahlfeld('g.tempo', a.tempo))}${feld('Schaden (½ Herzen)', zahlfeld('g.schaden', a.schaden))}</div>
        ${feld('Herz fallen lassen (%)', zahlfeld('g.herz', Math.round(((a.beute || {}).herz || 0) * 100)))}
        <label class="klein"><input type="checkbox" data-g="sprung"${sp ? ' checked' : ''}> Sprungangriff (hält an, zittert, springt)</label>
        ${sp ? `<div class="zeile">${feld('Reichweite (px)', zahlfeld('s.reichweite', sp.reichweite))}${feld('Warnung (s)', zahlfeld('s.zielen', sp.zielen, 0.05))}</div>
        <div class="zeile">${feld('Sprungdauer (s)', zahlfeld('s.dauer', sp.dauer, 0.02))}${feld('Sprungtempo', zahlfeld('s.tempo', sp.tempo))}</div>
        <div class="zeile">${feld('Pause von (s)', zahlfeld('s.pause0', sp.pause[0], 0.1))}${feld('Pause bis (s)', zahlfeld('s.pause1', sp.pause[1], 0.1))}</div>` : ''}
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
    const t = e.target, id = Z.gegnerArt, a = eigene.gegnerarten[id];
    if (!a) return;
    merke();
    if (t.dataset.farbe) { a.farben = { ...(a.farben || {}) }; if (t.value === t.dataset.farbe) delete a.farben[t.dataset.farbe]; else a.farben[t.dataset.farbe] = t.value; if (!Object.keys(a.farben).length) delete a.farben; }
    else if (t.dataset.g === 'sprung') { if (t.checked) a.sprung = { reichweite: 150, zielen: 0.5, dauer: 0.32, tempo: 300, pause: [2, 3] }; else delete a.sprung; speichern(); renderGegner(); return; }
    else if (t.dataset.f) {
      const [bereich, k] = t.dataset.f.split('.'), wert = t.type === 'number' ? Number(t.value) : t.value;
      if (bereich === 'g' && k === 'bild') { a.bild = wert; Object.assign(a, kopie(GRUNDBILDER[wert])); delete a.farben; speichern(); renderGegner(); return; }
      if (bereich === 'g' && k === 'herz') a.beute = { herz: Math.max(0, Math.min(100, wert)) / 100 };
      else if (bereich === 'g') a[k] = wert;
      else if (bereich === 's' && k.startsWith('pause')) a.sprung.pause[Number(k.slice(-1))] = wert;
      else if (bereich === 's') a.sprung[k] = wert;
    }
    speichern();
  }
  function neueArt(vorlage) {
    const name = prompt('Name der Gegnerart (Kleinbuchstaben, ohne Leerzeichen):', vorlage ? vorlage + '2' : 'wolf');
    if (!name) return;
    let id = slug(name);
    while (DATEN.gegnerarten[id]) id += '2';
    merke();
    eigene.gegnerarten[id] = vorlage ? kopie(DATEN.gegnerarten[vorlage]) : { bild: 'fuchs', lp: 2, tempo: 55, schaden: 1, ...kopie(GRUNDBILDER.fuchs), beute: { herz: 0.2 } };
    Z.gegnerArt = id; speichern(); renderGegner(); renderWerkzeuge();
  }

  // ---------- Aktionen (Knöpfe) ----------
  function aktion(a, el) {
    const d = dg();
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
      case 'farbenzurueck': if (eigene.gegnerarten[Z.gegnerArt]) { merke(); delete eigene.gegnerarten[Z.gegnerArt].farben; speichern(); renderGegner(); } break;
    }
  }
  function importiere(datei) {
    const leser = new FileReader();
    leser.onload = () => {
      try {
        const e = JSON.parse(leser.result);
        if (e.format !== 1 || !e.dungeons) throw new Error('keine Waldwacht-Datei');
        const doppelt = [...Object.keys(e.dungeons).filter(k => eigene.dungeons[k]), ...Object.keys(e.gegnerarten || {}).filter(k => eigene.gegnerarten[k])];
        if (doppelt.length && !confirm(`${doppelt.length} Einträge gibt es schon und werden überschrieben. Weiter?`)) return;
        merke();
        Object.assign(eigene.dungeons, e.dungeons); Object.assign(eigene.gegnerarten, e.gegnerarten || {});
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
  #editor .spalte{flex:0 0 250px;overflow:auto} #editor .spalte.breit{flex:1 1 320px} #editor .mitte{flex:1 1 auto;min-width:320px;overflow:auto}
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
  @media (max-width:900px){#editor .ansichten{flex-direction:column} #editor .spalte{flex:none}}`;
  function baue() {
    const stil = document.createElement('style'); stil.textContent = CSS; document.head.appendChild(stil);
    wurzel = document.createElement('div'); wurzel.id = 'editor';
    wurzel.innerHTML = `
      <header><h2>Waldwacht-Editor</h2>
        <button data-ansicht="dungeon">Dungeons &amp; Räume</button><button data-ansicht="gegner">Gegnerarten</button>
        <span style="flex:1"></span><button data-a2="zurueck" title="Strg+Z">↶ Rückgängig</button><button data-a2="spiel">Zum Spiel</button></header>
      <div class="ansichten" id="ed-dungeonansicht">
        <div class="spalte" id="ed-links"></div>
        <div class="mitte"><div id="ed-werkzeuge"></div><canvas id="ed-raum" width="${BREITE}" height="${HOEHE}"></canvas>
          <p class="klein">Linke Maustaste: setzen (ziehen malt) · rechte Maustaste: entfernen · Rand und Türen sind fest, Türen stellst du rechts ein.</p></div>
        <div class="spalte" id="ed-rechts"></div>
      </div>
      <div class="ansichten" id="ed-gegneransicht"></div>`;
    document.body.appendChild(wurzel);
    wurzel.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.ansicht) { Z.ansicht = b.dataset.ansicht; render(); }
      else if (b.dataset.a2 === 'zurueck') zurueck();
      else if (b.dataset.a2 === 'spiel') { schliesse(); }
      else if (b.dataset.art) { Z.gegnerArt = b.dataset.art; renderGegner(); }
      else if (b.dataset.a) aktion(b.dataset.a, b);
    });
    wurzel.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'ed-dungeonwahl') { Z.dungeon = t.value; Z.raum = dg().start.raum; Z.auswahl = null; render(); }
      else if (t.dataset.a === 'kopie' && t.value) kopiereDungeon(t.value);
      else if (t.id === 'ed-datei' && t.files[0]) importiere(t.files[0]);
      else if (t.closest('#ed-rechts')) eingabe(e);
      else if (t.closest('#ed-gegneransicht')) gegnerEingabe(e);
    });
    // Raum-Leinwand: malen mit Maus/Stift/Finger
    const cvRaum = $('#ed-raum'), feldUnter = e => { const b = cvRaum.getBoundingClientRect(); return [Math.floor((e.clientX - b.left) / b.width * SPALTEN), Math.floor((e.clientY - b.top) / b.height * ZEILEN)]; };
    cvRaum.addEventListener('contextmenu', e => e.preventDefault());
    cvRaum.addEventListener('pointerdown', e => { e.preventDefault(); cvRaum.setPointerCapture(e.pointerId); Z.malt = { rechts: e.button === 2, letztes: feldUnter(e).join() }; anwenden(...feldUnter(e), true, e.button === 2); });
    cvRaum.addEventListener('pointermove', e => {
      Z.maus = feldUnter(e);
      if (Z.malt && Z.maus.join() !== Z.malt.letztes) { Z.malt.letztes = Z.maus.join(); anwenden(...Z.maus, false, Z.malt.rechts); }
      zeichneRaum();
    });
    cvRaum.addEventListener('pointerup', () => { if (Z.malt) { Z.malt = false; renderRechts(); } });
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
    wurzel.querySelectorAll('[data-ansicht]').forEach(b => b.classList.toggle('an', b.dataset.ansicht === Z.ansicht));
    renderWerkzeuge();
    if (Z.ansicht === 'gegner') { renderGegner(); return; }
    renderLinks(); renderRechts(); zeichneRaum();
  }
  function oeffne() {
    if (!wurzel) baue();
    eigene = ladeEigene();
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
