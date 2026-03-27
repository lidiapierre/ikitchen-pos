-- Add course management columns to order_items
-- course: which course the item belongs to (starter, main, dessert)
-- course_status: tracks whether the course has been fired to kitchen or served
-- Backward compatibility: existing rows default to course='main', course_status='waiting'

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS course        text NOT NULL DEFAULT 'main'
    CHECK (course IN ('starter', 'main', 'dessert')),
  ADD COLUMN IF NOT EXISTS course_status text NOT NULL DEFAULT 'waiting'
    CHECK (course_status IN ('waiting', 'fired', 'served'));

-- Index to efficiently query items by order + course
CREATE INDEX IF NOT EXISTS idx_order_items_order_course ON order_items(order_id, course);

-- Rollback:
-- ALTER TABLE order_items DROP COLUMN IF EXISTS course;
-- ALTER TABLE order_items DROP COLUMN IF EXISTS course_status;
-- DROP INDEX IF EXISTS idx_order_items_order_course;
