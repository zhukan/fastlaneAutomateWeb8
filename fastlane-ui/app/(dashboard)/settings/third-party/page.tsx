'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  Settings, 
  RefreshCw, 
  Check, 
  AlertTriangle, 
  XCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Clock,
  Info
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface SystemConfig {
  id: string;
  key: string;
  name: string;
  description: string | null;
  config_type: string;
  status: 'active' | 'expired' | 'invalid';
  value: string | null;
  last_verified_at: string | null;
  last_verified_message: string | null;
  updated_at: string;
}

const statusConfig = {
  active: { label: '正常', color: 'bg-green-500', icon: Check },
  expired: { label: '已过期', color: 'bg-yellow-500', icon: AlertTriangle },
  invalid: { label: '无效', color: 'bg-red-500', icon: XCircle },
};

const configGuides: Record<string, { title: string; steps: string[]; url: string }> = {
  qimai_cookie: {
    title: '如何获取七麦 Cookie',
    steps: [
      '打开浏览器，访问 https://www.qimai.cn 并登录',
      '按 F12 打开开发者工具',
      '切换到 Network（网络）标签',
      '刷新页面',
      '点击任意一个 qimai.cn 域名的请求',
      '在请求标头中找到 Cookie 字段，复制完整内容',
    ],
    url: 'https://www.qimai.cn',
  },
  umeng_cookie: {
    title: '如何获取友盟 Cookie',
    steps: [
      '打开浏览器，访问 https://www.umeng.com 并登录',
      '按 F12 打开开发者工具',
      '切换到 Application（应用）标签',
      '在左侧找到 Cookies → https://www.umeng.com',
      '复制所有 Cookie 的 name=value 格式，用分号分隔',
    ],
    url: 'https://www.umeng.com',
  },
};

export default function ThirdPartySettingsPage() {
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SystemConfig | null>(null);
  const [newValue, setNewValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);

  // 使用全局 supabase 实例

  useEffect(() => {
    fetchConfigs();
  }, []);

  async function fetchConfigs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_configs')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error('获取配置失败:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!editingConfig || !newValue.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_configs')
        .update({
          value: newValue.trim(),
          status: 'active', // 更新后重置为 active
          updated_at: new Date().toISOString(),
          last_verified_at: null,
          last_verified_message: null,
        })
        .eq('id', editingConfig.id);

      if (error) throw error;

      // 刷新列表
      await fetchConfigs();
      setDialogOpen(false);
      setEditingConfig(null);
      setNewValue('');
    } catch (error) {
      console.error('保存配置失败:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(config: SystemConfig) {
    if (config.key !== 'qimai_cookie') {
      alert('暂不支持测试此配置');
      return;
    }

    setTestingKey(config.key);
    try {
      // 调用 Edge Function 进行测试
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/qimai-monitor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
        }
      );

      const result = await response.json();
      
      // 刷新配置列表以获取最新状态
      await fetchConfigs();

      if (response.ok) {
        alert(`测试成功！\n检测清榜: ${result.result?.clearRankDetected || 0} 个\n检测清词: ${result.result?.clearKeywordDetected || 0} 个`);
      } else {
        alert(`测试失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('测试失败:', error);
      alert('测试请求失败，请检查网络');
    } finally {
      setTestingKey(null);
    }
  }

  function openEditDialog(config: SystemConfig) {
    setEditingConfig(config);
    setNewValue(config.value || '');
    setShowValue(false);
    setDialogOpen(true);
  }

  function getStatusBadge(status: SystemConfig['status']) {
    const config = statusConfig[status];
    const Icon = config.icon;
    return (
      <Badge variant="outline" className="gap-1">
        <span className={`w-2 h-2 rounded-full ${config.color}`} />
        {config.label}
      </Badge>
    );
  }

  const guide = editingConfig ? configGuides[editingConfig.key] : null;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">第三方服务配置</h1>
          <p className="text-muted-foreground">
            管理七麦、友盟等第三方服务的认证凭证
          </p>
        </div>
        <Button variant="outline" onClick={fetchConfigs} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : configs.length === 0 ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            暂无第三方服务配置，请先运行数据库迁移脚本。
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4">
          {configs.map((config) => (
            <Card key={config.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      {config.name}
                      {getStatusBadge(config.status)}
                    </CardTitle>
                    <CardDescription>{config.description}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {config.key === 'qimai_cookie' && config.value && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(config)}
                        disabled={testingKey === config.key}
                      >
                        {testingKey === config.key ? (
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-4 w-4" />
                        )}
                        测试
                      </Button>
                    )}
                    <Button size="sm" onClick={() => openEditDialog(config)}>
                      {config.value ? '更新' : '配置'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">配置状态：</span>
                    <span className="ml-2">
                      {config.value ? '已配置' : '未配置'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">配置类型：</span>
                    <span className="ml-2">{config.config_type}</span>
                  </div>
                  {config.last_verified_at && (
                    <>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">最后验证：</span>
                        <span>
                          {format(new Date(config.last_verified_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">验证结果：</span>
                        <span className="ml-2 text-xs">
                          {config.last_verified_message || '-'}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {config.status === 'expired' && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      此凭证已过期，请点击"更新"按钮重新配置。
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingConfig?.value ? '更新' : '配置'} {editingConfig?.name}
            </DialogTitle>
            <DialogDescription>
              {editingConfig?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 获取指南 */}
            {guide && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{guide.title}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(guide.url, '_blank')}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    打开网站
                  </Button>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  {guide.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* 输入框 */}
            <div className="space-y-2">
              <Label htmlFor="cookie-value">Cookie 值</Label>
              <div className="relative">
                <Textarea
                  id="cookie-value"
                  placeholder="粘贴完整的 Cookie 字符串..."
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="min-h-[120px] pr-10 font-mono text-xs"
                  style={{ 
                    WebkitTextSecurity: showValue ? 'none' : 'disc' 
                  } as React.CSSProperties}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-2"
                  onClick={() => setShowValue(!showValue)}
                >
                  {showValue ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Cookie 内容将安全存储在数据库中，仅管理员可查看和修改。
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving || !newValue.trim()}>
              {saving ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

