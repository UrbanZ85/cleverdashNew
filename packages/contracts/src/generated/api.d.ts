export interface paths {
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Prijava z e-pošto in geslom
         * @description Vrne kratkoživ dostopni žeton in vzpostavi družino sej za to napravo.
         *     Obnovitveni žeton se v brskalniku vrne kot `httpOnly` piškotek, omejen na pot
         *     obnovitve; na Androidu je v telesu odgovora, ker aplikacija nima piškotkov.
         *
         *     Glave `Idempotency-Key` ta pot ne sprejema (FR-011, FR-012).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["LoginRequest"];
                };
            };
            responses: {
                /** @description Prijava uspela */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TokenResponse"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Preveč neuspelih poskusov (FR-015) */
                429: {
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
         * @description Zavrti obnovitveni žeton: prejšnji preide v stanje `used`, izda se nov v isti
         *     družini. Predložen že porabljen žeton prekliče **celotno družino** (FR-012).
         *
         *     Glave `Idempotency-Key` ta pot ne sprejema — shranjen odgovor bi vrnil žeton, ki
         *     je bil medtem zavrten.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            /** @description Na Androidu; v brskalniku žeton pride kot piškotek */
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["RefreshRequest"];
                };
            };
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
                /** @description Žeton neveljaven, iztečen ali preklican; ob zaznani ponovni uporabi je preklicana celotna družina */
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
         * Odjava te naprave
         * @description Prekliče družino sej te naprave. Druge naprave ostanejo prijavljene (FR-017).
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
                /** @description Odjavljen */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Zamenjaj geslo
         * @description Edini endpoint poleg odjave, ki je dosegljiv, dokler je `mustChangePassword`
         *     resničen (FR-014).
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
                    "application/json": components["schemas"]["PasswordChangeRequest"];
                };
            };
            responses: {
                /** @description Geslo zamenjano; vse druge družine sej so preklicane */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
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
         * @description Ena vrstica na družino sej. Omogoča preklic posamezne naprave.
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
                        "application/json": components["schemas"]["SessionFamily"][];
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
    "/auth/sessions/{familyId}": {
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
                    familyId: string;
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
        LoginRequest: {
            /** Format: email */
            email: string;
            password: string;
            /** @description Človeku berljiva oznaka naprave za seznam sej */
            deviceLabel?: string;
            /** @enum {string} */
            platform?: "web" | "android";
        };
        RefreshRequest: {
            /** @description Samo za Android; v brskalniku pride kot piškotek */
            refreshToken?: string;
        };
        TokenResponse: {
            accessToken: string;
            /** @description Veljavnost dostopnega žetona v sekundah */
            expiresIn: number;
            /** @description Samo za Android; v brskalniku je vrnjen kot httpOnly piškotek */
            refreshToken?: string;
            /** @description Dokler je resničen, so drugi endpointi zavrnjeni s 403 (FR-014) */
            mustChangePassword: boolean;
        };
        PasswordChangeRequest: {
            currentPassword: string;
            newPassword: string;
        };
        Account: {
            id: string;
            /** Format: email */
            email: string;
            scopes: string[];
            mustChangePassword: boolean;
            /** Format: date-time */
            lastLoginAt?: string | null;
        };
        SessionFamily: {
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
            /** Format: date-time */
            updatedAt?: string;
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
