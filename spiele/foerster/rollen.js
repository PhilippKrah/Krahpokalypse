// Rollen & Aufgaben für „01 – Der Gutsverwalter“.
// Bearbeiten: tools/rollen-editor.html öffnen (oder diese Datei von Hand ändern), danach das Spiel neu laden.
// personen: tempo = Arbeitstempo in Prozent (100 = Normtempo; 80 = braucht für dieselbe Arbeit 25 % länger; guter Küche +10 Prozentpunkte).
//            Arbeitsminuten = Kosten (CFG.cost, Arbeitspunkte) × CFG.zeit.punktNorm × Effektivitätsfaktor ÷ Tempo.
//            abWoche = ab welcher Woche die Person auf dem Gut ist (Woche 1 beginnt mit einem Sonntag).
//            (Alte Dateien mit pensum/abTag laufen weiter: pensum × 10 = tempo, abTag ersatzweise für abWoche.)
//            Figur (Demo B2b; jedes Feld mit Rückfall: alles / keine / 5 / zuhause):
//            mitteil = was die Person am Sonntag erzählt: alles (von sich aus alles) · nachfrage (nur über „Nachfragen“) · luecke (nur die neuesten zahl Dinge, Lieblingsthema zuerst) · laune (alles, aber nur bei guter Laune aus dem Zustand).
//            zahl = bei luecke: wie viele Dinge. gedaechtnis = wie viele Beobachtungen sie bis zum Erzählen behält (ältere verblassen).
//            lieblings = Arten, die sie aus größerer Entfernung bemerkt (baumtot, baumliegt, hasenbau, fuchsbau, spur, beeren, loch).
//            sonntag = wo sie am Sonntag steht: bach · kueche · holz · garten · zuhause.
// aufgaben: je Person die Effektivität in Prozent (100 = normal, 50 = braucht doppelt so lange, Faktor ×2).
//           Fehlt eine Person, darf sie die Aufgabe nicht.
//           fest = feste Aufgabe (läuft als feste Zeitspanne mit eigenem Zeitpunkt, z. B. Füttern, Kochen, Einsperren, Markt; Effektivität ohne Wirkung).
//           ueblich = wer eine feste Aufgabe macht, solange niemand anderes eingeteilt ist (null = niemand).
//           nurJung = diese Personen fällen nur Jungbäume (Höhe bis 3).
window.ROLLEN = {
  "personen": {
    "hannes": {"name": "Hannes", "rolle": "Knecht", "abWoche": 1, "tempo": 100, "mitteil": "alles", "gedaechtnis": 5, "lieblings": ["spur", "hasenbau", "fuchsbau"], "sonntag": "bach"},
    "jost": {"name": "Jost", "rolle": "Holzfäller", "abWoche": 2, "tempo": 100, "mitteil": "laune", "gedaechtnis": 5, "lieblings": ["baumtot", "baumliegt"], "sonntag": "holz"},
    "grete": {"name": "Grete", "rolle": "Bäuerin", "abWoche": 1, "tempo": 80, "mitteil": "nachfrage", "gedaechtnis": 5, "lieblings": ["spur", "loch"], "sonntag": "kueche"},
    "liese": {"name": "Liese", "rolle": "Magd", "abWoche": 1, "tempo": 80, "mitteil": "luecke", "zahl": 3, "gedaechtnis": 5, "lieblings": ["beeren", "loch"], "sonntag": "garten"}
  },
  "aufgaben": {
    "maehen": {"name": "Wiese mähen", "personen": {"hannes": 100, "grete": 77}},
    "einholen": {"name": "Heu & Holz einholen", "personen": {"hannes": 100, "grete": 71, "jost": 63}},
    "flicken": {"name": "Zaun flicken", "personen": {"hannes": 100, "jost": 77}},
    "setzlinge": {"name": "Jungpflanzen ziehen", "personen": {"hannes": 80, "grete": 83, "jost": 100}},
    "loecher": {"name": "Löcher zuschütten", "personen": {"hannes": 100, "grete": 67, "jost": 50, "liese": 30}},
    "beeren": {"name": "Beeren sammeln", "personen": {"hannes": 60, "liese": 100}},
    "weg": {"name": "Weg anlegen", "personen": {"hannes": 100, "jost": 77, "liese": 40}},
    "faellen": {"name": "Fällen", "personen": {"jost": 100, "hannes": 67}, "nurJung": ["hannes"]},
    "zerlegen": {"name": "Stamm zerlegen", "personen": {"jost": 100, "hannes": 71}},
    "roden": {"name": "Stumpf roden", "personen": {"jost": 100, "hannes": 20}},
    "bau": {"name": "Bau zuschütten", "personen": {"hannes": 100, "jost": 63, "liese": 30}},
    "falle": {"name": "Falle stellen", "personen": {"hannes": 100}},
    "fuettern": {"name": "Hühner füttern", "fest": true, "ueblich": "grete", "personen": {"grete": 100, "liese": 100}},
    "einsperren": {"name": "Hühner einsperren", "fest": true, "ueblich": "grete", "personen": {"grete": 100, "liese": 100}},
    "kochen": {"name": "Mittagessen kochen", "fest": true, "ueblich": "grete", "personen": {"grete": 100, "liese": 100}},
    "markt": {"name": "Zum Markt", "fest": true, "ueblich": null, "personen": {"liese": 100}}
  }
};
