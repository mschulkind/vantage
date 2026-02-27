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
      is_modified: bool
  ```
- `FileContent`: The content of a file.
  ```python
  class FileContent(BaseModel):
      path: str
      content: str  # Raw text or base64 if binary
      encoding: str # 'utf-8' or 'base64'
  ```

### 2.2 Configuration

Configuration is managed via `pydantic-settings` in `src/settings.py`.

- **Environment Variables / CLI Args:**
  - `TARGET_REPO`: Path to the repository to view (default: current directory).
  - `HOST`: Server host (default: `127.0.0.1`).
  - `PORT`: Server port (default: `8000`).

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
  - `GET /api/tree`: Calls `FileSystemService.list_directory`.
  - `GET /api/content`: Calls `FileSystemService.read_file`.
  - `GET /api/git/history`: Calls `GitService.get_history`.
  - `GET /api/git/status`: Calls `GitService.get_last_commit`.
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
  - `refreshTree()`: Re-fetch tree structure.
  - `loadFile(path)`: Fetch content + update URL.
- **`useGitStore`**
  - `history`: GitCommit[]
  - `latestCommit`: GitCommit | null
  - `isLoading`: boolean
  - `fetchHistory(path)`: Load history for current file.

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
