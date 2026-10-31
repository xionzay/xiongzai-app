import { readFile } from "node:fs/promises";

// Upgrade only the caller's isolated schema, never public/development data.
export async function applyStageOneMigrations(client, schemaName) {
  if (!/^xiongzai_[a-z0-9_]+$/u.test(schemaName)) throw new Error("Isolated test schema required");
  const result = await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='orders' AND column_name='rule_version'", [schemaName]);
  const names = [...(result.rowCount ? [] : ["0010_order_rule_version.sql"]), "0012_tan_dark_beast.sql", "0013_dapper_ultimatum.sql", "0014_brave_fixer.sql", "0016_chat_private_media.sql", "0017_supreme_blindfold.sql", "0018_rainy_solo.sql", "0019_bright_orphan.sql", "0020_orange_smasher.sql"];
  for (const name of names) {
    const source = (await readFile(new URL(`../../../packages/database/migrations/${name}`, import.meta.url), "utf8")).replaceAll('"public".', `"${schemaName}".`);
    for (const statement of source.split("--> statement-breakpoint").map(value=>value.trim()).filter(Boolean)) await client.query(statement);
  }
}
