import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,primaryKey,index,check} from 'drizzle-orm/sqlite-core';
import {facilities,users} from './account-schema';
import {operationsStaff} from './logistics-schema';
export const facilityProfiles=sqliteTable('facility_profiles',{
 facilityId:text('facility_id').primaryKey().notNull().references(()=>facilities.id),version:integer('version').notNull(),status:text('status').notNull(),profileJson:text('profile_json').notNull(),submittedVersion:integer('submitted_version'),validUntil:text('valid_until'),updatedAt:text('updated_at').notNull()
},t=>[check('facility_profile_version',sql`${t.version}>0`),check('facility_profile_status',sql`${t.status} IN ('draft','pending','approved','rejected')`)]);
export const facilitySubmissions=sqliteTable('facility_submissions',{
 facilityId:text('facility_id').notNull().references(()=>facilities.id),version:integer('version').notNull(),snapshotJson:text('snapshot_json').notNull(),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.facilityId,t.version]})]);
export const facilityReviews=sqliteTable('facility_reviews',{
 id:text('id').primaryKey().notNull(),facilityId:text('facility_id').notNull().references(()=>facilities.id),submissionVersion:integer('submission_version').notNull(),reviewerId:text('reviewer_id').notNull().references(()=>operationsStaff.id),decision:text('decision').notNull(),reason:text('reason').notNull(),source:text('source').notNull(),validUntil:text('valid_until'),createdAt:text('created_at').notNull()
},t=>[index('facility_reviews_history').on(t.facilityId,t.createdAt),check('facility_review_decision',sql`${t.decision} IN ('approved','rejected')`)]);
export const facilityDocuments=sqliteTable('facility_documents',{
 id:text('id').primaryKey().notNull(),facilityId:text('facility_id').notNull().references(()=>facilities.id),ownerUserId:text('owner_user_id').notNull().references(()=>users.id),objectKey:text('object_key').notNull().unique(),name:text('name').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),sha256:text('sha256').notNull(),state:text('state').notNull(),createdAt:text('created_at').notNull()
},t=>[index('facility_documents_owner').on(t.ownerUserId),check('facility_document_size',sql`${t.size} BETWEEN 1 AND 5242880`),check('facility_document_state',sql`${t.state} IN ('uploading','ready')`)]);
