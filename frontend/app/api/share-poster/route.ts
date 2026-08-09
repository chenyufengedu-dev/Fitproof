import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PosterData } from '@/lib/share/types'
import { resolvePosterFrontendRoot } from './posterRoot.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PosterRenderer = {
  generateMobileV969x16Poster: (data: PosterData) => Promise<Buffer>
}

export async function POST(request: Request) {
  try {
    const data = await request.json() as PosterData
    // 生产包可能把 frontend/ 内容扁平部署到 cwd；本地也可能从仓库根目录启动。
    const cwd = process.cwd()
    const frontendRoot = resolvePosterFrontendRoot(cwd)
    const rendererPath = path.join(
      frontendRoot,
      'public',
      'FitProof-share-9x16',
      'poster',
      'render_mobile_v9_6_9x16.js',
    )
    const imported = await import(/* webpackIgnore: true */ pathToFileURL(rendererPath).href)
    const renderer = (imported.default || imported) as PosterRenderer
    const { generateMobileV969x16Poster } = renderer
    const png = await generateMobileV969x16Poster(data)
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[share-poster] generation failed', error)
    return Response.json({
      detail: '分享长图生成失败',
      ...(process.env.NODE_ENV === 'development' && error instanceof Error ? { debug: error.message } : {}),
    }, { status: 500 })
  }
}
