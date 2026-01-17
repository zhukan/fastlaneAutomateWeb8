'use client';

import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Info, Sparkles } from 'lucide-react';
import { agentClient } from '@/lib/agent-client';
import { ProjectDetectionResult } from '@/lib/types';
import { toast } from 'sonner';

interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddProjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddProjectDialogProps) {
  const [step, setStep] = useState<'path' | 'config'>('path');
  const [projectPath, setProjectPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [detection, setDetection] = useState<ProjectDetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isQueryingAccount, setIsQueryingAccount] = useState(false);
  const [autoConfigured, setAutoConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDetect = async () => {
    if (!projectPath) {
      setError('请输入项目路径');
      return;
    }

    setIsDetecting(true);
    setError(null);

    try {
      const result = await agentClient.detectProject(projectPath);
      setDetection(result);

      if (result.valid) {
        // 自动填充项目名称：优先使用 Display Name，否则使用目录名
        if (result.detected?.displayName) {
          setProjectName(result.detected.displayName);
        } else {
          const pathParts = projectPath.split('/');
          setProjectName(pathParts[pathParts.length - 1]);
        }
        
        setStep('config');
      } else {
        setError(result.error || '项目检测失败');
      }
    } catch (err: any) {
      setError(err.message || '项目检测失败');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleAdd = async () => {
    if (!projectName || !detection?.detected) {
      setError('请完成项目配置');
      return;
    }

    setIsAdding(true);
    setIsQueryingAccount(true);
    setError(null);
    setAutoConfigured(false);

    try {
      const project = await agentClient.addProject(projectName, projectPath, {
        bundleId: detection.detected.bundleId,
        workspace: detection.detected.workspace,
        project: detection.detected.project,
        scheme: detection.detected.schemes[0],
        useMatch: false,
      });

      setIsQueryingAccount(false);

      // 检查是否自动配置了账号
      if (project.appleId && project.teamId && project.apiKeyId) {
        setAutoConfigured(true);
        toast.success('项目添加成功！已自动配置 Apple 开发者账号。');
      } else {
        toast.success('项目添加成功！可以在项目设置中配置 Apple 账户。');
      }

      onSuccess?.();
      handleClose();
    } catch (err: any) {
      setIsQueryingAccount(false);
      setError(err.message || '添加项目失败');
    } finally {
      setIsAdding(false);
    }
  };

  const handleClose = () => {
    setStep('path');
    setProjectPath('');
    setProjectName('');
    setDetection(null);
    setError(null);
    setIsQueryingAccount(false);
    setAutoConfigured(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加项目</DialogTitle>
          <DialogDescription>
            {step === 'path' && '第 1 步：选择项目目录'}
            {step === 'config' && '第 2 步：确认项目配置'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 'path' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="path">项目路径</Label>
                <Input
                  id="path"
                  placeholder="/Users/username/Projects/MyApp"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDetect()}
                />
                <p className="text-sm text-gray-500">
                  提示：粘贴项目根目录的完整路径
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <span className="ml-2">{error}</span>
                </Alert>
              )}
            </>
          ) : detection?.detected ? (
            <>
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <span className="ml-2">检测到有效的 iOS 项目</span>
              </Alert>

              <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600">Workspace</div>
                    <div className="font-medium">
                      {detection.detected.workspace || '无'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Project</div>
                    <div className="font-medium">
                      {detection.detected.project || '无'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Scheme</div>
                    <div className="font-medium">
                      {detection.detected.schemes[0]}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Bundle ID</div>
                    <div className="font-medium truncate">
                      {detection.detected.bundleId}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">版本</div>
                    <div className="font-medium">
                      {detection.detected.currentVersion} (
                      {detection.detected.currentBuild})
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Fastlane</div>
                    <Badge
                      variant={
                        detection.detected.hasFastlane ? 'default' : 'secondary'
                      }
                    >
                      {detection.detected.hasFastlane ? '已配置' : '未配置'}
                    </Badge>
                  </div>
                </div>
              </div>

              {!detection.detected.hasFastlane && (
                <Alert className="border-blue-200 bg-blue-50">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="ml-2 text-blue-900">
                    <strong>将自动配置 Fastlane</strong>
                    <br />
                    检测到项目没有 Fastlane 配置，系统将自动为您复制 Fastlane 模板到项目目录
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">项目显示名称</Label>
                <Input
                  id="name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              {isAdding && isQueryingAccount && (
                <Alert className="border-blue-200 bg-blue-50">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <AlertDescription className="ml-2 text-blue-900">
                    正在查询账号信息...
                  </AlertDescription>
                </Alert>
              )}

              {autoConfigured && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="ml-2 text-green-900">
                    <strong>已自动配置 Apple 开发者账号</strong>
                    <br />
                    账号信息已从明道云自动获取并配置完成
                  </AlertDescription>
                </Alert>
              )}

              {!isAdding && !autoConfigured && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="ml-2">
                    项目创建后，可以在项目设置中配置 Apple 开发者账户
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <span className="ml-2">{error}</span>
                </Alert>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          {step === 'path' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                取消
              </Button>
              <Button onClick={handleDetect} disabled={isDetecting}>
                {isDetecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                下一步
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('path')}>
                上一步
              </Button>
              <Button onClick={handleAdd} disabled={isAdding || !projectName}>
                {(isAdding || isQueryingAccount) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {isQueryingAccount ? '查询账号信息中...' : '添加项目'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

