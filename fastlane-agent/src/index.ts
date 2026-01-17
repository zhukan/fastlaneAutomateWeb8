// 加载环境变量（必须在最前面）
import 'dotenv/config';

import { FastlaneAgentServer } from './server';

// 从环境变量或默认使用 3000 端口
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// 创建并启动服务器
const server = new FastlaneAgentServer(PORT);
server.start();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n👋 Fastlane Agent Server 正在关闭...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Fastlane Agent Server 正在关闭...');
  process.exit(0);
});

