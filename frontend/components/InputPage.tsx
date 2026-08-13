"use client";

import { useCallback, useEffect, useState } from "react";
import ThinkingCatAnimation from "@/components/ThinkingCatAnimation";
import FitProofBrandIntro, { type FitProofIntroPhase } from "@/components/brand/FitProofBrandIntro";
import { extractDouyinVideoLink } from "@/lib/douyinLink.mjs";
import type { SingleSampleData } from "@/types";

interface InputPageProps {
  apiBaseUrl: string;
  onAnalyzeSingle: (link: string, topic: string) => Promise<void>;
  onAnalyzeUpload: (file: File, topic: string) => Promise<void>;
  onSingleSampleLoaded: (sample: SingleSampleData) => void;
  initialError?: string;
}

export default function InputPage({
  apiBaseUrl,
  onAnalyzeSingle,
  onAnalyzeUpload,
  onSingleSampleLoaded,
  initialError,
}: InputPageProps) {
  const [singleLink, setSingleLink] = useState("");
  const [clipboardLink, setClipboardLink] = useState("");
  const [localVideo, setLocalVideo] = useState<File | null>(null);
  const [localVideoError, setLocalVideoError] = useState("");
  const [error, setError] = useState(initialError || "");
  const [linkError, setLinkError] = useState("");
  const [singleSubmitting, setSingleSubmitting] = useState(false);
  const [introPhase, setIntroPhase] = useState<FitProofIntroPhase>("preparing");
  const [brandLayoutReady, setBrandLayoutReady] = useState(false);
  const handleBrandLayoutReady = useCallback(() => setBrandLayoutReady(true), []);

  useEffect(() => {
    let cancelled = false;
    async function detectClipboard() {
      try {
        if (typeof window === "undefined") return;
        if (!window.isSecureContext || !navigator.clipboard?.readText) return;
        const text = await navigator.clipboard.readText();
        const link = extractDouyinVideoLink(text || "");
        if (!cancelled && link) setClipboardLink(link);
      } catch {
        // HTTP, IP access, denied permission, or browser policy all fall back to manual paste.
      }
    }
    void detectClipboard();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startSingle(link: string) {
    const clean = extractDouyinVideoLink(link);
    if (!clean) {
      setLinkError(link.trim()
        ? "这不是具体的抖音视频链接，请粘贴视频分享链接或 /video/数字ID 地址"
        : "请先粘贴一条抖音视频链接");
      return;
    }
    setLinkError("");
    setError("");
    setSingleSubmitting(true);
    try {
      await onAnalyzeSingle(clean, "健康说法核验");
    } finally {
      setSingleSubmitting(false);
    }
  }

  async function startUpload(file: File) {
    setError("");
    setSingleSubmitting(true);
    try {
      await onAnalyzeUpload(file, "健康说法核验");
    } finally {
      setSingleSubmitting(false);
    }
  }

  async function handleSingleSubmit() {
    // 选了本地视频优先走上传；否则走链接分析
    if (localVideo) {
      await startUpload(localVideo);
      return;
    }
    await startSingle(singleLink);
  }

  async function useClipboardLink() {
    setSingleLink(clipboardLink);
    await startSingle(clipboardLink);
  }

  async function loadSingleSample() {
    setError("");
    try {
      const mod = await import("@/data/single-sample.json");
      onSingleSampleLoaded(mod.default as SingleSampleData);
    } catch {
      setError("单视频样例加载失败");
    }
  }

  function selectLocalVideo(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setLocalVideo(null);
      setLocalVideoError("请选择视频文件");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setLocalVideo(null);
      setLocalVideoError("视频文件请控制在 500MB 以内");
      return;
    }
    setLocalVideo(file);
    setLocalVideoError("");
  }

  function formatFileSize(bytes: number) {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <main className="fitproof-input-page bg-[#f7fffd] px-4 py-4 text-slate-950 sm:px-5 sm:py-8">
      <div className="fitproof-input-shell mx-auto flex max-w-2xl flex-col justify-start sm:justify-center">
        <div className="fitproof-input-badge mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-[#20CDB6]/25 bg-white px-3 py-1.5 text-xs font-medium text-[#0B6E63] shadow-sm sm:mb-5">
          <span className="h-2 w-2 rounded-full bg-[#20CDB6]" />
          健康说法核验 · AI 证据校验
        </div>

        <section className={`fitproof-input-brand-card fitproof-brand-card is-${introPhase} relative overflow-hidden rounded-[30px] border border-[#20CDB6]/15 bg-white p-6 shadow-[0_22px_70px_rgba(18,116,103,0.12)]`}>
          <div className="relative -mt-2 inline-block">
            <h1 className="sr-only">FitProof</h1>
            <FitProofBrandIntro onLayoutReady={handleBrandLayoutReady} onPhaseChange={setIntroPhase} />
            <ThinkingCatAnimation
              className={`pointer-events-none absolute -top-1 left-[calc(100%+1.75rem)] h-[65px] w-14 transition-opacity duration-300 ease-out motion-reduce:transition-none sm:top-0 sm:h-[93px] sm:w-20 ${
                brandLayoutReady ? "opacity-90" : "opacity-0"
              } drop-shadow-[0_14px_22px_rgba(15,118,110,0.14)]`}
            />
          </div>
          <p className="fitproof-input-tagline fitproof-brand-tagline mt-3 text-xl font-semibold text-slate-800">让 AI 替你多看一步</p>
          <p className="fitproof-input-description mt-3 text-[15px] leading-relaxed text-slate-500">
            粘贴健康短视频链接，提取可核验主张，并对照权威健康指南给出更稳妥的判断。
          </p>
          <div className="fitproof-input-features mt-5 flex flex-nowrap items-center justify-between gap-1.5 whitespace-nowrap text-[11px] font-medium min-[420px]:text-xs">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E5C455]/55 bg-[#FFFDF5] px-1 py-1 font-semibold text-[#D2A517] shadow-[0_1px_3px_rgba(180,139,14,0.05)]">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 1.75c.5 6.7 3.55 9.75 10.25 10.25C15.55 12.5 12.5 15.55 12 22.25 11.5 15.55 8.45 12.5 1.75 12 8.45 11.5 11.5 8.45 12 1.75Z" />
              </svg>
              权威指南核验
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-[#F8FAFB] px-1 py-1 text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <svg className="h-3.5 w-3.5 shrink-0 text-[#19BCA9]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19v-4M9 19v-7M14 19V9M19 19V5" /><path d="m4 10 5-4 4 2 7-5" /><path d="m16 3 4 .1-.1 4" />
              </svg>
              健康风险分层
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-[#F8FAFB] px-1 py-1 text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <svg className="h-3.5 w-3.5 shrink-0 text-[#19BCA9]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9.5 12.5 5.3-5.3a3.2 3.2 0 1 1 4.5 4.5l-7.1 7.1a5 5 0 0 1-7.1-7.1l7.2-7.2" /><path d="m7.8 14.2 6.4-6.4" />
              </svg>
              视频出处溯源
            </span>
          </div>
        </section>

        <section className="fitproof-input-form-card mt-3 rounded-[28px] border border-[#20CDB6]/15 bg-white p-4 shadow-[0_12px_36px_rgba(18,116,103,0.08)]">

          <div className="mt-1 space-y-3">
              {clipboardLink && (
                <button
                  type="button"
                  onClick={() => void useClipboardLink()}
                  disabled={singleSubmitting}
                  className="w-full rounded-2xl border border-[#20CDB6]/25 bg-[#f3fbf9] px-4 py-3 text-left text-sm text-[#0B6E63] transition hover:border-[#20CDB6] hover:bg-white disabled:opacity-50"
                >
                  <span className="font-semibold">检测到视频链接，一键核验</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">{clipboardLink}</span>
                </button>
              )}

              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg border border-slate-100 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.06)]" aria-hidden="true">
                  <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24">
                    <path d="M14.1 3.2c.5 2.7 2.1 4.3 4.8 4.8v3.1a8.6 8.6 0 0 1-4.7-1.5v5.2a5.2 5.2 0 1 1-4.5-5.1v3.2a2.1 2.1 0 1 0 1.3 1.9V3.2h3.1Z" fill="#25F4EE" transform="translate(-0.8 0.6)" />
                    <path d="M14.1 3.2c.5 2.7 2.1 4.3 4.8 4.8v3.1a8.6 8.6 0 0 1-4.7-1.5v5.2a5.2 5.2 0 1 1-4.5-5.1v3.2a2.1 2.1 0 1 0 1.3 1.9V3.2h3.1Z" fill="#FE2C55" transform="translate(0.6 -0.3)" />
                    <path d="M14.1 3.2c.5 2.7 2.1 4.3 4.8 4.8v3.1a8.6 8.6 0 0 1-4.7-1.5v5.2a5.2 5.2 0 1 1-4.5-5.1v3.2a2.1 2.1 0 1 0 1.3 1.9V3.2h3.1Z" fill="#111827" />
                  </svg>
                </span>
                {/* 字号必须 ≥16px：iOS 聚焦更小的输入框会自动放大整页且不回弹。
                    16px 下占位塞不进原来的示例网址，改用短文案。 */}
                <input
                  type="text"
                  value={singleLink}
                  onChange={(e) => {
                    setSingleLink(e.target.value);
                    setLinkError("");
                  }}
                  placeholder="粘贴抖音视频链接"
                  className="w-full rounded-2xl border border-[#20CDB6]/20 bg-white py-3 pl-12 pr-4 text-base outline-none transition focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10"
                />
              </div>
              {linkError && <p role="alert" className="t-meta -mt-1 px-1 text-red-600">{linkError}</p>}
              <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[#20CDB6]/35 bg-[#F5FCFB] px-4 py-3 text-left transition active:scale-[0.99]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#0B8F82] shadow-sm" aria-hidden="true">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="6" width="16" height="12" rx="2" /><path d="m10 10 5 2-5 2v-4Z" fill="currentColor" stroke="none" /></svg>
                </span>
                <span className="min-w-0 flex-1">
                  {localVideo ? <><span className="t-label block truncate text-slate-800">{localVideo.name}</span><span className="t-meta mt-0.5 block text-slate-500">{formatFileSize(localVideo.size)} · 点下方「分析本地视频」</span></> : <><span className="t-label block text-slate-800">从手机相册选择视频</span><span className="t-meta mt-0.5 block text-slate-500">选择后可直接上传分析</span></>}
                </span>
                <span className="t-label shrink-0 text-[#0B8F82]">{localVideo ? "更换" : "+"}</span>
                <input type="file" accept="video/*" className="sr-only" onChange={(event) => selectLocalVideo(event.target.files?.[0] || null)} />
              </label>
              {localVideoError && <p className="t-meta text-amber-700">{localVideoError}</p>}
              <div className="space-y-2">
                <div className="fitproof-input-actions grid grid-cols-1 gap-2 min-[350px]:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleSingleSubmit()}
                    disabled={singleSubmitting}
                    className="rounded-2xl bg-[#20CDB6] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(32,205,182,0.28)] transition hover:bg-[#19b8a4] disabled:opacity-50"
                  >
                    {singleSubmitting ? "正在拆解主张…" : localVideo ? "分析本地视频" : "分析单视频"}
                  </button>
                  <button
                    type="button"
                    onClick={loadSingleSample}
                    disabled={singleSubmitting}
                    className="rounded-2xl border border-[#20CDB6]/25 bg-white px-4 py-3 text-sm font-semibold text-[#0B6E63] transition hover:border-[#20CDB6] hover:bg-[#f3fbf9] disabled:opacity-50"
                  >
                    用样例数据
                  </button>
                </div>
                <p className="flex items-center justify-center gap-1 whitespace-nowrap text-[10px] leading-none tracking-tight text-slate-400">
                  <svg className="h-3 w-3 shrink-0 text-[#20CDB6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3 5 6v5c0 4.7 2.8 8.3 7 10 4.2-1.7 7-5.3 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" />
                  </svg>
                  <span>AI 核验结果仅供参考，不能替代医生诊断或个体化治疗建议</span>
                </p>
              </div>
          </div>

          {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
        </section>
      </div>
    </main>
  );
}
