export interface paths {
    "/flight-deals/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Glavna stran modula v enem klicu
         * @description Aktivna in neaktivna iskanja klicatelja s stanjem zadnjega preverjanja, nove ponudbe in
         *     spremembe cen od zadnjega zagona, najcenejše ponudbe, čas zadnjega uspešnega zagona
         *     namestitve in meje modula. Seznami so omejeni (`limit`, privzeto 20) in nosijo `total`,
         *     da vmesnik izpiše "… in še N" — paginacije v aplikaciji ni (FR-032).
         */
        get: operations["getFlightDealsOverview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/searches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Moja iskanja */
        get: operations["listFlightSearches"];
        put?: never;
        /**
         * Ustvari iskanje
         * @description `400` z razlogom, kadar: `maxNights < minNights`; `to < from`; `flexDays` ni nenegativno
         *     celo število; letališče ni v naboru; način `countries`/`airports` brez vrednosti;
         *     presežena meja iskanj na osebo (FR-015). Vsa sporočila so slovenski stavki za uporabnika.
         */
        post: operations["createFlightSearch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/searches/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dejansko obdobje in ocena kombinacij za osnutek (FR-007)
         * @description Ne shrani ničesar. Sprejme isti vnos kot `POST /flight-deals/searches` in vrne, kaj bi
         *     sistem iskal, če bi preverjanje teklo zdaj: razširjeno okno odhodov, okno povratkov,
         *     število kombinacij datumov, število poizvedb na vire in opozorila (npr. "okno sega v
         *     preteklost, dnevi pred danes so izpuščeni", "trajanje ne gre v obdobje — kombinacij ni",
         *     "presežena meja poizvedb na iskanje"). Pot je deklarirana PRED `/{searchId}`.
         */
        post: operations["previewFlightSearch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/searches/{searchId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                searchId: components["parameters"]["SearchId"];
            };
            cookie?: never;
        };
        /** Eno iskanje s stanjem zadnjega preverjanja */
        get: operations["getFlightSearch"];
        put?: never;
        post?: never;
        /**
         * Izbriši iskanje
         * @description Izbriše iskanje in njegova ujemanja. Ponudb in zgodovine cen NE briše — pripadajo tudi
         *     drugim iskanjem, sicer pa potečejo s TTL. Zagon, ki teče, izbrisano iskanje preskoči.
         */
        delete: operations["deleteFlightSearch"];
        options?: never;
        head?: never;
        /**
         * Uredi iskanje (tudi aktivacija in deaktivacija)
         * @description Delni vnos: izpuščeno polje pomeni "ne spreminjaj". Sprememba kriterijev NE pobriše
         *     obstoječih ujemanj — ob naslednjem preverjanju tista, ki novim pravilom ne ustrezajo,
         *     preidejo v `stale` in se ne obveščajo. `active: false` ustavi preverjanje in obveščanje,
         *     ponudbe ostanejo vidne.
         */
        patch: operations["updateFlightSearch"];
        trace?: never;
    };
    "/flight-deals/searches/{searchId}/offers": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                searchId: components["parameters"]["SearchId"];
            };
            cookie?: never;
        };
        /** Ponudbe enega iskanja */
        get: operations["listFlightSearchOffers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/searches/{searchId}/recipients/{userId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                searchId: components["parameters"]["SearchId"];
                userId: string;
            };
            cookie?: never;
        };
        get?: never;
        /**
         * Dodaj prejemnika obvestil ali mu vklopi/izklopi obveščanje
         * @description Idempotentno. `400`, kadar je `userId` lastnik (FR-040), kadar oseba ne obstaja ali se še
         *     nikoli ni prijavila, ali kadar je presežena meja prejemnikov. Prejemnik od tega trenutka
         *     vidi ponudbe tega iskanja v `GET /flight-deals/offers?scope=shared` in prejema dopise.
         */
        put: operations["setFlightSearchRecipient"];
        post?: never;
        /**
         * Odstrani prejemnika
         * @description Takojšen in idempotenten. Prejemnik ne dobi več dopisov tega iskanja in njegovih ponudb
         *     ne vidi več (FR-042). Zbirni dopis, ki je v tem trenutku že v outboxu, se pred
         *     pošiljanjem prečisti — postavke tega iskanja izpadejo.
         */
        delete: operations["removeFlightSearchRecipient"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/offers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ponudbe, ki jih klicatelj sme videti
         * @description `scope=own` — ponudbe mojih iskanj; `scope=shared` — ponudbe iskanj, pri katerih sem
         *     prejemnik (FR-031, FR-041); `scope=all` (privzeto) — oboje. Vsaka ponudba nosi `matches`:
         *     za katera iskanja ustreza, s čim je bilo zadnje preverjanje zanjo (`NEW`, `PRICE_DOWN` …)
         *     in — pri deljenih — ime lastnika. Konfiguracije tujega iskanja v odgovoru NI, samo ime.
         *
         *     `changed=true` vrne samo ponudbe, pri katerih je zadnje preverjanje prineslo spremembo
         *     (NOVO, pocenitev, podražitev) — vir za razdelka "Nove ponudbe" in "Spremembe cen".
         */
        get: operations["listFlightOffers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/offers/{offerId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                offerId: string;
            };
            cookie?: never;
        };
        /**
         * Podrobnosti ponudbe z zgodovino cen
         * @description `404`, kadar ponudba ne ustreza nobenemu iskanju, ki ga klicatelj sme videti — tudi če
         *     ponudba v bazi obstaja (FR-031). `history` je naraščajoče po `checkedAt`, vključno z
         *     `UNCHANGED` točkami za graf; `NEW` nima `previousPrice` (FR-030).
         */
        get: operations["getFlightOffer"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/airports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Iskanje letališč po imenu, mestu, kodi ali radiju (FR-003, FR-004)
         * @description Brez `near`: `q` išče po `iata`, `name` in `city`, neobčutljivo na velike črke in šumnike
         *     (ista primerjava kot `core/search/fold-text.ts` na odjemalcu). Z `near`: letališča v
         *     `radiusKm` od izhodišča, razvrščena po razdalji; izhodišče je IATA koda ali literal
         *     `home` (domači kraj iz nastavitev poti — `400`, kadar ni nastavljen). Največ 50 zadetkov;
         *     `total` pove, koliko jih je bilo.
         */
        get: operations["searchAirports"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/countries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Države z vsaj enim letališčem v naboru */
        get: operations["listAirportCountries"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Viri podatkov, kot jih sme videti uporabnik
         * @description Oznaka, ime, ali je uraden, ali je vklopljen, čas zadnjega uspeha in opozorilo za
         *     neuradni vir (FR-020). Zadnje NAPAKE tu ni — ta je administratorska (`/admin/providers`).
         */
        get: operations["listFlightProviders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/admin/scheduler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Nastavitve urnika z naslednjim terminom */
        get: operations["getFlightScheduler"];
        /**
         * Spremeni urnik
         * @description `preset` različen od `custom` prepiše `cronExpression` s pripadajočim izrazom; pri
         *     `custom` je `cronExpression` obvezen. Izraz se preveri pred shranjevanjem (FR-047) in
         *     `400` pove, zakaj ni veljaven. Sprememba velja ob naslednjem tiku, brez ponovnega zagona
         *     (FR-048). Odgovor nosi `nextRunAt` v UTC in `nextRunLocal` v coni urnika.
         */
        put: operations["updateFlightScheduler"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/admin/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Zgodovina zagonov */
        get: operations["listFlightRuns"];
        put?: never;
        /**
         * Sproži preverjanje takoj
         * @description Ustvari zagon s sprožilcem `manual` in ga začne obdelovati brez čakanja na tik. Deluje
         *     tudi pri izklopljenem urniku (FR-046). `409`, kadar zagon že teče ali čaka — telo je
         *     tisti zagon (FR-050).
         */
        post: operations["triggerFlightRun"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/admin/runs/{runId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                runId: string;
            };
            cookie?: never;
        };
        /** En zagon z napakami */
        get: operations["getFlightRun"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/admin/runs/{runId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                runId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Zahtevaj prekinitev
         * @description Nastavi `cancelRequested`; zagon se ustavi po iskanju, ki ga ravnokar obdeluje, in konča
         *     kot `cancelled`. Že zapisane spremembe ostanejo; obvestila za ta zagon se NE pošljejo.
         *     Idempotentno; na končanem zagonu `409`.
         */
        post: operations["cancelFlightRun"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/admin/providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Stanje virov z zadnjo napako (FR-053) */
        get: operations["listFlightProvidersAdmin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/flight-deals/admin/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Outbox dopisov — zadržani, neuspeli, poslani
         * @description Prejemnik je naveden z imenom in zamaskirano e-pošto, nikoli s celo (FR-044).
         */
        get: operations["listFlightNotificationsAdmin"];
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
        Problem: {
            type: string;
            title: string;
            status: number;
            detail?: string;
            correlationId?: string;
        };
        /** @description Ime iz imenika ob izpisu; e-pošte NI (010/013). */
        Person: {
            id: string;
            displayName: string;
            initials: string;
        };
        Limits: {
            maxSearchesPerUser: number;
            maxRecipients: number;
            maxQueriesPerSearch: number;
            maxFlexDays: number;
        };
        Money: {
            amount: number;
            /** @description ISO 4217 */
            currency: string;
        };
        /** @enum {string} */
        ChangeType: "NEW" | "PRICE_DOWN" | "PRICE_UP" | "UNCHANGED" | "UNAVAILABLE";
        /**
         * @description FR-017; `disabled` = vir ni vklopljen v tej namestitvi
         * @enum {string}
         */
        ProviderOutcome: "ok" | "noFlights" | "unsupported" | "unreachable" | "rateLimited" | "incomplete" | "disabled";
        DayWindow: {
            /** @description ISO (1 = ponedeljek … 7 = nedelja); prazno = kateri koli dan */
            weekdays: number[];
            /** @description Lokalni čas letališča */
            earliest: string | null;
            latest: string | null;
        };
        FlightSearchInput: {
            name: string;
            /** @default true */
            active: boolean;
            departureAirports: string[];
            destination: {
                /** @enum {string} */
                mode: "any" | "countries" | "airports";
                countries?: string[];
                airports?: string[];
            };
            excluded?: {
                countries?: string[];
                airports?: string[];
            };
            /**
             * @description `fixed`: `departDate` obvezen, `returnDate` ali `null` (enosmerno).
             *     `range`: `from` in `to` obvezna, `from <= to`.
             *     `rolling`: `months` 1–12; `flexDays` se ne upošteva.
             */
            dates: {
                /** @enum {string} */
                mode: "fixed" | "range" | "rolling";
                /** Format: date */
                departDate?: string;
                /** Format: date */
                returnDate?: string | null;
                /** Format: date */
                from?: string;
                /** Format: date */
                to?: string;
                months?: number;
            };
            /** @default 0 */
            flexDays: number;
            /** @default true */
            returnWithinWindow: boolean;
            minNights?: number | null;
            /** @description >= minNights */
            maxNights?: number | null;
            outbound?: components["schemas"]["DayWindow"];
            inbound?: components["schemas"]["DayWindow"];
            minStayHours?: number | null;
            passengers: {
                adults: number;
                /** @default [] */
                childrenAges: number[];
            };
            price?: {
                maxPerPerson?: number | null;
                maxTotal?: number | null;
                /** @default EUR */
                currency: string;
            };
            /** @default [] */
            airlines: string[];
            /** @default 0 */
            maxStops: number;
            /**
             * @default any
             * @enum {string}
             */
            baggage: "any" | "cabin" | "checked";
        };
        /** @description Vsako polje iz `FlightSearchInput` neobvezno; izpuščeno = "ne spreminjaj". */
        FlightSearchPatch: components["schemas"]["FlightSearchInput"];
        Recipient: components["schemas"]["Person"] & {
            notify: boolean;
            /** Format: date-time */
            addedAt: string;
        };
        /** @description Stanje ZADNJEGA preverjanja tega iskanja po virih (FR-017). */
        SearchCheckState: {
            runId: string;
            /** Format: date-time */
            at: string;
            outcomes: {
                providerId: string;
                outcome: components["schemas"]["ProviderOutcome"];
                /** @description Slovensko, za uporabnika */
                message?: string;
                queries: number;
                offers: number;
            }[];
        };
        SearchPreview: {
            outboundWindow: {
                /** Format: date */
                from: string;
                /** Format: date */
                to: string;
            };
            /** @description `null` pri enosmernem iskanju */
            returnWindow: {
                /** Format: date */
                from: string;
                /** Format: date */
                to: string;
            } | null;
            /** @description Pari (odhod, povratek), ki ustrezajo dnevom in trajanju */
            dateCombinations: number;
            /** @description Poizvedbe na vire (letališče × cilj × mesec) */
            queries: number;
            /** @description Presežena meja poizvedb na iskanje — iskanje bo zajelo samo del */
            truncated?: boolean;
            warnings: string[];
        };
        FlightSearch: components["schemas"]["FlightSearchInput"] & {
            id: string;
            /** @description Vedno `true` — tuje iskanje ni nikoli v odgovoru */
            isOwn: boolean;
            recipients: components["schemas"]["Recipient"][];
            preview: components["schemas"]["SearchPreview"];
            lastCheck: components["schemas"]["SearchCheckState"] | null;
            /** Format: date-time */
            lastSuccessfulCheckAt: string | null;
            /** @description Aktivna ujemanja */
            offerCount: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        Segment: {
            /** Format: date-time */
            departureAt: string;
            /** @description IANA cona odhodnega letališča (FR-011) */
            departureTz: string;
            /** Format: date-time */
            arrivalAt: string | null;
            arrivalTz: string;
            flightNumbers: string[];
            stops: number;
        };
        Airport: {
            iata: string;
            name: string;
            city: string;
            /** @description ISO 3166-1 alpha-2 */
            country: string;
            /** @description Slovensko ime */
            countryName: string;
            latitude: number;
            longitude: number;
            timezone: string;
            /** @description Samo pri iskanju po radiju */
            distanceKm?: number;
        };
        /** @description Kaj ta ponudba pomeni za ENO iskanje, ki ga klicatelj sme videti. */
        OfferMatch: {
            searchId: string;
            searchName: string;
            isOwn: boolean;
            /** @description Samo pri deljenem iskanju (FR-041); pri lastnem `null` */
            owner?: components["schemas"]["Person"] | null;
            changeType: components["schemas"]["ChangeType"];
            /** Format: date-time */
            firstMatchedAt: string;
            /** @enum {string} */
            status: "active" | "unavailable" | "stale";
        };
        Offer: {
            id: string;
            providerId: string;
            providerLabel: string;
            /** @description `false` = neuradni vir; vmesnik to označi (FR-020) */
            providerOfficial: boolean;
            airline: string;
            airlineName: string | null;
            origin: components["schemas"]["Airport"];
            destination: components["schemas"]["Airport"];
            outbound: components["schemas"]["Segment"];
            inbound: components["schemas"]["Segment"] | null;
            nights: number | null;
            price: components["schemas"]["Money"];
            pricePerPerson: components["schemas"]["Money"];
            /** @description Kaj vir pravi, da cena vključuje (FR-013) */
            priceIncludes: string | null;
            /** @description Zadnja DRUGAČNA cena; `null` pri NOVO (FR-030) */
            previousPrice: components["schemas"]["Money"] | null;
            /** @description `null`, kadar zgodovinske cene ni — primerjave se NE prikaže */
            change: {
                type: components["schemas"]["ChangeType"];
                /** @description Nova minus stara, v valuti ponudbe */
                absolute: number;
                /** @description Zaokroženo na eno decimalko */
                percent: number;
            } | null;
            passengers: {
                adults: number;
                children: number;
            };
            fare?: {
                type?: string | null;
                baggage?: string | null;
            };
            /** @description Samo, če gostitelj pripada viru */
            bookingUrl: string | null;
            /**
             * Format: date-time
             * @description Čas podatka pri viru — pri predpomnjenih virih starejši od `lastCheckedAt`
             */
            dataAt: string;
            /** Format: date-time */
            lastCheckedAt: string;
            /** @enum {string} */
            availability: "available" | "unavailable";
            matches: components["schemas"]["OfferMatch"][];
        };
        OfferList: {
            offers: components["schemas"]["Offer"][];
            /** @description Koliko jih ustreza filtru; `offers` jih ima največ `limit` */
            total: number;
        };
        HistoryPoint: {
            /** Format: date-time */
            checkedAt: string;
            price: components["schemas"]["Money"] | null;
            previousPrice: components["schemas"]["Money"] | null;
            changeType: components["schemas"]["ChangeType"];
        };
        OfferDetail: components["schemas"]["Offer"] & {
            history: components["schemas"]["HistoryPoint"][];
        };
        Overview: {
            searches: components["schemas"]["FlightSearch"][];
            newOffers: components["schemas"]["OfferList"];
            priceChanges: components["schemas"]["OfferList"];
            cheapest: components["schemas"]["OfferList"];
            /** @description Zadnji zagon namestitve, ki se je končal; `null`, dokler ni bilo nobenega */
            lastRun: {
                /** Format: date-time */
                at: string;
                status: string;
            } | null;
            limits: components["schemas"]["Limits"];
        };
        ProviderPublic: {
            id: string;
            label: string;
            official: boolean;
            enabled: boolean;
            /** Format: date-time */
            lastSuccessAt: string | null;
            /** @description Slovensko opozorilo, npr. "podatki do 48 ur stari" ali "neuradni vir" */
            notice: string | null;
        };
        ProviderAdmin: components["schemas"]["ProviderPublic"] & {
            /** Format: date-time */
            lastErrorAt: string | null;
            lastError: string | null;
            lastOutcome: components["schemas"]["ProviderOutcome"] | null;
            /** @description Zagoni danes, v katerih je bil vir vprašan */
            requestsToday: number;
            /** @description Omejitev zagonov na dan (neuradni vir: 2); `null` = brez */
            dailyLimit: number | null;
        };
        SchedulerSettings: {
            enabled: boolean;
            /** @enum {string} */
            preset: "daily-06" | "daily-06-18" | "every-6h" | "monday-08" | "custom";
            cronExpression: string;
            timezone: string;
            /**
             * Format: date-time
             * @description `null`, kadar je izklopljen
             */
            nextRunAt: string | null;
            /** @description Isti trenutek, izpisan v coni urnika */
            nextRunLocal: string | null;
            /** @description Preprosti urniki z izrazi, ki jih vmesnik ponudi (FR-046) */
            presets: {
                id: string;
                label: string;
                cronExpression: string;
            }[];
            /** Format: date-time */
            updatedAt: string;
            updatedBy: components["schemas"]["Person"] | null;
        };
        Run: {
            id: string;
            /** @enum {string} */
            trigger: "schedule" | "manual";
            /** @enum {string} */
            status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled" | "interrupted";
            /** Format: date-time */
            scheduledFor: string | null;
            /** Format: date-time */
            startedAt: string | null;
            /** Format: date-time */
            finishedAt: string | null;
            requestedBy: components["schemas"]["Person"] | null;
            cancelRequested: boolean;
            counters: {
                rules: number;
                queries: number;
                /** @description Dejanski klici na vire; manj od `queries`, kadar predpomnilnik zadene */
                providerRequests: number;
                offersSeen: number;
                newMatches: number;
                priceDrops: number;
                priceRises: number;
                unavailable: number;
                notificationsPending: number;
                notificationsSent: number;
                notificationsSuppressed: number;
                notificationsFailed: number;
            };
            providers: {
                providerId: string;
                enabled: boolean;
                ok: number;
                noFlights: number;
                unsupported: number;
                unreachable: number;
                rateLimited: number;
                incomplete: number;
            }[];
            errors: {
                /** Format: date-time */
                at: string;
                providerId?: string;
                searchId?: string;
                code: string;
                /** @description Brez skrivnosti in brez e-naslovov (FR-054) */
                message: string;
            }[];
        };
        NotificationAdmin: {
            id: string;
            runId: string;
            recipient: components["schemas"]["Person"] & {
                /** @description Zamaskirana e-pošta kot v imeniku */
                emailHint: string;
            };
            /** @enum {string} */
            status: "pending" | "sending" | "sent" | "failed" | "suppressed";
            /** @enum {string|null} */
            suppressedReason: "smtp-not-configured" | "no-email" | "user-missing" | null;
            attemptCount: number;
            /** Format: date-time */
            nextAttemptAt: string | null;
            /** Format: date-time */
            sentAt: string | null;
            lastError: string | null;
            itemCount: number;
            /** Format: date-time */
            createdAt: string;
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
        /** @description Manjka obseg ali klicatelj ni administrator-človek */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Zapisa ni ALI ga klicatelj ne sme videti */
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
        SearchId: string;
        IdempotencyKey: string;
        /** @description `appeared` = po `firstMatchedAt` padajoče; `change` = največja pocenitev najprej */
        OfferSort: "price" | "departure" | "appeared" | "change";
        IncludeUnavailable: "true" | "false";
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getFlightDealsOverview: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Pregled */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Overview"];
                };
            };
        };
    };
    listFlightSearches: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Iskanja klicatelja, najnovejše spremembe najprej */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        searches: components["schemas"]["FlightSearch"][];
                        limits: components["schemas"]["Limits"];
                    };
                };
            };
        };
    };
    createFlightSearch: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FlightSearchInput"];
            };
        };
        responses: {
            /** @description Ustvarjeno iskanje s `preview` */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FlightSearch"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    previewFlightSearch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FlightSearchInput"];
            };
        };
        responses: {
            /** @description Predogled */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SearchPreview"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    getFlightSearch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                searchId: components["parameters"]["SearchId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Iskanje */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FlightSearch"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    deleteFlightSearch: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                searchId: components["parameters"]["SearchId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Izbrisano */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        deleted: boolean;
                    };
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    updateFlightSearch: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                searchId: components["parameters"]["SearchId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FlightSearchPatch"];
            };
        };
        responses: {
            /** @description Posodobljeno iskanje */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FlightSearch"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
        };
    };
    listFlightSearchOffers: {
        parameters: {
            query?: {
                /** @description `appeared` = po `firstMatchedAt` padajoče; `change` = največja pocenitev najprej */
                sort?: components["parameters"]["OfferSort"];
                includeUnavailable?: components["parameters"]["IncludeUnavailable"];
                limit?: number;
            };
            header?: never;
            path: {
                searchId: components["parameters"]["SearchId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ponudbe, ki ustrezajo temu iskanju */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OfferList"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    setFlightSearchRecipient: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                searchId: components["parameters"]["SearchId"];
                userId: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    /** @default true */
                    notify?: boolean;
                };
            };
        };
        responses: {
            /** @description Iskanje s posodobljenim seznamom prejemnikov */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FlightSearch"];
                };
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    removeFlightSearchRecipient: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                searchId: components["parameters"]["SearchId"];
                userId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Iskanje */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FlightSearch"];
                };
            };
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    listFlightOffers: {
        parameters: {
            query?: {
                scope?: "all" | "own" | "shared";
                /** @description Omeji na eno iskanje (lastno ali deljeno) */
                searchId?: string;
                changed?: "true" | "false";
                /** @description `appeared` = po `firstMatchedAt` padajoče; `change` = največja pocenitev najprej */
                sort?: components["parameters"]["OfferSort"];
                includeUnavailable?: components["parameters"]["IncludeUnavailable"];
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ponudbe */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OfferList"];
                };
            };
        };
    };
    getFlightOffer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                offerId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ponudba */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OfferDetail"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    searchAirports: {
        parameters: {
            query?: {
                q?: string;
                /** @description IATA koda ali `home` */
                near?: string;
                radiusKm?: number;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Letališča */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        airports: components["schemas"]["Airport"][];
                        total: number;
                    };
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    listAirportCountries: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Države, razvrščene po slovenskem imenu */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        countries: {
                            /** @description ISO 3166-1 alpha-2 */
                            code: string;
                            /** @description Slovensko ime (Intl.DisplayNames) */
                            name: string;
                            airportCount: number;
                        }[];
                    };
                };
            };
        };
    };
    listFlightProviders: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Viri */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        providers: components["schemas"]["ProviderPublic"][];
                    };
                };
            };
        };
    };
    getFlightScheduler: {
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
                    "application/json": components["schemas"]["SchedulerSettings"];
                };
            };
            403: components["responses"]["Forbidden"];
        };
    };
    updateFlightScheduler: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    enabled?: boolean;
                    /** @enum {string} */
                    preset?: "daily-06" | "daily-06-18" | "every-6h" | "monday-08" | "custom";
                    /** @description Pet polj, standardna sintaksa */
                    cronExpression?: string;
                    /** @description IANA; privzeto Europe/Ljubljana */
                    timezone?: string;
                };
            };
        };
        responses: {
            /** @description Nastavitve */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SchedulerSettings"];
                };
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
        };
    };
    listFlightRuns: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zagoni, najnovejši najprej */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        runs: components["schemas"]["Run"][];
                        /** @description Zagon, ki trenutno teče ali čaka, sicer `null` */
                        active: components["schemas"]["Run"] | null;
                    };
                };
            };
            403: components["responses"]["Forbidden"];
        };
    };
    triggerFlightRun: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zagon sprejet */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Run"];
                };
            };
            403: components["responses"]["Forbidden"];
            /** @description Eno preverjanje že teče */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    getFlightRun: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                runId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zagon */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Run"];
                };
            };
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    cancelFlightRun: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                runId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zagon */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Run"];
                };
            };
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description Zagon je že končan */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    listFlightProvidersAdmin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Viri */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        providers: components["schemas"]["ProviderAdmin"][];
                        /** @description Ali je pošta nastavljena (FR-038). Gostitelja in uporabnika NI v odgovoru. */
                        email: {
                            configured: boolean;
                        };
                    };
                };
            };
            403: components["responses"]["Forbidden"];
        };
    };
    listFlightNotificationsAdmin: {
        parameters: {
            query?: {
                status?: "pending" | "sending" | "sent" | "failed" | "suppressed";
                runId?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dopisi */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        notifications: components["schemas"]["NotificationAdmin"][];
                    };
                };
            };
            403: components["responses"]["Forbidden"];
        };
    };
}
