import { NavigationTarget } from "../navigation";
import { Modal } from "./Common";

export function PrivacyInfo({ onClose, onSettings }: {
  onClose: () => void;
  onSettings: (section: NonNullable<NavigationTarget["settingsSection"]>) => void;
}) {
  return <Modal title="隐私与数据安全" onClose={onClose} wide trackChanges={false} className="privacy-modal">
    <article className="privacy-content" tabIndex={0} aria-label="隐私说明正文">
      <p className="privacy-lead">你的科研记录，由你掌控。</p>
      <p>ResearchFlow 在本机管理项目、阶段、行动、时间计划与研究记录，无需注册账号。应用不会自动将科研项目内容上传至开发者服务器。</p>
      <section>
        <h3>记录保存在哪里</h3>
        <p>桌面版将科研记录保存为当前 Windows 账户应用数据目录中的 JSON 文件。直接运行 EXE 也使用该目录，数据不会跟随程序自动移动。</p>
        <p>项目关联的文件路径只用于记录线索；备份不会自动包含这些路径指向的数据集、脚本或文档。</p>
        <button className="text-button" onClick={() => onSettings("data-location")}>查看本地数据位置</button>
      </section>
      <section>
        <h3>离线使用与安装</h3>
        <p>项目规划、行动管理、专注计时和本机备份恢复可以离线使用。首次安装时，如果电脑缺少 Microsoft Edge WebView2 运行库，安装程序可能联网下载。</p>
        <p>用户主动访问网络盘或使用外部 AI 服务时，也可能需要网络。</p>
      </section>
      <section>
        <h3>数据传输与外部 AI</h3>
        <p>当前应用没有云同步、自动更新检查、应用遥测或错误上传功能。AI 计划导入只在本机准备提示词、复制到剪贴板并读取你选择的计划 JSON，不直接连接 AI 服务。</p>
        <p>当你把内容发送给第三方 AI 或其他平台时，内容将由该平台处理。发送前请检查未公开研究信息、患者身份信息和其他不适合外发的资料。剪贴板及云盘也受相应系统或第三方设置影响。</p>
      </section>
      <section>
        <h3>备份与恢复</h3>
        <p>在设置中导出 JSON，选择你信任的保存位置。恢复时可选择合并或覆盖，请先确认预览范围。</p>
        <p>应用保留上一版本，以及最近一次导入、恢复或示例移除前的本地安全副本；这些副本不能替代长期、独立的手动备份。</p>
        <p>记录和备份是普通 JSON，未采用 ResearchFlow 应用层加密。获得相应文件权限的其他程序可能读取它们。保存到云同步目录、共享目录或代码仓库时，请确认访问和分享范围。</p>
        <button className="text-button" onClick={() => onSettings("backup-settings")}>管理备份与恢复</button>
      </section>
      <details className="privacy-advanced">
        <summary>使用 AI Agent 与 Git 时</summary>
        <section>
          <h3>文件访问取决于授权范围</h3>
          <p>Codex、Cursor、Claude Code 等工具获得文件访问权限后，可能读取授权范围内的科研资料。是否向外传输取决于工具能力、权限配置、你的指令和实际操作。</p>
          <p>只授权当前工作所需目录，避免无必要地开放整个用户目录或磁盘。执行敏感文件读取、网络发送或 Git 推送前，检查目标与内容，并保留必要的人工确认。</p>
          <p>本地保存不等于第三方程序没有读取权限。ResearchFlow 不监控或拦截第三方 Agent，也不代替操作系统管理文件权限。</p>
        </section>
        <section>
          <h3>Git 添加、提交与上传有区别</h3>
          <p><code>git add</code> 将文件加入暂存区；<code>git commit</code> 将暂存内容写入本地历史；<code>git push</code> 才将相应提交发送到远端。自动化工具具有这些权限时，请核对文件、远端地址和仓库可见范围。</p>
          <dl className="privacy-commands">
            <div><dt><code>git status</code></dt><dd>查看当前变更与暂存状态</dd></div>
            <div><dt><code>git diff --cached --name-only</code></dt><dd>查看本次已暂存的文件名</dd></div>
            <div><dt><code>git ls-files</code></dt><dd>查看已被 Git 跟踪的文件</dd></div>
            <div><dt><code>git remote -v</code></dt><dd>核对远端仓库地址</dd></div>
          </dl>
          <p>以上是可自行执行的只读检查，ResearchFlow 不会自动运行。重点留意科研项目 JSON、导出的备份、论文草稿、实验结果和含私人信息的配置。</p>
        </section>
        <section>
          <h3>.gitignore 能做什么</h3>
          <p>.gitignore 主要影响尚未跟踪文件是否被普通 Git 添加流程纳入版本控制。它不是文件访问权限设置，不能阻止 Agent 读取、其他软件复制或直接发送文件；强制添加也可能绕过规则。</p>
          <p>后补忽略规则不会自动停止已跟踪文件的跟踪，不会删除已提交的历史，也不会撤回远端副本。JSON 也可能是合法工程配置，不应一概忽略所有 JSON。</p>
        </section>
        <section>
          <h3>如果内容已经被上传</h3>
          <p>先停止继续上传或分享，核对相关提交、远端仓库和访问范围，再按具体情况处理。清除工作区文件或添加忽略规则，并不代表历史与远端副本已清除；已有复制也可能仍然存在。</p>
          <p>ResearchFlow 不提供自动移除 Git 跟踪、历史重写或强制推送功能。</p>
        </section>
      </details>
    </article>
    <footer><button onClick={onClose}>关闭</button></footer>
  </Modal>;
}
