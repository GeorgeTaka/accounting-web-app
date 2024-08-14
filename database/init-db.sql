-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create roles table
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- Create user_roles table for many-to-many relationship
CREATE TABLE user_roles (
    user_id INTEGER REFERENCES users(id),
    role_id INTEGER REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);

-- Create accounts table
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    parent_id INTEGER REFERENCES accounts(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create transactions table
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    description TEXT,
    reference_number VARCHAR(50),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create transaction_details table
CREATE TABLE transaction_details (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(id),
    account_id INTEGER REFERENCES accounts(id),
    debit DECIMAL(15, 2),
    credit DECIMAL(15, 2),
    CHECK (debit >= 0 AND credit >= 0)
);

-- Create recurring_transactions table
CREATE TABLE recurring_transactions (
    id SERIAL PRIMARY KEY,
    description TEXT,
    frequency VARCHAR(50) NOT NULL,
    next_date DATE NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create currencies table
CREATE TABLE currencies (
    id SERIAL PRIMARY KEY,
    code CHAR(3) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL
);

-- Add currency support to transactions
ALTER TABLE transactions ADD COLUMN currency_id INTEGER REFERENCES currencies(id);

-- Create tax_rates table
CREATE TABLE tax_rates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    rate DECIMAL(5, 2) NOT NULL
);

-- Add tax support to transaction_details
ALTER TABLE transaction_details ADD COLUMN tax_rate_id INTEGER REFERENCES tax_rates(id);

-- Insert default roles
INSERT INTO roles (name) VALUES ('admin'), ('accountant'), ('viewer');

-- Insert default currency
INSERT INTO currencies (code, name) VALUES ('USD', 'US Dollar');

-- Create indexes for performance
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transaction_details_transaction_id ON transaction_details(transaction_id);
CREATE INDEX idx_accounts_parent_id ON accounts(parent_id);
