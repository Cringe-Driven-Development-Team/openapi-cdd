// Сгенерировано из OpenAPI-спецификации. Не править руками.

export interface paths {
    "/auth/register": {
        post: operations["registerUser"];
    };
    "/auth/login": {
        post: operations["loginUser"];
    };
    "/auth/refresh": {
        post: operations["refreshToken"];
    };
    "/auth/logout": {
        post: operations["logoutUser"];
    };
    "/users/me": {
        get: operations["getCurrentUser"];
    };
    "/notebooks": {
        get: operations["listNotebooks"];
        post: operations["createNotebook"];
    };
    "/notebooks/{id}": {
        get: operations["getNotebook"];
    };
}

export interface components {
    schemas: {
        User: {
            /** ID */
            id: string;
            login: string;
        };
        /** Блокнот (.ipynb) */
        Notebook: {
            /** ID */
            id: string;
            /** Название блокнота */
            name: string;
            data: Record<string, unknown>;
            created_at: string;
            updated_at: string;
        };
        NotebookSummary: {
            id: string;
            name: string;
            updated_at: string;
        };
        Credentials: {
            login: string;
            password: string;
        };
        Error: {
            code: "validation_error" | "invalid_credentials" | "login_taken" | "unauthorized" | "not_found" | "not_implemented" | "internal";
            message: string;
        };
        CreateNotebookRequest: {
            name: string;
        };
    };
}

export interface operations {
    /** Регистрация */
    registerUser: {
        parameters: {};
        requestBody: { content: { "application/json": components["schemas"]["Credentials"] } };
        responses: {
            201: { content: { "application/json": components["schemas"]["User"] } };
            400: { content: { "application/json": components["schemas"]["Error"] } };
            409: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Вход */
    loginUser: {
        parameters: {};
        requestBody: { content: { "application/json": components["schemas"]["Credentials"] } };
        responses: {
            200: { content: { "application/json": components["schemas"]["User"] } };
            400: { content: { "application/json": components["schemas"]["Error"] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Обновление токенов */
    refreshToken: {
        parameters: {
            cookie?: {
                /** Refresh-токен (HttpOnly-cookie, Path=/api/v1/auth) */
                refresh_token?: string;
            };
        };
        responses: {
            204: { content?: never };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Выход */
    logoutUser: {
        parameters: {
            cookie?: {
                /** Refresh-токен (HttpOnly-cookie, Path=/api/v1/auth) */
                refresh_token?: string;
            };
        };
        responses: {
            204: { content?: never };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Текущий пользователь */
    getCurrentUser: {
        parameters: {};
        responses: {
            200: { content: { "application/json": components["schemas"]["User"] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Список блокнотов */
    listNotebooks: {
        parameters: {};
        responses: {
            200: { content: { "application/json": components["schemas"]["NotebookSummary"][] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Создание блокнота */
    createNotebook: {
        parameters: {};
        requestBody: { content: { "application/json": components["schemas"]["CreateNotebookRequest"] } };
        responses: {
            201: { content: { "application/json": components["schemas"]["Notebook"] } };
            400: { content: { "application/json": components["schemas"]["Error"] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Блокнот */
    getNotebook: {
        parameters: {
            path: {
                id: string;
            };
        };
        responses: {
            200: { content: { "application/json": components["schemas"]["Notebook"] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            404: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
}
