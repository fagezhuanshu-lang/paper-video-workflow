# 使用自己的 MotionGit 原生模板

如果目标是之前认可的 MotionGit 纸面透视样片，应使用自己获得授权的完整 `.motion` 包及其官方工具。本仓库的 `build` 使用原创公开引擎；v2.1 补齐了人物窗的逐帧缩放、移动与景别切换，但文字动画、缓动、纸面材质和动作音效仍是不同实现。

**缺少原生模板、工具、权限或依赖时，报告具体缺口并停在受影响步骤。不得自动改用公开引擎，也不得把公开引擎生成的视频标为 MotionGit 原生。** 用户明确接受公开风格后，才按 README 的 `validate` / `build` 流程制作。

原生模板也需要按照文案选择组件和镜头。之前试片使用的是纸面模板的 `motion-kit` 编排；取得同一个模板不等于取得博主演示的全部编排、参数和素材，不能承诺逐帧复制某个 Demo。

## 准备完整仓库和个人模板

先按 [README](../README.md) 运行 `Setup.ps1`，准备本仓库 CLI 与封面模块。Windows 下使用 `Run.ps1` 可复用安装器提供的便携 Node；不要求系统全局存在 `node`。

模板应从发布者的正规渠道取得。保留原包，按其 `00-START-HERE.md` 获取公开工具，并对照该版本的官方元数据核验工具 SHA256 和字节数。不要展开、复制或上传个人凭据、`personal/`、`content/`、受保护核心或运行时目录。公开仓库不提供模板授权，也不包含个人 `.motion` 包。

将 `examples/motiongit.example.json` 复制为 `.work/motiongit.local.json`，填入自己的文件位置和核验值。相对路径以这份配置文件所在目录为基准：

| 字段 | 含义 |
| --- | --- |
| `packagePath`、`packageSha256` | 自己的完整个人包及其已核验 SHA256 |
| `helperPath`、`helperSha256` | 与模板匹配的官方 `assistant/motion.mjs` 及官方元数据中的 SHA256 |
| `helperBytes` | 可选，官方公布的工具字节数 |
| `nodePath` | 可选，Node 22+ 可执行文件；默认使用当前 CLI 的 Node |
| `npmDirectory` | 可选，标准 Node/npm 安装目录，内部应有 `node_modules/npm/bin/npm-cli.js` |
| `pythonDirectory` | 可选，Python 可执行文件所在目录 |
| `tempDirectory`、`localAppData` | 可选，运行器临时文件及本机缓存位置；保留个人使用 |

本地哈希只能证明文件与所填值一致，不能独立证明发布者身份或账号权限。不要为消除报错而把任何未知文件的哈希填进去。

```powershell
.\Run.ps1 --version
.\Run.ps1 motiongit '.work/motiongit.local.json' check
.\Run.ps1 motiongit '.work/motiongit.local.json' start --summary
```

`check` 检查文件哈希、Node、标准 npm 布局、PATH 中可执行的 FFmpeg/ffprobe 和 Python。它不联网、不读取凭据、不自动安装，也不验证账号权益或运行缓存。公开引擎的 `doctor` 通过，不代表原生引擎依赖也齐全；公开引擎可使用 npm 自带的 FFmpeg，而原生预检需要命令可执行。`start` 才调用核验后的官方工具读取模板身份与公开入口，可能需要网络和账号权限。

## 按模板实际合同制作

阅读 `start` 返回的公开 guide、选中工作流的 contract/schema，再准备本期素材。本文的阶段封装面向已检查命令结构的纸面透视版本 `2.7.21-alpha.19`；其他模板或版本应先核对命令是否一致。封装不会自动生成符合原话的剪辑方案，不应把公开引擎的 `project.json` 当作原生参数。

复制 `examples/motiongit-job.example.json` 为 `.work/job.local.json`。示例中的路径仍是占位布局，须填入本期真实文件；所有相对路径以 job 文件所在目录为基准。

| 字段 | 用途 |
| --- | --- |
| `instance` | 官方工具创建的本期私有工作目录；初始化前不能已存在 |
| `inputs`、`params` | 按当前原生工作流 schema 准备的真实输入与参数文件 |
| `plan`、`project`、`master` | 官方 plan、prepare、render 的新输出路径 |
| `delivery` | 独立交付目录，不能已存在 |
| `language` | `zh` 或 `en`，默认 `zh` |
| `previewTimes` | 真实输出秒数，覆盖开头、切换前/中/后、最长字幕与结尾 |
| `coverProject` | 本仓库原创封面的内容 JSON，见下节 |
| `review` | 已实际完成的检查；示例默认全部为 `false` |

`inputs`、`params`、`plan`、`project` 和 `master` 必须位于 `instance` 目录内。先初始化，再在返回的工作目录中按官方合同准备素材、inputs 和 params。不要先创建 `instance` 来放文件，否则 `init` 会拒绝覆盖。

```powershell
.\Run.ps1 motiongit '.work/motiongit.local.json' stage '.work/job.local.json' init
.\Run.ps1 motiongit '.work/motiongit.local.json' stage '.work/job.local.json' setup
.\Run.ps1 motiongit '.work/motiongit.local.json' stage '.work/job.local.json' doctor
# 此时按官方 schema 准备并核对 inputs / params，再继续：
.\Run.ps1 motiongit '.work/motiongit.local.json' stage '.work/job.local.json' check-params
.\Run.ps1 motiongit '.work/motiongit.local.json' stage '.work/job.local.json' plan
.\Run.ps1 motiongit '.work/motiongit.local.json' stage '.work/job.local.json' prepare
.\Run.ps1 motiongit '.work/motiongit.local.json' stage '.work/job.local.json' preview
```

实际查看预览、修正人物取景和字幕后，才把 job 中 `review.previewChecked` 改为 `true`：

```powershell
.\Run.ps1 motiongit '.work/motiongit.local.json' stage '.work/job.local.json' render
```

这些命令调用官方工具；它们不会转进公开渲染器。`plan`、`prepare`、`render` 的目标存在时拒绝覆盖，修改后使用新的版本路径。官方工具自己的错误、权限及网络诊断应保留；失败时不修改模板或跳过验签。

检查官方成片的画幅、帧率、时长、全部口播、BGM、动作音效、人物运动和字幕。需要原片规格时先核对官方正式渲染规则；不要把带草稿标记的预览当成正式交付，也不要为了去除标记而修改受保护源码。

## 配好主题封面并交付

`coverProject` 使用本仓库 [项目格式](project-format.md) 中的 `cover` 合同，并带上支持标题证据的真实字幕或文案。可以从 `examples/project.example.json` 建立完整内容计划，但它只用于这里的封面和字幕导出；不会替换官方镜头计划。标题根据全文和本次选段确定，照片来自真实原片，`photoTime` 使用原片绝对秒数。核对选题、证据和照片之后，才把该内容 JSON 的 `review.coverSelectionChecked` 设为 `true`。不要直接复用示例文案。

实际观看和试听官方母版后，将 job 的 `review.masterChecked` 设为 `true`，再运行：

```powershell
.\Run.ps1 motiongit '.work/motiongit.local.json' finish '.work/job.local.json'
```

交付目录包含：

- `official-final.mp4`：官方母版的逐字节副本，哈希一致。
- `cover/`：原创版式的 9:16、3:4 PNG/JPG 封面、缩略图及封面报告。
- `captions.srt`：仅在 `coverProject.captions` 实际提供字幕时导出。
- `delivery.json`：记录原生引擎、母版哈希、完整解码与封面待审状态。

**原生 `finish` 保留母版的所有画面和音轨，不替换第0帧。** 在发布平台另选独立封面。需要内嵌首帧封面时，用已安装的 Node 执行随包脚本生成新的发布副本（以下路径替换为实际交付目录）：

```powershell
node scripts/cover-official-master.mjs '.work/delivery/official-final.mp4' '.work/delivery/cover/cover-9x16.png' '.work/delivery/publication-with-cover.mp4'
```

只有便携 Node 时，将 `node` 替换为 `Setup.ps1` 安装的 `.runtime` 内 Node 可执行文件路径。该脚本支持恒定帧率的 9:16 SDR 母版，保留官方母版，重新编码画面并复制所有音轨，检查帧数、音频内容哈希、时钟和完整解码。已用6秒合成视频验证；生成后仍需查看第0帧及其后画面、检查画质。不能将这个重新编码的副本称为与母版逐字节一致。

`finish` 要求口播母版包含音轨，并检查封面选择复核状态与文字证据；解码、字段及哈希检查不代替内容验收，也不自动批准生成的封面。必须实际查看两张封面及缩略图，并确认字幕与官方成片同步；没有字幕输入时不能声称已交付 SRT。

## 实测范围

原先认可样片来自本机已授权模板的官方流程。v2.1 新增的是可移植的绑定和阶段命令封装，**不等于这个封装已在全新电脑、所有模板版本或 WorkBuddy 中端到端实测**。最新真实记录见 [validation.json](validation.json)。网络、权限或依赖缺失时报告当前阶段和官方错误，保留已有方案与产物，待问题解决后从未完成阶段继续。
