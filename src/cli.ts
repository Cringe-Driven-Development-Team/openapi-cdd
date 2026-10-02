// CLI генератора: <пакет> <спека.json> -o <выход.ts>
// Про Apidog не знает: читает файл и пишет файл. Работает в node и bun.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generate } from "./generator";

export const USAGE = "использование: openapi-cdd <спека.json> -o <выход.ts>";

export function parseArgs(argv: string[]): { input: string; output: string } {
  const flag = argv.indexOf("-o");
  const output = flag === -1 ? undefined : argv[flag + 1];
  const rest = argv.filter((_, i) => flag === -1 || (i !== flag && i !== flag + 1));
  const input = rest[0];
  if (!input || !output || rest.length !== 1) throw new Error(USAGE);
  return { input, output };
}

// Возвращает код выхода; сообщения пишет в stderr.
export function run(argv: string[]): number {
  try {
    const { input, output } = parseArgs(argv);
    let text: string;
    try {
      text = readFileSync(input, "utf8");
    } catch {
      throw new Error(`не удалось прочитать ${input}`);
    }
    let spec: unknown;
    try {
      spec = JSON.parse(text);
    } catch (error) {
      throw new Error(`${input} — не JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = generate(spec);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, result);
    console.error(`generate: ${input} → ${output}`);
    return 0;
  } catch (error) {
    console.error("generate:", error instanceof Error ? error.message : String(error));
    return 1;
  }
}
