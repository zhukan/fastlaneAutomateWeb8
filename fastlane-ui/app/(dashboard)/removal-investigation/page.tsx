'use client';

import { useState, useEffect } from 'react';
import { Loader2, FileSearch } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { agentClient } from '@/lib/agent-client';
import { RemovedAppList } from '@/components/removed-app-list';
import { AccountGroupList } from '@/components/account-group-list';
import { AppTimelineViewer } from '@/components/app-timeline-viewer';
import { AccountDetailViewer } from '@/components/account-detail-viewer';
import { SyncDataButton } from '@/components/sync-data-button';
import { RemovedAppFilter, FilterOptions } from '@/components/removed-app-filter';
import * as XLSX from 'xlsx';

// 类型定义
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
}

interface AccountGroup {
  accountEmail: string;
  accountInfo: any;
  totalApps: number;
  removedApps: number;
  activeApps: number;
  latestRemovalTime: string | null;
  accountSurvivalDays: number | null;
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
  status: string | null;
  releaseType: string | null;
  remarks: string | null;
  hapSourceTable: 'production_release' | 'update_task';
}

export default function RemovalInvestigationPage() {
  // 视图切换
  const [viewMode, setViewMode] = useState<'app' | 'account'>('app');
  
  // App视图状态
  const [apps, setApps] = useState<RemovedApp[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<RemovedApp | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 账号视图状态
  const [accounts, setAccounts] = useState<AccountGroup[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsPage, setAccountsPage] = useState(1);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountGroup | null>(null);
  const [accountSearchTerm, setAccountSearchTerm] = useState('');
  
  // 账号详情数据
  const [accountApps, setAccountApps] = useState<any[]>([]);
  const [accountOperations, setAccountOperations] = useState<any[]>([]);
  const [isLoadingAccountDetail, setIsLoadingAccountDetail] = useState(false);
  
  // 详情视图状态
  const [timeline, setTimeline] = useState<OperationRecord[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  
  // 筛选器状态
  const [filters, setFilters] = useState<FilterOptions>({
    accountSources: [],
    accountRegions: [],
    accountSurvivalDays: null,
    pendingCloseDateRange: null,
    removalTimeRange: null,
    appSurvivalDays: null,
    adVersions: [],
    operators: [],
    locations: [],
  });
  
  // 可用的筛选选项（从后端获取）
  const [availableFilters, setAvailableFilters] = useState<{
    accountSources: string[];
    regions: string[];
    adVersions: string[];
    operators: string[];
    locations: string[];
  }>({
    accountSources: [],
    regions: [],
    adVersions: [],
    operators: [],
    locations: [],
  });

  // 加载下架App列表
  const loadApps = async (page: number = currentPage, search?: string, filterOptions?: FilterOptions) => {
    try {
      setIsLoading(true);
      const result = await agentClient.getRemovalInvestigationApps(
        page,
        pageSize,
        search,
        filterOptions || filters
      );
      setApps(result.apps || []);
      setTotal(result.total || 0);
      setCurrentPage(page);
      
      // 更新可用的筛选选项
      if (result.availableFilters) {
        setAvailableFilters(result.availableFilters);
      }
    } catch (error: any) {
      console.error('[RemovalInvestigation] 加载失败:', error);
      toast.error('加载下架App列表失败：' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 加载账号分组列表
  const loadAccounts = async (page: number = accountsPage, search?: string, filterOptions?: FilterOptions) => {
    try {
      setIsLoadingAccounts(true);
      const result = await agentClient.getAccountGroupList(
        page,
        pageSize,
        search,
        filterOptions || filters
      );
      setAccounts(result.accounts || []);
      setAccountsTotal(result.total || 0);
      setAccountsPage(page);
    } catch (error: any) {
      console.error('[RemovalInvestigation] 加载账号列表失败:', error);
      toast.error('加载账号列表失败：' + error.message);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  // 加载App的操作时间线
  const loadTimeline = async (bundleId: string) => {
    try {
      setIsLoadingTimeline(true);
      const data = await agentClient.getRemovalInvestigationTimeline(bundleId);
      setTimeline(data || []);
    } catch (error: any) {
      console.error('[RemovalInvestigation] 加载时间线失败:', error);
      toast.error('加载操作记录失败：' + error.message);
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  // 处理App选择
  const handleAppSelect = (app: RemovedApp) => {
    setSelectedApp(app);
    loadTimeline(app.bundleId);
  };

  // 处理账号选择
  const handleAccountSelect = async (account: AccountGroup) => {
    setSelectedAccount(account);
    setSelectedApp(null); // 清空App选择
    
    // 加载账号详情
    try {
      setIsLoadingAccountDetail(true);
      const detail = await agentClient.getAccountDetail(account.accountEmail);
      setAccountApps(detail.apps || []);
      setAccountOperations(detail.operations || []);
    } catch (error: any) {
      console.error('[RemovalInvestigation] 加载账号详情失败:', error);
      toast.error('加载账号详情失败：' + error.message);
    } finally {
      setIsLoadingAccountDetail(false);
    }
  };

  // 处理从账号视图切换到App视图
  const handleSwitchToApp = async (bundleId: string) => {
    // 切换到App视图
    setViewMode('app');
    
    // 在当前apps列表中查找
    let app = apps.find(a => a.bundleId === bundleId);
    
    // 如果当前列表中没有，尝试重新加载
    if (!app) {
      try {
        const result = await agentClient.getRemovalInvestigationApps(1, pageSize, bundleId, filters);
        if (result.apps && result.apps.length > 0) {
          app = result.apps[0];
          // 更新列表
          setApps(result.apps);
          setTotal(result.total);
        }
      } catch (error: any) {
        toast.error('未找到该App');
        return;
      }
    }
    
    if (app) {
      handleAppSelect(app);
    }
  };

  // 处理视图切换
  const handleViewModeChange = (mode: string) => {
    setViewMode(mode as 'app' | 'account');
    
    // 切换视图时重置选择
    if (mode === 'app') {
      setSelectedAccount(null);
      if (apps.length === 0) {
        loadApps(1, searchTerm, filters);
      }
    } else {
      setSelectedApp(null);
      setTimeline([]);
      if (accounts.length === 0) {
        loadAccounts(1, accountSearchTerm, filters);
      }
    }
  };

  // 处理搜索
  const handleSearch = (search: string) => {
    setSearchTerm(search);
    loadApps(1, search, filters);
  };

  // 处理筛选变化
  const handleFiltersChange = (newFilters: FilterOptions) => {
    setFilters(newFilters);
    // 根据当前视图模式，重新加载对应的列表
    if (viewMode === 'app') {
      loadApps(1, searchTerm, newFilters);
    } else {
      loadAccounts(1, accountSearchTerm, newFilters);
    }
  };

  // 同步完成后刷新列表
  const handleSyncComplete = () => {
    // 根据当前视图模式刷新对应的列表
    if (viewMode === 'app') {
      loadApps(1, searchTerm, filters);
      if (selectedApp) {
        loadTimeline(selectedApp.bundleId);
      }
    } else {
      loadAccounts(1, accountSearchTerm, filters);
      if (selectedAccount) {
        handleAccountSelect(selectedAccount);
      }
    }
  };

  // 处理导出
  const handleExport = async (exportFilters: FilterOptions, search?: string) => {
    try {
      console.log('[RemovalInvestigation] 开始导出Excel...');
      toast.info('正在准备导出数据...');
      
      // 调用后端API获取数据
      const data = await agentClient.exportRemovalInvestigationData({
        search,
        filters: exportFilters,
      });

      if (!data || data.length === 0) {
        toast.warning('没有数据可以导出');
        return;
      }

      console.log(`[RemovalInvestigation] 获取到 ${data.length} 条数据`);

      // 定义Excel列（中文表头）
      const columns = [
        { key: 'bundleId', header: 'Bundle ID' },
        { key: 'appName', header: 'App名称' },
        { key: 'appId', header: 'App ID' },
        { key: 'removalTime', header: '下架时间' },
        { key: 'survivalDays', header: '存活天数' },
        { key: 'firstReleaseTime', header: '首次发布时间' },
        { key: 'lastUpdateTime', header: '最后更新时间' },
        { key: 'totalOperations', header: '操作记录数' },
        
        // 账号信息
        { key: 'accountEmail', header: '开发者账号' },
        { key: 'accountStatus', header: '账号状态' },
        { key: 'accountSource', header: '账号来源' },
        { key: 'accountRegion', header: '账号区域' },
        { key: 'accountExpiryDate', header: '账号到期时间' },
        { key: 'accountClosedDate', header: '账号关停时间' },
        { key: 'pendingCloseDate', header: '标记关停时间' },
        { key: 'accountQuality', header: '账号质量标记' },
        { key: 'accountProductCount', header: '账号产品数' },
        
        // 操作记录汇总
        { key: 'adVersions', header: '广告代码版本' },
        { key: 'operators', header: '操作人' },
        { key: 'locations', header: '发布地点' },
        
        // 链接信息
        { key: 'keywordSearchUrl', header: '关键词查询链接' },
        { key: 'targetPackageUrl', header: '目标包链接' },
        { key: 'qimaiUrl', header: '七麦链接' },
        
        // 下架原因分析
        { key: 'analysisContent', header: '下架原因分析' },
      ];

      // 转换数据为Excel格式
      const excelData = data.map((item: any) => {
        const row: any = {};
        columns.forEach(col => {
          row[col.header] = item[col.key] || '';
        });
        return row;
      });

      // 创建工作簿
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // 设置列宽
      const colWidths = [
        { wch: 30 }, // Bundle ID
        { wch: 25 }, // App名称
        { wch: 15 }, // App ID
        { wch: 20 }, // 下架时间
        { wch: 12 }, // 存活天数
        { wch: 20 }, // 首次发布时间
        { wch: 20 }, // 最后更新时间
        { wch: 12 }, // 操作记录数
        { wch: 30 }, // 开发者账号
        { wch: 15 }, // 账号状态
        { wch: 20 }, // 账号来源
        { wch: 15 }, // 账号区域
        { wch: 20 }, // 账号到期时间
        { wch: 20 }, // 账号关停时间
        { wch: 20 }, // 标记关停时间
        { wch: 30 }, // 账号质量标记
        { wch: 12 }, // 账号产品数
        { wch: 30 }, // 广告代码版本
        { wch: 30 }, // 操作人
        { wch: 20 }, // 发布地点
        { wch: 40 }, // 关键词查询链接
        { wch: 40 }, // 目标包链接
        { wch: 40 }, // 七麦链接
        { wch: 50 }, // 下架原因分析
      ];
      ws['!cols'] = colWidths;

      // 添加工作表
      XLSX.utils.book_append_sheet(wb, ws, '下架App数据');

      // 生成文件名（包含时间戳）
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `下架排查数据_${timestamp}.xlsx`;

      // 下载文件
      XLSX.writeFile(wb, filename);

      console.log('[RemovalInvestigation] ✅ Excel导出成功');
      toast.success(`成功导出 ${data.length} 条记录`);
    } catch (error: any) {
      console.error('[RemovalInvestigation] ❌ 导出失败:', error);
      toast.error('导出失败：' + error.message);
    }
  };

  // 初始加载
  useEffect(() => {
    loadApps(1);
  }, []);

  if (isLoading && apps.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">正在加载数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col p-3 space-y-2">
      {/* 头部 */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileSearch className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">下架排查</h1>
            <p className="text-xs text-gray-500">分析已下架App的完整操作记录</p>
          </div>
        </div>
        
        <SyncDataButton onSyncComplete={handleSyncComplete} />
      </div>

      {/* 筛选器 */}
      <div className="flex-shrink-0">
        <RemovedAppFilter
          totalCount={total}
          filteredCount={apps.length}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onExport={handleExport}
          searchTerm={searchTerm}
          availableAccountSources={availableFilters.accountSources}
          availableRegions={availableFilters.regions}
          availableAdVersions={availableFilters.adVersions}
          availableOperators={availableFilters.operators}
          availableLocations={availableFilters.locations}
        />
      </div>

      {/* 主要内容区域：左右分栏 */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        {/* 左侧：列表视图（App视图/账号视图） */}
        <div className="col-span-12 lg:col-span-4">
          <Tabs value={viewMode} onValueChange={handleViewModeChange}>
            <TabsList className="mb-3 w-full grid grid-cols-2">
              <TabsTrigger value="app">App视图</TabsTrigger>
              <TabsTrigger value="account">账号视图</TabsTrigger>
            </TabsList>

            <TabsContent value="app" className="mt-0">
              <RemovedAppList
                apps={apps}
                total={total}
                currentPage={currentPage}
                pageSize={pageSize}
                selectedApp={selectedApp}
                isLoading={isLoading}
                onAppSelect={handleAppSelect}
                onPageChange={(page) => loadApps(page, searchTerm, filters)}
                onSearch={handleSearch}
              />
            </TabsContent>

            <TabsContent value="account" className="mt-0">
              <AccountGroupList
                accounts={accounts}
                total={accountsTotal}
                currentPage={accountsPage}
                pageSize={pageSize}
                selectedAccount={selectedAccount}
                isLoading={isLoadingAccounts}
                onAccountSelect={handleAccountSelect}
                onPageChange={(page) => loadAccounts(page, accountSearchTerm, filters)}
                onSearch={(search) => {
                  setAccountSearchTerm(search);
                  loadAccounts(1, search, filters);
                }}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* 右侧：详情视图 */}
        <div className="col-span-12 lg:col-span-8">
          {viewMode === 'app' ? (
            // App视图模式：显示App详情和操作时间线
            <AppTimelineViewer
              app={selectedApp}
              timeline={timeline}
              isLoading={isLoadingTimeline}
            />
          ) : selectedAccount ? (
            // 账号视图模式：显示账号详情
            <AccountDetailViewer
              accountInfo={selectedAccount.accountInfo}
              apps={accountApps}
              operations={accountOperations}
              isLoading={isLoadingAccountDetail}
              onAppClick={(bundleId) => handleSwitchToApp(bundleId)}
            />
          ) : (
            // 账号视图模式：未选择账号
            <Card className="p-12 h-full flex items-center justify-center">
              <div className="text-center text-gray-500">
                <FileSearch className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium mb-2">请选择一个账号</p>
                <p className="text-sm">从左侧列表中选择一个开发者账号，查看详细信息</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

