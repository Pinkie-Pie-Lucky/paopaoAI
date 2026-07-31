/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 入口：Web 端（桌面）统一渲染 WebApp 外壳。
 * 移动端 H5 组件仍保留在 src/components/ 下，供后续响应式切换或回退使用。
 */

import { WebApp } from './web/WebApp';

export default function App() {
  return <WebApp />;
}
