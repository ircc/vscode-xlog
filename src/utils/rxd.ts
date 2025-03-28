import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {getRxdPath} from './config';

/**
 * 获取适合当前平台的rxd可执行文件路径
 * @returns rxd命令路径
 */
export function getRxdCommand(): string {
  // 尝试从配置中获取用户自定义的rxd路径
  const customRxdPath = getRxdPath();
  if (customRxdPath && fs.existsSync(customRxdPath)) {
    return customRxdPath;
  }

  // 根据不同平台自动选择默认的rxd可执行文件
  const platform = os.platform();
  const arch = os.arch();
  const extensionPath = path.join(__dirname, '../../');
  let rxdExecutable = '';

  if (platform === 'win32') {
    // Windows
    rxdExecutable = path.join(extensionPath, 'resources/bin/rxd-windows-x86_64.exe');
  } else if (platform === 'darwin') {
    // macOS
    if (arch === 'arm64') {
      // Apple Silicon
      rxdExecutable = path.join(extensionPath, 'resources/bin/rxd-macos-arm64');
    } else {
      // Intel
      rxdExecutable = path.join(extensionPath, 'resources/bin/rxd-macos-x86_64');
    }
  } else if (platform === 'linux') {
    // Linux
    rxdExecutable = path.join(extensionPath, 'resources/bin/rxd-linux-x86_64');
  } else {
    throw new Error(`不支持的操作系统: ${platform}`);
  }

  // 确保文件存在
  if (!fs.existsSync(rxdExecutable)) {
    throw new Error(`找不到rxd可执行文件: ${rxdExecutable}`);
  }

  // 确保可执行文件有执行权限 (macOS/Linux)
  if (platform !== 'win32') {
    try {
      fs.chmodSync(rxdExecutable, '755');
    } catch (error) {
      console.error(`无法设置rxd可执行权限: ${error}`);
    }
  }

  return rxdExecutable;
}

/**
 * 执行rxd命令
 * @param args 命令行参数
 * @returns 命令输出
 */
export function runRxdCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const rxdCommand = getRxdCommand();
      const isWindows = os.platform() === 'win32';

      // 记录执行命令的详细信息供调试
      console.log(`执行命令: "${rxdCommand}" ${args.map(arg => `"${arg}"`).join(' ')}`);

      // 在Windows上使用shell选项确保正确处理命令
      const process = child_process.spawn(
        rxdCommand, args, {shell: isWindows}
      );

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        console.log(`Rxd输出: ${chunk}`);
      });

      process.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        console.error(`Rxd错误: ${chunk}`);
      });

      process.on('error', (err) => {
        // 捕获进程启动错误
        const customRxdPath = getRxdPath();
        const errorMsg = customRxdPath ?
          `无法使用指定的Rxd路径 '${customRxdPath}': ${err.message}。请检查设置。` :
          `无法启动Rxd进程: ${err.message}。请检查扩展安装是否完整。`;

        console.error(`进程启动错误: ${errorMsg}`);
        reject(new Error(errorMsg));
      });

      process.on('close', (code) => {
        console.log(`Rxd进程结束，返回码: ${code}`);

        if (code === 0) {
          resolve(stdout);
        } else {
          // 如果有stderr，优先使用stderr的错误信息
          const errorOutput = stderr || stdout || '无错误输出';
          const errorMsg = `执行失败，返回码 ${code}: ${errorOutput}`;
          console.error(errorMsg);
          reject(new Error(errorMsg));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 处理Rxd相关错误
 * @param error 错误对象
 */
export async function handleRxdError(error: Error): Promise<void> {
  console.error(`Rxd错误处理: ${error.message}`);
  const message = error.message;

  // 检测可能的问题
  const isRxdNotFound = message.includes('找不到rxd可执行文件') ||
                         message.includes('无法启动Rxd进程');
  const isIOError = message.includes('读取文件错误') ||
                    message.includes('写入文件错误') ||
                    message.includes('权限被拒绝');

  if (isRxdNotFound) {
    const action = await vscode.window.showErrorMessage(
      '无法找到或执行rxd解码器。请确保扩展正确安装或在设置中指定rxd可执行文件路径。',
      '打开设置', '查看详情', '忽略');

    if (action === '打开设置') {
      vscode.commands.executeCommand(
        'workbench.action.openSettings', 'vscode-xlog.rxdPath');
    } else if (action === '查看详情') {
      vscode.window.showErrorMessage(`详细错误: ${message}`);
    }
  } else if (isIOError) {
    // 文件IO错误处理
    vscode.window.showErrorMessage(
      `文件操作错误: ${message}。请检查文件权限和路径。`);
  } else {
    // 其他未知错误
    const action = await vscode.window.showErrorMessage(
      `执行过程中出现错误: ${message.substring(0, 100)}${
        message.length > 100 ? '...' : ''}`,
      '查看完整错误', '忽略');

    if (action === '查看完整错误') {
      // 打开输出面板显示完整错误
      const outputChannel = vscode.window.createOutputChannel('Xlog解码工具');
      outputChannel.clear();
      outputChannel.appendLine('===== 错误详情 =====');
      outputChannel.appendLine(`时间: ${new Date().toLocaleString()}`);
      outputChannel.appendLine(`rxd路径: ${getRxdPath() || '默认'}`);
      outputChannel.appendLine(`操作系统: ${os.platform()} (${os.arch()})`);
      outputChannel.appendLine(`错误信息: ${message}`);
      outputChannel.show();
    }
  }
}