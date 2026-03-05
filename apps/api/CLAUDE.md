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

## CORS

Every edge function must handle OPTIONS preflight requests and include `x-demo-staff-id` in the allowed headers list.

Required CORS headers on every response:
```ts
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
}
```

OPTIONS preflight must return 204 with these headers and no body:
```ts
if (req.method === 'OPTIONS') {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
```

All other responses must also include these CORS headers.

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
