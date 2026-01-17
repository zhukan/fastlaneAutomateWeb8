import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { ConfigManager } from './config-manager';
import { ProjectDetector } from './project-detector';
import { EnvGenerator } from './env-generator';
import { TaskExecutor } from './task-executor';
import { FastlaneTemplate } from './fastlane-template';
import { HapClient } from './hap-client';
import { ReviewMonitor } from './review-monitor';
import { AppRemovalMonitor } from './app-removal-monitor';
import { TargetAppMonitorService } from './target-app-monitor';
import { AppComparisonService } from './app-comparison-service';
import { AppRemovalInvestigationService } from './app-removal-investigation-service';
import { TestService } from './test-service';
import { UmengClient } from './umeng-client';
import { supabaseClient } from './supabase-client';
import { ExternalReleaseSync } from './external-release-sync';
import { Project } from './types';

export class FastlaneAgentServer {
  private app: express.Application;
  private configManager: ConfigManager;
  private projectDetector: ProjectDetector;
  private envGenerator: EnvGenerator;
  private taskExecutor: TaskExecutor;
  private fastlaneTemplate: FastlaneTemplate;
  private hapClient: HapClient | null;
  private reviewMonitor: ReviewMonitor | null = null;
  private appRemovalMonitor: AppRemovalMonitor | null = null;
  private targetAppMonitor: TargetAppMonitorService | null = null;
  private appComparisonService: AppComparisonService | null = null;
  private removalInvestigationService: AppRemovalInvestigationService | null = null;
  private testService: TestService | null = null;
  private externalReleaseSync: ExternalReleaseSync | null = null;
  private port: number;

  constructor(port: number = 3000) {
    this.app = express();
    this.port = port;
    this.configManager = new ConfigManager();
    this.projectDetector = new ProjectDetector();
    this.envGenerator = new EnvGenerator();
    this.taskExecutor = new TaskExecutor(this.configManager);
    this.fastlaneTemplate = new FastlaneTemplate();

    // 初始化明道云客户端（如果配置了 AppKey 和 Sign）
    const hapAppKey = process.env.HAP_APP_KEY;
    const hapSign = process.env.HAP_SIGN;
    const hapWorksheetProducts = process.env.HAP_WORKSHEET_PRODUCTS;
    const hapWorksheetAccounts = process.env.HAP_WORKSHEET_ACCOUNTS;
    const hapWorksheetProductionReleases = process.env.HAP_WORKSHEET_PRODUCTION_RELEASES;
    const hapAppKeyProductionReleases = process.env.HAP_APP_KEY_PRODUCTION_RELEASES;
    const hapSignProductionReleases = process.env.HAP_SIGN_PRODUCTION_RELEASES;

    if (hapAppKey && hapSign && hapWorksheetProducts && hapWorksheetAccounts) {
      this.hapClient = new HapClient({
        appKey: hapAppKey,
        sign: hapSign,
        worksheetProducts: hapWorksheetProducts,
        worksheetAccounts: hapWorksheetAccounts,
        worksheetProductionReleases: hapWorksheetProductionReleases,
        appKeyProductionReleases: hapAppKeyProductionReleases,
        signProductionReleases: hapSignProductionReleases,
      });
      console.log('[Server] ✅ 明道云客户端已初始化');
      if (hapWorksheetProductionReleases) {
        console.log('[Server] ✅ 降级查询功能已启用（支持首次发布场景）');
        if (hapAppKeyProductionReleases && hapSignProductionReleases) {
          console.log('[Server] ✅ 使用"App生产发布"表专用认证信息');
        }
      }
      
      // 初始化审核状态监控器（需要 Supabase 支持）
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseKey) {
        this.reviewMonitor = new ReviewMonitor(this.hapClient, supabaseClient);
        console.log('[Server] ✅ 审核状态监控器已初始化');
        
        // 初始化 App 下架监控器（3.5 版本新增）
        this.appRemovalMonitor = new AppRemovalMonitor(this.hapClient, supabaseClient);
        console.log('[Server] ✅ App 下架监控器已初始化');
        
        // 初始化目标包监控器（4.0 版本新增）
        this.targetAppMonitor = new TargetAppMonitorService(this.hapClient, supabaseClient);
        console.log('[Server] ✅ 目标包监控器已初始化');
        
        // 初始化友盟客户端（5.0 版本新增）
        const umengClient = new UmengClient();
        
        // 初始化关联对比服务（5.0 版本新增）
        this.appComparisonService = new AppComparisonService(this.hapClient, supabaseClient, umengClient);
        console.log('[Server] ✅ App 关联对比服务已初始化');
        
        // 初始化下架排查服务（6.0 版本新增）
        this.removalInvestigationService = new AppRemovalInvestigationService(this.hapClient, supabaseClient);
        console.log('[Server] ✅ App 下架排查服务已初始化');
        // ⏸️  自动同步已禁用：下架排查是事后分析工具，需要手动触发
        // this.removalInvestigationService.startAutoSync();
        
        // 初始化测试服务（6.0 版本新增）
        this.testService = new TestService(this.hapClient);
        console.log('[Server] ✅ 测试服务已初始化');
        
        // 初始化外部审核同步服务（8.0 版本新增）
        this.externalReleaseSync = new ExternalReleaseSync(this.hapClient, supabaseClient);
        console.log('[Server] ✅ 外部审核同步服务已初始化');
      } else {
        this.reviewMonitor = null;
        this.appRemovalMonitor = null;
        this.targetAppMonitor = null;
        this.appComparisonService = null;
        this.removalInvestigationService = null;
        this.externalReleaseSync = null;
        console.log('[Server] ⚠️  Supabase 未配置，跳过审核监控和下架监控功能');
      }
    } else {
      this.hapClient = null;
      this.reviewMonitor = null;
      this.appRemovalMonitor = null;
      this.targetAppMonitor = null;
      this.appComparisonService = null;
      this.removalInvestigationService = null;
      this.externalReleaseSync = null;
      console.log('[Server] ⚠️  明道云未配置，跳过自动查询、审核监控和下架监控功能');
    }

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS 配置
    this.app.use(
      cors({
        origin: [
          'http://localhost:3001',
          'http://192.168.3.85:3001',  // 局域网访问
          'https://fastlane-ui.vercel.app',
          /\.vercel\.app$/,
          /\.zeabur\.app$/,  // Zeabur 域名
          /\.zeabur\.dev$/,  // Zeabur 开发域名
        ],
        credentials: true,
      })
    );

    // JSON 解析
    this.app.use(express.json());

    // 日志中间件
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // 全局配置
    this.app.get('/config/global', (req: Request, res: Response) => {
      try {
        const config = this.configManager.getGlobalConfig();
        res.json(config);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/config/global', (req: Request, res: Response) => {
      try {
        const oldConfig = this.configManager.getGlobalConfig();
        this.configManager.setGlobalConfig(req.body);
        
        // 检查监控服务开关变化，动态启停监控器
        const newConfig = req.body;
        
        // 审核监控器
        if (this.reviewMonitor) {
          const enableReview = newConfig.enableReviewMonitor !== false; // 默认 true
          const wasEnabled = oldConfig.enableReviewMonitor !== false;
          
          if (enableReview && !wasEnabled) {
            console.log('[Server] 📡 启用审核状态监控');
            this.reviewMonitor.start();
          } else if (!enableReview && wasEnabled) {
            console.log('[Server] 📴 禁用审核状态监控');
            this.reviewMonitor.stop();
          }
        }
        
        // 下架监控器
        if (this.appRemovalMonitor) {
          const enableRemoval = newConfig.enableAppRemovalMonitor !== false; // 默认 true
          const wasEnabled = oldConfig.enableAppRemovalMonitor !== false;
          
          if (enableRemoval && !wasEnabled) {
            console.log('[Server] 📡 启用下架状态监控');
            this.appRemovalMonitor.start();
          } else if (!enableRemoval && wasEnabled) {
            console.log('[Server] 📴 禁用下架状态监控');
            this.appRemovalMonitor.stop();
          }
        }
        
        // 目标包监控器
        if (this.targetAppMonitor) {
          const enableTarget = newConfig.enableTargetAppMonitor !== false; // 默认 true
          const wasEnabled = oldConfig.enableTargetAppMonitor !== false;
          
          if (enableTarget && !wasEnabled) {
            console.log('[Server] 📡 启用目标包自动监控');
            this.targetAppMonitor.start();
          } else if (!enableTarget && wasEnabled) {
            console.log('[Server] 📴 禁用目标包自动监控');
            this.targetAppMonitor.stop();
          }
        }
        
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 项目列表（支持分页、搜索、排序）
    this.app.get('/projects', (req: Request, res: Response) => {
      try {
        let projects = this.configManager.getProjects();
        
        // 搜索功能
        const search = req.query.search as string;
        if (search) {
          const searchLower = search.toLowerCase();
          projects = projects.filter(p => 
            p.name.toLowerCase().includes(searchLower) ||
            p.bundleId.toLowerCase().includes(searchLower)
          );
        }
        
        // 排序功能（默认按创建时间倒序）
        const sortBy = (req.query.sortBy as string) || 'createdAt';
        const sortOrder = (req.query.sortOrder as string) || 'desc';
        
        projects.sort((a, b) => {
          let aVal: any = a[sortBy as keyof Project];
          let bVal: any = b[sortBy as keyof Project];
          
          // 处理日期字符串
          if (sortBy === 'createdAt') {
            aVal = new Date(aVal || 0).getTime();
            bVal = new Date(bVal || 0).getTime();
          }
          
          // 处理字符串
          if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
          }
          
          if (sortOrder === 'asc') {
            return aVal > bVal ? 1 : -1;
          } else {
            return aVal < bVal ? 1 : -1;
          }
        });
        
        // 分页功能
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const total = projects.length;
        const totalPages = Math.ceil(total / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedProjects = projects.slice(startIndex, endIndex);
        
        res.json({
          projects: paginatedProjects,
          pagination: {
            page,
            pageSize,
            total,
            totalPages,
          },
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 检测项目
    this.app.post('/projects/detect', async (req: Request, res: Response) => {
      try {
        const { path } = req.body;
        if (!path) {
          return res.status(400).json({ error: 'Path is required' });
        }

        const result = await this.projectDetector.detectProject(path);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 添加项目
    this.app.post('/projects', async (req: Request, res: Response) => {
      try {
        const { name, path, config = {} } = req.body;

        if (!name || !path) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // 检测项目
        const detection = await this.projectDetector.detectProject(path);
        if (!detection.valid) {
          return res.status(400).json({ error: detection.error });
        }

        // 如果项目没有 fastlane 目录，自动复制模板
        if (!detection.detected!.hasFastlane) {
          console.log(`[Project] 项目没有 fastlane 目录，开始复制模板...`);
          console.log(`[Project] 目标路径: ${path}`);
          console.log(`[Project] 模板路径: ${this.fastlaneTemplate.getTemplatePath()}`);
          
          try {
            this.fastlaneTemplate.copyToProject(path);
            console.log(`[Project] ✅ Fastlane 模板复制成功`);
          } catch (error: any) {
            console.error(`[Project] ❌ 复制 fastlane 模板失败:`, error.message);
            return res.status(500).json({
              error: `无法复制 fastlane 模板: ${error.message}`,
            });
          }
        } else {
          console.log(`[Project] 项目已有 fastlane 目录，跳过复制`);
        }

        // 🆕 自动查询明道云（如果用户没有手动提供配置且已配置 HAP）
        let appleAccountConfig = {
          appleId: config.appleId,
          teamId: config.teamId,
          itcTeamId: config.itcTeamId,
          apiKeyId: config.apiKeyId,
          apiKeyIssuerId: config.apiKeyIssuerId,
          apiKeyContent: config.apiKeyContent,
        };

        // 如果没有提供 Apple 配置，尝试从明道云查询
        if (!config.appleId && this.hapClient) {
          try {
            const bundleId = config.bundleId || detection.detected!.bundleId;
            console.log(`[HAP] 自动查询 Bundle ID: ${bundleId}`);
            
            const hapData = await this.hapClient.getAppleAccountByBundleId(bundleId);
            
            if (hapData) {
              console.log(`[HAP] ✅ 找到匹配的开发者账号: ${hapData.appleId}`);
              appleAccountConfig = {
                appleId: hapData.appleId,
                teamId: hapData.teamId,
                itcTeamId: hapData.itcTeamId || config.itcTeamId,
                apiKeyId: hapData.apiKeyId,
                apiKeyIssuerId: hapData.apiKeyIssuerId,
                apiKeyContent: hapData.apiKeyContent,
              };
            } else {
              console.log(`[HAP] ⚠️  未找到匹配的开发者账号`);
            }
          } catch (error: any) {
            console.error(`[HAP] ❌ 查询失败: ${error.message}`);
            // 查询失败不阻断流程，继续使用手动配置
          }
        }

        // 创建项目对象
        const project: Project = {
          id: uuidv4(),
          name,
          path,
          bundleId: config.bundleId || detection.detected!.bundleId,
          workspace: config.workspace,
          project: config.project,
          scheme: config.scheme || detection.detected!.schemes[0],
          useMatch: config.useMatch || false,
          currentVersion: detection.detected!.currentVersion,
          currentBuild: detection.detected!.currentBuild,
          createdAt: new Date().toISOString(),
          // 使用查询到的或手动配置的账号信息
          ...appleAccountConfig,
        };

        // 保存项目
        this.configManager.addProject(project);

        // 如果有 Apple 配置和 API Key，生成 .env 文件
        const hasBasicConfig = project.appleId && project.teamId;
        const hasAuthConfig = project.apiKeyId && project.apiKeyIssuerId && project.apiKeyContent;
        
        if (hasBasicConfig && hasAuthConfig) {
          const globalConfig = this.configManager.getGlobalConfig();
          this.envGenerator.writeEnvFile(project, globalConfig);
        }

        res.json(project);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 获取项目详情
    this.app.get('/projects/:id', (req: Request, res: Response) => {
      try {
        const project = this.configManager.getProject(req.params.id);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }
        res.json(project);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 获取项目实时信息
    this.app.get('/projects/:id/info', async (req: Request, res: Response) => {
      try {
        const project = this.configManager.getProject(req.params.id);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        // 重新检测项目信息
        const detection = await this.projectDetector.detectProject(
          project.path
        );
        if (detection.valid && detection.detected) {
          res.json({
            ...project,
            currentVersion: detection.detected.currentVersion,
            currentBuild: detection.detected.currentBuild,
          });
        } else {
          res.json(project);
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 更新项目
    this.app.put('/projects/:id', async (req: Request, res: Response) => {
      try {
        const project = this.configManager.getProject(req.params.id);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        // 更新项目配置
        this.configManager.updateProject(req.params.id, req.body);

        // 如果更新了 Apple 账户信息、API Key 配置或项目配置，重新生成 .env 文件
        if (
          req.body.appleId ||
          req.body.teamId ||
          req.body.itcTeamId ||
          req.body.apiKeyId ||
          req.body.apiKeyIssuerId ||
          req.body.apiKeyContent ||
          req.body.bundleId ||
          req.body.scheme ||
          req.body.workspace ||
          req.body.project
        ) {
          const updatedProject = this.configManager.getProject(req.params.id);
          const globalConfig = this.configManager.getGlobalConfig();
          if (updatedProject) {
            this.envGenerator.writeEnvFile(updatedProject, globalConfig);
          }
        }

        const updatedProject = this.configManager.getProject(req.params.id);
        res.json(updatedProject);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 同步账号信息（从明道云重新查询）
    this.app.post('/projects/:id/sync-account', async (req: Request, res: Response) => {
      try {
        const project = this.configManager.getProject(req.params.id);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        if (!this.hapClient) {
          return res.status(400).json({ error: '明道云未配置，无法同步账号信息' });
        }

        // 查询明道云
        console.log(`[HAP] 手动同步账号信息，Bundle ID: ${project.bundleId}`);
        const hapData = await this.hapClient.getAppleAccountByBundleId(project.bundleId);

        if (!hapData) {
          return res.status(404).json({ error: '未找到匹配的开发者账号信息' });
        }

        // 更新项目配置
        this.configManager.updateProject(req.params.id, {
          appleId: hapData.appleId,
          teamId: hapData.teamId,
          itcTeamId: hapData.itcTeamId || project.itcTeamId,
          apiKeyId: hapData.apiKeyId,
          apiKeyIssuerId: hapData.apiKeyIssuerId,
          apiKeyContent: hapData.apiKeyContent,
        });

        // 重新生成 .env 文件
        const updatedProject = this.configManager.getProject(req.params.id);
        const globalConfig = this.configManager.getGlobalConfig();
        if (updatedProject) {
          this.envGenerator.writeEnvFile(updatedProject, globalConfig);
        }

        console.log(`[HAP] ✅ 账号信息同步成功: ${hapData.appleId}`);
        res.json(updatedProject);
      } catch (error: any) {
        console.error(`[HAP] ❌ 同步失败:`, error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 删除项目
    this.app.delete('/projects/:id', (req: Request, res: Response) => {
      try {
        this.configManager.removeProject(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 创建发布任务
    this.app.post('/tasks', async (req: Request, res: Response) => {
      try {
        const { projectId, type, isFirstRelease, userId } = req.body;

        if (!projectId || !type) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        const project = this.configManager.getProject(projectId);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        // 构建任务选项
        const options: {
          isFirstRelease?: boolean;
          userId?: string;
        } = {};
        
        if (isFirstRelease !== undefined) options.isFirstRelease = isFirstRelease;
        if (userId) options.userId = userId;

        // 创建任务
        const taskId = await this.taskExecutor.executeTask(
          projectId,
          project.path,
          type,
          options
        );

        res.json({ taskId });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 获取任务状态
    this.app.get('/tasks/:id', (req: Request, res: Response) => {
      try {
        const task = this.taskExecutor.getTask(req.params.id);
        if (!task) {
          return res.status(404).json({ error: 'Task not found' });
        }
        res.json(task);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // SSE 日志流
    this.app.get('/tasks/:id/stream', (req: Request, res: Response) => {
      const taskId = req.params.id;
      const task = this.taskExecutor.getTask(taskId);

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // 设置 SSE 头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // 发送已有的日志
      task.logs.forEach((log) => {
        res.write(
          `data: ${JSON.stringify({
            type: 'log',
            content: log,
            timestamp: Date.now(),
          })}\n\n`
        );
      });

      // 监听新日志
      const logHandler = (event: any) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const progressHandler = (event: any) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const completeHandler = (event: any) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.write('data: [DONE]\n\n');
        cleanup();
        res.end();
      };

      this.taskExecutor.on(`log:${taskId}`, logHandler);
      this.taskExecutor.on(`progress:${taskId}`, progressHandler);
      this.taskExecutor.on(`complete:${taskId}`, completeHandler);

      const cleanup = () => {
        this.taskExecutor.off(`log:${taskId}`, logHandler);
        this.taskExecutor.off(`progress:${taskId}`, progressHandler);
        this.taskExecutor.off(`complete:${taskId}`, completeHandler);
      };

      // 客户端断开连接
      req.on('close', () => {
        cleanup();
      });
    });

    // 取消任务
    this.app.post('/tasks/:id/cancel', (req: Request, res: Response) => {
      try {
        const success = this.taskExecutor.cancelTask(req.params.id);
        res.json({ success });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 手动刷新审核状态
    this.app.post('/releases/:id/refresh-status', async (req: Request, res: Response) => {
      try {
        if (!this.reviewMonitor) {
          return res.status(400).json({ 
            error: '审核监控功能未启用，请检查明道云和 Supabase 配置' 
          });
        }

        const releaseId = req.params.id;
        
        // 调用 ReviewMonitor 的手动刷新方法
        await this.reviewMonitor.refreshSingleRelease(releaseId);
        
        res.json({ success: true, message: '审核状态已刷新' });
      } catch (error: any) {
        console.error('[API] 刷新审核状态失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 手动补录发布记录
    this.app.post('/releases/backfill', async (req: Request, res: Response) => {
      try {
        const {
          projectId,
          bundleId,
          projectPath,
          submittedAt,
          completedAt,
          userId,
          isFirstRelease,
          taskId
        } = req.body;

        // 验证必填字段
        if (!submittedAt || !userId) {
          return res.status(400).json({
            error: '缺少必填字段: submittedAt, userId'
          });
        }

        if (!projectId && !bundleId && !projectPath) {
          return res.status(400).json({
            error: '请提供 projectId、bundleId 或 projectPath 中的至少一个'
          });
        }

        // 查找项目（支持三种方式）
        let project;

        // 方式1：通过 projectId 查找
        if (projectId) {
          project = this.configManager.getProject(projectId);
        }

        // 方式2：通过 bundleId 查找
        if (!project && bundleId) {
          const projects = this.configManager.getProjects();
          project = projects.find(p => p.bundleId === bundleId);
        }

        // 方式3：通过 projectPath 查找
        if (!project && projectPath) {
          const projects = this.configManager.getProjects();
          project = projects.find(p => p.path === projectPath);
        }

        // 如果还是找不到项目
        if (!project) {
          return res.status(404).json({
            error: '项目不存在，请检查提供的 projectId、bundleId 或 projectPath'
          });
        }

        console.log(`[Backfill] 补录发布记录: ${project.name} (${project.bundleId})`);

        // 计算 completedAt 和 duration
        const finalCompletedAt = completedAt ||
          new Date(new Date(submittedAt).getTime() + 10 * 60 * 1000).toISOString();

        const duration = Math.floor(
          (new Date(finalCompletedAt).getTime() - new Date(submittedAt).getTime()) / 1000
        );

        // 生成或使用提供的 taskId
        const finalTaskId = taskId || `backfill-${Date.now()}`;

        // 构造 metadata
        const metadata = {
          hostname: os.hostname(),
          macos_version: os.release(),
          backfilled: true,
          backfilled_at: new Date().toISOString(),
          backfilled_by: userId,
        };

        // 保存到数据库
        await supabaseClient.createRelease({
          project_id: project.id,
          bundle_id: project.bundleId,
          app_name: project.name,
          version: project.currentVersion || '',
          build_number: project.currentBuild || '',
          is_first_release: isFirstRelease || false,
          account_email: project.appleId, // 账号邮箱
          app_store_id: null, // 补录时没有 App Store ID
          team_id: project.teamId,
          itc_team_id: project.itcTeamId,
          api_key_id: project.apiKeyId,
          api_key_issuer_id: project.apiKeyIssuerId,
          api_key_content: project.apiKeyContent,
          submitted_at: submittedAt,
          completed_at: finalCompletedAt,
          duration: duration,
          task_id: finalTaskId,
          deployed_by: userId,
          metadata: metadata,
        });

        console.log(`[Backfill] ✅ 发布记录已补录到数据库`);

        res.json({
          success: true,
          message: '发布记录已补录',
          project: {
            id: project.id,
            name: project.name,
            bundleId: project.bundleId,
            version: project.currentVersion,
            build: project.currentBuild,
          }
        });
      } catch (error: any) {
        console.error('[Backfill] ❌ 补录失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // ============================================================================
    // 发布记录监控状态管理 API（7.1 版本新增）
    // ============================================================================

    // 批量更新发布记录的监控启用状态
    this.app.put('/api/releases/batch-monitor-status', async (req: Request, res: Response) => {
      try {
        const { releaseIds, enabled } = req.body;

        if (!releaseIds || !Array.isArray(releaseIds) || releaseIds.length === 0) {
          return res.status(400).json({ error: '请提供 releaseIds 数组' });
        }

        if (enabled === undefined) {
          return res.status(400).json({ error: '请提供 enabled 参数' });
        }

        console.log(`[API] 📝 批量更新监控状态: ${releaseIds.length} 条记录 → ${enabled ? '启用' : '禁用'}`);

        const updatedCount = await supabaseClient.batchUpdateMonitorEnabled(releaseIds, enabled);

        console.log(`[API] ✅ 已更新 ${updatedCount} 条记录的监控状态`);

        res.json({
          success: true,
          message: `已更新 ${updatedCount} 条记录的监控状态`,
          updatedCount,
        });
      } catch (error: any) {
        console.error('[API] ❌ 批量更新监控状态失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 更新单条发布记录的监控启用状态
    this.app.put('/api/releases/:id/monitor-status', async (req: Request, res: Response) => {
      try {
        const releaseId = req.params.id;
        const { enabled } = req.body;

        if (enabled === undefined) {
          return res.status(400).json({ error: '请提供 enabled 参数' });
        }

        console.log(`[API] 📝 更新发布记录监控状态: ${releaseId} → ${enabled ? '启用' : '禁用'}`);

        const updatedCount = await supabaseClient.batchUpdateMonitorEnabled([releaseId], enabled);

        if (updatedCount === 0) {
          return res.status(404).json({ error: '发布记录不存在' });
        }

        res.json({
          success: true,
          message: '监控状态已更新',
        });
      } catch (error: any) {
        console.error('[API] ❌ 更新监控状态失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取发布记录的监控启用状态
    this.app.get('/api/releases/:id/monitor-status', async (req: Request, res: Response) => {
      try {
        const releaseId = req.params.id;

        const monitorEnabled = await supabaseClient.getReleaseMonitorEnabled(releaseId);

        if (monitorEnabled === null) {
          return res.status(404).json({ error: '发布记录不存在' });
        }

        res.json({
          releaseId,
          monitorEnabled,
        });
      } catch (error: any) {
        console.error('[API] ❌ 获取监控状态失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // ============================================================================
    // 外部审核同步 API（8.0 版本新增）
    // ============================================================================

    // 手动同步外部提交的审核记录
    this.app.post('/api/releases/sync-external', async (req: Request, res: Response) => {
      if (!this.externalReleaseSync) {
        return res.status(503).json({ 
          success: false,
          error: '外部审核同步服务未初始化' 
        });
      }

      try {
        console.log('[API] 🔄 开始同步外部审核记录...');
        const result = await this.externalReleaseSync.syncExternalReleases();
        console.log('[API] ✅ 外部审核同步完成');
        res.json(result);
      } catch (error: any) {
        console.error('[API] ❌ 外部审核同步失败:', error.message);
        res.status(500).json({ 
          success: false,
          error: error.message 
        });
      }
    });

    // ============================================================================
    // App 下架监控 API（3.5 版本新增）
    // ============================================================================

    // 从明道云同步 App 列表
    this.app.post('/api/app-removal-monitor/sync', async (req: Request, res: Response) => {
      if (!this.appRemovalMonitor) {
        return res.status(503).json({ error: '下架监控功能未启用' });
      }

      try {
        const result = await this.appRemovalMonitor.syncFromHap();
        res.json(result);
      } catch (error: any) {
        console.error('[API] ❌ 同步失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取监控列表
    this.app.get('/api/app-removal-monitor/list', async (req: Request, res: Response) => {
      if (!this.appRemovalMonitor) {
        return res.status(503).json({ error: '下架监控功能未启用' });
      }

      try {
        const { status } = req.query;
        const apps = await supabaseClient.getMonitoredApps(status as string);
        res.json({ apps });
      } catch (error: any) {
        console.error('[API] ❌ 获取监控列表失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 按账号分组获取监控列表（3.5 版本新增）
    this.app.get('/api/app-removal-monitor/list-by-account', async (req: Request, res: Response) => {
      if (!this.appRemovalMonitor) {
        return res.status(503).json({ error: '下架监控功能未启用' });
      }

      try {
        const groups = await supabaseClient.getMonitoredAppsByAccount();
        res.json({ groups });
      } catch (error: any) {
        console.error('[API] ❌ 获取按账号分组列表失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取统计数据
    this.app.get('/api/app-removal-monitor/stats', async (req: Request, res: Response) => {
      if (!this.appRemovalMonitor) {
        return res.status(503).json({ error: '下架监控功能未启用' });
      }

      try {
        const stats = await supabaseClient.getMonitorStats();
        res.json(stats);
      } catch (error: any) {
        console.error('[API] ❌ 获取统计数据失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 手动检查单个 App
    this.app.post('/api/app-removal-monitor/check/:bundleId', async (req: Request, res: Response) => {
      if (!this.appRemovalMonitor) {
        return res.status(503).json({ error: '下架监控功能未启用' });
      }

      try {
        const { bundleId } = req.params;
        const status = await this.appRemovalMonitor.checkSingleApp(bundleId);
        res.json({ 
          bundleId, 
          status, 
          checked_at: new Date().toISOString() 
        });
      } catch (error: any) {
        console.error('[API] ❌ 检查 App 失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 手动检查所有 App
    this.app.post('/api/app-removal-monitor/check-all', async (req: Request, res: Response) => {
      if (!this.appRemovalMonitor) {
        return res.status(503).json({ error: '下架监控功能未启用' });
      }

      try {
        // 异步执行检查，立即返回
        this.appRemovalMonitor.checkAllApps().catch(error => {
          console.error('[API] ❌ 批量检查失败:', error.message);
        });
        
        res.json({ 
          success: true, 
          message: '批量检查已开始，请稍后查看结果' 
        });
      } catch (error: any) {
        console.error('[API] ❌ 启动批量检查失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取历史归档记录
    this.app.get('/api/app-removal-monitor/history', async (req: Request, res: Response) => {
      if (!this.appRemovalMonitor) {
        return res.status(503).json({ error: '下架监控功能未启用' });
      }

      try {
        const { limit, offset, bundleId, status } = req.query;
        const options: any = {};
        
        if (limit) options.limit = parseInt(limit as string);
        if (offset) options.offset = parseInt(offset as string);
        if (bundleId) options.bundleId = bundleId as string;
        if (status) options.status = status as string;
        
        const history = await supabaseClient.getArchivedApps(options);
        res.json({ history });
      } catch (error: any) {
        console.error('[API] ❌ 获取历史记录失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取历史归档统计
    this.app.get('/api/app-removal-monitor/history/stats', async (req: Request, res: Response) => {
      if (!this.appRemovalMonitor) {
        return res.status(503).json({ error: '下架监控功能未启用' });
      }

      try {
        const stats = await supabaseClient.getArchivedAppsStats();
        res.json(stats);
      } catch (error: any) {
        console.error('[API] ❌ 获取历史统计失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取监控器状态
    this.app.get('/api/app-removal-monitor/status', async (req: Request, res: Response) => {
      if (!this.appRemovalMonitor) {
        return res.json({ 
          enabled: false, 
          message: '下架监控功能未启用' 
        });
      }

      const status = this.appRemovalMonitor.getStatus();
      res.json({ 
        enabled: true, 
        ...status 
      });
    });

    // ============================================
    // 目标包监控 API（4.0 版本新增）
    // ============================================

    // 从明道云同步目标包列表
    this.app.post('/api/target-app-monitor/sync', async (req: Request, res: Response) => {
      if (!this.targetAppMonitor) {
        return res.status(503).json({ error: '目标包监控功能未启用' });
      }

      try {
        const { days } = req.body; // 可选的天数参数
        const result = await this.targetAppMonitor.syncFromHap(days);
        res.json(result);
      } catch (error: any) {
        console.error('[API] ❌ 同步目标包失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取目标包列表（带筛选和分页）
    this.app.get('/api/target-app-monitor/list', async (req: Request, res: Response) => {
      if (!this.targetAppMonitor) {
        return res.status(503).json({ error: '目标包监控功能未启用' });
      }

      try {
        const {
          daysRange,
          statusFilter,
          search,
          pageIndex = '1',
          pageSize = '20',
        } = req.query;

        const filter = {
          daysRange: daysRange ? parseInt(daysRange as string) : undefined,
          statusFilter: (statusFilter as any) || 'all',
          search: search as string,
          pageIndex: parseInt(pageIndex as string),
          pageSize: parseInt(pageSize as string),
        };

        const result = await this.targetAppMonitor.getTargetApps(filter);
        res.json(result);
      } catch (error: any) {
        console.error('[API] ❌ 获取目标包列表失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取统计数据
    this.app.get('/api/target-app-monitor/stats', async (req: Request, res: Response) => {
      if (!this.targetAppMonitor) {
        return res.status(503).json({ error: '目标包监控功能未启用' });
      }

      try {
        const stats = await this.targetAppMonitor.getStats();
        res.json(stats);
      } catch (error: any) {
        console.error('[API] ❌ 获取统计数据失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 手动检查单个目标包
    this.app.post('/api/target-app-monitor/check/:appId', async (req: Request, res: Response) => {
      if (!this.targetAppMonitor) {
        return res.status(503).json({ error: '目标包监控功能未启用' });
      }

      try {
        const { appId } = req.params;
        const status = await this.targetAppMonitor.checkSingleAppManual(appId);
        res.json({ 
          appId, 
          status, 
          checked_at: new Date().toISOString() 
        });
      } catch (error: any) {
        console.error('[API] ❌ 检查目标包失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 手动检查所有目标包
    this.app.post('/api/target-app-monitor/check-all', async (req: Request, res: Response) => {
      if (!this.targetAppMonitor) {
        return res.status(503).json({ error: '目标包监控功能未启用' });
      }

      try {
        // 异步执行检查，立即返回
        this.targetAppMonitor.checkAllApps().catch(error => {
          console.error('[API] ❌ 批量检查目标包失败:', error.message);
        });
        
        res.json({ 
          success: true, 
          message: '批量检查已开始，请稍后查看结果' 
        });
      } catch (error: any) {
        console.error('[API] ❌ 启动批量检查失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 同步并检查（一键操作）
    this.app.post('/api/target-app-monitor/sync-and-check', async (req: Request, res: Response) => {
      if (!this.targetAppMonitor) {
        return res.status(503).json({ error: '目标包监控功能未启用' });
      }

      try {
        const { days } = req.body; // 可选的天数参数
        // 先同步数据
        console.log('[API] 🔄 开始同步并检查目标包...');
        const syncResult = await this.targetAppMonitor.syncFromHap(days);
        console.log(`[API] ✅ 同步完成: ${syncResult.synced} 条记录`);
        
        // 再异步执行检查
        this.targetAppMonitor.checkAllApps().catch(error => {
          console.error('[API] ❌ 批量检查目标包失败:', error.message);
        });
        
        res.json({ 
          success: true, 
          message: `已同步 ${syncResult.synced} 条记录，正在检查中...`,
          syncResult: syncResult
        });
      } catch (error: any) {
        console.error('[API] ❌ 同步并检查失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取监控器状态
    this.app.get('/api/target-app-monitor/status', async (req: Request, res: Response) => {
      if (!this.targetAppMonitor) {
        return res.json({ 
          enabled: false, 
          message: '目标包监控功能未启用' 
        });
      }

      const status = this.targetAppMonitor.getStatus();
      res.json({ 
        enabled: true, 
        ...status 
      });
    });

    // 更新监控配置
    this.app.put('/api/target-app-monitor/config', async (req: Request, res: Response) => {
      if (!this.targetAppMonitor) {
        return res.status(503).json({ error: '目标包监控功能未启用' });
      }

      try {
        const config = req.body;
        this.targetAppMonitor.updateConfig(config);
        res.json({ 
          success: true, 
          message: '配置已更新',
          config: this.targetAppMonitor.getStatus().config,
        });
      } catch (error: any) {
        console.error('[API] ❌ 更新配置失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 手动修改目标包状态（4.0 版本新增 - 防止同步覆盖）
    this.app.put('/api/target-app-monitor/manual-status/:appId', async (req: Request, res: Response) => {
      if (!this.targetAppMonitor) {
        return res.status(503).json({ error: '目标包监控功能未启用' });
      }

      try {
        const { appId } = req.params;
        const { isOffline, offlineDate } = req.body;

        if (isOffline === undefined) {
          return res.status(400).json({ error: '缺少 isOffline 参数' });
        }

        // 查找目标包
        const { data: app, error: findError } = await (supabaseClient as any).client
          .from('target_apps')
          .select('id, app_name, hap_row_id')
          .eq('app_id', appId)
          .single();

        if (findError || !app) {
          return res.status(404).json({ error: '目标包不存在' });
        }

        // 更新状态并标记为手动修改
        const updateData: any = {
          is_offline: isOffline,
          manual_status_override: true,
          current_status: isOffline ? 'removed' : 'available',
          updated_at: new Date().toISOString(),
        };

        // 如果设置为下架，需要下架日期
        if (isOffline) {
          updateData.offline_date = offlineDate || new Date().toISOString();
        } else {
          updateData.offline_date = null;
        }

        const { error: updateError } = await (supabaseClient as any).client
          .from('target_apps')
          .update(updateData)
          .eq('id', app.id);

        if (updateError) {
          throw new Error(`更新失败: ${updateError.message}`);
        }

        console.log(`[API] ✅ 手动修改目标包状态: ${app.app_name} → ${isOffline ? '下架' : '在架'}`);

        res.json({ 
          success: true, 
          message: '状态已更新（已锁定，不会被同步覆盖）',
          app: {
            id: app.id,
            appName: app.app_name,
            isOffline: isOffline,
            offlineDate: updateData.offline_date,
          }
        });
      } catch (error: any) {
        console.error('[API] ❌ 手动修改状态失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 解除手动修改锁定（恢复自动同步）
    this.app.delete('/api/target-app-monitor/manual-status/:appId', async (req: Request, res: Response) => {
      if (!this.targetAppMonitor) {
        return res.status(503).json({ error: '目标包监控功能未启用' });
      }

      try {
        const { appId } = req.params;

        // 查找目标包
        const { data: app, error: findError } = await (supabaseClient as any).client
          .from('target_apps')
          .select('id, app_name')
          .eq('app_id', appId)
          .single();

        if (findError || !app) {
          return res.status(404).json({ error: '目标包不存在' });
        }

        // 解除锁定
        const { error: updateError } = await (supabaseClient as any).client
          .from('target_apps')
          .update({ 
            manual_status_override: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', app.id);

        if (updateError) {
          throw new Error(`解除锁定失败: ${updateError.message}`);
        }

        console.log(`[API] ✅ 解除手动修改锁定: ${app.app_name}`);

        res.json({ 
          success: true, 
          message: '已恢复自动同步，下次同步将从明道云更新状态'
        });
      } catch (error: any) {
        console.error('[API] ❌ 解除锁定失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // ============================================================================
    // App 关联对比 API（5.0 版本新增）
    // ============================================================================

    // 同步关联关系
    this.app.post('/api/app-comparison/sync-relations', async (req: Request, res: Response) => {
      if (!this.appComparisonService) {
        return res.status(503).json({ error: 'App 关联对比功能未启用' });
      }

      try {
        const result = await this.appComparisonService.syncRelationsFromHap();
        res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[API] ❌ 同步关联关系失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取对比列表
    this.app.get('/api/app-comparison/list', async (req: Request, res: Response) => {
      if (!this.appComparisonService) {
        return res.status(503).json({ error: 'App 关联对比功能未启用' });
      }

      try {
        const records = await this.appComparisonService.getComparisonList();
        res.json({ success: true, data: records });
      } catch (error: any) {
        console.error('[API] ❌ 获取对比列表失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取统计数据
    this.app.get('/api/app-comparison/stats', async (req: Request, res: Response) => {
      if (!this.appComparisonService) {
        return res.status(503).json({ error: 'App 关联对比功能未启用' });
      }

      try {
        const stats = await this.appComparisonService.getStats();
        res.json({ success: true, data: stats });
      } catch (error: any) {
        console.error('[API] ❌ 获取统计数据失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 刷新单行（我的包 + 目标包）
    this.app.post('/api/app-comparison/refresh/:bundleId', async (req: Request, res: Response) => {
      if (!this.appComparisonService) {
        return res.status(503).json({ error: 'App 关联对比功能未启用' });
      }

      try {
        const { bundleId } = req.params;
        
        // 1. 刷新我的包状态
        if (this.appRemovalMonitor) {
          await this.appRemovalMonitor.checkSingleApp(bundleId);
        }
        
        // 2. 查找并刷新关联的目标包
        const { data: relation } = await (supabaseClient as any).client
          .from('app_target_relations')
          .select('target_app_id')
          .eq('my_app_bundle_id', bundleId)
          .single();
        
        if (relation?.target_app_id && this.targetAppMonitor) {
          // 查找目标包的 app_id
          const { data: targetApp } = await (supabaseClient as any).client
            .from('target_apps')
            .select('app_id')
            .eq('id', relation.target_app_id)
            .single();
          
          if (targetApp?.app_id) {
            await this.targetAppMonitor.checkSingleAppManual(targetApp.app_id);
          }
        }
        
        res.json({ 
          success: true,
          message: '刷新完成',
          checked_at: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('[API] ❌ 刷新失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 单独同步某条记录的关联关系
    this.app.post('/api/app-comparison/sync-single', async (req: Request, res: Response) => {
      if (!this.appComparisonService) {
        return res.status(503).json({ error: 'App 关联对比功能未启用' });
      }

      const { bundleId } = req.body;
      if (!bundleId) {
        return res.status(400).json({ error: '缺少 bundleId 参数' });
      }

      try {
        console.log(`[API] 🔄 开始单独同步: ${bundleId}`);
        const result = await this.appComparisonService.syncSingleRelation(bundleId);
        console.log(`[API] ✅ 单独同步成功: ${bundleId}`);
        res.json(result);
      } catch (error: any) {
        console.error('[API] ❌ 单独同步失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 批量检查所有包（关联对比专用）
    this.app.post('/api/app-comparison/check-all', async (req: Request, res: Response) => {
      if (!this.appComparisonService) {
        return res.status(503).json({ error: 'App 关联对比功能未启用' });
      }

      try {
        // 异步执行检查，立即返回
        (async () => {
          try {
            console.log('[API] 🔗 开始批量检查关联对比的应用...');
            
            // 1. 检查所有我的包
            if (this.appRemovalMonitor) {
              console.log('[API] 📱 检查"我的包"...');
              await this.appRemovalMonitor.checkAllApps();
            }
            
            // 2. 查询所有有关联关系的目标包 ID
            if (this.targetAppMonitor) {
              console.log('[API] 🎯 查询关联的目标包...');
              
              const { data: relations, error } = await (supabaseClient as any).client
                .from('app_target_relations')
                .select('target_app_id')
                .not('target_app_id', 'is', null);

              if (error) {
                console.error('[API] ❌ 查询关联关系失败:', error.message);
              } else {
                const targetAppIds = relations?.map((r: any) => r.target_app_id as string).filter(Boolean) || [];
                const uniqueTargetAppIds: string[] = Array.from(new Set(targetAppIds));
                
                console.log(`[API] 📋 找到 ${uniqueTargetAppIds.length} 个关联的目标包`);
                
                if (uniqueTargetAppIds.length > 0) {
                  // 使用专门的检查方法（不受"最近N天"限制）
                  await this.targetAppMonitor.checkSpecificApps(uniqueTargetAppIds);
                } else {
                  console.log('[API] ℹ️  没有关联的目标包需要检查');
                }
              }
            }
            
            console.log('[API] ✅ 关联对比批量检查完成');
          } catch (error: any) {
            console.error('[API] ❌ 批量检查失败:', error.message);
          }
        })();
        
        res.json({ 
          success: true, 
          message: '批量检查已开始，请稍后查看结果' 
        });
      } catch (error: any) {
        console.error('[API] ❌ 启动批量检查失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取全局同步状态（5.1 版本新增）
    this.app.get('/api/app-comparison/sync-status', async (req: Request, res: Response) => {
      try {
        // 查询"我的包"的同步状态（按同步时间排序）
        const { data: myAppsSyncStatus } = await (supabaseClient as any).client
          .from('app_removal_monitor')
          .select('synced_from_hap_at, sync_hostname')
          .not('synced_from_hap_at', 'is', null)
          .order('synced_from_hap_at', { ascending: false })
          .limit(1);

        // 查询"我的包"的检测状态（按检测时间排序）
        const { data: myAppsCheckStatus } = await (supabaseClient as any).client
          .from('app_removal_monitor')
          .select('last_checked_at, check_hostname')
          .not('last_checked_at', 'is', null)
          .order('last_checked_at', { ascending: false })
          .limit(1);

        // 查询"目标包"的同步状态（按同步时间排序）
        const { data: targetAppsSyncStatus } = await (supabaseClient as any).client
          .from('target_apps')
          .select('synced_from_hap_at, sync_hostname')
          .not('synced_from_hap_at', 'is', null)
          .order('synced_from_hap_at', { ascending: false })
          .limit(1);

        // 查询"目标包"的检测状态（按检测时间排序）
        const { data: targetAppsCheckStatus } = await (supabaseClient as any).client
          .from('target_apps')
          .select('last_checked_at, check_hostname')
          .not('last_checked_at', 'is', null)
          .order('last_checked_at', { ascending: false })
          .limit(1);

        const result = {
          myApps: {
            lastSyncTime: myAppsSyncStatus?.[0]?.synced_from_hap_at || null,
            syncHostname: myAppsSyncStatus?.[0]?.sync_hostname || null,
            lastCheckTime: myAppsCheckStatus?.[0]?.last_checked_at || null,
            checkHostname: myAppsCheckStatus?.[0]?.check_hostname || null,
          },
          targetApps: {
            lastSyncTime: targetAppsSyncStatus?.[0]?.synced_from_hap_at || null,
            syncHostname: targetAppsSyncStatus?.[0]?.sync_hostname || null,
            lastCheckTime: targetAppsCheckStatus?.[0]?.last_checked_at || null,
            checkHostname: targetAppsCheckStatus?.[0]?.check_hostname || null,
          },
        };

        res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[API] ❌ 获取同步状态失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // ============================================================================
    // App 下架排查功能（6.0 版本新增）
    // ============================================================================

    // 手动触发同步
    this.app.post('/api/removal-investigation/sync', async (req: Request, res: Response) => {
      if (!this.removalInvestigationService) {
        return res.status(503).json({ error: '下架排查功能未启用' });
      }

      try {
        console.log('[API] 🔄 开始全量同步下架排查数据...');
        const result = await this.removalInvestigationService.syncAll('MANUAL');
        console.log('[API] ✅ 全量同步完成');
        res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[API] ❌ 全量同步失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 增量同步下架排查数据
    this.app.post('/api/removal-investigation/sync-incremental', async (req: Request, res: Response) => {
      if (!this.removalInvestigationService) {
        return res.status(503).json({ error: '下架排查功能未启用' });
      }

      try {
        console.log('[API] 🔄 开始增量同步下架排查数据...');
        const result = await this.removalInvestigationService.syncIncremental('MANUAL');
        console.log('[API] ✅ 增量同步完成');
        res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[API] ❌ 增量同步失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取下架App列表（支持筛选）
    this.app.get('/api/removal-investigation/apps', async (req: Request, res: Response) => {
      if (!this.removalInvestigationService) {
        return res.status(503).json({ error: '下架排查功能未启用' });
      }

      try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const search = req.query.search as string | undefined;
        const filters = req.query.filters ? JSON.parse(req.query.filters as string) : undefined;

        const result = await this.removalInvestigationService.getRemovedAppsList(page, pageSize, search, filters);
        res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[API] ❌ 获取下架App列表失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取App的操作时间线
    this.app.get('/api/removal-investigation/apps/:bundleId/timeline', async (req: Request, res: Response) => {
      if (!this.removalInvestigationService) {
        return res.status(503).json({ error: '下架排查功能未启用' });
      }

      try {
        const { bundleId } = req.params;
        const timeline = await this.removalInvestigationService.getAppTimeline(bundleId);
        res.json({ success: true, data: timeline });
      } catch (error: any) {
        console.error('[API] ❌ 获取时间线失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取同步状态
    this.app.get('/api/removal-investigation/sync-status', async (req: Request, res: Response) => {
      if (!this.removalInvestigationService) {
        return res.status(503).json({ error: '下架排查功能未启用' });
      }

      try {
        const status = await this.removalInvestigationService.getSyncStatus();
        res.json({ success: true, data: status });
      } catch (error: any) {
        console.error('[API] ❌ 获取同步状态失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取账号详情（账号视图）
    this.app.get('/api/removal-investigation/accounts/:accountEmail/detail', async (req: Request, res: Response) => {
      if (!this.removalInvestigationService) {
        return res.status(503).json({ error: '下架排查功能未启用' });
      }

      try {
        const accountEmail = decodeURIComponent(req.params.accountEmail);
        const detail = await this.removalInvestigationService.getAccountDetail(accountEmail);
        res.json({ success: true, data: detail });
      } catch (error: any) {
        console.error('[API] ❌ 获取账号详情失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取账号分组列表（账号视图）
    this.app.get('/api/removal-investigation/account-groups', async (req: Request, res: Response) => {
      if (!this.removalInvestigationService) {
        return res.status(503).json({ error: '下架排查功能未启用' });
      }

      try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const search = req.query.search as string;
        const filters = req.query.filters ? JSON.parse(req.query.filters as string) : undefined;

        const result = await this.removalInvestigationService.getAccountGroupList(
          page,
          pageSize,
          search,
          filters
        );

        res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[API] ❌ 获取账号分组列表失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 获取APP下架原因分析
    this.app.get('/api/removal-investigation/apps/:bundleId/analysis', async (req: Request, res: Response) => {
      if (!this.removalInvestigationService) {
        return res.status(503).json({ error: '下架排查功能未启用' });
      }

      try {
        const { bundleId } = req.params;
        const analysis = await this.removalInvestigationService.getRemovalAnalysis(bundleId);
        res.json({ success: true, data: analysis });
      } catch (error: any) {
        console.error('[API] ❌ 获取下架原因分析失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 保存APP下架原因分析
    this.app.post('/api/removal-investigation/apps/:bundleId/analysis', async (req: Request, res: Response) => {
      if (!this.removalInvestigationService) {
        return res.status(503).json({ error: '下架排查功能未启用' });
      }

      try {
        const { bundleId } = req.params;
        const { analysisContent, operator } = req.body;

        if (!analysisContent) {
          return res.status(400).json({ error: '分析内容不能为空' });
        }

        await this.removalInvestigationService.saveRemovalAnalysis({
          bundleId,
          analysisContent,
          operator,
        });

        res.json({ success: true, message: '保存成功' });
      } catch (error: any) {
        console.error('[API] ❌ 保存下架原因分析失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 导出下架App数据到Excel
    this.app.post('/api/removal-investigation/export', async (req: Request, res: Response) => {
      if (!this.removalInvestigationService) {
        return res.status(503).json({ error: '下架排查功能未启用' });
      }

      try {
        const { search, filters } = req.body;

        console.log('[API] 📊 开始导出Excel...');
        const data = await this.removalInvestigationService.exportToExcel({
          search,
          filters,
        });

        console.log(`[API] ✅ 导出完成: ${data.length} 条记录`);
        res.json({ success: true, data });
      } catch (error: any) {
        console.error('[API] ❌ 导出失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // ==================== 管理员API（6.1版本新增 - RBAC权限系统） ====================
    
    // 导入权限中间件
    const { requireAdminAuth } = require('./auth-middleware');
    
    // 创建新用户（仅管理员）
    this.app.post('/api/admin/users', requireAdminAuth, async (req: Request, res: Response) => {
      try {
        const { email, password, fullName, role } = req.body;
        
        // 验证必填字段
        if (!email || !password) {
          return res.status(400).json({ 
            error: '邮箱和密码是必填项' 
          });
        }
        
        // 验证邮箱格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ 
            error: '邮箱格式不正确' 
          });
        }
        
        // 验证密码长度
        if (password.length < 6) {
          return res.status(400).json({ 
            error: '密码长度至少为6个字符' 
          });
        }
        
        // 验证角色
        const validRoles = ['admin', 'operator'];
        const userRole = role || 'operator';
        if (!validRoles.includes(userRole)) {
          return res.status(400).json({ 
            error: '无效的角色类型' 
          });
        }
        
        console.log('[API] 👤 管理员创建新用户:', email, '角色:', userRole);
        
        // 使用 Supabase Service Role Key 创建用户
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseServiceKey) {
          return res.status(500).json({ 
            error: 'Supabase 配置错误：缺少必要的环境变量' 
          });
        }
        
        const { createClient } = require('@supabase/supabase-js');
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });
        
        // 创建用户
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true, // 自动确认邮箱
          user_metadata: {
            full_name: fullName || ''
          }
        });
        
        if (authError) {
          console.error('[API] ❌ 创建用户失败:', authError.message);
          
          // 处理常见错误
          if (authError.message.includes('already registered')) {
            return res.status(409).json({ 
              error: '该邮箱已被注册' 
            });
          }
          
          return res.status(500).json({ 
            error: '创建用户失败: ' + authError.message 
          });
        }
        
        if (!authData.user) {
          return res.status(500).json({ 
            error: '创建用户失败：未返回用户信息' 
          });
        }
        
        console.log('[API] ✅ 用户创建成功:', authData.user.id);
        
        // 创建或更新用户配置
        const { error: profileError } = await supabaseAdmin
          .from('user_profiles')
          .upsert({
            id: authData.user.id,
            email: authData.user.email,
            full_name: fullName || null,
            role: userRole,
            enable_app_removal_monitor: false,
            enable_target_app_monitor: false,
          });
        
        if (profileError) {
          console.error('[API] ⚠️  创建用户配置失败:', profileError.message);
          // 用户已创建，但配置失败 - 触发器会自动创建配置
        } else {
          console.log('[API] ✅ 用户配置创建成功');
        }
        
        res.json({
          success: true,
          user: {
            id: authData.user.id,
            email: authData.user.email,
            full_name: fullName || null,
            role: userRole,
            created_at: authData.user.created_at,
          }
        });
        
      } catch (error: any) {
        console.error('[API] ❌ 创建用户异常:', error.message);
        res.status(500).json({ 
          error: '创建用户失败: ' + error.message 
        });
      }
    });
    
    // ==================== 测试API（6.0版本新增） ====================
    
    // 测试bundle_id的数据获取
    this.app.get('/api/test/bundle-records', async (req: Request, res: Response) => {
      if (!this.testService) {
        return res.status(503).json({ error: '测试服务未启用' });
      }

      const bundleId = req.query.bundleId as string;
      if (!bundleId) {
        return res.status(400).json({ error: '缺少bundleId参数' });
      }

      try {
        console.log(`[API] 🧪 测试Bundle ID: ${bundleId}`);
        const result = await this.testService.testBundleRecords(bundleId);
        res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[API] ❌ 测试失败:', error.message);
        res.status(500).json({ error: error.message });
      }
    });
  }

  start(): void {
    // 验证 fastlane 模板
    const templateValidation = this.fastlaneTemplate.validateTemplate();
    if (!templateValidation.valid) {
      console.error('');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ Fastlane 模板验证失败');
      console.error(`   ${templateValidation.error}`);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('');
      console.error('⚠️  服务将继续运行，但无法自动为新项目配置 fastlane');
      console.error('');
    }

    this.app.listen(this.port, () => {
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 Fastlane Agent Server 已启动');
      console.log(`📡 运行在: http://localhost:${this.port}`);
      console.log(`⚙️  配置文件: ${this.configManager.getConfigPath()}`);
      console.log(`📋 Fastlane 模板: ${this.fastlaneTemplate.getTemplatePath()}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('💡 访问 Web UI 开始使用');
      console.log('   开发环境: http://localhost:3001');
      console.log('   生产环境: https://fastlane-ui.vercel.app');
      console.log('');
    });

    // 定期清理旧任务
    setInterval(() => {
      this.taskExecutor.cleanup();
    }, 60000); // 每分钟清理一次
    
    // 根据配置启动监控器
    const globalConfig = this.configManager.getGlobalConfig();
    
    // 启动审核状态监控器（默认开启）
    if (this.reviewMonitor) {
      if (globalConfig.enableReviewMonitor !== false) {
        this.reviewMonitor.start();
      } else {
        console.log('[Server] ⏸️  审核状态监控已禁用（可在设置中开启）');
      }
    }

    // 启动 App 下架监控器（默认开启）
    if (this.appRemovalMonitor) {
      if (globalConfig.enableAppRemovalMonitor !== false) {
        this.appRemovalMonitor.start();
      } else {
        console.log('[Server] ⏸️  下架状态监控已禁用（可在设置中开启）');
      }
    }

    // 启动目标包监控器（4.0 版本新增，默认开启）
    if (this.targetAppMonitor) {
      if (globalConfig.enableTargetAppMonitor !== false) {
        this.targetAppMonitor.start();
      } else {
        console.log('[Server] ⏸️  目标包自动监控已禁用（可在设置中开启）');
      }
    }
  }
}

