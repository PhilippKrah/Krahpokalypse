// Aufruf aus dem Repo: node --test "lernen/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logik.js');

const jetzt = new Date(2026, 10, 23, 20, 30);
const tageVor = n => new Date(jetzt.getTime() - n * 86400000).toISOString();
const karte = (id, thema, mehr) => Object.assign({ id, status: 'aktiv', typ: 'wissen', themen: [{ id: thema }] }, mehr);
const stand = due => ({ due: due.toISOString() });

test('Tag in Ortszeit, auch spät abends', () => {
    assert.equal(L.tag(new Date(2026, 10, 23, 23, 59)), '2026-11-23');
    assert.equal(L.tag(new Date(2026, 10, 24, 0, 1)), '2026-11-24');
});

test('Fällig ist, was heute noch fällig wird, nicht was morgen kommt', () => {
    assert.ok(L.istFaellig(stand(new Date(2026, 10, 23, 23, 50)), jetzt));
    assert.ok(!L.istFaellig(stand(new Date(2026, 10, 24, 0, 5)), jetzt));
});

test('Tageslimit zählt nur Karten, die heute zum ersten Mal dran waren', () => {
    const b = [{ card_id: 'a', reviewed_at: tageVor(3) }, { card_id: 'a', reviewed_at: tageVor(0) }, { card_id: 'b', reviewed_at: tageVor(0) }];
    assert.equal(L.neuHeute(b, jetzt), 1);
    const karten = ['c', 'd', 'e', 'f'].map(x => karte(x, x));
    const s = L.baueSitzung({ karten, staende: new Map(), bewertungen: b, jetzt, limit: 3 });
    assert.equal(s.neu, 2);
    assert.equal(s.wartend, 2);
});

test('Ruhende Karten und nicht fällige Karten kommen nicht', () => {
    const karten = [karte('a', 'x'), karte('b', 'x', { status: 'ruhend' }), karte('c', 'x')];
    const staende = new Map([['a', stand(new Date(2026, 10, 23))], ['b', stand(new Date(2026, 10, 20))], ['c', stand(new Date(2026, 10, 30))]]);
    const s = L.baueSitzung({ karten, staende, bewertungen: [], jetzt, limit: 0 });
    assert.deepEqual(s.reihe.map(k => k.id), ['a']);
});

test('Über dem Limit bleibt das Limit 0, es wird nie negativ', () => {
    const b = ['a', 'b', 'c'].map(x => ({ card_id: x, reviewed_at: tageVor(0) }));
    const s = L.baueSitzung({ karten: [karte('z', 'z')], staende: new Map(), bewertungen: b, jetzt, limit: 2 });
    assert.equal(s.neu, 0);
});

test('Gleiches Thema steht nicht hintereinander, wenn es anders geht', () => {
    const karten = ['a', 'a', 'b', 'b', 'c', 'c'].map((t, i) => karte('k' + i, t));
    for (let n = 0; n < 200; n++) {
        const r = L.mischeThemen(karten, Math.random);
        assert.equal(r.length, 6);
        assert.equal(new Set(r.map(k => k.id)).size, 6);
        assert.notEqual(r[0].themen[0].id, r[1].themen[0].id);
    }
});

const fk = { id: 'f', faelle: [{ name: 'Fall 1' }, { name: 'Fall 2' }, { name: 'Fall 3' }, { name: 'Gegenfall 1', gegen: true }] };

test('Erstes Mal nie ein Gegenfall', () => {
    for (let n = 0; n < 200; n++) assert.ok(!L.waehleFall(fk, []).gegen);
});

test('Danach der Fall, der am längsten nicht dran war, nie gesehene zuerst', () => {
    const b = [['Fall 1', 9], ['Fall 2', 5], ['Fall 3', 2]].map(([fall, n]) => ({ card_id: 'f', fall, reviewed_at: tageVor(n) }));
    assert.equal(L.waehleFall(fk, b).name, 'Gegenfall 1');
    b.push({ card_id: 'f', fall: 'Gegenfall 1', reviewed_at: tageVor(1) });
    assert.equal(L.waehleFall(fk, b).name, 'Fall 1');
    b.push({ card_id: 'f', fall: 'Fall 1', reviewed_at: tageVor(0) });
    assert.equal(L.waehleFall(fk, b).name, 'Fall 2');
});

test('Vier Durchgänge zeigen vier verschiedene Fälle', () => {
    for (let n = 0; n < 100; n++) {
        const b = [];
        for (let i = 0; i < 4; i++) b.push({ card_id: 'f', fall: L.waehleFall(fk, b).name, reviewed_at: tageVor(10 - i) });
        assert.equal(new Set(b.map(x => x.fall)).size, 4);
    }
});

test('Bewertungen anderer Karten beeinflussen die Fallwahl nicht', () => {
    assert.ok(!L.waehleFall(fk, [{ card_id: 'anders', fall: 'Fall 1', reviewed_at: tageVor(1) }]).gegen);
});

test('Fallkarte: gelöst nur mit drei grünen Stufen, sonst zählt die erste rote', () => {
    assert.deepEqual(L.fallErgebnis([true]), { fertig: false, geloest: false, roteStufe: null });
    assert.deepEqual(L.fallErgebnis([true, true, true]), { fertig: true, geloest: true, roteStufe: null });
    assert.deepEqual(L.fallErgebnis([true, false]), { fertig: true, geloest: false, roteStufe: 'hypothese' });
    assert.deepEqual(L.fallErgebnis([false]), { fertig: true, geloest: false, roteStufe: 'beobachten' });
});

test('Zeile und FSRS-Karte lassen sich hin und zurück wandeln', () => {
    const z = { card_id: 'a', due: tageVor(1), stability: 3.2, difficulty: 5.1, scheduled_days: 4, learning_steps: 0, reps: 2, lapses: 1, state: 2, last_review: tageVor(5) };
    assert.deepEqual(L.zuZeile('a', L.ausZeile(z)), z);
    assert.equal(L.zuZeile('a', L.ausZeile(Object.assign({}, z, { last_review: null }))).last_review, null);
});

test('Text: Verweise, Fett, Listen, und nichts wird als HTML ausgeführt', () => {
    assert.equal(L.html('**Fett** und [[Notiz]] und [[Pfad|Name]]'), '<p><strong>Fett</strong> und Notiz und Name</p>');
    assert.equal(L.html('a\nb\n\n- x\n- y\nz'), '<p>a<br>b</p><ul><li>x</li><li>y</li></ul><p>z</p>');
    assert.equal(L.html('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    assert.equal(L.html(null), '');
});

test('Vorziehen: die wackligsten zuerst, ohne neue, fällige und heute schon bewertete', () => {
    const karten = ['neu', 'faellig', 'heute', 'fest', 'wacklig', 'mittel', 'ruht'].map(x => karte(x, x));
    karten[6].status = 'ruhend';
    const morgen = new Date(2026, 10, 24, 9);
    const staende = new Map([['faellig', stand(jetzt)], ['heute', stand(morgen)], ['fest', stand(morgen)],
        ['wacklig', stand(morgen)], ['mittel', stand(morgen)], ['ruht', stand(morgen)]]);
    const abruf = { heute: 0.1, fest: 0.95, wacklig: 0.5, mittel: 0.8, ruht: 0.1 };
    const bewertungen = [{ card_id: 'heute', reviewed_at: new Date(2026, 10, 23, 8).toISOString() },
        { card_id: 'fest', reviewed_at: tageVor(1) }];
    const s = L.vorziehen({ karten, staende, bewertungen, jetzt, anzahl: 2, abruf: z => abruf[[...staende].find(([, v]) => v === z)[0]] });
    assert.equal(s.moeglich, 3);
    assert.deepEqual(s.reihe.map(k => k.id).sort(), ['mittel', 'wacklig']);
});

test('Höchstens 30 Tage bis zur nächsten Wiederholung, auch mit Streuung', () => {
    const jetztFix = new Date(2026, 10, 23, 12);
    const weit = { card: { due: new Date(2027, 2, 1), stability: 200, difficulty: 5, scheduled_days: 98, learning_steps: 0, reps: 5, lapses: 0, state: 2 } };
    const FSRS = { Rating: { Good: 3, Again: 1 }, createEmptyCard: () => ({}) };
    const z = L.bewerte(FSRS, { next: () => weit }, 'k', null, true, jetztFix);
    assert.equal(z.scheduled_days, 30);
    assert.equal(L.tag(z.due), '2026-12-23');
    const nah = { card: Object.assign({}, weit.card, { due: new Date(2026, 10, 30), scheduled_days: 7 }) };
    assert.equal(L.bewerte(FSRS, { next: () => nah }, 'k', null, true, jetztFix).scheduled_days, 7);
});
