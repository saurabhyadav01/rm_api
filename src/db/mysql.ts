import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const pool = mysql.createPool({
  host: requiredEnv("MYSQL_HOST"),
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: requiredEnv("MYSQL_USER"),
  password: process.env.MYSQL_PASSWORD ?? "",
  database: requiredEnv("MYSQL_DATABASE"),
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

