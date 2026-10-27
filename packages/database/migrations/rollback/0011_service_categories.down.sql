-- Prefer rolling back application code while retaining the additive schema.
-- Refuse to discard any new category, package or order facts. Stop writers first.
BEGIN;
LOCK TABLE service_categories, products, product_skus, orders IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM service_categories)
    OR EXISTS (SELECT 1 FROM products WHERE category_id IS NOT NULL OR category_snapshot IS NOT NULL OR attributes <> '{}'::jsonb)
    OR EXISTS (SELECT 1 FROM product_skus WHERE billing_unit <> 'SESSION' OR unit_count <> 1)
    OR EXISTS (SELECT 1 FROM orders WHERE service_details_snapshot IS NOT NULL)
  THEN RAISE EXCEPTION 'cannot remove service categories while new catalog facts exist'; END IF;
END $$;
ALTER TABLE products DROP CONSTRAINT products_category_id_service_categories_id_fk;
ALTER TABLE products DROP COLUMN category_id, DROP COLUMN category_snapshot, DROP COLUMN attributes;
ALTER TABLE product_skus DROP CONSTRAINT product_skus_billing_valid;
ALTER TABLE product_skus DROP COLUMN billing_unit, DROP COLUMN unit_count;
ALTER TABLE orders DROP COLUMN service_details_snapshot;
DROP TABLE service_categories;
COMMIT;
