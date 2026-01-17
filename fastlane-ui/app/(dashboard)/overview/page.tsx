'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, TrendingUp, Package, CheckCircle, RefreshCw, Loader2, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { agentClient } from '@/lib/agent-client';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ReviewStatusBadge } from '@/components/review-status-badge';
import { useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

export default function OverviewPage() {
  const router = useRouter();
  const { projects } = useAppStore();
  const { isConnected } = useAppStore();
  const queryClient = useQueryClient();
  
  // 记录刷新冷却时间（releaseId -> 倒计时秒数）
  const [refreshCooldowns, setRefreshCooldowns] = useState<Record<string, number>>({});

  // 监控状态更新 mutation（7.1 版本新增）
  const updateMonitorMutation = useMutation({
    mutationFn: async ({ releaseId, enabled }: { releaseId: string; enabled: boolean }) => {
      await agentClient.updateMonitorStatus(releaseId, enabled);
    },
    onSuccess: (_, { enabled }) => {
      toast.success(enabled ? '已启用监控' : '已禁用监控');
      queryClient.invalidateQueries({ queryKey: ['releases', 'recent'] });
    },
    onError: (error: Error) => {
      toast.error(`操作失败: ${error.message}`);
    },
  });

  // 手动刷新审核状态
  const refreshMutation = useMutation({
    mutationFn: async (releaseId: string) => {
      await agentClient.refreshReleaseStatus(releaseId);
    },
    onSuccess: (_, releaseId) => {
      toast.success('审核状态已刷新');
      // 刷新数据
      queryClient.invalidateQueries({ queryKey: ['releases', 'recent'] });
      
      // 设置 10 秒冷却时间
      const cooldownSeconds = 10;
      setRefreshCooldowns(prev => ({ ...prev, [releaseId]: cooldownSeconds }));
      
      // 开始倒计时
      const interval = setInterval(() => {
        setRefreshCooldowns(prev => {
          const remaining = (prev[releaseId] || 0) - 1;
          if (remaining <= 0) {
            clearInterval(interval);
            const newState = { ...prev };
            delete newState[releaseId];
            return newState;
          }
          return { ...prev, [releaseId]: remaining };
        });
      }, 1000);
    },
    onError: (error: Error) => {
      toast.error(`刷新失败: ${error.message}`);
    },
  });

  // 查询最近发布记录
  const { data: recentReleases, isLoading: releasesLoading } = useQuery({
    queryKey: ['releases', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('releases')
        .select(`
          *,
          user:users_view!deployed_by(email, full_name)
        `)
        .order('submitted_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return (data || []).map((release: any) => ({
        ...release,
        deployed_by_display:
          release.user?.full_name ||
          release.user?.email ||
          '未知用户',
      }));
    },
    refetchInterval: 30000, // 30秒刷新
    enabled: isConnected,
  });

  // 计算本月发布数
  const monthlyReleases = recentReleases?.filter((r: any) => {
    const submitDate = new Date(r.submitted_at);
    const now = new Date();
    return (
      submitDate.getMonth() === now.getMonth() &&
      submitDate.getFullYear() === now.getFullYear()
    );
  }).length || 0;

  // 计算监控中的数量（7.1 版本新增）
  const monitoredCount = recentReleases?.filter((r: any) => r.monitor_enabled !== false).length || 0;

  // 计算成功率（暂时假设所有记录都是成功的）
  const successRate = recentReleases && recentReleases.length > 0 ? 100 : 0;

  return (
    <div className="container mx-auto px-6 py-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">概览</h1>
        <p className="text-gray-600 mt-1">系统运行状态和最近活动</p>
      </div>

      {!isConnected ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">无法连接到 Agent</h3>
          <p className="text-gray-600 mb-4">请确保本地 Agent 已启动</p>
          <div className="text-sm text-gray-500">
            <p>在 fastlane-agent 目录运行：</p>
            <code className="bg-gray-100 px-2 py-1 rounded">npm run dev</code>
          </div>
        </div>
      ) : (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总项目</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{projects.length}</div>
                <p className="text-xs text-muted-foreground">
                  已配置的 iOS 项目
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">本月发布</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{monthlyReleases}</div>
                <p className="text-xs text-muted-foreground">
                  本月成功发布次数
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">监控中</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{monitoredCount}</div>
                <p className="text-xs text-muted-foreground">
                  启用审核状态监控
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">成功率</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{successRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  发布成功率
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 最近发布 */}
          <Card className="mb-8">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>最近发布</CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  最近 10 条发布记录
                </p>
              </div>
              <Link href="/releases">
                <Button variant="outline" size="sm">
                  查看全部
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {releasesLoading ? (
                <div className="text-center py-8 text-gray-500">加载中...</div>
              ) : !recentReleases || recentReleases.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  还没有发布记录
                </div>
              ) : (
                <div className="space-y-3">
                  {recentReleases.map((release: any) => (
                    <div
                      key={release.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">
                            {release.app_name}
                          </span>
                          <span className="text-sm text-gray-600 flex-shrink-0">
                            v{release.version} ({release.build_number})
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span className="truncate max-w-[100px]">{release.deployed_by_display}</span>
                          <span>
                            {format(new Date(release.submitted_at), 'MM-dd HH:mm', { locale: zhCN })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="flex flex-col items-end gap-0.5">
                          <ReviewStatusBadge
                            status={release.review_status || 'WAITING_FOR_REVIEW'}
                            lastCheckedAt={release.last_checked_at}
                            errorMessage={release.error_message}
                          />
                          {release.last_checked_at && (
                            <span className="text-[10px] text-gray-400">
                              检查于 {format(new Date(release.last_checked_at), 'MM-dd HH:mm', { locale: zhCN })}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => refreshMutation.mutate(release.id)}
                          disabled={
                            refreshMutation.isPending && refreshMutation.variables === release.id ||
                            !!refreshCooldowns[release.id] ||
                            release.monitor_enabled === false
                          }
                          title={
                            refreshCooldowns[release.id]
                              ? `请等待 ${refreshCooldowns[release.id]} 秒`
                              : release.monitor_enabled === false
                                ? '该记录未启用监控'
                                : '手动刷新审核状态'
                          }
                        >
                          {refreshMutation.isPending && refreshMutation.variables === release.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : refreshCooldowns[release.id] ? (
                            <span className="text-[10px] font-medium">{refreshCooldowns[release.id]}</span>
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        {/* 监控开关（7.1 版本新增） */}
                        <div
                          className="flex items-center gap-1.5 cursor-pointer"
                          title={release.monitor_enabled !== false ? '点击禁用审核状态监控' : '点击启用审核状态监控'}
                          onClick={() => updateMonitorMutation.mutate({ releaseId: release.id, enabled: release.monitor_enabled === false })}
                        >
                          <Switch
                            checked={release.monitor_enabled !== false}
                            disabled={updateMonitorMutation.isPending}
                            className="scale-75"
                          />
                          {release.monitor_enabled !== false ? (
                            <Eye className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 快速操作 */}
          <Card>
            <CardHeader>
              <CardTitle>快速操作</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Button onClick={() => router.push('/projects')}>
                  <Plus className="w-4 h-4 mr-2" />
                  添加项目
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/releases')}
                >
                  查看发布历史
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

