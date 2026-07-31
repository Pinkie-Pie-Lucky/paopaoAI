# 泡泡看市 · AI 智能投研助手（Web 端）

基于 **React 19 + Express + InfiniSynapse Agent 底座** 的 A 股智能投研应用。实时行情驱动，Agent 深度分析，帮助用户理解大盘与板块运行逻辑。

## ✨ 核心功能

| 模块 | 说明 |
|------|------|
| **今日大盘** | 三大指数实时行情、市场温度、泡泡解读；「今天发生了什么」由 Agent 基于实时行情自动生成 3 个最值得关注的热点故事（含因果链 / 小白与专业双版解读 / 证据评分） |
| **AI 泡泡** | 基于 InfiniSynapse Agent 的深度投研问答：个股分析、板块研判、市场情绪，支持 Markdown 排版渲染 |
| **市场地图** | 领涨 / 领跌 / 泡泡精选真实板块热力图（面积按涨跌幅加权），点击板块展示完整详情（成分股 / 产业链 / 新闻 / 多周期涨跌） |


## 🏗️ 架构

```
前端 (React + Vite)
  ├── 实时行情页面（指数/板块/热点）
  ├── AI 泡泡问答页
  └── 市场地图页
        │  HTTP
        ▼
Express 后端 (server.ts)
  ├── InfiniSynapse Agent 层（SSE 长任务）
  ├── 节假日/午休/收盘交易时段判断
  └── 15 分钟自动刷新（仅交易时段）
```

### InfiniSynapse 集成要点
- **API Key 只在服务端**（`.env`，已 gitignore 保护）
- 先连 SSE 再发 `newTask`，解析 `completion_result` 拿最终答案
- 90 秒全局超时 + 回显过滤 + 实时行情兜底，保证页面永不空白
- 用户每次刷新页面强制调真实数据 + AI

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量（paopao-web/.env）
INFINISYNAPSE_API_KEY=你的_KEY
INFINISYNAPSE_SERVER_URL=https://app.infinisynapse.cn

# 启动（开发模式，含 Vite HMR）
npm run dev
```

打开 http://localhost:8080

## 📋 生产构建

```bash
npm run build   # 产出 dist/
npm start       # 运行 server.cjs
```

## ⚙️ 技术栈

- **前端**：React 19、TypeScript、Vite 6、TailwindCSS 4、Recharts、Motion
- **后端**：Express、Node HTTP/HTTPS
- **AI**：InfiniSynapse Server API（SSE Agent 任务）

## ⚠️ 免责声明

本应用为模拟盘投研练习工具，所有内容仅供参考，不构成任何投资建议。股市有风险，投资需谨慎。