'use client';

import { Building2, Package, AlertTriangle, TrendingUp, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface AccountGroup {
  accountEmail: string;
  accountInfo: {
    account_source: string | null;
    account_status: string | null;
    account_region: string | null;
    registration_date: string | null;
    pending_close_date: string | null;
    account_closed_date: string | null;
    account_quality_issues: string[] | null;
    account_product_count: number | null;
  };
  totalApps: number;
  removedApps: number;
  activeApps: number;
  latestRemovalTime: string | null;
  accountSurvivalDays: number | null;
}

interface AccountGroupListProps {
  accounts: AccountGroup[];
  total: number;
  currentPage: number;
  pageSize: number;
  selectedAccount: AccountGroup | null;
  isLoading: boolean;
  onAccountSelect: (account: AccountGroup) => void;
  onPageChange: (page: number) => void;
  onSearch: (search: string) => void;
}

export function AccountGroupList({
  accounts,
  total,
  currentPage,
  pageSize,
  selectedAccount,
  isLoading,
  onAccountSelect,
  onPageChange,
  onSearch,
}: AccountGroupListProps) {
  const totalPages = Math.ceil(total / pageSize);

  return (
    <Card className="p-4 h-full flex flex-col">
      {/* 搜索框 */}
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜索开发者账号..."
            className="pl-9 h-9"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 统计信息 */}
      <div className="mb-3 text-sm text-gray-600 flex items-center justify-between">
        <span>共 {total} 个账号</span>
        <span>{accounts.reduce((sum, acc) => sum + acc.removedApps, 0)} 个App已下架</span>
      </div>

      {/* 账号列表 */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
              <p className="text-sm">加载中...</p>
            </div>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <Building2 className="w-12 h-12 mx-auto mb-2" />
              <p>暂无账号数据</p>
            </div>
          </div>
        ) : (
          accounts.map((account) => (
            <button
              key={account.accountEmail}
              onClick={() => onAccountSelect(account)}
              className={cn(
                'w-full text-left p-4 rounded-lg border transition-all',
                selectedAccount?.accountEmail === account.accountEmail
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              )}
            >
              {/* 第一行：邮箱 + 统计 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Building2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span className="font-semibold text-gray-900 truncate">
                    {account.accountEmail}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm flex-shrink-0 ml-3">
                  <div className="flex items-center gap-1 text-gray-600">
                    <Package className="w-4 h-4" />
                    <span className="font-medium">{account.totalApps}个</span>
                  </div>
                  {account.removedApps > 0 && (
                    <div className="flex items-center gap-1 text-red-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">{account.removedApps}个下架</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 第二行：来源 + 状态标签 */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {account.accountInfo.account_source && (
                  <Badge variant="secondary" className="text-xs px-2 py-0.5">
                    {account.accountInfo.account_source}
                  </Badge>
                )}
                {account.accountInfo.account_status && (
                  <Badge
                    variant={
                      ['被关停', '账号被关停', '回收', '账号回收', '标记为等待关停'].includes(
                        account.accountInfo.account_status
                      )
                        ? 'destructive'
                        : 'default'
                    }
                    className="text-xs px-2 py-0.5"
                  >
                    {account.accountInfo.account_status}
                  </Badge>
                )}
              </div>

              {/* 第三行：详细信息 */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-600">
                {account.accountInfo.registration_date && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">账号注册：</span>
                    <span className="text-blue-600 font-medium">
                      {format(new Date(account.accountInfo.registration_date), 'yyyy-MM-dd')}
                      {account.accountSurvivalDays !== null && (
                        <span className="ml-1">存活{account.accountSurvivalDays}天</span>
                      )}
                    </span>
                  </div>
                )}
                {account.accountInfo.pending_close_date && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">标记关停：</span>
                    <span className="font-medium">
                      {format(new Date(account.accountInfo.pending_close_date), 'yyyy-MM-dd')}
                    </span>
                  </div>
                )}
                {account.accountInfo.account_region && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">注册地：</span>
                    <span>{account.accountInfo.account_region}</span>
                  </div>
                )}
                {account.latestRemovalTime && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">最近下架：</span>
                    <span className="text-red-600 font-medium">
                      {format(new Date(account.latestRemovalTime), 'yyyy-MM-dd HH:mm')}
                    </span>
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* 分页控件 */}
      {!isLoading && accounts.length > 0 && (
        <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm">
          <div className="text-gray-600">
            第 {currentPage} / {totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-7 px-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="h-7 px-2"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

