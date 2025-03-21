# VSCode Xlog 解码工具

一个用于解码 Xlog 日志文件的 VSCode 扩展。

## 功能

- 支持解码 xlog 格式的文件，生成名为 xxx_.log 的解密日志文件
- 在 VSCode 资源管理器中为 xlog 文件添加右键菜单解码选项
- 在 VSCode 资源管理器中为目录添加右键菜单，支持批量解码目录中的所有 xlog 文件
- 打开 xlog 文件时自动提示解码选项

## 要求

此扩展需要 Python 2.7+ 环境。

## 设置

此扩展提供以下设置：

- `vscode-xlog.pythonPath`: Python 解释器路径。留空则使用系统默认的 python 命令。
- `vscode-xlog.autoOpenDecodedFile`: 解码完成后是否自动打开解码后的文件，默认为 true。

## 使用方法

### 解码单个文件

1. 在资源管理器中右键点击 .xlog 文件
2. 选择 "解码 Xlog 文件" 选项
3. 等待解码完成，解码后的文件将自动打开（如果设置允许）

### 解码整个目录

1. 在资源管理器中右键点击包含 .xlog 文件的目录
2. 选择 "解码目录中的所有 Xlog 文件" 选项
3. 等待解码完成，将显示解码成功的文件数量

### 自动提示解码

打开 .xlog 文件时，会自动弹出解码提示，点击 "是" 即可开始解码。

## 常见问题

### Python 路径问题

如果遇到 "无法启动 Python 进程" 的错误，请在设置中指定 Python 解释器的完整路径，例如：
```
C:\Python27\python.exe
```

### 显示诊断信息

使用 "显示 Xlog 解码工具信息" 命令可以查看当前配置和 Python 版本信息，有助于排查问题。

## 贡献

欢迎提交问题报告和功能建议到 [GitHub 仓库](https://github.com/yourusername/vscode-xlog)。

## 许可证

MIT