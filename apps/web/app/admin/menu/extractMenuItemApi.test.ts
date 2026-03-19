import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callExtractMenuItem, uploadMenuFile, fileToBase64 } from './extractMenuItemApi'

const SUPABASE_URL = 'https://test.supabase.co'
const API_KEY = 'test-api-key'

describe('callExtractMenuItem', () => {
  it('returns extracted data on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: { name: 'Burger', price: 9.99 },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await callExtractMenuItem(SUPABASE_URL, API_KEY, 'base64data', 'image/jpeg')

    expect(result).toEqual({ name: 'Burger', price: 9.99 })
    expect(mockFetch).toHaveBeenCalledWith(
      `${SUPABASE_URL}/functions/v1/extract_menu_item`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: API_KEY }),
        body: JSON.stringify({ file_data: 'base64data', media_type: 'image/jpeg' }),
      }),
    )
  })

  it('throws when success is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false, error: 'Extraction failed' }),
    }))

    await expect(
      callExtractMenuItem(SUPABASE_URL, API_KEY, 'base64data', 'image/jpeg'),
    ).rejects.toThrow('Extraction failed')
  })

  it('returns empty object when data field is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    }))

    const result = await callExtractMenuItem(SUPABASE_URL, API_KEY, 'base64data', 'image/jpeg')
    expect(result).toEqual({})
  })

  it('uses generic error message when error field is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false }),
    }))

    await expect(
      callExtractMenuItem(SUPABASE_URL, API_KEY, 'base64data', 'image/jpeg'),
    ).rejects.toThrow('Extraction failed')
  })
})

describe('uploadMenuFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the public URL on successful upload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const file = new File(['hello'], 'photo.jpg', { type: 'image/jpeg' })
    const result = await uploadMenuFile(SUPABASE_URL, API_KEY, file)

    expect(result).toMatch(new RegExp(`^${SUPABASE_URL}/storage/v1/object/public/menu-uploads/.*\\.jpg$`))
  })

  it('sends the correct headers and body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    const file = new File(['data'], 'image.png', { type: 'image/png' })
    await uploadMenuFile(SUPABASE_URL, API_KEY, file)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`${SUPABASE_URL}/storage/v1/object/menu-uploads/`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'image/png',
        }),
        body: file,
      }),
    )
  })

  it('throws when the upload request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      text: () => Promise.resolve('File too large'),
    }))

    const file = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
    await expect(uploadMenuFile(SUPABASE_URL, API_KEY, file)).rejects.toThrow('Upload failed: 413')
  })

  it('uses the file extension for files without a dot-separated extension', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const file = new File(['x'], 'noext', { type: 'image/jpeg' })
    const result = await uploadMenuFile(SUPABASE_URL, API_KEY, file)

    // split('.').pop() on 'noext' returns 'noext' — the whole name is used as extension
    expect(result).toMatch(/\.noext$/)
  })
})

describe('fileToBase64', () => {
  it('resolves with base64 string for a small file', async () => {
    const content = 'hello world'
    const file = new File([content], 'test.txt', { type: 'text/plain' })
    const result = await fileToBase64(file)

    // The base64 of "hello world" is "aGVsbG8gd29ybGQ="
    expect(result).toBe(btoa(content))
  })

  it('resolves with non-empty string for an image-like file', async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'img.jpg', { type: 'image/jpeg' })
    const result = await fileToBase64(file)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
