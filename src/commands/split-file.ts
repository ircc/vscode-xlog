import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 分割日志文件
 * @param fileUri 文件URI，可选
 */
export async function splitFileCommand(fileUri?: vscode.Uri): Promise<void> {
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

    // 验证文件是否存在
    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`文件不存在: ${filePath}`);
      return;
    }

    // 验证文件扩展名
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.log') {
      vscode.window.showErrorMessage('请选择 .log 文件');
      return;
    }

    // 检查文件大小
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    const fileSizeInBytes = stats.size;

    // 检查文件是否大于 800MB
    if (fileSizeInMB <= 800) {
      vscode.window.showWarningMessage(
          `文件大小 ${fileSizeInMB.toFixed(2)}MB 小于 800MB，无需分割`);
      return;
    }

    // 提示输入分割后单文件大小（默认 500MB）
    const input = await vscode.window.showInputBox({
      prompt: '请输入分割后单文件大小（MB），直接确认使用默认值 500MB',
      placeHolder: '500',
      value: '500',
      validateInput: (value) => {
        if (value.trim() === '') {
          return null; // 允许空值，使用默认值
        }
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) {
          return '请输入大于 0 的数字';
        }
        if (num > fileSizeInMB) {
          return `分割大小不能大于原文件大小 ${fileSizeInMB.toFixed(2)}MB`;
        }
        return null;
      }
    });

    // 如果用户取消，直接返回
    if (input === undefined) {
      return;
    }

    // 解析分割大小（MB 转字节）
    const splitSizeInMB = input.trim() === '' ? 500 : parseFloat(input);
    const splitSizeInBytes = splitSizeInMB * 1024 * 1024;

    // 创建输出通道
    const outputChannel = vscode.window.createOutputChannel('文件分割工具');
    outputChannel.clear();
    outputChannel.appendLine(`开始分割文件: ${filePath}`);
    outputChannel.appendLine(`文件大小: ${fileSizeInMB.toFixed(2)}MB`);
    outputChannel.appendLine(`分割后单文件大小: ${splitSizeInMB.toFixed(2)}MB`);
    outputChannel.show(true);

    // 显示处理进度
    await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在分割文件...',
          cancellable: false
        },
        async (progress) => {
          try {
            // 获取文件信息
            const fileName = path.basename(filePath, '.log');
            const fileDir = path.dirname(filePath);

            // 创建同名子目录
            const outputDir = path.join(fileDir, fileName);
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, {recursive: true});
              outputChannel.appendLine(`创建输出目录: ${outputDir}`);
            }

            // 打开源文件进行读取 - 使用更大的缓冲区以提高性能
            const readStream = fs.createReadStream(filePath, {
              encoding: 'utf8',
              highWaterMark: 2 * 1024 * 1024  // 2MB 缓冲区，大幅提升读取速度
            });

            let currentFileIndex = 1;
            let currentFileSize = 0;
            let currentWriteStream: fs.WriteStream | null = null;
            let buffer = '';
            let pendingLines: string[] = [];  // 批量写入缓冲区
            let pendingSize = 0;  // 缓存待写入缓冲区的大小，避免重复计算
            const BATCH_SIZE = 100;  // 每批写入100行
            let lastProgressReport = Date.now();

            // 计算预计分割文件数量
            const estimatedFiles = Math.ceil(fileSizeInBytes / splitSizeInBytes);
            outputChannel.appendLine(`预计将分割为 ${estimatedFiles} 个文件`);

            // 批量写入函数
            const flushPendingLines = () => {
              if (pendingLines.length > 0 && currentWriteStream) {
                const batch = pendingLines.join('');
                currentWriteStream.write(batch);
                currentFileSize += Buffer.byteLength(batch, 'utf8');
                pendingLines = [];
                pendingSize = 0;
              }
            };

            return new Promise<void>((resolve, reject) => {
              readStream.on('data', (chunk: string) => {
                buffer += chunk;

                // 处理缓冲区，按行分割 - 使用更高效的方法
                let newlineIndex = buffer.indexOf('\n');
                while (newlineIndex !== -1) {
                  const line = buffer.substring(0, newlineIndex + 1);
                  buffer = buffer.substring(newlineIndex + 1);

                  // 检查是否需要切换文件（考虑待写入缓冲区的大小）
                  const lineSize = Buffer.byteLength(line, 'utf8');
                  if (currentWriteStream &&
                      currentFileSize + pendingSize + lineSize > splitSizeInBytes) {
                    // 先刷新待写入的行
                    flushPendingLines();
                    currentWriteStream.end();
                    currentWriteStream = null;
                    currentFileIndex++;
                    currentFileSize = 0;
                    // 减少输出频率，只在每完成一个文件时输出
                    const now = Date.now();
                    if (now - lastProgressReport > 1000) {  // 至少间隔1秒
                      outputChannel.appendLine(
                          `完成文件 ${currentFileIndex - 1}/${estimatedFiles}`);
                      lastProgressReport = now;
                    }
                    progress.report({
                      increment: 100 / estimatedFiles,
                      message: `正在处理第 ${currentFileIndex} 个文件...`
                    });
                  }

                  // 如果当前没有写入流，创建新文件
                  if (!currentWriteStream) {
                    const outputFileName = `${fileName}_${currentFileIndex}.log`;
                    const outputFilePath = path.join(outputDir, outputFileName);
                    currentWriteStream = fs.createWriteStream(outputFilePath, {
                      encoding: 'utf8',
                      highWaterMark: 2 * 1024 * 1024  // 2MB 写入缓冲区
                    });
                    // 只在创建第一个文件时输出
                    if (currentFileIndex === 1) {
                      outputChannel.appendLine(
                          `创建分割文件: ${outputFileName}`);
                    }
                  }

                  // 添加到批量写入缓冲区
                  pendingLines.push(line);
                  pendingSize += lineSize;  // 更新缓存的大小

                  // 当缓冲区达到批量大小时，批量写入
                  if (pendingLines.length >= BATCH_SIZE) {
                    flushPendingLines();
                  }

                  newlineIndex = buffer.indexOf('\n');
                }
              });

              readStream.on('end', () => {
                // 处理剩余的缓冲区内容
                if (buffer.length > 0) {
                  if (!currentWriteStream) {
                    const outputFileName = `${fileName}_${currentFileIndex}.log`;
                    const outputFilePath = path.join(outputDir, outputFileName);
                    currentWriteStream = fs.createWriteStream(outputFilePath, {
                      encoding: 'utf8',
                      highWaterMark: 2 * 1024 * 1024
                    });
                  }
                  // 将剩余内容添加到批量缓冲区
                  const remainingSize = Buffer.byteLength(buffer, 'utf8');
                  pendingLines.push(buffer);
                  pendingSize += remainingSize;
                  buffer = '';
                }

                // 刷新所有待写入的行
                flushPendingLines();

                // 关闭最后一个文件
                if (currentWriteStream) {
                  currentWriteStream.end();
                  outputChannel.appendLine(
                      `完成文件 ${currentFileIndex}/${estimatedFiles}`);
                }

                // 删除源文件
                try {
                  fs.unlinkSync(filePath);
                  outputChannel.appendLine(`已删除源文件: ${filePath}`);
                } catch (err) {
                  const errorMsg =
                      `删除源文件失败: ${err instanceof Error ? err.message : err}`;
                  outputChannel.appendLine(errorMsg);
                  vscode.window.showWarningMessage(errorMsg);
                }

                // 显示完成信息
                const finalStats = fs.readdirSync(outputDir)
                                    .filter(f => f.endsWith('.log'))
                                    .map(f => {
                                      const filePath = path.join(outputDir, f);
                                      const stats = fs.statSync(filePath);
                                      return {
                                        name: f,
                                        size: stats.size / (1024 * 1024)
                                      };
                                    });

                outputChannel.appendLine(`\n分割完成！共生成 ${finalStats.length} 个文件:`);
                finalStats.forEach(file => {
                  outputChannel.appendLine(
                      `  - ${file.name} (${file.size.toFixed(2)}MB)`);
                });

                vscode.window.showInformationMessage(
                    `文件分割完成！共生成 ${finalStats.length} 个文件，保存在: ${outputDir}`);

                // 分割完成后1秒关闭输出面板
                setTimeout(() => {
                  outputChannel.hide();
                }, 1000);

                resolve();
              });

              readStream.on('error', (err) => {
                if (currentWriteStream) {
                  currentWriteStream.end();
                }
                const errorMsg = `读取文件时发生错误: ${err.message}`;
                outputChannel.appendLine(errorMsg);
                reject(new Error(errorMsg));
              });
            });
          } catch (error) {
            const errorMsg =
                `分割文件时发生错误: ${error instanceof Error ? error.message : error}`;
            outputChannel.appendLine(errorMsg);
            if (error instanceof Error && error.stack) {
              outputChannel.appendLine(`堆栈: ${error.stack}`);
            }
            throw error;
          }
        });
  } catch (error) {
    const errorMsg =
        `分割文件失败: ${error instanceof Error ? error.message : error}`;
    vscode.window.showErrorMessage(errorMsg);

    // 记录详细错误信息到输出通道
    const outputChannel = vscode.window.createOutputChannel('文件分割工具');
    outputChannel.appendLine(`分割错误: ${errorMsg}`);
    if (error instanceof Error && error.stack) {
      outputChannel.appendLine(`堆栈: ${error.stack}`);
    }
    outputChannel.show(true);
  }
}

