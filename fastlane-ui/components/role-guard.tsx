'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { Shield, AlertTriangle } from 'lucide-react';

/**
 * 路由权限保护组件
 * 根据用户角色限制访问特定页面
 */
export function RoleGuard({ children }: { children: React.ReactNode }) {
  const { hasPageAccess, role, isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // 如果还没有加载角色信息，等待
    if (!role) return;

    // 检查是否有权限访问当前页面
    if (!hasPageAccess(pathname)) {
      toast.error('权限不足：您没有权限访问此页面', {
        description: '请联系管理员获取相应权限',
        duration: 4000,
      });
      
      // 重定向到首页
      router.push('/overview');
    }
  }, [pathname, role, hasPageAccess, router]);

  // 如果没有权限，显示提示页面（短暂显示，然后跳转）
  if (role && !hasPageAccess(pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">权限不足</h2>
          <p className="text-gray-600 mb-6">
            您没有权限访问此页面。正在跳转到首页...
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <AlertTriangle className="w-4 h-4" />
            <span>如需访问此功能，请联系管理员</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

