'use client';

import { useState } from 'react';
import { X, ChevronDown, Download, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// 筛选条件类型定义
export interface FilterOptions {
  // 账号筛选
  accountSources: string[];
  accountRegions: string[];
  accountSurvivalDays: { min?: number; max?: number } | null;
  
  // 时间筛选
  pendingCloseDateRange: { start?: Date; end?: Date } | null;
  removalTimeRange: { start?: Date; end?: Date } | null;
  
  // 应用筛选
  appSurvivalDays: { min?: number; max?: number } | null;
  
  // 操作筛选
  adVersions: string[];
  operators: string[];
  locations: string[];
}

interface RemovedAppFilterProps {
  totalCount: number;
  filteredCount: number;
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  onExport?: (filters: FilterOptions, search?: string) => Promise<void>; // ⭐ 导出回调
  searchTerm?: string; // ⭐ 当前搜索词
  
  // 下拉选项数据源
  availableAccountSources: string[];
  availableRegions: string[];
  availableAdVersions: string[];
  availableOperators: string[];
  availableLocations: string[];
}

// 存活天数快捷选项
const SURVIVAL_DAY_PRESETS = [
  { label: '全部', value: null },
  { label: '<30天', value: { max: 30 } },
  { label: '30-60天', value: { min: 30, max: 60 } },
  { label: '60-90天', value: { min: 60, max: 90 } },
  { label: '90-180天', value: { min: 90, max: 180 } },
  { label: '>180天', value: { min: 180 } },
];

// 日期快捷选项
const DATE_PRESETS = [
  { label: '今天', days: 0 },
  { label: '近7天', days: 7 },
  { label: '近30天', days: 30 },
  { label: '近90天', days: 90 },
];

export function RemovedAppFilter({
  totalCount,
  filteredCount,
  filters,
  onFiltersChange,
  onExport,
  searchTerm,
  availableAccountSources,
  availableRegions,
  availableAdVersions,
  availableOperators,
  availableLocations,
}: RemovedAppFilterProps) {
  // 搜索框状态
  const [adVersionSearch, setAdVersionSearch] = useState('');
  const [operatorSearch, setOperatorSearch] = useState('');
  
  // 导出状态
  const [isExporting, setIsExporting] = useState(false);

  // 自定义天数输入状态
  const [customAccountDays, setCustomAccountDays] = useState({ min: '', max: '' });
  const [customAppDays, setCustomAppDays] = useState({ min: '', max: '' });

  // 更新筛选条件
  const updateFilters = (key: keyof FilterOptions, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  // 切换多选项
  const toggleArrayFilter = (key: keyof FilterOptions, value: string) => {
    const current = filters[key] as string[];
    const newValue = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilters(key, newValue);
  };

  // 清除单个筛选条件
  const clearFilter = (key: keyof FilterOptions) => {
    if (Array.isArray(filters[key])) {
      updateFilters(key, []);
    } else {
      updateFilters(key, null);
    }
  };

  // 清除所有筛选
  const clearAllFilters = () => {
    onFiltersChange({
      accountSources: [],
      accountRegions: [],
      accountSurvivalDays: null,
      pendingCloseDateRange: null,
      removalTimeRange: null,
      appSurvivalDays: null,
      adVersions: [],
      operators: [],
      locations: [],
    });
  };

  // 计算已应用的筛选条件数量
  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.accountSources.length > 0) count++;
    if (filters.accountRegions.length > 0) count++;
    if (filters.accountSurvivalDays) count++;
    if (filters.pendingCloseDateRange) count++;
    if (filters.removalTimeRange) count++;
    if (filters.appSurvivalDays) count++;
    if (filters.adVersions.length > 0) count++;
    if (filters.operators.length > 0) count++;
    if (filters.locations.length > 0) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  // 处理导出
  const handleExport = async () => {
    if (!onExport) return;
    
    try {
      setIsExporting(true);
      await onExport(filters, searchTerm);
    } catch (error) {
      console.error('导出失败:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // 渲染筛选标签
  const renderFilterTags = () => {
    const tags: React.ReactElement[] = [];

    // 账号来源
    if (filters.accountSources.length > 0) {
      filters.accountSources.forEach((source) => {
        tags.push(
          <Badge key={`source-${source}`} variant="secondary" className="gap-1">
            账号来源: {source}
            <X
              className="w-3 h-3 cursor-pointer hover:text-red-600"
              onClick={() => toggleArrayFilter('accountSources', source)}
            />
          </Badge>
        );
      });
    }

    // 账号区域
    if (filters.accountRegions.length > 0) {
      filters.accountRegions.forEach((region) => {
        tags.push(
          <Badge key={`region-${region}`} variant="secondary" className="gap-1">
            账号区域: {region}
            <X
              className="w-3 h-3 cursor-pointer hover:text-red-600"
              onClick={() => toggleArrayFilter('accountRegions', region)}
            />
          </Badge>
        );
      });
    }

    // 账号存活天数
    if (filters.accountSurvivalDays) {
      const { min, max } = filters.accountSurvivalDays;
      const label = min && max ? `${min}-${max}天` : min ? `>${min}天` : `<${max}天`;
      tags.push(
        <Badge key="account-days" variant="secondary" className="gap-1">
          账号存活: {label}
          <X
            className="w-3 h-3 cursor-pointer hover:text-red-600"
            onClick={() => clearFilter('accountSurvivalDays')}
          />
        </Badge>
      );
    }

    // 标记关停时间
    if (filters.pendingCloseDateRange) {
      const { start, end } = filters.pendingCloseDateRange;
      const label = start && end
        ? `${format(start, 'yyyy-MM-dd')} ~ ${format(end, 'yyyy-MM-dd')}`
        : start
        ? `>${format(start, 'yyyy-MM-dd')}`
        : `<${format(end!, 'yyyy-MM-dd')}`;
      tags.push(
        <Badge key="pending-close" variant="secondary" className="gap-1">
          标记关停: {label}
          <X
            className="w-3 h-3 cursor-pointer hover:text-red-600"
            onClick={() => clearFilter('pendingCloseDateRange')}
          />
        </Badge>
      );
    }

    // 下架时间
    if (filters.removalTimeRange) {
      const { start, end } = filters.removalTimeRange;
      const label = start && end
        ? `${format(start, 'yyyy-MM-dd')} ~ ${format(end, 'yyyy-MM-dd')}`
        : start
        ? `>${format(start, 'yyyy-MM-dd')}`
        : `<${format(end!, 'yyyy-MM-dd')}`;
      tags.push(
        <Badge key="removal-time" variant="secondary" className="gap-1">
          下架时间: {label}
          <X
            className="w-3 h-3 cursor-pointer hover:text-red-600"
            onClick={() => clearFilter('removalTimeRange')}
          />
        </Badge>
      );
    }

    // App存活天数
    if (filters.appSurvivalDays) {
      const { min, max } = filters.appSurvivalDays;
      const label = min && max ? `${min}-${max}天` : min ? `>${min}天` : `<${max}天`;
      tags.push(
        <Badge key="app-days" variant="secondary" className="gap-1">
          App存活: {label}
          <X
            className="w-3 h-3 cursor-pointer hover:text-red-600"
            onClick={() => clearFilter('appSurvivalDays')}
          />
        </Badge>
      );
    }

    // 广告版本
    if (filters.adVersions.length > 0) {
      filters.adVersions.forEach((version) => {
        tags.push(
          <Badge key={`ad-${version}`} variant="secondary" className="gap-1">
            广告版本: {version}
            <X
              className="w-3 h-3 cursor-pointer hover:text-red-600"
              onClick={() => toggleArrayFilter('adVersions', version)}
            />
          </Badge>
        );
      });
    }

    // 操作人
    if (filters.operators.length > 0) {
      filters.operators.forEach((operator) => {
        tags.push(
          <Badge key={`operator-${operator}`} variant="secondary" className="gap-1">
            操作人: {operator}
            <X
              className="w-3 h-3 cursor-pointer hover:text-red-600"
              onClick={() => toggleArrayFilter('operators', operator)}
            />
          </Badge>
        );
      });
    }

    // 发布地点
    if (filters.locations.length > 0) {
      filters.locations.forEach((location) => {
        tags.push(
          <Badge key={`location-${location}`} variant="secondary" className="gap-1">
            发布地点: {location}
            <X
              className="w-3 h-3 cursor-pointer hover:text-red-600"
              onClick={() => toggleArrayFilter('locations', location)}
            />
          </Badge>
        );
      });
    }

    return tags;
  };

  // 日期范围选择器组件
  const DateRangeSelector = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: { start?: Date; end?: Date } | null;
    onChange: (value: { start?: Date; end?: Date } | null) => void;
  }) => {
    const [tempStart, setTempStart] = useState<Date | undefined>(value?.start);
    const [tempEnd, setTempEnd] = useState<Date | undefined>(value?.end);

    const handleApply = () => {
      if (tempStart || tempEnd) {
        onChange({ start: tempStart, end: tempEnd });
      }
    };

    const handlePreset = (days: number) => {
      const end = new Date();
      const start = new Date();
      
      if (days === 0) {
        // "今天"：start和end都是今天（同一天）
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
      } else {
        // "近X天"：从X天前到今天
        start.setDate(start.getDate() - days);
      }
      
      setTempStart(start);
      setTempEnd(end);
      onChange({ start, end });
    };

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            {label}
            {value && <Badge variant="secondary" className="h-4 text-xs px-1">已选</Badge>}
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80">
          <DropdownMenuLabel>快捷选择</DropdownMenuLabel>
          <div className="px-2 py-2 space-y-1">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handlePreset(preset.days)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <DropdownMenuSeparator />
          <div className="p-2">
            <div className="text-sm font-medium mb-2">自定义范围</div>
            <div className="space-y-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    起始: {tempStart ? format(tempStart, 'yyyy-MM-dd') : '选择日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={tempStart}
                    onSelect={setTempStart}
                    locale={zhCN}
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    结束: {tempEnd ? format(tempEnd, 'yyyy-MM-dd') : '选择日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={tempEnd}
                    onSelect={setTempEnd}
                    locale={zhCN}
                  />
                </PopoverContent>
              </Popover>
              <Button size="sm" className="w-full" onClick={handleApply}>
                应用
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // 天数范围选择器组件
  const DaysRangeSelector = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: { min?: number; max?: number } | null;
    onChange: (value: { min?: number; max?: number } | null) => void;
  }) => {
    const [customMin, setCustomMin] = useState('');
    const [customMax, setCustomMax] = useState('');

    const handlePreset = (preset: { min?: number; max?: number } | null) => {
      onChange(preset);
    };

    const handleCustomApply = () => {
      const min = customMin ? parseInt(customMin) : undefined;
      const max = customMax ? parseInt(customMax) : undefined;
      if (min !== undefined || max !== undefined) {
        onChange({ min, max });
      }
    };

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            {label}
            {value && <Badge variant="secondary" className="h-4 text-xs px-1">已选</Badge>}
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuLabel>快捷选择</DropdownMenuLabel>
          <div className="px-2 py-2 space-y-1">
            {SURVIVAL_DAY_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handlePreset(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <DropdownMenuSeparator />
          <div className="p-2">
            <div className="text-sm font-medium mb-2">自定义范围</div>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                placeholder="最小"
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value)}
                className="w-20"
              />
              <span className="text-gray-500">~</span>
              <Input
                type="number"
                placeholder="最大"
                value={customMax}
                onChange={(e) => setCustomMax(e.target.value)}
                className="w-20"
              />
              <span className="text-sm text-gray-500">天</span>
            </div>
            <Button size="sm" className="w-full mt-2" onClick={handleCustomApply}>
              应用
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">筛选条件</h3>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500">
            共 {totalCount} 条，筛选后 {filteredCount} 条
          </div>
          {onExport && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={isExporting || filteredCount === 0}
              className="gap-1.5"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  导出Excel
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 所有筛选器横向排列 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* 账号来源 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              账号来源
              {filters.accountSources.length > 0 && (
                <Badge variant="secondary" className="h-4 text-xs px-1">{filters.accountSources.length}</Badge>
              )}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {availableAccountSources.map((source) => (
              <DropdownMenuCheckboxItem
                key={source}
                checked={filters.accountSources.includes(source)}
                onCheckedChange={() => toggleArrayFilter('accountSources', source)}
              >
                {source}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 账号区域 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              账号区域
              {filters.accountRegions.length > 0 && (
                <Badge variant="secondary" className="h-4 text-xs px-1">{filters.accountRegions.length}</Badge>
              )}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {availableRegions.map((region) => (
              <DropdownMenuCheckboxItem
                key={region}
                checked={filters.accountRegions.includes(region)}
                onCheckedChange={() => toggleArrayFilter('accountRegions', region)}
              >
                {region}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 账号存活天数 */}
        <DaysRangeSelector
          label="账号存活天数"
          value={filters.accountSurvivalDays}
          onChange={(value) => updateFilters('accountSurvivalDays', value)}
        />

        {/* 标记关停时间 */}
        <DateRangeSelector
          label="标记关停时间"
          value={filters.pendingCloseDateRange}
          onChange={(value) => updateFilters('pendingCloseDateRange', value)}
        />
        
        {/* 下架时间 */}
        <DateRangeSelector
          label="下架时间"
          value={filters.removalTimeRange}
          onChange={(value) => updateFilters('removalTimeRange', value)}
        />

        {/* App存活天数 */}
        <DaysRangeSelector
          label="App存活天数"
          value={filters.appSurvivalDays}
          onChange={(value) => updateFilters('appSurvivalDays', value)}
        />

        {/* 广告代码版本 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              广告代码版本
              {filters.adVersions.length > 0 && (
                <Badge variant="secondary" className="h-4 text-xs px-1">{filters.adVersions.length}</Badge>
              )}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <div className="p-2">
              <Input
                placeholder="搜索广告版本..."
                value={adVersionSearch}
                onChange={(e) => setAdVersionSearch(e.target.value)}
                className="mb-2"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {availableAdVersions
                .filter((v) => v.toLowerCase().includes(adVersionSearch.toLowerCase()))
                .map((version) => (
                  <DropdownMenuCheckboxItem
                    key={version}
                    checked={filters.adVersions.includes(version)}
                    onCheckedChange={() => toggleArrayFilter('adVersions', version)}
                  >
                    {version}
                  </DropdownMenuCheckboxItem>
                ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 操作人 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              操作人
              {filters.operators.length > 0 && (
                <Badge variant="secondary" className="h-4 text-xs px-1">{filters.operators.length}</Badge>
              )}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <div className="p-2">
              <Input
                placeholder="搜索操作人..."
                value={operatorSearch}
                onChange={(e) => setOperatorSearch(e.target.value)}
                className="mb-2"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {availableOperators
                .filter((op) => op.toLowerCase().includes(operatorSearch.toLowerCase()))
                .map((operator) => (
                  <DropdownMenuCheckboxItem
                    key={operator}
                    checked={filters.operators.includes(operator)}
                    onCheckedChange={() => toggleArrayFilter('operators', operator)}
                  >
                    {operator}
                  </DropdownMenuCheckboxItem>
                ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 发布地点 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              发布地点
              {filters.locations.length > 0 && (
                <Badge variant="secondary" className="h-4 text-xs px-1">{filters.locations.length}</Badge>
              )}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {availableLocations.map((location) => (
              <DropdownMenuCheckboxItem
                key={location}
                checked={filters.locations.includes(location)}
                onCheckedChange={() => toggleArrayFilter('locations', location)}
              >
                {location}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 清除按钮 */}
        {activeFilterCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearAllFilters}
            className="text-gray-500 hover:text-red-600"
          >
            清除全部 ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* 已应用的筛选条件标签 */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t">
          {renderFilterTags()}
        </div>
      )}
    </Card>
  );
}

