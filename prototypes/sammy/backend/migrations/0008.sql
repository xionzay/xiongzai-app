-- Additive marketplace records. Unavailable products and stores retain their favorites.
CREATE TABLE product_favorites (
 user_id uuid NOT NULL REFERENCES users(id), listing_id uuid NOT NULL REFERENCES listings(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,listing_id)
);
CREATE TABLE store_favorites (
 user_id uuid NOT NULL REFERENCES users(id), seller_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,seller_id)
);
CREATE TABLE order_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
 buyer_id uuid NOT NULL REFERENCES users(id), seller_id uuid NOT NULL REFERENCES users(id), listing_id uuid NOT NULL REFERENCES listings(id),
 buyer_nickname text NOT NULL, rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 text text NOT NULL CHECK(length(btrim(text)) BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden')),
 moderation_reason text, moderator_id uuid REFERENCES users(id), moderated_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'hidden' OR (moderation_reason IS NOT NULL AND length(btrim(moderation_reason))>=5 AND moderator_id IS NOT NULL AND moderated_at IS NOT NULL))
);
CREATE INDEX order_reviews_seller_time ON order_reviews(seller_id,created_at DESC);
