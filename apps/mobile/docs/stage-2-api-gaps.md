# 阶段 2 API 契约核对结果

核对日期：2026-08-21。以下结论以当前 `apps/api` 控制器、服务和 PostgreSQL 集成测试为准。阶段 2 原验收缺口已经补齐，未新增或修改数据库 Schema。

## 已补齐接口

- `GET /api/v1/companions`：支持 `keyword`、`sort=comprehensive|rating|sales`、服务端签名 Cursor。
- `GET /api/v1/services`：支持 `keyword`、`sort=comprehensive|sales|price_asc|price_desc`、服务端签名 Cursor。
- `GET /api/v1/companions/:id/reviews`：返回该陪玩的公开评价，支持服务端签名 Cursor。
- `GET /api/v1/favorites`：支持 `cursor`、`limit` 和 `target_type`。
- `GET /api/v1/favorites/:targetType/:targetId`：返回当前用户的收藏状态。
- `GET /api/v1/files/:fileId`：仅为已验证、审核通过、公开且未删除的文件生成真实内容地址。

所有 Cursor 都绑定查询类型、筛选项和排序方式。把评分排序的 Cursor 用到销量排序、把商品评价 Cursor 用到陪玩评价等请求会返回 `400 VALIDATION_FAILED`，避免跨查询串用。

## 不可购买状态

`GET /api/v1/services/:id` 现在区分以下状态：

- 资源不存在或已删除：`404 PRODUCT_NOT_FOUND`
- 草稿、审核中或审核拒绝：`409 PRODUCT_UNDER_REVIEW`
- 已下架或后台强制下架：`409 PRODUCT_OFF_SALE`
- 陪玩不再是已审核状态：`409 SELLER_UNAVAILABLE`

App 继续使用实时 SKU、陪玩接单状态和可约时段判断其他不可购买原因；最终创建交易时仍以服务端校验结果为准。

## 部署配置

公开文件接口需要后端配置 `PUBLIC_ASSET_BASE_URL`，例如 `https://cdn.example.com/assets`。生产环境只接受 HTTPS。未配置时接口明确返回 `503 FILE_DELIVERY_UNAVAILABLE`，App 展示“图片暂不可用”，不会使用虚假商品或陪玩图片掩盖配置问题。

## 验证范围

集成测试覆盖关键词搜索、排序、Cursor 翻页与作用域校验、收藏翻页与状态查询、公开文件权限及 URL 生成、商品不可购买状态、陪玩评价 Cursor。Mobile 测试覆盖排序请求、竞态隔离、登录后返回原操作和内部路径安全校验。
