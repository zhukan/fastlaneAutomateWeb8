'use client';

import { useState } from 'react';
import { Search, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface TestResult {
  bundleId: string;
  appInfo: {
    found: boolean;
    processed: any;
  };
  productionRecords: {
    count: number;
    processed: any[];
  };
  updateRecords: {
    count: number;
    processed: any[];
  };
  summary: {
    totalOperations: number;
    productionCount: number;
    updateCount: number;
  };
}

export default function BundleRecordsTestPage() {
  const [bundleId, setBundleId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  // 安全显示值（处理对象、数组等复杂类型）
  const safeDisplay = (value: any): string => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'string') return value || 'N/A';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') {
      // 处理 {key, value} 格式
      if ('value' in value) return value.value || 'N/A';
      if ('Value' in value) return value.Value || 'N/A';
      // 处理数组
      if (Array.isArray(value)) {
        return value.map(v => safeDisplay(v)).join(', ') || 'N/A';
      }
      // 其他对象，转为JSON
      return JSON.stringify(value);
    }
    return 'N/A';
  };

  const handleTest = async () => {
    if (!bundleId.trim()) {
      toast.error('请输入Bundle ID');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch(
        `http://localhost:3000/api/test/bundle-records?bundleId=${encodeURIComponent(bundleId)}`
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '测试失败');
      }

      const data = await res.json();
      setResult(data.data);
      toast.success('测试完成');
    } catch (error: any) {
      console.error('[Test] 测试失败:', error);
      toast.error(`测试失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Search className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bundle ID 数据测试</h1>
          <p className="text-sm text-gray-500">
            直接查询明道云API，验证数据获取逻辑是否正确
          </p>
        </div>
      </div>

      {/* Input Form */}
      <Card className="p-6">
        <div className="flex gap-4">
          <Input
            placeholder="输入 Bundle ID，例如：com.f9g0h1i2j3.IlIIll"
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleTest()}
            className="flex-1"
          />
          <Button onClick={handleTest} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                测试中...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                开始测试
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <Card className="p-6 bg-blue-50 border-blue-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">测试摘要</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-600">总操作记录数</div>
                <div className="text-3xl font-bold text-blue-600">
                  {result.summary.totalOperations}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">发布记录数</div>
                <div className="text-2xl font-bold text-green-600">
                  {result.summary.productionCount}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">更新记录数</div>
                <div className="text-2xl font-bold text-purple-600">
                  {result.summary.updateCount}
                </div>
              </div>
            </div>
          </Card>

          {/* App Info */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">App基本信息</h2>
              {result.appInfo.found ? (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  找到
                </Badge>
              ) : (
                <Badge className="bg-red-100 text-red-800 border-red-200">
                  <XCircle className="w-3 h-3 mr-1" />
                  未找到
                </Badge>
              )}
            </div>

            {result.appInfo.found && result.appInfo.processed && (
              <div className="space-y-2 text-sm">
                <div className="flex">
                  <span className="w-32 text-gray-600">App名称:</span>
                  <span className="font-medium">{safeDisplay(result.appInfo.processed.appName)}</span>
                </div>
                <div className="flex">
                  <span className="w-32 text-gray-600">App ID:</span>
                  <span className="font-medium">{safeDisplay(result.appInfo.processed.appId)}</span>
                </div>
                <div className="flex">
                  <span className="w-32 text-gray-600">开发者账号:</span>
                  <span className="font-medium">{safeDisplay(result.appInfo.processed.accountName)}</span>
                </div>
                <div className="flex">
                  <span className="w-32 text-gray-600">App状态:</span>
                  <span className="font-medium">{safeDisplay(result.appInfo.processed.appStatus)}</span>
                </div>
                <div className="flex">
                  <span className="w-32 text-gray-600">下架时间:</span>
                  <span className="font-medium">{safeDisplay(result.appInfo.processed.removalTime)}</span>
                </div>
                <div className="flex">
                  <span className="w-32 text-gray-600">产品记录ID:</span>
                  <span className="text-xs font-mono text-gray-500">
                    {safeDisplay(result.appInfo.processed.productRowId)}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Production Records */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                发布记录（App生产发布表）
              </h2>
              <Badge className="bg-green-100 text-green-800 border-green-200">
                {result.productionRecords.count} 条
              </Badge>
            </div>

            {result.productionRecords.processed.length > 0 ? (
              <div className="space-y-3">
                {result.productionRecords.processed.map((record, idx) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-lg border">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">App名称: </span>
                        <span className="font-medium">{safeDisplay(record.appName)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">版本号: </span>
                        <span className="font-medium">{safeDisplay(record.version)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">广告代码版本: </span>
                        <span className="font-medium">{safeDisplay(record.adVersion)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">操作人: </span>
                        <span className="font-medium">{safeDisplay(record.operator)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">发布地点: </span>
                        <span className="font-medium">{safeDisplay(record.location)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">发布时间: </span>
                        <span className="font-medium">{safeDisplay(record.releaseTime)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                没有发布记录
              </div>
            )}
          </Card>

          {/* Update Records */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                更新记录（App更新任务表）
              </h2>
              <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                {result.updateRecords.count} 条
              </Badge>
            </div>

            {result.updateRecords.processed.length > 0 ? (
              <div className="space-y-3">
                {result.updateRecords.processed.map((record, idx) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-lg border">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">任务名称: </span>
                        <span className="font-medium">{safeDisplay(record.taskName)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">版本号: </span>
                        <span className="font-medium">{safeDisplay(record.version)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">广告代码版本: </span>
                        <span className="font-medium">{safeDisplay(record.adVersion)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">发布人: </span>
                        <span className="font-medium">{safeDisplay(record.operator)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">发布地点: </span>
                        <span className="font-medium">{safeDisplay(record.location)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">提交时间: </span>
                        <span className="font-medium">{safeDisplay(record.submitTime)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                没有更新记录
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

