import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,primaryKey,foreignKey,index,check} from 'drizzle-orm/sqlite-core';

export const users=sqliteTable('users',{
  id:text('id').primaryKey().notNull(),mobile:text('mobile').notNull().unique(),role:text('role').notNull(),
  displayName:text('display_name').notNull().default(''),language:text('language').notNull().default('en'),locality:text('locality').notNull().default(''),
  status:text('status').notNull().default('active'),version:integer('version').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[check('users_role',sql`${t.role} IN ('collector','recycler')`),check('users_language',sql`${t.language} IN ('en','hi','mr')`),check('users_status',sql`${t.status} IN ('active','suspended')`),check('users_version',sql`${t.version}>0`)]);
export const authChallenges=sqliteTable('auth_challenges',{
  id:text('id').primaryKey().notNull(),mobile:text('mobile').notNull(),requestedRole:text('requested_role').notNull(),language:text('language').notNull(),
  providerReference:text('provider_reference'),status:text('status').notNull(),attempts:integer('attempts').notNull().default(0),consumedBy:text('consumed_by'),expiresAt:text('expires_at').notNull(),createdAt:text('created_at').notNull()
},t=>[index('auth_challenges_mobile_created').on(t.mobile,t.createdAt),check('challenge_role',sql`${t.requestedRole} IN ('collector','recycler')`),check('challenge_language',sql`${t.language} IN ('en','hi','mr')`),check('challenge_status',sql`${t.status} IN ('sending','pending','consumed','failed')`),check('challenge_attempts',sql`${t.attempts} BETWEEN 0 AND 5`)]);
export const sessions=sqliteTable('sessions',{
  tokenHash:text('token_hash').primaryKey().notNull(),userId:text('user_id').notNull().references(()=>users.id),expiresAt:text('expires_at').notNull(),revokedAt:text('revoked_at'),createdAt:text('created_at').notNull()
},t=>[index('sessions_user').on(t.userId)]);
export const authRateLimits=sqliteTable('auth_rate_limits',{
  key:text('key').notNull(),window:integer('window').notNull(),count:integer('count').notNull()
},t=>[primaryKey({columns:[t.key,t.window]}),check('rate_positive',sql`${t.count}>0`)]);
export const organizations=sqliteTable('organizations',{
  id:text('id').primaryKey().notNull(),ownerUserId:text('owner_user_id').notNull().unique().references(()=>users.id),name:text('name').notNull().default(''),kind:text('kind').notNull().default('recycler'),createdAt:text('created_at').notNull()
},t=>[check('organization_kind',sql`${t.kind}='recycler'`)]);
export const memberships=sqliteTable('memberships',{
  userId:text('user_id').notNull().references(()=>users.id),organizationId:text('organization_id').notNull().references(()=>organizations.id),role:text('role').notNull()
},t=>[primaryKey({columns:[t.userId,t.organizationId]}),check('membership_role',sql`${t.role}='owner'`)]);
export const facilities=sqliteTable('facilities',{
  id:text('id').primaryKey().notNull(),organizationId:text('organization_id').notNull().unique().references(()=>organizations.id),name:text('name').notNull().default(''),locality:text('locality').notNull().default(''),verificationStatus:text('verification_status').notNull().default('unverified'),createdAt:text('created_at').notNull()
},t=>[check('facility_verification',sql`${t.verificationStatus} IN ('unverified','pending','verified','expired','rejected')`)]);
export const taxonomyVersions=sqliteTable('taxonomy_versions',{
  version:text('version').primaryKey().notNull(),sourceUrl:text('source_url').notNull(),status:text('status').notNull()
});
export const broadCategories=sqliteTable('broad_categories',{
  taxonomyVersion:text('taxonomy_version').notNull().references(()=>taxonomyVersions.version),code:text('code').notNull(),name:text('name').notNull()
},t=>[primaryKey({columns:[t.taxonomyVersion,t.code]})]);
export const equipmentCategories=sqliteTable('equipment_categories',{
  taxonomyVersion:text('taxonomy_version').notNull().references(()=>taxonomyVersions.version),code:text('code').notNull(),name:text('name').notNull(),defaultBroadCode:text('default_broad_code').notNull(),reviewNote:text('review_note').notNull()
},t=>[primaryKey({columns:[t.taxonomyVersion,t.code]}),foreignKey({columns:[t.taxonomyVersion,t.defaultBroadCode],foreignColumns:[broadCategories.taxonomyVersion,broadCategories.code]})]);
export const files=sqliteTable('files',{
  id:text('id').primaryKey().notNull(),ownerUserId:text('owner_user_id').notNull().references(()=>users.id),objectKey:text('object_key').notNull().unique(),mimeType:text('mime_type').notNull(),sizeBytes:integer('size_bytes').notNull(),sha256:text('sha256').notNull(),width:integer('width').notNull(),height:integer('height').notNull(),state:text('state').notNull(),createdAt:text('created_at').notNull()
},t=>[index('files_owner').on(t.ownerUserId,t.createdAt),check('file_type',sql`${t.mimeType} IN ('image/jpeg','image/png')`),check('file_size',sql`${t.sizeBytes} BETWEEN 1 AND 2097152`),check('file_width',sql`${t.width}>0`),check('file_height',sql`${t.height}>0`),check('file_state',sql`${t.state} IN ('uploading','ready')`)]);
export const lots=sqliteTable('lots',{
  id:text('id').primaryKey().notNull(),ownerUserId:text('owner_user_id').notNull().references(()=>users.id),title:text('title').notNull(),locality:text('locality').notNull(),notes:text('notes').notNull(),assessmentPhotosJson:text('assessment_photos_json').notNull().default('{}'),status:text('status').notNull().default('draft'),version:integer('version').notNull(),lastCommand:text('last_command').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('lots_owner_updated').on(t.ownerUserId,t.updatedAt,t.id),check('lot_status',sql`${t.status}='draft'`),check('lot_version',sql`${t.version}>0`)]);
export const lotItems=sqliteTable('lot_items',{
  lotId:text('lot_id').notNull().references(()=>lots.id),id:text('id').notNull(),taxonomyVersion:text('taxonomy_version').notNull().references(()=>taxonomyVersions.version),broadCode:text('broad_code'),detailedCode:text('detailed_code'),description:text('description').notNull(),name:text('name').notNull().default(''),condition:text('condition').notNull(),unit:text('unit').notNull(),quantityBase:integer('quantity_base'),reviewState:text('review_state').notNull()
},t=>[primaryKey({columns:[t.lotId,t.id]}),foreignKey({columns:[t.taxonomyVersion,t.broadCode],foreignColumns:[broadCategories.taxonomyVersion,broadCategories.code]}),foreignKey({columns:[t.taxonomyVersion,t.detailedCode],foreignColumns:[equipmentCategories.taxonomyVersion,equipmentCategories.code]}),check('item_condition',sql`${t.condition} IN ('unsorted','sorted','damaged','unknown')`),check('item_unit',sql`${t.unit} IN ('kg','piece')`),check('item_quantity',sql`${t.quantityBase}>0`),check('item_review',sql`${t.reviewState} IN ('needs_review','confirmed')`)]);
export const lotFiles=sqliteTable('lot_files',{
  lotId:text('lot_id').notNull().references(()=>lots.id),fileId:text('file_id').notNull().references(()=>files.id)
},t=>[primaryKey({columns:[t.lotId,t.fileId]})]);
export const commandReceipts=sqliteTable('command_receipts',{
  actorId:text('actor_id').notNull().references(()=>users.id),commandId:text('command_id').notNull(),payloadHash:text('payload_hash').notNull(),resultJson:text('result_json').notNull(),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.actorId,t.commandId]})]);
export const auditEvents=sqliteTable('audit_events',{
  id:text('id').primaryKey().notNull(),actorId:text('actor_id').notNull().references(()=>users.id),action:text('action').notNull(),resourceId:text('resource_id').notNull(),resourceVersion:integer('resource_version').notNull(),createdAt:text('created_at').notNull()
},t=>[index('audit_events_resource').on(t.resourceId,t.createdAt)]);
