# ESP32 4S 电池可视化

基于 Node-RED 5.0.6 和 FlowFuse Dashboard 1.31.0。本地页面每 30 秒查询一次 OneNET 设备最新属性并记录一个电压曲线点；北京时间每秒刷新。

## 本地启动

双击 `启动可视化.cmd`，或者运行：

```powershell
.\start-dashboard.ps1
```

- 监控页面：`http://127.0.0.1:1880/dashboard/monitor`
- RS485 数据表：`http://127.0.0.1:1880/dashboard/rs485-data`
- Node-RED 编辑器：`http://127.0.0.1:1880`

## 展示内容

- 组内总电压仪表盘
- 北京时间
- 当前充电/放电状态
- 循环次数
- 每 30 秒一条的单一电压曲线
- 鼠标移到采样点时显示该点的北京时间和电压值
- 曲线区域内滚轮缩放、鼠标拖动平移、双击或按钮复位
- 三横线导航中的 RS485 数据记录表（最近 120 条）

## GitHub Pages 公网版

`docs/` 是可直接部署到 GitHub Pages 的静态展示版，采用与 FlowFuse Dashboard 一致的深色仪表盘布局。它包含相同的仪表、曲线交互和数据表，并在浏览器中每 30 秒生成一条模拟电压数据。

公网版故意不读取 `.env` 和 OneNET 鉴权信息，避免将设备 API 密钥暴露到浏览器。推送到 `main` 分支后，`.github/workflows/pages.yml` 会自动发布 `docs/`。

## OneNET 配置

复制 `.env.example` 为 `.env`，填入 OneNET 产品、设备和 API 鉴权信息。`.env` 已被 Git 忽略，不会提交到仓库。
