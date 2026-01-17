'use client';

import { useAgentConnection } from '@/hooks/use-agent-connection';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

export function ConnectionStatus() {
  const { isConnected, checkConnection } = useAgentConnection();

  return (
    <div className="flex items-center gap-2">
      <Badge variant={isConnected ? 'default' : 'destructive'}>
        {isConnected ? '✓ 已连接' : '✗ 未连接'}
      </Badge>
      <button
        onClick={checkConnection}
        className="p-1 hover:bg-gray-100 rounded"
        title="刷新连接状态"
      >
        <RefreshCw className="w-4 h-4" />
      </button>
      {!isConnected && (
        <span className="text-sm text-gray-500">
          请确保 Agent 已启动 (localhost:3000)
        </span>
      )}
    </div>
  );
}

