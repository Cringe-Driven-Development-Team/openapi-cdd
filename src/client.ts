// Типизированный fetch-клиент по типам paths из сгенерированного schema.d.ts.
// Рантайм-зависимостей нет: только fetch, Request, Response и Headers.
// Рантайм ничего не проверяет по спеке — пути, параметры, тело и типы ответа проверяет только tsc.

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

// Подмножество fetch, которым пользуется клиент: всегда один готовый Request.
export type Fetch = (request: Request) => Promise<Response>;

export interface ClientOptions {
  /** В node и bun — абсолютный URL; в браузере можно относительный ("/api/v1"). */
  baseUrl: string;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  /** Подмена fetch, например в тестах. */
  fetch?: Fetch;
}

type ParamValue = string | number | boolean | null | undefined;
export interface RequestParams {
  path?: Record<string, ParamValue | ParamValue[]>;
  query?: Record<string, ParamValue | ParamValue[]>;
  header?: Record<string, ParamValue | ParamValue[]>;
  cookie?: Record<string, unknown>;
}

export interface MiddlewareRequestContext {
  request: Request;
  /** Путь как в спеке, с плейсхолдерами: "/notebooks/{id}". */
  schemaPath: string;
  params: RequestParams;
  options: { baseUrl: string; fetch: Fetch };
}
export interface MiddlewareResponseContext extends MiddlewareRequestContext {
  response: Response;
}
type MaybePromise<T> = T | Promise<T>;
export interface Middleware {
  /** Может вернуть новый Request взамен исходного. */
  onRequest?(context: MiddlewareRequestContext): MaybePromise<Request | void>;
  /** Может вернуть новый Response взамен исходного. */
  onResponse?(context: MiddlewareResponseContext): MaybePromise<Response | void>;
}

type JsonMedia = "application/json";
type OkStatus = 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226 | "2XX";

type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];
type OrUnknown<T> = [T] extends [never] ? unknown : T;

export type PathsWithMethod<Paths, M extends HttpMethod> = {
  [P in keyof Paths]: Paths[P] extends { [K in M]: unknown } ? P : never;
}[keyof Paths];

type OperationOf<Paths, P, M> = P extends keyof Paths ? (M extends keyof Paths[P] ? Paths[P][M] : never) : never;

type ParamsInit<Op> = Op extends { parameters: infer P }
  ? [keyof P] extends [never]
    ? { params?: never }
    : [RequiredKeys<P>] extends [never]
      ? { params?: P }
      : { params: P }
  : { params?: never };

type BodyInit<Op> = Op extends { requestBody: { content: { [K in JsonMedia]: infer B } } }
  ? { body: B }
  : "requestBody" extends keyof Op
    ? Op extends { requestBody?: { content: { [K in JsonMedia]: infer B } } }
      ? { body?: B }
      : { body?: never }
    : { body?: never };

// Второй аргумент метода. Тип конкретный (не выводится из аргумента), поэтому работает
// excess property check: лишний ключ в body или в самом init — ошибка типов.
export type RequestOptions<Op> = ParamsInit<Op> &
  BodyInit<Op> & {
    headers?: HeadersInit;
    signal?: AbortSignal;
  };

type IsUnion<T, U = T> = T extends U ? ([U] extends [T] ? false : true) : never;

// Если пути нет в спеке, P не выводится и становится объединением всех путей метода. Тогда init
// необязателен, чтобы tsc указал на сам путь, а не на число аргументов.
type InitArgs<Op, P> = true extends IsUnion<P>
  ? [init?: RequestOptions<Op>]
  : [RequiredKeys<RequestOptions<Op>>] extends [never]
    ? [init?: RequestOptions<Op>]
    : [init: RequestOptions<Op>];

type ResponsesOf<Op> = Op extends { responses: infer R } ? R : never;
type JsonOf<R> = R extends { content: { [K in JsonMedia]: infer T } } ? T : undefined;
type SuccessData<Op> = OrUnknown<
  { [S in keyof ResponsesOf<Op> & OkStatus]: JsonOf<ResponsesOf<Op>[S]> }[keyof ResponsesOf<Op> & OkStatus]
>;
type ErrorData<Op> = OrUnknown<
  { [S in Exclude<keyof ResponsesOf<Op>, OkStatus>]: JsonOf<ResponsesOf<Op>[S]> }[Exclude<keyof ResponsesOf<Op>, OkStatus>]
>;

// 2xx → data, иначе → error; сырой response есть всегда.
export type Result<Op> =
  | { data: SuccessData<Op>; error?: undefined; response: Response }
  | { data?: undefined; error: ErrorData<Op>; response: Response };

export type ClientMethod<Paths, M extends HttpMethod> = <P extends PathsWithMethod<Paths, M>>(
  path: P,
  ...init: InitArgs<OperationOf<Paths, P, M>, P>
) => Promise<Result<OperationOf<Paths, P, M>>>;

export interface Client<Paths> {
  GET: ClientMethod<Paths, "get">;
  POST: ClientMethod<Paths, "post">;
  PUT: ClientMethod<Paths, "put">;
  PATCH: ClientMethod<Paths, "patch">;
  DELETE: ClientMethod<Paths, "delete">;
  /** onRequest вызываются в порядке подключения, onResponse — в обратном. */
  use(...middlewares: Middleware[]): void;
}

interface UntypedInit {
  params?: RequestParams;
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

function buildPath(schemaPath: string, path: RequestParams["path"]): string {
  return schemaPath.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = path?.[name];
    if (value === undefined || value === null) {
      throw new Error(`не передан path-параметр «${name}» для ${schemaPath}`);
    }
    return encodeURIComponent(String(value));
  });
}

// Массив — повтором ключа, undefined и null пропускаются.
function buildQuery(query: RequestParams["query"]): string {
  const pairs: string[] = [];
  for (const [name, value] of Object.entries(query ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue;
      pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(item))}`);
    }
  }
  return pairs.length === 0 ? "" : `?${pairs.join("&")}`;
}

function parseBody(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createClient<Paths extends {}>(options: ClientOptions): Client<Paths> {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  // globalThis.fetch читается при каждом запросе, а не при создании клиента.
  const doFetch: Fetch = (request) => (options.fetch ?? globalThis.fetch)(request);
  const middlewares: Middleware[] = [];

  async function send(method: string, schemaPath: string, init: UntypedInit = {}) {
    const params = init.params ?? {};

    const headers = new Headers(options.headers);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    for (const [name, value] of Object.entries(params.header ?? {})) {
      if (value !== undefined && value !== null) headers.set(name, String(value));
    }

    const requestInit: RequestInit = { method, headers };
    if (init.body !== undefined) {
      requestInit.body = JSON.stringify(init.body);
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    }
    if (options.credentials) requestInit.credentials = options.credentials;
    if (init.signal) requestInit.signal = init.signal;

    // Cookie-параметры не сериализуются: в браузере cookie шлёт сам fetch (credentials: "include").
    const url = baseUrl + buildPath(schemaPath, params.path) + buildQuery(params.query);
    let request = new Request(url, requestInit);
    const context = { schemaPath, params, options: { baseUrl, fetch: doFetch } };

    for (const middleware of middlewares) {
      const replaced = await middleware.onRequest?.({ ...context, request });
      if (replaced) request = replaced;
    }

    let response = await doFetch(request);

    for (let i = middlewares.length - 1; i >= 0; i--) {
      const replaced = await middlewares[i]!.onResponse?.({ ...context, request, response });
      if (replaced) response = replaced;
    }

    // 204 и пустое тело → undefined. У не-2xx с пустым телом error тоже undefined — тогда смотри response.ok.
    const payload = response.status === 204 ? undefined : parseBody(await response.text());
    return response.ok ? { data: payload, response } : { error: payload, response };
  }

  const method = (name: string) => (path: string, init?: UntypedInit) => send(name, path, init);

  return {
    GET: method("GET"),
    POST: method("POST"),
    PUT: method("PUT"),
    PATCH: method("PATCH"),
    DELETE: method("DELETE"),
    use(...added: Middleware[]) {
      middlewares.push(...added);
    },
  } as Client<Paths>;
}
