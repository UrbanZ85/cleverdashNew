export interface paths {
    "/scanners/types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Registrirani tipi skenerjev
         * @description Vsi registrirani tipi z `enabled` (vklopljen v tej namestitvi) in `available` (klicatelj
         *     ima obsege tipa). Čarovnik ponudi samo tipe z `enabled && available`. Tipi, ki niso
         *     implementirani, v seznamu NISO.
         */
        get: operations["listScannerTypes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Moji skenerji (vsi tipi) */
        get: operations["listScanners"];
        put?: never;
        /**
         * Ustvari skener (tipi z generično shrambo)
         * @description `config` preveri tip po svoji shemi; `400` z enim slovenskim stavkom ob napaki. Tip z
         *     lastnimi definicijami (`ownsDefinitions: true`) vrne `400` z `createRoute`. Tip, ki ni
         *     registriran ali vklopljen, `400`. Meja `limits.maxPerUser` na tip, `400` ob prekoračitvi.
         */
        post: operations["createScanner"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners/{scannerId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scannerId: components["parameters"]["ScannerId"];
            };
            cookie?: never;
        };
        /**
         * En skener s konfiguracijo
         * @description Samo generične definicije; id iskanja letov vrne `404` (ureja se v 015).
         */
        get: operations["getScanner"];
        put?: never;
        post?: never;
        /** Izbriši skener z rezultati in zgodovino */
        delete: operations["deleteScanner"];
        options?: never;
        head?: never;
        /**
         * Uredi skener
         * @description Delni vnos se zlije z obstoječim in preveri kot celota; sprememba urnika premakne "pokrito do zdaj".
         */
        patch: operations["updateScanner"];
        trace?: never;
    };
    "/scanners/{scannerId}/run": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scannerId: components["parameters"]["ScannerId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sproži skener takoj (tipi z izvajanjem na skener)
         * @description Lastnik sme sprožiti svoj skener; pri tipu z batch izvajanjem `403` (zagon je tipov in ga
         *     sproži administrator). `409`, kadar zagon tega skenerja že teče ali čaka. Deluje tudi pri
         *     izklopljenem skenerju (kot ročni zagon pri izklopljenem urniku v 015).
         */
        post: operations["runScanner"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners/{scannerId}/runs": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scannerId: components["parameters"]["ScannerId"];
            };
            cookie?: never;
        };
        /** Zagoni tega skenerja (brez administratorskih podrobnosti) */
        get: operations["listScannerRuns"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners/{scannerId}/results": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scannerId: components["parameters"]["ScannerId"];
            };
            cookie?: never;
        };
        /**
         * Rezultati skenerja
         * @description Deluje za obe vrsti skenerjev: generična shramba vrne `ScannerResult`, tip z lastno
         *     shrambo (leti) vrne svoje rezultate v obliki `ScannerResult` s podatki tipa v `data`.
         *     Odjemalec s prispevkom tipa (register) lahko izriše svoj pogled.
         */
        get: operations["listScannerResults"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners/{scannerId}/results/{resultId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scannerId: components["parameters"]["ScannerId"];
                resultId: string;
            };
            cookie?: never;
        };
        /** En rezultat z zgodovino opazovanj */
        get: operations["getScannerResult"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners/admin/types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tipi z urniki (batch) in dodatki tipa */
        get: operations["listScannerTypesAdmin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners/admin/types/{type}/schedule": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                type: string;
            };
            cookie?: never;
        };
        /** Urnik tipa z naslednjim terminom */
        get: operations["getScannerTypeSchedule"];
        /**
         * Spremeni urnik tipa
         * @description Samo tipi z batch izvajanjem (`single` tip vrne `400`). `preset` različen od `custom`
         *     prepiše izraz; pri `custom` je izraz obvezen. Preverjeno pred shranjevanjem; velja ob
         *     naslednjem tiku brez ponovnega zagona.
         */
        put: operations["updateScannerTypeSchedule"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners/admin/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Zgodovina zagonov vseh tipov */
        get: operations["listScannerRunsAdmin"];
        put?: never;
        /**
         * Sproži zagon tipa ali skenerja takoj
         * @description Natanko eno od `type` (batch tip) ali `scannerId` (single skener). `409`, kadar zagon
         *     istega obsega že teče ali čaka; telo je tisti zagon.
         */
        post: operations["triggerScannerRunAdmin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners/admin/runs/{runId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                runId: string;
            };
            cookie?: never;
        };
        /** En zagon z izidi po skenerjih in napakami */
        get: operations["getScannerRunAdmin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners/admin/runs/{runId}/cancel": {
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
         * @description Kot v 015 — `cancelRequested`, zagon se ustavi ob naslednjem koraku, dopisov ne sestavi; `409` na končanem.
         */
        post: operations["cancelScannerRunAdmin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scanners/admin/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Outbox dopisov vseh tipov */
        get: operations["listScannerNotificationsAdmin"];
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
        Person: {
            id: string;
            displayName: string;
            initials: string;
            emailHint?: string;
        };
        Money: {
            amount: number;
            currency: string;
        };
        /** @enum {string} */
        ChangeType: "NEW" | "PRICE_DOWN" | "PRICE_UP" | "CHANGED" | "UNCHANGED" | "UNAVAILABLE";
        /** @enum {string} */
        SchedulePresetId: "daily-06" | "daily-06-18" | "every-6h" | "hourly" | "monday-08" | "custom";
        SchedulePreset: {
            id: components["schemas"]["SchedulePresetId"];
            label: string;
            cronExpression: string;
        };
        Limits: {
            /** @description Meja skenerjev na uporabnika in tip */
            maxPerUser: number;
        };
        ScannerTypeInfo: {
            type: string;
            /** @description Slovensko ime */
            label: string;
            icon: string;
            /** @enum {string} */
            execution: "batch" | "single";
            /** @description Vklopljen v tej namestitvi */
            enabled: boolean;
            /** @description Klicatelj ima obsege tipa */
            available: boolean;
            /** @description Tip hrani definicije sam (leti) */
            ownsDefinitions: boolean;
            /** @description Tip ima lasten prikaz rezultatov */
            customResults: boolean;
            /** @description Pot odjemalca za ustvarjanje pri `ownsDefinitions` */
            createRoute?: string | null;
            description?: string;
        };
        ScheduleInfo: {
            /** @enum {string} */
            mode: "own" | "type";
            preset?: components["schemas"]["SchedulePresetId"];
            cronExpression?: string;
            timezone?: string;
            /** @description Slovensko, npr. "vsakih 6 ur" ali "po urniku tipa (vsak dan ob 6:00 in 18:00)" */
            label: string;
            /** Format: date-time */
            nextRunAt: string | null;
            nextRunLocal: string | null;
        };
        LastRun: {
            /** Format: date-time */
            at: string;
            /** @enum {string} */
            outcome: "ok" | "failed" | "skipped";
            message: string | null;
        };
        ScannerSummary: {
            id: string;
            type: string;
            typeLabel: string;
            name: string;
            enabled: boolean;
            schedule: components["schemas"]["ScheduleInfo"];
            lastRun: components["schemas"]["LastRun"] | null;
            /** Format: date-time */
            lastSuccessAt: string | null;
            resultCount: number;
            /** @description `false` = tip ni registriran ali vklopljen (FR-011) */
            typeAvailable: boolean;
            links: {
                /** @description Pot odjemalca */
                edit: string;
                results: string;
            };
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ScannerInput: {
            name: string;
            type: string;
            /** @default true */
            enabled: boolean;
            schedule?: {
                preset?: components["schemas"]["SchedulePresetId"];
                cronExpression?: string;
                /** @default Europe/Ljubljana */
                timezone: string;
            };
            notifications?: {
                /** @default true */
                enabled: boolean;
            };
            /** @description Oblika last tipa; preverjena s shemo tipa */
            config: Record<string, never>;
        };
        /** @description Vsa polja neobvezna; izpuščeno = ne spreminjaj */
        ScannerPatch: {
            name?: string;
            enabled?: boolean;
            schedule?: {
                preset?: components["schemas"]["SchedulePresetId"];
                cronExpression?: string;
                timezone?: string;
            };
            notifications?: {
                enabled?: boolean;
            };
            config?: Record<string, never>;
        };
        Scanner: components["schemas"]["ScannerSummary"] & {
            config: Record<string, never>;
            notifications: {
                enabled: boolean;
                /** @enum {string} */
                mode: "all-changes";
            };
        };
        Result: {
            id: string;
            scannerId: string;
            type: string;
            source: string;
            externalId: string | null;
            title: string;
            url: string | null;
            price: components["schemas"]["Money"] | null;
            /** @description Podatki po kategoriji (oblika last tipa) */
            data: Record<string, never>;
            /** Format: date-time */
            dataAt: string;
            /** Format: date-time */
            firstSeenAt: string;
            /** Format: date-time */
            lastSeenAt: string;
            /** @enum {string} */
            availability: "available" | "unavailable";
            previousPrice: (components["schemas"]["Money"] & {
                /** Format: date-time */
                at: string;
            }) | null;
            lastChangeType: components["schemas"]["ChangeType"];
            /** @description Izračunana sprememba cene (kot v 015), `null` brez cene ali brez prejšnje */
            change: {
                type?: components["schemas"]["ChangeType"];
                absolute?: number;
                percent?: number;
            } | null;
        };
        ResultList: {
            results: components["schemas"]["Result"][];
            total: number;
        };
        HistoryPoint: {
            /** Format: date-time */
            checkedAt: string;
            price: components["schemas"]["Money"] | null;
            changeType: components["schemas"]["ChangeType"];
        };
        ResultDetail: components["schemas"]["Result"] & {
            history: components["schemas"]["HistoryPoint"][];
        };
        SchedulePatch: {
            enabled?: boolean;
            preset?: components["schemas"]["SchedulePresetId"];
            cronExpression?: string;
            timezone?: string;
        };
        TypeSchedule: {
            type: string;
            enabled: boolean;
            preset: components["schemas"]["SchedulePresetId"];
            cronExpression: string;
            timezone: string;
            /** Format: date-time */
            nextRunAt: string | null;
            nextRunLocal: string | null;
            /** Format: date-time */
            updatedAt: string;
            updatedBy: components["schemas"]["Person"] | null;
        };
        ScannerTypeAdmin: components["schemas"]["ScannerTypeInfo"] & {
            /** @description `null` pri tipih z izvajanjem na skener */
            schedule: components["schemas"]["TypeSchedule"] | null;
            /** @description Vsi skenerji tipa v namestitvi */
            definitionCount: number;
            /** @description Dodatek tipa (leti — stanje virov, dnevne meje); oblika last tipa, brez skrivnosti */
            extras: Record<string, never> | null;
        };
        RunSummary: {
            id: string;
            type: string;
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
            counters: {
                [key: string]: number;
            };
        };
        Run: components["schemas"]["RunSummary"] & {
            scope: {
                /** @enum {string} */
                kind: "type" | "definition";
                scannerId?: string;
                owner?: components["schemas"]["Person"] | null;
            };
            requestedBy: components["schemas"]["Person"] | null;
            cancelRequested: boolean;
            /** @description Izid na skener (FR-017) */
            definitions: {
                scannerId: string;
                name?: string;
                /** @enum {string} */
                outcome: "ok" | "failed" | "skipped";
                message: string | null;
            }[];
            /** @description Dodatek tipa (leti — izidi po virih) */
            extras: Record<string, never> | null;
            errors: {
                /** Format: date-time */
                at: string;
                scannerId?: string;
                code: string;
                message: string;
            }[];
            /** Format: date-time */
            createdAt: string;
        };
        NotificationAdmin: {
            id: string;
            type: string;
            runId: string;
            recipient: components["schemas"]["Person"];
            /** @enum {string} */
            status: "pending" | "sending" | "sent" | "failed" | "suppressed";
            /** @enum {string|null} */
            suppressedReason: "smtp-not-configured" | "no-email" | "user-missing" | "no-items" | "type-unavailable" | null;
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
        ScannerId: string;
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listScannerTypes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Tipi */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        types: components["schemas"]["ScannerTypeInfo"][];
                        /** @description Prednastavitve urnika, skupne vsem tipom */
                        presets: components["schemas"]["SchedulePreset"][];
                    };
                };
            };
        };
    };
    listScanners: {
        parameters: {
            query?: {
                /** @description Samo en tip */
                type?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Skenerji, nazadnje spremenjeni najprej */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        scanners: components["schemas"]["ScannerSummary"][];
                        limits: components["schemas"]["Limits"];
                    };
                };
            };
            403: components["responses"]["Forbidden"];
        };
    };
    createScanner: {
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
                "application/json": components["schemas"]["ScannerInput"];
            };
        };
        responses: {
            /** @description Ustvarjen */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Scanner"];
                };
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
        };
    };
    getScanner: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scannerId: components["parameters"]["ScannerId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Skener */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Scanner"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    deleteScanner: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                scannerId: components["parameters"]["ScannerId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Izbrisan */
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
    updateScanner: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                scannerId: components["parameters"]["ScannerId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScannerPatch"];
            };
        };
        responses: {
            /** @description Skener */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Scanner"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
        };
    };
    runScanner: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                scannerId: components["parameters"]["ScannerId"];
            };
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
            404: components["responses"]["NotFound"];
            /** @description Zagon že teče */
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
    listScannerRuns: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                scannerId: components["parameters"]["ScannerId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zagoni, najnovejši najprej; pri batch tipu zagoni tipa */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        runs: components["schemas"]["RunSummary"][];
                    };
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    listScannerResults: {
        parameters: {
            query?: {
                sort?: "seen" | "price" | "change";
                includeUnavailable?: "true" | "false";
                limit?: number;
            };
            header?: never;
            path: {
                scannerId: components["parameters"]["ScannerId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Rezultati */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResultList"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    getScannerResult: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scannerId: components["parameters"]["ScannerId"];
                resultId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Rezultat */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResultDetail"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    listScannerTypesAdmin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Tipi */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        types: components["schemas"]["ScannerTypeAdmin"][];
                        email: {
                            configured: boolean;
                        };
                    };
                };
            };
            403: components["responses"]["Forbidden"];
        };
    };
    getScannerTypeSchedule: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                type: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Urnik */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TypeSchedule"];
                };
            };
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    updateScannerTypeSchedule: {
        parameters: {
            query?: never;
            header?: {
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                type: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SchedulePatch"];
            };
        };
        responses: {
            /** @description Urnik */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TypeSchedule"];
                };
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    listScannerRunsAdmin: {
        parameters: {
            query?: {
                type?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zagoni, najnovejši najprej, in vsi, ki tečejo ali čakajo */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        runs: components["schemas"]["Run"][];
                        active: components["schemas"]["Run"][];
                    };
                };
            };
            403: components["responses"]["Forbidden"];
        };
    };
    triggerScannerRunAdmin: {
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
                    type?: string;
                    scannerId?: string;
                };
            };
        };
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
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
            /** @description Zagon že teče */
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
    getScannerRunAdmin: {
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
    cancelScannerRunAdmin: {
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
    listScannerNotificationsAdmin: {
        parameters: {
            query?: {
                type?: string;
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
