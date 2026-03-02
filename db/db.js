import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const { types } = pkg;
  types.setTypeParser(1082, (val) => val);


export const entry_db_pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});
