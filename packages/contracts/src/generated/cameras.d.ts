export interface paths {
    "/cameras": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam kamer (mreža in zaslon za urejanje)
         * @description Vrne vse kamere. Zaslon za urejanje (FR-030) prikaže tudi neaktivne; mreža
         *     (frontend) filtrira na `active: true` in razvrsti po `groupId`, `order` ter
         *     `timeOfDay` glede na lokalno uro (research.md §8). Vsak vnos vključuje izpeljano
         *     `health` (FR-011) — `null` za kamere brez predogleda (samostojni `iframe`/`mjpeg`/`hls`, glej
         *     `data-model.md`, "Izpeljano: zdravje kamere"). Zahtevani obseg: `cameras:read`.
         */
        get: operations["listCameras"];
        put?: never;
        /**
         * Dodaj kamero (FR-031, Story 3)
         * @description Preveri naslov proti FR-034 (veljaven URL, dovoljen gostitelj za vdelavo, https ali
         *     obvezen proxy) preden shrani. Neveljaven vnos vrne `422` z jasnim razlogom, brez
         *     stranskih učinkov. Zahtevani obseg: `cameras:write`.
         */
        post: operations["createCamera"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cameras/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Spremeni vrstni red kamer (FR-035)
         * @description Sprejme popoln seznam ID-jev kamer znotraj ene skupine (ali brez skupine, `groupId:
         *     null`) v novem vrstnem redu; `order` vsake kamere se prepiše glede na položaj v
         *     seznamu. Zahtevani obseg: `cameras:write`.
         */
        put: operations["reorderCameras"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cameras/{cameraId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cameraId: string;
            };
            cookie?: never;
        };
        /**
         * Preberi eno kamero (predpolnjenje obrazca za urejanje)
         * @description Zahtevani obseg: `cameras:read`.
         */
        get: operations["getCamera"];
        /**
         * Uredi kamero (FR-032, Story 4)
         * @description Enaka validacija naslova kot pri dodajanju (FR-034). Ob zavrnitvi ostanejo prejšnje
         *     veljavne vrednosti kamere nespremenjene. Zahtevani obseg: `cameras:write`.
         */
        put: operations["updateCamera"];
        post?: never;
        /**
         * Izbriši kamero (FR-033, Story 4)
         * @description Nepovratno. Odjemalec MORA pred klicem pridobiti izrecno potrditev uporabnika
         *     (spec.md, Story 4 — potrditev je odjemalčeva odgovornost, endpoint sam ne vpraša
         *     dvakrat). Zahtevani obseg: `cameras:write`.
         */
        delete: operations["deleteCamera"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cameras/{cameraId}/snapshot": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cameraId: string;
            };
            cookie?: never;
        };
        /**
         * Trenutni posnetek prek proxyja (FR-041)
         * @description Samo za `type: snapshot` ali `snapshot+iframe`. Predpomnjeno prek
         *     `platform/cache` (research.md §3) za `refreshIntervalSeconds` te kamere — ena
         *     kamera na več napravah ni več zahtev na vir (FR-021). Ob neuspehu vira vrne zadnji
         *     znani posnetek z `X-Camera-Freshness: stale`, ne napako, razen če posnetka še
         *     nikoli ni bilo (`503`). Zahtevani obseg: `cameras:read`.
         */
        get: operations["getCameraSnapshot"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cameras/{cameraId}/stream": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cameraId: string;
            };
            cookie?: never;
        };
        /**
         * Zvezen tok prek proxyja (`mjpeg`/`hls`, glej omejitev zgoraj)
         * @description Samo za kamere, ki zahtevajo proxy (FR-020) IN so vrste `mjpeg`/`hls`. Pass-through
         *     brez predpomnjenja (research.md §4). Kamere, dosegljive neposredno prek `https`, to
         *     pot ne uporabljajo — odjemalec gre naravnost na `previewUrl`/`fullUrl`.
         *     Zahtevani obseg: `cameras:read`.
         */
        get: operations["getCameraStream"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cameras/{cameraId}/health": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cameraId: string;
            };
            cookie?: never;
        };
        /**
         * Zdravje vira (FR-011, FR-042, Story 5)
         * @description Podrobnost izpeljanega zdravja iz `data-model.md`. `null` polja pomenijo
         *     "iframe/mjpeg/hls, strežniško ni preverljivo" (research.md §3). Zahtevani obseg:
         *     `cameras:read`.
         */
        get: operations["getCameraHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/camera-groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam skupin kamer (FR-015)
         * @description Zahtevani obseg: `cameras:read`.
         */
        get: operations["listCameraGroups"];
        put?: never;
        /**
         * Dodaj skupino
         * @description Zahtevani obseg: `cameras:write`.
         */
        post: operations["createCameraGroup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/camera-groups/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Spremeni vrstni red skupin
         * @description Zahtevani obseg: `cameras:write`.
         */
        put: operations["reorderCameraGroups"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/camera-groups/{groupId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        get?: never;
        /**
         * Uredi skupino (ime, zloženo)
         * @description Zahtevani obseg: `cameras:write`.
         */
        put: operations["updateCameraGroup"];
        post?: never;
        /**
         * Izbriši skupino
         * @description Kamere v izbrisani skupini se NE izbrišejo — `groupId` se postavi na `null`
         *     (postanejo "brez skupine"). Zahtevani obseg: `cameras:write`.
         */
        delete: operations["deleteCameraGroup"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cameras/embed-hosts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Efektivni seznam dovoljenih gostiteljev (FR-022, research.md §6)
         * @description Unija osnovnega seznama iz okolja (`CAMERA_ALLOWED_EMBED_HOSTS`, `source: base`) in
         *     uporabniško odobrenih gostiteljev (`source: user`). Zahtevani obseg: `cameras:read`.
         */
        get: operations["listEmbedHosts"];
        put?: never;
        /**
         * Odobri nov gostitelj za vdelavo (Story 3, Edge Cases)
         * @description Izrecno dejanje uporabnika — se NE zgodi samodejno ob shranjevanju kamere z
         *     nedovoljenim gostiteljem. Zahtevani obseg: `cameras:write`.
         */
        post: operations["addEmbedHost"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cameras/embed-hosts/{host}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Odstrani uporabniško odobren gostitelj
         * @description Samo za gostitelje z `source: user` — osnovnega seznama iz okolja ni mogoče
         *     odstraniti prek API-ja (sprememba okolja, ne podatka). Zahtevani obseg:
         *     `cameras:write`.
         */
        delete: operations["removeEmbedHost"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/cameras/arso-webcams": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * ARSO spletne kamere za lokacijo, kot predloga pri dodajanju (FR-037)
         * @description Bere isti predpomnjen ARSO vremenski zapis, ki ga uporablja tudi dashboard (001) —
         *     brez dodatnega klica ARSO (research.md §2). Prazen seznam pomeni, da ARSO za to
         *     lokacijo ne vrača slike; obrazec za dodajanje to prikaže kot razlog, ne kot
         *     napako. Zahtevani obseg: `cameras:read`.
         */
        get: operations["listArsoWebcams"];
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
        /** @description RFC 9457 problem details — ista oblika kot 001/002. */
        Problem: {
            type: string;
            title: string;
            status: number;
            detail?: string;
            correlationId?: string;
        };
        /**
         * @description FR-002. `snapshot+iframe` ni isto kot `type: iframe` — glej data-model.md.
         * @enum {string}
         */
        CameraType: "snapshot" | "mjpeg" | "hls" | "iframe" | "snapshot+iframe";
        /**
         * @description FR-004. Vpliva na vrstni red znotraj ročnega FR-014, ne nadomešča ga.
         * @default always
         * @enum {string}
         */
        TimeOfDay: "morning" | "afternoon" | "always";
        /**
         * @description `not-applicable` je `iframe`/`mjpeg`/`hls` brez predpomnjenega predogleda (strežniško ni preverljivo,
         *     research.md §3). `unknown` je `never-fetched` — prvi zajem še ni uspel.
         * @enum {string}
         */
        CameraHealthState: "ok" | "stale" | "unreachable" | "unknown" | "not-applicable";
        CameraHealth: {
            state: components["schemas"]["CameraHealthState"];
            /** Format: date-time */
            lastSuccessAt?: string | null;
            ageSeconds?: number | null;
            consecutiveFailures?: number | null;
            lastError?: string | null;
        };
        /**
         * @description Skupna polja kamere. NAMENOMA brez `credentials` — to polje obstaja samo v
         *     `CameraWrite` (telo zahteve), nikoli v `Camera` (odgovor). Ločitev je tipska, ne le
         *     dogovorna: shema `Camera` spodaj deduje iz te osnove, ne iz `CameraWrite`, zato
         *     odgovor fizično ne more prenesti poverilnic (FR-005, glej tudi Complexity Tracking
         *     v plan.md — najdba analize F1).
         */
        CameraBase: {
            name: string;
            type: components["schemas"]["CameraType"];
            /** Format: uri */
            previewUrl: string;
            /** Format: uri */
            fullUrl?: string | null;
            refreshIntervalSeconds?: number;
            groupId?: string | null;
            timeOfDay?: components["schemas"]["TimeOfDay"];
            /** @default true */
            active: boolean;
            /**
             * @default manual
             * @enum {string}
             */
            sourceTemplate: "manual" | "arso-webcam";
        };
        /**
         * @description Telo za `POST /cameras` in `PUT /cameras/{cameraId}`. Edina shema v tej pogodbi, ki
         *     vsebuje `credentials` — namenoma ločena od `Camera` (odgovor), da poverilnic ni
         *     mogoče vrniti niti po pomoti pri serializaciji proti tipu.
         */
        CameraWrite: components["schemas"]["CameraBase"] & {
            /** @description Sprejeto samo v telesu zahteve; nikoli del odgovora (FR-005). */
            credentials?: {
                username?: string;
                password?: string;
            } | null;
        };
        /**
         * @description Odgovor API-ja. Deduje iz `CameraBase`, NE iz `CameraWrite` — polja `credentials` v
         *     tej shemi ni, `hasCredentials` je edini signal (FR-005).
         */
        Camera: components["schemas"]["CameraBase"] & {
            id: string;
            order: number;
            /** @description Ali so shranjene poverilnice — nikoli njihova vrednost (FR-005). */
            hasCredentials: boolean;
            health?: components["schemas"]["CameraHealth"] | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        CameraGroupInput: {
            name: string;
            /** @default false */
            collapsed: boolean;
        };
        CameraGroup: components["schemas"]["CameraGroupInput"] & {
            id: string;
            order: number;
        };
    };
    responses: {
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
         *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
         */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listCameras: {
        parameters: {
            query?: {
                includeInactive?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam kamer */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        cameras: components["schemas"]["Camera"][];
                    };
                };
            };
        };
    };
    createCamera: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CameraWrite"];
            };
        };
        responses: {
            /** @description Kamera dodana */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Camera"];
                };
            };
            /** @description Neveljaven ali nedovoljen naslov (FR-034) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    reorderCameras: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    groupId: string | null;
                    cameraIds: string[];
                };
            };
        };
        responses: {
            /** @description Nov vrstni red shranjen */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        cameras: components["schemas"]["Camera"][];
                    };
                };
            };
        };
    };
    getCamera: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cameraId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Kamera */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Camera"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    updateCamera: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                cameraId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CameraWrite"];
            };
        };
        responses: {
            /** @description Kamera posodobljena */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Camera"];
                };
            };
            404: components["responses"]["NotFound"];
            /** @description Neveljaven ali nedovoljen naslov (FR-034) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    deleteCamera: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                cameraId: string;
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
            404: components["responses"]["NotFound"];
        };
    };
    getCameraSnapshot: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cameraId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Slika (JPEG) */
            200: {
                headers: {
                    "X-Camera-Freshness"?: "fresh" | "refreshed" | "stale";
                    "X-Camera-Age-Seconds"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "image/jpeg": string;
                };
            };
            /** @description Posnetka še ni bilo mogoče pridobiti (never-fetched) */
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
    getCameraStream: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cameraId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zvezen tok (multipart/x-mixed-replace za mjpeg, HLS manifest/segment za hls) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "multipart/x-mixed-replace": string;
                    "application/vnd.apple.mpegurl": string;
                };
            };
            /** @description Vir ni dosegljiv */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
        };
    };
    getCameraHealth: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cameraId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zdravje */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CameraHealth"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    listCameraGroups: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        groups: components["schemas"]["CameraGroup"][];
                    };
                };
            };
        };
    };
    createCameraGroup: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CameraGroupInput"];
            };
        };
        responses: {
            /** @description Skupina dodana */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CameraGroup"];
                };
            };
        };
    };
    reorderCameraGroups: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
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
            /** @description Nov vrstni red shranjen */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        groups: components["schemas"]["CameraGroup"][];
                    };
                };
            };
        };
    };
    updateCameraGroup: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                groupId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CameraGroupInput"];
            };
        };
        responses: {
            /** @description Skupina posodobljena */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CameraGroup"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    deleteCameraGroup: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                groupId: string;
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
            404: components["responses"]["NotFound"];
        };
    };
    listEmbedHosts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        hosts: {
                            host: string;
                            /** @enum {string} */
                            source: "base" | "user";
                        }[];
                    };
                };
            };
        };
    };
    addEmbedHost: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    host: string;
                    addedReason?: string;
                };
            };
        };
        responses: {
            /** @description Gostitelj dodan */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        host: string;
                        /** @enum {string} */
                        source: "user";
                    };
                };
            };
        };
    };
    removeEmbedHost: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001/002.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                host: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Odstranjeno */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            404: components["responses"]["NotFound"];
        };
    };
    listArsoWebcams: {
        parameters: {
            query: {
                location: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam kandidatov */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        webcams: {
                            direction: string;
                            /** Format: uri */
                            imageUrl: string;
                        }[];
                    };
                };
            };
        };
    };
}
