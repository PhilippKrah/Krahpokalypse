// Oberfläche der Lern-App. Auf dem Handy wird nichts getippt: antippen, wischen, fertig.
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const L = window.Lern, FSRS = window.FSRS;
    const DEMO = new URLSearchParams(location.search).has('demo');
    const plan = L.planer(FSRS);

    const SUPABASE_URL = 'https://jzfhuqgyvujgriuierye.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6Zmh1cWd5dnVqZ3JpdWllcnllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxODgzNDgsImV4cCI6MjEwMTc2NDM0OH0.eRH8-E16T8qewLPipHEMmPKKTzKRGK-p0CUU8X6NdtE';
    // Dieselbe Anmeldung wie beim Familien-Planer (gleiche Adresse, gleiche gespeicherte Sitzung)
    const db = DEMO ? null : supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    let uid = null, speicher = null;
    let karten = [], staende = new Map(), bewertungen = [];
    let reihe = [], stelle = 0, gemacht = [], schritt = null, letzte = null, meldungZeit = null;
    let sicht = 'lade';

    // ---------- Einstellungen (nur dieses Gerät) ----------
    function limit() {
        try { const n = parseInt(localStorage.getItem('lernen.limit'), 10); return Number.isInteger(n) && n >= 0 ? Math.min(n, 50) : 8; }
        catch (e) { return 8; }
    }
    function setzeLimit(n) {
        try { localStorage.setItem('lernen.limit', String(Math.max(0, Math.min(50, n)))); } catch (e) { /* nur Komfort */ }
        zeichne();
    }

    // ---------- Anmeldung ----------
    function zeige(name) {
        for (const id of ['laden', 'anmelden', 'start', 'karte', 'fertig', 'panne']) $(id).hidden = id !== name;
        document.body.dataset.sicht = name;
        sicht = name;
    }

    async function beginne(neuerUid) {
        if (speicher && uid === neuerUid) return;      // Sitzung wurde nur erneuert
        if (speicher) speicher.schliesse();
        uid = neuerUid;
        speicher = DEMO ? DemoSpeicher() : Speicher(db, uid, zeichneStand);
        await lade();
    }

    async function lade() {
        const fuer = speicher;
        verstecke();
        zeige('laden');
        try {
            const d = await fuer.laden();
            if (fuer !== speicher) return;             // inzwischen abgemeldet oder anderes Konto
            karten = d.karten; staende = d.staende; bewertungen = d.bewertungen;
            schritt = null; letzte = null;
            zeige('start');
            zeichne();
            fuer.spuele();
        } catch (e) {
            console.error(e);
            if (fuer === speicher) zeige('panne');
        }
    }

    function ende() {
        if (speicher) speicher.schliesse();
        verstecke();
        speicher = null; uid = null; schritt = null; letzte = null;
        karten = []; staende = new Map(); bewertungen = []; reihe = []; gemacht = [];
        $('buehne').innerHTML = '';
        zeige('anmelden');
    }

    $('anmeldeform').addEventListener('submit', async ev => {
        ev.preventDefault();
        const k = $('anmeldeknopf');
        $('anmeldefehler').textContent = '';
        k.disabled = true; k.textContent = 'Anmelden …';
        let fehler = null;
        try { fehler = (await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('passwort').value })).error; }
        catch (e) { fehler = e; }
        k.disabled = false; k.textContent = 'Anmelden';
        $('passwort').value = '';
        if (fehler) $('anmeldefehler').textContent = fehler.status === 400 ? 'E-Mail oder Passwort stimmt nicht.' : 'Anmelden hat nicht geklappt. Hast du Netz?';
    });

    // ---------- Start ----------
    function sitzung() {
        return L.baueSitzung({ karten, staende, bewertungen, jetzt: new Date(), limit: limit() });
    }

    // Für heute fertig, aber noch Lust: die wackligsten Karten vorziehen (zählt wie eine normale Wiederholung)
    const PRO_RUNDE = 5;
    function extra() {
        return L.vorziehen({ karten, staende, bewertungen, jetzt: new Date(), anzahl: PRO_RUNDE,
            abruf: (z, jetzt) => plan.get_retrievability(L.ausZeile(z), jetzt, false) });
    }
    function zeigeExtra(knopf, an) {
        const n = an ? Math.min(PRO_RUNDE, extra().moeglich) : 0;
        $(knopf).hidden = !n;
        $(knopf).textContent = n === 1 ? '1 Karte vorziehen' : n + ' Karten vorziehen';
    }
    function starte(r) {
        reihe = r; stelle = 0; gemacht = []; letzte = null;
        verstecke();
        if (reihe.length) { zeige('karte'); naechste(); }
    }

    function zeichne() {
        if (sicht !== 'start') return;
        const s = sitzung();
        zeigeExtra('extra', !s.reihe.length);
        $('zahlFaellig').textContent = s.faellig;
        $('zahlNeu').textContent = s.neu;
        $('limitWert').textContent = limit();
        $('los').disabled = !s.reihe.length;
        $('los').textContent = s.reihe.length ? 'Los' : 'Für heute fertig';
        $('wartend').textContent = !karten.length ? 'Noch keine Karten hochgeladen.'
            : s.wartend ? s.wartend + (s.wartend === 1 ? ' neue Karte wartet noch.' : ' neue Karten warten noch.') : 'Alle neuen Karten sind eingeplant.';
        zeichneStand();
    }

    function zeichneStand() {
        if (!speicher) return;
        const t = [];
        const n = speicher.offen(), d = speicher.defekt();
        if (n && speicher.fehler()) t.push(n + (n === 1 ? ' Eintrag wartet' : ' Einträge warten') + ' auf Netz');
        if (d) t.push(d + (d === 1 ? ' Eintrag' : ' Einträge') + ' ließ sich nicht speichern');
        if (DEMO) t.push('Probemodus, nichts wird gespeichert');
        $('standzeile').textContent = t.join(' · ');
    }

    $('weniger').addEventListener('click', () => setzeLimit(limit() - 1));
    $('mehr').addEventListener('click', () => setzeLimit(limit() + 1));
    $('los').addEventListener('click', () => starte(sitzung().reihe));
    $('extra').addEventListener('click', () => starte(extra().reihe));
    $('extraFertig').addEventListener('click', () => starte(extra().reihe));
    $('nochmal').addEventListener('click', lade);
    $('zurueckStart').addEventListener('click', lade);
    $('abbrechen').addEventListener('click', lade);

    // ---------- Lernen ----------
    function naechste() {
        if (stelle >= reihe.length) return zeichneFertig();
        const k = reihe[stelle];
        schritt = { karte: k, fall: k.typ === 'fall' ? L.waehleFall(k, bewertungen) : null, urteile: [], offen: false, ende: false };
        zeichneKarte(true);
    }

    function thema(k) {
        return (k.themen || []).map(t => t.name).filter(Boolean).join(', ');
    }

    function punkte(liste) {
        return liste && liste.length ? '<ul class="punkte">' + liste.map(p => '<li>' + L.html(p).replace(/^<p>|<\/p>$/g, '') + '</li>').join('') + '</ul>' : '';
    }

    function stufeHtml(s, zustand) {
        const marke = zustand === true ? '<span class="marke gut">richtig</span>' : zustand === false ? '<span class="marke schlecht">falsch</span>' : '';
        return '<section class="stufe"><h3>' + L.STUFEN_NAME[s.art] + marke + '</h3>' +
            (zustand === 'frage' ? '<p class="denk">' + L.STUFEN_FRAGE[s.art] + '</p>'
                : '<div class="antwort">' + L.html(s.antwort) + '</div>' + punkte(s.pruefpunkte) +
                  (s.auch ? '<div class="auch"><span>Auch vertretbar:</span> ' + L.html(s.auch).replace(/^<p>|<\/p>$/g, '') + '</div>' : '')) + '</section>';
    }

    function zeichneKarte(vonOben) {
        const { karte: k, fall, urteile, offen, ende: amEnde } = schritt;
        let h = '';
        if (fall) {
            h += '<div class="lage">' + L.html(fall.lage) + '</div>';
            fall.stufen.forEach((s, i) => {
                if (i < urteile.length) h += stufeHtml(s, urteile[i]);
                else if (amEnde) h += stufeHtml(s, null);
                else if (i === urteile.length) h += stufeHtml(s, offen ? null : 'frage');
            });
            if (amEnde) {
                h += '<section class="prinzip"><h3>' + L.escapeHtml(k.prinzip || 'Prinzip') + '</h3>' + L.html(k.prinzip_text) +
                    (fall.gegen ? '<p class="gegen">Das war ein Gegenfall: Hier passt das Prinzip nicht.</p>' : '') +
                    '<p class="thema">' + L.escapeHtml(thema(k)) + '</p></section>';
            }
        } else {
            h += '<div class="lage">' + L.html(k.frage) + '</div>';
            if (offen) h += '<section class="stufe"><div class="antwort">' + L.html(k.antwort) + '</div>' + (k.warum ? '<div class="warum">' + L.html(k.warum) + '</div>' : '') + '</section>';
        }
        $('buehne').innerHTML = h;
        const b = $('blatt');
        b.style.transform = ''; b.style.opacity = ''; b.dataset.neigung = '';
        $('zeigen').hidden = offen || amEnde;
        $('urteil').hidden = !offen || amEnde;
        $('weiter').hidden = !amEnde;
        $('frageKnopf').style.visibility = amEnde ? 'hidden' : '';
        $('fortschritt').style.transform = 'scaleX(' + (reihe.length ? stelle / reihe.length : 0) + ')';
        $('zaehler').textContent = (stelle + 1) + ' von ' + reihe.length;
        if (vonOben) b.scrollTop = 0;
        else {
            const ziel = amEnde ? b.querySelectorAll('.stufe')[Math.max(0, urteile.indexOf(false))] : b.querySelector('.stufe:last-of-type');
            if (ziel && urteile.length) ziel.scrollIntoView({ block: 'nearest', behavior: ruhig ? 'auto' : 'smooth' });
        }
    }
    const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function deckAuf() {
        if (!schritt || schritt.offen || schritt.ende) return;
        schritt.offen = true;
        zeichneKarte(false);
    }

    function urteile(gut) {
        if (!schritt || !schritt.offen || schritt.ende) return;
        const vorher = { schritt: Object.assign({}, schritt, { urteile: schritt.urteile.slice() }), stelle };
        let r = { fertig: true, geloest: gut, roteStufe: null };
        if (schritt.fall) {
            schritt.urteile.push(gut);
            r = L.fallErgebnis(schritt.urteile);
        }
        if (!r.fertig) {
            letzte = Object.assign(vorher, { id: null });
            melde(L.STUFEN_NAME[schritt.fall.stufen[schritt.urteile.length - 1].art] + ': richtig', true);
            schritt.offen = false;
            zeichneKarte(false);
            return;
        }
        const jetzt = new Date(), k = schritt.karte, alt = staende.get(k.id) || null;
        const stand = L.bewerte(FSRS, plan, k.id, alt, r.geloest, jetzt);
        const bewertung = { id: kennung(), card_id: k.id, reviewed_at: jetzt.toISOString(), geloest: r.geloest,
            fall: schritt.fall ? schritt.fall.name : null, rote_stufe: r.roteStufe, pruef_hash: k.pruef_hash };
        letzte = Object.assign(vorher, { id: bewertung.id, alt, karteId: k.id });
        staende.set(k.id, stand);
        bewertungen.push(bewertung);
        gemacht.push(bewertung);
        const sicher = speicher.bewertung(bewertung, stand);
        const wann = new Date(stand.due).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
        melde((r.geloest ? 'Gelöst' : 'Nicht gelöst') + (schritt.fall ? '' : thema(k) ? ' · ' + thema(k) : '') + ' · wieder ' + wann +
              (sicher ? '' : ' · Achtung: nur im Arbeitsspeicher'), true);
        if (schritt.fall) { schritt.ende = true; zeichneKarte(false); }
        else { stelle++; naechste(); }
    }

    function kennung() {
        if (crypto.randomUUID) return crypto.randomUUID();
        const b = crypto.getRandomValues(new Uint8Array(16));   // ohne https (Test im Heimnetz) gibt es randomUUID nicht
        b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
        const x = Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
        return x.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    }

    function nimmZurueck() {
        if (!letzte) return;
        if (letzte.id) {
            if (!speicher.nimmZurueck(letzte.id)) { melde('Schon gespeichert, lässt sich nicht mehr zurücknehmen.', false); letzte = null; return; }
            if (letzte.alt) staende.set(letzte.karteId, letzte.alt); else staende.delete(letzte.karteId);
            const weg = b => b.id !== letzte.id;
            bewertungen = bewertungen.filter(weg);
            gemacht = gemacht.filter(weg);
        }
        stelle = letzte.stelle;
        schritt = letzte.schritt;
        letzte = null;
        verstecke();
        zeige('karte');
        zeichneKarte(false);
    }

    // „?“: passt nicht. Wird diesmal nicht bewertet und kommt später wieder.
    $('frageKnopf').addEventListener('click', ev => {
        ev.stopPropagation();
        if (!schritt || schritt.ende) return;
        speicher.frage({ id: kennung(), card_id: schritt.karte.id });
        reihe.splice(stelle, 1);
        letzte = null;
        melde('Markiert. Begründen kannst du es am PC.', false);
        naechste();
    });

    function zeichneFertig() {
        const gut = gemacht.filter(b => b.geloest).length;
        const hakt = {};
        for (const b of gemacht) if (b.rote_stufe) hakt[b.rote_stufe] = (hakt[b.rote_stufe] || 0) + 1;
        const stufen = L.STUFEN.filter(s => hakt[s]).map(s => L.STUFEN_NAME[s] + ' ' + hakt[s] + '×').join(', ');
        $('fertigText').textContent = gemacht.length ? gut + ' von ' + gemacht.length + ' gelöst.' : 'Keine Karte bewertet.';
        $('fertigStufen').textContent = stufen ? 'Gehakt hat es bei: ' + stufen + '.' : '';
        schritt = null;
        zeige('fertig');
        zeigeExtra('extraFertig', !sitzung().reihe.length);
        zeichneStand();
    }

    $('zeigen').addEventListener('click', deckAuf);
    $('gut').addEventListener('click', () => urteile(true));
    $('schlecht').addEventListener('click', () => urteile(false));
    $('weiter').addEventListener('click', () => { if (schritt && schritt.ende) { stelle++; letzte = null; verstecke(); naechste(); } });

    // ---------- Notizen ----------
    // Kopf frei machen: ein Gedanke zur Karte (mit Fall und Stufe) oder ganz frei. Am PC wird er ausgewertet.
    let notizFuer = null, entwurf = { schluessel: null, text: '' };
    function oeffneNotiz(mitKarte) {
        const s = mitKarte && schritt;
        notizFuer = s ? {
            card_id: s.karte.id,
            fall: s.fall ? s.fall.name : null,
            stufe: s.fall && !s.ende ? s.fall.stufen[Math.min(s.urteile.length, s.fall.stufen.length - 1)].art : null
        } : { card_id: null, fall: null, stufe: null };
        const schluessel = JSON.stringify(notizFuer);
        $('notizBezug').textContent = !s ? 'Ohne Kartenbezug.'
            : s.fall ? 'Zu dieser Fallkarte · ' + s.fall.name + (notizFuer.stufe ? ' · ' + L.STUFEN_NAME[notizFuer.stufe] : '') : 'Zu dieser Karte.';
        $('notizText').value = entwurf.schluessel === schluessel ? entwurf.text : '';
        entwurf = { schluessel, text: '' };
        $('notizDialog').returnValue = '';
        $('notizDialog').showModal();
        $('notizText').focus();
    }
    $('notizDialog').addEventListener('close', () => {
        const text = $('notizText').value.trim();
        if ($('notizDialog').returnValue !== 'sichern') {
            entwurf.text = text;                       // „Später“ oder Zurück: nichts geht verloren
            return;
        }
        if (!text || !speicher) return;
        const sicher = speicher.notiz(Object.assign({ id: kennung(), text, created_at: new Date().toISOString() }, notizFuer));
        entwurf = { schluessel: null, text: '' };
        melde('Notiz gespeichert' + (sicher ? '.' : ' · Achtung: nur im Arbeitsspeicher'), false);
    });
    $('notizKnopf').addEventListener('click', ev => { ev.stopPropagation(); oeffneNotiz(true); });
    $('notizFrei').addEventListener('click', () => oeffneNotiz(false));

    // ---------- Meldung ----------
    function melde(text, mitZurueck) {
        clearTimeout(meldungZeit);
        $('meldungText').textContent = text;
        $('rueckgaengig').hidden = !mitZurueck;
        $('meldung').hidden = false;
        meldungZeit = setTimeout(verstecke, mitZurueck ? speicher.WARTEN - 300 : 3500);
    }
    function verstecke() { clearTimeout(meldungZeit); $('meldung').hidden = true; }
    $('rueckgaengig').addEventListener('click', nimmZurueck);

    // ---------- Wischen und Antippen ----------
    const blatt = $('blatt');
    const WEIT = 90;
    let zug = null;
    let gezogen = false;
    blatt.addEventListener('pointerdown', ev => {
        gezogen = false;
        if (!ev.isPrimary || ev.button !== 0) return;
        zug = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, dx: 0, an: false };
    });
    blatt.addEventListener('pointermove', ev => {
        if (!zug || ev.pointerId !== zug.id) return;
        zug.dx = ev.clientX - zug.x;
        const dy = ev.clientY - zug.y;
        if (!zug.an) {
            if (Math.abs(zug.dx) < 12 || Math.abs(zug.dx) < Math.abs(dy) * 1.3) return;
            if (!schritt || !schritt.offen || schritt.ende) { zug = null; return; }
            zug.an = gezogen = true;
            blatt.setPointerCapture(ev.pointerId);
        }
        blatt.style.transform = 'translateX(' + zug.dx + 'px) rotate(' + zug.dx / 40 + 'deg)';
        blatt.dataset.neigung = zug.dx > WEIT ? 'gut' : zug.dx < -WEIT ? 'schlecht' : '';
    });
    function loslassen(ev, abgebrochen) {
        if (!zug || ev.pointerId !== zug.id) return;
        const z = zug; zug = null;
        blatt.style.transform = ''; blatt.dataset.neigung = '';
        if (z.an && !abgebrochen && Math.abs(z.dx) > WEIT) urteile(z.dx > 0);
    }
    blatt.addEventListener('pointerup', ev => loslassen(ev, false));
    blatt.addEventListener('pointercancel', ev => loslassen(ev, true));
    blatt.addEventListener('click', () => { if (!gezogen) deckAuf(); });

    // Am PC: Leertaste deckt auf, Pfeile bewerten
    document.addEventListener('keydown', ev => {
        if (sicht !== 'karte' || $('notizDialog').open || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        if (ev.target.closest('button') && (ev.key === ' ' || ev.key === 'Enter')) return;
        if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); if (schritt && schritt.ende) $('weiter').click(); else deckAuf(); }
        else if (ev.key === 'ArrowRight') urteile(true);
        else if (ev.key === 'ArrowLeft') urteile(false);
    });

    // ---------- Einstieg ----------
    addEventListener('online', () => speicher && speicher.spuele());
    document.addEventListener('visibilitychange', () => {
        if (document.hidden || !speicher) return;
        speicher.spuele();
        zeichne();                                     // neuer Tag, neue Zahlen
    });
    zeige('laden');
    if (DEMO) beginne('demo');
    else db.auth.onAuthStateChange((_e, s) => {
        // Nicht direkt in diesem Rückruf abfragen: supabase-js hält dabei seine Sitzungssperre
        setTimeout(() => { if (s) beginne(s.user.id); else ende(); }, 0);
    });
})();
