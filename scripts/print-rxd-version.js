/**
 * 读取并打印当前使用的 rxd 版本号（用于编译/打包时输出）
 */
const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '..', 'resources', 'bin');
const VERSION_FILE = path.join(BIN_DIR, 'rxd-version.txt');

function main() {
  let version = '未知（未执行过 download-rxd 或版本文件不存在）';
  if (fs.existsSync(VERSION_FILE)) {
    try {
      version = fs.readFileSync(VERSION_FILE, 'utf8').trim() || version;
    } catch (e) {
      version = `读取失败: ${e.message}`;
    }
  }
  console.log('');
  console.log('========== rxd 解码器版本 ==========');
  console.log(`  rxd 版本: ${version}`);
  console.log('=====================================');
  console.log('');
}

main();
