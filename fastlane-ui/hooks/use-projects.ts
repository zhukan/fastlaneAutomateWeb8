import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentClient } from '@/lib/agent-client';
import { useAppStore } from '@/lib/store';
import { Project, ProjectsQueryParams } from '@/lib/types';

export function useProjects(params?: ProjectsQueryParams) {
  const { setProjects } = useAppStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['projects', params],
    queryFn: async () => {
      const response = await agentClient.getProjects(params);
      setProjects(response.projects);
      return response;
    },
    refetchInterval: 10000, // 每 10 秒刷新
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => agentClient.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return {
    projects: data?.projects || [],
    pagination: data?.pagination,
    isLoading,
    deleteProject: deleteProjectMutation.mutate,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  };
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => agentClient.getProject(id),
    enabled: !!id,
  });
}

export function useProjectInfo(id: string) {
  return useQuery({
    queryKey: ['projects', id, 'info'],
    queryFn: () => agentClient.getProjectInfo(id),
    enabled: !!id,
    refetchInterval: 30000, // 每 30 秒刷新版本信息
  });
}

