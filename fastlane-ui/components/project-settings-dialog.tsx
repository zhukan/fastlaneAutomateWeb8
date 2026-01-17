'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, CheckCircle, XCircle, Info, RefreshCw } from 'lucide-react';
import { agentClient } from '@/lib/agent-client';
import { Project } from '@/lib/types';
import { toast } from 'sonner';

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onSuccess?: () => void;
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  onSuccess,
}: ProjectSettingsDialogProps) {
  const [config, setConfig] = useState({
    appleId: '',
    teamId: '',
    itcTeamId: '',
    apiKeyId: '',
    apiKeyIssuerId: '',
    apiKeyContent: '',
    bundleId: '',
    scheme: '',
    workspace: '',
    project: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open && project) {
      setConfig({
        appleId: project.appleId || '',
        teamId: project.teamId || '',
        itcTeamId: project.itcTeamId || '',
        apiKeyId: project.apiKeyId || '',
        apiKeyIssuerId: project.apiKeyIssuerId || '',
        apiKeyContent: project.apiKeyContent || '',
        bundleId: project.bundleId || '',
        scheme: project.scheme || '',
        workspace: project.workspace || '',
        project: project.project || '',
      });
    }
  }, [open, project]);

  const handleSave = async () => {
    if (!project) return;

    // 基本字段验证
    if (!config.appleId || !config.teamId) {
      setError('Apple ID 和 Team ID 为必填项');
      return;
    }

    // API Key 字段验证
      if (!config.apiKeyId || !config.apiKeyIssuerId || !config.apiKeyContent) {
        setError('API Key ID、Issuer ID 和密钥内容均为必填项');
        return;
    }

    if (!config.bundleId || !config.scheme) {
      setError('Bundle ID 和 Scheme 为必填项');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await agentClient.updateProject(project.id, {
        appleId: config.appleId,
        teamId: config.teamId,
        itcTeamId: config.itcTeamId,
        apiKeyId: config.apiKeyId,
        apiKeyIssuerId: config.apiKeyIssuerId,
        apiKeyContent: config.apiKeyContent,
        bundleId: config.bundleId,
        scheme: config.scheme,
        workspace: config.workspace,
        project: config.project,
      });
      
      setSuccess(true);
      toast.success('项目设置已更新！');
      onSuccess?.();
      
      // 2 秒后自动关闭
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || '保存设置失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncAccount = async () => {
    if (!project) return;

    setIsSyncing(true);
    setError(null);
    setSuccess(false);

    try {
      const updatedProject = await agentClient.syncProjectAccount(project.id);
      
      // 更新表单数据
      setConfig({
        appleId: updatedProject.appleId || '',
        teamId: updatedProject.teamId || '',
        itcTeamId: updatedProject.itcTeamId || '',
        apiKeyId: updatedProject.apiKeyId || '',
        apiKeyIssuerId: updatedProject.apiKeyIssuerId || '',
        apiKeyContent: updatedProject.apiKeyContent || '',
        bundleId: updatedProject.bundleId || '',
        scheme: updatedProject.scheme || '',
        workspace: updatedProject.workspace || '',
        project: updatedProject.project || '',
      });

      setSuccess(true);
      toast.success('账号信息已从明道云同步成功！');
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || '同步账号信息失败');
      toast.error(err.message || '同步账号信息失败');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(false);
    onOpenChange(false);
  };

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>项目设置 - {project.name}</DialogTitle>
          <DialogDescription>
            配置此项目的 Apple 开发者账户信息
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 pr-2">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">基本设置</TabsTrigger>
              <TabsTrigger value="advanced">高级设置</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                配置 Apple 开发者账户信息，用于自动化发布到 App Store
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div>
                <div className="font-medium text-sm text-blue-900">从明道云同步账号信息</div>
                <div className="text-xs text-blue-700 mt-1">
                  根据 Bundle ID 自动从明道云查询并填充开发者账号配置
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncAccount}
                disabled={isSyncing}
                className="ml-4"
              >
                {isSyncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                重新同步
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="appleId">
                Apple ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="appleId"
                type="email"
                placeholder="your-apple-id@example.com"
                value={config.appleId}
                onChange={(e) =>
                  setConfig({ ...config, appleId: e.target.value })
                }
              />
              <p className="text-sm text-gray-500">
                此项目使用的 Apple Developer 账户邮箱
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="teamId">
                Team ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="teamId"
                placeholder="ABC123XYZ"
                value={config.teamId}
                onChange={(e) =>
                  setConfig({ ...config, teamId: e.target.value })
                }
              />
              <p className="text-sm text-gray-500">
                在 Apple Developer 网站的 Membership 页面可找到
              </p>
            </div>

            <div className="space-y-2">
                  <Label htmlFor="apiKeyId">
                    密钥 ID <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="apiKeyId"
                    placeholder="ABC123DEF4"
                    value={config.apiKeyId}
                    onChange={(e) =>
                      setConfig({ ...config, apiKeyId: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKeyIssuerId">
                    Issuer ID <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="apiKeyIssuerId"
                    placeholder="12345678-1234-1234-1234-123456789012"
                    value={config.apiKeyIssuerId}
                    onChange={(e) =>
                      setConfig({ ...config, apiKeyIssuerId: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKeyContent">
                    App Store Connect API 密钥 (.p8) <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="apiKeyContent"
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgFVGYr/fyu8ELK+Es&#10;...&#10;-----END PRIVATE KEY-----"
                    value={config.apiKeyContent}
                    onChange={(e) =>
                      setConfig({ ...config, apiKeyContent: e.target.value })
                    }
                    className="min-h-[200px] font-mono text-xs"
                  />
                  <p className="text-sm text-gray-500">
                    在 <a href="https://appstoreconnect.apple.com/access/api" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">App Store Connect</a> 生成 API Key 并下载 .p8 文件，然后将文件内容粘贴到这里
                  </p>
                </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4 mt-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                这些信息通常由系统自动检测，如检测不准确可手动修改
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="bundleId">
                Bundle ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="bundleId"
                placeholder="com.yourcompany.yourapp"
                value={config.bundleId}
                onChange={(e) =>
                  setConfig({ ...config, bundleId: e.target.value })
                }
              />
              <p className="text-sm text-gray-500">
                应用的唯一标识符
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheme">
                Scheme <span className="text-red-500">*</span>
              </Label>
              <Input
                id="scheme"
                placeholder="YourApp"
                value={config.scheme}
                onChange={(e) =>
                  setConfig({ ...config, scheme: e.target.value })
                }
              />
              <p className="text-sm text-gray-500">
                Xcode 构建方案名称
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace">
                Workspace（如使用 CocoaPods）
              </Label>
              <Input
                id="workspace"
                placeholder="YourApp.xcworkspace"
                value={config.workspace || ''}
                onChange={(e) =>
                  setConfig({ ...config, workspace: e.target.value })
                }
              />
              <p className="text-sm text-gray-500">
                .xcworkspace 文件名，使用 CocoaPods 时需要
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project">
                Project（如不使用 CocoaPods）
              </Label>
              <Input
                id="project"
                placeholder="YourApp.xcodeproj"
                value={config.project || ''}
                onChange={(e) =>
                  setConfig({ ...config, project: e.target.value })
                }
              />
              <p className="text-sm text-gray-500">
                .xcodeproj 文件名，不使用 CocoaPods 时需要
              </p>
            </div>

            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                修改这些设置可能导致构建失败，请确保填写正确
              </AlertDescription>
            </Alert>
          </TabsContent>
          </Tabs>

          <div className="space-y-4 mt-4">
            {success && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>设置保存成功！</AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert>
              <AlertDescription>
                💡 修改设置后，下次部署时会生成新的 .env 文件
              </AlertDescription>
            </Alert>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            保存设置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

