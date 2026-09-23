import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export * from './account-schema';
export * from './market-schema';
export * from './logistics-schema';
export * from './finance-schema';
export * from './release-schema';
export const spaces=sqliteTable('spaces',{
  id:text('id').primaryKey(),accessHash:text('access_hash').notNull().unique(),state:text('state_json').notNull(),
  version:integer('version').notNull().default(0),lastOperation:text('last_operation'),createdAt:text('created_at').notNull()
});
export const receipts=sqliteTable('operation_receipts',{
  spaceId:text('space_id').notNull().references(()=>spaces.id),operationId:text('operation_id').notNull(),
  payloadHash:text('payload_hash').notNull(),result:text('result_json').notNull()
},t=>[primaryKey({columns:[t.spaceId,t.operationId]})]);
// Photo bytes for hosts without an object store (e.g. a Cloudflare account without R2). Base64 text keeps
// reads cheap in the Worker; D1 caps a value at 2,000,000 bytes, so photos stay below 1.4 MB.
export const photos=sqliteTable('photos',{
  key:text('key').primaryKey(),contentType:text('content_type').notNull(),data:text('data_base64').notNull()
});
