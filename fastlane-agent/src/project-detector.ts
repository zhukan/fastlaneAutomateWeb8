import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ProjectDetectionResult } from './types';

export class ProjectDetector {
  async detectProject(projectPath: string): Promise<ProjectDetectionResult> {
    try {
      // 检查路径是否存在
      if (!fs.existsSync(projectPath)) {
        return {
          valid: false,
          error: '路径不存在',
        };
      }

      // 查找 workspace 或 project
      const workspace = this.findFile(projectPath, '.xcworkspace');
      const project = this.findFile(projectPath, '.xcodeproj');

      if (!workspace && !project) {
        return {
          valid: false,
          error: '不是有效的 iOS 项目（未找到 .xcworkspace 或 .xcodeproj）',
        };
      }

      // 检测 schemes
      const schemes = await this.detectSchemes(
        projectPath,
        workspace || project!
      );

      // 读取项目信息（传入第一个 scheme 以获取准确配置）
      const info = await this.readProjectInfo(
        projectPath,
        workspace || project!,
        schemes[0]
      );

      // 检查是否有 fastlane 目录
      const hasFastlane = fs.existsSync(path.join(projectPath, 'fastlane'));
      const hasEnvFile = fs.existsSync(
        path.join(projectPath, 'fastlane', '.env')
      );

      return {
        valid: true,
        detected: {
          workspace: workspace ? path.basename(workspace) : undefined,
          project: project ? path.basename(project) : undefined,
          schemes,
          bundleId: info.bundleId,
          currentVersion: info.version,
          currentBuild: info.build,
          displayName: info.displayName,
          hasFastlane,
          hasEnvFile,
        },
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || '检测项目失败',
      };
    }
  }

  private findFile(dir: string, extension: string): string | null {
    try {
      const files = fs.readdirSync(dir);
      const found = files.find((file) => file.endsWith(extension));
      return found ? path.join(dir, found) : null;
    } catch (error) {
      return null;
    }
  }

  private async detectSchemes(
    projectPath: string,
    workspaceOrProject: string
  ): Promise<string[]> {
    try {
      const isWorkspace = workspaceOrProject.endsWith('.xcworkspace');
      const flag = isWorkspace ? '-workspace' : '-project';
      const basename = path.basename(workspaceOrProject);

      const output = execSync(
        `xcodebuild -list ${flag} "${basename}" 2>/dev/null || true`,
        {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 10000,
        }
      );

      // 解析 schemes 并过滤
      const allSchemes = this.parseSchemes(output);
      
      // 获取项目名称（从 workspace 或 project 文件名）
      const projectBaseName = path.basename(workspaceOrProject, path.extname(workspaceOrProject));
      
      console.log('[ProjectDetector] All schemes:', allSchemes);
      console.log('[ProjectDetector] Project base name:', projectBaseName);
      
      // 智能过滤策略：
      // 1. 优先选择与项目名称完全匹配的 scheme
      // 2. 然后选择不包含 Pods/Test 的 schemes
      // 3. 最后选择不是 org.cocoapods 的 schemes
      
      // 第一优先级：与项目名完全匹配
      const exactMatch = allSchemes.find(s => s === projectBaseName);
      if (exactMatch) {
        console.log('[ProjectDetector] Found exact match scheme:', exactMatch);
        return [exactMatch, ...allSchemes.filter(s => s !== exactMatch)];
      }
      
      // 第二优先级：过滤掉明显的 Pods 和 Test schemes
      const mainSchemes = allSchemes.filter(s => 
        !s.includes('Pods') && 
        !s.includes('Test') &&
        !s.includes('UITest')
      );
      
      // 第三优先级：验证 Bundle ID，排除 org.cocoapods 的
      const validSchemes = await this.filterSchemesByBundleId(
        projectPath,
        workspaceOrProject,
        mainSchemes.length > 0 ? mainSchemes : allSchemes
      );
      
      console.log('[ProjectDetector] Valid schemes (filtered by Bundle ID):', validSchemes);
      
      return validSchemes.length > 0 ? validSchemes : ['Release'];
    } catch (error) {
      console.error('Failed to detect schemes:', error);
      return ['Release'];
    }
  }

  private parseSchemes(output: string): string[] {
    const schemes: string[] = [];
    const lines = output.split('\n');
    let inSchemesSection = false;

    for (const line of lines) {
      if (line.trim() === 'Schemes:') {
        inSchemesSection = true;
        continue;
      }

      if (inSchemesSection) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.includes(':')) {
          break;
        }
        // 过滤掉明显的 Pods 相关的 schemes
        if (!trimmed.startsWith('Pods-') && trimmed !== 'Pods') {
          schemes.push(trimmed);
        }
      }
    }

    return schemes;
  }

  private async filterSchemesByBundleId(
    projectPath: string,
    workspaceOrProject: string,
    schemes: string[]
  ): Promise<string[]> {
    const validSchemes: string[] = [];
    
    for (const scheme of schemes) {
      try {
        const isWorkspace = workspaceOrProject.endsWith('.xcworkspace');
        const flag = isWorkspace ? '-workspace' : '-project';
        const basename = path.basename(workspaceOrProject);
        
        const cmd = `xcodebuild -showBuildSettings ${flag} "${basename}" -scheme "${scheme}" 2>&1 | grep "PRODUCT_BUNDLE_IDENTIFIER" | head -1`;
        console.log('[ProjectDetector] Checking Bundle ID for scheme:', scheme);
        
        const output = execSync(cmd, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 10000,
        }).trim();
        
        const match = output.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*(.+)$/);
        if (match && match[1]) {
          const bundleId = match[1].trim();
          console.log('[ProjectDetector] Scheme:', scheme, 'Bundle ID:', bundleId);
          
          // 排除 org.cocoapods 开头的
          if (!bundleId.startsWith('org.cocoapods')) {
            validSchemes.push(scheme);
          } else {
            console.log('[ProjectDetector] Skipped CocoaPods scheme:', scheme);
          }
        } else {
          // 如果获取不到 Bundle ID，保留这个 scheme
          validSchemes.push(scheme);
        }
      } catch (error) {
        console.error('[ProjectDetector] Failed to check Bundle ID for scheme:', scheme, error);
        // 出错时保留这个 scheme
        validSchemes.push(scheme);
      }
    }
    
    return validSchemes;
  }

  private async readProjectInfo(
    projectPath: string,
    workspaceOrProject: string,
    scheme?: string
  ): Promise<{ bundleId: string; version: string; build: string; displayName?: string }> {
    try {
      let bundleId = 'com.example.app'; // 默认值
      let version = '1.0.0';
      let build = '1';
      let displayName: string | undefined = undefined;

      // 方法1：使用 xcodebuild -showBuildSettings 获取实际配置（最可靠）
      try {
        const isWorkspace = workspaceOrProject.endsWith('.xcworkspace');
        const flag = isWorkspace ? '-workspace' : '-project';
        const basename = path.basename(workspaceOrProject);
        
        // 对于 project 文件，使用 -scheme 需要先找到 shared scheme
        // 如果没有 scheme，直接用 -target
        let schemeOrTargetFlag = '';
        if (scheme) {
          schemeOrTargetFlag = `-scheme "${scheme}"`;
        }

        const cmd = `xcodebuild -showBuildSettings ${flag} "${basename}" ${schemeOrTargetFlag} 2>&1`;
        console.log('[ProjectDetector] Executing:', cmd);
        console.log('[ProjectDetector] Working directory:', projectPath);

        // 获取构建设置，会自动展开所有变量
        const output = execSync(cmd, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 15000,
        });

        console.log('[ProjectDetector] xcodebuild output length:', output.length);

        // 解析输出 - 查找 Build settings for action build and target
        const lines = output.split('\n');
        let foundBundleId = false;
        
        for (const line of lines) {
          const trimmed = line.trim();
          
          if (trimmed.includes('PRODUCT_BUNDLE_IDENTIFIER')) {
            const match = trimmed.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*(.+)$/);
            if (match && match[1]) {
              const value = match[1].trim();
              // 排除变量引用
              if (!value.includes('$(') && value !== '') {
                bundleId = value;
                foundBundleId = true;
                console.log('[ProjectDetector] Found Bundle ID:', bundleId);
              } else {
                console.log('[ProjectDetector] Skipped Bundle ID (contains variable):', value);
              }
            }
          } else if (trimmed.includes('MARKETING_VERSION')) {
            const match = trimmed.match(/MARKETING_VERSION\s*=\s*(.+)$/);
            if (match && match[1]) {
              version = match[1].trim();
              console.log('[ProjectDetector] Found version:', version);
            }
          } else if (trimmed.includes('CURRENT_PROJECT_VERSION')) {
            const match = trimmed.match(/CURRENT_PROJECT_VERSION\s*=\s*(.+)$/);
            if (match && match[1]) {
              build = match[1].trim();
              console.log('[ProjectDetector] Found build:', build);
            }
          } else if (trimmed.includes('PRODUCT_NAME') && !trimmed.includes('FULL')) {
            const match = trimmed.match(/PRODUCT_NAME\s*=\s*(.+)$/);
            if (match && match[1]) {
              const value = match[1].trim();
              if (!value.includes('$(') && value !== '' && !displayName) {
                displayName = value;
                console.log('[ProjectDetector] Found Display Name from PRODUCT_NAME:', displayName);
              }
            }
          } else if (trimmed.includes('INFOPLIST_KEY_CFBundleDisplayName')) {
            const match = trimmed.match(/INFOPLIST_KEY_CFBundleDisplayName\s*=\s*(.+)$/);
            if (match && match[1]) {
              const value = match[1].trim();
              if (!value.includes('$(') && value !== '') {
                displayName = value;
                console.log('[ProjectDetector] Found Display Name:', displayName);
              }
            }
          }
        }

        if (!foundBundleId) {
          console.log('[ProjectDetector] Bundle ID not found in xcodebuild output, will try plist');
        }
      } catch (error: any) {
        console.error('[ProjectDetector] Failed to get build settings:', error.message);
      }

      // 方法2：如果上面失败，尝试从 Info.plist 读取（可能是变量）
      if (bundleId === 'com.example.app') {
        console.log('[ProjectDetector] Trying to read from Info.plist...');
        const plistPath = this.findInfoPlist(projectPath);
        
        if (plistPath) {
          console.log('[ProjectDetector] Found Info.plist at:', plistPath);
          const info = this.parsePlist(plistPath);
          
          if (info.CFBundleIdentifier) {
            console.log('[ProjectDetector] CFBundleIdentifier from plist:', info.CFBundleIdentifier);
            // 只有当不是变量时才使用
            if (!info.CFBundleIdentifier.includes('$')) {
              bundleId = info.CFBundleIdentifier;
              console.log('[ProjectDetector] Using Bundle ID from plist:', bundleId);
            } else {
              console.log('[ProjectDetector] Plist Bundle ID contains variable, skipping');
            }
          }
          
          if (info.CFBundleShortVersionString) {
            version = info.CFBundleShortVersionString;
          }
          if (info.CFBundleVersion) {
            build = info.CFBundleVersion;
          }
          
          // 读取 Display Name
          if (!displayName && info.CFBundleDisplayName) {
            console.log('[ProjectDetector] CFBundleDisplayName from plist:', info.CFBundleDisplayName);
            if (!info.CFBundleDisplayName.includes('$')) {
              displayName = info.CFBundleDisplayName;
              console.log('[ProjectDetector] Using Display Name from plist:', displayName);
            }
          }
        } else {
          console.log('[ProjectDetector] Info.plist not found');
        }
      }

      console.log('[ProjectDetector] Final result - Bundle ID:', bundleId, 'Version:', version, 'Build:', build, 'Display Name:', displayName || 'N/A');

      return { bundleId, version, build, displayName };
    } catch (error) {
      console.error('Failed to read project info:', error);
      return {
        bundleId: 'com.example.app',
        version: '1.0.0',
        build: '1',
        displayName: undefined,
      };
    }
  }

  private findInfoPlist(projectPath: string): string | null {
    // 常见的 Info.plist 位置
    const possiblePaths = [
      'Info.plist',
      '*/Info.plist',
      'Resources/Info.plist',
      'Supporting Files/Info.plist',
    ];

    for (const pattern of possiblePaths) {
      try {
        const cmd = `find "${projectPath}" -name "Info.plist" -not -path "*/Build/*" -not -path "*/Pods/*" | head -1`;
        const result = execSync(cmd, { encoding: 'utf-8' }).trim();
        if (result) {
          return result;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  private parsePlist(plistPath: string): any {
    try {
      // 使用 plutil 转换为 JSON
      const output = execSync(`plutil -convert json -o - "${plistPath}" 2>&1`, {
        encoding: 'utf-8',
      });
      const parsed = JSON.parse(output);
      console.log('[ProjectDetector] Parsed plist keys:', Object.keys(parsed).join(', '));
      return parsed;
    } catch (error: any) {
      console.error('[ProjectDetector] Failed to parse plist:', error.message);
      return {};
    }
  }
}

