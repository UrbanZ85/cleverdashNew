export interface paths {
    "/collectibles-scanner/sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Kateri viri so vklopljeni v tej namestitvi
         * @description `listings` (eBay) je obvezen; brez njega zagon konča z `collectibles:no-listing-source`.
         *     `catalog` (TCGdex) in `prices` (PriceCharting, samo retro) sta izbirna: brez njiju so rezultati z manj
         *     podatki, brez vrednosti.
         */
        get: operations["getCollectiblesSources"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collectibles-scanner/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Opis kategorij (polja obrazca)
         * @description Vsaka kategorija opiše svoja polja (ključ, oznaka, vrsta, možnosti), tako da odjemalec obrazec
         *     zgradi dinamično. Dodajanje kategorije je vnos v strežniški register.
         */
        get: operations["getCollectiblesCategories"];
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
            type?: string;
            title: string;
            status: number;
            detail?: string;
        };
        /** @enum {string} */
        Marketplace: "EBAY_DE" | "EBAY_IT" | "EBAY_FR" | "EBAY_ES" | "EBAY_AT" | "EBAY_NL" | "EBAY_BE" | "EBAY_IE" | "EBAY_PL" | "EBAY_GB" | "EBAY_US";
        /** @enum {string} */
        Category: "trading-cards" | "retro-gaming";
        SourceStatus: {
            enabled: boolean;
            label: string;
            reason?: string | null;
        };
        Money: {
            amount: number;
            currency: string;
        };
        FieldDescriptor: {
            /** @description Pot v `config`, npr. cards.gradingCompany */
            key: string;
            /** @description Slovenska oznaka */
            label: string;
            /** @enum {string} */
            kind: "text" | "number" | "select" | "multiselect" | "boolean";
            options?: {
                value: string;
                label: string;
            }[];
            help?: string;
        };
        CategoryDescriptor: {
            category: components["schemas"]["Category"];
            label: string;
            fields: components["schemas"]["FieldDescriptor"][];
        };
        /**
         * @description `config` skenerja tipa `collectibles`. Vsaj ena od: `keywords`, filter kategorije ali `maxPrice`.
         *     Polja kategorije so v `cards` (trading-cards) ali `retro` (retro-gaming) — samo ustrezno.
         */
        CollectiblesConfig: {
            category: components["schemas"]["Category"];
            keywords?: string;
            excludedKeywords?: string[];
            marketplaces?: components["schemas"]["Marketplace"][];
            sellerCountries?: string[];
            minPrice?: number;
            maxPrice?: number;
            /** @default EUR */
            currency: string;
            conditions?: ("NEW" | "LIKE_NEW" | "USED" | "FOR_PARTS" | "UNKNOWN")[];
            listingTypes?: ("FIXED_PRICE" | "AUCTION")[];
            maxShipping?: number;
            minDiscountPct?: number;
            minProfit?: number;
            notifyMinProfit?: number;
            notifyMinDiscountPct?: number;
            /** @default 6 */
            auctionEndingHours: number;
            cards?: {
                /** @enum {string} */
                game?: "pokemon";
                setName?: string;
                cardNumber?: string;
                /** @enum {string} */
                language?: "en" | "de" | "fr" | "it" | "es" | "ja";
                /** @enum {string} */
                edition?: "first" | "unlimited" | "shadowless" | "any";
                /** @enum {string} */
                finish?: "holo" | "reverse" | "normal" | "any";
                /** @enum {string} */
                gradeStatus?: "raw" | "graded" | "any";
                /** @enum {string} */
                gradingCompany?: "PSA" | "BGS" | "CGC" | "SGC" | "any";
                grade?: string;
                sealedOnly?: boolean;
            };
            retro?: {
                platform?: string;
                consoleModel?: string;
                /** @enum {string} */
                region?: "PAL" | "NTSC-U" | "NTSC-J" | "any";
                edition?: string;
                /** @enum {string} */
                completeness?: "loose" | "boxed" | "cib" | "sealed" | "any";
                /** @enum {string} */
                working?: "working" | "untested" | "not-working" | "any";
                /** @enum {string} */
                kind?: "game" | "console" | "accessory";
            };
        };
        /**
         * @description `asking` = zahtevana cena aktivnih oglasov; `estimate` = katalogna ocena (npr. Cardmarket
         *     trend v TCGdex); `guide` = cenik (PriceCharting); `sold` = preverjene prodaje. Se ne mešajo.
         * @enum {string}
         */
        PriceBasis: "asking" | "estimate" | "guide" | "sold";
        Valuation: {
            asking?: {
                median?: number | null;
                min?: number | null;
                count?: number;
                currency?: string;
            } | null;
            estimate?: {
                value?: number;
                low?: number | null;
                trend?: number | null;
                source?: string;
                /** Format: date-time */
                updatedAt?: string | null;
                currency?: string;
                /** @enum {string} */
                basis?: "estimate" | "guide";
            } | null;
            sold?: {
                average?: number;
                median?: number | null;
                count?: number;
                periodMonths?: number;
                source?: string;
                currency?: string;
            } | null;
            /** @enum {string|null} */
            primary?: "sold" | "guide" | "estimate" | null;
            /** @enum {string} */
            confidence: "high" | "medium" | "low" | "insufficient";
            comparable: boolean;
            stale: boolean;
            note?: string | null;
        };
        Identification: {
            kind: string;
            /** @enum {string} */
            confidence: "high" | "medium" | "low" | "none";
            /** @description Slovensko */
            reason: string;
            needsReview: boolean;
            variantKey?: string | null;
            catalog?: {
                id?: string;
                name?: string;
                setName?: string | null;
                number?: string | null;
                rarity?: string | null;
                imageUrl?: string | null;
            } | null;
        };
        Opportunity: {
            /** @constant */
            illustrative: true;
            price: number;
            shipping?: number | null;
            taxes?: number | null;
            buyerFees?: number;
            acquisitionCost?: number | null;
            conservativeValue?: number | null;
            sellingFees?: number | null;
            riskReserve?: number | null;
            profit?: number | null;
            roi?: number | null;
            discountPct?: number | null;
            /** @enum {string|null} */
            discountBasis?: "sold" | "guide" | "estimate" | null;
            /** @enum {string|null} */
            profitBasis?: "sold" | null;
            score?: number | null;
            missing: string[];
        };
        /** @description `Result.data` za tip `collectibles`. */
        CollectiblesResultData: {
            collectible: {
                [key: string]: unknown;
            };
            listing: {
                marketplace: components["schemas"]["Marketplace"];
                itemId: string;
                /** @enum {string} */
                listingType: "FIXED_PRICE" | "AUCTION";
                /** Format: date-time */
                endsAt?: string | null;
                bidCount?: number | null;
                shipping?: components["schemas"]["Money"] | null;
                shippingKnown: boolean;
                images: string[];
            };
            identification: components["schemas"]["Identification"];
            valuation?: components["schemas"]["Valuation"] | null;
            opportunity: components["schemas"]["Opportunity"];
            alerts?: {
                profitNotified?: boolean;
                discountNotified?: boolean;
                auctionEndingNotified?: boolean;
            };
        };
    };
    responses: {
        /** @description Ni prijave */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Manjka obseg */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getCollectiblesSources: {
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
                        listings: components["schemas"]["SourceStatus"];
                        catalog: components["schemas"]["SourceStatus"];
                        prices: components["schemas"]["SourceStatus"];
                        marketplaces: components["schemas"]["Marketplace"][];
                        fake: boolean;
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    getCollectiblesCategories: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Kategorije */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        categories: components["schemas"]["CategoryDescriptor"][];
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
}
