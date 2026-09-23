import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,check,primaryKey} from 'drizzle-orm/sqlite-core';
import {users,facilities,lots,files} from './account-schema';

export const requirements=sqliteTable('requirements',{
  id:text('id').primaryKey().notNull(),ownerId:text('owner_id').notNull().references(()=>users.id),facilityId:text('facility_id').notNull().references(()=>facilities.id),
  broadCode:text('broad_code').notNull(),detailedCode:text('detailed_code'),title:text('title').notNull(),specification:text('specification').notNull(),unit:text('unit').notNull(),
  ratePaise:integer('rate_paise').notNull(),minimumBase:integer('minimum_base').notNull(),targetBase:integer('target_base'),areasJson:text('areas_json').notNull(),modesJson:text('modes_json').notNull(),
  validUntil:text('valid_until').notNull(),state:text('state').notNull(),version:integer('version').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('requirements_owner').on(t.ownerId,t.id),index('requirements_discovery').on(t.broadCode,t.state,t.id),
  check('requirement_state',sql`${t.state} IN ('active','paused')`),check('requirement_unit',sql`${t.unit} IN ('kg','piece')`),
  check('requirement_numbers',sql`${t.ratePaise}>0 AND ${t.minimumBase}>0 AND (${t.targetBase} IS NULL OR ${t.targetBase}>=${t.minimumBase}) AND ${t.version}>0`)]);
export const requirementRevisions=sqliteTable('requirement_revisions',{
  requirementId:text('requirement_id').notNull().references(()=>requirements.id),version:integer('version').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),snapshotJson:text('snapshot_json').notNull(),reason:text('reason').notNull(),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.requirementId,t.version]})]);
export const supplyRequests=sqliteTable('supply_requests',{
  id:text('id').primaryKey().notNull(),collectorId:text('collector_id').notNull().references(()=>users.id),recyclerId:text('recycler_id').notNull().references(()=>users.id),
  requirementId:text('requirement_id').notNull().references(()=>requirements.id),requirementVersion:integer('requirement_version').notNull(),lotId:text('lot_id').notNull().references(()=>lots.id),lotVersion:integer('lot_version').notNull(),itemId:text('item_id').notNull(),
  quantityBase:integer('quantity_base').notNull(),unit:text('unit').notNull(),mode:text('mode').notNull(),askPaise:integer('ask_paise'),snapshotJson:text('snapshot_json').notNull(),state:text('state').notNull(),version:integer('version').notNull(),expiresAt:text('expires_at').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('requests_collector').on(t.collectorId,t.id),index('requests_recycler').on(t.recyclerId,t.id),
  check('request_state',sql`${t.state} IN ('submitted','clarification','accepted','rejected','withdrawn')`),check('request_values',sql`${t.quantityBase}>0 AND ${t.version}>0 AND (${t.askPaise} IS NULL OR ${t.askPaise}>=0)`)]);
export const requestFiles=sqliteTable('request_files',{
  requestId:text('request_id').notNull().references(()=>supplyRequests.id),fileId:text('file_id').notNull().references(()=>files.id)
},t=>[primaryKey({columns:[t.requestId,t.fileId]})]);
export const orders=sqliteTable('orders',{
  id:text('id').primaryKey().notNull(),requestId:text('request_id').notNull().unique().references(()=>supplyRequests.id),collectorId:text('collector_id').notNull().references(()=>users.id),recyclerId:text('recycler_id').notNull().references(()=>users.id),facilityId:text('facility_id').notNull().references(()=>facilities.id),
  state:text('state').notNull(),version:integer('version').notNull(),materialPaise:integer('material_paise').notNull(),termsVersion:integer('terms_version').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('orders_collector').on(t.collectorId,t.id),index('orders_recycler').on(t.recyclerId,t.id),check('order_state',sql`${t.state} IN ('accepted','cancelled')`),check('order_numbers',sql`${t.materialPaise}>=0 AND ${t.version}>0 AND ${t.termsVersion}>0`)]);
export const reservations=sqliteTable('reservations',{
  orderId:text('order_id').primaryKey().notNull().references(()=>orders.id),requirementId:text('requirement_id').notNull().references(()=>requirements.id),lotId:text('lot_id').notNull().references(()=>lots.id),itemId:text('item_id').notNull(),quantityBase:integer('quantity_base').notNull(),state:text('state').notNull()
},t=>[index('reservations_demand').on(t.requirementId,t.state),index('reservations_supply').on(t.lotId,t.itemId,t.state),check('reservation_state',sql`${t.state} IN ('held','released','consumed')`),check('reservation_quantity',sql`${t.quantityBase}>0`)]);
export const orderTerms=sqliteTable('order_terms',{
  orderId:text('order_id').notNull().references(()=>orders.id),version:integer('version').notNull(),proposedBy:text('proposed_by').notNull().references(()=>users.id),amountPaise:integer('amount_paise').notNull(),reason:text('reason').notNull(),status:text('status').notNull(),acknowledgedBy:text('acknowledged_by').references(()=>users.id),createdAt:text('created_at').notNull(),acknowledgedAt:text('acknowledged_at')
},t=>[primaryKey({columns:[t.orderId,t.version]}),check('terms_status',sql`${t.status} IN ('acknowledged','proposed','superseded')`),check('terms_amount',sql`${t.amountPaise}>=0`)]);
export const marketEvents=sqliteTable('market_events',{
  id:text('id').primaryKey().notNull(),requestId:text('request_id').notNull().references(()=>supplyRequests.id),actorId:text('actor_id').notNull().references(()=>users.id),kind:text('kind').notNull(),message:text('message').notNull(),createdAt:text('created_at').notNull()
},t=>[index('market_events_request').on(t.requestId,t.createdAt,t.id)]);
export const accountAssessments=sqliteTable('account_assessments',{
  id:text('id').primaryKey().notNull(),actorId:text('actor_id').notNull().references(()=>users.id),fileId:text('file_id').notNull().references(()=>files.id),requestId:text('request_id').references(()=>supplyRequests.id),scope:text('scope').notNull(),state:text('state').notNull(),resultJson:text('result_json'),createdAt:text('created_at').notNull()
},t=>[index('assessments_actor').on(t.actorId,t.createdAt),check('assessment_state',sql`${t.state} IN ('running','ready','failed')`)]);
