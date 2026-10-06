// 01 – Der Gutsverwalter: Ökologie-Werte (Wald, Licht, Boden, Hasen, Füchse).
// Geladen von 01-foerster/index.html; 02-waldchronik liest diese Datei als Regelsatz „01“.
// Spielwerte (Personal, Kosten, Essen, Darstellung) stehen weiter im CFG der index.html.
// Im F2-Fenster von 01 lässt sich stattdessen der Wertesatz aus 02-waldchronik/regeln.js wählen.
window.REGELN_01 = {
  litMeadow:0.68, litHalf:0.4, litMoss:0.3,          // Lichtschwellen: Wiese / Halbschatten / Moos
  grassDays:2.2,                                      // Tage je Grasstufe bei vollem Licht
  sp:{                                                // Baumarten
    birke:{op:0.3, need:0.6, hDays:1.6, hMax:5, rMax:1, crownP:0.8, seeds:1.6, germ:0.45},
    eiche:{op:0.5, need:0.4, hDays:3.2, hMax:7, rMax:2, crownP:0.6, seeds:0.5, germ:0.55},
    buche:{op:0.65,need:0.2, hDays:2.8, hMax:7, rMax:2, crownP:0.7, seeds:0.8, germ:0.55}
  },
  giantRMax:3, giantH:9, maxTrees:3800,
  rootComp:0.12, crownDieLight:0.12, crownDieP:0.3, sapDieP:0.35, treeStressDie:6,
  season0:0.6, season1:1.4,                           // Wachstumsfaktor Tag 1 → Tag 21 (Frühling → Frühsommer); nur 02 und der Golden-Master-Pfad von 01 (01 nutzt im Spiel `herbst`)
  herbst:{                                            // NUR 01 (Demo, Herbst): Kurve je Woche 1–12, je Teilschritt der Wochenhülle; 02 kennt den Schlüssel nicht (Objekt, kein Zahlenwert). Fuchsdruck: keine eigene Kurve, er steigt kausal (weniger Hasen → weniger Witterung → Stallgang)
    wachs:[0.6,0.5,0.42,0.34,0.27,0.2,0.14,0.09,0.05,0.02,0,0],     // Wachstum Bäume/Gras/Samen (ersetzt season0 → season1): klingt aus, im Spätherbst null
    wurf:[0.1,0.1,0.09,0.08,0.06,0.03,0.01,0,0,0,0,0]               // Hasenwurf (Faktor auf hareBirth, ersetzt dort season): ab Woche 6 kaum noch; bremst auch die Explosion der ersten Wochen bei 7 Teilschritten (B1-Balancing)
  },
  stumpDays:4, snagFallDays:4, logMossDays:5, logRotDays:18, holeDays:4, trackDays:2,
  burrowLight:0.6, burrowBright:10, burrowSpacing:6, hareFoodNeed:2.5, hareBirth:0.22,
  hareCapFood:3, hareMaxBurrow:8, verbissP:0.06, holesPerHare:0.08, fenceDigPerHare:0.03, disperseSteps:45,
  foxBaseSteps:30, foxHungerSteps:25, foxCatch:0.35, foxRaidHunger:2, foxJumpHunger:3, foxLeaveHunger:5,
  haresPerFox:10, maxFoxes:8, denLight:0.35
};
