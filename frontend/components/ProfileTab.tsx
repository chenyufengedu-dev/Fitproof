export default function ProfileTab() {
  return (
    <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6 pb-20">
      <section className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E7FAF6] text-[#0B6E63]">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-3.2 3-5 6.5-5s5.8 1.8 6.5 5" /></svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">我的</h1>
        <p className="mt-2 text-sm text-slate-500">个人记录与偏好，暂无内容</p>
      </section>
    </main>
  )
}
