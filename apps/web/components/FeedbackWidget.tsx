'use client'

import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/user-context'

interface UploadedFile {
  name: string
  url: string
}

export default function FeedbackWidget(): React.ReactElement | null {
  const { role, loading, userId, accessToken } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleOpen = useCallback(() => {
    setIsOpen(true)
    setError(null)
    setSubmitted(false)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setDescription('')
    setFiles([])
    setError(null)
    setSubmitted(false)
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return

    setUploading(true)
    setError(null)

    try {
      // Upload screenshots to Supabase Storage
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

      // Get user info from session
      const { data: { session } } = await supabase.auth.getSession()
      const userEmail = session?.user?.email ?? 'unknown'
      const userName = session?.user?.user_metadata?.full_name ?? session?.user?.email ?? 'unknown'

      // Send to API route
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
          userEmail,
          userName,
          screenshots: uploadedFiles.map((f) => f.url),
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed with status ${response.status}`)
      }

      setSubmitted(true)
      setTimeout(() => {
        handleClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setUploading(false)
    }
  }, [description, files, userId, accessToken, handleClose])

  // Don't render until we know the user is authenticated
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
                </div>

                {/* Screenshots */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Screenshots <span className="text-gray-400">(optional)</span>
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
                  {files.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {files.map((f) => (
                        <li key={f.name} className="text-xs text-gray-500 truncate">{f.name}</li>
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
