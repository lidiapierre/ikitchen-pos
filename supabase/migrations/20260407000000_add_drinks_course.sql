-- Add 'drinks' to the course enum for order items (issue #373)
-- KOT grouping by course requires Drinks → Starter → Main → Dessert ordering.
-- The check constraint was added without an explicit name, so Postgres generated
-- 'order_items_course_check' (default naming convention for a single CHECK column).

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_course_check;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_course_check
    CHECK (course IN ('drinks', 'starter', 'main', 'dessert'));

-- Also update the default for new items: keep 'main' as the default
-- (backwards compatible — existing rows keep their course value unchanged)

-- Rollback:
-- ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_course_check;
-- ALTER TABLE order_items ADD CONSTRAINT order_items_course_check
--   CHECK (course IN ('starter', 'main', 'dessert'));
