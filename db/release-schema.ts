import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,primaryKey,index,check} from 'drizzle-orm/sqlite-core';
import {facilities,users} from './account-schema';

// Time-limited sandbox permission; never changes statutory verification status.
export const demoFacilityAccess=sqliteTable('demo_facility_access',{
  facilityId:text('facility_id').primaryKey().notNull().references(()=>facilities.id),
  expiresAt:text('expires_at').notNull(),reason:text('reason').notNull()
});

// Invitations bind an identity before redemption. Tokens are never stored in plaintext.
export const invitations=sqliteTable('invitations',{
  tokenHash:text('token_hash').primaryKey().notNull(),actor:text('actor').notNull(),expiresAt:text('expires_at').notNull(),redeemedBy:text('redeemed_by'),revokedAt:text('revoked_at'),createdAt:text('created_at').notNull()
},t=>[index('invitations_actor').on(t.actor)]);
export const staffSessions=sqliteTable('staff_sessions',{
  tokenHash:text('token_hash').primaryKey().notNull(),staffId:text('staff_id').notNull(),expiresAt:text('expires_at').notNull(),revokedAt:text('revoked_at'),createdAt:text('created_at').notNull()
},t=>[index('staff_sessions_actor').on(t.staffId)]);
export const privateObjects=sqliteTable('private_objects',{
  key:text('key').primaryKey().notNull(),size:integer('size').notNull(),sha256:text('sha256').notNull(),contentType:text('content_type').notNull(),createdAt:text('created_at').notNull()
},t=>[check('private_object_size',sql`${t.size} BETWEEN 1 AND 5242880`)]);
export const privateChunks=sqliteTable('private_chunks',{
  key:text('key').notNull().references(()=>privateObjects.key),part:integer('part').notNull(),data:text('data').notNull()
},t=>[primaryKey({columns:[t.key,t.part]})]);

export const authCredentials=sqliteTable('auth_credentials',{
  userId:text('user_id').primaryKey().notNull().references(()=>users.id),
  username:text('username').notNull().unique(),passwordHash:text('password_hash').notNull(),createdAt:text('created_at').notNull()
});
