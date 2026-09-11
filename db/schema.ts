import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const spaces=sqliteTable('spaces',{
  id:text('id').primaryKey(),accessHash:text('access_hash').notNull().unique(),state:text('state_json').notNull(),
  version:integer('version').notNull().default(0),lastOperation:text('last_operation'),createdAt:text('created_at').notNull()
});
export const receipts=sqliteTable('operation_receipts',{
  spaceId:text('space_id').notNull().references(()=>spaces.id),operationId:text('operation_id').notNull(),
  payloadHash:text('payload_hash').notNull(),result:text('result_json').notNull()
},t=>[primaryKey({columns:[t.spaceId,t.operationId]})]);
