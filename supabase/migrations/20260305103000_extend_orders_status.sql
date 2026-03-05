-- Extend orders.status check constraint to support pending_payment and paid
-- These statuses are required for the close_order → record_payment flow

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('open', 'pending_payment', 'paid', 'closed', 'cancelled'));
