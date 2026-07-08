import { useEffect, useRef, useCallback } from 'react'

type MessageHandler = (event: { type: string; pad: string; data: unknown }) => void

export function useWebSocket(onMessage: MessageHandler) {
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${window.location.host}/ws`
    ws.current = new WebSocket(url)

    ws.current.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        onMessage(msg)
      } catch {/* ignore */}
    }

    ws.current.onclose = () => {
      reconnectTimeout.current = setTimeout(connect, 3000)
    }

    ws.current.onerror = () => {
      ws.current?.close()
    }
  }, [onMessage])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
      ws.current?.close()
    }
  }, [connect])
}
