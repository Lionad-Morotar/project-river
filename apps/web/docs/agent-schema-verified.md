# commit_files Schema Verification

**Date:** 2026-04-27
**Phase:** 01-pre-flight-schema-foundation
**Requirement:** INFRA-03

## Environment

- PostgreSQL Version: PostgreSQL 16.13 (Debian 16.13-1.pgdg13+1) on aarch64-unknown-linux-gnu
- Test Corpus: project-river database (multiple projects ingested)
- commit_files 总行数: 398,829
- 项目数: 10

## Schema Check

### \d commit_files 输出

```
                              Table "public.commit_files"
   Column   |  Type   | Collation | Nullable |                 Default
------------+---------+-----------+----------+------------------------------------------
 id         | integer |           | not null | nextval('commit_files_id_seq'::regclass)
 commit_id  | integer |           | not null |
 path       | text    |           | not null |
 insertions | integer |           | not null | 0
 deletions  | integer |           | not null | 0
 project_id | integer |           | not null |
Indexes:
    "commit_files_pkey" PRIMARY KEY, btree (id)
    "commit_files_commit_idx" btree (commit_id)
    "commit_files_commit_path_idx" UNIQUE, btree (commit_id, path)
    "commit_files_project_idx" btree (project_id)
Foreign-key constraints:
    "commit_files_commit_id_commits_id_fk" FOREIGN KEY (commit_id) REFERENCES commits(id) ON DELETE CASCADE
    "commit_files_project_id_projects_id_fk" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
```

### 索引清单验证

| 索引名 | 类型 | 列 | 与 core.ts 一致 |
|---|---|---|---|
| commit_files_commit_idx | btree | commit_id | ✅ |
| commit_files_project_idx | btree | project_id | ✅ |
| commit_files_commit_path_idx | btree unique | commit_id, path | ✅ |
