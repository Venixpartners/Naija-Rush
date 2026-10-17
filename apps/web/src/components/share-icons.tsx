/* Simple generic glyphs. We avoid reproducing platform logos; buttons carry
   the platform name as text so they stay recognisable and accessible. */
const s = { width: 26, height: 26, viewBox: "0 0 24 24", "aria-hidden": true } as const;

export const IconChat = ({ color = "#19D3A2" }) => (
  <svg {...s}>
    <path d="M4 4h16v12H8l-4 4z" fill={color} />
  </svg>
);
export const IconCamera = ({ color = "#FF4D2E" }) => (
  <svg {...s}>
    <rect x="3" y="6" width="18" height="14" rx="4" fill={color} />
    <circle cx="12" cy="13" r="4" fill="#120D09" />
    <rect x="8" y="3" width="8" height="4" rx="1.5" fill={color} />
  </svg>
);
export const IconNote = ({ color = "#FFF6E0" }) => (
  <svg {...s}>
    <path d="M14 3v11.5a3.5 3.5 0 1 1-2-3.16V3h2z" fill={color} />
    <path d="M14 3c0 2.5 2 4.5 4.5 4.5V10C16.5 10 15 9 14 8z" fill={color} />
  </svg>
);
export const IconGhost = ({ color = "#FFC800" }) => (
  <svg {...s}>
    <path d="M12 3c3.6 0 6 2.6 6 6v4l2 2-3 1-1 2-2-1-2 2-2-2-2 1-1-2-3-1 2-2V9c0-3.4 2.4-6 6-6z" fill={color} />
  </svg>
);
export const IconShare = ({ color = "#FFF6E0" }) => (
  <svg {...s}>
    <path d="M12 3l5 5h-3v7h-4V8H7z" fill={color} />
    <path d="M4 13v6h16v-6" stroke={color} strokeWidth="2" fill="none" />
  </svg>
);
export const IconLink = ({ color = "#FFF6E0" }) => (
  <svg {...s}>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" />
  </svg>
);
export const IconDownload = ({ color = "#FFF6E0" }) => (
  <svg {...s}>
    <path d="M12 3v11m0 0l-4-4m4 4l4-4M4 19h16" stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" />
  </svg>
);
