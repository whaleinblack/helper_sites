// Add Drizzle tables here when the site needs a database.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const weatherCache = sqliteTable('weather_cache', {
  rangeId: text('range_id').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  sourceVersion: text('source_version').notNull(),
});
