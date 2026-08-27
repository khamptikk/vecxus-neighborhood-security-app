import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // ROBO | PELEA | ACCIDENTE | INCENDIO | EMERGENCIA | SOSPECHOSO | OTRO
    type: text("type").notNull(),
    description: text("description").notNull().default(""),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    // ACTIVO | ESCALADO | EN_ATENCION | VERIFICADO | FALSA_ALARMA | RESUELTO
    status: text("status").notNull().default("ACTIVO"),
    confirmations: integer("confirmations").notNull().default(0),
    rejections: integer("rejections").notNull().default(0),
    deviceId: text("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reports_status_idx").on(t.status),
    index("reports_created_idx").on(t.createdAt),
  ]
);

export const confirmations = pgTable(
  "confirmations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    // CONFIRM | REJECT
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("confirmations_report_device_uniq").on(t.reportId, t.deviceId)]
);

export type Report = typeof reports.$inferSelect;
export type Confirmation = typeof confirmations.$inferSelect;
