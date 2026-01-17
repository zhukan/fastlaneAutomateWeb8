'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Users, Shield, Loader2, AlertTriangle, CheckCircle, UserCog, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { UserProfile, UserRole, ROLE_CONFIG } from '@/lib/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function TeamPage() {
  const { isAdmin, user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  
  // 新增用户对话框状态
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'operator' as UserRole,
  });

  useEffect(() => {
    // 等待用户信息加载完成
    if (!user) {
      return;
    }

    // 权限检查：只有管理员可以访问
    if (!isAdmin) {
      toast.error('权限不足：只有管理员可以访问团队管理');
      router.push('/overview');
      return;
    }

    // 管理员 - 加载用户列表
    loadUsers();
  }, [isAdmin, user, router]);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error('加载用户列表失败:', err);
      toast.error('加载用户列表失败：' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      setUpdatingUserId(userId);

      // 检查是否是最后一个管理员
      const adminCount = users.filter((u) => u.role === 'admin').length;
      const currentUser = users.find((u) => u.id === userId);
      
      if (currentUser?.role === 'admin' && adminCount === 1 && newRole !== 'admin') {
        toast.error('操作失败：系统至少需要一个管理员账号');
        return;
      }

      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      // 更新本地状态
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, role: newRole } : user
        )
      );

      toast.success('角色已更新');
    } catch (err: any) {
      console.error('更新角色失败:', err);
      toast.error('更新角色失败：' + err.message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const createUser = async () => {
    try {
      setIsCreating(true);

      // 验证表单
      if (!newUserForm.email || !newUserForm.password) {
        toast.error('邮箱和密码是必填项');
        return;
      }

      // 验证邮箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newUserForm.email)) {
        toast.error('邮箱格式不正确');
        return;
      }

      // 验证密码长度
      if (newUserForm.password.length < 6) {
        toast.error('密码长度至少为6个字符');
        return;
      }

      // 获取当前用户的 session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('未登录，请重新登录');
        return;
      }

      // 调用后端API创建用户
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(newUserForm),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '创建用户失败');
      }

      toast.success('用户创建成功');
      
      // 关闭对话框并重置表单
      setIsAddDialogOpen(false);
      setNewUserForm({
        email: '',
        password: '',
        fullName: '',
        role: 'operator',
      });

      // 刷新用户列表
      loadUsers();
    } catch (err: any) {
      console.error('创建用户失败:', err);
      toast.error('创建用户失败：' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // 等待用户信息加载
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // 非管理员不显示内容（会自动跳转）
  if (!isAdmin) {
    return null;
  }

  // 加载用户列表中
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">团队管理</h1>
        <p className="text-gray-600 mt-1">管理团队成员和权限分配</p>
      </div>

      {/* 权限说明 */}
      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">角色权限说明</p>
              <div className="mt-2 space-y-1">
                <p>
                  <span className="font-medium">管理员：</span>
                  拥有全部功能权限，可以访问所有页面和管理团队成员角色。
                </p>
                <p>
                  <span className="font-medium">操作员：</span>
                  只能访问发布看板、发布操作、发布历史和设置页面，无法访问高级功能。
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                团队成员
                <span className="text-sm font-normal text-gray-500 ml-2">
                  （共 {users.length} 人）
                </span>
              </CardTitle>
              <CardDescription className="mt-1.5">
                管理团队成员的角色和权限。系统至少需要保留一个管理员账号。
              </CardDescription>
            </div>
            
            {/* 添加成员按钮 */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  添加成员
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>添加新成员</DialogTitle>
                  <DialogDescription>
                    创建新用户账号并分配角色。新用户可以立即使用该账号登录系统。
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">
                      邮箱 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={newUserForm.email}
                      onChange={(e) =>
                        setNewUserForm({ ...newUserForm, email: e.target.value })
                      }
                      disabled={isCreating}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">
                      密码 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="至少6个字符"
                      value={newUserForm.password}
                      onChange={(e) =>
                        setNewUserForm({ ...newUserForm, password: e.target.value })
                      }
                      disabled={isCreating}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="fullName">姓名（可选）</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="用户姓名"
                      value={newUserForm.fullName}
                      onChange={(e) =>
                        setNewUserForm({ ...newUserForm, fullName: e.target.value })
                      }
                      disabled={isCreating}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="role">角色</Label>
                    <Select
                      value={newUserForm.role}
                      onValueChange={(value) =>
                        setNewUserForm({ ...newUserForm, role: value as UserRole })
                      }
                      disabled={isCreating}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="operator">
                          <div className="flex items-center gap-2">
                            <UserCog className="w-3 h-3" />
                            操作员
                          </div>
                        </SelectItem>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <Shield className="w-3 h-3" />
                            管理员
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      {newUserForm.role === 'admin'
                        ? '管理员拥有全部功能权限'
                        : '操作员只能访问核心发布功能'}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                    disabled={isCreating}
                  >
                    取消
                  </Button>
                  <Button onClick={createUser} disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        创建中...
                      </>
                    ) : (
                      '创建用户'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>暂无团队成员</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>加入时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user, index) => {
                    const roleConfig = ROLE_CONFIG[user.role];
                    const isUpdating = updatingUserId === user.id;
                    const isFirstUser = index === 0;

                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium text-gray-500">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-gray-900">
                              {user.full_name || user.email}
                            </p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
                                user.role === 'admin'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-gray-100 text-gray-700'
                              )}
                            >
                              {user.role === 'admin' && (
                                <Shield className="w-3 h-3" />
                              )}
                              {user.role === 'operator' && (
                                <UserCog className="w-3 h-3" />
                              )}
                              {roleConfig.label}
                            </span>
                            {isFirstUser && (
                              <span className="text-xs text-gray-400">
                                （首位用户）
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(user.created_at || '').toLocaleDateString('zh-CN')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Select
                            value={user.role}
                            onValueChange={(value) =>
                              updateUserRole(user.id, value as UserRole)
                            }
                            disabled={isUpdating}
                          >
                            <SelectTrigger className="w-[120px] ml-auto">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">
                                <div className="flex items-center gap-2">
                                  <Shield className="w-3 h-3" />
                                  管理员
                                </div>
                              </SelectItem>
                              <SelectItem value="operator">
                                <div className="flex items-center gap-2">
                                  <UserCog className="w-3 h-3" />
                                  操作员
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 统计信息 */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">管理员</p>
                <p className="text-2xl font-bold text-gray-900">
                  {users.filter((u) => u.role === 'admin').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <UserCog className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">操作员</p>
                <p className="text-2xl font-bold text-gray-900">
                  {users.filter((u) => u.role === 'operator').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
