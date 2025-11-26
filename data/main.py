import requests
import time
import datetime as dt
import csv

BASE_URL = "https://api.binance.com"
SYMBOL = "XRPUSDT"
INTERVAL = "1m"
LIMIT = 1000  # Binance max

def to_millis(dt_obj):
    return int(dt_obj.timestamp() * 1000)

# 저장 기간 설정
START = dt.datetime(2025, 1, 1)
END   = dt.datetime(2025, 12, 31, 23, 59)

start_ms = to_millis(START)
end_ms   = to_millis(END)

all_kline = []
current = start_ms

print("⏳ 데이터 수집 시작...")

while current < end_ms:
    params = {
        "symbol": SYMBOL,
        "interval": INTERVAL,
        "startTime": current,
        "limit": LIMIT
    }

    r = requests.get(f"{BASE_URL}/api/v3/klines", params=params)
    r.raise_for_status()
    data = r.json()

    if not data:
        print("❗ 더 이상 데이터 없음")
        break

    all_kline.extend(data)

    # 마지막 closeTime 다음 시점으로 이동
    current = data[-1][6] + 1

    time.sleep(0.2)  # 방화벽 & rate limit 방지

print(f"📌 수집된 캔들 수: {len(all_kline)}")


# ------------------------------
# CSV 저장 (전체 OHLCV)
# ------------------------------
with open("output/xrpusdt_1m_ohlcv_2025.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["openTime","open","high","low","close","volume","closeTime"])
    for c in all_kline:
        writer.writerow([c[0], c[1], c[2], c[3], c[4], c[5], c[6]])

print("✅ OHLCV CSV 저장 완료: xrpusdt_1m_ohlcv_2025.csv")
