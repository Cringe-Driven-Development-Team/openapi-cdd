import { describe, expect, test } from "bun:test";
import { parseArgs } from "../scripts/generate";
import { GenerateError, generate } from "../src/generator";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text());
}

// Минимальная спека с одной операцией; kit подмешивает проверяемую конструкцию.
function spec(kit: { schema?: unknown; operation?: Record<string, unknown>; pathItem?: Record<string, unknown> } = {}) {
  return {
    openapi: "3.1.0",
    paths: {
      "/things/{id}": {
        ...kit.pathItem,
        get: {
          operationId: "getThing",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "204": { description: "ok" } },
          ...kit.operation,
        },
      },
    },
    components: { schemas: { Thing: kit.schema ?? { type: "string" } } },
  };
}

function failure(input: unknown): GenerateError {
  try {
    generate(input);
  } catch (error) {
    if (error instanceof GenerateError) return error;
    throw error;
  }
  throw new Error("генератор не упал");
}

describe("снапшоты", () => {
  // Оба .d.ts дополнительно проверяет tsc без skipLibCheck (tsconfig.schema.json).
  test("текущий контракт: закоммиченный schema.d.ts совпадает с выводом генератора", async () => {
    const output = generate(await readJson("spec/openapi.json"));
    expect(output).toBe(await Bun.file("src/api/schema.d.ts").text());
    expect(output).toContain('"/notebooks/{id}"');
  });

  test("синтетическая спека со всеми конструкциями совпадает со снапшотом", async () => {
    const output = generate(await readJson("tests/fixtures/full.json"));
    expect(output).toBe(await Bun.file("tests/fixtures/full.d.ts").text());
  });

  test("вывод детерминирован и начинается с пометки «не править руками»", async () => {
    const input = await readJson("tests/fixtures/full.json");
    const output = generate(input);
    expect(generate(structuredClone(input))).toBe(output);
    expect(output.split("\n")[0]).toMatch(/Не править руками/);
  });
});

describe("правила вывода", () => {
  const thing = (schema: unknown) => {
    const output = generate(spec({ schema }));
    return output.slice(output.indexOf("Thing: ") + "Thing: ".length, output.indexOf(";\n    };\n}\n\nexport interface operations"));
  };

  test("примитивы, format и null в type", () => {
    expect(thing({ type: "integer" })).toBe("number");
    expect(thing({ type: "string", format: "date-time" })).toBe("string");
    expect(thing({ type: ["string", "null"] })).toBe("string | null");
  });

  test("object без properties → Record<string, unknown>", () => {
    expect(thing({ type: "object" })).toBe("Record<string, unknown>");
    expect(thing({ type: "object", properties: {} })).toBe("Record<string, unknown>");
  });

  test("необязательное поле → ?, description → JSDoc, ключ-не-идентификатор в кавычках", () => {
    const type = thing({
      type: "object",
      properties: { id: { type: "string", description: "ID" }, "Set-Cookie": { type: "string" } },
      required: ["id"],
    });
    expect(type).toContain("/** ID */\n            id: string;");
    expect(type).toContain('"Set-Cookie"?: string;');
  });

  test("*/ в description не закрывает комментарий", () => {
    expect(generate(spec({ schema: { type: "string", description: "a */ b" } }))).toContain("/** a *\\/ b */");
  });

  test("enum и const → литералы с экранированием", () => {
    expect(thing({ enum: ['a"b', "c\nd", 1, null] })).toBe('"a\\"b" | "c\\nd" | 1 | null');
    expect(thing({ const: "x" })).toBe('"x"');
  });

  test("oneOf/anyOf → объединение, allOf → пересечение, комбинатор рядом с properties → (…) & {…}", () => {
    expect(thing({ oneOf: [{ type: "string" }, { type: "number" }] })).toBe("string | number");
    expect(thing({ allOf: [{ $ref: "#/components/schemas/Thing" }, { type: "object", additionalProperties: true }] })).toStartWith(
      'components["schemas"]["Thing"] & {',
    );
    expect(
      thing({ oneOf: [{ type: "string" }, { type: "number" }], properties: { a: { type: "string" } } }),
    ).toStartWith("(string | number) & {");
  });

  test("массив объединений берётся в скобки", () => {
    expect(thing({ type: "array", items: { type: ["string", "null"] } })).toBe("(string | null)[]");
  });

  test("properties + additionalProperties: индексная сигнатура включает типы свойств и undefined", () => {
    const type = thing({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
      additionalProperties: { type: "boolean" },
    });
    expect(type).toContain("[key: string]: boolean | string | number | undefined;");
  });

  test("параметры пути объединяются с параметрами операции, главнее операция; cookie необязательны", () => {
    const output = generate(
      spec({
        pathItem: {
          parameters: [
            { name: "lang", in: "query", schema: { type: "string" } },
            { name: "trace", in: "header", required: true, schema: { type: "string" } },
          ],
        },
        operation: {
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "lang", in: "query", required: true, schema: { type: "integer" } },
            { name: "sid", in: "cookie", required: true, schema: { type: "string" } },
          ],
        },
      }),
    );
    expect(output).toContain("query: {\n                lang: number;\n            };");
    expect(output).toContain("header: {\n                trace: string;\n            };");
    expect(output).toContain("cookie?: {\n                sid?: string;\n            };");
  });

  test("ответ без content → content?: never; requestBody без required → необязательный", () => {
    const output = generate(
      spec({
        operation: {
          requestBody: { content: { "application/json": { schema: { type: "string" } } } },
          responses: { "204": { description: "ok" } },
        },
      }),
    );
    expect(output).toContain("204: { content?: never };");
    expect(output).toContain('requestBody?: { content: { "application/json": string } };');
  });
});

describe("ошибки с JSON pointer", () => {
  const cases: [string, unknown, string][] = [
    ["не OAS 3.1", { openapi: "3.0.3", paths: {} }, "#/openapi"],
    ["неподдержанное ключевое слово", spec({ schema: { not: { type: "string" } } }), "#/components/schemas/Thing/not"],
    ["OAS 3.0 nullable", spec({ schema: { type: "string", nullable: true } }), "#/components/schemas/Thing/nullable"],
    ["неизвестный type", spec({ schema: { type: "file" } }), "#/components/schemas/Thing/type"],
    ["массив без items", spec({ schema: { type: "array" } }), "#/components/schemas/Thing"],
    ["объект в enum", spec({ schema: { enum: ["a", {}] } }), "#/components/schemas/Thing/enum/1"],
    ["внешний $ref", spec({ schema: { $ref: "other.json#/Thing" } }), "#/components/schemas/Thing/$ref"],
    ["$ref в никуда", spec({ schema: { $ref: "#/components/schemas/Nope" } }), "#/components/schemas/Thing/$ref"],
    [
      "вложенная схема",
      spec({ schema: { type: "object", properties: { a: { type: "array", items: { if: {} } } } } }),
      "#/components/schemas/Thing/properties/a/items/if",
    ],
    ["{id} без параметра in: path", spec({ operation: { parameters: [] } }), "#/paths/~1things~1{id}/get"],
    [
      "объект в query-параметре",
      spec({
        operation: {
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "filter", in: "query", schema: { type: "object" } },
          ],
        },
      }),
      "#/paths/~1things~1{id}/get/parameters/1/schema",
    ],
    [
      "объект в параметре через $ref",
      spec({
        schema: { type: "object", properties: { a: { type: "string" } } },
        operation: { parameters: [{ name: "id", in: "path", required: true, schema: { $ref: "#/components/schemas/Thing" } }] },
      }),
      "#/components/schemas/Thing",
    ],
    ["нет operationId", spec({ operation: { operationId: undefined } }), "#/paths/~1things~1{id}/get/operationId"],
    [
      "повтор operationId",
      spec({
        pathItem: {
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          post: { operationId: "getThing", responses: {} },
        },
      }),
      "#/paths/~1things~1{id}/get/operationId",
    ],
    ["метод head", spec({ pathItem: { head: {} } }), "#/paths/~1things~1{id}/head"],
    [
      "тело не application/json",
      spec({ operation: { requestBody: { content: { "multipart/form-data": {} } } } }),
      "#/paths/~1things~1{id}/get/requestBody/content",
    ],
    [
      "ответ не application/json",
      spec({ operation: { responses: { "200": { description: "", content: { "text/plain": {} } } } } }),
      "#/paths/~1things~1{id}/get/responses/200/content",
    ],
  ];

  for (const [name, input, pointer] of cases) {
    test(name, () => {
      const error = failure(input);
      expect(error.pointer).toBe(pointer);
      expect(error.message).toStartWith(`${pointer}: `);
    });
  }

  test("~ и / в ключах экранируются как ~0 и ~1", () => {
    const input = spec({ schema: { type: "object", properties: { "a/b~c": { not: {} } } } });
    expect(failure(input).pointer).toBe("#/components/schemas/Thing/properties/a~1b~0c/not");
  });
});

test("CLI: аргументы <вход> -o <выход> в любом порядке, иначе подсказка", () => {
  expect(parseArgs(["in.json", "-o", "out.d.ts"])).toEqual({ input: "in.json", output: "out.d.ts" });
  expect(parseArgs(["-o", "out.d.ts", "in.json"])).toEqual({ input: "in.json", output: "out.d.ts" });
  for (const bad of [[], ["in.json"], ["in.json", "-o"], ["a.json", "b.json", "-o", "out.d.ts"]]) {
    expect(() => parseArgs(bad)).toThrow(/использование/);
  }
});
