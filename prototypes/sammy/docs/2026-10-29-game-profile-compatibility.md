# Game profiles and checkout compatibility

The Sammy provider form and checkout support Peace Elite, Delta Force, Honor of Kings, and VALORANT China. These are field-format checks, not account ownership or identity verification.

`ProviderDraft.game` and older service snapshots may omit `game`. Readers interpret an omitted game as `peaceElite`. Existing drafts, imported records, and submitted application snapshots are not backfilled or rewritten. New provider forms explicitly start with Peace Elite; selecting another game records that selection in future saves and submissions.

Peace Elite, Delta Force, and Honor of Kings keep the existing QQ/WeChat server choices and 4–32 character ASCII game-ID format. VALORANT uses an explicit `china` server choice and a Unicode `Name#Tag` field, with an application limit of 80 characters. The format requires both parts and excludes control characters, extra separators, and tag whitespace. It does not claim to verify a real game account.

K/D is required and displayed for Peace Elite and Delta Force. It is hidden and may be blank for Honor of Kings and VALORANT. Other existing provider requirements and company review remain in place. Changing the selected game clears the editable game ID, server choice, and K/D; saved application snapshots stay independent of later profile edits.

Purchase snapshots retain the listing game. The API selects delivery validation from the locked listing record, so a caller cannot choose another game's validation rules. Order snapshots continue to preserve the purchased game and supplied delivery details. Existing persisted orders retain their original snapshots.

No database migration is needed for these JSON profile/delivery changes. This behavior has focused local API/domain coverage; it does not establish native device, hosted deployment, or real-provider acceptance.
