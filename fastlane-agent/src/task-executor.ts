import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Task, DeployType, DeployStep, TaskStatus } from './types';
import { StepParser } from './step-parser';
import { v4 as uuidv4 } from 'uuid';
import { supabaseClient } from './supabase-client';
import { ConfigManager } from './config-manager';
import os from 'os';

export class TaskExecutor extends EventEmitter {
  private activeTasks: Map<string, ChildProcess> = new Map();
  private taskData: Map<string, Task> = new Map();
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    super();
    this.configManager = configManager;
  }

  async executeTask(
    projectId: string,
    projectPath: string,
    deployType: DeployType,
    options?: { 
      isFirstRelease?: boolean;
      userId?: string;
    }
  ): Promise<string> {
    const taskId = uuidv4();
    const stepParser = new StepParser();

    const task: Task = {
      id: taskId,
      projectId,
      type: deployType,
      status: 'pending',
      steps: [],
      logs: [],
      startTime: Date.now(),
      options,  // 保存 options（包含 isFirstRelease 和 userId）
    };

    this.taskData.set(taskId, task);

    // 在下一个事件循环开始执行
    setImmediate(() => {
      this.runFastlane(taskId, projectPath, deployType, stepParser, options);
    });

    return taskId;
  }

  private runFastlane(
    taskId: string,
    projectPath: string,
    deployType: DeployType,
    stepParser: StepParser,
    options?: { 
      isFirstRelease?: boolean;
      userId?: string;
    }
  ): void {
    const task = this.taskData.get(taskId);
    if (!task) return;

    task.status = 'running';
    this.emit(`status:${taskId}`, 'running');

    // 构建 fastlane 命令参数
    const args: string[] = [deployType];
    
    // 传递发布类型参数
    if (options?.isFirstRelease !== undefined) {
      args.push(`is_first_release:${options.isFirstRelease ? 'true' : 'false'}`);
    }

    // 执行 fastlane 命令
    const fastlane = spawn('fastlane', args, {
      cwd: projectPath,
      env: {
        ...process.env,
        FASTLANE_SKIP_UPDATE_CHECK: '1',
        FASTLANE_DISABLE_COLORS: '0', // 保留颜色
      },
    });

    this.activeTasks.set(taskId, fastlane);

    // 处理 stdout
    fastlane.stdout.on('data', (data: Buffer) => {
      const logLine = data.toString();
      this.handleLog(taskId, logLine, stepParser);
    });

    // 处理 stderr
    fastlane.stderr.on('data', (data: Buffer) => {
      const logLine = data.toString();
      this.handleLog(taskId, logLine, stepParser);
    });

    // 处理错误
    fastlane.on('error', (error) => {
      console.error(`Task ${taskId} error:`, error);
      this.handleTaskFailure(taskId, error.message);
    });

    // 处理完成
    fastlane.on('close', async (code) => {
      this.activeTasks.delete(taskId);

      if (code === 0) {
        await this.handleTaskSuccess(taskId);
      } else {
        this.handleTaskFailure(
          taskId,
          `Fastlane exited with code ${code}`
        );
      }
    });
  }

  private handleLog(
    taskId: string,
    logLine: string,
    stepParser: StepParser
  ): void {
    const task = this.taskData.get(taskId);
    if (!task) return;

    // 保存日志
    task.logs.push(logLine);

    // 发送日志事件
    this.emit(`log:${taskId}`, {
      type: 'log',
      content: logLine,
      timestamp: Date.now(),
    });

    // 解析步骤
    const step = stepParser.parseStep(logLine);
    if (step) {
      task.steps = stepParser.getAllSteps();
      this.emit(`progress:${taskId}`, {
        type: 'progress',
        step,
        timestamp: Date.now(),
      });
    }

    // 检查错误
    if (stepParser.checkError(logLine)) {
      // 记录错误，但不立即失败（等待进程退出）
      if (!task.error) {
        task.error = logLine.trim();
      }
    }
  }

  private async handleTaskSuccess(taskId: string): Promise<void> {
    const task = this.taskData.get(taskId);
    if (!task) return;

    task.status = 'success';
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;

    // 更新所有步骤为成功
    task.steps = task.steps.map((step) =>
      step.status === 'running' ? { ...step, status: 'success' } : step
    );

    // 只有 release 类型才保存到 Supabase（beta 不保存）
    if (task.type === 'release' && task.status === 'success') {
      try {
        // 检查必须的 userId
        if (!task.options?.userId) {
          console.warn('[Release] Cannot save release: userId is required');
        } else {
          const project = this.configManager.getProject(task.projectId);
          if (!project) {
            console.error('[Release] Project not found:', task.projectId);
          } else {
            // 收集 metadata（只收集容易获取的信息）
            const metadata = {
              hostname: os.hostname(),
              macos_version: os.release(),
            };

            await supabaseClient.createRelease({
              project_id: project.id,
              bundle_id: project.bundleId,
              app_name: project.name,
              version: project.currentVersion || '',
              build_number: project.currentBuild || '',
              is_first_release: task.options?.isFirstRelease || false,
              apple_id: project.appleId,
              team_id: project.teamId,
              itc_team_id: project.itcTeamId,
              api_key_id: project.apiKeyId,
              api_key_issuer_id: project.apiKeyIssuerId,
              api_key_content: project.apiKeyContent,
              submitted_at: new Date(task.startTime).toISOString(),
              completed_at: new Date(task.endTime).toISOString(),
              duration: Math.floor(task.duration / 1000), // 转换为秒
              task_id: taskId,
              deployed_by: task.options.userId,
              metadata,
            });

            console.log('[Release] Release record saved to Supabase');
          }
        }
      } catch (error: any) {
        console.error('[Release] Failed to save release to Supabase:', error.message);
        // 不影响主流程，只记录错误
      }
    }

    this.emit(`complete:${taskId}`, {
      type: 'complete',
      task,
      timestamp: Date.now(),
    });
  }

  private handleTaskFailure(taskId: string, error: string): void {
    const task = this.taskData.get(taskId);
    if (!task) return;

    task.status = 'failed';
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    task.error = task.error || error;

    // 更新当前步骤为失败
    task.steps = task.steps.map((step) =>
      step.status === 'running' ? { ...step, status: 'failed' } : step
    );

    this.emit(`complete:${taskId}`, {
      type: 'complete',
      task,
      timestamp: Date.now(),
    });
  }

  getTask(taskId: string): Task | undefined {
    return this.taskData.get(taskId);
  }

  cancelTask(taskId: string): boolean {
    const process = this.activeTasks.get(taskId);
    const task = this.taskData.get(taskId);

    if (process && task) {
      process.kill('SIGTERM');
      task.status = 'cancelled';
      task.endTime = Date.now();
      task.duration = task.endTime - task.startTime;
      this.activeTasks.delete(taskId);
      return true;
    }

    return false;
  }

  // 清理旧任务（保留最近 100 个）
  cleanup(): void {
    const tasks = Array.from(this.taskData.entries());
    if (tasks.length > 100) {
      // 按时间排序，删除最旧的
      tasks.sort((a, b) => b[1].startTime - a[1].startTime);
      tasks.slice(100).forEach(([id]) => {
        this.taskData.delete(id);
      });
    }
  }
}

