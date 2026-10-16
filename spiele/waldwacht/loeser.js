// Waldwacht – Löser über alle Zustände (für den Editor; läuft im Fenster oder als Worker).
// Ein Zustand ist: Ort (Raum, Startfeld, Blockstellung), Kristallfarben, dauerhafte Signale, Gegenstände, Schlüssel,
// geöffnete Türen, geöffnete Truhen. Je Raum rechnet eine Raum-Analyse aus, was man von einem Startfeld aus erreicht –
// mit Schieben (Blöcke auf Platten, in Abgründe), Zeitschaltern, Pflöcken, Sperren und Ereignissen. Daraus folgen
// kürzester Weg, Sackgassen (Zustände, von denen aus das Ziel nie mehr erreichbar ist) und Warnungen.
// Ziel: dungeon.ziel ({raum} oder {signal}), sonst alle Bosse besiegt, ohne Bosse: alle Räume betreten.
(function (wurzel) {
  'use strict';
  const W = 20, H = 15, NB = [1, -1, W, -W];
  const SPALTE = { 1: 5, '': 9, 3: 13 }, ZEILE = { 1: 3, '': 7, 3: 11 }, GEGEN = { n: 's', s: 'n', w: 'o', o: 'w' };
  const gegen = d => GEGEN[d[0]] + d.slice(1);
  const zelle = (c, r) => c + r * W, spalte = i => i % W, zeile = i => (i / W) | 0;
  const innen = i => { const c = spalte(i), r = zeile(i); return c >= 1 && c <= 18 && r >= 2 && r <= 13; };
  const nachbar = (i, k) => { const n = i + NB[k]; return Math.abs(spalte(n) - spalte(i)) + Math.abs(zeile(n) - zeile(i)) === 1 ? n : -1; };
  function eingang(d) {   // die beiden Felder innen vor einer Tür
    const s = d[0], nr = d.slice(1);
    if (s === 'n') return [zelle(SPALTE[nr], 2), zelle(SPALTE[nr] + 1, 2)];
    if (s === 's') return [zelle(SPALTE[nr], 13), zelle(SPALTE[nr] + 1, 13)];
    if (s === 'w') return [zelle(1, ZEILE[nr]), zelle(1, ZEILE[nr] + 1)];
    return [zelle(18, ZEILE[nr]), zelle(18, ZEILE[nr] + 1)];
  }
  const TUERNAME = d => ({ n: 'Nord', s: 'Süd', w: 'West', o: 'Ost' })[d[0]] + (d[1] === '1' ? (d[0] === 'n' || d[0] === 's' ? ' links' : ' oben') : d[1] === '3' ? (d[0] === 'n' || d[0] === 's' ? ' rechts' : ' unten') : '');

  // ---------- Bedingungen ----------
  function signaleIn(b, aus = []) {
    if (typeof b === 'string') aus.push(b);
    else if (b && typeof b === 'object') for (const x of [].concat(b.alle || [], b.eine || [], b.nicht !== undefined ? [b.nicht] : [])) signaleIn(x, aus);
    return aus;
  }
  function gilt(b, k) {   // k: { sig: Set, items: Set, krist: {typ: farbe}, geraeumt }
    if (b === undefined || b === null) return true;
    if (typeof b === 'string') {
      if (b === 'geraeumt') return k.geraeumt;
      if (b.startsWith('hat:')) return k.items.has(b.slice(4));
      const i = b.indexOf('=');
      if (i > 0) return k.krist[b.slice(0, i)] === b.slice(i + 1);
      return k.sig.has(b);
    }
    if (b.alle) return b.alle.every(x => gilt(x, k));
    if (b.eine) return b.eine.some(x => gilt(x, k));
    if (b.nicht !== undefined) return !gilt(b.nicht, k);
    return false;
  }

  // ---------- Räume aus den Daten ----------
  function baueRaeume(D, dg) {
    const R = {};
    const farben = typ => (D.kristalltypen[typ] || D.kristalltypen.kristall || { farben: ['blau', 'orange'] }).farben;
    for (const [rid, def] of Object.entries(dg.raeume)) {
      const legende = Object.assign({}, D.zeichen, def.zeichen || {});
      const kachel = new Array(W * H).fill('mauer'), objekte = [], gegner = [];
      def.karte.forEach((z, r) => [...z].forEach((ch, c) => {
        const k = D.kacheln[ch];
        if (k) kachel[zelle(c, r)] = k;
        else {
          kachel[zelle(c, r)] = 'boden';
          const e = legende[ch];
          if (e && e.objekt) objekte.push(Object.assign({}, e, { feld: [c, r] }));
          else if (e && e.gegner) gegner.push(Object.assign({}, e, { feld: [c, r] }));
        }
      }));
      for (const o of def.objekte || []) objekte.push(Object.assign({}, o));
      for (const g of def.gegner || []) gegner.push(Object.assign({}, g));
      for (const d of Object.keys(def.tueren)) for (const e of eingang(d)) if (kachel[e] === 'mauer') kachel[e] = 'boden';
      const raum = { id: rid, def, nr: def.nr || rid, titel: def.titel || '', kachel, fest: new Uint8Array(W * H), loch: new Uint8Array(W * H),
        dyn: [], bloecke: [], platten: [], kristalle: [], truhen: [], gegner: [], bezug: new Set(), kampf: !!def.kampf || !!(def.wellen && def.wellen.length) };
      for (let i = 0; i < W * H; i++) { if (kachel[i] === 'mauer' || !innen(i)) raum.fest[i] = 1; if (kachel[i] === 'abgrund') raum.loch[i] = 1; }
      objekte.forEach((o, k) => {
        const typ = D.objektarten[o.objekt]; if (!typ) return;
        const i = zelle(o.feld[0], o.feld[1]);
        if (typ.pflock) {   // Kristall-Pflock oder Sperre über eine Bedingung (ältere Daten: oben_wenn = Kristalltyp)
          let kt = o.kristalltyp, farbe = o.farbe, b = o.oben_wenn;
          if (!kt && b !== undefined) { const n = typeof b === 'string' ? b : b && typeof b.nicht === 'string' ? b.nicht : null; if (n && (D.kristalltypen[n] || n === 'kristall')) { kt = n; farbe = farben(n)[typeof b === 'string' ? 1 : 0]; } }
          if (kt) { raum.dyn.push({ i, oben: z => z.krist[kt] === farbe }); raum.bezug.add('=' + kt); }
          else { raum.dyn.push({ i, oben: z => gilt(b, z) }); signaleIn(b).forEach(s => raum.bezug.add(s)); }
          return;
        }
        if (typ.schiebbar) { raum.bloecke.push(i); return; }
        if (typ.platte) { raum.platten.push({ i, signal: o.signal, wer: o.wer || 'block', merken: !!o.merken, nachlauf: o.nachlauf || 0 }); return; }
        if (typ.kristall) raum.kristalle.push({ i, typ: o.kristalltyp || o.signal || 'kristall' });
        if (typ.oeffnbar && o.inhalt) raum.truhen.push({ i, key: rid + ':' + k, inhalt: o.inhalt, wenn: o.sichtbar_wenn });
        const solide = typ.fest && !typ.schneidbar;
        if (o.sichtbar_wenn !== undefined) { signaleIn(o.sichtbar_wenn).forEach(s => raum.bezug.add(s)); if (solide) raum.dyn.push({ i, oben: z => gilt(o.sichtbar_wenn, z) }); }
        else if (solide) raum.fest[i] = 1;
      });
      gegner.forEach((g, k) => {
        const art = D.gegnerarten[g.gegner]; if (!art) return;
        raum.gegner.push({ i: zelle(g.feld[0], g.feld[1]), signal: g.signal || art.signal, boss: !!art.boss, traegt: g.traegt, key: rid + ':g' + k, schiesst: !!(art.schuss || (art.phasen || []).some(p => p && p.schuss)) });
      });
      for (const t of Object.values(def.tueren)) signaleIn(t.offen_wenn).forEach(s => raum.bezug.add(s));
      for (const e of def.ereignisse || []) { signaleIn(e.wenn).forEach(s => raum.bezug.add(s)); for (const x of e.schritte || []) signaleIn(x.wenn).forEach(s => raum.bezug.add(s)); }
      raum.bossRaum = raum.gegner.some(g => g.boss) || (def.wellen || []).flat().some(a => (D.gegnerarten[a] || {}).boss);
      R[rid] = raum;
    }
    return R;
  }

  // ---------- Flutfüllung ----------
  function flut(start, blockiert) {
    const da = new Uint8Array(W * H), liste = [start]; da[start] = 1;
    for (let k = 0; k < liste.length; k++) {
      const i = liste[k];
      for (let n = 0; n < 4; n++) { const j = nachbar(i, n); if (j >= 0 && !da[j] && !blockiert[j]) { da[j] = 1; liste.push(j); } }
    }
    return { da, liste };
  }
  function sperrfeld(raum, z, gefuellt, bloecke) {   // was den Helden aufhält: Mauer, ungefüllter Abgrund, feste Objekte, Pflöcke, Blöcke
    const b = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) b[i] = raum.fest[i] || (raum.loch[i] && !gefuellt.has(i)) ? 1 : 0;
    for (const d of raum.dyn) if (d.oben(z)) b[d.i] = 1;
    for (const i of bloecke) b[i] = 1;
    return b;
  }

  // ---------- Raum-Analyse ----------
  // Von einem Startfeld aus alle Blockstellungen durchgehen. Ergebnis: erreichbare Felder, Türen (mit den Signalen, die
  // dabei anliegen), Truhen, Kristalle, dauerhafte Signale (Platten mit merken, Ereignisse), Fallen, Vollständigkeit.
  function analyse(D, raum, start, bloecke0, gefuellt0, g, grenze) {
    const basis = new Uint8Array(W * H);   // Mauern, Abgründe, feste Objekte – Pflöcke und Blöcke kommen je Stellung dazu
    for (let i = 0; i < W * H; i++) basis[i] = raum.fest[i] || raum.loch[i] ? 1 : 0;
    const sperr0 = (z, gef, bl) => {
      const b = basis.slice();
      for (const i of gef) if (!raum.fest[i]) b[i] = 0;
      for (const d of raum.dyn) if (d.oben(z)) b[d.i] = 1;
      for (const i of bl) b[i] = 1;
      return b;
    };
    const erg = { reach: new Uint8Array(W * H), tueren: new Map(), truhen: new Set(), sig: new Set(), kristalle: [], fallen: 0, voll: true, zustaende: 0, beispielFalle: null };
    const gesehen = new Set(), q = [[start, bloecke0, gefuellt0]];
    const ausgaenge = new Set(Object.keys(raum.def.tueren).flatMap(eingang));
    const zeit = raum.platten.filter(p => p.nachlauf), alle = raum.platten.filter(p => p.wer === 'alle' && !p.nachlauf && !p.merken);
    for (let k = 0; k < q.length; k++) {
      const [st, bl, gef] = q[k];
      // anliegende Signale: Platten mit Block darauf, Zeitschalter, die man erreicht (die Zeit prüft die Warnung)
      const live = new Set(raum.platten.filter(p => bl.includes(p.i)).map(p => p.signal));
      const z = { sig: new Set([...g.sig, ...live]), items: g.items, krist: g.krist, geraeumt: g.geraeumt };
      let sperr = sperr0(z, gef, bl), f = flut(st, sperr);
      for (let runde = 0; runde < 4; runde++) {   // Zeitschalter in Reichweite öffnen womöglich weitere Teile
        let neu = false;
        for (const p of zeit) if (f.da[p.i] && !z.sig.has(p.signal)) { z.sig.add(p.signal); live.add(p.signal); neu = true; }
        if (!neu) break;
        sperr = sperr0(z, gef, bl); f = flut(st, sperr);
      }
      let min = st; for (const i of f.liste) if (i < min) min = i;
      if (k === 0) erg.startMin = min;
      const key = min + '|' + bl.join(',') + '|' + [...gef].sort((a, b) => a - b).join(',');
      if (gesehen.has(key)) continue;
      gesehen.add(key); erg.zustaende++;
      if (erg.zustaende > grenze) { erg.voll = false; break; }
      for (const i of f.liste) erg.reach[i] = 1;
      // Falle: weder Tür noch ungefüllter Abgrund erreichbar
      const nah = i => f.da[i] || [0, 1, 2, 3].some(n => { const j = nachbar(i, n); return j >= 0 && f.da[j]; });
      const ausweg = f.liste.some(i => ausgaenge.has(i)) || raum.kristalle.some(k => nah(k.i)) || zeit.some(p => f.da[p.i]) ||
        f.liste.some(i => { for (let n = 0; n < 4; n++) { const j = nachbar(i, n); if (j >= 0 && raum.loch[j] && !gef.has(j)) return true; } return false; });
      if (!ausweg) {
        erg.fallen++; if (!erg.beispielFalle) erg.beispielFalle = { held: [spalte(st), zeile(st)], bloecke: bl.map(i => [spalte(i), zeile(i)]) };
      }
      const tritt = alle.filter(p => f.da[p.i]).map(p => p.signal);   // Trittplatten: gilt nur, solange man draufsteht
      for (const [d, t] of Object.entries(raum.def.tueren)) if (eingang(d).some(i => f.da[i])) {
        const s = [...live].sort().join(','), l = erg.tueren.get(d) || new Set(); l.add(s);
        if (t.merken) for (const x of tritt) l.add('!' + [...live, x].sort().join(','));   // Tür merkt sich: einmal draufgetreten, bleibt sie offen
        erg.tueren.set(d, l);
      }
      for (const t of raum.truhen) if (nah(t.i) && gilt(t.wenn, z)) erg.truhen.add(t.key);
      for (const p of raum.platten) if (p.merken && (f.da[p.i] && p.wer === 'alle' || bl.includes(p.i))) erg.sig.add(p.signal);
      for (const kr of raum.kristalle) if (nah(kr.i) && !erg.kristalle.some(x => x.i === kr.i)) {   // je Kristall die erste Stellung, von der aus man ihn trifft
        const steh = [0, 1, 2, 3].map(n => nachbar(kr.i, n)).filter(j => j >= 0 && f.da[j]);
        if (steh.length) erg.kristalle.push({ typ: kr.typ, i: kr.i, steh: steh[0], bloecke: bl, gefuellt: gef });
      }
      // Ereignisse: mit den anliegenden Signalen, dazu je eine erreichbare Trittplatte (man steht auf einer)
      const versuche = [z.sig, ...alle.filter(p => f.da[p.i]).map(p => new Set([...z.sig, p.signal]))];
      for (const e of raum.def.ereignisse || []) {
        const setzt = [...Object.keys(e.setze || {}), ...(e.schritte || []).filter(x => x.art === 'signal' && x.signal && x.wert !== false).map(x => x.signal)];
        if (!setzt.length || setzt.every(s => g.sig.has(s) || erg.sig.has(s))) continue;
        if (versuche.some(s => gilt(e.wenn, { sig: new Set([...s, ...erg.sig]), items: g.items, krist: g.krist, geraeumt: g.geraeumt }))) setzt.forEach(s => erg.sig.add(s));
      }
      // Schübe
      for (const b of bl) for (let n = 0; n < 4; n++) {
        const steh = nachbar(b, n ^ 1), hin = nachbar(b, n);
        if (steh < 0 || hin < 0 || !f.da[steh] || !innen(hin) || bl.includes(hin)) continue;
        if (raum.loch[hin] && !gef.has(hin)) { const g2 = new Set(gef); g2.add(hin); q.push([b, bl.filter(x => x !== b), g2]); continue; }
        if (sperr[hin]) continue;
        q.push([b, bl.map(x => x === b ? hin : x).sort((a, b) => a - b), gef]);
      }
    }
    return erg;
  }

  // Zeitläufe: reicht der Zeitschalter vom Drücken der Platte bis zum ersten Feld, das er öffnet?
  function zeitlaeufe(D, raum, g) {
    const tempo = ((D.einstellungen || {}).held || {}).tempo || 150, aus = [];
    for (const p of raum.platten.filter(p => p.nachlauf)) {
      const ohne = { sig: new Set(g.sig), items: g.items, krist: g.krist, geraeumt: true }, mit = { sig: new Set([...g.sig, p.signal]), items: g.items, krist: g.krist, geraeumt: true };
      const a = sperrfeld(raum, ohne, new Set(), raum.bloecke), b = sperrfeld(raum, mit, new Set(), raum.bloecke);
      const ziele = new Set(); for (let i = 0; i < W * H; i++) if (a[i] && !b[i]) ziele.add(i);
      for (const [d, t] of Object.entries(raum.def.tueren)) if (signaleIn(t.offen_wenn).includes(p.signal)) eingang(d).forEach(i => ziele.add(i));
      if (!ziele.size) continue;
      const dist = new Int16Array(W * H).fill(-1), q = [p.i]; dist[p.i] = 0; let weit = -1;
      for (let k = 0; k < q.length && weit < 0; k++) { const i = q[k]; if (ziele.has(i)) { weit = dist[i]; break; } for (let n = 0; n < 4; n++) { const j = nachbar(i, n); if (j >= 0 && dist[j] < 0 && !b[j]) { dist[j] = dist[i] + 1; q.push(j); } } }
      if (weit < 0) continue;
      const sek = weit * 32 / tempo;
      aus.push({ raum: raum.id, platte: [spalte(p.i), zeile(p.i)], felder: weit, sekunden: +sek.toFixed(1), nachlauf: p.nachlauf, knapp: sek > p.nachlauf * 0.85, zuKnapp: sek > p.nachlauf });
    }
    return aus;
  }

  // ---------- Raumteile (für die Ansicht im Editor) ----------
  // Zusammenhängende Flächen im gewählten Zustand; Blöcke gelten als verschiebbar (nicht trennend), Abgründe trennen.
  function raumteile(D, dg, rid, zustand) {
    const raum = baueRaeume(D, { raeume: { [rid]: dg.raeume[rid] } })[rid];
    const z = { sig: new Set(zustand.signale || []), items: new Set(zustand.besitz || []), krist: zustand.kristalle || {}, geraeumt: true };
    const sperr = sperrfeld(raum, z, new Set(), []), teil = new Int16Array(W * H).fill(-1), teile = [];
    for (let i = 0; i < W * H; i++) if (!sperr[i] && innen(i) && teil[i] < 0) {
      const f = flut(i, sperr), t = { name: String.fromCharCode(65 + teile.length), zellen: f.liste, tueren: [], truhen: [], kristalle: [], platten: [] };
      for (const j of f.liste) teil[j] = teile.length;
      teile.push(t);
    }
    const in_ = i => { if (teil[i] >= 0) return teil[i]; for (let n = 0; n < 4; n++) { const j = nachbar(i, n); if (j >= 0 && teil[j] >= 0) return teil[j]; } return -1; };
    for (const d of Object.keys(raum.def.tueren)) { const k = eingang(d).map(in_).find(x => x >= 0); if (k !== undefined) teile[k].tueren.push(d); }
    for (const x of raum.truhen) { const k = in_(x.i); if (k >= 0) teile[k].truhen.push(x.inhalt); }
    for (const x of raum.kristalle) { const k = in_(x.i); if (k >= 0) teile[k].kristalle.push(x.typ); }
    for (const x of raum.platten) { const k = in_(x.i); if (k >= 0) teile[k].platten.push(x.signal); }
    const wichtig = teile.filter(t => t.tueren.length || t.truhen.length || t.kristalle.length || t.platten.length || t.zellen.length > 3);
    wichtig.forEach((t, k) => { t.name = String.fromCharCode(65 + k); });
    const nr = new Int16Array(W * H).fill(-1); wichtig.forEach((t, k) => t.zellen.forEach(i => { nr[i] = k; }));
    return { teile: wichtig.map(t => ({ name: t.name, zellen: t.zellen.map(i => [spalte(i), zeile(i)]), tueren: t.tueren, truhen: t.truhen, kristalle: t.kristalle, platten: t.platten })),
      feld: Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => nr[zelle(c, r)])), zeitlaeufe: zeitlaeufe(D, raum, z) };
  }

  // Was erreicht man ab einer Tür – mit Schieben, Zeitschaltern und Ereignissen (für die Ansicht im Editor)?
  function erreichbarAb(D, dg, rid, tuer, zustand) {
    const raum = baueRaeume(D, { raeume: { [rid]: dg.raeume[rid] } })[rid];
    const z = { sig: new Set(zustand.signale || []), items: new Set(zustand.besitz || []), krist: zustand.kristalle || {}, geraeumt: true };
    const a = analyse(D, raum, eingang(tuer)[0], raum.bloecke.slice().sort((x, y) => x - y), new Set(), z, 200000);
    const zellen = []; for (let i = 0; i < W * H; i++) if (a.reach[i]) zellen.push([spalte(i), zeile(i)]);
    return { zellen, tueren: [...a.tueren.keys()], truhen: raum.truhen.filter(t => a.truhen.has(t.key)).map(t => t.inhalt), kristalle: a.kristalle.map(k => k.typ),
      signale: [...a.sig], fallen: a.fallen, beispielFalle: a.beispielFalle, voll: a.voll, stellungen: a.zustaende };
  }

  // ---------- Suche über alle Zustände ----------
  function loese(D, dg, opt = {}) {
    const R = baueRaeume(D, dg), rids = Object.keys(R), typen = Object.keys(D.kristalltypen), grenze = opt.raumGrenze || 200000, maxZ = opt.maxZustaende || 2000000;
    const melde = opt.fortschritt || (() => {});
    const bits = new Map(), namen = [];
    const bit = n => { if (!bits.has(n)) { bits.set(n, 1n << BigInt(namen.length)); namen.push(n); } return bits.get(n); };
    const menge = m => namen.filter(n => (bits.get(n) & m) !== 0n);
    const reflektiert = items => [dg.start.waffe || (D.einstellungen.held || {}).waffe, ...items].some(w => w && D.waffen && D.waffen[w] && D.waffen[w].reflektiert);
    const startKrist = typen.map(() => 0);
    const kristCtx = k => Object.fromEntries(typen.map((t, i) => [t, D.kristalltypen[t].farben[k[i]]]));
    const bossRaeume = rids.filter(r => R[r].bossRaum);
    let ziel;
    if (dg.ziel && dg.ziel.signal) ziel = z => (z.sig & bit(dg.ziel.signal)) !== 0n;
    else if (dg.ziel && dg.ziel.raum) ziel = z => z.rid === dg.ziel.raum;
    else if (bossRaeume.length) { const m = bossRaeume.reduce((a, r) => a | bit('geraeumt:' + r), 0n); ziel = z => (z.sig & m) === m; }
    else { const m = rids.reduce((a, r) => a | bit('war:' + r), 0n); ziel = z => (z.sig & m) === m; }
    const ctxCache = new Map();
    const ctxVon = (rid, z) => {   // Mengen aus den Bitmasken (zwischengespeichert, das ist der häufigste Aufruf)
      const key = rid + '|' + z.sig.toString(36) + '|' + z.items.toString(36) + '|' + z.krist.join('');
      let k = ctxCache.get(key);
      if (!k) {
        if (ctxCache.size > 100000) ctxCache.clear();
        k = { sig: new Set(menge(z.sig).filter(n => !n.startsWith('hat:'))), items: new Set(menge(z.items).map(n => n.slice(4))), krist: kristCtx(z.krist), geraeumt: (z.sig & bit('geraeumt:' + rid)) !== 0n };
        ctxCache.set(key, k);
      }
      return k;
    };
    const lageKey = l => l.start + '/' + l.bloecke.join(',') + '/' + [...l.gefuellt].sort((a, b) => a - b).join(',');
    const cache = new Map(), schnell = new Map(), warnung = new Map();
    function raumAnalyse(rid, lage, z) {
      const sk = rid + '|' + lageKey(lage) + '|' + z.sig.toString(36) + '|' + z.items.toString(36) + '|' + z.krist.join('');
      const treffer = schnell.get(sk); if (treffer) return treffer;
      if (schnell.size > 300000) schnell.clear();
      const raum = R[rid], k = ctxVon(rid, z);
      // nur, was der Raum selbst abfragt, gehört in den Schlüssel (sonst rechnet jeder neue Gegenstand die Schieberäume neu)
      const proj = [...raum.bezug].map(s => {
        if (s.startsWith('=')) return s + ':' + k.krist[s.slice(1)];
        if (s.startsWith('hat:')) return k.items.has(s.slice(4)) ? s : '';
        const i = s.indexOf('='); if (i > 0) return s.slice(0, i) + ':' + k.krist[s.slice(0, i)];
        return k.sig.has(s) ? s : '';
      }).filter(Boolean).sort().join(',') + '|' + k.geraeumt;
      const rest = '|' + lage.bloecke.join(',') + '|' + [...lage.gefuellt].sort((x, y) => x - y).join(',') + '|' + proj;
      const key = rid + '|' + lage.start + rest;
      let a = cache.get(key);
      if (!a) {
        a = analyse(D, raum, lage.start, lage.bloecke, lage.gefuellt, k, grenze); cache.set(key, a);
        cache.set(rid + '|' + a.startMin + rest, a);   // gleiche Fläche, gleiches Ergebnis: auch unter dem kleinsten Feld ablegen
        if (!a.voll) warnung.set('gross:' + rid, { raum: rid, text: `Raum ${raum.nr} ${raum.titel}: zu viele Blockstellungen (> ${grenze}) – Ergebnis kann unvollständig sein (den Raum lieber per Test nachweisen)` });
        if (a.fallen) warnung.set('falle:' + rid, { raum: rid, text: `Raum ${raum.nr} ${raum.titel}: man kann sich mit Blöcken einsperren (z. B. Held auf ${a.beispielFalle.held}, Blöcke ${a.beispielFalle.bloecke.map(b => b.join(',')).join(' / ')}) – Abgrund oder Ausweg vorsehen (oder R halten: Raum neu)` });
      }
      const e = { a, k }; schnell.set(sk, e);
      return e;
    }
    const zaehltRaeume = !(dg.ziel && (dg.ziel.signal || dg.ziel.raum)) && !bossRaeume.length;
    function betreten(rid, sig) {
      const raum = R[rid]; if (zaehltRaeume) sig |= bit('war:' + rid);
      if (raum.kampf || Object.values(raum.def.tueren).some(t => t.offen_wenn === 'geraeumt')) {
        sig |= bit('geraeumt:' + rid);
        for (const g of raum.gegner) if (g.signal) sig |= bit(g.signal);
      }
      return sig;
    }
    function sammeln(z) {   // alles mitnehmen, was ohne Entscheidung geht
      const gewonnen = [];
      for (let runde = 0; runde < 20; runde++) {
        const { a, k } = raumAnalyse(z.rid, z.lage, z), raum = R[z.rid];
        let neu = false;
        for (const s of a.sig) { const b = bit(s); if (!(z.sig & b)) { z.sig |= b; neu = true; gewonnen.push('Signal „' + s + '“'); } }
        for (const t of raum.truhen) if (a.truhen.has(t.key)) {
          const b = bit('truhe:' + t.key); if (z.truhen & b) continue;
          z.truhen |= b; neu = true; gewonnen.push(((D.gegenstaende[t.inhalt] || {}).name || t.inhalt));
          if (t.inhalt === 'schluessel') z.keys++; else z.items |= bit('hat:' + t.inhalt);
        }
        const fern = reflektiert(k.items);
        for (const g of raum.gegner) {
          const erreichbar = a.reach[g.i] || [0, 1, 2, 3].some(n => { const j = nachbar(g.i, n); return j >= 0 && a.reach[j]; }) || (g.schiesst && fern);
          if (!erreichbar) continue;
          if (g.signal && !(z.sig & bit(g.signal))) { z.sig |= bit(g.signal); neu = true; gewonnen.push('Signal „' + g.signal + '“'); }
          if (g.traegt) {
            const b = bit('truhe:' + g.key); if (z.truhen & b) continue;
            z.truhen |= b; neu = true; gewonnen.push(((D.gegenstaende[g.traegt] || {}).name || g.traegt) + ' (Drop)');
            if (g.traegt === 'schluessel') z.keys++; else z.items |= bit('hat:' + g.traegt);
          }
        }
        if (!neu) return gewonnen;
      }
      return gewonnen;
    }
    function kanon(z) {   // Startfeld durch das kleinste Feld seiner Fläche ersetzen (gleiche Fläche = gleicher Zustand)
      const raum = R[z.rid], k = ctxVon(z.rid, z);
      const live = new Set(raum.platten.filter(p => z.lage.bloecke.includes(p.i)).map(p => p.signal));
      const f = flut(z.lage.start, sperrfeld(raum, { sig: new Set([...k.sig, ...live]), items: k.items, krist: k.krist, geraeumt: k.geraeumt }, z.lage.gefuellt, z.lage.bloecke));
      let min = z.lage.start; for (const i of f.liste) if (i < min) min = i;
      z.lage = { start: min, bloecke: z.lage.bloecke, gefuellt: z.lage.gefuellt };
      return z.rid + '|' + lageKey(z.lage) + '|' + z.krist.join('') + '|' + z.sig.toString(36) + '|' + z.items.toString(36) + '|' + z.keys + '|' + z.offen.toString(36) + '|' + z.truhen.toString(36);
    }
    const kopie = z => ({ rid: z.rid, lage: z.lage, krist: z.krist.slice(), sig: z.sig, items: z.items, keys: z.keys, offen: z.offen, truhen: z.truhen });
    function nachfolger(z) {   // z ist schon „gesammelt“ (siehe Suche)
      const raum = R[z.rid], { a, k } = raumAnalyse(z.rid, z.lage, z), aus = [];
      for (const [d, sets] of a.tueren) {
        const t = raum.def.tueren[d], ziel = R[t.ziel]; if (!ziel) continue;
        let geht = false, kb = bit('tuer:' + z.rid + ':' + d), offen = z.offen, keys = z.keys, wie = '';
        if (z.offen & kb) geht = true;
        else if (t.schloss === 'gross') { if (z.items & bit('hat:grosser_schluessel')) { geht = true; offen |= kb; wie = ' (großes Schloss)'; } }
        else if (t.schloss) { if (keys > 0) { geht = true; keys--; offen |= kb; wie = ' (Schlüssel)'; } }
        else if (t.riegel) geht = false;
        else if (t.braucht) geht = (z.items & bit('hat:' + t.braucht)) !== 0n;
        else if (t.offen_wenn !== undefined) {
          for (const s0 of sets) { const s = s0.replace(/^!/, ''); if (gilt(t.offen_wenn, { sig: new Set([...k.sig, ...(s ? s.split(',') : [])]), items: k.items, krist: k.krist, geraeumt: k.geraeumt })) { geht = true; break; } }
          if (geht && t.merken) offen |= kb;
        } else geht = true;
        if (!geht) continue;
        const an = gegen(d), tt = ziel.def.tueren[an];
        if (!tt) continue;
        if (tt.schloss || tt.riegel || (tt.offen_wenn !== undefined && tt.merken)) offen |= bit('tuer:' + t.ziel + ':' + an);
        const n = { rid: t.ziel, lage: { start: eingang(an)[0], bloecke: ziel.bloecke.slice().sort((x, y) => x - y), gefuellt: new Set() }, krist: z.krist.slice(), sig: betreten(t.ziel, z.sig), items: z.items, keys, offen, truhen: z.truhen };
        aus.push({ z: n, raum: z.rid, text: `Raum ${raum.nr} ${raum.titel}: Tür ${TUERNAME(d)}${wie} → Raum ${ziel.nr} ${ziel.titel}` });
      }
      for (const kr of a.kristalle) {
        const ti = typen.indexOf(kr.typ); if (ti < 0) continue;
        const n = kopie(z); n.krist[ti] = (n.krist[ti] + 1) % D.kristalltypen[kr.typ].farben.length;
        n.lage = { start: kr.steh, bloecke: kr.bloecke, gefuellt: kr.gefuellt };
        aus.push({ z: n, raum: z.rid, text: `Raum ${raum.nr} ${raum.titel}: Kristall (${D.kristalltypen[kr.typ].name || kr.typ}) → ${D.kristalltypen[kr.typ].farben[n.krist[ti]]}` });
      }
      return aus;
    }
    // Breitensuche
    const s0 = { rid: dg.start.raum, lage: { start: zelle(Math.floor(dg.start.feld[0]), Math.floor(dg.start.feld[1])), bloecke: R[dg.start.raum].bloecke.slice().sort((x, y) => x - y), gefuellt: new Set() },
      krist: startKrist, sig: betreten(dg.start.raum, 0n), items: 0n, keys: 0, offen: 0n, truhen: 0n };
    const startGewonnen = sammeln(s0);
    const idx = new Map([[kanon(s0), 0]]), zust = [s0], kanten = [[]], vor = [null], ziele = [];
    let fertig = true;
    for (let i = 0; i < zust.length; i++) {
      const z = zust[i];
      if (ziel(z)) { ziele.push(i); continue; }
      for (const { z: n, text, raum } of nachfolger(kopie(z))) {
        const gewonnen = sammeln(n), key = kanon(n); let j = idx.get(key);
        if (j === undefined) {
          j = zust.length; idx.set(key, j); zust.push(n); kanten.push([]); vor.push([i, text, gewonnen, raum]);
          if (zust.length % 20000 === 0) melde(zust.length);
          if (zust.length > maxZ) { fertig = false; break; }
        }
        kanten[i].push(j);
      }
      if (!fertig) break;
      if (cache.size > 200000) cache.clear();
    }
    // Ergebnis: Weg, Sackgassen, Warnungen
    const weg = j => { const s = []; while (vor[j]) { const [i, text, gewonnen, raum] = vor[j]; s.push({ text, gewonnen, raum }); j = i; } return s.reverse(); };
    const bester = ziele.length ? ziele.reduce((a, b) => weg(a).length <= weg(b).length ? a : b) : null;
    const gut = new Uint8Array(zust.length), rueck = zust.map(() => []);
    kanten.forEach((ks, i) => ks.forEach(j => rueck[j].push(i)));
    const q = ziele.slice(); ziele.forEach(i => { gut[i] = 1; });
    for (let k = 0; k < q.length; k++) for (const i of rueck[q[k]]) if (!gut[i]) { gut[i] = 1; q.push(i); }
    const sackgassen = fertig ? zust.map((_, i) => i).filter(i => !gut[i]) : [];
    const fehltritte = new Map();   // gute Zustände, von denen ein Schritt in die Sackgasse führt
    if (fertig) kanten.forEach((ks, i) => { if (gut[i]) for (const j of ks) if (!gut[j]) { const t = vor[j] && vor[j][0] === i ? vor[j][1] : null; const key = t || 'Schritt'; const e = fehltritte.get(key) || { text: key, raum: vor[j] && vor[j][3], anzahl: 0, beispiel: j }; e.anzahl++; fehltritte.set(key, e); } });
    const warnungen = [...warnung.values()];
    for (const rid of rids) for (const zl of zeitlaeufe(D, R[rid], { sig: new Set(), items: new Set(), krist: kristCtx(startKrist) }))
      if (zl.knapp) warnungen.push({ raum: rid, text: `Raum ${R[rid].nr} ${R[rid].titel}: Zeitschalter auf ${zl.platte} – ${zl.felder} Felder ≈ ${zl.sekunden} s bei ${zl.nachlauf} s ${zl.zuKnapp ? '– zu knapp' : '– knapp'}` });
    const erreicht = new Set(zust.map(z => z.rid));
    return {
      loesbar: ziele.length > 0, fertig, zustaende: zust.length,
      ziel: dg.ziel ? (dg.ziel.raum ? 'Raum ' + dg.ziel.raum : 'Signal ' + dg.ziel.signal) : bossRaeume.length ? 'alle Bosse besiegt (' + bossRaeume.map(r => R[r].nr).join(', ') + ')' : 'alle Räume betreten',
      weg: bester !== null ? [{ text: 'Start: Raum ' + R[dg.start.raum].nr + ' ' + R[dg.start.raum].titel, gewonnen: startGewonnen, raum: dg.start.raum }, ...weg(bester)] : [],
      sackgassen: sackgassen.length,
      fehltritte: [...fehltritte.values()].sort((a, b) => b.anzahl - a.anzahl).slice(0, 8).map(e => ({ text: e.text, raum: e.raum, anzahl: e.anzahl, weg: weg(e.beispiel).slice(-8) })),
      nieErreicht: rids.filter(r => !erreicht.has(r)).map(r => ({ id: r, nr: R[r].nr, titel: R[r].titel })),
      warnungen,
    };
  }

  const Loeser = { loese, raumteile, erreichbarAb, baueRaeume, analyse, eingang, TUERNAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = Loeser;
  wurzel.Loeser = Loeser;
  // Als Worker: { daten, dungeon, optionen } → { fortschritt } … { ergebnis }; { daten, dungeon, ab: [Raum, Tür, Zustand] } → { ab }; Fehler → { fehler }
  if (typeof document === 'undefined' && typeof importScripts === 'function') {
    wurzel.onmessage = e => {
      try {
        const { daten, dungeon, optionen, ab } = e.data;
        if (ab) wurzel.postMessage({ ab: erreichbarAb(daten, dungeon, ...ab) });   // [Raum, Tür, Zustand]
        else wurzel.postMessage({ ergebnis: loese(daten, dungeon, Object.assign({}, optionen, { fortschritt: n => wurzel.postMessage({ fortschritt: n }) })) });
      }
      catch (err) { wurzel.postMessage({ fehler: String(err && err.stack || err) }); }
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
