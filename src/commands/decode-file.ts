import * as fs from 'fs';
import * as vscode from 'vscode';

import {decodeXlogFile, isXlogFile} from '../services/xlog-decoder';
import {getAutoOpenDecodedFile} from '../utils/config';
import {handlePythonError} from '../utils/python';

/**
 * 解码单个Xlog文件
 * @param fileUri 文件URI，可选
 */
export async function decodeXlogFileCommand(fileUri?: vscode.Uri):
    Promise<void> {
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

    // 显示处理进度
    await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在解码 Xlog 文件...',
          cancellable: false
        },
        async () => {
          // 执行解压
          const outputFile = await decodeXlogFile(filePath);

          if (outputFile && fs.existsSync(outputFile)) {
            // 检查用户是否配置了自动打开文件
            const autoOpen = getAutoOpenDecodedFile();
            if (autoOpen) {
              const openDocument =
                  await vscode.workspace.openTextDocument(outputFile);
              await vscode.window.showTextDocument(openDocument);
            }
            vscode.window.showInformationMessage(`解码成功: ${outputFile}`);
          } else {
            vscode.window.showInformationMessage('解码完成，但找不到输出文件');
          }
        });
  } catch (error) {
    if (error instanceof Error) {
      // 使用增强的错误处理
      await handlePythonError(error);
    } else {
      vscode.window.showErrorMessage(`解码失败: ${error}`);
    }
  }
}