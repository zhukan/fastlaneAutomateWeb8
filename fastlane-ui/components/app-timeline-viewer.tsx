'use client';

import { Calendar, User, MapPin, Code, Package, Loader2, Info, Building2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { AppRemovalAnalysis } from '@/components/app-removal-analysis';

interface RemovedApp {
  id: string;
  bundleId: string;
  appName: string;
  appId: string | null;
  accountName: string | null;
  removalTime: string | null;
  totalOperations: number;
  survivalDays: number | null;
  keywordSearchUrl: string | null;  // ⭐ 关键词查询链接
  targetPackageUrl: string | null;  // ⭐ 目标包链接
  qimaiUrl: string | null;          // ⭐ 七麦链接
  
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

interface OperationRecord {
  id: string;
  bundleId: string;
  operationType: 'RELEASE' | 'UPDATE';
  operationTime: string;
  appName: string | null;
  version: string | null;
  adVersion: string | null;
  operator: string | null;
  location: string | null;
  status?: string | null;
  releaseType?: string | null;
  remarks?: string | null;
  hapSourceTable?: 'production_release' | 'update_task';
}

interface AppTimelineViewerProps {
  app: RemovedApp | null;
  timeline: OperationRecord[];
  isLoading: boolean;
}

export function AppTimelineViewer({ app, timeline, isLoading }: AppTimelineViewerProps) {
  if (!app) {
    return (
      <Card className="p-12 h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium mb-2">请选择一个App</p>
          <p className="text-sm">从左侧列表中选择一个下架的App，查看其完整操作记录</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-12 h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">正在加载操作记录...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 h-full overflow-auto">
      {/* App信息头部 */}
      <div className="mb-4 pb-4 border-b">
        <div className="flex items-start justify-between mb-2">
          {/* App名称 - 点击跳转七麦 */}
          {app.qimaiUrl ? (
            <a
              href={app.qimaiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xl font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-2"
            >
              {app.appName}
              <ExternalLink className="w-5 h-5" />
            </a>
          ) : (
            <h2 className="text-xl font-bold text-gray-900">{app.appName}</h2>
          )}
          
          {/* 快速链接 */}
          <div className="flex items-center gap-2">
            {app.keywordSearchUrl && (
              <a
                href={app.keywordSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-green-700 bg-green-50 hover:bg-green-100 rounded-md border border-green-200"
              >
                🔍 关键词查询
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {app.targetPackageUrl && (
              <a
                href={app.targetPackageUrl}
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
        <div className="space-y-2">
          <div className="text-sm text-gray-600 font-mono">{app.bundleId}</div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="destructive">已下架</Badge>
            <Badge variant="outline">{app.totalOperations} 条操作记录</Badge>
            {app.survivalDays !== null && (
              <Badge variant="secondary">存活 {app.survivalDays} 天</Badge>
            )}
          </div>
          {app.removalTime && (
            <div className="text-sm text-gray-400">
              下架时间: {format(new Date(app.removalTime), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
            </div>
          )}
        </div>
      </div>

      {/* 账号信息卡片 */}
      {app.accountInfo && (
        <div className="mb-4 pb-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-gray-600" />
            <h3 className="font-semibold text-gray-900">账号信息</h3>
          </div>
          <div className="bg-gray-50 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-200">
                {/* 开发者账号 */}
                <tr>
                  <td className="px-4 py-2.5 text-gray-500 w-28 bg-gray-100">开发者账号</td>
                  <td className="px-4 py-2.5 text-gray-900 font-mono">{app.accountInfo.accountEmail}</td>
                </tr>
                
                {/* 账号来源 */}
                {app.accountInfo.accountSource && (
                  <tr>
                    <td className="px-4 py-2.5 text-gray-500 w-28 bg-gray-100">账号来源</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-amber-500 hover:bg-amber-600">
                          🟠 {app.accountInfo.accountSource}
                        </Badge>
                        {app.accountInfo.accountSourceType && app.accountInfo.accountSourceType.length > 0 && (
                          <span className="text-xs text-gray-500">
                            ({app.accountInfo.accountSourceType.join('、')})
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                
                {/* 账号状态 */}
                {app.accountInfo.accountStatus && (
                  <tr>
                    <td className="px-4 py-2.5 text-gray-500 w-28 bg-gray-100">账号状态</td>
                    <td className="px-4 py-2.5">
                      {['被关停', '账号被关停', '回收', '账号回收'].includes(app.accountInfo.accountStatus) ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                          ⚠️ {app.accountInfo.accountStatus}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {app.accountInfo.accountStatus}
                        </Badge>
                      )}
                    </td>
                  </tr>
                )}
                
                {/* 账号注册日期 */}
                {app.accountInfo.registrationDate && (
                  <tr>
                    <td className="px-4 py-2.5 text-gray-500 w-28 bg-gray-100">账号注册</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900">
                          {format(new Date(app.accountInfo.registrationDate), 'yyyy-MM-dd', { locale: zhCN })}
                        </span>
                        {(() => {
                          const startDate = new Date(app.accountInfo.registrationDate);
                          // 优先使用"标记为等待关停时间"（业务关停时间）
                          // 其次使用"账号关停时间"（苹果官方关停时间）
                          // 最后使用今天（表示账号还在使用中）
                          const endDate = app.accountInfo.pendingCloseDate 
                            ? new Date(app.accountInfo.pendingCloseDate)
                            : (app.accountInfo.accountClosedDate 
                              ? new Date(app.accountInfo.accountClosedDate)
                              : new Date());
                          const survivalDays = differenceInDays(endDate, startDate);
                          
                          if (survivalDays > 0) {
                            return (
                              <Badge 
                                variant="secondary" 
                                className="bg-blue-100 text-blue-700"
                              >
                                {app.accountInfo.pendingCloseDate || app.accountInfo.accountClosedDate 
                                  ? `存活 ${survivalDays} 天`
                                  : `已存活 ${survivalDays} 天`
                                }
                              </Badge>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                  </tr>
                )}
                
                {/* 标记为等待关停时间（业务关停时间） */}
                {app.accountInfo.pendingCloseDate && (
                  <tr>
                    <td className="px-4 py-2.5 text-gray-500 w-28 bg-gray-100">标记关停</td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {format(new Date(app.accountInfo.pendingCloseDate), 'yyyy-MM-dd', { locale: zhCN })}
                    </td>
                  </tr>
                )}
                
                {/* 注册地 */}
                {app.accountInfo.accountRegion && (
                  <tr>
                    <td className="px-4 py-2.5 text-gray-500 w-28 bg-gray-100">注册地</td>
                    <td className="px-4 py-2.5 text-gray-900">{app.accountInfo.accountRegion}</td>
                  </tr>
                )}
                
                {/* 质量标记 */}
                {app.accountInfo.accountQualityIssues && app.accountInfo.accountQualityIssues.length > 0 && (
                  <tr>
                    <td className="px-4 py-2.5 text-gray-500 w-28 bg-gray-100">质量标记</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {app.accountInfo.accountQualityIssues.map((issue, idx) => (
                          <Badge 
                            key={idx}
                            variant="secondary" 
                            className="bg-orange-100 text-orange-700"
                          >
                            ⚠️ {issue}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                
                {/* 该账号下产品数 */}
                {app.accountInfo.accountProductCount !== null && (
                  <tr>
                    <td className="px-4 py-2.5 text-gray-500 w-28 bg-gray-100">账号下产品</td>
                    <td className="px-4 py-2.5 text-gray-900">{app.accountInfo.accountProductCount} 个</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 操作记录表格 - 自适应内容高度 */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-gray-600" />
          <h3 className="font-semibold text-gray-900">操作记录</h3>
          <Badge variant="outline" className="ml-auto">{timeline.length} 条</Badge>
        </div>

        {timeline.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Info className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>暂无操作记录</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
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
                {timeline.map((record, index) => (
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
        )}
      </div>

      {/* APP下架原因分析和猜测 - 紧跟在操作记录下面 */}
      <AppRemovalAnalysis bundleId={app.bundleId} />
    </Card>
  );
}

