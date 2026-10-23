import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual source contract, not a duplicated fixture of game/status rules.
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../packages/contracts/src/commerce.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
export const commerceContract = context.exports;
export const contractDependencies = { '../packages/contracts/src/commerce': commerceContract };
