import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

interface ChatMessage {
  role: string
  content: string
}

// 云端「AI 答疑」：通过 DeepSeek（OpenAI 兼容接口）回答，密钥存 Vercel 环境变量
export async function POST(req: Request) {
  const key = process.env.DEEPSEEK_API_KEY
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

  if (!key) {
    return NextResponse.json({ answer: 'AI 答疑暂未配置，请联系展位工作人员。' })
  }

  let body: { analysis?: unknown; question?: string; history?: ChatMessage[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: '请求格式错误' }, { status: 400 })
  }
  const { analysis, question, history = [] } = body
  const historyText = (history || []).map((m) => `${m.role}: ${m.content}`).join('\n')

  const prompt = `你是这组视频分析的讲解助手，话题围绕「运动健康」。下面是已分析内容：
${JSON.stringify(analysis)}

对话历史：
${historyText}

用户问题：
${question}

回答要求：
1. 优先依据上面的已分析内容回答；如果引用了某条视频的观点，用来源编号标注，例如 [1]、[2]。
2. 如果用户是想理解视频里出现的概念或术语（例如"什么是高强度间歇训练 HIIT""低 GI 碳水是什么"），请用通俗、准确的方式做名词解释/科普，可补充必要的常识性背景。
3. 与本话题相关的延伸问题，结合已分析内容尽量解答。
4. 只有当问题与该运动健康话题完全无关时（例如问天气、股票），才回复：这个问题和当前分析的视频话题无关哦。
5. 回答简洁清楚，避免空话。
6. 可适度使用 Markdown 提升可读性：仅用 **加粗** 标出关键结论、用 - 列出要点；不要输出 HTML、表格或复杂标题。`

  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8192,
        temperature: 0.3,
      }),
    })
    const j = await r.json()
    const answer = (j?.choices?.[0]?.message?.content || '').trim() || '抱歉，暂时没能回答这个问题。'
    return NextResponse.json({ answer })
  } catch {
    return NextResponse.json({ detail: '追问失败，请重试' }, { status: 500 })
  }
}
