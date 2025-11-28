-- Create signal table
CREATE TABLE IF NOT EXISTS signals (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    signal VARCHAR(10) NOT NULL CHECK (signal IN ('buy', 'sell')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE(symbol, created_at)
);

-- Create index on created_at for faster queries
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_symbol_created_at ON signals(symbol, created_at);

-- Add comment
COMMENT ON TABLE signals IS 'Trading signals for futures trading';
COMMENT ON COLUMN signals.symbol IS 'Trading pair symbol (e.g., XRPUSDT)';
COMMENT ON COLUMN signals.signal IS 'Signal type: buy or sell';
COMMENT ON COLUMN signals.created_at IS 'Signal generation timestamp';

-- Create a function to get timestamp in milliseconds (for easier querying)
CREATE OR REPLACE FUNCTION get_created_at_timestamp(ts TIMESTAMP WITH TIME ZONE)
RETURNS BIGINT AS $$
BEGIN
    RETURN EXTRACT(EPOCH FROM ts)::BIGINT * 1000;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

