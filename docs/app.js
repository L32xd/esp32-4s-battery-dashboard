(() => {
  'use strict';

  const SAMPLE_MS = 5_000;
  const MAX_RECORDS = 120;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const plot = { left: 68, right: 980, top: 18, bottom: 360 };
  const colors = { CH1: '#29b6f6', CH2: '#42d392', CH3: '#ffa726' };
  const channels = ['CH1', 'CH2', 'CH3'];
  const CONFIG_STORAGE_KEY = 'rs485-onenet-config-v1';
  const publicDataConfig = window.__RS485_CONFIG__ || {};
  const defaultDataConfig = {
    apiBase: 'https://iot-api.heclouds.com',
    productId: '025rYnzKk0',
    deviceName: '4S',
    authorization: publicDataConfig.authorization || ''
  };
  let dataConfig = loadDataConfig();

  const el = {
    menu: document.querySelector('#menuButton'),
    sidebar: document.querySelector('#sidebar'),
    title: document.querySelector('#pageTitle'),
    monitor: document.querySelector('#monitorPage'),
    records: document.querySelector('#recordsPage'),
    time: document.querySelector('#beijingTime'),
    status: document.querySelector('#statusText'),
    cycles: document.querySelector('#cycleCount'),
    dataState: document.querySelector('#dataState'),
    liveBadge: document.querySelector('#liveBadge'),
    configButton: document.querySelector('#configButton'),
    chart: document.querySelector('#chart'),
    chartWrap: document.querySelector('#chartWrap'),
    tooltip: document.querySelector('#tooltip'),
    reset: document.querySelector('#resetZoom'),
    recordsBody: document.querySelector('#recordsBody'),
    search: document.querySelector('#searchInput')
  };

  let records = [];
  let viewStart = 0;
  let viewEnd = 0;
  let zoomed = false;
  let dragging = false;
  let dragX = 0;
  let dragStart = 0;
  let dragEnd = 0;
  let hoverPoint = null;
  let lastCloudSampleTime = 0;

  const beijingDateTime = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const beijingTime = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function loadDataConfig() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(CONFIG_STORAGE_KEY) || '{}');
      return {
        ...defaultDataConfig,
        ...saved,
        ...(publicDataConfig.authorization ? { authorization: publicDataConfig.authorization } : {})
      };
    } catch (_) {
      return { ...defaultDataConfig };
    }
  }

  function setLiveState(text, error = false) {
    el.liveBadge.textContent = text;
    el.liveBadge.style.color = error ? '#ff9e9e' : '';
    el.liveBadge.style.borderColor = error ? '#8f4650' : '';
  }

  function readProperty(properties, names) {
    for (const name of names) {
      const item = properties[name];
      const value = numberOrNull(item && item.value);
      if (value !== null) return { value, time: numberOrNull(item.time) };
    }
    return { value: null, time: null };
  }

  function boolProperty(item) {
    return Boolean(item && (item.value === true || item.value === 'true' || item.value === 1 || item.value === '1'));
  }

  async function fetchOneNetSample() {
    if (!dataConfig.authorization) {
      setLiveState('请先配置鉴权');
      return;
    }

    setLiveState('正在读取…');
    const base = String(dataConfig.apiBase || defaultDataConfig.apiBase).replace(/\/$/, '');
    const query = new URLSearchParams({ product_id: dataConfig.productId, device_name: dataConfig.deviceName });
    try {
      const response = await fetch(`${base}/thingmodel/query-device-property?${query.toString()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json', authorization: dataConfig.authorization }
      });
      const body = await response.json();
      if (!response.ok || body.code !== 0 || !Array.isArray(body.data)) {
        throw new Error(body.msg || `HTTP ${response.status}`);
      }

      const properties = Object.fromEntries(body.data.map(item => [item.identifier, item]));
      const values = Object.fromEntries(channels.map(channel => {
        const item = readProperty(properties, [channel, channel.toLowerCase(), `${channel}_V`]);
        return [channel, item];
      }));
      const valid = Object.values(values).filter(item => item.value !== null);
      if (!valid.length) throw new Error('云端暂无 CH1/CH2/CH3 数据');

      const cloudTimes = valid.map(item => item.time || 0).filter(time => time > 0);
      const sampleTime = cloudTimes.length ? Math.max(...cloudTimes) : Date.now();
      if (sampleTime === lastCloudSampleTime) {
        setLiveState(`已连接 · ${beijingTime.format(new Date())}`);
        return;
      }
      lastCloudSampleTime = sampleTime;
      const relayOn = boolProperty(properties.ralay_status);
      pushBatterySample({
        timestamp: sampleTime,
        channels: Object.fromEntries(channels.map(channel => [channel, values[channel].value])),
        statusText: relayOn ? '放电（继电器1～3全部吸合）' : '充电（继电器1～3全部断开）',
        cycleCount: numberOrNull(properties.cycle_count && properties.cycle_count.value) ?? '--'
      });
      setLiveState(`已连接 · ${beijingTime.format(new Date())}`);
    } catch (error) {
      setLiveState(`读取失败 · ${error.message}`, true);
    }
  }

  function configureDataSource() {
    const authorization = window.prompt(
      '粘贴 OneNET Authorization（仅保存在本浏览器，不会写入 GitHub）：',
      dataConfig.authorization
    );
    if (authorization === null) return;
    dataConfig = { ...dataConfig, authorization: authorization.trim() };
    if (dataConfig.authorization) {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(dataConfig));
      fetchOneNetSample();
    } else {
      window.localStorage.removeItem(CONFIG_STORAGE_KEY);
      setLiveState('请先配置鉴权');
      updateDashboard(null);
    }
  }

  function normalizeSample(sample) {
    if (!sample || typeof sample !== 'object') return null;
    const source = sample.channels && typeof sample.channels === 'object' ? sample.channels : sample;
    const values = Object.fromEntries(channels.map(channel => [channel, numberOrNull(source[channel])]));
    if (!channels.some(channel => values[channel] !== null)) return null;
    const timestamp = numberOrNull(sample.timestamp || sample.time) || Date.now();
    return {
      x: timestamp,
      values,
      status: sample.statusText || sample.status || '--',
      cycleCount: sample.cycleValue ?? sample.cycleCount ?? '--'
    };
  }

  function pushBatterySample(sample) {
    const record = normalizeSample(sample);
    if (!record) return false;
    const duplicate = records.length && records[records.length - 1].x === record.x;
    if (duplicate) records[records.length - 1] = record;
    else records.push(record);
    if (records.length > MAX_RECORDS) records = records.slice(-MAX_RECORDS);
    if (!zoomed) resetZoom();
    updateDashboard(record);
    renderTable();
    return true;
  }

  // Node-RED 或其他数据桥接可以调用 window.pushBatterySample(sample) 注入真实数据。
  window.pushBatterySample = pushBatterySample;

  function updateClock() {
    el.time.textContent = beijingDateTime.format(new Date());
  }

  function updateDashboard(record) {
    if (!record) {
      channels.forEach(channel => updateGauge(channel, null));
      el.status.textContent = '--';
      el.cycles.textContent = '--';
      el.dataState.textContent = '等待采样';
      renderChart();
      return;
    }
    channels.forEach(channel => updateGauge(channel, record.values[channel]));
    el.status.textContent = record.status;
    el.cycles.textContent = record.cycleCount;
    el.dataState.textContent = `已接收 · ${beijingDateTime.format(new Date(record.x))}`;
    renderChart();
  }

  function updateGauge(channel, value) {
    const valueElement = document.querySelector(`#${channel}Value`);
    const gaugeElement = document.querySelector(`#${channel}Gauge`);
    valueElement.textContent = value === null ? '--' : value.toFixed(4);
    const ratio = value === null ? 0 : Math.max(0, Math.min(1, value / 17));
    gaugeElement.style.strokeDashoffset = String(361.28 * (1 - ratio));
  }

  function svg(tag, attrs = {}, text = '') {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text) node.textContent = text;
    return node;
  }

  function visibleRecords() {
    const visible = records.filter(record => record.x >= viewStart && record.x <= viewEnd);
    return visible.length ? visible : records.slice(-1);
  }

  function ranges() {
    const visible = visibleRecords();
    const values = visible.flatMap(record => channels.map(channel => record.values[channel]).filter(value => value !== null));
    if (!values.length) return { min: 0, max: 17 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.18, 0.05);
    return { min: min - pad, max: max + pad };
  }

  function scaleX(value) {
    return plot.left + (value - viewStart) / Math.max(1, viewEnd - viewStart) * (plot.right - plot.left);
  }

  function scaleY(value, range = ranges()) {
    return plot.top + (range.max - value) / Math.max(0.001, range.max - range.min) * (plot.bottom - plot.top);
  }

  function renderChart() {
    const range = ranges();
    const visible = visibleRecords();
    el.chart.replaceChildren();
    for (let i = 0; i < 6; i += 1) {
      const y = plot.top + (plot.bottom - plot.top) * i / 5;
      const value = range.max - (range.max - range.min) * i / 5;
      el.chart.append(svg('line', { x1: plot.left, x2: plot.right, y1: y, y2: y, class: 'grid' }));
      el.chart.append(svg('text', { x: plot.left - 10, y: y + 5, 'text-anchor': 'end', class: 'axis-text' }, value.toFixed(2)));
    }
    for (let i = 0; i < 6; i += 1) {
      const x = plot.left + (plot.right - plot.left) * i / 5;
      const value = viewStart + (viewEnd - viewStart) * i / 5;
      el.chart.append(svg('line', { x1: x, x2: x, y1: plot.top, y2: plot.bottom, class: 'grid grid-x' }));
      el.chart.append(svg('text', { x, y: 390, 'text-anchor': 'middle', class: 'axis-text' }, beijingTime.format(new Date(value))));
    }
    el.chart.append(svg('line', { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, class: 'axis' }));
    el.chart.append(svg('line', { x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom, class: 'axis' }));
    el.chart.append(svg('text', { x: 18, y: 190, 'text-anchor': 'middle', class: 'axis-title', transform: 'rotate(-90 18 190)' }, '电压 (V)'));

    channels.forEach(channel => {
      const points = visible.filter(record => record.values[channel] !== null).map(record => `${scaleX(record.x)},${scaleY(record.values[channel], range)}`).join(' ');
      el.chart.append(svg('polyline', { points, class: `chart-line chart-line-${channel.toLowerCase()}` }));
      visible.forEach((record, index) => {
        const value = record.values[channel];
        if (value === null) return;
        const circle = svg('circle', { cx: scaleX(record.x), cy: scaleY(value, range), r: 5, class: `chart-point chart-point-${channel.toLowerCase()}`, 'data-index': index, 'data-channel': channel });
        circle.addEventListener('mouseenter', event => showTooltip(event, record));
        circle.addEventListener('mousemove', event => showTooltip(event, record));
        circle.addEventListener('mouseleave', hideTooltip);
        el.chart.append(circle);
      });
    });
    if (hoverPoint) {
      el.chart.prepend(svg('line', { x1: scaleX(hoverPoint.x), x2: scaleX(hoverPoint.x), y1: plot.top, y2: plot.bottom, class: 'crosshair' }));
    }
  }

  function resetZoom() {
    if (!records.length) {
      viewStart = Date.now() - SAMPLE_MS;
      viewEnd = Date.now();
      renderChart();
      return;
    }
    viewStart = records[0].x;
    viewEnd = records[records.length - 1].x;
    if (viewEnd - viewStart < SAMPLE_MS) {
      const middle = (viewStart + viewEnd) / 2;
      viewStart = middle - SAMPLE_MS / 2;
      viewEnd = middle + SAMPLE_MS / 2;
    }
    zoomed = false;
    hideTooltip();
    renderChart();
  }

  function clampWindow(start, end) {
    const fullStart = records[0].x;
    const fullEnd = records[records.length - 1].x;
    const fullSpan = Math.max(fullEnd - fullStart, SAMPLE_MS);
    const span = end - start;
    if (span >= fullSpan) return { start: fullStart, end: fullEnd };
    if (start < fullStart) { end += fullStart - start; start = fullStart; }
    if (end > fullEnd) { start -= end - fullEnd; end = fullEnd; }
    return { start, end };
  }

  function showTooltip(event, record) {
    hoverPoint = record;
    renderChart();
    const wrapRect = el.chartWrap.getBoundingClientRect();
    const localX = event.clientX - wrapRect.left;
    const localY = event.clientY - wrapRect.top;
    el.tooltip.innerHTML = `<div><span>采样时间</span>${beijingDateTime.format(new Date(record.x))}</div>${channels.map(channel => `<div><span>${channel}</span>${record.values[channel] === null ? '--' : record.values[channel].toFixed(4) + ' V'}</div>`).join('')}`;
    el.tooltip.hidden = false;
    const width = 235;
    el.tooltip.style.left = `${Math.max(8, Math.min(wrapRect.width - width - 8, localX + 14))}px`;
    el.tooltip.style.top = `${Math.max(8, Math.min(wrapRect.height - 110, localY - 90))}px`;
  }

  function hideTooltip() {
    hoverPoint = null;
    el.tooltip.hidden = true;
    renderChart();
  }

  function onWheel(event) {
    event.preventDefault();
    event.stopPropagation();
    if (records.length < 2) return;
    const rect = el.chart.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const oldSpan = Math.max(viewEnd - viewStart, SAMPLE_MS);
    const fullSpan = Math.max(records[records.length - 1].x - records[0].x, SAMPLE_MS);
    const newSpan = Math.max(SAMPLE_MS, Math.min(fullSpan, oldSpan * (event.deltaY < 0 ? 0.75 : 4 / 3)));
    const anchor = viewStart + oldSpan * ratio;
    const next = clampWindow(anchor - newSpan * ratio, anchor + newSpan * (1 - ratio));
    viewStart = next.start;
    viewEnd = next.end;
    zoomed = newSpan < fullSpan - 1;
    hideTooltip();
  }

  function onPointerDown(event) {
    if (records.length < 2) return;
    dragging = true;
    dragX = event.clientX;
    dragStart = viewStart;
    dragEnd = viewEnd;
    el.chartWrap.classList.add('dragging');
    el.chart.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const rect = el.chart.getBoundingClientRect();
    const shift = -(event.clientX - dragX) / rect.width * (dragEnd - dragStart);
    const next = clampWindow(dragStart + shift, dragEnd + shift);
    viewStart = next.start;
    viewEnd = next.end;
    zoomed = true;
    hideTooltip();
  }

  function onPointerUp(event) {
    dragging = false;
    el.chartWrap.classList.remove('dragging');
    if (el.chart.hasPointerCapture(event.pointerId)) el.chart.releasePointerCapture(event.pointerId);
  }

  function renderTable() {
    const query = el.search.value.trim().toLowerCase();
    const filtered = [...records].reverse().filter(record => {
      const values = channels.map(channel => record.values[channel] === null ? '--' : record.values[channel].toFixed(4)).join(' ');
      const text = `${beijingDateTime.format(new Date(record.x))} ${values} ${record.status} ${record.cycleCount}`.toLowerCase();
      return !query || text.includes(query);
    });
    el.recordsBody.replaceChildren();
    if (!filtered.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'empty-row';
      cell.textContent = records.length ? '没有匹配的记录' : '暂无真实采样数据';
      row.append(cell);
      el.recordsBody.append(row);
      return;
    }
    filtered.forEach(record => {
      const row = document.createElement('tr');
      const values = [
        beijingDateTime.format(new Date(record.x)),
        ...channels.map(channel => record.values[channel] === null ? '--' : record.values[channel].toFixed(4)),
        record.status,
        record.cycleCount
      ];
      values.forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      el.recordsBody.append(row);
    });
  }

  function switchPage(name) {
    const monitor = name === 'monitor';
    el.monitor.classList.toggle('active', monitor);
    el.records.classList.toggle('active', !monitor);
    el.title.textContent = monitor ? '实时监控' : 'RS485数据记录';
    document.querySelectorAll('.nav-link').forEach(button => button.classList.toggle('active', button.dataset.page === name));
    if (window.innerWidth <= 950) el.sidebar.classList.add('collapsed');
  }

  el.menu.addEventListener('click', () => {
    const collapsed = el.sidebar.classList.toggle('collapsed');
    el.menu.setAttribute('aria-expanded', String(!collapsed));
  });
  el.configButton.addEventListener('click', configureDataSource);
  document.querySelectorAll('.nav-link').forEach(button => button.addEventListener('click', () => switchPage(button.dataset.page)));
  el.search.addEventListener('input', renderTable);
  el.reset.addEventListener('click', resetZoom);
  el.chart.addEventListener('wheel', onWheel, { passive: false });
  el.chart.addEventListener('pointerdown', onPointerDown);
  el.chart.addEventListener('pointermove', onPointerMove);
  el.chart.addEventListener('pointerup', onPointerUp);
  el.chart.addEventListener('pointercancel', onPointerUp);
  el.chart.addEventListener('dblclick', resetZoom);

  resetZoom();
  updateDashboard(null);
  renderTable();
  updateClock();
  setInterval(updateClock, 1000);
  fetchOneNetSample();
  setInterval(fetchOneNetSample, SAMPLE_MS);

  if (Array.isArray(window.__RS485_INITIAL_DATA__)) {
    window.__RS485_INITIAL_DATA__.forEach(pushBatterySample);
  }
})();
