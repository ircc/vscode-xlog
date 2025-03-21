import * as fs from 'fs';
import * as vscode from 'vscode';

import {decodeXlogDirectory} from '../services/xlog-decoder';
import {getAutoOpenDecodedFile} from '../utils/config';
import {handlePythonError} from '../utils/python';

/**
 * 解码目录中的所有Xlog文件
 * @param dirUri 目录URI
 */
export async function decodeXlogDirectoryCommand(dirUri: vscode.Uri):
    Promise<void> {
  try {
    if (!dirUri) {
      vscode.window.showErrorMessage('没有选择目录');
      return;
    }

    const dirPath = dirUri.fsPath;

    // 显示处理进度
    await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在解码目录中的 Xlog 文件...',
          cancellable: false
        },
        async () => {
          const outputFiles = await decodeXlogDirectory(dirPath);

          if (outputFiles.length > 0) {
            vscode.window.showInformationMessage(
                `成功解码 ${outputFiles.length} 个文件`);

            // 检查用户是否配置了自动打开文件
            const autoOpen = getAutoOpenDecodedFile();
            if (autoOpen && outputFiles.length > 0 &&
                fs.existsSync(outputFiles[0])) {
              const result = await vscode.window.showInformationMessage(
                  '是否打开第一个解码的文件?', '是', '否');

              if (result === '是') {
                const doc =
                    await vscode.workspace.openTextDocument(outputFiles[0]);
                await vscode.window.showTextDocument(doc);
              }
            }
          } else {
            vscode.window.showInformationMessage(
                '目录中没有找到可解码的 Xlog 文件');
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