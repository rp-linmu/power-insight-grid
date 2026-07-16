# 安装与使用指南

本文档面向首次安装和本地试用 Power Insight Grid 的使用者，说明环境准备、依赖安装、数据导入、系统启动和常见问题处理方式。

## 1. 项目简介

Power Insight Grid 是一个本地运行的电力市场辅助决策系统，提供市场数据展示、信息披露分析、现货出清查看、网架拓扑阻塞识别、政策文件管理和数据导入管理等功能。

公开仓库提供通用系统框架和演示能力，不包含真实市场数据、真实数据库、登录会话、密钥、私有预测算法和未脱敏业务文件。

## 2. 环境要求

建议环境：

- Windows 10/11
- Python 3.10 或更高版本
- Node.js 20 或更高版本
- npm

系统包含三个主要服务：

- 后端 API：`backend`
- 前端页面：`frontend`
- 数据获取控制服务：`gd-market-crawler`

## 3. 获取代码

```powershell
git clone https://github.com/rp-linmu/power-insight-grid.git
cd power-insight-grid
```

## 4. 配置环境变量

复制环境变量示例文件：

```powershell
Copy-Item .env.example .env
```

根据本地路径、端口和数据库位置修改 `.env`。真实密钥、登录信息和本地私有路径只应写入本地 `.env` 或本地配置文件，不应提交到 Git。

## 5. 安装后端依赖

```powershell
cd backend
python -m pip install -r requirements.txt
cd ..
```

如果使用 Anaconda 或其他独立 Python 环境，可指定对应的 Python 可执行文件路径：

```powershell
& "<path-to-python>\python.exe" -m pip install -r backend\requirements.txt
```

## 6. 安装前端依赖

```powershell
cd frontend
npm install
cd ..
```

## 7. 导入演示数据

公开仓库默认不包含真实数据库。页面可以在无数据状态下启动，但部分图表会显示空态。

如果项目提供演示数据导入脚本，可执行：

```powershell
cd backend
python scripts\load_demo_day.py --date 2026-07-01
cd ..
```

如果脚本名称或参数与当前版本不同，请以 `backend/scripts` 目录中的实际脚本为准。

## 8. 启动系统

推荐使用根目录启动脚本：

```powershell
.\start.ps1
```

也可以使用批处理启动：

```powershell
.\start.bat
```

启动后访问：

```text
http://127.0.0.1:3000
```

常用服务地址：

- 后端 API：`http://127.0.0.1:8001`
- 前端页面：`http://127.0.0.1:3000`
- 数据获取控制服务：`http://127.0.0.1:8787`

## 9. 单独启动服务

### 后端 API

```powershell
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

### 前端页面

```powershell
cd frontend
npm run dev
```

### 数据获取控制服务

```powershell
cd gd-market-crawler
npm install
npm run start
```

具体命令以 `gd-market-crawler/package.json` 中的脚本定义为准。

## 10. 停止系统

如果使用启动脚本启动服务，可在对应终端按：

```text
Ctrl + C
```

如果项目提供停止脚本，也可以执行：

```powershell
.\stop.ps1
```

## 11. 数据获取配置

数据获取控制服务位于：

```text
gd-market-crawler
```

首次使用前，需要在本地配置：

- 数据源登录方式。
- 下载目录。
- 数据项清单。
- 浏览器会话或本地访问凭据。

建议将本地敏感配置放在：

```text
gd-market-crawler/config.local.json
```

该文件默认不应提交到 Git。

## 12. 页面检查顺序

本地启动后，可按以下顺序检查系统：

1. 首页是否可以打开。
2. 顶部交易日选择是否可用。
3. 基本面页面是否能显示演示数据或合理空态。
4. 市场出清与分时电量页面是否能切换日期、市场口径和电源类型。
5. 网架拓扑页面是否能展示节点、线路和阻塞识别结果。
6. 政策文件页面是否能打开文件管理入口。
7. 数据获取页面是否能连接本地数据获取服务。
8. 导入管理页面是否能显示导入状态。

## 13. 常见问题

### 页面显示暂无数据

通常表示数据库中没有对应日期或对应数据项。可先导入演示数据，或检查后端数据库路径配置。

### 后端返回 503

类似请求：

```text
GET /api/trading/context?effective_date=2026-07-02 503
```

通常表示当前交易日上下文缺失，或数据库中没有该日期的数据。该状态不代表前端崩溃，需要检查数据是否已入库。

### 端口被占用

可以更换后端端口：

```powershell
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8010 --reload
```

更换端口后，需要同步调整前端 API 地址配置。

### Markdown 中文显示乱码

Markdown 文件应使用 UTF-8 编码保存。如果页面显示乱码，请检查编辑器保存编码和浏览器缓存。

## 14. 数据与安全说明

以下内容不应提交到公开仓库：

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

二次开发或部署时，应使用脱敏数据和本地配置文件。
