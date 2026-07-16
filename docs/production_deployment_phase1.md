# 生产部署一期方案

## 目标

这期方案的目标是把当前系统部署成可被互联网访问的站点，并完成基础安全加固。  
建议定位为“小规模正式环境 / 试运行环境”，适合先上线、先验证，再逐步升级。

## 当前建议架构

- 前端：`Next.js`
- 后端：`FastAPI`
- 反向代理：`Nginx`
- 容器编排：`Docker Compose`
- 数据库：当前代码仍使用 `SQLite`

## 重要提醒

当前代码的一期生产方案可以先跑在 `SQLite` 上，但它更适合：

- 内测
- 小规模访问
- 管理后台为主
- 并发较低的场景

如果后面要做正式商用、访问量提高、多人同时导入和编辑，建议尽快升级到 `PostgreSQL`。

## 已提供文件

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `deploy/docker-compose.prod.yml`
- `deploy/nginx/nginx.conf`
- `deploy/nginx/conf.d/power-market.conf`
- `deploy/nginx/conf.d/proxy-common.conf`
- `deploy/.env.prod.backend.example`
- `deploy/.env.prod.frontend.example`

## 目录准备

在服务器上建议使用如下目录：

```text
/srv/power-market/
  backend/
  frontend/
  deploy/
```

并准备：

- `deploy/certs/`
- `deploy/logs/nginx/`

## 部署步骤

### 1. 准备服务器

建议：

- Ubuntu 22.04 LTS
- 2 核 / 4G 内存起步
- 只开放 `80` 和 `443`
- SSH 端口改成非默认更稳

### 2. 安装 Docker 与 Docker Compose

示例：

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
```

### 3. 准备生产环境变量

把：

- `deploy/.env.prod.backend.example`

复制为：

- `backend/.env`

并至少修改：

- `POLICY_LLM_API_KEY`
- `DEFAULT_ADMIN_PASSWORD`

### 4. 配置 HTTPS 证书

当前 Nginx 配置默认从这里读取：

- `/etc/nginx/certs/fullchain.pem`
- `/etc/nginx/certs/privkey.pem`

在本项目中对应挂载目录：

- `deploy/certs/fullchain.pem`
- `deploy/certs/privkey.pem`

证书配置可采用以下方式：

- 先用正式证书
- 或先放测试证书验证联通

### 5. 启动服务

进入：

```bash
cd /srv/power-market/deploy
docker compose -f docker-compose.prod.yml up -d --build
```

### 6. 检查服务

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f nginx
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
```

### 7. 打开网站

浏览器访问：

- `https://<domain>`

## 安全加固建议

### 账号与权限

- 必须修改默认管理员密码
- 管理员账号不要长期使用 `admin`
- 为业务账号按 `viewer / editor / admin` 分配最小权限

### Nginx 层

当前配置已包含：

- 强制 HTTPS
- 基础安全头
- 登录接口限流
- 政策 AI 相关接口限流
- 屏蔽隐藏文件访问
- 限制上传体积为 `30MB`

### 应用层

上线前建议确认：

- 导入管理仅 `admin` 可访问
- 用户管理仅 `admin` 可访问
- 政策 AI 与人工修正仅 `editor/admin` 可用
- 问答接口已有频率限制

### 文件安全

- 上传目录和代码目录分离
- 不允许把上传目录直接暴露成静态目录
- 所有下载都通过后端鉴权接口

### 防爬虫

真正有效的是：

- 登录后访问核心数据
- 限流
- 操作日志
- IP 封禁
- WAF/CDN

`robots.txt` 只能防普通爬虫，不能防恶意抓取。

## 建议的云侧配置

建议至少使用：

- 安全组：只放行 `80/443`
- 云防火墙：限制异常来源 IP
- CDN/WAF：放在站点前面
- 自动快照或定时备份

## 运维命令

### 重启服务

```bash
docker compose -f deploy/docker-compose.prod.yml restart
```

### 更新部署

```bash
git pull
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

### 查看后端日志

```bash
docker compose -f deploy/docker-compose.prod.yml logs -f backend
```

### 查看 Nginx 日志

```bash
docker compose -f deploy/docker-compose.prod.yml logs -f nginx
```

## 二期建议

一期上线后，建议优先进入二期改造：

1. 把 `SQLite` 换成 `PostgreSQL`
2. 增加审计日志表
3. 增加登录失败次数限制
4. 增加验证码或二次校验
5. 把 AI 接口和问答接口接入独立限流组件
6. 使用对象存储代替本地文件目录
