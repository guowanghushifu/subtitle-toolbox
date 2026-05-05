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

const { preprocessSubtitleContent } = loadTsModule(path.join(repoRoot, "src/app/[locale]/local-subtitle-tools/localSubtitleUtils.ts"));

const defaultOptions = {
  removeRoundBracketSdh: true,
  removeSquareBracketSdh: true,
  removeCornerBracketSdh: true,
  removeBracketedSdhWithoutKeywordCheck: true,
  removeHesitationEllipses: true,
  removeInlineFormattingTags: true,
  removeSpeakerLabels: true,
  removeUppercaseSdh: true,
  removeRepeatedQuoteMarks: true,
  mergeSameTimestamps: true,
  mergeLinesWithinCue: true,
};

test("preprocessSubtitleContent removes fully uppercase lines even with punctuation", () => {
  const input = `10
00:00:31,400 --> 00:00:32,879
INDISTINCT RUSSIAN,
LAUGHTER

11
00:00:33,000 --> 00:00:34,000
RUN?
`;

  const result = preprocessSubtitleContent(input, defaultOptions);

  assert.ok(result, "expected preprocess result");
  assert.equal(result.content, "");
  assert.equal(result.stats.removedCueCount, 2);
  assert.deepEqual(
    result.logs.map((log) => log.text),
    ["INDISTINCT RUSSIAN,", "LAUGHTER", "RUN?"],
  );
});

test("preprocessSubtitleContent removes repeated outer quotes across consecutive cues", () => {
  const input = `1
00:00:04,000 --> 00:00:07,599
'You're running an op against
the chief of Russian intelligence

2
00:00:07,600 --> 00:00:08,639
'while he's on holiday,

3
00:00:08,640 --> 00:00:11,119
'which they would consider
highly provocative.

4
00:00:11,120 --> 00:00:13,239
'To justify an op like this,

5
00:00:13,240 --> 00:00:16,639
'Igor would have to be trading
top-grade insights with his son.

6
00:00:16,640 --> 00:00:18,119
'Who's your agent in there anyway?'

7
00:00:18,120 --> 00:00:20,519
'She's Mikhail Borodin's
Russian nanny.'

8
00:00:20,520 --> 00:00:21,880
200 hours of battery life.
`;

  const result = preprocessSubtitleContent(input, defaultOptions);

  assert.ok(result, "expected preprocess result");
  assert.equal(
    result.content,
    `1
00:00:04,000 --> 00:00:07,599
You're running an op against the chief of Russian intelligence

2
00:00:07,600 --> 00:00:08,639
while he's on holiday,

3
00:00:08,640 --> 00:00:11,119
which they would consider highly provocative.

4
00:00:11,120 --> 00:00:13,239
To justify an op like this,

5
00:00:13,240 --> 00:00:16,639
Igor would have to be trading top-grade insights with his son.

6
00:00:16,640 --> 00:00:18,119
Who's your agent in there anyway?

7
00:00:18,120 --> 00:00:20,519
She's Mikhail Borodin's Russian nanny.

8
00:00:20,520 --> 00:00:21,880
200 hours of battery life.`,
  );
});

test("preprocessSubtitleContent preserves isolated leading apostrophes", () => {
  const input = `1
00:00:01,000 --> 00:00:02,000
'90s music was everywhere.

2
00:00:03,000 --> 00:00:04,000
'cause I said so.
`;

  const result = preprocessSubtitleContent(input, defaultOptions);

  assert.ok(result, "expected preprocess result");
  assert.match(result.content, /'90s music was everywhere/);
  assert.match(result.content, /'cause I said so/);
});

test("preprocessSubtitleContent can keep repeated outer quotes when the option is disabled", () => {
  const input = `1
00:00:01,000 --> 00:00:02,000
'Hello

2
00:00:02,000 --> 00:00:03,000
'there.'
`;

  const result = preprocessSubtitleContent(input, { ...defaultOptions, removeRepeatedQuoteMarks: false });

  assert.ok(result, "expected preprocess result");
  assert.match(result.content, /'Hello/);
  assert.match(result.content, /'there\.'/);
});
