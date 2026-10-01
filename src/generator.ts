// Генератор типов из OpenAPI 3.1: принимает разобранный JSON спеки, возвращает текст файла
// с интерфейсами paths, components и operations. Собирает вывод строками, без компилятора TypeScript.
// Про Apidog не знает. Неподдержанная конструкция — GenerateError с JSON pointer, а не молчаливый unknown.

const INDENT = "    ";
const HEADER = "// Сгенерировано из OpenAPI-спецификации. Не править руками.\n";
const JSON_MEDIA = "application/json";
const METHODS = ["get", "put", "post", "delete", "patch"];
const OTHER_METHODS = ["options", "head", "trace"];
const PARAM_PLACES = ["path", "query", "header", "cookie"] as const;
const SCHEMA_REF = "#/components/schemas/";

// Ключевые слова схемы, которые на тип не влияют: аннотации и проверки значений.
const IGNORED_KEYWORDS = new Set([
  "format", "description", "title", "default", "example", "examples", "deprecated", "readOnly", "writeOnly",
  "minLength", "maxLength", "pattern", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties", "externalDocs", "xml", "discriminator",
]);
const TYPE_KEYWORDS = new Set([
  "$ref", "type", "properties", "required", "items", "enum", "const", "oneOf", "anyOf", "allOf", "additionalProperties",
]);

type Dict = Record<string, unknown>;
type ParamPlace = (typeof PARAM_PLACES)[number];

export class GenerateError extends Error {
  constructor(
    readonly pointer: string,
    reason: string,
  ) {
    super(`${pointer}: ${reason}`);
    this.name = "GenerateError";
  }
}

function at(base: string, ...tokens: (string | number)[]): string {
  return tokens.reduce<string>((acc, token) => `${acc}/${String(token).replace(/~/g, "~0").replace(/\//g, "~1")}`, base);
}

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dict(value: unknown, pointer: string): Dict {
  if (!isDict(value)) throw new GenerateError(pointer, "ожидался объект");
  return value;
}

function list(value: unknown, pointer: string): unknown[] {
  if (!Array.isArray(value)) throw new GenerateError(pointer, "ожидался массив");
  return value;
}

// Тип вместе с приоритетом верхней операции — чтобы ставить скобки только там, где они нужны.
const UNION = 0;
const INTERSECTION = 1;
const ATOM = 2;
interface Ty {
  code: string;
  prec: typeof UNION | typeof INTERSECTION | typeof ATOM;
}

const atom = (code: string): Ty => ({ code, prec: ATOM });
const wrap = (ty: Ty, min: Ty["prec"]): string => (ty.prec < min ? `(${ty.code})` : ty.code);

function union(parts: Ty[]): Ty {
  const unique = parts.filter((part, i) => parts.findIndex((other) => other.code === part.code) === i);
  if (unique.length === 1) return unique[0]!;
  return { code: unique.map((part) => part.code).join(" | "), prec: UNION };
}

function intersection(parts: Ty[]): Ty {
  if (parts.length === 1) return parts[0]!;
  return { code: parts.map((part) => wrap(part, INTERSECTION)).join(" & "), prec: INTERSECTION };
}

function key(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) || /^(0|[1-9]\d*)$/.test(name) ? name : JSON.stringify(name);
}

function jsdoc(description: unknown, pad: string): string {
  if (typeof description !== "string" || description.trim() === "") return "";
  const lines = description.replace(/\*\//g, "*\\/").trim().split(/\r?\n/);
  if (lines.length === 1) return `${pad}/** ${lines[0]} */\n`;
  return `${pad}/**\n${lines.map((line) => `${pad} * ${line}`.trimEnd()).join("\n")}\n${pad} */\n`;
}

interface Member {
  name: string;
  optional: boolean;
  type: string;
  description?: unknown;
}

// Многострочный объектный тип; level — уровень отступа строки, на которой стоит открывающая скобка.
function objectCode(members: Member[], level: number, indexType?: string): string {
  if (members.length === 0 && indexType === undefined) return "{}";
  const pad = INDENT.repeat(level + 1);
  const lines = members.map(
    (m) => `${jsdoc(m.description, pad)}${pad}${key(m.name)}${m.optional ? "?" : ""}: ${m.type};\n`,
  );
  if (indexType !== undefined) lines.push(`${pad}[key: string]: ${indexType};\n`);
  return `{\n${lines.join("")}${INDENT.repeat(level)}}`;
}

class Generator {
  private readonly schemas: Dict;
  private readonly components: Dict;

  constructor(private readonly spec: Dict) {
    this.components = spec.components === undefined ? {} : dict(spec.components, "#/components");
    this.schemas =
      this.components.schemas === undefined ? {} : dict(this.components.schemas, "#/components/schemas");
  }

  run(): string {
    const operations: string[] = [];
    const paths = this.paths(operations);
    const pad = INDENT.repeat(2);
    const schemas = Object.entries(this.schemas).map(([name, schema]) => {
      const pointer = at("#/components/schemas", name);
      const description = isDict(schema) ? schema.description : undefined;
      return `${jsdoc(description, pad)}${pad}${key(name)}: ${this.schema(schema, pointer, 2).code};\n`;
    });
    const schemasBlock = schemas.length === 0 ? "{}" : `{\n${schemas.join("")}${INDENT}}`;
    return (
      `${HEADER}\n` +
      `export interface paths ${paths}\n\n` +
      `export interface components {\n${INDENT}schemas: ${schemasBlock};\n}\n\n` +
      `export interface operations ${operations.length === 0 ? "{}" : `{\n${operations.join("")}}`}\n`
    );
  }

  private paths(operations: string[]): string {
    if (this.spec.paths === undefined) return "{}";
    const seen = new Map<string, string>();
    const entries: string[] = [];
    for (const [template, rawItem] of Object.entries(dict(this.spec.paths, "#/paths"))) {
      if (template.startsWith("x-")) continue;
      const pointer = at("#/paths", template);
      const item = dict(rawItem, pointer);
      if ("$ref" in item) throw new GenerateError(at(pointer, "$ref"), "$ref у пути не поддержан");
      for (const method of OTHER_METHODS) {
        if (method in item) throw new GenerateError(at(pointer, method), `метод ${method} не поддержан`);
      }
      const shared = item.parameters === undefined ? [] : list(item.parameters, at(pointer, "parameters"));
      const methods: Member[] = [];
      for (const method of Object.keys(item).filter((name) => METHODS.includes(name))) {
        const opPointer = at(pointer, method);
        const operation = dict(item[method], opPointer);
        const id = operation.operationId;
        if (typeof id !== "string" || id === "") {
          throw new GenerateError(at(opPointer, "operationId"), "у операции нет operationId");
        }
        const previous = seen.get(id);
        if (previous) throw new GenerateError(at(opPointer, "operationId"), `operationId «${id}» уже занят: ${previous}`);
        seen.set(id, opPointer);
        const description = operation.summary || operation.description;
        operations.push(
          `${jsdoc(description, INDENT)}${INDENT}${key(id)}: ` +
            `${this.operation(operation, opPointer, template, shared, at(pointer, "parameters"))};\n`,
        );
        methods.push({ name: method, optional: false, type: `operations[${JSON.stringify(id)}]` });
      }
      entries.push(`${INDENT}${JSON.stringify(template)}: ${objectCode(methods, 1)};\n`);
    }
    return entries.length === 0 ? "{}" : `{\n${entries.join("")}}`;
  }

  private operation(operation: Dict, pointer: string, template: string, shared: unknown[], sharedPointer: string): string {
    const members: Member[] = [
      { name: "parameters", optional: false, type: this.parameters(operation, pointer, template, shared, sharedPointer) },
    ];
    if (operation.requestBody !== undefined) {
      const bodyPointer = at(pointer, "requestBody");
      const body = this.resolve(operation.requestBody, bodyPointer, "requestBodies");
      const content = dict(body.value.content, at(body.pointer, "content"));
      if (!(JSON_MEDIA in content)) {
        throw new GenerateError(at(body.pointer, "content"), `поддержано только тело ${JSON_MEDIA}`);
      }
      members.push({
        name: "requestBody",
        optional: body.value.required !== true,
        type: this.content(content, at(body.pointer, "content"), 2),
      });
    }
    const responsesPointer = at(pointer, "responses");
    const responses = Object.entries(dict(operation.responses, responsesPointer)).map(([status, raw]): Member => {
      const response = this.resolve(raw, at(responsesPointer, status), "responses");
      const content = response.value.content;
      const contentPointer = at(response.pointer, "content");
      if (content === undefined || Object.keys(dict(content, contentPointer)).length === 0) {
        return { name: status, optional: false, type: "{ content?: never }" };
      }
      if (!(JSON_MEDIA in dict(content, contentPointer))) {
        throw new GenerateError(contentPointer, `поддержан только ответ ${JSON_MEDIA}`);
      }
      return { name: status, optional: false, type: this.content(dict(content, contentPointer), contentPointer, 3) };
    });
    members.push({ name: "responses", optional: false, type: objectCode(responses, 2) });
    return objectCode(members, 1);
  }

  // { content: { "application/json": T } } — одной строкой, если T умещается в строку.
  private content(content: Dict, pointer: string, level: number): string {
    const mediaPointer = at(pointer, JSON_MEDIA);
    const media = dict(content[JSON_MEDIA], mediaPointer);
    const type = media.schema === undefined ? "unknown" : this.schema(media.schema, at(mediaPointer, "schema"), level + 2).code;
    if (!type.includes("\n")) return `{ content: { ${JSON.stringify(JSON_MEDIA)}: ${type} } }`;
    return objectCode([{ name: "content", optional: false, type: objectCode([{ name: JSON_MEDIA, optional: false, type }], level + 1) }], level);
  }

  private parameters(operation: Dict, pointer: string, template: string, shared: unknown[], sharedPointer: string): string {
    // Параметры уровня пути объединяются с параметрами операции; при совпадении name + in главнее операция.
    const merged = new Map<string, { param: Dict; pointer: string }>();
    const own = operation.parameters === undefined ? [] : list(operation.parameters, at(pointer, "parameters"));
    const sources: [unknown[], string][] = [
      [shared, sharedPointer],
      [own, at(pointer, "parameters")],
    ];
    for (const [params, base] of sources) {
      params.forEach((raw, i) => {
        const resolved = this.resolve(raw, at(base, i), "parameters");
        const { name, in: place } = resolved.value;
        if (typeof name !== "string") throw new GenerateError(at(resolved.pointer, "name"), "у параметра нет name");
        if (!PARAM_PLACES.includes(place as ParamPlace)) {
          throw new GenerateError(at(resolved.pointer, "in"), `неизвестное место параметра «${String(place)}»`);
        }
        merged.set(`${String(place)}:${name}`, { param: resolved.value, pointer: resolved.pointer });
      });
    }

    for (const match of template.matchAll(/\{([^}]+)\}/g)) {
      if (!merged.has(`path:${match[1]}`)) {
        throw new GenerateError(pointer, `в пути ${template} есть {${match[1]}}, но нет параметра in: path с таким именем`);
      }
    }

    const groups: Member[] = [];
    for (const place of PARAM_PLACES) {
      const members: Member[] = [];
      for (const { param, pointer: paramPointer } of merged.values()) {
        if (param.in !== place) continue;
        if (param.schema === undefined) {
          throw new GenerateError(paramPointer, "у параметра нет schema (content не поддержан)");
        }
        const schemaPointer = at(paramPointer, "schema");
        // Cookie шлёт сам браузер, клиент их не сериализует — поэтому любые типы и всегда необязательны.
        if (place !== "cookie") this.assertPrimitive(param.schema, schemaPointer, true);
        members.push({
          name: param.name as string,
          optional: place === "cookie" || (place !== "path" && param.required !== true),
          type: this.schema(param.schema, schemaPointer, 3).code,
          description: param.description,
        });
      }
      if (members.length > 0) {
        groups.push({ name: place, optional: members.every((m) => m.optional), type: objectCode(members, 3) });
      }
    }
    return objectCode(groups, 2);
  }

  // Параметры path, query и header — только примитивы, enum/const и массивы примитивов.
  private assertPrimitive(raw: unknown, pointer: string, allowArray: boolean): void {
    const schema = dict(raw, pointer);
    if (typeof schema.$ref === "string") {
      const target = this.refTarget(schema.$ref, at(pointer, "$ref"));
      return this.assertPrimitive(this.schemas[target], at("#/components/schemas", target), allowArray);
    }
    for (const combinator of ["oneOf", "anyOf", "allOf"]) {
      if (schema[combinator] === undefined) continue;
      list(schema[combinator], at(pointer, combinator)).forEach((member, i) =>
        this.assertPrimitive(member, at(pointer, combinator, i), allowArray),
      );
    }
    const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
    if (types.includes("object") || "properties" in schema || "additionalProperties" in schema) {
      throw new GenerateError(pointer, "объект в параметре не поддержан");
    }
    if (types.includes("array") || "items" in schema) {
      if (!allowArray) throw new GenerateError(pointer, "вложенный массив в параметре не поддержан");
      if (schema.items === undefined) throw new GenerateError(pointer, "у массива нет items");
      this.assertPrimitive(schema.items, at(pointer, "items"), false);
    }
  }

  // $ref на компонент не-схему (#/components/<section>/X) подставляется на месте.
  private resolve(raw: unknown, pointer: string, section: string): { value: Dict; pointer: string } {
    const value = dict(raw, pointer);
    if (value.$ref === undefined) return { value, pointer };
    const prefix = `#/components/${section}/`;
    const ref = value.$ref;
    const refPointer = at(pointer, "$ref");
    if (typeof ref !== "string" || !ref.startsWith(prefix)) {
      throw new GenerateError(refPointer, `поддержан только $ref на ${prefix}…`);
    }
    const name = ref.slice(prefix.length).replace(/~1/g, "/").replace(/~0/g, "~");
    const group = this.components[section];
    if (!isDict(group) || !(name in group)) throw new GenerateError(refPointer, `${ref} не найден`);
    const target = at(`#/components/${section}`, name);
    const resolved = dict(group[name], target);
    if ("$ref" in resolved) throw new GenerateError(at(target, "$ref"), "цепочка $ref не поддержана");
    return { value: resolved, pointer: target };
  }

  private refTarget(ref: string, pointer: string): string {
    if (!ref.startsWith(SCHEMA_REF)) throw new GenerateError(pointer, `поддержан только $ref на ${SCHEMA_REF}…`);
    const name = ref.slice(SCHEMA_REF.length).replace(/~1/g, "/").replace(/~0/g, "~");
    if (!(name in this.schemas)) throw new GenerateError(pointer, `${ref} не найден`);
    return name;
  }

  private literal(value: unknown, pointer: string): Ty {
    if (value === null || typeof value === "string" || typeof value === "boolean") return atom(JSON.stringify(value));
    if (typeof value === "number") return atom(String(value));
    throw new GenerateError(pointer, "в enum и const поддержаны только строки, числа, boolean и null");
  }

  private schema(raw: unknown, pointer: string, level: number): Ty {
    if (typeof raw === "boolean") throw new GenerateError(pointer, "булева схема не поддержана");
    const schema = dict(raw, pointer);
    for (const keyword of Object.keys(schema)) {
      if (TYPE_KEYWORDS.has(keyword) || IGNORED_KEYWORDS.has(keyword) || keyword.startsWith("x-")) continue;
      throw new GenerateError(at(pointer, keyword), `ключевое слово «${keyword}» не поддержано`);
    }

    if (schema.$ref !== undefined) {
      if (typeof schema.$ref !== "string") throw new GenerateError(at(pointer, "$ref"), "ожидалась строка");
      const extra = Object.keys(schema).find((keyword) => keyword !== "$ref" && TYPE_KEYWORDS.has(keyword));
      if (extra) throw new GenerateError(at(pointer, extra), "ключевое слово рядом с $ref не поддержано");
      const name = this.refTarget(schema.$ref, at(pointer, "$ref"));
      return atom(`components["schemas"][${JSON.stringify(name)}]`);
    }

    const parts: Ty[] = [];
    for (const combinator of ["oneOf", "anyOf", "allOf"] as const) {
      if (schema[combinator] === undefined) continue;
      const members = list(schema[combinator], at(pointer, combinator)).map((member, i) =>
        this.schema(member, at(pointer, combinator, i), level),
      );
      if (members.length === 0) throw new GenerateError(at(pointer, combinator), `пустой ${combinator}`);
      parts.push(combinator === "allOf" ? intersection(members) : union(members));
    }

    const base = this.base(schema, pointer, level, parts.length > 0);
    if (base) parts.push(base);
    // Схема без единого типового ключевого слова допускает любое значение.
    return parts.length === 0 ? atom("unknown") : intersection(parts);
  }

  // Часть типа, заданная самой схемой (без комбинаторов): const, enum или type.
  private base(schema: Dict, pointer: string, level: number, combined: boolean): Ty | undefined {
    if ("const" in schema) return this.literal(schema.const, at(pointer, "const"));
    if (schema.enum !== undefined) {
      const values = list(schema.enum, at(pointer, "enum"));
      if (values.length === 0) throw new GenerateError(at(pointer, "enum"), "пустой enum");
      return union(values.map((value, i) => this.literal(value, at(pointer, "enum", i))));
    }

    const shaped = "properties" in schema || "additionalProperties" in schema || "required" in schema;
    let types: unknown[];
    if (schema.type !== undefined) types = Array.isArray(schema.type) ? schema.type : [schema.type];
    else if (shaped) types = ["object"];
    else if ("items" in schema) types = ["array"];
    else return undefined;
    if (types.length === 0) throw new GenerateError(at(pointer, "type"), "пустой type");

    const members: Ty[] = [];
    for (const type of types) {
      if (type === "string" || type === "boolean" || type === "null") members.push(atom(type));
      else if (type === "number" || type === "integer") members.push(atom("number"));
      else if (type === "array") {
        if (schema.items === undefined) throw new GenerateError(pointer, "у массива нет items");
        members.push(atom(`${wrap(this.schema(schema.items, at(pointer, "items"), level), ATOM)}[]`));
      } else if (type === "object") {
        // «type: object» рядом с комбинатором и без своих свойств ничего к типу не добавляет.
        const bare = !this.hasProperties(schema, pointer) && schema.additionalProperties === undefined;
        if (!(combined && bare)) members.push(this.object(schema, pointer, level));
      } else throw new GenerateError(at(pointer, "type"), `тип «${String(type)}» не поддержан`);
    }
    return members.length === 0 ? undefined : union(members);
  }

  private hasProperties(schema: Dict, pointer: string): boolean {
    return schema.properties !== undefined && Object.keys(dict(schema.properties, at(pointer, "properties"))).length > 0;
  }

  private object(schema: Dict, pointer: string, level: number): Ty {
    const propsPointer = at(pointer, "properties");
    const properties = schema.properties === undefined ? {} : dict(schema.properties, propsPointer);
    const required = schema.required === undefined ? [] : list(schema.required, at(pointer, "required"));
    const additional = schema.additionalProperties;

    const types: Ty[] = [];
    const members = Object.entries(properties).map(([name, property]): Member => {
      const type = this.schema(property, at(propsPointer, name), level + 1);
      types.push(type);
      return {
        name,
        optional: !required.includes(name),
        type: type.code,
        description: isDict(property) ? property.description : undefined,
      };
    });

    if (additional === undefined || additional === false) {
      if (members.length > 0) return atom(objectCode(members, level));
      return atom(additional === false ? "Record<string, never>" : "Record<string, unknown>");
    }
    const extra =
      additional === true ? atom("unknown") : this.schema(additional, at(pointer, "additionalProperties"), level + 1);
    // Индексная сигнатура обязана покрывать типы всех объявленных свойств (и undefined у необязательных).
    const index = [extra, ...types];
    if (members.some((m) => m.optional)) index.push(atom("undefined"));
    return atom(objectCode(members, level, union(index).code));
  }
}

export function generate(spec: unknown): string {
  const root = dict(spec, "#");
  if (typeof root.openapi !== "string" || !root.openapi.startsWith("3.1.")) {
    throw new GenerateError("#/openapi", `поддержан только OpenAPI 3.1, получено «${String(root.openapi)}»`);
  }
  return new Generator(root).run();
}
