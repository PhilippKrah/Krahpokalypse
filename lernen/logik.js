// Lernlogik ohne Oberfläche und ohne Datenbank.
// Läuft im Browser (window.Lern) und in Node (require), damit sie sich testen lässt.
// Die Planung selbst rechnet ts-fsrs, es wird von außen hereingereicht.
(function (wurzel, fabrik) {
    if (typeof module === 'object' && module.exports) module.exports = fabrik();
    else wurzel.Lern = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STUFEN = ['beobachten', 'hypothese', 'intervention'];
    const STUFEN_NAME = { beobachten: 'Beobachten', hypothese: 'Hypothese', intervention: 'Intervention' };
    const STUFEN_FRAGE = {
        beobachten: 'Was fällt dir auf?',
        hypothese: 'Was steckt dahinter, welche Art Intervention passt?',
        intervention: 'Welchen Satz sagst du?'
    };

    // Kalendertag in Ortszeit. toISOString() wäre UTC und macht abends aus heute morgen.
    function tag(d) {
        const x = new Date(d);
        return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    }

    // Geplant wird auf Tage genau: Was irgendwann heute fällig wird, ist heute dran.
    function istFaellig(stand, jetzt) {
        return tag(stand.due) <= tag(jetzt);
    }

    function mische(liste, zufall) {
        const a = liste.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(zufall() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function themaVon(karte) {
        return (karte.themen && karte.themen[0] && karte.themen[0].id) || '';
    }

    // Themen mischen: zufällig, aber möglichst nie zweimal dasselbe Thema hintereinander.
    function mischeThemen(karten, zufall) {
        const rest = mische(karten, zufall);
        const aus = [];
        while (rest.length) {
            const vorher = aus.length ? themaVon(aus[aus.length - 1]) : null;
            let i = rest.findIndex(k => themaVon(k) !== vorher);
            if (i < 0) i = 0;
            aus.push(rest.splice(i, 1)[0]);
        }
        return aus;
    }

    // Karten, deren allererste Bewertung heute war. Sie zählen gegen das Tageslimit.
    function neuHeute(bewertungen, jetzt) {
        const erste = new Map();
        for (const b of bewertungen) {
            const t = new Date(b.reviewed_at).getTime();
            if (!erste.has(b.card_id) || t < erste.get(b.card_id)) erste.set(b.card_id, t);
        }
        let n = 0;
        for (const t of erste.values()) if (tag(t) === tag(jetzt)) n++;
        return n;
    }

    // staende: Map card_id -> Zeile aus card_state
    function baueSitzung({ karten, staende, bewertungen, jetzt, limit, zufall = Math.random }) {
        const aktiv = karten.filter(k => k.status === 'aktiv');
        const faellig = aktiv.filter(k => staende.has(k.id) && istFaellig(staende.get(k.id), jetzt));
        const unbekannt = aktiv.filter(k => !staende.has(k.id));
        const frei = Math.max(0, limit - neuHeute(bewertungen, jetzt));
        const neu = mischeThemen(unbekannt, zufall).slice(0, frei);
        return { faellig: faellig.length, neu: neu.length, wartend: unbekannt.length - neu.length,
                 reihe: mischeThemen(faellig.concat(neu), zufall) };
    }

    // Der Fall, der am längsten nicht dran war. Nie gesehen zählt als am längsten her.
    // Beim ersten Mal kommt kein Gegenfall, sonst gäbe es nichts zu unterscheiden.
    // Bei Gleichstand entscheidet der Zufall, damit die Reihenfolge nichts verrät.
    function waehleFall(karte, bewertungen, zufall = Math.random) {
        const faelle = karte.faelle || [];
        if (!faelle.length) return null;
        const zuletzt = new Map();
        let gesehen = false;
        for (const b of bewertungen) {
            if (b.card_id !== karte.id || !b.fall) continue;
            gesehen = true;
            const t = new Date(b.reviewed_at).getTime();
            if (!zuletzt.has(b.fall) || t > zuletzt.get(b.fall)) zuletzt.set(b.fall, t);
        }
        let wahl = faelle;
        if (!gesehen) {
            const ohne = faelle.filter(f => !f.gegen);
            if (ohne.length) wahl = ohne;
        }
        const alter = f => zuletzt.has(f.name) ? zuletzt.get(f.name) : -Infinity;
        const min = Math.min(...wahl.map(alter));
        const kandidaten = wahl.filter(f => alter(f) === min);
        return kandidaten[Math.floor(zufall() * kandidaten.length)];
    }

    // Zeile aus card_state -> Karte für ts-fsrs
    function ausZeile(z) {
        return {
            due: new Date(z.due), stability: z.stability, difficulty: z.difficulty, elapsed_days: 0,
            scheduled_days: z.scheduled_days, learning_steps: z.learning_steps, reps: z.reps, lapses: z.lapses,
            state: z.state, last_review: z.last_review ? new Date(z.last_review) : undefined
        };
    }

    function zuZeile(id, k) {
        return {
            card_id: id, due: new Date(k.due).toISOString(), stability: k.stability, difficulty: k.difficulty,
            scheduled_days: k.scheduled_days, learning_steps: k.learning_steps || 0, reps: k.reps, lapses: k.lapses,
            state: k.state, last_review: k.last_review ? new Date(k.last_review).toISOString() : null
        };
    }

    // Längster Abstand zwischen zwei Wiederholungen. Ohne Grenze käme eine Karte, die dreimal saß,
    // erst nach über einem halben Jahr wieder, also nach dem Kursende (Entscheidung vom 23.11.2026).
    const MAX_TAGE = 30;
    const TAG_MS = 86400000;

    // Planer aus ts-fsrs. Keine Minuten-Schritte: Eine Karte kommt höchstens einmal am Tag.
    function planer(FSRS) {
        return FSRS.fsrs(FSRS.generatorParameters({ request_retention: 0.9, enable_fuzz: true, enable_short_term: false, maximum_interval: MAX_TAGE }));
    }

    // Zwei Stufen: gelöst = Good, nicht gelöst = Again.
    // ts-fsrs streut auch über die Grenze hinaus (bis 31 Tage), deshalb wird hier noch einmal gekappt.
    function bewerte(FSRS, plan, karteId, zeile, geloest, jetzt) {
        const vorher = zeile ? ausZeile(zeile) : FSRS.createEmptyCard(jetzt);
        const k = plan.next(vorher, jetzt, geloest ? FSRS.Rating.Good : FSRS.Rating.Again).card;
        const spaetestens = new Date(jetzt).getTime() + MAX_TAGE * TAG_MS;
        if (new Date(k.due).getTime() > spaetestens) { k.due = new Date(spaetestens); k.scheduled_days = MAX_TAGE; }
        return zuZeile(karteId, k);
    }

    // Vorziehen, wenn für heute alles erledigt ist und noch Lust auf mehr da ist:
    // die Karten, die am ehesten vergessen sind (kleinste Abrufwahrscheinlichkeit). Nicht dabei:
    // neue Karten (dafür gibt es das Tageslimit), heute fällige und heute schon bewertete.
    // abruf(zeile, jetzt) -> Zahl zwischen 0 und 1, kommt vom Planer.
    function vorziehen({ karten, staende, bewertungen, jetzt, anzahl, abruf, zufall = Math.random }) {
        const heute = tag(jetzt);
        const schonHeute = new Set(bewertungen.filter(b => tag(b.reviewed_at) === heute).map(b => b.card_id));
        const kandidaten = karten
            .filter(k => k.status === 'aktiv' && staende.has(k.id) && !istFaellig(staende.get(k.id), jetzt) && !schonHeute.has(k.id))
            .map(k => ({ k, r: abruf(staende.get(k.id), jetzt), z: zufall() }))
            .sort((a, b) => a.r - b.r || a.z - b.z);
        return { moeglich: kandidaten.length, reihe: mischeThemen(kandidaten.slice(0, anzahl).map(x => x.k), zufall) };
    }

    // Ablauf einer Fallkarte: urteile = [true, true, false] in der Reihenfolge der Stufen
    function fallErgebnis(urteile) {
        const i = urteile.indexOf(false);
        if (i >= 0) return { fertig: true, geloest: false, roteStufe: STUFEN[i] };
        return { fertig: urteile.length === STUFEN.length, geloest: urteile.length === STUFEN.length, roteStufe: null };
    }

    // Verweise ohne Klammern, Fettdruck, Listen, Absätze. Alles andere bleibt Text.
    function escapeHtml(t) {
        return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }

    function zeile(t) {
        return escapeHtml(t)
            .replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    function html(text) {
        const bloecke = [];
        let liste = null, absatz = null;
        for (const roh of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
            const m = roh.match(/^\s*- (.*)$/);
            if (m) {
                absatz = null;
                if (!liste) bloecke.push({ liste: liste = [] });
                liste.push(zeile(m[1]));
            } else if (!roh.trim()) {
                liste = null; absatz = null;
            } else {
                liste = null;
                if (!absatz) bloecke.push({ absatz: absatz = [] });
                absatz.push(zeile(roh));
            }
        }
        return bloecke.map(b => b.liste ? '<ul>' + b.liste.map(x => '<li>' + x + '</li>').join('') + '</ul>'
                                        : '<p>' + b.absatz.join('<br>') + '</p>').join('');
    }

    return { STUFEN, STUFEN_NAME, STUFEN_FRAGE, tag, istFaellig, mischeThemen, neuHeute, baueSitzung, waehleFall,
             ausZeile, zuZeile, MAX_TAGE, planer, bewerte, vorziehen, fallErgebnis, escapeHtml, html };
});
