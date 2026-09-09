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
         *     Postaja se določi v tem vrstnem redu: `?station=` → `Settings.meteo.station` →
         *     `ARSO_DEFAULT_STATION` iz okolja. `station.chosen` pove, ali je šlo za uporabnikovo
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
         * Vse ARSO samodejne postaje
         * @description Seznam postaj z oznako za naslov in imenom za človeka, urejen po imenu po slovensko.
         *     Namen je en sam: da se postaja v nastavitvah IZBERE s seznama in ne vpiše na pamet —
         *     oznaka v naslovu namreč ni ime kraja (postaja "Bilje Nova Gorica" je `NOVA-GOR_BILJE`).
         *
         *     Predpomni se dlje kot meritve (`METEO_STATIONS_CACHE_SECONDS`, privzeto 6 ur): iz istega
         *     vira se bere samo ovojnica postaje, ki se spremeni nekajkrat na leto.
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
         * @description Od kod je podatek in kako star je. `attribution` je del PODATKA in ne stvar odjemalčeve
         *     predloge — člen VIII zahteva, da so ARSO podatki vedno prikazani z navedbo vira, in
         *     odjemalec je tako ne more pozabiti izrisati.
         */
        SourceMeta: {
            /**
             * Format: uri
             * @description Naslov izvorne strani — v vmesniku povezava "poglej pri ARSO".
             */
            url: string;
            /** Format: date-time */
            fetchedAt: string;
            ageSeconds: number;
            /** @description Podatek je starejši od TTL in osvežitev ni uspela — prikaže se z oznako starosti. */
            stale: boolean;
            /** @description Čez koliko sekund naj odjemalec poskusi znova. Interval pove strežnik, ne odjemalec. */
            nextPollSeconds: number;
            attribution: {
                /** @example Vir: ARSO */
                text: string;
                /** Format: uri */
                url: string;
            };
        };
        MeteoStation: {
            /**
             * @description Oznaka postaje, kakor nastopa v ARSO naslovu.
             * @example VRHNIKA
             * @example NOVA-GOR_BILJE
             */
            id: string;
            /** @example Vrhnika */
            title: string;
            altitudeM: number | null;
            latitude: number | null;
            longitude: number | null;
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
            /** @description Povprečna hitrost v intervalu. */
            windAvgKmh?: number | null;
            /** @description Najmočnejši sunek v intervalu. */
            windMaxKmh?: number | null;
            /** @description Smer, IZ KATERE piha veter (meteorološki dogovor). */
            windDirectionDeg?: number | null;
            /** @description Vsota padavin v intervalu (ne od začetka dneva). */
            precipitationMm?: number | null;
            /** @description ARSO-jeva vsota padavin od 6. oz. 18. ure UTC dalje. */
            precipitation12hMm?: number | null;
            pressureMslHpa?: number | null;
            /** @description Tlak na lokaciji (nereduciran). */
            pressureHpa?: number | null;
            globalRadiationWm2?: number | null;
            diffuseRadiationWm2?: number | null;
            snowCm?: number | null;
            waterTemperatureC?: number | null;
            /** @description Ime ARSO ikone pojava/oblačnosti (npr. `mostClear`), brez pripone. */
            cloudsIcon?: string | null;
        };
        /**
         * @description Urna vrednost. `startUtc` je začetek koledarske ure v coni `Europe/Ljubljana` kot
         *     instant — edini ključ, po katerem je vedro nedvoumno tudi ob prehodu na zimski čas, ko
         *     se ura 02 zgodi dvakrat in imata obe vedri `label` `"02"`.
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
        };
        MeteoHistory: {
            station: components["schemas"]["MeteoStation"];
            /** @description Dolžina uporabljenega okna v urah. */
            hours: number;
            buckets: components["schemas"]["HourBucket"][];
            /** @description Posamezne meritve. Prisotno SAMO ob `?raw=true`. */
            measurements?: components["schemas"]["Measurement"][];
            summary: components["schemas"]["Summary"];
            available: components["schemas"]["AvailableSeries"];
            source: components["schemas"]["SourceMeta"];
        };
        StationOption: {
            /** @example VRHNIKA */
            id: string;
            /** @example Vrhnika */
            title: string;
            altitudeM: number | null;
            latitude: number | null;
            longitude: number | null;
        };
        MeteoStationList: {
            stations: components["schemas"]["StationOption"][];
            /** @description Trenutno veljavna postaja, da vmesnik ne ugiba, katero naj v seznamu označi. */
            selected: {
                id: string;
                chosen: boolean;
            };
            source: components["schemas"]["SourceMeta"];
        };
    };
    responses: {
        /** @description Parameter ne ustreza pogodbi (npr. neveljavna oznaka postaje). */
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
         * @description Podatka vira še ni (prvi zagon ob izpadu ARSO), postaja v zadnjih urah ni poslala
         *     meritve, ali pa se je oblika ARSO strani spremenila. Vedno z razlago v `detail` —
         *     nikoli prazne serije (člen VII).
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
                 * @description Oznaka postaje (`domain_meteosiId` brez zaključnega podčrtaja, npr. `VRHNIKA` ali
                 *     `NOVA-GOR_BILJE`). Prepiše izbrano postajo za ta klic — člen III: kar zmore vmesnik,
                 *     mora zmoči tudi klic. Neveljavna oblika je `400`; oblika je omejena zato, ker se iz
                 *     oznake sestavi naslov, ki ga strežnik sam prenese.
                 */
                station?: string;
                /** @description Dolžina okna. Vir hrani dva dneva, zato je zgornja meja 48. */
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
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Postaje in trenutno veljavna izbira. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeteoStationList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            503: components["responses"]["SourceUnavailable"];
        };
    };
}
