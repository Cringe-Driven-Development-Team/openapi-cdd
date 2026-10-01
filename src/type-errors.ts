// Каталог ошибок типов: каждая строка под @ts-expect-error — это то, что
// клиент ловит на этапе компиляции. Файл проверяется `typecheck`,
// но никогда не выполняется.
import createClient from "./index";
import type { paths } from "./api/schema";
import type { paths as fullPaths } from "../tests/fixtures/full";

const api = createClient<paths>({ baseUrl: "https://api.test" });
// Синтетическая спека со всеми конструкциями генератора: тела-объединения, query, header.
const full = createClient<fullPaths>({ baseUrl: "https://api.test" });

async function catalog() {
  // @ts-expect-error пути нет в спеке
  await api.GET("/notebook");

  // @ts-expect-error у пути /notebooks/{id} нет метода DELETE
  await api.DELETE("/notebooks/{id}", { params: { path: { id: "1" } } });

  // @ts-expect-error нет обязательного поля name
  await api.POST("/notebooks", { body: {} });

  // @ts-expect-error нет обязательного body
  await api.POST("/notebooks");

  // @ts-expect-error лишнее поле color в body
  await api.POST("/notebooks", { body: { name: "A", color: "red" } });

  // @ts-expect-error у GET нет тела
  await api.GET("/notebooks", { body: { name: "A" } });

  // @ts-expect-error опечатка в ключе второго аргумента (signal)
  await api.GET("/notebooks", { sginal: new AbortController().signal });

  // @ts-expect-error у операции нет параметров
  await api.GET("/notebooks", { params: { query: { page: 1 } } });

  // @ts-expect-error id должен быть строкой, а не числом
  await api.GET("/notebooks/{id}", { params: { path: { id: 42 } } });

  // @ts-expect-error нет обязательного params.path
  await api.GET("/notebooks/{id}");

  // @ts-expect-error нет обязательного query-параметра lang
  await full.GET("/items/{itemId}", { params: { path: { itemId: "1" } } });

  // @ts-expect-error lang — только "ru" или "en"
  await full.GET("/items/{itemId}", { params: { path: { itemId: "1" }, query: { lang: "de" } } });

  // @ts-expect-error нет обязательного заголовка 2fa
  await full.DELETE("/items/{itemId}", { params: { path: { itemId: "1" } } });

  {
    const { data } = await api.GET("/users/me");
    // @ts-expect-error data может быть undefined, пока не проверен error
    data.login;
  }

  {
    const { error } = await api.GET("/notebooks/{id}", { params: { path: { id: "1" } } });
    // @ts-expect-error code — только из enum спеки
    if (error) error.code === "teapot";
  }

  // Ниже — правильные вызовы, директив нет.

  // После проверки error data сужается до объекта, и наоборот.
  const { data, error } = await api.GET("/users/me");
  if (!error) data.login;
  else error.code;

  // Cookie-параметр в спеке обязателен, но в типах необязателен: его шлёт браузер.
  await api.POST("/auth/logout");
  await api.GET("/notebooks", { signal: new AbortController().signal, headers: { "x-trace": "1" } });

  // Тела-объединения: {…} | null (необязательное), string | {…}, unknown.
  await full.PUT("/items/{itemId}", { params: { path: { itemId: "1" } } });
  await full.PUT("/items/{itemId}", { params: { path: { itemId: "1" } }, body: null });
  await full.PATCH("/items/{itemId}", { params: { path: { itemId: "1" } }, body: "новое имя" });
  await full.PATCH("/items/{itemId}", { params: { path: { itemId: "1" } }, body: { name: "новое имя" } });
  await full.POST("/anything", { body: 42 });
  await full.POST("/anything", { body: { any: ["thing"] } });

  // query с массивом и заголовок-не-идентификатор.
  await full.GET("/items/{itemId}", {
    params: { path: { itemId: "1" }, query: { lang: "ru", tags: ["a", "b"] }, header: { "x-request-id": "r1" } },
  });
  await full.DELETE("/items/{itemId}", { params: { path: { itemId: "1" }, header: { "2fa": "123456" } } });

  // 204 → data: undefined; ответ без схемы → unknown.
  const removed = await full.DELETE("/items/{itemId}", { params: { path: { itemId: "1" }, header: { "2fa": "1" } } });
  const nothing: undefined = removed.data;
  void nothing;
}

void catalog;
