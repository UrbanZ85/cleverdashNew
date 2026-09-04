export interface paths {
    "/todos/lists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznami, do katerih imam dostop
         * @description Lastni in deljeni skupaj, brez ločnice — razlika je v pravicah, ne v tem, kje seznam
         *     živi (FR-005). Urejeno po `updatedAt` padajoče. **Brez opravil**; za ta je
         *     `GET /todos/lists/{listId}` ali `includeTasks`.
         */
        get: operations["listTodoLists"];
        put?: never;
        /** Ustvari seznam */
        post: operations["createTodoList"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/todos/current": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam za ploščico
         * @description Vrne pripeti seznam, sicer nazadnje spremenjenega, ki ga klicatelj sme videti — vedno
         *     **z opravili**, v enem branju.
         *
         *     Pripetost hrani odjemalec v `Settings.tiles[].config.listId` in jo pošlje kot `listId`;
         *     strežnik o njej ne ve ničesar in je ne shranjuje.
         *
         *     `fallback: true` pomeni, da pripetega seznama ni več ali je bil dostop odvzet, zato je
         *     vrnjen nazadnje spremenjeni. **Ta primer ni napaka**: ploščica ne sme podreti nadzorne
         *     plošče (FR-085). `list: null` pomeni, da klicatelj še nima nobenega seznama.
         */
        get: operations["getCurrentTodoList"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/todos/lists/{listId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        /** En seznam z opravili */
        get: operations["getTodoList"];
        put?: never;
        post?: never;
        /**
         * Izbriši seznam
         * @description **Samo lastnik**, tudi kadar je seznam zaklenjen (zaklep omejuje soudeležence, ne
         *     lastnika). Odstrani opravila **in** vsa članstva.
         *
         *     Vrne `200` s telesom, **ne** `204` — glej opis idempotentnosti zgoraj.
         */
        delete: operations["deleteTodoList"];
        options?: never;
        head?: never;
        /**
         * Preimenuj ali zakleni seznam
         * @description **Samo lastnik.** Nobena stopnja soudeleženca tega ne podeli (FR-045).
         *
         *     Izpuščeno polje pomeni »ne spreminjaj« (isti dogovor kot `PUT /settings` in
         *     `PATCH /notes/{id}`).
         */
        patch: operations["updateTodoList"];
        trace?: never;
    };
    "/todos/lists/{listId}/seen": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Označi deljen seznam kot viden
         * @description Pobriše oznako »novo« za klicatelja (`members[].seenAt`). Deluje tudi na zaklenjenem
         *     seznamu: to ni sprememba vsebine, ampak potrditev, da sem obvestilo videl.
         *
         *     Za lastnika je no-op — lastnik svojega seznama ni nikoli »nov«.
         */
        post: operations["markTodoListSeen"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/todos/lists/{listId}/members/{userId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listId: components["parameters"]["ListId"];
                /** @description Identifikator uporabnika iz `GET /users`. */
                userId: components["parameters"]["MemberUserId"];
            };
            cookie?: never;
        };
        get?: never;
        /**
         * Deli seznam ali spremeni stopnjo
         * @description **Samo lastnik**, in zahteva obseg `todos:share` (ne `todos:write`).
         *
         *     `201` pomeni, da je soudeleženec nov — takrat je seznam zanj označen kot nov, dokler ga
         *     prvič ne odpre. `200` pomeni spremembo stopnje obstoječemu; ta oznake ne postavi znova.
         *
         *     Lastnika ni mogoče dodati med soudeležence in isti uporabnik ne more nastopiti dvakrat
         *     (FR-048).
         */
        put: operations["putTodoListMember"];
        post?: never;
        /**
         * Odvzemi dostop ali zapusti seznam
         * @description Dve različni dejanji na isti poti, ločeni po tem, kdo kliče:
         *
         *     - **lastnik** odvzame dostop komur koli — zahteva obseg `todos:share`;
         *     - **soudeleženec** odstrani samega sebe (`userId` je njegov) — zahteva `todos:write`
         *       in je dovoljeno **tudi kadar je seznam zaklenjen**: zaklep omejuje spremembe *v*
         *       seznamu, ne pripadnosti tujim podatkom (FR-047).
         *
         *     Lastnik sebe ne more odstraniti — lahko samo izbriše seznam.
         *
         *     Vrne `200` s telesom, ne `204`.
         */
        delete: operations["deleteTodoListMember"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/todos/lists/{listId}/tasks": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dodaj eno ali več opravil
         * @description Zahteva stopnjo `edit` ali lastništvo.
         *
         *     `titles` je seznam, ker prilepljeno večvrstično besedilo ustvari po eno opravilo na
         *     vrstico, ne enega s prelomi (FR-013). Hitri vnos pošlje seznam z enim elementom.
         *
         *     Besedilo se pred shranjevanjem očisti (robni presledki, zliti notranji vključno s
         *     prelomi vrstic, odstranjeni krmilni znaki). Vnos, od katerega po čiščenju ne ostane
         *     nič, je zavrnjen — nikoli tiho preskočen.
         */
        post: operations["createTodoTasks"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/todos/lists/{listId}/tasks/clear-completed": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Počisti opravljena
         * @description Zahteva stopnjo `edit` ali lastništvo. Neodkljukanih se **ne** dotakne.
         *
         *     Izbor se opravi ob zapisu, ne iz prikaza odjemalca: kar je kdo medtem odkljukal, se
         *     odstrani z ostalimi (FR-018). Ponovljen klic na že počiščenem seznamu je no-op z
         *     `removed: 0`.
         */
        post: operations["clearCompletedTodoTasks"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/todos/lists/{listId}/order": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        get?: never;
        /**
         * Nastavi vrstni red neodkljukanih opravil
         * @description Zahteva stopnjo `edit` ali lastništvo.
         *
         *     Sprejme **cel** vrstni red, ne relativnega premika — ponovljen »premakni gor« bi
         *     opravilo premaknil dvakrat, ponovljen `PUT /order` pa je no-op.
         *
         *     Navesti je treba neodkljukana opravila; odkljukanih se to ne dotakne, ker so vedno pod
         *     črto in razvrščena po času odkljukanja. Neznan ali odkljukan `taskId` v seznamu se
         *     preskoči, opravilo, ki ga je kdo medtem dodal in ga v seznamu ni, pa obdrži svoj
         *     položaj in se ne izgubi (FR-026).
         */
        put: operations["reorderTodoTasks"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/todos/lists/{listId}/tasks/{taskId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listId: components["parameters"]["ListId"];
                taskId: components["parameters"]["TaskId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Izbriši opravilo
         * @description Zahteva stopnjo `edit` ali lastništvo. Vrne `200` s telesom, ne `204`.
         */
        delete: operations["deleteTodoTask"];
        options?: never;
        head?: never;
        /**
         * Preklopi, preimenuj ali datiraj opravilo
         * @description **Zahtevana stopnja je odvisna od polj v telesu** — to je edini razlog, da stopnja
         *     `check` sploh obstaja:
         *
         *     - `done` → zadošča stopnja `check`;
         *     - `title` ali `dueDate` → zahteva stopnjo `edit`.
         *
         *     Telo z več polji zahteva najvišjo od potrebnih stopenj.
         *
         *     Izpuščeno polje pomeni »ne spreminjaj«. `dueDate: null` pomeni »odstrani rok« in se od
         *     izpuščenega razlikuje.
         *
         *     Ob `done: true` strežnik zapiše tudi čas in avtorja odkljukanja; ob `done: false` ju
         *     počisti. Oboje se zgodi v istem zapisu — opravilo ne more ostati odkljukano brez
         *     podatka, kdaj.
         *
         *     Preklop je namenoma **posamičen** in ne masoven: to je najmanjša atomarna enota, in
         *     dva uporabnika, ki hkrati preklopita **različni** opravili istega seznama, oba uspeta
         *     (FR-027).
         */
        patch: operations["updateTodoTask"];
        trace?: never;
    };
    "/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Imenik uporabnikov za izbiro osebe
         * @description **Ta pot NI del modula opravil.** Živi v skupni plasti (`platform/users/`), ker imenik
         *     uporabnikov ni pojem opravil in ker mora preživeti odstranitev katerega koli modula
         *     (člen I). Zato tudi ne zahteva obsega `todos:*` — zadošča katerakoli veljavna
         *     avtentikacija, enako kot pri `/tabs` in `/devices`.
         *
         *     Vsebuje IZKLJUČNO uporabnike, ki so se v CleverDash **že vsaj enkrat prijavili**:
         *     ponuditi človeka, ki se ne more prijaviti, je obljuba, ki je ni mogoče izpolniti
         *     (FR-070). Uporabnik, ki ima račun pri ponudniku identitete, a aplikacije še ni odprl,
         *     se v imeniku pojavi takoj po svoji prvi prijavi.
         *
         *     **E-pošta se vrne izključno zamaskirana** (`emailHint`, npr. `j…k@agenda.si`).
         *     Razločevanje soimenjakov celega naslova ne potrebuje, izročitev celega pa bi vsakemu
         *     prijavljenemu uporabniku dala uporaben seznam naslovov cele namestitve (FR-072).
         *     Odgovor NE vsebuje identifikatorja pri ponudniku identitete, obsegov pravic ne
         *     notranjih zastavic stanja (FR-073).
         */
        get: operations["listDirectoryUsers"];
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
        /** @description RFC 9457. `detail` je namenjen uporabniku; tehnični vzrok je samo v dnevniku pod `correlationId`. */
        Problem: {
            type: string;
            title: string;
            status: number;
            detail?: string;
            correlationId?: string;
        };
        /**
         * @description `view` bere; `check` sme dodatno preklapljati `done`; `edit` sme vse z opravili.
         *     Lastništva ni v tem naboru — lastnik ni stopnja, ampak lastnost seznama.
         * @enum {string}
         */
        MemberRole: "view" | "check" | "edit";
        /**
         * @description Vloga klicatelja na tem seznamu.
         * @enum {string}
         */
        TodoRole: "owner" | "view" | "check" | "edit";
        /**
         * @description Izračunano na strežniku glede na **koledarski dan** v coni `Europe/Ljubljana`, ne po
         *     razliki v milisekundah. Ni shranjeno — shranjeno bi bilo naslednji dan napačno.
         * @enum {string}
         */
        DueState: "overdue" | "today" | "tomorrow" | "later";
        /**
         * @description Kaj ta klicatelj na tem seznamu sme, v tem trenutku in pri tem stanju ključavnice.
         *     Odjemalec iz tega izriše vmesnik in ničesar ne ugiba.
         */
        Capabilities: {
            readList: boolean;
            toggleTask: boolean;
            writeTasks: boolean;
            reorderTasks: boolean;
            clearCompleted: boolean;
            renameList: boolean;
            deleteList: boolean;
            manageSharing: boolean;
            toggleLock: boolean;
            leaveList: boolean;
        };
        /**
         * @description Predstavitev osebe za prikaz. Namenoma majhna: nič, kar ni potrebno za izbiro in
         *     prepoznavo, ni tu.
         */
        UserSummary: {
            id: string;
            displayName: string;
            /** @description Za kroglico ob imenu. Izpeljano, ne shranjeno. */
            initials: string;
            /**
             * @description Zamaskirana e-pošta (`j…k@agenda.si`), IZKLJUČNO za razločevanje soimenjakov. Cel
             *     naslov se ne vrne nikoli. Pri prikazu **že dodanih** soudeležencev tega polja ni —
             *     tam zadoščata ime in začetnice (FR-074).
             */
            emailHint?: string;
        };
        TodoMember: {
            user: components["schemas"]["UserSummary"];
            role: components["schemas"]["MemberRole"];
            /** Format: date-time */
            addedAt: string;
        };
        TodoTask: {
            id: string;
            title: string;
            done: boolean;
            /** @description `null` pomeni BREZ ROKA, ne »danes«. */
            dueDate: string | null;
            /** @description `null`, kadar opravilo roka nima. */
            dueState: components["schemas"]["DueState"] | null;
            doneAt: string | null;
            /** @description Kdo je odkljukal. Smiselno pri deljenem seznamu; pri osebnem vedno klicatelj. */
            doneBy: components["schemas"]["UserSummary"] | null;
            /** Format: date-time */
            createdAt: string;
        };
        TodoList: {
            id: string;
            title: string;
            locked: boolean;
            owner: components["schemas"]["UserSummary"];
            role: components["schemas"]["TodoRole"];
            capabilities: components["schemas"]["Capabilities"];
            members: components["schemas"]["TodoMember"][];
            /**
             * @description **Že razvrščena za prikaz**: neodkljukana po ročnem vrstnem redu, nato odkljukana
             *     po času odkljukanja padajoče. Odjemalec vrstnega reda ne računa.
             *
             *     Izpuščeno pri `GET /todos/lists` brez `includeTasks`.
             */
            tasks?: components["schemas"]["TodoTask"][];
            taskCount: number;
            /** @description Neodkljukana. Izpeljano, ne shranjeno. */
            openCount: number;
            /** @description Najzgodnejši rok med neodkljukanimi opravili. */
            nextDueDate: string | null;
            /** @description Kdo je nazadnje karkoli spremenil — za »spremenila Ana · 10:24«. */
            lastModifiedBy?: components["schemas"]["UserSummary"] | null;
            /**
             * @description Seznam je bil s klicateljem deljen in ga ta še ni odprl. Nadomešča potisno
             *     obvestilo (FR-007). Za lastnika vedno `false`.
             */
            isNew: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /**
         * @description Veljavne meje, da odjemalec sporoči napako, preden pošlje zahtevo, ki bo zavrnjena.
         *     Potujejo z odgovorom in ne po svojem endpointu — so konstante, ne stanje.
         */
        Limits: {
            maxListTitleLength: number;
            maxTaskTitleLength: number;
            maxTasksPerList: number;
            maxTasksPerRequest: number;
            maxListsPerUser: number;
            maxMembersPerList: number;
        };
    };
    responses: {
        /** @description Telo zahteve ne ustreza pogodbi. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Manjka ali je neveljavna avtentikacija. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Manjka zahtevani obseg (`todos:read` / `todos:write` / `todos:share`). */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description Klicatelj **je** soudeleženec ali ima obseg, a njegova stopnja tega dejanja ne dovoli —
         *     na primer `view`, ki poskuša odkljukati, ali soudeleženec, ki poskuša izbrisati seznam.
         *
         *     Namenoma `403` in ne `404`: hišno pravilo varuje obstoj **zapisa**, ne obstoja
         *     **pravice**. Klicatelj seznam že vidi v svojem prikazu, zato `404` ne bi skril ničesar,
         *     pač pa bi popravljivo pomanjkanje pravice spremenil v videz okvare (člen VII).
         *
         *     Odjemalec naj ob tem odgovoru kontrolo za tega uporabnika **skrije** — za razliko od
         *     `409`, kjer jo pusti.
         */
        ForbiddenRole: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description Seznama ni — ali pa klicatelj ni ne njegov lastnik ne soudeleženec. Namenoma isti
         *     odgovor: obstoj tujega seznama ni podatek, ki bi ga API razkril (vzorec 004).
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
         * @description Seznam je **zaklenjen** (in klicatelj ni lastnik), ali pa je dosegel zgornjo mejo
         *     opravil.
         *
         *     `409` in ne `403`, ker gre za **stanje zapisa**, ne za lastnost klicatelja: ključavnico
         *     lastnik odklene z enim klikom, poln seznam pa se izprazni s čiščenjem opravljenih —
         *     ista zahteva bo takrat uspela.
         *
         *     Odjemalec naj kontrolo **pusti** in pokaže vzrok (ključavnico oziroma polnost). Vzrok
         *     je razviden iz `title` in `detail`.
         */
        LockedOrFull: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Isti `Idempotency-Key` je bil že uporabljen z drugačnim telesom zahteve. */
        IdempotencyMismatch: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        ListId: string;
        TaskId: string;
        /** @description Identifikator uporabnika iz `GET /users`. */
        MemberUserId: string;
        /**
         * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
         *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
         *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
         */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listTodoLists: {
        parameters: {
            query?: {
                /**
                 * @description Vrni tudi `tasks` pri vsakem seznamu. Za prvi izris zavihka, da preklop med čipi ne
                 *     zahteva novega klica.
                 */
                includeTasks?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznami in veljavne meje. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        lists: components["schemas"]["TodoList"][];
                        limits: components["schemas"]["Limits"];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    createTodoList: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title: string;
                };
            };
        };
        responses: {
            /** @description Seznam je ustvarjen. Klicatelj je njegov lastnik. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TodoList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            /** @description Doseženo največje število seznamov na uporabnika. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    getCurrentTodoList: {
        parameters: {
            query?: {
                /** @description Pripeti seznam, če ga uporabnik ima. */
                listId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam za prikaz, ali `null`. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        list: components["schemas"]["TodoList"] | null;
                        /** @description Pripeti seznam ni bil dosegljiv; vrnjen je nazadnje spremenjeni. */
                        fallback: boolean;
                        /**
                         * @description Čez koliko sekund naj odjemalec vpraša znova. Pove ga **strežnik** (60 za
                         *     osebni seznam, 30 za deljen); odjemalec intervala NE SME imeti kot
                         *     konstante (FR-087, člen VIII).
                         */
                        nextPollSeconds: number;
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    getTodoList: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seznam. `tasks` so že razvrščena za prikaz. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TodoList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
        };
    };
    deleteTodoList: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Izbrisano. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        deleted: true;
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ForbiddenRole"];
            404: components["responses"]["NotFoundOrNotYours"];
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    updateTodoList: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title?: string;
                    locked?: boolean;
                };
            };
        };
        responses: {
            /** @description Posodobljen seznam. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TodoList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ForbiddenRole"];
            404: components["responses"]["NotFoundOrNotYours"];
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    markTodoListSeen: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Označeno. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TodoList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    putTodoListMember: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                listId: components["parameters"]["ListId"];
                /** @description Identifikator uporabnika iz `GET /users`. */
                userId: components["parameters"]["MemberUserId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    role: components["schemas"]["MemberRole"];
                };
            };
        };
        responses: {
            /** @description Stopnja obstoječega soudeleženca je spremenjena. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TodoList"];
                };
            };
            /** @description Soudeleženec je dodan. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TodoList"];
                };
            };
            /** @description Neveljavna stopnja, ali poskus dodati lastnika med soudeležence. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ForbiddenRole"];
            /**
             * @description Seznam ne obstaja ali ni klicateljev — **ali pa navedeni uporabnik ne obstaja
             *     oziroma se v CleverDash še ni nikoli prijavil** (FR-070).
             */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Doseženo največje število soudeležencev na seznamu. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    deleteTodoListMember: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                listId: components["parameters"]["ListId"];
                /** @description Identifikator uporabnika iz `GET /users`. */
                userId: components["parameters"]["MemberUserId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /**
             * @description Dostop je odvzet. Kadar je klicatelj odstranil samega sebe, je `list` `null` — do
             *     seznama nima več dostopa in ga ne sme več videti.
             */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        removed: true;
                        list: components["schemas"]["TodoList"] | null;
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ForbiddenRole"];
            404: components["responses"]["NotFoundOrNotYours"];
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    createTodoTasks: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    titles: string[];
                    /**
                     * @description Neobvezen skupen rok za vsa opravila iz te zahteve. Koledarski dan
                     *     (`YYYY-MM-DD`), ne trenutek; strežnik ga razume v coni `Europe/Ljubljana`.
                     */
                    dueDate?: string | null;
                };
            };
        };
        responses: {
            /** @description Opravila so dodana. Vrnjeno je novo stanje celega seznama. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TodoList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ForbiddenRole"];
            404: components["responses"]["NotFoundOrNotYours"];
            409: components["responses"]["LockedOrFull"];
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    clearCompletedTodoTasks: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Odstranjeno. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        removed: number;
                        list: components["schemas"]["TodoList"];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ForbiddenRole"];
            404: components["responses"]["NotFoundOrNotYours"];
            409: components["responses"]["LockedOrFull"];
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    reorderTodoTasks: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                listId: components["parameters"]["ListId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    taskIds: string[];
                };
            };
        };
        responses: {
            /** @description Nov vrstni red. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TodoList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ForbiddenRole"];
            404: components["responses"]["NotFoundOrNotYours"];
            409: components["responses"]["LockedOrFull"];
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    deleteTodoTask: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                listId: components["parameters"]["ListId"];
                taskId: components["parameters"]["TaskId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Izbrisano; vrnjeno je novo stanje seznama. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        deleted: true;
                        list: components["schemas"]["TodoList"];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ForbiddenRole"];
            /** @description Seznam ali opravilo ne obstaja — ali seznam ni klicateljev. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            409: components["responses"]["LockedOrFull"];
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    updateTodoTask: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo in istim telesom vrne prvotni odgovor
                 *     (člen III). Ta modul **nima nobene izjeme**: glavo sprejmejo vse mutacije, vključno z
                 *     vsemi `DELETE` — prav zato ti vračajo `200` s telesom in ne `204`.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                listId: components["parameters"]["ListId"];
                taskId: components["parameters"]["TaskId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    done?: boolean;
                    title?: string;
                    dueDate?: string | null;
                };
            };
        };
        responses: {
            /** @description Novo stanje celega seznama, z že preračunanim vrstnim redom. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TodoList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["ForbiddenRole"];
            /** @description Seznam ali opravilo ne obstaja — ali seznam ni klicateljev. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            409: components["responses"]["LockedOrFull"];
            422: components["responses"]["IdempotencyMismatch"];
        };
    };
    listDirectoryUsers: {
        parameters: {
            query?: {
                /** @description Filtrira po imenu za prikaz. */
                query?: string;
                /** @description Izpusti klicatelja — v izbirniku za deljenje sebe ni smiselno ponujati. */
                excludeSelf?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Imenik, urejen po imenu s slovenskim primerjalnikom. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        users: components["schemas"]["UserSummary"][];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
}
