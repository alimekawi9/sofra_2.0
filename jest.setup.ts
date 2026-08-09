import '@testing-library/jest-dom'

// jsdom has no PointerEvent constructor, so fireEvent.pointerDown/Up would
// otherwise dispatch events with clientX/clientY stuck at undefined.
if (typeof window !== 'undefined' && typeof (window as unknown as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill
}
