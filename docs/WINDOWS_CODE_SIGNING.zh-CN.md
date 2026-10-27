# ResearchFlow 的 Windows 代码签名

这份说明针对当前 Tauri 2 + NSIS 的 Windows 分发方式。它是操作指南，尚未申请证书或实际执行签名。现有 1.7.2 归档安装包保持原样，仍为未签名。

## 先选择哪种签名

ResearchFlow 需要的是 **Windows Authenticode 代码签名**。购买时要明确说是 Windows EXE / NSIS 安装包使用的代码签名证书，不是网站 HTTPS 证书，也不是 Tauri 自动更新包的签名密钥。

对于个人开发者，可以先询问提供个人代码签名产品的证书机构（CA），是否接受中国大陆个人申请，再比较费用和使用方式。不要先付款再确认申请资格。Certum 官方目前列有个人或公司的标准代码签名产品，可作为询价对象；这不代表已经确认它接受你的地区、材料或身份。

先问清以下内容：

1. 中国大陆个人可以申请吗？需要哪些身份证明、地址证明，是否需要翻译或视频验证？
2. 数字签名中会公开哪些字段？发布者显示中文实名、拼音还是其他名称？城市、地区等是否公开？能否先查看证书主体预览？
3. 私钥存于 USB 硬件令牌还是云端 HSM？Windows 上能否使用 SignTool，是否需要专用客户端？
4. 总费用包括证书、硬件和运费吗？云端是否另收签名次数或订阅费用？验证失败如何退款？
5. 支持哪些 SHA-256 / RFC 3161 时间戳地址？续期和丢失令牌如何处理？

README 中可以继续署名“雪冠”，但公开信任证书通常基于核验过的个人或机构身份，不能假设发布者只显示网名。买证书前先确认自己是否接受相关身份字段公开。

不建议仅为了“立即消除 Windows 提示”购买昂贵的 EV 产品。新签名仍可能被 SmartScreen 提醒；EV 也不再保证新程序立即获得信誉。自签名证书也不能让陌生用户的 Windows 自动信任你的程序。

Microsoft Artifact Signing（原 Azure Trusted Signing）也是云签名方案，但有地区条件。按本次核对的官方说明，其公开信任个人开发者申请目前仅面向美国、加拿大；中国大陆个人不能直接按该途径申请。后续以申请时的官方资格页面为准，不通过虚构地址或身份绕过限制。

## 准备工具和证书

取得证书后，按 CA 说明安装 USB 令牌驱动和证书中间件，或配置云签名客户端。现在的公开信任代码签名通常要求受保护的硬件 / HSM 私钥，不要照搬旧教程中“把一个可导出的 PFX 和密码上传到 GitHub”的做法。

Windows 的 SignTool 随 Windows SDK 提供。安装 SDK 的签名工具后，在 Developer PowerShell 中运行 `signtool /?` 检查。找不到命令时，使用 SDK 安装目录中的 `signtool.exe`，不需要从陌生网站下载单独的可执行文件。

如果 CA 的中间件将证书显示在当前用户的证书库，可通过 `certmgr.msc` 查看“个人 → 证书”。也可以查看：

```powershell
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Select-Object Subject, Thumbprint, NotAfter, HasPrivateKey
```

显示证书不代表令牌或云端签名已经可用，还要按 CA 要求完成驱动、认证或 PIN 操作。某些提供商使用自有工具，不会直接出现在这个证书库中。

## 让 Tauri 在打包时签名

建议在后续单独的签名构建中完成：**构建程序 → 签署程序 → 打成安装包 → 签署安装包 → 验签 → 制作分享包及 SHA256**。只给安装包外壳签名，不等于里面的程序也已经签名。

本指南不修改当前工程配置，也不覆盖现有归档安装包。正式接入前应保留原件，并先处理发布检查报告中发现的编译路径残留：签名不会清除 EXE 内的本机路径。

如果 CA 明确支持从 Windows 证书库调用 SignTool，可以在本机单独保存签名配置，例如 `signing.local.json`。**不要提交这个本地配置。** 以下只展示字段结构，里面的两处占位符不能直接用于构建：

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "REPLACE_WITH_CERTIFICATE_THUMBPRINT",
      "digestAlgorithm": "sha256",
      "timestampUrl": "REPLACE_WITH_CA_RFC3161_TIMESTAMP_URL",
      "tsp": true
    }
  }
}
```

`certificateThumbprint` 是选取证书的 SHA-1 指纹；文件签名算法仍使用 `sha256`，两者不是同一件事。`tsp: true` 适用于 CA 提供的 RFC 3161 时间戳服务。如果 CA 使用其他协议，应按其说明调整。

填好实际指纹和 CA 的时间戳地址后，由 Tauri 合并本地配置构建：

```powershell
npm run package -- --config .\signing.local.json
```

这会生成新的程序和安装包，签名时可能弹出令牌 PIN 或云端认证。必须确认构建日志中的程序及安装包签名均成功。该命令是将来取得证书后的操作示例，本次没有执行。

若 CA 使用专用云签名工具，按其正式文档使用 `bundle.windows.signCommand` 接入，`%1` 表示 Tauri 传入的待签名文件路径。不要同时拼凑不兼容的证书库和云签名教程，也不要把密码或 API 凭据写进这个命令。

## SignTool 手动操作示例

下面说明 SignTool 参数，只适用于 CA 已确认支持 Windows 证书库的情况。对准备好的**副本**执行，`to-sign` 是示例目录，不指向本项目的归档文件：

```powershell
$signingThumbprint = 'REPLACE_WITH_CERTIFICATE_THUMBPRINT'
$signingTimestampUrl = 'REPLACE_WITH_CA_RFC3161_TIMESTAMP_URL'

signtool sign /sha1 $signingThumbprint /fd SHA256 /tr $signingTimestampUrl /td SHA256 '.\to-sign\ResearchFlow.exe'
```

随后必须使用已签名的 EXE 构建安装包，再对生成的安装包签名。签名一个已经包含未签名 EXE 的旧安装包，不能补上内部程序的签名。实际发行优先采用上面的 Tauri 集成方式，让程序和安装包按正确顺序处理。

`/tr` 与 `/td SHA256` 请求 RFC 3161 时间戳。时间戳用于证明签名发生的时间；在签名时有效、信任链和策略允许等条件下，可使证书正常到期后签名继续有效。不能据此保证撤销证书或不可信签名仍有效。

## 验签与发布

同时检查独立程序和安装包：

```powershell
signtool verify /pa /all /v '.\to-sign\ResearchFlow.exe'
signtool verify /pa /all /v '.\to-sign\ResearchFlow_x64-setup.exe'

Get-AuthenticodeSignature -LiteralPath '.\to-sign\ResearchFlow.exe' |
    Format-List Status, SignerCertificate, TimeStamperCertificate
Get-AuthenticodeSignature -LiteralPath '.\to-sign\ResearchFlow_x64-setup.exe' |
    Format-List Status, SignerCertificate, TimeStamperCertificate
```

应看到签名成功、预期的发布者、可信证书链和有效时间戳。再在独立测试环境验证安装，检查**实际安装出来的 EXE**，确认内外都签好了。

签名会改变文件字节和 SHA256。因此，必须先签名，再生成分享 ZIP 和校验清单；不能继续沿用未签名版本的哈希，也不应在用户确认文件清单后偷偷换成另一份文件。

签名只证明发布者身份及签名后文件是否被修改。它不替代版权许可，不阻止复制，也不会自动清除本机路径或审查科研内容。SmartScreen 还会考虑下载信誉等因素，不能承诺从此不出现安全提示。

私钥、PIN、云签名凭据、身份证明和地址材料只交给核实过的签名服务或保存在受控位置，不放入源码、Issue、日志或公开附件。签名时产生的联网和身份验证属于开发者发行流程，不是 ResearchFlow 用户运行时新增联网功能。

## 可以先发给 CA 的询问

> 我是中国大陆个人开发者，计划在 GitHub 发布 Windows 桌面软件 ResearchFlow，采用 Tauri 2、NSIS 安装包。请确认是否接受大陆个人申请 Windows Authenticode 代码签名证书，需要哪些验证材料，签名中将公开哪些姓名及地域字段。请同时说明 USB 令牌和云 HSM 方案的总费用、续期方式、SignTool / Tauri 接入方式及 RFC 3161 时间戳地址。项目为 PolyForm Noncommercial 许可，请不要默认按 OSI 开源项目处理。

## 官方参考

本次核对日期：2026-10-27。申请资格、收费和产品规则以实际办理时为准。

- [Tauri Windows 签名](https://v2.tauri.app/distribute/sign/windows/)
- [Tauri Windows 配置字段](https://v2.tauri.app/reference/config/#windowsconfig)
- [Microsoft SignTool 参数](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool)
- [Microsoft SmartScreen 的信誉判断](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/)
- [Microsoft Artifact Signing 资格与申请](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
- [DigiCert 代码签名私钥存储要求](https://knowledge.digicert.com/general-information/new-private-key-storage-requirement-for-standard-code-signing-certificates-november-2022)
- [Certum 产品与个人 / 机构类型](https://www.certum.eu/en/code-signing-certificates/)
