/**
 * 此脚本用于从GitHub下载rxd可执行文件
 * 根据不同平台下载对应的二进制文件
 * 仅当文件不存在时才下载
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
// 版本号记录文件（供编译/打包时读取）
const VERSION_FILE = path.join(BIN_DIR, 'rxd-version.txt');

// 确保目标目录存在
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

/**
 * 写入并打印 rxd 版本号
 */
function writeAndPrintRxdVersion(tagName) {
  const version = tagName || '';
  try {
    fs.writeFileSync(VERSION_FILE, version, 'utf8');
  } catch (e) {
    console.warn(`无法写入版本文件: ${e.message}`);
  }
  console.log('');
  console.log('========== rxd 解码器版本 ==========');
  console.log(`  rxd 版本: ${version || '未知'}`);
  console.log('=====================================');
  console.log('');
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
 * 仅当文件不存在时才下载
 */
async function downloadAllPlatforms(release) {
  const fileList = [
    { name: 'rxd-windows-x86_64.exe', destName: 'rxd-windows-x86_64.exe' },
    { name: 'rxd-macos-x86_64', destName: 'rxd-macos-x86_64' },
    { name: 'rxd-macos-arm64', destName: 'rxd-macos-arm64' }
  ];

  // 检查哪些文件需要下载
  const filesToDownload = fileList.filter(fileInfo => {
    const destPath = path.join(BIN_DIR, fileInfo.destName);
    const exists = fs.existsSync(destPath);
    if (exists) {
      console.log(`文件已存在，跳过下载: ${destPath}`);
      return false;
    }
    return true;
  });

  if (filesToDownload.length === 0) {
    console.log('所有文件都已存在，无需下载');
    return;
  }

  // 批量下载缺少的文件
  const downloadPromises = [];

  for (const fileInfo of filesToDownload) {
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
    console.log('检查rxd可执行文件...');

    // 首先检查是否所有文件都存在
    const requiredFiles = [
      'rxd-windows-x86_64.exe',
      'rxd-macos-x86_64',
      'rxd-macos-arm64'
    ];

    const allFilesExist = requiredFiles.every(filename => {
      const filePath = path.join(BIN_DIR, filename);
      return fs.existsSync(filePath);
    });

    if (allFilesExist) {
      console.log('所有rxd可执行文件已存在，无需下载');
      let savedVersion = '';
      if (fs.existsSync(VERSION_FILE)) {
        try {
          savedVersion = fs.readFileSync(VERSION_FILE, 'utf8').trim();
        } catch (e) {
          // 忽略
        }
      }
      // 若版本文件不存在，拉取一次最新版本并写入，便于后续编译/打包时显示
      if (!savedVersion) {
        console.log('正在获取 rxd 最新版本号并写入...');
        try {
          const release = await getLatestRelease();
          savedVersion = release.tag_name || '';
          writeAndPrintRxdVersion(savedVersion);
        } catch (e) {
          console.warn(`获取版本失败: ${e.message}，将显示为未知`);
          writeAndPrintRxdVersion('未知（获取版本失败）');
        }
      } else {
        writeAndPrintRxdVersion(savedVersion);
      }
      return;
    }

    console.log('发现缺少的rxd可执行文件，正在获取最新版本...');
    const release = await getLatestRelease();

    writeAndPrintRxdVersion(release.tag_name);

    // 下载缺少的文件
    await downloadAllPlatforms(release);

    console.log('所有必要的下载已完成!');
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

// 执行主函数
main();