import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// 获取用户配置
function getConfig() {
  return vscode.workspace.getConfiguration('xlogDecode');
}

// 检查Python版本
async function checkPythonVersion(pythonCommand: string): Promise<string> {
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
        reject(new Error(`无法获取Python版本，返回码 ${code}`));
      }
    });
  });
}

// 处理Python相关错误
async function handlePythonError(error: Error): Promise<void> {
  const message = error.message;

  // 检测可能的问题
  const isPythonNotFound =
      message.includes('无法启动') || message.includes('找不到');
  const isSyntaxError = message.includes('SyntaxError');

  if (isPythonNotFound) {
    const action = await vscode.window.showErrorMessage(
        '无法找到Python解释器。请在设置中指定Python路径。', '打开设置', '忽略');

    if (action === '打开设置') {
      vscode.commands.executeCommand(
          'workbench.action.openSettings', 'xlogDecode.pythonPath');
    }
  } else if (isSyntaxError) {
    const customPythonPath = getConfig().get<string>('pythonPath');
    let versionInfo = '未知';

    try {
      const pythonCommand = customPythonPath ||
          (os.platform() === 'win32' ? 'python' : 'python3');
      versionInfo = await checkPythonVersion(pythonCommand);
    } catch (e) {
      versionInfo = '无法检测';
    }

    const action = await vscode.window.showErrorMessage(
        `Python脚本语法错误。您当前的Python版本: ${
            versionInfo}。这个扩展需要Python 3.x版本。`,
        '打开设置', '查看错误详情', '忽略');

    if (action === '打开设置') {
      vscode.commands.executeCommand(
          'workbench.action.openSettings', 'xlogDecode.pythonPath');
    } else if (action === '查看错误详情') {
      vscode.window.showErrorMessage(`详细错误: ${message}`);
    }
  } else {
    // 其他未知错误
    const action = await vscode.window.showErrorMessage(
        `执行过程中出现错误: ${message}`, '查看详情', '忽略');

    if (action === '查看详情') {
      // 可以在这里添加更多诊断信息
      const customPythonPath = getConfig().get<string>('pythonPath');
      vscode.window.showInformationMessage(`当前配置: Python路径=${
          customPythonPath || '默认'}, 操作系统=${os.platform()}`);
    }
  }
}

// 使用spawn替代exec，以获得更好的输出处理
function runPythonScript(scriptPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // 获取用户配置的 Python 路径
    const customPythonPath = getConfig().get<string>('pythonPath');

    // 适应不同操作系统 Python 命令可能不同的情况
    const isWindows = os.platform() === 'win32';
    const defaultPythonCommand = isWindows ? 'python' : 'python3';

    // 使用自定义路径或默认命令
    const pythonCommand = customPythonPath || defaultPythonCommand;

    // 在 Windows 上使用 shell 选项确保正确处理命令
    const process = child_process.spawn(
        pythonCommand, [scriptPath, ...args], {shell: isWindows});

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('error', (err) => {
      // 捕获进程启动错误（如找不到 Python 命令）
      if (customPythonPath) {
        reject(new Error(`无法使用指定的 Python 路径 '${customPythonPath}': ${
            err.message}。请检查设置。`));
      } else {
        reject(new Error(`无法启动 Python 进程: ${
            err.message}。请在设置中指定 Python 路径。`));
      }
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`执行失败，返回码 ${code}: ${stderr}`));
      }
    });
  });
}

// 解压单个xlog文件
async function decodeXlogFile(filePath: string): Promise<string> {
  const pythonScriptPath = path.join(__dirname, '..', 'decode_xlog.py');

  try {
    const output = await runPythonScript(pythonScriptPath, [filePath]);
    // 尝试从输出中获取生成的文件路径
    const match = output.match(/成功解码: (.*)/);
    return match ? match[1] : '';
  } catch (error) {
    throw error;
  }
}

// 解压目录中的所有xlog文件
async function decodeXlogDirectory(dirPath: string): Promise<string[]> {
  const pythonScriptPath = path.join(__dirname, '..', 'decode_xlog.py');

  try {
    const output = await runPythonScript(pythonScriptPath, [dirPath]);
    // 解析输出中的文件列表
    const files: string[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.startsWith('- ')) {
        files.push(line.substring(2).trim());
      }
    }
    return files;
  } catch (error) {
    throw error;
  }
}

import {decodeXlogFileCommand} from './commands/decode-file';
import {decodeXlogDirectoryCommand} from './commands/decode-directory';
import {showXlogDecodeInfoCommand} from './commands/show-info';
import {isXlogFile} from './services/xlog-decoder';

/**
 * 激活扩展
 * @param context 扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
  // 注册命令
  const commands = [
    vscode.commands.registerCommand(
        'vscode-xlog.decodeFile', decodeXlogFileCommand),
    vscode.commands.registerCommand(
        'vscode-xlog.decodeDirectory', decodeXlogDirectoryCommand),
    vscode.commands.registerCommand(
        'vscode-xlog.showInfo', showXlogDecodeInfoCommand)
  ];

  // 注册命令到上下文
  commands.forEach(command => {
    context.subscriptions.push(command);
  });

  // 监听 xlog 文件打开事件
  const fileOpenHandler =
      vscode.workspace.onDidOpenTextDocument(async (document) => {
        if (isXlogFile(document.uri.fsPath)) {
          const result = await vscode.window.showInformationMessage(
              '检测到 Xlog 文件，是否要解码?', '是', '否');

          if (result === '是') {
            vscode.commands.executeCommand(
                'vscode-xlog.decodeFile', document.uri);
          }
        }
      });

  // 立即检查当前打开的文档
  if (vscode.window.activeTextEditor) {
    const document = vscode.window.activeTextEditor.document;
    if (isXlogFile(document.uri.fsPath)) {
      vscode.window
          .showInformationMessage('检测到 Xlog 文件，是否要解码?', '是', '否')
          .then(result => {
            if (result === '是') {
              vscode.commands.executeCommand(
                  'vscode-xlog.decodeFile', document.uri);
            }
          });
    }
  }

  context.subscriptions.push(fileOpenHandler);
}

/**
 * 停用扩展
 */
export function deactivate() {
  // 清理资源
}