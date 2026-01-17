'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';
import { UserProfile } from '@/lib/types';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [hasChecked, setHasChecked] = useState(false); // 标记是否已检查过
  const setUser = useAppStore((state) => state.setUser);
  const setUserProfile = useAppStore((state) => state.setUserProfile);
  const user = useAppStore((state) => state.user);

  useEffect(() => {
    // 登录页面不需要检查
    if (pathname === '/login') {
      console.log('[AuthGuard] 登录页面，跳过检查');
      setIsLoading(false);
      return;
    }

    // 如果已经检查过且有用户信息，跳过检查（避免每次切换页面都检查）
    if (hasChecked && user) {
      console.log('[AuthGuard] 用户已登录，跳过检查');
      setIsLoading(false);
      return;
    }

    // 如果 store 中有用户信息（从 localStorage 恢复的），先验证 session 是否有效
    if (user && !hasChecked) {
      console.log('[AuthGuard] 检测到持久化的用户信息，验证 session...');
      // 快速验证 session，不等待超时
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (session?.user && session.user.id === user.id) {
          console.log('[AuthGuard] Session 有效，使用持久化的用户信息');
          setHasChecked(true);
          setIsLoading(false);
        } else {
          console.log('[AuthGuard] Session 无效，清除持久化的用户信息');
          setUser(null);
          setUserProfile(null);
          setIsLoading(false);
          router.push('/login');
        }
      }).catch((error) => {
        console.error('[AuthGuard] Session 验证失败:', error);
        // Session 验证失败，但不清除用户信息，让用户继续使用
        setHasChecked(true);
        setIsLoading(false);
      });
      return;
    }

    // 检查登录状态并加载用户配置
    const checkAuth = async () => {
      console.log('[AuthGuard] 开始检查认证状态，当前路径:', pathname);
      try {
        // 添加超时处理（15秒，适应慢速网络）
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session check timeout')), 15000)
        );
        
        const sessionPromise = supabase.auth.getSession();
        
        const { data: { session }, error: sessionError } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]) as any;
        
        console.log('[AuthGuard] Session 检查完成');
        
        // 如果 Supabase 连接失败，直接跳转到登录页
        if (sessionError) {
          console.error('[AuthGuard] Session error:', sessionError);
          setIsLoading(false);
          router.push('/login');
          return;
        }
        
        console.log('[AuthGuard] Session 状态:', session?.user ? '已登录' : '未登录');
        
        if (session?.user) {
          // 加载用户配置（包含角色信息）
          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profileError) {
            console.error('[AuthGuard] 加载用户配置失败:', profileError);
            
            // 如果用户配置不存在，使用默认配置（操作员）
            // 触发器应该会自动创建，但为了避免阻塞，这里先用默认值
            const defaultProfile: UserProfile = {
              id: session.user.id,
              email: session.user.email || '',
              role: 'operator', // 默认为操作员
              enable_app_removal_monitor: false,
              enable_target_app_monitor: false,
            };
            
            console.log('[AuthGuard] 使用默认配置');
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              role: 'operator',
              profile: defaultProfile,
            });
            
            setUserProfile(defaultProfile);
            setHasChecked(true); // 标记已检查
            setIsLoading(false);
            return;
          }

          const userProfile: UserProfile = profile;
          
          console.log('[AuthGuard] 加载用户配置成功，角色:', userProfile.role);
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            role: userProfile.role,
            profile: userProfile,
          });
          
          setUserProfile(userProfile);
          setHasChecked(true); // 标记已检查
          setIsLoading(false);
        } else {
          // 没有 session，直接跳转到登录页
          console.log('[AuthGuard] 未登录，跳转到登录页');
          setIsLoading(false);
          router.push('/login');
          return;
        }
      } catch (error: any) {
        console.error('[AuthGuard] Auth check failed:', error);
        // 超时或错误，直接跳转到登录页
        setIsLoading(false);
        router.push('/login');
        return;
      }
    };

    checkAuth();

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // 加载用户配置
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          const userProfile: UserProfile = profile;
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            role: userProfile.role,
            profile: userProfile,
          });
          setUserProfile(userProfile);
        }
      } else {
        if (pathname !== '/login') {
          router.push('/login');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router, setUser, setUserProfile, hasChecked, user]); // hasChecked 和 user 用于判断

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  // 登录页面直接显示
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // 未登录时显示加载（会跳转到登录页）
  if (!user) {
    return null;
  }

  return <>{children}</>;
}

