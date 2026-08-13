import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'FitProof',
  description: '让 AI 替你多看一步，辨析运动短视频里的争议说法',
  icons: {
    // 浏览器标签只需要 32px；原来三处都指向 512px 大图，白下 269KB。
    icon: '/brand/cat-doctor-favicon-32.png',
    shortcut: '/brand/cat-doctor-favicon-32.png',
    apple: '/brand/cat-doctor-favicon.png',
  },
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
