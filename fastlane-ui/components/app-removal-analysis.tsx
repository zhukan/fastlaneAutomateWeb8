'use client';

import { useState, useEffect } from 'react';
import { FileText, Save, Loader2, Check, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AppRemovalAnalysisProps {
  bundleId: string;
}

interface AnalysisData {
  bundleId: string;
  analysisContent: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function AppRemovalAnalysis({ bundleId }: AppRemovalAnalysisProps) {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  // 加载分析数据
  useEffect(() => {
    if (!bundleId) return;
    
    const loadAnalysis = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/removal-investigation/apps/${encodeURIComponent(bundleId)}/analysis`
        );
        
        // 检查响应状态
        if (!response.ok) {
          if (response.status === 404) {
            // 404 表示数据不存在，这是正常的
            setAnalysis(null);
            setContent('');
            setIsExpanded(false); // 没有数据，默认折叠
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // 检查 content-type 是否为 JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('API 返回非 JSON 响应');
          setAnalysis(null);
          setContent('');
          setIsExpanded(false); // 没有数据，默认折叠
          return;
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
          setAnalysis(result.data);
          setContent(result.data.analysisContent || '');
          // 如果有内容，默认展开；否则默认折叠
          setIsExpanded(!!(result.data.analysisContent?.trim()));
        } else {
          setAnalysis(null);
          setContent('');
          setIsExpanded(false); // 没有数据，默认折叠
        }
      } catch (error) {
        console.error('加载下架原因分析失败:', error);
        // 不显示错误信息，静默失败
        setAnalysis(null);
        setContent('');
        setIsExpanded(false); // 出错时默认折叠
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalysis();
  }, [bundleId]);

  // 保存分析
  const handleSave = async () => {
    if (!content.trim()) {
      setErrorMessage('分析内容不能为空');
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

    setIsSaving(true);
    setSaveStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/removal-investigation/apps/${encodeURIComponent(bundleId)}/analysis`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            analysisContent: content,
            operator: '系统操作员', // 可以从用户登录信息获取
          }),
        }
      );

      // 检查响应状态
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 检查 content-type
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('API 返回非 JSON 响应');
      }

      const result = await response.json();

      if (result.success) {
        setSaveStatus('success');
        // 重新加载数据
        try {
          const refreshResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/removal-investigation/apps/${encodeURIComponent(bundleId)}/analysis`
          );
          if (refreshResponse.ok) {
            const refreshResult = await refreshResponse.json();
            if (refreshResult.success && refreshResult.data) {
              setAnalysis(refreshResult.data);
            }
          }
        } catch (refreshError) {
          console.error('刷新数据失败:', refreshError);
        }
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        setErrorMessage(result.error || '保存失败');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('保存下架原因分析失败:', error);
      setSaveStatus('error');
      setErrorMessage('保存失败，请检查后端服务是否运行');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-gray-600" />
          <h3 className="font-semibold text-gray-900">APP 下架原因分析和猜测</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span className="ml-2 text-sm text-gray-500">加载中...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      {/* 标题 - 可折叠 */}
      <div 
        className="flex items-center justify-between cursor-pointer hover:bg-gray-50 -m-4 p-4 rounded-lg transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          )}
          <FileText className="w-4 h-4 text-gray-600" />
          <h3 className="font-semibold text-gray-900">APP 下架原因分析和猜测</h3>
          {/* 如果有内容但未展开，显示内容预览 */}
          {!isExpanded && content && (
            <Badge variant="secondary" className="text-xs">
              有分析内容
            </Badge>
          )}
        </div>
        {analysis && analysis.updatedAt && (
          <Badge variant="outline" className="text-xs">
            {format(new Date(analysis.updatedAt), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
          </Badge>
        )}
      </div>

      {/* 展开的内容 */}
      {isExpanded && (
        <div className="mt-4 space-y-3">
          {/* 输入框 */}
          <div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`被下架检查流程：
1）首先登录账号，查看被下原因；一般可能是app原因；可能是账号本身原因（close）
2）如果是App原因：
  2.1）列出被下架app的下架时间、名称、bundle_id、广告代码版本、存活时长，并开始猜测原因
    2.1.1）常规比对找共性
    2.1.2）去七麦下架榜看当天的下架情况
      - 如果只下了我们，那么就要找我们自己的问题
      - 如果是一个词下，app全下，则可以归纳为这个词下，全部app全部撸掉，同时可以看同行的同开发者应用判断是不是这个词引起的下架`}
              className="min-h-[180px] text-sm resize-y"
              disabled={isSaving}
              rows={10}
            />
          </div>

          {/* 元信息 */}
          {analysis && (analysis.createdBy || analysis.updatedBy) && (
            <div className="text-xs text-gray-500 space-y-1">
              {analysis.createdBy && (
                <div>创建人: {analysis.createdBy}</div>
              )}
              {analysis.updatedBy && analysis.updatedBy !== analysis.createdBy && (
                <div>更新人: {analysis.updatedBy}</div>
              )}
            </div>
          )}

          {/* 保存按钮和状态 */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={isSaving || saveStatus === 'success'}
              size="sm"
              className="min-w-[80px]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  保存中...
                </>
              ) : saveStatus === 'success' ? (
                <>
                  <Check className="w-3 h-3 mr-1" />
                  已保存
                </>
              ) : (
                <>
                  <Save className="w-3 h-3 mr-1" />
                  保存
                </>
              )}
            </Button>

            {saveStatus === 'success' && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <Check className="w-3 h-3" />
                保存成功
              </span>
            )}

            {saveStatus === 'error' && (
              <span className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errorMessage || '保存失败'}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

