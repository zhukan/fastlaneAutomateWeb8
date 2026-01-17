'use client';

import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Users as UsersIcon } from 'lucide-react';
import { agentClient } from '@/lib/agent-client';
import { AppComparisonRecord, AppStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// 账号分组数据
interface AccountGroup {
  accountName: string;
  accountEmail: string;
  apps: AppComparisonRecord[];
  stats: {
    total: number;
    available: number;
    removed: number;
    linked: number;
    todayNewTotal: number;
    yesterdayNewTotal: number;
  };
}

interface AppMonitorAccountViewProps {
  // 下架监控页面使用
  groups?: AccountGroup[];
  isCheckingAll?: boolean;
  checkingApps?: Set<string>;
  onCheckSingle?: (bundleId: string) => Promise<void>;
  onCheckAccount?: (accountId: string | null, apps: any[]) => Promise<void>;
  formatTime?: (time?: string) => string;
  
  // 关联对比页面使用（向后兼容）
  records?: AppComparisonRecord[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function AppMonitorAccountView({ 
  groups, 
  isCheckingAll, 
  checkingApps, 
  onCheckSingle, 
  onCheckAccount, 
  formatTime,
  records, 
  isLoading, 
  onRefresh 
}: AppMonitorAccountViewProps) {
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // 如果直接传入 groups，使用它（下架监控页面场景）
  useEffect(() => {
    if (groups) {
      setAccountGroups(groups);
      return;
    }
    
    // 否则从 records 生成分组（关联对比页面场景）
    if (!records) {
      return;
    }
    
    // 按账号分组
    const groupMap = new Map<string, AccountGroup>();
    
    records.forEach(record => {
      const accountKey = record.myApp.accountEmail || record.myApp.accountName || '未知账号';
      
      if (!groupMap.has(accountKey)) {
        groupMap.set(accountKey, {
          accountName: record.myApp.accountName,
          accountEmail: record.myApp.accountEmail,
          apps: [],
          stats: {
            total: 0,
            available: 0,
            removed: 0,
            linked: 0,
            todayNewTotal: 0,
            yesterdayNewTotal: 0,
          },
        });
      }
      
      const group = groupMap.get(accountKey)!;
      group.apps.push(record);
      
      // 统计
      group.stats.total++;
      if (record.myApp.status === AppStatus.AVAILABLE) group.stats.available++;
      if (record.myApp.status === AppStatus.REMOVED) group.stats.removed++;
      if (record.targetApp) group.stats.linked++;
      if (record.todayNew) group.stats.todayNewTotal += record.todayNew;
      if (record.yesterdayNew) group.stats.yesterdayNewTotal += record.yesterdayNew;
    });
    
    // 按今日新增总量排序
    const sortedGroups = Array.from(groupMap.values()).sort(
      (a, b) => b.stats.todayNewTotal - a.stats.todayNewTotal
    );
    
    // 每个组内也按今日新增排序
    sortedGroups.forEach(group => {
      group.apps.sort((a, b) => {
        const aNew = a.todayNew || 0;
        const bNew = b.todayNew || 0;
        return bNew - aNew;
      });
    });
    
    setAccountGroups(sortedGroups);
    
    // 默认展开前3个账号
    setExpandedAccounts(new Set(
      sortedGroups.slice(0, 3).map(g => g.accountEmail || g.accountName)
    ));
  }, [records, groups]);

  // 切换账号展开/折叠
  const toggleAccount = (accountKey: string) => {
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(accountKey)) {
        next.delete(accountKey);
      } else {
        next.add(accountKey);
      }
      return next;
    });
  };

  // 全部展开/折叠
  const toggleAll = () => {
    if (expandedAccounts.size === accountGroups.length) {
      setExpandedAccounts(new Set());
    } else {
      setExpandedAccounts(new Set(
        accountGroups.map(g => g.accountEmail || g.accountName)
      ));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">按开发者账号维度查看应用关联对比</p>
        <div className="flex gap-2">
          <Button onClick={toggleAll} variant="outline" size="sm">
            {expandedAccounts.size === accountGroups.length ? '全部折叠' : '全部展开'}
          </Button>
          <Button onClick={onRefresh} variant="outline" size="sm">
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            刷新
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-blue-600" />
            <div className="text-sm text-muted-foreground">账号总数</div>
          </div>
          <div className="text-2xl font-bold mt-2">{accountGroups.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">应用总数</div>
          <div className="text-2xl font-bold mt-2">{records?.length || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">今日新增总计</div>
          <div className="text-2xl font-bold mt-2 text-green-600">
            +{accountGroups.reduce((sum, g) => sum + g.stats.todayNewTotal, 0).toLocaleString()}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">昨日新增总计</div>
          <div className="text-2xl font-bold mt-2 text-blue-600">
            +{accountGroups.reduce((sum, g) => sum + g.stats.yesterdayNewTotal, 0).toLocaleString()}
          </div>
        </Card>
      </div>

      {/* 账号列表 */}
      <div className="space-y-4">
        {accountGroups.map((group) => {
          const accountKey = group.accountEmail || group.accountName;
          const isExpanded = expandedAccounts.has(accountKey);
          
          return (
            <Card key={accountKey}>
              {/* 账号头部 */}
              <div
                className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleAccount(accountKey)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <div className="font-semibold">{group.accountName || '未知账号'}</div>
                      <div className="text-sm text-muted-foreground">{group.accountEmail}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">应用数</div>
                      <div className="font-semibold">{group.stats.total}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">已关联</div>
                      <div className="font-semibold">{group.stats.linked}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">今日新增</div>
                      <div className="font-semibold text-green-600">+{group.stats.todayNewTotal.toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">昨日新增</div>
                      <div className="font-semibold text-blue-600">+{group.stats.yesterdayNewTotal.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 应用列表 */}
              {isExpanded && (
                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>我的包</TableHead>
                        <TableHead>友盟应用名称</TableHead>
                        <TableHead className="text-center">今日新增</TableHead>
                        <TableHead className="text-center">昨日新增</TableHead>
                        <TableHead className="text-center">包状态</TableHead>
                        <TableHead className="text-center">目标包状态</TableHead>
                        <TableHead>目标包</TableHead>
                        <TableHead className="text-center">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.apps.map((record) => (
                        <TableRow key={record.myApp.bundleId}>
                          {/* 我的包 */}
                          <TableCell>
                            <div className="space-y-1">
                              {record.qimaiUrl ? (
                                <a
                                  href={record.qimaiUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                                >
                                  {record.myApp.appName}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <div className="font-medium">{record.myApp.appName}</div>
                              )}
                              <div className="text-sm text-muted-foreground">{record.myApp.bundleId}</div>
                            </div>
                          </TableCell>

                          {/* 友盟应用名称 */}
                          <TableCell>
                            {record.umengDataUrl && record.umengAppName ? (
                              <a
                                href={record.umengDataUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-purple-600 hover:text-purple-800 hover:underline inline-flex items-center gap-1"
                              >
                                {record.umengAppName}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                {record.umengAppName || '-'}
                              </div>
                            )}
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
                            <Badge variant={record.myApp.status === AppStatus.AVAILABLE ? 'default' : 'destructive'}>
                              {record.myApp.status === AppStatus.AVAILABLE ? '✅ 在架' : '❌ 下架'}
                            </Badge>
                          </TableCell>

                          {/* 目标包状态 */}
                          <TableCell className="text-center">
                            {record.targetApp && (
                              <Badge variant={record.targetApp.isOffline ? 'destructive' : 'default'}>
                                {record.targetApp.isOffline ? '❌ 下架' : '✅ 在架'}
                              </Badge>
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
                                    className="font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                                  >
                                    {record.targetApp.appName}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <div className="font-medium">{record.targetApp.appName}</div>
                                )}
                                {record.targetApp.note && (
                                  <div className="text-xs text-muted-foreground">{record.targetApp.note}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>

                          {/* 操作 */}
                          <TableCell className="text-center">
                            {record.keywordSearchUrl && (
                              <a
                                href={record.keywordSearchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-sm"
                              >
                                关键词
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
