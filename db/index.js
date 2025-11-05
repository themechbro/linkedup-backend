const { Pool } = require("pg");
const dotenv = require("dotenv");
dotenv.config();

const pool = new Pool({
  // It's a good practice to have fallback values
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABSE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on("connect", () => {
  console.log("Connected to Supabase PG");
});

pool.on("error", (err) => {
  console.log("Connection to Supabase PG failed", err);
});

module.exports = pool;
