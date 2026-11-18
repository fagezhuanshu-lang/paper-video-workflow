# 口播剪辑、配乐与主题封面

[![Windows 流程验证](https://github.com/fagezhuanshu-lang/paper-video-workflow/actions/workflows/verify.yml/badge.svg)](https://github.com/fagezhuanshu-lang/paper-video-workflow/actions/workflows/verify.yml)

面向学员和桌面 AI 助手的公开制作流程。提供固定脚本、可检查的内容计划、语音转写入口、视频与混音、两种比例封面及交付检查。

**当前公开版：2.0.0。** 自带的纸面风格是本项目原创实现；如需 MotionGit 纸面透视原生动画，使用可选适配器并自行取得合法模板。它不会把个人授权包或来源许可不明的技能复制给其他人。

## 先跑通示例

Windows x64，解压或克隆仓库后，在仓库目录的 PowerShell 中运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\Run.ps1 demo
```

这里的 `-ExecutionPolicy Bypass` 仅允许本次 PowerShell 进程运行已下载的脚本，不修改系统策略。若当前终端本来就允许脚本，也可以直接运行 `.\Setup.ps1` 和 `.\Run.ps1 demo`；下文简写命令同理。

Setup 优先使用本机完整 Node 22+/npm；缺少时从 nodejs.org 下载并校验便携 Node 到 `.runtime/`。npm 按锁文件准备 Canvas 和 FFmpeg/ffprobe；已有可用 FFmpeg 时可复用。所有运行输出默认留在仓库 `.work/`，不修改系统 PATH，不上传视频。如果下载失败，安装器会报告具体阶段；网络恢复后重试，不把依赖缺失说成安装成功。

已有完整 Node/npm 环境也可以：

```sh
npm ci
node cli.mjs doctor
node cli.mjs demo
```

示例是 **6 秒合成测试画面和测试音**，验证技术流程，不是虚构的真人演示。结果目录包含 `delivery/final.mp4`、`cover/` 下的9:16与3:4封面、字幕、`delivery.json` 和 `verification.json`。声音是测试音，不代表真实口播混音审美。

## 用自己的视频

1. 准备竖屏原片及已有字幕；没有字幕时可选运行本地转写：

   ```powershell
   .\Run.ps1 transcribe '你的原片.mp4' --out '.work/transcript-01'
   ```

   转写需 Python 与可选模型，详见 [转写说明](docs/transcription.md)。ASR 输出保留待审状态，需核对错误、否定词、数字和切口。
2. 让助手读完整文案，根据 [项目格式](docs/project-format.md) 准备 `project.json`。模型负责语义、标题和选帧；固定脚本负责重复渲染与技术检查。参考 `examples/project.example.json`，替换真实素材和内容，不能把例句套到新视频。
3. 提供自己可用的音乐，填写来源和许可；明确不配乐时写 `music:null`。不捆绑来源不明的歌，不自动购买素材。
4. 检查计划后执行：

   ```powershell
   .\Run.ps1 validate '.work/我的工程/project.json'
   .\Run.ps1 build '.work/我的工程/project.json' --out '.work/我的工程/成片-v1'
   ```

5. 打开实际成片试听、检查字幕和两张封面，再作为最终作品交付。程序成功不会自动把美术/听感标为通过。

## 封面逻辑

先从全文确定“讲什么、核心变化、观众为什么关心”，再选有原文依据的两行标题。系列配色和排版稳定；主题、真实人物帧、过程/对比/观点图按内容变化。封面同时输出1080×1920和1080×1440，并放入视频第0帧；不增加片长、不推迟原声。独立图片仍要在发布平台中手动选作封面。

## MotionGit 原生模板

自带开放流程不需要 MotionGit 账号。需要原生模板时，把 `examples/motiongit.example.json` 复制到忽略的 `*.local.json`，填入自己合法取得的 `.motion`、对应官方工具及已核验哈希：

```powershell
.\Run.ps1 motiongit '.work/motiongit.local.json' check
.\Run.ps1 motiongit '.work/motiongit.local.json' start --summary
```

这是官方命令的调用入口，不会重写模板，也不会自动完成其所有素材绑定。后续命令按该模板真实 guide/contract 执行；第三方服务额度、登录和可用性按使用者自己的账号处理。上游资料：https://github.com/adunext/adudir-open 。

## WorkBuddy 等桌面助手

先克隆完整仓库并跑通 doctor/demo，再让助手读取根目录 `SKILL.md`。不要仅把一个网页链接当作已经安装了运行环境。可直接给它这段任务：

> 读取当前仓库的 SKILL.md，先运行 doctor。依据我的完整文案和真实字幕准备 project.json，保留原声原意，选择有证据的封面主题。先 validate，再 build；不要临时另写渲染器，也不要把未检查的 review 状态改成 true。

详见 [WorkBuddy 接入](docs/workbuddy.md) 与 [支持与实测范围](docs/support.md)。**支持技能格式不等于已通过每个宿主、每个模型的真实测试；不承诺任意模型、素材都完美完成。**

## 当前边界

- 原创开放引擎：720×1280或1080×1920、30fps、SDR；保留一个连续原片区间，不自动去口误、拼接多段或逐词猜时间。
- 支持标题、步骤、引用、对比，真实人物窗、完整句字幕、BGM和原创柔提示音。
- 断点报告会指出失败阶段；旧输出拒绝覆盖。修正内容后使用新版本目录。
- 计划和渲染有校验，仍需真实看听。已核实的测试记录在 `docs/validation.json`；持续集成在干净托管环境检查安装、示例和测试，记录是工作流验证，不冒充 WorkBuddy 运行记录。

## 许可证

原创代码与文档采用 [MIT](LICENSE)。字体、依赖、可选模板和用户素材的许可分开处理，见 [第三方声明](THIRD_PARTY_NOTICES.md)。仓库不包含个人原片、账号凭据、私有模板、历史项目或未确认授权的科技控制台源码。
