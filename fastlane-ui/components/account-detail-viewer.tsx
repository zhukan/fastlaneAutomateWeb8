'use client';

import { Building2, Calendar, TrendingUp, Package, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { AppRemovalAnalysis } from '@/components/app-removal-analysis';

interface AccountApp {
  id: string;
  bundleId: string;
  appName: string;
  isRemoved: boolean;
  removalTime: string | null;
  survivalDays: number | null;
  totalOperations: number;
  keywordSearchUrl: string | null;  // ⭐ 关键词查询链接
  targetPackageUrl: string | null;  // ⭐ 目标包链接
  qimaiUrl: string | null;          // ⭐ 七麦链接
}

interface AccountOperation {
  id: string;
  bundleId: string;
  appName: string;
  operationType: 'RELEASE' | 'UPDATE';
  operationTime: string;
  version: string | null;
  adVersion: string | null;
  operator: string | null;
  location: string | null;
  status?: string | null;
  releaseType?: string | null;
  remarks?: string | null;
  hapSourceTable?: 'production_release' | 'update_task';
}

interface AccountInfo {
  accountEmail: string;
  accountSource: string | null;
  accountStatus: string | null;
  accountRegion: string | null;
  registrationDate: string | null;
  pendingCloseDate: string | null;
  accountClosedDate: string | null;
  accountProductCount: number | null;
  accountQualityIssues: string[] | null;
}

interface AccountDetailViewerProps {
  accountInfo: AccountInfo;
  apps: AccountApp[];
  operations: AccountOperation[];
  isLoading: boolean;
  onAppClick?: (bundleId: string) => void;
}

export function AccountDetailViewer({
  accountInfo,
  apps,
  operations,
  isLoading,
  onAppClick,
}: AccountDetailViewerProps) {
  // 计算账号存活天数
  const getAccountSurvivalDays = () => {
    if (!accountInfo.registrationDate) return null;
    
    const startDate = new Date(accountInfo.registrationDate);
    const endDate = accountInfo.pendingCloseDate
      ? new Date(accountInfo.pendingCloseDate)
      : (accountInfo.accountClosedDate
        ? new Date(accountInfo.accountClosedDate)
        : new Date());
    
    return differenceInDays(endDate, startDate);
  };

  const accountSurvivalDays = getAccountSurvivalDays();
  const removedAppsCount = apps.filter(app => app.isRemoved).length;
  const activeAppsCount = apps.length - removedAppsCount;

  // 按 bundleId 分组操作记录
  const operationsByApp = operations.reduce((groups, operation) => {
    const key = operation.bundleId;
    if (!groups[key]) {
      groups[key] = {
        bundleId: operation.bundleId,
        appName: operation.appName,
        operations: [],
      };
    }
    groups[key].operations.push(operation);
    return groups;
  }, {} as Record<string, { bundleId: string; appName: string; operations: AccountOperation[] }>);

  const appGroups = Object.values(operationsByApp);

  if (isLoading) {
    return (
      <Card className="p-6 h-full flex items-center justify-center">
        <div className="text-center text-gray-500">加载账号信息...</div>
      </Card>
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-4">
      {/* 账号概览卡片 */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {accountInfo.accountEmail}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                {accountInfo.accountSource && (
                  <Badge variant="secondary">{accountInfo.accountSource}</Badge>
                )}
                {accountInfo.accountStatus && (
                  <Badge 
                    variant={
                      ['被关停', '账号被关停', '回收', '账号回收', '标记为等待关停'].includes(accountInfo.accountStatus)
                        ? 'destructive'
                        : 'default'
                    }
                  >
                    {accountInfo.accountStatus}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 关键指标 */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Package className="w-4 h-4" />
              <span className="text-xs font-medium">产品总数</span>
            </div>
            <div className="text-2xl font-bold text-blue-700">{apps.length}</div>
          </div>

          <div className="p-3 bg-red-50 rounded-lg">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-medium">已下架</span>
            </div>
            <div className="text-2xl font-bold text-red-700">{removedAppsCount}</div>
          </div>

          <div className="p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">正常运行</span>
            </div>
            <div className="text-2xl font-bold text-green-700">{activeAppsCount}</div>
          </div>

          <div className="p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-medium">账号存活</span>
            </div>
            <div className="text-2xl font-bold text-purple-700">
              {accountSurvivalDays !== null ? `${accountSurvivalDays}天` : '-'}
            </div>
          </div>
        </div>

        {/* 额外信息 */}
        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-3 text-sm">
          {accountInfo.registrationDate && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4" />
              <span>注册：{format(new Date(accountInfo.registrationDate), 'yyyy-MM-dd')}</span>
            </div>
          )}
          {accountInfo.pendingCloseDate && (
            <div className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="w-4 h-4" />
              <span>标记关停：{format(new Date(accountInfo.pendingCloseDate), 'yyyy-MM-dd')}</span>
            </div>
          )}
          {accountInfo.accountRegion && (
            <div className="text-gray-600">
              区域：{accountInfo.accountRegion}
            </div>
          )}
          {accountInfo.accountQualityIssues && accountInfo.accountQualityIssues.length > 0 && (
            <div className="text-orange-600">
              质量问题：{accountInfo.accountQualityIssues.join(', ')}
            </div>
          )}
        </div>
      </Card>

      {/* 该账号下的App列表 */}
      <Card className="p-6">
        <h4 className="font-semibold text-gray-900 mb-4">账号下的App ({apps.length}个)</h4>
        <div className="space-y-2" style={{ maxHeight: Math.min(apps.length * 140 + 20, 600) + 'px', overflowY: apps.length * 140 > 600 ? 'auto' : 'visible' }}>
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => onAppClick?.(app.bundleId)}
              className={cn(
                'w-full text-left p-3 rounded-lg border transition-all hover:border-blue-300 hover:bg-blue-50/50',
                app.isRemoved
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-200'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {/* App名称 - 点击跳转七麦 */}
                    {app.qimaiUrl ? (
                      <a
                        href={app.qimaiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                      >
                        {app.appName}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="font-medium text-gray-900">{app.appName}</span>
                    )}
                    
                    {app.isRemoved && (
                      <Badge variant="destructive" className="text-xs">已下架</Badge>
                    )}
                    
                    {/* 其他链接 */}
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
                  <div className="text-xs text-gray-500 font-mono mb-2">
                    {app.bundleId}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span>操作：{app.totalOperations}条</span>
                    {app.survivalDays !== null && (
                      <span>存活：{app.survivalDays}天</span>
                    )}
                    {app.removalTime && (
                      <span className="text-red-600">
                        {formatDistanceToNow(new Date(app.removalTime), {
                          locale: zhCN,
                          addSuffix: true,
                        })}下架
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* 该账号所有App的操作记录（按App分组） */}
      <div className="space-y-4">
        <h4 className="font-semibold text-gray-900">
          操作记录 ({operations.length}条，{appGroups.length}个App)
        </h4>

        {appGroups.length === 0 ? (
          <Card className="p-12">
            <div className="text-center text-gray-400">暂无操作记录</div>
          </Card>
        ) : (
          appGroups.map((group) => {
            // 找到对应的 app 信息
            const appInfo = apps.find(a => a.bundleId === group.bundleId);
            
            return (
              <Card key={group.bundleId} className="p-6">
                {/* App信息头部 */}
                <div className="mb-4 pb-4 border-b">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* App名称 - 点击跳转七麦 */}
                      {appInfo?.qimaiUrl ? (
                        <a
                          href={appInfo.qimaiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lg font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-2 mb-1 inline-flex"
                        >
                          {group.appName}
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : (
                        <h3 className="text-lg font-bold text-gray-900 mb-1">{group.appName}</h3>
                      )}
                      <div className="text-sm text-gray-600 font-mono mb-2">{group.bundleId}</div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant="outline">{group.operations.length} 条操作记录</Badge>
                        {appInfo?.isRemoved && (
                          <Badge variant="destructive">已下架</Badge>
                        )}
                        {appInfo?.survivalDays !== null && (
                          <Badge variant="secondary">存活 {appInfo?.survivalDays} 天</Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* 快速链接 */}
                    <div className="flex items-center gap-2 ml-4">
                      {appInfo?.keywordSearchUrl && (
                        <a
                          href={appInfo.keywordSearchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-green-700 bg-green-50 hover:bg-green-100 rounded-md border border-green-200"
                        >
                          🔍 关键词查询
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {appInfo?.targetPackageUrl && (
                        <a
                          href={appInfo.targetPackageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md border border-purple-200"
                        >
                          📦 目标包
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* 操作记录表格 */}
                <div className="overflow-auto border rounded-lg mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr className="border-b">
                        <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[140px]">时间</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[90px]">类型</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[110px]">取数来源</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">应用信息</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[150px]">广告代码版本</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[90px]">操作人</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[90px]">地点</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[110px]">状态</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[110px]">发布类型</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {group.operations.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                          {/* 时间 */}
                          <td className="px-3 py-3 text-gray-600 align-top whitespace-nowrap">
                            <span className="text-xs">
                              {format(new Date(record.operationTime), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                            </span>
                          </td>

                          {/* 类型 */}
                          <td className="px-3 py-3 align-top">
                            <Badge
                              variant={record.operationType === 'RELEASE' ? 'default' : 'secondary'}
                              className={cn(
                                'text-xs font-medium',
                                record.operationType === 'RELEASE'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-blue-100 text-blue-700'
                              )}
                            >
                              {record.operationType === 'RELEASE' ? '首次发布' : '更新'}
                            </Badge>
                          </td>

                          {/* 取数来源 */}
                          <td className="px-3 py-3 text-gray-700 align-top">
                            <Badge variant="outline" className="text-xs">
                              {record.hapSourceTable === 'production_release' ? 'App生产发布' : 'App更新任务'}
                            </Badge>
                          </td>

                          {/* 应用信息 */}
                          <td className="px-3 py-3 align-top">
                            <div className="flex items-center gap-2">
                              {record.appName && (
                                <span className="font-medium text-gray-900">{record.appName}</span>
                              )}
                              {record.version && (
                                <span className="text-xs text-gray-500 font-mono">v{record.version}</span>
                              )}
                            </div>
                            {record.remarks && (
                              <div className="text-xs text-gray-400 mt-1 line-clamp-1" title={record.remarks}>
                                💬 {record.remarks}
                              </div>
                            )}
                          </td>

                          {/* 广告代码版本 */}
                          <td className="px-3 py-3 align-top whitespace-nowrap">
                            {record.adVersion ? (
                              <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                {record.adVersion}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">-</span>
                            )}
                          </td>

                          {/* 操作人 */}
                          <td className="px-3 py-3 text-gray-700 align-top">
                            {record.operator || <span className="text-gray-300">-</span>}
                          </td>

                          {/* 地点 */}
                          <td className="px-3 py-3 text-gray-700 align-top">
                            {record.location || <span className="text-gray-300">-</span>}
                          </td>

                          {/* 状态 */}
                          <td className="px-3 py-3 align-top">
                            {record.status ? (
                              <Badge variant="outline" className="text-xs whitespace-nowrap">
                                {record.status}
                              </Badge>
                            ) : (
                              <span className="text-gray-300 text-xs">-</span>
                            )}
                          </td>

                          {/* 发布类型 */}
                          <td className="px-3 py-3 align-top">
                            {record.releaseType ? (
                              <Badge variant="outline" className="text-xs whitespace-nowrap">
                                {record.releaseType}
                              </Badge>
                            ) : (
                              <span className="text-gray-300 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* APP下架原因分析和猜测 - 只在已下架的APP中显示 */}
                {appInfo?.isRemoved && (
                  <AppRemovalAnalysis bundleId={group.bundleId} />
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

