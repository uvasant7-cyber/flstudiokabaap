interface BeatbotMarkProps {
  size?: number
  monochrome?: boolean
  className?: string
}

/** A compact original mark: rhythm grid, sound wave, and an assistant core. */
export function BeatbotMark({ size = 24, monochrome = false, className }: BeatbotMarkProps) {
  const accent = monochrome ? 'currentColor' : 'url(#beatbot-gradient)'
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" fill="none">
      {!monochrome && <defs><linearGradient id="beatbot-gradient" x1="5" y1="4" x2="27" y2="28" gradientUnits="userSpaceOnUse"><stop stopColor="#49b8ff" /><stop offset="1" stopColor="#8d6cff" /></linearGradient></defs>}
      <rect x="3.5" y="3.5" width="25" height="25" rx="7" stroke={accent} strokeWidth="2" />
      <path d="M8 18h3l2.3-6 3.4 11L19 15l2 3h3" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="9" r="1.2" fill={accent} /><circle cx="16" cy="9" r="1.2" fill={accent} /><circle cx="22" cy="9" r="1.2" fill={accent} />
    </svg>
  )
}
