import { useEffect, useState, useRef } from 'react';
import { agentClient } from '@/lib/agent-client';
import { Task, SSEEvent, DeployStep } from '@/lib/types';

export function useTaskStream(taskId: string | null) {
  const [logs, setLogs] = useState<string[]>([]);
  const [steps, setSteps] = useState<DeployStep[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) return;

    // 重置状态
    setLogs([]);
    setSteps([]);
    setTask(null);
    setStreamError(null);
    setIsStreaming(true);

    // 启动 SSE 流
    const eventSource = agentClient.streamTask(
      taskId,
      (event: SSEEvent) => {
        switch (event.type) {
          case 'log':
            setLogs((prev) => [...prev, event.content]);
            break;
          case 'progress':
            setSteps((prev) => {
              // 更新或添加步骤
              const existing = prev.find((s) => s.id === event.step.id);
              if (existing) {
                return prev.map((s) =>
                  s.id === event.step.id ? event.step : s
                );
              } else {
                return [...prev, event.step];
              }
            });
            break;
          case 'status':
            setTask((prev) =>
              prev ? { ...prev, status: event.status } : null
            );
            break;
          case 'complete':
            setTask(event.task);
            setSteps(event.task.steps);
            setIsStreaming(false);
            break;
        }
      },
      (error) => {
        console.error('Stream error:', error);
        setStreamError(error.message);
        setIsStreaming(false);
      },
      () => {
        setIsStreaming(false);
      }
    );

    eventSourceRef.current = eventSource;

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [taskId]);

  const cancel = async () => {
    if (taskId) {
      try {
        await agentClient.cancelTask(taskId);
        eventSourceRef.current?.close();
        setIsStreaming(false);
      } catch (error) {
        console.error('Failed to cancel task:', error);
      }
    }
  };

  return {
    logs,
    steps,
    task,
    isStreaming,
    streamError,
    cancel,
  };
}

