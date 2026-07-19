import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FitProof',
  description: '让 AI 替你多看一步，辨析运动短视频里的争议说法',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  )
}
