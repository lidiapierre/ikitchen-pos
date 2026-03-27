-- Add server_id to orders table for staff performance tracking
-- Links each order to the staff member who created/handled it

ALTER TABLE orders
  ADD COLUMN server_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_server_id ON orders(server_id);
