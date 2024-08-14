const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
  // Add your PostgreSQL connection details here
  user: 'your_username',
  host: 'localhost',
  database: 'your_database',
  password: 'your_password',
  port: 5432,
});

const SECRET_KEY = 'your_secret_key'; // Replace with a secure secret key

// User registration
async function registerUser(username, email, password) {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id';
    const values = [username, email, hashedPassword];
    const result = await pool.query(query, values);
    return result.rows[0].id;
  } catch (error) {
    console.error('Error registering user:', error);
    throw error;
  }
}

// User login
async function loginUser(username, password) {
  try {
    const query = 'SELECT id, password_hash FROM users WHERE username = $1';
    const result = await pool.query(query, [username]);

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    const token = jwt.sign({ userId: user.id }, SECRET_KEY, { expiresIn: '1h' });
    return token;
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
}

// Middleware for token verification
function verifyToken(req, res, next) {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).json({ error: 'No token provided' });
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.userId = decoded.userId;
    next();
  });
}

module.exports = {
  registerUser,
  loginUser,
  verifyToken
};
