// Files leave the app through the iOS share sheet (Save to Files puts them in iCloud
// Drive). A plain download inside an installed web app can strand the user on an
// "Open in" screen (WebKit bug 290847), so download is only the fallback.

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files })
  } catch {
    return false
  }
}

export async function shareFiles(files: File[], title: string): Promise<ShareOutcome> {
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files, title })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // NotAllowedError and friends: fall back to a download
    }
  }
  for (const f of files) download(f)
  return 'downloaded'
}

export function download(file: Blob & { name?: string }, name = file.name ?? 'download'): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
