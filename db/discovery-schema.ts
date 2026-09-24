import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,real,index,check} from 'drizzle-orm/sqlite-core';
import {lots,users,facilities} from './account-schema';
import {operationsStaff} from './logistics-schema';
export const lotListings=sqliteTable('lot_listings',{
 lotId:text('lot_id').primaryKey().notNull().references(()=>lots.id),ownerId:text('owner_id').notNull().references(()=>users.id),lotVersion:integer('lot_version').notNull(),version:integer('version').notNull(),state:text('state').notNull(),askingRatesJson:text('asking_rates_json').notNull().default('{}'),latitude:real('latitude'),longitude:real('longitude'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('listing_state').on(t.state,t.lotId),check('listing_version',sql`${t.version}>0`),check('listing_state_value',sql`${t.state} IN ('posted','paused','withdrawn')`)]);
export const directoryAuthorizations=sqliteTable('directory_authorizations',{
 facilityId:text('facility_id').primaryKey().notNull().references(()=>facilities.id),submissionVersion:integer('submission_version').notNull(),version:integer('version').notNull(),status:text('status').notNull(),source:text('source').notNull(),validUntil:text('valid_until').notNull(),reviewerId:text('reviewer_id').notNull().references(()=>operationsStaff.id),checkedAt:text('checked_at').notNull()
},t=>[check('directory_status',sql`${t.status} IN ('verified','revoked')`)]);
export const directoryAuthorizationHistory=sqliteTable('directory_authorization_history',{
 id:text('id').primaryKey().notNull(),facilityId:text('facility_id').notNull().references(()=>facilities.id),version:integer('version').notNull(),snapshotJson:text('snapshot_json').notNull(),createdAt:text('created_at').notNull()
});
