---
name: action-api
description: Reference for the POS Action API — all state-changing operations, their inputs, outputs, and valid state transitions
---

# Action API Reference

## Actions

### create_order
- Input: `{ table_id, staff_id }`
- Output: `{ order_id, status: 'open' }`
- Rules: Table must not have an existing open order

### add_item_to_order
- Input: `{ order_id, menu_item_id, quantity, modifiers?: modifier_id[] }`
- Output: `{ order_item_id, order_total }`
- Rules: Order must be in `open` status

### void_item
- Input: `{ order_item_id, reason }`
- Output: `{ success, order_total }`
- Rules: Order must be `open`. Emits audit event. Requires manager role.

### cancel_order
- Input: `{ order_id, reason }`
- Output: `{ success }`
- Rules: Order must be `open` or `pending_payment`. Emits audit event. Requires manager role.

### close_order
- Input: `{ order_id }`
- Output: `{ success, final_total }`
- Rules: Order must have at least one item. Transitions to `pending_payment`.

### record_payment
- Input: `{ order_id, amount, method }`
- Output: `{ payment_id, change_due }`
- Rules: Order must be `pending_payment`. Transitions order to `paid`.

### open_shift
- Input: `{ staff_id, opening_float }`
- Output: `{ shift_id, started_at }`
- Rules: Staff must not have an existing open shift.

### close_shift
- Input: `{ shift_id, closing_float }`
- Output: `{ shift_id, summary }`
- Rules: Shift must be open.

## Order status transitions

```
open → pending_payment → paid
open → cancelled
```

No other transitions are valid.
