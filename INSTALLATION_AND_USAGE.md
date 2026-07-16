# 安装与使用指南

本文档说明如何在本地安装、启动和检查 Power Insight Grid 开源整理版。

## 1. 项目说明

Power Insight Grid 是一个面向电力市场数据展示、信息披露分析、市场出清查看、网架拓扑阻塞识别、政策文件管理和数据导入管理的本地辅助决策系统。

本开源整理版不包含：

- 真实市场数据、数据库、日志、浏览器会话和本地账号配置。
- 私有短期价差预测算法。
- 私有中长期价格预测、合约曲线优化和调整算法。
- 任何真实 API Key、Cookie 或 UKey 会话信息。

## 2. 环境要求

建议环境：

- Windows 10/11
- Python 3.10 或更高版本
- Node.js 20 或更高版本
- npm

项目包含三个主要运行部分：

- 后端 API：`backend`
- 前端页面：`frontend`
- 数据获取控制服务：`gd-market-crawler`

## 3. 获取代码

```powershell
git clone https://github.com/rp-linmu/power-insight-grid.git
cd power-insight-grid
```

如果你使用自己的仓库地址，请替换上面的 URL。

## 4. 配置环境变量

复制示例配置：

```powershell
Copy-Item .env.example .env
```

然后根据本地情况修改 `.env`。

注意：

- `.env` 不应提交到 Git。
- 不要在 `.env.example` 中写入真实密钥。
- 如需使用外部模型或第三方服务，请只在本地 `.env` 中配置密钥。

## 5. 安装后端依赖

```powershell
cd backend
python -m pip install -r requirements.txt
cd ..
```

如果你使用 Anaconda，可以指定 Python：

```powershell
& "C:\software\anaconda\python.exe" -m pip install -r backend\requirements.txt
```

## 6. 安装前端依赖

```powershell
cd frontend
npm install
cd ..
```

## 7. 导入演示数据

开源版默认不包含真实数据库。你可以使用脱敏样例文件或自行准备数据文件。

如果仓库提供了演示导入脚本，可按脚本说明执行。例如：

```powershell
cd backend
python scripts\import_demo_data.py
cd ..
```

如果没有演示文件，页面会正常启动，但部分模块会显示“暂无数据”。

## 8. 启动系统

推荐使用根目录启动脚本：

```powershell
.\start.ps1
```

启动后通常访问：

```text
http://127.0.0.1:3000
```

如果端口被占用，可分别启动后端和前端。

### 单独启动后端

```powershell
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 单独启动前端

```powershell
cd frontend
npm run dev
```

## 9. 停止系统

如果使用 `start.ps1` 启动，通常在对应终端按：

```text
Ctrl + C
```

如果手动启动了多个服务，请分别停止前端、后端和数据获取服务。

## 10. 数据获取工具配置

数据获取控制服务位于：

```text
gd-market-crawler
```

开源版不会提交真实浏览器会话和本地登录信息。首次使用前需要自行配置：

- 登录方式。
- 下载目录。
- 数据项选择。
- 本地配置文件。

敏感配置建议放在本地文件，例如：

```text
gd-market-crawler/config.local.json
```

该文件应保持在 `.gitignore` 中，不要提交到 GitHub。

## 11. 页面功能检查建议

启动后建议按以下顺序检查：

1. 首页是否能正常打开。
2. 顶部交易日选择是否可用。
3. 基本面页面是否能读取演示数据或显示合理空态。
4. 市场出清与分时电量页面是否能切换市场口径和日期。
5. 网架拓扑页面是否能展示节点、线路和阻塞识别结果。
6. 数据获取页面是否能连接本地数据获取服务。
7. 导入管理页面是否能执行演示导入或显示导入状态。

## 12. 常见问题

### 端口被占用

如果后端端口被占用，可更换端口：

```powershell
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8010 --reload
```

同时需要确认前端 API 地址配置与后端端口一致。

### 页面显示暂无数据

这通常表示数据库中没有对应日期或对应数据项。请先导入演示数据，或检查后端数据库路径配置。

### 终端出现 503

如果请求类似：

```text
GET /api/trading/context?effective_date=2026-07-02 503
```

通常表示后端服务当前没有找到该交易日上下文，或数据库没有对应数据。它不是前端崩溃，但需要检查数据是否已经入库。

### Markdown 中文乱码

请确认 Markdown 文件使用 UTF-8 编码保存。不要用错误编码重新写入中文文档。

## 13. 发布前检查

发布前请确认以下内容不应提交：

```text
.env
*.db
*.sqlite
data_samples/
uploads/
outputs/
gd-market-crawler/config.local.json
gd-market-crawler/downloads/
gd-market-crawler/browser-data/
frontend/node_modules/
frontend/.next/
*.log
*.pkl
*.joblib
```

确认无敏感文件后再提交并推送。
