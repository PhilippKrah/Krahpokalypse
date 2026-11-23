// Aufruf aus dem Repo: node --test "lernen/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');

const lager = new Map();
global.window = {};
global.localStorage = { getItem: k => lager.has(k) ? lager.get(k) : null, setItem: (k, v) => lager.set(k, v) };
require('../speicher.js');

// Nachbau der wenigen supabase-Aufrufe, die speicher.js nutzt
function falscheDb(tabellen, fehler) {
    const gesendet = [];
    return { gesendet, from: t => ({
        upsert: async (z, o) => { const f = fehler(t); if (f) return { error: f }; gesendet.push([t, z, o]); return { error: null }; },
        select() { return this; }, eq() { return this; }, order() { return this; },
        range: async (a, b) => ({ data: (tabellen[t] || []).slice(a, b + 1), error: null })
    }) };
}
const B = (id, karte = 'k') => [{ id, card_id: karte, geloest: true }, { card_id: karte, due: 'x' }];
const tick = () => new Promise(r => setImmediate(r));
console.error = () => {};

test('Seitenweise: auch Zeile 1001 kommt an', async () => {
    const db = falscheDb({ card_reviews: Array.from({ length: 2300 }, (_, i) => ({ id: 'r' + i })) }, () => null);
    const d = await window.Speicher(db, 'u0', () => {}).laden();
    assert.equal(d.bewertungen.length, 2300);
});

test('Wartet mit dem Senden, lässt sich zurücknehmen, überlebt den Neustart', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
    const db = falscheDb({}, () => null);
    const s = window.Speicher(db, 'u1', () => {});
    s.bewertung(...B('a'));
    s.bewertung(...B('b', 'k2'));
    assert.equal(db.gesendet.length, 0);
    assert.equal(s.nimmZurueck('a'), true);
    assert.equal(s.nimmZurueck('a'), false);
    s.schliesse();
    const neu = window.Speicher(db, 'u1', () => {});
    const d = await neu.laden();
    assert.deepEqual(d.bewertungen.map(x => x.id), ['b']);
    assert.equal(d.staende.get('k2').due, 'x');
    t.mock.timers.tick(7000);
    neu.spuele();
    for (let i = 0; i < 10; i++) await tick();
    assert.deepEqual(db.gesendet.map(x => x[0]), ['card_reviews', 'card_state']);
    assert.equal(db.gesendet[0][2].ignoreDuplicates, true);
    assert.equal(neu.offen(), 0);
    assert.equal(neu.nimmZurueck('b'), false);
    assert.equal(lager.get('lernen.korb.u1'), '[]');
});

test('Ohne Netz bleibt alles liegen, mit Netz geht es der Reihe nach raus', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
    let netz = false;
    const db = falscheDb({}, () => netz ? null : { message: 'Failed to fetch' });
    const s = window.Speicher(db, 'u2', () => {});
    s.bewertung(...B('a')); s.bewertung(...B('b', 'k2'));
    t.mock.timers.tick(7000);
    for (let i = 0; i < 10; i++) await tick();
    assert.equal(s.offen(), 2);
    assert.ok(s.fehler());
    netz = true;
    t.mock.timers.tick(21000);
    for (let i = 0; i < 20; i++) await tick();
    assert.equal(s.offen(), 0);
    assert.equal(s.fehler(), null);
    assert.deepEqual(db.gesendet.filter(x => x[0] === 'card_reviews').map(x => x[1].id), ['a', 'b']);
});

test('Ein unrettbarer Eintrag blockiert die anderen nicht und geht nicht verloren', async () => {
    const db = falscheDb({}, t => t === 'card_flags' ? { code: '23503', message: 'Karte fehlt' } : null);
    const s = window.Speicher(db, 'u3', () => {});
    s.frage({ id: 'f', card_id: 'weg' });
    for (let i = 0; i < 10; i++) await tick();
    assert.equal(s.offen(), 0);
    assert.equal(s.defekt(), 1);
    assert.match(lager.get('lernen.defekt.u3'), /Karte fehlt/);
});

test('Notizen gehen sofort und nur einmal in card_notes', async () => {
    const db = falscheDb({}, () => null);
    const s = window.Speicher(db, 'u4', () => {});
    s.notiz({ id: 'n1', card_id: null, fall: null, stufe: null, text: 'frei', created_at: 'x' });
    s.notiz({ id: 'n2', card_id: 'k', fall: 'Fall 1', stufe: 'hypothese', text: 'zur Karte', created_at: 'x' });
    for (let i = 0; i < 10; i++) await tick();
    assert.deepEqual(db.gesendet.map(x => [x[0], x[1].id, x[2].ignoreDuplicates]), [['card_notes', 'n1', true], ['card_notes', 'n2', true]]);
    assert.equal(s.offen(), 0);
});
