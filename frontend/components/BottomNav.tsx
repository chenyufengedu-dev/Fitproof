'use client'

type TabId = 'verify' | 'community' | 'profile'

type BottomNavProps = {
  activeTab: TabId
  onChange: (tab: TabId) => void
}

const tabs: { id: TabId; label: string }[] = [
  { id: 'verify', label: '核验' },
  { id: 'community', label: '社区' },
  { id: 'profile', label: '我的' },
]

function TabIcon({ id, active }: { id: TabId; active: boolean }) {
  const common = {
    className: 'h-5 w-5',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
    'aria-hidden': true as const,
  }

  if (id === 'verify') {
    return <svg {...common}><path d="M12 3 5 6v5c0 4.7 2.9 8.1 7 10 4.1-1.9 7-5.3 7-10V6l-7-3Z" /><path d="m8.7 12 2.1 2.1 4.6-4.6" /></svg>
  }
  if (id === 'community') {
    return <svg {...common}><path d="M6 18.5 3.5 21l.8-3.8A7.8 7.8 0 0 1 4 13c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.4 0-2.8-.4-4-1l-2 .5Z" /><path d="M8 13h.01M12 13h.01M16 13h.01" strokeWidth="2.4" strokeLinecap="round" /></svg>
  }
  return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-3.2 3-5 6.5-5s5.8 1.8 6.5 5" /></svg>
}

export default function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#D8F0EC] bg-white pb-[env(safe-area-inset-bottom)]" aria-label="主导航">
      <div className="mx-auto grid h-16 max-w-lg grid-cols-3">
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${active ? 'text-[#0B6E63]' : 'text-slate-400 hover:text-[#0B6E63]'}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className={`absolute top-0 h-0.5 w-10 rounded-b-full transition-colors ${active ? 'bg-[#20CDB6]' : 'bg-transparent'}`} />
              <TabIcon id={tab.id} active={active} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
