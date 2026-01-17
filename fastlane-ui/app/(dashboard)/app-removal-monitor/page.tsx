'use client';

import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Download, Search, AlertTriangle, CheckCircle, HelpCircle, LayoutList, Users } from 'lucide-react';
import { agentClient } from '@/lib/agent-client';
import { AppMonitorRecord, AppStatus, APP_STATUS_CONFIG, AppMonitorStats, AccountGroup } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'account';

export default function AppRemovalMonitorPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [apps, setApps] = useState<AppMonitorRecord[]>([]);
  const [filteredApps, setFilteredApps] = useState<AppMonitorRecord[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<AccountGroup[]>([]);
  const [stats, setStats] = useState<AppMonitorStats>({ total: 0, available: 0, removed: 0, unknown: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [isSyncingAndChecking, setIsSyncingAndChecking] = useState(false);
  const [checkingApps, setCheckingApps] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [incompleteAccounts, setIncompleteAccounts] = useState<Array<{
    hapAccountId: string;
    accountName: string;
    status: string;
    missingFields: string[];
  }>>([]);

  // 加载数据
  const loadData = async () => {
    try {
      const [appsData, statsData, groupsData] = await Promise.all([
        agentClient.getMonitoredApps(),
        agentClient.getMonitorStats(),
        agentClient.getMonitoredAppsByAccount(),
      ]);
      setApps(appsData);
      setStats(statsData);
      setAccountGroups(groupsData);
    } catch (error: any) {
      toast.error('加载数据失败：' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadData();
  }, []);

  // 筛选和搜索（列表视图）
  useEffect(() => {
    let filtered = apps;

    // 状态筛选
    if (statusFilter !== 'all') {
      filtered = filtered.filter(app => app.current_status === statusFilter);
    }

    // 搜索
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        app =>
          app.app_name.toLowerCase().includes(term) ||
          app.bundle_id.toLowerCase().includes(term) ||
          (app.apple_account_name && app.apple_account_name.toLowerCase().includes(term))
      );
    }

    setFilteredApps(filtered);
  }, [apps, statusFilter, searchTerm]);

  // 筛选和搜索（账号视图）
  useEffect(() => {
    let filtered = accountGroups;

    // 搜索：匹配账号名、App名称或Bundle ID
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered
        .map(group => {
          // 筛选匹配的 App
          const matchedApps = group.apps.filter(
            app =>
              app.app_name.toLowerCase().includes(term) ||
              app.bundle_id.toLowerCase().includes(term)
          );

          // 账号名匹配或有匹配的 App
          const accountMatches = group.accountName.toLowerCase().includes(term) ||
            (group.accountEmail && group.accountEmail.toLowerCase().includes(term));

          if (accountMatches || matchedApps.length > 0) {
            return {
              ...group,
              apps: accountMatches ? group.apps : matchedApps,
              stats: accountMatches ? group.stats : {
                total: matchedApps.length,
                available: matchedApps.filter(a => a.current_status === AppStatus.AVAILABLE).length,
                removed: matchedApps.filter(a => a.current_status === AppStatus.REMOVED).length,
                unknown: matchedApps.filter(a => a.current_status === AppStatus.UNKNOWN).length,
              },
            };
          }
          return null;
        })
        .filter(Boolean) as AccountGroup[];
    }

    // 状态筛选
    if (statusFilter !== 'all') {
      filtered = filtered
        .map(group => {
          const matchedApps = group.apps.filter(app => app.current_status === statusFilter);
          if (matchedApps.length > 0) {
            return {
              ...group,
              apps: matchedApps,
              stats: {
                total: matchedApps.length,
                available: matchedApps.filter(a => a.current_status === AppStatus.AVAILABLE).length,
                removed: matchedApps.filter(a => a.current_status === AppStatus.REMOVED).length,
                unknown: matchedApps.filter(a => a.current_status === AppStatus.UNKNOWN).length,
              },
            };
          }
          return null;
        })
        .filter(Boolean) as AccountGroup[];
    }

    setFilteredGroups(filtered);
  }, [accountGroups, statusFilter, searchTerm]);

  // 从明道云同步
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await agentClient.syncMonitoredApps();
      setIncompleteAccounts(result.incompleteActiveAccounts || []);
      
      if (result.incompleteActiveAccounts && result.incompleteActiveAccounts.length > 0) {
        toast.warning(`同步完成，但有 ${result.incompleteActiveAccounts.length} 个活跃账号信息不完整`);
      } else {
        toast.success(`同步成功：更新了 ${result.updated} 个 App`);
      }
      await loadData();
    } catch (error: any) {
      toast.error('同步失败：' + error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // 同步并检查（合并操作）
  const handleSyncAndCheck = async () => {
    setIsSyncingAndChecking(true);
    try {
      // 步骤1：从明道云同步
      toast.info('正在从明道云同步 App 列表...');
      const result = await agentClient.syncMonitoredApps();
      setIncompleteAccounts(result.incompleteActiveAccounts || []);
      
      if (result.incompleteActiveAccounts && result.incompleteActiveAccounts.length > 0) {
        toast.warning(`同步完成：${result.updated} 个 App，但有 ${result.incompleteActiveAccounts.length} 个账号信息不完整`);
      } else {
        toast.success(`同步完成：更新了 ${result.updated} 个 App`);
      }
      
      // 刷新数据
      await loadData();
      
      // 步骤2：检查所有 App 状态
      toast.info('正在检查所有 App 的在架状态...');
      await agentClient.checkAllApps();
      toast.success('检查已开始，请稍后查看结果');
      
      // 延迟 5 秒后再次刷新数据
      setTimeout(() => {
        loadData();
      }, 5000);
    } catch (error: any) {
      toast.error('操作失败：' + error.message);
    } finally {
      setIsSyncingAndChecking(false);
    }
  };

  // 检查所有 App
  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    try {
      await agentClient.checkAllApps();
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

  // 检查单个 App
  const handleCheckSingle = async (bundleId: string) => {
    setCheckingApps(prev => new Set([...prev, bundleId]));
    try {
      const result = await agentClient.checkApp(bundleId);
      toast.success(`检查完成：${result.status}`);
      await loadData();
    } catch (error: any) {
      toast.error('检查失败：' + error.message);
    } finally {
      setCheckingApps(prev => {
        const next = new Set(prev);
        next.delete(bundleId);
        return next;
      });
    }
  };

  // 检查账号下所有 App
  const handleCheckAccount = async (accountId: string | null, apps: AppMonitorRecord[]) => {
    const accountName = accountId 
      ? accountGroups.find(g => g.accountId === accountId)?.accountName 
      : '未关联账号';
    
    toast.info(`开始检查 ${accountName} 下的 ${apps.length} 个 App...`);
    
    let successCount = 0;
    let errorCount = 0;

    for (const app of apps) {
      setCheckingApps(prev => new Set([...prev, app.bundle_id]));
      try {
        await agentClient.checkApp(app.bundle_id);
        successCount++;
      } catch (error) {
        errorCount++;
      } finally {
        setCheckingApps(prev => {
          const next = new Set(prev);
          next.delete(app.bundle_id);
          return next;
        });
      }
      // 延迟避免过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (errorCount === 0) {
      toast.success(`${accountName}: 检查完成，${successCount} 个成功`);
    } else {
      toast.warning(`${accountName}: 检查完成，${successCount} 个成功，${errorCount} 个失败`);
    }
    
    await loadData();
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

  // 导出信息不完整的账号为文本文档
  const handleDownloadIncompleteAccounts = () => {
    if (incompleteAccounts.length === 0) return;

    const now = new Date().toLocaleString('zh-CN');
    let content = `活跃账号信息不完整列表\n`;
    content += `${'='.repeat(50)}\n\n`;
    content += `导出时间: ${now}\n`;
    content += `总计: ${incompleteAccounts.length} 个账号需要修复\n\n`;
    content += `${'='.repeat(50)}\n\n`;
    content += `说明：\n`;
    content += `以下账号处于活跃状态（正式包上架中、账号使用中等），但配置信息不完整，\n`;
    content += `无法用于 App Store Connect API 调用。请尽快到明道云补充以下信息。\n\n`;
    content += `${'='.repeat(50)}\n\n`;

    incompleteAccounts.forEach((account, index) => {
      content += `${index + 1}. ${account.accountName}\n`;
      content += `   账号状态: ${account.status}\n`;
      content += `   缺失字段: ${account.missingFields.join(', ')}\n`;
      content += `   明道云 RowID: ${account.hapAccountId}\n`;
      content += `\n`;
    });

    content += `${'='.repeat(50)}\n\n`;
    content += `需要补充的字段说明：\n\n`;
    content += `  - Apple ID: 开发者账号邮箱（Apple Developer 登录邮箱）\n`;
    content += `  - Team ID: 开发者团队 ID（Apple Developer Account - Membership）\n`;
    content += `  - API Key ID: App Store Connect API 密钥 ID（App Store Connect - Users and Access - Keys）\n`;
    content += `  - Issuer ID: API 密钥颁发者 ID（App Store Connect - Users and Access - Keys）\n`;
    content += `  - API Key Content: API 密钥文件内容（下载的 .p8 文件内容）\n`;

    // 创建下载链接
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `活跃账号信息不完整_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('文档已下载');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">下架监控</h1>
          <p className="text-sm text-gray-500 mt-1">监控 App 是否被 Apple Store 下架</p>
        </div>
        
        {/* 视图切换 */}
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="gap-2"
          >
            <LayoutList className="w-4 h-4" />
            列表视图
          </Button>
          <Button
            variant={viewMode === 'account' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('account')}
            className="gap-2"
          >
            <Users className="w-4 h-4" />
            账号视图
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">总监控数</p>
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
              <p className="text-sm text-gray-500">在售</p>
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
              <p className="text-2xl font-bold mt-1 text-red-600">{stats.removed}</p>
            </div>
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">未知</p>
              <p className="text-2xl font-bold mt-1 text-gray-600">{stats.unknown}</p>
            </div>
            <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center">
              <HelpCircle className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* 信息不完整的活跃账号警告 */}
      {incompleteAccounts.length > 0 && (
        <Card className="p-4 border-orange-200 bg-orange-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-orange-900">
                  发现 {incompleteAccounts.length} 个活跃账号信息不完整
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadIncompleteAccounts}
                  className="gap-1 h-7 text-xs bg-white hover:bg-orange-50 border-orange-300"
                >
                  <Download className="w-3 h-3" />
                  导出文档
                </Button>
              </div>
              <p className="text-sm text-orange-700 mb-3">
                以下账号正在使用中但配置不完整，请到明道云补充完整信息（Team ID、API Key 等）：
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {incompleteAccounts.map((account, index) => (
                  <div
                    key={account.hapAccountId}
                    className="bg-white rounded-md p-3 border border-orange-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {index + 1}. {account.accountName}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          状态: <span className="font-medium">{account.status}</span>
                        </div>
                        <div className="text-xs text-red-600 mt-1">
                          缺失字段: {account.missingFields.join(', ')}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 font-mono">
                          RowID: {account.hapAccountId}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => setIncompleteAccounts([])}
                  className="text-sm text-orange-700 hover:text-orange-900 underline"
                >
                  关闭提醒
                </button>
                <span className="text-xs text-orange-600">
                  💡 提示：点击右上角"导出文档"可下载完整列表
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 操作工具栏 */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 flex gap-2">
            <Button
              onClick={handleSyncAndCheck}
              disabled={isSyncingAndChecking}
              className="gap-2"
            >
              {isSyncingAndChecking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              同步并检查
            </Button>

            <Button
              onClick={handleSync}
              disabled={isSyncing || isSyncingAndChecking}
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
              disabled={isCheckingAll || isSyncingAndChecking}
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

          <div className="flex gap-2 items-center">
            {/* 搜索框 */}
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="搜索名称/Bundle ID/账号"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* 状态筛选 */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 px-3 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部状态</option>
              <option value={AppStatus.AVAILABLE}>在售</option>
              <option value={AppStatus.REMOVED}>下架</option>
              <option value={AppStatus.UNKNOWN}>未知</option>
            </select>
          </div>
        </div>
      </Card>

      {/* 内容区域 - 根据视图模式显示不同内容 */}
      {viewMode === 'list' ? (
        /* 列表视图 */
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    App 名称
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bundle ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    账号
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    最后检查
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    下架时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredApps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      {searchTerm || statusFilter !== 'all' 
                        ? '没有符合条件的 App' 
                        : '暂无监控的 App，请先从明道云同步'}
                    </td>
                  </tr>
                ) : (
                  filteredApps.map((app) => {
                    const statusConfig = APP_STATUS_CONFIG[app.current_status];
                    const isChecking = checkingApps.has(app.bundle_id);

                    return (
                      <tr key={app.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge
                            className={cn(
                              'gap-1',
                              app.current_status === AppStatus.AVAILABLE && 'bg-green-100 text-green-800',
                              app.current_status === AppStatus.REMOVED && 'bg-red-100 text-red-800',
                              app.current_status === AppStatus.UNKNOWN && 'bg-gray-100 text-gray-800'
                            )}
                          >
                            <span>{statusConfig.icon}</span>
                            <span>{statusConfig.label}</span>
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{app.app_name}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div 
                            className="text-sm text-gray-900 font-mono" 
                            style={{ fontFamily: 'Monaco, Consolas, "Courier New", monospace' }}
                          >
                            {app.bundle_id}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-600">
                            {app.apple_account_name || <span className="text-gray-400">-</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{formatTime(app.last_checked_at)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {app.removed_at ? (
                            <div className="text-sm text-red-600">
                              {new Date(app.removed_at).toLocaleDateString('zh-CN')}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-400">-</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCheckSingle(app.bundle_id)}
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
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* 账号视图 - 暂未实现 */
        <Card className="p-8">
          <div className="text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">账号视图功能开发中</p>
            <p className="text-sm">暂时请使用列表视图</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setViewMode('list')}
            >
              切换到列表视图
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

