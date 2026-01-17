'use client';

import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { RoleGuard } from '@/components/role-guard';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* 侧边栏 */}
      <Sidebar />

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <TopBar />

        {/* 页面内容 - 带权限保护 */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <RoleGuard>{children}</RoleGuard>
        </main>
      </div>
    </div>
  );
}

