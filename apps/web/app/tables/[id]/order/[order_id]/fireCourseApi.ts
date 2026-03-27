import type { CourseType } from './orderData'

export interface FireCourseResult {
  item_ids: string[]
}

/**
 * Fire a course — marks all non-voided items in the given course as
 * sent_to_kitchen = true and course_status = 'fired'.
 */
export async function callFireCourse(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  course: CourseType,
): Promise<FireCourseResult> {
  return callUpdateCourseStatus(supabaseUrl, accessToken, orderId, course, 'fire')
}

/**
 * Mark a course as served — updates course_status = 'served' for all items in
 * the given course (sent_to_kitchen is not changed).
 */
export async function callServeCourse(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  course: CourseType,
): Promise<FireCourseResult> {
  return callUpdateCourseStatus(supabaseUrl, accessToken, orderId, course, 'serve')
}

async function callUpdateCourseStatus(
  supabaseUrl: string,
  accessToken: string,
  orderId: string,
  course: CourseType,
  action: 'fire' | 'serve',
): Promise<FireCourseResult> {
  const res = await fetch(`${supabaseUrl}/functions/v1/fire_course`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_id: orderId, course, action }),
  })

  const json = (await res.json()) as { success: boolean; data?: { item_ids: string[] }; error?: string }

  if (!json.success || !json.data) {
    throw new Error(json.error ?? `Failed to ${action} course`)
  }

  return { item_ids: json.data.item_ids }
}
