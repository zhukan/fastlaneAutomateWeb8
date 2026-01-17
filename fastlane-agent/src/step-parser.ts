import { DeployStep } from './types';

// 预定义的发布步骤模式
const STEP_PATTERNS = [
  {
    id: 'validate',
    name: '验证项目配置',
    patterns: [
      /fastlane starting/i,
      /Running fastlane/i,
      /Driving the lane/i,
    ],
  },
  {
    id: 'bump_build',
    name: '更新 Build Number',
    patterns: [
      /bump_build/i,
      /Incrementing build number/i,
      /Build Number.*→/i,
    ],
  },
  {
    id: 'build',
    name: '构建 IPA 文件',
    patterns: [
      /build_app/i,
      /Building/i,
      /Compiling/i,
      /Archive Succeeded/i,
      /Signing/i,
      /Exporting/i,
    ],
  },
  {
    id: 'upload',
    name: '上传到 TestFlight/App Store',
    patterns: [
      /upload_to_testflight/i,
      /upload_to_app_store/i,
      /Uploading/i,
      /Transporter/i,
      /Verifying/i,
    ],
  },
  {
    id: 'notify',
    name: '发送通知',
    patterns: [/slack/i, /notification/i, /Posting message/i],
  },
  {
    id: 'complete',
    name: '完成',
    patterns: [
      /Lane.*successful/i,
      /successfully/i,
      /fastlane.tools finished successfully/i,
    ],
  },
];

export class StepParser {
  private currentStep: DeployStep | null = null;
  private completedSteps: Set<string> = new Set();

  parseStep(logLine: string): DeployStep | null {
    // 检查是否匹配任何步骤模式
    for (const pattern of STEP_PATTERNS) {
      // 如果该步骤已完成，跳过
      if (this.completedSteps.has(pattern.id)) {
        continue;
      }

      // 检查是否匹配任何模式
      const matched = pattern.patterns.some((regex) => regex.test(logLine));

      if (matched) {
        // 如果是新步骤
        if (this.currentStep?.id !== pattern.id) {
          // 完成上一个步骤
          if (this.currentStep) {
            this.currentStep.status = 'success';
            this.currentStep.endTime = Date.now();
            this.currentStep.duration =
              this.currentStep.endTime - (this.currentStep.startTime || 0);
            this.completedSteps.add(this.currentStep.id);
          }

          // 开始新步骤
          this.currentStep = {
            id: pattern.id,
            name: pattern.name,
            status: 'running',
            startTime: Date.now(),
          };

          return { ...this.currentStep };
        }
      }
    }

    return null;
  }

  checkError(logLine: string): boolean {
    const errorPatterns = [
      /\[ERROR\]/i,
      /Error:/i,
      /failed/i,
      /Build Failed/i,
      /exit code/i,
    ];

    return errorPatterns.some((pattern) => pattern.test(logLine));
  }

  reset(): void {
    this.currentStep = null;
    this.completedSteps.clear();
  }

  getCurrentStep(): DeployStep | null {
    return this.currentStep;
  }

  getAllSteps(): DeployStep[] {
    return STEP_PATTERNS.map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      status: this.completedSteps.has(pattern.id)
        ? 'success'
        : this.currentStep?.id === pattern.id
        ? 'running'
        : 'pending',
    }));
  }
}

