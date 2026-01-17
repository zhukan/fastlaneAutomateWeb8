import fs from 'fs';
import path from 'path';

export class FastlaneTemplate {
  private templatePath: string;

  constructor(templatePath?: string) {
    // 默认模板路径：fastlane-agent 所在目录的上一级的 fastlane 目录
    this.templatePath = templatePath || path.resolve(__dirname, '../../fastlane');
  }

  /**
   * 检查项目是否已有 fastlane 目录
   */
  hasFastlane(projectPath: string): boolean {
    const fastlanePath = path.join(projectPath, 'fastlane');
    return fs.existsSync(fastlanePath);
  }

  /**
   * 复制 fastlane 模板到项目目录
   */
  copyToProject(projectPath: string): void {
    // 检查模板目录是否存在
    if (!fs.existsSync(this.templatePath)) {
      throw new Error(`Fastlane 模板目录不存在: ${this.templatePath}`);
    }

    const targetPath = path.join(projectPath, 'fastlane');

    // 如果目标已存在，跳过
    if (fs.existsSync(targetPath)) {
      console.log(`[FastlaneTemplate] 项目已有 fastlane 目录，跳过复制`);
      return;
    }

    // 检查目标项目目录是否存在且可写
    if (!fs.existsSync(projectPath)) {
      throw new Error(`项目目录不存在: ${projectPath}`);
    }

    try {
      // 复制整个 fastlane 目录
      this.copyDirectory(this.templatePath, targetPath);
      console.log(`[FastlaneTemplate] ✅ 已复制 fastlane 模板到: ${targetPath}`);
    } catch (error: any) {
      throw new Error(`复制 fastlane 模板失败: ${error.message}`);
    }
  }

  /**
   * 递归复制目录
   */
  private copyDirectory(src: string, dest: string): void {
    // 创建目标目录
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // 跳过不需要复制的文件
      if (this.shouldSkip(entry.name)) {
        console.log(`[FastlaneTemplate] 跳过文件: ${entry.name}`);
        continue;
      }

      if (entry.isDirectory()) {
        // 递归复制子目录
        this.copyDirectory(srcPath, destPath);
      } else {
        // 复制文件
        fs.copyFileSync(srcPath, destPath);
        console.log(`[FastlaneTemplate] 复制文件: ${entry.name}`);
      }
    }
  }

  /**
   * 判断是否应该跳过某个文件/目录
   */
  private shouldSkip(name: string): boolean {
    const skipList = [
      '.env',           // 不复制 .env，每个项目单独生成
      '.DS_Store',      // macOS 系统文件
      'Thumbs.db',      // Windows 系统文件
      '.git',           // Git 目录
      'node_modules',   // Node 模块
    ];

    return skipList.includes(name);
  }

  /**
   * 获取模板路径
   */
  getTemplatePath(): string {
    return this.templatePath;
  }

  /**
   * 验证模板是否有效
   */
  validateTemplate(): { valid: boolean; error?: string } {
    if (!fs.existsSync(this.templatePath)) {
      return {
        valid: false,
        error: `模板目录不存在: ${this.templatePath}`,
      };
    }

    // 检查必需的文件
    const requiredFiles = ['Fastfile', 'Appfile'];
    const missingFiles = requiredFiles.filter(
      (file) => !fs.existsSync(path.join(this.templatePath, file))
    );

    if (missingFiles.length > 0) {
      return {
        valid: false,
        error: `模板缺少必需文件: ${missingFiles.join(', ')}`,
      };
    }

    return { valid: true };
  }
}

