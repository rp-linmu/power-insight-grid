# Backend

后端采用 `FastAPI + SQLite` 的轻量骨架，当前重点完成了：

- 样例 Excel / PDF 扫描
- 披露数据的基础入库
- 日期校验规则
- 首页概览与查询 API

## 启动方式

安装依赖：

```bash
pip install -r requirements.txt
```

启动服务：

```bash
python -m uvicorn app.main:app --reload
```

## 日期校验规则

导入时会同时识别：

- 外部文件名日期
- sheet 名日期
- 表内独立业务日期

优先级如下：

1. 表内独立业务日期
2. sheet 名日期
3. 外部文件名日期

因此，“校验外部名称和文件表格名称，并以表格中业务日期为准”的规则已经固化在导入逻辑中。
