-- Create table for XRPUSDT 1m OHLCV data
CREATE TABLE IF NOT EXISTS xrpusdt_1m_ohlcv (
    open_time BIGINT NOT NULL,
    open DECIMAL(18, 8) NOT NULL,
    high DECIMAL(18, 8) NOT NULL,
    low DECIMAL(18, 8) NOT NULL,
    close DECIMAL(18, 8) NOT NULL,
    volume DECIMAL(18, 8) NOT NULL,
    close_time BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (open_time)
);

-- Create index on close_time for efficient queries
CREATE INDEX IF NOT EXISTS idx_xrpusdt_1m_close_time ON xrpusdt_1m_ohlcv(close_time);

-- Create index on created_at for audit purposes  
CREATE INDEX IF NOT EXISTS idx_xrpusdt_1m_created_at ON xrpusdt_1m_ohlcv(created_at);
