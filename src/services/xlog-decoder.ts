import * as fs from 'fs';
import * as path from 'path';

import {runPythonScript} from '../utils/python';

/**
 * 解码单个xlog文件
 * @param filePath 文件路径
 * @returns 解码后的文件路径
 */
export async function decodeXlogFile(filePath: string): Promise<string> {
  const pythonScriptPath =
      path.join(__dirname, '../../resources/decode_xlog.py');

  try {
    const output = await runPythonScript(pythonScriptPath, [filePath]);
    // 尝试从输出中获取生成的文件路径
    const match = output.match(/[Ss]uccessfully decoded: (.*)/);
    return match ? match[1] : '';
  } catch (error) {
    throw error;
  }
}

/**
 * 解码目录中的所有xlog文件
 * @param dirPath 目录路径
 * @returns 解码后的文件路径列表
 */
export async function decodeXlogDirectory(dirPath: string): Promise<string[]> {
  const pythonScriptPath =
      path.join(__dirname, '../../resources/decode_xlog.py');

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

/**
 * 检查文件是否为Xlog文件
 * @param filePath 文件路径
 * @returns 是否为Xlog文件
 */
export function isXlogFile(filePath: string): boolean {
  // 先检查文件扩展名
  if (!filePath.toLowerCase().endsWith('.xlog')) {
    return false;
  }

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    return false;
  }

  // 返回true，实际文件格式会在解码时进一步验证
  return true;
}

/**
 * 检查解码后的文件是否存在
 * @param filePath 文件路径
 * @returns 文件是否存在
 */
export function checkDecodedFileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}