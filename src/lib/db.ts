import mysql, { Pool, PoolConnection } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var __mysqlPool: Pool | undefined;
}

function createPool(): Pool {
  return mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "district_collector_dashboard",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
  });
}

// Reuse the pool across hot-reloads in dev and across route invocations.
const pool: Pool = global.__mysqlPool || createPool();
if (process.env.NODE_ENV !== "production") {
  global.__mysqlPool = pool;
}

export default pool;

/** Run a set of queries inside a transaction. */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
