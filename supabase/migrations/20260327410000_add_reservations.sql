CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_mobile TEXT,
  party_size INT NOT NULL DEFAULT 1,
  reservation_time TIMESTAMPTZ,  -- NULL = walk-in waitlist entry
  table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'seated', 'cancelled', 'no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant staff can manage reservations"
  ON reservations FOR ALL
  USING (restaurant_id IN (SELECT restaurant_id FROM users WHERE id = auth.uid()));
