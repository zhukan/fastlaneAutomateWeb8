'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Settings, Monitor, ShieldAlert, Loader2, AlertTriangle, CheckCircle, Search, Shield, Info, ExternalLink, Key } from 'lucide-react';
import Link from 'next/link';
import { agentClient } from '@/lib/agent-client';
import { GlobalConfig, UserProfile } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { user, isAdmin, isOperator } = useAuth();
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载配置
  useEffect(() => {
    loadConfig();
    if (user) {
      loadUserProfile();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await agentClient.getGlobalConfig();
      setConfig(data);
    } catch (err: any) {
      setError(err.message || '加载配置失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 加载用户配置
  const loadUserProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (err: any) {
      console.error('加载用户配置失败:', err);
    }
  };

  // 保存配置（管理员修改全局配置）
  const saveConfig = async (newConfig: GlobalConfig) => {
    try {
      setIsSaving(true);
      await agentClient.setGlobalConfig(newConfig);
      setConfig(newConfig);
      toast.success('设置已保存');
    } catch (err: any) {
      toast.error('保存失败：' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 保存用户级别的监控设置（操作员）
  const saveUserMonitorSettings = async (
    enableAppRemovalMonitor: boolean,
    enableTargetAppMonitor: boolean
  ) => {
    if (!user) return;

    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('user_profiles')
        .update({
          enable_app_removal_monitor: enableAppRemovalMonitor,
          enable_target_app_monitor: enableTargetAppMonitor,
        })
        .eq('id', user.id);

      if (error) throw error;

      // 更新本地状态
      setUserProfile((prev) =>
        prev
          ? {
              ...prev,
              enable_app_removal_monitor: enableAppRemovalMonitor,
              enable_target_app_monitor: enableTargetAppMonitor,
            }
          : null
      );

      toast.success('设置已保存');
    } catch (err: any) {
      toast.error('保存失败：' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 切换开关（管理员）
  const handleToggle = (key: keyof GlobalConfig, value: boolean) => {
    if (!config) return;
    const newConfig = { ...config, [key]: value };
    saveConfig(newConfig);
  };

  // 切换用户级别的监控开关（操作员）
  const handleUserToggle = (
    key: 'enable_app_removal_monitor' | 'enable_target_app_monitor',
    value: boolean
  ) => {
    if (!userProfile) return;

    const newRemovalMonitor =
      key === 'enable_app_removal_monitor'
        ? value
        : userProfile.enable_app_removal_monitor || false;
    const newTargetMonitor =
      key === 'enable_target_app_monitor'
        ? value
        : userProfile.enable_target_app_monitor || false;

    saveUserMonitorSettings(newRemovalMonitor, newTargetMonitor);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">设置</h1>
          <p className="text-gray-600 mt-1">系统配置和偏好设置</p>
        </div>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <div>
                <p className="font-medium">无法加载设置</p>
                <p className="text-sm mt-1">{error}</p>
                <p className="text-sm mt-2">请确保 fastlane-agent 已启动并正常运行。</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">设置</h1>
        <p className="text-gray-600 mt-1">系统配置和偏好设置</p>
      </div>

      <div className="space-y-6">
        {/* 角色提示 */}
        {isOperator && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium">操作员权限说明</p>
                  <p className="mt-1">
                    您当前以操作员身份登录。监控服务的设置仅对您个人账号生效，不会影响其他用户。
                    管理员可以配置系统全局的监控服务。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 监控服务设置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              监控服务
              {isOperator && (
                <span className="text-xs font-normal text-gray-500 ml-2">
                  （个人设置）
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {isAdmin
                ? '配置自动监控任务。多台机器运行 Agent 时，建议只在一台开启监控服务，避免重复执行。'
                : '配置您个人的监控偏好。这些设置仅对您的账号生效。'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 审核状态监控 - 仅管理员可见 */}
            {isAdmin && (
              <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-gray-50">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    config?.enableReviewMonitor !== false ? "bg-blue-100" : "bg-gray-200"
                  )}>
                    <Monitor className={cn(
                      "w-5 h-5",
                      config?.enableReviewMonitor !== false ? "text-blue-600" : "text-gray-400"
                    )} />
                  </div>
                  <div>
                    <Label htmlFor="enableReviewMonitor" className="text-base font-medium cursor-pointer">
                      审核状态自动监控
                    </Label>
                    <p className="text-sm text-gray-500 mt-1">
                      每小时自动检查提交审核的 App 状态，更新审核进度。
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {config?.enableReviewMonitor !== false ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                          <CheckCircle className="w-3 h-3" />
                          已启用
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          已禁用
                        </span>
                      )}
                      <span className="text-xs text-gray-400">检查间隔：每小时</span>
                    </div>
                  </div>
                </div>
                <Switch
                  id="enableReviewMonitor"
                  checked={config?.enableReviewMonitor !== false}
                  onCheckedChange={(checked) => handleToggle('enableReviewMonitor', checked)}
                  disabled={isSaving}
                />
              </div>
            )}

            {/* 下架状态监控 */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  isAdmin
                    ? config?.enableAppRemovalMonitor !== false
                      ? "bg-orange-100"
                      : "bg-gray-200"
                    : userProfile?.enable_app_removal_monitor
                    ? "bg-orange-100"
                    : "bg-gray-200"
                )}>
                  <ShieldAlert className={cn(
                    "w-5 h-5",
                    isAdmin
                      ? config?.enableAppRemovalMonitor !== false
                        ? "text-orange-600"
                        : "text-gray-400"
                      : userProfile?.enable_app_removal_monitor
                      ? "text-orange-600"
                      : "text-gray-400"
                  )} />
                </div>
                <div>
                  <Label htmlFor="enableAppRemovalMonitor" className="text-base font-medium cursor-pointer">
                    下架状态自动监控
                  </Label>
                  <p className="text-sm text-gray-500 mt-1">
                    每 12 小时自动检查已上架的 App 是否被下架。
                    {isOperator && (
                      <span className="block mt-1 text-xs text-amber-600">
                        ⚠️ 操作员账号默认关闭此功能，您可以根据需要手动开启。
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {(isAdmin
                      ? config?.enableAppRemovalMonitor !== false
                      : userProfile?.enable_app_removal_monitor) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                        <CheckCircle className="w-3 h-3" />
                        已启用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        已禁用
                      </span>
                    )}
                    <span className="text-xs text-gray-400">检查间隔：每 12 小时</span>
                  </div>
                </div>
              </div>
              <Switch
                id="enableAppRemovalMonitor"
                checked={
                  isAdmin
                    ? config?.enableAppRemovalMonitor !== false
                    : userProfile?.enable_app_removal_monitor || false
                }
                onCheckedChange={(checked) =>
                  isAdmin
                    ? handleToggle('enableAppRemovalMonitor', checked)
                    : handleUserToggle('enable_app_removal_monitor', checked)
                }
                disabled={isSaving || (isOperator && !userProfile)}
              />
            </div>

            {/* 目标包监控 */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  isAdmin
                    ? config?.enableTargetAppMonitor !== false
                      ? "bg-purple-100"
                      : "bg-gray-200"
                    : userProfile?.enable_target_app_monitor
                    ? "bg-purple-100"
                    : "bg-gray-200"
                )}>
                  <Search className={cn(
                    "w-5 h-5",
                    isAdmin
                      ? config?.enableTargetAppMonitor !== false
                        ? "text-purple-600"
                        : "text-gray-400"
                      : userProfile?.enable_target_app_monitor
                      ? "text-purple-600"
                      : "text-gray-400"
                  )} />
                </div>
                <div>
                  <Label htmlFor="enableTargetAppMonitor" className="text-base font-medium cursor-pointer">
                    目标包自动监控
                  </Label>
                  <p className="text-sm text-gray-500 mt-1">
                    每小时自动检查明道云"目标包表"中的竞品 App 状态（下架、清词、清榜）。
                    {isOperator && (
                      <span className="block mt-1 text-xs text-amber-600">
                        ⚠️ 操作员账号默认关闭此功能，您可以根据需要手动开启。
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {(isAdmin
                      ? config?.enableTargetAppMonitor !== false
                      : userProfile?.enable_target_app_monitor) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                        <CheckCircle className="w-3 h-3" />
                        已启用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        已禁用
                      </span>
                    )}
                    <span className="text-xs text-gray-400">检查间隔：每小时</span>
                  </div>
                </div>
              </div>
              <Switch
                id="enableTargetAppMonitor"
                checked={
                  isAdmin
                    ? config?.enableTargetAppMonitor !== false
                    : userProfile?.enable_target_app_monitor || false
                }
                onCheckedChange={(checked) =>
                  isAdmin
                    ? handleToggle('enableTargetAppMonitor', checked)
                    : handleUserToggle('enable_target_app_monitor', checked)
                }
                disabled={isSaving || (isOperator && !userProfile)}
              />
            </div>

            {/* 提示信息 */}
            {isAdmin && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">多 Agent 部署提示</p>
                  <p className="mt-1">
                    如果您在多台机器上运行 fastlane-agent，建议只在其中一台开启监控服务，
                    其他机器关闭监控服务，以避免重复执行监控任务。手动触发的检查功能不受此设置影响。
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 第三方服务配置 - 仅管理员可见 */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                第三方服务配置
              </CardTitle>
              <CardDescription>
                管理七麦、友盟等第三方服务的认证凭证（Cookie、API Key）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/settings/third-party">
                <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-100">
                      <Key className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-base font-medium">配置第三方服务凭证</p>
                      <p className="text-sm text-gray-500 mt-1">
                        配置和管理七麦数据、友盟等服务的 Cookie，系统会自动检测过期状态并提醒更新。
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-5 h-5 text-gray-400" />
                </div>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* 其他设置占位 */}
        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              更多设置
            </CardTitle>
            <CardDescription>
              更多系统设置即将上线
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-500 py-4 text-center">
              通知设置、团队管理等功能开发中...
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
