# ESP32 4S 电池可视化

基于 Node-RED 5.0.6 和 FlowFuse Dashboard 1.31.0。本地页面每 5 秒查询一次 OneNET 设备最新属性，展示 RS485 盒子的 CH1、CH2、CH3 三路真实电压；北京时间每秒刷新。

## 本地启动

双击 `启动可视化.cmd`，或者运行：

```powershell
.\start-dashboard.ps1
```

- 监控页面：`http://127.0.0.1:1880/dashboard/monitor`
- RS485 数据表：`http://127.0.0.1:1880/dashboard/rs485-data`
- Node-RED 编辑器：`http://127.0.0.1:1880`

## 展示内容

- CH1、CH2、CH3 三个独立电压仪表盘
- 北京时间
- 当前充电/放电状态
- 循环次数
- 每 30 秒一条的三路电压曲线
- 鼠标移到采样点时显示该点的北京时间和 CH1/CH2/CH3 电压值
- 曲线区域内滚轮缩放、鼠标拖动平移、双击或按钮复位
- 三横线导航中的 RS485 数据记录表（最近 720 条）

## GitHub Pages 公网版

公网访问地址：<https://l32xd.github.io/esp32-4s-battery-dashboard/>

`docs/` 是可直接部署到 GitHub Pages 的静态展示版，采用与 FlowFuse Dashboard 一致的深色仪表盘布局。它不生成模拟电压，会从 OneNET 查询 CH1、CH2、CH3 的真实属性，每 5 秒刷新一次。公网页面的 `config.js` 已配置设备鉴权，因此客户打开页面即可看到数据；也可通过 `window.pushBatterySample({timestamp, channels: {CH1, CH2, CH3}, statusText, cycleCount})` 接入其他数据桥接。

注意：为了让客户无需配置，公网页面会公开读取用的鉴权字符串；如需严格保密，应改用服务端代理并在 OneNET/GitHub 端保存密钥。推送到 `main` 分支后，`.github/workflows/pages.yml` 会自动发布 `docs/`。

## OneNET 配置

复制 `.env.example` 为 `.env`，填入 OneNET 产品、设备和 API 鉴权信息。设备物模型属性建议使用 `CH1`、`CH2`、`CH3`（流程也兼容 `Voltage1/Voltage2/Voltage3` 等常见命名）。`.env` 已被 Git 忽略，不会提交到仓库。

