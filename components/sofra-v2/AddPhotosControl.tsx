'use client'

import { useId, useState } from 'react'
import { MAX_UPLOAD_BATCH, MAX_ALBUM_PHOTOS, validateUploadBatch } from '@/lib/shared-album'

export interface AddPhotosControlProps {
  disabled?: boolean
  label?: string
  currentCount: number
  onFilesConfirmed: (files: File[], caption: string) => void
}

export function AddPhotosControl({ disabled, label = 'ADD PHOTOS', currentCount, onFilesConfirmed }: AddPhotosControlProps) {
  const inputId = useId()
  const [selected, setSelected] = useState<File[]>([])
  const [caption, setCaption] = useState('')
  const [validationError, setValidationError] = useState('')
  const remaining = MAX_ALBUM_PHOTOS - currentCount
  const albumFull = remaining <= 0

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    const result = validateUploadBatch(list.length, currentCount)
    if (!result.ok) {
      setValidationError(result.message ?? 'Choose fewer photos.')
      return
    }
    setValidationError('')
    setSelected(list)
    setCaption('')
  }

  function cancel() {
    setSelected([])
    setCaption('')
  }

  function confirm() {
    onFilesConfirmed(selected, caption)
    setSelected([])
    setCaption('')
  }

  return (
    <>
      {albumFull ? (
        <p className="sv2-add-photos-full">This album is full — up to {MAX_ALBUM_PHOTOS} photos per event.</p>
      ) : (
        <label className="sv2-add-photos-trigger" htmlFor={inputId}>
          {label}
          <input
            id={inputId}
            aria-label={label}
            type="file"
            accept="image/*"
            multiple
            disabled={disabled}
            onChange={(e) => {
              handleFilesSelected(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      )}
      {validationError && (
        <p role="alert" className="sv2-add-photos-error">{validationError}</p>
      )}

      {selected.length > 0 && (
        <div className="sv2-add-photos-sheet" role="dialog" aria-label="Add a note to these photos">
          <div className="sv2-add-photos-sheet-body">
            <p className="sv2-add-photos-count">
              {selected.length} {selected.length === 1 ? 'photo' : 'photos'} selected
            </p>
            <label className="sv2-add-photos-note-label" htmlFor={`${inputId}-caption`}>
              Say something about these (optional)
            </label>
            <textarea
              id={`${inputId}-caption`}
              value={caption}
              maxLength={280}
              placeholder="Add a note"
              onChange={(e) => setCaption(e.target.value)}
            />
            <div className="sv2-add-photos-sheet-actions">
              <button type="button" onClick={cancel}>CANCEL</button>
              <button type="button" onClick={confirm}>
                UPLOAD {selected.length} {selected.length === 1 ? 'PHOTO' : 'PHOTOS'}
              </button>
            </div>
          </div>
        </div>
      )}
      {!albumFull && <p className="sv2-sr-only">Up to {MAX_UPLOAD_BATCH} photos per upload, {MAX_ALBUM_PHOTOS} per event.</p>}
    </>
  )
}
