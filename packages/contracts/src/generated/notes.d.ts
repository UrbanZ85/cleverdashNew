export interface paths {
    "/notes/capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Kaj modul v tej namestitvi zmore
         * @description Vmesnik potrebuje razliko med "storitev za prepis ni nastavljena" in "nisi je
         *     vklopil": prvo je stvar namestitve, drugo en klik v profilu.
         *     Zahtevani obseg: `notes:read`.
         */
        get: operations["getNotesCapabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam beležk
         * @description Pripete najprej, nato najnovejše spremenjene. Vrne tudi vse oznake uporabnika, da
         *     odjemalec filtrov ne sestavlja iz vsebine seznama. Zahtevani obseg: `notes:read`.
         */
        get: operations["listNotes"];
        put?: never;
        /**
         * Nova beležka
         * @description Brez naslova se uporabi prva neprazna vrstica vsebine. Beležka brez naslova IN brez
         *     vsebine je zavrnjena. Zahtevani obseg: `notes:write`.
         */
        post: operations["createNote"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notes/{noteId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                noteId: components["parameters"]["NoteId"];
            };
            cookie?: never;
        };
        /**
         * Ena beležka, s seznamom posnetkov
         * @description Zahtevani obseg: `notes:read`.
         */
        get: operations["getNote"];
        /**
         * Popravek beležke
         * @description Delna posodobitev: navedejo se samo polja, ki se spremenijo. Prazen niz je pomenska
         *     vrednost ("pobriši vsebino") in se loči od odsotnega polja ("ne spreminjaj").
         *     Zahtevani obseg: `notes:write`.
         */
        put: operations["updateNote"];
        post?: never;
        /**
         * Izbriši beležko
         * @description Izbriše tudi vse njene posnetke — posnetek brez beležke ne bi bil niti viden niti
         *     izbrisljiv. Zahtevani obseg: `notes:write`.
         */
        delete: operations["deleteNote"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notes/{noteId}/audio": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                noteId: components["parameters"]["NoteId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Naloži zvočni posnetek k beležki
         * @description Telo je SUROV posnetek, `Content-Type` pove njegovo vrsto (parameter kodeka, npr.
         *     `;codecs=opus`, se odreže). Zahtevani obseg: `notes:write`.
         *
         *     `transcribe=true` pošlje posnetek zunanji storitvi za prepis — samo ob dvojni
         *     privolitvi, sicer `409` in posnetek se NE naloži. Če je storitev dosegljiva, a prepis
         *     spodleti, se posnetek vseeno shrani s `transcriptStatus: failed` in razlogom.
         */
        post: operations["uploadNoteAudio"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notes/{noteId}/audio/{audioId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                noteId: components["parameters"]["NoteId"];
                audioId: components["parameters"]["AudioId"];
            };
            cookie?: never;
        };
        /**
         * Predvajaj posnetek
         * @description Vrne bajte posnetka z `Cache-Control: private` — glas je osebni podatek in ne sme v
         *     skupni predpomnilnik posrednika. Zahtevani obseg: `notes:read`.
         */
        get: operations["getNoteAudio"];
        put?: never;
        post?: never;
        /**
         * Izbriši posnetek
         * @description Besedilo beležke ostane. Zahtevani obseg: `notes:write`.
         */
        delete: operations["deleteNoteAudio"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notes/{noteId}/audio/{audioId}/transcribe": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                noteId: components["parameters"]["NoteId"];
                audioId: components["parameters"]["AudioId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Prepiši obstoječ posnetek na strežniku
         * @description Za posnetke, narejene brez prepisa, in za ponovni poskus po spodleteli storitvi. Ista
         *     dvojna privolitev kot pri nalaganju. Zahtevani obseg: `notes:write`.
         *
         *     Spodletel prepis vrne `200` s `transcriptStatus: failed` in razlogom — ne napake
         *     zahteve: posnetek je nespremenjen in odjemalec potrebuje prav ta podatek.
         */
        post: operations["transcribeNoteAudio"];
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
        /** @description RFC 9457 — enaka oblika kot 001–006. */
        Problem: {
            type?: string;
            title: string;
            status: number;
            detail?: string;
        };
        /** @description Vsa polja so neobvezna; navedejo se samo tista, ki se spremenijo. */
        NoteWrite: {
            /** @description Brez njega se uporabi prva neprazna vrstica vsebine. */
            title?: string;
            body?: string;
            /** @description Normalizirajo se na male črke, brez podvojitev. */
            tags?: string[];
            pinned?: boolean;
        };
        Note: {
            id: string;
            title: string;
            body: string;
            tags: string[];
            pinned: boolean;
            audio: components["schemas"]["NoteAudio"][];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /**
         * @description Zapis v seznamu. Posnetkov ne vsebuje, samo njihovo število — sami posnetki se
         *     preberejo šele ob odprtju beležke.
         */
        NoteListItem: {
            id: string;
            title: string;
            body: string;
            tags: string[];
            pinned: boolean;
            audioCount: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        NoteList: {
            notes: components["schemas"]["NoteListItem"][];
            total: number;
            /** @description Vse oznake tega uporabnika, urejene po abecedi. */
            tags: string[];
        };
        NoteAudio: {
            id: string;
            mimeType: string;
            byteSize: number;
            /** @description Kot ga je izmeril brskalnik; `null`, kadar ga ni sporočil. */
            durationMs: number | null;
            transcript: string | null;
            /** @enum {string|null} */
            transcriptSource: "browser" | "server" | null;
            /** @enum {string} */
            transcriptStatus: "none" | "done" | "failed";
            transcriptError?: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        NotesCapabilities: {
            serverTranscription: {
                /** @description Ali sta naslov in ključ storitve nastavljena v okolju strežnika. */
                configured: boolean;
                /** @description Ali je uporabnik pošiljanje posnetkov ven dovolil v nastavitvah. */
                enabled: boolean;
                /** @description Oboje hkrati — šele to pomeni, da je prepis mogoč. */
                available: boolean;
                /** @enum {string|null} */
                reason: "not-configured" | "not-enabled" | null;
                /** @description Besedilo za uporabnika, kaj mora kdo narediti. */
                detail: string | null;
            };
            /** @description Zgornja meja za en posnetek (`NOTES_AUDIO_MAX_MB`). */
            audioMaxBytes: number;
        };
        /**
         * @description RAZŠIRITEV objekta `Settings` iz 001 (glej 003 za enak vzorec z
         *     `cameraDataSaverEnabled`). Ne podvaja poti `/settings`, samo dokumentira polje, ki ga
         *     007 doda v isti odgovor in isti `PUT`.
         */
        SettingsNotesExtension: {
            notes?: {
                /**
                 * @description Privolitev, da zvočni posnetek zapusti strežnik in gre k zunanji storitvi za
                 *     prepis. Privzeto izklopljena in NEODVISNA od tega, ali je ključ nastavljen v
                 *     okolju: ključ je dovoljenje namestitve, to stikalo pa privolitev osebe,
                 *     katere glas je na posnetku.
                 * @default false
                 */
                serverTranscription: boolean;
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
        /** @description Manjkajoča ali neveljavna avtentikacija */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Ne obstaja (tudi za tuje beležke — nikoli 403) */
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
        /** @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat — enaka semantika kot 001–006. */
        IdempotencyKey: string;
        NoteId: string;
        AudioId: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getNotesCapabilities: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zmožnosti modula za tega uporabnika */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotesCapabilities"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    listNotes: {
        parameters: {
            query?: {
                /** @description Iskanje po naslovu IN vsebini, brez razlikovanja velikosti črk. */
                query?: string;
                /** @description Filter po eni oznaki (normalizirana na male črke). */
                tag?: string;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam beležk */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoteList"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    createNote: {
        parameters: {
            query?: never;
            header?: {
                /** @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat — enaka semantika kot 001–006. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NoteWrite"];
            };
        };
        responses: {
            /** @description Ustvarjena beležka */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Note"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
        };
    };
    getNote: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                noteId: components["parameters"]["NoteId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Beležka */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Note"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
        };
    };
    updateNote: {
        parameters: {
            query?: never;
            header?: {
                /** @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat — enaka semantika kot 001–006. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                noteId: components["parameters"]["NoteId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["NoteWrite"];
            };
        };
        responses: {
            /** @description Spremenjena beležka */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Note"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
        };
    };
    deleteNote: {
        parameters: {
            query?: never;
            header?: {
                /** @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat — enaka semantika kot 001–006. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                noteId: components["parameters"]["NoteId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Izbrisano */
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
    uploadNoteAudio: {
        parameters: {
            query?: {
                /** @description Trajanje, kot ga je izmeril brskalnik — strežnik posnetka ne dekodira. */
                durationMs?: number;
                /** @description Besedilo, ki ga je prepoznal BRSKALNIK (Web Speech API). */
                transcript?: string;
                /** @description Zahteva za prepis na strežniku. Privzeto `false`. */
                transcribe?: boolean;
            };
            header?: never;
            path: {
                noteId: components["parameters"]["NoteId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "audio/webm": string;
                "audio/ogg": string;
                "audio/mp4": string;
                "audio/mpeg": string;
                "audio/wav": string;
            };
        };
        responses: {
            /** @description Shranjen posnetek (brez bajtov — te vrne samo pot za predvajanje) */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoteAudio"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            /** @description Prepis na strežniku ni na voljo — manjka ključ v okolju ALI privolitev v nastavitvah */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Posnetek presega `NOTES_AUDIO_MAX_MB` */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Vrsta vsebine ni podprt zvok */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    getNoteAudio: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                noteId: components["parameters"]["NoteId"];
                audioId: components["parameters"]["AudioId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Bajti posnetka */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
        };
    };
    deleteNoteAudio: {
        parameters: {
            query?: never;
            header?: {
                /** @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat — enaka semantika kot 001–006. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                noteId: components["parameters"]["NoteId"];
                audioId: components["parameters"]["AudioId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Izbrisano */
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
    transcribeNoteAudio: {
        parameters: {
            query?: never;
            header?: {
                /** @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat — enaka semantika kot 001–006. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                noteId: components["parameters"]["NoteId"];
                audioId: components["parameters"]["AudioId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Posnetek z novim stanjem prepisa */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoteAudio"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            /** @description Prepis na strežniku ni na voljo */
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
}
