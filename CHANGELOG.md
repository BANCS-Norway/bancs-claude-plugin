# [1.12.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.11.0...v1.12.0) (2026-11-11)


### Features

* **hooks:** point a new session at the issues skill on start ([b48b510](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/b48b5101dfe8c37c3425d78fccfc6ecbb093b745)), closes [#47](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/47)

# [1.11.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.10.3...v1.11.0) (2026-11-11)


### Features

* **hooks:** block commits on the default branch and check staged files ([5036530](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/50365305077621446180e1b3dea7a66676dc5dd5)), closes [#45](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/45)

## [1.10.3](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.10.2...v1.10.3) (2026-11-11)


### Bug Fixes

* **worktree-create:** link .husky/_ so the git hooks run in worktrees ([025a971](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/025a9712941057d80dc518a037d7141acdb9082b)), closes [#76](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/76)

## [1.10.2](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.10.1...v1.10.2) (2026-11-11)


### Bug Fixes

* **skills:** one script finds the work-log folder from the main checkout ([5422bab](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/5422baba3b93a21cf7cd0ad5cf4648201615c601)), closes [#69](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/69)

## [1.10.1](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.10.0...v1.10.1) (2026-11-11)


### Bug Fixes

* **worktree-finish:** say the PR is merged, not that it was squash-merged ([f58bba4](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/f58bba4b3f9b60c483a524c39f68cd8168e2299e)), closes [#72](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/72)

# [1.10.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.9.1...v1.10.0) (2026-11-11)


### Features

* **worktree-create:** copy and link what .worktreeinclude names ([c501225](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/c501225723da804d09a9db4ec0fd17b4419f3581)), closes [#37](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/37)

## [1.9.1](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.9.0...v1.9.1) (2026-11-11)


### Bug Fixes

* **commit-guide:** read commit types and scopes from the repo ([c218e27](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/c218e27672deee6fd5fbfce3bead4d2c50902668)), closes [#41](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/41)

# [1.9.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.8.0...v1.9.0) (2026-11-11)


### Features

* **skills:** read base branch, PR title format, label and direnv from the repo ([369065e](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/369065e5f05a6e2f03375fc83e0cd1681e1c52d8)), closes [#42](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/42)

# [1.8.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.7.1...v1.8.0) (2026-11-11)


### Features

* **context:** detect project facts once and add /bcp:context ([3019864](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/30198649cb2952e45eb4d789b8cde49f121eec16)), closes [#24](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/24) [#22](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/22)

## [1.7.1](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.7.0...v1.7.1) (2026-11-10)


### Bug Fixes

* **skills:** use cd instead of git -C in worktree-resume ([43867ef](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/43867efdde3031d2fa693e744cf5c22f4a8627c8)), closes [#23](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/23)

# [1.7.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.6.0...v1.7.0) (2026-11-10)


### Features

* **hooks:** list stale shims after a Claude Code update and add /bcp:shim-review ([900c680](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/900c6808aa2a41a23d5f7f8091385748cc0caa2f)), closes [#36](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/36)

# [1.6.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.5.0...v1.6.0) (2026-11-10)


### Features

* **hooks:** notice a new Claude Code version at session start ([86b8c1f](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/86b8c1f829285ca4b516311d08bcd8539c021138)), closes [#36](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/36) [#35](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/35)

# [1.5.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.4.0...v1.5.0) (2026-11-10)


### Features

* **commands:** add /nudge to record manual corrections per step and repo ([198336b](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/198336be9dbcfb59e9817d170d512c77ede11b17)), closes [#33](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/33)

# [1.4.0](https://github.com/BANCS-Norway/bancs-claude-plugin/compare/v1.3.0...v1.4.0) (2026-11-10)


### Features

* **hooks:** post skipped steps as a comment on the issue ([b071a35](https://github.com/BANCS-Norway/bancs-claude-plugin/commit/b071a35260833a2ca920bbd63f7f1fc62e77ac4c)), closes [#32](https://github.com/BANCS-Norway/bancs-claude-plugin/issues/32)

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
