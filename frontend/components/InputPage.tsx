"use client";

import { useState } from "react";
import type { Analysis, PresetData, SingleSampleData } from "@/types";

interface InputPageProps {
  apiBaseUrl: string;
  onAnalyze: (links: string[], topic: string) => Promise<void>;
  onPresetLoaded: (analysis: Analysis, topic: string) => void;
  onAnalyzeSingle: (link: string, topic: string) => Promise<void>;
  onSingleSampleLoaded: (sample: SingleSampleData) => void;
  initialError?: string;
}

const PRESETS = [
  {
    id: "1",
    label: "空腹有氧好不好",
    links: [
      "https://www.douyin.com/video/7629357840607595819?previous_page=web_code_link",
      "https://www.douyin.com/video/7598823080103000250?previous_page=web_code_link",
    ],
  },
  {
    id: "5",
    label: "鱼油是不是智商税",
    links: [
      "https://www.douyin.com/video/7605528198700971171?previous_page=web_code_link",
      "https://www.douyin.com/video/7539112531555306793?previous_page=web_code_link",
    ],
  },
];

export default function InputPage({
  apiBaseUrl,
  onAnalyze,
  onPresetLoaded,
  onAnalyzeSingle,
  onSingleSampleLoaded,
  initialError,
}: InputPageProps) {
  const [topic, setTopic] = useState("");
  const [singleLink, setSingleLink] = useState("");
  const [error, setError] = useState(initialError || "");
  const [submitting, setSubmitting] = useState(false);
  const [singleSubmitting, setSingleSubmitting] = useState(false);
  const [presetLoading, setPresetLoading] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState(PRESETS[0].id);

  const selectedPreset = PRESETS.find((p) => p.id === selectedPresetId) || PRESETS[0];

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      await loadPreset(selectedPreset.id, selectedPreset.label);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSingleSubmit() {
    const link = singleLink.trim();
    if (!link) {
      setError("请先粘贴一条抖音视频链接");
      return;
    }
    setError("");
    setSingleSubmitting(true);
    try {
      await onAnalyzeSingle(link, topic.trim() || "单视频健康核验");
    } finally {
      setSingleSubmitting(false);
    }
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

  async function loadPreset(id: string, label: string) {
    setError("");
    setPresetLoading(id);
    try {
      const res = await fetch(`${apiBaseUrl}/api/preset/${id}`);
      if (!res.ok) throw new Error("预置话题加载失败");
      const data: PresetData = await res.json();
      onPresetLoaded(data.analysis, topic.trim() || data.topic || label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "预置话题加载失败");
    } finally {
      setPresetLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,rgba(32,205,182,0.18),transparent_42%),linear-gradient(180deg,#f7fffd_0%,#eef8f6_100%)] px-4 py-8 text-slate-950 sm:px-5 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col justify-center">
        <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-[#20CDB6]/25 bg-white/80 px-3 py-1.5 text-xs font-medium text-[#158a7c] shadow-sm">
          <span className="h-2 w-2 rounded-full bg-[#20CDB6]" />
          运动健康争议 · AI 证据校验
        </div>

        <div className="relative overflow-hidden rounded-[32px] border border-white bg-white/85 p-6 shadow-[0_24px_80px_rgba(18,116,103,0.16)] backdrop-blur">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border-[18px] border-[#20CDB6]/10" />
          <div className="pointer-events-none absolute right-6 top-6 h-20 w-28 opacity-70">
            <div className="absolute left-2 top-1/2 h-px w-24 -translate-y-1/2 bg-[#20CDB6]/20" />
            <div className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-[#20CDB6]/35 bg-[#20CDB6]/10" />
            <div className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-[#20CDB6]/35 bg-[#20CDB6]/10" />
            <div className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#20CDB6]/20 bg-white/60">
              <div className="h-8 w-8 rounded-full border border-dashed border-[#20CDB6]/45" />
              <span className="absolute text-sm font-semibold text-[#20CDB6]/70">
                ✓
              </span>
            </div>
          </div>
          <div className="relative inline-block">
            <h1 className="text-6xl font-bold leading-none tracking-tight text-[#13b8a5] drop-shadow-[0_10px_26px_rgba(32,205,182,0.20)] sm:text-7xl">
              FitProof
            </h1>
            <img
              src="/brand/cat-thinking.png"
              alt=""
              aria-hidden
              className="fitproof-cat-float pointer-events-none absolute left-[calc(100%+1.15rem)] top-3 w-14 opacity-90 drop-shadow-[0_14px_22px_rgba(15,118,110,0.14)] sm:top-5 sm:w-20"
            />
          </div>
          <p className="mt-4 text-xl font-semibold text-slate-800">
            让 AI 替你多看一步
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
            对照运动医学指南、专业文献与视频出处，判断相互冲突的运动健康说法是否可靠。
          </p>

          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-[#d6b58f] drop-shadow-[0_1px_0_rgba(255,255,255,0.95)]">
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[#e2c39f]">✦</span>
              <span>医学文献依据</span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[#e2c39f]">✚</span>
              <span>风险分层提示</span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[#e2c39f]">●</span>
              <span>AI多源核验</span>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-4 rounded-[28px] border border-white bg-white/75 p-4 shadow-[0_16px_60px_rgba(18,116,103,0.10)] backdrop-blur">
          <div className="rounded-3xl border border-[#20CDB6]/20 bg-[#f3fbf9] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">单视频核验 MVP</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  粘贴 1 条视频链接，先拆主张清单，再点选其中一条做证据核验。
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#128f80]">
                新流程
              </span>
            </div>
            <input
              type="text"
              value={singleLink}
              onChange={(e) => setSingleLink(e.target.value)}
              placeholder="粘贴单条抖音链接，如：https://v.douyin.com/..."
              className="mt-3 w-full rounded-2xl border border-[#20CDB6]/20 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10"
            />
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleSingleSubmit}
                disabled={singleSubmitting || presetLoading !== null || submitting}
                className="rounded-2xl bg-[#20CDB6] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(32,205,182,0.28)] transition hover:bg-[#19b8a4] disabled:opacity-50"
              >
                {singleSubmitting ? "正在拆解主张…" : "分析单视频"}
              </button>
              <button
                type="button"
                onClick={loadSingleSample}
                disabled={singleSubmitting || presetLoading !== null || submitting}
                className="rounded-2xl border border-[#20CDB6]/25 bg-white px-4 py-3 text-sm font-semibold text-[#128f80] transition hover:border-[#20CDB6] hover:bg-[#20CDB6]/10 disabled:opacity-50"
              >
                用样例数据
              </button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">已标记的疑惑视频</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                系统已同步你标记的运动健康视频，凑齐观点相冲突的内容后即可核验。
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#20CDB6]/10 px-2.5 py-1 text-[11px] font-medium text-[#128f80]">
              已同步
            </span>
          </div>

          <div className="space-y-2">
            {selectedPreset.links.map((link, i) => (
              <div
                key={link}
                className="flex items-start gap-2 rounded-2xl border border-[#20CDB6]/15 bg-white px-3 py-2.5 shadow-sm"
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#20CDB6] shadow-[0_0_10px_rgba(32,205,182,0.55)]" />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-[#128f80]">已标记视频 {i + 1}</p>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block break-all text-xs leading-relaxed text-slate-500 transition hover:text-[#128f80]"
                  >
                    {link}
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs text-slate-400">切换待核验话题</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active = p.id === selectedPresetId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPresetId(p.id);
                      setError("");
                    }}
                    disabled={presetLoading !== null || submitting}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                      active
                        ? "border-[#20CDB6] bg-[#20CDB6] text-white shadow-[0_8px_20px_rgba(32,205,182,0.24)]"
                        : "border-[#20CDB6]/25 bg-white text-[#128f80] hover:border-[#20CDB6] hover:bg-[#20CDB6]/10"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="输入感兴趣的话题，如：空腹有氧好不好（选填）"
            className="w-full rounded-2xl border border-[#20CDB6]/20 bg-white px-4 py-3 outline-none transition focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || presetLoading !== null}
            className="w-full rounded-2xl bg-[#20CDB6] px-4 py-3 font-semibold text-white shadow-[0_14px_34px_rgba(32,205,182,0.35)] transition hover:bg-[#19b8a4] disabled:opacity-50"
          >
            {submitting || presetLoading ? (
              "正在核验证据…"
            ) : (
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <svg
                  viewBox="0 0 20 20"
                  className="relative top-px h-[18px] w-[18px]"
                  fill="none"
                  aria-hidden
                >
                  <circle cx="8.3" cy="8.3" r="5.1" stroke="currentColor" strokeWidth="2.5" />
                  <path d="M12.2 12.2L16.6 16.6" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
                </svg>
                <span>开始核验</span>
              </span>
            )}
        </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </main>
  );
}
