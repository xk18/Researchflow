# ResearchFlow 分享与分发

适用版本：1.7.2 · Windows x64

## 安装与阅读

在 [GitHub Releases](https://github.com/xk18/researchflow/releases/tag/v1.7.2) 下载 `ResearchFlow_1.7.2_x64-setup.exe`。普通用户不需要 Node.js、Rust 或源码。也可以下载 `ResearchFlow-1.7.2-Windows-x64-share.zip`，解压后阅读“先读我”并运行安装包。

分享包包含安装包、原版使用说明书 PDF、许可、版权通知、第三方许可及包内文件校验清单。PDF 随原 1.7.2 安装包归档保留；当前的许可、安装及隐私说明以本仓库对应文件为准。

运行要求为 Windows 10 / 11 x64 和 Microsoft Edge WebView2 Runtime。缺少运行库时，安装过程可能需要联网下载；安装后核心功能可离线使用。1.7.2 安装包未做代码签名，Windows 可能提示未知发布者。请核实下载来源和 SHA256，并遵守单位电脑的管理规则。

## 给开发者

克隆仓库，或下载 `ResearchFlow-1.7.2-source.zip`。源码包包含工程、锁文件、README、使用说明和产品截图，不包含科研记录、构建缓存或 Git 历史。按 [开发说明](DEVELOPMENT.zh-CN.md) 准备工具并构建。

GitHub 的 **Code → Download ZIP 是源码，不是安装程序**。源码、文档和本项目素材采用 [PolyForm Noncommercial 1.0.0](../LICENSE)，商业用途需另行获得许可。分发时保留许可与 [版权通知](../COPYRIGHT.txt)。第三方组件许可见 [第三方许可通知](../THIRD_PARTY_NOTICES.txt)。

## 数据迁移与升级

分享软件不需要附上自己的 JSON 备份。安装文件不包含作者的科研记录，但同一 Windows 账户下已有的 ResearchFlow 数据仍会被应用读取。

换电脑前，从“设置”导出 JSON；在另一台电脑安装同版本或兼容版本后恢复。恢复前先备份目标电脑的现有数据。JSON 不包含所记录路径指向的数据集、脚本或论文文件，它们需要单独迁移。

升级前导出 JSON、保存输入并从托盘完全退出旧版，再运行新版安装包。不要手动删除应用数据目录。软件没有自动更新服务。更多说明见 [安装与升级](INSTALL.zh-CN.md)。

## 外部 AI 与分享范围

ResearchFlow 不内置 AI 模型、不需要 API Key，也不直接连接 AI 服务。你可以主动复制计划或周报提示词到外部平台，检查生成内容，再导入计划 JSON。

备份、周报、截图和复制出去的文字可能包含未公开科研内容。分享前自行检查患者信息、项目名称、内部路径和机构保密要求，参阅 [隐私说明](PRIVACY.zh-CN.md)。

## 文件与校验

| 文件 | 用途 |
| --- | --- |
| `ResearchFlow_1.7.2_x64-setup.exe` | Windows 安装包 |
| `ResearchFlow-1.7.2-使用说明书.pdf` | 随 1.7.2 归档的使用手册 |
| `ResearchFlow-1.7.2-Windows-x64-share.zip` | 面向普通用户的安装与阅读材料 |
| `ResearchFlow-1.7.2-source.zip` | 面向开发者的源码与文档 |
| `LICENSE`、`COPYRIGHT.txt`、`THIRD_PARTY_NOTICES.txt` | 本项目及第三方许可 |
| `SHA256-release-v1.7.2.json` | Release 附件完整性校验 |

分享包内另附 `SHA256-share.json`，对应包内文件。可以用 PowerShell 的 `Get-FileHash -Algorithm SHA256` 与清单比对。哈希只能验证文件是否与清单一致，不能替代可信下载来源或数字签名。
