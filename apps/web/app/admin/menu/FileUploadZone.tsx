'use client'

import { useRef, useState, useCallback } from 'react'
import type { DragEvent, ChangeEvent, JSX } from 'react'

export type UploadState = 'idle' | 'uploading' | 'extracting' | 'done' | 'error'

export interface FileUploadZoneProps {
  uploadState: UploadState
  previewUrl: string | null
  errorMessage: string | null
  onFileSelected: (file: File) => void
  disabled?: boolean
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Unsupported file type. Please upload a JPG, PNG, WebP or PDF.'
  }
  if (file.size > MAX_SIZE_BYTES) {
    return 'File is too large. Maximum size is 10 MB.'
  }
  return null
}

function StateLabel({ state }: { state: UploadState }): JSX.Element {
  switch (state) {
    case 'uploading':
      return (
        <span className="flex items-center gap-2 text-indigo-300">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Uploading…
        </span>
      )
    case 'extracting':
      return (
        <span className="flex items-center gap-2 text-indigo-300">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Extracting details with AI…
        </span>
      )
    case 'done':
      return <span className="text-green-400">Details extracted — review and confirm below</span>
    case 'error':
      return <span className="text-red-400">Extraction failed — fill in the form manually</span>
    default:
      return <span className="text-zinc-400">Drag and drop or click to upload</span>
  }
}

export default function FileUploadZone({
  uploadState,
  previewUrl,
  errorMessage,
  onFileSelected,
  disabled = false,
}: FileUploadZoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleFile = useCallback(
    (file: File) => {
      const error = validateFile(file)
      if (error) {
        setValidationError(error)
        return
      }
      setValidationError(null)
      onFileSelected(file)
    },
    [onFileSelected],
  )

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  const isProcessing = uploadState === 'uploading' || uploadState === 'extracting'
  const isDisabled = disabled || isProcessing

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-label="Upload menu item image or PDF"
        aria-disabled={isDisabled}
        onClick={() => { if (!isDisabled) inputRef.current?.click() }}
        onKeyDown={(e) => { if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click() }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 transition-colors cursor-pointer select-none',
          'min-h-[160px]',
          isDragging
            ? 'border-indigo-400 bg-indigo-900/20'
            : 'border-zinc-600 bg-zinc-900 hover:border-indigo-500 hover:bg-zinc-800',
          isDisabled ? 'opacity-60 cursor-default pointer-events-none' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Uploaded preview"
            className="max-h-32 max-w-full rounded-xl object-contain"
          />
        ) : (
          <svg
            className="h-10 w-10 text-zinc-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        )}

        <div className="text-center text-sm">
          <StateLabel state={uploadState} />
          {uploadState === 'idle' && (
            <p className="mt-1 text-zinc-500 text-xs">
              JPG, PNG, WebP or PDF · max 10 MB
            </p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="sr-only"
          onChange={handleChange}
          disabled={isDisabled}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {(validationError ?? errorMessage) && (
        <p role="alert" className="text-sm text-red-400">
          {validationError ?? errorMessage}
        </p>
      )}
    </div>
  )
}
