'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, ArrowUpDown } from 'lucide-react';

interface ProjectFiltersProps {
  onSearchChange: (search: string) => void;
  onSortChange: (sortBy: 'name' | 'createdAt' | 'bundleId', sortOrder: 'asc' | 'desc') => void;
  currentSortBy: 'name' | 'createdAt' | 'bundleId';
  currentSortOrder: 'asc' | 'desc';
}

export function ProjectFilters({
  onSearchChange,
  onSortChange,
  currentSortBy,
  currentSortOrder,
}: ProjectFiltersProps) {
  const [searchValue, setSearchValue] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange(searchValue);
  };

  const handleClearSearch = () => {
    setSearchValue('');
    onSearchChange('');
  };

  const toggleSort = (field: 'name' | 'createdAt' | 'bundleId') => {
    if (currentSortBy === field) {
      // 切换排序方向
      onSortChange(field, currentSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // 切换到新字段，默认降序
      onSortChange(field, 'desc');
    }
  };

  const getSortLabel = (field: 'name' | 'createdAt' | 'bundleId') => {
    const labels = {
      name: '名称',
      createdAt: '创建时间',
      bundleId: 'Bundle ID',
    };
    return labels[field];
  };

  return (
    <div className="space-y-4">
      {/* 搜索框 */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="搜索项目名称或 Bundle ID..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchValue && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button type="submit">搜索</Button>
      </form>

      {/* 排序按钮 */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-sm text-gray-600 flex items-center">排序：</span>
        {(['createdAt', 'name', 'bundleId'] as const).map((field) => (
          <Button
            key={field}
            variant={currentSortBy === field ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleSort(field)}
            className="gap-1"
          >
            {getSortLabel(field)}
            {currentSortBy === field && (
              <ArrowUpDown className="w-3 h-3" />
            )}
            {currentSortBy === field && (
              <span className="text-xs">
                {currentSortOrder === 'asc' ? '↑' : '↓'}
              </span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}


