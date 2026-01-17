'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Archive, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAgentConnection } from '@/hooks/use-agent-connection';
import { agentClient } from '@/lib/agent-client';

interface HistoryRecord {
  id: string;
  bundle_id: string;
  app_name: string;
  account_display_name: string;
  last_known_status: 'AVAILABLE' | 'REMOVED' | 'UNKNOWN';
  was_monitoring: boolean;
  removed_at: string | null;
  archived_at: string;
  archived_reason: string;
  last_error_message: string | null;
}

interface HistoryStats {
  total: number;
  removed: number;
  available: number;
  unknown: number;
}

export default function AppRemovalMonitorHistoryPage() {
  const { isConnected } = useAgentConnection();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const loadHistory = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      });
      
      if (statusFilter !== 'all') {
        queryParams.append('status', statusFilter);
      }

      const url = `http://localhost:3000/api/app-removal-monitor/history?${queryParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      setHistory(data.history || []);
    } catch (error: any) {
      console.error('获取历史记录失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/app-removal-monitor/history/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (error: any) {
      console.error('获取统计数据失败:', error);
    }
  };

  useEffect(() => {
    if (isConnected) {
      loadHistory();
      loadStats();
    }
  }, [isConnected, page, statusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return <Badge variant="default" className="bg-green-500">在架</Badge>;
      case 'REMOVED':
        return <Badge variant="destructive">已下架</Badge>;
      case 'UNKNOWN':
        return <Badge variant="secondary">未知</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getReasonText = (reason: string) => {
    switch (reason) {
      case 'removed_from_hap':
        return '从明道云移除';
      case 'manual':
        return '手动归档';
      default:
        return reason;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">Agent 未连接</p>
          <p className="text-sm text-muted-foreground mt-2">请检查 Agent 服务是否运行</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Archive className="h-8 w-8" />
          历史归档
        </h1>
        <p className="text-muted-foreground mt-2">
          查看已从明道云移除的App记录
        </p>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>总计</CardDescription>
              <CardTitle className="text-3xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>已下架</CardDescription>
              <CardTitle className="text-3xl text-red-600">{stats.removed}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>在架时移除</CardDescription>
              <CardTitle className="text-3xl text-green-600">{stats.available}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>状态未知</CardDescription>
              <CardTitle className="text-3xl text-gray-600">{stats.unknown}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* 筛选和操作 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>归档记录</CardTitle>
              <CardDescription>
                显示第 {page * pageSize + 1} - {page * pageSize + history.length} 条
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="筛选状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="AVAILABLE">在架</SelectItem>
                  <SelectItem value="REMOVED">已下架</SelectItem>
                  <SelectItem value="UNKNOWN">未知</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadHistory();
                  loadStats();
                }}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-16">
              <RefreshCw className="h-10 w-10 animate-spin mx-auto text-blue-500 mb-4" />
              <p className="text-muted-foreground font-medium">加载历史记录中...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-16 bg-muted/20 rounded-lg">
              <Archive className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground mb-2">暂无归档记录</p>
              <p className="text-sm text-muted-foreground">
                从明道云移除的App记录会自动归档到这里
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">App名称</TableHead>
                    <TableHead className="w-[240px]">Bundle ID</TableHead>
                    <TableHead className="w-[200px]">开发者账号</TableHead>
                    <TableHead className="w-[100px]">归档时状态</TableHead>
                    <TableHead className="w-[160px]">下架时间</TableHead>
                    <TableHead className="w-[160px]">归档时间</TableHead>
                    <TableHead className="w-[120px]">归档原因</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.app_name}</TableCell>
                      <TableCell className="font-mono text-sm" style={{ fontFamily: 'Monaco, Consolas, "Courier New", monospace' }}>
                        {record.bundle_id}
                      </TableCell>
                      <TableCell className="text-sm">{record.account_display_name || '-'}</TableCell>
                      <TableCell>{getStatusBadge(record.last_known_status)}</TableCell>
                      <TableCell className="text-sm">
                        {record.removed_at ? (
                          <span className="text-red-600 font-medium">{formatDate(record.removed_at)}</span>
                        ) : (
                          <span className="text-muted-foreground">未下架</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(record.archived_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getReasonText(record.archived_reason)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* 分页 */}
              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground">
                  第 {page + 1} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={history.length < pageSize}
                >
                  下一页
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

