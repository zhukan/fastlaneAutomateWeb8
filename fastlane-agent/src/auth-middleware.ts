/**
 * 权限验证中间件
 * 用于保护需要管理员权限的 API 路由
 */

import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRole?: 'admin' | 'operator';
}

/**
 * 验证用户是否已登录
 */
// 创建 Supabase 客户端（用于认证）
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase 未配置' });
    }

    // 从请求头获取 Authorization token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权：缺少认证令牌' });
    }

    const token = authHeader.substring(7); // 移除 "Bearer " 前缀

    // 验证 token
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: '未授权：无效的认证令牌' });
    }

    // 获取用户角色
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(500).json({ error: '获取用户信息失败' });
    }

    // 将用户信息附加到请求对象
    req.userId = user.id;
    req.userEmail = user.email || '';
    req.userRole = profile.role;

    next();
  } catch (error) {
    console.error('认证错误:', error);
    return res.status(500).json({ error: '认证失败' });
  }
}

/**
 * 验证用户是否为管理员
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({
      error: '权限不足：需要管理员权限',
      message: '您没有权限访问此功能，请联系管理员',
    });
  }
  next();
}

/**
 * 组合中间件：验证登录 + 验证管理员
 */
export const requireAdminAuth = [requireAuth, requireAdmin];

