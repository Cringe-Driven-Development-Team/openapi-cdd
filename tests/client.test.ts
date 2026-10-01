import { expect, test } from "bun:test";
import createClient, { authMiddleware, type Middleware } from "../src/index";
import type { paths } from "../src/api/schema";
import type { paths as fullPaths } from "./fixtures/full";

const BASE = "https://api.test";

// Заглушка fetch: отдаёт заданные Response по очереди и запоминает полученные Request.
function stubFetch(...responses: Response[]) {
  const requests: Request[] = [];
  const queue = [...responses];
  const fetch = async (request: Request) => {
    requests.push(request);
    const response = queue.shift();
    if (!response) throw new Error(`нет ответа в очереди для ${request.method} ${request.url}`);
    return response;
  };
  return { fetch, requests };
}

// Клиент как у потребителя: createClient + middleware авторизации.
function createApi(fetch: (request: Request) => Promise<Response>) {
  const api = createClient<paths>({ baseUrl: BASE, fetch, credentials: "include" });
  api.use(authMiddleware());
  return api;
}

function withAuth(token: string, init: ResponseInit = {}, body: BodyInit | null = null): Response {
  return new Response(body, { ...init, headers: { Authorization: token } });
}

const user = { id: "00000000-0000-0000-0000-000000000001", login: "neo" };
const summary = { id: "00000000-0000-0000-0000-000000000002", name: "Черновик", updated_at: "2026-09-30T00:00:00Z" };
const notebook = { ...summary, data: {}, created_at: "2026-09-30T00:00:00Z" };
const creds = { login: "neo", password: "secret" };
const item = { path: { itemId: "1" } };

test("path-параметр кодируется", async () => {
  const stub = stubFetch(Response.json({}));
  const api = createApi(stub.fetch);

  await api.GET("/notebooks/{id}", { params: { path: { id: "a/b" } } });

  expect(stub.requests[0]?.url).toBe("https://api.test/notebooks/a%2Fb");
});

test("завершающий слеш в baseUrl не удваивается", async () => {
  const stub = stubFetch(Response.json([]));
  const api = createClient<paths>({ baseUrl: BASE + "/api/v1/", fetch: stub.fetch });

  await api.GET("/notebooks");

  expect(stub.requests[0]?.url).toBe("https://api.test/api/v1/notebooks");
});

test("query: массив — повтором ключа, undefined и null пропускаются, значения кодируются", async () => {
  const stub = stubFetch(Response.json({}), Response.json({}));
  const api = createClient<fullPaths>({ baseUrl: BASE, fetch: stub.fetch });

  await api.GET("/items/{itemId}", {
    params: { ...item, query: { lang: "ru", tags: ["a b", "c&d"], limit: undefined } },
  });
  await api.PUT("/items/{itemId}", { params: item });

  expect(stub.requests[0]?.url).toBe("https://api.test/items/1?lang=ru&tags=a%20b&tags=c%26d");
  expect(stub.requests[1]?.url).toBe("https://api.test/items/1");
});

test("заголовки: опции клиента, затем вызова, затем params.header; cookie-параметры не отправляются", async () => {
  const stub = stubFetch(Response.json({}));
  const api = createClient<fullPaths>({
    baseUrl: BASE,
    fetch: stub.fetch,
    headers: { "x-app": "client", "x-request-id": "client" },
  });

  await api.GET("/items/{itemId}", {
    params: { ...item, query: { lang: "en" }, header: { "x-request-id": "param" }, cookie: { session: "s" } },
    headers: { "x-app": "call", "x-request-id": "call" },
  });

  const req = stub.requests[0]!;
  expect(req.headers.get("x-app")).toBe("call");
  expect(req.headers.get("x-request-id")).toBe("param");
  expect(req.headers.get("cookie")).toBeNull();
  expect(req.headers.get("content-type")).toBeNull();
});

test("signal уходит в запрос", async () => {
  const stub = stubFetch(Response.json([]));
  const api = createApi(stub.fetch);
  const controller = new AbortController();

  await api.GET("/notebooks", { signal: controller.signal });
  controller.abort();

  expect(stub.requests[0]?.signal.aborted).toBe(true);
});

test("POST /notebooks: JSON-тело и Content-Type", async () => {
  const stub = stubFetch(Response.json(notebook, { status: 201 }));
  const api = createApi(stub.fetch);

  await api.POST("/notebooks", { body: { name: "Черновик" } });

  const req = stub.requests[0]!;
  expect(req.method).toBe("POST");
  expect(req.headers.get("content-type")).toBe("application/json");
  expect(await req.json()).toEqual({ name: "Черновик" });
});

test("тела-объединения: null и строка уходят как JSON", async () => {
  const stub = stubFetch(new Response(null, { status: 204 }), Response.json({ ok: true }));
  const api = createClient<fullPaths>({ baseUrl: BASE, fetch: stub.fetch });

  await api.PUT("/items/{itemId}", { params: item, body: null });
  await api.PATCH("/items/{itemId}", { params: item, body: "имя" });

  expect(await stub.requests[0]!.text()).toBe("null");
  expect(await stub.requests[1]!.text()).toBe('"имя"');
});

test("200 → data без error, 404 → error без data", async () => {
  const stub = stubFetch(
    Response.json([summary]),
    Response.json({ code: "not_found", message: "x" }, { status: 404 }),
  );
  const api = createApi(stub.fetch);

  const ok = await api.GET("/notebooks");
  expect(ok.data).toHaveLength(1);
  expect(ok.error).toBeUndefined();

  const missing = await api.GET("/notebooks/{id}", { params: { path: { id: "nope" } } });
  expect(missing.error?.code).toBe("not_found");
  expect(missing.data).toBeUndefined();
  expect(missing.response.status).toBe(404);
});

test("204 у /auth/logout → data нет, status 204", async () => {
  const stub = stubFetch(new Response(null, { status: 204 }));
  const api = createApi(stub.fetch);

  // refresh_token в спеке — обязательный cookie-параметр, но в типах он необязателен: cookie шлёт сам браузер.
  const { data, error, response } = await api.POST("/auth/logout");

  expect(data).toBeUndefined();
  expect(error).toBeUndefined();
  expect(response.status).toBe(204);
});

test("JSON-ответ с пустым телом → data undefined", async () => {
  const stub = stubFetch(new Response("", { status: 200, headers: { "Content-Type": "application/json" } }));
  const api = createApi(stub.fetch);

  const result = await api.GET("/users/me");

  expect("data" in result).toBe(true);
  expect(result.data).toBeUndefined();
  expect(result.error).toBeUndefined();
});

test("не-JSON в ошибочном ответе отдаётся текстом", async () => {
  const stub = stubFetch(new Response("<html>Bad Gateway</html>", { status: 502 }));
  const api = createApi(stub.fetch);

  const { data, error } = await api.GET("/notebooks");

  expect(data).toBeUndefined();
  expect(error as unknown).toBe("<html>Bad Gateway</html>");
});

test("middleware: onRequest по порядку подключения, onResponse — в обратном, могут подменять запрос и ответ", async () => {
  const stub = stubFetch(Response.json(user));
  const api = createClient<paths>({ baseUrl: BASE, fetch: stub.fetch });
  const log: string[] = [];
  const tracer = (name: string): Middleware => ({
    onRequest({ request, schemaPath }) {
      log.push(`${name}:request:${schemaPath}`);
      const next = new Request(request);
      next.headers.append("x-trace", name);
      return next;
    },
    onResponse({ response }) {
      log.push(`${name}:response`);
      return new Response(response.body, { status: response.status, headers: { "x-seen": name } });
    },
  });
  api.use(tracer("a"), tracer("b"));

  const { data, response } = await api.GET("/users/me");

  expect(log).toEqual(["a:request:/users/me", "b:request:/users/me", "b:response", "a:response"]);
  expect(stub.requests[0]?.headers.get("x-trace")).toBe("a, b");
  expect(response.headers.get("x-seen")).toBe("a");
  expect(data).toEqual(user);
});

test("токен из Authorization ответа логина уходит Bearer'ом дальше", async () => {
  const stub = stubFetch(withAuth("Bearer abc", { status: 200 }, JSON.stringify(user)), Response.json(user));
  const api = createApi(stub.fetch);

  await api.POST("/auth/login", { body: creds });
  await api.GET("/users/me");

  expect(stub.requests[0]?.headers.get("Authorization")).toBeNull();
  expect(stub.requests[1]?.headers.get("Authorization")).toBe("Bearer abc");
});

test("пустой Authorization в ответе не затирает токен", async () => {
  const stub = stubFetch(
    withAuth("Bearer abc", { status: 200 }, JSON.stringify(user)),
    withAuth("", { status: 200 }, JSON.stringify(user)),
    Response.json(user),
  );
  const api = createApi(stub.fetch);

  await api.POST("/auth/login", { body: creds });
  await api.POST("/auth/login", { body: creds });
  await api.GET("/users/me");

  expect(stub.requests[2]?.headers.get("Authorization")).toBe("Bearer abc");
});

test("401 → refresh → повтор с новым токеном", async () => {
  const stub = stubFetch(
    Response.json({ code: "unauthorized", message: "expired" }, { status: 401 }),
    withAuth("Bearer new", { status: 204 }),
    Response.json(user),
  );
  const api = createApi(stub.fetch);

  const { data, error } = await api.GET("/users/me");

  expect(error).toBeUndefined();
  expect(data).toEqual(user);
  expect(stub.requests.map((r) => new URL(r.url).pathname)).toEqual(["/users/me", "/auth/refresh", "/users/me"]);
  expect(stub.requests[1]?.method).toBe("POST");
  expect(stub.requests[2]?.headers.get("Authorization")).toBe("Bearer new");
});

test("повтор POST после 401 шлёт то же тело", async () => {
  const stub = stubFetch(
    Response.json({ code: "unauthorized", message: "expired" }, { status: 401 }),
    withAuth("Bearer new", { status: 204 }),
    Response.json(notebook, { status: 201 }),
  );
  const api = createApi(stub.fetch);

  const { data } = await api.POST("/notebooks", { body: { name: "A" } });

  expect(data).toEqual(notebook);
  const retry = stub.requests[2]!;
  expect(retry.method).toBe("POST");
  expect(retry.headers.get("Authorization")).toBe("Bearer new");
  expect(await retry.json()).toEqual({ name: "A" });
});

test("refresh 401 → исходный 401, один вызов refresh", async () => {
  const stub = stubFetch(
    Response.json({ code: "unauthorized", message: "expired" }, { status: 401 }),
    Response.json({ code: "unauthorized", message: "no session" }, { status: 401 }),
  );
  const api = createApi(stub.fetch);

  const { error, response } = await api.GET("/users/me");

  expect(error).toBeDefined();
  expect(error?.message).toBe("expired");
  expect(response.status).toBe(401);
  expect(stub.requests).toHaveLength(2);
  expect(stub.requests.filter((r) => new URL(r.url).pathname === "/auth/refresh")).toHaveLength(1);
});

test("повтор снова 401 → исходный ответ повтора, ровно один refresh", async () => {
  const stub = stubFetch(
    Response.json({ code: "unauthorized", message: "expired" }, { status: 401 }),
    withAuth("Bearer new", { status: 204 }),
    Response.json({ code: "unauthorized", message: "still no" }, { status: 401 }),
  );
  const api = createApi(stub.fetch);

  const { error, response } = await api.GET("/users/me");

  expect(error?.message).toBe("still no");
  expect(response.status).toBe(401);
  expect(stub.requests).toHaveLength(3);
  expect(stub.requests.filter((r) => new URL(r.url).pathname === "/auth/refresh")).toHaveLength(1);
});

test("401 у /auth/* не запускает refresh", async () => {
  const stub = stubFetch(Response.json({ code: "invalid_credentials", message: "nope" }, { status: 401 }));
  const api = createApi(stub.fetch);

  const { error } = await api.POST("/auth/login", { body: creds });

  expect(error).toBeDefined();
  expect(stub.requests).toHaveLength(1);
});

test("без опции fetch используется globalThis.fetch", async () => {
  const stub = stubFetch(Response.json([]));
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = stub.fetch as typeof globalThis.fetch;
    const api = createClient<paths>({ baseUrl: BASE });

    await api.GET("/notebooks");

    expect(stub.requests[0]?.url).toBe("https://api.test/notebooks");
  } finally {
    globalThis.fetch = saved;
  }
});
