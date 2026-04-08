/**
 * API client for the unmerge_tables edge function (issue #274).
 * Clears the merge on the primary order: unlocks all secondary tables
 * and removes merge_label. Items remain on the primary order (MVP).
 */
export async function callUnmergeTables(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
): Promise<{ unmerged_table_count: number }> {
  const url = `${supabaseUrl}/functions/v1/unmerge_tables`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_id: orderId }),
  })

  const json = (await res.json()) as {
    success: boolean
    data?: { unmerged_table_count: number }
    error?: string
  }

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to unmerge tables')
  }

  return { unmerged_table_count: json.data?.unmerged_table_count ?? 0 }
}
