// CLI генератора: bun scripts/generate.ts <спека.json> -o <выход.d.ts>
// Про Apidog не знает: читает файл и пишет файл.
import { GenerateError, generate } from "../src/generator";

export function parseArgs(argv: string[]): { input: string; output: string } {
  const usage = "использование: bun scripts/generate.ts <спека.json> -o <выход.d.ts>";
  const flag = argv.indexOf("-o");
  const output = flag === -1 ? undefined : argv[flag + 1];
  const rest = argv.filter((_, i) => flag === -1 || (i !== flag && i !== flag + 1));
  const input = rest[0];
  if (!input || !output || rest.length !== 1) throw new Error(usage);
  return { input, output };
}

if (import.meta.main) {
  try {
    const { input, output } = parseArgs(process.argv.slice(2));
    const file = Bun.file(input);
    if (!(await file.exists())) throw new Error(`нет файла ${input}: сначала выгрузи спеку (bun run apidog)`);
    let spec: unknown;
    try {
      spec = JSON.parse(await file.text());
    } catch (error) {
      throw new Error(`${input} — не JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    await Bun.write(output, generate(spec));
    console.error(`generate: ${input} → ${output}`);
  } catch (error) {
    const message = error instanceof GenerateError || error instanceof Error ? error.message : String(error);
    console.error("generate:", message);
    process.exit(1);
  }
}
