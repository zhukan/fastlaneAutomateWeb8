import fs from 'fs';
import path from 'path';
import { GlobalConfig, Project } from './types';

export class EnvGenerator {
  generateEnvFile(project: Project, globalConfig: GlobalConfig): string {
    const timestamp = new Date().toISOString();
    const projectFileName = project.workspace || project.project || 'Project';
    const projectName = projectFileName.replace(/\.(xcworkspace|xcodeproj)$/, '');
    
    // 系统只支持 API Key 认证
      const keyFilePath = path.join(project.path, 'fastlane', 'AuthKey.p8');
    const authSection = `# 认证方式：App Store Connect API Key
APP_STORE_CONNECT_API_KEY_KEY_ID=${project.apiKeyId}
APP_STORE_CONNECT_API_KEY_ISSUER_ID=${project.apiKeyIssuerId}
APP_STORE_CONNECT_API_KEY_KEY_FILEPATH=${keyFilePath}`;

    const envContent = `# ==========================================
# 由 Fastlane UI 自动生成
# 生成时间: ${timestamp}
# 请勿手动修改此文件，通过 Web UI 编辑配置
# ==========================================

# Apple 开发者账户（项目专属）
APPLE_ID=${project.appleId}
TEAM_ID=${project.teamId}
${project.itcTeamId ? `ITC_TEAM_ID=${project.itcTeamId}` : '# ITC_TEAM_ID='}

${authSection}

# 项目信息
APP_IDENTIFIER_PRODUCTION=${project.bundleId}
${project.workspace ? `WORKSPACE=${project.workspace}` : '# WORKSPACE='}
${project.project ? `PROJECT=${project.project}` : `PROJECT=${projectName}.xcodeproj`}
SCHEME=${project.scheme}

# 构建配置
CONFIGURATION=Release
EXPORT_METHOD=app-store

# 证书管理
USE_MATCH=${project.useMatch ? 'true' : 'false'}

# 自动获取证书（推荐）
# 使用 App Store Connect API Key 自动获取/创建证书和描述文件
AUTO_FETCH_CERTIFICATES=true

# 通知配置（可选）
# SLACK_WEBHOOK_URL=
# SLACK_CHANNEL=#releases
# DINGTALK_ACCESS_TOKEN=
# DINGTALK_NOTIFICATION_ENABLED=false
`;

    return envContent;
  }

  writeEnvFile(project: Project, globalConfig: GlobalConfig): void {
    const envContent = this.generateEnvFile(project, globalConfig);
    const fastlanePath = path.join(project.path, 'fastlane');
    const envPath = path.join(fastlanePath, '.env');

    // 确保 fastlane 目录存在
    if (!fs.existsSync(fastlanePath)) {
      fs.mkdirSync(fastlanePath, { recursive: true });
    }

    // 写入 API Key 文件（系统只支持 API Key 认证）
    if (project.apiKeyContent) {
      const keyFilePath = path.join(fastlanePath, 'AuthKey.p8');
      fs.writeFileSync(keyFilePath, project.apiKeyContent, 'utf-8');
      // 设置文件权限为只读（安全考虑）
      fs.chmodSync(keyFilePath, 0o600);
    }

    // 写入 .env 文件
    fs.writeFileSync(envPath, envContent, 'utf-8');
  }

  readEnvFile(projectPath: string): Record<string, string> {
    const envPath = path.join(projectPath, 'fastlane', '.env');
    const env: Record<string, string> = {};

    if (!fs.existsSync(envPath)) {
      return env;
    }

    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        // 跳过注释和空行
        if (trimmed.startsWith('#') || trimmed === '') {
          continue;
        }

        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    } catch (error) {
      console.error('Failed to read .env file:', error);
    }

    return env;
  }
}

