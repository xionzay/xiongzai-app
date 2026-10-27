CREATE TABLE orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id uuid NOT NULL REFERENCES users(id), seller_id uuid NOT NULL REFERENCES users(id), listing_id uuid NOT NULL REFERENCES listings(id),
 request_id text NOT NULL, request_hash text NOT NULL, service jsonb NOT NULL, rules jsonb NOT NULL, delivery jsonb NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 24), total_fen integer NOT NULL CHECK(total_fen>0),
 status text NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','awaitingService','closed')), simulated boolean NOT NULL DEFAULT true CHECK(simulated),
 created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz, closed_at timestamptz,
 UNIQUE(buyer_id,request_id), CHECK(buyer_id<>seller_id),
 CHECK((status='unpaid' AND paid_at IS NULL AND closed_at IS NULL) OR (status='awaitingService' AND paid_at IS NOT NULL AND closed_at IS NULL) OR (status='closed' AND paid_at IS NULL AND closed_at IS NOT NULL))
);
CREATE INDEX orders_buyer ON orders(buyer_id,id DESC);
CREATE INDEX orders_seller ON orders(seller_id,id DESC);
CREATE TABLE payment_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), request_id text NOT NULL, status text NOT NULL CHECK(status IN ('pending','succeeded','failed')), created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, UNIQUE(order_id,request_id));
CREATE UNIQUE INDEX one_pending_payment ON payment_attempts(order_id) WHERE status='pending';
CREATE UNIQUE INDEX one_successful_payment ON payment_attempts(order_id) WHERE status='succeeded';
