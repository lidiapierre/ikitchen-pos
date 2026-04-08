/**
 * API client for the merge_tables edge function (issue #274).
 * Merges the secondary table's order into the primary order,
 * moves all items across, locks the secondary table, and
 * sets merge_label on the primary order (e.g. "Table 3 + Table 4").
 */
export async function callMergeTables(
  supabaseUrl: string,
  accessToken: string,
  primaryOrderId: string,
  secondaryTableId: string,
): Promise<{ merge_label: string }> {
  const url = `${supabaseUrl}/functions/v1/merge_tables`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ primary_order_id: primaryOrderId, secondary_table_id: secondaryTableId }),
  })

  const json = (await res.json()) as { success: boolean; data?: { merge_label: string }; error?: string }

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to merge tables')
  }

  return { merge_label: json.data?.merge_label ?? '' }
}
