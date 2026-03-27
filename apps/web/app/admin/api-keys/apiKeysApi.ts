/**
 * API client for the /admin/api-keys page.
 * Calls the edge function at /functions/v1/api/keys (JWT-authenticated, owner only).
 */

export interface ApiKeyRow {
  id: string
  label: string
  permissions: 'read' | 'write'
  key_prefix: string
  created_at: string
  last_used_at: string | null
}

export interface CreatedApiKey extends ApiKeyRow {
  /** Plaintext key — shown ONCE on creation */
  key: string
}

interface ApiResponse<T> {
  data: T
  meta: Record<string, unknown>
}

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}

function apiUrl(supabaseUrl: string): string {
  return `${supabaseUrl}/functions/v1/api/keys`
}

export async function fetchApiKeys(
  supabaseUrl: string,
  accessToken: string,
): Promise<ApiKeyRow[]> {
  const res = await fetch(apiUrl(supabaseUrl), {
    headers: buildHeaders(accessToken),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'Request failed' }))) as {
      error?: string
    }
    throw new Error(body.error ?? 'Failed to fetch API keys')
  }
  const json = (await res.json()) as ApiResponse<ApiKeyRow[]>
  return json.data
}

export async function createApiKey(
  supabaseUrl: string,
  accessToken: string,
  label: string,
  permissions: 'read' | 'write',
): Promise<CreatedApiKey> {
  const res = await fetch(apiUrl(supabaseUrl), {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ label, permissions }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'Request failed' }))) as {
      error?: string
    }
    throw new Error(body.error ?? 'Failed to create API key')
  }
  const json = (await res.json()) as ApiResponse<CreatedApiKey>
  return json.data
}

export async function revokeApiKey(
  supabaseUrl: string,
  accessToken: string,
  keyId: string,
): Promise<void> {
  const res = await fetch(`${apiUrl(supabaseUrl)}/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
    headers: buildHeaders(accessToken),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'Request failed' }))) as {
      error?: string
    }
    throw new Error(body.error ?? 'Failed to revoke API key')
  }
}
