// Katalog pojasnil za nastavitve.
//
// Zakaj na enem mestu in ne kot besedilo ob vsakem polju: pojasnila so daljša od
// enovrstičnega namiga, ponavljajo se med zasloni (npr. pravilo o https velja za vtičnike
// IN za vire), in tako jih je mogoče preveriti s testom — komponenta `app-help` sprejme
// samo ključ, ki tu obstaja.
//
// Zgradba je namenoma vedno enaka: KAJ je ta nastavitev, KAKO se nastavi, in kaj se zgodi,
// če je ne nastaviš. Zadnje je najpogostejše vprašanje in ga večina vmesnikov zamolči.

export interface HelpTopic {
  /** Naslov v pojavnem oknu. */
  title: string;
  /** Kaj ta nastavitev je — en odstavek. */
  what: string;
  /** Koraki ali pravila, kako se nastavi. */
  how: readonly string[];
  /** Kaj velja, če ostane prazna oziroma nedotaknjena. Neobvezno. */
  ifEmpty?: string;
  /** Konkreten primer vrednosti. Neobvezno. */
  example?: string;
}

export const HELP_TOPICS = {
  // ─── Vtičniki ───
  'plugin.kind': {
    title: 'Vrsta vtičnika',
    what: 'Določa, kaj ploščica pokaže in od kod dobi vsebino. Vrste se po shranjenju lahko spremeni, a se s tem spremenijo tudi polja, ki jih potrebuje.',
    how: [
      'Povezava — kartica z opisom in gumbom, ki odpre naslov. Nič se ne prenaša, samo odpre se stran.',
      'Vdelana stran — tuja stran, prikazana v okvirju znotraj ploščice. Nekatere strani vdelavo blokirajo (X-Frame-Options) in ostanejo prazne.',
      'Slika — zunanja slika, ki jo strežnik sam prenese in osveži (npr. radar, spletna kamera).',
      'Podatek iz JSON — strežnik prebere JSON odgovor, ti pa poveš, katera polja naj se izpišejo.',
    ],
    example: 'Za dnevni pregled porabe elektrike izberi “Podatek iz JSON”.',
  },
  'plugin.name': {
    title: 'Ime vtičnika',
    what: 'Naslov, ki se izpiše v glavi ploščice in v seznamu za razporejanje.',
    how: [
      'Poljubno besedilo, do 60 znakov.',
      'Znotraj tvojega profila mora biti edinstveno; drugi uporabniki smejo imeti vtičnik z istim imenom.',
    ],
  },
  'plugin.url': {
    title: 'Naslov vira',
    what: 'Naslov, ki ga ploščica odpre ali s katerega strežnik prenese vsebino.',
    how: [
      'Dovoljen je samo https — po nešifrirani povezavi strežnik tujih virov ne prenaša.',
      'Naslov ne sme vsebovati uporabniškega imena ali gesla.',
      'Naslov ne sme kazati v lokalno ali zasebno omrežje (localhost, 10.x, 192.168.x, 169.254.x …), ker ga strežnik obišče v tvojem imenu.',
      'Poizvedbeni parametri so dovoljeni in se ohranijo.',
      'Pri vdelani strani lahko prilepiš CEL <iframe …>, kot ga ponudi YouTube pod “Deli → Vdelaj” — polje samo vzame naslov iz njega in ti to izpiše. Prilepljen YouTube naslov za gledanje se prav tako pretvori v naslov za vdelavo (/embed/), ker gledalnega naslova YouTube v okvirju ne dovoli.',
    ],
    example: 'https://api.example.com/v1/energy?home=1',
  },
  'plugin.icon': {
    title: 'Ikona',
    what: 'Znak ob naslovu ploščice in v seznamu vtičnikov.',
    how: [
      'Izbira je iz nabora, ne prosto besedilo — neregistrirano ime bi se izrisalo kot prazen prostor.',
      'Ob menjavi vrste se ikona samodejno predlaga, dokler ne izbereš svoje.',
    ],
  },
  'plugin.widthPx': {
    title: 'Širina ploščice',
    what: 'Kako široka je ta ploščica na nadzorni plošči, v slikovnih točkah. Uporabno predvsem za vdelane strani in slike, ki so v ozki ploščici pretesne.',
    how: [
      'Dovoljeno je med 200 in 1600 px; 320 px je enako široko kot vgrajene ploščice.',
      'Ploščice se zložijo v vrstico, dokler gredo, in se nato prelomijo v naslednjo.',
      'Na ožjem zaslonu se ploščica zoži na razpoložljivo širino — vpisana vrednost je zgornja meja, ne zagotovilo.',
      'Višina je ločena nastavitev in obstaja samo pri vdelani strani.',
    ],
    ifEmpty: 'Privzeto je 320 px.',
  },
  'plugin.heightPx': {
    title: 'Višina vdelane strani',
    what: 'Višina okvirja z vdelano stranjo v pikslih, kot je videti na nadzorni plošči.',
    how: [
      'Med 80 in 1200 px.',
      'Velja samo za pregled na nadzorni plošči — v povečanem prikazu stran zapolni okno ne glede na to vrednost.',
    ],
    ifEmpty: 'Privzeto 320 px.',
  },
  'plugin.refreshSeconds': {
    title: 'Interval osveževanja',
    what: 'Kako pogosto sme strežnik znova prenesti vir. Velja za sliko in podatek iz JSON; povezave in vdelane strani se ne prenašajo.',
    how: [
      'Najmanj 30 sekund — vtičnik ne sme postati orodje za obremenjevanje tujega vira.',
      'Vrednost je hkrati čas hrambe v predpomnilniku: znotraj nje strežnik vira ne kliče, tudi če imaš odprtih več naprav.',
      'Osveževanje teče samo, ko je aplikacija v ospredju.',
    ],
    ifEmpty: 'Privzeto 300 sekund (5 minut).',
  },
  'plugin.fields': {
    title: 'Polja za prikaz (JSON)',
    what: 'Pove, katere vrednosti iz JSON odgovora naj ploščica izpiše. Vsako polje ima oznako (kar vidiš) in pot (kje v odgovoru vrednost je).',
    how: [
      'Pot se piše s pikami med koraki: observation.t',
      'Element seznama se naslovi s številko: list.0.main.temp',
      'Oznaka je poljubno besedilo, enota (npr. °C, W) pa se pripne za vrednostjo.',
      'Z gumbom “Preizkusi” (na že shranjenem vtičniku) vidiš celoten odgovor vira in iz njega prepišeš pot.',
      'Če polja v odgovoru ni, ploščica to izrecno pove — to pomeni, da je pot napačna, ne da je vir prazen.',
    ],
    example: 'Oznaka “Temperatura”, pot “observation.t”, enota “°C”.',
  },
  'plugin.description': {
    title: 'Opis povezave',
    what: 'Kratko besedilo pod naslovom na kartici s povezavo — pove, kaj se za povezavo skriva.',
    how: ['Do 200 znakov.', 'Prikaže se samo pri vrsti “Povezava”.'],
    ifEmpty: 'Kartica pokaže samo naslov in gumb.',
  },
  'plugin.openInNewTab': {
    title: 'Odpri v novem zavihku',
    what: 'Ali gumb na kartici odpre naslov v novem zavihku brskalnika ali v istem.',
    how: [
      'Vklopljeno — nov zavihek, nadzorna plošča ostane odprta.',
      'Izklopljeno — odpre v istem zavihku; nazaj se vrneš z gumbom brskalnika.',
    ],
  },
  'plugin.alt': {
    title: 'Nadomestno besedilo slike',
    what: 'Besedilo, ki se prikaže, če se slika ne naloži, in ki ga preberejo bralniki zaslona.',
    how: ['Kratek opis tega, kaj je na sliki.'],
    ifEmpty: 'Uporabi se ime vtičnika.',
  },

  // ─── Nadzorna plošča ───
  'dashboard.arrangement': {
    title: 'Razporeditev ploščic',
    what: 'Vrstni red in vidnost vseh ploščic na nadzorni plošči — vgrajenih in tvojih vtičnikov skupaj.',
    how: [
      'S puščicama premikaš ploščico gor in dol; vrstni red velja od leve proti desni, nato v novo vrstico.',
      'Stikalo skrije ploščico, ne da bi jo izbrisalo — vtičnik ostane med tvojimi vtičniki.',
      'Spremembe se uveljavijo šele po kliku na “Shrani razporeditev”.',
    ],
  },
  'dashboard.commute': {
    title: 'Pot v službo in domov',
    what: 'Ploščica “Pot” na nadzorni plošči pokaže obe smeri — pot v službo in pot domov — vsako z vdelanim zemljevidom, časom poti in zamudo zaradi prometa. Zgoraj je tista, ki ustreza času dneva: dopoldne pot v službo, od 12:00 naprej pot domov. Klik na zemljevid ga odpre povečano.',
    how: [
      'Nastaviti je treba samo dva kraja — “doma” in “služba”. Pot domov je ista pot v nasprotni smeri, zato se izpelje sama.',
      'Koordinati sta natančnejši od naslova (in cenejši, ker jih Googlu ni treba iskati): v Google Zemljevidih klikni z desno tipko na točko in prilepi ponujeni par števil. Vpiši ju obe ali nobene.',
      'Naslov je zasilna pot, kadar koordinat ni pri roki — piši ga tako, kot ga pozna zemljevid: ulica, hišna številka, kraj.',
      'Ime kraja je samo oznaka nad zemljevidom in na izračun ne vpliva; prazno ime se vrne na privzeto.',
      'Čas poti upošteva promet v tem trenutku (Google Routes API) in se osveži največ vsakih pet minut, ker je vsaka poizvedba plačljiva. Zamuda je razlika do vožnje brez prometa; pod eno minuto se ne izpisuje.',
      'Videz ploščice nastaviš sam: višina zemljevida (100–600 px) in postavitev — zemljevida eden pod drugim ali eden zraven drugega. Pri postavitvi zraven se ploščica samodejno razširi, da noben zemljevid ni preozek.',
      'Meja med smerema je 12:00 po ljubljanskem času in ni nastavljiva — vrstni red se zamenja sam, brez ponovnega nalaganja strani.',
    ],
    ifEmpty:
      'Ploščica pokaže napotek in gumb do teh nastavitev. Če ključa za Google Routes API v okolju ni, zemljevida vseeno delujeta, čas poti pa pove, da ključa ni — to uredi skrbnik namestitve (GOOGLE_MAPS_SERVER_KEY).',
    example: 'Doma: 46.062382, 14.560178 — Služba: 45.9610473, 14.2979519',
  },
  'dashboard.theme': {
    title: 'Tema',
    what: 'Svetel ali temen videz aplikacije.',
    how: [
      'Sistem — sledi nastavitvi operacijskega sistema in se spremeni skupaj z njo.',
      'Svetla / Temna — vedno izbrana, ne glede na sistem.',
      'Izbira je vezana na tvoj profil, zato velja na vseh napravah, kjer si prijavljen.',
    ],
  },

  // ─── Viri ───
  'sources.location': {
    title: 'Lokacija za vreme',
    what: 'Kraj, za katerega se prikazujeta vreme in napoved.',
    how: [
      'Ime mora biti tako, kot ga pozna vremenski vir (ARSO): Ljubljana, Maribor, Kredarica …',
      'Zemljepisna širina in dolžina se uporabljata za prikaz, ne za iskanje kraja — ime je tisto, kar odloča.',
    ],
    ifEmpty: 'Privzeto Ljubljana.',
  },
  'sources.urls': {
    title: 'Naslovi virov',
    what: 'Od kod se berejo vreme, radarska slika in spletne kamere. Sistem ima za vsakega privzeto vrednost; tu jo prepišeš samo zase.',
    how: [
      'Prazno polje pomeni, da velja sistemska privzeta vrednost — to ni napaka in ni izklop.',
      'Gumb “Privzeto” izprazni polje; sprememba velja po shranjenju.',
      'Veljajo ista pravila kot za naslov vtičnika: samo https, brez poverilnic, brez lokalnih naslovov.',
      'Tvoja sprememba ne vpliva na druge uporabnike.',
    ],
  },
  'sources.weatherUrl': {
    title: 'Vremenski vir',
    what: 'Naslov storitve, ki vrne trenutno vreme in napoved v obliki JSON. Uporabljata ga ploščici “Vreme” in “Napoved”.',
    how: [
      'Ime lokacije se naslovu pripne kot poizvedbeni parameter ?location=…',
      'Odgovor mora biti v obliki, ki jo pozna ARSO — drugačna storitev tu ne bo delovala brez prilagoditve.',
      'Podatek se hrani v predpomnilniku 10 minut, zato sprememba ni vidna takoj.',
    ],
    ifEmpty: 'Privzeto vremenska storitev ARSO.',
    example: 'https://vreme.arso.gov.si/api/1.0/location/',
  },
  'sources.radarUrl': {
    title: 'Radarska slika',
    what: 'Naslov slike, ki jo prikaže ploščica “Radar padavin”. Sliko prenese strežnik, ne brskalnik.',
    how: [
      'Kaže naj neposredno na sliko (GIF, PNG ali JPEG), ne na stran, ki sliko vsebuje.',
      'Slika se hrani v predpomnilniku 5 minut.',
    ],
    ifEmpty: 'Privzeto animirani radarski GIF ARSO.',
    example: 'https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-rm-anim.gif',
  },
  'sources.webcamBaseUrl': {
    title: 'Osnovni naslov spletnih kamer',
    what: 'Predpona, ki se uporabi pri dodajanju kamer iz predloge ARSO na zavihku “Kamere”.',
    how: [
      'Kaže naj na mapo s slikami, ne na posamezno sliko — imena datotek se pripnejo zadaj.',
      'Vpliva samo na kamere, dodane iz predloge; ročno vpisane kamere imajo svoj polni naslov.',
    ],
    ifEmpty: 'Privzeto mapa spletnih kamer ARSO.',
  },

  // ─── Meni ───
  'menu.tabs': {
    title: 'Zavihki v meniju',
    what: 'Kateri zavihki so v meniju in v kakšnem vrstnem redu. Velja samo zate.',
    how: [
      'Stikalo vklopi ali izklopi zavihek; izklopljen izgine iz menija in njegova pot ni več dosegljiva.',
      'S puščicama določiš vrstni red od vrha navzdol.',
      'Zavihka “Nastavitve” ni mogoče izklopiti — brez njega se ne bi mogel vrniti in ga vklopiti nazaj.',
      'Spremembe se uveljavijo po kliku na “Shrani meni”; meni se osveži takoj, brez ponovnega nalaganja.',
    ],
  },

  // ─── Moduli ───
  'timeTracking.session': {
    title: 'Sejni piškotek za beleženje časa',
    what: 'Piškotek, s katerim se sistem prijavi na delodajalčevo stran za beleženje prihoda in odhoda. Nadomešča uporabniško ime in geslo, ki ju ta stran nima.',
    how: [
      'V brskalniku, kjer si prijavljen na delodajalčevo stran, odpri razhroščevalnik → Application → Cookies in prepiši vse štiri podatke: ime piškotka, vrednost, domeno in rok veljavnosti.',
      'Ime piškotka in domena sta enako pomembna kot vrednost — brez njiju brskalnik piškotka ne pošlje in stran vrne prijavno masko brez gumbov.',
      'Rok veljavnosti ni obvezen, a brez njega sistem ne more opozoriti, preden seja poteče.',
      'Velikost (“Size”) je izpeljana iz imena in vrednosti; ni je mogoče nastaviti, prikazana pa je zato, da vidiš, ali je bila vrednost prilepljena cela.',
      'Po shranjenju se seja takoj preizkusi in ti sistem pove, ali deluje.',
      'Shranjene vrednosti se nikoli ne prikaže v celoti — tudi ne v meniju ali diagnostiki.',
      'Ko se seji izteka, meni ob zavihku “Beleženje časa” prikaže opozorilo.',
    ],
    example: 'Ime piškotka “ItcClientID”, domena “e-racuni.com”.',
  },
  'timeTracking.locations': {
    title: 'Lokacije za beleženje časa',
    what: 'Kraji, s katerih se beleži — vsak s svojim naslovom delodajalčeve strani, svojim parom koordinat in svojim gumbom za začetek dela. Koordinate se pošljejo strani kot lega naprave, zato morajo ustrezati kraju, kjer delo dejansko poteka.',
    how: [
      'Dodaj po eno lokacijo za vsak kraj: služba, doma, terén. Število ni omejeno.',
      '“Gumb za začetek dela” pove, katerega od štirih gumbov na strani (“Prijava na delo”, “Prihod na delo”, “Delo od doma”, “Delo na terenu”) sistem pritisne, ko se delo začne. Vsi štirje pomenijo isto stanje — razlikuje jih kraj, zato je izbira tu in ne v urniku.',
      '“Pošlji lokacijo strani” določa, ali brskalnik strani sploh pove, kje je naprava. Izklopljeno pomeni, da je dovoljenje za geolokacijo zavrnjeno in koordinati nista poslani; vpisani vrednosti ostaneta shranjeni za pozneje. Če stran gumbe pokaže šele, ko pozna lego, jih ob izklopu ne bo — “Preizkusi branje” to takoj pokaže.',
      'Urnik pove SAMO čas; ista dva profila (jutranji, popoldanski) delujeta z vsake lokacije, ne da bi ju bilo treba podvajati.',
      'Naslov strani vsebuje žeton (del poti za “Clockin-”) — če se ta zamenja, ga popravi tukaj.',
      'Znak “_” v koordinati pomeni mesto, kamor se ob vsaki prijavi vstavi naključna števka, da vpisi niso na isti točki do zadnje decimalke.',
      '“Preizkusi branje” preveri celo verigo — piškotek, naslov in koordinate — in izpiše gumbe, ki jih je na strani našel.',
      'Te koordinate niso lokacija za vreme; nikjer drugje v aplikaciji se ne uporabljajo.',
    ],
    ifEmpty: 'Brez lokacije beleženje ne more teči — urnik nima kraja, na katerem bi se izvedel. Brez izbranega gumba velja “Prijava na delo”, pošiljanje lokacije pa je privzeto vklopljeno.',
    example: 'Služba: “Prijava na delo”, 46.0629_6, 14.5602_9 · Doma: “Delo od doma”, 45.9611_0, 14.2978_7',
  },
  'timeTracking.webhooks': {
    title: 'Izhodni webhooki',
    what: 'Naslovi, na katere sistem pošlje obvestilo, ko se pri beleženju časa nekaj zgodi (uspeh, napaka, zamujena akcija, iztekajoča seja).',
    how: [
      'Vpiši naslov in izberi dogodke, ob katerih naj se sproži.',
      'Ob dodajanju dobiš skrivnost, s katero je vsaka zahteva podpisana — prikaže se samo enkrat.',
      'Uporabno za povezavo z n8n, Slackom ali lastno skripto.',
    ],
  },
  'cameras.dataSaver': {
    title: 'Zmanjšanje porabe podatkov',
    what: 'Na mobilnem omrežju redkeje osvežuje predoglede kamer in ne zaganja živih tokov samodejno.',
    how: [
      'Vklopljeno — na mobilnem omrežju daljši interval osveževanja, tok se zažene šele na dotik.',
      'Na Wi-Fi omrežju nastavitev nima učinka.',
    ],
    ifEmpty: 'Privzeto vklopljeno.',
  },

  // ─── Kamere ───
  // Obrazec za kamero je bil edini zaslon z nastavitvami brez pojasnil: polja so tehnična
  // (vrsta vira, dva naslova, poverilnici) in brez njih ni razvidno, katero je za kaj.
  'camera.name': {
    title: 'Ime kamere',
    what: 'Naslov, ki se izpiše pod predogledom v mreži kamer in v glavi celozaslonskega prikaza. Na delovanje vira ne vpliva.',
    how: [
      'Poljubno besedilo — uporabi kraj ali pogled, ne oznake naprave.',
      'Ime se uporabi tudi kot zapisani razlog, če ob shranjevanju dodaš gostitelja na seznam dovoljenih za vdelavo.',
    ],
    example: 'Rabac — panorama',
  },
  'camera.type': {
    title: 'Vrsta vira',
    what: 'Določa, kako aplikacija do slike pride in kaj se pokaže v mreži. To je najpomembnejše polje obrazca — od njega je odvisno, katere naslove je treba vpisati in ali se gostitelj preveri proti seznamu dovoljenih za vdelavo.',
    how: [
      'Posnetek (statična slika) — naslov vrne eno sliko (JPEG/PNG). Strežnik jo prenese, predpomni in osvežuje; v mreži je vidna sličica in stanje vira je preverljivo.',
      'Zvezni MJPEG tok — naslov vrne neprekinjen tok slik. Teče prek strežnika brez predpomnjenja, v mreži je namesto sličice ikona.',
      'HLS tok — naslov kaže na seznam .m3u8. Predvaja se v celozaslonskem prikazu, v mreži je ikona.',
      'Vdelava tuje strani — tujo stran (YouTube, predvajalnik ponudnika) prikaže v okvirju. Gostitelj mora biti na seznamu dovoljenih; posnetka za mrežo ni, zato je tam ikona.',
      'Posnetek + vdelava ob kliku — v mreži statična slika, ob odprtju živa vdelava. Edina vrsta z dvema naslovoma in edina, ki združi sličico v mreži z živim prikazom.',
    ],
    ifEmpty: 'Privzeto “Posnetek”. Pri YouTube naslovu se vrsta sama preklopi na vdelavo — kot posnetek bi se tak naslov shranil in izrisal kot pokvarjena slika.',
  },
  'camera.previewUrl': {
    title: 'Naslov kamere',
    what: 'Naslov vira. Pri vrsti “Posnetek + vdelava ob kliku” je to naslov statične slike za mrežo, pri vseh drugih vrstah pa edini naslov, ki ga kamera ima.',
    how: [
      'Dovoljena sta http in https — drugače kot pri vtičnikih, kjer je https obvezen, ker so kamere pogosto naprave v domačem omrežju brez potrdila.',
      'Naslov, ki je http, kaže v lokalno ali zasebno omrežje (localhost, 10.x, 172.16–31.x, 192.168.x) ali ima poverilnici, gre obvezno prek strežnika — naprava ga nikoli ne odpre neposredno.',
      'Pri vrstah za vdelavo mora biti gostitelj na seznamu dovoljenih; sicer shranjevanje pove razlog in ponudi gumb, ki gostitelja doda.',
      'Prilepiš lahko tudi celo oznako <iframe …> iz YouTubovega gumba “Vdelaj” — obrazec iz nje sam vzame naslov.',
      'YouTube naslov za gledanje (watch?v=…, youtu.be/…, live/…) se sam pretvori v naslov za vdelavo, ker YouTube strani za gledanje v okvirju ne dovoli in bi ploščica ostala prazna.',
    ],
    example: 'https://www.youtube.com/embed/vwQyhU-5_7U',
  },
  'camera.fullUrl': {
    title: 'Naslov vdelave (polni prikaz)',
    what: 'Drugi naslov, ki ga ima samo vrsta “Posnetek + vdelava ob kliku”: kar se odpre v celozaslonskem prikazu, medtem ko je v mreži še vedno statična slika iz prvega naslova.',
    how: [
      'Vpiše se naslov strani ali predvajalnika, ne slike.',
      'Ta naslov je tisti, ki se preveri proti seznamu dovoljenih gostiteljev — pri tej vrsti prvi naslov ni preverjen, ker se ne vdela.',
      'Pri vseh drugih vrstah se polja ne pokaže in shranjena vrednost se počisti.',
    ],
    ifEmpty: 'Vdela se prvi naslov (naslov posnetka) — kar je smiselno le, če je tudi ta stran, ne slika.',
  },
  'camera.refresh': {
    title: 'Interval osveževanja',
    what: 'Kako pogosto, v sekundah, strežnik znova prenese posnetek in kako pogosto naprava vpraša po njem. Velja za vrsti s posnetkom; pri zveznem toku in vdelavi je brez učinka.',
    how: [
      'Najmanj 5 sekund — nižjo vrednost strežnik zavrne.',
      'Isti posnetek si vse tvoje naprave delijo iz predpomnilnika, zato več odprtih naprav ne pomeni več zahtev na kamero.',
      'Ko je vir trikrat zapored nedosegljiv, se interval sam početveri, dokler se vir ne povrne.',
      'Na mobilnem omrežju ga podaljša še nastavitev za zmanjšanje porabe podatkov.',
    ],
    ifEmpty: 'Privzeto 30 sekund.',
  },
  'camera.group': {
    title: 'Skupina',
    what: 'Kateremu sklopu v mreži kamera pripada. Skupine se izrisujejo ena za drugo, ročni vrstni red in časovna razvrstitev pa veljata samo znotraj posamezne skupine.',
    how: [
      'Skupine se ustvari posebej; tu se izbere ena od obstoječih.',
      'Premik kamere v drugo skupino jo postavi na konec te skupine.',
      'Puščici ↑/↓ na seznamu kamer premikata kamero samo znotraj njene skupine.',
    ],
    ifEmpty: 'Brez skupine — kamera je v skupnem sklopu na vrhu mreže.',
  },
  'camera.timeOfDay': {
    title: 'Časovna oznaka',
    what: 'Pove, kdaj je ta kamera zanimiva, in s tem vpliva na vrstni red v mreži: kamere z oznako, ki ustreza trenutnemu delu dneva, se izrišejo pred tistimi z nasprotno oznako.',
    how: [
      'Vedno — kamera ostane točno tam, kjer je v ročnem vrstnem redu, in se ne premika.',
      'Dopoldne — pred poldnem (po ljubljanskem času) se dvigne pred popoldanske kamere, popoldne pade za njih.',
      'Popoldne — obratno; meja je poldne.',
      'Razvrstitev nobene kamere ne skrije in ne prestavi tistih z oznako “Vedno” — samo zamenja mesta med dopoldanskimi in popoldanskimi.',
    ],
    ifEmpty: 'Privzeto “Vedno” — ročni vrstni red velja nespremenjen.',
  },
  'camera.active': {
    title: 'Aktivna',
    what: 'Ali se kamera izrisuje v mreži in ali se njen vir osvežuje. Neaktivna kamera ostane shranjena z vsemi nastavitvami, le da je v mreži ni.',
    how: [
      'Izklopi jo, kadar je vir začasno nedosegljiv ali kamere ta mesec ne potrebuješ — namesto brisanja in ponovnega vpisovanja naslovov.',
      'Na zaslonu za urejanje je neaktivna kamera še vedno na seznamu, označena z “Neaktivna”.',
    ],
    ifEmpty: 'Privzeto vklopljeno.',
  },
  'camera.credentials': {
    title: 'Uporabniško ime in geslo',
    what: 'Poverilnici, s katerima se strežnik prijavi na kamero, kadar ta zahteva osnovno prijavo (HTTP Basic) — običajno naprave v domačem omrežju.',
    how: [
      'Vpiši ju samo, če vir brez njiju vrne 401; večina javnih virov ju ne potrebuje.',
      'Shranjeni sta šifrirani in se nikoli ne vrneta prek API-ja — v obrazcu za urejanje sta polji zato vedno prazni.',
      'Prazni polji pri urejanju pomenita “pusti obstoječi poverilnici”, ne “izbriši ju”.',
      'Vpisani poverilnici pomenita, da vir obvezno teče prek strežnika, tudi če je naslov https in javen — naprava ju nikoli ne dobi.',
    ],
    ifEmpty: 'Vir se odpre brez prijave.',
  },
  'camera.embedHosts': {
    title: 'Dovoljeni gostitelji za vdelavo',
    what: 'Seznam domen, katerih strani je dovoljeno prikazati v okvirju. Varovalka proti temu, da bi se v aplikacijo vdelala poljubna tuja stran — velja samo za vrsti za vdelavo, ne za posnetke in tokove.',
    how: [
      'Osnovni seznam je del namestitve (youtube.com, ipcamlive.com, istrastream.com, arso.gov.si) in ga prek aplikacije ni mogoče spremeniti.',
      'Gostitelj se doda le izrecno: ob zavrnjenem shranjevanju obrazec pokaže gostitelja in gumb, ki ga doda ter shranjevanje ponovi — samo od sebe se to nikoli ne zgodi.',
      'Dovoljenje velja tudi za poddomene: “youtube.com” zajame “www.youtube.com”.',
      'Odstraniti je mogoče samo gostitelje, ki si jih dodal sam.',
      'Nekatere strani vdelavo zavračajo same (X-Frame-Options) — take ostanejo prazne, tudi če je gostitelj dovoljen.',
    ],
  },
  // ─── Beležke (007) ───
  'notes.voice': {
    title: 'Govor v beležki',
    what: 'Dva ločena načina: narekovanje sproti piše besedilo v vsebino beležke, snemanje pa shrani zvočni posnetek kot prilogo. Uporabiš lahko enega, drugega ali oba.',
    how: [
      'Narekuj — brskalnik pretvarja govor v besedilo, ki se piše v polje vsebine. Zvok se pri tem NE shrani.',
      'Narekovanje podpirajo Chrome, Edge in Android; v Firefoxu in na iOS Safariju gumba ni. Chrome zvok za prepoznavo pošlje Googlu — to je vgrajeno v brskalnik in tega ne moremo izklopiti.',
      'Posnemi — zvok se shrani k beležki in ga lahko predvajaš nazaj. Posnetek ostane na tem strežniku.',
      'Če je vklopljen prepis na strežniku, se ob snemanju pokaže še stikalo, da posnetek prepiše storitev za prepis.',
      'Prvo snemanje v novi beležki jo najprej shrani — posnetek se lahko pripne samo obstoječi beležki.',
    ],
    ifEmpty: 'Brez govora je beležka navadno besedilo — vse skupaj deluje tudi brez mikrofona.',
  },
  'notes.serverTranscription': {
    title: 'Prepis govora na strežniku',
    what: 'Pošiljanje zvočnih posnetkov beležk zunanji storitvi za prepis (Whisper ali združljiva), ki vrne besedilo. Posnetek pri tem zapusti ta strežnik.',
    how: [
      'Potrebna sta OBA pogoja: naslov in ključ storitve v okolju strežnika (NOTES_TRANSCRIPTION_URL, NOTES_TRANSCRIPTION_API_KEY) IN to stikalo. Sam ključ ne zadošča — brez privolitve tukaj se posnetek nikamor ne pošlje.',
      'Naslov storitve je nastavljiv, zato je lahko tudi lasten Whisper v domačem omrežju; v tem primeru posnetek omrežja ne zapusti.',
      'Prepis se sproži samo na zahtevo: s stikalom ob snemanju ali z gumbom pri obstoječem posnetku. Nikoli se ne zgodi sam v ozadju.',
      'Če prepis spodleti, posnetek vseeno ostane shranjen in poskus je mogoče ponoviti.',
    ],
    ifEmpty: 'Privzeto izklopljeno — posnetki ostanejo na tem strežniku, narekovanje v brskalniku pa deluje ne glede na to nastavitev.',
  },
  'notes.tags': {
    title: 'Oznake beležke',
    what: 'Poljubne besede, po katerih beležke filtriraš v seznamu. Ena beležka jih ima lahko največ dvajset.',
    how: [
      'Vpisujejo se v eno polje, ločene z vejico: “delo, ideje, odprta vprašanja”.',
      'Ločilo je vejica in ne presledek, da je oznaka lahko tudi dvobesedna.',
      'Vse se shranijo z malimi črkami, zato “Delo” in “delo” nista dve različni oznaki.',
    ],
    ifEmpty: 'Brez oznak je beležka dosegljiva prek iskanja po naslovu in vsebini.',
  },

  // ─── Opravila (010) ───
  'todos.roles': {
    title: 'Stopnje pri deljenju',
    what: 'Ko seznam deliš, vsaki osebi posebej določiš, koliko sme. Stopnje so tri in se ne prekrivajo — višja vključuje vse iz nižje.',
    how: [
      'Ogled — vidi seznam in opravila, ne more spremeniti ničesar. Primerno, kadar hočeš, da nekdo ve, kaj je treba, ne pa da se vmešava.',
      'Odkljukavanje — sme opravila odkljukati in odkljukanje vrniti, ne more pa dodajati, urejati, brisati ne preurejati. To je stopnja za nakupovalni seznam.',
      'Urejanje — sme vse z opravili. Seznama še vedno ne more izbrisati, preimenovati, zakleniti ali deliti naprej: to ostane tebi.',
    ],
    ifEmpty: 'Nova oseba dobi najnižjo stopnjo (Ogled). Deljenje naj bo namerno dejanje, ne privzeto podeljena pravica urejanja.',
    example: 'Partnerju za nakupovalni seznam daj “Odkljukavanje”, sodelavcu na skupnem projektu “Urejanje”.',
  },
  'todos.lock': {
    title: 'Zaklep seznama',
    what: 'Zaklenjen seznam si soudeleženci še vedno ogledajo, a ne morejo spremeniti ničesar — niti odkljukati. Ti kot lastnik urejaš naprej.',
    how: [
      'Stikalo je v oknu za deljenje, pri seznamu samem — ne v splošnih nastavitvah. Zaklep je lastnost tega seznama, ne tvoja.',
      'Odklep povrne natanko prejšnje pravice; zaklep ničesar ne spremeni trajno.',
      'Soudeleženec sme zaklenjen seznam kadar koli zapustiti. Ključavnica omejuje spremembe v seznamu, ne pripadnosti tujim podatkom.',
    ],
    ifEmpty: 'Nezaklenjen seznam je privzeto stanje — vsak dela to, kar mu dovoli njegova stopnja.',
    example: 'Zakleni ga, ko je dogovor sklenjen in nočeš, da kdo še kaj doda.',
  },
  'todos.tilePin': {
    title: 'Pripenjanje seznama na ploščico',
    what: 'Ploščica Opravila na nadzorni plošči privzeto kaže seznam, ki je bil nazadnje spremenjen. Če hočeš, da vedno kaže istega, ga pripneš.',
    how: [
      'Izbirnik je v glavi ploščice. “Nazadnje spremenjen” pomeni, da ploščica sledi zadnji aktivnosti.',
      'Pripeti seznam ostane prikazan, tudi ko se spremeni kak drug.',
      'Če pripeti seznam izbrišeš ali ti je dostop odvzet, ploščica pade nazaj na nazadnje spremenjenega in to pove — ne pokaže napake.',
    ],
    ifEmpty: 'Brez pripenjanja ploščica sledi zadnji spremembi, kar je za večino primerov prav.',
  },
  'todos.dueDate': {
    title: 'Rok opravila',
    what: 'Opravilo ima lahko rok — koledarski dan, ne ura. Zapadla opravila so obarvana in seštevek je viden ob zavihku v meniju.',
    how: [
      'Rok se doda naknadno, s klikom na ikono koledarja ob opravilu. V polju za hitri vnos ga namenoma ni, ker ga večina opravil ne bo imela.',
      'Opravilo z rokom “danes” ne zamuja do konca dneva, ne od polnoči naprej.',
      'Odkljukano opravilo se med zamude ne šteje, tudi če je rok minil.',
    ],
    ifEmpty: 'Brez roka je opravilo samo na seznamu in nikoli ne zamuja.',
  },
} as const satisfies Record<string, HelpTopic>;

export type HelpTopicId = keyof typeof HELP_TOPICS;

/** Vrne zapis kot `HelpTopic`, ne kot njegov ozek literalni tip.
 *
 * Brez tega `as const` vsak vnos zoži na njegovo natančno obliko, in vnos brez `ifEmpty`
 * te lastnosti v tipu nima — predloga, ki jo bere, se potem ne prevede. Predloge preveri
 * šele `ng build`, ne `tsc --noEmit`, zato je taka napaka vidna pozno. */
export function helpTopic(id: HelpTopicId): HelpTopic {
  return HELP_TOPICS[id];
}
