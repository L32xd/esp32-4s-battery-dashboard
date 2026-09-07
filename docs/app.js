(() => {
  'use strict';

  const SAMPLE_MS = 30_000;
  const CHARGE_MS = 4 * 60 * 60 * 1000;
  const DISCHARGE_MS = 60 * 60 * 1000;
  const CYCLE_MS = CHARGE_MS + DISCHARGE_MS;
  const MAX_RECORDS = 120;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const plot = { left: 68, right: 980, top: 18, bottom: 360 };

  const el = {
    menu: document.querySelector('#menuButton'),
    sidebar: document.querySelector('#sidebar'),
    title: document.querySelector('#pageTitle'),
    monitor: document.querySelector('#monitorPage'),
    records: document.querySelector('#recordsPage'),
    voltage: document.querySelector('#voltageValue'),
    gauge: document.querySelector('#gaugeValue'),
    time: document.querySelector('#beijingTime'),
    status: document.querySelector('#statusText'),
    cycles: document.querySelector('#cycleCount'),
    chart: document.querySelector('#chart'),
    chartWrap: document.querySelector('#chartWrap'),
    tooltip: document.querySelector('#tooltip'),
    reset: document.querySelector('#resetZoom'),
    recordsBody: document.querySelector('#recordsBody'),
    search: document.querySelector('#searchInput')
  };

  const initialCycleStart = Number(localStorage.getItem('batteryDemoCycleStart')) || Date.now() - 90 * 60 * 1000;
  localStorage.setItem('batteryDemoCycleStart', String(initialCycleStart));

  let records = [];
  let viewStart = 0;
  let viewEnd = 0;
  let zoomed = false;
  let dragging = false;
  let dragX = 0;
  let dragStart = 0;
  let dragEnd = 0;
  let lastHoverIndex = -1;

  const beijingDateTime = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const beijingTime = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  function phaseAt(timestamp) {
    const elapsed = Math.max(0, timestamp - initialCycleStart);
    const cycleCount = Math.floor(elapsed / CYCLE_MS);
    const within = elapsed % CYCLE_MS;
    const charging = within < CHARGE_MS;
    const progress = charging ? within / CHARGE_MS : (within - CHARGE_MS) / DISCHARGE_MS;
    return { charging, progress, cycleCount };
  }

  function simulatedVoltage(timestamp) {
    const phase = phaseAt(timestamp);
    const base = phase.charging
      ? 13.2 + 3.6 * phase.progress
      : 16.8 - 4.8 * phase.progress;
    const ripple = Math.sin(timestamp / 47_000) * 0.018 + Math.sin(timestamp / 19_000) * 0.009;
    return Math.max(12, Math.min(16.8, base + ripple));
  }

  function makeRecord(timestamp) {
    const phase = phaseAt(timestamp);
    return {
      x: timestamp,
      y: Number(simulatedVoltage(timestamp).toFixed(4)),
      status: phase.charging ? '充电（继电器1～3全部断开）' : '放电（继电器1～3全部吸合）',
      cycleCount: phase.cycleCount
    };
  }

  function seedRecords() {
    const end = Math.floor(Date.now() / SAMPLE_MS) * SAMPLE_MS;
    for (let i = 19; i >= 0; i -= 1) records.push(makeRecord(end - i * SAMPLE_MS));
    resetZoom();
    updateDashboard(records[records.length - 1]);
    renderTable();
  }

  function updateClock() {
    el.time.textContent = beijingDateTime.format(new Date());
  }

  function updateDashboard(record) {
    el.voltage.textContent = record.y.toFixed(4);
    el.status.textContent = record.status;
    el.cycles.textContent = record.cycleCount;
    const ratio = Math.max(0, Math.min(1, (record.y - 12) / 5));
    el.gauge.style.strokeDashoffset = String(361.28 * (1 - ratio));
    renderChart();
  }

  function addSample() {
    const record = makeRecord(Date.now());
    records.push(record);
    if (records.length > MAX_RECORDS) records = records.slice(-MAX_RECORDS);
    if (!zoomed) resetZoom();
    updateDashboard(record);
    renderTable();
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
    let min = Math.min(...visible.map(record => record.y));
    let max = Math.max(...visible.map(record => record.y));
    const pad = Math.max((max - min) * .18, .05);
    return { min: min - pad, max: max + pad };
  }

  function scaleX(value) {
    return plot.left + (value - viewStart) / Math.max(1, viewEnd - viewStart) * (plot.right - plot.left);
  }

  function scaleY(value, yRange) {
    return plot.top + (yRange.max - value) / Math.max(.001, yRange.max - yRange.min) * (plot.bottom - plot.top);
  }

  function renderChart() {
    const yRange = ranges();
    const visible = visibleRecords();
    el.chart.replaceChildren();

    for (let i = 0; i < 6; i += 1) {
      const y = plot.top + (plot.bottom - plot.top) * i / 5;
      const value = yRange.max - (yRange.max - yRange.min) * i / 5;
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

    const linePoints = visible.map(record => `${scaleX(record.x)},${scaleY(record.y, yRange)}`).join(' ');
    el.chart.append(svg('polyline', { points: linePoints, class: 'chart-line' }));
    visible.forEach((record, index) => {
      const circle = svg('circle', {
        cx: scaleX(record.x), cy: scaleY(record.y, yRange), r: 6,
        class: `chart-point${index === lastHoverIndex ? ' active' : ''}`,
        'data-index': index
      });
      el.chart.append(circle);
    });
  }

  function resetZoom() {
    if (!records.length) return;
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

  function svgPointer(event) {
    const rect = el.chart.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * 1000,
      y: (event.clientY - rect.top) / rect.height * 410,
      rect
    };
  }

  function showNearestPoint(event) {
    const pointer = svgPointer(event);
    const yRange = ranges();
    const visible = visibleRecords();
    let nearest = null;
    visible.forEach((record, index) => {
      const dx = scaleX(record.x) - pointer.x;
      const dy = scaleY(record.y, yRange) - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (!nearest || distance < nearest.distance) nearest = { record, index, distance, x: scaleX(record.x), y: scaleY(record.y, yRange) };
    });
    if (!nearest || nearest.distance > 16) { hideTooltip(); return; }

    lastHoverIndex = nearest.index;
    renderChart();
    el.chart.prepend(svg('line', { x1: nearest.x, x2: nearest.x, y1: plot.top, y2: plot.bottom, class: 'crosshair' }));
    el.chart.prepend(svg('line', { x1: plot.left, x2: plot.right, y1: nearest.y, y2: nearest.y, class: 'crosshair' }));

    const wrapRect = el.chartWrap.getBoundingClientRect();
    const localX = event.clientX - wrapRect.left;
    const localY = event.clientY - wrapRect.top;
    el.tooltip.innerHTML = `<div><span>横坐标</span>${beijingDateTime.format(new Date(nearest.record.x))}</div><div><span>纵坐标</span>${nearest.record.y.toFixed(4)} V</div>`;
    el.tooltip.hidden = false;
    const width = 235;
    el.tooltip.style.left = `${Math.max(8, Math.min(wrapRect.width - width - 8, localX + 14))}px`;
    el.tooltip.style.top = `${Math.max(8, Math.min(wrapRect.height - 76, localY - 70))}px`;
  }

  function hideTooltip() {
    if (lastHoverIndex === -1 && el.tooltip.hidden) return;
    lastHoverIndex = -1;
    el.tooltip.hidden = true;
    if (records.length) renderChart();
  }

  function onWheel(event) {
    event.preventDefault();
    event.stopPropagation();
    if (records.length < 2) return;
    const pointer = svgPointer(event);
    const ratio = Math.max(0, Math.min(1, (pointer.x - plot.left) / (plot.right - plot.left)));
    const oldSpan = Math.max(viewEnd - viewStart, SAMPLE_MS);
    const fullSpan = Math.max(records[records.length - 1].x - records[0].x, SAMPLE_MS);
    const newSpan = Math.max(SAMPLE_MS, Math.min(fullSpan, oldSpan * (event.deltaY < 0 ? .75 : 4 / 3)));
    const anchor = viewStart + oldSpan * ratio;
    const next = clampWindow(anchor - newSpan * ratio, anchor + newSpan * (1 - ratio));
    viewStart = next.start;
    viewEnd = next.end;
    zoomed = newSpan < fullSpan - 1;
    hideTooltip();
    renderChart();
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
    if (!dragging) { showNearestPoint(event); return; }
    const rect = el.chart.getBoundingClientRect();
    const span = dragEnd - dragStart;
    const shift = -(event.clientX - dragX) / rect.width * span;
    const next = clampWindow(dragStart + shift, dragEnd + shift);
    viewStart = next.start;
    viewEnd = next.end;
    zoomed = true;
    hideTooltip();
    renderChart();
  }

  function onPointerUp(event) {
    dragging = false;
    el.chartWrap.classList.remove('dragging');
    if (el.chart.hasPointerCapture(event.pointerId)) el.chart.releasePointerCapture(event.pointerId);
  }

  function renderTable() {
    const query = el.search.value.trim().toLowerCase();
    const filtered = [...records].reverse().filter(record => {
      const text = `${beijingDateTime.format(new Date(record.x))} ${record.y.toFixed(4)} ${record.status} ${record.cycleCount}`.toLowerCase();
      return !query || text.includes(query);
    });
    el.recordsBody.replaceChildren();
    if (!filtered.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'empty-row';
      cell.textContent = '没有匹配的记录';
      row.append(cell);
      el.recordsBody.append(row);
      return;
    }
    filtered.forEach(record => {
      const row = document.createElement('tr');
      [beijingDateTime.format(new Date(record.x)), record.y.toFixed(4), record.status, record.cycleCount].forEach(value => {
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
  document.querySelectorAll('.nav-link').forEach(button => button.addEventListener('click', () => switchPage(button.dataset.page)));
  el.search.addEventListener('input', renderTable);
  el.reset.addEventListener('click', resetZoom);
  el.chart.addEventListener('wheel', onWheel, { passive: false });
  el.chart.addEventListener('pointerdown', onPointerDown);
  el.chart.addEventListener('pointermove', onPointerMove);
  el.chart.addEventListener('pointerup', onPointerUp);
  el.chart.addEventListener('pointercancel', onPointerUp);
  el.chart.addEventListener('pointerleave', event => { if (dragging) onPointerUp(event); hideTooltip(); });
  el.chart.addEventListener('dblclick', resetZoom);

  seedRecords();
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(addSample, SAMPLE_MS);
})();
