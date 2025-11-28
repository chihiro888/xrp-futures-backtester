'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface OHLCVData {
  open_time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  close_time: number;
  created_at?: string;
}

interface SignalData {
  id: number;
  symbol: string;
  signal: 'buy' | 'sell';
  created_at: string;
}

interface AddEntryRecord {
  time: number;
  price: number;
  quantity: number;
  averageEntryPrice: number;
  totalQuantity: number;
  pnlPercentBefore: number; // 진입 전 PnL%
  pnlPercentAfter: number; // 진입 후 PnL%
  liquidationPriceBefore: number; // 진입 전 청산가
  liquidationPriceAfter: number; // 진입 후 청산가
  order: number; // 물타기 순서 (1, 2, 3...)
}

interface TakeProfitRecord {
  time: number;
  price: number;
  entryPrice: number;
  pnl: number;
  pnlPercent: number;
  quantity: number;
  positionType: 'long' | 'short'; // 포지션 타입
}

interface SimulationState {
  currentPrice: number;
  entryPrice: number; // 첫 진입가격
  averageEntryPrice: number; // 평균 진입가격
  quantity: number; // 현재 수량
  totalQuantity: number; // 총 수량 (물타기 포함)
  leverage: number;
  margin: number;
  positionValue: number;
  pnl: number;
  pnlPercent: number;
  currentTime: number;
  liquidationPrice: number;
  balance: number;
  addEntryCount: number; // 물타기 횟수
  hasPosition: boolean; // 포지션 보유 여부
  positionType: 'long' | 'short'; // 포지션 타입
}

const LEVERAGE = 30;
const SIZE_TO_XRP = 10; // 1 size = 10 XRP

interface ChartDataPoint {
  time: string;
  price: number;
  entryPrice: number;
  liquidationPrice: number;
  pnl: number;
  margin: number;
  positionValue: number;
}

const formatTimestamp = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

// Calculate liquidation price for cross margin mode
const calculateLiquidationPrice = (
  entryPrice: number,
  quantity: number,
  balance: number,
  leverage: number,
  positionType: 'long' | 'short'
): number => {
  // Cross margin: 전체 잔고가 마진으로 사용됨
  // 롱: 청산가 = 진입가격 - (잔고 / (수량 × 레버리지))
  // 숏: 청산가 = 진입가격 + (잔고 / (수량 × 레버리지))
  const balanceNum = parseFloat(balance.toString());
  const priceChange = balanceNum / (quantity * leverage);
  return positionType === 'long' 
    ? entryPrice - priceChange 
    : entryPrice + priceChange;
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [startDate, setStartDate] = useState('2025-11-01T00:00');
  const [endDate, setEndDate] = useState('2025-11-02T00:00');
  const [size, setSize] = useState('1');
  const [balance, setBalance] = useState('1000'); // 시드(잔고)
  const [takeProfitPercent, setTakeProfitPercent] = useState('10'); // 익절 (%)
  const [isRunning, setIsRunning] = useState(false);
  const [simulationData, setSimulationData] = useState<OHLCVData[]>([]);
  const [signalsData, setSignalsData] = useState<SignalData[]>([]); // signals 데이터
  const [currentIndex, setCurrentIndex] = useState(0);
  const [simulationState, setSimulationState] = useState<SimulationState | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLiquidated, setIsLiquidated] = useState(false); // 청산 여부
  const [speed, setSpeed] = useState(1); // 시뮬레이션 속도 (배수)
  const [addEntryTrigger, setAddEntryTrigger] = useState('30'); // 물타기 트리거 (%)
  const [addEntryRecords, setAddEntryRecords] = useState<AddEntryRecord[]>([]); // 물타기 진입 내역
  const [takeProfitRecords, setTakeProfitRecords] = useState<TakeProfitRecord[]>([]); // 익절 내역
  const [showResultsOnly, setShowResultsOnly] = useState(false); // 결과만 보기 모드
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const cachedDateRangeRef = useRef<{ startDate: string; endDate: string } | null>(null); // 캐시된 날짜 범위

  // 클라이언트 마운트 확인
  useEffect(() => {
    setMounted(true);
  }, []);


  // 페이지네이션으로 모든 데이터 가져오기
  const fetchAllOHLCVData = async (startTime: string, endTime: string) => {
    const allData: OHLCVData[] = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `/api/ohlcv?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&offset=${offset}&limit=${limit}`
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch OHLCV data');
      }

      const result = await response.json();
      const data = result.data || [];
      
      if (data.length === 0) {
        hasMore = false;
      } else {
        allData.push(...data);
        offset += limit;
        
        // 1000개 미만이면 마지막 페이지
        if (data.length < limit) {
          hasMore = false;
        }
      }
    }

    return allData;
  };

  // 페이지네이션으로 모든 signals 데이터 가져오기
  const fetchAllSignalsData = async (startTime: string, endTime: string) => {
    const allData: SignalData[] = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `/api/signals?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&symbol=XRPUSDT&offset=${offset}&limit=${limit}`
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch signals data');
      }

      const result = await response.json();
      const data = result.data || [];
      
      if (data.length === 0) {
        hasMore = false;
      } else {
        allData.push(...data);
        offset += limit;
        
        // 1000개 미만이면 마지막 페이지
        if (data.length < limit) {
          hasMore = false;
        }
      }
    }

    return allData;
  };

  const fetchOHLCVData = async () => {
    try {
      setError(null);
      
      // 날짜가 변경되지 않았고 데이터가 이미 있으면 재사용
      if (
        cachedDateRangeRef.current &&
        cachedDateRangeRef.current.startDate === startDate &&
        cachedDateRangeRef.current.endDate === endDate &&
        simulationData.length > 0 &&
        signalsData.length >= 0
      ) {
        // 데이터 재사용, 시뮬레이션 상태만 초기화
        setCurrentIndex(0);
        setChartData([]);
        setIsLiquidated(false);
        setAddEntryRecords([]);
        setTakeProfitRecords([]);
        
        // Initialize simulation state (no position initially)
        const firstData = simulationData[0];
        const firstPrice = parseFloat(firstData.open);
        const balanceNum = parseFloat(balance);

        const initialChartPoint: ChartDataPoint = {
          time: formatTimestamp(firstData.open_time),
          price: firstPrice,
          entryPrice: firstPrice,
          liquidationPrice: 0,
          pnl: 0,
          margin: 0,
          positionValue: 0,
        };

        setChartData([initialChartPoint]);
        setSimulationState({
          currentPrice: firstPrice,
          entryPrice: firstPrice,
          averageEntryPrice: firstPrice,
          quantity: 0,
          totalQuantity: 0,
          leverage: LEVERAGE,
          margin: 0,
          positionValue: 0,
          pnl: 0,
          pnlPercent: 0,
          currentTime: firstData.open_time,
          liquidationPrice: 0,
          balance: balanceNum,
          addEntryCount: 0,
          hasPosition: false,
          positionType: 'long',
        });
        return;
      }
      
      // 모든 OHLCV 데이터 가져오기 (페이지네이션)
      const allOHLCVData = await fetchAllOHLCVData(startDate, endDate);
      
      if (allOHLCVData.length === 0) {
        throw new Error('No OHLCV data found for the selected date range');
      }

      // 모든 signals 데이터 가져오기 (페이지네이션)
      const allSignalsData = await fetchAllSignalsData(startDate, endDate);
      
      // 날짜 범위 캐시 업데이트
      cachedDateRangeRef.current = { startDate, endDate };
      
      // 모든 신호 사용 (buy = 롱, sell = 숏)
      setSimulationData(allOHLCVData);
      setSignalsData(allSignalsData);
      setCurrentIndex(0);
      setChartData([]);
      setIsLiquidated(false); // 청산 상태 초기화
      setAddEntryRecords([]); // 물타기 내역 초기화
      setTakeProfitRecords([]); // 익절 내역 초기화
      
      // Initialize simulation state (no position initially)
      const firstData = allOHLCVData[0];
      const firstPrice = parseFloat(firstData.open);
      const balanceNum = parseFloat(balance);

      const initialChartPoint: ChartDataPoint = {
        time: formatTimestamp(firstData.open_time),
        price: firstPrice,
        entryPrice: firstPrice,
        liquidationPrice: 0,
        pnl: 0,
        margin: 0,
        positionValue: 0,
      };

      setChartData([initialChartPoint]);
      setSimulationState({
        currentPrice: firstPrice,
        entryPrice: firstPrice,
        averageEntryPrice: firstPrice,
        quantity: 0,
        totalQuantity: 0,
        leverage: LEVERAGE,
        margin: 0,
        positionValue: 0,
        pnl: 0,
        pnlPercent: 0,
        currentTime: firstData.open_time,
        liquidationPrice: 0,
        balance: balanceNum,
        addEntryCount: 0,
        hasPosition: false, // 초기에는 포지션 없음
        positionType: 'long',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsRunning(false);
    }
  };

  const startSimulation = async () => {
    if (!startDate || !endDate || !size || !balance) {
      setError('Please fill in all fields');
      return;
    }

    const sizeNum = parseFloat(size);
    if (isNaN(sizeNum) || sizeNum <= 0) {
      setError('Size must be a positive number');
      return;
    }

    const balanceNum = parseFloat(balance);
    if (isNaN(balanceNum) || balanceNum <= 0) {
      setError('Balance must be a positive number');
      return;
    }

    await fetchOHLCVData();
    setIsRunning(true);
  };

  const stopSimulation = () => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const resetSimulation = () => {
    stopSimulation();
    setCurrentIndex(0);
    setSimulationState(null);
    setSimulationData([]);
    setSignalsData([]);
    setChartData([]);
    setIsLiquidated(false);
    setAddEntryRecords([]); // 물타기 내역 초기화
    setTakeProfitRecords([]); // 익절 내역 초기화
    setShowResultsOnly(false);
    cachedDateRangeRef.current = null; // 캐시 초기화
  };

  // 시뮬레이션 즉시 실행 (결과만 보기)
  const runSimulationInstant = async () => {
    if (!startDate || !endDate || !size || !balance) {
      setError('Please fill in all fields');
      return;
    }

    const sizeNum = parseFloat(size);
    if (isNaN(sizeNum) || sizeNum <= 0) {
      setError('Size must be a positive number');
      return;
    }

    const balanceNum = parseFloat(balance);
    if (isNaN(balanceNum) || balanceNum <= 0) {
      setError('Balance must be a positive number');
      return;
    }

    try {
      setError(null);
      setShowResultsOnly(true);
      
      let allOHLCVData: OHLCVData[] = [];
      let signals: SignalData[] = [];
      
      // 날짜가 변경되지 않았고 데이터가 이미 있으면 재사용
      if (
        cachedDateRangeRef.current &&
        cachedDateRangeRef.current.startDate === startDate &&
        cachedDateRangeRef.current.endDate === endDate &&
        simulationData.length > 0 &&
        signalsData.length >= 0
      ) {
        // 기존 데이터 재사용
        allOHLCVData = simulationData;
        signals = signalsData;
      } else {
        // 모든 데이터 가져오기 (페이지네이션)
        allOHLCVData = await fetchAllOHLCVData(startDate, endDate);
        
        if (allOHLCVData.length === 0) {
          throw new Error('No OHLCV data found');
        }

        const allSignalsData = await fetchAllSignalsData(startDate, endDate);
        signals = allSignalsData;
        
        // 날짜 범위 캐시 업데이트
        cachedDateRangeRef.current = { startDate, endDate };
        
        // 데이터 상태 업데이트
        setSimulationData(allOHLCVData);
        setSignalsData(signals);
      }
      
      const data = allOHLCVData;
      
      // 시뮬레이션 실행
      let averageEntryPrice = 0;
      let totalQuantity = 0;
      let addEntryCount = 0;
      let hasPosition = false;
      let entryPrice = 0;
      let positionType: 'long' | 'short' = 'long'; // 포지션 타입
      const addEntryQuantity = sizeNum * SIZE_TO_XRP;
      const triggerPercent = parseFloat(addEntryTrigger);
      const takeProfit = parseFloat(takeProfitPercent);
      const chartPoints: ChartDataPoint[] = [];
      const addEntries: AddEntryRecord[] = [];
      const takeProfits: TakeProfitRecord[] = [];
      let isLiquidated = false;
      let finalState: SimulationState | null = null;
      
      const firstData = data[0];
      let currentState: SimulationState = {
        currentPrice: parseFloat(firstData.open),
        entryPrice: parseFloat(firstData.open),
        averageEntryPrice: parseFloat(firstData.open),
        quantity: 0,
        totalQuantity: 0,
        leverage: LEVERAGE,
        margin: 0,
        positionValue: 0,
        pnl: 0,
        pnlPercent: 0,
        currentTime: firstData.open_time,
        liquidationPrice: 0,
        balance: balanceNum,
        addEntryCount: 0,
        hasPosition: false,
        positionType: 'long',
      };
      
      // 모든 데이터 순회하며 계산
      for (let i = 0; i < data.length; i++) {
        const currentData = data[i];
        const currentPrice = parseFloat(currentData.close);
        const currentTime = currentData.open_time;
        
        // signals 기반 진입 체크
        if (!hasPosition) {
          const matchingSignal = signals.find((signal: SignalData) => {
            const signalTime = new Date(signal.created_at).getTime();
            // 정확히 같은 분에 매칭 (분 단위로 내림하여 비교)
            const signalMinuteStart = Math.floor(signalTime / 60000) * 60000;
            const currentMinuteStart = Math.floor(currentTime / 60000) * 60000;
            return signalMinuteStart === currentMinuteStart;
          });
          
          if (matchingSignal) {
            hasPosition = true;
            averageEntryPrice = currentPrice;
            totalQuantity = addEntryQuantity;
            addEntryCount = 0;
            entryPrice = currentPrice;
            positionType = matchingSignal.signal === 'buy' ? 'long' : 'short';
          }
        }
        
        // 포지션이 있을 때만 계산
        if (hasPosition) {
          // PnL 계산 (포지션 타입에 따라)
          const priceDiff = positionType === 'long' 
            ? (currentPrice - averageEntryPrice)
            : (averageEntryPrice - currentPrice);
          const pnl = priceDiff * totalQuantity * LEVERAGE;
          const pnlPercent = (priceDiff / averageEntryPrice) * 100 * LEVERAGE;
          
          const liquidationPriceBefore = currentState.liquidationPrice;
          const pnlPercentBefore = pnlPercent;
          
          // 물타기 체크
          if (pnlPercent <= -triggerPercent && addEntryCount === currentState.addEntryCount) {
            totalQuantity = totalQuantity + addEntryQuantity;
            averageEntryPrice = (averageEntryPrice * currentState.totalQuantity + currentPrice * addEntryQuantity) / totalQuantity;
            addEntryCount = addEntryCount + 1;
            
            const newPriceDiff = positionType === 'long'
              ? (currentPrice - averageEntryPrice)
              : (averageEntryPrice - currentPrice);
            const newPnLPercent = (newPriceDiff / averageEntryPrice) * 100 * LEVERAGE;
            const liquidationPrice = calculateLiquidationPrice(averageEntryPrice, totalQuantity, balanceNum, LEVERAGE, positionType);
            
            addEntries.push({
              time: currentTime,
              price: currentPrice,
              quantity: addEntryQuantity,
              averageEntryPrice: averageEntryPrice,
              totalQuantity: totalQuantity,
              pnlPercentBefore: pnlPercentBefore,
              pnlPercentAfter: newPnLPercent,
              liquidationPriceBefore: liquidationPriceBefore,
              liquidationPriceAfter: liquidationPrice,
              order: addEntryCount,
            });
          }
          
          // 익절 체크
          if (pnlPercent >= takeProfit) {
            hasPosition = false;
            
            takeProfits.push({
              time: currentTime,
              price: currentPrice,
              entryPrice: averageEntryPrice,
              pnl: pnl,
              pnlPercent: pnlPercent,
              quantity: totalQuantity,
              positionType: positionType,
            });
            
            totalQuantity = 0;
            averageEntryPrice = currentPrice;
            addEntryCount = 0;
          }
          
          const positionValue = currentPrice * totalQuantity;
          const margin = positionValue / LEVERAGE;
          const liquidationPrice = hasPosition && totalQuantity > 0
            ? calculateLiquidationPrice(averageEntryPrice, totalQuantity, balanceNum, LEVERAGE, positionType)
            : 0;
          
          // 청산 체크 (포지션 타입에 따라)
          const isLiquidatedNow = hasPosition && totalQuantity > 0 && (
            (positionType === 'long' && currentPrice <= liquidationPrice) ||
            (positionType === 'short' && currentPrice >= liquidationPrice)
          );
          if (isLiquidatedNow) {
            isLiquidated = true;
            hasPosition = false;
          }
          
          const finalPriceDiff = positionType === 'long'
            ? (currentPrice - averageEntryPrice)
            : (averageEntryPrice - currentPrice);
          const finalPnl = finalPriceDiff * totalQuantity * LEVERAGE;
          const finalPnLPercent = (finalPriceDiff / averageEntryPrice) * 100 * LEVERAGE;
          const finalPositionValue = currentPrice * totalQuantity;
          const finalMargin = finalPositionValue / LEVERAGE;
          
          currentState = {
            currentPrice: currentPrice,
            entryPrice: entryPrice,
            averageEntryPrice: averageEntryPrice,
            quantity: addEntryQuantity,
            totalQuantity: totalQuantity,
            leverage: LEVERAGE,
            margin: finalMargin,
            positionValue: finalPositionValue,
            pnl: finalPnl,
            pnlPercent: finalPnLPercent,
            currentTime: currentTime,
            liquidationPrice: liquidationPrice,
            balance: balanceNum,
            addEntryCount: addEntryCount,
            hasPosition: hasPosition,
            positionType: positionType,
          };
          
          chartPoints.push({
            time: formatTimestamp(currentTime),
            price: currentPrice,
            entryPrice: hasPosition ? averageEntryPrice : currentPrice,
            liquidationPrice: liquidationPrice,
            pnl: finalPnl,
            margin: finalMargin,
            positionValue: finalPositionValue,
          });
        } else {
          currentState = {
            currentPrice: currentPrice,
            entryPrice: currentPrice,
            averageEntryPrice: currentPrice,
            quantity: 0,
            totalQuantity: 0,
            leverage: LEVERAGE,
            margin: 0,
            positionValue: 0,
            pnl: 0,
            pnlPercent: 0,
            currentTime: currentTime,
            liquidationPrice: 0,
            balance: balanceNum,
            addEntryCount: 0,
            hasPosition: false,
            positionType: 'long',
          };
          
          chartPoints.push({
            time: formatTimestamp(currentTime),
            price: currentPrice,
            entryPrice: currentPrice,
            liquidationPrice: 0,
            pnl: 0,
            margin: 0,
            positionValue: 0,
          });
        }
        
        if (isLiquidated) break;
      }
      
      finalState = currentState;
      
      // 결과 설정
      setSimulationData(data);
      setSignalsData(signals);
      setCurrentIndex(data.length - 1);
      setChartData(chartPoints);
      setSimulationState(finalState);
      setAddEntryRecords(addEntries);
      setTakeProfitRecords(takeProfits);
      setIsLiquidated(isLiquidated);
      setIsRunning(false);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setShowResultsOnly(false);
    }
  };

  useEffect(() => {
    if (isRunning && simulationData.length > 0 && currentIndex < simulationData.length) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          const nextIndex = prev + 1;
          if (nextIndex >= simulationData.length) {
            setIsRunning(false);
            return prev;
          }

          const currentData = simulationData[nextIndex];
          const currentPrice = parseFloat(currentData.close);
          const currentTime = currentData.open_time;
          const sizeNum = parseFloat(size);
          const addEntryQuantity = sizeNum * SIZE_TO_XRP; // 물타기 수량
          const balanceNum = parseFloat(balance);
          const triggerPercent = parseFloat(addEntryTrigger);
          const takeProfit = parseFloat(takeProfitPercent);
          
          // 이전 상태 가져오기
          setSimulationState((prevState) => {
            if (!prevState) return prevState;
            
            let averageEntryPrice = prevState.averageEntryPrice;
            let totalQuantity = prevState.totalQuantity;
            let addEntryCount = prevState.addEntryCount;
            let hasPosition = prevState.hasPosition;
            let positionType: 'long' | 'short' = prevState.positionType; // 포지션 타입
            let shouldAddEntry = false; // 물타기 발생 플래그
            let shouldTakeProfit = false; // 익절 발생 플래그
            
            // signals 기반 진입 체크 (포지션이 없을 때만)
            if (!hasPosition) {
              // 현재 시간과 정확히 같은 분의 signal이 있는지 확인
              const matchingSignal = signalsData.find((signal) => {
                const signalTime = new Date(signal.created_at).getTime();
                // 정확히 같은 분에 매칭 (분 단위로 내림하여 비교)
                // currentTime은 밀리초 단위, signalTime도 밀리초 단위
                const signalMinuteStart = Math.floor(signalTime / 60000) * 60000;
                const currentMinuteStart = Math.floor(currentTime / 60000) * 60000;
                return signalMinuteStart === currentMinuteStart;
              });
              
              if (matchingSignal) {
                // 진입 실행
                hasPosition = true;
                averageEntryPrice = currentPrice;
                totalQuantity = addEntryQuantity;
                addEntryCount = 0; // 첫 진입
                positionType = matchingSignal.signal === 'buy' ? 'long' : 'short';
                
                // 첫 진입 시 entryPrice 설정
                if (prevState.totalQuantity === 0) {
                  // 첫 진입이므로 entryPrice도 설정
                }
              }
            }
            
            // 포지션이 있을 때만 계산
            if (hasPosition) {
              // PnL 계산 (포지션 타입에 따라)
              const priceDiff = positionType === 'long'
                ? (currentPrice - averageEntryPrice)
                : (averageEntryPrice - currentPrice);
              const pnl = priceDiff * totalQuantity * LEVERAGE;
              const pnlPercent = (priceDiff / averageEntryPrice) * 100 * LEVERAGE;
              
              // 진입 전 청산가 저장
              const liquidationPriceBefore = prevState.liquidationPrice;
              const pnlPercentBefore = pnlPercent;
              
              // 물타기 트리거 도달 확인 (음수로 도달했는지, 포지션 보유 중일 때만)
              if (pnlPercent <= -triggerPercent && addEntryCount === prevState.addEntryCount && hasPosition) {
                // 물타기 실행: 평균단가 재계산
                totalQuantity = totalQuantity + addEntryQuantity;
                averageEntryPrice = (averageEntryPrice * prevState.totalQuantity + currentPrice * addEntryQuantity) / totalQuantity;
                addEntryCount = addEntryCount + 1;
                shouldAddEntry = true;
                
                // 물타기 후 PnL 재계산 (포지션 타입에 따라)
                const newPriceDiff = positionType === 'long'
                  ? (currentPrice - averageEntryPrice)
                  : (averageEntryPrice - currentPrice);
                const newPnL = newPriceDiff * totalQuantity * LEVERAGE;
                const newPnLPercent = (newPriceDiff / averageEntryPrice) * 100 * LEVERAGE;
                
                // 물타기 내역 저장
                const addEntryRecord: AddEntryRecord = {
                  time: currentTime,
                  price: currentPrice,
                  quantity: addEntryQuantity,
                  averageEntryPrice: averageEntryPrice,
                  totalQuantity: totalQuantity,
                  pnlPercentBefore: pnlPercentBefore,
                  pnlPercentAfter: newPnLPercent,
                  liquidationPriceBefore: liquidationPriceBefore,
                  liquidationPriceAfter: 0, // 아래에서 계산됨
                  order: addEntryCount,
                };
                
                setTimeout(() => {
                  setAddEntryRecords((prev) => {
                    const isDuplicate = prev.some(
                      (r) => r.time === addEntryRecord.time && r.order === addEntryRecord.order
                    );
                    if (isDuplicate) return prev;
                    return [...prev, addEntryRecord];
                  });
                }, 0);
              }
              
              // 익절 체크
              if (pnlPercent >= takeProfit) {
                shouldTakeProfit = true;
                hasPosition = false; // 포지션 청산
                
                // 익절 내역 저장
                const takeProfitRecord: TakeProfitRecord = {
                  time: currentTime,
                  price: currentPrice,
                  entryPrice: averageEntryPrice,
                  pnl: pnl,
                  pnlPercent: pnlPercent,
                  quantity: totalQuantity,
                  positionType: positionType,
                };
                
                setTimeout(() => {
                  setTakeProfitRecords((prev) => {
                    const isDuplicate = prev.some(
                      (r) => r.time === takeProfitRecord.time
                    );
                    if (isDuplicate) return prev;
                    return [...prev, takeProfitRecord];
                  });
                }, 0);
                
                // 포지션 청산 후 초기화
                totalQuantity = 0;
                averageEntryPrice = currentPrice;
                addEntryCount = 0;
              }
              
              const positionValue = currentPrice * totalQuantity;
              const margin = positionValue / LEVERAGE;
              
              // 청산가 재계산 (포지션 타입에 따라)
              const liquidationPrice = hasPosition && totalQuantity > 0
                ? calculateLiquidationPrice(averageEntryPrice, totalQuantity, balanceNum, LEVERAGE, positionType)
                : 0;
              
              // 물타기 내역 저장 (청산가 업데이트)
              if (shouldAddEntry) {
                // 물타기 후 PnL 재계산 (포지션 타입에 따라)
                const newPriceDiff = positionType === 'long'
                  ? (currentPrice - averageEntryPrice)
                  : (averageEntryPrice - currentPrice);
                const newPnLPercent = (newPriceDiff / averageEntryPrice) * 100 * LEVERAGE;
                
                const addEntryRecord: AddEntryRecord = {
                  time: currentTime,
                  price: currentPrice,
                  quantity: addEntryQuantity,
                  averageEntryPrice: averageEntryPrice,
                  totalQuantity: totalQuantity,
                  pnlPercentBefore: pnlPercentBefore,
                  pnlPercentAfter: newPnLPercent,
                  liquidationPriceBefore: liquidationPriceBefore,
                  liquidationPriceAfter: liquidationPrice,
                  order: addEntryCount,
                };
                
                setTimeout(() => {
                  setAddEntryRecords((prev) => {
                    const isDuplicate = prev.some(
                      (r) => r.time === addEntryRecord.time && r.order === addEntryRecord.order
                    );
                    if (isDuplicate) return prev;
                    return [...prev, addEntryRecord];
                  });
                }, 0);
              }
              
              // 청산 체크 (포지션 타입에 따라)
              const isLiquidatedNow = hasPosition && totalQuantity > 0 && (
                (positionType === 'long' && currentPrice <= liquidationPrice) ||
                (positionType === 'short' && currentPrice >= liquidationPrice)
              );
              
              // 최종 PnL 계산 (포지션 타입에 따라)
              const finalPriceDiff = positionType === 'long'
                ? (currentPrice - averageEntryPrice)
                : (averageEntryPrice - currentPrice);
              const finalPnl = finalPriceDiff * totalQuantity * LEVERAGE;
              const finalPnLPercent = (finalPriceDiff / averageEntryPrice) * 100 * LEVERAGE;
              
              const newState: SimulationState = {
                currentPrice: currentPrice,
                entryPrice: prevState.entryPrice, // 첫 진입 가격 유지
                averageEntryPrice: averageEntryPrice,
                quantity: addEntryQuantity,
                totalQuantity: totalQuantity,
                leverage: LEVERAGE,
                margin: margin,
                positionValue: positionValue,
                pnl: finalPnl,
                pnlPercent: finalPnLPercent,
                currentTime: currentTime,
                liquidationPrice: liquidationPrice,
                balance: balanceNum,
                addEntryCount: addEntryCount,
                hasPosition: hasPosition,
                positionType: positionType as 'long' | 'short',
              };
              
              // Add data point to chart
              const chartPoint: ChartDataPoint = {
                time: formatTimestamp(currentTime),
                price: currentPrice,
                entryPrice: hasPosition ? averageEntryPrice : currentPrice,
                liquidationPrice: liquidationPrice,
                pnl: pnl,
                margin: margin,
                positionValue: positionValue,
              };
              
              setChartData((prev) => [...prev, chartPoint]);
              
              // 청산 발생 시 시뮬레이션 일시정지
              if (isLiquidatedNow) {
                setIsLiquidated(true);
                setIsRunning(false);
                if (intervalRef.current) {
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
              }
              
              return newState;
            } else {
              // 포지션이 없을 때
              const newState = {
                currentPrice: currentPrice,
                entryPrice: currentPrice,
                averageEntryPrice: currentPrice,
                quantity: 0,
                totalQuantity: 0,
                leverage: LEVERAGE,
                margin: 0,
                positionValue: 0,
                pnl: 0,
                pnlPercent: 0,
                currentTime: currentTime,
                liquidationPrice: 0,
                balance: balanceNum,
                addEntryCount: 0,
                hasPosition: false,
                positionType: 'long',
              };
              
              // Add data point to chart
              const chartPoint: ChartDataPoint = {
                time: formatTimestamp(currentTime),
                price: currentPrice,
                entryPrice: currentPrice,
                liquidationPrice: 0,
                pnl: 0,
                margin: 0,
                positionValue: 0,
              };
              
              setChartData((prev) => [...prev, chartPoint]);
              
              return newState;
            }
          });

          return nextIndex;
        });
      }, 100 / speed);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [isRunning, simulationData, signalsData, currentIndex, size, balance, speed, addEntryTrigger, takeProfitPercent]);

  const formatNumber = (num: number, decimals: number = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  // 클라이언트 마운트 전에는 기본 UI만 렌더링
  if (!mounted) {
    return (
      <main className="flex min-h-screen flex-col items-center p-8 bg-gray-900 text-white">
        <div className="w-full max-w-6xl">
          <h1 className="text-4xl font-bold mb-8 text-center">XRP Futures Backtester</h1>
          <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
            <div className="text-center text-gray-400">로딩 중...</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-8 bg-gray-900 text-white">
      <div className="w-full max-w-6xl">
        <h1 className="text-4xl font-bold mb-8 text-center">XRP Futures Backtester</h1>

        {/* Input Form */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4">시뮬레이션 설정</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">진입 시점</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isRunning}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">마감 시점</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isRunning}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">사이즈 (1 size = 10 XRP)</label>
              <input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isRunning}
                min="0"
                step="0.1"
              />
              <div className="text-xs text-gray-400 mt-1">
                = {parseFloat(size) * SIZE_TO_XRP || 0} XRP
              </div>
              <div className="text-xs text-gray-500 mt-1">
                signals 테이블의 buy 신호에 따라 자동 진입
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">시드 (잔고) - USD</label>
              <input
                type="number"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isRunning}
                min="0"
                step="0.01"
              />
              <div className="text-xs text-gray-400 mt-1">
                마진 모드: 교차 마진 (Cross Margin)
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">물타기 트리거 (%)</label>
              <input
                type="number"
                value={addEntryTrigger}
                onChange={(e) => setAddEntryTrigger(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isRunning}
                min="0"
                step="1"
              />
              <div className="text-xs text-gray-400 mt-1">
                PnL%가 -{addEntryTrigger}% 도달 시 같은 사이즈만큼 추가 진입
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">익절 (%)</label>
              <input
                type="number"
                value={takeProfitPercent}
                onChange={(e) => setTakeProfitPercent(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isRunning}
                min="0"
                step="0.1"
              />
              <div className="text-xs text-gray-400 mt-1">
                PnL%가 {takeProfitPercent}% 도달 시 익절
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={startSimulation}
              disabled={isRunning || showResultsOnly}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              시뮬레이션 시작
            </button>
            <button
              onClick={runSimulationInstant}
              disabled={isRunning || showResultsOnly}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              결과만 보기
            </button>
            <button
              onClick={stopSimulation}
              disabled={!isRunning}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              일시정지
            </button>
            <button
              onClick={resetSimulation}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium transition-colors"
            >
              리셋
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {/* 데이터 로드 정보 */}
          {simulationData.length > 0 && (
            <div className="mt-4 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-gray-400">로드된 캔들 수:</span>{' '}
                  <span className="text-blue-400 font-semibold">{simulationData.length.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-400">로드된 시그널 수:</span>{' '}
                  <span className="text-green-400 font-semibold">{signalsData.length.toLocaleString()}</span>
                </div>
                {simulationData.length > 0 && (
                  <div className="text-gray-400">
                    <span>기간: </span>
                    <span className="text-white">
                      {formatTimestamp(simulationData[0].open_time)} ~ {formatTimestamp(simulationData[simulationData.length - 1].open_time)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Simulation Display */}
        {simulationState && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">시뮬레이션 진행 상황</h2>
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <div>
                  <span className="text-gray-500">캔들 수:</span>{' '}
                  <span className="text-blue-400 font-semibold">{simulationData.length.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-500">시그널 수:</span>{' '}
                  <span className="text-green-400 font-semibold">{signalsData.length.toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            {/* 청산 알림 */}
            {isLiquidated && (
              <div className="mb-4 p-4 bg-red-900/70 border-2 border-red-500 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="text-2xl">⚠️</div>
                  <div>
                    <div className="text-xl font-bold text-red-400 mb-1">청산 발생!</div>
                    <div className="text-sm text-red-200">
                      {formatTimestamp(simulationState.currentTime)}에 청산되었습니다.
                      <br />
                      현재 가격: ${formatNumber(simulationState.currentPrice, 4)} | 청산가: ${formatNumber(simulationState.liquidationPrice, 4)}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">
                  {showResultsOnly ? (
                    <span className="text-green-400 font-medium">결과만 보기 모드 - 계산 완료</span>
                  ) : (
                    <>진행률: {currentIndex + 1} / {simulationData.length} ({((currentIndex + 1) / simulationData.length * 100).toFixed(1)}%)</>
                  )}
                </div>
                {!showResultsOnly && (
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-400">속도:</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSpeed(Math.max(0.1, speed - 0.5))}
                        disabled={isRunning && isLiquidated}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm transition-colors"
                      >
                        -
                      </button>
                      <span className="text-sm font-medium text-white min-w-[50px] text-center">
                        {speed.toFixed(1)}x
                      </span>
                      <button
                        onClick={() => setSpeed(Math.min(10, speed + 0.5))}
                        disabled={isRunning && isLiquidated}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
                {!showResultsOnly && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSpeed(0.5)}
                      disabled={isRunning && isLiquidated}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        speed === 0.5
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      0.5x
                    </button>
                    <button
                      onClick={() => setSpeed(1)}
                      disabled={isRunning && isLiquidated}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        speed === 1
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      1x
                    </button>
                    <button
                      onClick={() => setSpeed(2)}
                      disabled={isRunning && isLiquidated}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        speed === 2
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      2x
                    </button>
                    <button
                      onClick={() => setSpeed(5)}
                      disabled={isRunning && isLiquidated}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        speed === 5
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      5x
                    </button>
                  </div>
                )}
              </div>
              {!showResultsOnly && (
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-100"
                    style={{ width: `${((currentIndex + 1) / simulationData.length) * 100}%` }}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">현재 시간</div>
                <div className="text-lg font-semibold">{formatTimestamp(simulationState.currentTime)}</div>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">현재 가격</div>
                <div className="text-lg font-semibold">${formatNumber(simulationState.currentPrice, 4)}</div>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">첫 진입 가격</div>
                <div className="text-lg font-semibold">${formatNumber(simulationState.entryPrice, 4)}</div>
              </div>
              
              <div className="bg-blue-900/50 rounded-lg p-4 border border-blue-700">
                <div className="text-sm text-gray-400 mb-1">평균 진입가</div>
                <div className="text-lg font-semibold text-blue-400">${formatNumber(simulationState.averageEntryPrice, 4)}</div>
                {simulationState.addEntryCount > 0 && (
                  <div className="text-xs text-blue-300 mt-1">
                    물타기 {simulationState.addEntryCount}회
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className={`rounded-lg p-4 ${simulationState.hasPosition ? 'bg-green-900/50' : 'bg-gray-700'}`}>
                <div className="text-sm text-gray-400 mb-1">포지션 상태</div>
                <div className={`text-lg font-semibold ${simulationState.hasPosition ? 'text-green-400' : 'text-gray-400'}`}>
                  {simulationState.hasPosition ? '보유 중 (롱)' : '보유 없음'}
                </div>
              </div>

              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">레버리지</div>
                <div className="text-lg font-semibold">{simulationState.leverage}x</div>
              </div>

              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">잔고 (시드)</div>
                <div className="text-lg font-semibold">${formatNumber(simulationState.balance, 2)}</div>
              </div>

              {simulationState.hasPosition && simulationState.liquidationPrice > 0 && (
                <div className={`rounded-lg p-4 ${
                  simulationState.currentPrice <= simulationState.liquidationPrice
                    ? 'bg-red-900/70 border-2 border-red-500'
                    : 'bg-orange-900/50'
                }`}>
                  <div className="text-sm text-gray-400 mb-1">청산가</div>
                  <div className={`text-lg font-semibold ${
                    simulationState.currentPrice <= simulationState.liquidationPrice
                      ? 'text-red-400'
                      : 'text-orange-400'
                  }`}>
                    ${formatNumber(simulationState.liquidationPrice, 4)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    현재가 대비: {((simulationState.currentPrice - simulationState.liquidationPrice) / simulationState.liquidationPrice * 100).toFixed(2)}%
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">Margin</div>
                <div className="text-2xl font-bold">${formatNumber(simulationState.margin, 2)}</div>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">Position Value</div>
                <div className="text-2xl font-bold">${formatNumber(simulationState.positionValue, 2)}</div>
      </div>

              <div className={`rounded-lg p-4 ${simulationState.pnl >= 0 ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
                <div className="text-sm text-gray-400 mb-1">PnL</div>
                <div className={`text-2xl font-bold ${simulationState.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {simulationState.pnl >= 0 ? '+' : ''}${formatNumber(simulationState.pnl, 2)}
                </div>
                <div className={`text-sm mt-1 ${simulationState.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ({simulationState.pnlPercent >= 0 ? '+' : ''}{formatNumber(simulationState.pnlPercent, 2)}%)
                </div>
              </div>
            </div>

            <div className="bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-2">거래 정보</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div>사이즈: {formatNumber(parseFloat(size), 2)} ({formatNumber(simulationState.quantity, 2)} XRP)</div>
                <div>총 수량: {formatNumber(simulationState.totalQuantity, 2)} XRP</div>
                <div>포지션: {simulationState.hasPosition ? '보유 중 (롱)' : '보유 없음'}</div>
                <div>진입 시점: {formatTimestamp(simulationData[0]?.open_time || 0)}</div>
                {simulationState.addEntryCount > 0 && (
                  <div className="col-span-2 md:col-span-4 text-blue-400">
                    물타기 {simulationState.addEntryCount}회 실행됨 (트리거: -{addEntryTrigger}%)
                  </div>
                )}
                {takeProfitRecords.length > 0 && (
                  <div className="col-span-2 md:col-span-4 text-green-400">
                    익절 {takeProfitRecords.length}회 실행됨 (익절: {takeProfitPercent}%)
                  </div>
                )}
              </div>
            </div>

            {/* 물타기 진입 내역 */}
            {addEntryRecords.length > 0 && (
              <div className="bg-gray-700 rounded-lg p-4 mt-6">
                <h3 className="text-lg font-semibold mb-4">물타기 진입 내역</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-600">
                        <th className="text-left py-2 px-3 text-gray-400">순서</th>
                        <th className="text-left py-2 px-3 text-gray-400">진입 시간</th>
                        <th className="text-right py-2 px-3 text-gray-400">진입 가격</th>
                        <th className="text-right py-2 px-3 text-gray-400">진입 수량</th>
                        <th className="text-right py-2 px-3 text-gray-400">진입 시 평균단가</th>
                        <th className="text-right py-2 px-3 text-gray-400">진입 후 총 수량</th>
                        <th className="text-right py-2 px-3 text-gray-400">진입 전 PnL%</th>
                        <th className="text-right py-2 px-3 text-gray-400">진입 후 PnL%</th>
                        <th className="text-right py-2 px-3 text-gray-400">진입 전 청산가</th>
                        <th className="text-right py-2 px-3 text-gray-400">진입 후 청산가</th>
                      </tr>
                    </thead>
                    <tbody>
                      {addEntryRecords.map((record, index) => (
                        <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="py-2 px-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold">
                              {record.order}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-300">
                            {formatTimestamp(record.time)}
                          </td>
                          <td className="py-2 px-3 text-right text-white font-medium">
                            ${formatNumber(record.price, 4)}
                          </td>
                          <td className="py-2 px-3 text-right text-blue-400">
                            {formatNumber(record.quantity, 2)} XRP
                          </td>
                          <td className="py-2 px-3 text-right text-green-400 font-medium">
                            ${formatNumber(record.averageEntryPrice, 4)}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-300">
                            {formatNumber(record.totalQuantity, 2)} XRP
                          </td>
                          <td className={`py-2 px-3 text-right font-medium ${
                            record.pnlPercentBefore >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {record.pnlPercentBefore >= 0 ? '+' : ''}{formatNumber(record.pnlPercentBefore, 2)}%
                          </td>
                          <td className={`py-2 px-3 text-right font-medium ${
                            record.pnlPercentAfter >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {record.pnlPercentAfter >= 0 ? '+' : ''}{formatNumber(record.pnlPercentAfter, 2)}%
                          </td>
                          <td className="py-2 px-3 text-right text-orange-400">
                            ${formatNumber(record.liquidationPriceBefore, 4)}
                          </td>
                          <td className="py-2 px-3 text-right text-orange-400 font-medium">
                            ${formatNumber(record.liquidationPriceAfter, 4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 익절 내역 */}
            {takeProfitRecords.length > 0 && (
              <div className="bg-gray-700 rounded-lg p-4 mt-6">
                <h3 className="text-lg font-semibold mb-4">익절 내역</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-600">
                        <th className="text-left py-2 px-3 text-gray-400">순서</th>
                        <th className="text-left py-2 px-3 text-gray-400">익절 시간</th>
                        <th className="text-center py-2 px-3 text-gray-400">포지션</th>
                        <th className="text-right py-2 px-3 text-gray-400">익절 가격</th>
                        <th className="text-right py-2 px-3 text-gray-400">진입 가격</th>
                        <th className="text-right py-2 px-3 text-gray-400">익절 수량</th>
                        <th className="text-right py-2 px-3 text-gray-400">PnL</th>
                        <th className="text-right py-2 px-3 text-gray-400">PnL%</th>
                        <th className="text-right py-2 px-3 text-gray-400">누적 PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {takeProfitRecords.map((record, index) => {
                        // 누적 PnL 계산
                        const cumulativePnl = takeProfitRecords
                          .slice(0, index + 1)
                          .reduce((sum, r) => sum + r.pnl, 0);
                        
                        return (
                          <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/50">
                            <td className="py-2 px-3">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-xs font-semibold">
                                {index + 1}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-gray-300">
                              {formatTimestamp(record.time)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                                record.positionType === 'long' 
                                  ? 'bg-blue-600/30 text-blue-400 border border-blue-500' 
                                  : 'bg-red-600/30 text-red-400 border border-red-500'
                              }`}>
                                {record.positionType === 'long' ? '롱' : '숏'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-green-400 font-medium">
                              ${formatNumber(record.price, 4)}
                            </td>
                            <td className="py-2 px-3 text-right text-white">
                              ${formatNumber(record.entryPrice, 4)}
                            </td>
                            <td className="py-2 px-3 text-right text-blue-400">
                              {formatNumber(record.quantity, 2)} XRP
                            </td>
                            <td className={`py-2 px-3 text-right font-medium ${
                              record.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {record.pnl >= 0 ? '+' : ''}${formatNumber(record.pnl, 2)}
                            </td>
                            <td className={`py-2 px-3 text-right font-medium ${
                              record.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {record.pnlPercent >= 0 ? '+' : ''}{formatNumber(record.pnlPercent, 2)}%
                            </td>
                            <td className={`py-2 px-3 text-right font-semibold ${
                              cumulativePnl >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {cumulativePnl >= 0 ? '+' : ''}${formatNumber(cumulativePnl, 2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-500 bg-gray-800/50">
                        <td colSpan={7} className="py-3 px-3 text-right font-semibold text-gray-300">
                          총합:
                        </td>
                        <td className={`py-3 px-3 text-right font-bold text-lg ${
                          takeProfitRecords.reduce((sum, r) => sum + r.pnl, 0) >= 0 
                            ? 'text-green-400' 
                            : 'text-red-400'
                        }`}>
                          {takeProfitRecords.reduce((sum, r) => sum + r.pnl, 0) >= 0 ? '+' : ''}
                          ${formatNumber(takeProfitRecords.reduce((sum, r) => sum + r.pnl, 0), 2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Charts */}
            {chartData.length > 0 && (
              <div className="mt-6 space-y-6">
                {/* Price Chart */}
                <div className="bg-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-4">가격 차트</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="time" 
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1F2937', 
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#F3F4F6'
                        }}
                        labelStyle={{ color: '#9CA3AF' }}
                      />
                      <Legend wrapperStyle={{ color: '#9CA3AF' }} />
                      <Line 
                        type="monotone" 
                        dataKey="price" 
                        stroke="#3B82F6" 
                        strokeWidth={2}
                        dot={false}
                        name="가격 (USD)"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="entryPrice" 
                        stroke="#10B981" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        name="진입 가격"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="liquidationPrice" 
                        stroke="#EF4444" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        name="청산가"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* PnL Chart */}
                <div className="bg-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-4">PnL 차트</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="time" 
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1F2937', 
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#F3F4F6'
                        }}
                        labelStyle={{ color: '#9CA3AF' }}
                        formatter={(value: number) => [`$${formatNumber(value, 2)}`, 'PnL']}
                      />
                      <Legend wrapperStyle={{ color: '#9CA3AF' }} />
                      <ReferenceLine 
                        y={0} 
                        stroke="#9CA3AF" 
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        label={{ value: "0", position: "right", fill: "#9CA3AF", fontSize: 12 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="pnl" 
                        stroke="#EF4444" 
                        strokeWidth={2}
                        dot={false}
                        name="PnL (USD)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Margin & Position Value Chart */}
                <div className="bg-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-4">Margin & Position Value</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="time" 
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1F2937', 
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#F3F4F6'
                        }}
                        labelStyle={{ color: '#9CA3AF' }}
                        formatter={(value: number) => [`$${formatNumber(value, 2)}`, '']}
                      />
                      <Legend wrapperStyle={{ color: '#9CA3AF' }} />
                      <Line 
                        type="monotone" 
                        dataKey="margin" 
                        stroke="#F59E0B" 
                        strokeWidth={2}
                        dot={false}
                        name="Margin (USD)"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="positionValue" 
                        stroke="#8B5CF6" 
                        strokeWidth={2}
                        dot={false}
                        name="Position Value (USD)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {!simulationState && !error && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center text-gray-400">
            시뮬레이션을 시작하려면 위의 설정을 입력하고 "시뮬레이션 시작" 버튼을 클릭하세요.
        </div>
        )}
      </div>
    </main>
  );
}
