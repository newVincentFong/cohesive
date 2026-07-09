import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const NEEDLE = "NEEDLE_SECRET_TOKEN=eval-needle-42";

export interface HaystackOptions {
  outputDir: string;
  largeFileLines?: number;
  moduleCount?: number;
}

function fillerLine(index: number): string {
  return `// filler line ${index}: ${"x".repeat(80)}`;
}

export async function generateHaystackFixture(options: HaystackOptions): Promise<void> {
  const largeFileLines = options.largeFileLines ?? 2500;
  const moduleCount = options.moduleCount ?? 12;
  const srcDir = join(options.outputDir, "src");
  const modulesDir = join(srcDir, "modules");

  await mkdir(modulesDir, { recursive: true });

  const largeLines: string[] = [
    "// Auto-generated haystack file for long-context eval cases.",
    "export const HAYSTACK_VERSION = '1.0.0';",
    "",
  ];

  const needleLine = Math.floor(largeFileLines * 0.82);
  for (let index = 0; index < largeFileLines; index += 1) {
    if (index === needleLine) {
      largeLines.push(`export const ${NEEDLE};`);
    } else {
      largeLines.push(fillerLine(index));
    }
  }

  await writeFile(join(srcDir, "haystack.ts"), `${largeLines.join("\n")}\n`, "utf8");

  for (let index = 0; index < moduleCount; index += 1) {
    const fileName = `module-${String(index + 1).padStart(2, "0")}`;
    const identifier = `module${String(index + 1).padStart(2, "0")}`;
    await writeFile(
      join(modulesDir, `${fileName}.ts`),
      [
        `export function ${identifier}Value(): number {`,
        `  return ${index + 1};`,
        "}",
        "",
        `export const ${identifier}Label = "${fileName}";`,
        "",
      ].join("\n"),
      "utf8",
    );
  }

  await writeFile(
    join(srcDir, "index.ts"),
    [
      "import { HAYSTACK_VERSION } from './haystack.js';",
      ...Array.from({ length: moduleCount }, (_, index) => {
        const fileName = `module-${String(index + 1).padStart(2, "0")}`;
        const identifier = `module${String(index + 1).padStart(2, "0")}`;
        return `import { ${identifier}Value } from './modules/${fileName}.js';`;
      }),
      "",
      "export function describeHaystack(): string {",
      `  return \`haystack \${HAYSTACK_VERSION} modules=\${${Array.from({ length: moduleCount }, (_, index) => `module${String(index + 1).padStart(2, "0")}Value()`).join(" + ")}}\`;`,
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    join(options.outputDir, "package.json"),
    JSON.stringify(
      {
        name: "haystack-fixture",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function generateHaystackIntoFixtures(): Promise<string> {
  const outputDir = join(process.cwd(), "evals", "fixtures", "haystack");
  await generateHaystackFixture({ outputDir });
  return outputDir;
}

export { NEEDLE };
