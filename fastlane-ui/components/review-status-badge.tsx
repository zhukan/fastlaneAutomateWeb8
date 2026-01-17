'use client';

import { REVIEW_STATUS_CONFIG } from '@/lib/types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface ReviewStatusBadgeProps {
  status: string;
  lastCheckedAt?: string;
  errorMessage?: string;
}

export function ReviewStatusBadge({
  status,
  lastCheckedAt,
  errorMessage,
}: ReviewStatusBadgeProps) {
  const config = REVIEW_STATUS_CONFIG[status] || {
    label: status,
    icon: '❓',
    color: 'gray',
  };

  // 根据颜色映射到 Tailwind CSS 类
  const colorClasses: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700 border-gray-300',
    blue: 'bg-blue-100 text-blue-700 border-blue-300',
    green: 'bg-green-100 text-green-700 border-green-300',
    red: 'bg-red-100 text-red-700 border-red-300',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  };

  const className = colorClasses[config.color] || colorClasses.gray;

  // 生成 tooltip 内容
  const tooltipContent = [];
  if (lastCheckedAt) {
    tooltipContent.push(
      `最后检查：${format(new Date(lastCheckedAt), 'yyyy-MM-dd HH:mm', { locale: zhCN })}`
    );
  }
  if (errorMessage) {
    tooltipContent.push(`错误：${errorMessage}`);
  }

  return (
    <div className="inline-block" title={tooltipContent.join('\n') || undefined}>
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${className}`}
      >
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </span>
    </div>
  );
}

















