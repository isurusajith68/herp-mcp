import { entry_db_pool } from "../db/db";

export const getGmailClientForConnection = async ({ orgId, propertyId }) => {
  const connectionRes = await entry_db_pool.query(
    `SELECT *
        FROM public.google_oauth_connections
        WHERE organization_id = $1 AND property_id = $2
        LIMIT 1`,
    [orgId, propertyId],
  );
  if (!connectionRes.rows.length) {
    return null;
  }
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  client.setCredentials({
    access_token: connectionRes.access_token || undefined,
    refresh_token: connectionRes.refresh_token || undefined,
    expiry_date: connectionRes.expiry_date || undefined,
  });
  return google.gmail({ version: "v1", auth: client });
};
