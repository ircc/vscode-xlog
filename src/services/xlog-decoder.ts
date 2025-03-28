import * as fs from 'fs';
import * as path from 'path';

import {runRxdCommand} from '../utils/rxd';

/**
 * 解码单个xlog文件
 * @param filePath 文件路径
 * @returns 解码后的文件路径
 */
export async function decodeXlogFile(filePath: string): Promise<string> {
  // 使用rxd命令解码单个文件
  const output = await runRxdCommand(['extra-xlog', '-f', filePath]);

  // 尝试从输出中获取生成的文件路径
  // rxd的输出格式可能不同，这里假设它仍然包含类似的成功标识
  const match = output.match(/Successfully extracted: (.*)/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  // 如果没有找到成功标识，则假设输出文件是添加了_.log后缀的原文件
  return `${filePath}_.log`;
}

/**
 * 解码目录中的所有xlog文件
 * @param dirPath 目录路径
 * @returns 解码后的文件路径列表
 */
export async function decodeXlogDirectory(dirPath: string): Promise<string[]> {
  // 使用rxd命令解码目录
  const output = await runRxdCommand(['extra-xlog', '-d', dirPath]);

  // 解析输出，收集所有解码后的文件路径
  const files: string[] = [];
  const lines = output.split('\n');

  // 处理rxd的输出格式，提取文件路径
  for (const line of lines) {
    const match = line.match(/Successfully extracted: (.*)/i);
    if (match && match[1]) {
      files.push(match[1].trim());
    }
  }

  // 如果没有找到任何文件，自行扫描目录查找可能的解码结果
  if (files.length === 0) {
    // 递归扫描目录，查找所有以_.log结尾的文件
    const findDecodedFiles = (dir: string): string[] => {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findDecodedFiles(fullPath));
        } else if (entry.name.endsWith('_.log')) {
          results.push(fullPath);
        }
      }

      return results;
    };

    try {
      return findDecodedFiles(dirPath);
    } catch (error) {
      console.error(`扫描目录失败: ${error}`);
      return [];
    }
  }

  return files;
}

/**
 * 检查文件是否为Xlog文件
 * @param filePath 文件路径
 * @returns 是否为Xlog文件
 */
export function isXlogFile(filePath: string): boolean {
  // 先检查文件是否存在
  if (!fs.existsSync(filePath)) {
    return false;
  }

  // 获取文件扩展名（转换为小写）
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.xlog' || ext === '.mmap3';
}

/**
 * 检查解码后的文件是否存在
 * @param filePath 文件路径
 * @returns 文件是否存在
 */
export function checkDecodedFileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}