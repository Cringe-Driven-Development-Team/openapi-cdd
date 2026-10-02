// Каталог ошибок типов: каждая строка под @ts-expect-error — это то, что
// клиент ловит на этапе компиляции. Файл проверяется `typecheck`,
// но никогда не выполняется.
import createClient from "./index";
import type { paths } from "./api/schema";

const api = createClient<paths>({ baseUrl: "https://api.test" });

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

  // 204 → data: undefined.
  const out = await api.POST("/auth/logout");
  if (!out.error) {
    const nothing: undefined = out.data;
    void nothing;
  }
}

void catalog;
