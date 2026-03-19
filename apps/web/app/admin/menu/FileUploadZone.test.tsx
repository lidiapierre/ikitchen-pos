import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FileUploadZone from './FileUploadZone'

function makeFile(name: string, type: string, size = 100): File {
  const file = new File(['x'.repeat(size)], name, { type })
  return file
}

describe('FileUploadZone', () => {
  it('renders upload prompt in idle state', () => {
    render(
      <FileUploadZone
        uploadState="idle"
        previewUrl={null}
        errorMessage={null}
        onFileSelected={vi.fn()}
      />,
    )
    expect(screen.getByText('Drag and drop or click to upload')).toBeDefined()
    expect(screen.getByText(/JPG, PNG, WebP or PDF/)).toBeDefined()
  })

  it('shows uploading spinner', () => {
    render(
      <FileUploadZone
        uploadState="uploading"
        previewUrl={null}
        errorMessage={null}
        onFileSelected={vi.fn()}
      />,
    )
    expect(screen.getByText('Uploading…')).toBeDefined()
  })

  it('shows extracting spinner', () => {
    render(
      <FileUploadZone
        uploadState="extracting"
        previewUrl={null}
        errorMessage={null}
        onFileSelected={vi.fn()}
      />,
    )
    expect(screen.getByText('Extracting details with AI…')).toBeDefined()
  })

  it('shows done state message', () => {
    render(
      <FileUploadZone
        uploadState="done"
        previewUrl={null}
        errorMessage={null}
        onFileSelected={vi.fn()}
      />,
    )
    expect(screen.getByText(/Details extracted/)).toBeDefined()
  })

  it('shows error state message', () => {
    render(
      <FileUploadZone
        uploadState="error"
        previewUrl={null}
        errorMessage={null}
        onFileSelected={vi.fn()}
      />,
    )
    expect(screen.getByText(/Extraction failed/)).toBeDefined()
  })

  it('displays external error message', () => {
    render(
      <FileUploadZone
        uploadState="idle"
        previewUrl={null}
        errorMessage="Something went wrong"
        onFileSelected={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText('Something went wrong')).toBeDefined()
  })

  it('shows image preview when previewUrl is provided', () => {
    render(
      <FileUploadZone
        uploadState="done"
        previewUrl="https://example.com/img.jpg"
        errorMessage={null}
        onFileSelected={vi.fn()}
      />,
    )
    const img = screen.getByAltText('Uploaded preview')
    expect(img).toBeDefined()
    expect((img as HTMLImageElement).src).toContain('example.com')
  })

  it('calls onFileSelected with valid image file', () => {
    const onFileSelected = vi.fn()
    render(
      <FileUploadZone
        uploadState="idle"
        previewUrl={null}
        errorMessage={null}
        onFileSelected={onFileSelected}
      />,
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('photo.jpg', 'image/jpeg')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('calls onFileSelected with valid PDF file', () => {
    const onFileSelected = vi.fn()
    render(
      <FileUploadZone
        uploadState="idle"
        previewUrl={null}
        errorMessage={null}
        onFileSelected={onFileSelected}
      />,
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('menu.pdf', 'application/pdf')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('shows validation error for unsupported file type', () => {
    const onFileSelected = vi.fn()
    render(
      <FileUploadZone
        uploadState="idle"
        previewUrl={null}
        errorMessage={null}
        onFileSelected={onFileSelected}
      />,
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('doc.txt', 'text/plain')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFileSelected).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText(/Unsupported file type/)).toBeDefined()
  })

  it('shows validation error for oversized file', () => {
    const onFileSelected = vi.fn()
    render(
      <FileUploadZone
        uploadState="idle"
        previewUrl={null}
        errorMessage={null}
        onFileSelected={onFileSelected}
      />,
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const bigFile = makeFile('big.jpg', 'image/jpeg', 11 * 1024 * 1024)
    fireEvent.change(input, { target: { files: [bigFile] } })
    expect(onFileSelected).not.toHaveBeenCalled()
    expect(screen.getByText(/too large/)).toBeDefined()
  })

  it('is disabled when disabled prop is true', () => {
    render(
      <FileUploadZone
        uploadState="idle"
        previewUrl={null}
        errorMessage={null}
        onFileSelected={vi.fn()}
        disabled={true}
      />,
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })
})
