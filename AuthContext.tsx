/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AuthContext —— 离线 mock 的手机号注册 / 登录。
 *
 * 说明（与产品定位一致）：
 *  - 本 Web 端当前为离线演示，没有后端 / 数据库 / 真实短信网关。
 *  - 账号信息仅保存在本机 localStorage；「发送验证码」在前端模拟生成 6 位码并
 *    暂存（带 5 分钟过期），演示时直接把验证码回显给用户，不真正下发短信。
 *  - 后续接入真实后端时，只需把 sendCode / register / login 的实现换成接口调用，
 *    组件层（AuthModal / WebApp / AccountPage）无需改动。
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

const USERS_KEY = 'paopao_users_v1'; // StoredUser[]
const SESSION_KEY = 'paopao_session_v1'; // Session | null
const CODE_KEY = 'paopao_smscode_v1'; // SmsRecord | null
const CODE_TTL = 5 * 60 * 1000; // 验证码有效期 5 分钟

interface StoredUser {
  phone: string;
  password: string;
}

interface Session {
  phone: string;
}

interface SmsRecord {
  phone: string;
  code: string;
  expiresAt: number;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  session: Session | null;
  isLoggedIn: boolean;
  /** 模拟发送验证码：成功时回传 code 供演示展示 */
  sendCode: (phone: string) => { ok: boolean; code?: string; error?: string };
  register: (phone: string, password: string, code: string) => AuthResult;
  login: (phone: string, password: string) => AuthResult;
  logout: () => void;
}

const PHONE_RE = /^1[3-9]\d{9}$/;

const AuthContext = createContext<AuthContextValue | null>(null);

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 忽略隐私模式等写入失败 */
  }
}

/** 手机号脱敏：13800008888 → 138****8888 */
export function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() =>
    readJSON<Session | null>(SESSION_KEY, null),
  );

  useEffect(() => {
    writeJSON(SESSION_KEY, session);
  }, [session]);

  const sendCode = useCallback((phone: string) => {
    if (!PHONE_RE.test(phone)) return { ok: false, error: '请输入有效的手机号' };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const record: SmsRecord = { phone, code, expiresAt: Date.now() + CODE_TTL };
    writeJSON(CODE_KEY, record);
    // 离线模拟：直接回传验证码，便于演示完成注册
    return { ok: true, code };
  }, []);

  const register = useCallback(
    (phone: string, password: string, code: string): AuthResult => {
      if (!PHONE_RE.test(phone)) return { ok: false, error: '请输入有效的手机号' };
      if (!password || password.length < 6) return { ok: false, error: '密码至少 6 位' };
      const record = readJSON<SmsRecord | null>(CODE_KEY, null);
      if (!record || record.phone !== phone) return { ok: false, error: '请先获取验证码' };
      if (Date.now() > record.expiresAt) return { ok: false, error: '验证码已过期，请重新获取' };
      if (record.code !== code) return { ok: false, error: '验证码不正确' };
      const users = readJSON<StoredUser[]>(USERS_KEY, []);
      if (users.some((u) => u.phone === phone))
        return { ok: false, error: '该手机号已注册，请直接登录' };
      users.push({ phone, password });
      writeJSON(USERS_KEY, users);
      writeJSON(CODE_KEY, null);
      setSession({ phone });
      return { ok: true };
    },
    [],
  );

  const login = useCallback((phone: string, password: string): AuthResult => {
    if (!PHONE_RE.test(phone)) return { ok: false, error: '请输入有效的手机号' };
    const users = readJSON<StoredUser[]>(USERS_KEY, []);
    const user = users.find((u) => u.phone === phone);
    if (!user) return { ok: false, error: '该手机号尚未注册' };
    if (user.password !== password) return { ok: false, error: '密码错误' };
    setSession({ phone });
    return { ok: true };
  }, []);

  const logout = useCallback(() => setSession(null), []);

  const value: AuthContextValue = {
    session,
    isLoggedIn: !!session,
    sendCode,
    register,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内使用');
  return ctx;
}
