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
}

export function HostLocationAutocomplete({ value, onChange, onPlaceSelect }: {
  value: string
  onChange: (value: string) => void
  onPlaceSelect: (place: PreviewPlace | null) => void
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const rootRef = useRef<HTMLDivElement>(null)
  const lastQuery = useRef('')
  const [predictions, setPredictions] = useState<PlacePrediction[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
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
    if (!apiKey || query.length < 3 || query === lastQuery.current) {
      if (query.length < 3) { setPredictions([]); setOpen(false) }
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      lastQuery.current = query
      setLoading(true)
      setOpen(true)
      try {
        const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
          },
          body: JSON.stringify({ input: query }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Places autocomplete failed (${response.status})`)
        const data = await response.json() as { suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }> }
        setPredictions((data.suggestions ?? []).flatMap(({ placePrediction }) => placePrediction?.placeId ? [{
          placeId: placePrediction.placeId,
          text: placePrediction.text?.text ?? '',
          mainText: placePrediction.structuredFormat?.mainText?.text ?? placePrediction.text?.text ?? '',
          secondaryText: placePrediction.structuredFormat?.secondaryText?.text ?? '',
        }] : []))
        setActiveIndex(-1)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setPredictions([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [apiKey, value])

  async function selectPrediction(prediction: PlacePrediction) {
    setOpen(false)
    onChange(prediction.text)
    let place: PreviewPlace = { displayName: prediction.mainText, venueName: prediction.mainText, formattedAddress: prediction.text, placeId: prediction.placeId }
    try {
      const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(prediction.placeId)}`, {
        headers: {
          'X-Goog-Api-Key': apiKey ?? '',
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
        },
      })
      if (response.ok) {
        const detail = await response.json() as { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }
        place = {
          displayName: detail.displayName?.text ?? place.displayName,
          venueName: detail.displayName?.text ?? place.venueName,
          formattedAddress: detail.formattedAddress ?? place.formattedAddress,
          placeId: detail.id ?? place.placeId,
          latitude: detail.location?.latitude,
          longitude: detail.location?.longitude,
        }
        onChange(place.formattedAddress)
      }
    } catch { /* The typed address remains usable if place details fail. */ }
    onPlaceSelect(place)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !predictions.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, predictions.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)) }
    if (event.key === 'Escape') setOpen(false)
    if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); void selectPrediction(predictions[activeIndex]) }
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
      onFocus={() => predictions.length && setOpen(true)}
      onChange={event => { onChange(event.target.value); onPlaceSelect(null) }}
    />
    {!apiKey && process.env.NODE_ENV !== 'production' && <small>Autocomplete unavailable — manual location entry remains enabled.</small>}
    {apiKey && open && <div className="sv2-location-suggestions" id="sv2-location-suggestions" role="listbox">
      {loading && <p role="status">Finding places…</p>}
      {!loading && predictions.length === 0 && <p>No places found. Keep typing to use this address.</p>}
      {!loading && predictions.map((prediction, index) => <button
        id={`sv2-place-${index}`}
        key={prediction.placeId}
        type="button"
        role="option"
        aria-selected={activeIndex === index}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => void selectPrediction(prediction)}
      ><strong>{prediction.mainText}</strong><span>{prediction.secondaryText}</span></button>)}
      <footer>Powered by Google</footer>
    </div>}
  </div>
}
