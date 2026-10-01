// Сгенерировано из OpenAPI-спецификации. Не править руками.

export interface paths {
    "/items/{itemId}": {
        get: operations["getItem"];
        put: operations["replaceItem"];
        patch: operations["patchItem"];
        delete: operations["deleteItem"];
    };
    "/anything": {
        post: operations["postAnything"];
    };
}

export interface components {
    schemas: {
        /**
         * Элемент: "кавычки", закрытие комментария *\/ и
         * вторая строка
         */
        Item: {
            /** ID *\/ внутри */
            id: string;
            kind: "item";
            status: "new" | "it's \"quoted\"" | "line\nbreak" | 0 | -1 | 1.5 | true | null;
            count?: number;
            ratio?: number;
            active?: boolean;
            note?: string | null;
            matrix?: number[][];
            values?: (string | number)[];
            maybeList?: string[] | null;
            meta?: Record<string, unknown>;
            empty?: Record<string, never>;
            labels?: {
                [key: string]: string;
            };
            free?: {
                [key: string]: unknown;
            };
            mixed?: {
                name: string;
                size?: number;
                [key: string]: boolean | string | number | undefined;
            };
            nested?: {
                /** Вложенный объект */
                deep?: {
                    leaf?: string;
                };
            };
            "Set-Cookie"?: string;
            "x-request-id"?: string;
            "2fa"?: string;
            parent?: components["schemas"]["Item"];
            anything?: unknown;
        };
        Tree: {
            value: string;
            children?: components["schemas"]["Tree"][];
        };
        Cat: {
            type: "cat";
            lives?: number;
        };
        Dog: {
            type: "dog";
            breed?: string;
        };
        Pet: components["schemas"]["Cat"] | components["schemas"]["Dog"];
        NamedPet: (components["schemas"]["Cat"] | components["schemas"]["Dog"]) & {
            name: string;
        };
        Problem: components["schemas"]["Tree"] & {
            code: number;
        };
        Tagged: (components["schemas"]["Cat"] | components["schemas"]["Dog"]) & components["schemas"]["Tree"];
        Pets: components["schemas"]["Pet"][];
        "weird-name": string;
        UsesWeird: components["schemas"]["weird-name"];
    };
}

export interface operations {
    /** Элемент */
    getItem: {
        parameters: {
            path: {
                itemId: string;
            };
            query: {
                lang: "ru" | "en";
                tags?: string[];
                limit?: number;
            };
            header?: {
                /** Сквозной ID запроса */
                "x-request-id"?: string;
            };
            cookie?: {
                session?: string;
            };
        };
        responses: {
            200: { content: { "application/json": components["schemas"]["Item"] } };
            404: { content: { "application/json": components["schemas"]["Problem"] } };
        };
    };
    replaceItem: {
        parameters: {
            path: {
                itemId: string;
            };
            query?: {
                lang?: string;
            };
            header?: {
                /** Сквозной ID запроса */
                "x-request-id"?: string;
            };
        };
        requestBody?: { content: { "application/json": components["schemas"]["Item"] | null } };
        responses: {
            204: { content?: never };
            default: { content: { "application/json": components["schemas"]["Problem"] } };
        };
    };
    patchItem: {
        parameters: {
            path: {
                itemId: string;
            };
            query?: {
                lang?: string;
            };
            header?: {
                /** Сквозной ID запроса */
                "x-request-id"?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": string | {
                    name: string;
                };
            };
        };
        responses: {
            200: {
                content: {
                    "application/json": {
                        ok: true;
                        item?: components["schemas"]["Item"];
                    };
                };
            };
        };
    };
    deleteItem: {
        parameters: {
            path: {
                itemId: string;
            };
            query?: {
                lang?: string;
                force?: boolean;
            };
            header: {
                /** Сквозной ID запроса */
                "x-request-id"?: string;
                "2fa": string;
            };
        };
        responses: {
            204: { content?: never };
        };
    };
    postAnything: {
        parameters: {};
        requestBody: { content: { "application/json": unknown } };
        responses: {
            200: { content: { "application/json": unknown } };
            "2XX": { content?: never };
        };
    };
}
