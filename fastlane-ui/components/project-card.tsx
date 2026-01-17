'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight, Trash2, History } from 'lucide-react';
import { Project, Release } from '@/lib/types';
import { agentClient } from '@/lib/agent-client';
import { Alert } from '@/components/ui/alert';
import { ProjectSettingsDialog } from '@/components/project-settings-dialog';
import { toast } from 'sonner';

interface ProjectCardProps {
  project: Project;
  onDelete?: () => void;
  onUpdate?: () => void;
}

export function ProjectCard({ project, onDelete, onUpdate }: ProjectCardProps) {
  const router = useRouter();
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [latestRelease, setLatestRelease] = useState<Release | null>(null);

  // 获取最近发布信息
  useEffect(() => {
    agentClient
      .getLatestRelease(project.id)
      .then((release) => {
        setLatestRelease(release);
      })
      .catch(() => {
        // 忽略错误，不显示最近发布信息
      });
  }, [project.id]);

  const handleDeploy = async () => {
    // 先跳转到发布页面，让用户选择是否需要创建 App
    router.push(`/projects/${project.id}/deploy?prepare=true`);
  };

  const handleViewHistory = () => {
    // 跳转到发布历史页面
    router.push(`/projects/${project.id}/deploy`);
  };

  // 检查账号是否已配置
  const isAccountConfigured = !!(project.appleId && project.teamId);
  const canDeploy = isAccountConfigured && !isDeploying;

  const handleDelete = async () => {
    if (!confirm(`确定要删除项目 "${project.name}" 吗？`)) {
      return;
    }

    try {
      await agentClient.deleteProject(project.id);
      toast.success('项目已删除');
      onDelete?.();
    } catch (err: any) {
      toast.error(err.message || '删除项目失败');
    }
  };

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-xl">{project.name}</CardTitle>
              <CardDescription className="mt-2">
                {project.bundleId}
              </CardDescription>
            </div>
            <button
              onClick={handleDelete}
              className="p-2 hover:bg-red-50 rounded text-red-600 flex-shrink-0"
              title="删除项目"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </CardHeader>
      <CardContent>
        {/* 版本信息 */}
        <div className="space-y-2 text-sm text-gray-600 mb-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              v{project.currentVersion} ({project.currentBuild})
            </Badge>
          </div>
          {/* 最近发布信息 */}
          {latestRelease && (
            <div className="text-xs text-gray-500 border-t pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span>
                  最近发布: v{latestRelease.version} ({latestRelease.build_number})
                </span>
                <span className="text-gray-400">
                  {new Date(latestRelease.submitted_at).toLocaleDateString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          )}
          <div className="text-xs text-gray-400 truncate" title={project.path}>
            {project.path}
          </div>
        </div>

      {/* 步骤列表 */}
        <div className="space-y-3">
          {/* 步骤 1：配置 Apple 账号 */}
          <div 
            onClick={() => setShowSettings(true)}
            className={`
              flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer
              transition-all hover:shadow-md
              ${isAccountConfigured 
                ? 'border-green-200 bg-green-50/50 hover:bg-green-50' 
                : 'border-orange-200 bg-orange-50/50 hover:bg-orange-50'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm
                ${isAccountConfigured ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}
              `}>
                1
              </div>
              <div>
                <div className="font-medium text-sm">配置 Apple 账号</div>
                <div className="text-xs text-gray-500">配置开发者账户信息</div>
              </div>
            </div>
            
            {isAccountConfigured ? (
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            ) : (
              <span className="text-xs text-orange-600 font-medium flex-shrink-0">待完成</span>
            )}
          </div>

          {/* 步骤 2：发布到 App Store */}
          <div 
            onClick={() => canDeploy && handleDeploy()}
            className={`
              flex items-center justify-between p-4 rounded-lg border-2 
              transition-all
              ${canDeploy 
                ? 'border-blue-200 bg-blue-50/50 cursor-pointer hover:shadow-md hover:bg-blue-50 hover:border-blue-300' 
                : 'border-gray-200 bg-gray-50/50 opacity-60 cursor-not-allowed'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm
                ${canDeploy ? 'bg-blue-500 text-white' : 'bg-gray-400 text-white'}
              `}>
                2
              </div>
              <div>
                <div className="font-medium text-sm">发布到 App Store</div>
                <div className="text-xs text-gray-500">
                  {canDeploy ? '上传应用到 App Store' : '请先完成账号配置'}
                </div>
              </div>
            </div>
            
            {canDeploy && <ArrowRight className="w-5 h-5 text-blue-500 flex-shrink-0" />}
          </div>

          {/* 查看发布历史按钮 */}
          <Button
            onClick={handleViewHistory}
            variant="outline"
            className="w-full mt-2 flex items-center justify-center gap-2"
          >
            <History className="w-4 h-4" />
            查看发布历史
          </Button>
        </div>

        {error && (
          <Alert className="mt-4" variant="destructive">
            {error}
          </Alert>
        )}
      </CardContent>
    </Card>

    <ProjectSettingsDialog
      open={showSettings}
      onOpenChange={setShowSettings}
      project={project}
      onSuccess={onUpdate}
    />
  </>
  );
}

