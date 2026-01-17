'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { agentClient } from '@/lib/agent-client';
import { Release } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { ReviewStatusBadge } from './review-status-badge';

interface ReleaseHistoryProps {
  projectId: string;
}

export function ReleaseHistory({ projectId }: ReleaseHistoryProps) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 监控状态更新 mutation（7.1 版本新增）
  const updateMonitorMutation = useMutation({
    mutationFn: async ({ releaseId, enabled }: { releaseId: string; enabled: boolean }) => {
      await agentClient.updateMonitorStatus(releaseId, enabled);
    },
    onSuccess: (_, { enabled }) => {
      toast.success(enabled ? '已启用监控' : '已禁用监控');
      loadReleases();
    },
    onError: (error: Error) => {
      toast.error(`操作失败: ${error.message}`);
    },
  });

  // 筛选条件
  const [filters, setFilters] = useState({
    appName: 'all',
    bundleId: 'all',
    appleId: 'all',
    deployedBy: 'all',
  });

  // 获取所有唯一值用于筛选器选项
  const [filterOptions, setFilterOptions] = useState({
    appNames: [] as string[],
    bundleIds: [] as string[],
    appleIds: [] as string[],
    deployedBys: [] as string[],
  });

  const loadReleases = async () => {
    setIsLoading(true);
    try {
      // 先获取所有数据用于筛选器选项
      const allData = await agentClient.getReleases(projectId);
      
      // 提取筛选器选项
      const appNames = Array.from(new Set(allData.map((r) => r.app_name))).sort();
      const bundleIds = Array.from(new Set(allData.map((r) => r.bundle_id))).sort();
      const appleIds = Array.from(
        new Set(allData.map((r) => r.apple_id).filter((id): id is string => !!id))
      ).sort();
      const deployedBys = Array.from(
        new Set(
          allData
            .map((r: any) => r.deployed_by_display || r.deployed_by)
            .filter((name): name is string => !!name)
        )
      ).sort();

      setFilterOptions({
        appNames,
        bundleIds,
        appleIds,
        deployedBys,
      });

      // 应用筛选
      let filtered = allData;
      if (filters.appName && filters.appName !== 'all') {
        filtered = filtered.filter((r) => r.app_name === filters.appName);
      }
      if (filters.bundleId && filters.bundleId !== 'all') {
        filtered = filtered.filter((r) => r.bundle_id === filters.bundleId);
      }
      if (filters.appleId && filters.appleId !== 'all') {
        filtered = filtered.filter((r) => r.apple_id === filters.appleId);
      }
      if (filters.deployedBy && filters.deployedBy !== 'all') {
        filtered = filtered.filter(
          (r: any) =>
            r.deployed_by_display === filters.deployedBy ||
            r.deployed_by === filters.deployedBy
        );
      }

      setReleases(filtered);
    } catch (error: any) {
      toast.error(error.message || '加载发布历史失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReleases();
  }, [projectId, filters]);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m${remainingSeconds.toString().padStart(2, '0')}s`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* 筛选器 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            App 名称
          </label>
          <Select
            value={filters.appName}
            onValueChange={(value) =>
              setFilters({ ...filters, appName: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {filterOptions.appNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            Bundle ID
          </label>
          <Select
            value={filters.bundleId}
            onValueChange={(value) =>
              setFilters({ ...filters, bundleId: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {filterOptions.bundleIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            Apple 账号
          </label>
          <Select
            value={filters.appleId}
            onValueChange={(value) =>
              setFilters({ ...filters, appleId: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {filterOptions.appleIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            发布人
          </label>
          <Select
            value={filters.deployedBy}
            onValueChange={(value) =>
              setFilters({ ...filters, deployedBy: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {filterOptions.deployedBys.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 表格 */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : releases.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无发布记录
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-semibold text-gray-700">
                  App 名称
                </th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">
                  版本
                </th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">
                  发布类型
                </th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">
                  监控
                </th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">
                  审核状态
                </th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">
                  Apple ID
                </th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">
                  时间
                </th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">
                  耗时
                </th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">
                  发布人
                </th>
                <th className="text-left p-3 text-sm font-semibold text-gray-700">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => (
                <tr key={release.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm">{release.app_name}</td>
                  <td className="p-3 text-sm">
                    <Badge variant="secondary">
                      {release.version}({release.build_number})
                    </Badge>
                  </td>
                  <td className="p-3 text-sm">
                    {release.is_first_release ? (
                      <Badge className="bg-blue-500">全新发布</Badge>
                    ) : (
                      <Badge className="bg-green-500">升级发布</Badge>
                    )}
                  </td>
                  <td className="p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={release.monitor_enabled !== false}
                        onCheckedChange={(checked) => {
                          updateMonitorMutation.mutate({ releaseId: release.id, enabled: checked });
                        }}
                        disabled={updateMonitorMutation.isPending}
                        className="scale-75"
                      />
                      {release.monitor_enabled !== false ? (
                        <Eye className="w-4 h-4 text-green-500" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-sm">
                    <ReviewStatusBadge
                      status={release.review_status || 'WAITING_FOR_REVIEW'}
                      lastCheckedAt={release.last_checked_at}
                      errorMessage={release.error_message}
                    />
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {release.apple_id || '-'}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {formatDate(release.submitted_at)}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {formatDuration(release.duration)}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {(release as any).deployed_by_display || release.deployed_by}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // TODO: 实现查看详情功能
                          toast.info('查看详情功能开发中');
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        查看
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

