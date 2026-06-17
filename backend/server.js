require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const seed = require('./seed');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth',    require('./routes/auth'));
app.use('/api/tasks',   require('./routes/tasks'));
app.use('/api/options', require('./routes/options'));
app.use('/api/admin',   require('./routes/admin'));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
}

const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await seed();
  } catch (err) {
    console.error('Seed error:', err.message);
  }
  app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
})();
