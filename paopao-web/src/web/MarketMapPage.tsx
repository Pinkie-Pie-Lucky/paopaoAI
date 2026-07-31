/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 市场地图（Web 端 / 桌面）
 * 设计基线：高保真原型（Treemap 热力图）
 *  - 泡泡发现概览卡（主要指数 / 市场温度 / 全市场涨跌板块数）
 *  - 热力地图上方标签【领涨】【领跌】【泡泡精选】（各 5-10 个真实板块，实时数据，无个股）
 *  - 左侧：Treemap 热力地图（按当前标签展示真实板块色块，红涨绿跌）
 *  - 右侧栏：与左侧一致的同组板块榜单 / 选中板块详情 / 色阶说明
 *
 * 数据说明：全部板块来自 /api/sectors（东方财富行业板块，约100个，实时涨跌幅）
 *  - 领涨：涨幅最高的 8 个
 *  - 领跌：跌幅最大的 8 个
 *  - 泡泡精选：|涨跌幅| 最大的 10 个（强势 + 弱势混合）
 *
 * 历史说明：原【全部】【异动】【关注】筛选、板块/个股地图切换、个股色块、右栏详情页签、
 * 板块详情 / 个股详情组件均按用户要求以注释或保留定义的方式留存在文件中，未删除。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Search,
  Grid3x3,
  Layers3,
  Star,
  Heart,
  TrendingUp,
  TrendingDown,
  Flame,
  Sparkles,
  MessageSquare,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Activity,
  BarChart3,
  Shield,
  Newspaper,
  Clock,
} from 'lucide-react';
import { StockItem } from '../types';
import type { HeatSector } from './mockWebData';
import { formatChineseDate } from '../data';
import { BrainMark } from './BrainMark';
import { useLiveIndices } from './useLiveIndices';
import { heatSectors, getRankedStocks, marketTemperature, getSectorDetail, type SectorDetail } from './mockWebData';

const UP = '#e5484d';
const DOWN = '#0ca678';
const BORDER = '#eef0f3';

/* ════════════ 类型定义 ════════════ */

// 原类型（保留，供旧代码参考，UI 已不使用全部/异动/关注）
type MapView = 'sector' | 'stock';
type MapFilter = 'all' | 'featured' | 'anomaly' | 'followed';

// 新增：领涨 / 领跌 / 泡泡精选 三组标签
type RealFilter = 'gainers' | 'losers' | 'featured';

// 新增：真实板块结构（仅板块级，无个股）
interface RealSector {
  id: string;
  name: string;
  changePercent: number;
  /** 东方财富板块 code（BKxxxx），用于拉取详情 */
  code?: string;
}

/* ----------------------------- 颜色工具 ----------------------------- */

function heatStyle(pct: number) {
  const mag = Math.min(Math.abs(pct), 6) / 6; // 0..1
  const alpha = 0.12 + mag * 0.62; // 0.12..0.74
  const base = pct >= 0 ? '229,72,77' : '12,166,120';
  const textDark = mag < 0.42;
  return {
    background: `rgba(${base}, ${alpha.toFixed(2)})`,
    color: textDark ? (pct >= 0 ? '#9f1239' : '#047857') : '#ffffff',
    border: `rgba(${base}, ${(alpha * 0.7).toFixed(2)})`,
  };
}

function headStyle(pct: number) {
  const mag = Math.min(Math.abs(pct), 6) / 6;
  const base = pct >= 0 ? '229,72,77' : '12,166,120';
  if (mag > 0.4) {
    return { background: `rgb(${base})`, color: '#ffffff', border: `rgb(${base})` };
  }
  return {
    background: `rgba(${base}, 0.2)`,
    color: pct >= 0 ? '#9f1239' : '#047857',
    border: `rgba(${base}, 0.32)`,
  };
}

/* ════════════ 原板块/个股详情组件（保留定义，当前 UI 不调用） ════════════ */

const tagStyles: Record<string, string> = {
  今日主线: 'bg-violet-100 text-violet-700',
  异动放量: 'bg-amber-100 text-amber-800',
  异动上涨: 'bg-amber-100 text-amber-800',
  新闻驱动: 'bg-sky-100 text-sky-700',
  资金扩散: 'bg-cyan-100 text-cyan-800',
  值得观察: 'bg-slate-100 text-slate-700',
  与我有关: 'bg-rose-100 text-rose-700',
};

const stageStyles: Record<string, { label: string; cls: string }> = {
  just_starting: { label: '刚刚启动', cls: 'bg-green-100 text-green-700 border-green-200' },
  strengthening: { label: '持续走强', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  high_volatility: { label: '高位震荡', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  pullback: { label: '冲高回落', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  cooling_down: { label: '逐步降温', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  no_clear_trend: { label: '暂无明确趋势', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

/**
 * 原板块详情卡（保留定义，当前 UI 不调用）
 */
function SectorDetailCard({
  detail,
  onSelectStock,
  onAsk,
  hideHeader = false,
}: {
  detail: SectorDetail;
  onSelectStock: (code: string) => void;
  onAsk: (name: string, code: string) => void;
  hideHeader?: boolean;
}) {
  const colorOf = (v: number) => (v >= 0 ? UP : DOWN);
  const pctText = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const st = stageStyles[detail.stage] || stageStyles.no_clear_trend;
  return (
    <div className={`custom-scrollbar ${hideHeader ? '' : 'mt-3'} max-h-[70vh] space-y-4 overflow-y-auto pr-1`}>
      {!hideHeader && (
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] font-bold text-gray-900">{detail.sectorName}</h3>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
          </div>
          <div className="mt-1 font-mono text-2xl font-bold" style={{ color: colorOf(detail.todayChangePercent) }}>
            {pctText(detail.todayChangePercent)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {detail.signalTags.map((t) => (
              <span key={t} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tagStyles[t] || 'bg-slate-100 text-slate-600'}`}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-gray-700">
          <BarChart3 size={13} className="text-amber-600" />
          板块内部表现
        </p>
        <div className="space-y-1 rounded-xl bg-[#f7f8fa] p-2">
          {detail.internalStocks.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => onSelectStock(s.code)}
              className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white"
            >
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-gray-800">
                {s.name}
                {s.isLeader && <span className="rounded bg-indigo-50 px-1 text-[8px] font-bold text-indigo-600">龙头</span>}
              </span>
              <span className="font-mono text-[11px] font-semibold" style={{ color: colorOf(s.changePercent) }}>
                {pctText(s.changePercent)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2 border-t border-gray-100 pt-3">
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-gray-700">
          <MessageSquare size={13} className="text-indigo-600" />
          问泡泡
        </p>
        <button
          type="button"
          onClick={() => onAsk(detail.sectorName, detail.sectorId)}
          className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
        >
          分析「{detail.sectorName}」
        </button>
      </div>
    </div>
  );
}

/**
 * 原个股详情卡（保留定义，当前 UI 不调用）
 */
function StockDetailCard({
  stock,
  sector,
  onSelectStock,
  onSelectSector,
  onAsk,
}: {
  stock: StockItem;
  sector?: HeatSector;
  onSelectStock: (code: string) => void;
  onSelectSector: (sectorId: string) => void;
  onAsk: (name: string, code: string) => void;
}) {
  const colorOf = (v: number) => (v >= 0 ? UP : DOWN);
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const sorted = sector ? [...sector.stocks].sort((a, b) => b.changePercent - a.changePercent) : [];
  const isLeader = sorted.length > 0 && sorted[0].code === stock.code;
  const detail = sector ? getSectorDetail(sector.id) : null;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-bold text-gray-900">{stock.name}</h3>
            <p className="font-mono text-[10px] text-gray-400">{stock.code}</p>
          </div>
          <span
            className="rounded-lg px-2 py-1 font-mono text-sm font-bold"
            style={{
              background: stock.changePercent >= 0 ? 'rgba(229,72,77,0.1)' : 'rgba(12,166,120,0.1)',
              color: colorOf(stock.changePercent),
            }}
          >
            {pct(stock.changePercent)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-[#f7f8fa] py-2">
            <p className="text-[10px] text-gray-400">现价</p>
            <p className="font-mono text-[13px] font-bold text-gray-800">{stock.price.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-[#f7f8fa] py-2">
            <p className="text-[10px] text-gray-400">成交量</p>
            <p className="text-[12px] font-semibold text-gray-800">{stock.volume}</p>
          </div>
          <div className="rounded-lg bg-[#f7f8fa] py-2">
            <p className="text-[10px] text-gray-400">成交额</p>
            <p className="text-[12px] font-semibold text-gray-800">{stock.turnover}</p>
          </div>
        </div>
      </div>
      {sector && (
        <div className="rounded-xl bg-[#f7f8fa] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">所属板块</span>
            <button
              type="button"
              onClick={() => onSelectSector(sector.id)}
              className="flex items-center gap-1 text-[12px] font-bold text-indigo-700 transition-colors hover:text-indigo-900"
            >
              {sector.name}
              <span className="font-mono" style={{ color: colorOf(sector.changePercent) }}>
                {pct(sector.changePercent)}
              </span>
            </button>
          </div>
          {isLeader && <span className="mt-1 inline-block rounded bg-indigo-50 px-1 text-[9px] font-bold text-indigo-600">龙头</span>}
        </div>
      )}
      {detail && <SectorDetailCard detail={detail} onSelectStock={onSelectStock} onAsk={onAsk} hideHeader />}
    </div>
  );
}

/* ----------------------------- Treemap 布局算法（保留复用） ----------------------------- */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function worstRatio(areas: number[], side: number): number {
  if (areas.length === 0) return Infinity;
  const sum = areas.reduce((a, b) => a + b, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

function layoutRow(row: number[], rowIdx: number[], rowArea: number, free: Rect, rects: Rect[]): Rect {
  if (free.w >= free.h) {
    const colW = rowArea / free.h;
    let y = free.y;
    for (let j = 0; j < row.length; j++) {
      const tileH = row[j] / colW;
      rects[rowIdx[j]] = { x: free.x, y, w: colW, h: tileH };
      y += tileH;
    }
    return { x: free.x + colW, y: free.y, w: free.w - colW, h: free.h };
  }
  const rowH = rowArea / free.w;
  let x = free.x;
  for (let j = 0; j < row.length; j++) {
    const tileW = row[j] / rowH;
    rects[rowIdx[j]] = { x, y: free.y, w: tileW, h: rowH };
    x += tileW;
  }
  return { x: free.x, y: free.y + rowH, w: free.w, h: free.h - rowH };
}

/** 输入一组带 value 的项，返回按 squarified 算法排布、坐标对齐的矩形列表 */
function layoutTreemap<T extends { id: string; value: number }>(items: T[], rect: Rect): Array<T & Rect> {
  const n = items.length;
  const out: Array<T & Rect> = new Array(n);
  if (n === 0) return out;
  if (n === 1) {
    out[0] = { ...items[0], ...rect };
    return out;
  }
  const totalValue = items.reduce((s, it) => s + it.value, 0) || 1;
  const scale = (rect.w * rect.h) / totalValue;
  const indexed = items.map((it, idx) => ({ it, idx }));
  const sorted = indexed.slice().sort((a, b) => b.it.value - a.it.value);
  const areas = sorted.map((s) => s.it.value * scale);

  const rects: Rect[] = new Array(n);
  let free: Rect = { ...rect };
  let row: number[] = [];
  let rowIdx: number[] = [];
  let rowArea = 0;
  const remaining = areas.slice();
  const remainingIdx = sorted.map((s) => s.idx);

  const side = () => Math.min(free.w, free.h);

  while (remaining.length > 0) {
    const a = remaining[0];
    const ai = remainingIdx[0];
    if (row.length === 0) {
      row.push(a);
      rowIdx.push(ai);
      rowArea += a;
      remaining.shift();
      remainingIdx.shift();
      continue;
    }
    const curWorst = worstRatio(row, side());
    const newWorst = worstRatio([...row, a], side());
    if (newWorst <= curWorst) {
      row.push(a);
      rowIdx.push(ai);
      rowArea += a;
      remaining.shift();
      remainingIdx.shift();
    } else {
      free = layoutRow(row, rowIdx, rowArea, free, rects);
      row = [a];
      rowIdx = [ai];
      rowArea = a;
      remaining.shift();
      remainingIdx.shift();
    }
  }
  if (row.length) layoutRow(row, rowIdx, rowArea, free, rects);

  sorted.forEach((s, i) => {
    out[s.idx] = { ...s.it, ...rects[i] };
  });
  return out;
}

/* ════════════ 原权重代理（保留，真实板块用等权重） ════════════ */

function sectorWeight(s: HeatSector) {
  return s.stocks.reduce((sum, st) => sum + st.price, 0);
}
function stockWeight(st: StockItem) {
  return st.price;
}

/* ----------------------------- 主组件 ----------------------------- */

interface MarketMapPageProps {
  onAskTeacherAboutStock: (name: string, code: string) => void;
  /** 外部搜索跳转定位（顶栏搜索使用）——注释保留，当前 UI 不使用 */
  initialTarget?: { sectorId?: string | null; stockCode?: string | null } | null;
}

interface SectorLayout extends Rect {
  id: string;
  sector: HeatSector;
}
interface StockLayout extends Rect {
  id: string;
  stock: StockItem;
  sectorId: string;
}

interface TooltipState {
  visible: boolean;
  left: number;
  top: number;
  stock: StockItem | null;
}

// 新增：标签元信息
const FILTER_META: Record<RealFilter, { label: string; icon: 'up' | 'down' | 'star' }> = {
  gainers: { label: '领涨', icon: 'up' },
  losers: { label: '领跌', icon: 'down' },
  featured: { label: '泡泡精选', icon: 'star' },
};

export function MarketMapPage({ onAskTeacherAboutStock }: MarketMapPageProps) {
  // 新增：当前标签（默认领涨）
  const [realFilter, setRealFilter] = useState<RealFilter>('gainers');
  // 新增：选中的真实板块（右侧详情）
  const [selectedRealSector, setSelectedRealSector] = useState<RealSector | null>(null);
  // 新增：真实板块数据源
  const [realSectors, setRealSectors] = useState<RealSector[]>([]);
  // 新增：选中的板块详情（优先从后端 /api/sector-detail 拉真实成分股/K线/新闻；失败按名称匹配 mock 兜底）
  const [selectedRealSectorDetail, setSelectedRealSectorDetail] = useState<SectorDetail | null>(null);
  useEffect(() => {
    if (!selectedRealSector) {
      setSelectedRealSectorDetail(null);
      return;
    }
    let cancelled = false;
    setSelectedRealSectorDetail(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/sector-detail?sectorName=${encodeURIComponent(selectedRealSector.name)}&sectorId=${encodeURIComponent(selectedRealSector.id)}`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data) return;
        // 后端返回完整详情，补齐前端 SectorDetail 需要的字段
        const detail: SectorDetail = {
          sectorId: selectedRealSector.id,
          sectorName: String(data.sector || selectedRealSector.name),
          todayChangePercent: Number(data.todayChangePercent) || selectedRealSector.changePercent,
          change5d: data.change5d ?? null,
          change20d: data.change20d ?? null,
          change3m: data.change3m ?? null,
          stage: String(data.stage || 'no_clear_trend'),
          stageLabel: String(data.stageLabel || '暂无明确趋势'),
          signalTags: Array.isArray(data.signalTags) ? data.signalTags : [],
          signalTypes: Array.isArray(data.signalTypes) ? data.signalTypes : [],
          healthMetrics: {
            upCount: data.healthMetrics?.upCount ?? 0,
            totalCount: data.healthMetrics?.totalCount ?? 0,
            medianChange: '--',
            leaderContribution: data.healthMetrics?.leaderContribution ?? '--',
            divergence: 'moderate',
            upRatio: data.healthMetrics?.upRatio ?? 0,
          },
          leadingStocks: Array.isArray(data.leadingStocks) ? data.leadingStocks : [],
          laggingStocks: Array.isArray(data.laggingStocks) ? data.laggingStocks : [],
          news: Array.isArray(data.news) ? data.news : [],
          heatMetrics: {
            todayTurnover: data.heatMetrics?.todayTurnover ?? null,
            turnoverChangePercent: data.heatMetrics?.turnoverChangePercent ?? null,
            turnoverVs20dAvg: data.heatMetrics?.turnoverVs20dAvg ?? null,
            turnoverRate: data.heatMetrics?.turnoverRate ?? null,
            upRatio: data.heatMetrics?.upRatio ?? null,
          },
          watchPoints: Array.isArray(data.watchPoints) ? data.watchPoints : [],
          exploreQuestions: Array.isArray(data.exploreQuestions) ? data.exploreQuestions : [],
          relatedChain: Array.isArray(data.relatedChain) ? data.relatedChain : [],
          internalStocks: Array.isArray(data.internalStocks) ? data.internalStocks : (Array.isArray(data.leadingStocks) ? data.leadingStocks : []),
        };
        if (!cancelled) setSelectedRealSectorDetail(detail);
      } catch {
        // 兜底：按名称匹配 mock 板块
        if (!cancelled) {
          const match = heatSectors.find((s) => s.name === selectedRealSector.name);
          setSelectedRealSectorDetail(match ? getSectorDetail(match.id) : null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRealSector]);
  const mapRef = useRef<HTMLDivElement>(null);

  // 拉取真实板块（/api/sectors：东方财富约100个行业板块，实时涨跌幅）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sectors');
        if (!res.ok) return;
        const data = await res.json();
        const sectors = Array.isArray(data?.sectors) ? data.sectors : [];
        if (cancelled) return;
        const cleaned = sectors
          .filter((s: any) => s && s.name && Number.isFinite(Number(s.changePercent)))
          .map((s: any) => ({ id: String(s.id || `r-${Math.random()}`), name: String(s.name), changePercent: Number(s.changePercent) }));
        if (cleaned.length > 0) setRealSectors(cleaned);
      } catch {
        // 保持空
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 新增：三组真实板块（各5-10个，实时数据，不展示个股）
  const filterRealSectors = useMemo<Record<RealFilter, RealSector[]>>(() => {
    const gainers = realSectors
      .filter((s) => s.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 8);
    const losers = realSectors
      .filter((s) => s.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 8);
    const featured = [...realSectors]
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 10);
    return { gainers, losers, featured };
  }, [realSectors]);

  // 当前标签对应的板块组（左侧热力图 = 右侧榜单，严格一致）
  const activeRealSectors = filterRealSectors[realFilter];

  // 新增：真实板块等权重 treemap 布局（真实板块无市值数据，value 统一 100）
  const realTileConstraint = useMemo(() => layoutTreemap(
    activeRealSectors.map((s) => ({ id: s.id, name: s.name, changePercent: s.changePercent, value: 100 })),
    { x: 0, y: 0, w: 160, h: 100 },
  ), [activeRealSectors]);

  // 新增：全市场真实涨跌板块统计
  const realUpCount = realSectors.filter((s) => s.changePercent >= 0).length;
  const realDownCount = realSectors.length - realUpCount;
  const realTotalCount = realSectors.length;

  /* ════════ 原状态/逻辑（注释保留，当前 UI 不启用） ════════ */
  /*
  const [view, setView] = useState<MapView>('sector');
  const [filter, setFilter] = useState<MapFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, left: 0, top: 0, stock: null });
  const [railTab, setRailTab] = useState<'detail' | 'gainers' | 'losers'>('gainers');
  const [followedIds, setFollowedIds] = useState<string[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('web-market-map-followed') || '[]'); if (Array.isArray(saved) && saved.length) return saved; } catch {}
    return ['robot'];
  });
  const FEATURED_IDS = useMemo(() => new Set(heatSectors.filter((s) => s.changePercent >= 2.5).map((s) => s.id)), []);
  const ANOMALY_IDS = useMemo(() => new Set(['ai-compute', 'semiconductor']), []);
  const filterCounts = useMemo(() => ({ all: heatSectors.length, featured: FEATURED_IDS.size, anomaly: ANOMALY_IDS.size, followed: followedIds.length }), [FEATURED_IDS, ANOMALY_IDS, followedIds]);
  const filtered = useMemo(() => heatSectors.filter((s) => {
    const fm = filter === 'all' || (filter === 'featured' && FEATURED_IDS.has(s.id)) || (filter === 'anomaly' && ANOMALY_IDS.has(s.id)) || (filter === 'followed' && followedIds.includes(s.id));
    return fm;
  }), [filter, followedIds, FEATURED_IDS, ANOMALY_IDS]);
  const MAP_W = 160; const MAP_H = 100; const HEADER = 11;
  const sectorLayouts = useMemo<SectorLayout[]>(() => layoutTreemap(filtered.map((s) => ({ id: s.id, value: sectorWeight(s), sector: s })), { x: 0, y: 0, w: MAP_W, h: MAP_H }), [filtered]);
  const stockLayouts = useMemo<StockLayout[]>(() => {
    const out: StockLayout[] = [];
    sectorLayouts.forEach((sl) => {
      const inner: Rect = { x: sl.x, y: sl.y + HEADER, w: sl.w, h: Math.max(sl.h - HEADER, 1) };
      const rs = layoutTreemap(sl.sector.stocks.map((st) => ({ id: st.code, value: stockWeight(st), stock: st, sectorId: sl.sector.id })), inner);
      rs.forEach((r) => out.push(r));
    });
    return out;
  }, [sectorLayouts]);
  const filteredRanked = useMemo(() => filtered.flatMap((s) => s.stocks).sort((a, b) => b.changePercent - a.changePercent), [filtered]);
  const topGainers = filteredRanked.slice(0, 8);
  const topLosers = [...filteredRanked].reverse().slice(0, 5);
  const selectedStock = useMemo(() => getRankedStocks().find((s) => s.code === selectedStockCode) || null, [selectedStockCode]);
  const selectedSector = useMemo(() => heatSectors.find((s) => s.id === selectedSectorId) || null, [selectedSectorId]);
  const selectedDetail = useMemo(() => (selectedSectorId ? getSectorDetail(selectedSectorId) : null), [selectedSectorId]);
  const toggleFollow = (id: string) => {
    setFollowedIds((prev) => { const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]; try { localStorage.setItem('web-market-map-followed', JSON.stringify(next)); } catch {} return next; });
  };
  const onTileEnter = (e: React.MouseEvent<HTMLDivElement>, stock: StockItem) => { const cr = mapRef.current?.getBoundingClientRect(); const tr = e.currentTarget.getBoundingClientRect(); if (!cr) return; setTooltip({ visible: true, left: tr.left - cr.left + tr.width / 2, top: tr.top - cr.top, stock }); };
  const hideTooltip = () => setTooltip((t) => ({ ...t, visible: false }));
  */

  const { indices: overviewIndices } = useLiveIndices();

  const isUp = (v: number) => v >= 0;
  const colorOf = (v: number) => (isUp(v) ? UP : DOWN);
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

  const meta = FILTER_META[realFilter];

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-6 space-y-6">
      {/* ---------------- 泡泡发现概览卡 ---------------- */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: BORDER }}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-white">
              <Compass size={16} />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight text-gray-900">市场地图</h2>
            </div>
          </div>

          <div className="hidden h-8 w-px bg-gray-100 sm:block" />

          {/* 主要指数（实时） */}
          <div className="flex flex-wrap items-center gap-4">
            {overviewIndices === null
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-baseline gap-1.5">
                    <span className="h-3 w-16 animate-pulse rounded bg-gray-100" />
                    <span className="h-4 w-12 animate-pulse rounded bg-gray-100" />
                  </div>
                ))
              : overviewIndices.map((idx) => (
                  <div key={idx.code} className="flex items-baseline gap-1.5">
                    <span className="text-xs text-gray-500">{idx.name}</span>
                    <span className="font-mono text-sm font-bold" style={{ color: colorOf(idx.changePercent) }}>
                      {pct(idx.changePercent)}
                    </span>
                  </div>
                ))}
          </div>

          <div className="ml-auto flex items-center gap-4">
            {/* 市场温度 */}
            <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5">
              <span className="text-base leading-none">
                {marketTemperature.temp >= 60 ? '🔥' : marketTemperature.temp >= 40 ? '☀️' : '🌧️'}
              </span>
              <span className="text-[10px] font-semibold text-rose-500">
                {marketTemperature.temp}℃ {marketTemperature.label}
              </span>
            </div>
            {/* 全市场涨跌板块（真实数据） */}
            <div className="flex items-center gap-2 text-[11px] font-medium">
              <span className="text-rose-600">上涨 {realUpCount} 板块</span>
              <span className="text-slate-300">|</span>
              <span className="text-emerald-600">下跌 {realDownCount} 板块</span>
            </div>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400">
          <Sparkles size={12} className="text-indigo-500" />
          泡泡发现 · 红涨绿跌，色块面积代表相对市值，颜色深浅代表涨跌幅
          {realTotalCount > 0 && <span className="ml-1 rounded-full bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] text-indigo-600">全市场 {realTotalCount} 个行业板块</span>}
        </p>
      </section>

      {/* ---------------- 主网格 ---------------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ===== 左：标签 + 热力地图 ===== */}
        <section className="space-y-4 lg:col-span-2">
          {/* 热力地图上方标签：领涨 / 领跌 / 泡泡精选（数字 = 实际展示板块数） */}
          <div className="flex flex-wrap items-center gap-2">
            {(['gainers', 'losers', 'featured'] as const).map((f) => {
              const m = FILTER_META[f];
              const active = realFilter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setRealFilter(f);
                    setSelectedRealSector(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m.icon === 'up' && <TrendingUp size={13} />}
                  {m.icon === 'down' && <TrendingDown size={13} />}
                  {m.icon === 'star' && <Sparkles size={13} />}
                  {m.label}
                  <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? 'bg-white/20' : 'bg-slate-200/70'}`}>
                    {filterRealSectors[f].length}
                  </span>
                </button>
              );
            })}
            <span className="ml-auto text-[10px] text-gray-400">共 {activeRealSectors.length} 个板块·实时</span>
          </div>

          {/* 原视图切换 + 筛选 chips（全部/泡泡精选/异动/关注）——已按需求注释保留 */}
          {/*
          <div className="flex items-center rounded-xl bg-[#f1f3f5] p-1" role="group" aria-label="地图视图">
            {([{ id: 'sector', label: '板块地图' }, { id: 'stock', label: '个股地图' }] as const).map((v) => (...))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([{ id: 'all', label: '全部' }, { id: 'featured', label: '泡泡精选' }, { id: 'anomaly', label: '异动' }, { id: 'followed', label: '关注' }] as const).map((f) => (...))}
          </div>
          */}

          {/* 热力地图卡片 */}
          <div className="rounded-2xl border bg-white p-3 shadow-sm" style={{ borderColor: BORDER }}>
            <div className="relative">
              {/* 裁剪容器（treemap） */}
              <div
                ref={mapRef}
                className="relative overflow-hidden rounded-xl bg-[#fafbfc]"
                style={{ aspectRatio: '8 / 5' }}
              >
                {/* 板块色块（真实板块，无个股） */}
                {realTileConstraint.map((tile) => {
                  const hs = heatStyle(tile.changePercent);
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      onClick={() => setSelectedRealSector(activeRealSectors.find((s) => s.id === tile.id) || null)}
                      className="absolute flex flex-col items-center justify-center overflow-hidden border border-white/70 transition-transform hover:z-10 hover:scale-[1.02]"
                      style={{
                        left: `${(tile.x / 160) * 100}%`,
                        top: `${(tile.y / 100) * 100}%`,
                        width: `${(tile.w / 160) * 100}%`,
                        height: `${(tile.h / 100) * 100}%`,
                        background: hs.background,
                        color: hs.color,
                      }}
                      title={tile.name}
                    >
                      {tile.w > 14 && tile.h > 10 && (
                        <>
                          <span className="truncate px-1 text-[11px] font-bold leading-4">{tile.name}</span>
                          {tile.h > 17 && (
                            <span className="font-mono text-[10px] font-bold leading-4">{pct(tile.changePercent)}</span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}

                {/* 原 mock 板块 + 个股色块（注释保留，不再渲染） */}
                {/*
                {view === 'sector' && sectorLayouts.map((sl) => (...))}
                {stockLayouts.map((tl) => (...))}
                */}

                {/* 空状态 */}
                {activeRealSectors.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <Layers3 className="h-6 w-6 text-slate-300" />
                    <p className="mt-2 text-xs text-slate-500">板块数据加载中…</p>
                  </div>
                )}
              </div>

              {/* 原 Tooltip（注释保留） */}
              {/*
              {tooltip.visible && tooltip.stock && (<div>...</div>)}
              */}
            </div>
          </div>
        </section>

        {/* ===== 右栏：与左侧一致的板块榜单 + 选中详情 + 色阶 ===== */}
        <aside className="space-y-4">
          {/* 当前标签榜单（与左侧热力图严格一致） */}
          <section className="rounded-2xl border bg-white shadow-sm" style={{ borderColor: BORDER }}>
            <div className="flex items-center gap-1.5 border-b px-4 py-2.5" style={{ borderColor: BORDER }}>
              {meta.icon === 'up' && <TrendingUp size={14} className="text-rose-600" />}
              {meta.icon === 'down' && <TrendingDown size={14} className="text-emerald-600" />}
              {meta.icon === 'star' && <Sparkles size={14} className="text-indigo-600" />}
              <span className="text-xs font-bold text-gray-800">{meta.label}板块</span>
              <span className="ml-auto text-[10px] text-gray-400">{activeRealSectors.length} 个·实时</span>
            </div>
            <div className="divide-y p-2" style={{ borderColor: BORDER }}>
              {activeRealSectors.length > 0 ? activeRealSectors.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedRealSector(s)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#f7f8fa] ${
                    selectedRealSector?.id === s.id ? 'bg-indigo-50/60' : ''
                  }`}
                >
                  <span className="w-4 text-center font-mono text-[11px] font-bold text-gray-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-gray-800">{s.name}</p>
                  </div>
                  <span className="font-mono text-[12px] font-semibold" style={{ color: colorOf(s.changePercent) }}>
                    {pct(s.changePercent)}
                  </span>
                </button>
              )) : (
                <p className="py-3 text-center text-[11px] text-gray-400">板块数据加载中…</p>
              )}
            </div>
          </section>

          {/* 选中板块详情（右侧展示完整板块详情页；无 mock 匹配时回退基础信息） */}
          {selectedRealSector && (
            <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: BORDER }}>
              {selectedRealSectorDetail ? (
                <SectorDetailCard
                  detail={selectedRealSectorDetail}
                  onSelectStock={(code) => {
                    /* 原逻辑：选中个股；真实板块详情无个股跳转需求，保留桩 */
                  }}
                  onAsk={onAskTeacherAboutStock}
                />
              ) : (
                <>
                  <h3 className="text-[15px] font-bold text-gray-900">{selectedRealSector.name}</h3>
                  <p className="mt-1 font-mono text-2xl font-bold" style={{ color: colorOf(selectedRealSector.changePercent) }}>
                    {pct(selectedRealSector.changePercent)}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400">今日板块涨跌幅（实时）</p>
                  <button
                    type="button"
                    onClick={() => onAskTeacherAboutStock(selectedRealSector.name, selectedRealSector.id)}
                    className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                  >
                    问泡泡 · 分析「{selectedRealSector.name}」
                  </button>
                </>
              )}
            </section>
          )}

          {/* 原右栏页签（详情/领涨/领跌个股榜）——已按需求注释保留 */}
          {/*
          <div className="flex gap-1 border-b px-2 py-2" style={{ borderColor: BORDER }}>
            {([{ id: 'detail', label: '详情', icon: Grid3x3 }, { id: 'gainers', label: '领涨', icon: TrendingUp }, { id: 'losers', label: '领跌', icon: TrendingDown }] as const).map((t) => (...))}
          </div>
          */}

          {/* 色阶说明（常驻底部） */}
          <section className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: BORDER }}>
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <Info size={15} className="text-indigo-600" />
              色阶说明
            </h3>
            <div
              className="mt-3 h-3 w-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${DOWN}, #eef0f3 50%, ${UP})` }}
            />
            <div className="mt-1 flex justify-between text-[10px] font-medium">
              <span className="text-emerald-600">跌</span>
              <span className="text-gray-400">平</span>
              <span className="text-rose-600">涨</span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-gray-400">
              颜色越深代表当日涨跌幅越大；红涨绿跌。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}