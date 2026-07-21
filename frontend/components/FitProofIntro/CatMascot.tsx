export default function CatMascot() {
  return (
    <svg
      aria-hidden="true"
      className="fitproof-intro-cat"
      focusable="false"
      viewBox="0 0 120 140"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        className="fitproof-intro-cat__tail tail"
        fill="white"
        stroke="#263238"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      >
        <path d="M31 101c-21 7-29-15-19-25 7-7 15-1 12 7-3 9 7 12 17 6" />
      </g>

      <g
        className="fitproof-intro-cat__body cat-body"
        fill="white"
        stroke="#263238"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      >
        <path d="M31 83c-4 20-1 42 11 47 13 6 39 6 53 0 11-5 14-29 8-48-7-22-61-22-72 1Z" />
        <path d="M48 129c-2 7 2 11 11 11 9 0 12-4 11-11M79 129c-2 7 2 11 11 11 8 0 12-4 10-11" />
      </g>

      <g className="fitproof-intro-cat__shield" stroke="#263238" strokeLinejoin="round" strokeWidth="3">
        <path d="M61 86 75 91v14c0 9-6 15-14 19-8-4-14-10-14-19V91Z" fill="#12B5A6" />
        <path d="M61 96v17M52 104h18" stroke="white" strokeLinecap="round" strokeWidth="5" />
      </g>

      <g
        className="fitproof-intro-cat__head cat-head"
        fill="white"
        stroke="#263238"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      >
        <path d="M24 55c-2-18 2-41 14-46 9-4 18 7 23 19 10-5 22-5 32 0 5-12 14-23 23-18 11 7 14 28 11 45 4 22-10 38-42 42-35 4-58-10-61-42Z" />
      </g>

      <g className="fitproof-intro-cat__ears" fill="#12B5A6">
        <path d="M38 20c7 2 12 8 15 17-11-2-18 1-24 7 0-11 2-20 9-24Z" />
        <path d="M104 20c-7 2-12 8-15 17 11-2 18 1 24 7 0-11-2-20-9-24Z" />
      </g>

      <g className="fitproof-intro-cat__face" stroke="#263238" strokeLinecap="round" strokeLinejoin="round">
        <g className="fitproof-intro-cat__eye eye" fill="#263238" stroke="none">
          <ellipse cx="54" cy="54" rx="5" ry="8" />
          <ellipse cx="83" cy="54" rx="5" ry="8" />
        </g>
        <ellipse cx="69" cy="66" rx="5" ry="3.5" fill="#263238" stroke="none" />
        <path d="M62 75q6 8 13 0 6 7 12-1" fill="none" strokeWidth="3.5" />
        <path d="M31 62l14 3M31 72l14-4M94 65l14-3M94 72l14 4" fill="none" strokeWidth="3" />
      </g>

      <g
        className="fitproof-intro-cat__arm cat-arm"
        fill="white"
        stroke="#263238"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      >
        <path d="M88 83c12 6 16 17 13 29" />
        <path d="M35 91c-5 10-4 18 4 22" />
      </g>

      <g
        className="fitproof-intro-cat__magnifier magnifier"
        fill="none"
        stroke="#263238"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      >
        <path d="M89 41 103 55" />
        <circle cx="78" cy="30" r="22" fill="white" />
        <circle cx="78" cy="30" r="15" fill="#EAF9F6" stroke="#12B5A6" strokeWidth="5" />
        <path d="M71 24c4-4 11-5 16 0" stroke="#9FE7DC" strokeWidth="3" />
      </g>
    </svg>
  );
}
