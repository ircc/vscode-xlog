@echo off
setlocal

if "%~1"=="" (
    echo 用法: %0 ^<版本号^>
    echo 例如: %0 1.0.0
    exit /b 1
)

set VERSION=%~1

rem 更新 package.json 中的版本号
call npm version %VERSION% --no-git-tag-version

rem 提交更改
git add package.json package-lock.json
git commit -m "版本 v%VERSION%"

rem 创建标签
git tag -a "v%VERSION%" -m "版本 v%VERSION%"

echo 版本 v%VERSION% 已创建。
echo 运行 'git push && git push --tags' 来推送更改并触发构建。