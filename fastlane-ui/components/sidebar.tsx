'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Folder,
  History,
  Settings,
  BarChart,
  Users,
  Bell,
  Search,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Archive,
  GitCompare,
  ChevronDown,
  ChevronUp,
  FileSearch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  href: string;
  phase: number;
  disabled?: boolean;
  tooltip?: string;
  badge?: 'projectCount' | 'newReleaseCount' | 'removedAppCount';
  adminOnly?: boolean;  // 是否仅管理员可见
}

// 主要菜单项
const mainMenuItems: (MenuItem | { type: 'divider' })[] = [
  // 主要功能
  {
    id: 'overview',
    label: '发布看板',
    icon: LayoutDashboard,
    href: '/overview',
    phase: 3,
    disabled: false,
  },
  {
    id: 'projects',
    label: '发布操作',
    icon: Folder,
    href: '/projects',
    phase: 3,
    disabled: false,
    badge: 'projectCount',
  },
  {
    id: 'releases',
    label: '发布历史',
    icon: History,
    href: '/releases',
    phase: 3,
    disabled: false,
    badge: 'newReleaseCount',
  },

  // 分隔线
  { type: 'divider' },

  {
    id: 'app-comparison',
    label: '关联对比',
    icon: GitCompare,
    href: '/app-comparison',
    phase: 5,
    disabled: false,
    tooltip: '我的包 vs 目标包关联对比（含包视图、账号视图）',
    adminOnly: true,  // 仅管理员可见
  },
  {
    id: 'removal-investigation',
    label: '下架排查',
    icon: FileSearch,
    href: '/removal-investigation',
    phase: 6,
    disabled: false,
    tooltip: '分析已下架App的操作记录',
    adminOnly: true,  // 仅管理员可见
  },
  { type: 'divider' },
  {
    id: 'target-app-monitor',
    label: '目标包监控',
    icon: Search,
    href: '/target-app-monitor',
    phase: 4,
    disabled: false,
    tooltip: '监控目标包的状态',
    adminOnly: true,  // 仅管理员可见
  },
  {
    id: 'settings',
    label: '设置',
    icon: Settings,
    href: '/settings',
    phase: 3,
    disabled: false,
  },
];

// 更多菜单项（可折叠）
const moreMenuItems: MenuItem[] = [
  {
    id: 'test-bundle-records',
    label: '关键测试',
    icon: FileSearch,
    href: '/test/bundle-records',
    phase: 6,
    disabled: false,
    tooltip: '测试数据获取逻辑，避免全量同步',
    adminOnly: true,  // 仅管理员可见
  },

  // 旧版监控（已被关联对比取代）
  {
    id: 'app-removal-monitor',
    label: '下架监控',
    icon: ShieldAlert,
    href: '/app-removal-monitor',
    phase: 3,
    disabled: false,
    badge: 'removedAppCount',
    tooltip: '旧版功能，建议使用关联对比',
    adminOnly: true,  // 仅管理员可见
  },
  {
    id: 'app-removal-monitor-history',
    label: '下架监控历史归档',
    icon: Archive,
    href: '/app-removal-monitor-history',
    phase: 3,
    disabled: false,
    tooltip: '旧版功能',
    adminOnly: true,  // 仅管理员可见
  },

  // 未来功能
  {
    id: 'analytics',
    label: '统计报表',
    icon: BarChart,
    href: '/analytics',
    phase: 4,
    disabled: true,
    tooltip: '敬请期待',
    adminOnly: true,  // 仅管理员可见
  },
  {
    id: 'team',
    label: '团队管理',
    icon: Users,
    href: '/team',
    phase: 4,
    disabled: false,  // 启用团队管理
    adminOnly: true,  // 仅管理员可见
  },
  {
    id: 'notifications',
    label: '通知中心',
    icon: Bell,
    href: '/notifications',
    phase: 4,
    disabled: true,
    tooltip: '敬请期待',
    adminOnly: true,  // 仅管理员可见
  },
  {
    id: 'review-status',
    label: '审核监控',
    icon: Search,
    href: '/review-status',
    phase: 5,
    disabled: true,
    tooltip: '敬请期待',
    adminOnly: true,  // 仅管理员可见
  },
  {
    id: 'docs',
    label: '文档中心',
    icon: BookOpen,
    href: '/docs',
    phase: 5,
    disabled: true,
    tooltip: '敬请期待',
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMoreExpanded, setIsMoreExpanded] = useState(false);
  const { projects } = useAppStore();
  const { isAdmin } = useAuth();

  // 计算徽章数据
  const badges = {
    projectCount: projects.length,
    newReleaseCount: 0, // TODO: 从 releases 表查询最近24小时的发布数
    removedAppCount: 0, // TODO: 从 app_removal_monitor 表查询下架的 App 数量
  };

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.disabled) {
      toast.info(item.tooltip || '功能开发中');
    }
  };

  return (
    <aside
      className={cn(
        'bg-white border-r border-gray-200 flex flex-col transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              FL
            </div>
            <span className="font-semibold text-gray-900">Fastlane</span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          )}
        </button>
      </div>

      {/* 菜单项 */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {/* 主要菜单 */}
          {mainMenuItems.map((item, index) => {
            if ('type' in item && item.type === 'divider') {
              return (
                <li key={`divider-${index}`} className="my-3">
                  <div className="border-t border-gray-200" />
                </li>
              );
            }

            const menuItem = item as MenuItem;
            
            // 权限过滤：如果是管理员专用功能且用户不是管理员，则不显示
            if (menuItem.adminOnly && !isAdmin) {
              return null;
            }
            
            const Icon = menuItem.icon;
            const active = isActive(menuItem.href);
            const badge = menuItem.badge ? badges[menuItem.badge] : null;

            return (
              <li key={menuItem.id}>
                <Link
                  href={menuItem.disabled ? '#' : menuItem.href}
                  onClick={(e) => {
                    if (menuItem.disabled) {
                      e.preventDefault();
                      handleMenuClick(menuItem);
                    }
                  }}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors relative group',
                    active && !menuItem.disabled
                      ? 'bg-blue-50 text-blue-600'
                      : menuItem.disabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                  title={isCollapsed ? menuItem.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-sm font-medium">
                        {menuItem.label}
                      </span>
                      {badge !== null && badge > 0 && (
                        <span
                          className={cn(
                            'px-2 py-0.5 text-xs rounded-full',
                            active
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-gray-100 text-gray-600'
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </>
                  )}

                  {/* Tooltip for collapsed sidebar */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                      {menuItem.label}
                      {badge !== null && badge > 0 && ` (${badge})`}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}

          {/* 分隔线 */}
          <li className="my-3">
            <div className="border-t border-gray-200" />
          </li>

          {/* 更多功能折叠按钮 */}
          <li>
            <button
              onClick={() => setIsMoreExpanded(!isMoreExpanded)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-50"
            >
              {isMoreExpanded ? (
                <ChevronUp className="w-5 h-5 flex-shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 flex-shrink-0" />
              )}
              {!isCollapsed && (
                <span className="flex-1 text-sm font-medium text-left">
                  更多功能
                </span>
              )}
            </button>
          </li>

          {/* 更多菜单（可折叠） */}
          {isMoreExpanded && moreMenuItems.map((menuItem) => {
            // 权限过滤：如果是管理员专用功能且用户不是管理员，则不显示
            if (menuItem.adminOnly && !isAdmin) {
              return null;
            }
            
            const Icon = menuItem.icon;
            const active = isActive(menuItem.href);
            const badge = menuItem.badge ? badges[menuItem.badge] : null;

            return (
              <li key={menuItem.id}>
                <Link
                  href={menuItem.disabled ? '#' : menuItem.href}
                  onClick={(e) => {
                    if (menuItem.disabled) {
                      e.preventDefault();
                      handleMenuClick(menuItem);
                    }
                  }}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors relative group',
                    active && !menuItem.disabled
                      ? 'bg-blue-50 text-blue-600'
                      : menuItem.disabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                  title={isCollapsed ? menuItem.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-sm font-medium">
                        {menuItem.label}
                      </span>
                      {badge !== null && badge > 0 && (
                        <span
                          className={cn(
                            'px-2 py-0.5 text-xs rounded-full',
                            active
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-gray-100 text-gray-600'
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </>
                  )}

                  {/* Tooltip for collapsed sidebar */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                      {menuItem.label}
                      {badge !== null && badge > 0 && ` (${badge})`}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 版本信息 */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 text-center">
            v6.0.0 - Phase 6
          </div>
        </div>
      )}
    </aside>
  );
}

