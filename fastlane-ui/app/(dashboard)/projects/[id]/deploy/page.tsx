'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, X, CheckCircle, XCircle, AlertCircle, Copy, ExternalLink, Rocket, RefreshCw, History, Plus } from 'lucide-react';
import { ProgressTracker } from '@/components/progress-tracker';
import { LogViewer } from '@/components/log-viewer';
import { ReleaseHistory } from '@/components/release-history';
import { BackfillReleaseDialog } from '@/components/backfill-release-dialog';
import { useTaskStream } from '@/hooks/use-task-stream';
import { useProjectInfo } from '@/hooks/use-projects';
import { agentClient } from '@/lib/agent-client';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';

export default function DeployPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get('taskId');
  const isPreparing = searchParams.get('prepare') === 'true';
  const { data: project } = useProjectInfo(id);
  const { logs, steps, task, isStreaming, streamError, cancel } = useTaskStream(taskId);
  const user = useAppStore((state) => state.user);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [showBackfillDialog, setShowBackfillDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // 开始发布
  const handleStartDeploy = async (isFirstRelease: boolean) => {
    if (!user) {
      toast.error('请先登录');
      router.push('/login');
      return;
    }

    setIsCreatingTask(true);
    try {
      const newTaskId = await agentClient.createTask(id, 'release', {
        isFirstRelease,
        userId: user.id,
      });
      // 替换 URL，移除 prepare 参数，添加 taskId
      router.replace(`/projects/${id}/deploy?taskId=${newTaskId}`);
    } catch (err: any) {
      toast.error(err.message || '创建任务失败');
      setIsCreatingTask(false);
    }
  };

  // 生成 produce 命令（用于显示）
  const generateProduceCommand = () => {
    if (!project) return '';
    const commands = [
      `# 创建 App`,
      `fastlane produce -u ${project.appleId} -a ${project.bundleId} -q "${project.name}" -m "zh-Hans"`,
      ``,
      `# 禁用 Game Center (可选)`,
      `fastlane produce disable_services --game-center -u ${project.appleId} -a ${project.bundleId}`
    ];
    return commands.join('\n');
  };

  // 生成可执行的命令（不含注释）
  const generateExecutableCommands = () => {
    if (!project) return '';
    const commands = [
      `fastlane produce -u ${project.appleId} -a ${project.bundleId} -q "${project.name}" -m "zh-Hans"`,
      `fastlane produce disable_services --game-center -u ${project.appleId} -a ${project.bundleId}`
    ];
    return commands.join('\n');
  };

  // 复制命令
  const copyCommand = () => {
    navigator.clipboard.writeText(generateExecutableCommands());
    setCopiedCommand(true);
    toast.success('命令已复制到剪贴板');
    setTimeout(() => setCopiedCommand(false), 3000);
  };

  // 打开网页
  const openAppStoreConnect = () => {
    window.open('https://appstoreconnect.apple.com/apps', '_blank');
    if (project) {
      toast.info(
        <div className="text-sm">
          <p className="font-medium">请在 App Store Connect 创建 App：</p>
          <p>名称: <strong>{project.name}</strong></p>
          <p>Bundle ID: <strong>{project.bundleId}</strong></p>
        </div>,
        { duration: 10000 }
      );
    }
  };

  const openDeveloperPortal = () => {
    window.open('https://developer.apple.com/account/resources/identifiers/list', '_blank');
    if (project) {
      toast.info(
        <div className="text-sm">
          <p className="font-medium">请在 Developer Portal 创建 App ID：</p>
          <p>Description: <strong>{project.name}</strong></p>
          <p>Bundle ID: <strong>{project.bundleId}</strong></p>
        </div>,
        { duration: 10000 }
      );
    }
  };

  const getStatusBadge = () => {
    if (!task) return null;

    switch (task.status) {
      case 'success':
        return (
          <Badge className="bg-green-500">
            <CheckCircle className="w-4 h-4 mr-1" />
            发布成功
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="w-4 h-4 mr-1" />
            发布失败
          </Badge>
        );
      case 'running':
        return <Badge className="bg-blue-500">发布中...</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">已取消</Badge>;
      default:
        return <Badge variant="secondary">等待中</Badge>;
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto px-6 py-8">
      {/* 页面头部 */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/projects">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回项目列表
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {project?.name || '发布项目'}
            </h1>
            <p className="text-gray-600 mt-1">
              {task?.type === 'beta' ? 'TestFlight' : 'App Store'} 发布
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {getStatusBadge()}
          {isStreaming && (
            <Button
              variant="outline"
              size="sm"
              onClick={cancel}
            >
              <X className="w-4 h-4 mr-2" />
              取消发布
            </Button>
          )}
        </div>
      </div>

      {/* 发布历史 Tab（当没有任务时显示） */}
      {!isPreparing && !taskId && (
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Tabs defaultValue="history" className="flex-1">
              <TabsList>
                <TabsTrigger value="history" className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  发布历史
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBackfillDialog(true)}
              className="ml-4"
            >
              <Plus className="w-4 h-4 mr-2" />
              补录发布记录
            </Button>
          </div>
          <ReleaseHistory projectId={id} key={refreshKey} />
        </div>
      )}

      {/* 补录发布记录对话框 */}
      {project && (
        <BackfillReleaseDialog
          projectId={id}
          projectName={project.name}
          open={showBackfillDialog}
          onOpenChange={setShowBackfillDialog}
          onSuccess={() => {
            // 刷新发布历史列表
            setRefreshKey(prev => prev + 1);
          }}
        />
      )}

      {/* 准备发布：Tab 选择 */}
      {isPreparing && !taskId && (
        <div className="max-w-4xl mx-auto">
          <Tabs defaultValue="upgrade" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="new" className="text-base">
                <Rocket className="w-4 h-4 mr-2" />
                全新发布
              </TabsTrigger>
              <TabsTrigger value="upgrade" className="text-base">
                <RefreshCw className="w-4 h-4 mr-2" />
                升级发布
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: 全新发布 */}
            <TabsContent value="new" className="space-y-6">
              <div className="bg-white rounded-lg border-2 border-blue-200 p-6">
                <div className="flex items-start gap-3 mb-4">
                  <Rocket className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">全新发布</h2>
                    <p className="text-sm text-gray-600 mt-1">这是首次发布此应用到 App Store</p>
                  </div>
                </div>

                {/* 步骤 1: 创建 App */}
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold">
                      1
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">创建 App</h3>
                  </div>
                  <div className="ml-10 space-y-4">
                    <p className="text-sm text-gray-600">需要先在 App Store Connect 创建 App</p>

                    {/* 方式一：命令行 */}
                    <details open className="border rounded-lg">
                      <summary className="cursor-pointer font-medium px-4 py-3 hover:bg-gray-50 select-none flex items-center gap-2">
                        <span className="text-blue-600">方式一：使用命令行创建（推荐）⭐</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-3">
                        <p className="text-sm text-gray-600">
                          适合熟悉命令行的用户，最快速的方式
                        </p>
                        <div className="bg-gray-50 p-3 rounded text-xs font-mono whitespace-pre-wrap break-all">
                          {generateProduceCommand()}
                        </div>
                        <Button 
                          onClick={copyCommand}
                          variant="outline"
                          size="sm"
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
                          <AlertDescription className="text-xs">
                            需要输入 Apple ID 密码和双因素认证验证码
                          </AlertDescription>
                        </Alert>
                      </div>
                    </details>

                    {/* 方式二：网页 */}
                    <details className="border rounded-lg">
                      <summary className="cursor-pointer font-medium px-4 py-3 hover:bg-gray-50 select-none">
                        方式二：在 App Store Connect 网页创建
                      </summary>
                      <div className="px-4 pb-4 space-y-3">
                        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 ml-2">
                          <li>点击下方按钮打开 App Store Connect</li>
                          <li>点击 <strong>"+"</strong> → <strong>"新建 App"</strong></li>
                          <li>填写信息：
                            <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                              <li>平台: <strong>iOS</strong></li>
                              <li>名称: <strong>{project?.name}</strong></li>
                              <li>语言: <strong>简体中文</strong></li>
                              <li>Bundle ID: <strong>{project?.bundleId}</strong></li>
                              <li>SKU: 随便填（例如: {project?.bundleId}）</li>
                            </ul>
                          </li>
                          <li>点击 <strong>"创建"</strong></li>
                        </ol>
                        <div className="flex gap-2">
                          <Button 
                            onClick={openAppStoreConnect}
                            variant="outline"
                            size="sm"
                            className="flex-1"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            打开 App Store Connect
                          </Button>
                          <Button 
                            onClick={openDeveloperPortal}
                            variant="outline"
                            size="sm"
                            className="flex-1"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            打开 Developer Portal
                          </Button>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>

                {/* 步骤 2: 开始发布 */}
                <div className="mt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold">
                      2
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">开始发布</h3>
                  </div>
                  <div className="ml-10">
                    <p className="text-sm text-gray-600 mb-4">创建完成后，点击下方按钮开始发布</p>
                    <Button 
                      onClick={() => handleStartDeploy(true)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base"
                      disabled={isCreatingTask}
                    >
                      {isCreatingTask ? '正在启动...' : '全新发布'}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Tab 2: 升级发布 */}
            <TabsContent value="upgrade" className="space-y-6">
              <div className="bg-white rounded-lg border-2 border-green-200 p-6">
                <div className="flex items-start gap-3 mb-4">
                  <RefreshCw className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">升级发布</h2>
                    <p className="text-sm text-gray-600 mt-1">更新已发布到 App Store 的应用</p>
                  </div>
                </div>

                <Alert className="my-6 bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-sm text-green-800">
                    此应用已经在 App Store Connect 创建过，现在将构建新版本并上传。
                  </AlertDescription>
                </Alert>

                {/* 版本信息 */}
                <div className="my-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">当前版本信息</h3>
                  <div className="space-y-1 text-sm text-blue-800">
                    <div>版本号（Version）: <strong>{project?.currentVersion || '未知'}</strong></div>
                    <div>构建号（Build）: <strong>{project?.currentBuild || '未知'}</strong></div>
                  </div>
                  <div className="mt-3 text-xs text-blue-700">
                    💡 版本号由 Xcode 项目管理，发布时将使用 Xcode 中的版本号，并自动递增构建号
                  </div>
                </div>

                {/* 发布流程 */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">发布流程</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                        1
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">读取 Xcode 版本号</div>
                        <div className="text-sm text-gray-600">使用项目中配置的版本号</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                        2
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">自动递增 Build Number</div>
                        <div className="text-sm text-gray-600">系统会自动递增应用的构建号</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                        3
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">获取证书和配置文件</div>
                        <div className="text-sm text-gray-600">自动配置签名证书和 Provisioning Profile</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                        4
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">构建 IPA</div>
                        <div className="text-sm text-gray-600">编译并打包应用</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                        5
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">上传到 App Store Connect</div>
                        <div className="text-sm text-gray-600">将 IPA 上传到苹果服务器</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t text-sm text-gray-500 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    整个流程通常需要 5-8 分钟
                  </div>
                </div>

                {/* 开始发布按钮 */}
                <div className="mt-8">
                  <Button 
                    onClick={() => handleStartDeploy(false)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base"
                    disabled={isCreatingTask}
                  >
                    {isCreatingTask ? '正在启动...' : '升级发布'}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* 发布进度 */}
      {taskId && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧 - 进度 */}
            <div className="lg:col-span-1">
              <ProgressTracker
                steps={steps}
                totalDuration={task?.duration}
              />
            </div>

            {/* 右侧 - 日志 */}
            <div className="lg:col-span-2">
              <LogViewer logs={logs} />
            </div>
          </div>

          {/* SSE 连接错误 */}
          {streamError && (
            <Alert variant="destructive" className="mt-6">
              <XCircle className="h-4 w-4" />
              <div className="ml-2">
                <div className="font-semibold">连接错误</div>
                <div className="text-sm mt-1">{streamError}</div>
                {streamError.includes('Agent 服务未响应') && (
                  <div className="text-sm mt-2">
                    <p className="font-medium">启动步骤：</p>
                    <ol className="list-decimal list-inside mt-1 space-y-1">
                      <li>打开终端</li>
                      <li>进入 fastlane-agent 目录</li>
                      <li>运行: <code className="bg-red-900/20 px-1 py-0.5 rounded">npm start</code></li>
                    </ol>
                  </div>
                )}
              </div>
            </Alert>
          )}

          {/* 完成状态 */}
          {task && !isStreaming && (
            <div className="mt-6">
              {task.status === 'success' && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <div className="ml-2">
                    <div className="font-semibold">发布成功！</div>
                    <div className="text-sm text-gray-600 mt-1">
                      版本 {project?.currentVersion} (Build {project?.currentBuild}) 已成功发布
                    </div>
                    <div className="text-sm text-gray-600">
                      耗时: {formatDuration(task.duration || 0)}
                    </div>
                    {task.type === 'beta' && (
                      <div className="text-sm text-gray-600 mt-2">
                        💡 预计 5-10 分钟后可以在 TestFlight 中测试
                      </div>
                    )}
                  </div>
                </Alert>
              )}

              {task.status === 'failed' && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <div className="ml-2">
                    <div className="font-semibold">发布失败</div>
                    {task.error && (
                      <div className="text-sm mt-1">
                        错误信息: {task.error}
                      </div>
                    )}
                    <div className="text-sm mt-2">
                      💡 请查看完整日志了解详细错误
                    </div>
                  </div>
                </Alert>
              )}

              <div className="flex justify-center gap-4 mt-6">
                <Link href="/projects">
                  <Button variant="outline">返回项目列表</Button>
                </Link>
                {task.status === 'failed' && (
                  <Button onClick={() => router.push('/projects')}>
                    重试发布
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

