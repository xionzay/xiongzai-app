import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";

const packageDirectory = fileURLToPath(new URL(".", import.meta.url));
const fromWorkingDirectory = (path: string) => relative(process.cwd(), path);

export default defineConfig({
  dialect: "postgresql",
  schema: [
    fromWorkingDirectory(`${packageDirectory}src/enums.ts`),
    fromWorkingDirectory(`${packageDirectory}src/schema.ts`),
  ],
  out: fromWorkingDirectory(`${packageDirectory}migrations`),
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/xiongzai",
  },
  strict: true,
  verbose: true,
});
