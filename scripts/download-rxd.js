/**
 * 此脚本用于从GitHub下载rxd可执行文件
 * 根据不同平台下载对应的二进制文件
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// GitHub发布版本URL
const GITHUB_REPO = 'ircc/rxd';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const USER_AGENT = 'vscode-xlog-extension';

// 输出目录
const BIN_DIR = path.join(__dirname, '..', 'resources', 'bin');

// 确保目标目录存在
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

/**
 * 获取最新版本信息
 */
async function getLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': USER_AGENT }
    };

    const req = https.get(GITHUB_API, options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`GitHub API请求失败: ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          resolve(release);
        } catch (error) {
          reject(new Error(`解析GitHub API响应失败: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`GitHub API请求错误: ${error.message}`));
    });

    req.end();
  });
}

/**
 * 下载文件
 */
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': USER_AGENT }
    };

    const req = https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: ${res.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (error) => {
        fs.unlinkSync(destPath);
        reject(error);
      });
    });

    req.on('error', (error) => {
      reject(new Error(`下载错误: ${error.message}`));
    });

    req.end();
  });
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('获取最新的rxd版本...');
    const release = await getLatestRelease();

    console.log(`找到最新版本: ${release.tag_name}`);

    const platform = os.platform();
    const arch = os.arch();

    // 确定需要下载的文件
    const filesToDownload = [];

    // 为当前平台下载
    if (platform === 'win32') {
      filesToDownload.push({
        name: 'rxd-windows-x86_64.exe',
        destName: 'rxd-windows-x86_64.exe'
      });
    } else if (platform === 'darwin') {
      filesToDownload.push({
        name: 'rxd-macos-x86_64',
        destName: 'rxd-macos-x86_64'
      });
      filesToDownload.push({
        name: 'rxd-macos-arm64',
        destName: 'rxd-macos-arm64'
      });
    } else if (platform === 'linux') {
      filesToDownload.push({
        name: 'rxd-linux-x86_64',
        destName: 'rxd-linux-x86_64'
      });
    }

    // 从release assets中找到匹配的下载文件
    for (const fileInfo of filesToDownload) {
      const asset = release.assets.find(a => a.name === fileInfo.name);

      if (!asset) {
        console.warn(`警告: 找不到资源 ${fileInfo.name}`);
        continue;
      }

      const destPath = path.join(BIN_DIR, fileInfo.destName);
      console.log(`下载 ${asset.browser_download_url} 到 ${destPath}`);

      await downloadFile(asset.browser_download_url, destPath);
      console.log(`下载 ${fileInfo.name} 完成`);

      // 设置可执行权限 (非Windows平台)
      if (platform !== 'win32') {
        fs.chmodSync(destPath, '755');
        console.log(`已设置 ${destPath} 为可执行`);
      }
    }

    console.log('下载完成!');
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

// 执行主函数
main();