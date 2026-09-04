export interface paths {
    "/dashboard/plugins": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Seznam lastnih vtičnikov */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Seznam, urejen po imenu. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            plugins: components["schemas"]["Plugin"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /** Ustvari vtičnik */
        post: {
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
                    "application/json": components["schemas"]["PluginInput"];
                };
            };
            responses: {
                /** @description Ustvarjen. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Plugin"];
                    };
                };
                /**
                 * @description Neveljavna definicija. Med drugim: naslov ni `https`, kaže v zasebno omrežje ali
                 *     vsebuje poverilnice; vrsta `json` brez polj ali z neveljavno potjo; podvojeno
                 *     ime; `refreshSeconds` pod 30.
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
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dashboard/plugins/{pluginId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                pluginId: components["parameters"]["PluginId"];
            };
            cookie?: never;
        };
        /** Podrobnosti vtičnika */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pluginId: components["parameters"]["PluginId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Vtičnik. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Plugin"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        /** Posodobi vtičnik */
        put: {
            parameters: {
                query?: never;
                header?: {
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path: {
                    pluginId: components["parameters"]["PluginId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PluginInput"];
                };
            };
            responses: {
                /** @description Posodobljen. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Plugin"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        post?: never;
        /** Izbriši vtičnik */
        delete: {
            parameters: {
                query?: never;
                header?: {
                    "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                };
                path: {
                    pluginId: components["parameters"]["PluginId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /**
                 * @description Izbrisan. Vnos v `Settings.tiles`, ki kaže na izbrisan vtičnik, se NE pospravi
                 *     samodejno — nadzorna plošča ga ob branju preskoči (isti dogovor kot za neznano
                 *     vrsto ploščice).
                 */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dashboard/plugins/{pluginId}/data": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                pluginId: components["parameters"]["PluginId"];
            };
            cookie?: never;
        };
        /**
         * Podatek vtičnika, prenesen prek strežnika
         * @description Na voljo samo za vrsti `image` in `json`. Člen VIII ustave prepoveduje, da bi
         *     zunanji vir klical odjemalec — prenos gre skozi strežniški predpomnilnik s
         *     `refreshSeconds` kot TTL, enako kot `GET /dashboard/radar`.
         *
         *     Za `link` in `iframe` vrne `400`: ta naslova odpre brskalnik sam.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    pluginId: components["parameters"]["PluginId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /**
                 * @description Za `json` telo z izluščenimi polji; za `image` surova slika z glavami
                 *     `X-Source-*` (kot pri radarju).
                 */
                200: {
                    headers: {
                        "X-Source-Fetched-At"?: string;
                        "X-Source-Stale"?: "true" | "false";
                        "X-Source-Next-Poll-Seconds"?: number;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PluginData"];
                        "image/*": string;
                    };
                };
                /** @description Vrsta nima strežniškega prenosa, ali naslov ne prestane preverjanja. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                /** @description Vira še nikoli ni bilo mogoče prenesti (prazen predpomnilnik). */
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
    "/tabs/all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Vsi zavihki, tudi izklopljeni
         * @description Za zaslon "Meni" v nastavitvah. `GET /tabs` (001) izklopljene po definiciji izpusti,
         *     zato iz njega ni mogoče sestaviti seznama za urejanje: izklopljenega zavihka ne bi
         *     bilo mogoče najti in vklopiti nazaj.
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
                /** @description Register z razrešenimi osebnimi prekritji. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ConfigurableTab"][];
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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description RFC 7807. */
        Problem: {
            type?: string;
            title?: string;
            status?: number;
            /** @description Sporočilo za uporabnika, v slovenščini. */
            detail?: string;
        };
        /**
         * @description - `link` — kartica z gumbom, ki odpre naslov;
         *     - `iframe` — tuja stran, vdelana v ploščico;
         *     - `image` — zunanja slika, ki se sama osvežuje;
         *     - `json` — iz odgovora JSON izpiše izbrana polja.
         * @enum {string}
         */
        PluginKind: "link" | "iframe" | "image" | "json";
        PluginField: {
            label: string;
            /** @description Pikčasta pot, npr. `observation.t` ali `list.0.main.temp`. */
            path: string;
            unit?: string | null;
        };
        PluginInput: {
            name: string;
            /** @description Ime ikone iz registra na odjemalcu (`core/icons/register-icons.ts`). */
            icon?: string;
            kind: components["schemas"]["PluginKind"];
            /**
             * Format: uri
             * @description Samo `https`, brez poverilnic, brez zasebnih/lokalnih naslovov — strežnik ta
             *     naslov pri vrstah `image` in `json` obišče sam (glej `domain/outbound-url.ts`).
             */
            url: string;
            /**
             * @description Samo za `link`.
             * @default true
             */
            openInNewTab: boolean;
            /** @description Samo za `link`. */
            description?: string | null;
            /**
             * @description Samo za `iframe`.
             * @default 320
             */
            heightPx: number;
            /**
             * @description Širina ploščice na nadzorni plošči, v slikovnih točkah. Odjemalec jo na ožjem
             *     zaslonu zoži na razpoložljivo širino — vrednost je zgornja meja, ne zagotovilo.
             *     Dokumenti izpred prehoda na slikovne točke so imeli namesto tega `columnSpan`
             *     (1–3 stolpce); strežnik jih ob branju preslika v približno enako širino.
             * @default 320
             */
            widthPx: number;
            /**
             * @description Samo za `image` in `json`. Spodnja meja 30 s je namerna (člen VIII) — vtičnik ne
             *     sme postati orodje za obstreljevanje tujega vira.
             * @default 300
             */
            refreshSeconds: number;
            /** @description Samo za `image`. */
            alt?: string | null;
            /** @description Samo za `json`; vsaj eno polje je obvezno. */
            fields?: components["schemas"]["PluginField"][];
        };
        Plugin: components["schemas"]["PluginInput"] & {
            id: string;
            /** Format: date-time */
            createdAt?: string;
            /** Format: date-time */
            updatedAt?: string;
        };
        PluginData: {
            fields: {
                label: string;
                /**
                 * @description `null` pomeni, da polja v odgovoru NI (pot je najbrž napačna). Prazna
                 *     vrednost v odgovoru se izpiše kot pomišljaj — to je nekaj drugega.
                 */
                value: string | null;
            }[];
            source: {
                /** Format: date-time */
                fetchedAt?: string;
                ageSeconds?: number;
                stale?: boolean;
                nextPollSeconds?: number;
            };
        };
        /**
         * @description Dodatek, ki ga zavihku prispeva njegov MODUL prek `platform/tabs/extension.ts` —
         *     `platform/tabs` modula ne pozna po imenu (člen I). Pojavi se tudi v `GET /tabs`.
         */
        TabDetail: {
            /** @description Ena vrstica pod naslovom, npr. `Agenda — e-racuni.com`. */
            subtitle?: string;
            /** @enum {string} */
            status?: "ok" | "warning" | "danger";
            /** @description Besedilo značke, npr. `seji poteče`. */
            statusLabel?: string;
        };
        ConfigurableTab: {
            id: string;
            title: string;
            icon: string;
            route: string;
            order: number;
            enabled: boolean;
            /**
             * @description `true` za zavihke, katerih izklop bi uporabnika zaklenil iz aplikacije —
             *     `PUT /settings` tak poskus zavrne s `400`. Trenutno samo `settings`.
             */
            undisableable: boolean;
        };
        /**
         * @description Razširitev `Settings` iz 001. Osebni prepisi naslovov zunanjih virov; `null` ali
         *     prazen niz pomeni "velja sistemski privzetek iz `.env`". Strežnik razreši
         *     `sources.* ?? env.*`.
         */
        SettingsSources: {
            /** Format: uri */
            weatherUrl?: string | null;
            /** Format: uri */
            radarUrl?: string | null;
            /** Format: uri */
            webcamBaseUrl?: string | null;
        };
        /**
         * @description Razširitev `Settings.tiles[]` iz 001. Razporeditev vtičnikov ostane v `tiles`, da
         *     ima vrstni red en sam vir resnice; polje `config` je za to obstajalo že od 001.
         */
        PluginTileEntry: {
            /** @constant */
            type: "plugin";
            position: number;
            /** @default true */
            visible: boolean;
            config: {
                pluginId: string;
            };
        };
    };
    responses: {
        /** @description Neveljavna zahteva. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Manjkajoča ali neveljavna avtentikacija. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description Zapis ne obstaja — ali pa obstaja, a pripada drugemu uporabniku. Razlika namenoma
         *     ni razvidna.
         */
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
        PluginId: string;
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
