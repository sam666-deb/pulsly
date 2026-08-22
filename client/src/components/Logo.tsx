export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="9" fill="#0f8a76" />
      <path
        d="M6 16h4l4-9 4 18 4-9h4"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Brand({ size = 28 }: { size?: number }) {
  return (
    <span className="brand-lockup">
      <Logo size={size} />
      <span className="brand-word">Pulsly</span>
    </span>
  );
}
