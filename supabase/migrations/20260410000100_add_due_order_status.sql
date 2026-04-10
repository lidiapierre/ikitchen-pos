-- Add 'due' to orders.status check constraint (issue #370)
-- 'due' means: bill has been presented to a dine-in guest but payment is deferred.
-- The order remains active (table stays occupied). Staff can settle it later.

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('open', 'due', 'pending_payment', 'paid', 'closed', 'cancelled'));

-- Rollback:
-- ALTER TABLE orders DROP CONSTRAINT orders_status_check;
-- ALTER TABLE orders ADD CONSTRAINT orders_status_check
--   CHECK (status IN ('open', 'pending_payment', 'paid', 'closed', 'cancelled'));
