# Chart Visualization Mapping - 20 Analytics

## Chart Status Overview
- ✅ Implemented (8)
- 🔨 To Implement (12)

---

## PERFORMANCE TAB (4 Analytics)

### 1. Performance Attribution
**Endpoint:** `/api/advanced-analytics/performance-attribution`
**Chart Type:** ✅ Waterfall Chart
**Data Needed:** 
- Allocation effect
- Selection effect
- Interaction effect
- Sector breakdown

**Already Implemented:** Yes

---

### 2. Total & Excess Return vs Benchmark
**Endpoint:** `/api/advanced-analytics/excess-return`
**Chart Type:** 🔨 Dual-Axis Line Chart
**Data Needed:**
- Portfolio returns over time
- Benchmark returns over time
- Shaded confidence bands

**Need to Add:** Dual-axis line chart with bands

---

### 3. Drawdown Analysis
**Endpoint:** `/api/advanced-analytics/drawdown-analysis`
**Chart Type:** ✅ Area Chart (with annotations)
**Data Needed:**
- Drawdown % over time
- Peak markers
- Trough markers

**Already Implemented:** Yes

---

### 4. Rolling Statistics
**Endpoint:** `/api/advanced-analytics/rolling-statistics`
**Chart Type:** ✅ Multi-Line Chart
**Data Needed:**
- Rolling returns
- Rolling volatility  
- Rolling Sharpe ratio

**Already Implemented:** Yes

---

## RISK TAB (5 Analytics)

### 5. Risk Decomposition (Factor Exposures)
**Endpoint:** `/api/advanced-analytics/risk-decomposition`
**Chart Type:** ✅ Horizontal Bar Chart
**Data Needed:**
- Market beta
- Size factor
- Value factor
- Momentum factor
- Quality factor

**Already Implemented:** Yes

---

### 6. VaR & Stress Scenarios
**Endpoint:** `/api/advanced-analytics/var-scenarios`
**Chart Type:** ✅ Histogram + 🔨 Scenario Table
**Data Needed:**
- Historical returns distribution
- VaR cutoff line
- Stress scenario results table

**Histogram Implemented:** Yes
**Scenario Table:** Need to add

---

### 7. Correlation & Covariance Matrix
**Endpoint:** `/api/advanced-analytics/correlation-matrix`
**Chart Type:** 🔨 Heatmap
**Data Needed:**
- Symbol pairs
- Correlation coefficients (-1 to 1)

**Need to Add:** Heatmap chart

---

### 8. Stress Testing
**Endpoint:** `/api/advanced-analytics/stress-scenarios`
**Chart Type:** 🔨 Scenario Comparison Bar Chart
**Data Needed:**
- Scenario names (2008 crisis, COVID crash, etc.)
- Expected portfolio impact (%)

**Need to Add:** Scenario bars

---

### 9. Holdings Concentration
**Endpoint:** `/api/advanced-analytics/concentration-analysis`
**Chart Type:** 🔨 Treemap + 🔨 Pareto Chart
**Data Needed:**
- Holdings with weights
- Cumulative concentration %

**Need to Add:** Both treemap and Pareto

---

## ATTRIBUTION TAB (4 Analytics)

### 10. Regional Attribution
**Endpoint:** `/api/advanced-analytics/regional-attribution`
**Chart Type:** ✅ Stacked Bar Chart
**Data Needed:**
- Regions (US, Europe, Asia, etc.)
- Allocation contribution
- Selection contribution

**Already Implemented:** Yes

---

### 11. Sector Rotation & Exposure
**Endpoint:** `/api/advanced-analytics/sector-rotation`
**Chart Type:** 🔨 Stacked Area Chart + 🔨 Heatmap Calendar
**Data Needed:**
- Sector weights over time
- Sector rotation signals

**Need to Add:** Stacked area + calendar heatmap

---

### 12. Peer Benchmarking
**Endpoint:** `/api/advanced-analytics/peer-benchmarking`
**Chart Type:** 🔨 Scatter Plot with Quadrants
**Data Needed:**
- Portfolio risk/return
- Peer portfolios risk/return
- Quadrant lines

**Need to Add:** Quadrant scatter

---

### 13. Alpha Decay / Factor Crowding
**Endpoint:** `/api/advanced-analytics/alpha-decay`
**Chart Type:** 🔨 Line Chart + 🔨 Heatmap
**Data Needed:**
- Alpha over time
- Factor crowding scores

**Need to Add:** Line + heatmap combo

---

## CONSTRUCTION TAB (4 Analytics)

### 14. Efficient Frontier
**Endpoint:** `/api/advanced-analytics/efficient-frontier`
**Chart Type:** ✅ Scatter Plot
**Data Needed:**
- Frontier points (risk vs return)
- Current portfolio marker
- Optimal portfolio marker

**Already Implemented:** Yes

---

### 15. Holdings Turnover
**Endpoint:** `/api/advanced-analytics/turnover-analysis`
**Chart Type:** 🔨 Bar Chart + 🔨 Calendar Heatmap
**Data Needed:**
- Monthly turnover %
- Trade frequency by day

**Need to Add:** Bar + calendar heatmap

---

### 16. Liquidity Analysis
**Endpoint:** `/api/advanced-analytics/liquidity-analysis`
**Chart Type:** 🔨 Bubble Chart
**Data Needed:**
- X: Position size
- Y: Average daily volume
- Bubble size: Market impact

**Need to Add:** Bubble chart

---

### 17. Transaction Cost Analysis
**Endpoint:** `/api/advanced-analytics/transaction-cost-analysis`
**Chart Type:** 🔨 Box Plot + 🔨 Timeline
**Data Needed:**
- Cost distribution by broker
- Costs over time

**Need to Add:** Box plot + timeline

---

## SPECIALIZED TAB (3 Analytics)

### 18. Alternatives Performance Attribution
**Endpoint:** `/api/advanced-analytics/alternatives-attribution`
**Chart Type:** ✅ Waterfall Chart + 🔨 IRR Table
**Data Needed:**
- Cash flows
- IRR calculations

**Waterfall Implemented:** Yes
**IRR Table:** Need to add

---

### 19. ESG Analysis
**Endpoint:** `/api/advanced-analytics/esg-analysis`
**Chart Type:** ✅ Radar Chart + 🔨 Bar Chart
**Data Needed:**
- E/S/G scores
- Carbon footprint

**Radar Implemented:** Yes
**Carbon Bar:** Need to add

---

### 20. Client Reporting Dashboard
**Endpoint:** `/api/advanced-analytics/client-reporting`
**Chart Type:** 🔨 KPI Cards + 🔨 Gauge Charts
**Data Needed:**
- Key metrics
- Goal progress

**Need to Add:** KPI cards + gauges

---

## Summary

### Already Implemented (8):
1. ✅ Waterfall Chart
2. ✅ Scatter Plot (Efficient Frontier)
3. ✅ Area Chart (Drawdown)
4. ✅ Horizontal Bar (Factor Exposures)
5. ✅ Radar Chart (ESG)
6. ✅ Histogram (VaR)
7. ✅ Multi-Line Chart (Rolling Stats)
8. ✅ Stacked Bar (Regional Attribution)

### To Implement (12):
1. 🔨 Dual-Axis Line Chart (Excess Return)
2. 🔨 Heatmap (Correlation Matrix)
3. 🔨 Treemap (Concentration)
4. 🔨 Pareto Chart (Concentration)
5. 🔨 Stacked Area Chart (Sector Rotation)
6. 🔨 Calendar Heatmap (Sector Rotation, Turnover)
7. 🔨 Quadrant Scatter (Peer Benchmarking)
8. 🔨 Bubble Chart (Liquidity)
9. 🔨 Box Plot (TCA)
10. 🔨 Timeline Chart (TCA)
11. 🔨 Gauge Chart (Client Reporting)
12. 🔨 KPI Cards (Client Reporting)

---

## Implementation Priority

### High Priority (Core Analytics):
1. Heatmap - Correlation matrix
2. Dual-axis line - Excess return tracking
3. Treemap - Concentration visualization
4. Stacked area - Sector rotation

### Medium Priority (Advanced):
5. Bubble chart - Liquidity analysis
6. Box plot - Cost analysis
7. Calendar heatmap - Temporal patterns
8. Gauge - Goal tracking

### Low Priority (Nice-to-have):
9. Pareto - Alternative to treemap
10. Quadrant scatter - Peer comparison
11. Timeline - Alternative view
12. KPI cards - Summary metrics

