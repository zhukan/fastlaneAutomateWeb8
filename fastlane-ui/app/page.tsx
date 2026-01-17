'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // 直接跳转到发布看板
    // AuthGuard 会处理未登录的情况（自动跳转到 /login）
    router.replace('/overview');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500">跳转中...</div>
    </div>
  );
}
