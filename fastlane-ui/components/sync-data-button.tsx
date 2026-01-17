'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { agentClient } from '@/lib/agent-client';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface SyncStatus {
  lastSyncTime: string | null;
  isRunning: boolean;
  lastSyncStatus: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' | null;
  lastSyncStats: {
    totalRemovedApps: number;
    syncedApps: number;
    newApps: number;
    totalOperations: number;
    newOperations: number;
  } | null;
}

interface SyncDataButtonProps {
  onSyncComplete?: () => void;
}

export function SyncDataButton({ onSyncComplete }: SyncDataButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  // 加载同步状态
  const loadSyncStatus = async () => {
    try {
      const data = await agentClient.getRemovalInvestigationSyncStatus();
      setSyncStatus(data);
    } catch (error: any) {
      console.error('[SyncDataButton] 加载同步状态失败:', error);
    }
  };

  // 触发全量同步
  const handleFullSync = async () => {
    if (isSyncing) {
      return;
    }

    try {
      setIsSyncing(true);
      toast.loading('正在全量同步数据...', { id: 'sync-data' });

      const result = await agentClient.syncRemovalInvestigation();
      const stats = result.stats;
      
      toast.success(
        `全量同步完成！共 ${stats.totalRemovedApps} 个下架App，${stats.totalOperations} 条操作记录`,
        { id: 'sync-data' }
      );

      // 刷新状态
      await loadSyncStatus();
      
      // 通知父组件
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (error: any) {
      console.error('[SyncDataButton] 全量同步失败:', error);
      toast.error('全量同步失败：' + error.message, { id: 'sync-data' });
    } finally {
      setIsSyncing(false);
    }
  };

  // 触发增量同步
  const handleIncrementalSync = async () => {
    if (isSyncing) {
      return;
    }

    try {
      setIsSyncing(true);
      toast.loading('正在增量同步数据（仅同步最近1天新增的App）...', { id: 'sync-data' });

      const result = await agentClient.syncRemovalInvestigationIncremental();
      const stats = result.stats;
      
      if (stats.newApps === 0) {
        toast.info('没有新增的下架App，无需同步', { id: 'sync-data' });
      } else {
        toast.success(
          `增量同步完成！新增 ${stats.newApps} 个App，${stats.newOperations} 条操作记录`,
          { id: 'sync-data' }
        );
      }

      // 刷新状态
      await loadSyncStatus();
      
      // 通知父组件
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (error: any) {
      console.error('[SyncDataButton] 增量同步失败:', error);
      toast.error('增量同步失败：' + error.message, { id: 'sync-data' });
    } finally {
      setIsSyncing(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadSyncStatus();
    // 每30秒刷新一次状态
    const interval = setInterval(loadSyncStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getSyncStatusIcon = () => {
    if (isSyncing || syncStatus?.isRunning) {
      return <RefreshCw className="w-4 h-4 animate-spin" />;
    }
    if (!syncStatus?.lastSyncStatus) {
      return <Clock className="w-4 h-4" />;
    }
    if (syncStatus.lastSyncStatus === 'COMPLETED') {
      return <CheckCircle className="w-4 h-4" />;
    }
    if (syncStatus.lastSyncStatus === 'FAILED') {
      return <AlertCircle className="w-4 h-4" />;
    }
    return <Clock className="w-4 h-4" />;
  };

  const getSyncStatusColor = () => {
    if (isSyncing || syncStatus?.isRunning) {
      return 'text-blue-600';
    }
    if (!syncStatus?.lastSyncStatus) {
      return 'text-gray-400';
    }
    if (syncStatus.lastSyncStatus === 'COMPLETED') {
      return 'text-green-600';
    }
    if (syncStatus.lastSyncStatus === 'FAILED') {
      return 'text-red-600';
    }
    return 'text-gray-400';
  };

  const getSyncStatusText = () => {
    if (isSyncing || syncStatus?.isRunning) {
      return '同步中...';
    }
    if (!syncStatus?.lastSyncTime) {
      return '未同步';
    }
    return formatDistanceToNow(new Date(syncStatus.lastSyncTime), {
      locale: zhCN,
      addSuffix: true,
    });
  };

  return (
    <div className="flex items-center gap-3">
      {/* 同步状态 */}
      <div className="flex items-center gap-2">
        <div className={getSyncStatusColor()}>{getSyncStatusIcon()}</div>
        <div className="text-sm">
          <div className="text-gray-500">上次同步</div>
          <div className={`font-medium ${getSyncStatusColor()}`}>
            {getSyncStatusText()}
          </div>
        </div>
      </div>

      {/* 统计信息（如果有） */}
      {syncStatus?.lastSyncStats && (
        <div className="hidden lg:flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {syncStatus.lastSyncStats.totalRemovedApps} 个App
          </Badge>
          <Badge variant="outline" className="text-xs">
            {syncStatus.lastSyncStats.totalOperations} 条记录
          </Badge>
        </div>
      )}

      {/* 同步按钮 */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleIncrementalSync}
          disabled={isSyncing || syncStatus?.isRunning}
          size="default"
          variant="default"
        >
          <Zap className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? '同步中' : '增量同步'}
        </Button>
        <Button
          onClick={handleFullSync}
          disabled={isSyncing || syncStatus?.isRunning}
          size="default"
          variant="outline"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? '同步中' : '全量同步'}
        </Button>
      </div>
    </div>
  );
}

