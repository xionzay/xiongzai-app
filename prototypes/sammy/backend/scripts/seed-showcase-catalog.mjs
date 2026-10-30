import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { showcaseBio, showcaseProviders } from './showcase-catalog-data.mjs';

const namespace = 'xiongzai-sammy-showcase-catalog-v1';
const legacyNames = { 'peace-elite':'Xiongzai Showcase · PE', 'delta-force':'Xiongzai Showcase · DF', 'honor-of-kings':'Xiongzai Showcase · HoK', valorant:'Xiongzai Showcase · VAL' };

function stableUuid(key) {
  const bytes = createHash('sha256').update(`${namespace}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function unusableAccountPasswordHash() {
  const salt = randomBytes(16).toString('hex');
  const password = randomBytes(32);
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function assertSame(actual, expected, description) {
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(value)) {
      throw new Error(`Showcase seed conflict at ${description}.${key}; refusing to change existing data.`);
    }
  }
}

/** Add an idempotent, clearly labeled example catalog. Intended for the dedicated demo database only. */
export async function seedShowcaseCatalog(pool) {
  let insertedProviders = 0;
  let updatedProviders = 0;
  let insertedListings = 0;
  const listingIds = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const provider of showcaseProviders) {
      const userId = stableUuid(`provider:${provider.key}`);
      const profileDraft = {
        game: provider.game,
        gameName: provider.gameName,
        gameId: provider.gameId,
        server: provider.server,
        rank: provider.rank,
        kd: provider.kd,
        experience: 'Xiongzai catalog example; no independent provider is represented.',
        playStyle: provider.playStyle,
        mode: provider.mode,
        voiceMediaId: null,
      };
      // Upgrade only untouched names from the original curated seed. Never rename a real or edited profile.
      const renamed = await client.query(
        'UPDATE users SET nickname=$1 WHERE id=$2 AND is_showcase=true AND nickname=$3 AND bio=$4',
        [provider.nickname, userId, legacyNames[provider.key], showcaseBio],
      );
      updatedProviders += renamed.rowCount ?? 0;
      const userInsert = await client.query(
        `INSERT INTO users(id,phone,password_hash,nickname,bio,draft,is_showcase)
         VALUES($1,$2,$3,$4,$5,$6::jsonb,true) ON CONFLICT(id) DO NOTHING RETURNING id`,
        [userId, provider.phone, unusableAccountPasswordHash(), provider.nickname, showcaseBio, JSON.stringify(profileDraft)],
      );
      insertedProviders += userInsert.rowCount ?? 0;
      const user = await client.query('SELECT phone,nickname,bio,is_showcase FROM users WHERE id=$1', [userId]);
      if (!user.rows[0]) throw new Error(`Showcase provider ${provider.key} was not created.`);
      assertSame(user.rows[0], { phone: provider.phone, nickname: provider.nickname, bio: showcaseBio, is_showcase: true }, `provider:${provider.key}`);

      for (const item of provider.listings) {
        const listingId = stableUuid(`listing:${item.key}`);
        listingIds.push(listingId);
        const listingInsert = await client.query(
          `INSERT INTO listings(
             id,owner_id,title,description,game,service_type,mode,category,price_fen,photo_media_ids,
             status,revision,review_status,review_reason,application_id,publication_consent_at,is_showcase
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]'::jsonb,'published',1,'draft',
             'Showcase listing; no independent provider is represented.',NULL,NULL,true)
           ON CONFLICT(id) DO NOTHING RETURNING id`,
          [listingId, userId, item.title, item.description, provider.game, item.serviceType, item.mode, item.category, item.priceFen],
        );
        insertedListings += listingInsert.rowCount ?? 0;
        const listing = await client.query(
          'SELECT owner_id,title,description,game,service_type,mode,category,price_fen,status,review_status,application_id,publication_consent_at,is_showcase,photo_media_ids FROM listings WHERE id=$1',
          [listingId],
        );
        if (!listing.rows[0]) throw new Error(`Showcase listing ${item.key} was not created.`);
        assertSame(listing.rows[0], {
          owner_id: userId,
          title: item.title,
          description: item.description,
          game: provider.game,
          service_type: item.serviceType,
          mode: item.mode,
          category: item.category,
          price_fen: item.priceFen,
          status: 'published',
          review_status: 'draft',
          application_id: null,
          publication_consent_at: null,
          is_showcase: true,
          photo_media_ids: [],
        }, `listing:${item.key}`);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    providers: showcaseProviders.length,
    listings: listingIds.length,
    insertedProviders,
    updatedProviders,
    insertedListings,
    listingIds,
  };
}

async function main() {
  if (process.env.SAMMY_HOSTED_DEMO !== 'true' || process.env.SAMMY_SHOWCASE_CATALOG_CONFIRM !== 'YES') {
    throw new Error('For the dedicated demo database only: set SAMMY_HOSTED_DEMO=true and SAMMY_SHOWCASE_CATALOG_CONFIRM=YES.');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const target = new URL(process.env.DATABASE_URL);
  if (!target.hostname.endsWith('.neon.tech')) throw new Error('Refusing to seed a non-Neon database.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10000 });
  try {
    await pool.query("SELECT to_regclass('public.users'), to_regclass('public.applications'), to_regclass('public.listings')");
    const result = await seedShowcaseCatalog(pool);
    console.log(JSON.stringify({
      message: 'Catalog is ready for the simulation-gated checkout. No provider applications, approvals, orders, sales, or reviews were created.',
      providers: result.providers,
      listings: result.listings,
      insertedProviders: result.insertedProviders,
      updatedProviders: result.updatedProviders,
      insertedListings: result.insertedListings,
    }));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
