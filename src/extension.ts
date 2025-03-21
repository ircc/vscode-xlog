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
  // 创建输出通道，用于记录解码过程
  const outputChannel = vscode.window.createOutputChannel('Xlog 解码工具');
  context.subscriptions.push(outputChannel);

  // 注册虚拟文档内容提供器
  const xlogContentProvider = new XlogContentProvider(outputChannel);
  const registration = vscode.workspace.registerTextDocumentContentProvider(
      'xlog-preview', xlogContentProvider);
  context.subscriptions.push(registration);

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

  // 注册一个自定义编辑器提供程序，拦截所有.xlog文件的打开请求
  const xlogEditorProvider = new XlogEditorProvider(context);
  context.subscriptions.push(vscode.window.registerCustomEditorProvider(
      'vscode-xlog.xlogEditor', xlogEditorProvider, {
        // 设置为高优先级，确保我们的自定义编辑器会被首先调用
        webviewOptions: {retainContextWhenHidden: true},
        supportsMultipleEditorsPerDocument: false
      }));

  // 注册文件系统监听，当检测到.xlog文件时自动重定向
  const fileSystemWatcher =
      vscode.workspace.createFileSystemWatcher('**/*.xlog');
  context.subscriptions.push(fileSystemWatcher);

  fileSystemWatcher.onDidCreate(uri => {
    outputChannel.appendLine(`检测到新的xlog文件: ${uri.fsPath}`);
  });

  // 立即检查当前打开的文档
  if (vscode.window.activeTextEditor) {
    const document = vscode.window.activeTextEditor.document;
    if (document.uri.scheme === 'file' && isXlogFile(document.uri.fsPath)) {
      // 关闭当前编辑器
      vscode.commands.executeCommand('workbench.action.closeActiveEditor')
          .then(() => {
            // 解码文件
            vscode.commands.executeCommand(
                'vscode-xlog.decodeFile', document.uri);
          });
    }
  }
}

/**
 * Xlog文件内容提供器
 */
class XlogContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private outputChannel: vscode.OutputChannel) {}

  provideTextDocumentContent(_uri: vscode.Uri): string {
    return '正在解码 Xlog 文件，请稍候...';
  }
}

/**
 * Xlog自定义编辑器提供程序
 * 用于拦截xlog文件的打开并替换为我们的解码流程
 */
class XlogEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private context: vscode.ExtensionContext) {}

  // 当VSCode尝试打开xlog文件时，会调用此方法
  async openCustomDocument(
      uri: vscode.Uri, _openContext: vscode.CustomDocumentOpenContext,
      _token: vscode.CancellationToken): Promise<vscode.CustomDocument> {
    // 创建一个自定义文档对象
    return {uri, dispose: () => {}};
  }

  // 当需要解析编辑器内容时调用
  async resolveCustomEditor(
      document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel,
      _token: vscode.CancellationToken): Promise<void> {
    // 在webview中显示加载消息
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // 设置标题
    webviewPanel.title = '解码 Xlog 文件中...';

    // 不再立即关闭webview，而是在执行解码后隐藏它
    // webviewPanel.dispose();

    // 执行解码，不需要延迟了
    try {
      const result = await vscode.commands.executeCommand(
          'vscode-xlog.decodeFile', document.uri);

      // 解码完成后才关闭webview
      setTimeout(() => {
        try {
          // 安全地检查webview是否可以关闭
          if (webviewPanel) {
            webviewPanel.dispose();
          }
        } catch (e) {
          // 忽略可能的错误
        }
      }, 500);
    } catch (error) {
      // 如果解码失败，更新webview显示错误信息
      try {
        // 安全地更新webview内容
        if (webviewPanel) {
          webviewPanel.webview.html = this.getErrorHtml(String(error));
        }
      } catch (e) {
        // 忽略可能的错误
      }
    }
  }

  // 生成webview的HTML内容
  private getHtmlForWebview(_webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>解码 Xlog</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 20px; }
          .container { text-align: center; max-width: 500px; margin: 0 auto; }
          .spinner { display: inline-block; width: 50px; height: 50px; border: 3px solid rgba(0,0,0,.3); border-radius: 50%; border-top-color: #00b4cf; animation: spin 1s ease-in-out infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>正在解码 Xlog 文件...</h2>
          <div class="spinner"></div>
          <p>请稍候，解码完成后将自动打开结果文件。</p>
        </div>
      </body>
      </html>
    `;
  }

  // 生成错误信息HTML
  private getErrorHtml(errorMessage: string): string {
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>解码失败</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 20px; }
          .container { text-align: center; max-width: 500px; margin: 0 auto; }
          .error { color: #e74c3c; background-color: #fceaea; padding: 10px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>解码 Xlog 文件失败</h2>
          <div class="error">
            <p>${errorMessage}</p>
          </div>
          <p>请检查文件格式或联系技术支持。</p>
        </div>
      </body>
      </html>
    `;
  }
}

/**
 * 停用扩展
 */
export function deactivate() {
  // 清理资源
}