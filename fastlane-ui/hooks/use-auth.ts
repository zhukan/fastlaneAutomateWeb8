import { useAppStore } from '@/lib/store';
import { UserRole, ROLE_CONFIG } from '@/lib/types';

/**
 * 权限管理 Hook
 */
export function useAuth() {
  const user = useAppStore((state) => state.user);
  const setUserProfile = useAppStore((state) => state.setUserProfile);

  // 获取当前用户角色
  const role: UserRole | null = user?.role || null;

  // 是否为管理员
  const isAdmin = role === 'admin';

  // 是否为操作员
  const isOperator = role === 'operator';

  // 检查是否有权限访问指定页面
  const hasPageAccess = (pagePath: string): boolean => {
    if (!role) return false;
    
    const allowedPages = ROLE_CONFIG[role].allowedPages;
    
    // 管理员可以访问所有页面
    if (allowedPages.includes('*')) return true;
    
    // 检查页面是否在允许列表中
    return allowedPages.some((allowed) => {
      // 精确匹配
      if (pagePath === allowed) return true;
      
      // 匹配子路径（例如 /projects/xxx 匹配 /projects）
      if (pagePath.startsWith(allowed + '/')) return true;
      
      return false;
    });
  };

  // 获取角色显示名称
  const getRoleLabel = (roleType: UserRole): string => {
    return ROLE_CONFIG[roleType].label;
  };

  return {
    user,
    role,
    isAdmin,
    isOperator,
    hasPageAccess,
    getRoleLabel,
    setUserProfile,
  };
}

