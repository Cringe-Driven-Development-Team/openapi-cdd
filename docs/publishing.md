# Как публиковать пакет

Пакет — `@maninthecoat/openapi` в npm. В tarball попадает только `dist/`, `package.json` и `README.md`
(поле `files`). `dist/` в git не хранится и собирается при публикации.

## Один раз: доступ

1. Нужны права на публикацию в скоуп `@maninthecoat` (их выдаёт владелец скоупа).
2. Войти в npm:

   ```sh
   bunx npm login
   bunx npm whoami   # должен показать твой логин
   ```

## Перед публикацией

- Рабочее дерево чистое, нужные изменения влиты в ветку, с которой публикуешь.
- CI на этом коммите зелёный.
- Если менялся контракт — `spec/openapi.json` и `src/api/schema.ts` обновлены
  ([как обновлять сгенерированный код](./updating-schema.md)).

Посмотреть, что именно уйдёт в npm, ничего не отправляя:

```sh
bun publish --dry-run
```

Команда соберёт пакет и покажет список файлов. В нём не должно быть ничего, кроме `dist/`, `package.json`
и `README.md`.

## Первая публикация

Версия в `package.json` уже `0.1.0`, поднимать её не нужно:

```sh
bun publish
```

## Следующие версии

```sh
bun run release:patch   # 0.1.0 → 0.1.1: исправления без изменения API
bun run release:minor   # 0.1.0 → 0.2.0: новые возможности, старый код продолжает работать
bun run release:major   # 0.1.0 → 1.0.0: несовместимые изменения
```

Скрипт поднимает версию в `package.json` и запускает `bun publish`. Git-тег и коммит он не создаёт,
поэтому после публикации:

```sh
git add package.json
git commit -m "chore: release v0.1.1"
git tag v0.1.1
git push origin HEAD --tags
```

Что считать несовместимым изменением: смену формы сгенерированного `schema.ts`, сигнатуры `createClient`
или методов клиента, формата результата `{ data, error, response }`, аргументов CLI.

## Что происходит при `bun publish`

1. `prepublishOnly`: `bun run typecheck && bun run build`. Если типы не сходятся или сборка падает,
   публикация не начнётся.
2. `tsdown` собирает `dist/`: клиент (`index.js`), генератор (`generator.js`), CLI (`bin.js`) и `.d.ts` к ним.
3. Пакет упаковывается и отправляется в npm с публичным доступом (`publishConfig.access: public`).

## Проверка после публикации

```sh
npm view @maninthecoat/openapi version
```

И в чистом каталоге:

```sh
bun add @maninthecoat/openapi
bunx openapi-cdd ./openapi.json -o ./schema.ts
```

## Если что-то пошло не так

| Проблема | Что делать |
| --- | --- |
| `missing authentication` | `bunx npm login` |
| `403 Forbidden` | нет прав на скоуп `@maninthecoat` — попросить владельца добавить в мейнтейнеры |
| `cannot publish over the previously published versions` | такая версия уже есть в npm; поднять версию (`release:*`) |
| `release:*` поднял версию, а публикация упала | версия в `package.json` уже новая: исправить причину и запустить просто `bun publish` |
| Опубликована сломанная версия | выпустить исправление через `release:patch`. Версию можно убрать (`npm unpublish @maninthecoat/openapi@x.y.z`) только в первые 72 часа, и тот же номер повторно занять нельзя |
