import { useEffect } from 'react'

type Shortcut = { key: string; ctrlKey?: boolean; handler: () => void }

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      for (const s of shortcuts) {
        if (e.key === s.key && !!s.ctrlKey === e.ctrlKey) {
          e.preventDefault()
          s.handler()
        }
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [shortcuts])
}
