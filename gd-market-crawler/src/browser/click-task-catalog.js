const CLICK_TASKS = [
  {
    id: "market-clearing",
    name: "市场出清",
    description: "首页“现货分日出清量价”模块导出",
    status: "ready"
  },
  {
    id: "basic-day-ahead",
    name: "基本面数据-预测",
    storageName: "基本面数据",
    description: "信息披露查询“预测”页全部导出",
    status: "ready"
  },
  {
    id: "basic-real-time",
    name: "基本面数据-实际",
    storageName: "基本面数据",
    description: "信息披露查询“实际”页全部导出",
    status: "ready"
  },
  {
    id: "day-ahead-node-price",
    name: "日前节点电价",
    description: "日前节点电价查询页面导出",
    status: "ready"
  },
  {
    id: "real-time-node-price",
    name: "实时节点电价",
    description: "实时节点电价查询页面导出",
    status: "ready"
  },
  {
    id: "spot-hourly-type-energy-day-ahead",
    name: "现货分时分类型出清电量-日前",
    storageName: "现货分时分类型出清电量",
    description: "首页“现货分时分类型出清电量”模块，切换日前后导出",
    status: "ready"
  },
  {
    id: "spot-hourly-type-energy-real-time",
    name: "现货分时分类型出清电量-实时",
    storageName: "现货分时分类型出清电量",
    description: "首页“现货分时分类型出清电量”模块，切换实时后导出",
    status: "ready"
  },
  {
    id: "daily-settlement",
    name: "日清算概览",
    description: "暂未在当前登录页面菜单中定位到可点击入口",
    status: "pending"
  },
  {
    id: "monthly-settlement",
    name: "月结算概览",
    description: "暂未在当前登录页面菜单中定位到可点击入口",
    status: "pending"
  },
  {
    id: "market-subject",
    name: "市场主体",
    description: "暂未在当前登录页面菜单中定位到可点击入口",
    status: "pending"
  },
  {
    id: "trade-market-quote",
    name: "交易市场行情",
    description: "暂未在当前登录页面菜单中定位到可点击入口",
    status: "pending"
  }
];

function listClickTasks() {
  return CLICK_TASKS.slice().sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === "ready" ? -1 : 1;
  });
}

function getClickTask(id) {
  return CLICK_TASKS.find((task) => task.id === id);
}

module.exports = { listClickTasks, getClickTask };
