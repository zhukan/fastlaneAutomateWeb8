'use client';

import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Search, ExternalLink, GitCompare, ChevronDown, ChevronUp, Package, Link2, Target, Users } from 'lucide-react';
import { agentClient } from '@/lib/agent-client';
import { AppComparisonRecord, AppComparisonStats, AppStatus, APP_STATUS_CONFIG } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppMonitorAccountView } from '@/components/app-monitor-account-view';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

type LinkFilter = 'all' | 'linked' | 'unlinked';
type SortField = 'todayNew' | 'yesterdayNew' | null;
type SortOrder = 'asc' | 'desc';

export default function AppComparisonPage() {
  // 状态管理
  const [records, setRecords] = useState<AppComparisonRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<AppComparisonRecord[]>([]);
  const [stats, setStats] = useState<AppComparisonStats>({
    myAppTotal: 0,
    myAppAvailable: 0,
    myAppRemoved: 0,
    linkedCount: 0,
    targetAppAvailable: 0,
    targetAppRemoved: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingMyApps, setIsSyncingMyApps] = useState(false);
  const [isSyncingRelations, setIsSyncingRelations] = useState(false);
  const [isSyncingTargetApps, setIsSyncingTargetApps] = useState(false);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [refreshingRows, setRefreshingRows] = useState<Set<string>>(new Set());
  const [syncingRows, setSyncingRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');
  const [sortField, setSortField] = useState<SortField>('todayNew');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;
  
  // 同步状态（5.1 版本：始终显示，不可折叠）
  const [syncStatus, setSyncStatus] = useState<{
    myApps: {
      lastSyncTime: string | null;
      syncHostname: string | null;
      lastCheckTime: string | null;
      checkHostname: string | null;
    };
    targetApps: {
      lastSyncTime: string | null;
      syncHostname: string | null;
      lastCheckTime: string | null;
      checkHostname: string | null;
    };
  } | null>(null);

  // 加载数据
  const loadData = async () => {
    try {
      const [recordsData, statsData, syncStatusData] = await Promise.all([
        agentClient.getComparisonList(),
        agentClient.getComparisonStats(),
        agentClient.getComparisonSyncStatus(),  // 5.1 版本：加载同步状态
      ]);
      console.log('[AppComparison] 📊 加载数据:', {
        总记录数: recordsData.length,
        已关联: recordsData.filter(r => r.targetApp !== null).length,
        未关联: recordsData.filter(r => r.targetApp === null).length,
        统计: statsData,
        同步状态: syncStatusData,
      });
      setRecords(recordsData);
      setStats(statsData);
      setSyncStatus(syncStatusData);  // 5.1 版本：设置同步状态
    } catch (error: any) {
      console.error('[AppComparison] ❌ 加载失败:', error);
      toast.error('加载数据失败：' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadData();
  }, []);

  // 筛选逻辑
  useEffect(() => {
    let filtered = records;

    // 状态筛选
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.myApp.status === statusFilter);
    }

    // 关联筛选
    if (linkFilter === 'linked') {
      filtered = filtered.filter(r => r.targetApp !== null);
    } else if (linkFilter === 'unlinked') {
      filtered = filtered.filter(r => r.targetApp === null);
    }

    // 搜索
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        r =>
          r.myApp.appName.toLowerCase().includes(term) ||
          r.myApp.bundleId.toLowerCase().includes(term) ||
          r.myApp.accountName.toLowerCase().includes(term) ||
          (r.targetApp && r.targetApp.appName.toLowerCase().includes(term)) ||
          (r.targetApp && r.targetApp.note.toLowerCase().includes(term))
      );
    }

    // 排序
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortField] ?? -1; // null 值排在最后
        const bVal = b[sortField] ?? -1;
        
        if (sortOrder === 'desc') {
          return bVal - aVal;
        } else {
          return aVal - bVal;
        }
      });
    }

    setFilteredRecords(filtered);
    setCurrentPage(1); // 重置到第一页
  }, [records, statusFilter, linkFilter, searchTerm, sortField, sortOrder]);

  // 分页
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredRecords.length);
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  // 同步我的包
  const handleSyncMyApps = async () => {
    setIsSyncingMyApps(true);
    try {
      const result = await agentClient.syncMonitoredApps();
      console.log('[AppComparison] 📦 已同步我的包:', result.synced);
      toast.success(`同步成功！我的包: ${result.synced} 个`);
      await loadData();  // 重新加载数据（包括同步状态）
    } catch (error: any) {
      console.error('[AppComparison] ❌ 同步我的包失败:', error);
      toast.error('同步我的包失败：' + error.message);
    } finally {
      setIsSyncingMyApps(false);
    }
  };

  // 同步关联关系
  const handleSyncRelations = async () => {
    setIsSyncingRelations(true);
    try {
      const result = await agentClient.syncAppRelations();
      console.log('[AppComparison] 🔗 已同步关联关系:', result.synced);
      toast.success(`同步成功！关联: ${result.synced} 条`);
      await loadData();  // 重新加载数据（包括同步状态）
    } catch (error: any) {
      console.error('[AppComparison] ❌ 同步关联失败:', error);
      toast.error('同步关联失败：' + error.message);
    } finally {
      setIsSyncingRelations(false);
    }
  };

  // 同步目标包
  const handleSyncTargetApps = async () => {
    setIsSyncingTargetApps(true);
    try {
      const result = await agentClient.syncTargetApps();
      console.log('[AppComparison] 🎯 已同步目标包:', result.synced);
      toast.success(`同步成功！目标包: ${result.synced} 个`);
      await loadData();  // 重新加载数据（包括同步状态）
    } catch (error: any) {
      console.error('[AppComparison] ❌ 同步目标包失败:', error);
      toast.error('同步目标包失败：' + error.message);
    } finally {
      setIsSyncingTargetApps(false);
    }
  };

  // 一键同步全部
  const handleSyncAll = async () => {
    await handleSyncMyApps();
    await handleSyncRelations();
    await handleSyncTargetApps();
  };

  // 批量检查
  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    try {
      await agentClient.checkAllComparison();
      toast.success('批量检查已开始，请稍后刷新查看结果');
      // 10秒后自动刷新
      setTimeout(loadData, 10000);
    } catch (error: any) {
      toast.error('批量检查失败：' + error.message);
    } finally {
      setIsCheckingAll(false);
    }
  };

  // 刷新单行
  const handleRefresh = async (bundleId: string) => {
    setRefreshingRows(prev => new Set(prev).add(bundleId));
    try {
      await agentClient.refreshComparisonRow(bundleId);
      toast.success('刷新成功');
      await loadData();
    } catch (error: any) {
      toast.error('刷新失败：' + error.message);
    } finally {
      setRefreshingRows(prev => {
        const next = new Set(prev);
        next.delete(bundleId);
        return next;
      });
    }
  };

  // 单独同步某条记录
  const handleSyncSingle = async (bundleId: string) => {
    setSyncingRows(prev => new Set(prev).add(bundleId));
    try {
      await agentClient.syncSingleApp(bundleId);
      toast.success('同步成功');
      await loadData();
    } catch (error: any) {
      toast.error('同步失败：' + error.message);
    } finally {
      setSyncingRows(prev => {
        const next = new Set(prev);
        next.delete(bundleId);
        return next;
      });
    }
  };

  // 排序处理
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // 切换排序顺序
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      // 新字段，默认降序
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // 获取排序图标
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕️';
    return sortOrder === 'desc' ? '↓' : '↑';
  };

  // 格式化时间
  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { 
        addSuffix: true,
        locale: zhCN 
      });
    } catch {
      return dateString;
    }
  };

  // 格式化下架时间（北京时间，精确到分钟）
  const formatOfflineDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      // 转换为北京时间（UTC+8）
      const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      
      const year = beijingDate.getUTCFullYear();
      const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(beijingDate.getUTCDate()).padStart(2, '0');
      const hour = String(beijingDate.getUTCHours()).padStart(2, '0');
      const minute = String(beijingDate.getUTCMinutes()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hour}:${minute}`;
    } catch {
      return dateString;
    }
  };

  // 获取状态徽章样式
  const getStatusBadge = (status: AppStatus) => {
    const config = APP_STATUS_CONFIG[status];
    return (
      <Badge
        variant={
          status === AppStatus.AVAILABLE
            ? 'default'
            : status === AppStatus.REMOVED
            ? 'destructive'
            : 'secondary'
        }
      >
        {config.icon} {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <GitCompare className="h-8 w-8" />
            下架监控 - 我的包 vs 目标包对比
          </h1>
          <p className="text-muted-foreground mt-1">
            实时对比自己的包与竞品目标包的状态
          </p>
        </div>
      </div>

      {/* 标签页切换 */}
      <Tabs defaultValue="package" className="w-full">
        <TabsList>
          <TabsTrigger value="package" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            包视图
          </TabsTrigger>
          <TabsTrigger value="account" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            账号视图
          </TabsTrigger>
        </TabsList>

        {/* 包视图 */}
        <TabsContent value="package" className="space-y-6">

      {/* 统计面板 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">我的包总数</div>
          <div className="text-2xl font-bold mt-1">{stats.myAppTotal}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">我的包在架</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{stats.myAppAvailable}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">我的包下架</div>
          <div className="text-2xl font-bold mt-1 text-red-600">{stats.myAppRemoved}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">已关联数</div>
          <div className="text-2xl font-bold mt-1">{stats.linkedCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">目标包在架</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{stats.targetAppAvailable}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">目标包下架</div>
          <div className="text-2xl font-bold mt-1 text-red-600">{stats.targetAppRemoved}</div>
        </Card>
      </div>

      {/* 操作工具栏 */}
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          {/* 第一行：快速同步按钮 */}
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={handleSyncMyApps} 
              disabled={isSyncingMyApps} 
              size="sm"
              variant="outline"
            >
              <Package className={cn('h-4 w-4 mr-2', isSyncingMyApps && 'animate-spin')} />
              同步我的包
            </Button>
            <Button 
              onClick={handleSyncRelations} 
              disabled={isSyncingRelations} 
              size="sm"
              variant="outline"
            >
              <Link2 className={cn('h-4 w-4 mr-2', isSyncingRelations && 'animate-spin')} />
              同步关联
            </Button>
            <Button 
              onClick={handleSyncTargetApps} 
              disabled={isSyncingTargetApps} 
              size="sm"
              variant="outline"
            >
              <Target className={cn('h-4 w-4 mr-2', isSyncingTargetApps && 'animate-spin')} />
              同步目标包
            </Button>
            <div className="border-l border-gray-300 mx-2" />
            <Button 
              onClick={handleSyncAll} 
              disabled={isSyncingMyApps || isSyncingRelations || isSyncingTargetApps} 
              size="sm"
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', (isSyncingMyApps || isSyncingRelations || isSyncingTargetApps) && 'animate-spin')} />
              同步全部
            </Button>
            <Button onClick={handleCheckAll} disabled={isCheckingAll} size="sm" variant="outline">
              <RefreshCw className={cn('h-4 w-4 mr-2', isCheckingAll && 'animate-spin')} />
              批量检查
            </Button>
          </div>

          {/* 同步状态卡片（5.1 版本：始终显示） */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 我的包同步状态 */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Package className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold">我的包同步状态</h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">同步:</span>
                    <span className="font-mono">
                      {syncStatus?.myApps.lastSyncTime 
                        ? formatDistanceToNow(new Date(syncStatus.myApps.lastSyncTime), { addSuffix: true, locale: zhCN })
                        : '未同步'}
                      {syncStatus?.myApps.syncHostname && (
                        <span className="ml-1 text-muted-foreground">({syncStatus.myApps.syncHostname})</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">检测:</span>
                    <span className="font-mono">
                      {syncStatus?.myApps.lastCheckTime 
                        ? formatDistanceToNow(new Date(syncStatus.myApps.lastCheckTime), { addSuffix: true, locale: zhCN })
                        : '未检测'}
                      {syncStatus?.myApps.checkHostname && (
                        <span className="ml-1 text-muted-foreground">({syncStatus.myApps.checkHostname})</span>
                      )}
                    </span>
                  </div>
                </div>
              </Card>

              {/* 目标包同步状态 */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="h-4 w-4 text-purple-600" />
                  <h3 className="text-sm font-semibold">目标包同步状态</h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">同步:</span>
                    <span className="font-mono">
                      {syncStatus?.targetApps.lastSyncTime 
                        ? formatDistanceToNow(new Date(syncStatus.targetApps.lastSyncTime), { addSuffix: true, locale: zhCN })
                        : '未同步'}
                      {syncStatus?.targetApps.syncHostname && (
                        <span className="ml-1 text-muted-foreground">({syncStatus.targetApps.syncHostname})</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">检测:</span>
                    <span className="font-mono">
                      {syncStatus?.targetApps.lastCheckTime 
                        ? formatDistanceToNow(new Date(syncStatus.targetApps.lastCheckTime), { addSuffix: true, locale: zhCN })
                        : '未检测'}
                      {syncStatus?.targetApps.checkHostname && (
                        <span className="ml-1 text-muted-foreground">({syncStatus.targetApps.checkHostname})</span>
                      )}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* 第二行：搜索和筛选 */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索我的包或目标包..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value={AppStatus.AVAILABLE}>在架</SelectItem>
                <SelectItem value={AppStatus.REMOVED}>下架</SelectItem>
                <SelectItem value={AppStatus.UNKNOWN}>未知</SelectItem>
              </SelectContent>
            </Select>
            <Select value={linkFilter} onValueChange={(v) => setLinkFilter(v as LinkFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="显示" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="linked">仅已关联</SelectItem>
                <SelectItem value="unlinked">仅未关联</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* 对比列表 */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>我的包</TableHead>
              <TableHead>友盟应用名称</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort('todayNew')}
                title="点击排序"
              >
                <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                  今日新增 {getSortIcon('todayNew')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort('yesterdayNew')}
                title="点击排序"
              >
                <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                  昨日新增 {getSortIcon('yesterdayNew')}
                </div>
              </TableHead>
              <TableHead className="text-center">包状态</TableHead>
              <TableHead className="text-center">目标包状态</TableHead>
              <TableHead>目标包</TableHead>
              <TableHead className="text-center">备注</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              paginatedRecords.map((record) => (
                <TableRow key={record.myApp.bundleId}>
                  {/* 我的包 */}
                  <TableCell>
                    <div className="space-y-1">
                      {record.qimaiUrl ? (
                        <a
                          href={record.qimaiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer inline-flex items-center gap-1"
                        >
                          {record.myApp.appName}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <div className="font-medium">{record.myApp.appName}</div>
                      )}
                      <div className="text-sm text-muted-foreground">{record.myApp.bundleId}</div>
                      <div className="text-xs text-muted-foreground">
                        账号: {record.myApp.accountName}
                      </div>
                    </div>
                  </TableCell>

                  {/* 友盟应用名称 */}
                  <TableCell>
                    <div className="space-y-1">
                      {record.umengDataUrl && record.umengAppName ? (
                        <a
                          href={record.umengDataUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-purple-600 hover:text-purple-800 hover:underline cursor-pointer inline-flex items-center gap-1"
                        >
                          {record.umengAppName}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          {record.umengAppName || '-'}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* 今日新增 */}
                  <TableCell className="text-center">
                    <div className="font-medium">
                      {record.todayNew !== null ? `+${record.todayNew}` : '-'}
                    </div>
                  </TableCell>

                  {/* 昨日新增 */}
                  <TableCell className="text-center">
                    <div className="font-medium">
                      {record.yesterdayNew !== null ? `+${record.yesterdayNew}` : '-'}
                    </div>
                  </TableCell>

                  {/* 包状态 */}
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex flex-wrap justify-center gap-1">
                        {getStatusBadge(record.myApp.status)}
                        {record.myApp.isClearKeyword && (
                          <Badge className="bg-orange-100 text-orange-800 border-orange-300">
                            🔤 清词
                          </Badge>
                        )}
                        {record.myApp.isClearRank && (
                          <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                            📊 清榜
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(record.myApp.lastChecked)}
                      </div>
                    </div>
                  </TableCell>

                  {/* 目标包状态 */}
                  <TableCell className="text-center">
                    {record.targetApp && (
                      <div className="flex flex-col items-center gap-1">
                        <Badge
                          className={cn(
                            record.targetApp.status.includes('下架') 
                              ? 'bg-red-600 text-white hover:bg-red-700' 
                              : 'bg-green-600 text-white hover:bg-green-700'
                          )}
                        >
                          {record.targetApp.status}
                        </Badge>
                        {record.targetApp.offlineDate && (
                          <div className="text-xs text-muted-foreground">
                            {formatOfflineDate(record.targetApp.offlineDate)}
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>

                  {/* 目标包 */}
                  <TableCell>
                    {record.targetApp ? (
                      <div className="space-y-1">
                        {record.targetApp.qimaiLink ? (
                          <a
                            href={record.targetApp.qimaiLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer inline-flex items-center gap-1"
                          >
                            {record.targetApp.appName}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <div className="font-medium">{record.targetApp.appName}</div>
                        )}
                        <div className="text-sm text-muted-foreground">
                          ID: {record.targetApp.appId}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">[未关联]</span>
                    )}
                  </TableCell>

                  {/* 备注 */}
                  <TableCell className="text-center">
                    {record.targetApp?.note || '-'}
                  </TableCell>

                  {/* 操作 */}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {record.keywordSearchUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(record.keywordSearchUrl, '_blank')}
                          title="明道云关键词查询"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          关键词
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSyncSingle(record.myApp.bundleId)}
                        disabled={syncingRows.has(record.myApp.bundleId)}
                        title="从明道云同步这条记录的关联关系"
                      >
                        <RefreshCw
                          className={cn(
                            'h-3 w-3 mr-1',
                            syncingRows.has(record.myApp.bundleId) && 'animate-spin'
                          )}
                        />
                        同步
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRefresh(record.myApp.bundleId)}
                        disabled={refreshingRows.has(record.myApp.bundleId)}
                        title="刷新我的包状态"
                      >
                        <RefreshCw
                          className={cn(
                            'h-3 w-3 mr-1',
                            refreshingRows.has(record.myApp.bundleId) && 'animate-spin'
                          )}
                        />
                        刷新
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* 分页 */}
      {filteredRecords.length > 0 && (
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            显示 {startIndex + 1}-{endIndex} / 共 {filteredRecords.length} 个
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              上一页
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm">
                第 {currentPage} / {totalPages} 页
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
        </TabsContent>

        {/* 账号视图 */}
        <TabsContent value="account">
          <AppMonitorAccountView
            records={records}
            isLoading={isLoading}
            onRefresh={loadData}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

