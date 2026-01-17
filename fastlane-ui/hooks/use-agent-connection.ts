import { useEffect } from 'react';
import { agentClient } from '@/lib/agent-client';
import { useAppStore } from '@/lib/store';

export function useAgentConnection() {
  const { isConnected, setConnected } = useAppStore();

  useEffect(() => {
    // 初始检查
    checkConnection();

    // 定期检查连接
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, []);

  async function checkConnection() {
    const connected = await agentClient.checkConnection();
    setConnected(connected);
  }

  return { isConnected, checkConnection };
}

