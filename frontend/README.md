# Frontend

前端采用 `Next.js` App Router 骨架，当前已完成：

- 首页总览
- 信息披露模块页
- 政策文件模块页
- 预测模块页

## 启动方式

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

如果后端不是跑在 `http://127.0.0.1:8000`，可以在 `frontend/.env.local` 中设置：

```bash
API_BASE_URL=http://127.0.0.1:8000
```

后续建议把页面中的静态内容逐步替换成后端 API 数据。
