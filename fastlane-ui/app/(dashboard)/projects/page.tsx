'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ProjectCard } from '@/components/project-card';
import { AddProjectDialog } from '@/components/add-project-dialog';
import { ProjectFilters } from '@/components/project-filters';
import { Pagination } from '@/components/pagination';
import { useProjects } from '@/hooks/use-projects';
import { useAppStore } from '@/lib/store';

export default function ProjectsPage() {
  const [showAddProject, setShowAddProject] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'bundleId'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const { projects, pagination, isLoading, refetch } = useProjects({
    page,
    pageSize: 20,
    search,
    sortBy,
    sortOrder,
  });
  const { isConnected } = useAppStore();

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  };

  const handleSortChange = (
    newSortBy: 'name' | 'createdAt' | 'bundleId',
    newSortOrder: 'asc' | 'desc'
  ) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="container mx-auto px-6 py-8">
      {!isConnected ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">无法连接到 Agent</h3>
          <p className="text-gray-600 mb-4">
            请确保本地 Agent 已启动
          </p>
          <div className="text-sm text-gray-500">
            <p>在 fastlane-agent 目录运行：</p>
            <code className="bg-gray-100 px-2 py-1 rounded">npm run dev</code>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">我的项目</h1>
              {pagination && (
                <p className="text-gray-600 mt-1">
                  共 {pagination.total} 个项目
                </p>
              )}
            </div>
            <Button onClick={() => setShowAddProject(true)}>
              <Plus className="w-4 h-4 mr-2" />
              添加项目
            </Button>
          </div>

          {/* 搜索和筛选 */}
          <div className="mb-6">
            <ProjectFilters
              onSearchChange={handleSearchChange}
              onSortChange={handleSortChange}
              currentSortBy={sortBy}
              currentSortOrder={sortOrder}
            />
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-gray-500">
              加载中...
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <h3 className="text-lg font-semibold mb-2">
                {search ? '没有找到匹配的项目' : '还没有项目'}
              </h3>
              <p className="text-gray-600 mb-4">
                {search ? (
                  <>尝试使用其他关键词搜索</>
                ) : (
                  <>添加你的第一个 iOS 项目开始使用</>
                )}
              </p>
              {!search && (
                <Button onClick={() => setShowAddProject(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  添加项目
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onDelete={refetch}
                    onUpdate={refetch}
                  />
                ))}
              </div>

              {/* 分页控件 */}
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-8">
                  <Pagination
                    currentPage={pagination.page}
                    totalPages={pagination.totalPages}
                    pageSize={pagination.pageSize}
                    total={pagination.total}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* 对话框 */}
      <AddProjectDialog
        open={showAddProject}
        onOpenChange={setShowAddProject}
        onSuccess={refetch}
      />
    </div>
  );
}

