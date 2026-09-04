# 005 — vhodno gradivo

> `nacrt/` je VHODNO gradivo in ga generirani artefakti ne smejo prepisati (README,
> "Zakaj vhodno gradivo ni v specs/"). Spodaj je zahteva, kot je bila podana, in odločitve,
> ki so bile ob njej sprejete — brez naknadnega lepšanja.

## Zahteva (dobesedno)

> zalo slab UI.
>
> ni menija dashboard je slab. manjkajo podatki.
> vsaka oseba mora imeti nastavitve profila. tja notri si pišeš katere linki se ti
> prikazujejo na dashboardu. Naredi kot vtičniči. poljibno njih lahko definiraš.
>
> videl sem da so v env folderju nateri urlji. ot preseli v nastavitve osebe. prav tako
> mora biti v meniju vidno kateri podatki s euporabljajo za beleženje časa. vsi meniji so
> konfigurabilni. in jih uporabnik lahko uporablja lahko pa ne.

Priložen je bil posnetek zaslona `localhost:4200/dashboard`: neoblikovan HTML, brez menija,
dve ploščici, pokvarjena radarska slika.

## Odločitve ob prevzemu

| Vprašanje | Izbrano |
|---|---|
| Kaj je "vtičnik" | Štiri vrste: povezava, vdelana stran (iframe), zunanja slika, podatek iz JSON (pot do polja + oznaka) |
| Kaj z URL-ji v `.env` | `.env` ostane sistemski privzetek, oseba ga lahko prepiše |
| Pristop k UI | Ostanemo na Ionicu, dodamo pravo temo in oblikovne žetone (ne prehod na drug CSS — obstaja Android/Capacitor build) |
| Proces | Novi spec 005 po ustaljenem vzorcu, nato implementacija |

## Kaj je pregled razkril pred pisanjem specifikacije

Pomembno za razumevanje obsega: "slab UI" ni bil samo občutek. Trije deli ogrodja niso
delovali, in nobeden od njih ni bil viden iz kode brez zagona:

- `addIcons()` iz `ionicons` ni bil klican nikjer → vse ikone prazne;
- `<ion-menu>` je bil zavit v `<app-side-menu>` in zato ni bil neposreden otrok
  `<ion-split-pane>` → Ionic mu ni dodelil višine, meni je bil visok 0 px in neviden,
  levi stolpec pa vseeno rezerviran (natanko to, kar je na posnetku);
- `@ionic/angular/css/palettes/dark.class.css` ni bil uvožen → temna tema je bila mrtva
  koda, čeprav jo je `theme.service.ts` preklaplja.

Poleg tega: spodnja vrstica zavihkov se je izrisala na VRHU zaslona (čez glavo strani), ker
je `ion-router-outlet` znotraj `.ion-page` absolutno pozicioniran in vrstica ni bila v toku;
in med 768 px (kjer se vrstica skrije) in 992 px (privzeti prag `ion-split-pane`) navigacije
sploh ni bilo mogoče doseči.
