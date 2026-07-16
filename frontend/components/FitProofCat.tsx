import type { CSSProperties } from 'react'

export type FitProofCatPose = 'checking' | 'thinking' | 'result' | 'empty' | 'error'

export interface FitProofCatProps {
  /** The small story the mascot should tell in its current context. */
  pose?: FitProofCatPose
  /** Rendered square size in pixels or any valid CSS length. */
  size?: number | string
  className?: string
  title?: string
}

const LINE = '#1a1a1a'
const TEAL = '#20CDB6'
const DEEP_TEAL = '#0B6E63'

function PoseContent({ pose }: { pose: FitProofCatPose }) {
  if (pose === 'checking') {
    return (
      <>
        <g transform="translate(135 89)"><g className="fp-cat-prop fp-cat-magnifier">
          <circle cx="0" cy="0" r="22" fill="white" />
          <circle cx="0" cy="0" r="15" fill="#E1F5EE" stroke="none" />
          <path d="M15 16 28 29" />
          <path d="M-7-5c5-5 12-5 17 0M-10 4c4 4 9 5 14 3" stroke={TEAL} strokeWidth="2.6" />
        </g></g>
        <g transform="rotate(-8 103 150)"><g className="fp-cat-prop">
          <path d="M68 126h55l-9 48H59z" fill="#343a3e" />
          <path d="M69 126h54l-9 48H59z" fill="none" />
          <path d="M79 136h28M76 143h25" stroke="#E1F5EE" strokeWidth="2.5" />
        </g></g>
        <path d="M75 140c8 13 19 12 26 3" />
        <path d="M116 128c9 3 16 10 18 19" />
      </>
    )
  }

  if (pose === 'thinking') {
    return (
      <>
        <g transform="translate(42 53)"><g className="fp-cat-prop fp-cat-question">
          <path d="M-8-8c1-11 19-12 20 1 0 8-9 9-9 16" stroke={DEEP_TEAL} strokeWidth="6" />
          <circle cy="18" r="3.6" fill={DEEP_TEAL} stroke="none" />
        </g></g>
        <g transform="rotate(8 138 137)"><g className="fp-cat-prop">
          <path d="M126 118h31l-4 43h-33z" fill="#343a3e" />
          <path d="M126 118h31l-4 43h-33z" fill="none" />
          <circle cx="142" cy="129" r="3" fill={LINE} stroke="none" />
        </g></g>
        <path d="M97 116c9 1 11 11 6 18-5 7-9 10-18 10" />
        <path d="M91 144c10 12 27 8 33-6l4-13" />
      </>
    )
  }

  if (pose === 'result') {
    return (
      <>
        <g transform="rotate(-2 76 144)"><g className="fp-cat-prop fp-cat-board">
          <rect x="27" y="111" width="76" height="70" rx="6" fill="white" />
          <circle cx="65" cy="133" r="12" fill={TEAL} />
          <path d="m58 133 5 5 10-11" stroke="white" strokeWidth="3.8" />
          <path d="M46 155h40M51 164h30" stroke={DEEP_TEAL} strokeWidth="3" />
        </g></g>
        <path d="M29 132c-12 0-15 20-3 23 5 2 8-1 8-1" />
        <g transform="translate(145 110)"><g className="fp-cat-prop fp-cat-thumb">
          <path d="M-1 32c-8-2-12-10-9-17l8-18c2-5 9-3 8 2l-2 9h15c9 0 9 15 0 15H8c-1 6-4 10-9 9Z" fill="white" />
        </g></g>
      </>
    )
  }

  if (pose === 'empty') {
    return (
      <>
        <g transform="translate(74 132)"><g className="fp-cat-prop fp-cat-folder">
          <path d="M-25-7h18l6 6H27v34H-25z" fill="#E1F5EE" />
          <path d="M-25 4H27" stroke={TEAL} strokeWidth="3" />
        </g></g>
        <path d="M69 134c-9 5-15 13-15 22" />
        <path d="M112 137c10 2 15 10 15 18" />
        <path d="M86 101c4 5 10 5 14 0" />
      </>
    )
  }

  return (
    <>
      <g transform="translate(0 6)"><g className="fp-cat-prop fp-cat-cable">
        <path d="M18 178c31-21 39 25 68 10 20-10 27-29 47-14 15 12 27 6 45-5" stroke={DEEP_TEAL} strokeWidth="3" />
        <path d="M174 168h12v14h-12z" fill="#E1F5EE" />
        <path d="M178 172v6M182 172v6" stroke={DEEP_TEAL} strokeWidth="1.8" />
      </g></g>
      <g className="fp-cat-error-arm">
        <path d="M72 151c10 12 23 12 31 4" />
        <path d="M113 153c10-4 18-13 20-22" />
      </g>
      <path d="M84 106c4 5 9 5 13 0M105 106c4 5 9 5 13 0" />
    </>
  )
}

function Face({ pose }: { pose: FitProofCatPose }) {
  const isThinking = pose === 'thinking'
  const isError = pose === 'error'

  return (
    <g className="fp-cat-face">
      <g className="fp-cat-eyes">
        {isThinking ? (
          <><ellipse cx="83" cy="85" rx="4.5" ry="8" fill={LINE} /><ellipse cx="113" cy="82" rx="4.5" ry="8" fill={LINE} /></>
        ) : isError ? (
          <><path d="m77 86 8 7M85 86l-8 7M108 84l8 7M116 84l-8 7" /><path d="M92 103q8-5 16 0" /></>
        ) : (
          <><ellipse cx="82" cy="86" rx="4.5" ry="8" fill={LINE} /><ellipse cx="112" cy="86" rx="4.5" ry="8" fill={LINE} /></>
        )}
      </g>
      <ellipse cx="97" cy="98" rx="5" ry="3.4" fill={LINE} stroke="none" />
      {pose === 'checking' ? <path d="M90 110q7-5 14 0" /> : <path d="M87 108q5 9 10 1 6 8 12-1" />}
      <path d="M57 91l14 3M57 100l14-4M123 94l14-3M123 100l14 4" strokeWidth="3.2" />
    </g>
  )
}

/**
 * FitProof's reusable line-art cat. The head, body, tail and face stay stable;
 * poses only add small arm, prop and expression layers so visual changes remain cheap.
 */
export default function FitProofCat({ pose = 'checking', size = 150, className, title }: FitProofCatProps) {
  const label = title ?? `FitProof mascot: ${pose}`
  const dimension: CSSProperties = { width: size, height: size }

  return (
    <svg
      className={['fp-cat', className].filter(Boolean).join(' ')}
      style={dimension}
      viewBox="0 0 200 220"
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>{`
        .fp-cat { --fp-line: ${LINE}; --fp-teal: ${TEAL}; --fp-deep-teal: ${DEEP_TEAL}; overflow: visible; }
        .fp-cat .fp-cat-breathe { transform-box: fill-box; transform-origin: center; animation: fp-cat-breathe 3.2s ease-in-out infinite; }
        .fp-cat .fp-cat-tail { transform-box: fill-box; transform-origin: 43px 158px; animation: fp-cat-tail 2.5s ease-in-out infinite; }
        .fp-cat .fp-cat-eyes { transform-box: fill-box; transform-origin: center; animation: fp-cat-blink 5.2s ease-in-out infinite; }
        .fp-cat .fp-cat-prop { transform-box: fill-box; transform-origin: center; animation: fp-cat-prop 2.7s ease-in-out infinite; }
        .fp-cat .fp-cat-question { animation-duration: 2.1s; }
        .fp-cat .fp-cat-thumb { animation-duration: 2.3s; }
        .fp-cat .fp-cat-error-arm { transform-box: fill-box; transform-origin: center; animation: fp-cat-fluster 1.5s ease-in-out infinite; }
        @keyframes fp-cat-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.018); } }
        @keyframes fp-cat-tail { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(7deg); } }
        @keyframes fp-cat-blink { 0%, 44%, 48%, 100% { transform: scaleY(1); } 46% { transform: scaleY(.12); } }
        @keyframes fp-cat-prop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes fp-cat-fluster { 0%, 100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }
        @media (prefers-reduced-motion: reduce) { .fp-cat * { animation: none !important; } }
      `}</style>
      <g className="fp-cat-breathe" fill="none" stroke={LINE} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Shared skeleton: one tail, body, head and face for every pose. */}
        <path className="fp-cat-tail" d="M59 163c-24 7-37-15-26-27 8-9 18-1 14 9-3 11 7 15 16 10" fill="white" />
        <path d="M55 163c-4-37 7-61 31-66 29-7 56 10 58 44l1 39c0 13-48 15-83 5-11-3-10-13-7-22Z" fill="white" />
        <path d="M68 184c-3 9 1 16 15 16s18-5 16-14M118 185c-3 10 2 15 16 15 13 0 17-6 13-15" fill="none" />
        <path d="M55 85c-1-18 4-42 18-47 12-4 20 8 23 20 10-5 22-5 33 0 4-14 13-26 24-20 12 7 16 29 15 47 5 20-5 38-24 43-28 8-66 3-82-13-9-9-10-19-7-30Z" fill="white" />
        <path d="M55 85l-7-3M55 91l-8-2M166 85l7-3M165 92l8-2" strokeWidth="3" />
        <Face pose={pose} />
        <PoseContent pose={pose} />
      </g>
    </svg>
  )
}
