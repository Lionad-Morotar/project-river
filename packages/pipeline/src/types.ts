export interface FileChange {
  path: string
  insertions: number
  deletions: number
}

export interface ParsedCommit {
  hash: string
  authorName: string
  authorEmail: string
  committerDate: Date
  message: string
  files: FileChange[]
}
