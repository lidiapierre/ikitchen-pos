-- Wastage / spoilage log enhancements
-- Issue #171

-- Add cost_per_unit to ingredients for waste cost estimation
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(12, 4);

-- Add wastage_reason to stock_adjustments for detailed wastage categorisation
ALTER TABLE stock_adjustments
  ADD COLUMN IF NOT EXISTS wastage_reason TEXT
    CHECK (wastage_reason IS NULL OR wastage_reason IN ('spoiled', 'over-prepared', 'dropped', 'expired'));
