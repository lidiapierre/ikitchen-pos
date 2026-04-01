-- Migration: Restaurant-scoped RLS policies
-- Issue: #314 — All core RLS policies had qual=true, allowing any authenticated
-- user to read/write ALL restaurant data. This migration replaces blanket policies
-- with restaurant-scoped ones.
--
-- Tables NOT touched: customers, reservations (already have correct RLS)
-- Edge functions use service_role key which BYPASSES RLS — unaffected.

BEGIN;

-- =============================================================================
-- Step 1: Helper function to get the current user's restaurant_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_restaurant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT restaurant_id FROM public.users WHERE id = auth.uid()
$$;

-- =============================================================================
-- Step 2: Tables with DIRECT restaurant_id column
-- =============================================================================

-- ── tables ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.tables;
DROP POLICY IF EXISTS "allow_anon_read" ON public.tables;
DROP POLICY IF EXISTS "allow_anon_write" ON public.tables;

CREATE POLICY "restaurant_isolation" ON public.tables
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── menus ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.menus;
DROP POLICY IF EXISTS "allow_anon_read" ON public.menus;
DROP POLICY IF EXISTS "allow_anon_write" ON public.menus;

CREATE POLICY "restaurant_isolation" ON public.menus
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── orders ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.orders;
DROP POLICY IF EXISTS "allow_anon_read" ON public.orders;

CREATE POLICY "restaurant_isolation" ON public.orders
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── config ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.config;
DROP POLICY IF EXISTS "allow_anon_all" ON public.config;

CREATE POLICY "restaurant_isolation" ON public.config
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── vat_rates ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.vat_rates;
DROP POLICY IF EXISTS "allow_anon_all" ON public.vat_rates;

CREATE POLICY "restaurant_isolation" ON public.vat_rates
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── bill_sequences ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.bill_sequences;
DROP POLICY IF EXISTS "allow_anon_all" ON public.bill_sequences;

CREATE POLICY "restaurant_isolation" ON public.bill_sequences
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── shifts ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.shifts;
DROP POLICY IF EXISTS "allow_anon_read" ON public.shifts;

CREATE POLICY "restaurant_isolation" ON public.shifts
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── api_keys ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.api_keys;
DROP POLICY IF EXISTS "allow_service_role" ON public.api_keys;

CREATE POLICY "restaurant_isolation" ON public.api_keys
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── printers ──
DROP POLICY IF EXISTS "Owners can manage printers" ON public.printers;
DROP POLICY IF EXISTS "Staff can read printers" ON public.printers;

CREATE POLICY "restaurant_isolation" ON public.printers
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── printer_configs ──
DROP POLICY IF EXISTS "Owners can manage printer config" ON public.printer_configs;
DROP POLICY IF EXISTS "Staff can read printer config" ON public.printer_configs;

CREATE POLICY "restaurant_isolation" ON public.printer_configs
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- =============================================================================
-- Step 2b: Additional tables with DIRECT restaurant_id (from Step 6 check)
-- =============================================================================

-- ── ingredients ──
DROP POLICY IF EXISTS "Owners can manage ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Staff can read ingredients" ON public.ingredients;

CREATE POLICY "restaurant_isolation" ON public.ingredients
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── stock_adjustments ──
DROP POLICY IF EXISTS "Owners can manage stock_adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Staff can read stock_adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Service role can insert stock_adjustments" ON public.stock_adjustments;

CREATE POLICY "restaurant_isolation" ON public.stock_adjustments
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── kds_settings ──
DROP POLICY IF EXISTS "anon_read_kds_settings" ON public.kds_settings;
DROP POLICY IF EXISTS "staff_write_kds_settings" ON public.kds_settings;

CREATE POLICY "restaurant_isolation" ON public.kds_settings
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ── audit_log ──
DROP POLICY IF EXISTS "allow_insert_authenticated" ON public.audit_log;
DROP POLICY IF EXISTS "allow_select_authenticated" ON public.audit_log;

CREATE POLICY "restaurant_isolation" ON public.audit_log
  FOR ALL
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- =============================================================================
-- Step 3: Tables with INDIRECT restaurant_id (via join)
-- =============================================================================

-- ── menu_items (via menus.restaurant_id) ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.menu_items;
DROP POLICY IF EXISTS "allow_anon_read" ON public.menu_items;
DROP POLICY IF EXISTS "allow_anon_write" ON public.menu_items;

CREATE POLICY "restaurant_isolation" ON public.menu_items
  FOR ALL
  USING (menu_id IN (SELECT id FROM public.menus WHERE restaurant_id = public.get_user_restaurant_id()))
  WITH CHECK (menu_id IN (SELECT id FROM public.menus WHERE restaurant_id = public.get_user_restaurant_id()));

-- ── order_items (via orders.restaurant_id) ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.order_items;
DROP POLICY IF EXISTS "allow_anon_read" ON public.order_items;

CREATE POLICY "restaurant_isolation" ON public.order_items
  FOR ALL
  USING (order_id IN (SELECT id FROM public.orders WHERE restaurant_id = public.get_user_restaurant_id()))
  WITH CHECK (order_id IN (SELECT id FROM public.orders WHERE restaurant_id = public.get_user_restaurant_id()));

-- ── modifiers (via menu_items → menus.restaurant_id) ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.modifiers;
DROP POLICY IF EXISTS "allow_anon_read" ON public.modifiers;
DROP POLICY IF EXISTS "allow_anon_write" ON public.modifiers;
DROP POLICY IF EXISTS "Allow anon read on modifiers" ON public.modifiers;

CREATE POLICY "restaurant_isolation" ON public.modifiers
  FOR ALL
  USING (menu_item_id IN (
    SELECT mi.id FROM public.menu_items mi
    JOIN public.menus m ON mi.menu_id = m.id
    WHERE m.restaurant_id = public.get_user_restaurant_id()
  ))
  WITH CHECK (menu_item_id IN (
    SELECT mi.id FROM public.menu_items mi
    JOIN public.menus m ON mi.menu_id = m.id
    WHERE m.restaurant_id = public.get_user_restaurant_id()
  ));

-- ── payments (via orders.restaurant_id) ──
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.payments;
DROP POLICY IF EXISTS "allow_anon_read" ON public.payments;

CREATE POLICY "restaurant_isolation" ON public.payments
  FOR ALL
  USING (order_id IN (SELECT id FROM public.orders WHERE restaurant_id = public.get_user_restaurant_id()))
  WITH CHECK (order_id IN (SELECT id FROM public.orders WHERE restaurant_id = public.get_user_restaurant_id()));

-- ── recipe_items (via menu_items → menus.restaurant_id) ──
DROP POLICY IF EXISTS "Owners can manage recipe_items" ON public.recipe_items;
DROP POLICY IF EXISTS "Staff can read recipe_items" ON public.recipe_items;

CREATE POLICY "restaurant_isolation" ON public.recipe_items
  FOR ALL
  USING (menu_item_id IN (
    SELECT mi.id FROM public.menu_items mi
    JOIN public.menus m ON mi.menu_id = m.id
    WHERE m.restaurant_id = public.get_user_restaurant_id()
  ))
  WITH CHECK (menu_item_id IN (
    SELECT mi.id FROM public.menu_items mi
    JOIN public.menus m ON mi.menu_id = m.id
    WHERE m.restaurant_id = public.get_user_restaurant_id()
  ));

-- =============================================================================
-- Step 4: Users table — own row + same restaurant
-- =============================================================================
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.users;
DROP POLICY IF EXISTS "allow_anon_read_users" ON public.users;

-- Users can read their own row
CREATE POLICY "read_own_row" ON public.users
  FOR SELECT
  USING (id = auth.uid());

-- Users can read other users in the same restaurant (for staff lists etc)
CREATE POLICY "read_same_restaurant" ON public.users
  FOR SELECT
  USING (restaurant_id = public.get_user_restaurant_id());

-- Users can only update their own row
CREATE POLICY "update_own_row" ON public.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- =============================================================================
-- Step 5: Restaurants table — only see own restaurant
-- =============================================================================
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.restaurants;
DROP POLICY IF EXISTS "Allow anon read on restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "allow_anon_read" ON public.restaurants;

CREATE POLICY "restaurant_isolation" ON public.restaurants
  FOR ALL
  USING (id = public.get_user_restaurant_id())
  WITH CHECK (id = public.get_user_restaurant_id());

-- =============================================================================
-- Step 7: Roles table — read-only for authenticated users
-- =============================================================================
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.roles;

CREATE POLICY "authenticated_read" ON public.roles
  FOR SELECT
  USING (auth.role() = 'authenticated');

COMMIT;
