# TP Jump – web (PWA)

Web verzija TP Jump aplikacije (Team Performance): mjerenje visine skoka iz videa – CMJ, SJ, Drop jump (visina, kontakt, RSI) metodom vremena leta (h = g·t²/8).

**Otvori:** https://tomislavpranja8-ctrl.github.io/tpjump-web/ → u Chromeu ⋮ → *Instaliraj aplikaciju*.

- Uvoz videa (najbolje slow-motion 120/240 fps s kamere mobitela) i analiza frame po frame (točno pozicioniranje na svaki frame preko vremenskih oznaka iz MP4 datoteke).
- Snimanje u pregledniku (ovisno o uređaju 30–60 fps).
- Sportaši, grupe, rezultati, napredak, PDF izvještaj (ispis → Spremi kao PDF), CSV izvoz, sigurnosna kopija kompatibilna s iOS verzijom.
- Radi offline (service worker). Podaci ostaju u pregledniku na uređaju.

Nova verzija: promijeni `CACHE` u `sw.js` kako bi se instalirane aplikacije ažurirale.
