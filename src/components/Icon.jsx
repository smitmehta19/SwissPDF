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
