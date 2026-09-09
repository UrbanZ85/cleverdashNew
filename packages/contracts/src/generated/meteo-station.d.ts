export interface paths {
    "/meteo/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Meritve postaje po urah in po posameznih meritvah
         * @description Vrne meritve postaje za zadnjih `hours` ur. Okno se meri od ZADNJE meritve in ne od
         *     trenutnega časa: če vir zastane, mora odjemalec pokazati zadnje znano stanje z oznako
         *     starosti (FR-026), ne praznega grafa.
         *
         *     Postaja se določi v tem vrstnem redu: `?station=` → PRVA iz `Settings.meteo.stations`
         *     → `ARSO_DEFAULT_STATION` iz okolja. `station.chosen` pove, ali je šlo za uporabnikovo
         *     izbiro ali za privzetek.
         */
        get: operations["getMeteoHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/meteo/stations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Postaje obeh omrežij
         * @description Seznam postaj s sklicem, imenom za človeka in podatkom, iz katerega omrežja so; urejen
         *     po imenu po slovensko ČEZ OBA PONUDNIKA skupaj, ker človek ne išče "najprej ARSO,
         *     potem Neverin", ampak kraj. Namen je en sam: da se postaja v nastavitvah IZBERE s
         *     seznama in ne vpiše na pamet — oznaka v naslovu namreč ni ime kraja (postaja "Bilje
         *     Nova Gorica" je `NOVA-GOR_BILJE`).
         *
         *     **Enolična je REFERENCA in ne oznaka.** Isti kraj je lahko v obeh omrežjih
         *     (Ljubljano-Bežigrad meri ARSO, isto lokacijo objavlja tudi Neverin) — to sta dve
         *     različni meritvi, ne podvojitev.
         *
         *     **ARSO seznam je ZLITJE zapisanega imenika in živega vira.**
         *     `observationAms_si_latest.xml` ni imenik postaj, ampak posnetek zadnjega objavnega
         *     cikla: 9. 9. 2026 je ob 08:00 UTC vseboval 106 postaj, ob 09:25 istega dne pa 19 — in
         *     med njimi niti Vrhnike niti Ljubljane Bežigrad. Brez zlitja bi bila vsebina odgovora
         *     odvisna od trenutka klica in uporabnik svoje postaje ob napačnem trenutku na seznamu
         *     ne bi našel. Živi vir ima prednost pri vsebini (popravljeno ime, višina, koordinati),
         *     zapisani imenik pa skrbi za pokritost.
         *
         *     **Izpad enega ponudnika ne izprazni seznama drugega.** Odgovor je `200`, prizadeti
         *     ponudnik pa ima `unavailable: true` — uporabnik, ki išče Vrhniko, je ne sme izgubiti
         *     zato, ker je nedosegljiv hrvaški vir. Napaka mora biti vidna, ne tiha (člen VII).
         *
         *     Predpomni se dlje kot meritve (`METEO_STATIONS_CACHE_SECONDS` oz.
         *     `NEVERIN_STATIONS_CACHE_SECONDS`, privzeto 6 ur): iz vira se bere samo ovojnica
         *     postaje, ki se spremeni nekajkrat na leto.
         */
        get: operations["listMeteoStations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/meteo/selection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Izbrane postaje z imeni
         * @description Izbrane postaje uporabnika, v NJEGOVEM vrstnem redu in z razrešenimi imeni.
         *
         *     Zakaj svoja pot in ne branje iz `/settings`: tam so samo sklici
         *     (`neverin:sveta-marina`), preklopnik na zavihku pa potrebuje IMENA. Brez tega bi moral
         *     zavihek prenesti seznam vseh ~1440 postaj, da izriše tri čipe.
         *
         *     Bere samo sezname ponudnikov, ki v izbiri sploh nastopajo: kdor ima izbrane le ARSO
         *     postaje, zaradi preklopnika ne sproži prenosa pri Neverinu (člen VIII). Kadar imena
         *     ni mogoče razrešiti (seznam tistega omrežja je ta hip nedosegljiv), je `title` enak
         *     oznaki — čip brez imena je še vedno uporaben preklopnik, prazen čip ni.
         */
        get: operations["getMeteoSelection"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description RFC 7807. */
        Problem: {
            type?: string;
            title: string;
            status: number;
            detail?: string;
            correlationId?: string;
        };
        /**
         * @description Omrežje, ki postajo objavlja. `arso` so državne postaje v Sloveniji, `neverin` omrežje
         *     neverin.hr (Slovenija, Hrvaška, BiH, Srbija, Črna gora).
         * @enum {string}
         */
        ProviderId: "arso" | "neverin";
        /**
         * @description Navedba vira. Člen VIII zahteva, da so podatki vedno prikazani z navedbo vira, zato je
         *     navedba del PODATKA in ne stvar odjemalčeve predloge — odjemalec je ne more pozabiti
         *     izrisati. Z drugim ponudnikom ni več konstanta: "Vir: ARSO" nad hrvaško postajo bi bila
         *     napačna navedba, kar je slabše od nobene.
         */
        Attribution: {
            /**
             * @example Vir: ARSO
             * @example Vir: Neverin.hr
             */
            text: string;
            /** Format: uri */
            url: string;
        };
        /** @description Od kod je podatek in kako star je. */
        SourceMeta: {
            /**
             * Format: uri
             * @description Naslov strani, ki jo o tem viru odpre ČLOVEK — v vmesniku povezava "izvorna stran
             *     postaje". Ni nujno naslov, s katerega bere strežnik: pri Neverinu je ta JSON na
             *     `core.neverin.hr`, ki v brskalniku ni berljiv.
             */
            url: string;
            /** Format: date-time */
            fetchedAt: string;
            ageSeconds: number;
            /** @description Podatek je starejši od TTL in osvežitev ni uspela — prikaže se z oznako starosti. */
            stale: boolean;
            /** @description Čez koliko sekund naj odjemalec poskusi znova. Interval pove strežnik, ne odjemalec. */
            nextPollSeconds: number;
            attribution: components["schemas"]["Attribution"];
        };
        MeteoStation: {
            /**
             * @description Sklic, s katerim se postaja navaja povsod (`?station=`, nastavitve).
             * @example arso:VRHNIKA
             * @example neverin:sveta-marina
             */
            ref: string;
            provider: components["schemas"]["ProviderId"];
            /**
             * @example ARSO
             * @example Neverin
             */
            providerLabel: string;
            /**
             * @description Oznaka znotraj ponudnikovega prostora imen (brez predpone).
             * @example VRHNIKA
             * @example sveta-marina
             */
            id: string;
            /**
             * @example Vrhnika
             * @example Sveta Marina
             */
            title: string;
            altitudeM: number | null;
            latitude: number | null;
            longitude: number | null;
            /**
             * @description Cona postaje (IANA). Ura v `buckets` je koledarska ura POSTAJE in ne brskalnika
             *     (člen V.4); `Europe/Zagreb` je danes isti odmik kot Ljubljana, a to je lastnost
             *     trenutka, ne pogodbe.
             * @example Europe/Ljubljana
             * @example Europe/Zagreb
             */
            timezone: string;
            /**
             * @description Kdo postajo upravlja, kadar to ni ponudnik sam. Neverin je OMREŽJE tujih postaj —
             *     meritve Svete Marine so IstraStreamove — in navedba samo "Neverin" bi izpustila
             *     tistega, ki postajo v resnici drži. Pri ARSO je `null`.
             */
            operator: {
                /** @example IstraStream */
                name: string;
                /** Format: uri */
                url: string | null;
            } | null;
            /**
             * @description `false` pomeni, da je to privzetek namestitve in ne uporabnikova izbira. Vmesnik to
             *     pove, da človek ve, da gleda Ljubljano, ker svoje postaje še ni izbral.
             */
            chosen: boolean;
        };
        /**
         * @description Ena meritev. Vsako številsko polje je lahko `null` — postaja merilnika nima ali meritev
         *     ni prišla. `null` NI `0`.
         */
        Measurement: {
            /** Format: date-time */
            validUtc: string;
            temperatureC?: number | null;
            humidityPct?: number | null;
            /**
             * @description Povprečna hitrost v intervalu. Vedno km/h — Neverin jo pošilja v m/s in strežnik jo
             *     pretvori, da sta postaji obeh omrežij na istem grafu primerljivi.
             */
            windAvgKmh?: number | null;
            /** @description Najmočnejši sunek v intervalu */
            windMaxKmh?: number | null;
            /** @description Smer, IZ KATERE piha veter (meteorološki dogovor). */
            windDirectionDeg?: number | null;
            /** @description Vsota padavin v intervalu (ne od začetka dneva). Pri obeh virih enak pomen. */
            precipitationMm?: number | null;
            /** @description ARSO-jeva vsota padavin od 6. oz. 18. ure UTC dalje. Neverin je ne pošilja. */
            precipitation12hMm?: number | null;
            /**
             * @description Tlak, reduciran na morsko gladino. Pri postajah Neverin je vedno `null`: njihov tlak
             *     ni enotno reduciran (postaja na 2228 m pošilja 782 hPa, druga na 1078 m pa
             *     1017 hPa), referenčna višina pa je lastnost postaje, ki je vir ne pove.
             */
            pressureMslHpa?: number | null;
            /** @description Tlak na lokaciji (nereduciran). */
            pressureHpa?: number | null;
            globalRadiationWm2?: number | null;
            diffuseRadiationWm2?: number | null;
            snowCm?: number | null;
            waterTemperatureC?: number | null;
            /** @description Indeks UV. ARSO ga v tabeli zgodovine nima; Neverin pri postajah s senzorjem. */
            uvIndex?: number | null;
            /** @description Ime ARSO ikone pojava/oblačnosti (npr. `mostClear`), brez pripone. */
            cloudsIcon?: string | null;
        };
        /**
         * @description Urna vrednost. `startUtc` je začetek koledarske ure v coni postaje kot instant — edini
         *     ključ, po katerem je vedro nedvoumno tudi ob prehodu na zimski čas, ko se ura 02 zgodi
         *     dvakrat in imata obe vedri `label` `"02"`.
         *
         *     Meritev ob polni uri pripada uri, ki se je pravkar KONČALA: vir označuje interval z
         *     njegovim koncem, zato dež, izmerjen ob 15:00, pripada uri 14–15.
         */
        HourBucket: {
            /** Format: date-time */
            startUtc: string;
            /** @example 14 */
            label: string;
            /** @example sre. 9. 9. */
            dayLabel: string;
            /** @description Vsota padavin v uri. */
            precipitationMm?: number | null;
            temperatureAvgC?: number | null;
            temperatureMinC?: number | null;
            temperatureMaxC?: number | null;
            humidityAvgPct?: number | null;
            windAvgKmh?: number | null;
            windMaxKmh?: number | null;
            /**
             * @description Vektorsko povprečje smeri, uteženo s hitrostjo. Aritmetično povprečje stopinj je za
             *     smer napačno (350° in 10° dasta 180° namesto 0°).
             */
            windDirectionDeg?: number | null;
            pressureHpa?: number | null;
            globalRadiationWm2?: number | null;
            snowCm?: number | null;
            /** @description Koliko meritev je v uri sodelovalo (6 pri desetminutni postaji, 2 pri polurni). */
            samples: number;
        };
        Summary: {
            /** Format: date-time */
            fromUtc: string;
            /** Format: date-time */
            toUtc: string;
            temperatureMinC?: number | null;
            temperatureMaxC?: number | null;
            precipitationTotalMm?: number | null;
            precipitation24hMm?: number | null;
            windMaxKmh?: number | null;
            latest: components["schemas"]["Measurement"];
        };
        PrecipitationWindow: {
            /**
             * @example 4
             * @example 8
             * @example 12
             * @example 24
             * @example 48
             */
            hours: number;
            /** @description Vsota padavin v oknu; `null`, kadar postaja padavin ne meri. */
            millimeters: number | null;
            /**
             * @description Koliko meritev je v oknu. Pri postaji, ki je pravkar začela oddajati, je to manj kot
             *     pričakovano in vsota takrat ne pomeni "toliko je padlo v 48 urah".
             */
            samples: number;
        };
        /**
         * @description Katere veličine ta postaja dejansko meri. Odjemalec po tem ve, katerih grafov NE riše —
         *     postaja brez barometra ne sme dobiti prazne osi brez črte, ker je to videti kot okvara.
         */
        AvailableSeries: {
            temperature: boolean;
            humidity: boolean;
            wind: boolean;
            precipitation: boolean;
            pressure: boolean;
            radiation: boolean;
            snow: boolean;
            waterTemperature: boolean;
            uv: boolean;
        };
        MeteoHistory: {
            station: components["schemas"]["MeteoStation"];
            /** @description Dolžina uporabljenega okna prikaza v urah. */
            hours: number;
            buckets: components["schemas"]["HourBucket"][];
            /** @description Posamezne meritve. Prisotno SAMO ob `?raw=true`. */
            measurements?: components["schemas"]["Measurement"][];
            summary: components["schemas"]["Summary"];
            /**
             * @description Vsote padavin za 4/8/12/24/48 ur, računane iz CELOTNE prebrane serije in ne iz okna
             *     `hours` — glej opis pogodbe.
             */
            precipitationWindows: components["schemas"]["PrecipitationWindow"][];
            available: components["schemas"]["AvailableSeries"];
            source: components["schemas"]["SourceMeta"];
        };
        StationOption: {
            /**
             * @description Sklic, ki se shrani v `Settings.meteo.stations`.
             * @example arso:VRHNIKA
             * @example neverin:sveta-marina
             */
            ref: string;
            provider: components["schemas"]["ProviderId"];
            /**
             * @example VRHNIKA
             * @example sveta-marina
             */
            id: string;
            /**
             * @example Vrhnika
             * @example Sveta Marina
             */
            title: string;
            altitudeM: number | null;
            latitude: number | null;
            longitude: number | null;
            /**
             * @description Država postaje, kadar jo vir pove. ARSO meri samo v Sloveniji.
             * @example SI
             * @example HR
             */
            countryCode: string | null;
        };
        ProviderStatus: {
            id: components["schemas"]["ProviderId"];
            /**
             * @example ARSO
             * @example Neverin
             */
            label: string;
            attribution: components["schemas"]["Attribution"];
            stationCount: number;
            /**
             * @description Seznama tega ponudnika ni bilo mogoče prenesti. Ostali so vseeno v odgovoru — izpad
             *     enega vira ne pomeni praznega seznama, mora pa biti VIDEN (člen VII).
             */
            unavailable: boolean;
            /** @description `null`, kadar je `unavailable: true`. */
            source: components["schemas"]["SourceMeta"] | null;
        };
        MeteoStationList: {
            stations: components["schemas"]["StationOption"][];
            /** @description Koliko postaj se ujema z iskanjem, tudi kadar jih je vrnjenih manj (`?limit=`). */
            total: number;
            providers: components["schemas"]["ProviderStatus"][];
            /** @description Sklici trenutno veljavnih postaj, da vmesnik ne ugiba, katere naj označi. */
            selected: string[];
            /** @description `false` pomeni, da je `selected` privzetek namestitve in ne uporabnikova izbira. */
            chosen: boolean;
        };
        SelectedStation: {
            /** @example neverin:sveta-marina */
            ref: string;
            provider: components["schemas"]["ProviderId"];
            /** @example Neverin */
            providerLabel: string;
            /** @example sveta-marina */
            id: string;
            /**
             * @description Ime iz seznama postaj. Kadar seznama tistega omrežja ni bilo mogoče prenesti ali
             *     postaje v njem ni, je to kar oznaka — čip brez imena je še vedno uporaben
             *     preklopnik, prazen čip ni.
             */
            title: string;
            altitudeM: number | null;
            latitude: number | null;
            longitude: number | null;
            countryCode: string | null;
            /**
             * @description Ali je to postaja, ki jo dobi klic brez `?station=` — torej prva izbrana. Ista
             *     postaja je tudi tista, ki jo kaže ploščica na nadzorni plošči.
             */
            primary: boolean;
        };
        MeteoSelection: {
            /** @description Izbrane postaje v UPORABNIKOVEM vrstnem redu. Nikoli prazno. */
            stations: components["schemas"]["SelectedStation"][];
            /** @description `false` pomeni, da gre za privzetek namestitve in ne uporabnikovo izbiro. */
            chosen: boolean;
        };
    };
    responses: {
        /** @description Parameter ne ustreza pogodbi (npr. neveljaven sklic postaje ali neznan ponudnik). */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Manjka ali je neveljavna avtentikacija. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Manjka obseg `meteo:read`. */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description Podatka vira še ni (prvi zagon ob izpadu vira), postaja v zadnjih urah ni poslala
         *     meritve, ali pa se je oblika vira spremenila. Vedno z razlago v `detail` — nikoli
         *     prazne serije (člen VII).
         */
        SourceUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getMeteoHistory: {
        parameters: {
            query?: {
                /**
                 * @description Sklic postaje `<ponudnik>:<oznaka>` — `arso:VRHNIKA`, `arso:NOVA-GOR_BILJE`,
                 *     `neverin:sveta-marina`. Gola oznaka brez predpone (`VRHNIKA`) se bere kot ARSO
                 *     zaradi združljivosti nazaj.
                 *
                 *     Prepiše izbrano postajo za ta klic — člen III: kar zmore vmesnik, mora zmoči tudi
                 *     klic. Neveljavna oblika je `400`; oblika je omejena zato, ker se iz oznake sestavi
                 *     naslov, ki ga strežnik sam prenese (SSRF).
                 */
                station?: string;
                /**
                 * @description Dolžina okna PRIKAZA. Vir hrani dva dneva, zato je zgornja meja 48. Na
                 *     `precipitationWindows` ne vpliva — te se vedno računajo iz celotne serije.
                 */
                hours?: number;
                /** @description `true` doda `measurements` (posamezne meritve). Privzeto jih ni. */
                raw?: "true" | "false";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Meritve, urne vrednosti, povzetek in navedba vira. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeteoHistory"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            503: components["responses"]["SourceUnavailable"];
        };
    };
    listMeteoStations: {
        parameters: {
            query?: {
                /**
                 * @description Samo postaje enega omrežja. Neznana vrednost je `400`. Člen III: vmesnik zna
                 *     filtrirati, torej mora znati tudi klic — in odjemalec, ki ga zanima samo ARSO, ne
                 *     prenaša 1335 tujih postaj.
                 */
                provider?: "arso" | "neverin";
                /**
                 * @description Iskanje po imenu ali oznaki. Šumniki niso pomembni: `cesnjica` najde Bohinjsko
                 *     Češnjico (isto pravilo zlaganja kot v vmesniku).
                 */
                q?: string;
                /**
                 * @description Največ toliko postaj v odgovoru. `total` vseeno pove, koliko se jih ujema — brez
                 *     tega bi bil skrajšan seznam videti kot cel.
                 */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Postaje, stanje ponudnikov in trenutno veljavna izbira. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeteoStationList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    getMeteoSelection: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Izbrane postaje in podatek, ali gre za uporabnikovo izbiro. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeteoSelection"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
}
