import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 获取扩展配置
 * @returns 配置对象
 */
function getConfig() {
  return vscode.workspace.getConfiguration('vscode-xlog');
}

import {decodeXlogFileCommand} from './commands/decode-file';
import {decodeXlogDirectoryCommand} from './commands/decode-directory';
import {showXlogDecodeInfoCommand} from './commands/show-info';
import {deleteDecodedFilesCommand} from './commands/delete-decoded-files';
import {splitFileCommand} from './commands/split-file';
import {isXlogFile} from './services/xlog-decoder';

// 导出工具函数，供其他模块使用
export {
  getConfig
};

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
        'vscode-xlog.showInfo', showXlogDecodeInfoCommand),
    vscode.commands.registerCommand(
        'vscode-xlog.deleteDecodedFiles', deleteDecodedFilesCommand),
    vscode.commands.registerCommand(
        'vscode-xlog.splitFile', splitFileCommand)
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
      vscode.workspace.createFileSystemWatcher('**/*.{xlog,mmap3}');
  context.subscriptions.push(fileSystemWatcher);

  fileSystemWatcher.onDidCreate(uri => {
    outputChannel.appendLine(`检测到新的日志文件: ${uri.fsPath}`);
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

  async openCustomDocument(
      uri: vscode.Uri, _openContext: vscode.CustomDocumentOpenContext,
      _token: vscode.CancellationToken): Promise<vscode.CustomDocument> {
    // 创建一个自定义文档对象
    return {
      uri,
      // 使用实现方法而不是空方法
      dispose() {
        // 方法实现为空但有括号和注释表明这是有意为之
        // 销毁文档时的清理工作
      }
    };
  }

  async resolveCustomEditor(
      document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel,
      _token: vscode.CancellationToken): Promise<void> {
    // 在webview中显示加载消息
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    try {
      await vscode.commands.executeCommand(
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
      }, 1000);
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