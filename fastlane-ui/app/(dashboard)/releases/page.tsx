'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Search, Download, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { ReviewStatusBadge } from '@/components/review-status-badge';
import { REVIEW_STATUS_CONFIG } from '@/lib/types';
import { agentClient } from '@/lib/agent-client';
import { toast } from 'sonner';

export default function ReleasesPage() {
  const { isConnected } = useAppStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterReviewStatus, setFilterReviewStatus] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterMonitorEnabled, setFilterMonitorEnabled] = useState<string>('all'); // 7.1 版本新增
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 批量选择（7.1 版本新增）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 监控状态更新 mutation（7.1 版本新增）
  const updateMonitorMutation = useMutation({
    mutationFn: async ({ releaseId, enabled }: { releaseId: string; enabled: boolean }) => {
      await agentClient.updateMonitorStatus(releaseId, enabled);
    },
    onSuccess: (_, { enabled }) => {
      toast.success(enabled ? '已启用监控' : '已禁用监控');
      queryClient.invalidateQueries({ queryKey: ['releases', 'all'] });
    },
    onError: (error: Error) => {
      toast.error(`操作失败: ${error.message}`);
    },
  });

  // 批量更新监控状态 mutation（7.1 版本新增）
  const batchUpdateMonitorMutation = useMutation({
    mutationFn: async ({ releaseIds, enabled }: { releaseIds: string[]; enabled: boolean }) => {
      await agentClient.batchUpdateMonitorStatus(releaseIds, enabled);
    },
    onSuccess: (_, { enabled, releaseIds }) => {
      toast.success(`已${enabled ? '启用' : '禁用'} ${releaseIds.length} 条记录的监控`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['releases', 'all'] });
    },
    onError: (error: Error) => {
      toast.error(`批量操作失败: ${error.message}`);
    },
  });

  // 查询所有发布记录
  const { data: releasesData, isLoading } = useQuery({
    queryKey: ['releases', 'all', page, search, filterReviewStatus, filterUser, filterMonitorEnabled],
    queryFn: async () => {
      let query = supabase
        .from('releases')
        .select(`
          *,
          user:users_view!deployed_by(email, full_name)
        `, { count: 'exact' });

      // 搜索过滤
      if (search) {
        query = query.or(
          `app_name.ilike.%${search}%,bundle_id.ilike.%${search}%,version.ilike.%${search}%`
        );
      }

      // 审核状态过滤
      if (filterReviewStatus && filterReviewStatus !== 'all') {
        query = query.eq('review_status', filterReviewStatus);
      }

      // 用户过滤
      if (filterUser && filterUser !== 'all') {
        query = query.eq('deployed_by', filterUser);
      }

      // 监控状态过滤（7.1 版本新增）
      if (filterMonitorEnabled && filterMonitorEnabled !== 'all') {
        if (filterMonitorEnabled === 'enabled') {
          query = query.or('monitor_enabled.is.null,monitor_enabled.eq.true');
        } else {
          query = query.eq('monitor_enabled', false);
        }
      }

      // 分页
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order('submitted_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      return {
        releases: (data || []).map((release: any) => ({
          ...release,
          deployed_by_display: release.user?.full_name || release.user?.email || '未知用户',
        })),
        total: count || 0,
      };
    },
    enabled: isConnected,
  });

  // 🆕 Realtime 订阅：监听 releases 表的更新
  useEffect(() => {
    if (!isConnected) return;

    console.log('[Releases] 🔔 设置 Realtime 订阅');

    const channel = supabase
      .channel('releases-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'releases',
        },
        (payload) => {
          console.log('[Releases] 📥 收到审核状态更新:', payload);
          
          // 刷新发布记录列表
          queryClient.invalidateQueries({ queryKey: ['releases', 'all'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'releases',
        },
        (payload) => {
          console.log('[Releases] 📥 收到新发布记录:', payload);
          
          // 刷新发布记录列表
          queryClient.invalidateQueries({ queryKey: ['releases', 'all'] });
        }
      )
      .subscribe((status) => {
        console.log('[Releases] 订阅状态:', status);
      });

    return () => {
      console.log('[Releases] 🔕 取消 Realtime 订阅');
      supabase.removeChannel(channel);
    };
  }, [isConnected, queryClient]);

  const totalPages = releasesData
    ? Math.ceil(releasesData.total / pageSize)
    : 0;

  return (
    <div className="container mx-auto px-6 py-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">发布历史</h1>
        <p className="text-gray-600 mt-1">查看所有项目的发布记录</p>
      </div>

      {!isConnected ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">无法连接到 Agent</h3>
          <p className="text-gray-600 mb-4">请确保本地 Agent 已启动</p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                全部发布记录
                {releasesData && (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    共 {releasesData.total} 条
                  </span>
                )}
              </CardTitle>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                导出
              </Button>
            </div>

            {/* 筛选器 */}
            <div className="flex gap-4 mt-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="搜索应用名称、Bundle ID、版本号..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select
                value={filterMonitorEnabled}
                onValueChange={(value) => {
                  setFilterMonitorEnabled(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="监控状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="enabled">
                    <span className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-green-500" /> 已启用
                    </span>
                  </SelectItem>
                  <SelectItem value="disabled">
                    <span className="flex items-center gap-2">
                      <EyeOff className="w-4 h-4 text-gray-400" /> 已禁用
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filterReviewStatus}
                onValueChange={(value) => {
                  setFilterReviewStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="所有状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有状态</SelectItem>
                  {Object.entries(REVIEW_STATUS_CONFIG).map(([status, config]) => (
                    <SelectItem key={status} value={status}>
                      {config.icon} {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 批量操作栏（7.1 版本新增） */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-4 mt-4 p-3 bg-blue-50 rounded-lg">
                <span className="text-sm text-blue-700">
                  已选择 <strong>{selectedIds.size}</strong> 条记录
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    batchUpdateMonitorMutation.mutate({
                      releaseIds: Array.from(selectedIds),
                      enabled: true,
                    });
                  }}
                  disabled={batchUpdateMonitorMutation.isPending}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  批量启用监控
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    batchUpdateMonitorMutation.mutate({
                      releaseIds: Array.from(selectedIds),
                      enabled: false,
                    });
                  }}
                  disabled={batchUpdateMonitorMutation.isPending}
                >
                  <EyeOff className="w-4 h-4 mr-1" />
                  批量禁用监控
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedIds(new Set())}
                >
                  取消选择
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-gray-500">加载中...</div>
            ) : !releasesData?.releases || releasesData.releases.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {search || filterReviewStatus !== 'all'
                  ? '没有找到匹配的发布记录'
                  : '还没有发布记录'}
              </div>
            ) : (
              <>
                {/* 表格 */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium text-gray-700 w-10">
                          <Checkbox
                            checked={
                              releasesData.releases.length > 0 &&
                              releasesData.releases.every((r: any) => selectedIds.has(r.id))
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedIds(new Set(releasesData.releases.map((r: any) => r.id)));
                              } else {
                                setSelectedIds(new Set());
                              }
                            }}
                          />
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">
                          应用名称
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">
                          版本
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">
                          发布类型
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">
                          监控
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">
                          Apple ID
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">
                          提交时间
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">
                          检查时间
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">
                          发布人
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">
                          审核状态
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {releasesData.releases.map((release: any) => (
                        <tr key={release.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <Checkbox
                              checked={selectedIds.has(release.id)}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedIds);
                                if (checked) {
                                  newSelected.add(release.id);
                                } else {
                                  newSelected.delete(release.id);
                                }
                                setSelectedIds(newSelected);
                              }}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium text-gray-900">
                                {release.app_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {release.bundle_id}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-sm">
                              {release.version} ({release.build_number})
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex px-2 py-1 text-xs rounded-full ${
                                release.is_first_release
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {release.is_first_release ? '全新发布' : '升级发布'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
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
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {release.apple_id || '-'}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {format(
                              new Date(release.submitted_at),
                              'MM-dd HH:mm',
                              { locale: zhCN }
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {release.last_checked_at
                              ? format(
                                  new Date(release.last_checked_at),
                                  'MM-dd HH:mm',
                                  { locale: zhCN }
                                )
                              : '-'}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {release.deployed_by_display}
                          </td>
                          <td className="py-3 px-4">
                            <ReviewStatusBadge
                              status={release.review_status || 'WAITING_FOR_REVIEW'}
                              lastCheckedAt={release.last_checked_at}
                              errorMessage={release.error_message}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 分页 */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <div className="text-sm text-gray-600">
                      第 {page} 页，共 {totalPages} 页
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                      >
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

