// Zugriff auf die Datenbank, mit Ausgangskorb für Funklöcher.
// Jede Bewertung landet zuerst im Korb (localStorage, je Konto getrennt) und geht dann hoch.
// Die Kennung der Bewertung entsteht auf dem Gerät: Doppelt gesendet zählt einmal.
(function () {
    'use strict';

    const SEITE = 1000;          // Supabase liefert höchstens 1000 Zeilen je Anfrage
    const WARTEN = 6000;         // so lange lässt sich die letzte Bewertung zurücknehmen

    async function alleZeilen(baue) {
        const aus = [];
        for (let von = 0; ; von += SEITE) {
            const { data, error } = await baue().range(von, von + SEITE - 1);
            if (error) throw error;
            aus.push(...data);
            if (data.length < SEITE) return aus;
        }
    }

    // Fehler, die auch beim nächsten Versuch nicht verschwinden (z. B. Karte gibt es nicht mehr)
    function endgueltig(error) {
        return /^(22|23)/.test(String(error && error.code || ''));
    }

    window.Speicher = function (db, uid, beiAenderung) {
        const KORB = 'lernen.korb.' + uid;
        const DEFEKT = 'lernen.defekt.' + uid;
        let korb = lies(KORB), defekt = lies(DEFEKT), laeuft = false, unterwegs = null, zeit = null, zu = false, fehler = null;

        function lies(k) {
            try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; }
        }
        // Rückgabe: konnte der Korb auf dem Gerät gesichert werden?
        function schreib(k, v) {
            try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
        }

        async function laden() {
            const [karten, staende, bewertungen] = await Promise.all([
                alleZeilen(() => db.from('cards').select('*').eq('user_id', uid).eq('status', 'aktiv').order('id')),
                alleZeilen(() => db.from('card_state').select('*').eq('user_id', uid).order('card_id')),
                alleZeilen(() => db.from('card_reviews').select('id,card_id,reviewed_at,geloest,fall,rote_stufe').eq('user_id', uid).order('reviewed_at').order('id'))
            ]);
            // Was noch im Korb liegt, gilt schon
            const st = new Map(staende.map(z => [z.card_id, z]));
            const ids = new Set(bewertungen.map(b => b.id));
            for (const e of korb) {
                if (e.art !== 'bewertung') continue;
                st.set(e.stand.card_id, e.stand);
                if (!ids.has(e.bewertung.id)) bewertungen.push(e.bewertung);
            }
            return { karten, staende: st, bewertungen };
        }

        async function sende(e) {
            if (e.art === 'notiz') {
                const { error } = await db.from('card_notes').upsert(e.notiz, { onConflict: 'id', ignoreDuplicates: true });
                return error;
            }
            if (e.art === 'frage') {
                const { error } = await db.from('card_flags').upsert(e.frage, { onConflict: 'id', ignoreDuplicates: true });
                return error;
            }
            const a = await db.from('card_reviews').upsert(e.bewertung, { onConflict: 'id', ignoreDuplicates: true });
            if (a.error) return a.error;
            const b = await db.from('card_state').upsert(Object.assign({ user_id: uid }, e.stand), { onConflict: 'user_id,card_id' });
            return b.error;
        }

        async function spuele() {
            if (laeuft || zu) return;
            laeuft = true;
            clearTimeout(zeit);
            let spaeter = null;
            fehler = null;
            while (korb.length && !zu) {
                const e = korb[0];
                const rest = e.ab - Date.now();
                if (rest > 0) { spaeter = rest; break; }
                unterwegs = e;
                let f = null;
                try { f = await sende(e); } catch (x) { f = x; }
                unterwegs = null;
                if (f && !endgueltig(f)) { console.error(f); fehler = f; spaeter = 20000; break; }
                korb.shift();
                if (f) { console.error(f); defekt.push({ eintrag: e, grund: String(f.message || f) }); schreib(DEFEKT, defekt); }
                schreib(KORB, korb);
            }
            laeuft = false;
            if (spaeter !== null && !zu) zeit = setTimeout(spuele, spaeter + 50);
            beiAenderung();
        }

        function merke(e) {
            korb.push(e);
            const sicher = schreib(KORB, korb);
            spuele();
            return sicher;
        }

        return {
            WARTEN, laden, spuele,
            bewertung(bewertung, stand) {
                return merke({ art: 'bewertung', bewertung, stand, ab: Date.now() + WARTEN });
            },
            frage(frage) {
                return merke({ art: 'frage', frage, ab: 0 });
            },
            notiz(notiz) {
                return merke({ art: 'notiz', notiz, ab: 0 });
            },
            // true, wenn die Bewertung noch nicht abgeschickt war und jetzt weg ist
            nimmZurueck(id) {
                const i = korb.findIndex(e => e.art === 'bewertung' && e.bewertung.id === id);
                if (i < 0 || korb[i] === unterwegs || korb[i].ab <= Date.now()) return false;
                korb.splice(i, 1);
                schreib(KORB, korb);
                return true;
            },
            offen: () => korb.length,
            defekt: () => defekt.length,
            fehler: () => fehler,
            schliesse() { zu = true; clearTimeout(zeit); }
        };
    };
})();
