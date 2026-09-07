# 下班倒计时

手机比例的工资感知页：距离下班、今天/本月已赚、时薪换算、想买所需工作日、摸鱼计时。

设置保存在浏览器 **localStorage**（键 `work-ticker:v1`）。首次访问为空白默认，不会带入站长个人薪资。

## 本地预览

```bash
python3 -m http.server 5173
```

- 正式页：http://localhost:5173/
- 测试模式：http://localhost:5173/test.html
- 管理页：http://localhost:5173/admin.html（需已部署 `/api` 与环境变量）

静态资源（`styles.css` / `app.js`）始终同源部署，勿改回 jsDelivr。

## Vercel 环境变量

在项目 **Settings → Environment Variables** 中配置：

| 变量 | 说明 |
|------|------|
| `ADMIN_SECRET` | 管理页密钥（query `?secret=` / `Authorization: Bearer` / `x-admin-secret`） |
| `KV_REST_API_URL` | Vercel KV REST URL（或改用 Upstash） |
| `KV_REST_API_TOKEN` | Vercel KV REST token |
| `UPSTASH_REDIS_REST_URL` | 可选，与 KV 二选一 |
| `UPSTASH_REDIS_REST_TOKEN` | 可选，与 KV 二选一 |

免费方案：在 [Upstash](https://upstash.com/) 建 Redis 数据库，把 REST URL/Token 填进上表。

保存薪资设置时才会上报薪资字段；空薪资不会写入。

管理页：`/admin.html` → 输入 `ADMIN_SECRET`。

API：

- `POST /api/visit` — 访客遥测
- `GET /api/admin?secret=...` — 拉取日志
