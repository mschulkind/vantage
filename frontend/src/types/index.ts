export interface RepoInfo {
  name: string;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  has_markdown?: boolean;
  git_status?: string; // 'modified' | 'added' | 'deleted' | 'untracked' | 'contains_changes'
  last_commit?: GitCommit;
  children?: FileNode[];
}

export interface GitCommit {
  hexsha: string;
  author_name: string;
  author_email: string;
  date: string;
  message: string;
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
