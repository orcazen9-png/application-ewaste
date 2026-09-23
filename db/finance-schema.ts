import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,uniqueIndex,check,primaryKey} from 'drizzle-orm/sqlite-core';
import {orders} from './market-schema';
import {users} from './account-schema';

export const documents=sqliteTable('documents',{
  id:text('id').primaryKey().notNull(),ownerActor:text('owner_actor').notNull(),orderId:text('order_id').notNull().references(()=>orders.id),objectKey:text('object_key').notNull().unique(),name:text('name').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),sha256:text('sha256').notNull(),state:text('state').notNull(),createdAt:text('created_at').notNull()
},t=>[index('documents_order').on(t.orderId,t.id),index('documents_owner').on(t.ownerActor,t.id),check('document_state',sql`${t.state} IN ('uploading','ready')`),check('document_size',sql`${t.size} BETWEEN 1 AND 5242880`)]);
export const invoices=sqliteTable('invoices',{
  id:text('id').primaryKey().notNull(),orderId:text('order_id').notNull().references(()=>orders.id),account:text('account').notNull(),currentVersion:integer('current_version').notNull(),createdAt:text('created_at').notNull()
},t=>[uniqueIndex('invoices_order').on(t.orderId,t.account),check('invoice_account',sql`${t.account} IN ('material','logistics')`)]);
export const invoiceVersions=sqliteTable('invoice_versions',{
  invoiceId:text('invoice_id').notNull().references(()=>invoices.id),version:integer('version').notNull(),documentId:text('document_id').notNull().references(()=>documents.id),issuer:text('issuer').notNull(),number:text('number').notNull(),issuedOn:text('issued_on').notNull(),amountPaise:integer('amount_paise').notNull(),basisVersion:integer('basis_version').notNull(),quantityBase:integer('quantity_base'),unit:text('unit'),payee:text('payee').notNull(),payer:text('payer').notNull(),uploadedBy:text('uploaded_by').notNull(),reason:text('reason').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.invoiceId,t.version]}),check('invoice_amount',sql`${t.amountPaise}>0`),check('invoice_version_status',sql`${t.status} IN ('submitted','acknowledged','disputed','superseded')`)]);
export const invoiceReviews=sqliteTable('invoice_reviews',{
  id:text('id').primaryKey().notNull(),invoiceId:text('invoice_id').notNull().references(()=>invoices.id),version:integer('version').notNull(),userId:text('user_id').notNull().references(()=>users.id),decision:text('decision').notNull(),message:text('message').notNull(),createdAt:text('created_at').notNull()
},t=>[index('invoice_reviews_version').on(t.invoiceId,t.version,t.userId),check('invoice_review_decision',sql`${t.decision} IN ('accept','dispute')`)]);
export const payments=sqliteTable('payments',{
  id:text('id').primaryKey().notNull(),orderId:text('order_id').notNull().references(()=>orders.id),invoiceId:text('invoice_id').notNull().references(()=>invoices.id),invoiceVersion:integer('invoice_version').notNull(),account:text('account').notNull(),amountPaise:integer('amount_paise').notNull(),payer:text('payer').notNull(),payee:text('payee').notNull(),method:text('method').notNull(),reference:text('reference').notNull(),paidOn:text('paid_on').notNull(),proofId:text('proof_id').references(()=>documents.id),evidenceReason:text('evidence_reason').notNull(),recordedBy:text('recorded_by').notNull(),status:text('status').notNull(),exceptionReason:text('exception_reason').notNull(),createdAt:text('created_at').notNull()
},t=>[index('payments_order').on(t.orderId,t.account,t.id),index('payments_invoice').on(t.invoiceId,t.id),uniqueIndex('payments_reference').on(t.orderId,t.account,t.reference),check('payment_amount',sql`${t.amountPaise}>0`),check('payment_account',sql`${t.account} IN ('material','logistics')`),check('payment_status',sql`${t.status} IN ('pending','confirmed','disputed','reversed')`)]);
export const paymentReviews=sqliteTable('payment_reviews',{
  id:text('id').primaryKey().notNull(),paymentId:text('payment_id').notNull().references(()=>payments.id),actor:text('actor').notNull(),decision:text('decision').notNull(),reason:text('reason').notNull(),createdAt:text('created_at').notNull()
},t=>[index('payment_reviews_payment').on(t.paymentId,t.createdAt)]);
export const financeEvents=sqliteTable('finance_events',{
  id:text('id').primaryKey().notNull(),orderId:text('order_id').notNull().references(()=>orders.id),version:integer('version').notNull(),actor:text('actor').notNull(),kind:text('kind').notNull(),dataJson:text('data_json').notNull(),createdAt:text('created_at').notNull()
},t=>[index('finance_events_order').on(t.orderId,t.version)]);
export const notifications=sqliteTable('notifications',{
  id:text('id').primaryKey().notNull(),userId:text('user_id').notNull().references(()=>users.id),kind:text('kind').notNull(),resourceId:text('resource_id').notNull(),title:text('title').notNull(),body:text('body').notNull(),createdAt:text('created_at').notNull(),readAt:text('read_at')
},t=>[index('notifications_user').on(t.userId,t.createdAt,t.id)]);
