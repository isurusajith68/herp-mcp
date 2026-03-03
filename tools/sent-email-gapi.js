import { z } from "zod";
import { google } from "googleapis";
import { entry_db_pool } from "../db/db.js";

const toBase64Url = (str) =>
  Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const sanitizeMailHeader = (value) =>
  String(value || "")
    .replace(/[\r\n]/g, "")
    .trim();

const encodeMimeHeaderUtf8 = (subject) => {
  const cleaned = String(subject || "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  if (/^[\x20-\x7E]*$/.test(cleaned)) return cleaned;
  return `=?UTF-8?B?${Buffer.from(cleaned, "utf8").toString("base64")}?=`;
};

const getGmailClientForConnection = async ({ orgId, propertyId }) => {
  const connectionRes = await entry_db_pool.query(
    `SELECT *
        FROM public.google_oauth_connections
        WHERE organization_id = $1 AND property_id = $2
        LIMIT 1`,
    [orgId, propertyId],
  );
  if (!connectionRes.rows.length) {
    return { gmail: null, connection: null };
  }
  const connection = connectionRes.rows[0];
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  client.setCredentials({
    access_token: connection.access_token || undefined,
    refresh_token: connection.refresh_token || undefined,
    expiry_date: connection.expiry_date || undefined,
  });
  return {
    gmail: google.gmail({ version: "v1", auth: client }),
    connection,
  };
};

export const sendEmailGapi = {
  name: "send_email",
  description:
    "Send an email using Gmail API for a specific hotel property. " +
    "Requires orgId and propertyId to identify the Gmail connection, plus to, subject, and body.",
  inputSchema: z.object({
    orgId: z.number().describe("The organization ID for the hotel"),
    propertyId: z.number().describe("The property ID for the hotel"),
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body content (can contain HTML)"),
    threadId: z.optional(z.string()).describe("Optional thread ID to reply to"),
    messageId: z
      .optional(z.string())
      .describe("Optional message ID for In-Reply-To header"),
  }),

  async execute(input) {
    const { orgId, propertyId, to, subject, body, threadId, messageId } = input;

    try {
      const { gmail, connection } = await getGmailClientForConnection({
        orgId,
        propertyId,
      });

      if (!gmail || !connection) {
        return {
          success: false,
          error: "Gmail connection not found for this property",
        };
      }

      if (!connection.access_token && !connection.refresh_token) {
        return {
          success: false,
          error: "Gmail token missing. Reconnect Google account.",
        };
      }

      const safeFromEmail = sanitizeMailHeader(
        connection.gmail_email || "unknown@gmail.com",
      );
      const safeTo = sanitizeMailHeader(to);
      const safeSubjectHeader = encodeMimeHeaderUtf8(subject);
      const safeThreadId = threadId ? sanitizeMailHeader(threadId) : null;
      const safeMessageId = messageId ? sanitizeMailHeader(messageId) : null;

      const htmlBody = String(body || "").replace(/\n/g, "<br/>");

      const headers = [
        `From: Hotel Reservations <${safeFromEmail}>`,
        `To: ${safeTo}`,
        `Subject: ${safeSubjectHeader}`,
        `Reply-To: ${safeFromEmail}`,
      ];

      if (safeMessageId) {
        const normalizedMsgId = safeMessageId.includes("<")
          ? safeMessageId
          : `<${safeMessageId}>`;
        headers.push(`In-Reply-To: ${normalizedMsgId}`);
        headers.push(`References: ${normalizedMsgId}`);
      }

      const rawMessage = [
        ...headers,
        "MIME-Version: 1.0",
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: 7bit",
        "",
        htmlBody,
      ].join("\r\n");

      const sendResult = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: toBase64Url(rawMessage),
          ...(safeThreadId ? { threadId: safeThreadId } : {}),
        },
      });

      return {
        success: true,
        messageId: sendResult?.data?.id || null,
        threadId: sendResult?.data?.threadId || null,
        message: `Email sent successfully to ${safeTo}`,
      };
    } catch (error) {
      console.error("Error sending email via Gmail API:", error);
      const reason = String(
        error?.response?.data?.error?.errors?.[0]?.reason ||
          error?.response?.data?.error?.status ||
          "",
      ).toLowerCase();

      if (reason.includes("insufficient") || reason.includes("permission")) {
        return {
          success: false,
          error:
            "Google permissions are missing (gmail.send). Reconnect Google account and try again.",
        };
      }

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to send email. Please try again later.",
      };
    }
  },
};
