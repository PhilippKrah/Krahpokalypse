// Probemodus (?demo): läuft ohne Anmeldung und ohne Datenbank, nichts wird gespeichert.
// Bewusst mit Allerweltsinhalten. Das Repo ist öffentlich, echte Karten gehören nicht hierher.
(function () {
    'use strict';
    const stufe = (art, antwort, pruefpunkte, auch) => ({ art, antwort, pruefpunkte, auch: auch || null });
    const fall = (name, gegen, lage, b, h, i) => ({ name, gegen, lage, stufen: [
        stufe('beobachten', b, ['Das Wichtigste ist genannt.']),
        stufe('hypothese', h, ['Eine Ursache ist genannt.', 'Sie passt zur Beobachtung.']),
        stufe('intervention', i, ['Ein konkreter Schritt.'], 'Jemanden fragen, der sich auskennt.')] });
    const karten = [
        { id: 'd1', typ: 'wissen', status: 'aktiv', themen: [{ id: 'geo', name: 'Geografie', module: [1] }], frage: 'Wie heißt die Hauptstadt von Australien?', antwort: 'Canberra', warum: '**Warum diese Frage:** Viele sagen Sydney.\n\n- Sydney ist die größte Stadt.\n- Canberra wurde als Hauptstadt geplant.', pruef_hash: 'd' },
        { id: 'd2', typ: 'wissen', status: 'aktiv', themen: [{ id: 'kueche', name: 'Küche', module: [1] }], frage: 'Wie lange kocht ein weiches Ei?', antwort: 'Etwa fünf bis sechs Minuten.', warum: null, pruef_hash: 'd' },
        { id: 'd3', typ: 'fall', status: 'aktiv', themen: [{ id: 'rad', name: 'Fahrrad', module: [2] }], prinzip: 'Erst prüfen, dann tauschen', prinzip_text: 'Ich suche die Ursache, bevor ich ein Teil ersetze.', pruef_hash: 'd', faelle: [
            fall('Fall 1', false, 'Das Vorderrad ist morgens platt, abends war es noch voll.', 'Der Druck geht langsam verloren.', 'Ein kleines Loch oder ein undichtes Ventil.', '„Ich halte den Schlauch ins Wasser und suche Blasen.“'),
            fall('Fall 2', false, 'Beim Bremsen quietscht es laut, aber nur bei Regen.', 'Geräusch nur bei Nässe.', 'Wasser und Schmutz auf der Felge.', '„Ich reinige zuerst Felge und Beläge.“'),
            fall('Gegenfall 1', true, 'Der Reifen hat einen fünf Zentimeter langen Riss, man sieht den Schlauch.', 'Der Schaden ist sichtbar.', 'Hier gibt es nichts zu suchen.', '„Ich tausche den Reifen sofort.“')] }
    ];
    window.DemoSpeicher = function () {
        const staende = new Map(), bewertungen = [];
        return {
            WARTEN: 6000,
            laden: async () => ({ karten, staende: new Map(staende), bewertungen: bewertungen.slice() }),
            spuele() {},
            bewertung(b, s) { bewertungen.push(b); staende.set(s.card_id, s); return true; },
            frage() { return true; },
            notiz() { return true; },
            nimmZurueck(id) {
                const i = bewertungen.findIndex(b => b.id === id);
                if (i < 0) return false;
                const [b] = bewertungen.splice(i, 1);
                staende.delete(b.card_id);
                return true;
            },
            offen: () => 0, defekt: () => 0, fehler: () => null, schliesse() {}
        };
    };
})();
