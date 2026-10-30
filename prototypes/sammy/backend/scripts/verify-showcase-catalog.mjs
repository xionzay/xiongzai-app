import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { buildApp } from '../src/app.ts';
import { createDatabase } from '../src/db.ts';
import { createSession } from '../src/auth.ts';
import { orderRules } from '../src/orders.ts';
import { users } from '../src/schema.ts';
import { seedShowcaseCatalog } from './seed-showcase-catalog.mjs';
import { showcaseProviders } from './showcase-catalog-data.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required; this verification must use a disposable test database.');

const pool = new Pool({ connectionString: url, max: 2 });
const { db, pool: appPool } = createDatabase(url);
process.env.SAMMY_SIMULATED_PAYMENTS = 'true';
delete process.env.SAMMY_HOSTED_DEMO;
delete process.env.DYNO;
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
delete process.env.NODE_ENV;
const app = buildApp({ db, logger: false });
let seeded;
let buyerId;
try {
  seeded = await seedShowcaseCatalog(pool);
  assert.equal(seeded.providers, 4);
  assert.equal(seeded.listings, 8);
  assert.equal(seeded.insertedProviders, 4);
  assert.equal(seeded.insertedListings, 8);

  const retry = await seedShowcaseCatalog(pool);
  assert.equal(retry.insertedProviders, 0);
  assert.equal(retry.insertedListings, 0);

  const response = await app.inject({ method: 'GET', url: '/v1/listings?q=Showcase&game=all&serviceType=all' });
  assert.equal(response.statusCode, 200);
  const listings = response.json().listings;
  const seededListings = listings.filter(item => seeded.listingIds.includes(item.id));
  assert.equal(seededListings.length, 8);
  for (const provider of showcaseProviders) {
    const gameListings = seededListings.filter(item => item.game === provider.game);
    assert.equal(gameListings.length, 2, `${provider.game} showcase coverage`);
    assert.deepEqual(new Set(gameListings.map(item => item.serviceType)), new Set(['companion', 'coaching']));
    assert.ok(gameListings.every(item => item.provider.nickname.includes('Showcase') && item.isShowcase && item.reviewStatus === 'draft'));
    const store = await app.inject({ method: 'GET', url: `/v1/stores/${gameListings[0].ownerId}` });
    assert.equal(store.statusCode, 200);
    assert.equal(store.json().store.isShowcase, true);
    assert.equal(store.json().listings.length, 2);
  }

  const [buyer] = await db.insert(users).values({ phone: `137${String(Date.now()).slice(-8)}`, nickname: 'Showcase verification buyer', passwordHash: 'fixture' }).returning();
  buyerId = buyer.id;
  const token = await createSession(db, buyer.id);
  const offer = seededListings[0];
  const order = await app.inject({
    method: 'POST', url: '/v1/orders', headers: { authorization: `Bearer ${token}` },
    payload: { listingId: offer.id, listingRevision: 1, expectedUnitPriceFen: offer.priceFen, quantity: 1,
      delivery: { gameName: 'Test player', gameId: offer.game === 'valorant' ? 'Player#CN01' : 'PE00123', server: offer.game === 'valorant' ? 'china' : 'wechat', note: '' },
      requestId: 'showcase-catalog-check', rulesVersion: orderRules.version, accepted: true },
  });
  assert.equal(order.statusCode, 409);
  assert.equal(order.json().error, 'showcaseNotOrderable');

  const orders = await pool.query('SELECT count(*)::int AS count FROM orders WHERE listing_id=ANY($1::uuid[])', [seeded.listingIds]);
  const reviews = await pool.query('SELECT count(*)::int AS count FROM order_reviews WHERE listing_id=ANY($1::uuid[])', [seeded.listingIds]);
  assert.equal(orders.rows[0].count, 0);
  assert.equal(reviews.rows[0].count, 0);
  console.log('PASS: 8 browse-only showcase services across all 4 games; both service types per game; store detail works; repeat seed is idempotent; orders are rejected; no fake approvals, sales, or reviews.');
} finally {
  if (seeded) {
    await pool.query('DELETE FROM listings WHERE id=ANY($1::uuid[])', [seeded.listingIds]);
    await pool.query('DELETE FROM users WHERE phone=ANY($1::text[])', [showcaseProviders.map(provider => provider.phone)]);
  }
  if (buyerId) {
    await pool.query('DELETE FROM sessions WHERE user_id=$1', [buyerId]);
    await pool.query('DELETE FROM users WHERE id=$1', [buyerId]);
  }
  await app.close();
  await appPool.end();
  await pool.end();
}
