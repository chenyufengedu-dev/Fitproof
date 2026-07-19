import { NextResponse } from 'next/server'
import preset1 from '@/data/presets/1.json'
import preset2 from '@/data/presets/2.json'
import preset3 from '@/data/presets/3.json'
import preset5 from '@/data/presets/5.json'

// 预置话题数据打包进前端，云端无需 Python 后端即可体验
const PRESETS: Record<string, unknown> = {
  '1': preset1,
  '2': preset2,
  '3': preset3,
  '5': preset5,
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const data = PRESETS[params.id]
  if (!data) {
    return NextResponse.json({ detail: '预置话题不存在' }, { status: 404 })
  }
  return NextResponse.json(data)
}
