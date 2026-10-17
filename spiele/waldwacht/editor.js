// Waldwacht – Editor für Dungeons, Räume, Objekte, Gegner, Gegnerarten und Kristalltypen.
// Zwei Modi im selben Fenster: Editor (alles im Detail) und Creator (creator.js: planen in Arbeitsschritten); der Creator
// greift über Editor.intern auf Zustand und Hilfsfunktionen zu.
// Wird vom Spiel erst geladen, wenn im Menü „EDITOR“ oder „CREATOR“ gewählt wird, und nutzt dessen Daten, Grafik und Funktionen
// (DATEN, baueHintergrund, zeichneBild, Sprites, GEGNERBILD, pruefeDaten, uebernehmeEigene, starteDungeon …).
// Gespeichert wird im Browser (localStorage, EIGENE_SCHLUESSEL) im selben JSON-Format wie der Block spieldaten:
//   { format: 1, dungeons: { id: dungeon }, gegnerarten: { id: gegnerart }, kristalltypen: { id: kristalltyp }, waffen: { id: waffe } }
// Räume im Editor-Format: karte nur mit Gelände (# . ~), Objekte und Gegner als Listen mit feld [spalte, zeile],
// dazu pos [x, y] für die Dungeon-Karte. Eingebaute Dungeons lassen sich als Kopie übernehmen (werden dabei umgewandelt).
'use strict';
const Editor = (() => {
  // ---------- Zustand ----------
  let offen = false, wurzel = null, eigene = ladeEigene(), rueckgaengig = [];
  const Z = {
    modus: 'editor',               // editor | creator
    ansicht: 'dungeon',            // dungeon | gegner | kristalle
    dungeon: null, raum: null,
    werkzeug: { art: 'kachel', wert: '#' },   // bei Objekten optional vorlage: Einstellungen für neu gesetzte
    form: 'pinsel',                // pinsel | rechteck (Umschalt hält Rechteck)
    auswahl: null,                 // { liste: 'objekte' | 'gegner', i }
    gegnerArt: null, gPhase: null, kristallTyp: null, waffe: null, vorgaben: {}, vorgabenOffen: false, meldung: null,
    maus: null, malt: false, rechteck: null,
    teile: false, teileZustand: null, teileAb: '', teileAbRaum: null,   // Raumteile-Ansicht: an/aus, gewählter Zustand, Eingang für „erreichbar ab“
    loeser: null,                  // letzter Lauf des Lösers: { dungeon, stand, laeuft, fortschritt, ergebnis, fehler, sekunden }
    fuellen: { hindernisse: 'mittel', buesche: true, abgruende: false, gegner: 3, arten: ['fuchs'], auto: true },
  };
  try { Object.assign(Z.fuellen, JSON.parse(localStorage.getItem('waldwacht.editor') || '{}')); } catch (e) { /* Voreinstellung */ }

  const LICHT = ['hell', 'daemmrig', 'dunkel', 'finster'];
  const SCHRITTARTEN = { signal: 'Signal setzen', warte: 'warten', warteBis: 'warten bis', text: 'Text zeigen', ende: 'Dungeon geschafft (Abspann)' };
  const TUERARTEN = { keine: 'keine', offen: 'offen', schloss: 'Schloss (kleiner Schlüssel)', gross: 'Großes Schloss (großer Schlüssel)', gegenstand: 'Tor für einen Gegenstand',
    riegel: 'Riegel (geht nur von der anderen Seite auf)', kampf: 'Kampf (offen, wenn geräumt)', bedingung: 'Bedingung' };
  const TUERFARBE = { offen: '#cfd6cf', schloss: '#f4cd5e', gross: '#d0574a', gegenstand: '#8abd4f', riegel: '#986438', kampf: '#d0574a', bedingung: '#8098cc' };
  const TUERZEICHEN = { offen: '', schloss: 'S', gross: 'G', gegenstand: '◆', riegel: 'R', kampf: 'K', bedingung: '?' };
  const RICHTUNGSNAME = { n: 'Norden', o: 'Osten', s: 'Süden', w: 'Westen' };
  const GRUNDBILDER = { fuchs: { fuss: [11, 6], koerper: [26, 20] }, hase: { fuss: [8, 5], koerper: [18, 16] }, huhn: { fuss: [8, 5], koerper: [18, 18] } };
  // Einstellungen je Objekt, abhängig von den Eigenschaften seiner Art: [name, typ, Beschriftung, Erklärung]
  const PARAMETER = {
    lesbar: [['text', 'lang', 'Text', 'Erscheint, wenn der Held davorsteht und Aktion drückt.']],
    oeffnbar: [['inhalt', 'gegenstand', 'Inhalt']],
    platte: [
      ['signal', 'signalname', 'Signal (Name)', 'Unter diesem Namen fragen Türen, Fackeln und Objekte die Platte ab. Mehrere Platten mit demselben Namen: eine genügt.'],
      ['wer', { block: 'nur ein Block', alle: 'Block, Held oder Gegner' }, 'Wer drückt sie?'],
      ['merken', 'plattenwirkung', 'Wirkung',
        'Bleibt sie unten, gilt ihr Signal danach im ganzen Dungeon. Sonst nur, solange man im Raum ist und etwas daraufsteht. Der Zeitschalter hält das Signal nach dem Loslassen noch einige Sekunden (Restzeit über der Platte, Ticken).'],
    ],
    kristall: [['kristalltyp', 'kristalltyp', 'Kristalltyp', 'Ein Schwertschlag schaltet alle Kristalle dieses Typs eine Farbe weiter – im ganzen Dungeon.']],
    pflock: [['kristalltyp', 'pflocktyp', 'Gesteuert von', 'Kristalltyp: steht oben, solange der Typ die Farbe des Pflocks zeigt. Signal (Sperre): steht oben, solange die Bedingung gilt – z. B. „nicht tor-auf“, damit eine Platte oder ein Gegner in einem anderen Raum den Weg freigibt.'],
      ['farbe', 'pflockfarbe', 'Farbe', 'Beim Kristalltyp: bei dieser Farbe steht der Pflock oben. Bei der Sperre nur das Aussehen.']],
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
    const gruppen = { 'Raum': [['geraeumt', 'Raum geräumt (keine Gegner mehr)']], 'Platten': [], 'Kristalle': [], 'Gegner': [], 'Gegenstände': [], 'Ereignisse': [], 'Nirgends ausgelöst (Tippfehler?)': [] };
    for (const [gid, g] of Object.entries(DATEN.gegenstaende)) if (!(g.wirkung || {}).schluessel) gruppen['Gegenstände'].push(['hat:' + gid, `hat ${g.name || gid}` + (quellen['hat:' + gid] ? '' : ' (liegt in keiner Truhe dieses Dungeons)')]);
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
    const [bereich, k, k2] = div.dataset.bed.split('.'), r = raum();
    if (bereich === 'schritt') {
      merke(); r.ereignisse[Number(k)].schritte[Number(k2)].wenn = baueBedingung(z) ?? 'geraeumt';
      aenderung(); renderRechts(); return;
    }
    if (bereich === 'ereignis') {
      merke(); const ev = r.ereignisse[Number(k)], b = baueBedingung(z);
      if (b === undefined) delete ev.wenn; else ev.wenn = b;
      aenderung(); renderRechts(); return;
    }
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
  function ereignisseAlsSchritte(r) {   // alte Form {text, setze} → Ablauf mit Schritten
    for (const ev of r.ereignisse || []) if (!ev.schritte) {
      ev.schritte = [...(ev.text ? [{ art: 'text', text: ev.text }] : []), ...Object.entries(ev.setze || {}).map(([sig, w]) => ({ art: 'signal', signal: sig, ...(w ? {} : { wert: false }) }))];
      delete ev.text; delete ev.setze;
    }
  }
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
    delete r.zeichen; sortiere(r); ereignisseAlsSchritte(r);
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
  function legeRaumAn(x, y, verbindeMit, leer = false) {
    const d = dg(), id = neueRaumId(d), nr = Math.max(0, ...Object.values(d.raeume).map(q => Number(q.nr) || 0)) + 1, r = leererRaum(nr, [x, y]);
    d.raeume[id] = r;
    if (verbindeMit) {   // Tür zum Raum, von dem aus angelegt wurde
      const [vid, v] = verbindeMit, dir = ['n', 'o', 's', 'w'].find(k => v.pos[0] + RICHTUNG[k][0] === x && v.pos[1] + RICHTUNG[k][1] === y);   // Mitteltür
      if (dir) { v.tueren[dir] = { ziel: id }; r.tueren[GEGENUEBER[dir]] = { ziel: vid }; }
    }
    if (Z.fuellen.auto && !leer) befuelle(r, false);
    Z.raum = id; Z.auswahl = null;
    return id;
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
    if (t.schloss === 'gross') return 'gross';
    if (t.schloss) return 'schloss';
    if (t.riegel) return 'riegel';
    if (t.braucht) return 'gegenstand';
    if (t.offen_wenn === 'geraeumt') return 'kampf';
    if (t.offen_wenn !== undefined) return 'bedingung';
    return 'offen';
  }
  function setzeTuer(dir, art, bedingung, merken) {
    if (!nachbar(dir)) return;
    merke(); tuerSetzen(Z.raum, dir, art, bedingung, merken);
    aenderung(); renderRechts();
  }
  function tuerSetzen(rid, dir, art, bedingung, merken) {   // Tür in Raum rid (Wand dir) setzen; die Gegentür bekommt mindestens das Ziel
    const r = dg().raeume[rid], nb = r && r.pos ? raumBei(r.pos[0] + RICHTUNG[dir][0], r.pos[1] + RICHTUNG[dir][1]) : null;
    if (!nb) return;
    const [nid, n] = nb, g = GEGENUEBER[dir];
    if (art === 'keine') { delete r.tueren[dir]; delete n.tueren[g]; }
    else {
      const t = { ziel: nid };
      if (art === 'schloss') t.schloss = true;
      if (art === 'gross') t.schloss = 'gross';
      if (art === 'riegel') t.riegel = true;
      if (art === 'gegenstand') t.braucht = typeof bedingung === 'string' ? bedingung : Object.keys(DATEN.gegenstaende).find(k => !(DATEN.gegenstaende[k].wirkung || {}).schluessel && k !== 'grosser_schluessel') || 'laterne';
      if (art === 'kampf') t.offen_wenn = 'geraeumt';
      if (art === 'bedingung') {   // ohne Vorgabe: das erste Signal von Platte, Gegner oder Ereignis, sonst „geräumt“ (als Liste,
        // damit es nicht als Kampftür gilt)
        const q = Object.entries(dungeonSignale(DATEN, DATEN.dungeons[Z.dungeon]).quellen), erstes = ['platte', 'gegner', 'ereignis'].map(k => q.find(([, wo]) => wo[0].art === k)).find(Boolean);
        t.offen_wenn = bedingung === undefined ? (erstes ? erstes[0] : { alle: ['geraeumt'] }) : bedingung; if (merken) t.merken = true;
      }
      r.tueren[dir] = t;
      n.tueren[g] = n.tueren[g] ? { ...n.tueren[g], ziel: rid } : { ziel: rid };
    }
  }

  // ---------- Automatisch befüllen ----------
  // Rahmen bleibt, Inneres wird neu: Abgründe, Hindernisse, Gegner. Die Felder vor den Türen bleiben frei, und alle
  // Türen (und der Startpunkt) müssen untereinander erreichbar bleiben – sonst wird der letzte Schritt zurückgenommen.
  // Plant der Creator getrennte Wege durch den Raum, kommen zuerst Trennmauern hinein, und zusammenhängen muss nur je Weg.
  function befuelle(r, nachfragen = true) {
    if (nachfragen && (r.objekte.length || r.gegner.length) && !confirm('Inhalt des Raums ersetzen?')) return;
    const f = Z.fuellen, karte = rahmenKarte().map(z => [...z]), objekte = [], gegner = [];
    const schutz = new Set(), ziele = [], d = dg(), hier = d && raum() === r;
    let gruppen = hier && typeof Creator !== 'undefined' ? Creator.planWege(d, d.plan || {}, Z.raum) : [];
    if (gruppen.length > 1) {
      const R = { karte: rahmenKarte() }, start = d.start.raum === Z.raum ? d.start.feld.map(Math.floor) : null;
      let ok = false;
      for (let versuch = 0; versuch < 8 && !ok; versuch++) { R.karte = rahmenKarte(); ok = Creator.trenneWege(R, gruppen, new Map(), [], start, Math.random); }
      if (ok) R.karte.forEach((z, rr) => { karte[rr] = [...z]; });
      else { alert('Die getrennten Wege aus dem Raumplan ließen sich hier nicht anlegen (Türen zu dicht beieinander) – der Raum wird ohne Trennung befüllt.'); gruppen = []; }
    }
    const wegVon = {}; gruppen.forEach((l, i) => l.forEach(k => { wegVon[k] = i; }));
    for (const dir of Object.keys(r.tueren)) {
      const [x, y, w, h] = TUER_RECHTECK[dir], [dx, dy] = RICHTUNG[dir];
      for (let rr = y / T; rr < (y + h) / T; rr++) for (let c = x / T; c < (x + w) / T; c++) for (let k = 1; k <= 3; k++) {
        const cc = c - dx * k, ry = rr - dy * k;
        if (innen(cc, ry)) { schutz.add(cc + ',' + ry); if (k === 1) ziele.push([cc, ry, wegVon[dir] || 0]); }
      }
    }
    if (hier && d.start.raum === Z.raum) {
      const [sx, sy] = d.start.feld.map(Math.floor);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) schutz.add((sx + a) + ',' + (sy + b));
      ziele.push([sx, sy, wegVon.start || 0]);
    }
    if (!ziele.length) ziele.push([9, 8, 0]);
    const belegt = (c, rr) => objekte.some(o => o.feld[0] === c && o.feld[1] === rr) || gegner.some(g => g.feld[0] === c && g.feld[1] === rr);
    const begehbar = (c, rr) => karte[rr][c] === '.' && !objekte.some(o => o.feld[0] === c && o.feld[1] === rr && DATEN.objektarten[o.objekt].fest && !DATEN.objektarten[o.objekt].schneidbar);
    const zusammen = () => [...new Set(ziele.map(z => z[2]))].every(g => {   // je Weg: alle seine Türen (und der Start) hängen zusammen
      const eigene = ziele.filter(z => z[2] === g), [c0, r0] = eigene[0], da = new Set([c0 + ',' + r0]), offen = [[c0, r0]];
      while (offen.length) {
        const [c, rr] = offen.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = (c + dx) + ',' + (rr + dy);
          if (!da.has(n) && innen(c + dx, rr + dy) && begehbar(c + dx, rr + dy)) { da.add(n); offen.push([c + dx, rr + dy]); }
        }
      }
      return eigene.every(([c, rr]) => da.has(c + ',' + rr));
    });
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
    if (typeof Creator !== 'undefined' && Creator.vorschauRaum()) { if (erster) Creator.vorschauEnde(); return; }   // erst die Vorschau eines Vorschlags beenden
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
    if (w.art === 'baustein') { if (erster && typeof Creator !== 'undefined') Creator.setzeBaustein(c, rr); return; }
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
    const cv = $('#ed-raum'), vorschau = typeof Creator !== 'undefined' && Creator.vorschauRaum(), r = vorschau || raum();
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
      if (e.traegt) { g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#7fbcdc'; g.fillText('trägt: ' + ((DATEN.gegenstaende[e.traegt] || {}).name || e.traegt), e.feld[0] * T + 16, e.feld[1] * T - 10 * k - (sig || art.boss ? 12 : 0)); }
    }
    const licht = typeof r.licht === 'number' ? r.licht : (CFG.licht.stufen[r.licht] ?? 1);   // Dunkelheit nur andeuten
    if (licht < 1) { g.fillStyle = `rgba(18,13,20,${(1 - licht) * 0.45})`; g.fillRect(0, 0, BREITE, HOEHE); }
    const d = dg();
    if (d.start.raum === Z.raum) { g.globalAlpha = 0.8; zeichneBild(g, 'held_0', d.start.feld[0] * T - 16, d.start.feld[1] * T + 8 - 48); g.globalAlpha = 1; }
    g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
    for (const [dir, t] of Object.entries(r.tueren)) {   // Türart beschriften
      const [x, y, w, h] = TUER_RECHTECK[dir], art = tuerArt(t);
      const farbe = TUERFARBE[art];
      g.fillStyle = farbe; g.globalAlpha = 0.55; g.fillRect(x, y, w, h); g.globalAlpha = 1;
      g.fillStyle = '#120d14'; g.fillText(TUERZEICHEN[art], x + w / 2, y + h / 2 + 4);
    }
    if (Z.teile && !vorschau) zeichneTeile(g, r);
    if (Z.werkzeug.art === 'baustein' && Z.maus && typeof Creator !== 'undefined' && !vorschau) Creator.zeichneBaustein(g, r, Z.maus);
    if (vorschau) { g.fillStyle = 'rgba(18,13,20,.75)'; g.fillRect(0, 0, BREITE, 22); g.fillStyle = '#c99ad8'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('VORSCHAU – rechts „Übernehmen“, Klick in den Raum beendet die Vorschau', BREITE / 2, 15); }
    g.strokeStyle = 'rgba(255,251,236,.08)'; g.lineWidth = 1;
    for (let c = 1; c < SPALTEN; c++) { g.beginPath(); g.moveTo(c * T + 0.5, 0); g.lineTo(c * T + 0.5, HOEHE); g.stroke(); }
    for (let rr = 1; rr < ZEILEN; rr++) { g.beginPath(); g.moveTo(0, rr * T + 0.5); g.lineTo(BREITE, rr * T + 0.5); g.stroke(); }
    const a = Z.auswahl && r[Z.auswahl.liste][Z.auswahl.i];
    if (a) { g.strokeStyle = '#f4cd5e'; g.lineWidth = 3; g.strokeRect(a.feld[0] * T + 1.5, a.feld[1] * T + 1.5, T - 3, T - 3); }
    if (Z.rechteck) {   // Rechteck, das gerade aufgezogen wird
      const { a: p, b: q, rechts } = Z.rechteck, x = Math.min(p[0], q[0]) * T, y = Math.min(p[1], q[1]) * T, w = (Math.abs(p[0] - q[0]) + 1) * T, h = (Math.abs(p[1] - q[1]) + 1) * T;
      g.fillStyle = rechts ? 'rgba(208,87,74,.25)' : 'rgba(244,205,94,.2)'; g.fillRect(x, y, w, h);
      g.strokeStyle = rechts ? '#d0574a' : '#f4cd5e'; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(x + 1, y + 1, w - 2, h - 2); g.setLineDash([]);
    } else if (Z.maus && innen(...Z.maus) && Z.werkzeug.art !== 'baustein') { g.strokeStyle = 'rgba(255,251,236,.7)'; g.lineWidth = 2; g.strokeRect(Z.maus[0] * T + 1, Z.maus[1] * T + 1, T - 2, T - 2); }
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
      const [id, r] = rm, an = id === Z.raum, stufe = Z.pruefung && Z.pruefung.logik.stufe[id];
      g.fillStyle = an ? '#e0a33a' : '#626a72'; g.fillRect(px + 5, py + 5, KZ.w - 10, KZ.h - 10);
      if (Z.pruefung && stufe === undefined) { g.strokeStyle = '#d0574a'; g.lineWidth = 3; g.strokeRect(px + 6.5, py + 6.5, KZ.w - 13, KZ.h - 13); g.lineWidth = 1; }
      g.fillStyle = '#120d14'; g.fillText(r.nr || id, px + KZ.w / 2, py + KZ.h / 2 + 4);
      if (stufe > 1) { g.font = '9px sans-serif'; g.fillStyle = '#1c1e26'; g.fillText('S' + stufe, px + KZ.w - 14, py + 14); g.font = '11px sans-serif'; }
      if (dg().start.raum === id) { g.fillStyle = '#f4cd5e'; g.fillText('★', px + 12, py + 15); }
      const nw = Z.pruefung && Z.pruefung.logik.nachweise && Z.pruefung.logik.nachweise[id];
      if (nw && nw.raetsel) {   // Rätselraum: grün = alle Ziele im Test erreicht, gelb = teilweise/veraltet, hohl = noch nie getestet
        g.beginPath(); g.arc(px + KZ.w - 12, py + KZ.h - 12, 4, 0, 7);
        if (nw.status === 'offen') { g.strokeStyle = '#120d14'; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1; }
        else { g.fillStyle = nw.status === 'ok' ? '#58933b' : '#e0a33a'; g.fill(); }
      }
      for (const [dir, t] of Object.entries(r.tueren)) {   // Verbindungen, bei mehreren Türen je Wand versetzt
        const [dx, dy] = RICHTUNG[dir], art = tuerArt(t), v = dir[1] === '1' ? -1 : dir[1] === '3' ? 1 : 0;
        g.fillStyle = TUERFARBE[art];
        if (dx) g.fillRect(dx > 0 ? px + KZ.w - 6 : px, py + KZ.h / 2 - 3 + v * 9, 6, 6); else g.fillRect(px + KZ.w / 2 - 3 + v * 12, dy > 0 ? py + KZ.h - 6 : py, 6, 6);
      }
    }
  }
  // Prüfung: Daten (pruefeDaten) und Logik (pruefeLogik). Läuft erst 300 ms nach der letzten Änderung, nicht bei jedem Klick.
  let pruefUhr = null;
  function zeigeWarnungen() { clearTimeout(pruefUhr); pruefUhr = setTimeout(pruefeJetzt, 300); }
  function pruefeJetzt() {
    if (!offen || !Z.dungeon || !DATEN.dungeons[Z.dungeon]) { Z.pruefung = null; zeigeStatus(); return; }
    const daten = pruefeDaten({ ...DATEN, dungeons: { [Z.dungeon]: DATEN.dungeons[Z.dungeon] } }, true)
      .map(m => m.replace(Z.dungeon + '/', 'Raum-ID ').replace(Z.dungeon + ':', 'Dungeon:'));
    const logik = pruefeLogik(DATEN, Z.dungeon);
    Z.pruefung = { fehler: [...logik.fehler, ...daten], hinweise: logik.hinweise, logik };
    zeigeStatus(); zeichneKarte();
    const el = $('#ed-warnungen');
    if (el) el.innerHTML = liste(Z.pruefung.fehler, 'fehler') + liste(Z.pruefung.hinweise, 'hinweis') + (Z.pruefung.fehler.length + Z.pruefung.hinweise.length ? '' : '<span class="ok">Keine Fehler gefunden, alle Räume erreichbar.</span>');
    if (Z.ansicht === 'logik') renderLogik();
    const ti = $('#ed-testinfo');   // Vorgaben und Nachweis hängen an der Prüfung – nachziehen, ohne ein Eingabefeld zu stören
    if (ti && raum() && !ti.contains(document.activeElement)) ti.innerHTML = vorgabenHtml(raum(), dg()) + nachweisHtml(raum());
  }
  const liste = (l, klasse) => l.length ? `<ul class="${klasse}">${l.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  function zeigeStatus() {   // rot/gelb/grün oben im Kopf; Klick öffnet die Logik-Ansicht
    const el = $('#ed-status'), p = Z.pruefung;
    if (!el) return;
    if (!p) { el.className = 'status'; el.textContent = '–'; return; }
    const f = p.fehler.length, h = p.hinweise.length;
    el.className = 'status ' + (f ? 'rot' : h ? 'gelb' : 'gruen');
    const offen = Object.values(p.logik.nachweise || {}).filter(n => n.raetsel && n.status !== 'ok').length;
    el.textContent = (f ? `✗ ${f} Fehler` : h ? `! ${h} Hinweis${h > 1 ? 'e' : ''}` : '✓ lösbar') + (offen ? ` · ${offen} ungetestet` : '');
    el.title = 'Prüfung von Daten und Logik – Klick zeigt Ablauf und Details';
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
    { const b = document.createElement('button'); b.className = 'wz' + (Z.teile ? ' an' : ''); b.textContent = 'Raumteile'; b.title = 'Zusammenhängende Flächen einfärben, Türen ihrem Teil zuordnen';
      b.onclick = () => { Z.teile = !Z.teile; renderWerkzeuge(); if (Z.teile) loeserBereit().then(() => { renderRechts(); zeichneRaum(); }); else { renderRechts(); zeichneRaum(); } }; gruppe('Ansicht', [b]); }
    if (typeof Creator !== 'undefined') {   // Bausteine (creator.js): fertige Rätsel als Stempel, Auswahl und Einstellungen rechts
      const b = document.createElement('button'); b.className = 'wz' + (Z.werkzeug.art === 'baustein' ? ' an' : ''); b.textContent = 'Bausteine'; b.title = 'Fertige Rätsel-Bausteine: auswählen, einstellen, in den Raum setzen';
      b.onclick = () => { Z.werkzeug = { art: 'baustein', wert: Z.baustein || 'truhe_sperre' }; renderWerkzeuge(); renderRechts(); zeichneRaum(); }; gruppe('Bausteine', [b]);
    }
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
    if (w.art === 'baustein') { el.innerHTML = 'Baustein setzen: rechts auswählen und einstellen, dann im Raum klicken – die Vorschau zeigt, wo er landet (grün passt, rot nicht) · Strg+Z nimmt ihn zurück'; return; }
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
      ${feld('Startwaffe', wahlHtml('id="ed-startwaffe"', dg().start.waffe || '', { '': `Standard (${(DATEN.waffen[CFG.held.waffe] || {}).name || CFG.held.waffe})`, ...Object.fromEntries(Object.entries(DATEN.waffen).map(([k, x]) => [k, x.name || k])) }))}
      <h3>Karte <small>(Klick: Raum wählen, + anlegen)</small></h3>
      <div class="kartenrahmen"><canvas id="ed-karte"></canvas></div>
      <div class="knoepfe"><button data-a="testdungeon" class="haupt">▶ Dungeon testen</button></div>
      ${Z.meldung ? `<div class="meldung">${esc(Z.meldung)} <button data-a="meldungweg" title="ausblenden">×</button></div>` : ''}
      <h3>Prüfung <small>(Klick auf den Status oben: Ablauf)</small></h3><div id="ed-warnungen" class="warnungen"></div>` : '<p>Lege einen neuen Dungeon an oder übernimm einen bestehenden als Kopie.</p>'}
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
    if (typ === 'pflocktyp') return feld(label, auswahlfeld('a.' + name, w || '', { ...Object.fromEntries(Object.keys(DATEN.kristalltypen).map(k => [k, 'Kristall: ' + typText(k)])), '': 'Signal (Sperre)' }), hilfe) +
      (a.kristalltyp ? '' : feld('Steht oben, solange', bedingungsFormular('a.oben_wenn', a.oben_wenn)));
    if (typ === 'pflockfarbe') return feld(label, auswahlfeld('a.' + name, w, Object.fromEntries((a.kristalltyp ? kristallTyp(a.kristalltyp).farben : Object.keys(KFARBEN)).map(f => [f, farbName(f)]))), hilfe);
    if (typ === 'plattenwirkung') return feld(label, wahlHtml('data-plattenwirkung', a.merken ? '1' : a.nachlauf ? 'zeit' : '', { '': 'nur solange etwas daraufsteht', '1': 'einmal drücken genügt – bleibt unten', zeit: 'Zeitschalter: hält noch einige Sekunden' }) +
      (a.nachlauf ? feld('Sekunden', `<input type="number" min="1" step="0.5" data-f="a.nachlauf" value="${a.nachlauf}">`) : ''), hilfe);
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
    const tueren = ['n', 'o', 's', 'w'].map(seite => {   // je Wand bis zu drei Türen: Mitte immer, links/rechts bzw. oben/unten bei Bedarf
      const nb = nachbar(seite);
      if (!nb) return `<div class="tuer"><b>${RICHTUNGSNAME[seite]}</b> <span class="klein">kein Nachbarraum</span> <button data-a="nachbar" data-dir="${seite}">Raum anlegen</button></div>`;
      const stellen = [seite + '1', seite, seite + '3'], quer = seite === 'n' || seite === 's';
      const name = d => d.length === 1 ? 'Mitte' : d[1] === '1' ? (quer ? 'links' : 'oben') : (quer ? 'rechts' : 'unten');
      const zeigen = stellen.filter(d => d === seite || r.tueren[d]), fehlen = stellen.filter(d => !zeigen.includes(d));
      return `<div class="tuerwand"><b>${RICHTUNGSNAME[seite]}</b> → ${esc(nb[1].nr)} ${esc(nb[1].titel)}
        ${zeigen.map(dir => tuerZeile(r, dir, zeigen.length > 1 || dir !== seite ? name(dir) : '')).join('')}
        ${fehlen.length ? `<div class="knoepfe">${fehlen.map(dir => `<button data-a="tuerplus" data-dir="${dir}" title="Zweite oder dritte Tür in dieser Wand">＋ Tür ${name(dir)}</button>`).join('')}</div>` : ''}</div>`;
    }).join('');
    function tuerZeile(r, dir, stelle) {
      const t = r.tueren[dir], art = tuerArt(t);
      return `<div class="tuer">${stelle ? `<span class="klein">${stelle}:</span> ` : ''}
        <select data-tuer="${dir}">${Object.entries(TUERARTEN).map(([k, v]) => `<option value="${k}"${k === art ? ' selected' : ''}>${v}</option>`).join('')}</select>
        ${art === 'bedingung' ? `<div class="klein">offen, solange:</div>${bedingungsFormular('tuer.' + dir, t.offen_wenn)}
          <label class="klein"><input type="checkbox" data-tuermerk="${dir}"${t.merken ? ' checked' : ''}> bleibt offen, wenn einmal erfüllt</label>` : ''}
        ${art === 'schloss' ? '<div class="klein">braucht einen kleinen Schlüssel (Truhe mit Inhalt „schluessel“); er wird dabei verbraucht</div>' : ''}
        ${art === 'gross' ? '<div class="klein">braucht den großen Schlüssel (Truhe mit Inhalt „grosser_schluessel“); er bleibt erhalten – typisch für die Bosstür</div>' : ''}
        ${art === 'riegel' ? '<div class="klein">Von hier aus verschlossen. Wer von der anderen Seite kommt, schiebt den Riegel auf – danach ist sie von beiden Seiten offen. Ideal als Abkürzung zurück zum Anfang.</div>' : ''}
        ${art === 'gegenstand' ? `<div class="klein">Gitter mit dem Bild des Gegenstands – geht auf, sobald man ihn hat:</div>${wahlHtml(`data-tuerding="${dir}"`, t.braucht, Object.fromEntries(Object.entries(DATEN.gegenstaende).filter(([, x]) => !(x.wirkung || {}).schluessel).map(([k, x]) => [k, x.name || k])))}` : ''}</div>`;
    }
    const a = Z.auswahl && r[Z.auswahl.liste][Z.auswahl.i];
    let auswahl = '<p class="klein">Mit „Auswählen“ ein Objekt oder einen Gegner anklicken, um es einzustellen. Frisch gesetzte Objekte sind gleich ausgewählt.</p>';
    if (a && Z.auswahl.liste === 'gegner') {
      const art = DATEN.gegnerarten[a.gegner] || {}, kegel = art.bemerkt && art.bemerkt.art === 'kegel';
      auswahl = feld('Gegnerart', auswahlfeld('a.gegner', a.gegner, Object.fromEntries(Object.keys(DATEN.gegnerarten).map(k => [k, k])))) +
        parameterFeld(a, ['signal', 'signalname', 'Signal beim Besiegen', 'Z. B. für eine Tür, die erst nach diesem Gegner aufgeht. Ein Gegner mit Signal kommt nicht wieder.']) +
        feld('Trägt (fällt beim Besiegen heraus)', auswahlfeld('a.traegt', a.traegt || '', { '': '– nichts –', ...Object.fromEntries(Object.entries(DATEN.gegenstaende).map(([k, x]) => [k, x.name || k])) }),
          'Zum Beispiel ein Schlüssel, den ein Wächter bei sich hat. Der Gegenstand bleibt liegen, bis man ihn aufhebt; der Gegner kommt nicht wieder.') +
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
    el.innerHTML = `${typeof Creator !== 'undefined' && Z.werkzeug.art === 'baustein' ? Creator.bausteinPanel() : ''}${typeof Creator !== 'undefined' ? Creator.auftragKasten(Z.raum) : ''}${Z.teile ? teileHtml(r) : ''}
      <h3>Raum ${esc(r.nr)} <small>(${esc(Z.raum)})</small></h3>
      ${feld('Titel', textfeld('r.titel', r.titel))}
      <div class="zeile">${feld('Nr.', textfeld('r.nr', r.nr))}${feld('Licht', auswahlfeld('r.licht', typeof r.licht === 'number' ? 'hell' : (r.licht || 'hell'), { hell: 'hell', daemmrig: 'dämmrig', dunkel: 'dunkel', finster: 'finster' }))}</div>
      <small class="erkl">Licht: Ohne Laterne sieht man im Dunkeln nur einen kleinen Schein; Fackeln und Laterne leuchten. Eine Lichtkarte (je Feld 0–9) geht unter „Erweitert“.</small>
      <label class="klein"><input type="checkbox" data-f="r.kampf"${r.kampf ? ' checked' : ''}> Kampfraum (Türen erst offen, wenn geräumt; Gegner kommen nicht wieder)</label>
      ${feld('Einstiegstext', `<textarea data-f="r.einstieg" rows="2" placeholder="erscheint beim ersten Betreten">${esc(r.einstieg)}</textarea>`)}
      ${feld('Wellen', wellenFormular(r), 'Nach den Gegnern im Raum kommen die Wellen nacheinander. Am besten zusammen mit „Kampfraum“.')}
      <div class="knoepfe"><button data-a="testraum" class="haupt">▶ Raum testen</button><button data-a="startraum"${d.start.raum === Z.raum ? ' disabled' : ''}>Als Startraum</button><button data-a="raumloeschen" class="gefahr">Löschen</button></div>
      <div id="ed-testinfo">${vorgabenHtml(r, d)}${nachweisHtml(r)}</div>
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
      <h3>Ereignisse</h3>
      <small class="erkl">Ein Ereignis läuft ab, sobald seine Bedingung gilt („immer“ = beim ersten Betreten): Schritt für Schritt Signale an- oder ausschalten, warten, auf eine Bedingung warten, Text zeigen.
        Gesetzte Signale gelten im ganzen Dungeon. Beispiel Zeittor: wenn Platte → Signal „tor“ an → 5 s warten → „tor“ aus, wiederholen.</small>
      ${(r.ereignisse || []).map((ev, i) => `<div class="modul"><b>Ereignis ${i + 1}</b>
        ${feld('wenn', bedingungsFormular('ereignis.' + i, ev.wenn))}
        <label class="klein"><input type="checkbox" data-ev="${i}" data-evf="wiederholen"${ev.wiederholen ? ' checked' : ''}> wiederholen – läuft erneut ab, wenn die Bedingung wieder eintritt</label>
        <div class="klein">Ablauf:</div>
        ${(ev.schritte || []).map((x, k) => `<div class="schritt"><span>${k + 1}.</span>${wahlHtml(`data-ev="${i}" data-sk="${k}" data-sf="art"`, x.art, SCHRITTARTEN)}
          ${x.art === 'signal' ? `<input data-ev="${i}" data-sk="${k}" data-sf="signal" value="${esc(x.signal || '')}" placeholder="Signal" list="ed-signalliste3">${wahlHtml(`data-ev="${i}" data-sk="${k}" data-sf="wert"`, x.wert === false ? 'aus' : 'an', { an: 'an', aus: 'aus' })}` : ''}
          ${x.art === 'warte' ? `<input type="number" step="0.5" min="0" data-ev="${i}" data-sk="${k}" data-sf="s" value="${x.s ?? 1}"> s` : ''}
          ${x.art === 'text' ? `<input data-ev="${i}" data-sk="${k}" data-sf="text" value="${esc(x.text || '')}" placeholder="Text">` : ''}
          ${x.art === 'ende' ? '<span class="klein">nach dem letzten Text: Abspann mit Spielzeit und Truhen, dann zurück zum Menü</span>' : ''}
          <button data-a="schrittweg" data-i="${i}" data-k="${k}" title="Schritt entfernen">×</button>
          ${x.art === 'warteBis' ? `<div class="bedbreit">${bedingungsFormular('schritt.' + i + '.' + k, x.wenn)}</div>` : ''}</div>`).join('')}
        <div class="knoepfe"><button data-a="schrittneu" data-i="${i}">＋ Schritt</button><button data-a="evweg" data-i="${i}">Ereignis entfernen</button></div></div>`).join('')}
      <datalist id="ed-signalliste3">${Object.keys(dungeonSignale(DATEN, DATEN.dungeons[Z.dungeon]).quellen).filter(n => !n.includes('=') && !n.startsWith('hat:')).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="knoepfe"><button data-a="evneu">＋ Ereignis</button><button data-a="evzeittor">＋ Vorlage Zeittor</button></div>
      <h3>Erweitert</h3>
      <details><summary class="klein">Raum als JSON (Ereignisse, Lichtkarte …)</summary>
        <textarea id="ed-json" rows="12">${esc(JSON.stringify(r, null, 1))}</textarea>
        <div class="knoepfe"><button data-a="json">JSON übernehmen</button></div></details>`;
  }

  // Test-Vorgaben: Womit startet der Raumtest? Vorgabe aus der Logik (was man frühestens beim Betreten hat), änderbar.
  // Der Eingang zählt mit: Führen unabhängige Wege durch den Raum, kommt man über jede Tür mit anderem Stand herein.
  function vorgabenAusLogik(raumId, eingang) {
    const L = Z.pruefung && Z.pruefung.logik, r = dg().raeume[raumId];
    const ein = eingang || (dg().start.raum === raumId ? 'start' : L && L.ersterEingang && r.tueren[L.ersterEingang[raumId]] ? L.ersterEingang[raumId] : Object.keys(r.tueren)[0] || 'mitte');
    const v = L && ((L.vorherTuer || {})[raumId + ':' + ein] || (L.vorher || {})[raumId]);
    return { eingang: ein, signale: v ? v.signale : [], besitz: v ? v.besitz : [], schluessel: v ? v.schluessel : 0, ausLogik: !!v };
  }
  function vorgaben(raumId) {   // { nurEingang }: nur der Eingang ist gewählt, der Rest folgt der Logik
    const v = Z.vorgaben[raumId];
    return !v ? vorgabenAusLogik(raumId) : v.nurEingang ? vorgabenAusLogik(raumId, v.eingang) : v;
  }
  function vorgabenHtml(r, d) {
    const v = vorgaben(Z.raum), q = Object.keys(dungeonSignale(DATEN, DATEN.dungeons[Z.dungeon]).quellen).filter(n => !n.includes('=') && !n.startsWith('hat:'));
    const eingaenge = { ...(d.start.raum === Z.raum ? { start: 'Startpunkt' } : {}), ...Object.fromEntries(Object.keys(r.tueren).map(dir => [dir, 'Tür ' + TUERNAME(dir)])), mitte: 'Raummitte' };
    const gegenst = Object.entries(DATEN.gegenstaende).filter(([, g]) => !(g.wirkung || {}).schluessel);
    const kurz = [v.signale.length ? v.signale.map(n => '„' + n + '“').join(', ') : '', v.besitz.map(id => (DATEN.gegenstaende[id] || {}).name || id).join(', '), v.schluessel ? v.schluessel + ' Schlüssel' : ''].filter(Boolean).join(' · ') || 'nichts';
    return `<details class="vorgaben"${Z.vorgabenOffen ? ' open' : ''}><summary class="klein">Test-Vorgaben: ${esc(eingaenge[v.eingang] || 'Tür')} · ${esc(kurz)}${v.ausLogik ? ' (aus der Logik)' : Z.vorgaben[Z.raum] && !Z.vorgaben[Z.raum].nurEingang ? ' (angepasst)' : ''}</summary>
      <small class="erkl">Der Raumtest startet so, als hätte man das schon – vorgegeben ist, was man laut Logik frühestens beim Betreten hat. So testest du einen Raum, ohne den Dungeon davor durchzuspielen.</small>
      ${feld('Eingang', wahlHtml('data-vg="eingang"', v.eingang, eingaenge))}
      ${q.length ? `<div class="klein">Signale schon ausgelöst:</div>${q.map(n => `<label class="klein"><input type="checkbox" data-vg="signal" data-n="${esc(n)}"${v.signale.includes(n) ? ' checked' : ''}> ${esc(n)}</label>`).join('')}` : ''}
      ${gegenst.length ? `<div class="klein">Gegenstände:</div>${gegenst.map(([id, g]) => `<label class="klein"><input type="checkbox" data-vg="besitz" data-n="${id}"${v.besitz.includes(id) ? ' checked' : ''}> ${esc(g.name || id)}</label>`).join('')}` : ''}
      ${feld('Kleine Schlüssel', `<input type="number" min="0" max="9" data-vg="schluessel" value="${v.schluessel}">`)}
      <button data-a="vorgabenlogik">wie in der Logik</button></details>`;
  }
  function nachweisHtml(r) {
    const nw = Z.pruefung && Z.pruefung.logik.nachweise && Z.pruefung.logik.nachweise[Z.raum];
    if (!nw) return '';
    const text = { ok: 'alle Ziele im Test erreicht', teil: 'noch nicht alle Ziele erreicht', veraltet: 'Raum seit dem letzten Test geändert – neu testen', offen: 'noch nicht getestet' }[nw.status];
    return `<div class="nachweis ${nw.status}"><b>Nachweis:</b> ${nw.raetsel ? '' : '<span class="klein">(kein Rätselraum – nicht nötig)</span> '}${text}
      <ul>${nw.ziele.map(z => `<li class="${nw.erreicht.includes(z) ? 'ja' : 'nein'}">${nw.erreicht.includes(z) ? '✓' : '○'} ${esc(ZIEL_NAME(z))}</li>`).join('')}</ul>
      <small class="erkl">Teste den Raum und erreiche jede Tür und jede Truhe (hinein oder hinaus zählt). Mehrere Testläufe ergänzen sich, solange der Raum gleich bleibt.</small>
      ${nw.erreicht.length || nw.veraltet ? '<button data-a="nachweisweg">Nachweis löschen</button>' : ''}</div>`;
  }

  // Eingaben im rechten Bereich: r.* Raum, a.* ausgewähltes Objekt/Gegner, f.* Befüllen; Bedingungen und Wellen eigens
  function eingabe(e) {
    const t = e.target, r = raum();
    const bed = t.closest('.bed');
    if (bed) { schreibeBedingung(bed); return; }
    if (t.dataset.tuer) { const dir = t.dataset.tuer; setzeTuer(dir, t.value, undefined, r.tueren[dir] && r.tueren[dir].merken); return; }
    if (t.dataset.tuerding) { setzeTuer(t.dataset.tuerding, 'gegenstand', t.value); return; }
    if (t.dataset.tuermerk) { const dir = t.dataset.tuermerk; setzeTuer(dir, 'bedingung', r.tueren[dir].offen_wenn, t.checked); return; }
    if (t.dataset.welle !== undefined) {
      merke();
      const i = Number(t.dataset.welle), n = Math.max(0, Math.min(12, Math.round(Number(t.value) || 0))), alt = r.wellen[i];
      r.wellen[i] = Object.keys(DATEN.gegnerarten).flatMap(k => Array(k === t.dataset.wart ? n : alt.filter(x => x === k).length).fill(k));
      aenderung(); return;
    }
    if (t.dataset.plattenwirkung !== undefined) {
      merke(); const a = r.objekte[Z.auswahl.i];
      delete a.merken; delete a.nachlauf;
      if (t.value === '1') a.merken = true; if (t.value === 'zeit') a.nachlauf = 5;
      vorlageAus(a); aenderung(); renderRechts(); return;
    }
    if (t.dataset.vg) {   // Test-Vorgaben (nur für diese Sitzung)
      const alt = vorgaben(Z.raum); Z.vorgabenOffen = true;
      if (t.dataset.vg === 'eingang' && alt.ausLogik) { Z.vorgaben[Z.raum] = { eingang: t.value, nurEingang: true }; renderRechts(); return; }   // anderer Eingang, Stand aus der Logik
      const v = Z.vorgaben[Z.raum] = { ...alt, ausLogik: false };
      if (t.dataset.vg === 'eingang') v.eingang = t.value;
      else if (t.dataset.vg === 'schluessel') v.schluessel = Math.max(0, Number(t.value) || 0);
      else { const k = t.dataset.vg === 'signal' ? 'signale' : 'besitz'; v[k] = t.checked ? [...new Set([...v[k], t.dataset.n])] : v[k].filter(x => x !== t.dataset.n); }
      renderRechts(); return;
    }
    if (t.dataset.sk !== undefined) {   // Schritt eines Ablaufs
      merke(); const x = r.ereignisse[Number(t.dataset.ev)].schritte[Number(t.dataset.sk)], f = t.dataset.sf;
      if (f === 'art') { for (const k of Object.keys(x)) delete x[k]; x.art = t.value; if (t.value === 'warte') x.s = 3; if (t.value === 'signal') x.signal = 'tor'; if (t.value === 'warteBis') x.wenn = 'geraeumt'; if (t.value === 'text') x.text = ''; }
      else if (f === 'signal') { x.signal = signalName(t.value) || 'signal'; }
      else if (f === 'wert') { if (t.value === 'aus') x.wert = false; else delete x.wert; }
      else if (f === 's') x.s = Math.max(0, Number(t.value) || 0);
      else if (f === 'text') x.text = t.value;
      aenderung(); if (f !== 'text') renderRechts(); return;
    }
    if (t.dataset.ev !== undefined) {
      merke(); const ev = r.ereignisse[Number(t.dataset.ev)];
      if (t.dataset.evf === 'wiederholen') { if (t.checked) ev.wiederholen = true; else delete ev.wiederholen; aenderung(); return; }
      if (t.dataset.evf === 'text') { if (t.value.trim()) ev.text = t.value.trim(); else delete ev.text; }
      else { const n = signalName(t.value); if (n) ev.setze = { [n]: true }; else delete ev.setze; t.value = n; }
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
      if (schluessel === 'kristalltyp' && wert && a.farbe !== undefined && !kristallTyp(wert).farben.includes(a.farbe)) a.farbe = kristallTyp(wert).farben[0];
      if (schluessel === 'kristalltyp' && a.objekt === 'pflock') {   // Kristall- oder Signal-Pflock (Sperre)
        if (wert) delete a.oben_wenn; else { if (a.oben_wenn === undefined) a.oben_wenn = { nicht: 'sperre-auf' }; a.farbe = 'weiss'; }
      }
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
    schild: { drehtempo: 120 }, explodiert: { zeit: 1, radius: 56, schaden: 2 }, boss: { name: 'BOSS' },
    serienschutz: { treffer: 3, zeit: 2, dauer: 1.2, konter: true, schaden: 1 }, ausweichen: { chance: 0.5, tempo: 340, abklingzeit: 1.2 },
  };
  const PAUSE = k => [[k + '.pause.0', 'zahl', 'Pause von (s)', '', 0.1], [k + '.pause.1', 'zahl', 'Pause bis (s)', '', 0.1]];
  const ANKUENDIGUNG = k => [k + '.zielen', 'zahl', 'Ankündigung (s)', 'So lange zittert er mit „!“ vorher – Zeit zum Ausweichen.', 0.05];
  const MODULE = {
    sprung: ['Sprungangriff', 'Hält an, zittert, springt dorthin, wo du gerade stehst.', [[ 'sprung.reichweite', 'zahl', 'Reichweite (px)'], ANKUENDIGUNG('sprung'), ['sprung.dauer', 'zahl', 'Sprungdauer (s)', '', 0.02], ['sprung.tempo', 'zahl', 'Sprungtempo'], ...PAUSE('sprung')]],
    schuss: ['Schuss', 'Wirft Kugeln, die du mit dem Schwert zurückschlagen kannst. Braucht freie Sicht.', [['schuss.reichweite', 'zahl', 'Reichweite (px)'], ANKUENDIGUNG('schuss'), ['schuss.tempo', 'zahl', 'Kugeltempo'], ['schuss.schaden', 'zahl', 'Schaden (½ Herzen)'], ['schuss.anzahl', 'wahl', 'Kugeln', '', { 1: 'eine', 3: 'drei im Fächer' }], ...PAUSE('schuss')]],
    rammen: ['Rammen', 'Nur wenn du in einer Linie mit ihm stehst. Rennt geradeaus; prallt er gegen ein Hindernis, ist er betäubt.', [['rammen.reichweite', 'zahl', 'Reichweite (px)'], ANKUENDIGUNG('rammen'), ['rammen.tempo', 'zahl', 'Tempo'], ['rammen.dauer', 'zahl', 'höchstens (s)', '', 0.1], ['rammen.betaeubt', 'zahl', 'danach betäubt (s)', '', 0.1], ...PAUSE('rammen')]],
    stampfen: ['Stampfen', 'Ein roter Kreis kündigt es an, dann tut es im Kreis weh.', [['stampfen.reichweite', 'zahl', 'Auslösen ab Abstand (px)'], ANKUENDIGUNG('stampfen'), ['stampfen.radius', 'zahl', 'Radius (px)'], ['stampfen.schaden', 'zahl', 'Schaden (½ Herzen)'], ...PAUSE('stampfen')]],
  };
  const UEBERGAENGE = { zeit: 'nach Zeit', zufall: 'nach zufälliger Zeit', lp: 'Lebenspunkte unter', angriff: 'nach einem Angriff', treffer: 'nach einer Trefferserie', signal: 'wenn ein Signal gilt' };
  const holen = (o, pfad) => pfad.split('.').reduce((x, k) => x == null ? undefined : x[k], o);
  function setzen(o, pfad, wert) {
    const teile = pfad.split('.'), letztes = teile.pop();
    const ziel = teile.reduce((x, k, i) => (x[k] = x[k] ?? (/^\d+$/.test(teile[i + 1] ?? letztes) ? [] : {})), o);
    if (wert === undefined) delete ziel[letztes]; else ziel[letztes] = wert;
  }
  const eigeneArt = () => eigene.gegnerarten[Z.gegnerArt];
  const artVon = () => eigeneArt() || DATEN.gegnerarten[Z.gegnerArt];
  // Was das Formular zeigt: das Grundverhalten oder (bei gewählter Phase) Art und Phase zusammen – null heißt „in dieser Phase aus“
  function anzeige() {
    const a = artVon(), ph = Z.gPhase !== null && a.phasen && a.phasen[Z.gPhase];
    return ph ? { ...a, ...ph } : a;
  }
  function gFeld([pfad, typ, label, hilfe = '', opt]) {
    const w = holen(anzeige(), pfad);
    if (typ === 'haken') return `<label class="klein"><input type="checkbox" data-gp="${pfad}" data-gt="haken"${w ? ' checked' : ''}> ${label}${hilfe ? ` <span class="erkl-inline">– ${hilfe}</span>` : ''}</label>`;
    let inhalt;
    if (typ === 'wahl') inhalt = `<select data-gp="${pfad}" data-gt="wahl">${Object.entries(opt).map(([k, v]) => `<option value="${esc(k)}"${String(w ?? '') === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
    else if (typ === 'prozent') inhalt = `<input type="number" min="0" max="100" data-gp="${pfad}" data-gt="prozent" value="${Math.round((w || 0) * 100)}">`;
    else if (typ === 'text' || typ === 'signal') inhalt = `<input data-gp="${pfad}" data-gt="${typ}" value="${esc(w ?? '')}">`;
    else inhalt = `<input type="number" step="${opt || 1}" data-gp="${pfad}" data-gt="zahl" value="${esc(w ?? '')}">`;
    return feld(label, inhalt, hilfe);
  }
  const zeilen = felder => { let html = '', paar = []; for (const f of felder) { if (f[1] === 'haken') { html += gFeld(f); continue; } paar.push(gFeld(f)); if (paar.length === 2) { html += `<div class="zeile">${paar.join('')}</div>`; paar = []; } } return html + (paar.length ? `<div class="zeile">${paar[0]}<div></div></div>` : ''); };
  const wahlHtml = (attr, wert, optionen) => `<select ${attr}>${Object.entries(optionen).map(([k, v]) => `<option value="${esc(k)}"${String(wert ?? '') === String(k) ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  // Ein Übergang (je Phase „weiter“) oder Wendepunkt: wann, wohin, was beim Eintritt passiert
  function uebergangHtml(u, i, liste, a, mitEintritt) {
    const phasen = Object.fromEntries((a.phasen || []).map((p, k) => [k, `Phase ${k + 1}${p.name ? ' – ' + p.name : ''}`]));
    const attr = f => `data-${liste}="${i}" data-uf="${f}"`, zahl = (f, w, schritt = 0.5) => `<input type="number" step="${schritt}" ${attr(f)} value="${w ?? ''}">`;
    const param = { zeit: feld('Sekunden', zahl('s', u.s)), zufall: `<div class="zeile">${feld('von (s)', zahl('s0', (u.s || [3, 6])[0]))}${feld('bis (s)', zahl('s1', (u.s || [3, 6])[1]))}</div>`,
      lp: feld('Lebenspunkte unter (%)', zahl('unter', Math.round((u.unter ?? 0.5) * 100), 5)),
      angriff: feld('welcher Angriff', wahlHtml(attr('art'), u.art || '', { '': 'irgendeiner', sprung: 'Sprung', schuss: 'Schuss', rammen: 'Rammen', stampfen: 'Stampfen' })),
      treffer: `<div class="zeile">${feld('Treffer', zahl('n', u.n ?? 3, 1))}${feld('in Sekunden', zahl('in', u.in ?? 2))}</div>`,
      signal: feld('Signal', `<input ${attr('signal')} value="${esc(u.signal || '')}" list="ed-signalliste2">`) }[u.wenn] || '';
    const [rArt, rN] = Object.entries(u.ruft || {})[0] || ['', 0];
    const ziele = liste === 'ue' ? { ...phasen, zufall: 'zufällige andere Phase' } : phasen;
    return `<div class="phase"><div class="zeile">${feld('wann', wahlHtml(attr('wenn'), u.wenn, liste === 'wp' ? { lp: UEBERGAENGE.lp, signal: UEBERGAENGE.signal } : UEBERGAENGE))}${feld('weiter zu', wahlHtml(attr('ziel'), u.ziel ?? '', ziele))}</div>
      ${param}${mitEintritt ? `<div class="zeile">${feld('Banner', `<input ${attr('text')} value="${esc(u.text || '')}">`)}${feld('ruft', wahlHtml(attr('ruftArt'), rArt, { '': '– niemanden –', ...Object.fromEntries(Object.keys(DATEN.gegnerarten).filter(k => k !== Z.gegnerArt).map(k => [k, k])) }))}</div>
      ${rArt ? feld('Anzahl', `<input type="number" min="1" max="8" ${attr('ruftN')} value="${rN}">`) : ''}` : ''}
      <button data-a="${liste}weg" data-i="${i}">entfernen</button></div>`;
  }
  function renderGegner() {
    const el = $('#ed-gegneransicht'), alle = Object.entries(DATEN.gegnerarten);
    if (!Z.gegnerArt || !DATEN.gegnerarten[Z.gegnerArt]) { Z.gegnerArt = alle[0][0]; Z.gPhase = null; }
    const id = Z.gegnerArt, a = artVon(), eigen = !!eigeneArt();
    if (Z.gPhase !== null && !(a.phasen && a.phasen[Z.gPhase])) Z.gPhase = null;
    const ph = Z.gPhase !== null ? a.phasen[Z.gPhase] : null, v = anzeige();
    const artWahl = () => Object.fromEntries(Object.keys(DATEN.gegnerarten).filter(k => k !== id).map(k => [k, k]));
    const b = v.bemerkt || {}, bArt = b.art || 'immer';
    const modul = (k, titel, erkl, felder) => `<div class="modul"><label class="klein kopf"><input type="checkbox" data-gmod="${k}"${v[k] ? ' checked' : ''}> <b>${titel}</b></label>
      <small class="erkl">${erkl}</small>${v[k] ? zeilen(felder) : ''}</div>`;
    const reiter = `<div class="reiter"><button data-gphase=""${ph ? '' : ' class="an"'}>Grundverhalten</button>${(a.phasen || []).map((p, i) => `<button data-gphase="${i}"${Z.gPhase === i ? ' class="an"' : ''}>${i + 1} ${esc(p.name || '')}</button>`).join('')}<button data-a="phaseneu"${eigen ? '' : ' disabled'}>＋ Phase</button></div>`;
    const signale = Object.keys(dungeonSignale(DATEN, DATEN.dungeons[Z.dungeon] || { raeume: {} }).quellen);
    el.innerHTML = `
      <div class="spalte"><h3>Gegnerarten</h3>
        <div class="liste">${alle.map(([k, g]) => `<button data-art="${k}" class="${k === id ? 'an' : ''}"><img class="kbild" src="${bildUrl(GEGNERBILD[k][0])}" alt=""> ${esc(k)} <small>${eigene.gegnerarten[k] ? 'eigen' : 'eingebaut'}${g.boss ? ' · Boss' : ''}${g.phasen ? ' · ' + g.phasen.length + ' Phasen' : ''}</small></button>`).join('')}</div>
        <div class="knoepfe"><button data-a="artneu">Neue Art</button><button data-a="artkopie">Kopie</button>${eigen ? '<button data-a="artloeschen" class="gefahr">Löschen</button>' : ''}</div></div>
      <div class="spalte breit"><h3>${esc(id)} ${eigen ? '' : '<small>(eingebaut – als Kopie bearbeiten)</small>'}</h3>
        <div class="vorschau"><canvas id="ed-gvorschau" width="128" height="128"></canvas></div>
        <datalist id="ed-signalliste2">${signale.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <h3>Phasen</h3>
        <p class="klein">Ohne Phasen hat ein Gegner ein festes Verhalten (das Grundverhalten). Mit Phasen wechselt er zwischen Verhaltensweisen,
          z. B. „Jagd“ (unverwundbar) → „Erschöpft“ (benommen, verwundbar) → zurück. Jede Phase übernimmt das Grundverhalten und ändert nur, was du in ihr einstellst.</p>
        ${reiter}
        <fieldset${eigen ? '' : ' disabled'}>
        ${ph ? '' : `<h3>Grundwerte</h3>
        ${zeilen([['bild', 'wahl', 'Grundbild', '', Object.fromEntries(Object.keys(GRUNDBILDER).map(k => [k, k]))], ['lp', 'zahl', 'Lebenspunkte'],
          ['beute.herz', 'prozent', 'Herz fallen lassen (%)'], ['groesse', 'wahl', 'Größe', '', { 1: 'normal', 1.5: '1,5-fach', 2: 'doppelt' }],
          ['balken', 'wahl', 'Lebensbalken', '', { '': 'automatisch (Boss: groß)', aus: 'keiner', klein: 'klein über dem Kopf', gross: 'groß unten im Bild' }],
          ['abgrundfest', 'haken', 'abgrundfest', 'lässt sich nicht in Abgründe stoßen – bleibt an der Kante stehen (für Bosse meist sinnvoll)']])}`}
        ${ph ? `<div class="modul">${feld('Name der Phase', `<input data-phname value="${esc(ph.name || '')}">`)}
          <b>Übergänge</b> <small class="erkl">Der erste zutreffende gewinnt. Ohne Übergang bleibt er in dieser Phase.</small>
          ${(ph.weiter || []).map((u, i) => uebergangHtml(u, i, 'ue', a, false)).join('')}<button data-a="ueneu">＋ Übergang</button>
          <div class="zeile">${feld('Beim Eintritt: Banner', `<input data-ein="text" value="${esc((ph.eintritt || {}).text || '')}">`)}${feld('kurz unverwundbar (s)', `<input type="number" step="0.1" data-ein="unverwundbar" value="${(ph.eintritt || {}).unverwundbar ?? ''}">`)}</div>
          <div class="knoepfe"><button data-a="phasezurueck">Phase auf Grundverhalten zurücksetzen</button><button data-a="phaseweg" class="gefahr">Phase löschen</button></div></div>
          <p class="klein"><b>Verhalten in Phase ${Z.gPhase + 1}:</b> Alles Folgende gilt nur in dieser Phase. Ausgeschaltete Bausteine sind in dieser Phase aus.</p>`
        : a.phasen ? `<div class="modul"><b>Wendepunkte</b> <small class="erkl">Aus jeder Phase heraus, je einmal – z. B. „unter 50 % Lebenspunkte: Wut-Phase“.</small>
          ${(a.wendepunkte || []).map((u, i) => uebergangHtml(u, i, 'wp', a, true)).join('')}<button data-a="wpneu">＋ Wendepunkt</button></div>` : ''}
        <h3>Werte${ph ? ' in dieser Phase' : ''}</h3>
        ${zeilen([['tempo', 'zahl', 'Tempo (px/s)'], ['schaden', 'zahl', 'Schaden bei Berührung (½ Herzen)'],
          ['gewicht', 'zahl', 'Gewicht', '1 normal · 0 rührt sich nicht · 2 fliegt weit (in Abgründe)', 0.1],
          ...(ph ? [['tempoFaktor', 'zahl', 'Tempo ×', 'z. B. 1,3 = schneller', 0.05], ['pauseFaktor', 'zahl', 'Pausen zwischen Angriffen ×', 'z. B. 0,7 = greift öfter an', 0.05]] : [])])}
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
        ${zeilen([['unverwundbar', 'haken', 'unverwundbar', 'schimmert weiß, das Schwert prallt ab (Explosionen wirken trotzdem)'],
          ['benommen', 'haken', 'benommen', 'steht mit Sternen still, greift nicht an, Schild und Rüstung wirken nicht – das Fenster zum Zuschlagen']])}
        ${modul('serienschutz', 'Schutz bei Trefferserie', 'Gegen „einfach draufhauen“: Nach mehreren Treffern kurz hintereinander wird er kurz unverwundbar und stößt dich auf Wunsch mit einem Stampfer zurück.', [['serienschutz.treffer', 'zahl', 'Treffer'], ['serienschutz.zeit', 'zahl', 'innerhalb (s)', '', 0.1], ['serienschutz.dauer', 'zahl', 'dann geschützt (s)', '', 0.1], ['serienschutz.schaden', 'zahl', 'Gegenstoß-Schaden (½ Herzen)'], ['serienschutz.konter', 'haken', 'mit Gegenstoß']])}
        ${modul('ausweichen', 'Ausweichen', 'Holst du in seiner Nähe zum Schlag aus (oder kommst sehr nah), springt er manchmal weg.', [['ausweichen.chance', 'prozent', 'Wahrscheinlichkeit (%)'], ['ausweichen.tempo', 'zahl', 'Sprungtempo'], ['ausweichen.abklingzeit', 'zahl', 'frühestens wieder nach (s)', '', 0.1]])}
        ${modul('schild', 'Schild', 'Treffer von vorn prallen ab. Er dreht sich langsam zu dir – lauf um ihn herum.', [['schild.drehtempo', 'zahl', 'Drehtempo (Grad/s)']])}
        ${zeilen([['ruestung', 'wahl', 'Rüstung', '', { '': 'keine', schlag: 'erster Treffer betäubt nur, dann verwundbar', betaeubt: 'nur verwundbar, wenn betäubt (Rammen, Kugel)' }]])}
        ${ph ? '' : `<h3>Bei Niederlage</h3>
        ${zeilen([['signal', 'signal', 'Signal auslösen', 'Alle Gegner dieser Art lösen es aus und kommen dann nicht wieder. Für einzelne Gegner: im Raum anklicken.']])}
        <div class="modul"><label class="klein kopf"><input type="checkbox" data-gmod="teilen"${a.teilen ? ' checked' : ''}> <b>Teilt sich</b></label>
          ${a.teilen ? `<div class="zeile">${feld('in', `<select data-gp="teilen.art" data-gt="wahl">${Object.entries(artWahl()).map(([k, w]) => `<option value="${k}"${k === a.teilen.art ? ' selected' : ''}>${w}</option>`).join('')}</select>`)}${gFeld(['teilen.anzahl', 'zahl', 'Anzahl'])}</div>` : ''}</div>
        ${modul('explodiert', 'Explodiert', 'Nach der Niederlage blinkt ein roter Kreis, dann explodiert er – trifft auch andere Gegner.', [['explodiert.zeit', 'zahl', 'Zeit bis zur Explosion (s)', '', 0.1], ['explodiert.radius', 'zahl', 'Radius (px)'], ['explodiert.schaden', 'zahl', 'Schaden (½ Herzen)']])}
        <h3>Boss</h3>
        ${modul('boss', 'Ist ein Boss', 'Großer Lebensbalken mit Namen, kommt nach dem Sieg nicht wieder, zerplatzt am Ende mit Explosionen und „WOWOWOW“. Sein Verhalten baust du mit Phasen (oben).', [['boss.name', 'text', 'Name im Lebensbalken']])}
        <h3>Farben</h3><div class="farben">${farbenVon(a.bild).map(f => `<label title="${f}"><input type="color" data-farbe="${f}" value="${(a.farben || {})[f] || f}"></label>`).join('')}
        <button data-a="farbenzurueck">Original</button></div>`}
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
  // Wohin eine Eingabe schreibt: in die gewählte Phase (nur Verhaltens-Bausteine) oder in die Art
  function schreibZiel(a, schluessel) {
    if (Z.gPhase === null || !VERHALTEN.includes(schluessel)) return a;
    const ph = a.phasen[Z.gPhase];
    if (ph[schluessel] === undefined && a[schluessel] && typeof a[schluessel] === 'object') ph[schluessel] = kopie(a[schluessel]);   // erst erben, dann ändern
    return ph;
  }
  function uebergangEingabe(t, u) {
    const f = t.dataset.uf, zahl = Number(t.value);
    if (f === 'wenn') { for (const k of ['s', 'unter', 'art', 'n', 'in', 'signal']) delete u[k]; u.wenn = t.value; if (t.value === 'zufall') u.s = [3, 6]; if (t.value === 'zeit') u.s = 5; if (t.value === 'lp') u.unter = 0.5; }
    else if (f === 'ziel') u.ziel = t.value === 'zufall' ? 'zufall' : Number(t.value);
    else if (f === 's0' || f === 's1') { u.s = Array.isArray(u.s) ? u.s : [3, 6]; u.s[f === 's0' ? 0 : 1] = zahl; }
    else if (f === 'unter') u.unter = Math.max(1, Math.min(99, zahl)) / 100;
    else if (f === 'art') { if (t.value) u.art = t.value; else delete u.art; }
    else if (f === 'signal') { const n = signalName(t.value); if (n) u.signal = n; else delete u.signal; }
    else if (f === 'text') { if (t.value.trim()) u.text = t.value.trim().toUpperCase(); else delete u.text; }
    else if (f === 'ruftArt' || f === 'ruftN') {
      const [art, n] = Object.entries(u.ruft || {})[0] || ['', 1], neuArt = f === 'ruftArt' ? t.value : art, neuN = f === 'ruftN' ? zahl : (n || 1);
      if (neuArt && neuN > 0) u.ruft = { [neuArt]: neuN }; else delete u.ruft;
    }
    else u[f] = zahl;
  }
  function gegnerEingabe(e) {
    const t = e.target, a = eigeneArt();
    if (!a) return;
    merke();
    const ph = Z.gPhase !== null ? a.phasen[Z.gPhase] : null;
    if (t.dataset.farbe) { a.farben = { ...(a.farben || {}) }; if (t.value === t.dataset.farbe) delete a.farben[t.dataset.farbe]; else a.farben[t.dataset.farbe] = t.value; if (!Object.keys(a.farben).length) delete a.farben; }
    else if (t.dataset.gmod) {   // Baustein an/aus – in einer Phase: aus = null (überschreibt das Grundverhalten)
      const k = t.dataset.gmod, ziel = schreibZiel(a, k), vorlage = a[k] || MODUL_VORGABE[k];
      if (t.checked) ziel[k] = k === 'teilen' ? { art: Object.keys(DATEN.gegnerarten).find(x => x !== Z.gegnerArt), anzahl: 2 } : kopie(vorlage);
      else if (ziel === a) delete a[k]; else if (a[k]) ziel[k] = null; else delete ziel[k];
      speichern(); renderGegner(); return;
    }
    else if (t.dataset.ue !== undefined) { uebergangEingabe(t, ph.weiter[Number(t.dataset.ue)]); speichern(); renderGegner(); return; }
    else if (t.dataset.wp !== undefined) { uebergangEingabe(t, a.wendepunkte[Number(t.dataset.wp)]); speichern(); renderGegner(); return; }
    else if (t.dataset.phname !== undefined) { ph.name = t.value.trim(); speichern(); renderGegner(); return; }
    else if (t.dataset.ein) {
      ph.eintritt = ph.eintritt || {};
      if (t.dataset.ein === 'text') { if (t.value.trim()) ph.eintritt.text = t.value.trim().toUpperCase(); else delete ph.eintritt.text; }
      else if (Number(t.value) > 0) ph.eintritt.unverwundbar = Number(t.value); else delete ph.eintritt.unverwundbar;
      if (!Object.keys(ph.eintritt).length) delete ph.eintritt;
      speichern(); return;
    }
    else if (t.dataset.gp) {
      const pfad = t.dataset.gp, typ = t.dataset.gt, k = pfad.split('.')[0], ziel = schreibZiel(a, k);
      let wert = typ === 'haken' ? t.checked : typ === 'zahl' ? Number(t.value) : typ === 'prozent' ? Math.max(0, Math.min(100, Number(t.value))) / 100 : t.value;
      if (typ === 'wahl' && /^[\d.]+$/.test(wert)) wert = Number(wert);
      if (typ === 'signal') wert = signalName(wert) || undefined;
      if (pfad === 'bild') { a.bild = wert; Object.assign(a, kopie(GRUNDBILDER[wert])); delete a.farben; speichern(); renderGegner(); return; }
      if (pfad === 'bemerkt.art' && wert === 'immer') { if (ziel === a) delete a.bemerkt; else ziel.bemerkt = null; speichern(); renderGegner(); return; }
      if (pfad === 'bemerkt.art' && !ziel.bemerkt) ziel.bemerkt = { weite: 200, kegel: 80 };
      if ((pfad === 'ruestung' || pfad === 'balken') && !wert) wert = undefined;
      if (ziel === a && ((pfad === 'groesse' && wert === 1) || (pfad === 'gewicht' && wert === 1))) wert = undefined;
      if (typ === 'haken' && !wert && !pfad.startsWith('ki.')) wert = ziel !== a && a[k] ? false : undefined;
      if (ziel !== a && pfad === 'ruestung' && wert === undefined && a.ruestung) wert = null;
      setzen(ziel, pfad, wert);
      if (pfad === 'boss.name' && a.boss) a.boss.name = String(a.boss.name || '').toUpperCase();
      speichern();
      if (typ === 'wahl' || typ === 'haken' || typ === 'signal') renderGegner();
      return;
    }
    speichern();
  }
  function phasenAktion(aktion, el) {
    const a = eigeneArt();
    if (!a) return;
    merke();
    if (aktion === 'phaseneu') {
      if (!a.phasen) {   // erste Phase: gleich zwei, die sich abwechseln – als Vorlage
        a.phasen = [{ name: 'Angriff', weiter: [{ wenn: 'zeit', s: 6, ziel: 1 }] }, { name: 'Erschöpft', benommen: true, weiter: [{ wenn: 'zeit', s: 3, ziel: 0 }] }];
        Z.gPhase = 0;
      } else { a.phasen.push({ name: 'Phase ' + (a.phasen.length + 1), weiter: [{ wenn: 'zeit', s: 5, ziel: 0 }] }); Z.gPhase = a.phasen.length - 1; }
    } else if (aktion === 'phaseweg') {
      const i = Z.gPhase;
      a.phasen.splice(i, 1);
      const fix = u => { if (typeof u.ziel === 'number') u.ziel = u.ziel === i ? 0 : u.ziel > i ? u.ziel - 1 : u.ziel; };
      for (const p of a.phasen) (p.weiter || []).forEach(fix);
      (a.wendepunkte || []).forEach(fix);
      if (a.phasen.length === 0) { delete a.phasen; delete a.wendepunkte; }
      Z.gPhase = null;
    } else if (aktion === 'phasezurueck') { const p = a.phasen[Z.gPhase]; a.phasen[Z.gPhase] = { name: p.name, ...(p.weiter ? { weiter: p.weiter } : {}), ...(p.eintritt ? { eintritt: p.eintritt } : {}) }; }
    else if (aktion === 'ueneu') { const p = a.phasen[Z.gPhase]; (p.weiter = p.weiter || []).push({ wenn: 'zeit', s: 5, ziel: (Z.gPhase + 1) % a.phasen.length }); }
    else if (aktion === 'ueweg') { const p = a.phasen[Z.gPhase]; p.weiter.splice(Number(el.dataset.i), 1); }
    else if (aktion === 'wpneu') (a.wendepunkte = a.wendepunkte || []).push({ wenn: 'lp', unter: 0.5, ziel: a.phasen.length - 1 });
    else if (aktion === 'wpweg') { a.wendepunkte.splice(Number(el.dataset.i), 1); if (!a.wendepunkte.length) delete a.wendepunkte; }
    speichern(); renderGegner();
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

  function bedingungLesbar(b) {   // Bedingung als Satz, z. B. „hat Laterne und nicht „steg““
    if (typeof b === 'string') {
      if (b === 'geraeumt') return 'Raum geräumt';
      if (b.startsWith('hat:')) return 'hat ' + ((DATEN.gegenstaende[b.slice(4)] || {}).name || b.slice(4));
      const k = b.indexOf('='); if (k > 0) return `Kristall ${kristallTyp(b.slice(0, k)).name} zeigt ${farbName(b.slice(k + 1))}`;
      return '„' + b + '“';
    }
    if (!b) return 'immer';
    if (b.nicht !== undefined) return 'nicht ' + bedingungLesbar(b.nicht);
    if (b.alle) return b.alle.map(bedingungLesbar).join(' und ');
    if (b.eine) return b.eine.map(bedingungLesbar).join(' oder ');
    return JSON.stringify(b);
  }
  // ---------- Logik-Ansicht: Ablauf in Stufen (wie ein Spoiler-Log), Fehler, Abhängigkeiten der Türen ----------
  function renderLogik() {
    const el = $('#ed-logikansicht'), d = dg(), p = Z.pruefung;
    if (!d) { el.innerHTML = '<div class="spalte breit"><p>Erst einen Dungeon wählen.</p></div>'; return; }
    if (!p) { el.innerHTML = '<div class="spalte breit"><p>Prüfe …</p></div>'; zeigeWarnungen(); return; }
    const nr = id => esc((d.raeume[id] || {}).nr || id);
    const was = e => e.was === 'truhe' ? `Truhe: ${esc((DATEN.gegenstaende[e.name] || {}).name || e.name)}` : e.was === 'kristall' ? `Kristall ${esc(kristallTyp(e.name).name)} schaltbar` : `Signal „${esc(e.name)}“${e.ereignis ? ' (Ereignis)' : ''}`;
    const tueren = [];
    for (const [id, r] of Object.entries(d.raeume)) for (const [dir, t] of Object.entries(r.tueren)) {
      if (!t.schloss && t.offen_wenn === undefined) continue;
      const bed = t.schloss ? 'kleiner Schlüssel' : bedingungLesbar(t.offen_wenn);
      tueren.push(`<tr><td>Raum ${nr(id)} ${TUERNAME(dir)}</td><td>→ Raum ${nr(t.ziel)}</td><td>${esc(bed)}${t.merken ? ' (bleibt offen)' : ''}</td></tr>`);
    }
    el.innerHTML = `<div class="spalte breit">
      ${loeserHtml()}
      <h3>Prüfung: ${p.fehler.length ? `<span class="rot">${p.fehler.length} Fehler</span>` : '<span class="gruen">lösbar</span>'}${p.hinweise.length ? ` · <span class="gelb">${p.hinweise.length} Hinweise</span>` : ''}</h3>
      ${liste(p.fehler, 'fehler')}${liste(p.hinweise, 'hinweis')}
      <h3>Ablauf in Stufen</h3>
      <p class="klein">So kommt man durch den Dungeon: In Stufe 1 ist alles erreichbar, was ohne Schlüssel und Signale geht. Was man dort bekommt, öffnet die Türen der nächsten Stufe – usw. Die Stufen stehen auch klein auf der Karte (S2, S3 …); rot umrandete Räume sind nie erreichbar.</p>
      <ol class="ablauf">${p.logik.ablauf.map(a => `<li><b>Stufe ${a.stufe}</b>
        ${a.raeume.length ? `<div>erreichbar: ${a.raeume.map(id => `<button data-raumwahl="${id}">Raum ${nr(id)}</button>`).join(' ')}</div>` : ''}
        ${a.erhalten.length ? `<div>dort gibt es: ${a.erhalten.map(e => `${was(e)} <small>(Raum ${nr(e.raum)})</small>`).join(' · ')}</div>` : ''}
        ${a.geoeffnet.length ? `<div>aufgeschlossen: ${a.geoeffnet.map(t => `Raum ${nr(t.raum)} ${TUERNAME(t.dir)}`).join(' · ')}</div>` : ''}</li>`).join('')}</ol>
      <h3>Rätselräume und Nachweise</h3>
      <p class="klein">Ob ein Rätsel innerhalb eines Raums lösbar ist, weist ein Testlauf nach: Im Raumtest jede Tür und jede Truhe einmal erreichen. Der Nachweis gilt, bis du den Raum änderst.</p>
      ${(() => { const n = Object.entries(p.logik.nachweise || {}).filter(([, x]) => x.raetsel); return n.length ? `<ul class="nachweisliste">${n.map(([id, x]) => `<li class="${x.status}"><button data-raumwahl="${id}">Raum ${nr(id)}</button> ${{ ok: '✓ nachgewiesen', teil: `${x.erreicht.length}/${x.ziele.length} Ziele`, veraltet: 'geändert – neu testen', offen: 'noch nicht getestet' }[x.status]}${x.status !== 'ok' && x.erreicht.length < x.ziele.length ? ` <small>(fehlt: ${x.ziele.filter(z => !x.erreicht.includes(z)).map(ZIEL_NAME).join(', ')})</small>` : ''}</li>`).join('')}</ul>` : '<p class="klein">Keine Rätselräume (Abgründe, Blöcke, Platten, Kristalle, Pflöcke, bedingte Truhen).</p>'; })()}
      <h3>Türen mit Bedingung</h3>
      ${tueren.length ? `<table class="tabelle">${tueren.join('')}</table>` : '<p class="klein">Keine – alle Türen sind offen.</p>'}
      <h3>Was die Prüfung kann – und was nicht</h3>
      <p class="klein">Sie spielt den Dungeon gedanklich durch: Türen je Richtung, Schlüssel (auch in ungünstiger Reihenfolge), Signale von Platten, Gegnern, Kristallen und Ereignissen, Truhen, die erst unter einer Bedingung erscheinen. Sie prüft <b>nicht</b>, ob ein Rätsel innerhalb eines Raums lösbar ist (Blöcke, Pflöcke, Abgründe) – das geht nur durch Testen.</p></div>`;
  }

  // ---------- Löser (alle Zustände) und Raumteile ----------
  // loeser.js wird erst geladen, wenn man es braucht. Der Löser rechnet in einem Worker, damit der Editor bedienbar bleibt.
  let loeserLaden = null, loeserWorker = null, loeserZeichnen = 0;
  function loeserBereit() {
    if (typeof Loeser !== 'undefined') return Promise.resolve();
    return loeserLaden = loeserLaden || new Promise((ok, nein) => {
      const sc = document.createElement('script'); sc.src = 'loeser.js'; sc.onload = ok; sc.onerror = () => nein(new Error('loeser.js konnte nicht geladen werden')); document.head.appendChild(sc);
    });
  }
  const loeserDaten = () => ({ objektarten: DATEN.objektarten, kacheln: DATEN.kacheln, zeichen: DATEN.zeichen, kristalltypen: DATEN.kristalltypen,
    gegenstaende: DATEN.gegenstaende, gegnerarten: DATEN.gegnerarten, waffen: DATEN.waffen, einstellungen: DATEN.einstellungen });
  function stand() {   // Fingerabdruck des Dungeons: hat sich seit der letzten Rechnung etwas geändert?
    const t = JSON.stringify([DATEN.dungeons[Z.dungeon], DATEN.kristalltypen, DATEN.gegenstaende]);
    let h = 5381; for (let i = 0; i < t.length; i++) h = (Math.imul(h, 33) ^ t.charCodeAt(i)) >>> 0;
    return h.toString(36) + t.length;
  }
  function starteLoeser() {
    stoppeLoeser();
    const L = Z.loeser = { dungeon: Z.dungeon, stand: stand(), laeuft: true, fortschritt: 0, start: Date.now() };
    const fertig = erg => { L.laeuft = false; L.ergebnis = erg; L.sekunden = Math.round((Date.now() - L.start) / 1000); loeserWorker = null; if (Z.ansicht === 'logik') renderLogik(); };
    const fehler = text => { L.laeuft = false; L.fehler = text; loeserWorker = null; if (Z.ansicht === 'logik') renderLogik(); };
    const dgD = kopie(DATEN.dungeons[Z.dungeon]);
    const imFenster = () => {   // ohne Worker (z. B. Datei direkt geöffnet): im Fenster rechnen – der Editor steht solange
      loeserWorker = null;
      loeserBereit().then(() => setTimeout(() => { if (Z.loeser !== L) return; try { fertig(Loeser.loese(loeserDaten(), dgD)); } catch (err) { fehler(String(err)); } }, 50), err => fehler(String(err)));
    };
    try {
      let gehoert = false;
      loeserWorker = new Worker('loeser.js');
      loeserWorker.onmessage = e => {
        gehoert = true;
        if (Z.loeser !== L) return;
        if (e.data.fortschritt) { L.fortschritt = e.data.fortschritt; if (Z.ansicht === 'logik' && Date.now() - loeserZeichnen > 400) { loeserZeichnen = Date.now(); renderLogik(); } }
        else if (e.data.ergebnis) fertig(e.data.ergebnis);
        else if (e.data.fehler) fehler(e.data.fehler);
      };
      loeserWorker.onerror = e => { e.preventDefault(); if (Z.loeser !== L) return; if (gehoert) fehler(e.message || 'Worker-Fehler'); else imFenster(); };
      loeserWorker.postMessage({ daten: loeserDaten(), dungeon: dgD });
    } catch (e) { imFenster(); }
    renderLogik();
  }
  function stoppeLoeser() {
    if (loeserWorker) { loeserWorker.terminate(); loeserWorker = null; }
    if (Z.loeser && Z.loeser.laeuft) { Z.loeser.laeuft = false; Z.loeser.abgebrochen = true; }
  }
  function loeserHtml() {
    const L = Z.loeser && Z.loeser.dungeon === Z.dungeon ? Z.loeser : null, e = L && L.ergebnis, d = dg();
    const nr = id => esc((d.raeume[id] || {}).nr || id), raumKnopf = id => id && d.raeume[id] ? `<button data-raumwahl="${id}" class="klein">Raum ${nr(id)}</button>` : '';
    const zahl = n => n.toLocaleString('de-DE');
    let kopf = '';
    if (!L) kopf = '<p class="klein">Noch nicht durchgerechnet.</p>';
    else if (L.laeuft) kopf = `<p>Rechnet … ${zahl(L.fortschritt)} Zustände <button data-a="loesenstop">Abbrechen</button></p>`;
    else if (L.fehler) kopf = `<p class="rot">Fehler: ${esc(L.fehler.split('\n')[0])}</p>`;
    else if (L.abgebrochen && !e) kopf = '<p class="klein">Abgebrochen.</p>';
    const veraltet = L && !L.laeuft && e && L.stand !== stand();
    let inhalt = '';
    if (e && !L.laeuft) {
      const ok = e.loesbar && !e.sackgassen;
      inhalt = `<p class="loeserstatus ${ok ? 'gruen' : e.loesbar ? 'gelb' : 'rot'}">${e.loesbar ? '✓ lösbar' : '✗ nicht lösbar'} · Ziel: ${esc(e.ziel)} · ${zahl(e.zustaende)} Zustände${e.fertig ? '' : ' (abgebrochen – zu viele)'} ·
        ${e.sackgassen ? `<b>${zahl(e.sackgassen)} Sackgassen</b>` : 'keine Sackgasse'} · ${L.sekunden} s${veraltet ? ' · <span class="gelb">seit der Rechnung geändert</span>' : ''}</p>
        ${e.fehltritte.length ? `<h4>Hier kann man sich verbauen</h4><small class="erkl">Schritte, nach denen das Ziel nie mehr erreichbar ist – z. B. ein Schlüssel an der falschen Tür. Abhilfe: mehr Schlüssel, Tür von beiden Seiten, Riegel, anderer Weg.</small>
          <ul class="fehltritte">${e.fehltritte.map(f => `<li><b>${esc(f.text)}</b> ${raumKnopf(f.raum)} <small>(in ${zahl(f.anzahl)} Spielverläufen)</small>
            <details><summary class="klein">So kommt man dahin</summary><ol>${f.weg.map(x => `<li>${esc(x.text)}${x.gewonnen && x.gewonnen.length ? ` <small>– ${esc(x.gewonnen.join(', '))}</small>` : ''}</li>`).join('')}</ol></details></li>`).join('')}</ul>` : ''}
        ${e.warnungen.length ? `<h4>Warnungen</h4><ul class="warnliste">${e.warnungen.map(w => `<li>${esc(w.text)} ${raumKnopf(w.raum)}</li>`).join('')}</ul>` : ''}
        ${e.nieErreicht.length ? `<h4>Nie erreicht</h4><p>${e.nieErreicht.map(r => raumKnopf(r.id)).join(' ')}</p>` : ''}
        ${e.weg.length ? `<details class="wegliste"><summary>Kürzester Weg (${e.weg.length - 1} Schritte)</summary><ol>${e.weg.map(x => `<li>${esc(x.text)}${x.gewonnen && x.gewonnen.length ? ` <small class="gruen">– ${esc(x.gewonnen.join(', '))}</small>` : ''}</li>`).join('')}</ol></details>` : ''}`;
    }
    return `<div class="loeserkasten"><h3>Löser: alle Spielverläufe</h3>
      <small class="erkl">Spielt jeden möglichen Verlauf durch – mit Raumteilen, Kristallfarben, Schlüsseln in jeder Reihenfolge, Schieberätseln, Zeitschaltern und Ereignissen. Findet den kürzesten Weg,
        Sackgassen (wo man sich verbaut), Einsperr-Fallen mit Blöcken und zu knappe Zeitläufe. Ziel: alle Bosse besiegt (ohne Bosse: alle Räume betreten). Große Dungeons brauchen ein, zwei Minuten – du kannst währenddessen weiterbauen.</small>
      <div class="knoepfe"><button data-a="loesen" class="haupt"${L && L.laeuft ? ' disabled' : ''}>${e ? 'Neu durchrechnen' : 'Durchrechnen'}</button></div>${kopf}${inhalt}</div>`;
  }

  const TEILFARBEN = ['#e0a33a', '#7fbcdc', '#8abd4f', '#d0574a', '#b07cc6', '#f4cd5e', '#58933b', '#8098cc', '#c99ad8', '#986438'];
  function teileZustand() {   // gewählter Zustand für die Ansicht; Kristalltypen anfangs auf ihrer ersten Farbe
    const z = Z.teileZustand = Z.teileZustand || { kristalle: {}, signale: [], besitz: [] };
    for (const [k, t] of Object.entries(DATEN.kristalltypen)) if (!t.farben.includes(z.kristalle[k])) z.kristalle[k] = t.farben[0];
    return z;
  }
  // Rechnung nur, wenn sich Raum oder Zustand geändert haben (Malen zeichnet ständig neu)
  let teileMerk = { schluessel: null, t: null }, abMerk = { schluessel: null, ab: null }, abWorker = null;
  function teileDaten() {
    if (typeof Loeser === 'undefined') return null;
    if (Z.teileAbRaum !== Z.raum) Z.teileAb = '';
    const dgD = DATEN.dungeons[Z.dungeon], z = teileZustand();
    const schluessel = JSON.stringify([Z.dungeon, Z.raum, dgD.raeume[Z.raum], z, DATEN.kristalltypen]);
    if (teileMerk.schluessel !== schluessel) {
      let t = null;
      try { t = Loeser.raumteile(DATEN, dgD, Z.raum, z); } catch (e) { console.warn('Raumteile:', e); }
      teileMerk = { schluessel, t };
    }
    const t = teileMerk.t;
    const mitAb = Z.teileAb && dgD.raeume[Z.raum].tueren[Z.teileAb];
    if (!mitAb && abWorker) { abWorker.terminate(); abWorker = null; abMerk = { schluessel: null, ab: null }; }
    if (t) t.ab = mitAb ? abDaten(schluessel + Z.teileAb, dgD, z) : null;
    return t;
  }
  function abDaten(schluessel, dgD, z) {   // „ab Eingang erreichbar“ probiert alle Blockstellungen durch – das kann dauern, deshalb im Hintergrund
    if (abMerk.schluessel === schluessel) return abMerk.ab;
    if (abWorker) { abWorker.terminate(); abWorker = null; }
    const M = abMerk = { schluessel, ab: { laeuft: true } }, args = [Z.raum, Z.teileAb, kopie(z)];
    const fertig = ab => { if (abMerk !== M) return; M.ab = ab; abWorker = null; if (Z.teile) { renderRechts(); zeichneRaum(); } };
    const imFenster = () => { abWorker = null; try { return Loeser.erreichbarAb(DATEN, dgD, ...args); } catch (err) { return { fehler: String(err) }; } };
    try {
      let gehoert = false;
      abWorker = new Worker('loeser.js');
      abWorker.onmessage = e => { gehoert = true; fertig(e.data.ab || { fehler: e.data.fehler || 'Fehler' }); };
      abWorker.onerror = e => { e.preventDefault(); fertig(gehoert ? { fehler: e.message || 'Worker-Fehler' } : imFenster()); };   // Worker nicht ladbar: im Fenster rechnen
      abWorker.postMessage({ ab: args, daten: loeserDaten(), dungeon: dgD });
    } catch (e) { M.ab = imFenster(); }
    return M.ab;
  }
  function zeichneTeile(g, r) {
    const t = teileDaten();
    if (!t) return;
    t.teile.forEach((teil, k) => {
      g.fillStyle = TEILFARBEN[k % TEILFARBEN.length]; g.globalAlpha = 0.3;
      for (const [c, rr] of teil.zellen) g.fillRect(c * T, rr * T, T, T);
      g.globalAlpha = 1;
      const m = teil.zellen[Math.floor(teil.zellen.length / 2)];   // Buchstabe ungefähr in der Mitte der Fläche
      g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#120d14'; g.fillText(teil.name, m[0] * T + 17, m[1] * T + 23); g.fillStyle = '#fffbec'; g.fillText(teil.name, m[0] * T + 16, m[1] * T + 22);
      for (const d of teil.tueren) {   // Tür mit dem Buchstaben ihres Teils
        const [x, y, w, h] = TUER_RECHTECK[d], mx = x + w / 2, my = y + h / 2;
        g.fillStyle = TEILFARBEN[k % TEILFARBEN.length]; g.beginPath(); g.arc(mx, my, 11, 0, 7); g.fill(); g.strokeStyle = '#120d14'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#120d14'; g.font = 'bold 13px sans-serif'; g.fillText(teil.name, mx, my + 5);
      }
    });
    if (t.ab && t.ab.zellen) {   // ab der gewählten Tür erreichbar (mit Schieben): Punkte
      g.fillStyle = 'rgba(255,251,236,.85)';
      for (const [c, rr] of t.ab.zellen) { g.beginPath(); g.arc(c * T + 16, rr * T + 16, 3, 0, 7); g.fill(); }
    }
  }
  function teileHtml(r) {
    const z = teileZustand(), t = teileDaten(), d = DATEN.dungeons[Z.dungeon];
    if (!t) return '<div class="teilekasten"><h3>Raumteile</h3><p class="klein">Lade …</p></div>';
    const fragen = Object.entries(dungeonSignale(DATEN, d).fragen).filter(([, wo]) => wo.some(x => x.raum === Z.raum)).map(([n]) => n);
    const typen = [...new Set([...r.objekte.filter(o => o.kristalltyp).map(o => o.kristalltyp), ...fragen.filter(n => n.includes('=')).map(n => n.split('=')[0])])].filter(k => DATEN.kristalltypen[k]);
    const signale = fragen.filter(n => n !== 'geraeumt' && !n.startsWith('hat:') && !n.includes('='));
    const items = fragen.filter(n => n.startsWith('hat:')).map(n => n.slice(4));
    const inhalt = teil => [teil.tueren.length ? 'Türen: ' + teil.tueren.map(TUERNAME).join(', ') : '', teil.truhen.length ? 'Truhe: ' + teil.truhen.map(i => (DATEN.gegenstaende[i] || {}).name || i).join(', ') : '',
      teil.kristalle.length ? 'Kristall' : '', teil.platten.length ? 'Platte: ' + teil.platten.join(', ') : ''].filter(Boolean).join(' · ') || '<span class="klein">nur Fläche</span>';
    const ab = t.ab;
    return `<div class="teilekasten"><h3>Raumteile</h3>
      <small class="erkl">Zusammenhängende Flächen im gewählten Zustand: Mauern, Abgründe und hochgefahrene Pflöcke trennen, Blöcke gelten als verschiebbar. Jede Tür trägt den Buchstaben ihres Teils.</small>
      ${typen.length || signale.length || items.length ? `<div class="klein"><b>Zustand</b></div>` : ''}
      ${typen.map(k => feld('Kristall ' + esc(kristallTyp(k).name), `<select data-tz="krist" data-n="${k}">${kristallTyp(k).farben.map(f => `<option value="${f}"${z.kristalle[k] === f ? ' selected' : ''}>${esc(farbName(f))}</option>`).join('')}</select>`)).join('')}
      ${signale.map(n => `<label class="klein"><input type="checkbox" data-tz="sig" data-n="${esc(n)}"${z.signale.includes(n) ? ' checked' : ''}> Signal „${esc(n)}“</label>`).join('')}
      ${items.map(n => `<label class="klein"><input type="checkbox" data-tz="hat" data-n="${esc(n)}"${z.besitz.includes(n) ? ' checked' : ''}> hat ${esc((DATEN.gegenstaende[n] || {}).name || n)}</label>`).join('')}
      <ul class="teileliste">${t.teile.map((teil, k) => `<li><span class="teilmarke" style="background:${TEILFARBEN[k % TEILFARBEN.length]}">${teil.name}</span> ${inhalt(teil)}</li>`).join('')}</ul>
      ${feld('Ab Eingang erreichbar', `<select data-tz="ab"><option value="">–</option>${Object.keys(r.tueren).map(dd => `<option value="${dd}"${Z.teileAb === dd ? ' selected' : ''}>Tür ${TUERNAME(dd)}</option>`).join('')}</select>`,
        'Mit Schieben, Zeitschaltern und Ereignissen – die erreichbaren Felder bekommen Punkte.')}
      ${ab && ab.laeuft ? '<p class="klein">Rechnet alle Blockstellungen durch …</p>' : ''}
      ${ab && ab.fehler ? `<p class="klein rot">Fehler: ${esc(String(ab.fehler).split('\n')[0])}</p>` : ''}
      ${ab && ab.zellen ? `<p class="klein">Von dort erreichbar: ${ab.tueren.length ? 'Türen ' + ab.tueren.map(TUERNAME).join(', ') : 'keine Tür'}${ab.truhen.length ? ' · Truhe: ' + ab.truhen.map(i => (DATEN.gegenstaende[i] || {}).name || i).join(', ') : ''}${ab.signale.length ? ' · löst aus: ' + ab.signale.map(x => '„' + esc(x) + '“').join(', ') : ''}${ab.kristalle.length ? ' · Kristall erreichbar' : ''}
        <small>(${ab.stellungen.toLocaleString('de-DE')} ${ab.stellungen === 1 ? 'Blockstellung' : 'Blockstellungen'}${ab.voll ? '' : ', nicht alle'})</small></p>
        ${ab.fallen ? `<p class="rot klein">Achtung: Man kann sich hier mit Blöcken einsperren (z. B. Held auf ${ab.beispielFalle.held}) – Abgrund oder Ausweg vorsehen.</p>` : ''}` : ''}
      ${t.zeitlaeufe.map(zl => `<p class="klein ${zl.zuKnapp ? 'rot' : zl.knapp ? 'gelb' : ''}">Zeitschalter auf ${zl.platte}: ${zl.felder} Felder ≈ ${zl.sekunden} s bei ${zl.nachlauf} s ${zl.zuKnapp ? '– zu knapp' : zl.knapp ? '– knapp' : '✓'}</p>`).join('')}
    </div>`;
  }
  function teileEingabe(t) {
    const z = teileZustand(), n = t.dataset.n, art = t.dataset.tz;
    if (art === 'krist') z.kristalle[n] = t.value;
    else if (art === 'sig') z.signale = t.checked ? [...new Set([...z.signale, n])] : z.signale.filter(x => x !== n);
    else if (art === 'hat') z.besitz = t.checked ? [...new Set([...z.besitz, n])] : z.besitz.filter(x => x !== n);
    else if (art === 'ab') { Z.teileAb = t.value; Z.teileAbRaum = Z.raum; }
    renderRechts(); zeichneRaum();
  }

  // ---------- Waffen ----------
  // Grundtyp Stich (gerade hinaus und zurück, kurz) oder Schwung (Bogen über die Front), dazu Werte und Aufladen (Kreisschwung).
  // Jede Waffe ist zugleich ein Gegenstand gleichen Namens: als Truhen-Inhalt, als Startwaffe des Dungeons, als Bedingung „hat …“.
  function renderWaffen() {
    const el = $('#ed-waffenansicht'), alle = Object.entries(DATEN.waffen);
    if (!Z.waffe || !DATEN.waffen[Z.waffe]) Z.waffe = alle[0][0];
    const id = Z.waffe, wf = DATEN.waffen[id], eigen = !!eigene.waffen[id];
    const f = (pfad, typ, label, hilfe = '', opt) => {
      const w = holen(wf, pfad);
      if (typ === 'haken') return `<label class="klein"><input type="checkbox" data-wp2="${pfad}" data-wt="haken"${w ? ' checked' : ''}> ${label}${hilfe ? ` <span class="erkl-inline">– ${hilfe}</span>` : ''}</label>`;
      if (typ === 'wahl') return feld(label, wahlHtml(`data-wp2="${pfad}" data-wt="wahl"`, w, opt), hilfe);
      if (typ === 'text') return feld(label, `<input data-wp2="${pfad}" data-wt="text" value="${esc(w ?? '')}">`, hilfe);
      return feld(label, `<input type="number" step="${opt || 1}" data-wp2="${pfad}" data-wt="zahl" value="${esc(w ?? '')}">`, hilfe);
    };
    el.innerHTML = `
      <div class="spalte"><h3>Waffen</h3>
        <div class="liste">${alle.map(([k, x]) => `<button data-waffe="${k}" class="${k === id ? 'an' : ''}"><img class="kbild" src="${bildUrl(GEGENSTANDBILD[k] || waffenBild(x))}" alt=""> ${esc(x.name || k)} <small>${eigene.waffen[k] ? 'eigen' : 'eingebaut'}</small></button>`).join('')}</div>
        <div class="knoepfe"><button data-a="waffeneu">Neue Waffe</button><button data-a="waffekopie">Kopie</button>${eigen ? '<button data-a="waffeweg" class="gefahr">Löschen</button>' : ''}</div>
        <p class="klein">Jede Waffe ist auch ein Gegenstand: Leg sie in eine Truhe (Inhalt), wähle sie links als Startwaffe des Dungeons oder frag sie als Bedingung ab („hat …“). Wer eine Waffe findet, hat sie sofort in der Hand.</p></div>
      <div class="spalte breit"><h3>${esc(wf.name || id)} ${eigen ? '' : '<small>(eingebaut – als Kopie bearbeiten)</small>'}</h3>
        <div class="vorschau"><img class="waffenbild" src="${bildUrl(GEGENSTANDBILD[id] || waffenBild(wf))}" alt=""></div>
        <fieldset${eigen ? '' : ' disabled'}>
        <div class="zeile">${f('name', 'text', 'Name')}${f('art', 'wahl', 'Grundtyp', '', { stich: 'Stich – gerade hinaus und zurück', schwung: 'Schwung – Bogen über die Front' })}</div>
        <div class="zeile">${f('laenge', 'zahl', 'Länge (px)', 'Reichweite der Klinge; Dolch 14, Schwert 26')}${f('schaden', 'zahl', 'Schaden je Treffer')}</div>
        <div class="zeile">${f('dauer', 'zahl', 'Dauer eines Schlags (s)', 'kürzer = schneller hintereinander', 0.02)}${f('rueckstoss', 'zahl', 'Rückstoß ×', 'wie weit Gegner fliegen', 0.1)}</div>
        ${f('schneidet', 'haken', 'schneidet Büsche')}
        ${f('reflektiert', 'haken', 'schlägt Kugeln zurück', 'ohne Haken werden Kugeln nur abgewehrt')}
        <div class="modul"><label class="klein kopf"><input type="checkbox" data-wmod="aufladen"${wf.aufladen ? ' checked' : ''}> <b>Aufladen (Kreisschwung)</b></label>
          <small class="erkl">Nach dem Schlag gedrückt halten: Die Waffe wird vorgestreckt geladen (langsam laufen), funkelt, wenn sie bereit ist – Loslassen löst einen Kreisschwung aus, der rundum trifft.</small>
          ${wf.aufladen ? `<div class="zeile">${f('aufladen.zeit', 'zahl', 'Ladezeit (s)', '', 0.1)}${f('aufladen.schaden', 'zahl', 'Schaden des Kreisschwungs')}</div>` : ''}</div>
        </fieldset>
        <p class="klein">Ideen für weitere Grundtypen (noch nicht eingebaut): Speer (langer Stich), Keule (langsam, großer Rückstoß, zertrümmert), Peitsche (zieht heran), Wurfwaffe.</p></div>`;
  }
  function waffenEingabe(e) {
    const t = e.target, wf = eigene.waffen[Z.waffe];
    if (!wf) return;
    merke();
    if (t.dataset.wmod) { if (t.checked) wf.aufladen = { zeit: 0.8, schaden: 2 }; else delete wf.aufladen; }
    else if (t.dataset.wp2) {
      const typ = t.dataset.wt; let wert = typ === 'haken' ? t.checked : typ === 'zahl' ? Math.max(0, Number(t.value) || 0) : t.value;
      if (t.dataset.wp2 === 'name') wert = String(wert).trim() || Z.waffe;
      if (t.dataset.wp2 === 'dauer') wert = Math.max(0.1, wert);
      setzen(wf, t.dataset.wp2, wert);
    }
    speichern(); renderWaffen(); renderWerkzeuge();
  }
  function neueWaffe(vorlage) {
    const name = prompt('Name der Waffe:', vorlage ? (DATEN.waffen[vorlage].name || vorlage) + ' 2' : 'Speer');
    if (!name) return;
    let id = slug(name); while (DATEN.waffen[id] || DATEN.gegenstaende[id]) id += '2';
    merke();
    eigene.waffen[id] = vorlage ? { ...kopie(DATEN.waffen[vorlage]), name } : { name, art: 'stich', laenge: 30, schaden: 1, dauer: 0.3, rueckstoss: 0.8, schneidet: false, reflektiert: false };
    Z.waffe = id; speichern(); renderWaffen();
  }

  // ---------- Hilfe ----------
  const HILFE = [
    ['Creator oder Editor?', `Zwei Modi für denselben Dungeon, umschaltbar mit <b>⇄</b> oben rechts. Der <b>Creator</b> führt in fünf Schritten vom Großen zum Kleinen:
      Idee und Endboss, Ablauf (rückwärts: was braucht man wofür?), Raumplan (Räume, Türen, Elemente in Räume legen), Räume bauen (je Raum ein Auftrag) und Prüfen
      (der Löser vergleicht den gebauten Dungeon mit dem Plan und zeigt Abkürzungen samt der Tür, an die die Sperre gehört). Der <b>Editor</b> ist für die Details:
      Gelände malen, Objekte und Gegner einstellen. Hat ein Raum einen Auftrag aus dem Creator, steht er hier rechts oben.`],
    ['Bausteine und Aufträge', `<b>Bausteine</b> (Werkzeugleiste) sind fertige, geprüfte Rätsel zum Absetzen: Truhe hinter Sperre, Sperre (Pflock), Block auf Platte, Schalter, Insel mit Block-Brücke,
      Truhe nach dem Kampf, Gegner mit Gegenstand oder Signal, Zeitlauf, Kristall-Schleuse, Boss. Rechts auswählen und einstellen, die Vorschau folgt der Maus (grün passt, rot nicht), Klick setzt ihn.
      Hat der Dungeon einen Plan aus dem Creator, steht rechts oben der <b>Auftrag</b> des Raums: was hier stehen muss, ob man es von einem Eingang aus erreicht und ob jede geplante
      Abhängigkeit hält (im Raum oder an der Tür herein). Für offene Punkte schlägt er passende Bausteine vor. „✨ Ganzen Raum vorschlagen“ erzeugt drei geprüfte Varianten
      (Stil, Bausteine für den Auftrag, Wege, Gegner); „Ansehen“ zeigt sie im Raum, „Übernehmen“ ersetzt den Raum.`],
    ['Grundidee', `Ein <b>Dungeon</b> besteht aus Räumen auf einem Raster. Jeder Raum ist 20 × 15 Felder groß; der Rand ist Mauer, Türen liegen an festen Stellen: in der Mitte jeder Seite und auf Wunsch zwei weitere je Wand (links/rechts bzw. oben/unten).
      Du malst Gelände, setzt Objekte und Gegner, stellst Türen ein und testest sofort. Alles wird automatisch im Browser gespeichert – <b>Export</b> sichert es als Datei.`],
    ['Räume und Karte', `Links die Dungeon-Karte: Raum anklicken = bearbeiten, „+“ = neuen Raum anlegen (neben dem gewählten gleich mit Tür). ★ ist der Startraum.
      Rechts die Einstellungen des Raums: Titel, Licht, Kampfraum (Türen erst offen, wenn alle Gegner besiegt sind), Einstiegstext, Wellen, Türen, Ereignisse.
      „Automatisch befüllen“ verteilt Hindernisse, Büsche, Abgründe und Gegner so, dass alle Türen erreichbar bleiben – plant der Creator getrennte Wege durch den Raum, zieht es zuerst Trennmauern und hält je Weg die Türen verbunden.`],
    ['Malen', `Werkzeuge oben: <b>Auswählen</b> (Objekt/Gegner anklicken und rechts einstellen), <b>Pipette</b> (übernimmt ein Feld samt Einstellungen; auch Alt+Klick),
      <b>Radierer</b> (auch rechte Maustaste), <b>Startpunkt</b>. Form <b>Rechteck</b> (oder Umschalt+Ziehen) füllt Flächen. Ein eingestelltes Objekt ist Vorlage für alle weiteren seiner Art.
      Strg+Z macht rückgängig.`],
    ['Türen', `Je Wand bis zu drei Türen (Mitte, dazu mit „＋ Tür …“ links/rechts bzw. oben/unten), alle zum selben Nachbarraum; die Gegentür liegt dort an derselben Stelle. So lässt sich ein Raum mit Abgründen oder Pflöcken in Abschnitte teilen, die man über verschiedene Türen erreicht.
      Je Tür: keine, offen, Schloss (kleiner Schlüssel, wird verbraucht), großes Schloss (großer Schlüssel, bleibt – die Bosstür),
      Tor für einen Gegenstand (zeigt dessen Bild, öffnet sich, sobald man ihn hat), Riegel (von dieser Seite zu, von der anderen zu öffnen – für Abkürzungen zurück),
      Kampf (offen, wenn der Raum geräumt ist) oder Bedingung.
      Eine Tür gilt immer für die Seite, auf der sie steht – wer hereinkommt, findet sie von innen offen.`],
    ['Signale und Bedingungen', `<b>Signale</b> sind Namen für Zustände. Sie kommen von Platten (solange etwas daraufsteht, oder dauerhaft mit „bleibt unten“), von Kristallen
      (der Kristalltyp zeigt eine Farbe), von besiegten Gegnern (Signal an der Gegnerart oder am einzelnen Gegner) und von Ereignissen. Dazu immer „Raum geräumt“.
      Bedingungen können auch Gegenstände abfragen („hat Laterne“).
      <b>Bedingungen</b> fragen Signale ab – für Türen, Fackeln („brennt“), Objekte („erscheint“) und Ereignisse. Ein Signal gilt im ganzen Dungeon, nur eine Platte ohne „bleibt unten“ wirkt allein in ihrem Raum.`],
    ['Objekte', `Stein, Busch (schneidbar), Block (schiebbar, füllt Abgründe), Schild (Text), Truhe (Inhalt; mit „erscheint“ z. B. erst nach dem Kampf),
      Platte, Kristall und Pflock (siehe Kristalltypen), Fackel (Licht, „brennt“ mit Bedingung).`],
    ['Kristalltypen', `Ein Kristalltyp ist eine Farbfolge. Ein Schwertschlag auf einen Kristall schaltet alle Kristalle dieses Typs im Dungeon eine Farbe weiter.
      Ein Pflock gehört zu einem Typ und steht oben (versperrt den Weg), solange der Typ seine Farbe zeigt.`],
    ['Gegnerarten', `Eine Gegnerart setzt sich aus Bausteinen zusammen: Grundwerte, KI (Wegfindung, Angriffs-Reihenfolge, Abstand), Wahrnehmung, Bewegung,
      Angriffe (Sprung, Schuss, Rammen, Stampfen – jeder mit Ankündigung), Verteidigung (unverwundbar, benommen, Schutz bei Trefferserie, Ausweichen, Schild, Rüstung)
      und was bei der Niederlage passiert (Signal, Teilen, Explodieren). Eingebaute Arten sind schreibgeschützt – „Kopie“ macht eine eigene daraus.`],
    ['Waffen', `Grundtyp <b>Stich</b> (gerade hinaus und zurück, z. B. Dolch) oder <b>Schwung</b> (Bogen über die Front, z. B. Schwert), dazu Länge, Schaden, Dauer,
      Rückstoß, ob sie Büsche schneidet und Kugeln zurückschlägt. Mit <b>Aufladen</b>: nach dem Schlag gedrückt halten, bis die Spitze funkelt, loslassen = Kreisschwung.
      Jede Waffe ist zugleich ein Gegenstand: Truhen-Inhalt, Startwaffe des Dungeons (links), Bedingung „hat …“. Eine gefundene Waffe ist sofort in der Hand.`],
    ['Phasen und Bosse', `Mit <b>Phasen</b> wechselt ein Gegner sein Verhalten: Jede Phase übernimmt das Grundverhalten und ändert nur, was in ihr eingestellt ist.
      <b>Übergänge</b> führen weiter – nach Zeit, nach zufälliger Zeit, unter X % Lebenspunkten, nach einem Angriff, nach einer Trefferserie oder wenn ein Signal gilt.
      <b>Wendepunkte</b> greifen aus jeder Phase heraus, je einmal (z. B. „unter 50 %: Wut-Phase, Banner, Verstärkung“).
      Ein <b>Boss</b> bekommt einen großen Lebensbalken, kommt nicht wieder und zerplatzt am Ende. Bewährtes Muster gegen „einfach draufhauen“:
      Angriffsphase unverwundbar → Erschöpft-Phase benommen → zurück, dazu „Schutz bei Trefferserie“.`],
    ['Prüfung und Logik', `Oben rechts steht der Prüfstatus: grün = alles lösbar, gelb = Hinweise, rot = Fehler. Die Prüfung läuft kurz nach jeder Änderung und spielt den Dungeon
      gedanklich durch (Reiter <b>Logik</b>): Welche Räume sind in welcher Stufe erreichbar, was gibt es dort, welche Tür braucht was? Sie findet z. B. einen Gegner, dessen Signal
      seine eigene Tür öffnen soll, Schlüssel-Fallen und Räume ohne Rückweg. Sie rechnet je Raumteil: Trennen Mauern, feste Objekte oder Abgründe (ohne Block im Raum) die Türen eines Raums,
      sind das unabhängige Wege – wer durch eine Tür hereinkommt, erreicht nur die Türen und Truhen auf deren Weg. Ob ein Rätsel <i>innerhalb</i> eines Raumteils lösbar ist (Pflöcke, Blöcke, Kristalle), prüft sie nicht – dafür gibt es den <b>Löser</b> (unten) und „Raum testen“.`],
    ['Raumteile', `Knopf <b>Raumteile</b> (Werkzeugleiste, Gruppe „Ansicht“) färbt die zusammenhängenden Flächen des Raums ein und schreibt an jede Tür den Buchstaben ihres Teils.
      Mauern, Abgründe und hochgefahrene Pflöcke trennen, Blöcke gelten als verschiebbar. So siehst du sofort, welche Türen zusammengehören – und ob eine Tür z. B. nur über einen anderen Raum erreichbar ist.
      Rechts stellst du den <b>Zustand</b> ein: Farbe jedes Kristalltyps, Signale und Gegenstände, die der Raum abfragt. Mit <b>Ab Eingang erreichbar</b> rechnet der Editor ab einer Tür alles durch –
      Schieben (auch in Abgründe), Platten, Zeitschalter, Ereignisse – und markiert die erreichbaren Felder mit Punkten. Dazu: welche Türen, Truhen und Signale man von dort schafft,
      ob man sich mit Blöcken einsperren kann und ob ein Zeitschalter zu knapp ist.`],
    ['Löser: alle Spielverläufe', `Im Reiter <b>Logik</b> rechnet „Durchrechnen“ jeden möglichen Spielverlauf durch: welcher Raumteil, welche Kristallfarbe, welche Blockstellung, welche Schlüssel, welche Truhen und Signale.
      Ergebnis: ob das Ziel erreichbar ist (alle Bosse besiegt, ohne Bosse alle Räume betreten), der <b>kürzeste Weg</b> Schritt für Schritt und – am wichtigsten – die <b>Sackgassen</b>:
      Schritte, nach denen das Ziel nie mehr erreichbar ist, z. B. ein kleiner Schlüssel an der falschen Tür. Zu jeder Sackgasse zeigt er, wie man dahin kommt; ein Klick auf den Raum öffnet ihn.
      „Nie erreicht“ sind Räume, in die kein Weg führt. Die Rechnung läuft im Hintergrund weiter, du kannst währenddessen bauen – „seit der Rechnung geändert“ erinnert ans Neu-Durchrechnen.
      Kämpfe gelten als gewonnen; ob ein Rätsel <i>geschickt</i> genug zu lösen ist, zeigt weiter nur „Raum testen“.`],
    ['Gegner-Drops', `Ein einzelner Gegner kann einen Gegenstand <b>tragen</b> (Feld „trägt“ beim Gegner): Wird er besiegt, fällt der Gegenstand an seiner Stelle zu Boden (über einem Abgrund auf das nächste freie Feld)
      und wird beim Darüberlaufen aufgehoben. Gut für Schlüssel nach einem Kampf, ohne eine Truhe aufzustellen. Logik und Löser kennen Drops wie Truhen.`],
    ['Testen, Vorgaben und Nachweise', `„▶ Raum testen“ startet direkt in diesem Raum, „▶ Dungeon testen“ am Startpunkt. Esc führt zurück in den Editor. Im Spiel: M schaltet den Ton.
      Die <b>Test-Vorgaben</b> unter dem Knopf legen fest, womit der Raumtest beginnt: Eingang, schon ausgelöste Signale, Gegenstände, Schlüssel. Vorgegeben ist,
      was man laut Logik frühestens beim Betreten des Raums hat, und zwar durch die gewählte Tür (bei getrennten Wegen kommt man über jede Tür mit anderem Stand herein) – du musst den Dungeon davor also nicht durchspielen.
      Ohne eigene Wahl ist der Eingang die Tür, durch die man den Raum laut Logik zuerst betritt.
      Jeder Testlauf wird ausgewertet: Welche Türen und Truhen eines Raums hast du erreicht? Das ist der <b>Nachweis</b>. <b>Rätselräume</b> (mit Abgründen, Blöcken, Platten,
      Kristallen, Pflöcken oder bedingten Truhen) gelten erst als geprüft, wenn ein Testlauf jedes Ziel erreicht hat – auf der Karte grüner Punkt, sonst gelb oder hohl.
      Mehrere Testläufe ergänzen sich; ändert sich der Raum, ist der Nachweis veraltet.`],
  ];
  function renderHilfe() {
    $('#ed-hilfeansicht').innerHTML = `<div class="spalte breit hilfe-text"><h3>Hilfe zum Editor</h3>${HILFE.map(([t, x]) => `<h3>${t}</h3><p>${x}</p>`).join('')}</div>`;
  }

  // ---------- Aktionen (Knöpfe) ----------
  function aktion(a, el) {
    const d = dg();
    if (a.startsWith('ktyp') || a.startsWith('kfarbe')) { kristallAktion(a, el); return; }
    if (a === 'waffeneu') { neueWaffe(null); return; }
    if (a === 'waffekopie') { neueWaffe(Z.waffe); return; }
    if (a === 'waffeweg') { if (confirm('Waffe löschen? Truhen und Startwaffen, die sie benutzen, zeigen dann einen Hinweis.')) { merke(); delete eigene.waffen[Z.waffe]; Z.waffe = null; speichern(); renderWaffen(); } return; }
    if (a === 'loesen') { loeserBereit().catch(() => {}); starteLoeser(); return; }
    if (a === 'loesenstop') { stoppeLoeser(); renderLogik(); return; }
    switch (a) {
      case 'neu': neuerDungeon(); break;
      case 'umbenennen': { const t = prompt('Neuer Name:', d.titel); if (t) { merke(); d.titel = t.toUpperCase(); speichern(); renderLinks(); } break; }
      case 'dungeonloeschen':
        if (confirm(`Dungeon „${d.titel}“ wirklich löschen?`)) { merke(); delete eigene.dungeons[Z.dungeon]; Z.dungeon = Object.keys(eigene.dungeons)[0] || null; Z.raum = Z.dungeon ? dg().start.raum : null; speichern(); render(); }
        break;
      case 'testdungeon': teste(null); break;
      case 'meldungweg': Z.meldung = null; renderLinks(); break;
      case 'nachweisweg': { merke(); const n = dg().nachweise; if (n) delete n[Z.raum]; aenderung(); renderRechts(); break; }
      case 'vorgabenlogik': Z.vorgaben[Z.raum] = { eingang: vorgaben(Z.raum).eingang, nurEingang: true }; renderRechts(); break;
      case 'testraum': teste(Z.raum); break;
      case 'startraum': merke(); d.start = { raum: Z.raum, feld: [9.5, 8.5] }; aenderung(); renderRechts(); break;
      case 'raumloeschen': loescheRaum(); break;
      case 'tuerplus': setzeTuer(el.dataset.dir, 'offen'); break;
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
      case 'evneu': { merke(); const r = raum(); (r.ereignisse = r.ereignisse || []).push({ wenn: 'geraeumt', schritte: [{ art: 'text', text: 'Geschafft!' }] }); aenderung(); renderRechts(); break; }
      case 'evzeittor': {   // Platte → Tor 5 s offen, wiederholbar
        merke(); const r = raum(), platte = r.objekte.find(o => o.objekt === 'platte'), sig = platte ? platte.signal : 'platte';
        (r.ereignisse = r.ereignisse || []).push({ wenn: sig, wiederholen: true, schritte: [{ art: 'signal', signal: 'zeittor' }, { art: 'warte', s: 5 }, { art: 'signal', signal: 'zeittor', wert: false }] });
        aenderung(); renderRechts(); break;
      }
      case 'schrittneu': { merke(); const ev = raum().ereignisse[Number(el.dataset.i)]; (ev.schritte = ev.schritte || []).push({ art: 'warte', s: 3 }); aenderung(); renderRechts(); break; }
      case 'schrittweg': { merke(); const ev = raum().ereignisse[Number(el.dataset.i)]; ev.schritte.splice(Number(el.dataset.k), 1); aenderung(); renderRechts(); break; }
      case 'evweg': { merke(); const r = raum(); r.ereignisse.splice(Number(el.dataset.i), 1); if (!r.ereignisse.length) delete r.ereignisse; aenderung(); renderRechts(); break; }
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
      case 'phaseneu': case 'phaseweg': case 'phasezurueck': case 'ueneu': case 'ueweg': case 'wpneu': case 'wpweg': phasenAktion(a, el); break;
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
        Object.assign(eigene.dungeons, e.dungeons); Object.assign(eigene.gegnerarten, e.gegnerarten || {}); Object.assign(eigene.kristalltypen, e.kristalltypen || {}); Object.assign(eigene.waffen, e.waffen || {});
        for (const d of Object.values(e.dungeons)) for (const r of Object.values(d.raeume)) for (const o of r.objekte || []) migriereObjekt(o);
        if (!dg()) { Z.dungeon = Object.keys(eigene.dungeons)[0] || null; Z.raum = Z.dungeon ? dg().start.raum : null; }
        speichern(); render();
      } catch (err) { alert('Import fehlgeschlagen: ' + err.message); }
    };
    leser.readAsText(datei);
  }
  function teste(raumId) { const v = raumId ? vorgaben(raumId) : null; schliesse(); vergissHintergruende(Z.dungeon); starteDungeon(Z.dungeon, raumId, v); S.ausEditor = true; }

  // ---------- Aufbau ----------
  const CSS = `
  #editor{position:fixed;inset:0;z-index:20;background:#120d14;color:#cfd6cf;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    display:flex;flex-direction:column;touch-action:auto;user-select:text}
  #editor header{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#1c1e26;border-bottom:1px solid #2e313b;flex-wrap:wrap}
  #editor header h2{margin:0 12px 0 0;font-size:16px;color:#f4cd5e}
  #editor .kopfreiter{display:contents} #editor.creator .nur-editor{display:none} #editor:not(.creator) .nur-creator{display:none}
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
  #editor .tuerwand{margin:6px 0;padding:6px;background:#1c1e26;border-radius:4px} #editor .tuerwand .tuer{margin:4px 0 0;padding:0;background:none}
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
  #editor .status{font-weight:bold;min-width:96px} #editor .status.rot{background:#5c1e24;border-color:#d0574a;color:#ffd9d2}
  #editor .status.gelb{background:#4a3a14;border-color:#e0a33a;color:#f4cd5e} #editor .status.gruen{background:#1f4226;border-color:#58933b;color:#cfe8b8}
  #editor span.rot{color:#d0574a} #editor span.gelb{color:#f4cd5e} #editor span.gruen{color:#8abd4f}
  #editor ul.fehler{margin:4px 0;padding-left:18px;color:#ff9c8f} #editor ul.hinweis{margin:4px 0;padding-left:18px;color:#f4cd5e}
  #editor .ablauf li{margin:8px 0} #editor .ablauf button{padding:1px 6px;font-size:12px} #editor .tabelle td{padding:2px 10px 2px 0}
  #editor .reiter{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0} #editor .reiter button.an{background:#5e3826;border-color:#e0a33a}
  #editor .hilfe-text{max-width:760px} #editor .hilfe-text p{margin:4px 0 10px;line-height:1.5}
  #editor .meldung{margin:8px 0;padding:6px 8px;background:#1f4226;border:1px solid #58933b;border-radius:4px;font-size:12px} #editor .meldung button{padding:0 5px}
  #editor .vorgaben{margin:6px 0;padding:6px 8px;background:#1c1e26;border-radius:4px} #editor .vorgaben summary{cursor:pointer;color:#cfd6cf}
  #editor .nachweis{margin:8px 0;padding:6px 8px;border-radius:4px;background:#1c1e26;border-left:4px solid #454a55;font-size:12px}
  #editor .nachweis.ok{border-color:#58933b} #editor .nachweis.teil,#editor .nachweis.veraltet{border-color:#e0a33a}
  #editor .nachweis ul{margin:4px 0;padding-left:4px;list-style:none} #editor .nachweis li.ja{color:#8abd4f} #editor .nachweis li.nein{color:#a9b2b0}
  #editor .nachweisliste li.ok{color:#8abd4f} #editor .nachweisliste li.teil,#editor .nachweisliste li.veraltet{color:#f4cd5e}
  #editor .schritt{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:3px 0} #editor .schritt input{width:auto;flex:1;min-width:60px} #editor .schritt .bedbreit{flex-basis:100%}
  #editor .waffenbild{width:102px;height:102px;image-rendering:pixelated;background:#2a552c;border:1px solid #2e313b}
  #editor .loeserkasten{margin:0 0 14px;padding:8px 10px;background:#1c1e26;border:1px solid #2e313b;border-radius:4px;max-width:900px}
  #editor .loeserkasten h3{margin-top:2px} #editor .loeserkasten h4{margin:10px 0 3px;font-size:12.5px;color:#f4cd5e}
  #editor .loeserstatus{margin:8px 0;padding:6px 8px;border-radius:4px;border:1px solid #454a55} #editor .loeserstatus.gruen{background:#1f4226;border-color:#58933b;color:#cfe8b8}
  #editor .loeserstatus.gelb{background:#4a3a14;border-color:#e0a33a;color:#f4cd5e} #editor .loeserstatus.rot{background:#5c1e24;border-color:#d0574a;color:#ffd9d2}
  #editor .fehltritte,#editor .warnliste{margin:4px 0;padding-left:18px} #editor .fehltritte>li{margin:6px 0;color:#ff9c8f} #editor .fehltritte b{color:#ffd9d2}
  #editor .fehltritte ol,#editor .wegliste ol{margin:4px 0;padding-left:22px;color:#cfd6cf;font-size:12px} #editor .warnliste li{color:#f4cd5e;margin:3px 0}
  #editor .loeserkasten button.klein{padding:0 6px;font-size:11.5px} #editor .wegliste{margin:8px 0} #editor .wegliste summary{cursor:pointer;color:#8098cc}
  #editor .teilekasten{margin:0 0 10px;padding:6px 8px;background:#1c1e26;border:1px solid #2e313b;border-radius:4px} #editor .teilekasten h3{margin-top:2px}
  #editor .teileliste{margin:6px 0;padding:0;list-style:none} #editor .teileliste li{margin:3px 0;font-size:12px}
  #editor .teilmarke{display:inline-block;min-width:18px;text-align:center;border-radius:9px;color:#120d14;font-weight:bold;margin-right:4px}
  #editor .kfarben{padding-left:20px} #editor .kfarben li{margin:4px 0} #editor .kfarben .knoepfe{display:inline-flex;margin:0 0 0 8px}
  @media (max-width:900px){#editor .ansichten{flex-direction:column} #editor .spalte{flex:none}}`;
  function baue() {
    const stil = document.createElement('style'); stil.textContent = CSS; document.head.appendChild(stil);
    wurzel = document.createElement('div'); wurzel.id = 'editor';
    wurzel.innerHTML = `
      <header><h2 id="ed-titel">Waldwacht-Editor</h2>
        <span class="nur-editor kopfreiter"><button data-ansicht="dungeon">Dungeons &amp; Räume</button><button data-ansicht="gegner">Gegnerarten</button><button data-ansicht="kristalle">Kristalltypen</button><button data-ansicht="waffen">Waffen</button><button data-ansicht="logik">Logik</button><button data-ansicht="hilfe">Hilfe</button>
        <button id="ed-status" class="status" data-ansicht="logik">–</button></span>
        <nav class="nur-creator kopfreiter" id="ed-schritte"></nav>
        <span style="flex:1"></span><button data-a2="zurueck" title="Strg+Z">↶ Rückgängig</button>
        <button data-a2="modus" id="ed-moduswechsel" title="Zwischen Creator (planen in Schritten) und Editor (alles im Detail) wechseln – es bleibt derselbe Dungeon">⇄ Creator</button><button data-a2="spiel">Zum Spiel</button></header>
      <div class="ansichten" id="ed-dungeonansicht">
        <div class="spalte" id="ed-links"></div>
        <div class="mitte"><div id="ed-werkzeuge"></div><div id="ed-vorlage" class="vorlage"></div><canvas id="ed-raum" width="${BREITE}" height="${HOEHE}"></canvas>
          <p class="klein">Rand und Türen sind fest, Türen stellst du rechts ein. Ein eingestelltes Objekt ist die Vorlage für alle weiteren seiner Art.</p></div>
        <div class="spalte" id="ed-rechts"></div>
      </div>
      <div class="ansichten" id="ed-gegneransicht"></div>
      <div class="ansichten" id="ed-kristallansicht"></div>
      <div class="ansichten" id="ed-waffenansicht"></div>
      <div class="ansichten" id="ed-logikansicht"></div>
      <div class="ansichten" id="ed-hilfeansicht"></div>
      <div class="ansichten" id="ed-creatoransicht"></div>`;
    document.body.appendChild(wurzel);
    wurzel.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.ansicht) { Z.ansicht = b.dataset.ansicht; render(); }
      else if (b.dataset.a2 === 'zurueck') zurueck();
      else if (b.dataset.a2 === 'spiel') { schliesse(); }
      else if (b.dataset.a2 === 'modus') { Z.modus = Z.modus === 'creator' ? 'editor' : 'creator'; if (Z.modus === 'editor' && Z.ansicht !== 'dungeon' && Z.ansicht !== 'logik') Z.ansicht = 'dungeon'; render(); }
      else if (b.closest('#ed-creatoransicht,#ed-schritte')) return;   // Knöpfe des Creators behandelt creator.js
      else if (b.dataset.art) { Z.gegnerArt = b.dataset.art; Z.gPhase = null; renderGegner(); }
      else if (b.dataset.gphase !== undefined) { Z.gPhase = b.dataset.gphase === '' ? null : Number(b.dataset.gphase); renderGegner(); }
      else if (b.dataset.ktyp) { Z.kristallTyp = b.dataset.ktyp; renderKristalle(); }
      else if (b.dataset.waffe) { Z.waffe = b.dataset.waffe; renderWaffen(); }
      else if (b.dataset.raumwahl) { Z.raum = b.dataset.raumwahl; Z.ansicht = 'dungeon'; Z.auswahl = null; render(); }
      else if (b.dataset.c && typeof Creator !== 'undefined') Creator.klickEditor(b);   // Auftrag und Bausteine (creator.js)
      else if (b.dataset.a) aktion(b.dataset.a, b);
    });
    wurzel.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('vorgaben')) Z.vorgabenOffen = e.target.open; }, true);
    wurzel.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'ed-dungeonwahl') { Z.dungeon = t.value; Z.raum = dg().start.raum; Z.auswahl = null; render(); }
      else if (t.dataset.a === 'kopie' && t.value) kopiereDungeon(t.value);
      else if (t.id === 'ed-datei' && t.files[0]) importiere(t.files[0]);
      else if (t.dataset.tz !== undefined) teileEingabe(t);
      else if (t.dataset.bp !== undefined && typeof Creator !== 'undefined') Creator.bausteinEingabe(t);
      else if (t.dataset.cv !== undefined && typeof Creator !== 'undefined') Creator.vorschlagEingabe(t);
      else if (t.closest('#ed-rechts')) eingabe(e);
      else if (t.closest('#ed-gegneransicht')) gegnerEingabe(e);
      else if (t.closest('#ed-waffenansicht')) waffenEingabe(e);
      else if (t.id === 'ed-startwaffe') { merke(); if (t.value) dg().start.waffe = t.value; else delete dg().start.waffe; aenderung(); }
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
    const creator = Z.modus === 'creator' && typeof Creator !== 'undefined';
    wurzel.classList.toggle('creator', creator);
    $('#ed-titel').textContent = creator ? 'Waldwacht-Creator' : 'Waldwacht-Editor';
    $('#ed-moduswechsel').textContent = creator ? '⇄ Editor' : '⇄ Creator';
    $('#ed-creatoransicht').style.display = creator ? '' : 'none';
    if (creator) {
      for (const v of ['dungeon', 'gegner', 'kristall', 'logik', 'waffen', 'hilfe']) $(`#ed-${v}ansicht`).style.display = 'none';
      zeigeWarnungen(); Creator.render(); return;
    }
    $('#ed-dungeonansicht').style.display = Z.ansicht === 'dungeon' ? '' : 'none';
    $('#ed-gegneransicht').style.display = Z.ansicht === 'gegner' ? '' : 'none';
    $('#ed-kristallansicht').style.display = Z.ansicht === 'kristalle' ? '' : 'none';
    $('#ed-logikansicht').style.display = Z.ansicht === 'logik' ? '' : 'none';
    $('#ed-waffenansicht').style.display = Z.ansicht === 'waffen' ? '' : 'none';
    $('#ed-hilfeansicht').style.display = Z.ansicht === 'hilfe' ? '' : 'none';
    wurzel.querySelectorAll('[data-ansicht]:not(#ed-status)').forEach(b => b.classList.toggle('an', b.dataset.ansicht === Z.ansicht));
    zeigeWarnungen();
    renderWerkzeuge();
    if (Z.ansicht === 'gegner') { renderGegner(); return; }
    if (Z.ansicht === 'kristalle') { renderKristalle(); return; }
    if (Z.ansicht === 'logik') { renderLogik(); return; }
    if (Z.ansicht === 'waffen') { renderWaffen(); return; }
    if (Z.ansicht === 'hilfe') { renderHilfe(); return; }
    renderLinks(); renderRechts(); zeichneRaum();
  }
  // Nach einem Test: erreichte Ziele je Raum als Nachweis speichern (gilt, solange sich der Raum nicht ändert)
  function werteTestAus() {
    const t = LETZTER_TEST; LETZTER_TEST = null;
    const d = t && eigene.dungeons[t.dungeon];
    if (!d) return;
    const zeilen = [];
    d.nachweise = d.nachweise || {};
    for (const [id, p] of Object.entries(t.protokoll)) {
      const r = d.raeume[id]; if (!r) continue;
      const fp = raumFingerabdruck(r), alt = d.nachweise[id] && d.nachweise[id].fp === fp ? d.nachweise[id].erreicht : [];
      const neu = [...p.rein.filter(x => x.length === 1), ...p.raus].map(x => 'tuer:' + x).concat(p.truhen.map(x => 'truhe:' + x));
      const erreicht = [...new Set([...alt, ...neu])].filter(z => raumZiele(DATEN, r).includes(z));
      d.nachweise[id] = { fp, erreicht };
      const ziele = raumZiele(DATEN, r);
      zeilen.push(`Raum ${r.nr || id}: ${erreicht.length} von ${ziele.length} Zielen erreicht`);
    }
    if (zeilen.length) { Z.meldung = 'Testlauf ausgewertet – ' + zeilen.join(' · '); speichern(); }
  }
  function oeffne(modus) {
    if (modus) Z.modus = modus;
    if (!wurzel) baue();
    eigene = ladeEigene();
    for (const d of Object.values(eigene.dungeons)) for (const r of Object.values(d.raeume)) for (const o of r.objekte || []) migriereObjekt(o);
    for (const a of Object.values(eigene.gegnerarten)) migriereGegnerart(a);
    for (const d of Object.values(eigene.dungeons)) for (const r of Object.values(d.raeume)) ereignisseAlsSchritte(r);
    werteTestAus();
    if (!Z.dungeon || !dg()) { Z.dungeon = Object.keys(eigene.dungeons)[0] || null; Z.raum = Z.dungeon ? dg().start.raum : null; }
    if (Z.dungeon && !raum()) Z.raum = dg().start.raum;
    offen = true; S = null;
    gehalten.clear(); gedrueckt.clear();
    document.body.classList.add('editor'); wurzel.style.display = '';
    render();
  }
  function schliesse() { offen = false; wurzel.style.display = 'none'; document.body.classList.remove('editor'); skaliere(); }
  // Für creator.js: Zustand und Hilfsfunktionen des Editors (alles Weitere bleibt intern)
  const intern = {
    Z, get eigene() { return eigene; }, dg, raum, $: sel => wurzel.querySelector(sel), esc, kopie, slug, signalName, feld, bildUrl, farbName, kristallTyp,
    merke, speichern, aenderung, render, zeigeWarnungen, renderRechts, renderWerkzeuge, zeichneRaum, vorschauObjekt, sortiere, raumBei, legeRaumAn, tuerSetzen, tuerArt, loeserDaten, loeserBereit, teste, schliesse,
    TUERARTEN, TUERFARBE, TUERZEICHEN, RICHTUNGSNAME, rahmenKarte, neuerDungeon, kopiereDungeon,
  };
  return { oeffne, schliesse, get offen() { return offen; }, intern };
})();
