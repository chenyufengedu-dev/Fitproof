"use client";

import { useEffect } from "react";
import type { SingleAnalyzeRejectedResponse } from "@/types";

interface ContentRejectionModalProps {
  result: SingleAnalyzeRejectedResponse;
  onClose: () => void;
}

export default function ContentRejectionModal({ result, onClose }: ContentRejectionModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const isUnrelated = result.scope === "unrelated";
  const title = isUnrelated ? "暂不支持分析这段视频" : "这段视频暂无可核验的健康说法";
  const summary = isUnrelated
    ? "识别到的内容与健康信息核验无关，因此没有继续进行转写和深度分析。"
    : "视频可能涉及饮食、运动或生活场景，但暂未发现明确的健康主张或可模仿方案。";

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/35 px-5 py-8 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-rejection-title"
        className="w-full max-w-sm rounded-[28px] border border-amber-200/80 bg-white p-6 shadow-[0_28px_90px_rgba(15,23,42,0.28)]"
      >
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600" aria-hidden="true">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 5 6v5c0 4.7 2.8 8.3 7 10 4.2-1.7 7-5.3 7-10V6l-7-3Z" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h2 id="content-rejection-title" className="mt-4 text-center text-xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-3 text-[15px] leading-6 text-slate-600">{summary}</p>
        {result.reason && <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[15px] leading-6 text-amber-900">{result.reason}</p>}
        {result.matched_text[0] && (
          <p className="mt-3 text-xs leading-5 text-slate-500">识别依据：“{result.matched_text[0]}”</p>
        )}
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-[#20CDB6] px-4 py-3 text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(32,205,182,0.25)] transition hover:bg-[#19b8a4] focus:outline-none focus:ring-4 focus:ring-[#20CDB6]/20"
        >
          换一个视频
        </button>
      </section>
    </div>
  );
}
