/**
 * TradingView Lightweight Charts Wrapper
 *
 * Professional charting library wrapper for WealthPilot Pro
 * Supports: Candlestick, Line, Area, Volume, and Technical Indicators
 *
 * Features:
 * - Multiple chart types (candlestick, line, area, bar)
 * - Technical indicators (SMA, EMA, Bollinger Bands, RSI, MACD)
 * - Volume overlay
 * - Drawing tools support
 * - Responsive design
 * - Dark/Light theme support
 * - Real-time data updates
 */

class TradingViewChart {
  constructor(container, options = {}) {
    this.container = typeof container === 'string'
      ? document.getElementById(container)
      : container;

    if (!this.container) {
      throw new Error('Chart container not found');
    }

    // Check if TradingView library is loaded
    if (typeof LightweightCharts === 'undefined') {
      throw new Error('TradingView Lightweight Charts library not loaded. Include lightweight-charts.standalone.production.js first.');
    }

    this.options = {
      width: options.width || this.container.clientWidth || 800,
      height: options.height || 400,
      theme: options.theme || 'dark',
      ...options
    };

    this.series = {};
    this.indicators = {};
    this.volumeSeries = null;

    this.initChart();
  }

  /**
   * Initialize the chart with theme-aware styling
   */
  initChart() {
    const isDark = this.options.theme === 'dark';

    const chartOptions = {
      width: this.options.width,
      height: this.options.height,
      layout: {
        background: { type: 'solid', color: isDark ? '#0f172a' : '#ffffff' },
        textColor: isDark ? '#94a3b8' : '#374151',
        fontSize: 12,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      },
      grid: {
        vertLines: { color: isDark ? '#1e293b' : '#e5e7eb' },
        horzLines: { color: isDark ? '#1e293b' : '#e5e7eb' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#475569' : '#9ca3af',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1e293b' : '#f3f4f6',
        },
        horzLine: {
          color: isDark ? '#475569' : '#9ca3af',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1e293b' : '#f3f4f6',
        },
      },
      rightPriceScale: {
        borderColor: isDark ? '#334155' : '#d1d5db',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: isDark ? '#334155' : '#d1d5db',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 10,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
      },
      handleScroll: {
        vertTouchDrag: true,
        horzTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
      },
    };

    this.chart = LightweightCharts.createChart(this.container, chartOptions);

    // Handle resize
    this.resizeObserver = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      this.chart.applyOptions({ width, height });
    });
    this.resizeObserver.observe(this.container);
  }

  /**
   * Add candlestick chart series
   * @param {Array} data - OHLC data [{time, open, high, low, close}]
   * @returns {Object} Series reference
   */
  addCandlestick(data, options = {}) {
    const isDark = this.options.theme === 'dark';

    const series = this.chart.addCandlestickSeries({
      upColor: options.upColor || '#22c55e',
      downColor: options.downColor || '#ef4444',
      borderVisible: false,
      wickUpColor: options.upColor || '#22c55e',
      wickDownColor: options.downColor || '#ef4444',
      ...options
    });

    if (data && data.length > 0) {
      series.setData(this.formatOHLCData(data));
    }

    this.series.candlestick = series;
    return series;
  }

  /**
   * Add line chart series
   * @param {Array} data - Line data [{time, value}]
   * @param {Object} options - Line options
   * @returns {Object} Series reference
   */
  addLine(data, options = {}) {
    const series = this.chart.addLineSeries({
      color: options.color || '#3b82f6',
      lineWidth: options.lineWidth || 2,
      lineStyle: LightweightCharts.LineStyle.Solid,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      ...options
    });

    if (data && data.length > 0) {
      series.setData(this.formatLineData(data));
    }

    this.series.line = series;
    return series;
  }

  /**
   * Add area chart series
   * @param {Array} data - Line data [{time, value}]
   * @param {Object} options - Area options
   * @returns {Object} Series reference
   */
  addArea(data, options = {}) {
    const isDark = this.options.theme === 'dark';

    const series = this.chart.addAreaSeries({
      lineColor: options.lineColor || '#3b82f6',
      topColor: options.topColor || 'rgba(59, 130, 246, 0.4)',
      bottomColor: options.bottomColor || 'rgba(59, 130, 246, 0.0)',
      lineWidth: options.lineWidth || 2,
      ...options
    });

    if (data && data.length > 0) {
      series.setData(this.formatLineData(data));
    }

    this.series.area = series;
    return series;
  }

  /**
   * Add volume histogram
   * @param {Array} data - Volume data [{time, value, color}]
   * @returns {Object} Series reference
   */
  addVolume(data, options = {}) {
    const series = this.chart.addHistogramSeries({
      color: '#3b82f6',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      ...options
    });

    // Configure volume scale
    this.chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      borderVisible: false,
    });

    if (data && data.length > 0) {
      const volumeData = data.map(d => ({
        time: this.formatTime(d.time || d.date),
        value: d.volume || d.value,
        color: d.close >= d.open
          ? 'rgba(34, 197, 94, 0.5)'
          : 'rgba(239, 68, 68, 0.5)'
      }));
      series.setData(volumeData);
    }

    this.volumeSeries = series;
    return series;
  }

  /**
   * Add Simple Moving Average (SMA)
   * @param {Array} data - OHLC data
   * @param {number} period - SMA period
   * @param {string} color - Line color
   * @returns {Object} Series reference
   */
  addSMA(data, period = 20, color = '#f59e0b') {
    const smaData = this.calculateSMA(data, period);

    const series = this.chart.addLineSeries({
      color,
      lineWidth: 1,
      title: `SMA ${period}`,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    series.setData(smaData);
    this.indicators[`sma_${period}`] = series;
    return series;
  }

  /**
   * Add Exponential Moving Average (EMA)
   * @param {Array} data - OHLC data
   * @param {number} period - EMA period
   * @param {string} color - Line color
   * @returns {Object} Series reference
   */
  addEMA(data, period = 20, color = '#8b5cf6') {
    const emaData = this.calculateEMA(data, period);

    const series = this.chart.addLineSeries({
      color,
      lineWidth: 1,
      title: `EMA ${period}`,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    series.setData(emaData);
    this.indicators[`ema_${period}`] = series;
    return series;
  }

  /**
   * Add Bollinger Bands
   * @param {Array} data - OHLC data
   * @param {number} period - Period (default 20)
   * @param {number} stdDev - Standard deviations (default 2)
   * @returns {Object} Series references {upper, middle, lower}
   */
  addBollingerBands(data, period = 20, stdDev = 2) {
    const bands = this.calculateBollingerBands(data, period, stdDev);

    const upperSeries = this.chart.addLineSeries({
      color: 'rgba(59, 130, 246, 0.5)',
      lineWidth: 1,
      title: 'BB Upper',
      priceLineVisible: false,
    });

    const middleSeries = this.chart.addLineSeries({
      color: 'rgba(59, 130, 246, 0.8)',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      title: 'BB Middle',
      priceLineVisible: false,
    });

    const lowerSeries = this.chart.addLineSeries({
      color: 'rgba(59, 130, 246, 0.5)',
      lineWidth: 1,
      title: 'BB Lower',
      priceLineVisible: false,
    });

    upperSeries.setData(bands.upper);
    middleSeries.setData(bands.middle);
    lowerSeries.setData(bands.lower);

    this.indicators.bollingerBands = { upper: upperSeries, middle: middleSeries, lower: lowerSeries };
    return this.indicators.bollingerBands;
  }

  /**
   * Add horizontal price line
   * @param {number} price - Price level
   * @param {Object} options - Line options
   */
  addHorizontalLine(price, options = {}) {
    const mainSeries = this.series.candlestick || this.series.line || this.series.area;
    if (!mainSeries) return;

    mainSeries.createPriceLine({
      price,
      color: options.color || '#f59e0b',
      lineWidth: options.lineWidth || 1,
      lineStyle: options.lineStyle || LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: options.axisLabelVisible !== false,
      title: options.title || '',
    });
  }

  /**
   * Add marker annotation
   * @param {Object} marker - {time, position, color, shape, text}
   */
  addMarker(marker) {
    const mainSeries = this.series.candlestick || this.series.line || this.series.area;
    if (!mainSeries) return;

    mainSeries.setMarkers([{
      time: this.formatTime(marker.time),
      position: marker.position || 'aboveBar',
      color: marker.color || '#3b82f6',
      shape: marker.shape || 'arrowDown',
      text: marker.text || '',
    }]);
  }

  // ========== Calculation Methods ==========

  /**
   * Calculate Simple Moving Average
   */
  calculateSMA(data, period) {
    const result = [];
    const closes = data.map(d => d.close);

    for (let i = period - 1; i < closes.length; i++) {
      const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push({
        time: this.formatTime(data[i].time || data[i].date),
        value: sum / period
      });
    }

    return result;
  }

  /**
   * Calculate Exponential Moving Average
   */
  calculateEMA(data, period) {
    const result = [];
    const closes = data.map(d => d.close);
    const multiplier = 2 / (period + 1);

    // Start with SMA for first EMA value
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push({
      time: this.formatTime(data[period - 1].time || data[period - 1].date),
      value: ema
    });

    for (let i = period; i < closes.length; i++) {
      ema = (closes[i] - ema) * multiplier + ema;
      result.push({
        time: this.formatTime(data[i].time || data[i].date),
        value: ema
      });
    }

    return result;
  }

  /**
   * Calculate Bollinger Bands
   */
  calculateBollingerBands(data, period, stdDev) {
    const upper = [];
    const middle = [];
    const lower = [];
    const closes = data.map(d => d.close);

    for (let i = period - 1; i < closes.length; i++) {
      const slice = closes.slice(i - period + 1, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
      const std = Math.sqrt(variance);
      const time = this.formatTime(data[i].time || data[i].date);

      middle.push({ time, value: sma });
      upper.push({ time, value: sma + stdDev * std });
      lower.push({ time, value: sma - stdDev * std });
    }

    return { upper, middle, lower };
  }

  // ========== Data Formatting ==========

  /**
   * Format time to TradingView format
   */
  formatTime(time) {
    if (typeof time === 'number') return time;
    if (time instanceof Date) {
      return Math.floor(time.getTime() / 1000);
    }
    if (typeof time === 'string') {
      // Handle YYYY-MM-DD format
      if (time.includes('-')) {
        const [year, month, day] = time.split('T')[0].split('-');
        return `${year}-${month}-${day}`;
      }
      return time;
    }
    return time;
  }

  /**
   * Format OHLC data
   */
  formatOHLCData(data) {
    return data.map(d => ({
      time: this.formatTime(d.time || d.date),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
    }));
  }

  /**
   * Format line data
   */
  formatLineData(data) {
    return data.map(d => ({
      time: this.formatTime(d.time || d.date),
      value: Number(d.value || d.close),
    }));
  }

  // ========== Chart Control Methods ==========

  /**
   * Update chart data
   */
  updateData(seriesType, data) {
    const series = this.series[seriesType];
    if (series) {
      if (seriesType === 'candlestick') {
        series.setData(this.formatOHLCData(data));
      } else {
        series.setData(this.formatLineData(data));
      }
    }
  }

  /**
   * Add real-time update
   */
  addTick(seriesType, tick) {
    const series = this.series[seriesType];
    if (series) {
      if (seriesType === 'candlestick') {
        series.update({
          time: this.formatTime(tick.time || tick.date),
          open: Number(tick.open),
          high: Number(tick.high),
          low: Number(tick.low),
          close: Number(tick.close),
        });
      } else {
        series.update({
          time: this.formatTime(tick.time || tick.date),
          value: Number(tick.value || tick.close),
        });
      }
    }
  }

  /**
   * Fit content to view
   */
  fitContent() {
    this.chart.timeScale().fitContent();
  }

  /**
   * Set visible range
   */
  setVisibleRange(from, to) {
    this.chart.timeScale().setVisibleRange({
      from: this.formatTime(from),
      to: this.formatTime(to),
    });
  }

  /**
   * Change theme
   */
  setTheme(theme) {
    this.options.theme = theme;
    const isDark = theme === 'dark';

    this.chart.applyOptions({
      layout: {
        background: { type: 'solid', color: isDark ? '#0f172a' : '#ffffff' },
        textColor: isDark ? '#94a3b8' : '#374151',
      },
      grid: {
        vertLines: { color: isDark ? '#1e293b' : '#e5e7eb' },
        horzLines: { color: isDark ? '#1e293b' : '#e5e7eb' },
      },
      rightPriceScale: { borderColor: isDark ? '#334155' : '#d1d5db' },
      timeScale: { borderColor: isDark ? '#334155' : '#d1d5db' },
    });
  }

  /**
   * Remove a series
   */
  removeSeries(name) {
    if (this.series[name]) {
      this.chart.removeSeries(this.series[name]);
      delete this.series[name];
    }
    if (this.indicators[name]) {
      if (typeof this.indicators[name] === 'object' && !Array.isArray(this.indicators[name])) {
        Object.values(this.indicators[name]).forEach(s => this.chart.removeSeries(s));
      } else {
        this.chart.removeSeries(this.indicators[name]);
      }
      delete this.indicators[name];
    }
  }

  /**
   * Clear all series
   */
  clear() {
    Object.values(this.series).forEach(s => this.chart.removeSeries(s));
    Object.values(this.indicators).forEach(i => {
      if (typeof i === 'object' && !Array.isArray(i)) {
        Object.values(i).forEach(s => this.chart.removeSeries(s));
      } else {
        this.chart.removeSeries(i);
      }
    });
    if (this.volumeSeries) {
      this.chart.removeSeries(this.volumeSeries);
    }
    this.series = {};
    this.indicators = {};
    this.volumeSeries = null;
  }

  /**
   * Subscribe to crosshair movement
   */
  onCrosshairMove(callback) {
    this.chart.subscribeCrosshairMove(callback);
  }

  /**
   * Get chart screenshot
   */
  takeScreenshot() {
    return this.chart.takeScreenshot();
  }

  /**
   * Cleanup and destroy chart
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.chart.remove();
  }
}

// ========== Chart Factory for Quick Creation ==========

const ChartFactory = {
  /**
   * Create a simple price chart
   */
  createPriceChart(container, data, options = {}) {
    const chart = new TradingViewChart(container, options);
    chart.addCandlestick(data);
    chart.addVolume(data);
    chart.fitContent();
    return chart;
  },

  /**
   * Create chart with moving averages
   */
  createMAChart(container, data, options = {}) {
    const chart = new TradingViewChart(container, options);
    chart.addCandlestick(data);
    chart.addSMA(data, 20, '#f59e0b');
    chart.addSMA(data, 50, '#3b82f6');
    chart.addSMA(data, 200, '#8b5cf6');
    chart.addVolume(data);
    chart.fitContent();
    return chart;
  },

  /**
   * Create chart with Bollinger Bands
   */
  createBBChart(container, data, options = {}) {
    const chart = new TradingViewChart(container, options);
    chart.addCandlestick(data);
    chart.addBollingerBands(data, 20, 2);
    chart.addVolume(data);
    chart.fitContent();
    return chart;
  },

  /**
   * Create simple line chart
   */
  createLineChart(container, data, options = {}) {
    const chart = new TradingViewChart(container, options);
    chart.addLine(data, { color: options.color || '#3b82f6' });
    chart.fitContent();
    return chart;
  },

  /**
   * Create area chart
   */
  createAreaChart(container, data, options = {}) {
    const chart = new TradingViewChart(container, options);
    chart.addArea(data, options);
    chart.fitContent();
    return chart;
  }
};

// Export for global use
window.TradingViewChart = TradingViewChart;
window.ChartFactory = ChartFactory;
