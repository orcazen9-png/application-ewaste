import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,check,primaryKey} from 'drizzle-orm/sqlite-core';
import {orders} from './market-schema';
import {files} from './account-schema';

export const operationsStaff=sqliteTable('operations_staff',{
  id:text('id').primaryKey().notNull(),subject:text('subject').notNull().unique(),email:text('email').notNull(),name:text('name').notNull(),role:text('role').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull()
},t=>[check('staff_role',sql`${t.role} IN ('operations','finance','operations_finance','viewer')`),check('staff_status',sql`${t.status} IN ('active','suspended')`)]);
export const logisticsPartners=sqliteTable('logistics_partners',{
  id:text('id').primaryKey().notNull(),name:text('name').notNull(),contact:text('contact').notNull(),areasJson:text('areas_json').notNull(),status:text('status').notNull(),version:integer('version').notNull(),updatedAt:text('updated_at').notNull()
},t=>[check('partner_status',sql`${t.status} IN ('active','unavailable')`),check('partner_version',sql`${t.version}>0`)]);
export const logisticsJobs=sqliteTable('logistics_jobs',{
  orderId:text('order_id').primaryKey().notNull().references(()=>orders.id),version:integer('version').notNull(),state:text('state').notNull(),partnerId:text('partner_id').references(()=>logisticsPartners.id),
  scheduleJson:text('schedule_json'),costJson:text('cost_json'),pickupJson:text('pickup_json'),receiptJson:text('receipt_json'),returnJson:text('return_json'),
  costVersion:integer('cost_version').notNull().default(0),costAckVersion:integer('cost_ack_version').notNull().default(0),
  acceptedBase:integer('accepted_base'),returnedBase:integer('returned_base').notNull().default(0),updatedAt:text('updated_at').notNull()
},t=>[index('logistics_state').on(t.state,t.orderId),check('logistics_state_valid',sql`${t.state} IN ('not_arranged','scheduled','picked_up','in_transit','received','return_pending','returned')`),check('logistics_numbers',sql`${t.version}>0 AND ${t.costVersion}>=0 AND ${t.costAckVersion} BETWEEN 0 AND ${t.costVersion} AND (${t.acceptedBase} IS NULL OR ${t.acceptedBase}>=0) AND ${t.returnedBase}>=0`)]);
export const logisticsRecords=sqliteTable('logistics_records',{
  id:text('id').primaryKey().notNull(),orderId:text('order_id').notNull().references(()=>orders.id),version:integer('version').notNull(),actor:text('actor').notNull(),kind:text('kind').notNull(),dataJson:text('data_json').notNull(),createdAt:text('created_at').notNull()
},t=>[index('logistics_record_order').on(t.orderId,t.version)]);
export const logisticsFiles=sqliteTable('logistics_files',{
  recordId:text('record_id').notNull().references(()=>logisticsRecords.id),fileId:text('file_id').notNull().references(()=>files.id)
},t=>[primaryKey({columns:[t.recordId,t.fileId]})]);
export const logisticsCases=sqliteTable('logistics_cases',{
  id:text('id').primaryKey().notNull(),orderId:text('order_id').notNull().references(()=>orders.id),openedBy:text('opened_by').notNull(),reason:text('reason').notNull(),state:text('state').notNull(),resolution:text('resolution'),createdAt:text('created_at').notNull(),resolvedAt:text('resolved_at')
},t=>[index('logistics_case_order').on(t.orderId,t.state),check('logistics_case_state',sql`${t.state} IN ('open','resolved')`)]);
export const logisticsCommands=sqliteTable('logistics_commands',{
  actor:text('actor').notNull(),commandId:text('command_id').notNull(),payloadHash:text('payload_hash').notNull(),resultJson:text('result_json').notNull(),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.actor,t.commandId]})]);
