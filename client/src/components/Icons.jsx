const PATHS = {
  folder: (
    <>
      <path d="M3.5 6.5h6l1.7 2h9.3v9.2a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3Z" />
      <path d="M3.5 8.5h17" />
    </>
  ),
  edit: (
    <>
      <path d="M5 19h4.2L19.7 8.5a2.1 2.1 0 0 0-3-3L6.2 16H5Z" />
      <path d="m14.8 7.3 2.9 2.9" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h7l3.5 3.5v13.5H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
      <path d="M14 3.5V7h3.5" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15.5h5" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <path d="M4 9h16" />
      <path d="M8 13h.1" />
      <path d="M12 13h.1" />
      <path d="M16 13h.1" />
      <path d="M8 17h.1" />
      <path d="M12 17h.1" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="3" />
      <path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      <path d="M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  listCheck: (
    <>
      <path d="m4 7 1.5 1.5L8.5 5" />
      <path d="M11 7h9" />
      <path d="m4 14 1.5 1.5L8.5 12" />
      <path d="M11 14h9" />
      <path d="M11 20h9" />
    </>
  ),
  quote: (
    <>
      <path d="M8 11H5.5A3.5 3.5 0 0 1 9 7.5V6a5 5 0 0 0-5 5v5h4Z" />
      <path d="M18 11h-2.5A3.5 3.5 0 0 1 19 7.5V6a5 5 0 0 0-5 5v5h4Z" />
    </>
  ),
  journal: (
    <>
      <path d="M7 4.5h9.5A2.5 2.5 0 0 1 19 7v13H7a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
      <path d="M8.5 8h7" />
      <path d="M8.5 11.5h5" />
      <path d="M7 20a2 2 0 0 1 0-4h12" />
    </>
  ),
  idea: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M8.6 14.2a6.2 6.2 0 1 1 6.8 0c-.8.6-1.4 1.4-1.4 2.3h-4c0-.9-.6-1.7-1.4-2.3Z" />
    </>
  ),
  timer: (
    <>
      <path d="M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
      <path d="M12 9.5v4l2.8 1.7" />
      <path d="M9 3h6" />
    </>
  ),
  ai: (
    <>
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.9L12 18.5l-1.8-5.8-5.7-1.9L10.2 9Z" />
      <path d="M18.5 16.5 19.2 19l2.3.7-2.3.8-.7 2.3-.8-2.3-2.2-.8 2.2-.7Z" />
    </>
  ),
  life: (
    <>
      <path d="M12 20s-7-4.4-7-10.2A3.9 3.9 0 0 1 12 7.5a3.9 3.9 0 0 1 7 2.3C19 15.6 12 20 12 20Z" />
      <path d="M12 7.5V20" />
    </>
  ),
  sun: (
    <>
      <path d="M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m4.9 19.1 1.4-1.4" />
      <path d="m17.7 6.3 1.4-1.4" />
    </>
  ),
  moon: (
    <path d="M20 15.2A8 8 0 0 1 8.8 4a7 7 0 1 0 11.2 11.2Z" />
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 20V10" />
      <path d="m8 14 4-4 4 4" />
      <path d="M5 5h14" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 16V6.5A1.5 1.5 0 0 1 6.5 5H16" />
    </>
  ),
  graph: (
    <>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <circle cx="10" cy="18" r="2.5" />
      <path d="m8.4 8.1 7.2-.6" />
      <path d="m7.2 9.2 2 6.5" />
      <path d="m16.5 10.1-5 6" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  back: (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  play: (
    <path d="M8 5.5v13l11-6.5Z" />
  ),
  video: (
    <>
      <rect x="4" y="7" width="11" height="10" rx="2" />
      <path d="m15 10 5-3v10l-5-3Z" />
    </>
  ),
  thought: (
    <>
      <path d="M9.5 17.5h5A4.5 4.5 0 1 0 13.8 9 5.5 5.5 0 1 0 9.5 17.5Z" />
      <path d="M8 20h.1" />
      <path d="M5.5 18.5h.1" />
    </>
  ),
  question: (
    <>
      <path d="M9.5 9a2.8 2.8 0 1 1 4.7 2c-1.2 1-2.2 1.7-2.2 3.2" />
      <path d="M12 18h.1" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  alert: (
    <>
      <path d="M12 8v5" />
      <path d="M12 17h.1" />
      <path d="M10.3 4.8 3.5 17a2 2 0 0 0 1.7 3h13.6a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 5-4.8 2 2.2-5Z" />
    </>
  ),
  synthesis: (
    <>
      <path d="M7 7h10" />
      <path d="M7 12h10" />
      <path d="M7 17h10" />
      <path d="M4 7h.1" />
      <path d="M4 12h.1" />
      <path d="M4 17h.1" />
    </>
  ),
  timeline: (
    <>
      <path d="M4 12h16" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 6v4" />
      <path d="M12 14v4" />
      <path d="M18 6v4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-.9 4.5" />
      <path d="M20 5v6h-6" />
    </>
  ),
}

export default function Icon({ name, size = 20, className = '' }) {
  return (
    <svg
      className={`material-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] || PATHS.ai}
    </svg>
  )
}
