const dotenv = require("dotenv");
dotenv.config();
const { Pool } = require("pg");

const pool = new Pool({
  // It's a good practice to have fallback values
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABSE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

pool.on("connect", () => {
  console.log("Connected to Local DB");
});

pool.on("error", (err) => {
  console.log("Connection to Supabase PG failed", err);
});

module.exports = pool;
