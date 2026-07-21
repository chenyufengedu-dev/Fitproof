"use client";

import { useEffect, useState } from "react";
import type { Analysis, PresetData, SingleSampleData } from "@/types";
import FitProofTitleAnimation from "@/components/FitProofTitleAnimation";

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

type Mode = "single" | "dual";

function findDouyinLink(text: string) {
  const match = text.match(/https?:\/\/[^\s"'<>]*(?:v\.douyin\.com|douyin\.com\/video)[^\s"'<>]*/i);
  return match?.[0] || "";
}

export default function InputPage({
  apiBaseUrl,
  onAnalyze,
  onPresetLoaded,
  onAnalyzeSingle,
  onSingleSampleLoaded,
  initialError,
}: InputPageProps) {
  const [mode, setMode] = useState<Mode>("single");
  const [topic, setTopic] = useState("");
  const [singleLink, setSingleLink] = useState("");
  const [clipboardLink, setClipboardLink] = useState("");
  const [error, setError] = useState(initialError || "");
  const [submitting, setSubmitting] = useState(false);
  const [singleSubmitting, setSingleSubmitting] = useState(false);
  const [presetLoading, setPresetLoading] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState(PRESETS[0].id);

  const selectedPreset = PRESETS.find((p) => p.id === selectedPresetId) || PRESETS[0];

  useEffect(() => {
    let cancelled = false;
    async function detectClipboard() {
      try {
        if (typeof window === "undefined") return;
        if (!window.isSecureContext || !navigator.clipboard?.readText) return;
        const text = await navigator.clipboard.readText();
        const link = findDouyinLink(text || "");
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
    const clean = findDouyinLink(link) || link.trim();
    if (!clean) {
      setError("请先粘贴一条抖音视频链接");
      return;
    }
    setError("");
    setSingleSubmitting(true);
    try {
      await onAnalyzeSingle(clean, topic.trim() || "健康说法核验");
    } finally {
      setSingleSubmitting(false);
    }
  }

  async function handleSingleSubmit() {
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

  async function handleDualSubmit() {
    setError("");
    setSubmitting(true);
    try {
      await loadPreset(selectedPreset.id, selectedPreset.label);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7fffd] px-4 py-8 text-slate-950 sm:px-5 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col justify-center">
        <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-[#20CDB6]/25 bg-white px-3 py-1.5 text-xs font-medium text-[#0B6E63] shadow-sm">
          <span className="h-2 w-2 rounded-full bg-[#20CDB6]" />
          健康说法核验 · AI 证据校验
        </div>

        <section className="relative overflow-hidden rounded-[30px] border border-[#20CDB6]/15 bg-white px-6 pt-[10px] pb-[14px] shadow-[0_22px_70px_rgba(18,116,103,0.12)]">
          <div className="relative -ml-1 w-full">
            <h1 className="sr-only">FitProof</h1>
            <FitProofTitleAnimation />
          </div>
          <p className="mt-[6px] text-xl font-semibold text-slate-800">让 AI 替你多看一步</p>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
            粘贴健康短视频链接，提取可核验主张，并对照权威健康指南给出更稳妥的判断。
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-[#0B6E63]">
            <span>权威健康指南</span>
            <span>风险分层提示</span>
            <span>视频出处溯源</span>
          </div>
        </section>

        <section className="mt-5 rounded-[28px] border border-[#20CDB6]/15 bg-white p-4 shadow-[0_16px_54px_rgba(18,116,103,0.10)]">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#20CDB6]/15 bg-[#f3fbf9] p-1">
            {[
              { id: "single" as const, label: "单视频核验" },
              { id: "dual" as const, label: "双视频预置" },
            ].map((item) => {
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMode(item.id);
                    setError("");
                  }}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#20CDB6] text-white shadow-[0_8px_18px_rgba(32,205,182,0.24)]"
                      : "text-[#0B6E63] hover:bg-white"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="输入感兴趣的话题，如：孕妇能不能吃蛋黄（选填）"
            className="mt-4 w-full rounded-2xl border border-[#20CDB6]/20 bg-white px-4 py-3 outline-none transition focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10"
          />

          {mode === "single" ? (
            <div className="mt-4 space-y-3">
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

              <input
                type="text"
                value={singleLink}
                onChange={(e) => setSingleLink(e.target.value)}
                placeholder="粘贴单条抖音链接，如：https://v.douyin.com/..."
                className="w-full rounded-2xl border border-[#20CDB6]/20 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#20CDB6] focus:ring-4 focus:ring-[#20CDB6]/10"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleSingleSubmit()}
                  disabled={singleSubmitting || presetLoading !== null || submitting}
                  className="rounded-2xl bg-[#20CDB6] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(32,205,182,0.28)] transition hover:bg-[#19b8a4] disabled:opacity-50"
                >
                  {singleSubmitting ? "正在拆解主张…" : "分析单视频"}
                </button>
                <button
                  type="button"
                  onClick={loadSingleSample}
                  disabled={singleSubmitting || presetLoading !== null || submitting}
                  className="rounded-2xl border border-[#20CDB6]/25 bg-white px-4 py-3 text-sm font-semibold text-[#0B6E63] transition hover:border-[#20CDB6] hover:bg-[#f3fbf9] disabled:opacity-50"
                >
                  用样例数据
                </button>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                真实链接会先转写视频并拆出主张，可能需要 1 到 3 分钟；样例数据可用于离线演示。
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">试试这些话题</p>
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
                            : "border-[#20CDB6]/25 bg-white text-[#0B6E63] hover:border-[#20CDB6] hover:bg-[#f3fbf9]"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                {selectedPreset.links.map((link, i) => (
                  <div
                    key={link}
                    className="flex items-start gap-2 rounded-2xl border border-[#20CDB6]/15 bg-[#f3fbf9] px-3 py-2.5"
                  >
                    <span className="mt-1 rounded-full bg-[#20CDB6]/15 px-2 py-0.5 text-[11px] font-semibold text-[#0B6E63]">
                      视频 {i + 1}
                    </span>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 break-all text-xs leading-relaxed text-slate-500 transition hover:text-[#0B6E63]"
                    >
                      {link}
                    </a>
                  </div>
                ))}
              </div>

              <button
                onClick={handleDualSubmit}
                disabled={submitting || presetLoading !== null}
                className="w-full rounded-2xl bg-[#20CDB6] px-4 py-3 font-semibold text-white shadow-[0_14px_34px_rgba(32,205,182,0.30)] transition hover:bg-[#19b8a4] disabled:opacity-50"
              >
                {submitting || presetLoading ? "正在加载预置核验…" : "开始核验双视频"}
              </button>
            </div>
          )}

          {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
        </section>
      </div>
    </main>
  );
}
