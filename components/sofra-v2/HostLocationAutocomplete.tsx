'use client'

import { KeyboardEvent, useEffect, useRef, useState } from 'react'

export interface PreviewPlace {
  displayName: string
  formattedAddress: string
  placeId: string
  latitude?: number
  longitude?: number
  venueName?: string
}

interface PlacePrediction {
  placeId: string
  text: string
  mainText: string
  secondaryText: string
  latitude?: number
  longitude?: number
}

export function HostLocationAutocomplete({ value, onChange, onPlaceSelect }: {
  value: string
  onChange: (value: string) => void
  onPlaceSelect: (place: PreviewPlace | null) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lastQuery = useRef('')
  const [predictions, setPredictions] = useState<PlacePrediction[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lookupFailed, setLookupFailed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => {
    const query = value.trim()
    if (query.length < 3 || query === lastQuery.current) {
      if (query.length < 3) {
        setPredictions([])
        setOpen(false)
        setLookupFailed(false)
      }
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      lastQuery.current = query
      setLoading(true)
      setLookupFailed(false)
      setOpen(true)
      try {
        const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Location search failed: HTTP_${response.status}`)
        const data = await response.json() as { results?: PlacePrediction[] }
        if (controller.signal.aborted) return
        setPredictions((data.results ?? []).slice(0, 5))
        setActiveIndex(-1)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setPredictions([])
          setLookupFailed(true)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 450)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [value])

  function selectPrediction(prediction: PlacePrediction) {
    lastQuery.current = prediction.text
    setOpen(false)
    onChange(prediction.text)
    onPlaceSelect({
      displayName: prediction.mainText,
      venueName: prediction.mainText,
      formattedAddress: prediction.text,
      placeId: prediction.placeId,
      latitude: prediction.latitude,
      longitude: prediction.longitude,
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !predictions.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, predictions.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)) }
    if (event.key === 'Escape') setOpen(false)
    if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); selectPrediction(predictions[activeIndex]) }
  }

  return <div className="sv2-location-field" ref={rootRef}>
    <input
      name="location"
      value={value}
      placeholder="Where will you gather?"
      autoComplete="street-address"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls="sv2-location-suggestions"
      aria-activedescendant={activeIndex >= 0 ? `sv2-place-${activeIndex}` : undefined}
      onKeyDown={onKeyDown}
      onFocus={() => (predictions.length || lookupFailed) && setOpen(true)}
      onChange={event => { onChange(event.target.value); onPlaceSelect(null) }}
    />
    {open && <div className="sv2-location-suggestions" id="sv2-location-suggestions" role="listbox">
      {loading && <p role="status">Finding places...</p>}
      {!loading && lookupFailed && <p>Suggestions are unavailable. Keep typing to use this address.</p>}
      {!loading && !lookupFailed && predictions.length === 0 && <p>No places found. Keep typing to use this address.</p>}
      {!loading && predictions.map((prediction, index) => <button
        id={`sv2-place-${index}`}
        key={prediction.placeId}
        type="button"
        role="option"
        aria-selected={activeIndex === index}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => selectPrediction(prediction)}
      ><strong>{prediction.mainText}</strong><span>{prediction.secondaryText}</span></button>)}
      <footer>Search by <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></footer>
    </div>}
  </div>
}
