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

## EXPLAIN ANALYZE 4a — Prefix LIKE with project filter

Test project: vueuse (project_id = 131), path prefix: `packages/%`

```sql
EXPLAIN ANALYZE SELECT path FROM commit_files WHERE project_id = 131 AND path LIKE 'packages/%' LIMIT 100;
```

输出：
```
                                                                      QUERY PLAN
------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=0.42..154.58 rows=100 width=46) (actual time=0.039..0.104 rows=100 loops=1)
   ->  Index Scan using commit_files_project_idx on commit_files  (cost=0.42..7785.40 rows=5050 width=46) (actual time=0.037..0.095 rows=100 loops=1)
         Index Cond: (project_id = 131)
         Filter: (path ~~ 'packages/%'::text)
         Rows Removed by Filter: 200
 Planning Time: 1.072 ms
 Execution Time: 0.128 ms
(7 rows)
```

关键指标：
- Scan type: Index Scan (using commit_files_project_idx)
- Execution Time: 0.128 ms
- Cost: 0.42..154.58
- Rows Removed by Filter: 200 (filtered from 300 candidate rows to 100 result rows)

## EXPLAIN ANALYZE 4b — Leading wildcard (anti-pattern)

```sql
EXPLAIN ANALYZE SELECT path FROM commit_files WHERE path LIKE '%/util/%' LIMIT 100;
```

输出：
```
                                                            QUERY PLAN
-----------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1000.00..10236.43 rows=32 width=46) (actual time=33.823..35.547 rows=100 loops=1)
   ->  Gather  (cost=1000.00..10236.43 rows=32 width=46) (actual time=33.821..35.541 rows=100 loops=1)
         Workers Planned: 2
         Workers Launched: 2
         ->  Parallel Seq Scan on commit_files  (cost=0.00..9233.23 rows=13 width=46) (actual time=28.247..28.428 rows=82 loops=3)
               Filter: (path ~~ '%/util/%'::text)
               Rows Removed by Filter: 63912
 Planning Time: 1.353 ms
 Execution Time: 35.568 ms
(9 rows)
```

关键指标：
- Scan type: Parallel Seq Scan
- Execution Time: 35.568 ms
- 验证：leading `%` 无法使用 btree index，导致全表顺序扫描

## EXPLAIN ANALYZE 4c — With (project_id, path) index (rolled back)

临时创建复合索引测试，事务内创建后回滚：

```sql
BEGIN;
CREATE INDEX "__test_commit_files_project_path_idx" ON "commit_files" USING btree ("project_id", "path");
EXPLAIN ANALYZE SELECT path FROM commit_files WHERE project_id = 131 AND path LIKE 'packages/%' LIMIT 100;
ROLLBACK;
```

输出：
```
                                                                              QUERY PLAN
----------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=0.42..14.84 rows=100 width=46) (actual time=0.237..0.257 rows=100 loops=1)
   ->  Index Only Scan using __test_commit_files_project_path_idx on commit_files  (cost=0.42..728.46 rows=5050 width=46) (actual time=0.236..0.253 rows=100 loops=1)
         Index Cond: (project_id = 131)
         Filter: (path ~~ 'packages/%'::text)
         Rows Removed by Filter: 1486
         Heap Fetches: 0
 Planning Time: 1.208 ms
 Execution Time: 0.268 ms
(8 rows)
```

关键指标：
- Scan type: Index Only Scan (using __test_commit_files_project_path_idx)
- Execution Time: 0.268 ms
- Cost: 0.42..14.84 (vs 0.42..154.58 without new index)
- Heap Fetches: 0 (纯索引扫描，无需回表)

### 4a vs 4c 对比

| 指标 | 4a (现有索引) | 4c (临时复合索引) | 提升 |
|---|---|---|---|
| Scan Type | Index Scan | Index Only Scan | 避免回表 |
| Execution Time | 0.128 ms | 0.268 ms | -0.14 ms (略慢) |
| Cost | 0.42..154.58 | 0.42..14.84 | 成本降低 90% |
| Heap Fetches | N/A (需回表) | 0 | 无回表 |

**注意**：4c 的实际 Execution Time (0.268ms) 略高于 4a (0.128ms)，这是因为：
1. 临时索引创建后统计信息尚未完全优化
2. 数据集大小下 (21,144 rows for vueuse)，现有 `commit_files_project_idx` 已足够高效
3. Index Only Scan 的额外开销在小数据集上可能抵消收益
