export default function AiMagnifier({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`fitproof-brand-ai-magnifier ${className}`}>
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <path d="m37 37 15 15" fill="none" stroke="#F6B66F" strokeLinecap="round" strokeWidth="8" />
        <path d="m38 38 13 13" fill="none" stroke="rgba(255,255,255,.5)" strokeLinecap="round" strokeWidth="1.5" />
        <circle cx="24" cy="24" r="19" fill="rgba(246,182,111,.045)" stroke="#F6B66F" strokeWidth="6.5" />
        <circle cx="24" cy="24" r="14.5" fill="none" stroke="white" strokeOpacity=".88" strokeWidth="1.6" />
        <path d="M13 25c0-6 4-11 10-12" fill="none" stroke="rgba(255,255,255,.72)" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    </span>
  );
}
