import fs from 'node:fs';
import ts from 'typescript';

// Transpile only the pure game modules; tests run in Node without a browser.
const output = new URL(`../outputs/test-modules-${process.pid}/`, import.meta.url);
fs.mkdirSync(output, { recursive: true });
for (const name of ['game-data', 'unit-models', 'battlefield-3d', 'battle-audio']) {
  const source = fs.readFileSync(new URL(`../app/${name}.ts`, import.meta.url), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  fs.writeFileSync(new URL(`${name}.mjs`, output), result.outputText.replace(/from "\.\/(game-data|unit-models)"/g, 'from "./$1.mjs"'));
}
export const load = name => import(new URL(`${name}.mjs`, output).href);
