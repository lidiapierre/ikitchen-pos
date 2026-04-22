'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/user-context'

/** Max number of screenshots the user may attach. */
const MAX_FILES = 5
/** Max individual file size in bytes (5 MB). */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

interface UploadedFile {
  name: string
  url: string
}

type VoiceLanguage = 'en' | 'bn'

export default function FeedbackWidget(): React.ReactElement | null {
  const { role, loading, userId, accessToken } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Voice recording state ──────────────────────────────────────────────────
  const [voiceLang, setVoiceLang] = useState<VoiceLanguage>('en')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Set to true by handleClose so any in-flight onstop callback aborts before
  // touching state (prevents state updates on a closed/unmounted modal).
  const transcribeCancelledRef = useRef(false)

  // Clear any pending timers when the component unmounts.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current)
      if (recordingTimerRef.current !== null) clearInterval(recordingTimerRef.current)
    }
  }, [])

  const handleClose = useCallback(() => {
    // Cancel any in-flight transcription before stopping the recorder so
    // the onstop callback does not attempt state updates on a closed modal.
    transcribeCancelledRef.current = true
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (recordingTimerRef.current !== null) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setIsOpen(false)
    setDescription('')
    setFiles([])
    setFileError(null)
    setError(null)
    setSubmitted(false)
    setIsRecording(false)
    setIsTranscribing(false)
    setVoiceError(null)
    setRecordingSeconds(0)
    audioChunksRef.current = []
  }, [])

  const handleOpen = useCallback(() => {
    setIsOpen(true)
    setError(null)
    setSubmitted(false)
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    if (!e.target.files) return

    const selected = Array.from(e.target.files)

    if (selected.length > MAX_FILES) {
      setFileError(`Maximum ${MAX_FILES} files allowed.`)
      e.target.value = ''
      return
    }

    const oversized = selected.filter((f) => f.size > MAX_FILE_SIZE_BYTES)
    if (oversized.length > 0) {
      setFileError(`Each file must be under 5 MB (${oversized.map((f) => f.name).join(', ')} exceeded).`)
      e.target.value = ''
      return
    }

    setFiles(selected)
  }, [])

  // ── Voice recording logic ──────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    transcribeCancelledRef.current = false
    setVoiceError(null)
    audioChunksRef.current = []

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setVoiceError('Microphone access denied. Please allow microphone access and try again.')
      return
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : ''

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }

    recorder.start(100) // collect chunks every 100ms
    setIsRecording(true)
    setRecordingSeconds(0)

    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1)
    }, 1000)
  }, [])

  const stopRecordingAndTranscribe = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    // Stop the timer
    if (recordingTimerRef.current !== null) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    recorder.onstop = async () => {
      // Stop all tracks to release the microphone
      recorder.stream.getTracks().forEach((t) => t.stop())

      // Modal was closed before recording finished — abort silently.
      if (transcribeCancelledRef.current) return

      setIsRecording(false)
      setIsTranscribing(true)
      setVoiceError(null)

      const mimeType = recorder.mimeType || 'audio/webm;codecs=opus'
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
      audioChunksRef.current = []

      // Derive a filename from the actual MIME type so the server extension
      // and Content-Type are consistent (avoids a .webm filename on an ogg blob).
      const audioExt = mimeType.startsWith('audio/ogg') ? 'ogg' : 'webm'
      const audioFileName = `recording.${audioExt}`

      const formData = new FormData()
      formData.append('audio', audioBlob, audioFileName)
      formData.append('language', voiceLang)

      try {
        const response = await fetch('/api/feedback/transcribe', {
          method: 'POST',
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: formData,
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(
            (body as { error?: string }).error ?? `Transcription failed (${response.status})`
          )
        }

        const { text } = await response.json() as { text: string }

        if (!transcribeCancelledRef.current && text.trim()) {
          setDescription((prev) => {
            const trimmed = prev.trim()
            return trimmed ? `${trimmed}\n${text.trim()}` : text.trim()
          })
        }
      } catch (err) {
        if (!transcribeCancelledRef.current) {
          setVoiceError(
            err instanceof Error ? err.message : 'Transcription failed. Please try again.'
          )
        }
      } finally {
        if (!transcribeCancelledRef.current) {
          setIsTranscribing(false)
          setRecordingSeconds(0)
        }
      }
    }

    recorder.stop()
  }, [voiceLang, accessToken])

  const handleMicClick = useCallback(() => {
    if (isRecording) {
      stopRecordingAndTranscribe()
    } else {
      void startRecording()
    }
  }, [isRecording, startRecording, stopRecordingAndTranscribe])

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return

    setUploading(true)
    setError(null)

    try {
      // Upload screenshots to Supabase Storage using the authenticated user's session.
      const uploadedFiles: UploadedFile[] = []
      const timestamp = Date.now()

      for (const file of files) {
        const path = `${userId ?? 'anonymous'}/${timestamp}-${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('feedback-screenshots')
          .upload(path, file, { upsert: false })

        if (uploadError) {
          throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage
          .from('feedback-screenshots')
          .getPublicUrl(path)

        uploadedFiles.push({ name: file.name, url: urlData.publicUrl })
      }

      // Send to the server-side API route.
      // userEmail / userName are intentionally NOT sent — the server derives
      // them from the verified JWT instead.
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          description: description.trim(),
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          screenshots: uploadedFiles.map((f) => f.url),
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Request failed with status ${response.status}`)
      }

      setSubmitted(true)
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        handleClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setUploading(false)
    }
  }, [description, files, userId, accessToken, handleClose])

  // Don't render until we know the user is authenticated.
  if (loading || !role) return null

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
        aria-label="Open feedback form"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
          />
        </svg>
        Feedback
      </button>

      {/* Modal overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">Send Feedback</h2>
              <button
                onClick={handleClose}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Body */}
            {submitted ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 px-5 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900">Feedback sent!</p>
                <p className="text-xs text-gray-500">Thanks — we&apos;ll look into it.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 p-5">
                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="feedback-description">
                    Description <span className="text-red-500">*</span>
                  </label>

                  <textarea
                    id="feedback-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the bug or suggestion..."
                    required
                    rows={5}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                  />

                  {/* Voice recording toolbar */}
                  <div className="mt-1.5 flex items-center gap-2">
                    {/* Language toggle — min-h-[44px] / min-w touch targets for mobile */}
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setVoiceLang('en')}
                        disabled={isRecording || isTranscribing}
                        className={`min-h-[44px] px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          voiceLang === 'en'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                        aria-pressed={voiceLang === 'en'}
                        aria-label="Record in English"
                      >
                        English
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoiceLang('bn')}
                        disabled={isRecording || isTranscribing}
                        className={`min-h-[44px] px-3 py-2 transition-colors border-l border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                          voiceLang === 'bn'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                        aria-pressed={voiceLang === 'bn'}
                        aria-label="Record in Bangla"
                      >
                        বাংলা
                      </button>
                    </div>

                    {/* Mic button — min-h-[44px] touch target for mobile */}
                    <button
                      type="button"
                      onClick={handleMicClick}
                      disabled={isTranscribing}
                      aria-label={isRecording ? 'Stop recording' : 'Start voice recording'}
                      className={`flex items-center gap-1.5 rounded-lg px-3 min-h-[44px] text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isRecording
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {isRecording ? (
                        <>
                          <span className="inline-flex h-2 w-2 rounded-full bg-white animate-pulse" />
                          <span>Stop {formatDuration(recordingSeconds)}</span>
                        </>
                      ) : isTranscribing ? (
                        <>
                          <svg className="h-3.5 w-3.5 animate-spin text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          <span>Transcribing…</span>
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z" />
                          </svg>
                          <span>Dictate</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Voice error — role=alert ensures screen readers announce it */}
                  {voiceError && (
                    <p role="alert" className="mt-1 text-xs text-red-600">{voiceError}</p>
                  )}
                </div>

                {/* Screenshots */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Screenshots <span className="text-gray-400">(optional, max {MAX_FILES} × 5 MB)</span>
                  </label>
                  <div
                    className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 px-4 py-4 text-center hover:border-indigo-400 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {files.length > 0 ? (
                      <span className="text-xs text-indigo-600 font-medium">{files.length} file{files.length > 1 ? 's' : ''} selected</span>
                    ) : (
                      <span className="text-xs text-gray-500">Click to attach images</span>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {fileError && (
                    <p className="mt-1 text-xs text-red-600">{fileError}</p>
                  )}
                  {files.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {files.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="text-xs text-gray-500 truncate">{f.name}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading || !description.trim()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {uploading ? 'Sending…' : 'Send Feedback'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
