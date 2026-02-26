# Action API Rules

All state changes in this system go through Edge Functions here. No exceptions.

## Every action must

1. Validate the caller's permissions
2. Validate the state transition is legal
3. Emit an audit event to `audit_log`
4. Return a structured result: `{ success: boolean, data?: T, error?: string }`

## Required actions

See `@docs/architecture.md` for the full Action API table.

## Error handling

- Never expose internal error details to the client
- Log full error internally, return a safe generic message externally
- Use typed error codes, not free-form strings

## Edge function structure

```
/apps/api/<action-name>/
  index.ts       # Handler
  validator.ts   # Input validation
  index.test.ts  # Unit tests
```

## Testing

- Every action must have unit tests covering: happy path, permission denied, invalid state transition
- Use Vitest
