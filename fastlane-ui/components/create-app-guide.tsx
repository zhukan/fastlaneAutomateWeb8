'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ExternalLink, 
  Copy, 
  CheckCircle, 
  AlertCircle,
  Terminal,
  Globe
} from 'lucide-react';
import { Project } from '@/lib/types';
import { toast } from 'sonner';

interface CreateAppGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

export function CreateAppGuide({ open, onOpenChange, project }: CreateAppGuideProps) {
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [showWebGuide, setShowWebGuide] = useState(false);

  // 生成 fastlane produce 命令（用于显示）
  const generateProduceCommand = () => {
    const commands = [
      `# 创建 App`,
      `fastlane produce -u ${project.appleId || 'your-apple-id@example.com'} -a ${project.bundleId} -q "${project.name}" -m "zh-Hans"`,
      ``,
      `# （可选）禁用 Game Center`,
      `fastlane produce disable_services --game-center -u ${project.appleId || 'your-apple-id@example.com'} -a ${project.bundleId}`
    ].join('\n');
    return commands;
  };

  // 生成可执行的命令（不含注释）
  const generateExecutableCommands = () => {
    const commands = [
      `fastlane produce -u ${project.appleId || 'your-apple-id@example.com'} -a ${project.bundleId} -q "${project.name}" -m "zh-Hans"`,
      `fastlane produce disable_services --game-center -u ${project.appleId || 'your-apple-id@example.com'} -a ${project.bundleId}`
    ].join('\n');
    return commands;
  };

  const copyCommand = () => {
    const command = generateExecutableCommands();
    navigator.clipboard.writeText(command);
    setCopiedCommand(true);
    toast.success('命令已复制到剪贴板');
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  const openAppStoreConnect = () => {
    window.open('https://appstoreconnect.apple.com/apps', '_blank');
    
    toast.info('请在打开的页面创建 App', {
      description: `Bundle ID: ${project.bundleId}\nApp 名称: ${project.name}`,
      duration: 10000,
    });
  };

  const openDeveloperPortal = () => {
    window.open('https://developer.apple.com/account/resources/identifiers/list', '_blank');
    
    toast.info('如果 Bundle ID 不存在，请先创建', {
      description: `Bundle ID: ${project.bundleId}`,
      duration: 8000,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            创建 App 指南
          </DialogTitle>
          <DialogDescription>
            首次发布前需要在 App Store Connect 创建 App
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* App 信息 */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>App 信息</AlertTitle>
            <AlertDescription className="space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">App 名称:</span>
                <Badge variant="secondary">{project.name}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Bundle ID:</span>
                <Badge variant="secondary">{project.bundleId}</Badge>
              </div>
              {project.appleId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Apple ID:</span>
                  <Badge variant="secondary">{project.appleId}</Badge>
                </div>
              )}
            </AlertDescription>
          </Alert>

          {/* 方式一：命令行创建（推荐） */}
          <div className="border-2 border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-blue-900">方式一：使用命令行创建（推荐）</h3>
            </div>
            
            <p className="text-sm text-muted-foreground">
              适合熟悉命令行的用户。需要输入 Apple ID 密码和双因素认证验证码。
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium">复制以下命令到终端：</label>
              <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {generateProduceCommand()}
              </pre>
            </div>

            <Button 
              onClick={copyCommand}
              className="w-full"
            >
              {copiedCommand ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  复制命令
                </>
              )}
            </Button>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs space-y-1">
                <p><strong>注意事项：</strong></p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>需要输入 Apple ID 密码</li>
                  <li>需要输入手机收到的验证码</li>
                  <li>首次在该电脑使用需要验证</li>
                  <li>Session 有效期约 30 天</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>

          <Separator />

          {/* 方式二：网页创建（辅助） */}
          <details 
            className="border rounded-lg p-4"
            open={showWebGuide}
            onToggle={(e) => setShowWebGuide((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer font-semibold flex items-center gap-2 select-none">
              <Globe className="h-4 w-4" />
              方式二：在 App Store Connect 创建（辅助）
            </summary>
            
            <div className="mt-4 space-y-3">
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-3">
                <li>点击下方按钮打开 App Store Connect</li>
                <li>点击 <strong>"+"</strong> → <strong>"新建 App"</strong></li>
                <li>填写信息：
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                    <li>平台: <strong>iOS</strong></li>
                    <li>名称: <strong>{project.name}</strong></li>
                    <li>语言: <strong>简体中文</strong></li>
                    <li>Bundle ID: <strong>{project.bundleId}</strong></li>
                    <li>SKU: 随便填（例如: {project.bundleId}）</li>
                  </ul>
                </li>
                <li>点击 <strong>"创建"</strong></li>
              </ol>

              <div className="flex gap-2 pt-2">
                <Button onClick={openAppStoreConnect} className="flex-1">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  打开 App Store Connect
                </Button>
                <Button 
                  variant="outline" 
                  onClick={openDeveloperPortal}
                  className="flex-1"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  打开 Developer Portal
                </Button>
              </div>

              <Alert className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  如果 Bundle ID 不存在，需要先在 Developer Portal 创建 App ID
                </AlertDescription>
              </Alert>
            </div>
          </details>

          {/* 完成后提示 */}
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">完成后</AlertTitle>
            <AlertDescription className="text-green-700">
              创建完成后，关闭此对话框，直接点击 <strong>"发布到 App Store"</strong> 即可开始发布流程。
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

