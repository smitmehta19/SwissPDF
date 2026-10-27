// Line-drawn icon set (24px grid, 1.6 stroke). Geometric and document-derived
// so the tool grid reads as one system rather than a pile of pictograms.
const P = {
  merge: 'M4 6h6l4 6 4-6h2M4 18h6l4-6M18 8l3 4-3 4',
  split: 'M20 6h-6l-4 6-4-6H4M20 18h-6l-4-6M6 8l-3 4 3 4',
  extract: 'M5 4h9l5 5v5M5 4v16h6M9 9h4M9 13h2M15 17h6M18 14l3 3-3 3',
  remove: 'M5 4h9l5 5v11H5zM14 4v5h5M9 12h6M9 16h3',
  organize: 'M4 5h6v6H4zM14 5h6v6h-6zM4 13h6v6H4zM14 13h6v6h-6z',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4L16 11l4 4M9 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z',
  camera: 'M4 7h4l1.5-2h5L16 7h4v12H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  word: 'M5 4h9l5 5v11H5zM14 4v5h5M8 12l1.5 5 1.5-4 1.5 4L14 12',
  excel: 'M5 4h9l5 5v11H5zM14 4v5h5M9 12l5 5M14 12l-5 5',
  ppt: 'M5 4h9l5 5v11H5zM14 4v5h5M9 17v-5h2.5a1.75 1.75 0 0 1 0 3.5H9',
  markdown: 'M3 6h18v12H3zM6 15V9l3 3 3-3v6M17 9v6M17 15l-2-2M17 15l2-2',
  html: 'M9 8l-4 4 4 4M15 8l4 4-4 4',
  compress: 'M12 3v6M12 21v-6M8 7l4-4 4 4M8 17l4 4 4-4M4 12h16',
  repair: 'M14.5 4a4.5 4.5 0 0 0-4 6.6L4 17.1V20h2.9l6.5-6.5A4.5 4.5 0 1 0 14.5 4z',
  ocr: 'M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M8 9h8M8 12h8M8 15h5',
  compare: 'M12 4v16M6 8H4v8h2M18 8h2v8h-2M9 12H6M18 12h-3',
  edit: 'M4 20h4l10-10-4-4L4 16zM14 6l4 4M14 20h6',
  forms: 'M5 4h14v16H5zM8 9h8M8 13h5M15.5 16.5l1.5 1.5 3-3',
  watermark: 'M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10z',
  numbers: 'M5 5h14v14H5zM8 16h8M9 11l1-1v4',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  redact: 'M4 5h16v6H4zM7 15h10M7 19h6',
  sign: 'M3 18c4 0 4-9 7-9s2 7 5 7 3-4 6-4M3 21h18',
  lock: 'M6 11h12v9H6zM9 11V7.5a3 3 0 0 1 6 0V11',
  unlock: 'M6 11h12v9H6zM9 11V7.5a3 3 0 0 1 5.6-1.5',
  health: 'M3 12h4l2-6 3 12 2.5-6H21',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l5 5',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  shield: 'M12 3l8 3v6c0 5-3.5 7.7-8 9-4.5-1.3-8-4-8-9V6z',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z',
  auto: 'M12 3a9 9 0 0 0 0 18zM12 3a9 9 0 0 1 0 18',
  home: 'M4 11l8-7 8 7M6 10v9h12v-9',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  star: 'M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  files: 'M8 3h8l4 4v10H8zM16 3v4h4M4 7v14h12',
  viewer: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  pages: 'M4 4h7v9H4zM13 4h7v9h-7zM4 15h7v5H4zM13 15h7v5h-7z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  duplicate: 'M8 8h11v12H8zM5 16V4h11',
  blank: 'M6 3h9l4 4v14H6zM12 11v6M9 14h6',
  // U5-B structure tools
  bookmark: 'M7 4h10v16l-5-4-5 4z',
  tag: 'M4 4h7l9 9-7 7-9-9zM8 8h1',
  attach: 'M16 7l-7.5 7.5a2 2 0 0 0 3 3L19 10a4 4 0 0 0-6-6l-7.5 7.5a6 6 0 0 0 8.5 8.5L20 14',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
  annotoff: 'M4 5h16v11H9l-5 4zM3 3l18 18',
  imageoff: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4M3 3l18 18',
  sanitize: 'M12 3v9M7 12h10l2 9H5zM9 17v4M15 17v4',
  flatten: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  key: 'M8 19a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM10.8 12.2L20 3M16 7l3 3M18 5l2 2',
  rename: 'M4 7h10M4 12h7M4 17h10M17 5v14M15 5h4M15 19h4',
  formunlock: 'M4 4h16v6H4zM7 7h6M7 14h5v6H7zM15 17v-2a2 2 0 0 1 4 0',
  script: 'M9 7l-5 5 5 5M15 7l5 5-5 5M13.5 5l-3 14',
  images: 'M3 7h14v12H3zM7 3h14v12M3 15l4-4 4 4 2-2 4 4',
  // S2 shell: palette, viewer, reader, page editor
  command: 'M4 6h16v12H4zM7 10h1M10.5 10h1M14 10h1M17 10h0M7 14h10',
  first: 'M17 6l-6 6 6 6M7 6v12',
  last: 'M7 6l6 6-6 6M17 6v12',
  zoomin: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l5 5M8 11h6M11 8v6',
  zoomout: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l5 5M8 11h6',
  fitwidth: 'M4 5v14M20 5v14M8 12h8M10 9l-3 3 3 3M14 9l3 3-3 3',
  thumbs: 'M4 4h16v16H4zM9 4v16M5.5 7h2M5.5 11h2M5.5 15h2',
  reader: 'M3 5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H3zM21 5h-6a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H21z',
  cut: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9L20 18M8.1 16.1L20 6',
  redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h3',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  exit: 'M9 4H5v16h4M15 8l4 4-4 4M19 12H9',
  selectall: 'M4 4h16v16H4zM8.5 12l2.5 2.5 4.5-5',
  automate: 'M4 4h6v5H4zM7 9v7.5h6M11 14.5l2 2-2 2M14 14h6v5h-6zM10 6.5h7V12M15 10l2 2 2-2',
}

export default function Icon({ name, size = 22, className = '', filled = false }) {
  const d = P[name] ?? P.shield
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {d.split('M').filter(Boolean).map((seg, i) => (
        <path key={i} d={`M${seg}`} />
      ))}
    </svg>
  )
}
