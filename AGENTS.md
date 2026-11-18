# Working in this repository

For video production, read `SKILL.md` and `docs/project-format.md`, then use the existing CLI from this directory. Windows users can run `Setup.ps1` followed by `Run.ps1`; do not assume `node` is installed globally when Setup used its local portable runtime.

Keep media, generated projects and output inside `.work/` by default. Paths in a project are relative to its JSON file. Never commit user video, recordings, personal `.motion` packages or credentials.

Use `validate` before `build`. Review flags describe completed review, not a way to bypass errors. Technical success is separate from checking the actual picture, speech and cover meaning. The optional `transcribe` command produces unreviewed ASR, not verified captions.

When modifying the runner, run `npm test` and a synthetic `demo`. Tests on the local runner do not establish that WorkBuddy or another desktop host has executed the workflow. State the actual test environment and remaining limitations.
