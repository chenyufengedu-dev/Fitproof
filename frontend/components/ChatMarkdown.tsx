import type { ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type ChatMarkdownProps = {
  content: string
  className?: string
}

function Paragraph({ children }: ComponentPropsWithoutRef<'p'>) {
  return <p className="mb-2 last:mb-0">{children}</p>
}

/** Safely renders the small Markdown subset used by AI answer messages. */
export default function ChatMarkdown({ content, className = '' }: ChatMarkdownProps) {
  return (
    <div className={`chat-markdown whitespace-normal break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={['img', 'table', 'hr']}
        components={{
          p: Paragraph,
          strong: ({ children }) => <strong className="font-black text-inherit">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5 marker:text-[#20CDB6]">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5 marker:font-bold marker:text-[#0B8F82]">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-[#70D8CC] pl-2.5 text-slate-600">{children}</blockquote>,
          code: ({ children }) => <code className="rounded bg-[#DDF5F0] px-1 py-0.5 font-mono text-[0.88em] text-[#08796E]">{children}</code>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-[#078C7E] underline decoration-[#7BDDD2] underline-offset-2">{children}</a>,
          h1: ({ children }) => <p className="mb-2 text-[1.08em] font-black">{children}</p>,
          h2: ({ children }) => <p className="mb-2 text-[1.04em] font-black">{children}</p>,
          h3: ({ children }) => <p className="mb-1.5 font-black">{children}</p>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
