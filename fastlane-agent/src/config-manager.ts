import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigFile, GlobalConfig, Project } from './types';

export class ConfigManager {
  private configPath: string;
  private config: ConfigFile;

  constructor() {
    // 配置文件存储在用户目录
    const configDir = path.join(os.homedir(), '.fastlane-agent');
    this.configPath = path.join(configDir, 'config.json');

    // 确保目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 加载配置
    this.config = this.loadConfig();
  }

  private loadConfig(): ConfigFile {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }

    // 返回默认配置
    return {
      global: {
        defaultAppleId: '',
        defaultTeamId: '',
      },
      projects: [],
    };
  }

  saveConfig(): void {
    try {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save config:', error);
      throw new Error('Failed to save configuration');
    }
  }

  getGlobalConfig(): GlobalConfig {
    return this.config.global;
  }

  setGlobalConfig(config: GlobalConfig): void {
    this.config.global = config;
    this.saveConfig();
  }

  getProjects(): Project[] {
    return this.config.projects;
  }

  getProject(id: string): Project | undefined {
    return this.config.projects.find((p) => p.id === id);
  }

  addProject(project: Project): void {
    // 检查是否已存在
    const exists = this.config.projects.some((p) => p.id === project.id);
    if (exists) {
      throw new Error('Project already exists');
    }

    this.config.projects.push(project);
    this.saveConfig();
  }

  updateProject(id: string, updates: Partial<Project>): void {
    const index = this.config.projects.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error('Project not found');
    }

    this.config.projects[index] = {
      ...this.config.projects[index],
      ...updates,
    };
    this.saveConfig();
  }

  removeProject(id: string): void {
    const index = this.config.projects.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error('Project not found');
    }

    this.config.projects.splice(index, 1);
    this.saveConfig();
  }

  getConfigPath(): string {
    return this.configPath;
  }
}

