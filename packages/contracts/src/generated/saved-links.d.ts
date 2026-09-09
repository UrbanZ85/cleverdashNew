export interface paths {
    "/saved-links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam shranjenih zapisov
         * @description Vrne zapise prijavljenega uporabnika, razvrščene po `(groupId, order)`. Brez
         *     parametrov vrne vse — zbirka je po predpostavki nekaj sto zapisov (spec.md,
         *     Assumptions), zato odjemalec seznam naloži enkrat in po njem išče v pomnilniku
         *     (SC-003). Parametra `q` in `groupId` obstajata zato, da je isto iskanje mogoče
         *     opraviti tudi s HTTP klicem (člen III). Zahtevani obseg: `saved-links:read`.
         */
        get: operations["listSavedLinks"];
        put?: never;
        /**
         * Shrani stran
         * @description Zapis nastane TAKOJ; branje imena strani ga ne sme preprečiti (FR-004). Strežnik
         *     nato znotraj proračuna 2,5 s poskusi prebrati `<title>` in razrešiti favicon
         *     (research.md §2) — izid je v `metadataStatus`, zapis pa obstane v vsakem primeru.
         *
         *     Če uporabnik `title` pošlje sam, se samodejno prebrano ime NE uporabi
         *     (`titleSource: manual`, FR-014).
         *
         *     Zahtevani obseg: `saved-links:write`.
         */
        post: operations["createSavedLink"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/saved-links/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Vrstni red zapisov znotraj mape
         * @description Ena operacija s celotnim seznamom ID-jev v želenem vrstnem redu (FR-032). Zapisi, ki
         *     v seznamu niso, ostanejo nedotaknjeni — tako prerazporeditev ene mape ne premeša
         *     drugih. Zahtevani obseg: `saved-links:write`.
         */
        put: operations["reorderSavedLinks"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/saved-links/{linkId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                linkId: components["parameters"]["LinkId"];
            };
            cookie?: never;
        };
        /**
         * En zapis
         * @description Zahtevani obseg: `saved-links:read`.
         */
        get: operations["getSavedLink"];
        put?: never;
        post?: never;
        /**
         * Izbriši zapis
         * @description Zahtevani obseg: `saved-links:write`.
         */
        delete: operations["deleteSavedLink"];
        options?: never;
        head?: never;
        /**
         * Popravi zapis
         * @description Poslana polja se prepišejo, izpuščena ostanejo. Poslani `title` pomeni ročni vnos in
         *     nastavi `titleSource: manual` — samodejno branje ga po tem ne prepiše več (FR-014).
         *     Sprememba `url` pomeni novo normalizacijo; metapodatki se ob tem NE preberejo
         *     samodejno (za to je `/refresh-metadata`, da popravek naslova ne pomeni tihega
         *     odhodnega klica). Zahtevani obseg: `saved-links:write`.
         */
        patch: operations["updateSavedLink"];
        trace?: never;
    };
    "/saved-links/{linkId}/refresh-metadata": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                linkId: components["parameters"]["LinkId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Znova preberi ime strani in favicon
         * @description Edini način, da se metapodatki preberejo po nastanku zapisa (FR-014) — samodejnega
         *     ponovnega branja ni, ker bi pomenilo klicanje tujih strani brez povoda (člen VIII).
         *
         *     Ime se prepiše SAMO, če je `titleSource: auto` ali če je poslano `force: true`.
         *     Zahtevani obseg: `saved-links:write`.
         */
        post: operations["refreshSavedLinkMetadata"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/saved-links/{linkId}/favicon": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                linkId: components["parameters"]["LinkId"];
            };
            cookie?: never;
        };
        /**
         * Favicon strani, postrežen prek strežnika
         * @description Bajti favicona gredo prek strežnika in obstoječega predpomnilnika s ključem po
         *     GOSTITELJU (`favicon:<gostitelj>`, TTL 7 dni, research.md §4). Odjemalec tujega
         *     gostitelja ne kliče nikoli (člen VIII, SC-005).
         *
         *     Pot je namenoma vezana na ZAPIS in ne na poljuben gostitelj (`?host=`): sicer bi
         *     bila to odprta slikovna preusmeritev, prek katere bi vsak prijavljen uporabnik
         *     prenašal poljubne naslove.
         *
         *     Zahtevani obseg: `saved-links:read`.
         */
        get: operations["getSavedLinkFavicon"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/saved-link-groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam map
         * @description Razvrščene po `order`. Zahtevani obseg: `saved-links:read`.
         */
        get: operations["listSavedLinkGroups"];
        put?: never;
        /**
         * Nova mapa
         * @description Zahtevani obseg: `saved-links:write`.
         */
        post: operations["createSavedLinkGroup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/saved-link-groups/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Vrstni red map
         * @description Zahtevani obseg: `saved-links:write`.
         */
        put: operations["reorderSavedLinkGroups"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/saved-link-groups/{groupId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: components["parameters"]["GroupId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Izbriši mapo
         * @description Zapisi iz mape se PREMAKNEJO med nerazvrščene (FR-022, research.md §8) — brisanje
         *     mape ne izbriše nobenega zapisa. Odgovor pove, koliko jih je bilo premaknjenih.
         *     Zahtevani obseg: `saved-links:write`.
         */
        delete: operations["deleteSavedLinkGroup"];
        options?: never;
        head?: never;
        /**
         * Preimenuj ali zloži mapo
         * @description Zahtevani obseg: `saved-links:write`.
         */
        patch: operations["updateSavedLinkGroup"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description RFC 9457 problem details — ista oblika kot 001/002/003/005. */
        Problem: {
            type: string;
            title: string;
            status: number;
            detail?: string;
            correlationId?: string;
        };
        /**
         * @description Izid zadnjega branja strani. `skipped` = naslov ni prestal varovala odhodnih
         *     naslovov in strežnik strani NI obiskal (zasebno omrežje, poverilnice v naslovu).
         *     `failed` = prekoračen proračun 2,5 s, napaka omrežja, ali odgovor, ki ni HTML.
         *     Nobeno od tega ne pomeni, da zapis ni veljaven (FR-004).
         * @enum {string}
         */
        MetadataStatus: "ok" | "skipped" | "failed";
        /**
         * @description `manual` = ime je vpisal uporabnik in samodejno branje ga ne sme prepisati (FR-014).
         *     `auto` = ime je prebrano s strani, ali pa je nadomestek (gostitelj naslova).
         * @enum {string}
         */
        TitleSource: "manual" | "auto";
        SavedLinkInput: {
            /**
             * @description Naslov strani. Manjkajoča shema se dopolni v `https://` (FR-002); shema, ki ni
             *     `http`/`https`, je zavrnjena s `400` (FR-003). `http://` in naslov v zasebnem
             *     omrežju sta VELJAVNA zapisa — strežnik ju samo ne obišče (research.md §5).
             */
            url: string;
            /** @description Izpuščeno pomeni "preberi s strani, sicer uporabi gostitelja". */
            title?: string;
            /**
             * @description Zakaj sem to stran shranil — polje, ki ga je imela tudi stara stran "Useful
             *     links" (`linkDescription`), tam kot OBVEZNO. Tu je neobvezno: prisiljen komentar
             *     ob shranjevanju je razlog, da stran raje ni shranjena.
             */
            comment?: string | null;
            /**
             * @description Ime Ionicons ikone iz nabora, ki ga pozna odjemalec. `null` pomeni "brez
             *     izbire" in prepusti mesto faviconu (research.md §9).
             */
            icon?: string | null;
            /** @description `null` = nerazvrščeno; veljavno stanje, ne pomanjkljivost. */
            groupId?: string | null;
        };
        /** @description Vsa polja so neobvezna; izpuščena ostanejo nespremenjena. */
        SavedLinkPatch: {
            url?: string;
            title?: string;
            comment?: string | null;
            icon?: string | null;
            groupId?: string | null;
        };
        SavedLink: {
            id: string;
            url: string;
            title: string;
            titleSource: components["schemas"]["TitleSource"];
            comment?: string | null;
            icon?: string | null;
            /**
             * @description Ali je favicon razrešen. Sam naslov favicona ni v odgovoru — bajti gredo prek
             *     `GET /saved-links/{linkId}/favicon`, da odjemalec tujega gostitelja ne kliče
             *     (člen VIII).
             */
            hasFavicon?: boolean;
            groupId: string | null;
            order: number;
            metadataStatus: components["schemas"]["MetadataStatus"];
            /** Format: date-time */
            metadataFetchedAt?: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        CreatedSavedLink: components["schemas"]["SavedLink"] & {
            /**
             * @description ID obstoječega zapisa z istim normaliziranim naslovom, sicer `null`. Ni
             *     napaka — dvojnik je dovoljen (FR-005), vmesnik nanj samo opozori.
             */
            duplicateOfId?: string | null;
        };
        SavedLinkGroup: {
            id: string;
            name: string;
            order: number;
            collapsed: boolean;
            /** @description Koliko zapisov je v mapi — da vmesnik ob brisanju pove, kaj se bo premaknilo. */
            linkCount?: number;
        };
    };
    responses: {
        /** @description Manjka ali je neveljavna avtentikacija. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Manjka zahtevani obseg (`saved-links:read` / `saved-links:write`). */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description Zapisa ni — ali pa ni uporabnikov. Namenoma isti odgovor: obstoj tujega zapisa ni
         *     podatek, ki bi ga API razkril (vzorec 004).
         */
        NotFoundOrNotYours: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        LinkId: string;
        GroupId: string;
        /**
         * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
         *     (člen III).
         */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listSavedLinks: {
        parameters: {
            query?: {
                /**
                 * @description Iskalni niz. Ujemanje je po IMENU, NASLOVU in OPISU hkrati (FR-030), neobčutljivo
                 *     na velike črke in na diakritiko — `cas` najde `Beleženje časa`. Vsebina se
                 *     obravnava kot dobesedno besedilo, ne kot regularni izraz.
                 */
                q?: string;
                /**
                 * @description Omeji na eno mapo. Vrednost `none` pomeni nerazvrščene zapise (`groupId: null`).
                 *     Izpuščen parameter pomeni vse mape — tudi pri iskanju (FR-031).
                 */
                groupId?: string | null;
                /** @description Omejitev števila zapisov; brez njega ni omejitve. */
                limit?: number;
                /**
                 * @description `manual` = uporabnikov vrstni red `(groupId, order)`. `recent` = po času nastanka
                 *     navzdol; to uporablja ploščica na nadzorni plošči (FR-050).
                 */
                sort?: "manual" | "recent";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam zapisov */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        links: components["schemas"]["SavedLink"][];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    createSavedLink: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III).
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SavedLinkInput"];
            };
        };
        responses: {
            /**
             * @description Zapis je nastal. `duplicateOfId` ni napaka — pove, da isti normalizirani naslov
             *     uporabnik že ima (research.md §10), da vmesnik lahko ponudi obstoječega.
             */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedSavedLink"];
                };
            };
            /**
             * @description Naslov ni veljaven: shema ni `http`/`https` (`javascript:`, `data:`, `file:`),
             *     naslov je daljši od 2048 znakov, ali ime/komentar presega dolžino.
             */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            /** @description Navedena mapa (`groupId`) ne obstaja ali ni uporabnikova. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    reorderSavedLinks: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III).
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Mapa, katere vrstni red se ureja; `null` = nerazvrščeni. */
                    groupId?: string | null;
                    /** @description ID-ji v želenem vrstnem redu; položaj v seznamu postane `order`. */
                    linkIds: string[];
                };
            };
        };
        responses: {
            /** @description Vrstni red je shranjen. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Seznam vsebuje ID, ki ni v navedeni mapi. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    getSavedLink: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                linkId: components["parameters"]["LinkId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zapis */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedLink"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
        };
    };
    deleteSavedLink: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III).
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                linkId: components["parameters"]["LinkId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Izbrisano. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
        };
    };
    updateSavedLink: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III).
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                linkId: components["parameters"]["LinkId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SavedLinkPatch"];
            };
        };
        responses: {
            /** @description Popravljeni zapis */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedLink"];
                };
            };
            /** @description Neveljaven naslov ali predolgo polje. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
        };
    };
    refreshSavedLinkMetadata: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III).
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                linkId: components["parameters"]["LinkId"];
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    /**
                     * @description `true` prepiše tudi ime, ki ga je vpisal uporabnik. Vmesnik to ponudi
                     *     izrecno ("prevzemi ime s strani"), ne kot privzeto vedenje.
                     * @default false
                     */
                    force?: boolean;
                };
            };
        };
        responses: {
            /**
             * @description Izid branja. `metadataStatus: skipped` pomeni, da naslov ni prestal varovala
             *     odhodnih naslovov in strežnik strani ni obiskal — to ni napaka.
             */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedLink"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
        };
    };
    getSavedLinkFavicon: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                linkId: components["parameters"]["LinkId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Slika favicona */
            200: {
                headers: {
                    /** @description `private, max-age=604800` — odjemalec je ne prenaša znova. */
                    "Cache-Control"?: string;
                    "X-Source-Fetched-At"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "image/*": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            /**
             * @description Zapis ni uporabnikov, ali favicona ni (stran ga nima, naslov ni prestal varovala,
             *     prenos je spodletel). Odjemalec ob tem izriše ikono — to ni napaka, ki bi jo bilo
             *     treba pokazati uporabniku.
             */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    listSavedLinkGroups: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam map */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        groups: components["schemas"]["SavedLinkGroup"][];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    createSavedLinkGroup: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III).
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                };
            };
        };
        responses: {
            /** @description Mapa je nastala. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedLinkGroup"];
                };
            };
            /** @description Mapa s tem imenom pri tem uporabniku že obstaja. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    reorderSavedLinkGroups: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III).
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    groupIds: string[];
                };
            };
        };
        responses: {
            /** @description Vrstni red je shranjen. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    deleteSavedLinkGroup: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III).
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                groupId: components["parameters"]["GroupId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Mapa je izbrisana. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Koliko zapisov je postalo nerazvrščenih. */
                        movedLinks: number;
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
        };
    };
    updateSavedLinkGroup: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III).
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                groupId: components["parameters"]["GroupId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    collapsed?: boolean;
                };
            };
        };
        responses: {
            /** @description Popravljena mapa */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedLinkGroup"];
                };
            };
            /** @description Ime je zasedeno. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
        };
    };
}
