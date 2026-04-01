export interface ValidationError {
  error: string
  status: 400
}

export interface ValidatedInput {
  audioBlob: Blob
  orderId: string
  notes?: string
}

const MAX_NOTES_LENGTH = 500

/**
 * Validates the multipart FormData for the voice_order edge function.
 * Returns ValidatedInput on success, ValidationError on failure.
 */
export function validateVoiceOrderInput(formData: FormData): ValidatedInput | ValidationError {
  const audioEntry = formData.get('audio')
  const orderId = formData.get('order_id')
  const notes = formData.get('notes')

  if (!audioEntry || !(audioEntry instanceof Blob)) {
    return { error: 'audio is required', status: 400 }
  }

  if (typeof orderId !== 'string' || orderId.trim() === '') {
    return { error: 'order_id is required', status: 400 }
  }

  const notesValue = typeof notes === 'string' ? notes : undefined
  if (notesValue !== undefined && notesValue.length > MAX_NOTES_LENGTH) {
    return { error: `notes must be ${MAX_NOTES_LENGTH} characters or fewer`, status: 400 }
  }

  return { audioBlob: audioEntry, orderId: orderId.trim(), notes: notesValue }
}
