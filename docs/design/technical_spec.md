# Technical Specification: Vantage

> 🔭 **Vantage:** A modern web application for viewing LLM-generated Markdown files with GitHub-like rendering, Mermaid diagram support, and Git history integration.

## 1. Architectural Overview & Principles

### Goals

- **Zero-Config Viewing:** Point to a local directory, and it works.
- **High Fidelity:** Render Markdown exactly like GitHub (GFM).
- **Live Feedback:** As the LLM (or user) writes files, the view updates instantly.
- **Git Aware:** Contextualize changes with commit history and diffs.

### Design Principles

- **Backend as a Proxy:** The Python backend is a thin layer over the file system and `git` command. It does not maintain complex state databases.
- **Event-Driven UI:** The frontend reacts to WebSocket events for file changes, ensuring freshness.
- **Polished UX:** Mimic GitHub's clean, functional aesthetic.

---

## 2. Backend Design (Python / FastAPI)

The backend is organized into three layers: **Routers** (HTTP/WS), **Services** (Business Logic), and **Domain** (Data Models).

### 2.1 Domain Models (`src/schemas/`)

We use Pydantic models for type-safe communication.

- `FileNode`: Represents a file or directory in the tree.
  ```python
  class FileNode(BaseModel):
      name: str
      path: str
      is_dir: bool
      children: List["FileNode"] | None = None
  ```
- `GitCommit`: Represents a single commit.
  ```python
  class GitCommit(BaseModel):
      hexsha: str
      author_name: str
      author_email: str
      date: datetime
      message: str
  ```
- `FileStatus`: Status of a specific file.
  ```python
  class FileStatus(BaseModel):
      last_commit: GitCommit | None
      git_status: str | None  # 'modified', 'added', 'deleted', 'untracked', or None
  ```
- `FileContent`: The content of a file.
  ```python
  class FileContent(BaseModel):
      path: str
      content: str  # Raw text or base64 if binary
      encoding: str # 'utf-8' or 'base64'
  ```
- `JJRevision`: A Jujutsu revision (change).
  ```python
  class JJRevision(BaseModel):
      change_id: str          # Short change ID (e.g., "wosnyxlu")
      commit_id: str          # Commit hash (12 chars)
      description: str
      author: str
      timestamp: datetime
      bookmarks: list[str]
      is_working_copy: bool
  ```
- `JJEvoEntry`: An entry in a jj evolution log.
  ```python
  class JJEvoEntry(BaseModel):
      commit_id: str
      description: str
      author: str
      timestamp: datetime
      operation: str          # What jj operation caused this entry
      hidden: bool
  ```
- `JJInfo`: jj repository detection info.
  ```python
  class JJInfo(BaseModel):
      is_jj: bool
      working_copy_change_id: str | None
  ```

### 2.2 Configuration

Configuration is managed via `pydantic-settings` in `src/settings.py` and `src/config.py`.

- **Environment Variables / CLI Args (single-repo mode):**
  - `TARGET_REPO`: Path to the repository to view (default: current directory).
  - `HOST`: Server host (default: `127.0.0.1`).
  - `PORT`: Server port (default: `8000`).

- **Config File (daemon mode, `~/.config/vantage/config.toml`):**
  - `host`, `port`: Server bind settings.
  - `repos[]`: Explicit repo list with `name`, `path`, and optional `allowed_read_roots`.
  - `source_dirs`: Parent directories to scan for git repos (auto-discovery).
  - `exclude_dirs`: Directories hidden from all listings (overrides defaults).
  - `show_hidden`: Whether to show dotfiles in the sidebar.
  - `walk_max_depth`: Max directory depth for untracked file discovery (default: unlimited).
  - `walk_timeout`: Timeout in seconds for git ls-files subprocess (default: 30.0).

- **Source Directory Auto-Discovery (`config.py`):**
  - `_discover_repos_from_source_dirs()`: Scans each `source_dirs` entry for subdirectories containing `.git`. Skips repos whose resolved path matches an existing `[[repos]]` entry. Assigns unique names with numeric suffix if collisions occur.

### 2.3 Services (`src/services/`)

- **`FileSystemService` (`fs_service.py`)**

  - **Responsibility:** Safe file access.
  - **Methods:**
    - `list_directory(path: str) -> List[FileNode]`: Recursive or flat listing (start flat for performance).
    - `read_file(path: str) -> FileContent`: Reads text, handles binary gracefully.
    - `validate_path(path: str)`: Security check (prevent `../` traversal outside repo).

- **`GitService` (`git_service.py`)**

  - **Responsibility:** Interfacing with `gitpython`.
  - **Methods:**
    - `get_history(path: str, limit: int = 10) -> List[GitCommit]`: Log for a file.
    - `get_last_commit(path: str) -> GitCommit`: Optimize for just the latest info.
    - `get_repository_root() -> str`: Find `.git` folder.
    - `get_working_dir_diff(path: str) -> FileDiff | None`: Get uncommitted diff for a file. Uses `git diff HEAD` for tracked files, generates synthetic all-add diffs for untracked files.
    - `get_git_status() -> dict`: Run `git status --porcelain` and parse results.

- **`JJService` (`jj_service.py`)**

  - **Responsibility:** Wrapping the `jj` CLI for Jujutsu VCS support.
  - **Design:** Subprocess-based (calls `jj` CLI with `--no-pager`). Uses custom templates with Unicode separator (`␞`) for machine-parseable output. Gracefully returns empty/None when repo is not a jj repo.
  - **Methods:**
    - `get_info() -> JJInfo`: Detect if repo uses jj, get working copy change ID.
    - `get_log(path?, limit) -> list[JJRevision]`: Revision log with custom template.
    - `get_evolog(rev, limit) -> list[JJEvoEntry]`: Evolution log showing how a change evolved over time (squashes, rebases, description changes).
    - `get_diff(rev, path?) -> FileDiff | None`: Git-format diff for a revision.
    - `get_interdiff(from_rev, to_rev, path?) -> FileDiff | None`: Diff between two revisions.

- **`WatcherService` (`watcher.py`)**

  - **Responsibility:** Monitor file system events using `watchfiles`.
  - **Design:** Async generator or callback-based background task that pushes events to the `ConnectionManager`.

- **`ConnectionManager` (`socket_manager.py`)**
  - **Responsibility:** Manage active WebSocket connections and broadcast messages.
  - **Methods:**
    - `connect(websocket)`
    - `disconnect(websocket)`
    - `broadcast(message: dict)`

### 2.4 API Routes (`src/routers/`)

- **`api.py`**:
  - `GET /api/health`: Health check endpoint.
  - `GET /api/version`: Server version info.
  - `GET /api/repos`: List configured repositories (daemon mode).
  - `GET /api/tree`: Calls `FileSystemService.list_directory`.
  - `GET /api/content`: Calls `FileSystemService.read_file`.
  - `GET /api/files`: List all Markdown files.
  - `GET /api/info`: Repository metadata.
  - `GET /api/git/history`: Calls `GitService.get_history`.
  - `GET /api/git/status`: Returns `FileStatus` (last commit + git working tree status).
  - `GET /api/git/diff`: Returns diff for a specific commit.
  - `GET /api/git/diff/working?path=`: Returns uncommitted diff for a file.
  - `GET /api/git/recent?limit=`: Recently changed files by git commit date.
  - `GET /api/jj/info`: Returns `JJInfo` (jj detection + working copy ID).
  - `GET /api/jj/log?path=&limit=`: Returns `list[JJRevision]`.
  - `GET /api/jj/evolog?rev=&limit=`: Returns `list[JJEvoEntry]`.
  - `GET /api/jj/diff?rev=&path=`: Returns `FileDiff` for a jj revision.
  - `GET /api/jj/interdiff?from_rev=&to_rev=&path=`: Diff between two jj revisions.
  - `GET /api/perf/diagnostics`: Anonymized performance timing data.
  - `POST /api/perf/reset`: Reset performance counters.
  - All file/git/jj endpoints also exist under `/api/r/{repo}/...` for multi-repo mode.
- **`socket.py`**:
  - `WS /api/ws`: Handshake -> Add to `ConnectionManager` -> Await disconnect.

---

## 3. Frontend Design (React / Vite)

### 3.1 State Management (Zustand)

We will use `zustand` for cleaner state management than React Context.

- **`useRepoStore`**
  - `currentPath`: string | null
  - `fileTree`: FileNode[]
  - `fileContent`: string | null
  - `isLoading`: boolean
  - `repoSortMode`: "alpha" | "recent" (persisted to localStorage)
  - `refreshTree()`: Re-fetch tree structure.
  - `loadFile(path)`: Fetch content + update URL.
  - `sortedRepos()`: Returns repos sorted by current mode (name or last_activity).
  - `setRepoSortMode(mode)`: Switch sort mode.
- **`useGitStore`**
  - `history`: GitCommit[]
  - `latestCommit`: GitCommit | null
  - `fileGitStatus`: string | null (e.g., 'modified', 'added', 'untracked')
  - `isLoading`: boolean
  - `fetchHistory(path)`: Load history for current file.
  - `fetchWorkingDiff(path)`: Fetch uncommitted diff for a file.
- **`useJJStore`**
  - `info`: JJInfo | null
  - `revisions`: JJRevision[]
  - `evolog`: JJEvoEntry[]
  - `diff`: FileDiff | null
  - `fetchInfo()`: Detect jj repo and get working copy info.
  - `fetchLog(path?, limit?)`: Load jj revision log.
  - `fetchEvolog(rev?, limit?)`: Load evolution log for a revision.
  - `fetchDiff(rev, path?)`: Load diff for a jj revision.

### 3.2 Component Architecture (`frontend/src/components/`)

- **`Layout`**: Main application shell.
  - **`Sidebar`**: Left panel.
    - **`FileTree`**: Recursive component rendering `FileNode`s. Uses `lucide-react` icons (Folder, File, FileCode).
  - **`MainContent`**: Center panel.
    - **`Breadcrumbs`**: Navigation aid (`root > docs > design`).
    - **`Header`**: Shows `latestCommit` info (avatar, message, time).
    - **`MarkdownViewer`**: The core view.
      - Wrapper around `react-markdown`.
      - **Plugins:** `remark-gfm` (tables, strikethrough), `rehype-raw` (html), `rehype-highlight` (code blocks).
      - **Custom Components:**
        - `code`: Detects `mermaid` language class. If found, renders `MermaidDiagram`. Otherwise, renders syntax-highlighted code.
  - **`RightPanel` (Optional/Collapsible)**:
    - **`GitHistory`**: Vertical timeline of commits for this file.

### 3.3 Data Flow & Live Updates

1.  **Mount:** App connects `WS /api/ws`.
2.  **Navigation:** User clicks file in Sidebar -> `useRepoStore.loadFile(path)` -> `GET /api/content`.
3.  **Update:**
    - `WatcherService` detects change in `docs/design.md`.
    - Backend sends WS event: `{"type": "file_changed", "path": "docs/design.md"}`.
    - Frontend receives event.
    - If `currentPath` matches `path`, trigger `loadFile(path)` (content refresh).
    - Always trigger `refreshTree()` (in case file was added/removed).

---

## 4. Dependencies

### Backend

- **Core:**
  - `fastapi`, `uvicorn[standard]`: Server.
  - `pydantic`, `pydantic-settings`: Validation & Config.
- **Functionality:**
  - `gitpython`: Git operations.
  - `watchfiles`: efficient file watching (Rust-based).
- **Testing:**
  - `pytest`, `pytest-asyncio`: Test runner.
  - `httpx`: For `TestClient`.

### Frontend

- **Core:** `react`, `react-dom`, `react-router-dom`.
- **Build:** `vite`.
- **Styling:** `tailwindcss`, `postcss`, `autoprefixer`, `clsx`, `tailwind-merge` (for dynamic classes).
- **State:** `zustand`.
- **Rendering:**
  - `react-markdown`: Main renderer.
  - `remark-gfm`, `rehype-raw`, `rehype-highlight`: Extensions.
  - `mermaid`: Diagram generation.
- **Utils:**
  - `date-fns`: Time formatting ("2 hours ago").
  - `lucide-react`: Icons.
- **Testing:** `vitest`, `@testing-library/react`.

---

## 5. Development Plan

1.  **Scaffold:** `uv init`, `npm create vite`, configure `Justfile`.
2.  **Backend Core:** Implement `FileSystemService` and basic `api` routes.
3.  **Frontend Core:** Setup `Layout`, `FileTree`, and routing.
4.  **Markdown:** Implement `MarkdownViewer` with GFM support.
5.  **Git Integration:** Implement `GitService` and connect to Frontend `Header`.
6.  **Mermaid:** Add `mermaid` support to the viewer.
7.  **Real-time:** Implement `WatcherService` and WebSocket connection.
8.  **Polish:** Styling, error handling (404s), loading states.
