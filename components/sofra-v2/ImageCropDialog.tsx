'use client'

import { useEffect, useState } from 'react'

export interface ImageCropDialogProps {
  file: File
  title: string
  aspectRatio: number
  outputWidth: number
  outputHeight: number
  onCancel: () => void
  onConfirm: (file: File) => void
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image-load-failed'))
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image-export-failed')), 'image/jpeg', 0.92)
  })
}

export function calculateCoverCrop({
  sourceWidth,
  sourceHeight,
  outputWidth,
  outputHeight,
  zoom,
  horizontal,
  vertical,
}: {
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
  zoom: number
  horizontal: number
  vertical: number
}) {
  const coverScale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight)
  const scale = coverScale * zoom
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  const overflowX = Math.max(0, width - outputWidth)
  const overflowY = Math.max(0, height - outputHeight)
  return {
    x: overflowX === 0 || horizontal === 0 ? 0 : -(horizontal / 100) * overflowX,
    y: overflowY === 0 || vertical === 0 ? 0 : -(vertical / 100) * overflowY,
    width,
    height,
  }
}

export function ImageCropDialog({
  file,
  title,
  aspectRatio,
  outputWidth,
  outputHeight,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const [sourceUrl, setSourceUrl] = useState('')
  const [zoom, setZoom] = useState(1)
  const [horizontal, setHorizontal] = useState(50)
  const [vertical, setVertical] = useState(50)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSourceUrl(url)
    return () => {
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
    }
  }, [file])

  async function confirm() {
    if (!sourceUrl || processing) return
    setProcessing(true)
    setError('')
    try {
      const image = await loadImage(sourceUrl)
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outputHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas-unavailable')

      const crop = calculateCoverCrop({
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
        outputWidth,
        outputHeight,
        zoom,
        horizontal,
        vertical,
      })
      context.drawImage(image, crop.x, crop.y, crop.width, crop.height)
      const blob = await canvasBlob(canvas)
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
      onConfirm(new File([blob], `${baseName}-cropped.jpg`, { type: 'image/jpeg', lastModified: Date.now() }))
    } catch {
      setError('Could not crop this image. Try another image or try again.')
      setProcessing(false)
    }
  }

  return (
    <div className="sv2-image-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="sv2-image-crop-title">
      <div className="sv2-image-crop-panel">
        <h2 id="sv2-image-crop-title">{title}</h2>
        <p>Zoom and reposition the image before uploading.</p>
        <div className="sv2-image-crop-viewport" style={{ aspectRatio }}>
          {sourceUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sourceUrl} alt="Crop preview" style={{ objectPosition: `${horizontal}% ${vertical}%`, transform: `scale(${zoom})` }} />
          )}
        </div>
        <label>Zoom<input aria-label="Image zoom" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <label>Move left or right<input aria-label="Horizontal image position" type="range" min="0" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))} /></label>
        <label>Move up or down<input aria-label="Vertical image position" type="range" min="0" max="100" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} /></label>
        <button type="button" className="sv2-image-crop-reset" onClick={() => { setZoom(1); setHorizontal(50); setVertical(50) }}>RESET TO CENTER</button>
        {error && <p role="alert" className="sv2-image-crop-error">{error}</p>}
        <div className="sv2-image-crop-actions">
          <button type="button" onClick={onCancel} disabled={processing}>CANCEL</button>
          <button type="button" onClick={() => void confirm()} disabled={processing || !sourceUrl}>{processing ? 'CROPPING…' : 'USE THIS CROP'}</button>
        </div>
      </div>
    </div>
  )
}
