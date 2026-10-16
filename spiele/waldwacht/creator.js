// Waldwacht – Creator: einen Dungeon in Arbeitsschritten planen und bauen (für den Computer gedacht).
// Läuft im Fenster des Editors (editor.js, Zugriff über Editor.intern); „⇄ Editor“ wechselt jederzeit in die Detailansicht,
// es bleibt derselbe Dungeon. Arbeitsschritte:
//   1 Idee (Name, Endboss) · 2 Ablauf (rückwärts vom Ziel: was braucht man wofür?) · 3 Raumplan (Räume, Türen, Elemente in
//   Räume legen) · 4 Räume bauen (Auftrag je Raum, gebaut wird im Editor) · 5 Prüfen (Löser: lösbar? Abkürzungen? Spoiler)
// Der Plan steht im Dungeon unter plan – das Spiel liest ihn nicht:
//   { idee, ziel: id, elemente: { id: { art, name, gegenstand, gegner, signal, quelle, raum, braucht: [ids], notiz } }, raeume: { raumId: { notiz } } }
//   art: boss (Boss besiegen) · gegenstand (auch großer Schlüssel und Waffen) · schluessel (kleiner Schlüssel) · signal (Rätsel/Schalter)
// Prüfung: Für jedes gebaute Element rechnet der Löser einmal „ohne dieses Element“. Was dann nicht mehr erreichbar ist,
// hängt wirklich davon ab – das wird mit dem Plan verglichen (Abkürzungen, ungeplante Abhängigkeiten).
'use strict';
const Creator = (() => {
  const E = Editor.intern, Z = E.Z, esc = E.esc;
  Z.cschritt = Z.cschritt || 1;   // 1–5, 6 = Hilfe
  Z.cwahl = null;                 // gewähltes Element (Ablauf)
  Z.chand = null;                 // Element, das gerade in einen Raum gelegt wird (Raumplan)
  Z.cplan = null;                 // Auswahl auf der Raumplan-Karte: { raum } oder { a: raumId, dir }
  Z.cfilter = 'alle';             // Räume bauen: alle | offen
  Z.cpruefung = null;             // letzte Prüfung: { dungeon, stand, laeuft, fortschritt, roh, q, plan, fehler, sekunden }

  const SCHRITTE = [null, [1, 'Idee'], [2, 'Ablauf'], [3, 'Raumplan'], [4, 'Räume bauen'], [5, 'Prüfen']];
  const ARTNAME = { boss: 'Boss', gegenstand: 'Gegenstand', schluessel: 'Kleiner Schlüssel', signal: 'Rätsel / Schalter' };
  const QUELLEN = {
    gegenstand: { truhe: 'liegt in einer Truhe', drop: 'trägt ein Gegner' },
    schluessel: { truhe: 'liegt in einer Truhe', drop: 'trägt ein Gegner' },
    signal: { platte: 'Platte (Block oder Held drückt sie)', ereignis: 'Ereignis (z. B. wenn alle Fackeln brennen)', gegner: 'Gegner besiegen (Signal am Gegner)', kampf: 'Raum räumen (Ereignis „wenn geräumt“)' },
  };
  const TUERRANG = ['gross', 'schloss', 'gegenstand', 'bedingung', 'kampf', 'riegel', 'offen'];
  const LEER = { idee: '', ziel: null, elemente: {}, raeume: {} };

  // ---------- Hilfen ----------
  const dg = () => E.dg();
  const planVon = d => (d && d.plan) || LEER;
  const nrVon = (d, rid) => d && d.raeume[rid] ? (d.raeume[rid].nr || rid) : '?';
  const raumText = (d, rid) => d && d.raeume[rid] ? `Raum ${esc(d.raeume[rid].nr || rid)} ${esc(d.raeume[rid].titel || '')}` : 'Raum ?';
  const gross = t => String(t || '').toLowerCase().replace(/(^|[\s-])\S/g, m => m.toUpperCase());
  const bossName = id => gross(((DATEN.gegnerarten[id] || {}).boss || {}).name || id);
  const bossArten = () => Object.keys(DATEN.gegnerarten).filter(k => DATEN.gegnerarten[k].boss);
  const dingName = id => (DATEN.gegenstaende[id] || {}).name || id;
  const bildCache = new Map();
  function symbol(el) {   // Bild (Data-URL) für ein Element des Ablaufs
    const k = el.art + ':' + (el.gegner || el.gegenstand || el.quelle || '');
    if (bildCache.has(k)) return bildCache.get(k);
    let c = null;
    if (el.art === 'boss') c = GEGNERBILD[el.gegner] && GEGNERBILD[el.gegner][0];
    else if (el.art === 'schluessel') c = GEGENSTANDBILD.schluessel;
    else if (el.art === 'gegenstand') c = GEGENSTANDBILD[el.gegenstand] || (DATEN.waffen[el.gegenstand] && waffenBild(DATEN.waffen[el.gegenstand]));
    else c = el.quelle === 'ereignis' ? FACKEL[1] : el.quelle === 'gegner' || el.quelle === 'kampf' ? GEGNERBILD.fuchs && GEGNERBILD.fuchs[0] : PLATTE[0];   // Rätsel: Bild nach Auslöser
    const url = c ? E.bildUrl(c) : '';
    bildCache.set(k, url);
    return url;
  }
  const bild = (el, klasse = 'csym') => `<img class="${klasse}" src="${symbol(el)}" alt="">`;
  const artText = el => el.art === 'gegenstand' && el.gegenstand === 'grosser_schluessel' ? 'Großer Schlüssel' : ARTNAME[el.art];
  function ortText(d, el) {
    const wo = el.raum ? (d.raeume[el.raum] ? 'Raum ' + esc(nrVon(d, el.raum)) : 'Raum fehlt') : 'Ort offen';
    const wie = el.art === 'boss' ? '' : el.art === 'signal' ? (el.quelle ? ' · ' + { platte: 'Platte', ereignis: 'Ereignis', gegner: 'Gegner', kampf: 'Kampf' }[el.quelle] : '') : el.quelle === 'drop' ? ' · Drop' : ' · Truhe';
    return wo + wie;
  }
  function huelle(p, id, aus = new Set()) {   // alles, was id (über Zwischenschritte) braucht
    for (const b of (p.elemente[id] || {}).braucht || []) if (p.elemente[b] && !aus.has(b)) { aus.add(b); huelle(p, b, aus); }
    return aus;
  }
  // Geplanter Ablauf: jedes Element nach allem, was es braucht (Stufe = längste Kette davor); Kreise werden gemeldet
  function ordnung(p) {
    const els = p.elemente, ids = Object.keys(els), stufe = {}, farbe = {}, kreis = new Set();
    const tiefe = id => {
      if (stufe[id] !== undefined) return stufe[id];
      if (farbe[id] === 1) { kreis.add(id); return 0; }
      farbe[id] = 1; let s = 0;
      for (const b of els[id].braucht || []) if (els[b]) s = Math.max(s, tiefe(b) + 1);
      farbe[id] = 2; return (stufe[id] = s);
    };
    ids.forEach(tiefe);
    const pos = {}, besucht = new Set(); let n = 0;
    const dfs = id => { if (besucht.has(id) || !els[id]) return; besucht.add(id); for (const b of els[id].braucht || []) dfs(b); pos[id] = n++; };
    if (p.ziel) dfs(p.ziel);
    ids.forEach(dfs);
    const liste = ids.slice().sort((a, b) => (a === p.ziel) - (b === p.ziel) || stufe[a] - stufe[b] || pos[a] - pos[b]);
    const vomZiel = p.ziel && els[p.ziel] ? new Set([p.ziel, ...huelle(p, p.ziel)]) : new Set();
    return { liste, stufe, kreis: [...kreis], nr: Object.fromEntries(liste.map((id, i) => [id, i + 1])), vomZiel };
  }
  function stand() {   // Fingerabdruck: hat sich seit der Prüfung etwas geändert?
    const t = JSON.stringify([DATEN.dungeons[Z.dungeon], DATEN.kristalltypen, DATEN.gegenstaende]);
    let h = 5381; for (let i = 0; i < t.length; i++) h = (Math.imul(h, 33) ^ t.charCodeAt(i)) >>> 0;
    return h.toString(36) + t.length;
  }
  const istLeer = r => !(r.objekte || []).length && !(r.gegner || []).length && !(r.wellen || []).length && r.karte.join('') === E.rahmenKarte().join('');

  // ---------- Quellen: wo steht ein Element im gebauten Dungeon, woran erkennt es der Löser? ----------
  // bits: Namen, wie der Löser sie führt (truhe:raum:index, hat:gegenstand, geraeumt:raum, Signal)
  function quellen(d, p) {
    const aus = {}, sig = dungeonSignale(DATEN, d).quellen, dinge = {}, bosse = [];
    for (const [rid, r] of Object.entries(d.raeume)) {
      (r.objekte || []).forEach((o, k) => { if ((DATEN.objektarten[o.objekt] || {}).oeffnbar && o.inhalt) (dinge[o.inhalt] = dinge[o.inhalt] || []).push({ raum: rid, bit: `truhe:${rid}:${k}`, art: 'truhe', feld: o.feld }); });
      (r.gegner || []).forEach((g, k) => {
        if (g.traegt) (dinge[g.traegt] = dinge[g.traegt] || []).push({ raum: rid, bit: `truhe:${rid}:g${k}`, art: 'drop', feld: g.feld });
        if ((DATEN.gegnerarten[g.gegner] || {}).boss) bosse.push({ raum: rid, gegner: g.gegner, feld: g.feld });
      });
      for (const a of (r.wellen || []).flat()) if ((DATEN.gegnerarten[a] || {}).boss) bosse.push({ raum: rid, gegner: a });
    }
    const schluesselNr = {};
    for (const [id, el] of Object.entries(p.elemente)) {
      const q = { bits: [], orte: [] };
      if (el.art === 'boss') {
        const alle = bosse.filter(b => !el.gegner || b.gegner === el.gegner), hier = alle.filter(b => b.raum === el.raum), w = hier.length ? hier : alle;
        q.orte = w.map(b => ({ raum: b.raum, art: 'boss', feld: b.feld }));
        q.bits = [...new Set(w.map(b => 'geraeumt:' + b.raum))];
      } else if (el.art === 'schluessel') {   // kleine Schlüssel sind gleich – je Raum der Reihe nach zuordnen
        const k = schluesselNr[el.raum] = (schluesselNr[el.raum] || 0) + 1, x = (dinge.schluessel || []).filter(s => s.raum === el.raum)[k - 1];
        if (x) { q.orte = [x]; q.bits = [x.bit]; }
      } else if (el.art === 'gegenstand') {
        const alle = dinge[el.gegenstand] || [], hier = alle.filter(x => x.raum === el.raum);
        q.orte = hier.length ? hier : alle;
        q.bits = hier.length ? hier.map(x => x.bit) : alle.length ? ['hat:' + el.gegenstand] : [];
      } else if (el.art === 'signal' && el.signal) {
        q.orte = (sig[el.signal] || []).map(w => ({ raum: w.raum, art: w.art }));
        if (q.orte.length) q.bits = [el.signal];
      }
      q.gebaut = q.bits.length > 0;
      q.imRaum = q.orte.some(o => o.raum === el.raum);
      aus[id] = q;
    }
    return aus;
  }

  // ---------- Auftrag je Raum ----------
  function teileVon(d, rid) {   // Raumteile im Grundzustand (alle Kristalle auf der ersten Farbe, keine Signale) – nur mit geladenem Löser
    if (typeof Loeser === 'undefined' || !d.raeume[rid]) return null;
    try { return Loeser.raumteile(DATEN, d, rid, { kristalle: {}, signale: [], besitz: [] }); } catch (e) { return null; }
  }
  function auftrag(d, p, q, rid, ord = ordnung(p)) {
    const r = d.raeume[rid], teile = teileVon(d, rid), teilBei = f => teile && f ? (teile.teile[(teile.feld[f[1]] || [])[f[0]]] || {}).name : null;
    const punkte = ord.liste.filter(id => p.elemente[id].raum === rid).map(id => {
      const el = p.elemente[id], qq = q[id], hier = qq.orte.filter(o => o.raum === rid);
      let text, ok = hier.length > 0, hinweis = '';
      if (el.art === 'boss') text = `Boss ${esc(bossName(el.gegner))} hineinsetzen`;
      else if (el.art === 'signal') text = `Signal „${esc(el.signal || '?')}“ auslösen – ${esc(QUELLEN.signal[el.quelle] || 'Platte, Ereignis oder Gegner')}`;
      else {
        text = `${esc(el.name)}: ${QUELLEN[el.art][el.quelle || 'truhe']}`;
        if (ok && el.quelle && !hier.some(o => o.art === el.quelle)) hinweis = el.quelle === 'drop' ? 'liegt in einer Truhe statt bei einem Gegner' : 'trägt ein Gegner statt einer Truhe';
      }
      if (!ok && qq.orte.length) hinweis = 'steht in ' + [...new Set(qq.orte.map(o => 'Raum ' + nrVon(d, o.raum)))].join(', ') + ' statt hier';
      const t = ok ? [...new Set(hier.map(o => teilBei(o.feld)).filter(Boolean))] : [];
      return { id, el, text, ok, hinweis, teil: teile && teile.teile.length > 1 ? t.join('/') : '', braucht: (el.braucht || []).filter(b => p.elemente[b]) };
    });
    const leer = istLeer(r);
    const status = punkte.length ? (punkte.every(x => x.ok) ? 'fertig' : 'offen') : leer ? 'frei' : 'gestaltet';
    return { punkte, notiz: (p.raeume && p.raeume[rid] || {}).notiz || '', leer, status, teile };
  }
  function auftragListe(d, p, a, ord) {
    return `<ul class="cauftrag">${a.punkte.map(x => `<li class="${x.ok ? 'ok' : 'offen'}"><span class="chaken">${x.ok ? '✓' : '○'}</span>${bild(x.el, 'csym klein')}<span><span class="cnr">${ord.nr[x.id]}</span> ${x.text}${x.teil ? ` <small class="cteil">Teil ${esc(x.teil)}</small>` : ''}
      ${x.hinweis ? `<small class="cwarn">– ${esc(x.hinweis)}</small>` : ''}
      ${x.braucht.length ? `<small class="cerst">erst erreichbar mit: ${x.braucht.map(b => esc(p.elemente[b].name)).join(', ')}</small>` : ''}</span></li>`).join('')}</ul>`;
  }
  // Kasten im Editor (rechte Spalte): was dieser Raum laut Plan leisten muss
  function auftragKasten(rid) {
    const d = dg();
    if (!d || !d.plan || !d.raeume[rid]) return '';
    const p = d.plan, ord = ordnung(p), a = auftrag(d, p, quellen(d, p), rid, ord);
    if (!a.punkte.length && !a.notiz) return '';
    return `<div class="cauftragkasten ${a.status}"><h3>Auftrag aus dem Creator</h3>${auftragListe(d, p, a, ord)}${a.notiz ? `<p class="cnotiz">${esc(a.notiz)}</p>` : ''}
      <small class="erkl">Ob die Reihenfolge wirklich stimmt (z. B. dass man ohne Laterne nicht an die Truhe kommt), zeigt Schritt 5 „Prüfen“ im Creator.</small>
      <div class="knoepfe"><button data-a2="modus">⇄ Zum Creator</button></div></div>`;
  }

  // ---------- Daten ändern ----------
  function planSchreiben() {
    const d = dg();
    d.plan = d.plan || { idee: '', ziel: null, elemente: {}, raeume: {} };
    d.plan.elemente = d.plan.elemente || {}; d.plan.raeume = d.plan.raeume || {};
    return d.plan;
  }
  function aendern(f) { E.merke(); const p = planSchreiben(); f(p, dg()); E.speichern(); E.zeigeWarnungen(); render(); }
  function neueId(p) { let n = 1; while (p.elemente['e' + n]) n++; return 'e' + n; }
  function freiesSignal(p, name) {
    const benutzt = new Set([...Object.values(p.elemente).map(e => e.signal).filter(Boolean), ...Object.keys(dungeonSignale(DATEN, dg()).quellen)]);
    const basis = E.signalName(name) || 'raetsel'; let s = basis, n = 2;
    while (benutzt.has(s)) s = basis + '-' + n++;
    return s;
  }
  function neuesElement(p, typ) {
    const zahl = art => Object.values(p.elemente).filter(e => e.art === art).length + 1;
    if (typ === 'gross') return { art: 'gegenstand', gegenstand: 'grosser_schluessel', name: 'Großer Schlüssel', quelle: 'truhe', braucht: [] };
    if (typ === 'schluessel') return { art: 'schluessel', name: 'Kleiner Schlüssel ' + zahl('schluessel'), quelle: 'truhe', braucht: [] };
    if (typ === 'signal') { const name = 'Rätsel ' + zahl('signal'); return { art: 'signal', name, signal: freiesSignal(p, name), quelle: 'platte', braucht: [] }; }
    if (typ === 'boss') {
      const frei = bossArten().find(b => !Object.values(p.elemente).some(e => e.art === 'boss' && e.gegner === b)) || bossArten()[0];
      return { art: 'boss', gegner: frei, name: bossName(frei), braucht: [] };
    }
    if (typ === 'extra') return { art: 'gegenstand', gegenstand: 'herzcontainer', name: dingName('herzcontainer'), quelle: 'truhe', braucht: [] };
    const im = new Set(Object.values(p.elemente).map(e => e.gegenstand));
    const g = ['laterne', ...Object.keys(DATEN.waffen), ...Object.keys(DATEN.gegenstaende)].find(k => DATEN.gegenstaende[k] && !['schluessel', 'grosser_schluessel', 'herzcontainer'].includes(k) && !im.has(k)) || 'laterne';
    return { art: 'gegenstand', gegenstand: g, name: dingName(g), quelle: 'truhe', braucht: [] };
  }
  function entferne(p, id) {
    delete p.elemente[id];
    for (const e of Object.values(p.elemente)) e.braucht = (e.braucht || []).filter(b => b !== id);
    if (p.ziel === id) p.ziel = null;
    if (Z.cwahl === id) Z.cwahl = null;
    if (Z.chand === id) Z.chand = null;
  }
  function setzeZiel(gegner) {
    aendern(p => {
      const z = p.ziel && p.elemente[p.ziel];
      if (z && z.art === 'boss') { if (z.name === bossName(z.gegner)) z.name = bossName(gegner); z.gegner = gegner; return; }
      const id = neueId(p);
      p.elemente[id] = { art: 'boss', gegner, name: bossName(gegner), braucht: [] };
      p.ziel = id; Z.cwahl = id;
    });
  }

  // ---------- Kopf jedes Schritts ----------
  function kopf(n, titel, text, punkte = [], mehr = '') {
    return `<div class="ckopfbox"><div class="ckopfzeile"><span class="cgross">${n}</span><div><h2>${titel}</h2><p>${text}</p>
      ${punkte.length ? `<ul class="ccheck">${punkte.map(([ok, t]) => `<li class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${t}</li>`).join('')}</ul>` : ''}
      ${mehr ? `<details class="cmehr"><summary>Mehr dazu</summary>${mehr}</details>` : ''}</div>
      ${n < 5 ? `<button data-c="schritt" data-n="${n + 1}" class="cweiter">Weiter: ${SCHRITTE[n + 1][1]} →</button>` : ''}</div></div>`;
  }
  // Stand je Schritt für die Leiste oben (✓ = erledigt, dazu eine kurze Zahl)
  function schrittStand(d) {
    const s = { 1: { ok: false, text: '' }, 2: { ok: false, text: '' }, 3: { ok: false, text: '' }, 4: { ok: false, text: '' }, 5: { ok: false, text: '' } };
    if (!d) return s;
    const p = planVon(d), els = Object.values(p.elemente), ord = ordnung(p);
    s[1].ok = !!(d.titel && p.ziel && p.elemente[p.ziel]);
    s[2].text = els.length ? els.length + ' Elemente' : ''; s[2].ok = s[1].ok && els.length > 1 && !ord.kreis.length;
    const ohne = els.filter(e => !e.raum || !d.raeume[e.raum]).length, getrennt = getrennteRaeume(d).length;
    s[3].text = els.length ? (ohne ? ohne + ' ohne Raum' : Object.keys(d.raeume).length + ' Räume') : ''; s[3].ok = s[2].ok && !ohne && !getrennt;
    if (els.length) {
      const q = quellen(d, p), mit = Object.keys(d.raeume).map(rid => auftrag(d, p, q, rid, ord)).filter(a => a.punkte.length);
      const fertig = mit.filter(a => a.status === 'fertig').length;
      s[4].text = mit.length ? `${fertig}/${mit.length}` : ''; s[4].ok = mit.length > 0 && fertig === mit.length;
    }
    const P = Z.cpruefung;
    if (P && P.dungeon === Z.dungeon && P.roh && !P.laeuft) {
      const a = auswertung(P), alt = P.stand !== stand();
      s[5].ok = !alt && a.gut; s[5].text = alt ? 'veraltet' : a.gut ? '' : '⚠';
    }
    return s;
  }
  function getrennteRaeume(d) {   // Räume, die über keine Tür (egal welcher Art) mit dem Startraum verbunden sind
    const da = new Set([d.start.raum]), q = [d.start.raum];
    while (q.length) { const r = d.raeume[q.shift()]; if (!r) continue; for (const t of Object.values(r.tueren)) if (d.raeume[t.ziel] && !da.has(t.ziel)) { da.add(t.ziel); q.push(t.ziel); } }
    return Object.keys(d.raeume).filter(id => !da.has(id));
  }

  // ---------- Schritt 1: Idee ----------
  function renderIdee(d) {
    const eigene = Object.entries(E.eigene.dungeons), p = planVon(d), z = d && p.ziel && p.elemente[p.ziel];
    const wahl = `<div class="knoepfe">${eigene.length ? `<select data-c="dungeon" title="Dungeon wählen">${eigene.map(([id, x]) => `<option value="${id}"${id === Z.dungeon ? ' selected' : ''}>${esc(x.titel)}</option>`).join('')}</select>` : ''}
      <button data-c="neu">Neuer Dungeon</button><button data-c="beispiel" title="Ein kleiner, fertig geplanter und gebauter Dungeon zum Anschauen">Beispiel laden</button>
      <select data-c="kopie"><option value="">Kopie eines fertigen Dungeons …</option>${Object.entries(DATEN.dungeons).filter(([, x]) => !x.eigen).map(([id, x]) => `<option value="${id}">${esc(x.titel)}</option>`).join('')}</select></div>`;
    const links = !d ? `<section class="cbox"><h3>Womit fängst du an?</h3><p>Leg einen neuen Dungeon an – oder lade das Beispiel und schau dir an, wie ein fertiger Plan aussieht.</p>${wahl}</section>` : `
      <section class="cbox"><h3>Dein Dungeon</h3>${wahl}
        <div class="zeile">${E.feld('Name', `<input data-cf="titel" value="${esc(d.titel)}">`)}${E.feld('Untertitel (im Menü)', `<input data-cf="untertitel" value="${esc(d.untertitel || '')}" placeholder="z. B. 6 Räume, für Einsteiger">`)}</div>
        ${E.feld('Startwaffe', `<select data-cf="startwaffe"><option value="">Standard (${esc(DATEN.waffen[(DATEN.einstellungen.held || {}).waffe] ? DATEN.waffen[DATEN.einstellungen.held.waffe].name : 'Schwert')})</option>${Object.entries(DATEN.waffen).map(([k, w]) => `<option value="${k}"${d.start.waffe === k ? ' selected' : ''}>${esc(w.name || k)}</option>`).join('')}</select>`, 'Womit der Held den Dungeon betritt. Eine bessere Waffe kann man unterwegs finden (als Element im Ablauf).')}
        ${E.feld('Worum geht es?', `<textarea data-cf="idee" rows="4" placeholder="z. B. Eine alte Mühle am Waldrand. Der Fuchskönig hat sich im Thronsaal verschanzt. Unten ist es dunkel – ohne Laterne kommt man nicht weit …">${esc(p.idee || '')}</textarea>`, 'Ein paar Sätze für dich: Ort, Stimmung, der besondere Kniff. Das Spiel zeigt sie nicht.')}
      </section>
      <section class="cbox"><h3>Das Ziel: der Endboss</h3>
        <p class="klein">Wer am Ende besiegt wird, ist das Ziel des Dungeons. Von hier aus planst du im nächsten Schritt rückwärts.</p>
        <div class="cbossraster">${bossArten().map(b => `<button data-c="ziel" data-gegner="${b}" class="${z && z.gegner === b ? 'an' : ''}"><img src="${symbol({ art: 'boss', gegner: b })}" alt=""><span>${esc(bossName(b))}</span></button>`).join('')}</div>
        ${z ? `<p class="ok">Ziel: ${esc(z.name)} besiegen.</p>` : ''}
      </section>`;
    return `<div class="cspalte breit">${kopf(1, 'Die Idee', 'Gib deinem Dungeon einen Namen, beschreib kurz die Idee und wähle den Endboss. Danach geht es vom Ziel aus rückwärts: Was braucht man, um zum Boss zu kommen?',
      d ? [[!!d.titel, 'Name'], [!!(p.idee || '').trim(), 'Idee notiert (freiwillig)'], [!!z, 'Endboss gewählt']] : [])}${links}</div>
      <div class="cspalte">${uebersichtHtml()}</div>`;
  }
  function uebersichtHtml() {
    const s = [
      ['Idee', 'Name, worum es geht, der Endboss.'],
      ['Ablauf', 'Rückwärts vom Boss: Was braucht man wofür? Großer Schlüssel, kleine Schlüssel, Gegenstände, Rätsel, Zwischenbosse.'],
      ['Raumplan', 'Räume auf der Karte anlegen, mit Türen verbinden (Schloss, Tor, Bedingung …) und jedes Element in einen Raum legen.'],
      ['Räume bauen', 'Jeder Raum bekommt einen Auftrag („Truhe mit Laterne“, „Platte mit Signal …“). Gebaut wird im Editor, Raum für Raum.'],
      ['Prüfen', 'Der Löser spielt alles durch: lösbar? Sackgassen? Kommt man irgendwo hin, ohne das Geplante zu haben?'],
    ];
    return `<section class="cbox chilfe"><h3>So arbeitest du mit dem Creator</h3><ol class="cuebersicht">${s.map(([t, x], i) => `<li><button data-c="schritt" data-n="${i + 1}" class="cnum">${i + 1}</button><div><b>${t}</b><br><span class="klein">${x}</span></div></li>`).join('')}</ol>
      <p class="klein">Die Reihenfolge ist ein Vorschlag, keine Pflicht: Du kannst jederzeit zurückspringen, nichts wird dabei gelöscht. Mit <b>⇄ Editor</b> (oben rechts) bearbeitest du alles im Detail – es bleibt derselbe Dungeon.</p></section>`;
  }

  // ---------- Schritt 2: Ablauf ----------
  function plusAuswahl(p, id) {
    const sperre = new Set([id, ...(p.elemente[id].braucht || [])]);
    const andere = Object.entries(p.elemente).filter(([x]) => !sperre.has(x) && !huelle(p, x).has(id) && x !== p.ziel);   // nichts, das einen Kreis ergäbe
    return `<select data-c="plus" data-id="${id}" class="cplus"><option value="">＋ braucht …</option>
      <optgroup label="Neu"><option value="neu:gross">Großer Schlüssel</option><option value="neu:schluessel">Kleiner Schlüssel</option><option value="neu:gegenstand">Gegenstand (Laterne, Waffe …)</option>
        <option value="neu:signal">Rätsel / Schalter</option><option value="neu:boss">Zwischenboss</option></optgroup>
      ${andere.length ? `<optgroup label="Schon im Plan">${andere.map(([x, e]) => `<option value="${x}">${esc(e.name)}</option>`).join('')}</optgroup>` : ''}</select>`;
  }
  function felder(d, p, id) {
    const el = p.elemente[id], f = (typ, inhalt, label, hilfe) => E.feld(label, inhalt.replace('data-cf=', `data-id="${id}" data-cf=`), hilfe);
    const raeume = Object.entries(d.raeume).sort((a, b) => (Number(a[1].nr) || 0) - (Number(b[1].nr) || 0));
    const raumWahl = `<select data-cf="raum"><option value="">– noch offen (Schritt 3) –</option>${raeume.map(([rid, r]) => `<option value="${rid}"${el.raum === rid ? ' selected' : ''}>Raum ${esc(r.nr || rid)} ${esc(r.titel || '')}</option>`).join('')}</select>`;
    let art = '';
    if (el.art === 'boss') art = f('', `<select data-cf="gegner">${bossArten().map(b => `<option value="${b}"${el.gegner === b ? ' selected' : ''}>${esc(bossName(b))}</option>`).join('')}</select>`, 'Boss');
    if (el.art === 'gegenstand') art = f('', `<select data-cf="gegenstand">${Object.entries(DATEN.gegenstaende).filter(([k]) => k !== 'schluessel').map(([k, g]) => `<option value="${k}"${el.gegenstand === k ? ' selected' : ''}>${esc(g.name || k)}</option>`).join('')}</select>`, 'Gegenstand');
    if (el.art === 'signal') art = f('', `<input data-cf="signal" value="${esc(el.signal || '')}">`, 'Signal (Name)', 'Unter diesem Namen fragen Türen, Pflöcke oder Truhen das Rätsel ab – im Editor genauso einzutragen.');
    const quelle = QUELLEN[el.art] ? f('', `<select data-cf="quelle">${Object.entries(QUELLEN[el.art]).map(([k, t]) => `<option value="${k}"${(el.quelle || Object.keys(QUELLEN[el.art])[0]) === k ? ' selected' : ''}>${t}</option>`).join('')}</select>`, el.art === 'signal' ? 'Wie wird es ausgelöst?' : 'Wo bekommt man es?') : '';
    const platz = { boss: 'Wie läuft der Kampf? z. B. erst Kristall schlagen, dann ist er verwundbar', signal: 'Wie wird das Rätsel gelöst? z. B. zwei Blöcke auf zwei Platten, beide gleichzeitig', schluessel: 'z. B. der Silberfuchs im Gang trägt ihn', gegenstand: 'z. B. hinter dem Abgrund, nur mit der Brücke erreichbar' }[el.art];
    return `<div class="cfelder">${E.feld('Name', `<input data-id="${id}" data-cf="name" value="${esc(el.name)}">`)}
      <div class="zeile">${art}${quelle}</div>
      ${E.feld('Raum', raumWahl.replace('data-cf=', `data-id="${id}" data-cf=`), 'Kann auch später auf der Raumplan-Karte festgelegt werden.')}
      ${E.feld('Notiz', `<textarea data-id="${id}" data-cf="notiz" rows="2" placeholder="${esc(platz)}">${esc(el.notiz || '')}</textarea>`)}
      ${id !== p.ziel ? `<div class="knoepfe"><button data-c="weg" data-id="${id}" class="gefahr">Element entfernen</button></div>` : ''}</div>`;
  }
  function karte(d, p, ord, id, gezeigt, von) {
    const el = p.elemente[id];
    const weg = von ? `<button class="cklein" data-c="loese" data-id="${id}" data-von="${von}" title="Wird hierfür doch nicht gebraucht (das Element bleibt im Plan)">✕</button>` : '';
    if (gezeigt.has(id)) return `<div class="ckarte cverweis"><div class="ckopf" data-c="wahl" data-id="${id}">↪ ${bild(el, 'csym klein')} ${esc(el.name)} <small>(oben schon geplant)</small>${weg}</div></div>`;
    gezeigt.add(id);
    const kinder = (el.braucht || []).filter(b => p.elemente[b]), an = Z.cwahl === id;
    return `<div class="ckarte ${an ? 'an' : ''} ${id === p.ziel ? 'cziel' : ''} ${ord.kreis.includes(id) ? 'ckreis' : ''}">
      <div class="ckopf" data-c="wahl" data-id="${id}"><span class="cnr" title="Platz im geplanten Ablauf">${ord.nr[id]}</span>${bild(el)}<b>${esc(el.name)}</b><span class="cmarke">${id === p.ziel ? '🏁 Ziel · ' : ''}${artText(el)}</span>
        <span class="cort ${el.raum && d.raeume[el.raum] ? '' : 'cfehlt'}">${ortText(d, el)}</span>${weg}</div>
      ${an ? felder(d, p, id) : el.notiz ? `<div class="cnotiz">${esc(el.notiz)}</div>` : ''}
      <div class="cbraucht">${kinder.length ? '<div class="cbrlabel">braucht:</div>' + kinder.map(b => karte(d, p, ord, b, gezeigt, id)).join('') : '<div class="cbrlabel cstart">ab Start erreichbar – oder sag, was man dafür braucht:</div>'}
        ${plusAuswahl(p, id)}</div></div>`;
  }
  function renderAblauf(d) {
    const p = planVon(d), ord = ordnung(p), gezeigt = new Set();
    const baum = p.ziel && p.elemente[p.ziel] ? karte(d, p, ord, p.ziel, gezeigt, null) : `<div class="cbox"><p>Noch kein Ziel. Wähle zuerst den Endboss:</p><button data-c="schritt" data-n="1">← zu Schritt 1</button></div>`;
    const lose = ord.liste.filter(id => !ord.vomZiel.has(id) && !gezeigt.has(id));
    const extras = lose.map(id => gezeigt.has(id) ? '' : karte(d, p, ord, id, gezeigt, null)).join('');
    const warn = [];
    if (ord.kreis.length) warn.push(`Kreis im Ablauf: ${ord.kreis.map(id => esc(p.elemente[id].name)).join(', ')} – etwas braucht sich über Umwege selbst. Eine „braucht“-Verbindung lösen (✕).`);
    const sig = {}; for (const e of Object.values(p.elemente)) if (e.art === 'signal') (sig[e.signal] = sig[e.signal] || []).push(e.name);
    for (const [s, n] of Object.entries(sig)) if (n.length > 1) warn.push(`Signal „${esc(s)}“ steht bei ${n.map(esc).join(' und ')} – gleiche Signale lassen sich nicht unterscheiden.`);
    for (const e of Object.values(p.elemente)) if (e.art === 'signal' && !e.signal) warn.push(`${esc(e.name)}: Signalname fehlt.`);
    const els = Object.keys(p.elemente).length;
    return `<div class="cspalte breit cscroll">${kopf(2, 'Der Ablauf – rückwärts geplant', 'Fang beim Ziel an und frag dich bei jedem Element: <b>Was braucht man, um es zu bekommen?</b> Den Boss erreicht man mit dem großen Schlüssel – und wo liegt der, was braucht man dafür? So entsteht die Kette bis zum Start. Räume sind hier noch egal.',
      [[!!(p.ziel && p.elemente[p.ziel]), 'Ziel steht'], [els > 2, 'mindestens zwei Schritte bis zum Ziel'], [!ord.kreis.length, 'keine Kreise']],
      `<p>Arten: <b>Großer Schlüssel</b> öffnet die Bosstür (große Schlosstür). <b>Kleine Schlüssel</b> öffnen je eine Schlosstür und werden verbraucht. <b>Gegenstände</b> (Laterne, Waffen) öffnen Tore, die genau diesen Gegenstand verlangen. <b>Rätsel / Schalter</b> liefern ein Signal (Platte, Ereignis, besiegter Gegner), das Türen, Pflöcke oder Truhen freigibt. <b>Zwischenbosse</b> geben oft etwas frei (Tür „Kampf“, Truhe nach dem Kampf).</p>
       <p>Ein Element, das zwei Dinge braucht (z. B. Laterne <i>und</i> Schlüssel), bekommt beide unter „braucht“. Wird ein Element für mehrere andere gebraucht, wähle es beim zweiten Mal unter „Schon im Plan“ – es erscheint dann als ↪ Verweis.</p>
       <p>Extras wie ein Herzcontainer werden für das Ziel nicht gebraucht, gehören aber trotzdem in den Plan (unten).</p>`)}
      <div class="cbaum">${baum}</div>
      <h3>Extras und Belohnungen <small>(für das Ziel nicht nötig, z. B. Herzcontainer)</small></h3>${extras || '<p class="klein">Noch keine.</p>'}
      <div class="knoepfe"><button data-c="extra">＋ Extra</button></div></div>
      <div class="cspalte cscroll"><h3>So spielt es sich (geplant)</h3><p class="klein">Vorwärts gelesen: jedes Element steht nach allem, was es braucht.</p>
        <ol class="cablauf">${ord.liste.map(id => { const e = p.elemente[id]; return `<li class="${Z.cwahl === id ? 'an' : ''}" data-c="wahl" data-id="${id}">${bild(e, 'csym klein')}<div><b>${esc(e.name)}</b>${id === p.ziel ? ' 🏁' : ''}<br><small>${ortText(d, e)}${(e.braucht || []).length ? ' · nach ' + e.braucht.filter(b => p.elemente[b]).map(b => esc(p.elemente[b].name)).join(', ') : ''}</small></div></li>`; }).join('')}</ol>
        ${warn.length ? `<ul class="fehler">${warn.map(w => `<li>${w}</li>`).join('')}</ul>` : ''}</div>`;
  }

  // ---------- Schritt 3: Raumplan ----------
  const KW = 150, KH = 104;   // Zelle der Raumplan-Karte
  const MINI = new Map();
  function miniBild(r, s = 4) {   // Raum als kleines Schema: Mauer, Boden, Abgrund, Objekte, Gegner
    const key = s + '|' + r.karte.join('') + JSON.stringify((r.objekte || []).map(o => [o.objekt, o.feld, o.inhalt])) + JSON.stringify((r.gegner || []).map(g => [g.gegner, g.feld])) + Object.keys(r.tueren).join();
    if (MINI.has(key)) return MINI.get(key);
    const c = document.createElement('canvas'); c.width = SPALTEN * s; c.height = ZEILEN * s;
    const g = c.getContext('2d'), F = { mauer: '#454a55', boden: '#3d6b35', abgrund: '#0b0910' };
    r.karte.forEach((z, y) => [...z].forEach((ch, x) => { g.fillStyle = F[DATEN.kacheln[ch]] || F.boden; g.fillRect(x * s, y * s, s, s); }));
    g.fillStyle = F.boden; for (const dir of Object.keys(r.tueren)) { const [x, y, w, h] = TUER_RECHTECK[dir]; g.fillRect(x / T * s, y / T * s, w / T * s, h / T * s); }
    const OF = { truhe: '#f4cd5e', block: '#b07a48', platte: '#cfd6cf', kristall: '#7fbcdc', pflock: '#8098cc', fackel: '#e0a33a', schild: '#c9a46a' };
    for (const o of r.objekte || []) { g.fillStyle = OF[o.objekt] || '#24331f'; g.fillRect(o.feld[0] * s + 0.5, o.feld[1] * s + 0.5, s - 1, s - 1); }
    for (const e of r.gegner || []) { const boss = (DATEN.gegnerarten[e.gegner] || {}).boss; g.fillStyle = boss ? '#ff5a4a' : '#d0574a'; g.beginPath(); g.arc(e.feld[0] * s + s / 2, e.feld[1] * s + s / 2, boss ? s * 1.4 : s * 0.6, 0, 7); g.fill(); }
    const url = c.toDataURL();
    if (MINI.size > 400) MINI.clear();
    MINI.set(key, url);
    return url;
  }
  const verbArt = (r, dir) => r && r.tueren[dir] ? E.tuerArt(r.tueren[dir]) : 'keine';
  function verbindungHtml(d, ord, a, b, dirA, x, y, an) {   // Knopf auf der gemeinsamen Wand zweier Nachbarräume
    const [aid, ra] = a, [bid, rb] = b, dirB = GEGENUEBER[dirA];
    const artA = verbArt(ra, dirA), artB = verbArt(rb, dirB), weitere = ['1', '3'].filter(k => ra.tueren[dirA + k] || rb.tueren[dirB + k]).length;
    const quer = dirA === 'o';
    const stil = quer ? `left:${x + KW - 15}px;top:${y + KH / 2 - 12}px` : `left:${x + KW / 2 - 15}px;top:${y + KH - 12}px`;
    if (artA === 'keine' && artB === 'keine') return `<button class="cverb cleer${an ? ' an' : ''}" style="${stil}" data-c="verbinde" data-raum="${aid}" data-dir="${dirA}" title="Tür anlegen (beide Seiten offen)">${weitere ? '+' + weitere : '＋'}</button>`;
    const streng = TUERRANG.find(t => t === artA || t === artB) || 'offen';
    const pfeil = artA === artB ? '' : streng === artA ? (quer ? '→' : '↓') : (quer ? '←' : '↑');
    const zeichen = streng === 'offen' ? (quer ? '⇄' : '⇅') : (E.TUERZEICHEN[streng] || '?');
    return `<button class="cverb${an ? ' an' : ''}" style="${stil};background:${E.TUERFARBE[streng] || '#cfd6cf'}" data-c="tuerwahl" data-raum="${aid}" data-dir="${dirA}"
      title="${esc(E.TUERARTEN[artA])} / ${esc(E.TUERARTEN[artB])}">${pfeil && quer && pfeil === '←' ? pfeil : ''}${zeichen}${pfeil && !(quer && pfeil === '←') ? pfeil : ''}${weitere ? `<sup>+${weitere}</sup>` : ''}</button>`;
  }
  function kartePlan(d, p, ord) {
    const raeume = Object.entries(d.raeume), pos = raeume.map(([, r]) => r.pos || [0, 0]);
    const x0 = Math.min(...pos.map(q => q[0])) - 1, y0 = Math.min(...pos.map(q => q[1])) - 1, x1 = Math.max(...pos.map(q => q[0])) + 1, y1 = Math.max(...pos.map(q => q[1])) + 1;
    const bei = (x, y) => raeume.find(([, r]) => r.pos && r.pos[0] === x && r.pos[1] === y), getrennt = new Set(getrennteRaeume(d));
    const teile = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = (x - x0) * KW, py = (y - y0) * KH, rm = bei(x, y);
      if (!rm) {
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => bei(x + dx, y + dy)))
          teile.push(`<button class="cneu" style="left:${px + 10}px;top:${py + 10}px;width:${KW - 20}px;height:${KH - 20}px" data-c="neuraum" data-x="${x}" data-y="${y}" title="Hier einen Raum anlegen (mit Tür zum Nachbarn)">＋</button>`);
        continue;
      }
      const [rid, r] = rm, an = Z.cplan && Z.cplan.raum === rid, hier = ord.liste.filter(id => p.elemente[id].raum === rid);
      teile.push(`<div class="craum${an ? ' an' : ''}${getrennt.has(rid) ? ' cgetrennt' : ''}${Z.chand ? ' cablage' : ''}" style="left:${px + 10}px;top:${py + 10}px;width:${KW - 20}px;height:${KH - 20}px;background-image:url(${miniBild(r)})" data-c="raum" data-raum="${rid}">
        <div class="crkopf">${d.start.raum === rid ? '★ ' : ''}<b>${esc(r.nr || rid)}</b> ${esc(r.titel || '')}</div>
        <div class="crdinge">${hier.map(id => `<span class="cchip" title="${esc(p.elemente[id].name)}">${bild(p.elemente[id], '')}<i>${ord.nr[id]}</i></span>`).join('')}</div></div>`);
      const rechts = bei(x + 1, y), unten = bei(x, y + 1), sel = Z.cplan && Z.cplan.dir;
      if (rechts) teile.push(verbindungHtml(d, ord, rm, rechts, 'o', px, py, sel && Z.cplan.a === rid && Z.cplan.dir === 'o'));
      if (unten) teile.push(verbindungHtml(d, ord, rm, unten, 's', px, py, sel && Z.cplan.a === rid && Z.cplan.dir === 's'));
    }
    return `<div class="cplankarte" style="width:${(x1 - x0 + 1) * KW}px;height:${(y1 - y0 + 1) * KH}px">${teile.join('')}</div>`;
  }
  function tuerFeld(d, p, rid, dir) {   // Türart einer Seite, dazu Gegenstand bzw. Signal
    const r = d.raeume[rid], t = r.tueren[dir], art = verbArt(r, dir);
    const signale = [...new Set([...Object.values(p.elemente).filter(e => e.art === 'signal' && e.signal).map(e => e.signal), ...Object.keys(dungeonSignale(DATEN, d).quellen).filter(s => !s.startsWith('hat:') && !s.includes('='))])];
    const aktuell = t && typeof t.offen_wenn === 'string' ? t.offen_wenn : '';
    return `<select data-cf="tuer" data-raum="${rid}" data-dir="${dir}">${Object.entries(E.TUERARTEN).map(([k, n]) => `<option value="${k}"${art === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      ${art === 'gegenstand' ? `<select data-cf="tuerding" data-raum="${rid}" data-dir="${dir}">${Object.entries(DATEN.gegenstaende).filter(([k]) => k !== 'schluessel' && k !== 'grosser_schluessel').map(([k, g]) => `<option value="${k}"${t.braucht === k ? ' selected' : ''}>${esc(g.name || k)}</option>`).join('')}</select>` : ''}
      ${art === 'bedingung' ? `<select data-cf="tuersignal" data-raum="${rid}" data-dir="${dir}">${aktuell || typeof t.offen_wenn !== 'object' ? '' : '<option value="" selected>(zusammengesetzt – im Editor)</option>'}${signale.map(s => `<option value="${esc(s)}"${aktuell === s ? ' selected' : ''}>Signal „${esc(s)}“</option>`).join('')}</select>` : ''}`;
  }
  function planRechts(d, p, ord) {
    const sel = Z.cplan;
    if (sel && sel.dir && d.raeume[sel.a]) {
      const a = d.raeume[sel.a], nb = a.pos && E.raumBei(a.pos[0] + RICHTUNG[sel.dir][0], a.pos[1] + RICHTUNG[sel.dir][1]);
      if (nb) {
        const [bid, b] = nb, gd = GEGENUEBER[sel.dir], weitere = ['1', '3'].filter(k => a.tueren[sel.dir + k] || b.tueren[gd + k]);
        return `<h3>Verbindung ${raumText(d, sel.a)} ↔ ${raumText(d, bid)}</h3>
          <div class="cbox">${E.feld(`Von Raum ${esc(nrVon(d, sel.a))} nach Raum ${esc(nrVon(d, bid))}`, tuerFeld(d, p, sel.a, sel.dir))}
          ${E.feld(`Von Raum ${esc(nrVon(d, bid))} nach Raum ${esc(nrVon(d, sel.a))}`, tuerFeld(d, p, bid, gd))}
          <small class="erkl">Eine Tür gilt für die Seite, auf der sie steht: Wer von dort kommt, braucht Schlüssel, Gegenstand oder Signal. Von der anderen Seite ist sie meist offen. Typisch: Schloss nur auf einer Seite, die Rückseite „offen“. Riegel: geht nur von der anderen Seite auf – gut für Abkürzungen zurück zum Anfang.</small>
          ${weitere.length ? `<p class="klein">Dazu ${weitere.length} weitere Tür(en) in dieser Wand – die bearbeitest du im Editor.</p>` : ''}
          <div class="knoepfe"><button data-c="trennen" data-raum="${sel.a}" data-dir="${sel.dir}" class="gefahr">Verbindung entfernen</button></div></div>`;
      }
    }
    if (sel && sel.raum && d.raeume[sel.raum]) {
      const rid = sel.raum, r = d.raeume[rid], hier = ord.liste.filter(id => p.elemente[id].raum === rid), andere = ord.liste.filter(id => p.elemente[id].raum !== rid);
      return `<h3>${raumText(d, rid)}</h3><div class="cbox">
        ${E.feld('Titel', `<input data-cf="rtitel" data-raum="${rid}" value="${esc(r.titel || '')}">`)}
        ${d.start.raum === rid ? '<p class="ok">★ Startraum</p>' : `<div class="knoepfe"><button data-c="start" data-raum="${rid}">★ Als Startraum</button></div>`}
        ${E.feld('Notiz für diesen Raum', `<textarea data-cf="rnotiz" data-raum="${rid}" rows="3" placeholder="z. B. Dunkler Saal mit Abgründen, die Truhe liegt auf einer Insel">${esc((p.raeume && p.raeume[rid] || {}).notiz || '')}</textarea>`, 'Steht später im Auftrag des Raums.')}
        <h4>Elemente in diesem Raum</h4>
        ${hier.length ? `<ul class="cliste2">${hier.map(id => `<li>${bild(p.elemente[id], 'csym klein')} <span class="cnr">${ord.nr[id]}</span> ${esc(p.elemente[id].name)} <button class="cklein" data-c="ortweg" data-id="${id}" title="Aus dem Raum nehmen">✕</button></li>`).join('')}</ul>` : '<p class="klein">Noch keine – ein Verbindungsraum, den du frei gestaltest. Oder lege ein Element hinein:</p>'}
        ${andere.length ? `<select data-cf="hierher" data-raum="${rid}"><option value="">＋ Element hierher legen …</option>${andere.map(id => `<option value="${id}">${ord.nr[id]}. ${esc(p.elemente[id].name)}${p.elemente[id].raum ? ' (jetzt Raum ' + esc(nrVon(d, p.elemente[id].raum)) + ')' : ''}</option>`).join('')}</select>` : ''}
        <div class="knoepfe"><button data-c="bauen" data-raum="${rid}" class="haupt">Im Editor bauen</button>${Object.keys(d.raeume).length > 1 ? `<button data-c="raumweg" data-raum="${rid}" class="gefahr">Raum löschen</button>` : ''}</div></div>`;
    }
    return `<h3>Karte bedienen</h3><div class="cbox klein"><p><b>＋</b> neben einem Raum legt einen neuen an, gleich mit offener Tür.</p><p>Die runden Knöpfe zwischen zwei Räumen sind die Türen: anklicken und rechts einstellen (Schloss, großes Schloss, Tor für einen Gegenstand, Bedingung …). Gestrichelt = noch keine Tür.</p>
      <p>Raum anklicken: Titel, Startraum, Notiz und Elemente.</p><p>Elemente links anklicken und dann einen Raum – so legst du sie hinein.</p></div>`;
  }
  function renderRaumplan(d) {
    const p = planVon(d), ord = ordnung(p), ohne = ord.liste.filter(id => !p.elemente[id].raum || !d.raeume[p.elemente[id].raum]), getrennt = getrennteRaeume(d);
    const leg = TUERRANG.map(t => `<span class="clegende"><span style="background:${E.TUERFARBE[t]}">${t === 'offen' ? '⇄' : E.TUERZEICHEN[t]}</span>${esc(E.TUERARTEN[t].replace(/ \(.*\)/, ''))}</span>`).join('');
    return `<div class="cspalte cscroll">${kopf(3, 'Der Raumplan', 'Lege die Räume auf der Karte an, verbinde sie mit Türen und leg jedes Element in einen Raum. Denk dabei an die Kette aus Schritt 2: Was etwas anderes braucht, sollte hinter einer passenden Tür liegen.',
      [[!ohne.length && ord.liste.length > 0, 'jedes Element hat einen Raum'], [!getrennt.length, 'alle Räume hängen am Start'], [Object.keys(d.raeume).length > 1, 'mehr als ein Raum']])}
      <h3>Elemente des Ablaufs</h3><div class="liste">${ord.liste.map(id => { const e = p.elemente[id]; return `<button data-c="hand" data-id="${id}" class="${Z.chand === id ? 'an' : ''} ${ohne.includes(id) ? 'cfehlt' : ''}"><span class="cnr">${ord.nr[id]}</span>${bild(e, 'csym klein')} ${esc(e.name)} <small>${e.raum && d.raeume[e.raum] ? 'Raum ' + esc(nrVon(d, e.raum)) : 'noch ohne Raum'}</small></button>`; }).join('')}</div>
      ${Z.chand ? `<p class="chinweis">Jetzt auf der Karte einen Raum anklicken, um „${esc(p.elemente[Z.chand].name)}“ hineinzulegen. <button data-c="handweg" class="cklein">abbrechen</button></p>` : '<p class="klein">Element anklicken, dann einen Raum auf der Karte – so legst du es hinein.</p>'}
      ${getrennt.length ? `<p class="rot klein">Ohne Tür zum Rest: ${getrennt.map(id => 'Raum ' + esc(nrVon(d, id))).join(', ')} (rot gestrichelt).</p>` : ''}
      <h3>Türen</h3><div class="klein">${leg}</div></div>
      <div class="mitte cscroll">${kartePlan(d, p, ord)}</div>
      <div class="cspalte cscroll">${planRechts(d, p, ord)}</div>`;
  }

  // ---------- Schritt 4: Räume bauen ----------
  function renderBauen(d) {
    const p = planVon(d), ord = ordnung(p), q = quellen(d, p);
    const liste = Object.entries(d.raeume).map(([rid, r]) => ({ rid, r, a: auftrag(d, p, q, rid, ord) }));
    const erste = x => x.a.punkte.length ? Math.min(...x.a.punkte.map(y => ord.nr[y.id])) : 1e9;
    liste.sort((a, b) => erste(a) - erste(b) || (Number(a.r.nr) || 0) - (Number(b.r.nr) || 0));
    const mit = liste.filter(x => x.a.punkte.length), fertig = mit.filter(x => x.a.status === 'fertig').length;
    const zeigen = Z.cfilter === 'offen' ? liste.filter(x => x.a.status === 'offen' || x.a.status === 'frei') : liste;
    const STATUS = { fertig: '✓ Auftrag erfüllt', offen: 'Auftrag offen', frei: 'leer – frei gestalten', gestaltet: 'gestaltet' };
    return `<div class="cspalte breit cscroll">${kopf(4, 'Räume bauen', 'Jeder Raum hat jetzt einen Auftrag: was darin stehen muss, damit der Plan aufgeht. Gebaut wird im Editor („Im Editor bauen“) – dort steht der Auftrag rechts oben, und die Haken setzen sich von selbst, sobald Truhe, Platte oder Boss stehen. Am besten in der Reihenfolge des Ablaufs, Raum für Raum.',
      [[mit.length > 0 && fertig === mit.length, `${fertig} von ${mit.length} Aufträgen erfüllt`]],
      `<p>Der Auftrag prüft nur, <i>ob</i> etwas im Raum steht. Ob man es in der richtigen Reihenfolge erreicht – z. B. die Truhe erst mit der Laterne –, zeigt Schritt 5. Dafür sorgen Türen (Schloss, Tor, Bedingung), Abgründe, Pflöcke oder Truhen, die erst unter einer Bedingung erscheinen.</p>
       <p>„Teil A/B“ zeigt, in welchem Raumteil etwas steht, sobald ein Raum durch Mauern, Abgründe oder Pflöcke geteilt ist (im Editor: Ansicht „Raumteile“).</p>
       <p>Räume ohne Element sind Verbindungsräume: Gegner, Hindernisse, kleine Rätsel nach Lust und Laune.</p>`)}
      <div class="cfortschritt" title="${fertig} von ${mit.length}"><div style="width:${mit.length ? Math.round(fertig / mit.length * 100) : 0}%"></div></div>
      <div class="knoepfe"><button data-c="filter" data-n="alle" class="${Z.cfilter !== 'offen' ? 'an' : ''}">Alle Räume</button><button data-c="filter" data-n="offen" class="${Z.cfilter === 'offen' ? 'an' : ''}">Nur offene</button></div>
      <div class="crraster">${zeigen.map(({ rid, r, a }) => `<div class="crkarte ${a.status}">
        <img class="crbild" src="${miniBild(r, 6)}" alt="" data-c="bauen" data-raum="${rid}" title="Im Editor bauen">
        <div class="crinhalt"><h4>${d.start.raum === rid ? '★ ' : ''}${raumText(d, rid)} <small class="cstatus">${STATUS[a.status]}</small></h4>
          ${a.punkte.length ? auftragListe(d, p, a, ord) : ''}
          ${a.notiz ? `<p class="cnotiz">${esc(a.notiz)}</p>` : ''}
          ${a.teile && a.teile.teile.length > 1 ? `<p class="klein">Raumteile: ${a.teile.teile.map(t => `<b>${t.name}</b>${t.tueren.length ? ' (Tür ' + t.tueren.map(TUERNAME).join(', ') + ')' : ''}`).join(' · ')}</p>` : ''}
          <div class="knoepfe"><button data-c="bauen" data-raum="${rid}" class="haupt">Im Editor bauen</button><button data-c="testen" data-raum="${rid}">▶ Raum testen</button></div></div></div>`).join('')}</div></div>`;
  }

  // ---------- Schritt 5: Prüfen ----------
  let pruefWorker = null, pruefZeichnen = 0;
  function pruefe() {
    const d = dg(), p = planVon(d);
    if (!p.ziel || !p.elemente[p.ziel]) return;
    stoppe();
    const q = quellen(d, p), ids = Object.keys(p.elemente);
    const auftragL = { ziel: q[p.ziel].bits, zielText: p.elemente[p.ziel].name + ' besiegt', ohne: ids.filter(id => id !== p.ziel && q[id].bits.length).map(id => ({ id, verboten: q[id].bits })) };
    const P = Z.cpruefung = { dungeon: Z.dungeon, stand: stand(), laeuft: true, fortschritt: null, start: Date.now(), q, plan: E.kopie(p), d: E.kopie(d) };
    const fertig = erg => { if (Z.cpruefung !== P) return; P.laeuft = false; P.roh = erg; P.sekunden = Math.round((Date.now() - P.start) / 1000); pruefWorker = null; render(); };
    const fehler = t => { if (Z.cpruefung !== P) return; P.laeuft = false; P.fehler = t; pruefWorker = null; render(); };
    const dgD = E.kopie(DATEN.dungeons[Z.dungeon]);
    const imFenster = () => { pruefWorker = null; E.loeserBereit().then(() => setTimeout(() => { if (Z.cpruefung !== P) return; try { fertig(Loeser.pruefePlan(E.loeserDaten(), dgD, auftragL)); } catch (e) { fehler(String(e)); } }, 30), e => fehler(String(e))); };
    try {
      let gehoert = false;
      pruefWorker = new Worker('loeser.js');
      pruefWorker.onmessage = e => {
        gehoert = true;
        if (e.data.fortschritt) { P.fortschritt = e.data.fortschritt; if (Date.now() - pruefZeichnen > 300) { pruefZeichnen = Date.now(); const el = E.$('#c-fortschritt'); if (el) el.innerHTML = fortschrittText(P); } }
        else if (e.data.plan) fertig(e.data.plan);
        else if (e.data.fehler) fehler(e.data.fehler);
      };
      pruefWorker.onerror = e => { e.preventDefault(); if (gehoert) fehler(e.message || 'Worker-Fehler'); else imFenster(); };
      pruefWorker.postMessage({ daten: E.loeserDaten(), dungeon: dgD, plan: auftragL });
    } catch (e) { imFenster(); }
    render();
  }
  function stoppe() {
    if (pruefWorker) { pruefWorker.terminate(); pruefWorker = null; }
    if (Z.cpruefung && Z.cpruefung.laeuft) { Z.cpruefung.laeuft = false; Z.cpruefung.abgebrochen = true; }
  }
  function fortschrittText(P) {
    const f = P.fortschritt, p = P.plan;
    if (!f) return 'Rechnet …';
    const was = f.id ? `ohne „${esc((p.elemente[f.id] || {}).name || f.id)}“` : 'alle Spielverläufe';
    return `Durchlauf ${f.lauf} von ${f.von}: ${was} … ${f.zustaende ? f.zustaende.toLocaleString('de-DE') + ' Zustände' : ''}`;
  }
  // Ergebnis gegen den Plan halten: Was hängt wirklich wovon ab?
  function auswertung(P) {
    if (P.auswertung) return P.auswertung;
    const p = P.plan, q = P.q, roh = P.roh, basis = new Set(roh.basis.erreichbar), ids = Object.keys(p.elemente);
    const hat = (menge, id) => q[id].bits.some(b => menge.has(b));
    const status = {};
    for (const id of ids) status[id] = !q[id].gebaut ? 'offen' : hat(basis, id) ? 'ok' : 'unerreichbar';
    const braucht = Object.fromEntries(ids.map(id => [id, new Set()])), unsicher = new Set();
    for (const [y, r] of Object.entries(roh.ohne)) {
      const m = new Set(r.erreichbar);
      if (!r.fertig) unsicher.add(y);
      for (const x of ids) if (x !== y && status[x] === 'ok' && !hat(m, x)) braucht[x].add(y);
    }
    const kanten = [], zusatz = [];
    for (const x of ids) {
      for (const y of (p.elemente[x].braucht || []).filter(b => p.elemente[b])) {
        const s = status[x] !== 'ok' || status[y] === 'offen' ? 'ungeprueft' : status[y] === 'unerreichbar' ? 'ungeprueft' : braucht[x].has(y) ? 'haelt' : 'abkuerzung';
        kanten.push({ von: x, nach: y, status: s, unsicher: unsicher.has(y), tipp: s === 'abkuerzung' ? sperrTipp(P, x, y) : null });
      }
      const geplant = huelle(p, x);
      for (const y of braucht[x]) if (!geplant.has(y) && ![...braucht[x]].some(w => w !== y && braucht[w] && braucht[w].has(y))) zusatz.push({ von: x, nach: y });
    }
    const abk = kanten.filter(k => k.status === 'abkuerzung'), unerr = ids.filter(id => status[id] === 'unerreichbar');
    const gut = roh.basis.loesbar && !roh.basis.sackgassen && !abk.length && !unerr.length;
    return (P.auswertung = { status, kanten, zusatz, abk, unerr, gut, braucht });
  }
  // Wo gehört die fehlende Sperre hin? Türen, durch die man ohne y in den Raum von x kommt
  function sperrTipp(P, x, y) {
    const d = P.d, p = P.plan, ex = p.elemente[x], ey = p.elemente[y], r = P.roh.ohne[y], ohne = new Set((r && r.raeume) || []);
    const wo = [...new Set(P.q[x].orte.map(o => o.raum))].filter(rid => ohne.has(rid));
    const tueren = [];
    for (const rid of wo) for (const [vid, v] of Object.entries(d.raeume)) if (ohne.has(vid) && vid !== rid)
      for (const [dir, t] of Object.entries(v.tueren)) if (t.ziel === rid) tueren.push(`von Raum ${nrVon(d, vid)} nach Raum ${nrVon(d, rid)} (Tür ${TUERNAME(dir)})`);
    const was = ey.art === 'schluessel' ? 'eine Schlosstür' : ey.art === 'boss' ? 'eine Tür, die erst nach dem Kampf aufgeht (Kampf oder Signal am Boss)'
      : ey.art === 'signal' ? `eine Tür mit Bedingung „${ey.signal}“, Pflöcke, die bei „${ey.signal}“ fallen, oder eine Truhe, die erst dann erscheint`
      : ey.gegenstand === 'grosser_schluessel' ? 'die große Schlosstür' : `ein Tor für „${dingName(ey.gegenstand)}“ (oder eine Bedingung „hat ${dingName(ey.gegenstand)}“)`;
    const raum = wo.length ? `Raum ${wo.map(w => nrVon(d, w)).join('/')} ist auch ohne ${ey.name} erreichbar.` : `${ex.name} liegt im Raum frei zugänglich.`;
    return `${raum} Fehlt: ${was}${tueren.length ? ' – z. B. ' + tueren.slice(0, 3).join(', ') : ' im Raum selbst (Raumteil hinter der Sperre)'}.`;
  }
  function spoiler(P) {   // kürzester Weg des Lösers als Abschnitte: Weg durch Räume, dann was man dort bekommt
    const weg = P.roh.basis.weg, d = P.d;
    if (!weg.length) return [];
    const bitZu = new Map();
    for (const [id, qq] of Object.entries(P.q)) for (const b of qq.bits) bitZu.set(b, [...(bitZu.get(b) || []), id]);
    const seg = []; let lauf = [weg[0].raum];
    const texte = id => { const e = P.plan.elemente[id]; return e.art === 'signal' ? ['Signal „' + e.signal + '“'] : e.art === 'boss' ? [] : [dingName(e.art === 'schluessel' ? 'schluessel' : e.gegenstand)].flatMap(n => [n, n + ' (Drop)']); };
    const gewinn = (s, rid, start) => {
      const els = [...new Set((s.neu || []).flatMap(n => bitZu.get(n) || []))], sonst = (s.gewonnen || []).slice();
      for (const id of els) { const i = sonst.findIndex(t => texte(id).includes(t)); if (i >= 0) sonst.splice(i, 1); }
      if (els.length || sonst.length || start) { seg.push({ weg: lauf.slice(), raum: rid, els, sonst, start }); lauf = [rid]; }
    };
    gewinn(weg[0], weg[0].raum, true);
    for (const s of weg.slice(1)) {
      if (s.nach !== s.raum) lauf.push(s.nach);
      else { seg.push({ weg: lauf.slice(), raum: s.raum, aktion: s.text.replace(/^Raum \S+ [^:]*: /, ''), els: [], sonst: [] }); lauf = [s.raum]; }
      gewinn(s, s.nach);
    }
    if (lauf.length > 1) seg.push({ weg: lauf, raum: lauf[lauf.length - 1], els: [], sonst: [] });
    return seg.map(s => ({ ...s, wegText: s.weg.length > 1 ? s.weg.map(r => nrVon(d, r)).join(' → ') : '' }));
  }
  function renderPruefen(d) {
    const p = planVon(d), P = Z.cpruefung && Z.cpruefung.dungeon === Z.dungeon ? Z.cpruefung : null;
    const knopf = !p.ziel ? '<p class="klein">Erst ein Ziel festlegen (Schritt 1).</p>' : P && P.laeuft
      ? `<p><span id="c-fortschritt">${fortschrittText(P)}</span> <button data-c="stopp">Abbrechen</button></p>`
      : `<div class="knoepfe"><button data-c="pruefen" class="haupt">${P && P.roh ? 'Neu prüfen' : 'Plan prüfen'}</button></div>`;
    let inhalt = '';
    if (P && P.fehler) inhalt = `<p class="rot">Fehler: ${esc(String(P.fehler).split('\n')[0])}</p>`;
    else if (P && P.abgebrochen && !P.roh) inhalt = '<p class="klein">Abgebrochen.</p>';
    else if (P && P.roh && !P.laeuft) inhalt = ergebnisHtml(d, P);
    return `<div class="cspalte breit cscroll">${kopf(5, 'Prüfen', 'Der Löser spielt jeden möglichen Verlauf durch – mit Schlüsseln in jeder Reihenfolge, Kristallfarben, Schieberätseln und Zeitschaltern. Dann rechnet er für jedes Element noch einmal <b>ohne</b> dieses Element. So sieht man, was wirklich wovon abhängt, und vergleicht es mit deinem Plan.',
      [], `<p><b>Hält</b>: ohne das Benötigte kommt man wirklich nicht heran. <b>Abkürzung</b>: es geht auch ohne – meist fehlt eine Tür oder Sperre auf dem Weg. <b>Zusätzlich nötig</b>: der gebaute Dungeon verlangt mehr als geplant (kann gewollt sein). <b>Noch nicht gebaut</b>: im Dungeon steht das Element noch nicht (Schritt 4).</p>
       <p><b>Sackgasse</b>: ein Zustand, aus dem man das Ziel nie mehr erreicht – typisch ein kleiner Schlüssel, der an der falschen Tür verbraucht wird. Kämpfe gelten als gewonnen; wie schwer ein Rätsel zu lösen ist, zeigt nur Spielen („Raum testen“).</p>`)}
      ${knopf}${inhalt}</div>`;
  }
  function ergebnisHtml(d, P) {
    const a = auswertung(P), p = P.plan, b = P.roh.basis, ord = ordnung(p), alt = P.stand !== stand();
    const name = id => esc((p.elemente[id] || {}).name || id), zahl = n => n.toLocaleString('de-DE');
    const offen = Object.entries(a.status).filter(([, s]) => s === 'offen').map(([id]) => id);
    const satz = [b.loesbar ? `✓ Das Ziel ist erreichbar (${zahl(b.zustaende)} Zustände${b.fertig ? '' : ', nicht alle durchsucht'}).` : '✗ Das Ziel ist nicht erreichbar.',
      b.sackgassen ? `${zahl(b.sackgassen)} Sackgassen.` : 'Keine Sackgasse.',
      a.abk.length ? `${a.abk.length} Abkürzung${a.abk.length > 1 ? 'en' : ''} gegenüber dem Plan.` : 'Der Plan hält.',
      offen.length ? `${offen.length} Element${offen.length > 1 ? 'e' : ''} noch nicht gebaut.` : ''].filter(Boolean).join(' ');
    const KS = { haelt: ['✓', 'hält'], abkuerzung: ['⚠', 'geht auch ohne'], ungeprueft: ['…', 'noch nicht prüfbar'] };
    const zeilen = ord.liste.map(id => {
      const el = p.elemente[id], st = a.status[id], ks = a.kanten.filter(k => k.von === id), zs = a.zusatz.filter(k => k.von === id);
      const stText = { ok: '<span class="gruen">erreichbar</span>', offen: '<span class="klein">noch nicht gebaut</span>', unerreichbar: '<span class="rot">nie erreichbar</span>' }[st];
      return `<li class="${st}">${bild(el, 'csym klein')}<div><b>${name(id)}</b> ${stText}${id === p.ziel ? ' 🏁' : ''}
        ${ks.map(k => `<div class="ckante ${k.status}">${KS[k.status][0]} braucht ${name(k.nach)}: ${KS[k.status][1]}${k.unsicher ? ' <small>(Suche unvollständig)</small>' : ''}${k.tipp ? `<small class="ctipptext">${esc(k.tipp)}</small>` : ''}</div>`).join('')}
        ${zs.map(k => `<div class="ckante zusatz">＋ braucht außerdem ${name(k.nach)} <small>(nicht geplant)</small></div>`).join('')}
        ${!ks.length && st === 'ok' && !zs.length ? '<div class="ckante klein">ab Start erreichbar</div>' : ''}</div></li>`;
    }).join('');
    const seg = spoiler(P);
    const raumKnopf = rid => rid && d.raeume[rid] ? `<button class="cklein" data-c="bauen" data-raum="${rid}">Raum ${esc(nrVon(d, rid))}</button>` : '';
    return `<div class="cergebnis ${a.gut ? 'gruen' : b.loesbar ? 'gelb' : 'rot'}">${satz} <small>(${P.sekunden} s${alt ? ' · <b>seit der Prüfung geändert – neu prüfen</b>' : ''})</small></div>
      ${a.abk.length ? `<div class="cbox ctipp"><b>Abkürzungen schließen:</b> Damit ein Element wirklich erst nach dem Benötigten erreichbar ist, muss der Weg dorthin eine Sperre haben, die genau das verlangt – eine Tür (Schloss, Tor für den Gegenstand, Bedingung mit dem Signal), Pflöcke, die das Signal senken, oder eine Truhe, die erst unter der Bedingung erscheint. Im Editor hilft die Ansicht „Raumteile“.</div>` : ''}
      <div class="czwei"><div><h3>Plan gegen gebauten Dungeon</h3><ul class="cpruefliste">${zeilen}</ul></div>
        <div><h3>So spielt es sich <small>(Spoiler: kürzester Weg laut Löser)</small></h3>
          ${seg.length ? `<ol class="cspoiler">${seg.map(s => `<li>${s.wegText ? `<div class="cweg">Weg: Raum ${esc(s.wegText)}</div>` : ''}
            <div>${s.start ? 'Start in ' : ''}<b>${raumText(d, s.raum)}</b>${s.aktion ? ': ' + esc(s.aktion) : ''}${s.els.length ? ': ' + s.els.map(id => `${bild(p.elemente[id], 'csym klein')} <b>${name(id)}</b>`).join(', ') : ''}
            ${s.sonst.length ? ` <small>(auch: ${esc(s.sonst.join(', '))})</small>` : ''}</div></li>`).join('')}</ol>` : '<p class="klein">Kein Weg zum Ziel.</p>'}</div></div>
      ${b.fehltritte.length ? `<h3>Hier kann man sich verbauen</h3><ul class="fehltritte">${b.fehltritte.map(f => `<li><b>${esc(f.text)}</b> ${raumKnopf(f.raum)} <small>(in ${zahl(f.anzahl)} Spielverläufen)</small></li>`).join('')}</ul>` : ''}
      ${b.warnungen.length ? `<h3>Warnungen</h3><ul class="warnliste">${b.warnungen.map(w => `<li>${esc(w.text)} ${raumKnopf(w.raum)}</li>`).join('')}</ul>` : ''}
      ${b.nieErreicht.length ? `<h3>Nie erreicht</h3><p>${b.nieErreicht.map(r => raumKnopf(r.id)).join(' ')}</p>` : ''}`;
  }

  // ---------- Hilfe ----------
  function renderHilfe() {
    const H = [
      ['Wozu der Creator?', 'Der Editor kann alles, aber man verliert leicht den Überblick: Liegt der Schlüssel vor oder hinter der Tür? Kommt man zum Boss, ohne das Rätsel gelöst zu haben? Der Creator führt in fünf Schritten vom Großen zum Kleinen: erst die Idee, dann der Ablauf, dann die Räume, dann die Details – und zum Schluss prüft der Löser alles.'],
      ['Rückwärts planen, vorwärts prüfen', 'Geplant wird vom Ziel aus („Was braucht man für den Boss? Den großen Schlüssel. Und für den?“), weil man so nie etwas vergisst. Geprüft wird vorwärts, so wie man spielt: Der Löser zeigt, ob alles erreichbar ist, wo man sich verbauen kann und wo der gebaute Dungeon eine Abkürzung erlaubt, die der Plan nicht vorsieht.'],
      ['Elemente', '<b>Boss</b> (Ziel oder Zwischenboss) · <b>Großer Schlüssel</b> (öffnet die große Schlosstür) · <b>Kleiner Schlüssel</b> (öffnet eine Schlosstür, wird verbraucht) · <b>Gegenstand</b> (Laterne, Waffen, Herzcontainer; öffnet Tore für genau diesen Gegenstand) · <b>Rätsel / Schalter</b> (liefert ein Signal: Platte, Ereignis, besiegter Gegner).'],
      ['Wie aus dem Plan ein Dungeon wird', 'Die Kette entsteht aus <b>Sperren</b>: Eine Schlosstür vor dem Raum mit der Truhe heißt „braucht einen kleinen Schlüssel“. Ein Tor für die Laterne heißt „braucht die Laterne“. Eine Tür mit Bedingung „muehlrad“ heißt „braucht das Rätsel Mühlrad“. Sperren gibt es auch innerhalb eines Raums: Abgründe, Pflöcke (über Signal oder Kristall), Truhen, die erst unter einer Bedingung erscheinen.'],
      ['Aufträge', 'Jeder Raum, in dem ein Element liegt, bekommt einen Auftrag: z. B. „Laterne – liegt in einer Truhe“, „Signal „muehlrad“ auslösen – Platte“. Im Editor steht der Auftrag rechts oben, die Haken setzen sich von selbst. So kannst du Raum für Raum abarbeiten.'],
      ['Umschalten', '„⇄ Editor“ oben rechts wechselt in die Detailansicht – es bleibt derselbe Dungeon, auch Rückgängig (Strg+Z) wirkt in beiden. „⇄ Creator“ führt zurück. Der Plan wird mit dem Dungeon gespeichert und exportiert.'],
      ['Tipps', 'Klein anfangen: 5–8 Räume, ein Schlüssel, ein Gegenstand, ein Rätsel. Jeder Gegenstand sollte mehr als einmal gebraucht werden (die Laterne für dunkle Räume <i>und</i> ein Tor). Abkürzungen zurück zum Anfang (Riegel) machen lange Wege angenehm. Das Beispiel (Schritt 1, „Beispiel laden“) zeigt einen kleinen, vollständigen Plan.'],
    ];
    return `<div class="cspalte breit hilfe-text"><h3>Hilfe zum Creator</h3>${H.map(([t, x]) => `<h3>${t}</h3><p>${x}</p>`).join('')}</div><div class="cspalte">${uebersichtHtml()}</div>`;
  }

  // ---------- Beispiel ----------
  function beispiel() {
    E.merke();
    const id = 'eigen-' + Date.now().toString(36);
    const raum = (nr, titel, pos, extra = {}) => ({ nr: String(nr), titel, licht: 'hell', pos, tueren: {}, karte: E.rahmenKarte(), objekte: [], gegner: [], ...extra });
    const d = {
      titel: 'BEISPIEL: DIE ALTE MÜHLE', untertitel: 'Beispiel aus dem Creator', start: { raum: 'r1', feld: [9.5, 10.5] },
      raeume: {
        r1: raum(1, 'EINGANG', [0, 0], { objekte: [{ objekt: 'truhe', feld: [9, 6], inhalt: 'laterne' }] }),
        r2: raum(2, 'HALLE', [0, -1], { gegner: [{ gegner: 'fuchs', feld: [5, 5] }, { gegner: 'fuchs', feld: [14, 10] }] }),
        r3: raum(3, 'MÜHLRAD', [1, -1], { licht: 'dunkel', objekte: [{ objekt: 'block', feld: [7, 7] }, { objekt: 'platte', feld: [12, 7], signal: 'muehlrad', wer: 'block', merken: true }], gegner: [{ gegner: 'silber', feld: [14, 11], traegt: 'schluessel' }] }),
        r4: raum(4, 'VORKAMMER', [0, -2], { gegner: [{ gegner: 'glut', feld: [9, 6] }] }),
        r5: raum(5, 'THRONSAAL', [0, -3], { kampf: true, gegner: [{ gegner: 'fuchskoenig', feld: [9, 6] }] }),
        r6: raum(6, 'SPEICHER', [-1, -1], { objekte: [{ objekt: 'truhe', feld: [9, 7], inhalt: 'grosser_schluessel' }] }),
      },
      plan: {
        idee: 'Eine alte Mühle am Waldrand. Der Fuchskönig sitzt im Thronsaal. Das Mühlrad ist dunkel – erst mit der Laterne kommt man hinein, und erst wenn es läuft, öffnet sich der Speicher mit dem großen Schlüssel.',
        ziel: 'e1',
        elemente: {
          e1: { art: 'boss', gegner: 'fuchskoenig', name: 'Fuchskönig', raum: 'r5', braucht: ['e2', 'e3'], notiz: 'Kampfraum: die Tür geht erst wieder auf, wenn er besiegt ist.' },
          e2: { art: 'gegenstand', gegenstand: 'grosser_schluessel', name: 'Großer Schlüssel', quelle: 'truhe', raum: 'r6', braucht: ['e4'] },
          e3: { art: 'schluessel', name: 'Kleiner Schlüssel 1', quelle: 'drop', raum: 'r3', braucht: ['e5'], notiz: 'Der Silberfuchs im Mühlrad trägt ihn.' },
          e4: { art: 'signal', name: 'Mühlrad', signal: 'muehlrad', quelle: 'platte', raum: 'r3', braucht: ['e5'], notiz: 'Den Block auf die Platte schieben – das Mühlrad läuft und öffnet die Tür zum Speicher.' },
          e5: { art: 'gegenstand', gegenstand: 'laterne', name: 'Laterne', quelle: 'truhe', raum: 'r1', braucht: [] },
        },
        raeume: { r3: { notiz: 'Dunkel. Das Tor aus der Halle öffnet sich nur mit der Laterne.' }, r2: { notiz: 'Kreuzung: Tor (Laterne) nach Osten, Bedingung „muehlrad“ nach Westen, Schloss nach Norden.' } },
      },
    };
    const tuer = (a, dir, b, extra = {}) => { d.raeume[a].tueren[dir] = { ziel: b, ...extra }; };
    tuer('r1', 'n', 'r2'); tuer('r2', 's', 'r1');
    tuer('r2', 'o', 'r3', { braucht: 'laterne' }); tuer('r3', 'w', 'r2');
    tuer('r2', 'w', 'r6', { offen_wenn: 'muehlrad' }); tuer('r6', 'o', 'r2');
    tuer('r2', 'n', 'r4', { schloss: true }); tuer('r4', 's', 'r2');
    tuer('r4', 'n', 'r5', { schloss: 'gross' }); tuer('r5', 's', 'r4', { offen_wenn: 'geraeumt' });
    E.eigene.dungeons[id] = d;
    Z.dungeon = id; Z.raum = 'r1'; Z.auswahl = null; Z.cwahl = null; Z.cplan = null; Z.chand = null;
    E.speichern(); E.zeigeWarnungen(); render();
  }

  // ---------- Eingaben ----------
  function klick(b) {
    const c = b.dataset.c, id = b.dataset.id, rid = b.dataset.raum, d = dg();
    if (c === 'schritt') { Z.cschritt = Number(b.dataset.n); render(); return; }
    if (c === 'neu') { E.neuerDungeon(); Z.cwahl = null; render(); return; }
    if (c === 'beispiel') { beispiel(); return; }
    if (c === 'pruefen') { pruefe(); return; }
    if (c === 'stopp') { stoppe(); render(); return; }
    if (!d) return;
    switch (c) {
      case 'ziel': setzeZiel(b.dataset.gegner); break;
      case 'wahl': Z.cwahl = Z.cwahl === id ? null : id; render(); break;
      case 'weg': if (confirm(`„${planVon(d).elemente[id].name}“ aus dem Plan entfernen?`)) aendern(p => entferne(p, id)); break;
      case 'loese': aendern(p => { const v = p.elemente[b.dataset.von]; if (v) v.braucht = (v.braucht || []).filter(x => x !== id); }); break;
      case 'extra': aendern(p => { const n = neueId(p); p.elemente[n] = neuesElement(p, 'extra'); Z.cwahl = n; }); break;
      case 'hand': Z.chand = Z.chand === id ? null : id; render(); break;
      case 'handweg': Z.chand = null; render(); break;
      case 'raum':
        if (Z.chand) { const h = Z.chand; Z.chand = null; aendern(p => { if (p.elemente[h]) p.elemente[h].raum = rid; }); Z.cplan = { raum: rid }; Z.raum = rid; render(); }
        else { Z.cplan = { raum: rid }; Z.raum = rid; render(); }
        break;
      case 'neuraum': {
        const x = Number(b.dataset.x), y = Number(b.dataset.y), sel = Z.cplan && Z.cplan.raum && d.raeume[Z.cplan.raum];
        const nachbar = sel && sel.pos && Math.abs(sel.pos[0] - x) + Math.abs(sel.pos[1] - y) === 1 ? [Z.cplan.raum, sel]
          : [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => E.raumBei(x + dx, y + dy)).find(Boolean);
        E.merke(); const neu = E.legeRaumAn(x, y, nachbar || null, true); E.speichern(); E.zeigeWarnungen();
        Z.cplan = { raum: neu }; render(); break;
      }
      case 'verbinde': E.merke(); E.tuerSetzen(rid, b.dataset.dir, 'offen'); E.speichern(); E.zeigeWarnungen(); Z.cplan = { a: rid, dir: b.dataset.dir }; render(); break;
      case 'tuerwahl': Z.cplan = { a: rid, dir: b.dataset.dir }; render(); break;
      case 'trennen': E.merke(); E.tuerSetzen(rid, b.dataset.dir, 'keine'); E.speichern(); E.zeigeWarnungen(); Z.cplan = null; render(); break;
      case 'start': E.merke(); d.start.raum = rid; d.start.feld = [9.5, 8.5]; E.speichern(); E.zeigeWarnungen(); render(); break;
      case 'ortweg': aendern(p => { if (p.elemente[id]) delete p.elemente[id].raum; }); break;
      case 'raumweg': {
        if (!confirm(`${raumText(d, rid).replace(/&[^;]+;/g, '')} löschen? Elemente darin verlieren ihren Raum.`)) break;
        aendern((p, dd) => {
          delete dd.raeume[rid];
          for (const r of Object.values(dd.raeume)) for (const [dir, t] of Object.entries(r.tueren)) if (t.ziel === rid) delete r.tueren[dir];
          if (dd.start.raum === rid) dd.start = { ...dd.start, raum: Object.keys(dd.raeume)[0], feld: [9.5, 8.5] };
          for (const e of Object.values(p.elemente)) if (e.raum === rid) delete e.raum;
          delete p.raeume[rid];
          if (Z.raum === rid) Z.raum = dd.start.raum;
          Z.cplan = null;
        });
        break;
      }
      case 'bauen': Z.raum = rid; Z.ansicht = 'dungeon'; Z.auswahl = null; Z.modus = 'editor'; E.render(); break;
      case 'testen': E.teste(rid); break;
      case 'filter': Z.cfilter = b.dataset.n; render(); break;
    }
  }
  function auswahl(t) {   // Auswahllisten mit data-c (Dungeon, Kopie, „braucht …“)
    const c = t.dataset.c, d = dg();
    if (c === 'dungeon') { Z.dungeon = t.value; Z.raum = dg().start.raum; Z.cwahl = Z.chand = Z.cplan = null; E.zeigeWarnungen(); render(); return; }
    if (c === 'kopie' && t.value) { E.kopiereDungeon(t.value); Z.cwahl = Z.chand = Z.cplan = null; render(); return; }
    if (c === 'plus' && t.value && d) {
      const id = t.dataset.id, v = t.value;
      aendern(p => {
        let neu = v;
        if (v.startsWith('neu:')) { neu = neueId(p); p.elemente[neu] = neuesElement(p, v.slice(4)); Z.cwahl = neu; }
        const el = p.elemente[id]; el.braucht = [...new Set([...(el.braucht || []), neu])];
      });
    }
  }
  function feldAenderung(t) {
    const f = t.dataset.cf, d = dg(), id = t.dataset.id, rid = t.dataset.raum, v = t.value;
    if (!d) return;
    if (f === 'titel') { E.merke(); d.titel = (v.trim() || d.titel).toUpperCase(); E.speichern(); render(); return; }
    if (f === 'untertitel') { E.merke(); d.untertitel = v.trim(); E.speichern(); return; }
    if (f === 'startwaffe') { E.merke(); if (v) d.start.waffe = v; else delete d.start.waffe; E.speichern(); E.zeigeWarnungen(); return; }
    if (f === 'idee') { aendern(p => { p.idee = v; }); return; }
    if (f === 'rtitel') { E.merke(); d.raeume[rid].titel = v.trim().toUpperCase() || d.raeume[rid].titel; E.speichern(); render(); return; }
    if (f === 'rnotiz') { aendern(p => { if (v.trim()) p.raeume[rid] = { ...(p.raeume[rid] || {}), notiz: v }; else delete p.raeume[rid]; }); return; }
    if (f === 'hierher') { if (v) aendern(p => { p.elemente[v].raum = rid; }); return; }
    if (f === 'tuer' || f === 'tuerding' || f === 'tuersignal') {
      E.merke();
      if (f === 'tuer') E.tuerSetzen(rid, t.dataset.dir, v);
      else if (f === 'tuerding') E.tuerSetzen(rid, t.dataset.dir, 'gegenstand', v);
      else if (v) { const tt = d.raeume[rid].tueren[t.dataset.dir]; E.tuerSetzen(rid, t.dataset.dir, 'bedingung', v, tt && tt.merken); }
      E.speichern(); E.zeigeWarnungen(); render(); return;
    }
    aendern(p => {
      const el = p.elemente[id]; if (!el) return;
      if (f === 'name') {
        const alt = el.name; el.name = v.trim() || el.name;
        if (el.art === 'signal' && el.signal && (el.signal === E.signalName(alt) || /^raetsel(-\d+)*$/.test(el.signal))) { el.signal = ''; el.signal = freiesSignal(p, el.name); }   // Signal folgt dem Namen, solange es nicht eigens gesetzt wurde
      }
      else if (f === 'gegner') { if (el.name === bossName(el.gegner)) el.name = bossName(v); el.gegner = v; }
      else if (f === 'gegenstand') { if (el.name === dingName(el.gegenstand)) el.name = dingName(v); el.gegenstand = v; }
      else if (f === 'signal') el.signal = E.signalName(v);
      else if (f === 'quelle') el.quelle = v;
      else if (f === 'raum') { if (v) el.raum = v; else delete el.raum; }
      else if (f === 'notiz') { if (v.trim()) el.notiz = v; else delete el.notiz; }
    });
  }

  // ---------- Darstellen ----------
  let verbunden = false;
  function verbinde() {
    const w = E.$('#ed-creatoransicht'), nav = E.$('#ed-schritte');
    nav.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) klick(b); });
    w.addEventListener('click', e => {
      if (e.target.closest('input,select,textarea,label,summary,option')) return;
      const b = e.target.closest('[data-c]'); if (b) klick(b);
    });
    w.addEventListener('change', e => { const t = e.target; if (t.dataset.cf) feldAenderung(t); else if (t.dataset.c) auswahl(t); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && Editor.offen && Z.modus === 'creator' && Z.chand) { Z.chand = null; render(); } });
    verbunden = true;
  }
  function render() {
    if (!verbunden) verbinde();
    if (typeof Loeser === 'undefined') E.loeserBereit().then(() => { if (Editor.offen && Z.modus === 'creator') render(); }, () => {});
    const w = E.$('#ed-creatoransicht'), d = dg(), st = schrittStand(d);
    E.$('#ed-schritte').innerHTML = SCHRITTE.slice(1).map(([n, t]) => `<button data-c="schritt" data-n="${n}" class="cschritt${Z.cschritt === n ? ' an' : ''}${st[n].ok ? ' fertig' : ''}"><span class="cnum">${st[n].ok ? '✓' : n}</span>${t}${st[n].text ? `<small>${esc(st[n].text)}</small>` : ''}</button>`).join('<span class="cpfeil">›</span>')
      + `<button data-c="schritt" data-n="6" class="cschritt${Z.cschritt === 6 ? ' an' : ''}">? Hilfe</button>`;
    const scroll = [...w.querySelectorAll('.cscroll')].map(el => el.scrollTop), oben = w.scrollTop;
    let html;
    if (Z.cschritt === 6) html = renderHilfe();
    else if (!d || Z.cschritt === 1) html = renderIdee(d);
    else if (Z.cschritt === 2) html = renderAblauf(d);
    else if (Z.cschritt === 3) html = renderRaumplan(d);
    else if (Z.cschritt === 4) html = renderBauen(d);
    else html = renderPruefen(d);
    const schmal = innerWidth < 1000 ? '<div class="chinweis cschmal">Der Creator ist für einen großen Bildschirm mit Maus gebaut – am Handy wird es eng.</div>' : '';
    w.innerHTML = schmal + html;
    w.scrollTop = oben;
    w.querySelectorAll('.cscroll').forEach((el, i) => { if (scroll[i]) el.scrollTop = scroll[i]; });
  }

  const CSS = `
  #editor.creator #ed-schritte{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
  #editor .cschritt{display:inline-flex;align-items:center;gap:6px;padding:3px 9px} #editor .cschritt small{color:#a9b2b0;font-size:11px}
  #editor .cnum{display:inline-flex;width:20px;height:20px;border-radius:50%;background:#454a55;align-items:center;justify-content:center;font-weight:bold;font-size:12px;color:#ece8d6;padding:0;border:0}
  #editor .cschritt.an{background:#5e3826;border-color:#e0a33a} #editor .cschritt.an .cnum{background:#e0a33a;color:#120d14} #editor .cschritt.fertig .cnum{background:#58933b;color:#fff}
  #editor .cpfeil{color:#626a72;margin:0 1px}
  #editor #ed-creatoransicht{flex-wrap:wrap;align-content:flex-start}
  #editor .cspalte{flex:0 0 310px;min-width:0} #editor .cspalte.breit{flex:1 1 560px} #editor #ed-creatoransicht .mitte{flex:1 1 480px;overflow:auto}
  #editor .cscroll{max-height:calc(100vh - 90px);overflow:auto}
  #editor .cschmal{flex-basis:100%}
  #editor .ckopfbox{background:#1c1e26;border:1px solid #2e313b;border-left:4px solid #e0a33a;border-radius:6px;padding:10px 12px;margin-bottom:12px}
  #editor .ckopfzeile{display:flex;gap:8px 12px;align-items:flex-start;flex-wrap:wrap} #editor .ckopfzeile>div{flex:1 1 220px} #editor .cgross{font-size:30px;font-weight:bold;color:#e0a33a;line-height:1}
  #editor .ckopfbox h2{margin:0 0 4px;font-size:17px;color:#f4cd5e} #editor .ckopfbox p{margin:0 0 4px;max-width:820px;line-height:1.45}
  #editor .ccheck{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-wrap:wrap;gap:2px 16px;font-size:12px;color:#a9b2b0} #editor .ccheck li.ok{color:#8abd4f}
  #editor .cmehr{margin-top:6px;font-size:12.5px} #editor .cmehr summary{cursor:pointer;color:#8098cc} #editor .cmehr p{margin:6px 0}
  #editor .cweiter{white-space:nowrap;align-self:center}
  #editor .cbox{background:#1c1e26;border:1px solid #2e313b;border-radius:6px;padding:8px 12px;margin-bottom:12px} #editor .cbox h3:first-child{margin-top:2px}
  #editor .ctipp{border-left:4px solid #e0a33a}
  #editor .cbossraster{display:flex;flex-wrap:wrap;gap:6px} #editor .cbossraster button{display:flex;flex-direction:column;align-items:center;width:104px;padding:6px}
  #editor .cbossraster img{width:48px;height:48px;image-rendering:pixelated;object-fit:contain} #editor .cbossraster span{font-size:11.5px}
  #editor .cuebersicht{list-style:none;padding:0;margin:0} #editor .cuebersicht li{display:flex;gap:8px;align-items:flex-start;margin:8px 0} #editor .cuebersicht .cnum{flex:none;cursor:pointer}
  #editor .csym{width:28px;height:28px;image-rendering:pixelated;object-fit:contain;background:#2a2c35;border-radius:4px;flex:none} #editor .csym.klein{width:22px;height:22px;vertical-align:middle}
  #editor .cnr{display:inline-flex;min-width:20px;height:20px;border-radius:10px;background:#454a55;color:#ece8d6;font-size:11px;align-items:center;justify-content:center;padding:0 4px;box-sizing:border-box;flex:none}
  #editor .cmarke{font-size:11px;color:#a9b2b0;border:1px solid #454a55;border-radius:3px;padding:0 4px}
  #editor .cort{font-size:12px;color:#8098cc;margin-left:auto} #editor .cort.cfehlt{color:#e0a33a}
  #editor .ckarte{background:#1c1e26;border:1px solid #2e313b;border-radius:6px;padding:6px 8px;margin:6px 0}
  #editor .ckarte.an{border-color:#e0a33a} #editor .ckarte.cziel{border-left:4px solid #d0574a} #editor .ckarte.ckreis{border-color:#d0574a}
  #editor .ckopf{display:flex;align-items:center;gap:7px;cursor:pointer;flex-wrap:wrap} #editor .ckopf:hover b{color:#f4cd5e}
  #editor .cverweis{opacity:.85;font-size:12px;padding:3px 8px}
  #editor .cbraucht{margin:6px 0 0 12px;padding-left:12px;border-left:2px solid #454a55}
  #editor .cbrlabel{font-size:11.5px;color:#848e92;margin:2px 0} #editor .cstart{color:#8abd4f}
  #editor .cplus{font-size:12px;margin:4px 0 2px;color:#a9b2b0}
  #editor .cfelder{margin:6px 0;padding:6px 8px;background:#16181f;border-radius:4px}
  #editor .cnotiz{font-size:12px;color:#cfd6cf;font-style:italic;margin:4px 0 0;white-space:pre-wrap}
  #editor button.cklein{padding:0 6px;font-size:11.5px;line-height:18px}
  #editor .cablauf{padding-left:0;list-style:none;counter-reset:n} #editor .cablauf li{display:flex;gap:8px;align-items:flex-start;padding:4px 6px;border-radius:4px;cursor:pointer;counter-increment:n}
  #editor .cablauf li::before{content:counter(n);min-width:18px;color:#848e92;font-size:12px;padding-top:3px} #editor .cablauf li.an,#editor .cablauf li:hover{background:#1c1e26}
  #editor .cplankarte{position:relative;margin:4px 0 12px;background:#16181f;border:1px solid #2e313b;border-radius:6px}
  #editor .craum{position:absolute;background:#2e313b no-repeat center/cover;image-rendering:pixelated;border:2px solid #626a72;border-radius:6px;cursor:pointer;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box}
  #editor .craum::before{content:'';position:absolute;inset:0;background:rgba(18,13,20,.5)} #editor .craum>*{position:relative}
  #editor .craum.an{border-color:#e0a33a;box-shadow:0 0 0 2px #e0a33a} #editor .craum.cgetrennt{border-color:#d0574a;border-style:dashed}
  #editor .craum.cablage:hover{border-color:#8abd4f;box-shadow:0 0 0 3px #8abd4f}
  #editor .crkopf{font-size:11.5px;padding:3px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fffbec;text-shadow:0 1px 2px #000}
  #editor .crdinge{display:flex;flex-wrap:wrap;gap:4px;padding:2px 5px}
  #editor .cchip{position:relative;display:inline-block;background:rgba(28,30,38,.85);border-radius:4px} #editor .cchip img{width:24px;height:24px;image-rendering:pixelated;object-fit:contain;display:block}
  #editor .cchip i{position:absolute;right:-4px;bottom:-4px;font-style:normal;font-size:9.5px;font-weight:bold;background:#e0a33a;color:#120d14;border-radius:6px;padding:0 3px}
  #editor .cneu{position:absolute;border:1px dashed #454a55;border-radius:6px;color:#626a72;background:none;font-size:20px;box-sizing:border-box}
  #editor .cneu:hover{border-color:#a9b2b0;color:#cfd6cf;background:#1c1e26}
  #editor .cverb{position:absolute;width:30px;height:24px;padding:0;border-radius:12px;font-size:12px;font-weight:bold;z-index:2;color:#120d14;border:2px solid #120d14;line-height:1}
  #editor .cverb sup{font-size:8px} #editor .cverb.cleer{background:#1c1e26;color:#626a72;border:1px dashed #626a72}
  #editor .cverb.an{box-shadow:0 0 0 3px #f4cd5e}
  #editor .clegende{display:inline-flex;align-items:center;gap:4px;margin:2px 10px 2px 0} #editor .clegende span{display:inline-block;min-width:22px;text-align:center;border-radius:9px;color:#120d14;font-weight:bold;font-size:11px}
  #editor .liste button.cfehlt{border-color:#e0a33a} #editor .liste button .cnr{margin-right:4px}
  #editor .chinweis{background:#4a3a14;border:1px solid #e0a33a;border-radius:4px;padding:6px 8px;color:#f4cd5e;font-size:12.5px}
  #editor .cliste2{list-style:none;padding:0;margin:4px 0} #editor .cliste2 li{display:flex;align-items:center;gap:6px;margin:3px 0}
  #editor .cfortschritt{height:8px;background:#2e313b;border-radius:4px;overflow:hidden;margin:6px 0 8px;max-width:600px} #editor .cfortschritt div{height:100%;background:#58933b}
  #editor .crraster{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:10px}
  #editor .crkarte{display:flex;gap:10px;background:#1c1e26;border:1px solid #2e313b;border-left:4px solid #454a55;border-radius:6px;padding:8px}
  #editor .crkarte.fertig{border-left-color:#58933b} #editor .crkarte.offen{border-left-color:#e0a33a} #editor .crkarte.gestaltet{border-left-color:#8098cc}
  #editor .crbild{width:120px;height:90px;image-rendering:pixelated;border:1px solid #2e313b;flex:none;cursor:pointer} #editor .crinhalt{flex:1;min-width:0}
  #editor .crkarte h4{margin:0 0 4px;font-size:13px;color:#f4cd5e} #editor .cstatus{color:#a9b2b0;font-weight:normal;margin-left:6px}
  #editor .cauftrag{list-style:none;padding:0;margin:4px 0} #editor .cauftrag li{display:flex;gap:6px;align-items:flex-start;margin:4px 0;font-size:12.5px}
  #editor .cauftrag li>span:last-child{flex:1} #editor .cauftrag small{display:block;color:#a9b2b0} #editor .cauftrag .cwarn{color:#e0a33a} #editor .cauftrag .cteil{display:inline;color:#7fbcdc}
  #editor .chaken{width:16px;flex:none;font-weight:bold} #editor .cauftrag li.ok .chaken{color:#8abd4f} #editor .cauftrag li.offen .chaken{color:#e0a33a}
  #editor .cauftragkasten{margin:0 0 10px;padding:6px 8px;background:#1c1e26;border:1px solid #2e313b;border-left:4px solid #e0a33a;border-radius:4px} #editor .cauftragkasten.fertig{border-left-color:#58933b}
  #editor .cauftragkasten h3{margin-top:2px}
  #editor .cergebnis{margin:8px 0;padding:8px 10px;border-radius:4px;border:1px solid #454a55} #editor .cergebnis.gruen{background:#1f4226;border-color:#58933b;color:#cfe8b8}
  #editor .cergebnis.gelb{background:#4a3a14;border-color:#e0a33a;color:#f4cd5e} #editor .cergebnis.rot{background:#5c1e24;border-color:#d0574a;color:#ffd9d2}
  #editor .czwei{display:flex;gap:16px;flex-wrap:wrap} #editor .czwei>div{flex:1 1 380px;min-width:0}
  #editor .cpruefliste{list-style:none;padding:0} #editor .cpruefliste>li{display:flex;gap:8px;margin:6px 0;padding:4px 6px;background:#1c1e26;border-radius:4px}
  #editor .cpruefliste>li.unerreichbar{border-left:3px solid #d0574a} #editor .cpruefliste>li.offen{opacity:.75}
  #editor .ckante{font-size:12px;margin:2px 0} #editor .ckante.haelt{color:#8abd4f} #editor .ckante.abkuerzung{color:#f4cd5e;font-weight:bold} #editor .ckante.ungeprueft{color:#848e92} #editor .ckante.zusatz{color:#7fbcdc}
  #editor .ctipptext{display:block;font-weight:normal;color:#cfd6cf;margin:1px 0 0 16px}
  #editor .cspoiler{padding-left:22px} #editor .cspoiler li{margin:6px 0} #editor .cweg{font-size:11.5px;color:#848e92}
  #editor .fehltritte,#editor .warnliste{margin:4px 0;padding-left:18px} #editor .fehltritte>li{margin:6px 0;color:#ff9c8f} #editor .warnliste li{color:#f4cd5e;margin:3px 0}`;
  const stil = document.createElement('style'); stil.textContent = CSS; document.head.appendChild(stil);

  return { render, auftragKasten, quellen, ordnung };
})();
