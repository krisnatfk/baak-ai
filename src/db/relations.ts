/**
 * Relasi Drizzle (relational query — db.query.*).
 *
 * Dipakai oleh auth, knowledge management, dan operasional. Relasi read-only
 * untuk query: SELECT tetap via .where() / .orderBy() biasa; `with` dipakai
 * untuk memuat data gabungan (mis. FAQ + kategori + sumber).
 */

import { relations } from "drizzle-orm";
import {
  auditLogs,
  chatMessages,
  chatSessions,
  faqImportBatches,
  faqImportRows,
  humanHandoffs,
  knowledgeAlternativeQuestions,
  knowledgeAttachments,
  knowledgeCategories,
  knowledgeDocumentChunks,
  knowledgeDocuments,
  knowledgeItemSources,
  knowledgeItems,
  knowledgeMedia,
  knowledgeRelatedQuestions,
  knowledgeSources,
  roles,
  unansweredQuestions,
  users,
} from "./schema";

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  createdCategories: many(knowledgeCategories),
  updatedCategories: many(knowledgeCategories),
  createdSources: many(knowledgeSources),
  updatedSources: many(knowledgeSources),
  createdItems: many(knowledgeItems),
  updatedItems: many(knowledgeItems),
  createdDocuments: many(knowledgeDocuments),
  reviewedQuestions: many(unansweredQuestions),
  assignedHandoffs: many(humanHandoffs),
  resolvedHandoffs: many(humanHandoffs),
  auditLogs: many(auditLogs),
  importedBatches: many(faqImportBatches),
}));

export const knowledgeCategoriesRelations = relations(
  knowledgeCategories,
  ({ one, many }) => ({
    items: many(knowledgeItems),
    createdBy: one(users, {
      fields: [knowledgeCategories.createdBy],
      references: [users.id],
    }),
    updatedBy: one(users, {
      fields: [knowledgeCategories.updatedBy],
      references: [users.id],
    }),
  }),
);

export const knowledgeSourcesRelations = relations(
  knowledgeSources,
  ({ one, many }) => ({
    items: many(knowledgeItems),
    documents: many(knowledgeDocuments),
    createdBy: one(users, {
      fields: [knowledgeSources.createdBy],
      references: [users.id],
    }),
    updatedBy: one(users, {
      fields: [knowledgeSources.updatedBy],
      references: [users.id],
    }),
  }),
);

export const knowledgeItemsRelations = relations(
  knowledgeItems,
  ({ one, many }) => ({
    category: one(knowledgeCategories, {
      fields: [knowledgeItems.categoryId],
      references: [knowledgeCategories.id],
    }),
    source: one(knowledgeSources, {
      fields: [knowledgeItems.sourceId],
      references: [knowledgeSources.id],
    }),
    alternatives: many(knowledgeAlternativeQuestions),
    itemSources: many(knowledgeItemSources),
    media: many(knowledgeMedia),
    attachments: many(knowledgeAttachments),
    /** Pertanyaan terkait KELUAR (FAQ ini menunjuk ke FAQ lain / teks bebas). */
    relatedQuestions: many(knowledgeRelatedQuestions, {
      relationName: "relatedQuestionsFrom",
    }),
    /** Pertanyaan terkait MASUK (FAQ lain menunjuk ke FAQ ini). */
    relatedBy: many(knowledgeRelatedQuestions, {
      relationName: "relatedQuestionsTo",
    }),
    unanswered: many(unansweredQuestions),
    createdBy: one(users, {
      fields: [knowledgeItems.createdBy],
      references: [users.id],
    }),
    updatedBy: one(users, {
      fields: [knowledgeItems.updatedBy],
      references: [users.id],
    }),
    importBatch: one(faqImportBatches, {
      fields: [knowledgeItems.importBatchId],
      references: [faqImportBatches.id],
    }),
    sourceDocument: one(knowledgeDocuments, {
      fields: [knowledgeItems.sourceDocumentId],
      references: [knowledgeDocuments.id],
    }),
    sourceChunk: one(knowledgeDocumentChunks, {
      fields: [knowledgeItems.sourceChunkId],
      references: [knowledgeDocumentChunks.id],
    }),
  }),
);

export const knowledgeAlternativeQuestionsRelations = relations(
  knowledgeAlternativeQuestions,
  ({ one }) => ({
    item: one(knowledgeItems, {
      fields: [knowledgeAlternativeQuestions.knowledgeId],
      references: [knowledgeItems.id],
    }),
  }),
);

export const knowledgeItemSourcesRelations = relations(
  knowledgeItemSources,
  ({ one }) => ({
    item: one(knowledgeItems, {
      fields: [knowledgeItemSources.knowledgeId],
      references: [knowledgeItems.id],
    }),
  }),
);

export const knowledgeRelatedQuestionsRelations = relations(
  knowledgeRelatedQuestions,
  ({ one }) => ({
    item: one(knowledgeItems, {
      fields: [knowledgeRelatedQuestions.knowledgeId],
      references: [knowledgeItems.id],
      relationName: "relatedQuestionsFrom",
    }),
    relatedItem: one(knowledgeItems, {
      fields: [knowledgeRelatedQuestions.relatedKnowledgeId],
      references: [knowledgeItems.id],
      relationName: "relatedQuestionsTo",
    }),
  }),
);

export const knowledgeMediaRelations = relations(knowledgeMedia, ({ one }) => ({
  item: one(knowledgeItems, {
    fields: [knowledgeMedia.knowledgeId],
    references: [knowledgeItems.id],
  }),
}));

export const knowledgeAttachmentsRelations = relations(
  knowledgeAttachments,
  ({ one }) => ({
    item: one(knowledgeItems, {
      fields: [knowledgeAttachments.knowledgeId],
      references: [knowledgeItems.id],
    }),
  }),
);

export const faqImportBatchesRelations = relations(
  faqImportBatches,
  ({ one, many }) => ({
    createdBy: one(users, {
      fields: [faqImportBatches.createdBy],
      references: [users.id],
    }),
    rows: many(faqImportRows),
    items: many(knowledgeItems),
  }),
);

export const faqImportRowsRelations = relations(faqImportRows, ({ one }) => ({
  batch: one(faqImportBatches, {
    fields: [faqImportRows.batchId],
    references: [faqImportBatches.id],
  }),
}));

export const knowledgeDocumentsRelations = relations(
  knowledgeDocuments,
  ({ one, many }) => ({
    source: one(knowledgeSources, {
      fields: [knowledgeDocuments.sourceId],
      references: [knowledgeSources.id],
    }),
    chunks: many(knowledgeDocumentChunks),
    createdBy: one(users, {
      fields: [knowledgeDocuments.createdBy],
      references: [users.id],
    }),
    generatedItems: many(knowledgeItems),
  }),
);

export const knowledgeDocumentChunksRelations = relations(
  knowledgeDocumentChunks,
  ({ one }) => ({
    document: one(knowledgeDocuments, {
      fields: [knowledgeDocumentChunks.documentId],
      references: [knowledgeDocuments.id],
    }),
  }),
);

export const chatSessionsRelations = relations(chatSessions, ({ many }) => ({
  messages: many(chatMessages),
  handoffs: many(humanHandoffs),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));

export const unansweredQuestionsRelations = relations(
  unansweredQuestions,
  ({ one }) => ({
    knowledge: one(knowledgeItems, {
      fields: [unansweredQuestions.knowledgeId],
      references: [knowledgeItems.id],
    }),
    reviewedByUser: one(users, {
      fields: [unansweredQuestions.reviewedBy],
      references: [users.id],
    }),
  }),
);

export const humanHandoffsRelations = relations(humanHandoffs, ({ one }) => ({
  chatSession: one(chatSessions, {
    fields: [humanHandoffs.chatSessionId],
    references: [chatSessions.id],
  }),
  assignedAdmin: one(users, {
    fields: [humanHandoffs.assignedAdminId],
    references: [users.id],
  }),
  resolvedByUser: one(users, {
    fields: [humanHandoffs.resolvedBy],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));
