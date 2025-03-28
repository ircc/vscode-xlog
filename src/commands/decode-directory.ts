import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {decodeXlogDirectory} from '../services/xlog-decoder';
import {getAutoOpenDecodedFile} from '../utils/config';
import {handleRxdError} from '../utils/rxd';

/**
 * 解码目录中的所有Xlog文件
 * @param dirUri 目录URI，可选
 */
export async function decodeXlogDirectoryCommand(dirUri?: vscode.Uri):
    Promise<void> {
  try {
    let dirPath: string;

    // 如果是从右键菜单触发，dirUri会被传入
    if (dirUri) {
      dirPath = dirUri.fsPath;
    } else {
      // 否则让用户选择目录
      const folders = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: '选择包含Xlog文件的目录'
      });

      if (!folders || folders.length === 0) {
        return;
      }

      dirPath = folders[0].fsPath;
    }

    // 创建输出通道
    const outputChannel = vscode.window.createOutputChannel('Xlog 解码目录');

    // 显示解码进度
    outputChannel.clear();
    outputChannel.appendLine(`开始解码目录: ${dirPath}`);
    outputChannel.show(true);

    // 记录开始时间
    const startTime = Date.now();

    // 显示处理进度
    await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在解码目录中的 Xlog 文件...',
          cancellable: false
        },
        async () => {
          // 执行解压
          const outputFiles = await decodeXlogDirectory(dirPath);

          if (outputFiles.length > 0) {
            // 过滤掉不存在的文件
            const existingFiles =
                outputFiles.filter(file => fs.existsSync(file));

            // 计算总耗时
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000; // 转换为秒

            // 显示解码结果
            vscode.window.showInformationMessage(
                `解码完成: 共解码 ${outputFiles.length} 个文件，` +
                `${existingFiles.length} 个成功，耗时 ${duration.toFixed(2)}秒`);

            // 记录所有解码文件
            outputChannel.appendLine('解码成功的文件:');
            existingFiles.forEach(file => {
              const stats = fs.statSync(file);
              const fileSizeInMB = stats.size / (1024 * 1024);
              outputChannel.appendLine(
                  `- ${file} (${fileSizeInMB.toFixed(2)}MB)`);
            });
            outputChannel.appendLine(`总耗时: ${duration.toFixed(2)}秒`);

            // 检查用户是否配置了自动打开文件
            const autoOpen = getAutoOpenDecodedFile();
            if (autoOpen && existingFiles.length > 0) {
              try {
                // 检查文件大小
                const stats = fs.statSync(existingFiles[0]);
                const fileSizeInMB = stats.size / (1024 * 1024);

                // 如果文件大于50MB，直接使用vscode打开而不是通过扩展API
                if (fileSizeInMB > 50) {
                  outputChannel.appendLine(`文件大小超过50MB，使用VSCode原生方式打开`);
                  // 使用vscode.open命令在VSCode中打开文件，而不是在外部应用打开
                  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(existingFiles[0]));
                } else {
                  const doc =
                      await vscode.workspace.openTextDocument(existingFiles[0]);
                  await vscode.window.showTextDocument(doc);
                }
              } catch (err) {
                // 如果VSCode无法打开文件，提供备选方案
                outputChannel.appendLine(`VSCode无法直接打开文件: ${err}`);
                const action = await vscode.window.showInformationMessage(
                    `解码成功，但VSCode无法直接打开该文件。`, '显示文件位置',
                    '忽略');

                if (action === '显示文件位置') {
                  // 在文件资源管理器中显示文件
                  const dirPath = path.dirname(existingFiles[0]);
                  await vscode.env.openExternal(vscode.Uri.file(dirPath));
                }
              }
            }
          } else {
            outputChannel.appendLine('没有找到可以解码的Xlog文件');
            vscode.window.showInformationMessage('没有找到可以解码的Xlog文件');
          }
        });
  } catch (error) {
    if (error instanceof Error) {
      // 使用增强的错误处理
      await handleRxdError(error);

      // 记录详细错误信息到输出通道
      const outputChannel = vscode.window.createOutputChannel('Xlog 解码目录');
      outputChannel.appendLine(`解码错误: ${error.message}`);
      outputChannel.appendLine(`堆栈: ${error.stack || '无堆栈信息'}`);
      outputChannel.show(true);
    } else {
      vscode.window.showErrorMessage(`解码失败: ${error}`);
    }
  }
}