import * as os from 'os';
import * as fs from 'fs';
import * as vscode from 'vscode';

import {getRxdPath} from '../utils/config';
import {getRxdCommand} from '../utils/rxd';

/**
 * 显示插件信息和解码器配置
 */
export async function showXlogDecodeInfoCommand(): Promise<void> {
  try {
    const customRxdPath = getRxdPath();
    let rxdExePath = '';

    try {
      rxdExePath = getRxdCommand();
    } catch (e) {
      rxdExePath = '找不到rxd可执行文件';
    }

    // 检查rxd可执行文件是否存在
    const rxdExists = fs.existsSync(rxdExePath);

    // 获取操作系统信息
    const platform = os.platform();
    const arch = os.arch();
    let platformInfo = '';

    switch (platform) {
      case 'win32':
        platformInfo = 'Windows';
        break;
      case 'darwin':
        platformInfo = `macOS (${arch === 'arm64' ? 'Apple Silicon' : 'Intel'})`;
        break;
      default:
        platformInfo = `${platform} (${arch})`;
    }

    vscode.window.showInformationMessage(
        `Xlog解码工具信息:\n` +
        `- 操作系统: ${platformInfo}\n` +
        `- Rxd解码器: ${rxdExists ? '已安装' : '未安装'}\n` +
        `- 解码器路径: ${customRxdPath || '默认'}\n` +
        `- 可执行文件: ${rxdExePath}`);
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(`获取信息失败: ${error.message}`);
    } else {
      vscode.window.showErrorMessage(`获取信息失败`);
    }
  }
}