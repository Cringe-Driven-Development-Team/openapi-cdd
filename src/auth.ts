import type { Middleware } from "./client";

const BEARER = "Bearer ";

// Бэкенд отдаёт access-токен в заголовке ответа Authorization ("Bearer <token>").
// Пустое значение (так отвечает мок Apidog) токен не затирает.
function tokenFrom(response: Response): string | undefined {
  const header = response.headers.get("Authorization");
  if (!header) return undefined;
  return header.startsWith(BEARER) ? header.slice(BEARER.length) : header;
}

// Middleware авторизации: запоминает access-токен из ответов, шлёт его Bearer'ом,
// а после 401 один раз зовёт refresh и повторяет запрос с тем же телом.
// В браузере cookie refresh-сессии (HttpOnly) шлёт сам браузер благодаря credentials: "include".
// У fetch в bun нет хранилища cookie, поэтому против настоящего бэка в bun повтор после 401
// не восстановит сессию: refresh уйдёт без cookie и получит 401. В тестах и против мока это не проявляется.
export function authMiddleware(config: { refreshPath?: string; authPrefix?: string } = {}): Middleware {
  const { refreshPath = "/auth/refresh", authPrefix = "/auth/" } = config;

  let token: string | undefined;
  // Копия каждого исходящего запроса: тело Request читается один раз,
  // а после 401 запрос нужно повторить с тем же телом.
  const pending = new WeakMap<Request, Request>();

  return {
    onRequest({ request }) {
      if (token) request.headers.set("Authorization", BEARER + token);
      pending.set(request, request.clone());
      return request;
    },

    async onResponse({ request, response, schemaPath, options }) {
      const original = pending.get(request);
      pending.delete(request);

      const fresh = tokenFrom(response);
      if (fresh) token = fresh;

      if (response.status !== 401 || schemaPath.startsWith(authPrefix) || !original) return response;

      // Refresh и повтор идут через тот же fetch, что и сам клиент (options.fetch).
      // Single-flight нет: параллельные 401 запускают каждый свой refresh. Если бэк ротирует
      // refresh-токены, в своём клиенте это стоит сериализовать. Неудачный refresh оставляет старый токен.
      const refreshed = await options.fetch(
        new Request(options.baseUrl + refreshPath, { method: "POST", credentials: "include" }),
      );
      if (!refreshed.ok) return response;

      const renewed = tokenFrom(refreshed);
      if (renewed) token = renewed;
      if (token) original.headers.set("Authorization", BEARER + token);
      return options.fetch(original);
    },
  };
}
