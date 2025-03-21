import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {decodeXlogFile, isXlogFile} from '../services/xlog-decoder';
import {getAutoOpenDecodedFile} from '../utils/config';
import {handlePythonError} from '../utils/python';

/**
 * 解码单个Xlog文件
 * @param fileUri 文件URI，可选
 */
export async function decodeXlogFileCommand(fileUri?: vscode.Uri):
    Promise<string|undefined> {
  try {
    let filePath: string;

    // 如果是从右键菜单触发，fileUri会被传入
    if (fileUri) {
      filePath = fileUri.fsPath;
    }
    // 否则从当前编辑器获取文件路径
    else if (vscode.window.activeTextEditor) {
      filePath = vscode.window.activeTextEditor.document.uri.fsPath;
    } else {
      vscode.window.showErrorMessage('没有找到文件');
      return;
    }

    // 验证文件类型
    if (!isXlogFile(filePath)) {
      vscode.window.showErrorMessage('请选择 Xlog 文件');
      return;
    }

    // 验证文件是否存在
    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`文件不存在: ${filePath}`);
      return;
    }

    // 创建输出通道
    let outputChannel = vscode.window.createOutputChannel('Xlog 解码工具');

    // 显示解码进度
    outputChannel.clear();
    outputChannel.appendLine(`开始解码: ${filePath}`);
    outputChannel.show(true);

    // 显示处理进度
    return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在解码 Xlog 文件...',
          cancellable: false
        },
        async () => {
          // 执行解压
          try {
            const outputFile = await decodeXlogFile(filePath);

            if (outputFile && fs.existsSync(outputFile)) {
              // 检查文件大小
              const stats = fs.statSync(outputFile);
              const fileSizeInMB = stats.size / (1024 * 1024);

              outputChannel.appendLine(
                  `解码成功: ${outputFile} (${fileSizeInMB.toFixed(2)}MB)`);

              // 检查用户是否配置了自动打开文件
              const autoOpen = getAutoOpenDecodedFile();
              if (autoOpen) {
                outputChannel.appendLine('在VSCode中打开文件...');
                try {
                  const openDocument =
                      await vscode.workspace.openTextDocument(outputFile);
                  await vscode.window.showTextDocument(openDocument);
                } catch (err) {
                  // 如果VSCode无法打开文件，提供备选方案
                  outputChannel.appendLine(`VSCode无法直接打开文件: ${err}`);
                  const action = await vscode.window.showInformationMessage(
                      `解码成功，但VSCode无法直接打开该文件。`, '显示文件位置',
                      '忽略');

                  if (action === '显示文件位置') {
                    // 在文件资源管理器中显示文件
                    const dirPath = path.dirname(outputFile);
                    outputChannel.appendLine(`打开文件位置: ${dirPath}`);
                    await vscode.env.openExternal(vscode.Uri.file(dirPath));
                  }
                }
              }
              vscode.window.showInformationMessage(`解码成功: ${outputFile}`);
              return outputFile;
            } else {
              const errorMsg = '解码完成，但找不到输出文件';
              outputChannel.appendLine(errorMsg);
              vscode.window.showErrorMessage(errorMsg);
              throw new Error(errorMsg);
            }
          } catch (innerError) {
            outputChannel.appendLine(`内部解码错误: ${innerError}`);
            if (innerError instanceof Error) {
              outputChannel.appendLine(
                  `堆栈: ${innerError.stack || '无堆栈信息'}`);
            }
            throw innerError;
          }
        });
  } catch (error) {
    if (error instanceof Error) {
      // 使用增强的错误处理
      await handlePythonError(error);

      // 记录详细错误信息到输出通道
      let outputChannel = vscode.window.createOutputChannel('Xlog 解码工具');
      outputChannel.appendLine(`解码错误: ${error.message}`);
      outputChannel.appendLine(`堆栈: ${error.stack || '无堆栈信息'}`);
      outputChannel.show(true);
    } else {
      vscode.window.showErrorMessage(`解码失败: ${error}`);
    }

    // 重新抛出错误，让调用者知道发生了错误
    throw error;
  }
}