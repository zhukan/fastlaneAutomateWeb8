'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, TrendingUp, Wrench } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">统计报表</h1>
        <p className="text-gray-600 mt-1">发布数据分析和趋势报告</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart className="w-5 h-5" />
            功能开发中
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <TrendingUp className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              敬请期待
            </h3>
            <p className="text-gray-600 max-w-md">
              统计报表功能将在 Phase 4 推出，提供：
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600 text-left">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                发布趋势图表
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                成功率统计
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                耗时分析
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                团队效率报告
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                自定义报表
              </li>
            </ul>
            <div className="mt-6 px-4 py-2 bg-blue-50 text-blue-700 text-xs rounded-full">
              Phase 4 - 规划中
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

