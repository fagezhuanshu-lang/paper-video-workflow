# 可选本地语音转写

没有现成字幕时，可使用本项目的 `transcribe` 入口把提供的视频转为初稿字幕和全文。已有准确字幕可以直接使用，不必重复转写。这个步骤不剪视频、不自动校正文案、不把识别结果标为已审核。

引擎锁定 `faster-whisper==1.2.1` 和 `av==18.1.0`，使用 CPU / int8，不要求 NVIDIA 显卡。两个版本均发布在官方 PyPI：[faster-whisper](https://pypi.org/project/faster-whisper/1.2.1/)、[PyAV](https://pypi.org/project/av/18.1.0/)。PyAV 19 删除了 faster-whisper 1.2.1 使用的音频打开参数，因此也锁定 PyAV，见 [上游兼容问题](https://github.com/SYSTRAN/faster-whisper/issues/1589)。模型使用方式见 [上游文档](https://github.com/SYSTRAN/faster-whisper)。Python 依赖和模型由用户在首次运行时下载，不提交到代码仓库。

识别在本地 CPU 执行，视频不会上传到转写服务；网络用于取得公开依赖和模型。

## 首次准备

本项目转写环境支持 [Python](https://www.python.org/downloads/) 3.11–3.13，推荐 3.12；安装时勾选 Add Python to PATH。也可以通过 `VIDEO_PYTHON` 指定已有 Python 的完整路径。这是本项目锁定依赖组合的范围，不是 faster-whisper 单独的最低版本声明。脚本不会安装系统 Python，也不会用全局 pip 安装包。

```powershell
$env:VIDEO_PYTHON = 'E:/你的Python目录/python.exe'
```

首次运行会自动创建仓库内 `.runtime/speech` 虚拟环境，仅在其中安装锁定的 faster-whisper 和 PyAV。模型缓存放在 `.runtime/models`，pip 缓存与临时文件也在 `.runtime`。这两个依赖版本固定；pip 解析出的其他依赖版本记录在 `.runtime/speech-installed.json`。首次运行需要访问 PyPI 和公开模型下载站，后续复用缓存。

调用接口：

```js
import {transcribeVideo} from './src/transcribe.mjs';
const result = await transcribeVideo('/absolute/path/input.mp4', {
  outDir: '/absolute/path/project/.work/transcript-v1',
  model: 'base',
  onProgress: event => console.log(event.stage, event.ratio ?? ''),
});
```

默认 `base` 在速度和准确度之间取折中。可选 `tiny`、`small`、`medium` 等标准模型；大模型的下载体积、内存及运行时间更大。更换模型不是自动校对，尤其需要核对中文专名、数字、否定词和中英文混读。

已有本地 CTranslate2 Whisper 模型时可设置 `VIDEO_WHISPER_MODEL_PATH` 为其绝对目录，至少包含 `model.bin` 和 `config.json`，通常还应有 `tokenizer.json` 等模型配套文件。它不是 OpenAI 原始 `.pt` 文件；本地目录模式不会自动补下载缺失文件。

也可以把完整的已下载 base 模型文件预置在 `.runtime/models/base/`；对应模型名目录会优先作为本地缓存使用。模型来源和许可由提供者保留，本仓库不随代码重新分发模型。

```powershell
$env:VIDEO_WHISPER_MODEL_PATH = 'E:/models/faster-whisper-base'
```

## 输出与审核

输出目录包含：

- `captions.json`：`start/end/text` 数组，附 ASR 来源和 `reviewed:false`。
- `captions.srt`：分段字幕初稿，分段边界仍需对照原声核对。
- `full-transcript.txt`：便于通读、判断主题的全文初稿。
- `transcription-report.json`：源文件哈希、模型、CPU 模式、识别语言、句数及待审核状态。

时间戳从**本次提供的视频开头**计算，属于源时间轴。若后续只剪 `[source.start, source.end]`，执行者需核对真实句界后再映射为输出时间轴；不能直接把原视频第 40 秒字幕放到试片第 40 秒，也不能为了适应分镜估算逐词时间。若输入本身是截取的小片段，本步骤不知道它在原长视频中的偏移，必须另外保留来源映射。

先通读全文，再对照原声核对错字、数字、专名、否定和句界；确认后才能据此编排图形、主题封面和字幕。识别可出错，低置信度、漏句或静音结果不表示可以删除原声，也不会自动修改 `review` 字段。

## 失败与恢复

缺 Python 时入口会给出上述安装及 `VIDEO_PYTHON` 指引。下载失败会保留缓存并报错，不循环重试；检查网络后由用户重新运行，或指定已下载的本地模型。pip 单次连接有限重试；安装和转写进程也有总超时。失败后不能宣称已转写完成。

已有结果目录不会被覆盖，改用新的输出目录以保留之前的字幕和人工校对。出现 setup/transcribe 锁时先确认对应进程已结束，再处理遗留锁；不要同时对同一目录启动多个任务。`.runtime`、`.work`、用户媒体、模型和转写内容均不应提交 GitHub。
