'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { agentClient } from '@/lib/agent-client';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';
import { AlertCircle, Clock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BackfillReleaseDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BackfillReleaseDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
  onSuccess,
}: BackfillReleaseDialogProps) {
  const user = useAppStore((state) => state.user);
  const [submittedAt, setSubmittedAt] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  const [isFirstRelease, setIsFirstRelease] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      toast.error('请先登录');
      return;
    }

    if (!submittedAt) {
      toast.error('请输入发布提交时间');
      return;
    }

    // 验证时间格式
    try {
      new Date(submittedAt);
      if (completedAt) {
        new Date(completedAt);
      }
    } catch (e) {
      toast.error('时间格式不正确，请使用 ISO 8601 格式');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await agentClient.backfillRelease({
        projectId,
        submittedAt,
        completedAt: completedAt || undefined,
        userId: user.id,
        isFirstRelease,
      });

      toast.success(
        <div className="text-sm">
          <p className="font-medium">补录成功！</p>
          <p className="mt-1">
            {result.project.name} v{result.project.version} (Build {result.project.build})
          </p>
          <p className="mt-1 text-xs text-gray-600">
            记录已进入审核监控
          </p>
        </div>,
        { duration: 5000 }
      );

      onOpenChange(false);
      onSuccess?.();
      
      // 重置表单
      setSubmittedAt('');
      setCompletedAt('');
      setIsFirstRelease(false);
    } catch (error: any) {
      toast.error(error.message || '补录失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 快速填充当前时间
  const fillCurrentTime = () => {
    const now = new Date().toISOString();
    setSubmittedAt(now);
  };

  // 快速填充 10 分钟后
  const fillCompletedTime = () => {
    if (!submittedAt) {
      toast.error('请先填写提交时间');
      return;
    }
    const submitted = new Date(submittedAt);
    const completed = new Date(submitted.getTime() + 10 * 60 * 1000);
    setCompletedAt(completed.toISOString());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>补录发布记录</DialogTitle>
          <DialogDescription>
            为 <strong>{projectName}</strong> 手动补录发布记录，补录后会自动进入审核监控
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <p className="font-medium mb-1">使用场景：</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>已发布但未保存到数据库的记录</li>
                <li>补录历史发布记录</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* 提交时间 */}
          <div className="space-y-2">
            <Label htmlFor="submitted-at">
              发布提交时间 <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="submitted-at"
                placeholder="2025-12-13T16:25:00.000Z"
                value={submittedAt}
                onChange={(e) => setSubmittedAt(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fillCurrentTime}
                className="whitespace-nowrap"
              >
                <Clock className="w-3 h-3 mr-1" />
                当前
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              ISO 8601 格式，例如：2025-12-13T16:25:00.000Z
            </p>
          </div>

          {/* 完成时间 */}
          <div className="space-y-2">
            <Label htmlFor="completed-at">
              发布完成时间 <span className="text-gray-400">(可选)</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="completed-at"
                placeholder="不填则默认为提交时间 + 10分钟"
                value={completedAt}
                onChange={(e) => setCompletedAt(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fillCompletedTime}
                className="whitespace-nowrap"
              >
                +10分钟
              </Button>
            </div>
          </div>

          {/* 首次发布 */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="is-first-release"
              checked={isFirstRelease}
              onChange={(e) => setIsFirstRelease(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="is-first-release" className="font-normal cursor-pointer">
              这是首次发布（全新发布）
            </Label>
          </div>

          {/* 当前用户信息 */}
          {user && (
            <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
              <p className="font-medium mb-1">发布人员信息：</p>
              <p>用户 ID: {user.id}</p>
              <p>邮箱: {user.email}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '补录中...' : '确认补录'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

