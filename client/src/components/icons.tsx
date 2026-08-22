type IconProps = { crossedOut?: boolean };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Slash() {
  return <line x1="3" y1="3" x2="21" y2="21" />;
}

export function MicIcon({ crossedOut }: IconProps) {
  return (
    <svg {...base} width="20" height="20" aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
      {crossedOut && <Slash />}
    </svg>
  );
}

export function CameraIcon({ crossedOut }: IconProps) {
  return (
    <svg {...base} width="20" height="20" aria-hidden="true">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M16 10l6-4v12l-6-4" />
      {crossedOut && <Slash />}
    </svg>
  );
}

export function ScreenShareIcon() {
  return (
    <svg {...base} width="20" height="20" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
      <path d="M9 11l3-3 3 3" />
      <line x1="12" y1="8" x2="12" y2="13" />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg {...base} width="20" height="20" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="4" />
      <path d="M8 17l-2 4 5-4" />
    </svg>
  );
}

export function LeaveIcon() {
  return (
    <svg {...base} width="20" height="20" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg {...base} width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function SmileIcon() {
  return (
    <svg {...base} width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg {...base} width="18" height="18" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
