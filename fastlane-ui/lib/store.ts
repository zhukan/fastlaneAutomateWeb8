import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Project, GlobalConfig, UserProfile, UserRole } from './types';

interface User {
  id: string;
  email: string;
  role?: UserRole;
  profile?: UserProfile;
}

interface AppState {
  // 连接状态
  isConnected: boolean;
  setConnected: (connected: boolean) => void;

  // 用户状态
  user: User | null;
  setUser: (user: User | null) => void;
  clearUser: () => void;
  setUserProfile: (profile: UserProfile | null) => void;

  // 全局配置
  globalConfig: GlobalConfig | null;
  setGlobalConfig: (config: GlobalConfig | null) => void;

  // 项目列表
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
  // 连接状态
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),

  // 用户状态
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
  setUserProfile: (profile) =>
    set((state) => ({
      user: state.user && profile ? { ...state.user, profile, role: profile.role } : null,
    })),

  // 全局配置
  globalConfig: null,
  setGlobalConfig: (config) => set({ globalConfig: config }),

  // 项目列表
  projects: [],
  setProjects: (projects) => set({ projects }),
  addProject: (project) =>
    set((state) => ({ projects: [...state.projects, project] })),
  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    })),
  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),
    }),
    {
      name: 'fastlane-storage', // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user, // 只持久化用户信息
      }),
    }
  )
);

