export interface paths {
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Začni prijavo prek Keycloaka
         * @description Preusmeri brskalnik (`302`) na Keycloakov `authorization_endpoint` (Authorization
         *     Code + PKCE). `redirectTo` pove, kam nazaj v CleverDash preusmeriti po uspešni
         *     prijavi (FR-002); privzeto `/`.
         */
        get: {
            parameters: {
                query?: {
                    redirectTo?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Preusmeritev na Keycloak */
                302: {
                    headers: {
                        Location?: string;
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Nepričakovana napaka pri začetku prijave; telo je stran `text/html` (glej `503`). */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/html": string;
                    };
                };
                /**
                 * @description Ponudnika prijave (Keycloak) ni bilo mogoče doseči.
                 *
                 *     Na tej poti je klicatelj BRSKALNIK (navigacija, ne XHR), zato je telo stran
                 *     `text/html` in NE `application/problem+json`: dokument JSON bi se v naslovni
                 *     vrstici izrisal kot surovo besedilo, gola napaka `500` pa kot Chromova stran
                 *     "This page isn't working" brez pojasnila (člen VII). Stran imenuje razlog in
                 *     `correlationId` za dnevnik.
                 */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/html": string;
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Povratni klic Keycloaka (redirect_uri)
         * @description Izmenja avtorizacijsko kodo za žetone pri Keycloaku, ustvari/najde `User` po
         *     `keycloakSubject` (FR-003, FR-009), ob prvi prijavi ustvari privzete osebne
         *     nastavitve (specs/004-keycloak-sso-multiuser/research.md §11), nastavi `httpOnly`
         *     sejni piškotek in preusmeri (`302`) na `redirectTo` iz `/auth/login`.
         *
         *     Glave `Idempotency-Key` ta pot ne sprejema — izdaja žetonov (člen III izjema).
         */
        get: {
            parameters: {
                query: {
                    code: string;
                    state: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Prijava uspela, preusmeritev v CleverDash */
                302: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /**
                 * @description Koda neveljavna, prijavni tok potekel, ALI je uporabnik pri Keycloaku potrjen, a
                 *     nima nobene prepoznane vloge/skupine (FR-007) — sporočilo ločeno od napačnih
                 *     poverilnic.
                 *
                 *     Telo je stran `text/html` in ne `application/problem+json`: klicatelj je
                 *     BRSKALNIK, ki se vrača s Keycloaka (enako kot pri `/auth/login`, člen VII).
                 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/html": string;
                    };
                };
                /** @description Nepričakovana napaka pri zaključku prijave; telo je stran `text/html`. */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/html": string;
                    };
                };
                /** @description Ponudnika prijave ni bilo mogoče doseči; telo je stran `text/html`. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/html": string;
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Obnovi dostopni žeton
         * @description Zavrti Keycloakov `refresh_token` za trenutno sejo (data-model.md, `KeycloakSession`).
         *     Seja pride iz `httpOnly` piškotka — enako za web IN Android (Capacitorjev WebView
         *     deli piškotke z lastnimi HTTP klici).
         *
         *     Glave `Idempotency-Key` ta pot ne sprejema.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Žeton obnovljen */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TokenResponse"];
                    };
                };
                /**
                 * @description Seja neveljavna, iztekla ali preklicana pri Keycloaku (FR-005/FR-006) — vključno
                 *     s primerom, ko je Keycloak med preverjanjem nedosegljiv (FR-007).
                 */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Odjava te naprave (in enotna odjava pri Keycloaku)
         * @description Prekliče `KeycloakSession` te naprave. Vrne Keycloakov `end_session_endpoint`
         *     (RP-Initiated Logout) — SPA MORA brskalnik preusmeriti nanj, da se dejansko konča
         *     tudi Keycloakova seja (FR-004); brez tega naslednji obisk dobi tiho ponovno prijavo
         *     prek še vedno veljavne Keycloak seje.
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /**
                     * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                     *     telesom zahteve vrne `422`.
                     */
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Lokalna seja preklicana */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uri */
                            endSessionUrl: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Podatki o prijavljenem računu */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Račun */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Account"];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam aktivnih naprav
         * @description Ena vrstica na `KeycloakSession`. Omogoča preklic posamezne naprave.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Aktivne seje */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DeviceSession"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/sessions/{sessionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Prekliči sejo izbrane naprave */
        delete: {
            parameters: {
                query?: never;
                header?: {
                    /**
                     * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                     *     telesom zahteve vrne `422`.
                     */
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path: {
                    sessionId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Preklicano */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tabs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Razrešen register zavihkov
         * @description Definicije so v kodi, `enabled` in `order` se prekrijeta iz nastavitev (FR-002,
         *     FR-003). Vrne samo zavihke, ki so vklopljeni in za katere ima klicatelj obsege.
         *     Odjemalec iz tega sestavi meni in usmerjanje.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Zavihki, urejeni po `order` */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TabDefinition"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dashboard/weather": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Trenutno vreme za nastavljeno lokacijo
         * @description Podatek pride iz strežniškega predpomnilnika (TTL 600 s). Odjemalec zunanjega vira
         *     ne kliče nikoli (člen VIII). Ob nedosegljivosti vira vrne `200` z zadnjim znanim
         *     podatkom in `stale: true` — ne napake (FR-026).
         */
        get: {
            parameters: {
                query?: {
                    /** @description Ime lokacije; privzeto iz nastavitev */
                    location?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Vremenski odčitek, svež ali zadnji znani */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WeatherReading"];
                    };
                };
                /** @description Podatka še ni bilo nikoli in vir ni dosegljiv */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dashboard/forecast": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Kratka napoved za naslednjih nekaj ur
         * @description Iz istega odgovora vira in istega predpomnilnika kot trenutno vreme, zato ne dodaja
         *     zunanje odvisnosti (FR-024). Podrobna napoved po dnevih ni v obsegu.
         */
        get: {
            parameters: {
                query?: {
                    location?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Napoved */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ForecastResponse"];
                    };
                };
                /** @description Podatka še ni bilo nikoli in vir ni dosegljiv */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dashboard/radar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Animirana radarska slika padavin
         * @description Strežnik streže sliko iz predpomnilnika (TTL 300 s, usklajeno z `max-age=300`
         *     izvora). Proxy je obvezen: neposredna nešifrirana povezava bi bila na šifrirani
         *     strani zavrnjena, poleg tega brez proxyja ni zadnje znane slike (FR-025, FR-026).
         *
         *     Starost slike je v glavah `X-Source-Fetched-At` in `X-Source-Stale`, da jo
         *     odjemalec prikaže brez dodatne zahteve.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Slika, sveža ali zadnja znana */
                200: {
                    headers: {
                        /** @description Čas uspešne pridobitve iz izvora (ISO 8601) */
                        "X-Source-Fetched-At"?: string;
                        /** @description `true`, kadar je slika starejša od TTL in osvežitev ni uspela */
                        "X-Source-Stale"?: boolean;
                        /** @description Navedba vira (FR-027) */
                        "X-Source-Attribution"?: string;
                        /** @description Priporočen razmik do naslednje osvežitve — glej SourceMeta.nextPollSeconds */
                        "X-Source-Next-Poll-Seconds"?: number;
                        [name: string]: unknown;
                    };
                    content: {
                        "image/gif": string;
                    };
                };
                /** @description Slike še ni bilo nikoli in vir ni dosegljiv */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dashboard/commute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pot v službo in domov — čas poti, zamuda zaradi prometa in zemljevid
         * @description Ploščica "Pot" na nadzorni plošči. Vrne OBE smeri naenkrat: pot domov je ista pot v
         *     nasprotni smeri, in odjemalec vedno potrebuje obe (obe sta v ploščici hkrati).
         *
         *     Kraja prideta iz osebnih nastavitev (`Settings.commute`); klicatelj z API ključem
         *     osebnih nastavitev nima in dobi `configured: false`.
         *
         *     Čas poti je iz Google Routes API (`directions/v2:computeRoutes`,
         *     `TRAFFIC_AWARE`), pridobljen IZKLJUČNO prek strežniškega predpomnilnika
         *     (`COMMUTE_CACHE_SECONDS`, privzeto 300 s — člen VIII; vsaka osvežitev je plačljiva
         *     zahteva na smer). Ključ `GOOGLE_MAPS_SERVER_KEY` ostane na strežniku (člen IV) in v
         *     odgovoru ne nastopa.
         *
         *     **Odgovor je vedno `200`, tudi ko časa poti ni.** Manjkajoč podatek je opisan v
         *     `travelUnavailable` na tisti smeri, ne kot napaka celotne zahteve: izpad enega vira
         *     ne sme podreti ploščice (FR-026), uporabnik pa mora videti, KAJ je narobe in kaj
         *     storiti (člen VII). Zemljevid je odvisen samo od krajev, zato ostane na voljo tudi
         *     takrat, ko časa poti ni.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Obe smeri; posamezna je lahko brez časa poti */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CommuteResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Preberi nastavitve */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Nastavitve */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Settings"];
                    };
                };
            };
        };
        /**
         * Posodobi nastavitve
         * @description Vključuje lokacijo za vreme, temo, razporeditev in vidnost ploščic (FR-028) ter
         *     stikala zavihkov (FR-003). Delna posodobitev: navedejo se samo polja, ki se
         *     spremenijo.
         */
        put: {
            parameters: {
                query?: never;
                header?: {
                    /**
                     * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                     *     telesom zahteve vrne `422`.
                     */
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SettingsUpdate"];
                };
            };
            responses: {
                /** @description Posodobljene nastavitve */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Settings"];
                    };
                };
                400: components["responses"]["BadRequest"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Seznam registriranih naprav */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Naprave */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Device"][];
                    };
                };
            };
        };
        put?: never;
        /**
         * Registriraj napravo za potisna obvestila
         * @description Ponovna registracija istega žetona posodobi obstoječi zapis (FR-030).
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /**
                     * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                     *     telesom zahteve vrne `422`.
                     */
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["DeviceRegistration"];
                };
            };
            responses: {
                /** @description Registrirana */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Device"];
                    };
                };
                400: components["responses"]["BadRequest"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/devices/{deviceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Odjavi napravo od obvestil */
        delete: {
            parameters: {
                query?: never;
                header?: {
                    /**
                     * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                     *     telesom zahteve vrne `422`.
                     */
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path: {
                    deviceId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Odjavljena */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Pošlji testno obvestilo
         * @description Dokaže pot od strežnika do naprave in pravilno odpiranje zaslona ob tapkanju
         *     (FR-033, SC-006). Obstaja zato, da je P7 samostojno testabilna, ne da bi bilo treba
         *     čakati na 002.
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /**
                     * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                     *     telesom zahteve vrne `422`.
                     */
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description Če ni podan, gre na vse registrirane naprave */
                        deviceId?: string;
                        /** @description Pot v aplikaciji, ki naj se odpre ob tapkanju */
                        deepLink?: string;
                    };
                };
            };
            responses: {
                /** @description Sprejeto za dostavo */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            accepted?: number;
                            /** @description Žetoni, ki jih je ponudnik zavrnil in so bili odstranjeni (FR-034) */
                            removedTokens?: number;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api-keys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam ključev za avtomatizacijo
         * @description Čistopis ključa se ne vrne nikoli; v seznamu je samo predpona. Zahteva obseg
         *     `admin` — sistem je enouporabniški (FR-016), zato je to edini smiselni obseg za
         *     upravljanje ključev.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ključi */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ApiKey"][];
                    };
                };
                403: components["responses"]["Forbidden"];
            };
        };
        put?: never;
        /**
         * Ustvari ključ z omejenim obsegom
         * @description Čistopis se pokaže **samo v tem odgovoru** in ni obnovljiv. Ključ brez obsegov ni
         *     dovoljen (člen III).
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /**
                     * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                     *     telesom zahteve vrne `422`.
                     */
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        label: string;
                        scopes: string[];
                        /** Format: date-time */
                        expiresAt?: string;
                    };
                };
            };
            responses: {
                /** @description Ustvarjen */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ApiKey"] & {
                            /** @description Čistopis ključa, prikazan samo enkrat */
                            secret?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                403: components["responses"]["Forbidden"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api-keys/{keyId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Prekliči ključ */
        delete: {
            parameters: {
                query?: never;
                header?: {
                    /**
                     * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                     *     telesom zahteve vrne `422`.
                     */
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path: {
                    keyId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Preklican */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                403: components["responses"]["Forbidden"];
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Stanje sistema
         * @description Notranje stanje. Po členu VII **ne zadošča** kot alarm — mrtev proces tega ne
         *     pokliče. Zunanji dead man's switch je odhodni srčni utrip na `HEALTHCHECK_PING_URL`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Sistem deluje */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Health"];
                    };
                };
                /** @description Sistem ne deluje pravilno */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Health"];
                    };
                };
            };
        };
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
        /** @description RFC 9457. Sporočilo je v slovenščini in brez tehničnih podrobnosti (FR-026). */
        Problem: {
            type: string;
            title: string;
            status: number;
            detail?: string;
            /** @description ID korelacije iz dnevnika, da je prijavljeno napako mogoče najti */
            correlationId?: string;
        };
        TokenResponse: {
            accessToken: string;
            /** @description Veljavnost dostopnega žetona v sekundah */
            expiresIn: number;
        };
        /**
         * @description 004: `mustChangePassword` je ODSTRANJEN (FR-017 — ni več lokalnega gesla). Dodan
         *     `displayName` iz Keycloakovega `name`/`preferred_username` claima.
         */
        Account: {
            id: string;
            /** Format: email */
            email: string;
            displayName: string;
            scopes: string[];
            /** Format: date-time */
            lastLoginAt?: string | null;
        };
        DeviceSession: {
            id: string;
            deviceLabel?: string;
            /** @enum {string} */
            platform: "web" | "android";
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            lastUsedAt: string;
            /** @description Ali je to seja, iz katere je prišla ta zahteva */
            current: boolean;
        };
        /** @description Vnos registra zavihkov. `title` je slovenski, `id` in `route` sta angleška (člen X). */
        TabDefinition: {
            /** @example dashboard */
            id: string;
            /** @example Nadzorna plošča */
            title: string;
            icon: string;
            /** @example /dashboard */
            route: string;
            order: number;
            requiredScopes?: string[];
        };
        /** @description Skupna ovojnica za vse podatke zunanjega izvora. */
        SourceMeta: {
            /**
             * Format: date-time
             * @description Čas uspešne pridobitve iz izvora
             */
            fetchedAt: string;
            /** @description Starost podatka v sekundah ob tem odgovoru */
            ageSeconds?: number;
            /** @description Podatek je starejši od TTL in osvežitev ni uspela (FR-026) */
            stale: boolean;
            /**
             * @description Priporočen razmik do naslednje osvežitve (TTL predpomnilnika na strežniku).
             *     Odjemalec ta interval prevzame od strežnika namesto lastne konstante — TTL se
             *     lahko spremeni brez novega builda (FR-022, research.md §8).
             */
            nextPollSeconds?: number;
            /** @description Navedba vira; funkcionalna zahteva FR-027, ne oblikovna podrobnost */
            attribution: {
                /** @example Vir: ARSO */
                text: string;
                /** @example https://meteo.arso.gov.si */
                url: string;
            };
        };
        WeatherReading: {
            location: {
                name: string;
                latitude?: number | null;
                longitude?: number | null;
            };
            /** @description Polja, ki jih zahteva FR-023. Neuporabljena polja izvora se ne prenašajo. */
            observation: {
                temperatureC?: number | null;
                humidityPercent?: number | null;
                windSpeed?: string | null;
                windDirection?: string | null;
                /** @description Slovensko besedilo izvora, npr. "jasno" */
                skyCondition?: string | null;
                icon?: string | null;
                /**
                 * Format: date-time
                 * @description Čas meritve, prikazan v Europe/Ljubljana
                 */
                measuredAt?: string | null;
            };
            source: components["schemas"]["SourceMeta"];
        };
        ForecastResponse: {
            location: {
                name?: string;
            };
            entries: {
                /** Format: date-time */
                validAt?: string;
                temperatureC?: number | null;
                skyCondition?: string | null;
                icon?: string | null;
            }[];
            source: components["schemas"]["SourceMeta"];
        };
        TileLayoutEntry: {
            /** @example weather */
            type: string;
            position: number;
            visible: boolean;
            config?: {
                [key: string]: unknown;
            };
        };
        Settings: {
            weather: {
                locationName?: string;
                latitude?: number | null;
                longitude?: number | null;
            };
            /** @enum {string} */
            theme: "system" | "light" | "dark";
            tiles: components["schemas"]["TileLayoutEntry"][];
            /** @description Prekritja registra po id zavihka */
            tabs: {
                [key: string]: {
                    enabled?: boolean;
                    order?: number;
                };
            };
            /**
             * @description 003, specs/003-cameras/data-model.md "Nastavitve porabe podatkov" — Story 7.
             *     Modul kamer to polje samo bere/piše prek te poti, brez lastnega endpointa.
             * @default true
             */
            cameraDataSaverEnabled: boolean;
            commute?: components["schemas"]["SettingsCommute"];
            /** Format: date-time */
            updatedAt?: string;
        };
        /**
         * @description Ploščica "Pot" na nadzorni plošči: DVA KRAJA, ne dva zemljevida. Iz njiju strežnik
         *     izpelje oboje — čas poti (`GET /dashboard/commute`) in naslov vdelanega zemljevida —
         *     za obe smeri, ker je pot domov ista pot v nasprotni smeri. Zgoraj v ploščici je
         *     smer, ki ustreza času dneva; meja je 12:00 po `Europe/Ljubljana` (ista meja kot
         *     razvrstitev kamer v 003) in ni nastavljiva.
         *
         *     Vsak kraj potrebuje `address` ALI oba `latitude`/`longitude`. Koordinati imata
         *     prednost: natančnejši sta in Googlu ni treba geokodirati. Nepopoln kraj je dovoljen
         *     (vmes med vnašanjem) — ploščica takrat pove, da pot ni nastavljena.
         *
         *     Delna posodobitev velja PO KRAJU in PO POLJU: `{"commute":{"work":{"label":"…"}}}`
         *     spremeni samo ime službe. `null` ali prazen niz izprazni polje; prazno ime se vrne
         *     na privzeto (`Doma` / `Služba`).
         *
         *     `latitude` in `longitude` je treba navesti SKUPAJ — polovica para je kraj, ki ga ni
         *     mogoče poslati ne Routes API-ju ne zemljevidu, zato je zavrnjena s `400`.
         *
         *     `mapHeightPx` in `layout` sta videz ploščice, ne podatek o poti: koliko zemljevida
         *     kdo potrebuje in ali ima na nadzorni plošči prostor za dva drug ob drugem, je odvisno
         *     od zaslona. Pri `layout: horizontal` se ploščica samodejno razširi (odjemalec, glej
         *     `commuteTileWidthPx`).
         */
        SettingsCommute: {
            home?: components["schemas"]["CommutePlace"];
            work?: components["schemas"]["CommutePlace"];
            /**
             * @description Višina posameznega zemljevida. Vrednost izven mej je zavrnjena s `400` in NE tiho
             *     obrezana — uporabnik mora vedeti, da vpisano ni bilo shranjeno. `null` pomeni
             *     "vrni na privzeto".
             * @default 170
             */
            mapHeightPx: number;
            /**
             * @description `vertical` = zemljevida drug pod drugim, `horizontal` = drug ob drugem.
             * @default vertical
             * @enum {string}
             */
            layout: "vertical" | "horizontal";
        };
        CommutePlace: {
            /** @description Ime za nad zemljevidom; prazno se vrne na privzeto. */
            label?: string;
            address?: string | null;
            latitude?: number | null;
            longitude?: number | null;
        };
        /**
         * @description Iz Routes API. `delaySeconds` je `duration - staticDuration`, nikoli negativno —
         *     hitrejše od običajnega ni "zamuda". Zaradi te razlike se `staticDuration` sploh
         *     zahteva: samo "40 min" ne pove, ali je to običajno.
         */
        CommuteTravel: {
            /** @description Trajanje z upoštevanim prometom. */
            durationSeconds: number;
            /** @description Trajanje brez prometa. */
            staticDurationSeconds: number;
            delaySeconds: number;
            distanceMeters: number;
        };
        CommuteLeg: {
            /** @enum {string} */
            direction: "to-work" | "to-home";
            /** @example V službo */
            label: string;
            /** @description Ime izhodiščnega kraja. */
            from: string;
            to: string;
            /**
             * Format: uri
             * @description Naslov za `<iframe>`, ki ga sestavi strežnik (`domain/map-embed.ts`): uradni
             *     Maps Embed API, kadar je `GOOGLE_MAPS_EMBED_KEY` nastavljen, sicer klasična
             *     oblika `output=embed`, ki ključa ne potrebuje. Navadne povezave do poti Google
             *     v tujem okvirju ne dovoli. `null`, kadar kraja nista dovolj določena.
             */
            mapEmbedUrl: string | null;
            travel: components["schemas"]["CommuteTravel"] | null;
            /**
             * @description Prisoten natanko takrat, ko je `travel` `null`. Stanja so ločena, ker ima vsako
             *     svojo pot ven: kraja nista nastavljena / namestitev nima ključa / med krajema ni
             *     poti / vir ni dosegljiv in predpomnjenega podatka še nikoli ni bilo.
             * @enum {string|null}
             */
            travelUnavailable: "not-configured" | "no-api-key" | "no-route" | "source-unavailable" | null;
            /** @description `true`, kadar je čas poti zadnji znani in ne svež (FR-026). */
            stale: boolean;
            ageSeconds: number | null;
        };
        CommuteResponse: {
            /** @description `true`, kadar sta oba kraja dovolj določena za izračun poti. */
            configured: boolean;
            /** @description Vedno dva vnosa, `to-work` in `to-home`. */
            legs: components["schemas"]["CommuteLeg"][];
            source: {
                /**
                 * @description `COMMUTE_CACHE_SECONDS`. Pogosteje klicati nima smisla — do izteka TTL
                 *     strežnik vrača isti podatek in zunanjega vira ne kliče (člen VIII).
                 */
                nextPollSeconds: number;
                /** @description Navedba vira; Googlovi pogoji uporabe jo zahtevajo (kot člen VIII za ARSO). */
                attribution: {
                    text: string;
                    /** Format: uri */
                    url: string;
                };
            };
        };
        /** @description Delna posodobitev; navedejo se samo polja, ki se spremenijo. */
        SettingsUpdate: {
            weather?: {
                locationName?: string;
                latitude?: number;
                longitude?: number;
            };
            /** @enum {string} */
            theme?: "system" | "light" | "dark";
            tiles?: components["schemas"]["TileLayoutEntry"][];
            tabs?: {
                [key: string]: {
                    enabled?: boolean;
                    order?: number;
                };
            };
            cameraDataSaverEnabled?: boolean;
            commute?: components["schemas"]["SettingsCommute"];
        };
        DeviceRegistration: {
            pushToken: string;
            /** @enum {string} */
            platform: "web" | "android";
            /**
             * @default [
             *       "system"
             *     ]
             */
            channels: string[];
        };
        Device: {
            id: string;
            /** @enum {string} */
            platform: "web" | "android";
            channels: string[];
            /** Format: date-time */
            lastSeenAt: string;
            /** Format: date-time */
            lastDeliveryAt?: string | null;
        };
        ApiKey: {
            id: string;
            label: string;
            /** @description Prvih 8 znakov, da je ključ prepoznaven brez razkritja */
            keyPrefix: string;
            scopes: string[];
            /** Format: date-time */
            lastUsedAt?: string | null;
            /** Format: date-time */
            expiresAt?: string | null;
        };
        Health: {
            /** @enum {string} */
            status: "ok" | "degraded" | "failing";
            /** @example Europe/Ljubljana */
            timeZone: string;
            version?: string;
            checks: {
                /** @enum {string} */
                database?: "ok" | "failing";
                /** @enum {string} */
                configuration?: "ok" | "failing";
                externalSources?: {
                    key?: string;
                    ageSeconds?: number;
                    stale?: boolean;
                }[];
                /** @description Odhodni signal zunanjemu dead man's switchu (člen VII) */
                heartbeat?: {
                    configured?: boolean;
                    /** Format: date-time */
                    lastSentAt?: string | null;
                    /** @enum {string} */
                    lastResult?: "ok" | "failed" | "skipped";
                };
            };
        };
    };
    responses: {
        /** @description Neveljavna zahteva */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Ni avtenticiran */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Avtenticiran, a brez zahtevanega obsega */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Ni najdeno */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        /**
         * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
         *     telesom zahteve vrne `422`.
         */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
