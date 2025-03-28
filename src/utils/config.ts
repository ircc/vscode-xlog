import * as vscode from 'vscode';

/**
 * 获取插件配置
 * @returns 插件配置对象
 */
export function getConfig() {
  return vscode.workspace.getConfiguration('vscode-xlog');
}

/**
 * 获取rxd路径配置
 * @returns 配置的rxd可执行文件路径或undefined
 */
export function getRxdPath(): string|undefined {
  return getConfig().get<string>('rxdPath');
}

/**
 * 获取是否自动打开解码文件的配置
 * @returns 是否自动打开解码文件
 */
export function getAutoOpenDecodedFile(): boolean {
  return getConfig().get<boolean>('autoOpenDecodedFile', true);
}