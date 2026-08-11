/**
 * Vercel Serverless 入口 —— 复用 server.ts 的 Express app 处理所有 /api/* 接口。
 *
 * vercel.json 会把 /api/(.*) 重写到这里（见 vercel.json 的 rewrites），
 * 静态资源与 SPA 页面由 Vercel 直接托管，本函数只负责后端 /api/*。
 *
 * server.ts 导出的 createApp() 会构建包含全部行情 / AI / SSO 路由的 Express 实例，
 * 这里做一次惰性缓存，避免每个请求都重建（首次调用后常驻复用）。
 */
import type { Request, Response, Express } from 'express';
import createApp from '../server';

let cachedApp: Express | null = null;

export default async function handler(req: Request, res: Response) {
  try {
    if (!cachedApp) {
      cachedApp = await createApp();
    }
    return cachedApp(req, res);
  } catch (err: any) {
    // Express 内部抛错时的兜底，避免 serverless 返回空响应
    if (!res.headersSent) {
      res.status(500).json({ error: `Paopao server init failed: ${err?.message || err}` });
    }
  }
}
