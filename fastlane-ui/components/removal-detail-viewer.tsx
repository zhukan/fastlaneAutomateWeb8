'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { AppTimelineViewer } from '@/components/app-timeline-viewer';
import { AccountDetailViewer } from '@/components/account-detail-viewer';
import { toast } from 'sonner';
import { agentClient } from '@/lib/agent-client';

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
}

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

interface RemovalDetailViewerProps {
  app: RemovedApp | null;
  timeline: OperationRecord[];
  isLoading: boolean;
  onSwitchToApp?: (bundleId: string) => void;
}

export function RemovalDetailViewer({
  app,
  timeline,
  isLoading,
  onSwitchToApp,
}: RemovalDetailViewerProps) {
  const [activeTab, setActiveTab] = useState<'app' | 'account'>('app');
  const [accountApps, setAccountApps] = useState<AccountApp[]>([]);
  const [accountOperations, setAccountOperations] = useState<AccountOperation[]>([]);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);

  // 当选择的App改变时，重置为App视图
  useEffect(() => {
    if (app) {
      setActiveTab('app');
    }
  }, [app?.id]);

  // 加载账号相关数据
  const loadAccountData = async () => {
    if (!app?.accountInfo?.accountEmail) return;

    try {
      setIsLoadingAccount(true);
      const data = await agentClient.getAccountDetail(app.accountInfo.accountEmail);
      setAccountApps(data.apps || []);
      setAccountOperations(data.operations || []);
    } catch (error: any) {
      console.error('[RemovalDetailViewer] 加载账号数据失败:', error);
      toast.error('加载账号数据失败：' + error.message);
    } finally {
      setIsLoadingAccount(false);
    }
  };

  // 切换到账号视图时加载数据
  useEffect(() => {
    if (activeTab === 'account' && app?.accountInfo) {
      loadAccountData();
    }
  }, [activeTab, app?.accountInfo?.accountEmail]);

  // 处理从账号视图点击App
  const handleAppClick = (bundleId: string) => {
    setActiveTab('app');
    onSwitchToApp?.(bundleId);
  };

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'app' | 'account')}>
      <TabsList className="mb-4">
        <TabsTrigger value="app">App视图</TabsTrigger>
        <TabsTrigger value="account" disabled={!app}>
          账号视图
        </TabsTrigger>
      </TabsList>

      <TabsContent value="app" className="mt-0">
        <AppTimelineViewer app={app} timeline={timeline} isLoading={isLoading} />
      </TabsContent>

      <TabsContent value="account" className="mt-0">
        {app?.accountInfo ? (
          <AccountDetailViewer
            accountInfo={app.accountInfo}
            apps={accountApps}
            operations={accountOperations}
            isLoading={isLoadingAccount}
            onAppClick={handleAppClick}
          />
        ) : (
          <Card className="p-12 h-[calc(100vh-350px)] flex items-center justify-center">
            <div className="text-center text-gray-500">
              <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-orange-300" />
              <p className="text-lg font-medium mb-2">该App缺少账号信息</p>
              <p className="text-sm">可能是数据同步时未关联到开发者账号</p>
            </div>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}

