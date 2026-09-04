export interface paths {
    "/files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam mojih naloženih datotek
         * @description Vrne datoteke prijavljenega uporabnika, najnovejše zgoraj. Zapisi v stanju
         *     `uploading` NISO vključeni — nalaganje, ki teče, ni deljena datoteka (FR-006).
         *
         *     Zahtevani obseg: `file-sharing:read`.
         */
        get: operations["listSharedFiles"];
        put?: never;
        /**
         * Napovej datoteko (prvi korak nalaganja)
         * @description Ustvari zapis v stanju `uploading` in preveri, ali napovedana velikost sploh sme
         *     priti: meja ene datoteke (`FILE_SHARE_MAX_MB`) in kvota uporabnika
         *     (`FILE_SHARE_QUOTA_MB`). Bajti pridejo šele s `PUT /files/{fileId}/content`.
         *
         *     **Zakaj dva koraka:** kvota se mora preveriti, PREDEN priteče 500 MB, in
         *     `Idempotency-Key` mora dobiti endpoint, ki obljubo o istem telesu lahko izpolni
         *     (research.md §3).
         *
         *     Odgovor NE vsebuje povezave in gesla — ta nastaneta šele, ko je vsebina cela.
         *
         *     Zahtevani obseg: `file-sharing:write`.
         */
        post: operations["createSharedFile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/files/{fileId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fileId: components["parameters"]["FileId"];
            };
            cookie?: never;
        };
        /**
         * Podrobnosti ene datoteke
         * @description Vključuje `failedAttempts` in `lockedUntil` — lastnik MORA videti, da nekdo ugiba
         *     geslo, in to v odgovoru API-ja, ne le v dnevniku, ki ga nihče ne bere (FR-033).
         *
         *     Zahtevani obseg: `file-sharing:read`.
         */
        get: operations["getSharedFile"];
        put?: never;
        post?: never;
        /**
         * Izbriši datoteko
         * @description Odstrani vsebino z diska IN zapis, v tem vrstnem redu (data-model.md). Če vsebine ni
         *     mogoče odstraniti, zapis OSTANE in dobi `state: broken` — tiho izginotje je
         *     prepovedano (člen VII, FR-045).
         *
         *     Zahtevani obseg: `file-sharing:write`.
         */
        delete: operations["deleteSharedFile"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/files/{fileId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fileId: components["parameters"]["FileId"];
            };
            cookie?: never;
        };
        /**
         * Prenesi svojo datoteko (brez gesla)
         * @description Lastnik svoje datoteke ne odklepa — je lastnik in je prijavljen (FR-027). Ta prenos
         *     se NE šteje med prevzeme: števec meri, kolikokrat je datoteko dobil prejemnik.
         *
         *     Podpira `Range`.
         *
         *     Zahtevani obseg: `file-sharing:read`.
         */
        get: operations["downloadOwnSharedFile"];
        /**
         * Naloži vsebino (drugi korak nalaganja)
         * @description Telo je surova vsebina datoteke, ne obrazec. Strežnik jo pretaka na disk in je nikoli
         *     ne zbere v pomnilnik (research.md §4).
         *
         *     **Meja se uveljavi dvakrat** (FR-003): iz `Content-Length`, preden se odpre datoteka,
         *     in med pisanjem s štetjem bajtov. Napovedana velikost je obljuba odjemalca, ne
         *     dejstvo.
         *
         *     **Prekinjena zahteva ne pusti ničesar** (FR-006): delna datoteka se odstrani, zapis
         *     ostane `uploading` in ga pobere pometač.
         *
         *     Uspeh je edino mesto v celotni pogodbi, kjer se pojavi **geslo v čistopisu**
         *     (FR-011). Pozneje ga ni mogoče prebrati nikjer — mogoče je le izdati novega.
         *
         *     `Idempotency-Key` se pri tej poti NE upošteva (glej opis modula).
         *
         *     Zahtevani obseg: `file-sharing:write`.
         */
        put: operations["uploadSharedFileContent"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/files/{fileId}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fileId: components["parameters"]["FileId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Prekliči povezavo
         * @description Postavi `state: revoked` in izbriše VSE izdane dovolilnice te datoteke. Učinkuje
         *     takoj: naslednja zahteva ne dobi vsebine, prenos, ki že teče, se prekine (FR-041,
         *     research.md §22).
         *
         *     Datoteka ostane lastniku, dokler je ne izbriše. Preklic ni brisanje.
         *
         *     Zahtevani obseg: `file-sharing:write`.
         */
        post: operations["revokeSharedFile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/files/{fileId}/password": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fileId: components["parameters"]["FileId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Izdaj novo geslo (in s tem novo povezavo)
         * @description Ustvari NOVO geslo in NOV `token`, ter razveljavi vse obstoječe dovolilnice. Stara
         *     povezava od tega trenutka odgovarja enako kot neznana (research.md §12, FR-015).
         *
         *     Namen je odvzeti dostop tistemu, ki ima staro geslo. Če bi naslov ostal isti, bi mu
         *     polovica ključa ostala v rokah — zato se zamenja oboje in vmesnik to izrecno pove.
         *
         *     Preklicani datoteki to geslo tudi vrne v obtok: `revoked` → `ready`.
         *
         *     Zahtevani obseg: `file-sharing:write`.
         */
        post: operations["regenerateSharePassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/share/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description 22 znakov `base64url` — 16 naključnih bajtov. NI izpeljan iz identifikatorja zapisa
                 *     ne iz imena datoteke; iz ene povezave ni mogoče izpeljati druge (FR-014).
                 */
                token: components["parameters"]["ShareToken"];
            };
            cookie?: never;
        };
        /**
         * Kaj čaka za to povezavo (brez prijave)
         * @description **Javna pot. Brez avtentikacije, brez obsegov.**
         *
         *     Vrne samo velikost in rok. **Imena datoteke NE vrne** — to pride šele po pravilno
         *     vpisanem geslu (FR-022, research.md §11). Ime datoteke pogosto pove vsebino in bi
         *     ušlo vsakomur, ki naslov dobi naprej.
         *
         *     Neznana, potekla, preklicana in izbrisana povezava dajo ENAK odgovor `404` z enakim
         *     besedilom (FR-023) — kdor ima naslov, ne izve, katera od možnosti drži.
         */
        get: operations["getPublicShareInfo"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/share/{token}/unlock": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description 22 znakov `base64url` — 16 naključnih bajtov. NI izpeljan iz identifikatorja zapisa
                 *     ne iz imena datoteke; iz ene povezave ni mogoče izpeljati druge (FR-014).
                 */
                token: components["parameters"]["ShareToken"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Vpiši geslo in odkleni prenos
         * @description **Javna pot. Brez avtentikacije, brez obsegov.**
         *
         *     Ob pravilnem geslu ustvari kratkotrajno dovolilnico in jo postavi kot piškotek
         *     `cd_share`, omejen na `Path=/api/v1/share/{token}`. Prenos se nato sproži z navadno
         *     navigacijo brskalnika, da 500 MB prevzame brskalnikov lastni prenašalnik — z
         *     napredkom in nadaljevanjem (research.md §8).
         *
         *     **Dušenje (FR-030).** Zgrešeni poskusi se štejejo po POVEZAVI in po IZVORNEM NASLOVU.
         *     Po `FILE_SHARE_ATTEMPT_LIMIT` zgrešitvah v oknu so nadaljnji poskusi zavrnjeni s
         *     `429` za `FILE_SHARE_LOCK_MINUTES` — tudi če je geslo pravilno. Poskušeno geslo se ne
         *     zapiše nikamor (FR-032).
         *
         *     **`Idempotency-Key` se pri tej poti NE sprejme** — endpoint izdaja dovolilnico
         *     (izjema člena III, glej opis modula).
         */
        post: operations["unlockShare"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/share/{token}/content": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description 22 znakov `base64url` — 16 naključnih bajtov. NI izpeljan iz identifikatorja zapisa
                 *     ne iz imena datoteke; iz ene povezave ni mogoče izpeljati druge (FR-014).
                 */
                token: components["parameters"]["ShareToken"];
            };
            cookie?: never;
        };
        /**
         * Prenesi datoteko (z dovolilnico)
         * @description **Javna pot. Brez avtentikacije, brez obsegov** — a NE brez dovoljenja: zahteva mora
         *     nositi piškotek `cd_share`, izdan pri `POST /share/{token}/unlock`. Brez njega
         *     vsebine ni, tudi če je naslov pravilen (FR-021).
         *
         *     Veljavnost dovolilnice se preverja v poizvedbi, ne prek TTL indeksa (research.md
         *     §13), in preklic povezave jo razveljavi (FR-026).
         *
         *     Podpira `Range`; prekinjen prenos je mogoče nadaljevati (FR-025). Uspešen prenos
         *     poveča `downloadCount`.
         */
        get: operations["downloadShare"];
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
        /** @description RFC 9457 problem details — ista oblika kot 001/002/003/005/008. */
        Problem: {
            type: string;
            title: string;
            status: number;
            detail?: string;
            correlationId?: string;
            /** @description Samo pri `401` na `/share/{token}/unlock`: koliko zgrešitev še ostane do zaklepa. */
            remainingAttempts?: number;
        };
        /**
         * @description SHRANJENO stanje. `uploading` = zapis rezerviran, vsebina še ni cela. `ready` =
         *     deljivo. `revoked` = lastnik je preklical. `broken` = zapis obstaja, vsebine ni ali
         *     se ne ujema.
         *
         *     **"Poteklo" NI stanje** — izpelje se iz `expiresAt < zdaj` (data-model.md). Shranjeno
         *     stanje bi se moralo vzdrževati z opravilom in bi se med potekom in zapisom razhajalo
         *     s časom.
         * @enum {string}
         */
        SharedFileState: "uploading" | "ready" | "revoked" | "broken";
        Quota: {
            /** @description Vsota velikosti datotek tega uporabnika (agregacija, ne števec). */
            usedBytes: number;
            /** @description `FILE_SHARE_QUOTA_MB` v bajtih. */
            limitBytes: number;
        };
        CreateFileInput: {
            /**
             * @description Ime, kot ga pozna uporabnik. Strežnik ga OČISTI (ločila poti, `..`, krmilni
             *     znaki, dolžina) in shrani samo kot prikazno ime — nikoli kot pot (FR-007,
             *     research.md §20). Ime, od katerega po čiščenju ne ostane nič, je `400`.
             */
            fileName: string;
            /**
             * @description NAPOVEDANA velikost. Preveri se proti meji in kvoti, preden priteče prvi bajt —
             *     in znova med pisanjem, ker je napoved obljuba, ne dejstvo (FR-003).
             */
            byteSize: number;
            /** @description Privzeto `application/octet-stream`. Vsebina se ne pregleduje (FR-054). */
            mimeType?: string;
            /**
             * @description Rok veljavnosti povezave. Izpuščeno pomeni `FILE_SHARE_DEFAULT_EXPIRY_DAYS`
             *     (privzeto 7). Izrecni `null` pomeni **brez roka** — veljavna izbira, ki je v
             *     vmesniku posebej označena (FR-040).
             * @enum {integer|null}
             */
            expiresInDays?: 1 | 7 | 30 | null;
        };
        CreatedFile: {
            id: string;
            /** @description `/api/v1/files/{id}/content` — kam poslati vsebino. */
            uploadUrl: string;
            /** @description Veljavna meja te namestitve, da je odjemalec ne ugiba. */
            maxBytes: number;
        };
        /**
         * @description Edini odgovor v tej pogodbi, ki vsebuje geslo v čistopisu. Vrne se ob uspešnem
         *     nalaganju in ob izdaji novega gesla — nikoli več (FR-011). Izgubljenega gesla ni
         *     mogoče prebrati; mogoče je le izdati novega, kar naredi tudi novo povezavo.
         */
        UploadResult: {
            file: components["schemas"]["SharedFile"];
            /** @description `{PUBLIC_BASE_URL}/d/{token}` — kar se pošlje prejemniku. */
            shareUrl: string;
            /**
             * @description 16 znakov iz abecede brez dvoumnih znakov, prikazanih v štirih četvorkah
             *     (research.md §7). V bazi je samo `scrypt` povzetek.
             */
            password: string;
        };
        SharedFile: {
            id: string;
            /** @description Očiščeno ime za prikaz. */
            displayName: string;
            mimeType?: string;
            byteSize: number;
            state: components["schemas"]["SharedFileState"];
            /** @description IZPELJANO iz `expiresAt`, ne shranjeno. */
            expired: boolean;
            /**
             * @description Povezava za deljenje. Geslo NI del odgovora — povezava sama brez njega ne odpre
             *     ničesar (FR-021).
             */
            shareUrl?: string | null;
            /**
             * Format: date-time
             * @description `null` pomeni **brez roka**, ne "poteklo".
             */
            expiresAt?: string | null;
            /** @description Uspešni prevzemi prejemnikov; lastnikov lastni prenos se ne šteje. */
            downloadCount: number;
            /** Format: date-time */
            lastDownloadedAt?: string | null;
            /**
             * @description Zgrešeni poskusi gesla od zadnje uspešne odklenitve. Lastnik mora videti, da
             *     nekdo ugiba (FR-033).
             */
            failedAttempts: number;
            /**
             * Format: date-time
             * @description Dokler je v prihodnosti, so poskusi na tej povezavi zavrnjeni.
             */
            lockedUntil?: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        /**
         * @description Vse, kar sme izvedeti nekdo, ki ima zgolj naslov. **Brez imena datoteke** — to je
         *     podatek, ki ga varuje geslo (FR-022).
         */
        PublicShareInfo: {
            /** @description Da prejemnik ve, na kaj se pripravlja, in prepozna pravo povezavo. */
            byteSize: number;
            /** Format: date-time */
            expiresAt?: string | null;
        };
        UnlockInput: {
            /**
             * @description Geslo, kot ga je prejemnik dobil. Pred primerjavo se normalizira: presledki in
             *     vezaji iz prikaza (`H7K2-9MTX-…`) se odstranijo, črke pa se pretvorijo v velike.
             *
             *     Pretvorba v velike črke NE zmanjša prostora gesel: abeceda malih črk sploh ne
             *     vsebuje, zato dve različni gesli ne moreta biti enaki "do velikosti črk".
             *     Prepreči pa zavrnitev nekoga, ki je geslo prepisal z malimi črkami.
             */
            password: string;
        };
        UnlockResult: {
            /** @description Ime datoteke — prvič vidno šele tu. */
            fileName: string;
            byteSize: number;
            mimeType?: string;
            /**
             * @description `/api/v1/share/{token}/content`. Odjemalec ga odpre z NAVIGACIJO, ne z `fetch` —
             *     500 MB mora prevzeti brskalnikov prenašalnik, ne pomnilnik zavihka
             *     (research.md §8).
             */
            downloadUrl: string;
            /**
             * Format: date-time
             * @description Do kdaj velja dovolilnica; po tem je treba geslo vpisati znova.
             */
            grantExpiresAt: string;
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
        /** @description Manjka zahtevani obseg (`file-sharing:read` / `file-sharing:write`). */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description Datoteke ni — ali pa ni uporabnikova. Namenoma isti odgovor: obstoj tuje datoteke ni
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
        /**
         * @description Povezava ne velja. **En sam odgovor za štiri različne razloge** — neznan žeton,
         *     potekla povezava, preklicana povezava, izbrisana datoteka (FR-023). Besedilo je
         *     enako v vseh štirih primerih; razlikovanje bi bilo podatek za vsakogar, ki ima
         *     naslov.
         */
        ShareUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description Zapis obstaja, vsebine na disku ni ali se njena velikost ne ujema z zapisano
         *     (data-model.md, "Ko se zapis in vsebina razideta"). Zapis dobi `state: broken`.
         *     Namesto tihega prenosa prazne ali okrnjene datoteke je to izrecna napaka (FR-051,
         *     FR-052, člen VII).
         */
        ContentMissing: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        FileId: string;
        /**
         * @description 22 znakov `base64url` — 16 naključnih bajtov. NI izpeljan iz identifikatorja zapisa
         *     ne iz imena datoteke; iz ene povezave ni mogoče izpeljati druge (FR-014).
         */
        ShareToken: string;
        /**
         * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
         *     (člen III). Ne velja za `PUT /files/{fileId}/content` (binarno telo) in za javne
         *     poti `/share/*` (izdaja dovolilnice) — obe izjemi sta opisani pri tistih poteh.
         */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listSharedFiles: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam datotek in stanje kvote */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        files: components["schemas"]["SharedFile"][];
                        quota: components["schemas"]["Quota"];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    createSharedFile: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ne velja za `PUT /files/{fileId}/content` (binarno telo) in za javne
                 *     poti `/share/*` (izdaja dovolilnice) — obe izjemi sta opisani pri tistih poteh.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateFileInput"];
            };
        };
        responses: {
            /** @description Zapis je rezerviran; vsebina se pričakuje na `uploadUrl`. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedFile"];
                };
            };
            /**
             * @description Ime datoteke je prazno po čiščenju, napovedana velikost je 0 ali ni število, ali
             *     je `expiresInDays` zunaj dovoljenega nabora.
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
            /** @description Napovedana velikost presega `FILE_SHARE_MAX_MB` (FR-002). */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /**
             * @description Kvota uporabnika ne dopušča te datoteke (FR-009). Odgovor pove, koliko prostora
             *     je na voljo, da vmesnik lahko pove, kaj je treba sprostiti.
             */
            507: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    getSharedFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fileId: components["parameters"]["FileId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Datoteka */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SharedFile"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
        };
    };
    deleteSharedFile: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ne velja za `PUT /files/{fileId}/content` (binarno telo) in za javne
                 *     poti `/share/*` (izdaja dovolilnice) — obe izjemi sta opisani pri tistih poteh.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                fileId: components["parameters"]["FileId"];
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
            /**
             * @description Vsebine ni bilo mogoče odstraniti; zapis je označen kot pokvarjen in ostane
             *     viden, da napaka ni tiha.
             */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    downloadOwnSharedFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fileId: components["parameters"]["FileId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Vsebina datoteke. */
            200: {
                headers: {
                    /** @description `attachment` s prikaznim imenom v obeh oblikah (`filename` in `filename*`). */
                    "Content-Disposition"?: string;
                    "Accept-Ranges"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Delni odgovor na `Range`. */
            206: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
            503: components["responses"]["ContentMissing"];
        };
    };
    uploadSharedFileContent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fileId: components["parameters"]["FileId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/octet-stream": string;
            };
        };
        responses: {
            /** @description Vsebina je cela, zapis je `ready`. Odgovor vsebuje povezavo in geslo — enkrat. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadResult"];
                };
            };
            /** @description Manjka `Content-Length`, ali je vsebina prazna (0 bajtov, FR-008). */
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
            /**
             * @description Zapis ni v stanju `uploading` — vsebina je bila že naložena. Ponovno nalaganje v
             *     isti zapis ni mogoče; nova datoteka je nov `POST /files`.
             */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /**
             * @description Vsebina presega `FILE_SHARE_MAX_MB` — ugotovljeno iz `Content-Length` ali med
             *     pisanjem. Delna datoteka je odstranjena.
             */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Kvota je bila medtem presežena, ali je zmanjkalo prostora na disku. */
            507: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    revokeSharedFile: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ne velja za `PUT /files/{fileId}/content` (binarno telo) in za javne
                 *     poti `/share/*` (izdaja dovolilnice) — obe izjemi sta opisani pri tistih poteh.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                fileId: components["parameters"]["FileId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Preklicano. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SharedFile"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
            /** @description Zapis je v stanju `uploading` — preklicati ni česa. */
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
    regenerateSharePassword: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ne velja za `PUT /files/{fileId}/content` (binarno telo) in za javne
                 *     poti `/share/*` (izdaja dovolilnice) — obe izjemi sta opisani pri tistih poteh.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                fileId: components["parameters"]["FileId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Novo geslo in nova povezava — prikazano enkrat. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadResult"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
            /** @description Zapis je v stanju `uploading` ali `broken` — gesla ni za kaj izdati. */
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
    getPublicShareInfo: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description 22 znakov `base64url` — 16 naključnih bajtov. NI izpeljan iz identifikatorja zapisa
                 *     ne iz imena datoteke; iz ene povezave ni mogoče izpeljati druge (FR-014).
                 */
                token: components["parameters"]["ShareToken"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Datoteka čaka. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicShareInfo"];
                };
            };
            404: components["responses"]["ShareUnavailable"];
        };
    };
    unlockShare: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description 22 znakov `base64url` — 16 naključnih bajtov. NI izpeljan iz identifikatorja zapisa
                 *     ne iz imena datoteke; iz ene povezave ni mogoče izpeljati druge (FR-014).
                 */
                token: components["parameters"]["ShareToken"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UnlockInput"];
            };
        };
        responses: {
            /** @description Odklenjeno. Šele tu se pojavi ime datoteke. Piškotek `cd_share` je postavljen. */
            200: {
                headers: {
                    /** @description `cd_share=<grant>; Path=/api/v1/share/{token}; HttpOnly; SameSite=Lax; Secure; Max-Age=600` */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnlockResult"];
                };
            };
            /** @description Telo nima gesla ali je geslo predolgo. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /**
             * @description Geslo ni pravilno. Odgovor ne pove, ali je bilo blizu, in je enak za geslo, ki
             *     odklepa DRUGO datoteko (FR-016). `remainingAttempts` je navedeno zato, da
             *     zakonit prejemnik ve, koliko poskusov mu ostane, preden bo zaklenjen.
             */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            404: components["responses"]["ShareUnavailable"];
            /**
             * @description Preveč zgrešenih poskusov (FR-030). Dokler traja zaklep, so zavrnjeni tudi
             *     pravilni poskusi. `Retry-After` pove, kdaj je smiselno poskusiti znova.
             */
            429: {
                headers: {
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    downloadShare: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description 22 znakov `base64url` — 16 naključnih bajtov. NI izpeljan iz identifikatorja zapisa
                 *     ne iz imena datoteke; iz ene povezave ni mogoče izpeljati druge (FR-014).
                 */
                token: components["parameters"]["ShareToken"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Vsebina datoteke. */
            200: {
                headers: {
                    "Content-Disposition"?: string;
                    "Accept-Ranges"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Delni odgovor na `Range`. */
            206: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /**
             * @description Dovolilnice ni, je potekla, ali je bila razveljavljena (preklic, novo geslo).
             *     Prejemnik mora geslo vpisati znova.
             */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            404: components["responses"]["ShareUnavailable"];
            503: components["responses"]["ContentMissing"];
        };
    };
}
