import { NextResponse } from 'next/server'

// 真实链接分析需要 Whisper/ffmpeg，云端无法运行；在线版仅支持示例话题。
// 本地完整版（连 Python 后端）仍可使用真实链接分析。
export async function POST() {
  return NextResponse.json(
    { detail: '在线体验暂仅支持示例话题，真实链接分析请在展位现场体验完整版～' },
    { status: 501 },
  )
}
