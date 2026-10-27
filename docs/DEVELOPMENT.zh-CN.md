# 开发与检查

ResearchFlow 使用 Tauri 2、Rust、React、TypeScript 和 Vite。普通用户请下载安装包。

## 环境

Windows 10 / 11 x64；Node.js 22.12+（推荐 24）；Rust stable MSVC；Visual Studio 2022 Build Tools 的 C++ 工作负载和 Windows SDK；Microsoft Edge WebView2。

```powershell
npm ci
npm run desktop
```

浏览器前端可用 npm run dev 预览。它使用独立 localStorage，不读取正式桌面 AppData。项目有部分截图测试使用本地验收输出路径，它们仅服务开发，不是应用运行依赖。

## 检查与打包

```powershell
npx playwright install chromium
npm test
npm run test:ui
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run package
```

安装包输出到 src-tauri/target/release/bundle/nsis。锁文件应保留，不需要上传 node_modules 或 target。

## 数据边界

桌面正式数据位于当前 Windows 账户的应用数据目录，可从软件设置查看。不要用真实科研文件做公开测试，不将备份、日志或个人配置放入仓库。涉及迁移、导入、删除和多窗口写入时，必须验证失败恢复及旧记录兼容。

1.7.2 既有验证记录为：141 项单元测试、65 项浏览器界面测试、10 项 Rust 测试，TypeScript/Vite 构建和 NSIS 打包通过。这是应用归档时的结果，不代表每次文档调整都重新运行全部检查。原生 WebView、托盘、覆盖安装及物理 DPI 未在该次验收中实机验证。
