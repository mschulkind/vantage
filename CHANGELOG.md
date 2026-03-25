# Changelog

All notable changes to Vantage will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-25

### Added

- **Global file search** — Press `T` (Shift+T) from anywhere to search files across all projects. Press `t` on the project picker page to do the same.
- **Project picker shortcut** — Press `P` from anywhere to fuzzy-search project names and quickly switch between repos.
- **Recent file search** — Press `r` to search recently modified files in the current project, or `R` to search recents across all projects.
- **Copy file path** — Press `y` or click the "Path" button to copy the current file's absolute filesystem path to the clipboard.
- **Changelog & What's New** — A built-in changelog with a "What's New" popup that appears when new features are available. Opt out anytime via settings.
- **Source directories** — Configure `source_dirs` in your config to auto-discover git repos from specified directories.
- **Repo sorting** — Toggle between alphabetical and recent-activity sorting on the project picker page.

### Changed

- **Project picker redesign** — Full-page layout without sidebar, cleaner table with repo names and relative timestamps.
- **Repo age display** — Project picker now shows the age of the newest file in each repo rather than the last git commit.

## [0.1.0] - 2026-03-20

### Added

- Markdown rendering with GitHub-flavored markdown, syntax highlighting, and KaTeX math support.
- Mermaid diagram rendering with click-to-zoom.
- Live reload via WebSocket — files update automatically when saved.
- Git integration — view commit history, diffs, and file status.
- Jujutsu (jj) support — view revisions, evolution log, and diffs.
- Fuzzy file picker with `t` keyboard shortcut.
- Dark mode with `Shift+D` toggle.
- Vim-style keyboard navigation (`j`/`k` scroll, `g g`/`G` jump, `g h` home).
- Multi-repo daemon mode with TOML configuration.
- Static site export for hosting on Cloudflare Pages, GitHub Pages, etc.
- Print-optimized stylesheet.
