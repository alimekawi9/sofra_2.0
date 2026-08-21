'use client'

export function PrintPreviewActions({ label, onBack }: { label: string; onBack?: () => void }) {
  return (
    <div className="sv2-print-preview-actions" data-print-hidden="true">
      {onBack && <button type="button" className="sv2-print-preview-back" onClick={onBack}>BACK</button>}
      <button type="button" className="sv2-menu-design-confirm" onClick={() => window.print()}>{label}</button>
      <p className="sv2-mobile-print-help">
        On iPhone or iPad, if the print sheet does not open, tap the browser Share button and choose Print.
      </p>
    </div>
  )
}
