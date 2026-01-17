'use client';

import { ConnectionStatus } from '@/components/connection-status';
import { Navbar } from '@/components/navbar';

export function TopBar() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* 左侧：系统名称 */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Fastlane UI 8</h1>
        <p className="text-xs text-gray-500">iOS 应用发布管理系统</p>
      </div>

      {/* 右侧：连接状态 + 用户菜单 */}
      <div className="flex items-center gap-4">
        <ConnectionStatus />
        <Navbar />
      </div>
    </header>
  );
}

