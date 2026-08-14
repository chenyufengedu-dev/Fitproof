import { useEffect, useRef, useState } from 'react'
import type { Claim, SingleAnalyzeResponse } from '@/types'
import ChatMarkdown from '@/components/ChatMarkdown'
import CourtCardShell from '@/components/CourtCardShell'
import { followupSingle, followupSingleStream } from '@/lib/api'
import { LoadingDots, type FollowupMessage, type VerifyState } from '@/components/single/shared'

export default function FollowupCard({ data, topic, claims, states }: { data: SingleAnalyzeResponse; topic: string; claims: Claim[]; states: VerifyState[] }) {
  const [messages, setMessages] = useState<FollowupMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const examples = [
    '这条视频里最需要注意哪一点？',
    '哪些人需要更谨慎地看待这些说法？',
    '日常照着做时，怎样会更稳妥？',
  ]
  const hasConversation = messages.length > 0 || loading

  async function sendQuestion(rawQuestion: string) {
    const question = rawQuestion.trim()
    if (!question || loading) return

    const history = messages.map((message) => ({ role: message.role, content: message.content }))
    const verifiedClaims = states.flatMap((state, index) => {
      const claim = claims[index]
      if (state.status !== 'done' || !state.result || !claim) return []
      return [{
        claim: claim.claim,
        signal: claim.signal,
        verdict: state.result.verdict,
        correction: state.result.correction,
      }]
    })

    setMessages((current) => [...current, { role: 'user', content: question }, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)
    let currentAnswer = ''
    const updateAnswer = (answer: string) => {
      if (!aliveRef.current) return
      setMessages((current) => {
        const next = [...current]
        const lastIndex = next.length - 1
        if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
          next[lastIndex] = { role: 'assistant', content: answer }
        }
        return next
      })
    }
    try {
      const payload = {
        reference: {
          author: data.reference.author,
          title: data.reference.title,
          url: data.reference.url,
        },
        topic: topic || data.topic,
        claims: verifiedClaims,
        question,
        history,
      }
      try {
        await followupSingleStream(payload, (_delta, answer) => {
          currentAnswer = answer
          updateAnswer(currentAnswer)
        })
      } catch {
        if (currentAnswer) throw new Error('stream-interrupted')
        const response = await followupSingle(payload)
        currentAnswer = response.answer
        updateAnswer(currentAnswer)
      }
    } catch {
      if (aliveRef.current) {
        updateAnswer(currentAnswer ? `${currentAnswer}\n\n回答意外中断，请重试。` : '追问失败，请重试')
      }
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-followup-scroll className="followup-scroll-area fitproof-scrollbar min-h-0 flex-1 overflow-y-auto pr-2">
      {!hasConversation && (
        <section>
          <p className="truncate text-[12px] leading-relaxed text-slate-600">基于数据库与权威文献回答，不引入无关外部信息。</p>
        </section>
      )}

      <section data-followup-brand className={`${hasConversation ? 'followup-ai-reposition mt-0' : 'mt-2'} rounded-[22px] border border-[#CDEDE7] bg-[#EFFAF8] px-3.5 py-2`}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-extrabold tracking-[-0.02em] text-[#17243B]">FitProof AI <span className="text-[#20CDB6]">✦</span></p>
            <p className="mt-1.5 text-[12px] leading-[1.55] text-[#52627E]">你的健康知识助手，结合医学数据库<br />与权威文献为你答疑解惑。</p>
          </div>
          <div role="img" aria-label="FitProof 小猫正在思考" className="fitproof-answer-cat pointer-events-none mt-1 shrink-0 self-center" />
        </div>
        <div className="mt-2 flex w-full flex-nowrap justify-between gap-1 text-[11px] font-medium text-[#0B6E63]">
          <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-[#BFECE5] bg-white/80 px-1 py-1 whitespace-nowrap"><svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"><path d="m12 3 7 3v5c0 4.2-2.8 8-7 10-4.2-2-7-5.8-7-10V6l7-3Z" strokeLinejoin="round" /><path d="m8.5 12 2.2 2.2 4.8-4.8" strokeLinecap="round" strokeLinejoin="round" /></svg>已核验内容</span>
          <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-[#BFECE5] bg-white/80 px-1 py-1 whitespace-nowrap"><svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><ellipse cx="12" cy="5.5" rx="6.5" ry="2.5" /><path d="M5.5 5.5v6c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-6M5.5 11.5v6C5.5 18.9 8.4 20 12 20s6.5-1.1 6.5-2.5v-6" /></svg>医学数据库</span>
          <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-[#BFECE5] bg-white/80 px-1 py-1 whitespace-nowrap"><svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 5.5c2.5-1.2 5.1-.9 8 1v12c-2.9-1.9-5.5-2.2-8-1V5.5ZM20 5.5c-2.5-1.2-5.1-.9-8 1v12c2.9-1.9 5.5-2.2 8-1V5.5Z" strokeLinejoin="round" /></svg>权威文献</span>
        </div>
      </section>

      {!hasConversation && (
        <div className="mt-2 space-y-2">
            <p className="flex items-center gap-2 px-1 text-[15px] font-black text-[#17243B]"><span className="grid h-7 w-7 place-items-center rounded-full bg-[linear-gradient(135deg,#3BD6C6,#17B8AD)] text-white shadow-[0_5px_10px_rgba(32,205,182,0.20)]"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 18.5 3.5 21l3.2-.9A8.5 8.5 0 1 0 5 18.5Z" strokeLinejoin="round" /><circle cx="8" cy="12" r=".7" fill="currentColor" /><circle cx="12" cy="12" r=".7" fill="currentColor" /><circle cx="16" cy="12" r=".7" fill="currentColor" /></svg></span>你可以这样问</p>
            <div className="space-y-2">
              {examples.map((example, index) => (
                <button key={example} type="button" onClick={() => void sendQuestion(example)} disabled={loading} className="flex w-full items-center gap-2.5 rounded-[15px] border border-[#CDEDE7] bg-white px-3 py-0.5 text-left text-[13px] text-[#52627E] shadow-[0_4px_12px_rgba(11,110,99,0.04)] disabled:opacity-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#F9FFFE_0%,#DDF7F2_68%,#C9EEE8_100%)] text-[#16B8AC]" aria-hidden="true">
                    {index === 0 ? <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true"><text x="12" y="10" fill="currentColor" fontSize="10" fontWeight="900" textAnchor="middle">?</text><circle cx="7.2" cy="15.2" r="2.45" fill="currentColor" opacity=".9" /><circle cx="16.8" cy="15.2" r="2.45" fill="currentColor" opacity=".9" /><path fill="currentColor" d="M3.7 21c.5-2.2 1.7-3.3 3.5-3.3s3 1.1 3.5 3.3H3.7Zm9.6 0c.5-2.2 1.7-3.3 3.5-3.3s3 1.1 3.5 3.3h-7.0Z" opacity=".9" /></svg> : index === 1 ? <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="11" r="4.8" fill="currentColor" /><path fill="currentColor" d="M9.2 15h5.6v3H9.2zM10.2 19h3.6l-.8 1.3h-2l-.8-1.3Z" /><path d="M12 2.4v1.8M4.8 5.4l1.3 1.3M19.2 5.4l-1.3 1.3M2.4 12h1.8M19.8 12h1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> : <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="currentColor" d="M3 5.3c2.8-.9 5.7-.4 8.5 1.2v10.9c-2.7-1.5-5.6-1.9-8.5-1V5.3Zm18 0c-2.8-.9-5.7-.4-8.5 1.2v10.9c2.7-1.5 5.6-1.9 8.5-1V5.3Z" /><path d="M12 6.5v10.1" stroke="white" strokeOpacity=".68" strokeWidth="1.25" /></svg>}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{example}</span>
                  <svg className="h-5 w-5 shrink-0 text-[#20CDB6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
        </div>
      )}

      {hasConversation && (
        <div className="mt-3 space-y-4 pb-2">
          {messages.map((message, index) => message.role === 'user' ? (
            <div key={`${message.role}-${index}`} className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#20CDB6] px-3.5 py-2.5 text-[15px] leading-relaxed text-[#06403A]">
                <ChatMarkdown content={message.content} />
              </div>
          ) : message.content ? (
            <div key={`${message.role}-${index}`} className="mr-auto max-w-[94%]">
              <div className="min-w-0 rounded-2xl rounded-bl-md border border-[#20CDB6]/20 bg-[#F3FBF9] px-3.5 py-2.5 text-[15px] leading-relaxed text-slate-700">
                <ChatMarkdown content={message.content} stripCitations />
              </div>
            </div>
          ) : null)}

        {loading && !messages[messages.length - 1]?.content && (
          <div className="mr-auto">
            <div className="rounded-2xl rounded-bl-md border border-[#20CDB6]/20 bg-[#F3FBF9] px-3.5 py-2.5 text-[15px] text-slate-600">正在核验回答…</div>
          </div>
        )}
        </div>
      )}

      </div>
      <form className="mt-0 flex shrink-0 translate-y-1.5 gap-2" onSubmit={(event) => { event.preventDefault(); void sendQuestion(input) }}>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} disabled={loading} rows={1} aria-label="就这条视频提问" placeholder="输入你的疑问" className="h-10 min-w-0 flex-1 resize-none rounded-full border border-[#20CDB6]/25 bg-white px-4 py-2 text-base leading-tight text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10 disabled:bg-slate-50" />
        <button type="submit" disabled={loading || !input.trim()} className="h-10 shrink-0 rounded-full bg-[#20CDB6] px-5 text-[15px] font-bold text-[#06403A] shadow-[0_8px_20px_rgba(32,205,182,0.30)] transition hover:bg-[#19b8a4] disabled:opacity-40">
          发送
        </button>
      </form>
      <style jsx>{`
        @keyframes followup-ai-reposition {
          from { opacity: 0.35; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .followup-ai-reposition { animation: followup-ai-reposition 260ms cubic-bezier(.2,.8,.2,1); }
        .followup-scroll-area {
          scrollbar-width: thin;
          scrollbar-color: #56C6BB transparent;
          scrollbar-gutter: stable;
        }
        .followup-scroll-area::-webkit-scrollbar { width: 8px; }
        .followup-scroll-area::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 999px;
        }
        .followup-scroll-area::-webkit-scrollbar-thumb {
          background: #56C6BB;
          background-clip: padding-box;
          border: 2px solid transparent;
          border-radius: 999px;
        }
      `}</style>
    </div>
  )
}
