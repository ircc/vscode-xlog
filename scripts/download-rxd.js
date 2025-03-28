/**
 * 此脚本用于从GitHub下载rxd可执行文件
 * 根据不同平台下载对应的二进制文件
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
 * 处理HTTP重定向并下载文件
 */
async function downloadFile(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const makeRequest = (currentUrl, redirectCount) => {
      // 解析URL以确定使用http还是https
      const isHttps = currentUrl.startsWith('https:');
      const requester = isHttps ? https : http;

      const options = {
        headers: { 'User-Agent': USER_AGENT },
        followRedirect: false // 手动处理重定向
      };

      console.log(`尝试下载: ${currentUrl}`);

      const req = requester.get(currentUrl, options, (res) => {
        // 处理重定向
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          if (redirectCount >= maxRedirects) {
            reject(new Error(`重定向次数过多 (${redirectCount})`));
            return;
          }

          const location = res.headers.location;
          if (!location) {
            reject(new Error('重定向缺少Location头'));
            return;
          }

          console.log(`重定向到: ${location}`);
          makeRequest(location, redirectCount + 1);
          return;
        }

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
    };

    // 开始第一次请求
    makeRequest(url, 0);
  });
}

/**
 * 下载所有平台的rxd二进制文件
 * 不包括Linux版本（插件不支持Linux）
 */
async function downloadAllPlatforms(release) {
  const fileList = [
    { name: 'rxd-windows-x86_64.exe', destName: 'rxd-windows-x86_64.exe' },
    { name: 'rxd-macos-x86_64', destName: 'rxd-macos-x86_64' },
    { name: 'rxd-macos-arm64', destName: 'rxd-macos-arm64' }
  ];

  // 清理旧文件
  console.log('清理旧文件...');
  for (const fileInfo of fileList) {
    const destPath = path.join(BIN_DIR, fileInfo.destName);
    if (fs.existsSync(destPath)) {
      try {
        fs.unlinkSync(destPath);
        console.log(`删除旧文件: ${destPath}`);
      } catch (error) {
        console.warn(`无法删除旧文件 ${destPath}: ${error.message}`);
      }
    }
  }

  // 批量下载文件
  const downloadPromises = [];

  for (const fileInfo of fileList) {
    const asset = release.assets.find(a => a.name === fileInfo.name);

    if (!asset) {
      console.warn(`警告: 找不到资源 ${fileInfo.name}`);
      continue;
    }

    const destPath = path.join(BIN_DIR, fileInfo.destName);
    console.log(`下载 ${fileInfo.name} 到 ${destPath}`);

    const promise = downloadFile(asset.browser_download_url, destPath)
      .then(() => {
        console.log(`下载 ${fileInfo.name} 完成`);

        // 设置可执行权限（非Windows平台）
        if (fileInfo.name.indexOf('windows') === -1) {
          try {
            fs.chmodSync(destPath, '755');
            console.log(`已设置 ${destPath} 为可执行`);
          } catch (error) {
            console.warn(`无法设置执行权限: ${error.message}`);
          }
        }
      })
      .catch(error => {
        console.error(`下载 ${fileInfo.name} 失败: ${error.message}`);
      });

    downloadPromises.push(promise);
  }

  // 等待所有下载完成
  await Promise.all(downloadPromises);
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('获取最新的rxd版本...');
    const release = await getLatestRelease();

    console.log(`找到最新版本: ${release.tag_name}`);

    // 直接下载所有平台版本（不包含Linux）
    await downloadAllPlatforms(release);

    console.log('所有下载完成!');
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

// 执行主函数
main();