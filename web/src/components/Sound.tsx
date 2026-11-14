import { useRef, useState } from 'react'
import '../vendor/space-ambience.js'

/** Sound button: generated space ambience (Web Audio), built only on first click (browser autoplay rules). */
export function SoundButton() {
  const amb = useRef<SpaceAmbienceInstance | null>(null)
  const [on, setOn] = useState(false)
  const toggle = () => {
    if (!amb.current) amb.current = new window.SpaceAmbience()
    setOn(amb.current.toggle())
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={on} aria-label={on ? 'Turn space sound off' : 'Turn space sound on'}
      className="flex h-11 cursor-pointer items-center gap-2.5 rounded-[22px] border border-white/[.18] bg-white/[.06] px-[18px] text-[12px] text-ink">
      <span aria-hidden="true" className="flex h-3.5 items-center gap-[2px]">
        {['eqA', 'eqB', 'eqC', 'eqA'].map((k, i) => (
          <span key={i} className="eq-bar h-3.5 w-[2px] rounded-[1px] bg-amber" style={{ animation: on ? `${k} 1.1s ease-in-out infinite` : 'none' }} />
        ))}
      </span>
      <span className="max-[760px]:hidden">{on ? 'Sound on' : 'Sound off'}</span>
    </button>
  )
}
