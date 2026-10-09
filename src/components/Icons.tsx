// Простые значки для навигации (линии, цвет берётся из текста).

import type { ComponentChildren } from 'preact';

function Svg({ children }: { children: ComponentChildren }) {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconToday = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const IconWeek = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const IconHomework = () => (
  <Svg>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
);

export const IconNotes = () => (
  <Svg>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M14 3v5h5M9 13h7M9 17h5" />
  </Svg>
);

export const IconMore = () => (
  <Svg>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </Svg>
);

export const IconChevronLeft = () => (
  <Svg>
    <path d="m15 6-6 6 6 6" />
  </Svg>
);

export const IconChevronRight = () => (
  <Svg>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);
