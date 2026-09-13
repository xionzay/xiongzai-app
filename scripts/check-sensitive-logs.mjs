import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";

const sourceRoots = ["apps/api/src", "apps/scheduler/src", "apps/worker/src"];
const prohibitedField = /^(?:authorization|cookie|password|totp(?:_secret)?|token|database_url|connection_string|access_key|secret_access_key|object_key|presigned_url|phone|mobile|legal_name|holder_name|account_token|file_binary|payload)$/iu;

export function scanLoggerSourceText(sourceText, fileName = "inline.ts") {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violations = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && isLoggerCall(node.expression)) {
      const fields = node.arguments[1];
      if (fields && ts.isObjectLiteralExpression(fields)) {
        for (const property of fields.properties) {
          const name = property.name && propertyName(property.name);
          if (name && prohibitedField.test(name)) violations.push({ file: fileName, field: name, line: source.getLineAndCharacterOfPosition(property.getStart(source)).line + 1 });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

export async function scanLoggerSources(root = process.cwd()) {
  const violations = [];
  let loggerCalls = 0;
  for (const relativeRoot of sourceRoots) {
    for (const file of await TypeScriptFiles(resolve(root, relativeRoot))) {
      const source = await readFile(file, "utf8");
      loggerCalls += (source.match(/\.\s*(?:debug|info|warn|error)\s*\(/gu) ?? []).length;
      violations.push(...scanLoggerSourceText(source, file));
    }
  }
  return { loggerCalls, violations };
}

async function TypeScriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await TypeScriptFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(target);
  }
  return files;
}

function isLoggerCall(expression) {
  return ts.isPropertyAccessExpression(expression) && ["debug", "info", "warn", "error"].includes(expression.name.text);
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

async function main() {
  const report = await scanLoggerSources();
  process.stdout.write(`${JSON.stringify({ logger_calls_scanned: report.loggerCalls, sensitive_log_fields: report.violations.length })}\n`);
  if (report.violations.length) {
    for (const violation of report.violations) process.stderr.write(`敏感日志字段：${violation.file}:${violation.line} ${violation.field}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => { process.stderr.write("敏感日志扫描失败\n"); process.exitCode = 1; });
}
