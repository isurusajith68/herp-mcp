import pkg from "pg";
const { Pool } = pkg;
import { tenantConfigs } from "../utils/load-tenant-configs.js";

const { types } = pkg;
types.setTypeParser(1082, (val) => val); // return as string 'YYYY-MM-DD'
const tenantPools = new Map();

export function getTenantPool(tenant) {
  if (!tenant) {
    console.log("empty tenant");
    throw new Error("Tenant is required");
  }
  if (tenantPools.has(tenant)) {
    return tenantPools.get(tenant);
  }
  //console.log("tenantPools", tenantPools);

  const tenantConfig = tenantConfigs.get(tenant);
  if (!tenantConfig) {
    throw new Error(`Configuration not found for tenant: ${tenant}`);
  }

  const pool = new Pool({
    // Database server hostname from environment variable
    host: process.env.DB_HOST,
    // host: tenantConfig.host,

    // Database user credentials
    user: process.env.DB_USER,
    // user: tenantConfig.user,

    // Database password from environment variable
    password: process.env.DB_PASSWORD,

    database: process.env.DB_DATABASE,

    port: tenantConfig.port || 5432,

    max: 10,

    idleTimeoutMillis: 30000,

    allowExitOnIdle: true,

    keepAlive: true,

    keepAliveInitialDelayMillis: 30000,
  });

  tenantPools.set(tenant, pool);

  return pool;
}

export async function getTenantPoolById(orgId) {
  const tenant = `org_${orgId}`;

  const pool = getTenantPool(tenant);
  await pool.query(`SET search_path TO ${tenant}`);

  return pool;
}
