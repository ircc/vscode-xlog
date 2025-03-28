# VSCode Xlog 解码工具

一个用于解码 Xlog 日志文件的 VSCode 扩展。

## 功能

- 支持解码 xlog 格式的文件，生成名为 xxx_.log 的解密日志文件
- 支持Tencent Mars项目的xlog格式（V2和V3）
- 在 VSCode 资源管理器中为 xlog 文件添加右键菜单解码选项
- 在 VSCode 资源管理器中为目录添加右键菜单，支持批量解码目录中的所有 xlog 文件
- 打开 xlog 文件时自动解码，无需额外操作
- 支持处理超大日志文件，文件大小没有限制
- 基于高性能Rust实现的解码器，解码速度快，支持多平台

## 设置

此扩展提供以下设置：

- `vscode-xlog.rxdPath`: rxd 解码器路径。留空则使用插件自带的rxd解码器。
- `vscode-xlog.autoOpenDecodedFile`: 解码完成后是否自动打开解码后的文件，默认为 true。

## 使用方法

### 解码单个文件

1. 在资源管理器中右键点击 .xlog 文件
2. 选择 "解码 Xlog 文件" 选项
3. 等待解码完成，解码后的文件将自动打开（如果文件小于50MB）
4. 对于大于50MB的文件，扩展会自动在VSCode中打开文件

### 解码整个目录

1. 在资源管理器中右键点击包含 .xlog 文件的目录
2. 选择 "解码目录中的所有 Xlog 文件" 选项
3. 等待解码完成，将显示解码成功的文件数量及耗时
4. 解码完成后将自动打开第一个解码文件

### 自动解码

直接打开 .xlog 文件时，扩展会自动拦截并开始解码过程，无需手动确认。

## 支持的日志格式

- 标准ZIP格式的xlog文件
- Tencent Mars V2格式的xlog文件
- Tencent Mars V3格式的xlog文件
- 其他兼容格式

## 性能测试结果

解码引擎性能测试：

| 文件大小 | 解码耗时 |
|---------|--------|
| 10MB    | ~0.5秒 |
| 100MB   | ~4秒   |
| 1GB     | ~35秒  |

*测试环境：Windows 10，Intel i7处理器，16GB内存

## 开发指南

### 环境准备

```bash
# 安装依赖
npm install

# 下载rxd解码器（首次运行自动执行）
npm run download-rxd
```

### 编译与测试

```bash
# 编译TypeScript源码
npm run compile

# 监视模式编译（用于开发）
npm run watch

# 运行ESLint检查
npm run lint

# 运行测试
npm run test
```

### 打包扩展

```bash
# 安装vsce工具
npm install -g @vscode/vsce

# 打包VSIX文件
vsce package

# 本地安装扩展进行测试
code --install-extension vscode-xlog-1.0.0.vsix
```

## 注意事项

- 首次使用时，扩展会自动下载对应平台的rxd解码器
- 插件支持Windows和macOS平台
- 如需自定义解码器路径，请通过设置`vscode-xlog.rxdPath`指定
