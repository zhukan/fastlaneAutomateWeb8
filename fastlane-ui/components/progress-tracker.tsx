'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, X, Circle } from 'lucide-react';
import { DeployStep } from '@/lib/types';

interface ProgressTrackerProps {
  steps: DeployStep[];
  totalDuration?: number;
}

export function ProgressTracker({ steps, totalDuration }: ProgressTrackerProps) {
  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  const getStatusIcon = (status: DeployStep['status']) => {
    switch (status) {
      case 'success':
        return <Check className="w-5 h-5 text-green-500" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <X className="w-5 h-5 text-red-500" />;
      default:
        return <Circle className="w-5 h-5 text-gray-300" />;
    }
  };

  const getStatusBadge = (status: DeployStep['status']) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500">完成</Badge>;
      case 'running':
        return <Badge className="bg-blue-500">进行中</Badge>;
      case 'failed':
        return <Badge variant="destructive">失败</Badge>;
      default:
        return <Badge variant="secondary">待处理</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>发布进度</CardTitle>
          {totalDuration !== undefined && (
            <div className="text-sm text-gray-600">
              总耗时: {formatDuration(totalDuration)}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {steps.length === 0 ? (
            <div className="text-center text-gray-400 py-4">
              正在初始化...
            </div>
          ) : (
            steps.map((step, index) => (
              <div
                key={step.id}
                className="flex items-start gap-4 relative"
              >
                {/* 连接线 */}
                {index < steps.length - 1 && (
                  <div className="absolute left-[10px] top-8 w-0.5 h-8 bg-gray-200" />
                )}

                {/* 图标 */}
                <div className="flex-shrink-0 mt-1">
                  {getStatusIcon(step.status)}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{step.name}</span>
                    {getStatusBadge(step.status)}
                  </div>
                  {step.duration !== undefined && (
                    <div className="text-sm text-gray-500">
                      用时: {formatDuration(step.duration)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

