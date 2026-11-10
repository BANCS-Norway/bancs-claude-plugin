# [1.3.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.2.0...v1.3.0) (2026-11-10)


### Features

* **hooks:** serialize MEMORY.md writes with a mkdir lock ([e8f3d3f](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/e8f3d3fa06ebb418fa220c6d9775339aac471b7a)), closes [#19](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/19)

# [1.2.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.1.0...v1.2.0) (2026-11-10)


### Features

* **hooks:** add Stop hook that records skipped process steps ([5da5955](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/5da5955d918a9e24c89369432fbd62b8ddf5ae9e)), closes [#31](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/31)

# [1.1.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.0.3...v1.1.0) (2026-11-09)


### Features

* **validate:** enforce skill frontmatter contract (kind, fills-gap, retire-when, checked) ([eb05cab](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/eb05cab5eeb085da131f540405f48d9361e70740)), closes [#43](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/43) [#30](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/30)

## [1.0.3](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.0.2...v1.0.3) (2026-06-05)


### Bug Fixes

* **issues:** make project_issues cache a render, not a hand-edited store ([dcc213c](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/dcc213cac5cfdab97818f9806539efc54dbdc561)), closes [#14](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/14)
* **skills:** move per-issue work logs into memory/issues/<N>/ folders ([fecba92](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/fecba9219e966c52023997a0d601ba1ab5aeb797)), closes [#14](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/14)

## [1.0.2](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.0.1...v1.0.2) (2026-06-05)


### Bug Fixes

* **plugin:** remove redundant hooks declaration from manifest ([1c605d1](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/1c605d1bb2320b45d616fba8641f705c28f592a3)), closes [#15](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/15)

## [1.0.1](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.0.0...v1.0.1) (2026-06-02)


### Bug Fixes

* **worktree-create:** bootstrap node deps in new worktrees ([1a453a0](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/1a453a00be005a0c68af2fceedcfbe9fe1d8f109)), closes [#6](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/6)

# 1.0.0 (2026-06-01)


### Features

* initial bcp plugin — worktree workflow, mission system, swappable workforces ([4820846](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/4820846952c30ac992327d02fdde9f6d8bbd9112))
