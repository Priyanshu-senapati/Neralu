import { useState } from 'react'

export function RecordingPlayer({ src, transcript }: { src: string; transcript: string | null }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="rounded-ui border border-line px-3 py-2">
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>Orientation answer · via voice</span>
        <span>Recording</span>
      </div>
      <div className="mb-2 text-sm">
        {transcript ? <span className="font-semibold">"{transcript}"</span> : <span className="text-muted">Transcription unclear → scored as unclear</span>}
      </div>
      {failed ? (
        <div className="text-xs text-alert">Recording unavailable</div>
      ) : (
        <audio controls preload="none" src={src} className="h-8 w-full" onError={() => setFailed(true)} />
      )}
    </div>
  )
}
