import * as child_process from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';

import {getPythonPath} from './config';

/**
 * 获取适合当前平台的Python命令
 * @returns Python命令字符串
 */
export function getPythonCommand(): string {
  const customPythonPath = getPythonPath();
  const isWindows = os.platform() === 'win32';
  const defaultPythonCommand = isWindows ? 'python' : 'python3';

  return customPythonPath || defaultPythonCommand;
}

/**
 * 检查Python版本
 * @param pythonCommand Python命令
 * @returns Python版本信息字符串
 */
export async function checkPythonVersion(pythonCommand: string):
    Promise<string> {
  return new Promise((resolve, reject) => {
    const process = child_process.spawn(
        pythonCommand, ['-V'], {shell: os.platform() === 'win32'});

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('error', (err) => {
      reject(new Error(`无法启动Python: ${err.message}`));
    });

    process.on('close', (code) => {
      if (code === 0) {
        // Python版本信息可能在stdout或stderr中
        const output = stdout || stderr;
        resolve(output.trim());
      } else {
        reject(new Error(`无法获取Python版本，返回码 ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * 执行Python脚本
 * @param scriptPath 脚本路径
 * @param args 命令行参数
 * @returns 脚本输出
 */
export function runPythonScript(
    scriptPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonCommand = getPythonCommand();
    const isWindows = os.platform() === 'win32';

    // 记录执行命令的详细信息供调试
    console.log(`执行命令: ${pythonCommand} "${scriptPath}" ${
        args.map(arg => `"${arg}"`).join(' ')}`);

    // 在 Windows 上使用 shell 选项确保正确处理命令
    const process = child_process.spawn(
        pythonCommand, [scriptPath, ...args], {shell: isWindows});

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      console.log(`Python输出: ${chunk}`);
    });

    process.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      console.error(`Python错误: ${chunk}`);
    });

    process.on('error', (err) => {
      // 捕获进程启动错误（如找不到 Python 命令）
      const customPythonPath = getPythonPath();
      const errorMsg = customPythonPath ?
          `无法使用指定的 Python 路径 '${customPythonPath}': ${
              err.message}。请检查设置。` :
          `无法启动 Python 进程: ${err.message}。请在设置中指定 Python 路径。`;

      console.error(`进程启动错误: ${errorMsg}`);
      reject(new Error(errorMsg));
    });

    process.on('close', (code) => {
      console.log(`Python进程结束，返回码: ${code}`);

      if (code === 0) {
        resolve(stdout);
      } else {
        // 如果有stderr，优先使用stderr的错误信息
        // 如果没有stderr但有stdout，可能是Python脚本输出了一些信息到stdout后崩溃
        const errorOutput = stderr || stdout || '无错误输出';
        const errorMsg = `执行失败，返回码 ${code}: ${errorOutput}`;
        console.error(errorMsg);
        reject(new Error(errorMsg));
      }
    });
  });
}

/**
 * 处理Python相关错误
 * @param error 错误对象
 */
export async function handlePythonError(error: Error): Promise<void> {
  console.error(`Python错误处理: ${error.message}`);
  const message = error.message;

  // 检测可能的问题
  const isPythonNotFound = message.includes('无法启动') ||
      message.includes('找不到') || message.includes('不是内部或外部命令');
  const isSyntaxError = message.includes('SyntaxError');
  const isIOError = message.includes('IOError') ||
      message.includes('FileNotFoundError') ||
      message.includes('PermissionError');

  if (isPythonNotFound) {
    const action = await vscode.window.showErrorMessage(
        '无法找到或执行Python解释器。请在设置中指定正确的Python可执行文件路径（包括.exe）。',
        '打开设置', '查看详情', '忽略');

    if (action === '打开设置') {
      vscode.commands.executeCommand(
          'workbench.action.openSettings', 'vscode-xlog.pythonPath');
    } else if (action === '查看详情') {
      vscode.window.showErrorMessage(`详细错误: ${message}`);
    }
  } else if (isSyntaxError) {
    const pythonCommand = getPythonCommand();
    let versionInfo = '未知';

    try {
      versionInfo = await checkPythonVersion(pythonCommand);
    } catch (e) {
      versionInfo = '无法检测';
    }

    const action = await vscode.window.showErrorMessage(
        `Python脚本语法错误。您当前的Python版本: ${
            versionInfo}。请确保Python安装正确。`,
        '打开设置', '查看错误详情', '忽略');

    if (action === '打开设置') {
      vscode.commands.executeCommand(
          'workbench.action.openSettings', 'vscode-xlog.pythonPath');
    } else if (action === '查看错误详情') {
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
      outputChannel.appendLine(`Python路径: ${getPythonPath() || '默认'}`);
      outputChannel.appendLine(`操作系统: ${os.platform()}`);
      outputChannel.appendLine(`错误信息: ${message}`);
      outputChannel.show();
    }
  }
}