import * as os from 'os';
import * as vscode from 'vscode';

import {getPythonPath} from '../utils/config';
import {checkPythonVersion, getPythonCommand} from '../utils/python';

/**
 * 显示插件信息和Python配置
 */
export async function showXlogDecodeInfoCommand(): Promise<void> {
  try {
    const customPythonPath = getPythonPath();
    const pythonCommand = getPythonCommand();

    let versionInfo = '未知';
    try {
      versionInfo = await checkPythonVersion(pythonCommand);
    } catch (e) {
      if (e instanceof Error) {
        versionInfo = `错误: ${e.message}`;
      } else {
        versionInfo = '错误: 未知';
      }
    }

    vscode.window.showInformationMessage(
        `Xlog解码工具信息:\n` +
        `- 操作系统: ${os.platform()}\n` +
        `- Python路径: ${customPythonPath || '默认'}\n` +
        `- Python版本: ${versionInfo}`);
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(`获取信息失败: ${error.message}`);
    } else {
      vscode.window.showErrorMessage(`获取信息失败`);
    }
  }
}