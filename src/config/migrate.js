require('dotenv').config();
const { pool } = require('./database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- USERS (customers, stall owners, organisers)
      CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) UNIQUE NOT NULL,
  email VARCHAR(150) UNIQUE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('customer', 'stall_owner', 'organiser')),
  trust_score NUMERIC(3,2) DEFAULT 5.00,
  fcm_token TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

      -- EVENTS (carnivals, fests)
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organiser_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        location VARCHAR(300) NOT NULL,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'ended')),
        branding JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- STALLS (vendors at an event)
      CREATE TABLE IF NOT EXISTS stalls (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        owner_id UUID NOT NULL REFERENCES users(id),
        name VARCHAR(150) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- MENU ITEMS
      CREATE TABLE IF NOT EXISTS menu_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        stall_id UUID NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        tags TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ORDERS
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id UUID NOT NULL REFERENCES users(id),
        stall_id UUID NOT NULL REFERENCES stalls(id),
        event_id UUID NOT NULL REFERENCES events(id),
        order_number VARCHAR(10) NOT NULL,
        status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'preparing', 'ready', 'collected', 'cancelled')),
        total_amount NUMERIC(10,2) NOT NULL,
        payment_id VARCHAR(200),
        payment_method VARCHAR(50),
        ghost_order_token VARCHAR(500),
        collected_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ORDER ITEMS
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id UUID NOT NULL REFERENCES menu_items(id),
        quantity INT NOT NULL,
        unit_price NUMERIC(10,2) NOT NULL
      );

      -- PAYOUTS (Razorpay Route — Week 3)
      CREATE TABLE IF NOT EXISTS payouts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        stall_owner_id UUID NOT NULL REFERENCES users(id),
        event_id UUID NOT NULL REFERENCES events(id),
        amount NUMERIC(10,2) NOT NULL,
        platform_fee NUMERIC(10,2) NOT NULL,
        net_amount NUMERIC(10,2) NOT NULL,
        razorpay_payout_id VARCHAR(200),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- FRAUD EVENTS (Adit Bhaiya's Stall Shield)
      CREATE TABLE IF NOT EXISTS fraud_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        order_id UUID REFERENCES orders(id),
        event_type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high')),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- FRAUD ALERTS — high-level flags surfaced to organiser dashboard
      CREATE TABLE IF NOT EXISTS fraud_alerts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        stall_id UUID REFERENCES stalls(id),
        order_id UUID REFERENCES orders(id),
        user_id UUID REFERENCES users(id),
        risk_score INT NOT NULL,
        risk_level VARCHAR(20) NOT NULL,
        flags TEXT[] DEFAULT '{}',
        action VARCHAR(20) NOT NULL,
        alert_type VARCHAR(50) DEFAULT 'order',
        resolved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- REVENUE REPORTS — stall owner end-of-day declarations
      CREATE TABLE IF NOT EXISTS revenue_reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        stall_id UUID NOT NULL REFERENCES stalls(id),
        event_id UUID NOT NULL REFERENCES events(id),
        reported_amount NUMERIC(10,2) NOT NULL,
        system_amount NUMERIC(10,2) NOT NULL,
        discrepancy NUMERIC(10,2) GENERATED ALWAYS AS (system_amount - reported_amount) STORED,
        flagged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ML MODELS — registry of trained Isolation Forest models
      CREATE TABLE IF NOT EXISTS ml_models (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        model_date DATE NOT NULL,
        algorithm VARCHAR(100) DEFAULT 'IsolationForest',
        precision_score NUMERIC(5,4),
        recall_score NUMERIC(5,4),
        f1_score NUMERIC(5,4),
        trained_on_rows INT,
        is_active BOOLEAN DEFAULT FALSE,
        model_path TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('✅ Database migrated successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
