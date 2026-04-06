export interface RepoInfo {
  name: string;
  last_activity: string | null;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  has_markdown?: boolean;
  git_status?: string; // 'modified' | 'added' | 'deleted' | 'untracked' | 'contains_changes'
  last_commit?: GitCommit;
  children?: FileNode[];
  is_symlink?: boolean;
  symlink_target?: string | null; // relative path to target (null = broken/external)
}

export interface GitCommit {
  hexsha: string;
  author_name: string;
  author_email: string;
  date: string;
  message: string;
}

export interface FileStatus {
  last_commit: GitCommit | null;
  git_status: string | null; // 'modified' | 'added' | 'deleted' | 'untracked' | null
}

export interface FileContent {
  path: string;
  content: string;
  encoding: string;
}

export interface WebSocketMessage {
  type: "files_changed" | "hello";
  paths?: string[];
  repo?: string;
  version?: string;
}

export interface RecentFile {
  path: string;
  date: string;
  author_name: string;
  message: string;
  hexsha: string;
  untracked?: boolean;
}

export interface DiffLine {
  type: "add" | "delete" | "context" | "header";
  content: string;
  old_line_no: number | null;
  new_line_no: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  commit_hexsha: string;
  commit_message: string;
  commit_author: string;
  commit_date: string;
  file_path: string;
  hunks: DiffHunk[];
  raw_diff: string;
}

// --- jj (Jujutsu) types ---

export interface JJRevision {
  change_id: string;
  commit_id: string;
  description: string;
  author: string;
  timestamp: string;
  bookmarks: string[];
  is_working_copy: boolean;
}

export interface JJEvoEntry {
  commit_id: string;
  description: string;
  author: string;
  timestamp: string;
  operation: string;
  hidden: boolean;
}

export interface JJInfo {
  is_jj: boolean;
  working_copy_change_id: string | null;
}

// --- Review mode types ---

export interface ReviewSnapshot {
  id: string;
  content: string;
  timestamp: number;
}

export interface ReviewComment {
  id: string;
  selected_text: string;
  comment: string;
  created_at: number;
  resolved?: boolean;
}

export interface ReviewData {
  file_path: string;
  snapshots: ReviewSnapshot[];
  comments: ReviewComment[];
}
