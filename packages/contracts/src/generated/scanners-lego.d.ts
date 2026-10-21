export interface paths {
    "/lego-scanner/sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Kateri viri so vklopljeni v tej namestitvi
         * @description `enabled` je `true`, kadar so v okolju vsi ključi vira (BrickLink: vsi štirje) ali je vklopljen
         *     testni vir. `marketplaces` so tržnice, dovoljene v namestitvi (`EBAY_MARKETPLACES`).
         *     Obrazec iskanja pokaže, kaj manjka; zagon brez vira oglasov se konča z napako `lego:no-listing-source`.
         */
        get: operations["getLegoSources"];
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
        Marketplace: "EBAY_DE" | "EBAY_IT";
        /** @enum {string} */
        LegoCondition: "NEW_SEALED" | "NEW_OPEN_BOX" | "USED_COMPLETE" | "USED_INCOMPLETE" | "PARTS_ONLY" | "UNKNOWN";
        SourceStatus: {
            enabled: boolean;
            /** @description Slovensko ime vira (npr. Rebrickable) */
            label: string;
            /** @description Slovensko, zakaj ni vklopljen */
            reason?: string | null;
        };
        Money: {
            amount: number;
            currency: string;
        };
        /**
         * @description `config` skenerja tipa `lego`. Vsaj eno od `setNumber`, `keywords`, `theme`, `maxPrice`.
         *     Polja za "upokojen" ni (noben dovoljen vir tega ne pove zanesljivo).
         */
        LegoConfig: {
            /** @description Normalizirano v NNNNN-V ob shranjevanju (npr. 75192-1) */
            setNumber?: string;
            keywords?: string;
            theme?: string;
            subtheme?: string;
            minYear?: number;
            maxYear?: number;
            minPrice?: number;
            maxPrice?: number;
            /** @default EUR */
            currency: string;
            /**
             * @default [
             *       "EBAY_DE"
             *     ]
             */
            marketplaces: components["schemas"]["Marketplace"][];
            sellerCountries?: string[];
            /** @description Prazno = vsa stanja; filtrira se po razvrstitvi */
            conditions?: components["schemas"]["LegoCondition"][];
            listingTypes?: ("FIXED_PRICE" | "AUCTION")[];
            minDiscountPct?: number;
            minProfit?: number;
            maxShipping?: number;
            /** @description Prag obvestila (ne filter) */
            notifyMinProfit?: number;
            /** @default 6 */
            auctionEndingHours: number;
        };
        LegoAttributes: {
            setNumber?: string;
            setName?: string;
            theme?: string;
            subtheme?: string;
            releaseYear?: number;
            pieceCount?: number;
            /** @description Samo kadar vir zanesljivo pove (v 018 nikoli) */
            retired?: boolean;
            condition: components["schemas"]["LegoCondition"];
            completenessVerified?: boolean;
            boxIncluded?: boolean;
            instructionsIncluded?: boolean;
            /** @enum {string} */
            listingType?: "FIXED_PRICE" | "AUCTION";
            sellerCountry?: string;
            shippingCost?: number;
        };
        /** @description `Result.data` rezultata tipa `lego` (glej data-model.md) */
        LegoResultData: {
            lego: components["schemas"]["LegoAttributes"];
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
            identification: {
                /** @enum {string} */
                kind: "SET" | "BUNDLE" | "PARTS" | "MINIFIG" | "EMPTY_BOX" | "OTHER" | "UNIDENTIFIED";
                /** @enum {string} */
                confidence: "high" | "medium" | "low" | "none";
                reason: string;
                needsReview: boolean;
                catalog?: {
                    setNumber?: string;
                    name?: string;
                    theme?: string | null;
                    subtheme?: string | null;
                    year?: number | null;
                    pieces?: number | null;
                    imageUrl?: string | null;
                    url?: string | null;
                } | null;
            };
            valuation?: {
                /** @enum {string} */
                basis?: "sold";
                /** @enum {string|null} */
                newOrUsed?: "N" | "U" | null;
                currency?: string | null;
                average?: number | null;
                median?: number | null;
                salesCount?: number;
                periodMonths?: number;
                /** @enum {string} */
                confidence?: "high" | "medium" | "low" | "insufficient";
                stale?: boolean;
                comparable?: boolean;
                note?: string | null;
                active?: {
                    average?: number | null;
                    min?: number | null;
                    count?: number;
                } | null;
            } | null;
            opportunity: {
                /** @enum {boolean} */
                illustrative: true;
                price: number;
                shipping?: number | null;
                taxes?: number | null;
                buyerFees: number;
                acquisitionCost?: number | null;
                conservativeValue?: number | null;
                sellingFees?: number | null;
                riskReserve?: number | null;
                profit?: number | null;
                roi?: number | null;
                discountPct?: number | null;
                score?: number | null;
                missing: string[];
            };
            alerts: {
                profitNotified: boolean;
                auctionEndingNotified: boolean;
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
    getLegoSources: {
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
                        catalog: components["schemas"]["SourceStatus"];
                        prices: components["schemas"]["SourceStatus"];
                        listings: components["schemas"]["SourceStatus"];
                        marketplaces: components["schemas"]["Marketplace"][];
                        /** @description Testni vir z izmišljenimi podatki je vklopljen */
                        fake: boolean;
                    };
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
}
