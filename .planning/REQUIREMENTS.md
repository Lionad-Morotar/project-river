# Requirements

## Milestone v1.1 可视化增强

### API
- [x] **API-03**: 新增 `GET /api/projects/:id/daily-aggregated` 接口，返回服务端聚合后的每日贡献者数据（Top 49 + Others）
- [x] **API-04**: 聚合接口保留与原 `daily` 接口相同的字段结构和零填充行为

### Visualization
- [x] **VIZ-01**: 贡献者颜色算法基于两个维度映射： contributor 的首次/末次提交时间（色相）和总贡献量（饱和度）
- [x] **VIZ-02**: 色相范围以主色蓝色（~215°）为中心，向两侧 ±60° 展开（155°–275°），新旧 contributor 沿色盘渐变
- [x] **VIZ-03**: 饱和度从高（高贡献）向中性灰（低贡献）渐变，保证低饱和度下的可读性
- [x] **VIZ-04**: 前端 `Streamgraph` 组件消费新聚合接口，保持现有的交互和渲染行为

### Out of Scope
- 不修改原有 `GET /api/projects/:id/daily` 接口的行为和响应格式
- 不涉及数据库 schema 变更
- 不添加新的 UI 控件或面板
