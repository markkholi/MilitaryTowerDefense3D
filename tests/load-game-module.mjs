import fs from 'node:fs';
import ts from 'typescript';

// Transpile only the pure game modules; tests run in Node without a browser.
const output = new URL(`../outputs/test-modules-${process.pid}/`, import.meta.url);
fs.mkdirSync(output, { recursive: true });
const modules = ['game-data', 'unit-models', 'patriot-model', 'imported-gun-effects', 'abrams-model', 'anti-tank-model', 'machine-gun-model', 'missile-flight', 'battlefield-3d', 'battle-audio'];
const localImports = new RegExp(`from "\\./(${modules.join('|')})"`, 'g');
for (const name of modules) {
  const source = fs.readFileSync(new URL(`../app/${name}.ts`, import.meta.url), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  fs.writeFileSync(new URL(`${name}.mjs`, output), result.outputText.replace(localImports, 'from "./$1.mjs"'));
}
export const load = name => import(new URL(`${name}.mjs`, output).href);
