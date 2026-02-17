import { useEffect, useRef } from 'react'

// Barcode scanner emulates keyboard — listens for rapid keystrokes ending in Enter
export function useBarcode(onScan: (barcode: string) => void) {
  const buffer = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && buffer.current.length > 0) {
        onScan(buffer.current)
        buffer.current = ''
        if (timer.current) clearTimeout(timer.current)
        return
      }
      if (e.key.length === 1) {
        buffer.current += e.key
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => { buffer.current = '' }, 150)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onScan])
}
