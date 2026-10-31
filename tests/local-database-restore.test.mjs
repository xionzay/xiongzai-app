import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { archiveSha256 } from "../scripts/backup-local-database.mjs";
import { validateBackupDirectory } from "../scripts/rehearse-local-database-restore.mjs";

test("restore accepts only owned backup paths and rejects archive/manifest symlinks", async () => {
  const base = fileURLToPath(new URL("../.local/backups/", import.meta.url));
  await mkdir(base, { recursive: true, mode: 0o700 });
  const fixture = await mkdtemp(join(base, "before-migration-unit-"));
  const linkFixture = await mkdtemp(join(base, "before-migration-unit-"));
  const outside = await mkdtemp("/private/tmp/xz-restore-unit-");
  try {
    await writeFile(join(fixture, "database.dump"), "", { mode: 0o600 });
    await writeFile(join(fixture, "manifest.json"), "{}", { mode: 0o600 });
    assert.equal(await validateBackupDirectory(fixture), fixture);
    assert.equal(await archiveSha256(join(fixture, "database.dump")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    await assert.rejects(validateBackupDirectory(outside), /RESTORE_BACKUP_DIRECTORY_INVALID/);
    await symlink(join(fixture, "database.dump"), join(linkFixture, "database.dump"));
    await assert.rejects(validateBackupDirectory(linkFixture), /RESTORE_BACKUP_ARCHIVE_SYMLINK_REJECTED/);
    await rm(join(linkFixture, "database.dump"));
    await writeFile(join(linkFixture, "database.dump"), "", { mode: 0o600 });
    await symlink(join(fixture, "manifest.json"), join(linkFixture, "manifest.json"));
    await assert.rejects(validateBackupDirectory(linkFixture), /RESTORE_BACKUP_MANIFEST_SYMLINK_REJECTED/);
  } finally {
    for (const directory of [fixture, linkFixture, outside]) await rm(directory, { recursive: true });
  }
});
