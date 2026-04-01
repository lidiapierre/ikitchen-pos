'use client'

import { useState, useRef, useCallback } from 'react'
import type { JSX } from 'react'
import { Mic, MicOff, Loader2, X } from 'lucide-react'
import { useUser } from '@/lib/user-context'
import { callVoiceOrder } from './voiceOrderApi'
import type { VoiceOrderResult } from './voiceOrderApi'

export interface VoiceOrderButtonProps {
  orderId: string
  onItemsConfirmed: (items: Array<{ menu_item_id: string; name: string; quantity: number }>) => void
}

type State = 'idle' | 'recording' | 'processing' | 'confirmation' | 'error'

export default function VoiceOrderButton({ orderId, onItemsConfirmed }: VoiceOrderButtonProps): JSX.Element {
  const { accessToken } = useUser()
  const [state, setState] = useState<State>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [result, setResult] = useState<VoiceOrderResult | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach((track) => track.stop())

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setState('processing')

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (!supabaseUrl || !accessToken) {
          setState('error')
          setErrorMessage('Not authenticated. Please reload and try again.')
          return
        }

        try {
          const voiceResult = await callVoiceOrder(supabaseUrl, accessToken, orderId, audioBlob)
          setResult(voiceResult)
          setState('confirmation')
        } catch (err) {
          setState('error')
          setErrorMessage(err instanceof Error ? err.message : 'Voice order failed. Please try again.')
        }
      }

      mediaRecorder.start()
      setState('recording')
    } catch {
      setState('error')
      setErrorMessage('Microphone access denied. Please allow microphone access and try again.')
    }
  }, [accessToken, orderId])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const handleMicButton = useCallback(() => {
    if (state === 'idle' || state === 'error') {
      setErrorMessage('')
      startRecording()
    } else if (state === 'recording') {
      stopRecording()
    }
  }, [state, startRecording, stopRecording])

  const handleConfirm = useCallback(() => {
    if (result) {
      onItemsConfirmed(result.items)
    }
    setResult(null)
    setState('idle')
  }, [result, onItemsConfirmed])

  const handleCancel = useCallback(() => {
    setResult(null)
    setState('idle')
    setErrorMessage('')
  }, [])

  const handleRetry = useCallback(() => {
    setErrorMessage('')
    setState('idle')
  }, [])

  if (state === 'confirmation' && result) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-4">
        <div className="bg-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-xl">
          <h3 className="text-white text-lg font-semibold mb-3">Confirm order items</h3>

          {/* Transcript */}
          <p className="text-zinc-400 text-sm mb-4 italic">&ldquo;{result.transcript}&rdquo;</p>

          {/* Matched items */}
          <ul className="space-y-2 mb-6">
            {result.items.map((item) => (
              <li
                key={item.menu_item_id}
                className="flex items-center gap-3 bg-zinc-700 rounded-xl px-4 py-3"
              >
                <span className="text-amber-400 font-bold text-base min-w-[2rem]">
                  {item.quantity}×
                </span>
                <span className="text-white text-base">{item.name}</span>
              </li>
            ))}
          </ul>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 min-h-[48px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-base transition-colors"
            >
              Add to order
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="min-h-[48px] min-w-[48px] rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-semibold text-base px-4 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {state === 'error' && errorMessage !== '' && (
        <div className="flex items-center gap-2 bg-red-900/50 border border-red-700 rounded-xl px-4 py-2 max-w-xs">
          <p className="text-red-300 text-sm flex-1">{errorMessage}</p>
          <button
            type="button"
            onClick={handleRetry}
            aria-label="Dismiss error"
            className="text-red-400 hover:text-red-200 transition-colors"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleMicButton}
        disabled={state === 'processing'}
        aria-label={
          state === 'recording'
            ? 'Stop recording'
            : state === 'processing'
              ? 'Processing…'
              : 'Start voice order'
        }
        className={[
          'min-h-[56px] min-w-[56px] rounded-full flex items-center justify-center transition-all shadow-lg',
          state === 'recording'
            ? 'bg-red-600 hover:bg-red-500 animate-pulse'
            : state === 'processing'
              ? 'bg-zinc-600 cursor-not-allowed'
              : state === 'error'
                ? 'bg-amber-700 hover:bg-amber-600'
                : 'bg-amber-600 hover:bg-amber-500',
        ].join(' ')}
      >
        {state === 'processing' ? (
          <Loader2 size={24} className="text-white animate-spin" aria-hidden="true" />
        ) : state === 'recording' ? (
          <MicOff size={24} className="text-white" aria-hidden="true" />
        ) : (
          <Mic size={24} className="text-white" aria-hidden="true" />
        )}
      </button>

      {state === 'recording' && (
        <span className="text-red-400 text-xs font-medium animate-pulse">Recording… tap to stop</span>
      )}
      {state === 'processing' && (
        <span className="text-zinc-400 text-xs font-medium">Listening…</span>
      )}
    </div>
  )
}
