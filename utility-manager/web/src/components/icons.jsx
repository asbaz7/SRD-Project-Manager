// Line icons (24px grid, currentColor). Decorative unless given a title.
const paths = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
  electricity: 'M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z',
  water: 'M12 3s6.5 7 6.5 11.5A6.5 6.5 0 0 1 5.5 14.5C5.5 10 12 3 12 3Z',
  sewerage: 'M4 7h9a4 4 0 0 1 4 4v1h3M4 7v4m0-4H2m15 5v6m0 0h-2m2 0h2M8 17a2 2 0 1 0 4 0c0-1.5-2-3.5-2-3.5S8 15.5 8 17Z',
  work: 'M14.7 6.3a4 4 0 0 0-5.4 5.2L3.6 17.2a1.6 1.6 0 0 0 2.2 2.2l5.7-5.7a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.1-.6-.6-2.1 3.2-1.8Z',
  incident: 'M12 3 2.5 20h19L12 3Zm0 6v5m0 3v.5',
  project: 'M4 5h6l2 2h8v12H4V5Z',
  island: 'M3 18c3-2 6-2 9 0s6 2 9 0M8 15c0-4 2-8 6-9m0 0c-1 2-1 4 0 6m0-6c2 .5 3.5 2 4 4',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-6.5a3.5 3.5 0 0 1 0 6.5m3 8v-1.5a3.5 3.5 0 0 0-2.5-3.4',
  audit: 'M9 4h6m-7 2h8v14H8V6Zm2 5h4m-4 4h4',
  report: 'M7 3h7l4 4v14H7V3Zm7 0v4h4M10 12h5m-5 4h5',
  document: 'M6 3h8l4 4v14H6V3Zm8 0v4h4M9 17l2-2 1.5 1.5L16 13',
  engine: 'M5 9h3V7h6v2h2l2 2h2v6h-2l-2 2H8l-3-3V9Zm-3 3h3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4m-4-4h11',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  arrow: 'M9 6l6 6-6 6',
  facility: 'M4 20V9l5 3V9l5 3V5h6v15H4Z',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v4h16v-4',
  check: 'M5 12.5 10 17l9-10',
  telegram: 'M21 4 3 11l6 2m12-9-3 16-9-7m12-9L9 13m0 0v6l3-4',
};

export function Icon({ name, size = 20, title, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={`icon ${className}`} aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={paths[name] || paths.more} />
    </svg>
  );
}
