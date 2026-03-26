interface ActionResponse {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}

async function callFunction(
  supabaseUrl: string,
  accessToken: string,
  functionName: string,
  body: unknown,
): Promise<ActionResponse> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({ success: false, error: 'Request failed' }))) as ActionResponse
  if (!res.ok) {
    throw new Error(json.error ?? `${functionName} failed`)
  }
  return json
}

export interface CreateUserParams {
  email: string
  name?: string
  role: string
  restaurantId: string
  callerRole: string
}

export interface CreatedUser {
  id: string
  email: string
  name: string | null
  role: string
  is_active: boolean
  created_at: string
}

export async function callCreateUser(
  supabaseUrl: string,
  accessToken: string,
  params: CreateUserParams,
): Promise<CreatedUser> {
  const result = await callFunction(supabaseUrl, accessToken, 'create_user', {
    email: params.email,
    name: params.name ?? null,
    role: params.role,
    restaurant_id: params.restaurantId,
    caller_role: params.callerRole,
  })
  if (!result.success || !result.data || typeof result.data['user'] !== 'object') {
    throw new Error(result.error ?? 'User creation returned no data')
  }
  return result.data['user'] as CreatedUser
}

export async function callToggleUserActive(
  supabaseUrl: string,
  accessToken: string,
  userId: string,
  isActive: boolean,
): Promise<void> {
  const result = await callFunction(supabaseUrl, accessToken, 'toggle_user_active', {
    user_id: userId,
    is_active: isActive,
  })
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to update user status')
  }
}
