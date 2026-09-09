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
         *     `Idempotency-Key` se pri tej poti NE upošteva — izdaja skrivnost (glej opis modula).
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
    "/inboxes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seznam mojih sprejemnih predalov
         * @description Predali prijavljenega uporabnika, najnovejši zgoraj, s tem, kar je vsak prejel, in s
         *     preostalim prostorom. **Kode ni v nobenem od teh odgovorov** — je v odgovoru, ki jo je
         *     ustvaril, in nikjer več (FR-082).
         *
         *     `limits` so STROPI NAMESTITVE, ne vrednosti predala: vmesnik iz njih sestavi izbire, da
         *     ne ponudi meje, ki bo pri `POST /inboxes` zavrnjena.
         *
         *     Zahtevani obseg: `file-sharing:read`.
         */
        get: operations["listFileInboxes"];
        put?: never;
        /**
         * Ustvari sprejemni predal (naslov + koda za oddajo)
         * @description Ustvari predal in vrne naslov ter kodo — **oboje pošlji pošiljatelju, sama povezava ne
         *     odpre ničesar** (FR-081), enako kot pri deljenju.
         *
         *     `maxFiles` in `maxTotalMb` sta MEJI TEGA PREDALA in ju izbere lastnik (FR-087). Izpuščeni
         *     pomenita strop namestitve; večja vrednost od stropa je `400` in ne tiho znižanje — lastnik,
         *     ki bi mislil, da ima dvakrat več prostora, kot ga ima, bi to izvedel takrat, ko bi bila
         *     oddaja zavrnjena nekomu drugemu.
         *
         *     Meji sta shranjeni NA PREDALU in se ne berejo iz okolja ob vsaki oddaji: sprememba
         *     nastavitve namestitve ne sme za nazaj razširiti predala, ki ga je lastnik namenoma naredil
         *     majhnega.
         *
         *     `Idempotency-Key` se pri tej poti NE upošteva — izdaja kodo (glej opis modula). Ponovljen
         *     klic zato naredi DRUG predal; to je namerno, ker je shranjena koda slabša napaka od
         *     odvečnega predala, ki je viden in ga je mogoče izbrisati.
         *
         *     Zahtevani obseg: `file-sharing:write`.
         */
        post: operations["createFileInbox"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/inboxes/{inboxId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                inboxId: components["parameters"]["InboxId"];
            };
            cookie?: never;
        };
        /**
         * Podrobnosti enega predala
         * @description Vključuje `failedAttempts` in `lockedUntil` — lastnik MORA videti, da nekdo ugiba kodo, in
         *     to v odgovoru API-ja, ne le v dnevniku, ki ga nihče ne bere (FR-090).
         *
         *     Zahtevani obseg: `file-sharing:read`.
         */
        get: operations["getFileInbox"];
        put?: never;
        post?: never;
        /**
         * Izbriši predal
         * @description Odstrani predal in vse njegove dovolilnice.
         *
         *     **Prejete datoteke OSTANEJO** (FR-094). Predal je bil pot, po kateri so prišle, in ne
         *     njihov imetnik; od trenutka prejema so navadne lastnikove datoteke. Kdor jih hoče stran,
         *     jih izbriše prek `DELETE /files/{fileId}`, kjer je odstranitev vsebine z diska izrecno
         *     dejanje.
         *
         *     Zahtevani obseg: `file-sharing:write`.
         */
        delete: operations["deleteFileInbox"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/inboxes/{inboxId}/close": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                inboxId: components["parameters"]["InboxId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Zapri predal
         * @description Postavi `state: closed` in izbriše VSE izdane dovolilnice. Učinkuje takoj: naslednja
         *     oddaja ne gre skozi, tudi če je pošiljatelj kodo vpisal pred zaprtjem (FR-083).
         *
         *     Zaprtje ni brisanje in ne odnese ničesar, kar je predal že prejel.
         *
         *     Zahtevani obseg: `file-sharing:write`.
         */
        post: operations["closeFileInbox"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/inboxes/{inboxId}/code": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                inboxId: components["parameters"]["InboxId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Izdaj novo kodo (in s tem nov naslov)
         * @description Ustvari NOVO kodo in NOV `token` ter razveljavi vse obstoječe dovolilnice. Stari naslov od
         *     tega trenutka odgovarja enako kot neznan (FR-083).
         *
         *     Namen je odvzeti oddajo tistemu, ki ima staro kodo. Če bi naslov ostal isti, bi mu
         *     polovica ključa ostala v rokah — zato se zamenja oboje in vmesnik to izrecno pove.
         *
         *     Zaprt ali potekel predal to tudi vrne v obtok (`closed` → `open`). Ločene operacije "odpri
         *     znova" NI namenoma: ta bi stari kodi podaljšala življenje.
         *
         *     `Idempotency-Key` se pri tej poti NE upošteva — izdaja kodo (glej opis modula). Shranjen
         *     odgovor bi po zamenjavi vrnil STARO kodo in bi bila zamenjava videti opravljena.
         *
         *     Zahtevani obseg: `file-sharing:write`.
         */
        post: operations["regenerateInboxCode"];
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
    "/drop/{token}": {
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
         * Kaj je za tem naslovom (brez prijave)
         * @description **Javna pot. Brez avtentikacije, brez obsegov.**
         *
         *     Vrne samo rok in dovoljeno velikost ene datoteke. **Oznake predala in navodila NE vrne** —
         *     to pride šele po pravilno vpisani kodi (FR-084), po isti presoji kot ime datoteke pri
         *     prevzemu: oznaka pogosto pove vsebino.
         *
         *     `maxFileBytes` je NASTAVITEV predala, ne njegov preostali prostor. Preostanek bi vsakomur,
         *     ki ima naslov, dal števec dogajanja v predalu ("včeraj 900 MB, danes 400"); pravo,
         *     trenutno vrednost dobi pošiljatelj po vpisu kode.
         *
         *     Neznan, potekel, zaprt in izbrisan predal dajo ENAK odgovor `404` z enakim besedilom
         *     (FR-085) — in to je isto besedilo kot pri `/share/{token}`.
         */
        get: operations["getPublicDropInfo"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/drop/{token}/unlock": {
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
         * Vpiši kodo in odkleni oddajo
         * @description Ob pravilni kodi izda kratkotrajno dovolilnico (`FILE_SHARE_INBOX_TICKET_MINUTES`) in jo
         *     vrne V TELESU. Odjemalec jo hrani v pomnilniku in jo pripenja kot `X-Drop-Ticket` —
         *     piškotka tu namenoma NI (FR-091).
         *
         *     Veljavnost je bistveno daljša od dovolilnice za prevzem (`FILE_SHARE_GRANT_MINUTES`):
         *     prevzem se sproži z navigacijo takoj, oddaja pa mora zdržati, dokler nekdo izbira datoteke
         *     in jih pošilja po vrsti prek počasne povezave.
         *
         *     Šele ta odgovor razkrije oznako in navodilo ter PRAVI preostali prostor.
         *
         *     **Dušenje (FR-090).** Zgrešeni poskusi se štejejo po PREDALU in po IZVORNEM NASLOVU. Po
         *     `FILE_SHARE_ATTEMPT_LIMIT` zgrešitvah v oknu so nadaljnji poskusi zavrnjeni s `429` za
         *     `FILE_SHARE_LOCK_MINUTES` — tudi če je koda pravilna. Števec naslova je SKUPEN s
         *     `/share/{token}/unlock`: napadalec, ki ugiba po obeh javnih površinah z istega naslova, je
         *     en napadalec in mora zadeti isto mejo. Poskušena koda se ne zapiše nikamor (FR-032).
         *
         *     **`Idempotency-Key` se pri tej poti NE sprejme** — endpoint izdaja dovolilnico (izjema
         *     člena III, glej opis modula).
         */
        post: operations["unlockDrop"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/drop/{token}/files": {
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
         * Napovej oddajo (prvi korak)
         * @description **Javna pot. Brez avtentikacije, brez obsegov** — a NE brez dovoljenja: zahteva mora
         *     nositi `X-Drop-Ticket`.
         *
         *     Ustvari zapis v stanju `uploading`, ki prostor REZERVIRA, in preveri VSE ŠTIRI MEJE
         *     (FR-088): velikost ene datoteke (`FILE_SHARE_MAX_MB`), prostor predala (`maxFiles`,
         *     `maxTotalBytes`), kvoto lastnika (`FILE_SHARE_QUOTA_MB`) ter stanje in rok predala. Bajti
         *     pridejo šele z `PUT /drop/{token}/files/{fileId}/content`.
         *
         *     **Zakaj dva koraka:** meje se morajo preveriti, PREDEN priteče 500 MB od nekoga, ki ni
         *     prijavljen (research.md §3). Pošiljatelj dobi razumljivo zavrnitev, ne prekinjene povezave
         *     sredi pošiljanja.
         *
         *     Število hkratnih NEDOKONČANIH oddaj na predal je omejeno (FR-096): brez tega bi bilo
         *     nekaj visečih napovedi brez vsebine dovolj, da je predal za vse ostale poln, dokler ne
         *     pride na vrsto pometač obtičalih nalaganj.
         *
         *     Prejeta datoteka je od tega trenutka lastnikova: BREZ roka veljavnosti (FR-092) in BREZ
         *     žetona in gesla, ker prejeto ni samodejno deljeno naprej (FR-093).
         */
        post: operations["declareDropUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/drop/{token}/files/{fileId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /**
                 * @description 22 znakov `base64url` — 16 naključnih bajtov. NI izpeljan iz identifikatorja zapisa
                 *     ne iz imena datoteke; iz ene povezave ni mogoče izpeljati druge (FR-014).
                 */
                token: components["parameters"]["ShareToken"];
                fileId: components["parameters"]["FileId"];
            };
            cookie?: never;
        };
        get?: never;
        /**
         * Oddaj vsebino (drugi korak)
         * @description **Javna pot. Brez avtentikacije, brez obsegov** — a NE brez dovoljenja: zahteva mora
         *     nositi `X-Drop-Ticket`, izdan pri `POST /drop/{token}/unlock`, in ta je vezan na TA predal.
         *     Dovolilnica enega predala ne odpre drugega, tudi če sta oba istega lastnika.
         *
         *     Telo je surova vsebina datoteke, ne obrazec. Strežnik jo pretaka na disk in je nikoli ne
         *     zbere v pomnilnik (research.md §4).
         *
         *     **`Content-Length` mora biti ENAK napovedani velikosti** (FR-089) — ne le manjši od meje
         *     namestitve. Prostor je bil rezerviran zanjo in samo zanjo; pošiljatelj, ki napove 1 MB in
         *     pošlje 400 MB, je s tem ustavljen na prvem kosu nad mejo. Isto velja za DEJANSKO prispelo
         *     količino: manj bajtov od napovedanih je zavrnitev, ne tiho shranjena okrnjena datoteka.
         *
         *     **Vrsta telesa se preverja** (`415`): `application/json` bi požrl globalni razčlenjevalnik
         *     in datoteka bi bila velikosti 0, `multipart/form-data` in
         *     `application/x-www-form-urlencoded` pa bi na disk zapisala meje obrazca skupaj z vsebino —
         *     datoteko, ki je videti uspešno oddana in je pokvarjena (člen VII). Odsotna glava je
         *     dovoljena.
         *
         *     **Prekinjena oddaja ne pusti ničesar** (FR-096): delna vsebina se odstrani IN zapis se
         *     pobriše, tako da se rezerviran prostor takoj sprosti.
         *
         *     Odgovor je potrdilo: kaj je prispelo in koliko prostora je še. Ničesar, kar ne bi bilo
         *     znano že prej — oddaja ne sme postati način za branje predala.
         */
        put: operations["uploadDropContent"];
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
        /**
         * @description SHRANJENO stanje predala. `open` = sprejema. `closed` = lastnik ga je zaprl.
         *
         *     Nabor je NAMENOMA drugačen od `SharedFileState`: `broken` je ugotovitev o razhajanju med
         *     zapisom in vsebino na disku, predal pa vsebine nima — zanj tako stanje ne obstaja in ga ne
         *     sme biti mogoče niti izraziti.
         *
         *     **"Poteklo" tudi tu NI stanje** — izpelje se iz `expiresAt < zdaj`.
         * @enum {string}
         */
        InboxState: "open" | "closed";
        /**
         * @description STROPI NAMESTITVE za predale — ne meji posameznega predala. Vmesnik iz njih sestavi izbire,
         *     da ne ponudi vrednosti, ki bo zavrnjena.
         */
        InboxLimits: {
            /** @description `FILE_SHARE_INBOX_MAX_FILES`. */
            maxFiles: number;
            /** @description `FILE_SHARE_INBOX_MAX_MB` v bajtih. */
            maxTotalBytes: number;
            /** @description `FILE_SHARE_MAX_MB` v bajtih — velja za vsako datoteko, tudi oddano. */
            maxFileBytes: number;
        };
        CreateInboxInput: {
            /** @description Za koga oz. za kaj je predal. Vidno pošiljatelju šele PO vpisu kode (FR-084). */
            label: string;
            /** @description Navodilo pošiljatelju ("pošlji obe strani"). Prav tako šele po kodi. */
            note?: string;
            /**
             * @description Do kdaj predal sprejema. Izpuščeno pomeni `FILE_SHARE_DEFAULT_EXPIRY_DAYS`; izrecni
             *     `null` pomeni **brez roka** — veljavna izbira, ki je v vmesniku posebej označena.
             * @enum {integer|null}
             */
            expiresInDays?: 1 | 7 | 30 | null;
            /**
             * @description Največ datotek v ta predal. Izpuščeno pomeni strop namestitve; večje od stropa je
             *     `400`.
             */
            maxFiles?: number;
            /**
             * @description Največ skupaj v ta predal, v MB. Izpuščeno pomeni strop namestitve; večje od stropa je
             *     `400`.
             *
             *     Iz te vrednosti izhaja tudi meja ENE oddane datoteke: nikoli več kot preostali prostor
             *     predala, in nikoli več kot `FILE_SHARE_MAX_MB`.
             */
            maxTotalMb?: number;
        };
        /**
         * @description Edina dva odgovora v tej pogodbi, ki vsebujeta kodo v čistopisu, sta ta ob nastanku predala
         *     in isti ob izdaji nove kode — nikoli več (FR-082). Izgubljene kode ni mogoče prebrati;
         *     mogoče je le izdati novo, kar naredi tudi nov naslov.
         */
        CreatedInbox: {
            inbox: components["schemas"]["FileInbox"];
            /** @description `{PUBLIC_BASE_URL}/u/{token}` — kar se pošlje pošiljatelju. */
            dropUrl: string;
            /**
             * @description 16 znakov iz abecede brez dvoumnih znakov, prikazanih v štirih četvorkah — ista
             *     izvedba kot geslo za prevzem (research.md §7). V bazi je samo `scrypt` povzetek.
             */
            code: string;
        };
        FileInbox: {
            id: string;
            label: string;
            note?: string;
            state: components["schemas"]["InboxState"];
            /** @description IZPELJANO iz `expiresAt`, ne shranjeno. */
            expired: boolean;
            /**
             * @description IZPELJANO: `state === open` IN rok še ni minil. Prostor v tem ni upoštevan — polni
             *     predal je še vedno odprt in ga izpraznitev vrne v rabo.
             */
            openForUpload: boolean;
            /**
             * @description Naslov za oddajo. Koda NI del odgovora — naslov sam brez nje ne odpre ničesar
             *     (FR-081).
             */
            dropUrl?: string | null;
            /**
             * Format: date-time
             * @description `null` pomeni **brez roka**, ne "poteklo".
             */
            expiresAt?: string | null;
            /** @description Meja TEGA predala, kakor jo je izbral lastnik. */
            maxFiles: number;
            maxTotalBytes: number;
            /**
             * @description Koliko datotek je predal DEJANSKO prejel — brez nedokončanih oddaj. Sešteto z
             *     agregacijo po `inboxId`, nikoli iz števca na predalu (isto pravilo kot pri kvoti).
             */
            receivedFiles: number;
            receivedBytes: number;
            /** Format: date-time */
            lastReceivedAt?: string | null;
            remainingFiles?: number;
            remainingBytes?: number;
            /**
             * @description Zgrešeni poskusi kode od zadnje uspešne odklenitve. Lastnik mora videti, da nekdo
             *     ugiba (FR-090).
             */
            failedAttempts: number;
            /**
             * Format: date-time
             * @description Dokler je v prihodnosti, so poskusi na tem predalu zavrnjeni.
             */
            lockedUntil?: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        /**
         * @description Vse, kar sme izvedeti nekdo, ki ima zgolj naslov predala. **Brez oznake in brez navodila**
         *     — to je podatek, ki ga varuje koda (FR-084).
         */
        PublicDropInfo: {
            /**
             * @description Nastavitev predala (manjša od `FILE_SHARE_MAX_MB` in `maxTotalBytes`), NE preostali
             *     prostor — ta bi bil števec dogajanja za vsakogar, ki ima naslov.
             */
            maxFileBytes: number;
            /** Format: date-time */
            expiresAt?: string | null;
        };
        UnlockDropInput: {
            /**
             * @description Koda, kot jo je pošiljatelj dobil. Pred primerjavo se normalizira enako kot geslo za
             *     prevzem: presledki in vezaji iz prikaza se odstranijo, črke se pretvorijo v velike.
             */
            code: string;
        };
        DropSession: {
            /** @description Oznaka predala — prvič vidna šele tu. */
            label: string;
            /** @description Navodilo lastnika pošiljatelju. */
            note?: string;
            /**
             * @description Dovolilnica za oddajo. Odjemalec jo hrani v pomnilniku in jo pripenja kot
             *     `X-Drop-Ticket`; v piškotek NE gre (FR-091).
             */
            ticket: string;
            /** Format: date-time */
            ticketExpiresAt: string;
            /** @description Zdaj PRAVA vrednost — manjša od meje namestitve in preostalega prostora predala. */
            maxFileBytes: number;
            remainingFiles: number;
            remainingBytes: number;
        };
        DeclareUploadInput: {
            /**
             * @description Ime, kot ga pozna pošiljatelj. Strežnik ga OČISTI (ločila poti, `..`, krmilni znaki,
             *     dolžina) in shrani samo kot prikazno ime — nikoli kot pot (FR-007). Ime, od katerega po
             *     čiščenju ne ostane nič, postane `datoteka`.
             */
            fileName: string;
            /**
             * @description NAPOVEDANA velikost. Preveri se proti vsem štirim mejam, preden priteče prvi bajt, in
             *     `Content-Length` drugega koraka MORA biti enak njej (FR-089).
             */
            byteSize: number;
            /** @description Privzeto `application/octet-stream`. Vsebina se ne pregleduje (FR-054, FR-095). */
            mimeType?: string;
            /**
             * @description Kar o sebi napiše pošiljatelj; neobvezno. Očisti se in skrajša na 80 znakov. To je
             *     NAVEDBA, ne ugotovljena istovetnost — sistem je ne preverja in je vmesnik ne
             *     predstavlja, kot bi jo.
             */
            senderName?: string;
        };
        DeclaredUpload: {
            id: string;
            /** @description `/api/v1/drop/{token}/files/{id}/content` — kam poslati vsebino. */
            uploadUrl: string;
            /** @description Kolikšna MORA biti vsebina; vsaka druga vrednost `Content-Length` je zavrnjena. */
            byteSize: number;
        };
        /** @description Potrdilo pošiljatelju. Ničesar o predalu, kar ne bi bilo znano že prej. */
        DropReceipt: {
            /** @description Očiščeno ime, kakršno vidi lastnik. */
            fileName: string;
            byteSize: number;
            remainingFiles: number;
            remainingBytes: number;
        };
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
            /**
             * @description 009b: `owner` = datoteko je naložil lastnik sam; `inbox` = prispela je prek sprejemnega
             *     predala (FR-092). IZPELJANO iz `inboxId`, ne shranjeno posebej — dve polji, ki trdita
             *     isto, se prej ali slej razideta.
             * @enum {string}
             */
            origin?: "owner" | "inbox";
            /**
             * @description Predal, po katerem je datoteka prišla. Ostane tudi, ko predala ni več (FR-094): pove,
             *     kako je datoteka prišla, in to se z izbrisom predala ni spremenilo.
             */
            inboxId?: string | null;
            /** @description Kar je o sebi napisal pošiljatelj. NAVEDBA, ne ugotovljena istovetnost. */
            senderName?: string | null;
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
        InboxId: string;
        /**
         * @description Dovolilnica za oddajo iz `POST /drop/{token}/unlock` (009b, FR-091).
         *
         *     NAMENOMA glava in ne piškotek: piškotek bi brskalnik pripel sam, tudi zahtevi, ki jo je
         *     sprožila tuja stran, in oddaja v imenu obiskovalca bi bila mogoča od zunaj. Glavo mora
         *     odjemalec pripeti izrecno, tuja stran pa je brez CORS-a (člen II) ne more — preverjanje
         *     pred zahtevo (preflight) ji ne uspe. Pri javni poti, ki PIŠE NA DISK, je to razlika med
         *     ublaženim in odpravljenim tveganjem.
         */
        DropTicket: string;
        /**
         * @description Ponovljena zahteva z istim ključem, isto potjo, istim telesom IN istim klicateljem vrne
         *     prvotni odgovor (člen III). Ista vrednost od drugega klicatelja ali brez poverilnic
         *     shranjenega odgovora ne dobi.
         *
         *     Ne velja za `PUT /files/{fileId}/content` in `PUT /drop/{token}/files/{fileId}/content`
         *     (binarno telo), za javne poti `/share/*` in `/drop/*` (izdaja dovolilnice) ter za poti,
         *     ki izdajo skrivnost — `POST /files/{fileId}/password`, `POST /inboxes` in
         *     `POST /inboxes/{inboxId}/code`. Vse izjeme so opisane pri tistih poteh in v opisu modula.
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
                 * @description Ponovljena zahteva z istim ključem, isto potjo, istim telesom IN istim klicateljem vrne
                 *     prvotni odgovor (člen III). Ista vrednost od drugega klicatelja ali brez poverilnic
                 *     shranjenega odgovora ne dobi.
                 *
                 *     Ne velja za `PUT /files/{fileId}/content` in `PUT /drop/{token}/files/{fileId}/content`
                 *     (binarno telo), za javne poti `/share/*` in `/drop/*` (izdaja dovolilnice) ter za poti,
                 *     ki izdajo skrivnost — `POST /files/{fileId}/password`, `POST /inboxes` in
                 *     `POST /inboxes/{inboxId}/code`. Vse izjeme so opisane pri tistih poteh in v opisu modula.
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
                 * @description Ponovljena zahteva z istim ključem, isto potjo, istim telesom IN istim klicateljem vrne
                 *     prvotni odgovor (člen III). Ista vrednost od drugega klicatelja ali brez poverilnic
                 *     shranjenega odgovora ne dobi.
                 *
                 *     Ne velja za `PUT /files/{fileId}/content` in `PUT /drop/{token}/files/{fileId}/content`
                 *     (binarno telo), za javne poti `/share/*` in `/drop/*` (izdaja dovolilnice) ter za poti,
                 *     ki izdajo skrivnost — `POST /files/{fileId}/password`, `POST /inboxes` in
                 *     `POST /inboxes/{inboxId}/code`. Vse izjeme so opisane pri tistih poteh in v opisu modula.
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
                 * @description Ponovljena zahteva z istim ključem, isto potjo, istim telesom IN istim klicateljem vrne
                 *     prvotni odgovor (člen III). Ista vrednost od drugega klicatelja ali brez poverilnic
                 *     shranjenega odgovora ne dobi.
                 *
                 *     Ne velja za `PUT /files/{fileId}/content` in `PUT /drop/{token}/files/{fileId}/content`
                 *     (binarno telo), za javne poti `/share/*` in `/drop/*` (izdaja dovolilnice) ter za poti,
                 *     ki izdajo skrivnost — `POST /files/{fileId}/password`, `POST /inboxes` in
                 *     `POST /inboxes/{inboxId}/code`. Vse izjeme so opisane pri tistih poteh in v opisu modula.
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
            header?: never;
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
    listFileInboxes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Predali in stropi namestitve */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        inboxes: components["schemas"]["FileInbox"][];
                        limits: components["schemas"]["InboxLimits"];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    createFileInbox: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateInboxInput"];
            };
        };
        responses: {
            /** @description Predal je odprt. Odgovor vsebuje naslov in kodo — enkrat. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedInbox"];
                };
            };
            /**
             * @description Oznaka je prazna, ali pa je izbrana meja večja od stropa namestitve
             *     (`FILE_SHARE_INBOX_MAX_FILES`, `FILE_SHARE_INBOX_MAX_MB`).
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
        };
    };
    getFileInbox: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                inboxId: components["parameters"]["InboxId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Predal */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileInbox"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
        };
    };
    deleteFileInbox: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo, istim telesom IN istim klicateljem vrne
                 *     prvotni odgovor (člen III). Ista vrednost od drugega klicatelja ali brez poverilnic
                 *     shranjenega odgovora ne dobi.
                 *
                 *     Ne velja za `PUT /files/{fileId}/content` in `PUT /drop/{token}/files/{fileId}/content`
                 *     (binarno telo), za javne poti `/share/*` in `/drop/*` (izdaja dovolilnice) ter za poti,
                 *     ki izdajo skrivnost — `POST /files/{fileId}/password`, `POST /inboxes` in
                 *     `POST /inboxes/{inboxId}/code`. Vse izjeme so opisane pri tistih poteh in v opisu modula.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                inboxId: components["parameters"]["InboxId"];
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
    closeFileInbox: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Ponovljena zahteva z istim ključem, isto potjo, istim telesom IN istim klicateljem vrne
                 *     prvotni odgovor (člen III). Ista vrednost od drugega klicatelja ali brez poverilnic
                 *     shranjenega odgovora ne dobi.
                 *
                 *     Ne velja za `PUT /files/{fileId}/content` in `PUT /drop/{token}/files/{fileId}/content`
                 *     (binarno telo), za javne poti `/share/*` in `/drop/*` (izdaja dovolilnice) ter za poti,
                 *     ki izdajo skrivnost — `POST /files/{fileId}/password`, `POST /inboxes` in
                 *     `POST /inboxes/{inboxId}/code`. Vse izjeme so opisane pri tistih poteh in v opisu modula.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path: {
                inboxId: components["parameters"]["InboxId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zaprto. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileInbox"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
            /** @description Predal je že zaprt. */
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
    regenerateInboxCode: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                inboxId: components["parameters"]["InboxId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Nova koda in nov naslov — prikazano enkrat. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedInbox"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFoundOrNotYours"];
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
    getPublicDropInfo: {
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
            /** @description Predal sprejema. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicDropInfo"];
                };
            };
            404: components["responses"]["ShareUnavailable"];
        };
    };
    unlockDrop: {
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
                "application/json": components["schemas"]["UnlockDropInput"];
            };
        };
        responses: {
            /** @description Odklenjeno. Šele tu se pojavita oznaka in navodilo. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DropSession"];
                };
            };
            /** @description Telo nima kode ali je koda predolga. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /**
             * @description Koda ni pravilna. Odgovor ne pove, ali je bila blizu, in je enak za kodo, ki odklepa
             *     DRUG predal. Število preostalih poskusov je navedeno zato, da zakonit pošiljatelj ve,
             *     koliko jih ima, preden bo zaklenjen.
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
             * @description Preveč zgrešenih poskusov (FR-090). Dokler traja zaklep, so zavrnjeni tudi pravilni
             *     poskusi. `Retry-After` pove, kdaj je smiselno poskusiti znova.
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
    declareDropUpload: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description Dovolilnica za oddajo iz `POST /drop/{token}/unlock` (009b, FR-091).
                 *
                 *     NAMENOMA glava in ne piškotek: piškotek bi brskalnik pripel sam, tudi zahtevi, ki jo je
                 *     sprožila tuja stran, in oddaja v imenu obiskovalca bi bila mogoča od zunaj. Glavo mora
                 *     odjemalec pripeti izrecno, tuja stran pa je brez CORS-a (člen II) ne more — preverjanje
                 *     pred zahtevo (preflight) ji ne uspe. Pri javni poti, ki PIŠE NA DISK, je to razlika med
                 *     ublaženim in odpravljenim tveganjem.
                 */
                "X-Drop-Ticket": components["parameters"]["DropTicket"];
            };
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
                "application/json": components["schemas"]["DeclareUploadInput"];
            };
        };
        responses: {
            /** @description Prostor je rezerviran; vsebina se pričakuje na `uploadUrl`. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeclaredUpload"];
                };
            };
            /** @description Ime je prazno po čiščenju, ali napovedana velikost ni pozitivno celo število. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Dovolilnice ni, je potekla, ali je bila razveljavljena (zaprtje, nova koda). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            404: components["responses"]["ShareUnavailable"];
            /** @description Napovedana velikost presega `FILE_SHARE_MAX_MB`. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Na tem predalu visi že toliko nedokončanih oddaj, kolikor jih sme (FR-096). */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /**
             * @description Prostora ni: predal je poln (število datotek ali skupni bajti) ali pa je polna kvota
             *     lastnika. Besedilo je namenoma BREZ lastnikovih številk — pošiljatelj mora izvedeti,
             *     da datoteka ne gre skozi, ne pa koliko prostora ima lastnik in koliko ga je porabil.
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
    uploadDropContent: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description Dovolilnica za oddajo iz `POST /drop/{token}/unlock` (009b, FR-091).
                 *
                 *     NAMENOMA glava in ne piškotek: piškotek bi brskalnik pripel sam, tudi zahtevi, ki jo je
                 *     sprožila tuja stran, in oddaja v imenu obiskovalca bi bila mogoča od zunaj. Glavo mora
                 *     odjemalec pripeti izrecno, tuja stran pa je brez CORS-a (člen II) ne more — preverjanje
                 *     pred zahtevo (preflight) ji ne uspe. Pri javni poti, ki PIŠE NA DISK, je to razlika med
                 *     ublaženim in odpravljenim tveganjem.
                 */
                "X-Drop-Ticket": components["parameters"]["DropTicket"];
            };
            path: {
                /**
                 * @description 22 znakov `base64url` — 16 naključnih bajtov. NI izpeljan iz identifikatorja zapisa
                 *     ne iz imena datoteke; iz ene povezave ni mogoče izpeljati druge (FR-014).
                 */
                token: components["parameters"]["ShareToken"];
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
            /** @description Vsebina je cela, zapis je `ready` in datoteka je na lastnikovem seznamu. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DropReceipt"];
                };
            };
            /**
             * @description Manjka `Content-Length`, vsebina je prazna, ali pa je prispelo manj, kot je bilo
             *     napovedano.
             */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Dovolilnice ni, je potekla, ali je bila razveljavljena. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /**
             * @description Predal ne velja (FR-085) — ali pa ta oddaja ne obstaja, ni od tega predala oz. je že
             *     zaključena. Namenoma ISTI odgovor: pošiljatelj teh razlogov ne sme razlikovati.
             */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Vsebina je večja od napovedane velikosti — ugotovljeno iz `Content-Length` ali med pisanjem. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Telo je napovedano kot obrazec ali JSON. Pošlji surovo vsebino. */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            /** @description Oddaje ni bilo mogoče dokončati (napaka pisanja na disk). Zapis in delna vsebina sta odstranjena. */
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
}
