'use client';

import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Package, ExternalLink, Link2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface RemovedApp {
  id: string;
  bundleId: string;
  appName: string;
  appId: string | null;
  accountName: string | null;
  removalTime: string | null;
  totalOperations: number;
  firstReleaseTime: string | null;
  lastUpdateTime: string | null;
  survivalDays: number | null;
  keywordSearchUrl: string | null;  // ⭐ 关键词查询链接
  targetPackageUrl: string | null;  // ⭐ 目标包链接
  qimaiUrl: string | null;          // ⭐ 七麦链接
  createdAt: string;
  updatedAt: string;
  
  // 账号详细信息
  accountInfo?: {
    accountEmail: string;
    accountSource: string | null;
    accountSourceType: string[] | null;
    accountStatus: string | null;
    accountExpiryDate: string | null;
    accountClosedDate: string | null;
    pendingCloseDate: string | null;
    accountRegion: string | null;
    accountQualityIssues: string[] | null;
    accountProductCount: number | null;
    registrationDate: string | null;
  };
}

interface RemovedAppListProps {
  apps: RemovedApp[];
  total: number;
  currentPage: number;
  pageSize: number;
  selectedApp: RemovedApp | null;
  isLoading: boolean;
  onAppSelect: (app: RemovedApp) => void;
  onPageChange: (page: number) => void;
  onSearch: (search: string) => void;
}

export function RemovedAppList({
  apps,
  total,
  currentPage,
  pageSize,
  selectedApp,
  isLoading,
  onAppSelect,
  onPageChange,
  onSearch,
}: RemovedAppListProps) {
  const [searchInput, setSearchInput] = useState('');

  const totalPages = Math.ceil(total / pageSize);

  // 计算账号存活天数
  const getAccountSurvivalDays = (app: RemovedApp) => {
    if (!app.accountInfo?.registrationDate) {
      return null;
    }
    
    const startDate = new Date(app.accountInfo.registrationDate);
    
    // 优先使用"标记为等待关停时间"（业务关停时间）
    // 其次使用"账号关停时间"（苹果官方关停时间）
    // 最后使用今天（表示账号还在使用中）
    const endDate = app.accountInfo.pendingCloseDate 
      ? new Date(app.accountInfo.pendingCloseDate)
      : (app.accountInfo.accountClosedDate 
        ? new Date(app.accountInfo.accountClosedDate)
        : new Date());
    
    const days = differenceInDays(endDate, startDate);
    return days > 0 ? days : null;
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchInput);
  };

  const handleSearchClear = () => {
    setSearchInput('');
    onSearch('');
  };

  return (
    <Card className="p-4 h-full flex flex-col">
      {/* 搜索框 */}
      <form onSubmit={handleSearchSubmit} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索App名称、Bundle ID或开发者账号..."
            className="pl-10 pr-20"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleSearchClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
            >
              清除
            </button>
          )}
        </div>
      </form>

      {/* App列表 */}
      <div className="flex-1 overflow-y-auto -mx-4 px-4">
        <div className="space-y-1.5">
          {apps.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {isLoading ? '加载中...' : '暂无下架App记录'}
            </div>
          ) : (
            apps.map((app) => (
              <button
                key={app.id}
                onClick={() => onAppSelect(app)}
                className={cn(
                  'w-full text-left p-3 rounded-lg border transition-all',
                  selectedApp?.id === app.id
                    ? 'bg-blue-50 border-blue-300 shadow-sm'
                    : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-blue-50/50'
                )}
              >
                {/* App 信息 */}
                <div className="mb-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    {/* App名称 - 点击跳转七麦 */}
                    {app.qimaiUrl ? (
                      <a
                        href={app.qimaiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                      >
                        {app.appName}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="font-semibold text-sm text-gray-900">
                        {app.appName}
                      </span>
                    )}
                    
                    {/* 其他链接 */}
                    <div className="flex items-center gap-1.5">
                      {app.keywordSearchUrl && (
                        <a
                          href={app.keywordSearchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="关键词查询"
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-green-700 bg-green-50 hover:bg-green-100 rounded"
                        >
                          🔍 关键词
                        </a>
                      )}
                      {app.targetPackageUrl && (
                        <a
                          href={app.targetPackageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="目标包"
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 rounded"
                        >
                          📦 目标包
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {app.bundleId}
                  </div>
                </div>
                
                {/* 关键指标 - 紧凑排列 */}
                <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
                  <span className="flex items-center gap-1">
                    <span className="text-gray-400">操作:</span>
                    <span className="font-medium">{app.totalOperations}条</span>
                  </span>
                  {app.survivalDays !== null && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className="flex items-center gap-1">
                        <span className="text-gray-400">存活:</span>
                        <span className="font-medium">{app.survivalDays}天</span>
                      </span>
                    </>
                  )}
                  {app.removalTime && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-400">
                        {formatDistanceToNow(new Date(app.removalTime), {
                          locale: zhCN,
                          addSuffix: true,
                        })}下架
                      </span>
                    </>
                  )}
                </div>
                
                {/* 账号信息 - 简洁展示 */}
                {app.accountInfo && (
                  <div className="border-t pt-2 space-y-1.5">
                    {/* 账号邮箱 */}
                    <div className="text-xs text-gray-600 truncate">
                      <span className="text-gray-400">账号: </span>
                      <span className="font-mono">{app.accountInfo.accountEmail}</span>
                    </div>
                    
                    {/* 账号关键信息 - 只显示重要的 */}
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      {/* 账号来源 */}
                      {app.accountInfo.accountSource && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded">
                          {app.accountInfo.accountSource}
                        </span>
                      )}
                      
                      {/* 账号状态异常 - 只在异常时显示 */}
                      {app.accountInfo.accountStatus && 
                       ['被关停', '账号被关停', '回收', '账号回收', '标记为等待关停'].includes(app.accountInfo.accountStatus) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 rounded">
                          ⚠️ {app.accountInfo.accountStatus}
                        </span>
                      )}
                      
                      {/* 质量标记 - 最多显示1个 */}
                      {app.accountInfo.accountQualityIssues && 
                       app.accountInfo.accountQualityIssues.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 rounded">
                          ⚠️ {app.accountInfo.accountQualityIssues[0]}
                          {app.accountInfo.accountQualityIssues.length > 1 && 
                            ` +${app.accountInfo.accountQualityIssues.length - 1}`
                          }
                        </span>
                      )}
                      
                      {/* 产品数量 - 始终显示 */}
                      {app.accountInfo.accountProductCount !== null && (
                        <span className="text-gray-500">
                          {app.accountInfo.accountProductCount}个产品
                        </span>
                      )}
                      
                      {/* 账号存活天数 */}
                      {(() => {
                        const survivalDays = getAccountSurvivalDays(app);
                        if (survivalDays && survivalDays < 100) {
                          return (
                            <span className="text-gray-500">
                              账号存活{survivalDays}天
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* 分页和统计信息 */}
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-600">
            共 {total} 条记录，当前显示 {apps.length} 条
          </div>
          {selectedApp && (
            <div className="text-sm text-green-600">
              已选择: {selectedApp.appName}
            </div>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              第 {currentPage}/{totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isLoading}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

