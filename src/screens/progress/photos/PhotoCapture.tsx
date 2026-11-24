// Taking progress photos: the live camera with a ghost of the last photo of the same
// pose at 35% opacity, so position and distance can be matched, and a 10-second timer.
// Without a live camera, the system camera opens through the file picker, without the
// overlay. Saving moves on to the next pose.

import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fileToBitmap, openCamera, photoPair, stopStream, type Facing } from '../../../adapters/camera'
import { useObjectUrl } from '../../../hooks'
import { lastPhoto, POSE_LABEL, POSES, savePhoto, type Pose } from '../../../store/photos'
import { IconCamera, IconChevronLeft, IconImage, IconRepeat, IconTimer } from '../../../ui/icons'
import { Button, cx, IconButton, Segmented } from '../../../ui/kit'
import { haptic } from '../../../ui/motion'
import { useToast } from '../../../ui/toast'

let audio: AudioContext | null = null
function tick(high = false) {
  try {
    audio ??= new AudioContext()
    void audio.resume()
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.frequency.value = high ? 1320 : 880
    const t = audio.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + (high ? 0.35 : 0.12))
    o.connect(g).connect(audio.destination)
    o.start(t)
    o.stop(t + 0.4)
  } catch {
    // sound is optional
  }
}

export default function PhotoCapture() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const pose = (POSES.includes(params.get('pose') as Pose) ? params.get('pose') : 'front') as Pose
  const video = useRef<HTMLVideoElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<Facing>('user')
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [ghostOn, setGhostOn] = useState(true)
  const [shot, setShot] = useState<{ image: Blob; thumbnail: Blob } | null>(null)
  const ghost = useLiveQuery(async () => (await lastPhoto(pose)) ?? null, [pose])
  const ghostUrl = useObjectUrl(ghost?.image)
  const shotUrl = useObjectUrl(shot?.image)

  useEffect(() => {
    let cancelled = false
    setLive(false)
    setError(null)
    openCamera(facing)
      .then((s) => {
        if (cancelled) return stopStream(s)
        stream.current = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        setLive(true)
      })
      .catch((e: unknown) => setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Camera access was declined.' : 'The live camera is not available here.'))
    return () => {
      cancelled = true
      stopStream(stream.current)
      stream.current = null
    }
  }, [facing])

  const capture = useCallback(async () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    haptic('success')
    setShot(await photoPair(v, v.videoWidth, v.videoHeight, facing === 'user'))
  }, [facing])

  useEffect(() => {
    if (count == null) return
    if (count === 0) {
      tick(true)
      setCount(null)
      void capture()
      return
    }
    tick()
    const t = window.setTimeout(() => setCount((c) => (c == null ? null : c - 1)), 1000)
    return () => window.clearTimeout(t)
  }, [count, capture])

  const fromFile = async (f: File | undefined) => {
    if (!f) return
    const bmp = await fileToBitmap(f)
    setShot(await photoPair(bmp, bmp.width, bmp.height))
    bmp.close()
  }

  const save = async () => {
    if (!shot) return
    const { replaced } = await savePhoto({ pose, ...shot })
    haptic('success')
    toast({ message: `${POSE_LABEL[pose]} photo saved${replaced.length ? ', replacing this week’s earlier one' : ''}` })
    setShot(null)
    const next = POSES[POSES.indexOf(pose) + 1]
    if (next) setParams({ pose: next }, { replace: true })
    else navigate('/progress?tab=photos', { replace: true })
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} playsInline muted autoPlay className={cx('absolute inset-0 size-full object-cover', facing === 'user' && '-scale-x-100', (!live || shot) && 'invisible')} />
        {live && !shot && ghostOn && ghostUrl && <img src={ghostUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-35" />}
        {shotUrl && <img src={shotUrl} alt="The photo just taken" className="absolute inset-0 size-full object-contain" />}
        {count != null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25" aria-live="assertive">
            <span className="text-[120px] font-bold tabular-nums">{count}</span>
          </div>
        )}
        {!live && !shot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <IconCamera size={40} className="opacity-70" />
            <p className="text-[16px] opacity-80">{error ?? 'Starting the camera…'}</p>
            {error && (
              <Button onClick={() => file.current?.click()}>
                <IconImage size={18} /> Use the system camera
              </Button>
            )}
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <IconButton label="Back" className="text-white" onClick={() => navigate('/progress?tab=photos')}>
            <IconChevronLeft />
          </IconButton>
          <div className="min-w-0 flex-1">
            <Segmented size="sm" value={pose} options={POSES.map((p) => ({ value: p, label: POSE_LABEL[p] }))} onChange={(p) => setParams({ pose: p }, { replace: true })} className="!bg-white/15 [&_button[aria-checked=false]]:!text-white" />
          </div>
        </div>
        {live && !shot && (
          <p className="absolute inset-x-0 bottom-3 px-6 text-center text-[13px] opacity-80">
            {ghostUrl ? 'Line yourself up with the faint outline of last time. ' : ''}2.5 m away, phone at chest height, same light and clothes.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-6 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4">
        {shot ? (
          <>
            <Button variant="glass" size="lg" className="!text-white" onClick={() => setShot(null)}>
              Retake
            </Button>
            <Button size="lg" className="flex-1" onClick={() => void save()}>
              Save {POSE_LABEL[pose].toLowerCase()}
            </Button>
          </>
        ) : (
          <>
            <IconButton label={ghostOn ? 'Hide last photo' : 'Show last photo'} className={cx('size-12 text-white', !ghostUrl && 'invisible', ghostOn ? 'bg-white/25' : 'bg-white/10')} onClick={() => setGhostOn(!ghostOn)}>
              <IconImage size={22} />
            </IconButton>
            <button
              type="button"
              aria-label="Take the photo now"
              disabled={!live || count != null}
              onClick={() => void capture()}
              className="press size-[76px] rounded-full border-4 border-white bg-white/30 disabled:opacity-40"
            />
            <div className="flex flex-col gap-2">
              <IconButton label="Take it in 10 seconds" className="size-12 bg-white/15 text-white" disabled={!live || count != null} onClick={() => setCount(10)}>
                <IconTimer size={22} />
              </IconButton>
              <IconButton label="Switch camera" className="size-12 bg-white/15 text-white" onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>
                <IconRepeat size={20} />
              </IconButton>
            </div>
          </>
        )}
      </div>
      <input ref={file} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => void fromFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
    </div>
  )
}
