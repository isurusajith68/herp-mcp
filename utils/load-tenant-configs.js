import { entry_db_pool } from "../db/db.js";

export const tenantConfigs = new Map();

const loadTenantConfigs = async () => {
  try {
    const { rows } = await entry_db_pool.query("SELECT * FROM organizations");
    console.log(rows, "tenants found");
    console.log("Loading tenant configurations...");

    rows.forEach((row) => {
      tenantConfigs.set(row.schemaname, {
        host: row.host,
        user: row.dbuser,
        password: row.dbpassword,
        databasename: row.databasename,
        schemaname: row.schemaname,
        id: row.id,
      });
    });
    

    console.log("Tenant configurations loaded successfully.");
  } catch (error) {
    console.error("Error loading tenant configurations:", error);
  }

  return tenantConfigs;
};

export default loadTenantConfigs;
