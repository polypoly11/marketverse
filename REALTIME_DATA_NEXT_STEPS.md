# MARKETVERSE: commercial real-time data integration

## Status (2026-11-10)

The application includes an authenticated `/api/market/ingest` endpoint and broadcasts updates to connected clients via WebSocket. It does **not** connect to Koscom, KRX or Nasdaq automatically. A signed commercial agreement and the provider's API/transport specification are required first. `MARKET_DATA_INGEST_KEY` is an application secret, not a market-data vendor credential.

## Required licensed instruments

- `005930`: Samsung Electronics, KRX, KRW
- `000660`: SK hynix, KRX, KRW
- `KOSPI`: KOSPI index, points
- `NDX`: Nasdaq-100 index (not QQQ), points

## Ask the providers

1. Does the license permit public display on an unauthenticated website with 100–300 simultaneous users?
2. Is redistribution through one backend to browser clients permitted? Is per-user reporting required?
3. Does the product include real-time (not delayed) last trade / index values for these exact instruments?
4. What are the total monthly fees, minimums, setup fees, exchange fees, and taxes in KRW?
5. Which transport is supported (WebSocket, TCP, Kafka, REST) and can they supply integration documentation and test credentials?
6. What are attribution, caching, display, and retention requirements?

Contact: marketdata@koscom.co.kr and DataSales@nasdaq.com.

## Integration contract

A vendor-specific, server-side adapter should normalize licensed quotes to:

```json
{"symbol":"005930","price":123456,"timestamp":"2026-11-10T06:00:00.000Z","source":"LICENSED_PROVIDER_NAME"}
```

The value above is **an example of the JSON format, not a real market price**. Send authorized quotes from the adapter to POST `/api/market/ingest` with header `x-market-data-key: <MARKET_DATA_INGEST_KEY>`. Never expose vendor credentials or the ingest key in frontend JavaScript. Provider connectivity and display rights must be verified before enabling live display.

### Start the app locally (PowerShell)

```powershell
npm.cmd install
$env:MARKET_DATA_INGEST_KEY = 'replace-with-long-random-secret'
npm.cmd start
```

Open http://localhost:3000 and inspect http://localhost:3000/api/market/status. If no licensed feed has been connected, the four instruments should show a pending state.

## Source references

- KRX market data contracts: https://openapi.krx.co.kr/contents/OPP/DATA/OPPDATA003.jsp
- Koscom market data: https://dataservice.koscom.co.kr/
- Nasdaq GIDS: https://www.nasdaqtrader.com/Trader.aspx?id=realtimeindexes

Do not substitute scraping, retail brokerage keys, QQQ for NDX, or delayed quotes labelled as real-time.
