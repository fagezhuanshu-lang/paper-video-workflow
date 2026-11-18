# Sources and licenses

The repository's MIT license covers its original workflow, adapter, renderer, cover layout, CLI and documentation. The open renderer is newly implemented; it is not a copy of the MotionGit Paper Perspective runtime or the separately acquired technology-console skill.

- **Noto Sans SC**: the unmodified font under `assets/fonts/` is separately licensed under SIL OFL 1.1. The complete supplied license and attribution are retained in `assets/fonts/OFL.txt`; provenance is recorded beside it. No Windows font is distributed.
- **@napi-rs/canvas**: installed by npm under its package license. See the installed package's license and https://github.com/Brooooooklyn/canvas.
- **ffmpeg-static / ffprobe-static**: npm packages provide separately licensed FFmpeg/ffprobe builds. Their package licenses and the builds' LGPL/GPL terms remain separate. Executable binaries are downloaded into ignored dependencies, not re-licensed under this project's MIT license. Inspect the selected build with `ffmpeg -L`; source/build links are supplied by https://github.com/eugeneware/ffmpeg-static and https://github.com/joshwnj/ffprobe-static.
- **faster-whisper (optional)**: installed into a local Python environment under its MIT license. Model weights retain their upstream licenses; they are downloaded separately, not committed here. See https://github.com/SYSTRAN/faster-whisper.
- **MotionGit (optional)**: this repository only provides an original caller for a user-supplied authorized package and verified official helper. Personal packages, keys, encrypted runtimes and the official helper are not distributed here. Read the provider's current license and setup instructions.
- **Source video, music and pictures**: users supply these and retain responsibility for their own permission to use them. The demo generates a synthetic test image stream and simple sine-wave tones; it does not include another person's recording, commercial music or a voice sample.

The MIT license of https://github.com/adunext/adudir-open applies to the material actually published there. It is not evidence that every separately distributed MotionGit template has the same license. This repository does not bundle the previously acquired technology-console code whose public redistribution permission was unconfirmed.
