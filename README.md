# openapi-cdd

Свой генератор типов из OpenAPI-контракта и типизированный `fetch`-клиент по этим типам
([frontend#12](https://github.com/Cringe-Driven-Development-Team/frontend/issues/12)).
Источник истины — ветка `main` в [Apidog](https://app.apidog.com/project/1382426).
Рантайм-зависимостей нет.

```
Apidog ──bun run apidog──▶ spec/openapi.json ──bun run generate──▶ src/api/schema.d.ts ──▶ createClient<paths>()
```

## Команды

| Команда | Что делает |
| --- | --- |
| `bun run sync` | всё сразу: выгрузка из Apidog и генерация типов |
| `bun run apidog` | выгружает спеку в `spec/openapi.json` (нужен `APIDOG_TOKEN` в `.env`, см. `.env.example`) |
| `bun run generate` | генерирует `src/api/schema.d.ts` из `spec/openapi.json` |
| `bun run demo` | пять запросов в облачный мок Apidog (или в `API_BASE_URL`) |
| `bun run typecheck` | `tsc`, включая каталог ошибок типов `src/type-errors.ts` и сгенерированные `.d.ts` |
| `bun test` | тесты генератора и клиента, без сети и токена |

`spec/openapi.json` и `src/api/schema.d.ts` коммитятся и руками не правятся. Sprint-ветка Apidog:
`APIDOG_BRANCH_ID=… bun run sync`.

## Клиент

```ts
import createClient, { authMiddleware } from "./src/index";
import type { paths } from "./src/api/schema";

const api = createClient<paths>({ baseUrl: "/api/v1", credentials: "include" });
api.use(authMiddleware()); // Bearer из заголовка ответа, после 401 — refresh и повтор

const { data, error, response } = await api.GET("/notebooks/{id}", { params: { path: { id } } });
if (error) show(error.code);
else render(data.name);
```

- Методы `GET`, `POST`, `PUT`, `PATCH`, `DELETE`; путь, `params` (`path`, `query`, `header`) и `body` типизированы по спеке.
- `tsc` ловит: путь или метод не из спеки, пропущенное и лишнее поле `body`, `body` у `GET`, опечатку в ключе
  второго аргумента, неверный тип параметра, обращение к `data` без проверки `error`. Весь каталог — `src/type-errors.ts`.
- При `2xx` есть `data`, иначе `error`; `204` и пустое тело дают `undefined`. Сырой `response` есть всегда.
- В рантайме по спеке ничего не проверяется.

## Генератор

`bun scripts/generate.ts <спека.json> -o <выход.d.ts>` — про Apidog не знает, читает файл и пишет файл.
Только OpenAPI 3.1 и JSON. Неподдержанная конструкция — ошибка с JSON pointer
(`#/paths/~1notebooks/get/…`) и ненулевой код выхода, без молчаливого `unknown`.
Все поддержанные конструкции собраны в `tests/fixtures/full.json`, их вывод — в `tests/fixtures/full.d.ts`.
