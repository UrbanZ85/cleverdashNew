export interface paths {
    "/time-tracking/state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Preberi trenutno stanje ure
         * @description Odpre stran delodajalca in prebere, katere akcije so na voljo (FR-020). Ne klikne
         *     ničesar. Rezultat je predpomnjen za `cacheSeconds` (privzeto 60), ker vsak klic
         *     pomeni zagon brskalnika; `refresh=true` predpomnilnik obide.
         *
         *     Prazen `availableActions` **ni** veljavno stanje — je okvara, in `diagnostics`
         *     pove kakšna (FR-022). Zahtevani obseg: `state:read`.
         */
        get: operations["readState"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/available-actions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam trenutno razpoložljivih imen akcij
         * @description Krajša oblika `readState` — samo imena gumbov, kot so na strani (FR-021, imena se
         *     ne trdo kodirajo). Zahtevani obseg: `state:read`.
         */
        get: operations["listAvailableActions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/actions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Izvedi akcijo takoj (ročno ali prek API-ja)
         * @description Pritisne gumb na strani delodajalca in **preveri**, da se je stanje spremenilo
         *     (FR-030). Uporablja tudi Story 1 (ročni pritisk iz zaslona "Danes") in Story 11
         *     (n8n) — vir izvedbe (`manual` vs `api`) se ugotovi iz vrste avtentikacije, ne iz
         *     telesa zahteve.
         *
         *     Pred klikom preveri stanje: če je stanje že takšno, kot bi bilo po akciji →
         *     `already_done`, brez klika (FR-033); če akcija v trenutnem stanju ni dovoljena →
         *     `unexpected_state`, brez klika. Vrne šele, ko je verifikacija končana — tipično
         *     5 do 20 sekund (SC-006). Zahtevani obseg: `action:write`.
         */
        post: operations["performAction"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/planned-actions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Načrtovane akcije
         * @description Privzeto današnji dan. Zahtevani obseg: `schedule:read`.
         */
        get: operations["listPlannedActions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/planned-actions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        /**
         * Ena načrtovana akcija, s poskusi
         * @description Zahtevani obseg: `schedule:read`.
         */
        get: operations["getPlannedAction"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Premakni, preskoči ali ponovno omogoči
         * @description Ne uporablja se za izvedbo — za to je `POST /time-tracking/actions`.
         *     Zahtevani obseg: `schedule:write`.
         */
        patch: operations["updatePlannedAction"];
        trace?: never;
    };
    "/time-tracking/rebuild-plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sestavi dnevni načrt znova
         * @description Idempotentno: obstoječih izvedenih akcij ne podvoji in ne prepiše (unikatni ključ
         *     `(localDate, profileId, actionName)`). Za `mode: OFF` profile ustvari `CalendarDay`,
         *     a nobene `PlannedAction` (FR-008). Zahtevani obseg: `schedule:write`.
         */
        post: operations["rebuildPlan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/profiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Urniški profili
         * @description Zahtevani obseg: `schedule:read`.
         */
        get: operations["listProfiles"];
        put?: never;
        /**
         * Nov profil
         * @description Zavrne se, če se `daysOfWeek` prekriva z drugim **aktivnim** profilom (FR-006).
         *     Brez `mode` v telesu je privzeta vrednost `AUTO` (FR-007). Zahtevani obseg:
         *     `schedule:write`.
         */
        post: operations["createProfile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/profiles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        /** Profil */
        get: operations["getProfile"];
        /**
         * Posodobi profil
         * @description Zahtevani obseg: `schedule:write`.
         */
        put: operations["updateProfile"];
        post?: never;
        /**
         * Izbriši profil
         * @description Prihodnje načrtovane akcije tega profila preidejo v `cancelled`. Zahtevani obseg: `schedule:write`.
         */
        delete: operations["deleteProfile"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/profiles/{id}/mode": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Nastavi način profila
         * @description Ločen endpoint, ker je to najpogostejša sprememba prek n8n (npr. izklop urnika ob
         *     nenačrtovani odsotnosti). `OFF` ne izbriše prihodnjih `PlannedAction` — te preidejo
         *     v `cancelled` ob naslednjem sestavljanju načrta (FR-008). Zahtevani obseg:
         *     `schedule:write`.
         */
        put: operations["setProfileMode"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/profiles/{id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Predogled načrta brez zapisovanja
         * @description Izračuna, kaj bi se za dani datum zgodilo — vključno z raztrosom, statusom dneva
         *     in razlogom. Nič ne zapiše. Namenjeno preverjanju pred vklopom `AUTO`
         *     (quickstart.md §6, korak 5). Zahtevani obseg: `schedule:read`.
         */
        get: operations["previewProfile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/calendar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pregled dni s statusi
         * @description FR-015. Zahtevani obseg: `calendar:read`.
         */
        get: operations["getCalendar"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/absences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Obdobja odsotnosti
         * @description Zahtevani obseg: `calendar:read`.
         */
        get: operations["listAbsences"];
        put?: never;
        /**
         * Vnesi dopust ali odsotnost
         * @description `endDate` je **vključen** (FR-012). Prihodnje načrtovane akcije v tem obdobju
         *     preidejo v `cancelled`. Zavrnjeno z `422`, če se prekriva z `forceWorkday` izjemo
         *     za isti profil in datum (edge case, Story 6). Zahtevani obseg: `calendar:write`.
         */
        post: operations["createAbsence"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/absences/{id}": {
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
         * Izbriši odsotnost
         * @description Načrt za prizadete prihodnje dni se sestavi znova. Zahtevani obseg: `calendar:write`.
         */
        delete: operations["deleteAbsence"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/holidays": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Prazniki
         * @description FR-010. Zahtevani obseg: `calendar:read`.
         */
        get: operations["listHolidays"];
        put?: never;
        /**
         * Dodaj ali popravi praznik
         * @description Ročni vnos prevlada nad izračunanim (FR-011). Zahtevani obseg: `calendar:write`.
         */
        post: operations["upsertHoliday"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/overrides": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Vsili delovni ali nedelovni dan
         * @description Najvišja prednost v odločitvi o dnevu (FR-014). Zavrnjeno z `422`, če se prekriva
         *     z obstoječo odsotnostjo za isti profil in datum. Zahtevani obseg: `calendar:write`.
         */
        post: operations["createOverride"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Zgodovina akcij
         * @description Privzeto zadnjih 7 dni (FR-051). Zahtevani obseg: `history:read`.
         */
        get: operations["getHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/history/{id}/attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Poskusi za en zapis
         * @description FR-050. Zahtevani obseg: `history:read`.
         */
        get: operations["getAttempts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/history/attempts/{id}/screenshot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Posnetek zaslona enega poskusa
         * @description US9 AS3, FR-032: posnetek, ki je nastal ob neuspelem poskusu. Pot do datoteke se bere iz zapisa poskusa (ki mora pripadati klicatelju), nikoli iz zahtevka. Po FR-053 datoteke izginejo prej kot zapisi — takrat 404. Zahtevani obseg: `history:read`.
         */
        get: operations["getAttemptScreenshot"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/diagnostics/test-read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Preizkusno branje stanja (dry-run)
         * @description Zažene brskalnik, naloži stran, prebere gumbe in vrne podrobno diagnostiko,
         *     vključno s posnetkom zaslona. Ne klikne ničesar (FR-035, FR-064). Priporočen prvi
         *     korak po prvem zagonu (quickstart.md §6, korak 3) — brez zanesljivega branja
         *     ničesar drugega ni smiselno vklapljati. Zahtevani obseg: `health:read` (obstoječ
         *     obseg iz 001).
         */
        post: operations["testRead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/locations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lokacije
         * @description FR-090. Zahtevani obseg: `schedule:read`.
         */
        get: operations["listLocations"];
        put?: never;
        /**
         * Nova lokacija
         * @description Zahtevani obseg: `schedule:write`.
         */
        post: operations["createLocation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/locations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Popravi lokacijo
         * @description Delni popravek — poslana so samo polja, ki se spremenijo. V praksi se spremeni
         *     `url` (žeton v poti `Clockin-…`) ali par koordinat. Zahtevani obseg:
         *     `schedule:write`.
         */
        put: operations["updateLocation"];
        post?: never;
        /**
         * Izbriši lokacijo
         * @description Zavrnjeno s 409, če lokacijo uporablja kak profil — brisanje ni kaskadno, ker bi
         *     tiho razveljavilo urnik. Zahtevani obseg: `schedule:write`.
         */
        delete: operations["deleteLocation"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seje pri delodajalcu
         * @description Vrednost piškotka je vedno maskirana (FR-092). Zahtevani obseg: `schedule:read`.
         */
        get: operations["listSessions"];
        put?: never;
        /**
         * Nova seja (piškotek delodajalca)
         * @description Ob prvem zagonu je baza prazna: brez tega ni seje, brez seje ni lokacije in
         *     Nastavitve so slepa ulica (quickstart.md §6, korak 1). Nastavljive so vse štiri
         *     lastnosti piškotka, ki jih je staro okolje imelo kot obvezne spremenljivke
         *     `cookie_property_name`, `_value`, `_domain`, `_expires`
         *     (docs/env-reference.md §1). Nova seja je `unknown`, dokler je preizkusno branje ne
         *     potrdi. Zahtevani obseg: `schedule:write`.
         */
        post: operations["createSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/sessions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Popravi sejni piškotek
         * @description Uporablja se, ko seja pri delodajalcu poteče (FR-091). Ne zahteva ponovnega
         *     zagona. Delni popravek: poslana so samo polja, ki se spremenijo — ime piškotka in
         *     domena sta popravljiva enako kot vrednost, ker sta v starem sistemu bila obvezna
         *     podatka okolja. Po shranjevanju sistem takoj opravi preizkusno branje in vrne, ali
         *     seja deluje. Vrednost piškotka se v odgovorih **nikoli** ne vrne v celoti
         *     (FR-092). Zahtevani obseg: `schedule:write`.
         */
        put: operations["updateSession"];
        post?: never;
        /**
         * Izbriši sejo
         * @description Zavrnjeno s 409, če sejo uporablja kaka lokacija. Zahtevani obseg:
         *     `schedule:write`.
         */
        delete: operations["deleteSession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/webhooks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam nastavljenih webhook naslovov
         * @description `secret` se v odgovoru ne vrne. Zahtevani obseg: `webhooks:write`.
         */
        get: operations["listWebhookEndpoints"];
        put?: never;
        /**
         * Dodaj webhook naslov
         * @description `secret` se vrne samo v tem odgovoru, ob ustvarjanju (FR-083, enak vzorec kot
         *     `apiKeys` iz 001). Dogodki: `action.succeeded`, `action.failed`, `action.missed`,
         *     `session.expiring`. Zahtevani obseg: `webhooks:write`.
         */
        post: operations["createWebhookEndpoint"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/time-tracking/webhooks/{id}": {
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
         * Odstrani webhook naslov
         * @description Zahtevani obseg: `webhooks:write`.
         */
        delete: operations["deleteWebhookEndpoint"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description RFC 9457 problem details — ista oblika kot 001. */
        Problem: {
            type: string;
            title: string;
            status: number;
            detail?: string;
            correlationId?: string;
        };
        /**
         * @description Izpeljano iz nabora razpoložljivih akcij. `UNKNOWN` pomeni okvaro, ne stanje.
         * @enum {string}
         */
        ClockState: "OFF_DUTY" | "ON_DUTY" | "ON_BREAK" | "UNKNOWN";
        /**
         * @description Privzeta vrednost za nov profil je `AUTO` (FR-007). `OFF` ne ustvari nobene
         *     `PlannedAction` niti obvestila za dneve tega profila — koledarski status dneva se
         *     kljub temu izračuna naprej (FR-008).
         * @default AUTO
         * @enum {string}
         */
        Mode: "AUTO" | "REMIND_ONLY" | "OFF";
        /** @enum {string} */
        PlannedActionState: "planned" | "due" | "running" | "succeeded" | "failed" | "already_done" | "missed" | "skipped" | "cancelled";
        /** @enum {string} */
        FinalOutcome: "succeeded" | "failed" | "missed" | "skipped" | "already_done" | "cancelled";
        /** @enum {string} */
        CalendarDayStatus: "workday" | "weekend" | "holiday" | "vacation" | "sick" | "other" | "forced";
        /** @enum {string} */
        AttemptOutcome: "verified" | "not_verified" | "action_unavailable" | "unexpected_state" | "browser_error" | "session_expired" | "timeout";
        /** @description Zakaj branje ni uspelo. Loči vzroke, ki so v starem sistemu bili videti enako (FR-022). */
        Diagnostics: {
            /** @enum {string} */
            reason?: "ok" | "session_expired" | "page_unreachable" | "selector_not_found" | "geolocation_denied" | "browser_launch_failed" | "timeout";
            message?: string | null;
            /** @description Berljiv nasvet, npr. "vpiši nov sejni piškotek v Nastavitvah". */
            hint?: string | null;
        };
        StateReading: {
            state: components["schemas"]["ClockState"];
            availableActions: string[];
            /** Format: date-time */
            readAt: string;
            fromCache: boolean;
            locationId?: string | null;
            locationName?: string | null;
            /** @enum {string} */
            sessionStatus?: "active" | "expiring" | "expired" | "unknown";
            diagnostics?: components["schemas"]["Diagnostics"];
        };
        ActionResult: {
            outcome: components["schemas"]["AttemptOutcome"];
            actionName: string;
            /** @description `true` samo, če je ponovno branje stanja potrdilo pričakovano spremembo (FR-030). */
            verified: boolean;
            stateBefore?: components["schemas"]["ClockState"];
            stateAfter?: components["schemas"]["ClockState"];
            attemptCount?: number;
            plannedActionId?: string | null;
            durationMs?: number;
            dryRun?: boolean;
            failureReason?: string | null;
        };
        PlannedAction: {
            id?: string;
            /** Format: date */
            localDate?: string;
            profileId?: string;
            profileName?: string;
            locationName?: string;
            actionName?: string;
            actionOrder?: number;
            /** Format: date-time */
            scheduledAt?: string;
            /** @example 06:18:00 */
            baseLocalTime?: string;
            mode?: components["schemas"]["Mode"];
            state?: components["schemas"]["PlannedActionState"];
            attemptCount?: number;
            reminderCount?: number;
            /** @enum {string} */
            source?: "schedule" | "manual" | "api" | "legacy";
            /** Format: date-time */
            completedAt?: string | null;
            failureReason?: string | null;
        };
        PlannedActionDetail: components["schemas"]["PlannedAction"] & {
            attempts?: components["schemas"]["ActionAttempt"][];
        };
        ActionAttempt: {
            id?: string;
            attemptNumber?: number;
            /** Format: date-time */
            startedAt?: string;
            /** Format: date-time */
            finishedAt?: string;
            outcome?: components["schemas"]["AttemptOutcome"];
            clockStateBefore?: components["schemas"]["ClockState"];
            clockStateAfter?: components["schemas"]["ClockState"];
            availableActionsBefore?: string[];
            availableActionsAfter?: string[];
            errorMessage?: string | null;
            /** @description Naslov, ki posnetek postreže (`/time-tracking/history/attempts/{id}/screenshot`), ne pot na disku strežnika. `null`, kadar poskus posnetka nima. */
            screenshotUrl?: string | null;
            durationMs?: number;
        };
        ActionRecord: {
            id?: string;
            /** Format: date */
            localDate?: string;
            profileName?: string;
            locationName?: string;
            actionName?: string;
            /** Format: date-time */
            scheduledAt?: string;
            /** Format: date-time */
            completedAt?: string | null;
            finalOutcome?: components["schemas"]["FinalOutcome"];
            /** @enum {string} */
            source?: "schedule" | "manual" | "api" | "legacy";
            stateBefore?: components["schemas"]["ClockState"];
            stateAfter?: components["schemas"]["ClockState"];
            attemptSummary?: {
                count?: number;
                /** Format: date-time */
                firstAt?: string;
                /** Format: date-time */
                lastAt?: string;
            };
            failureReason?: string | null;
            note?: string | null;
        };
        ActionPlan: {
            /** @description Točno besedilo gumba na strani delodajalca. */
            actionName: string;
            /** @example 06:18:00 */
            localTime: string;
            /** @default 300 */
            jitterSeconds: number;
            order: number;
            /** @default true */
            enabled: boolean;
        };
        TrackingProfileInput: {
            name: string;
            /**
             * @description ISO dnevi, 1 = ponedeljek … 7 = nedelja.
             * @example [
             *       1,
             *       2,
             *       3,
             *       4
             *     ]
             */
            daysOfWeek: number[];
            locationId: string;
            mode?: components["schemas"]["Mode"];
            actions: components["schemas"]["ActionPlan"][];
            /** @default 10 */
            graceMinutes: number;
            /** @default 90 */
            maxDelayMinutes: number;
            /** @default 3 */
            maxAttempts: number;
            /**
             * @default [
             *       30,
             *       120,
             *       300
             *     ]
             */
            retryBackoffSeconds: number[];
            /** @default 3 */
            maxReminders: number;
            /** @default 10 */
            reminderIntervalMinutes: number;
            /** @default true */
            active: boolean;
        };
        TrackingProfile: components["schemas"]["TrackingProfileInput"] & {
            id?: string;
            locationName?: string;
            /** Format: date-time */
            createdAt?: string;
            /** Format: date-time */
            updatedAt?: string;
        };
        /**
         * @description `coordinateTemplate` je obvezen, dokler je `sendGeolocation` `true` (privzeto);
         *     lokacija, ki lege ne pošilja, koordinat ne potrebuje in jih ni treba izmisliti
         *     (FR-094). Vklop pošiljanja na lokaciji brez koordinat je zavrnjen s 400.
         */
        TrackingLocationInput: {
            name: string;
            /** Format: uri */
            url: string;
            sessionId: string;
            /**
             * @description Gumb, s katerim se na tej lokaciji ZAČNE delo (FR-090). Vse štiri različice
             *     vodijo v isto stanje `ON_DUTY` in se izključujejo; katera velja, je lastnost
             *     kraja, ne urnika. Načrt in zgodovina zapišeta ime, razrešeno po tem polju, ne
             *     imena iz profila.
             * @default Prijava na delo
             * @enum {string}
             */
            startAction: "Prijava na delo" | "Prihod na delo" | "Delo od doma" | "Delo na terenu";
            /**
             * @description Znak `_` označuje mesto, kamor se ob vsaki uporabi vstavi naključna števka —
             *     glej `docs/legacy-engine.md` §3.
             */
            coordinateTemplate?: {
                /** @example 46.0629_6 */
                latitude: string;
                /** @example 14.5602_9 */
                longitude: string;
            };
            /**
             * @description Ali se lega naprave pošlje strani (FR-094). `false` pomeni, da brskalnik
             *     geolokacije nima — dovoljenje je izrecno zavrnjeno, koordinati pa OSTANETA
             *     shranjeni, da je stikalo mogoče kadar koli vklopiti nazaj. Stran, ki lego
             *     zahteva, ob izklopu morda ne pokaže nobenega gumba; diagnostika na to opozori.
             * @default true
             */
            sendGeolocation: boolean;
            /** @default 10 */
            jitterMeters: number;
            /** @default true */
            active: boolean;
        };
        /**
         * @description Delni popravek lokacije — brez privzetih vrednosti, da popravek enega polja ne
         *     vrne `jitterMeters`/`active` na privzeto. Vsaka lokacija ima SVOJ par koordinat:
         *     doma, služba, terén — koordinate so podatek beleženja časa in se v aplikaciji ne
         *     uporabljajo nikjer drugje (lokacija za vreme je ločena nastavitev).
         */
        TrackingLocationPatch: {
            name?: string;
            /** Format: uri */
            url?: string;
            sessionId?: string;
            /** @enum {string} */
            startAction?: "Prijava na delo" | "Prihod na delo" | "Delo od doma" | "Delo na terenu";
            coordinateTemplate?: {
                /** @example 46.0629_6 */
                latitude: string;
                /** @example 14.5602_9 */
                longitude: string;
            };
            sendGeolocation?: boolean;
            jitterMeters?: number;
            active?: boolean;
        };
        TrackingLocation: components["schemas"]["TrackingLocationInput"] & {
            id?: string;
            /** @enum {string} */
            sessionStatus?: "active" | "expiring" | "expired" | "unknown";
        };
        /**
         * @description Štiri lastnosti piškotka, ki jih je staro okolje imelo kot obvezne spremenljivke
         *     `cookie_property_name`, `_value`, `_domain` in `_expires`
         *     (docs/env-reference.md §1). Vse so nastavljive iz Nastavitev — zamenjava same
         *     vrednosti ne zadošča, ker brez imena in domene brskalnik piškotka ne pošlje.
         */
        RemoteSessionInput: {
            /** @example Agenda — e-računi */
            name: string;
            /** @default ItcClientID */
            cookieName: string;
            /** @description Zapisljiva, nikoli vrnjena v celoti (FR-092). */
            cookieValue: string;
            /** @example e-racuni.com */
            cookieDomain: string;
            /**
             * @description ISO 8601 čas, unix SEKUNDE (oblika starega sistema,
             *     `cookie_property_expires=1737717074`) ali `null`, kadar rok ni znan.
             */
            expiresAt?: string | number | null;
        };
        /** @description Delni popravek seje — poslana so samo polja, ki se spremenijo. */
        RemoteSessionPatch: {
            name?: string;
            cookieName?: string;
            cookieValue?: string;
            cookieDomain?: string;
            expiresAt?: string | number | null;
        };
        /** @description Vrednost piškotka se nikoli ne vrne v celoti (FR-092). */
        RemoteSession: {
            id?: string;
            name?: string;
            cookieName?: string;
            /** @example pMLxj97D…8284 */
            cookieValueMasked?: string;
            cookieDomain?: string;
            /**
             * @description Izpeljano: bajti imena + vrednosti, enako stolpcu "Size" v brskalnikovem
             *     razhroščevalniku. Ni nastavljiv — piškotek te lastnosti ne nosi. Prikazan je
             *     zato, da je vidno, ali je bila vrednost prilepljena cela.
             */
            cookieSize?: number;
            /** Format: date-time */
            expiresAt?: string | null;
            /** @enum {string} */
            status?: "active" | "expiring" | "expired" | "unknown";
            /** Format: date-time */
            lastVerifiedAt?: string | null;
            lastVerifyError?: string | null;
            daysUntilExpiry?: number | null;
        };
        CalendarDay: {
            /** Format: date */
            localDate?: string;
            profileId?: string;
            status?: components["schemas"]["CalendarDayStatus"];
            /**
             * @example Marijino vnebovzetje
             * @example dopust
             * @example ni v dneh profila
             */
            reason?: string | null;
            plannedActionCount?: number;
        };
        AbsencePeriodInput: {
            /** @enum {string} */
            type: "vacation" | "sick" | "other";
            /** Format: date */
            startDate: string;
            /**
             * Format: date
             * @description Vključen.
             */
            endDate: string;
            note?: string | null;
            /** @description Prazno pomeni vse profile. */
            profileIds?: string[];
        };
        AbsencePeriod: components["schemas"]["AbsencePeriodInput"] & {
            id?: string;
            dayCount?: number;
        };
        Holiday: {
            /** Format: date */
            date: string;
            name: string;
            /**
             * @description 17. avgust in 23. november sta praznika, ki nista dela prosta. Za urnik šteje samo to polje.
             * @default true
             */
            isWorkFree: boolean;
            /** @default true */
            isHoliday: boolean;
            /** @enum {string} */
            source?: "computed" | "manual" | "imported";
        };
        WebhookEndpointInput: {
            /** Format: uri */
            url: string;
            events: ("action.succeeded" | "action.failed" | "action.missed" | "session.expiring")[];
            /** @default true */
            active: boolean;
        };
        WebhookEndpoint: components["schemas"]["WebhookEndpointInput"] & {
            id?: string;
            /** Format: date-time */
            createdAt?: string;
        };
        WebhookEndpointCreated: components["schemas"]["WebhookEndpoint"] & {
            /** @description Skrivnost za `X-CleverDash-Signature` (HMAC-SHA256). Prikazana samo tukaj, samo enkrat. */
            secret: string;
        };
        /**
         * @description Polja, ki jih 002 doda k shemi `Health` iz 001 ob združitvi v eno servirano
         *     pogodbo (glej opombo v `info.description`). Niso samostojna pot.
         */
        HealthExtension: {
            /** Format: date-time */
            schedulerLastTickAt?: string | null;
            schedulerLastTickAgeSeconds?: number | null;
            /** @enum {string} */
            browser?: "ok" | "failed" | "unknown";
            remoteSessions?: {
                name?: string;
                status?: string;
                daysUntilExpiry?: number | null;
            }[];
            failedActionsLast24h?: number;
            missedActionsLast24h?: number;
            diskFreeBytes?: number | null;
            screenshotBytes?: number | null;
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
         *     telesom zahteve vrne `422` — enaka semantika kot v 001.
         */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    readState: {
        parameters: {
            query?: {
                /** @description Če ni podan, se uporabi privzeta lokacija. */
                locationId?: string;
                refresh?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Stanje prebrano */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StateReading"];
                };
            };
            /** @description Stanja ni bilo mogoče prebrati */
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
    listAvailableActions: {
        parameters: {
            query?: {
                locationId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam imen */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @example [
                         *       "Malica",
                         *       "Konec dela"
                         *     ]
                         */
                        availableActions: string[];
                        /** Format: date-time */
                        readAt: string;
                    };
                };
            };
        };
    };
    performAction: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @description Točno besedilo gumba (člen X — ni prevedeno).
                     * @example Prijava na delo
                     * @example Malica
                     * @example Konec malice
                     * @example Konec dela
                     */
                    actionName: string;
                    locationId?: string;
                    /**
                     * @description Vse prebere in zabeleži, a ne klikne (FR-035).
                     * @default false
                     */
                    dryRun?: boolean;
                };
            };
        };
        responses: {
            /** @description Akcija obdelana — glej `outcome` za izid */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActionResult"];
                };
            };
            /** @description Vzporedna zahteva z istim `Idempotency-Key` še teče, ali za ta profil že teče druga akcija (FR-034) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Akcija v trenutnem stanju ni dovoljena */
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
    listPlannedActions: {
        parameters: {
            query?: {
                from?: string;
                to?: string;
                state?: components["schemas"]["PlannedActionState"];
            };
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
                    "application/json": components["schemas"]["PlannedAction"][];
                };
            };
        };
    };
    getPlannedAction: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Akcija */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlannedActionDetail"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    updatePlannedAction: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: date-time */
                    scheduledAt?: string;
                    /** @enum {string} */
                    state?: "planned" | "skipped";
                };
            };
        };
        responses: {
            /** @description Posodobljeno */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlannedAction"];
                };
            };
        };
    };
    rebuildPlan: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    /**
                     * Format: date
                     * @description Privzeto danes.
                     */
                    date?: string;
                    profileId?: string;
                };
            };
        };
        responses: {
            /** @description Načrt sestavljen */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        created?: number;
                        skipped?: number;
                        dayStatus?: components["schemas"]["CalendarDayStatus"];
                        reason?: string | null;
                    };
                };
            };
        };
    };
    listProfiles: {
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
                    "application/json": components["schemas"]["TrackingProfile"][];
                };
            };
        };
    };
    createProfile: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TrackingProfileInput"];
            };
        };
        responses: {
            /** @description Ustvarjeno */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingProfile"];
                };
            };
            /** @description Prekrivanje dni ali neveljaven vnos */
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
    getProfile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Profil */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingProfile"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    updateProfile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TrackingProfileInput"];
            };
        };
        responses: {
            /** @description Posodobljeno */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingProfile"];
                };
            };
        };
    };
    deleteProfile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
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
        };
    };
    setProfileMode: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    mode: components["schemas"]["Mode"];
                };
            };
        };
        responses: {
            /** @description Nastavljeno */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingProfile"];
                };
            };
        };
    };
    previewProfile: {
        parameters: {
            query?: {
                date?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Predogled */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date */
                        localDate?: string;
                        dayStatus?: components["schemas"]["CalendarDayStatus"];
                        reason?: string | null;
                        actions?: {
                            actionName?: string;
                            baseLocalTime?: string;
                            /** Format: date-time */
                            scheduledAt?: string;
                        }[];
                    };
                };
            };
        };
    };
    getCalendar: {
        parameters: {
            query: {
                from: string;
                to: string;
                profileId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dnevi */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CalendarDay"][];
                };
            };
        };
    };
    listAbsences: {
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
                    "application/json": components["schemas"]["AbsencePeriod"][];
                };
            };
        };
    };
    createAbsence: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AbsencePeriodInput"];
            };
        };
        responses: {
            /** @description Ustvarjeno */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AbsencePeriod"];
                };
            };
            /** @description Prekrivanje s `forceWorkday` izjemo */
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
    deleteAbsence: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
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
        };
    };
    listHolidays: {
        parameters: {
            query?: {
                year?: number;
            };
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
                    "application/json": components["schemas"]["Holiday"][];
                };
            };
        };
    };
    upsertHoliday: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Holiday"];
            };
        };
        responses: {
            /** @description Shranjeno */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Holiday"];
                };
            };
        };
    };
    createOverride: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: date */
                    localDate: string;
                    /** @enum {string} */
                    kind: "forceWorkday" | "forceNonWorking";
                    profileId?: string | null;
                    note?: string | null;
                };
            };
        };
        responses: {
            /** @description Ustvarjeno */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Prekrivanje z obstoječo odsotnostjo */
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
    getHistory: {
        parameters: {
            query?: {
                from?: string;
                to?: string;
                profileId?: string;
                actionName?: string;
                outcome?: components["schemas"]["FinalOutcome"];
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Stran zapisov */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["ActionRecord"][];
                        page: number;
                        pageSize: number;
                        total: number;
                    };
                };
            };
        };
    };
    getAttempts: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Poskusi */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActionAttempt"][];
                };
            };
        };
    };
    getAttemptScreenshot: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description ID poskusa (`ActionAttempt.id`), ne ID zgodovinskega zapisa. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Slika PNG */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "image/png": string;
                };
            };
            /** @description Poskus ne obstaja, ni tvoj, nima posnetka ali je bil posnetek že počiščen */
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
    testRead: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    locationId?: string;
                    /** @default true */
                    includeScreenshot?: boolean;
                };
            };
        };
        responses: {
            /** @description Diagnostika */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok?: boolean;
                        state?: components["schemas"]["ClockState"];
                        availableActions?: string[];
                        selectorFound?: boolean;
                        sessionValid?: boolean;
                        /** @description S čim je bilo branje izvedeno — ali je bila strani poslana lega naprave (FR-094). */
                        geolocationSent?: boolean;
                        durationMs?: number;
                        screenshotBase64?: string | null;
                        diagnostics?: components["schemas"]["Diagnostics"];
                    };
                };
            };
        };
    };
    listLocations: {
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
                    "application/json": components["schemas"]["TrackingLocation"][];
                };
            };
        };
    };
    createLocation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TrackingLocationInput"];
            };
        };
        responses: {
            /** @description Ustvarjeno */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingLocation"];
                };
            };
        };
    };
    updateLocation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TrackingLocationPatch"];
            };
        };
        responses: {
            /** @description Shranjeno */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrackingLocation"];
                };
            };
            /** @description Lokacija ne obstaja */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    deleteLocation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
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
            /** @description Lokacija ne obstaja */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Lokacijo uporablja profil */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    listSessions: {
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
                    "application/json": components["schemas"]["RemoteSession"][];
                };
            };
        };
    };
    createSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RemoteSessionInput"];
            };
        };
        responses: {
            /** @description Ustvarjeno */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RemoteSession"];
                };
            };
        };
    };
    updateSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RemoteSessionPatch"];
            };
        };
        responses: {
            /** @description Shranjeno in preverjeno */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        session?: components["schemas"]["RemoteSession"];
                        verified?: boolean;
                        availableActions?: string[];
                    };
                };
            };
            /** @description Seja ne obstaja */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    deleteSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
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
            /** @description Seja ne obstaja */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sejo uporablja lokacija */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    listWebhookEndpoints: {
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
                    "application/json": components["schemas"]["WebhookEndpoint"][];
                };
            };
        };
    };
    createWebhookEndpoint: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat. Ista vrednost z drugačnim
                 *     telesom zahteve vrne `422` — enaka semantika kot v 001.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WebhookEndpointInput"];
            };
        };
        responses: {
            /** @description Ustvarjeno — vsebuje čistopis `secret` */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookEndpointCreated"];
                };
            };
        };
    };
    deleteWebhookEndpoint: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
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
}
