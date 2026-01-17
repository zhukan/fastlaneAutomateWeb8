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
import { Alert } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { agentClient } from '@/lib/agent-client';
import { GlobalConfig } from '@/lib/types';

interface GlobalSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function GlobalSettingsDialog({
  open,
  onOpenChange,
  onSuccess,
}: GlobalSettingsDialogProps) {
  const [config, setConfig] = useState<GlobalConfig>({
    defaultAppleId: '',
    defaultTeamId: '',
    defaultItcTeamId: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open]);

  const loadConfig = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const cfg = await agentClient.getGlobalConfig();
      setConfig(cfg);
    } catch (err: any) {
      setError(err.message || '加载配置失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    // 默认配置可以为空，不强制要求
    // if (!config.defaultAppleId || !config.defaultTeamId) {
    //   setError('Apple ID 和 Team ID 为必填项');
    //   return;
    // }

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await agentClient.setGlobalConfig(config);
      setSuccess(true);
      onSuccess?.();
      
      // 2 秒后自动关闭
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || '保存配置失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>全局默认设置</DialogTitle>
          <DialogDescription>
            配置默认的 Apple 开发者账户信息，新项目创建时会使用这些默认值。认证方式（密码/API Key）需在每个项目中单独配置。
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="appleId">
                默认 Apple ID
              </Label>
              <Input
                id="appleId"
                type="email"
                placeholder="your-apple-id@example.com"
                value={config.defaultAppleId || ''}
                onChange={(e) =>
                  setConfig({ ...config, defaultAppleId: e.target.value })
                }
              />
              <p className="text-sm text-gray-500">
                新项目会默认使用此 Apple ID（可在项目设置中修改）
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="teamId">
                默认 Team ID
              </Label>
              <Input
                id="teamId"
                placeholder="ABC123XYZ"
                value={config.defaultTeamId || ''}
                onChange={(e) =>
                  setConfig({ ...config, defaultTeamId: e.target.value })
                }
              />
              <p className="text-sm text-gray-500">
                在 Apple Developer 网站的 Membership 页面可找到
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="itcTeamId">
                默认 App Store Connect Team ID (可选)
              </Label>
              <Input
                id="itcTeamId"
                placeholder="123456789"
                value={config.defaultItcTeamId || ''}
                onChange={(e) =>
                  setConfig({ ...config, defaultItcTeamId: e.target.value })
                }
              />
              <p className="text-sm text-gray-500">
                如果你属于多个团队才需要填写
              </p>
            </div>

            {success && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <span className="ml-2">配置保存成功！</span>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <span className="ml-2">{error}</span>
              </Alert>
            )}

            <Alert>
              <div className="text-sm">
                💡 这些信息会安全地存储在你的本地电脑（~/.fastlane-agent/config.json），
                不会上传到云端
              </div>
            </Alert>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            保存配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

