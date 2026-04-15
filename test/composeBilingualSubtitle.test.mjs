import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repoRoot = process.cwd();
const moduleCache = new Map();

const resolveModulePath = (specifier, fromFile) => {
  if (specifier === "@/app/utils") {
    return path.join(repoRoot, "src/app/utils/textUtils.ts");
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const basePath = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, path.join(basePath, "index.ts")];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error(`Unsupported module specifier: ${specifier} from ${fromFile}`);
};

const loadTsModule = (modulePath) => {
  const normalizedPath = path.normalize(modulePath);
  if (moduleCache.has(normalizedPath)) {
    return moduleCache.get(normalizedPath);
  }

  const source = fs.readFileSync(normalizedPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: normalizedPath,
  });

  const loadedModule = { exports: {} };
  moduleCache.set(normalizedPath, loadedModule.exports);

  const localRequire = (specifier) => {
    const resolvedPath = resolveModulePath(specifier, normalizedPath);
    return loadTsModule(resolvedPath);
  };

  const wrapped = new Function("exports", "require", "module", "__filename", "__dirname", transpiled.outputText);
  wrapped(loadedModule.exports, localRequire, loadedModule, normalizedPath, path.dirname(normalizedPath));
  moduleCache.set(normalizedPath, loadedModule.exports);
  return loadedModule.exports;
};

const { composeBilingualSubtitle } = loadTsModule(path.join(repoRoot, "src/app/[locale]/local-subtitle-tools/localSubtitleUtils.ts"));

test("composeBilingualSubtitle matches identical short cues below absolute overlap threshold", () => {
  const original = `1
00:00:01,000 --> 00:00:01,200
Hello?
`;
  const translated = `1
00:00:01,000 --> 00:00:01,200
喂?
`;

  const result = composeBilingualSubtitle(original, translated, { outputFormat: "srt" });

  assert.ok(result, "expected bilingual compose result");
  assert.equal(result.logs.length, 0);
  assert.equal(result.translatedOnlyCount, 0);
  assert.equal(result.originalOnlyCount, 0);
  assert.equal(result.matchedCount, 1);
  assert.match(result.content, /喂\?\nHello\?/);
});

test("composeBilingualSubtitle does not report unmatched cues for the aligned Project Hail Mary samples", () => {
  const original = fs.readFileSync(path.join(repoRoot, "test/Project.Hail.Mary.2026.eng.srt"), "utf8");
  const translated = fs.readFileSync(path.join(repoRoot, "test/Project.Hail.Mary.2026.zho.srt"), "utf8");

  const result = composeBilingualSubtitle(original, translated, { outputFormat: "srt" });

  assert.ok(result, "expected bilingual compose result");
  assert.equal(result.logs.length, 0);
  assert.equal(result.translatedOnlyCount, 0);
  assert.equal(result.originalOnlyCount, 0);
});
