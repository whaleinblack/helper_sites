export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4c9be8" />
          <stop offset="1" stopColor="#1f5f9e" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#logo-g)" />
      <path d="M12 19.5a4 4 0 0 1 4-4h6l3 3h7a4 4 0 0 1 4 4V32a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" fill="#fff" opacity="0.95" />
      <path d="M24 32v-9m0 0l-4 4m4-4l4 4" stroke="#2d79bf" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
