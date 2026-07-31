/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 市场地图（Web 端 / 桌面）
 * 设计基线：高保真原型（Treemap 热力图）
 *  - 泡泡发现概览卡（主要指数 / 市场温度 / 涨跌板块数）
 *  - 工具栏：板块地图 / 个股地图 切换 + 筛选 chips（全部 / 泡泡精选 / 异动 / 关注）+ 搜索
 *  - 左侧：Treemap 热力地图（板块按相对市值切块，个股按涨跌幅着色；红涨绿跌）
 *  - 右侧栏：选中详情 / 领涨榜 / 领跌榜 / 色阶说明
 *
 * 说明：Treemap 使用自实现的 squarified 算法（无第三方依赖），在 160×100 虚拟坐标空间
 * 计算布局，再按容器宽高比转换为百分比定位，完全自适应。
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

type MapView = 'sector' | 'stock';
type MapFilter = 'all' | 'featured' | 'anomaly' | 'followed';

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

/* ----------------------------- 板块详情样式与组件（对齐移动端丰富度） ----------------------------- */

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
  const periods = [
    { label: '今日', v: detail.todayChangePercent },
    { label: '近5日', v: detail.change5d },
    { label: '近20日', v: detail.change20d },
    { label: '3个月', v: detail.change3m },
  ];

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
        <div className="mt-2 flex gap-2 rounded-xl bg-[#f7f8fa] p-2 text-[11px]">
          {periods.map((p) => (
            <div key={p.label} className="flex-1 text-center">
              <span className="text-gray-400">{p.label}</span>
              <div className="font-mono font-bold" style={{ color: p.v === null ? '#9ca3af' : colorOf(p.v) }}>
                {p.v === null ? '--' : pctText(p.v)}
              </div>
            </div>
          ))}
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

      {/* 板块健康度（暂注释隐藏）
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-gray-700">
          <Shield size={13} className="text-indigo-600" />
          板块健康度
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-[#f7f8fa] py-2">
            <div className="font-mono text-base font-bold text-emerald-600">{detail.healthMetrics.upCount}</div>
            <div className="text-[10px] text-gray-400">上涨</div>
          </div>
          <div className="rounded-lg bg-[#f7f8fa] py-2">
            <div className="font-mono text-base font-bold text-gray-800">{detail.healthMetrics.totalCount}</div>
            <div className="text-[10px] text-gray-400">成分股</div>
          </div>
          <div className="rounded-lg bg-[#f7f8fa] py-2">
            <div className="font-mono text-base font-bold text-gray-800">{detail.healthMetrics.upRatio}%</div>
            <div className="text-[10px] text-gray-400">上涨比</div>
          </div>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-gray-400">龙头贡献度：{detail.healthMetrics.leaderContribution}</p>
      </div>
      */}

      {/* 板块内部表现 */}
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

      {/* 产业链图谱 */}
      {detail.relatedChain.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-gray-700">
            <ArrowUpRight size={13} className="text-cyan-600" />
            产业链图谱
          </p>
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            {detail.relatedChain.map((c, i) => (
              <span key={c} className="flex items-center gap-1">
                <span className="rounded-md bg-cyan-50 px-2 py-1 font-medium text-cyan-700">{c}</span>
                {i < detail.relatedChain.length - 1 && <span className="text-cyan-300">→</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 今日领涨 / 领跌公司 */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-gray-700">
          <Activity size={13} className="text-emerald-600" />
          今日领涨公司
        </p>
        <div className="space-y-1.5">
          {detail.leadingStocks.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => onSelectStock(s.code)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-white p-2.5 text-left transition-colors hover:border-indigo-200"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="truncate text-[12px] font-bold text-gray-900">{s.name}</span>
                  {s.isLeader && <span className="rounded bg-indigo-50 px-1 text-[8px] font-bold text-indigo-600">龙头</span>}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-gray-400">
                  {s.reason}
                  {s.totalMarketCap != null ? ` · 市值 ${s.totalMarketCap}亿` : ''}
                </p>
              </div>
              <span className="ml-2 shrink-0 font-mono text-[12px] font-bold" style={{ color: colorOf(s.changePercent) }}>
                {pctText(s.changePercent)}
              </span>
            </button>
          ))}
        </div>
        {detail.laggingStocks.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-[10px] font-medium text-gray-400">表现较弱</p>
            {detail.laggingStocks.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => onSelectStock(s.code)}
                className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[#f7f8fa]"
              >
                <span className="text-[12px] font-medium text-gray-700">{s.name}</span>
                <span className="font-mono text-[11px] font-semibold" style={{ color: colorOf(s.changePercent) }}>
                  {pctText(s.changePercent)}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[9px] text-gray-400">领涨仅代表当前表现，不构成投资建议。</p>
      </div>

      {/* 相关新闻 */}
      {detail.news.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-gray-700">
            <Newspaper size={13} className="text-sky-600" />
            相关新闻
          </p>
          <div className="space-y-1.5">
            {detail.news.map((n) => {
              const cat =
                n.category === '直接催化'
                  ? 'bg-violet-50 text-violet-700'
                  : n.category === '风险信息'
                    ? 'bg-rose-50 text-rose-600'
                    : n.category === '行业背景'
                      ? 'bg-sky-50 text-sky-700'
                      : 'bg-slate-50 text-slate-600';
              return (
                <div key={n.id} className="rounded-lg border border-slate-100 p-2">
                  <p className="text-[11px] font-medium leading-5 text-gray-800">{n.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${cat}`}>{n.category}</span>
                    {n.summary && <span className="truncate text-[9px] text-gray-400">{n.summary}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 后续观察 */}
      {detail.watchPoints.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-gray-700">
            <Clock size={13} className="text-amber-600" />
            后续观察
          </p>
          <div className="space-y-1">
            {detail.watchPoints.map((p, i) => (
              <p key={i} className="flex items-start gap-1.5 text-[10px] leading-5 text-gray-600">
                <span className="mt-0.5 text-amber-400">•</span>
                <span>{p}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 问泡泡 */}
      <div className="space-y-2 border-t border-gray-100 pt-3">
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-gray-700">
          <MessageSquare size={13} className="text-indigo-600" />
          问泡泡
        </p>
        <div className="flex flex-wrap gap-2">
          {[`为什么${detail.sectorName}今天表现这么突出？`, `${detail.sectorName}现在处于什么阶段？`].map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onAsk(detail.sectorName, detail.sectorId)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

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
      {/* 个股头部 + 指标 */}
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

      {/* 所属板块 */}
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
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-500">
            {/* 板块内排名（暂注释隐藏） */}
            {isLeader && <span className="rounded bg-indigo-50 px-1 text-[9px] font-bold text-indigo-600">龙头</span>}
          </div>
        </div>
      )}

      {/* 板块上下文：领涨 / 新闻 / 后续观察等 */}
      {detail && <SectorDetailCard detail={detail} onSelectStock={onSelectStock} onAsk={onAsk} hideHeader />}
    </div>
  );
}

/* ----------------------------- Treemap 布局算法 ----------------------------- */

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

/* ----------------------------- 权重代理（演示用） ----------------------------- */

function sectorWeight(s: HeatSector) {
  // 以板块内个股价格之和作为相对市值权重代理
  return s.stocks.reduce((sum, st) => sum + st.price, 0);
}
function stockWeight(st: StockItem) {
  return st.price; // 相对市值权重代理
}

/* ----------------------------- 主组件 ----------------------------- */

interface MarketMapPageProps {
  onAskTeacherAboutStock: (name: string, code: string) => void;
  /** 外部搜索跳转定位（顶栏搜索使用） */
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

const STORAGE_KEY = 'web-market-map-followed';

export function MarketMapPage({ onAskTeacherAboutStock, initialTarget }: MarketMapPageProps) {
  const [view, setView] = useState<MapView>('sector');
  const [filter, setFilter] = useState<MapFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, left: 0, top: 0, stock: null });
  // 真实板块数据：/api/sectors 返回约100个行业板块（仅涨跌幅，无个股）
  const [realSectors, setRealSectors] = useState<Array<{ id: string; name: string; changePercent: number }>>([]);

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

  // 外部搜索跳转：顶栏搜索到板块/个股后，切到此页并定位选中
  useEffect(() => {
    if (!initialTarget) return;
    if (initialTarget.sectorId) {
      setSelectedSectorId(initialTarget.sectorId);
      setSelectedStockCode(null);
      setRailTab('detail');
    } else if (initialTarget.stockCode) {
      setSelectedStockCode(initialTarget.stockCode);
      setSelectedSectorId(null);
      setRailTab('detail');
    }
  }, [initialTarget]);

  // 右侧栏页签：详情 / 领涨 / 领跌（一次只显示一个面板，避免详情展开后挤掉排行榜）
  const [railTab, setRailTab] = useState<'detail' | 'gainers' | 'losers'>('gainers');
  useEffect(() => {
    if (selectedSectorId || selectedStockCode) setRailTab('detail');
  }, [selectedSectorId, selectedStockCode]);

  const mapRef = useRef<HTMLDivElement>(null);

  const [followedIds, setFollowedIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {
      /* ignore */
    }
    return ['robot'];
  });

  // 板块分类集合（演示用派生）
  const FEATURED_IDS = useMemo(() => new Set(heatSectors.filter((s) => s.changePercent >= 2.5).map((s) => s.id)), []);
  const ANOMALY_IDS = useMemo(() => new Set(['ai-compute', 'semiconductor']), []);

  const filterCounts = useMemo(
    () => ({
      all: heatSectors.length,
      featured: FEATURED_IDS.size,
      anomaly: ANOMALY_IDS.size,
      followed: followedIds.length,
    }),
    [FEATURED_IDS, ANOMALY_IDS, followedIds]
  );

  // 筛选 + 搜索后的板块（搜索同时匹配板块名 / 板块ID / 个股名 / 个股代码）
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchedSectors = heatSectors.filter((s) => {
      const fm =
        filter === 'all' ||
        (filter === 'featured' && FEATURED_IDS.has(s.id)) ||
        (filter === 'anomaly' && ANOMALY_IDS.has(s.id)) ||
        (filter === 'followed' && followedIds.includes(s.id));
      if (!fm) return false;
      if (!q) return true;
      const qm =
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.stocks.some((st) => st.name.toLowerCase().includes(q) || st.code.toLowerCase().includes(q));
      return qm;
    });
    if (!q) return matchedSectors;
    // 命中个股时，将该板块的成分股收窄到匹配项，便于个股地图/排行榜联动
    return matchedSectors.map((s) => ({
      ...s,
      stocks: s.stocks.filter((st) => st.name.toLowerCase().includes(q) || st.code.toLowerCase().includes(q)),
    }));
  }, [query, filter, followedIds, FEATURED_IDS, ANOMALY_IDS]);

  /* -------- Treemap 布局（160×100 虚拟坐标，容器宽高比 8:5） -------- */
  const MAP_W = 160;
  const MAP_H = 100;
  const HEADER = 11; // 板块标题条占用的虚拟高度

  const sectorLayouts = useMemo<SectorLayout[]>(
    () =>
      layoutTreemap(
        filtered.map((s) => ({ id: s.id, value: sectorWeight(s), sector: s })),
        { x: 0, y: 0, w: MAP_W, h: MAP_H }
      ),
    [filtered]
  );

  const stockLayouts = useMemo<StockLayout[]>(() => {
    if (view === 'sector') {
      const out: StockLayout[] = [];
      sectorLayouts.forEach((sl) => {
        const inner: Rect = { x: sl.x, y: sl.y + HEADER, w: sl.w, h: Math.max(sl.h - HEADER, 1) };
        const rs = layoutTreemap(
          sl.sector.stocks.map((st) => ({ id: st.code, value: stockWeight(st), stock: st, sectorId: sl.sector.id })),
          inner
        );
        rs.forEach((r) => out.push(r));
      });
      return out;
    }
    const all = filtered.flatMap((s) => s.stocks.map((st) => ({ st, sid: s.id })));
    return layoutTreemap(
      all.map((a) => ({ id: a.st.code, value: stockWeight(a.st), stock: a.st, sectorId: a.sid })),
      { x: 0, y: 0, w: MAP_W, h: MAP_H }
    );
  }, [view, sectorLayouts, filtered]);

  /* -------- 排行榜（随筛选联动） -------- */
  const filteredRanked = useMemo(
    () => filtered.flatMap((s) => s.stocks).sort((a, b) => b.changePercent - a.changePercent),
    [filtered]
  );
  const topGainers = filteredRanked.slice(0, 8);
  const topLosers = [...filteredRanked].reverse().slice(0, 5);

  /* -------- 选中详情 -------- */
  const selectedStock = useMemo(
    () => getRankedStocks().find((s) => s.code === selectedStockCode) || null,
    [selectedStockCode]
  );
  const selectedSector = useMemo(
    () => heatSectors.find((s) => s.id === selectedSectorId) || null,
    [selectedSectorId]
  );
  const selectedDetail = useMemo(
    () => (selectedSectorId ? getSectorDetail(selectedSectorId) : null),
    [selectedSectorId]
  );

  /* -------- 交互 -------- */
  const toggleFollow = (id: string) => {
    setFollowedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const onTileEnter = (e: React.MouseEvent<HTMLDivElement>, stock: StockItem) => {
    const cr = mapRef.current?.getBoundingClientRect();
    const tr = e.currentTarget.getBoundingClientRect();
    if (!cr) return;
    setTooltip({
      visible: true,
      left: tr.left - cr.left + tr.width / 2,
      top: tr.top - cr.top,
      stock,
    });
  };
  const hideTooltip = () => setTooltip((t) => ({ ...t, visible: false }));

  const isUp = (pct: number) => pct >= 0;
  const colorOf = (pct: number) => (isUp(pct) ? UP : DOWN);

  /* -------- 概览数据 -------- */
  // 实时指数：与今日大盘页共用同一份实时数据（模块级缓存保证两页一致）
  const { indices: overviewIndices } = useLiveIndices();
  const upCount = heatSectors.filter((s) => s.changePercent >= 0).length;
  const downCount = heatSectors.length - upCount;

  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

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

          {/* 主要指数 */}
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
            {/* 涨跌板块 */}
            <div className="flex items-center gap-2 text-[11px] font-medium">
              <span className="text-rose-600">上涨 {upCount} 板块</span>
              <span className="text-slate-300">|</span>
              <span className="text-emerald-600">下跌 {downCount} 板块</span>
            </div>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400">
          <Sparkles size={12} className="text-indigo-500" />
          泡泡发现 · 红涨绿跌，色块面积代表相对市值，颜色深浅代表涨跌幅
        </p>
      </section>

      {/* ---------------- 主网格 ---------------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ===== 左：工具栏 + 热力地图 ===== */}
        <section className="space-y-4 lg:col-span-2">
          {/* 工具栏 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 视图切换 */}
            <div className="flex items-center rounded-xl bg-[#f1f3f5] p-1" role="group" aria-label="地图视图">
              {([
                { id: 'sector', label: '板块地图' },
                { id: 'stock', label: '个股地图' },
              ] as const).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={view === v.id}
                  onClick={() => setView(v.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    view === v.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* 筛选 chips */}
            <div className="flex flex-wrap items-center gap-2">
              {([
                { id: 'all', label: '全部' },
                { id: 'featured', label: '泡泡精选' },
                { id: 'anomaly', label: '异动' },
                { id: 'followed', label: '关注' },
              ] as const).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    filter === f.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label} ({filterCounts[f.id]})
                </button>
              ))}
            </div>

            {/* 搜索框（暂隐藏）
            <div className="relative ml-auto w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索板块"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-300"
              />
            </div>
            */}
          </div>

          {/* 热力地图卡片 */}
          <div className="rounded-2xl border bg-white p-3 shadow-sm" style={{ borderColor: BORDER }}>
            <div className="relative">
              {/* 裁剪容器（treemap） */}
              <div
                ref={mapRef}
                className="relative overflow-hidden rounded-xl bg-[#fafbfc]"
                style={{ aspectRatio: '8 / 5' }}
                onMouseLeave={hideTooltip}
              >
                {/* 板块块背景 + 标题条（板块地图模式） */}
                {view === 'sector' &&
                  sectorLayouts.map((sl) => {
                    const up = isUp(sl.sector.changePercent);
                    const hs = headStyle(sl.sector.changePercent);
                    const followed = followedIds.includes(sl.sector.id);
                    return (
                      <div
                        key={`bg-${sl.id}`}
                        className="absolute"
                        style={{
                          left: `${(sl.x / MAP_W) * 100}%`,
                          top: `${(sl.y / MAP_H) * 100}%`,
                          width: `${(sl.w / MAP_W) * 100}%`,
                          height: `${(sl.h / MAP_H) * 100}%`,
                          background: heatStyle(sl.sector.changePercent).background,
                        }}
                      >
                        {/* 标题条 */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSectorId(sl.sector.id);
                            setSelectedStockCode(null);
                          }}
                          className="absolute inset-x-0 top-0 flex items-center justify-between gap-1 px-2 py-1 text-left"
                          style={{
                            height: `${(HEADER / MAP_H) * 100}%`,
                            background: hs.background,
                            color: hs.color,
                            borderBottom: `1px solid ${hs.border}`,
                          }}
                          title={sl.sector.name}
                        >
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="truncate text-[11px] font-bold">{sl.sector.name}</span>
                            {ANOMALY_IDS.has(sl.id) && <Flame size={10} className="shrink-0" />}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <span className="font-mono text-[10px] font-bold">{pct(sl.sector.changePercent)}</span>
                            <Heart
                              size={11}
                              className={`transition-colors ${followed ? 'fill-rose-500 text-rose-500' : 'text-white/70 hover:text-white'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFollow(sl.id);
                              }}
                            />
                          </span>
                        </button>
                      </div>
                    );
                  })}

                {/* 个股色块 */}
                {stockLayouts.map((tl) => {
                  const st = tl.stock;
                  const hs = heatStyle(st.changePercent);
                  const up = isUp(st.changePercent);
                  const showLabel = tl.w > 12 && tl.h > 9;
                  const showPct = tl.h > 15;
                  return (
                    <div
                      key={tl.id}
                      className="absolute cursor-pointer border transition-[transform,box-shadow] hover:z-20 hover:shadow-lg"
                      style={{
                        left: `${(tl.x / MAP_W) * 100}%`,
                        top: `${(tl.y / MAP_H) * 100}%`,
                        width: `${(tl.w / MAP_W) * 100}%`,
                        height: `${(tl.h / MAP_H) * 100}%`,
                        background: hs.background,
                        color: hs.color,
                        borderColor: 'rgba(255,255,255,0.7)',
                      }}
                      onMouseEnter={(e) => onTileEnter(e, st)}
                      onClick={() => setSelectedStockCode(st.code)}
                    >
                      {showLabel && (
                        <div className="flex h-full w-full flex-col justify-center overflow-hidden px-1.5 text-center">
                          <span className="truncate text-[11px] font-semibold leading-tight">{st.name}</span>
                          {showPct && (
                            <span className="font-mono text-[10px] font-bold leading-tight">{pct(st.changePercent)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 空状态 */}
                {filtered.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <Layers3 className="h-6 w-6 text-slate-300" />
                    <p className="mt-2 text-xs text-slate-500">没有匹配的板块</p>
                  </div>
                )}
              </div>

              {/* Tooltip（不被裁剪，可溢出地图） */}
              {tooltip.visible && tooltip.stock && (
                <div
                  className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg"
                  style={{ left: tooltip.left, top: tooltip.top }}
                >
                  <p className="text-[13px] font-bold text-gray-900">{tooltip.stock.name}</p>
                  <p className="font-mono text-[10px] text-gray-400">{tooltip.stock.code}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-[13px] font-bold text-gray-900">
                      {tooltip.stock.price.toFixed(2)}
                    </span>
                    <span
                      className="rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold"
                      style={{
                        background: isUp(tooltip.stock.changePercent) ? 'rgba(229,72,77,0.1)' : 'rgba(12,166,120,0.1)',
                        color: colorOf(tooltip.stock.changePercent),
                      }}
                    >
                      {pct(tooltip.stock.changePercent)}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-3 text-[10px] text-gray-500">
                    <span>量 {tooltip.stock.volume}</span>
                    <span>额 {tooltip.stock.turnover}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ===== 右栏：页签切换（详情 / 领涨 / 领跌）+ 色阶常驻 ===== */}
        <aside className="space-y-4">
          <div className="rounded-2xl border bg-white shadow-sm" style={{ borderColor: BORDER }}>
            {/* 页签栏 */}
            <div className="flex gap-1 border-b px-2 py-2" style={{ borderColor: BORDER }}>
              {([
                { id: 'detail', label: '详情', icon: Grid3x3 },
                { id: 'gainers', label: '领涨', icon: TrendingUp },
                { id: 'losers', label: '领跌', icon: TrendingDown },
              ] as const).map((t) => {
                const Icon = t.icon;
                const active = railTab === t.id;
                const count = t.id === 'gainers' ? topGainers.length : t.id === 'losers' ? topLosers.length : null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setRailTab(t.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                      active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon size={14} />
                    {t.label}
                    {count != null && (
                      <span
                        className={`rounded-full px-1.5 text-[10px] ${
                          t.id === 'gainers' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                    {t.id === 'detail' && (selectedSectorId || selectedStockCode) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 面板内容（一次只显示一个） */}
            <div className="p-5">
              {railTab === 'detail' ? (
                selectedStock ? (
                  <StockDetailCard
                    stock={selectedStock}
                    sector={heatSectors.find((s) => s.stocks.some((st) => st.code === selectedStock.code))}
                    onSelectStock={(code) => setSelectedStockCode(code)}
                    onSelectSector={(id) => {
                      setSelectedSectorId(id);
                      setSelectedStockCode(null);
                    }}
                    onAsk={onAskTeacherAboutStock}
                  />
                ) : selectedDetail ? (
                  <SectorDetailCard
                    detail={selectedDetail}
                    onSelectStock={(code) => setSelectedStockCode(code)}
                    onAsk={onAskTeacherAboutStock}
                  />
                ) : (
                  <p className="text-[12px] leading-5 text-gray-400">
                    点击地图中的板块或个股查看详情。悬停色块可快速预览行情。
                  </p>
                )
              ) : railTab === 'gainers' ? (
                <div className="divide-y" style={{ borderColor: BORDER }}>
                  {topGainers.map((st, i) => (
                    <button
                      key={st.code}
                      type="button"
                      onClick={() => setSelectedStockCode(st.code)}
                      className="flex w-full items-center gap-2.5 py-2 text-left"
                    >
                      <span className="w-4 text-center font-mono text-[11px] font-bold text-gray-400">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-gray-800">{st.name}</p>
                        <p className="font-mono text-[10px] text-gray-400">{st.code}</p>
                      </div>
                      <span className="font-mono text-[12px] font-semibold" style={{ color: UP }}>
                        {pct(st.changePercent)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: BORDER }}>
                  {topLosers.map((st, i) => (
                    <button
                      key={st.code}
                      type="button"
                      onClick={() => setSelectedStockCode(st.code)}
                      className="flex w-full items-center gap-2.5 py-2 text-left"
                    >
                      <ArrowDownRight size={13} className="shrink-0 text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-gray-800">{st.name}</p>
                        <p className="font-mono text-[10px] text-gray-400">{st.code}</p>
                      </div>
                      <span className="font-mono text-[12px] font-semibold" style={{ color: DOWN }}>
                        {pct(st.changePercent)}
                      </span>
                    </button>
                  ))}
                  {topLosers.length === 0 && (
                    <p className="py-3 text-center text-[11px] text-gray-400">当前筛选下无下跌个股</p>
                  )}
                </div>
              )}
            </div>
          </div>

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
              颜色越深代表当日涨跌幅越大；色块面积代表相对市值权重。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
