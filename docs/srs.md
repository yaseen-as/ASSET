# 📘 Software Requirements Specification (SRS)

## Project Title
Swing Trade Asset & Recommendation Platform

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) document describes the detailed functional and non-functional requirements for a web-based application that allows retail investors and traders to manage NSE/BSE listed stocks. The platform primarily targets swing traders and offers features such as brokerage connection, real-time & historical trends, AI-driven recommendations, portfolio management, alerts, and analytics.

---

## 2. System Overview

The application enables users to:

- Connect their brokerage accounts (e.g., Angel One via SmartAPI)
- View live and historical stock prices
- Use AI/algorithmic stock recommendations
- Manage portfolios, watchlists, and alerts
- Receive notifications on price changes or market events

The system will consist of a frontend UI built with React + TypeScript, and a backend built with Node.js (Express) and TypeScript. Data storage will be handled with PostgreSQL or MongoDB, and real-time updates will be powered by WebSockets.

---

## 3. Stakeholders

| Role | Description |
|------|-------------|
| End User | Retail investors and swing traders |
| Admin | Manages system performance, API usage, and analytics |
| Developer | Implements features and integrations |
| Tester | Ensures quality and stability before release |

---

## 4. Functional Requirements

### 4.1 Authentication & User Management

- User registration via email/password
- Phone/OTP verification
- Secure session & token handling
- Connect/disconnect brokerage accounts with secure tokens

---

### 4.2 Brokerage Integration

The system shall allow:

- Integration with Angel One SmartAPI
- Real-time market feed (quotes, OHLC, volume)
- Historical stock data access
- Portfolio holdings display
- Order execution (Buy/Sell)
- Real-time streaming prices through WebSockets

The user may enable/disable integrations if multiple options are available.

---

### 4.3 Dashboard & Analytics

The dashboard shall display:

- Live price charts (candlestick + timeframe selection)
- Technical indicators (SMA, EMA, MACD, RSI)
- Portfolio value & change percentage
- Watchlist with AI suggestions
- Profit & loss over periods

---

### 4.4 AI-Driven Insights

Recommendations shall be provided using:

- Rule-based signals (MA crossovers, volume spikes)
- Machine learning predictions
- Sentiment analysis from news sources
- Personalized trends based on user history

---

### 4.5 Alerts & Notifications

Users shall be able to set alerts for:

- Price trigger events
- Volume spikes
- Dividend or corporate actions
- Technical indicator signals

Notifications may be sent via in-app alerts or email.

---

## 5. System Architecture

### 5.1 Frontend

- Developed with React (TypeScript)
- UI styled with Tailwind CSS
- State managed with Redux/Context API
- Charts built with Chart.js or D3.js

---

### 5.2 Backend

- Built using Node.js (Express) with TypeScript
- REST API for data transfer
- WebSocket for real-time price data
- Authentication & broker token management
- Recommendation and AI logic modules

---

### 5.3 Database

- Primary data store: PostgreSQL or MongoDB
- Collections/tables include:
  - Users
  - Portfolios
  - Alerts
  - Watchlists
  - Signals & Recommendations
  - Settings

---

## 6. Non-Functional Requirements

### 6.1 Performance

- Dashboard shall load within 3 seconds
- Real-time feed updates every 1-2 seconds for active users

---

### 6.2 Security

- All sensitive data must be encrypted
- API keys and tokens must be stored securely
- Protection against common vulnerabilities (OWASP)

---

### 6.3 Usability

- Interface must be intuitive and responsive
- Mobile-friendly layout

---

### 6.4 Reliability

- System uptime target ≥ 99%
- Graceful error handling

---

## 7. Development Roadmap
| Phase | Task | Timeline |
|-------|------|----------|
| Phase 1 | Planning & research | Week 1 |
| Phase 2 | Backend setup | Week 2 |
| Phase 3 | Frontend UI | Week 3–4 |
| Phase 4 | Broker integration | Week 5–6 |
| Phase 5 | Recommendation MVP | Week 7–8 |
| Phase 6 | Alerts & profiles | Week 9 |
| Phase 7 | Testing & deployment | Week 10 |
| Phase 8 | Launch & feedback | Week 11–12 |

---

## 8. Stock Recommendation Strategies

### 8.1 Rule-Based Signals
- Moving Average Crossovers
- RSI Overbought/Oversold
- Volume spikes detection

---

### 8.2 Machine Learning

- Train models based on historical data
- Use models to predict short-term trends

---

### 8.3 News/Sentiment Analysis

- Integrate with news APIs
- Apply sentiment classification
- Generate sentiment score as signal

---

## 9. Security & Compliance

- Secure storage of API tokens
- Data encryption at rest and in transit
- Compliance with broker API terms
- Basic privacy safeguards

---

## 10. Optional Add-Ons

- Portfolio benchmark vs major indices
- Tax reporting dashboard
- User-defined strategy builder

---

## 11. Future Enhancements

- Backtesting module
- Multiple brokers (e.g., Zerodha, Upstox)
- Social feed & community strategies
- Premium analytics

---

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| NSE | National Stock Exchange |
| BSE | Bombay Stock Exchange |
| API | Application Programming Interface |
| AI | Artificial Intelligence |
| PnL | Profit and Loss |
| OHLC | Open, High, Low, Close |

---