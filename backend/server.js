const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const { registerUser, loginUser, verifyToken } = require('./auth');
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');
const { Parser } = require('json2csv');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  // Add your PostgreSQL connection details here
  user: 'your_username',
  host: 'localhost',
  database: 'your_database',
  password: 'your_password',
  port: 5432,
});

app.use(helmet());
app.use(cors());
app.use(bodyParser.json());

// User registration endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const userId = await registerUser(username, email, password);
    res.status(201).json({ message: 'User registered successfully', userId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// User login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const token = await loginUser(username, password);
    res.json({ token });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Protected route example
app.get('/api/protected', verifyToken, (req, res) => {
  res.json({ message: 'This is a protected route', userId: req.userId });
});

// Create account endpoint
app.post('/api/accounts', verifyToken, async (req, res) => {
  try {
    const { name, account_type, parent_id } = req.body;

    if (!name || !account_type) {
      return res.status(400).json({ error: 'Name and account type are required' });
    }

    const query = 'INSERT INTO accounts (name, account_type, parent_id) VALUES ($1, $2, $3) RETURNING id';
    const values = [name, account_type, parent_id || null];

    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Account created successfully', accountId: result.rows[0].id });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'An error occurred while creating the account' });
  }
});

// Get all accounts endpoint
app.get('/api/accounts', verifyToken, async (req, res) => {
  try {
    const query = 'SELECT * FROM accounts';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'An error occurred while fetching accounts' });
  }
});

// Get single account endpoint
app.get('/api/accounts/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'SELECT * FROM accounts WHERE id = $1';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'An error occurred while fetching the account' });
  }
});

// Update account endpoint
app.put('/api/accounts/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, account_type, parent_id } = req.body;

    if (!name || !account_type) {
      return res.status(400).json({ error: 'Name and account type are required' });
    }

    const query = 'UPDATE accounts SET name = $1, account_type = $2, parent_id = $3 WHERE id = $4 RETURNING *';
    const values = [name, account_type, parent_id || null, id];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Account updated successfully', account: result.rows[0] });
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'An error occurred while updating the account' });
  }
});

// Delete account endpoint
app.delete('/api/accounts/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM accounts WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Account deleted successfully', account: result.rows[0] });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'An error occurred while deleting the account' });
  }
});

// Transaction entry endpoint
app.post('/api/transactions', verifyToken, [
  body('date').isDate(),
  body('description').isString().notEmpty(),
  body('reference_number').isString().optional(),
  body('currency_id').isInt(),
  body('details').isArray().notEmpty(),
  body('details.*.account_id').isInt(),
  body('details.*.debit').isFloat({ min: 0 }),
  body('details.*.credit').isFloat({ min: 0 }),
  body('details.*.tax_rate_id').isInt().optional(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { date, description, reference_number, currency_id, details } = req.body;

    // Start a transaction
    await pool.query('BEGIN');

    // Insert into transactions table
    const transactionQuery = 'INSERT INTO transactions (date, description, reference_number, created_by, currency_id) VALUES ($1, $2, $3, $4, $5) RETURNING id';
    const transactionValues = [date, description, reference_number, req.userId, currency_id];
    const transactionResult = await pool.query(transactionQuery, transactionValues);
    const transactionId = transactionResult.rows[0].id;

    // Insert transaction details
    for (const detail of details) {
      const detailQuery = 'INSERT INTO transaction_details (transaction_id, account_id, debit, credit, tax_rate_id) VALUES ($1, $2, $3, $4, $5)';
      const detailValues = [transactionId, detail.account_id, detail.debit, detail.credit, detail.tax_rate_id];
      await pool.query(detailQuery, detailValues);
    }

    // Commit the transaction
    await pool.query('COMMIT');

    res.status(201).json({ message: 'Transaction created successfully', transactionId });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'An error occurred while creating the transaction' });
  }
});

// General ledger endpoint
app.get('/api/general-ledger', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT
        a.id AS account_id,
        a.name AS account_name,
        a.account_type,
        t.date,
        t.description,
        t.reference_number,
        td.debit,
        td.credit
      FROM
        accounts a
      LEFT JOIN
        transaction_details td ON a.id = td.account_id
      LEFT JOIN
        transactions t ON td.transaction_id = t.id
      ORDER BY
        a.id, t.date
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching general ledger:', error);
    res.status(500).json({ error: 'An error occurred while fetching the general ledger' });
  }
});

// Trial balance report endpoint
app.get('/api/trial-balance', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT
        a.id AS account_id,
        a.name AS account_name,
        a.account_type,
        COALESCE(SUM(td.debit), 0) AS total_debit,
        COALESCE(SUM(td.credit), 0) AS total_credit
      FROM
        accounts a
      LEFT JOIN
        transaction_details td ON a.id = td.account_id
      GROUP BY
        a.id, a.name, a.account_type
      ORDER BY
        a.account_type, a.name
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error generating trial balance:', error);
    res.status(500).json({ error: 'An error occurred while generating the trial balance' });
  }
});

// Income statement endpoint
app.get('/api/income-statement', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT
        a.id AS account_id,
        a.name AS account_name,
        a.account_type,
        COALESCE(SUM(CASE WHEN a.account_type = 'Revenue' THEN td.credit - td.debit ELSE td.debit - td.credit END), 0) AS balance
      FROM
        accounts a
      LEFT JOIN
        transaction_details td ON a.id = td.account_id
      WHERE
        a.account_type IN ('Revenue', 'Expense')
      GROUP BY
        a.id, a.name, a.account_type
      ORDER BY
        a.account_type DESC, a.name
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error generating income statement:', error);
    res.status(500).json({ error: 'An error occurred while generating the income statement' });
  }
});

// Balance sheet endpoint
app.get('/api/balance-sheet', verifyToken, async (req, res) => {
  try {
    const query = `
      SELECT
        a.id AS account_id,
        a.name AS account_name,
        a.account_type,
        COALESCE(SUM(CASE WHEN a.account_type IN ('Asset', 'Expense') THEN td.debit - td.credit ELSE td.credit - td.debit END), 0) AS balance
      FROM
        accounts a
      LEFT JOIN
        transaction_details td ON a.id = td.account_id
      WHERE
        a.account_type IN ('Asset', 'Liability', 'Equity')
      GROUP BY
        a.id, a.name, a.account_type
      ORDER BY
        a.account_type, a.name
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error generating balance sheet:', error);
    res.status(500).json({ error: 'An error occurred while generating the balance sheet' });
  }
});

// Data export endpoint
app.get('/api/export/:report', verifyToken, async (req, res) => {
  try {
    const { report } = req.params;
    let data;

    switch (report) {
      case 'trial-balance':
        data = await getTrealBalanceData();
        break;
      case 'income-statement':
        data = await getIncomeStatementData();
        break;
      case 'balance-sheet':
        data = await getBalanceSheetData();
        break;
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    const csv = parse(data);
    res.header('Content-Type', 'text/csv');
    res.attachment(`${report}.csv`);
    return res.send(csv);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'An error occurred while exporting data' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
