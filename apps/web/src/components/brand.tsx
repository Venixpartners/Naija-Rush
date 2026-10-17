import Link from "next/link";

/** Naija Rush mark: a danfo front in yellow with its black stripes. */
export function Mark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="5" width="26" height="20" rx="5" fill="#FFC400" />
      <rect x="3" y="15" width="26" height="3" fill="#15101C" />
      <rect x="6" y="8" width="20" height="5" rx="1.5" fill="#2B3A67" />
      <circle cx="9" cy="26" r="3" fill="#15101C" />
      <circle cx="23" cy="26" r="3" fill="#15101C" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="Naija Rush home">
          <Mark />
          NAIJA RUSH
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/play">Run</Link>
          <Link href="/leaderboards">Rankings</Link>
          <Link href="/account">Account</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>© {new Date().getFullYear()} Venix Partners Limited. Naija Rush is free to play.</span>
        <nav aria-label="Legal">
          <Link href="/events">Events</Link>
          <Link href="/premium">Premium</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/community">Community rules</Link>
        </nav>
      </div>
    </footer>
  );
}

/** Small danfo illustration. */
export function DanfoArt() {
  return (
    <svg className="game-art" viewBox="0 0 150 150" aria-hidden="true">
      <rect x="18" y="52" width="120" height="58" rx="10" fill="#FFC400" stroke="#1B0B3A" strokeWidth="4" />
      <rect x="18" y="80" width="120" height="8" fill="#15101C" />
      <rect x="28" y="60" width="22" height="16" rx="3" fill="#2B3A67" />
      <rect x="56" y="60" width="22" height="16" rx="3" fill="#2B3A67" />
      <rect x="84" y="60" width="22" height="16" rx="3" fill="#2B3A67" />
      <rect x="112" y="60" width="18" height="24" rx="3" fill="#2B3A67" />
      <circle cx="44" cy="112" r="12" fill="#15101C" stroke="#fff" strokeWidth="3" />
      <circle cx="112" cy="112" r="12" fill="#15101C" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}
