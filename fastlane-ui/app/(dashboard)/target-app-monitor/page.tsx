'use client';

import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Download, Search, AlertTriangle, CheckCircle, HelpCircle, XCircle, Info, AlertCircle } from 'lucide-react';
import { agentClient } from '@/lib/agent-client';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ============================================
// 类型定义
// ============================================

enum TargetAppStatus {
  AVAILABLE = 'available',
  REMOVED = 'removed',
  UNKNOWN = 'unknown',
}

interface TargetApp {
  id: string;
  hapRowId: string;
  appName: string;
  appId?: string;
  appStoreLink?: string;
  qimaiLink?: string;
  keywordSearchLink?: string;
  isMonitoring: boolean;
  currentStatus: TargetAppStatus;
  isOffline: boolean;
  offlineDate?: string;
  isClearKeyword?: boolean;
  isClearRank?: boolean;
  source?: string;
  remark?: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface TargetAppStats {
  total: number;
  available: number;
  removed: number;
  unknown: number;
  offline: number;
  clearKeyword: number;
  clearRank: number;
}

// 七麦监控日志类型
interface QimaiMonitoringLog {
  id: string;
  execution_time: string;
  status: 'success' | 'failed' | 'cookie_expired';
  clear_rank_detected: number;
  clear_keyword_detected: number;
  clear_rank_updated: number;
  clear_keyword_updated: number;
  error_message?: string;
}

const STATUS_CONFIG = {
  [TargetAppStatus.AVAILABLE]: {
    label: '在架',
    icon: '✓',
    color: 'bg-green-100 text-green-800',
  },
  [TargetAppStatus.REMOVED]: {
    label: '下架',
    icon: '✗',
    color: 'bg-red-100 text-red-800',
  },
  [TargetAppStatus.UNKNOWN]: {
    label: '未知',
    icon: '?',
    color: 'bg-gray-100 text-gray-800',
  },
};

// ============================================
// 主组件
// ============================================

export default function TargetAppMonitorPage() {
  const [apps, setApps] = useState<TargetApp[]>([]);
  const [filteredApps, setFilteredApps] = useState<TargetApp[]>([]);
  const [stats, setStats] = useState<TargetAppStats>({
    total: 0,
    available: 0,
    removed: 0,
    unknown: 0,
    offline: 0,
    clearKeyword: 0,
    clearRank: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkingApps, setCheckingApps] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [daysRange, setDaysRange] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;
  
  // 备注浮层状态
  const [remarkDialogOpen, setRemarkDialogOpen] = useState(false);
  const [currentRemark, setCurrentRemark] = useState<{ appName: string; remark: string } | null>(null);
  
  // 七麦监控状态
  const [qimaiMonitorLog, setQimaiMonitorLog] = useState<QimaiMonitoringLog | null>(null);

  // 加载七麦监控日志
  const loadQimaiMonitorStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('qimai_monitoring_logs')
        .select('*')
        .order('execution_time', { ascending: false })
        .limit(1)
        .single();
      
      if (!error && data) {
        setQimaiMonitorLog(data as QimaiMonitoringLog);
      }
    } catch {
      // 静默处理错误，可能表未创建
      console.log('[QimaiMonitor] 无法加载监控日志');
    }
  };

  // 加载数据
  const loadData = async () => {
    try {
      const [appsData, statsData] = await Promise.all([
        agentClient.getTargetApps({
          daysRange,
          statusFilter: statusFilter === 'all' ? undefined : statusFilter,
          search: searchTerm || undefined,
          pageIndex: currentPage,
          pageSize,
        }),
        agentClient.getTargetAppStats(),
      ]);
      
      setApps(appsData.apps);
      setFilteredApps(appsData.apps);
      setTotalPages(Math.ceil(appsData.total / pageSize));
      setStats(statsData);
    } catch (error: any) {
      toast.error('加载数据失败：' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadData();
    loadQimaiMonitorStatus();
  }, [currentPage, daysRange, statusFilter, searchTerm]);

  // 从明道云同步
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await agentClient.syncTargetApps(daysRange);
      toast.success(`同步成功：同步了 ${result.synced} 条记录`);
      await loadData();
    } catch (error: any) {
      toast.error('同步失败：' + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // 检查所有目标包
  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    try {
      await agentClient.checkAllTargetApps();
      toast.success('批量检查已开始，请稍后查看结果');
      // 延迟 5 秒后刷新数据
      setTimeout(() => {
        loadData();
      }, 5000);
    } catch (error: any) {
      toast.error('批量检查失败：' + error.message);
    } finally {
      setIsCheckingAll(false);
    }
  };

  // 同步并检查（一键操作）
  const handleSyncAndCheck = async () => {
    setIsSyncing(true);
    setIsCheckingAll(true);
    try {
      const result = await agentClient.syncAndCheckTargetApps(daysRange);
      toast.success(result.message);
      // 延迟 5 秒后刷新数据
      setTimeout(() => {
        loadData();
      }, 5000);
    } catch (error: any) {
      toast.error('操作失败：' + error.message);
    } finally {
      setIsSyncing(false);
      setIsCheckingAll(false);
    }
  };

  // 检查单个目标包
  const handleCheckSingle = async (appId: string) => {
    if (!appId) {
      toast.error('缺少 App ID');
      return;
    }

    setCheckingApps(prev => new Set([...prev, appId]));
    try {
      const result = await agentClient.checkTargetApp(appId);
      toast.success(`检查完成：${result.status}`);
      await loadData();
    } catch (error: any) {
      toast.error('检查失败：' + error.message);
    } finally {
      setCheckingApps(prev => {
        const next = new Set(prev);
        next.delete(appId);
        return next;
      });
    }
  };

  // 格式化时间
  const formatTime = (time?: string) => {
    if (!time) return '未检查';
    const date = new Date(time);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    return `${diffDays}天前`;
  };

  // 打开备注浮层
  const handleOpenRemark = (appName: string, remark: string) => {
    setCurrentRemark({ appName, remark });
    setRemarkDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // 格式化七麦监控时间
  const formatQimaiMonitorTime = (time?: string) => {
    if (!time) return '未知';
    const date = new Date(time);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 检查七麦监控是否需要告警
  const isQimaiMonitorWarning = qimaiMonitorLog?.status === 'cookie_expired';
  const isQimaiMonitorError = qimaiMonitorLog?.status === 'failed';

  return (
    <div className="p-6 space-y-6">
      {/* 七麦监控状态告警 */}
      {isQimaiMonitorWarning && (
        <Alert variant="destructive" className="bg-orange-50 border-orange-200">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-800">七麦 Cookie 已过期</AlertTitle>
          <AlertDescription className="text-orange-700">
            七麦自动监控功能暂停。请更新 Supabase Edge Function 的 QIMAI_COOKIE 环境变量。
            <br />
            <span className="text-xs">最后执行: {formatQimaiMonitorTime(qimaiMonitorLog?.execution_time)}</span>
          </AlertDescription>
        </Alert>
      )}
      
      {isQimaiMonitorError && (
        <Alert variant="destructive" className="bg-red-50 border-red-200">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">七麦监控执行失败</AlertTitle>
          <AlertDescription className="text-red-700">
            {qimaiMonitorLog?.error_message || '未知错误'}
            <br />
            <span className="text-xs">最后执行: {formatQimaiMonitorTime(qimaiMonitorLog?.execution_time)}</span>
          </AlertDescription>
        </Alert>
      )}

      {/* 七麦监控状态信息（正常时显示） */}
      {qimaiMonitorLog && qimaiMonitorLog.status === 'success' && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-md">
          <CheckCircle className="h-3 w-3 text-green-500" />
          <span>
            七麦自动监控正常 · 最后更新: {formatQimaiMonitorTime(qimaiMonitorLog.execution_time)}
            {(qimaiMonitorLog.clear_rank_updated > 0 || qimaiMonitorLog.clear_keyword_updated > 0) && (
              <span className="ml-2 text-orange-600">
                (上次更新: 清榜 {qimaiMonitorLog.clear_rank_updated} / 清词 {qimaiMonitorLog.clear_keyword_updated})
              </span>
            )}
          </span>
        </div>
      )}

      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">目标包监控</h1>
          <p className="text-sm text-gray-500 mt-1">监控竞品应用的下架、清词、清榜等状态变化</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">监控总数</p>
              <p className="text-2xl font-bold mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">在架</p>
              <p className="text-2xl font-bold mt-1 text-green-600">{stats.available}</p>
            </div>
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">下架</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{stats.offline}</p>
            </div>
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">清词/清榜</p>
              <p className="text-2xl font-bold mt-1 text-orange-600">
                {stats.clearKeyword + stats.clearRank}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* 操作工具栏 */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 flex gap-2 flex-wrap">
            <Button
              onClick={handleSyncAndCheck}
              disabled={isSyncing || isCheckingAll}
              className="gap-2"
            >
              {isSyncing || isCheckingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <RefreshCw className="w-4 h-4" />
                </>
              )}
              同步并检查
            </Button>

            <Button
              onClick={handleSync}
              disabled={isSyncing}
              variant="outline"
              className="gap-2"
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              仅同步
            </Button>

            <Button
              onClick={handleCheckAll}
              disabled={isCheckingAll}
              variant="outline"
              className="gap-2"
            >
              {isCheckingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              仅检查
            </Button>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            {/* 时间范围筛选 */}
            <select
              value={daysRange}
              onChange={(e) => {
                setDaysRange(parseInt(e.target.value));
                setCurrentPage(1);
              }}
              className="h-10 px-3 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>最近1天</option>
              <option value={3}>最近3天</option>
              <option value={5}>最近5天</option>
              <option value={7}>最近7天</option>
              <option value={15}>最近15天</option>
              <option value={30}>最近30天</option>
              <option value={0}>全部</option>
            </select>

            {/* 状态筛选 */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 px-3 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部状态</option>
              <option value="available">在架</option>
              <option value="offline">下架</option>
              <option value="clearKeyword">清词</option>
              <option value="clearRank">清榜</option>
            </select>

            {/* 搜索框 */}
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="搜索应用名称或 App ID"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 目标包列表 */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  应用名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  创建时间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  最后检查
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  下架日期
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  来源
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  备注
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    {searchTerm || statusFilter !== 'all' || daysRange > 0
                      ? '没有符合条件的目标包'
                      : '暂无监控的目标包，请先从明道云同步'}
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => {
                  const statusConfig = STATUS_CONFIG[app.currentStatus];
                  const isChecking = !!app.appId && checkingApps.has(app.appId);

                  return (
                    <tr key={app.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          <Badge className={cn('gap-1', statusConfig.color)}>
                            <span>{statusConfig.icon}</span>
                            <span>{statusConfig.label}</span>
                          </Badge>
                          {app.isClearKeyword && (
                            <Badge className="gap-1 bg-orange-100 text-orange-800 border-orange-300">
                              <span>🔤</span>
                              <span>清词</span>
                            </Badge>
                          )}
                          {app.isClearRank && (
                            <Badge className="gap-1 bg-purple-100 text-purple-800 border-purple-300">
                              <span>📊</span>
                              <span>清榜</span>
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{app.appName}</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">
                          {app.appId || <span className="text-gray-400">无 App ID</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">
                          {new Date(app.createdAt).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{formatTime(app.lastCheckedAt)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {app.offlineDate ? (
                          <div className="text-sm text-red-600">
                            {new Date(app.offlineDate).toLocaleDateString('zh-CN')}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400">-</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600">
                          {app.source || <span className="text-gray-400">-</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {app.remark ? (
                          <div 
                            className="text-sm text-gray-600 max-w-[200px] truncate cursor-pointer hover:text-blue-600 flex items-center gap-1"
                            onClick={() => handleOpenRemark(app.appName, app.remark!)}
                            title="点击查看完整备注"
                          >
                            <span className="truncate">{app.remark}</span>
                            <Info className="w-3 h-3 flex-shrink-0 text-gray-400" />
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex gap-1 justify-end">
                          {app.keywordSearchLink && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(app.keywordSearchLink, '_blank')}
                              className="text-xs"
                            >
                              关键词
                            </Button>
                          )}
                          {app.qimaiLink && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(app.qimaiLink, '_blank')}
                              className="text-xs"
                            >
                              七麦
                            </Button>
                          )}
                          {app.appStoreLink && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(app.appStoreLink, '_blank')}
                              className="text-xs"
                            >
                              App Store
                            </Button>
                          )}
                          {app.appId && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCheckSingle(app.appId!)}
                              disabled={isChecking}
                              className="gap-1"
                            >
                              {isChecking ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              刷新
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              第 {currentPage} 页，共 {totalPages} 页
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 备注详情浮层 */}
      <Dialog open={remarkDialogOpen} onOpenChange={setRemarkDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              备注详情
            </DialogTitle>
            <DialogDescription>
              应用：{currentRemark?.appName}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
              {currentRemark?.remark}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

