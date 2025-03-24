import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 删除解码后的文件
 * @param dirPath 目录路径
 * @returns 删除的文件数量
 */
async function deleteDecodedFiles(dirPath: string): Promise<number> {
  let deletedCount = 0;

  // 遍历目录
  for (const file of fs.readdirSync(dirPath)) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile() && file.endsWith('_.log')) {
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
      } catch (err) {
        console.error(`删除文件失败: ${filePath}`, err);
      }
    } else if (stat.isDirectory()) {
      // 递归处理子目录
      deletedCount += await deleteDecodedFiles(filePath);
    }
  }

  return deletedCount;
}

/**
 * 删除解码文件命令处理函数
 * @param dirUri 目录URI，可选
 */
export async function deleteDecodedFilesCommand(dirUri?: vscode.Uri): Promise<void> {
  try {
    let dirPath: string;

    // 如果是从右键菜单触发，dirUri会被传入
    if (dirUri) {
      dirPath = dirUri.fsPath;
    }
    // 否则从当前编辑器获取文件路径
    else if (vscode.window.activeTextEditor) {
      dirPath = path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
    } else {
      vscode.window.showErrorMessage('没有找到目录');
      return;
    }

    // 验证目录是否存在
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      vscode.window.showErrorMessage('请选择有效的目录');
      return;
    }

    // 显示确认对话框
    const result = await vscode.window.showWarningMessage(
      '确定要删除该目录下所有的解码文件（*_.log）吗？',
      { modal: true },
      '确定'
    );

    if (result !== '确定') {
      return;
    }

    // 显示进度
    const progress = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在删除已解码日志文件...',
        cancellable: false
      },
      async () => {
        return await deleteDecodedFiles(dirPath);
      }
    );

    if (progress > 0) {
      vscode.window.showInformationMessage(`成功删除 ${progress} 个解码文件`);
    } else {
      vscode.window.showInformationMessage('未找到解码文件');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`已解码日志文件失败: ${error}`);
  }
}