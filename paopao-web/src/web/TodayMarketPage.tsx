/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 浠婃棩澶х洏锛圵eb 绔?/ 妗岄潰锛?
 * 璁捐鍩虹嚎锛歷3 楂樹繚鐪熺
 *  - 宸︿晶娣卞簳渚ц竟鏍?+ 椤舵爮锛堝湪 WebApp 涓級
 *  - 鍐呭鍖猴細娉℃场鑰佸笀 Banner 鈫?3 寮犵揣鍑戞í鎺掓寚鏁板崱 鈫?鍗曟爮浠婂ぉ鍙戠敓浜嗕粈涔?
 *      路 浠婂ぉ鍙戠敓浜嗕粈涔堬紙灏忕櫧/涓撲笟鍒囨崲 路 涓轰粈涔堜細杩欐牱灞曞紑 路 鏈夌敤/鏀硅繘鍙嶉锛?
 *      路 鏉垮潡鐑姏 / 娑ㄨ穼姒?/ 鎴戠殑鑷€?鏆傞殣钘?
 *  - A鑲￠厤鑹诧細娑?#e5484d / 璺?#0ca678锛涜竟妗?#eef0f3锛涗晶杈规爮 #0b1120
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  ChevronDown,
  ShieldCheck,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Grid3x3,
  ListOrdered,
  Star,
} from 'lucide-react';
import { MarketStory, StockItem } from '../types';
import { formatChineseDate, mockUserProfile } from '../data';
import { BrainMark } from './BrainMark';
import { useLiveIndices } from './useLiveIndices';
import {
  webStories,
  heatSectors,
  getRankedStocks,
  marketTemperature,
  marketHeadline,
} from './mockWebData';

const UP = '#e5484d';
const DOWN = '#0ca678';
const BORDER = '#eef0f3';

type StoryMode = 'beginner' | 'professional';

interface TodayMarketPageProps {
  followedStocks: StockItem[];
  onAskTeacherAboutStock: (name: string, code: string) => void;
}

/* ----------------------------- 棰滆壊宸ュ叿 ----------------------------- */

function heatStyle(pct: number) {
  const mag = Math.min(Math.abs(pct), 5) / 5; // 0..1
  const alpha = 0.12 + mag * 0.6; // 0.12..0.72
  const base = pct >= 0 ? '229,72,77' : '12,166,120';
  const textDark = alpha < 0.5;
  return {
    background: `rgba(${base}, ${alpha.toFixed(2)})`,
    color: textDark ? (pct >= 0 ? '#9f1239' : '#047857') : '#ffffff',
    border: `rgba(${base}, ${(alpha * 0.7).toFixed(2)})`,
  };
}

/* ----------------------------- 鏁呬簨娓叉煋杈呭姪 ----------------------------- */

const TYPE_LABELS: Record<string, string> = {
  sector_driver: '甯傚満鐑偣',
  geo_event: '鍦扮紭浜嬩欢',
  policy_driver: '鏀跨瓥椹卞姩',
  macro_event: '瀹忚浜嬩欢',
};

const DRIVER_LABELS: Record<string, string> = {
  primary: '涓婚┍鍔?,
  secondary: '娆￠┍鍔?,
  diffusion: '鎵╂暎閫昏緫',
};

function visibleReasoningSteps(story: MarketStory) {
  const steps = story.reasoning?.steps || [];
  const withoutRepeatedOpening = steps.filter((step, index) => !(index === 0 && step.kind === 'fact'));
  return withoutRepeatedOpening.length > 0 ? withoutRepeatedOpening : steps;
}

/* ===================================================================== */

export function TodayMarketPage({ followedStocks, onAskTeacherAboutStock }: TodayMarketPageProps) {
  const [storyMode, setStoryMode] = useState<StoryMode>('beginner');
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [thumbsFeedback, setThumbsFeedback] = useState<Record<string, 'up' | 'down' | null>>({});
  // 浠婂ぉ鍙戠敓浜嗕粈涔堬細浼樺厛鐢ㄥ悗绔?/api/morning-report 鐨勭湡瀹炵儹鐐癸紙Agent 鍩轰簬瀹炴椂琛屾儏鍒嗘瀽鐢熸垚锛夛紝澶辫触鍥為€€ mock
  const [stories, setStories] = useState<MarketStory[]>(webStories);
  const [storiesLoading, setStoriesLoading] = useState(false);

  const loadStories = async (force = false) => {
    try {
      setStoriesLoading(true);
      const res = await fetch(`/api/morning-report${force ? '?refresh=1' : ''}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data?.stories) || data.stories.length === 0) return;
      setStories(data.stories as MarketStory[]);
    } catch {
      // 淇濇寔 mock
    } finally {
      setStoriesLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 棣栨鍔犺浇锛堢敤鎴峰埛鏂伴〉闈級濮嬬粓鎷夊彇
      try {
        setStoriesLoading(true);
        const res = await fetch('/api/morning-report?refresh=1'); // 用户刷新页面强制调真实数据+AI
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data?.stories) || data.stories.length === 0) return;
        setStories(data.stories as MarketStory[]);
      } catch {
        // 淇濇寔 mock
      } finally {
        if (!cancelled) setStoriesLoading(false);
      }
    })();

    // 姣?15 鍒嗛挓鑷姩鍒锋柊涓€娆★紝浠呬氦鏄撴椂娈碉紙isOpen=true锛屾帓闄ゅ崍浼?鏀剁洏/鍛ㄦ湯/鑺傚亣鏃ワ紝鐢卞悗绔?getMarketStatus 缁熶竴鍒ゆ柇锛?
    const timer = setInterval(async () => {
      if (cancelled) return;
      try {
        const statusRes = await fetch('/api/market-overview');
        if (!statusRes.ok || cancelled) return;
        const statusData = await statusRes.json();
        if (statusData?.marketStatus?.isOpen === true) {
          loadStories(true);
        }
      } catch {
        // 鐘舵€佹煡璇㈠け璐ュ垯涓嶅埛鏂?
      }
    }, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // 瀹炴椂鎸囨暟锛氫笌甯傚満鍦板浘椤靛叡鐢ㄥ悓涓€浠藉疄鏃舵暟鎹紙妯″潡绾х紦瀛樹繚璇佷袱椤典竴鑷达級
  const { indices: liveIndices, isLive, marketStatus } = useLiveIndices();
  // 娉℃场瑙ｈ锛氬姞杞戒腑鏄剧ず鍗犱綅锛屽疄鏃舵暟鎹埌杈惧悗涓€娆℃覆鏌?
  const [liveHeadline, setLiveHeadline] = useState<string | null>(null);

  // 鍔ㄦ€佹场娉¤В璇伙細浼樺厛鐢ㄤ笁澶ф寚鏁板綋鍓嶇偣浣嶄笌娑ㄨ穼锛涙媺鍙栧け璐ュ洖閫€闈欐€佸彛鎾?
  useEffect(() => {
    if (!liveIndices) return;
    if (!isLive) {
      setLiveHeadline(marketHeadline);
      return;
    }
    const byName = (name: string) => liveIndices.find((i) => (i.name || '').includes(name));
    const sh = byName('涓婅瘉');
    const sz = byName('娣辫瘉');
    const cy = byName('鍒涗笟鏉?);
    if (!sh || !sz || !cy) return;
    const upCount = liveIndices.filter((i) => i.changePercent > 0).length;
    const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
    const move = upCount >= 2 ? '鏀鹃噺涓婅' : '鍒嗗寲鏁寸悊';
    setLiveHeadline(
      `馃巿 娉℃场鑰佸笀鍙戠幇锛屼粖鏃ュぇ鐩?{move}锛屼笂璇佹寚鏁扮害${sh.value.toFixed(2)}鐐癸紙${pct(sh.changePercent)}锛夛紝娣辫瘉鎴愭寚绾?{sz.value.toFixed(2)}鐐癸紝鍒涗笟鏉挎寚绾?{cy.value.toFixed(2)}鐐广€傛寚鏁版櫘閬嶈蛋寮猴紝鍏虫敞鐑偣鑳藉惁鎸佺画銆佷互鍙婅祫閲戞槸鍚﹀嚭鐜伴珮浣嶅垎姝э紝鍊煎緱鐣欐剰鍚庣画閲忚兘鍙樺寲銆俙,
    );
  }, [liveIndices, isLive]);

  const hour = new Date().getHours();
  const greet =
    hour < 6 ? '鍑屾櫒濂? : hour < 11 ? '鏃╀笂濂? : hour < 14 ? '涓崍濂? : hour < 18 ? '涓嬪崍濂? : '鏅氫笂濂?;

  const toggleStory = (storyId: string) => {
    setExpandedStories((prev) => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  };

  const handleThumbsUp = (story: MarketStory) => {
    const key = `${storyMode}:${story.storyId}`;
    setThumbsFeedback((prev) => ({ ...prev, [key]: prev[key] === 'up' ? null : 'up' }));
  };
  const handleThumbsDown = (story: MarketStory) => {
    const key = `${storyMode}:${story.storyId}`;
    setThumbsFeedback((prev) => ({ ...prev, [key]: prev[key] === 'down' ? null : 'down' }));
  };

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-6 space-y-6">
      {/* ---------------- 娉℃场鑰佸笀 Banner ---------------- */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm lg:flex-row lg:items-center"
        style={{ borderColor: BORDER }}
      >
        <BrainMark size={52} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {greet}锛寋mockUserProfile.name}
          </p>
          <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <p className="text-[11px] font-bold text-indigo-500">娉℃场瑙ｈ</p>
            <p className="mt-1 text-[13px] leading-6 text-gray-700">
              {liveHeadline === null ? '娉℃场姝ｅ湪杩炴帴瀹炴椂琛屾儏鈥? : liveHeadline}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 lg:flex-col">
          <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
            <span className="text-[10px] font-semibold text-rose-500">甯傚満娓╁害</span>
            <span className="font-mono text-sm font-bold text-rose-600">
              {marketTemperature.temp}鈩?
            </span>
            <span className="text-[10px] font-medium text-rose-400">{marketTemperature.label}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: marketStatus?.isOpen ? '#10b981' : marketStatus?.isOpen === false ? '#f59e0b' : '#10b981' }} />
            <span className="text-[10px] font-semibold text-emerald-600">
              {marketStatus ? marketStatus.label.replace(/^鈥擻s*/, '') : '鐩樹腑'}
            </span>
            <span className="text-[10px] text-emerald-500">{formatChineseDate(new Date())}</span>
          </div>
        </div>
      </motion.section>

      {/* ---------------- 3 寮犵揣鍑戞í鎺掓寚鏁板崱 ---------------- */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {liveIndices === null ? (
          // 鍔犺浇鍗犱綅锛氶伩鍏嶅厛鏄剧ず mock 鍐嶈烦鍒板疄鏃剁殑闂儊
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border bg-white px-4 py-3" style={{ borderColor: BORDER }}>
              <div className="h-6 w-24 animate-pulse rounded bg-gray-100" />
              <div className="h-5 w-20 animate-pulse rounded bg-gray-100" />
            </div>
          ))
        ) : liveIndices.map((idx) => {
          const up = idx.changePercent >= 0;
          const color = up ? UP : DOWN;
          return (
            <div
              key={idx.code}
              className="group flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ borderColor: BORDER }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ background: up ? 'rgba(229,72,77,0.1)' : 'rgba(12,166,120,0.1)', color }}
                >
                  {up ? <TrendingUp size={13} strokeWidth={2.4} /> : <TrendingDown size={13} strokeWidth={2.4} />}
                </span>
                <span className="truncate text-xs font-medium text-gray-500">{idx.name}</span>
              </div>
              <div className="flex shrink-0 items-baseline gap-2">
                <span className="font-mono text-lg font-bold tracking-tight text-gray-900">
                  {idx.value.toFixed(2)}
                </span>
                <span className="font-mono text-xs font-semibold" style={{ color }}>
                  {up ? '+' : ''}
                  {idx.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </motion.section>

      {/* ---------------- 浠婂ぉ鍙戠敓浜嗕粈涔堬紙鍗犳弧鏁磋锛?---------------- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <Activity size={18} className="text-indigo-600" />
            浠婂ぉ鍙戠敓浜嗕粈涔?
          </h2>
          <div className="flex items-center rounded-xl bg-[#f1f3f5] p-1" role="group" aria-label="鏁呬簨闃呰妯″紡">
            {(['beginner', 'professional'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={storyMode === mode}
                onClick={() => {
                  setStoryMode(mode);
                  setExpandedStories(new Set());
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  storyMode === mode ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode === 'beginner' ? '灏忕櫧妯″紡' : '涓撲笟妯″紡'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs leading-5 text-gray-500">
          {storyMode === 'beginner' ? '鐢ㄤ竴灞忕湅鎳備簨浠跺拰鏈€鐭€昏緫' : '鏌ョ湅鏁版嵁楠岃瘉銆佸鍥犵礌椹卞姩涓庡弽鍚戞潯浠?}
        </p>

        <div className="space-y-4">
          {storiesLoading && stories === webStories ? (
            <div className="rounded-2xl border bg-white p-5 text-[12px] text-gray-400" style={{ borderColor: BORDER }}>
              娉℃场姝ｅ湪鍩轰簬瀹炴椂琛屾儏鍒嗘瀽浠婃棩鐑偣鈥?
            </div>
          ) : stories.map((story) => {
            const expanded = expandedStories.has(story.storyId);
            const reasoningSteps =
              storyMode === 'beginner' && story.teacher.simpleChain?.length
                ? story.teacher.simpleChain.map((text, index) => ({
                    id: `simple-${index + 1}`,
                    text,
                    kind: 'knowledge' as const,
                    evidenceIds: [],
                  }))
                : visibleReasoningSteps(story);
            const professional = story.professional;
            const feedbackKey = `${storyMode}:${story.storyId}`;
            return (
              <article
                key={story.storyId}
                className="rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                style={{ borderColor: BORDER }}
              >
                {/* 鏍囩琛?*/}
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                    {TYPE_LABELS[story.type] || '甯傚満浜嬩欢'}
                  </span>
                  {storyMode === 'professional' && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-600">
                      <ShieldCheck size={13} className="text-indigo-500" />
                      璇佹嵁璇勫垎 {professional.confidence.score}/100
                    </span>
                  )}
                </div>

                {/* 鏍囬 + 鎸囨爣 */}
                <h3 className="mt-3 text-[15px] font-bold leading-7 text-gray-900">{story.title}</h3>
                {story.metrics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {story.metrics.map((metric) => (
                      <span
                        key={`${metric.label}-${metric.value}`}
                        className="rounded-lg bg-[#f7f8fa] px-2 py-1 text-[11px] font-medium text-gray-600"
                      >
                        {metric.label}锛?span className="font-semibold text-gray-800">{metric.value}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* 姝ｆ枃锛氬皬鐧?涓撲笟 */}
                {storyMode === 'beginner' ? (
                  <div className="mt-3 flex gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                    <BrainMark size={32} className="shrink-0" />
                    <p className="text-[13px] leading-6 text-gray-700">
                      <strong className="text-indigo-800">娉℃场瑙ｈ锛?/strong>
                      {story.teacher.summary}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl bg-indigo-50/60 p-3">
                      <p className="text-[10px] font-bold text-indigo-500">浜嬩欢缁撹</p>
                      <p className="mt-0.5 text-[13px] font-medium leading-6 text-gray-800">
                        {professional.conclusion}
                      </p>
                    </div>
                    {professional.drivers.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-gray-400">鏍稿績椹卞姩鍥犵礌</p>
                        {professional.drivers.map((driver, index) => (
                          <div key={`${driver.role}-${index}`} className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                driver.role === 'primary'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : driver.role === 'secondary'
                                    ? 'bg-sky-100 text-sky-700'
                                    : 'bg-violet-100 text-violet-700'
                              }`}
                            >
                              {DRIVER_LABELS[driver.role]}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold text-gray-800">{driver.title}</p>
                              <p className="mt-0.5 text-[11px] leading-5 text-gray-600">{driver.explanation}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 涓轰粈涔堜細杩欐牱锛? 鏌ョ湅瀹屾暣閫昏緫 */}
                {reasoningSteps.length > 0 && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => toggleStory(story.storyId)}
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between rounded-xl bg-[#f7f8fa] px-3 py-2.5 text-[13px] font-bold text-gray-700 transition-colors hover:bg-[#f0f1f4]"
                    >
                      <span>{storyMode === 'beginner' ? '涓轰粈涔堜細杩欐牱锛? : '鏌ョ湅瀹屾暣閫昏緫'}</span>
                      <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 space-y-3 rounded-2xl border bg-[#fafbfc] p-3" style={{ borderColor: BORDER }}>
                            {storyMode === 'professional' && (
                              <p className="text-[10px] font-bold text-gray-400">瀹屾暣鍥犳灉閾?/p>
                            )}
                            {reasoningSteps.map((step, index) => (
                              <div key={step.id} className="flex gap-2">
                                <div className="flex flex-col items-center">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-indigo-200 bg-white text-[10px] font-bold text-indigo-700">
                                    {index + 1}
                                  </span>
                                  {index < reasoningSteps.length - 1 && <span className="h-5 w-px bg-indigo-200" />}
                                </div>
                                <div className="min-w-0 flex-1 pb-2">
                                  <p className="text-[12px] leading-6 text-gray-700">{step.text}</p>
                                  {storyMode === 'professional' && (
                                    <span className="text-[10px] text-gray-400">
                                      {step.kind === 'fact' ? '宸茬‘璁や簨瀹? : step.kind === 'knowledge' ? '閲戣瀺甯歌瘑' : '鍚堢悊鎺ㄦ柇'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}

                            {storyMode === 'beginner' && (story.teacher.uncertaintyText || story.reasoning.uncertainty) && (
                              <p className="border-t border-amber-200/60 pt-2 text-[11px] leading-5 text-amber-800">
                                馃挱 {story.teacher.uncertaintyText || story.reasoning.uncertainty}
                              </p>
                            )}

                            {storyMode === 'professional' && (
                              <div className="space-y-2 border-t border-gray-200 pt-3">
                                <div>
                                  <p className="text-[10px] font-bold text-emerald-700">鏀寔璇佹嵁</p>
                                  <ul className="mt-1 space-y-1">
                                    {professional.supportingEvidence.length > 0 ? (
                                      professional.supportingEvidence.map((item) => (
                                        <li key={item} className="text-[11px] leading-5 text-gray-600">
                                          鈥?{item}
                                        </li>
                                      ))
                                    ) : (
                                      <li className="text-[11px] text-gray-500">褰撳墠浠呮湁琛屾儏浜嬪疄锛屾殏鏃犻澶栨敮鎸佽瘉鎹€?/li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-amber-700">璇佹嵁缂哄彛</p>
                                  <ul className="mt-1 space-y-1">
                                    {(professional.evidenceGaps.length > 0 ? professional.evidenceGaps : [story.reasoning.uncertainty])
                                      .filter(Boolean)
                                      .map((item) => (
                                        <li key={item} className="text-[11px] leading-5 text-gray-600">
                                          鈥?{item}
                                        </li>
                                      ))}
                                  </ul>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-white p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-bold text-gray-800">
                                      璇佹嵁璇勫垎 {professional.confidence.score}/100
                                    </p>
                                    <span className="text-[10px] text-gray-500">
                                      {professional.confidence.level === 'high'
                                        ? '杈冨厖鍒?
                                        : professional.confidence.level === 'medium'
                                          ? '涓瓑'
                                          : '鏈夐檺'}
                                    </span>
                                  </div>
                                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                    <div
                                      className="h-full rounded-full bg-indigo-500"
                                      style={{ width: `${professional.confidence.score}%` }}
                                    />
                                  </div>
                                  <p className="mt-2 text-[11px] leading-5 text-gray-600">
                                    {professional.confidence.explanation}
                                  </p>
                                </div>
                                {professional.alternativeExplanations.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-bold text-gray-700">鏇夸唬瑙ｉ噴</p>
                                    {professional.alternativeExplanations.map((item) => (
                                      <p key={item} className="mt-1 text-[11px] leading-5 text-gray-600">
                                        鈥?{item}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {professional.counterLogic.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-bold text-rose-700">鍙嶅悜閫昏緫</p>
                                    {professional.counterLogic.map((item) => (
                                      <p key={item} className="mt-1 text-[11px] leading-5 text-gray-600">
                                        鈥?{item}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {professional.observationIndicators.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-bold text-indigo-700">鍚庣画瑙傚療</p>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                      {professional.observationIndicators.map((item) => (
                                        <span
                                          key={item}
                                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] leading-4 text-gray-600"
                                        >
                                          {item}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* 鍙嶉 */}
                <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-gray-50 pt-2">
                  <button
                    type="button"
                    onClick={() => handleThumbsUp(story)}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all ${
                      thumbsFeedback[feedbackKey] === 'up'
                        ? 'border border-indigo-200 bg-indigo-50 text-indigo-600'
                        : 'text-gray-400 hover:bg-gray-50 hover:text-indigo-500'
                    }`}
                  >
                    <ThumbsUp size={13} className={thumbsFeedback[feedbackKey] === 'up' ? 'fill-indigo-500' : ''} />
                    鏈夌敤
                  </button>
                  <button
                    type="button"
                    onClick={() => handleThumbsDown(story)}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all ${
                      thumbsFeedback[feedbackKey] === 'down'
                        ? 'border border-rose-200 bg-rose-50 text-rose-600'
                        : 'text-gray-400 hover:bg-gray-50 hover:text-rose-500'
                    }`}
                  >
                    <ThumbsDown size={13} className={thumbsFeedback[feedbackKey] === 'down' ? 'fill-rose-500' : ''} />
                    鏀硅繘
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ===== 鏉垮潡鐑姏 / 娑ㄨ穼姒?/ 鎴戠殑鑷€夛紙鏆傞殣钘忥級 ===== */}
      {/* <aside className="space-y-6">
        // 鏉垮潡鐑姏
        <section>...</section>
        // 娑ㄨ穼姒?
        <section>...</section>
        // 鎴戠殑鑷€?
        <section>...</section>
      </aside> */}
    </div>
  );
}
