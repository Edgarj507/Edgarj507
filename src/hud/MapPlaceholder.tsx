/** Stand-in for the satellite tile layer (Mapbox / MapKit). Swap for the real map; HUD overlays are independent. */
export function MapPlaceholder() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b1410]" aria-hidden>
      <svg className="h-full w-full" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="rough" cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor="#1a2e22" />
            <stop offset="100%" stopColor="#07100b" />
          </radialGradient>
          <linearGradient id="fairway" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#24422f" />
            <stop offset="100%" stopColor="#2c5238" />
          </linearGradient>
          <pattern id="mow" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
            <rect width="20" height="40" fill="#ffffff" opacity="0.025" />
          </pattern>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0" />
          </filter>
        </defs>

        <rect width="400" height="800" fill="url(#rough)" />
        <path d="M60 520 C 90 380, 200 360, 250 300 S 330 180, 300 120" fill="none" stroke="#0e1d14" strokeWidth="60" strokeLinecap="round" opacity="0.6" />

        {/* Fairway */}
        <path d="M150 760 C 120 620, 150 520, 190 440 C 225 370, 250 300, 235 220 C 225 170, 200 150, 200 150 L 250 150 C 275 190, 300 250, 285 330 C 270 410, 240 470, 240 560 C 240 650, 260 720, 250 760 Z" fill="url(#fairway)" />
        <path d="M150 760 C 120 620, 150 520, 190 440 C 225 370, 250 300, 235 220 C 225 170, 200 150, 200 150 L 250 150 C 275 190, 300 250, 285 330 C 270 410, 240 470, 240 560 C 240 650, 260 720, 250 760 Z" fill="url(#mow)" />

        {/* Hazards */}
        <ellipse cx="300" cy="360" rx="26" ry="14" fill="#c8b98f" opacity="0.35" transform="rotate(-20 300 360)" />
        <ellipse cx="170" cy="150" rx="22" ry="11" fill="#c8b98f" opacity="0.35" />
        <path d="M20 280 C 60 240, 110 250, 120 300 C 128 345, 70 380, 30 350 Z" fill="#0f2a3a" opacity="0.8" />

        {/* Green */}
        <ellipse cx="228" cy="118" rx="44" ry="32" fill="#3a6e48" />
        <circle cx="236" cy="112" r="2.5" fill="#fff" />
        <line x1="236" y1="112" x2="236" y2="88" stroke="#fff" strokeWidth="1.5" />
        <path d="M236 88 l12 4 l-12 4 Z" fill="#ef4444" />

        {/* Tee */}
        <rect x="178" y="712" width="44" height="22" rx="6" fill="#2f5a3c" />

        {/* Shot line: ball → layup target → pin */}
        <path d="M200 560 L 232 330 L 236 112" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="4 5" />
        <circle cx="200" cy="560" r="5" fill="#fff" />
        <circle cx="232" cy="330" r="16" fill="none" stroke="#34d399" strokeWidth="1.5" />
        <circle cx="232" cy="330" r="2.5" fill="#34d399" />

        <rect width="400" height="800" filter="url(#grain)" />
      </svg>
      {/* Legibility scrims for top & bottom overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent via-40% to-black/80" />
    </div>
  );
}
