import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const vehiclePaths = sqliteTable(
  "vehicle_paths",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    year: integer("year").notNull(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    trim: text("trim"),
    engine: text("engine"),
    makeNormalized: text("make_normalized").notNull(),
    modelNormalized: text("model_normalized").notNull(),
    trimNormalized: text("trim_normalized"),
    engineNormalized: text("engine_normalized"),
    pathKey: text("path_key").notNull(),
  },
  (table) => [
    uniqueIndex("vehicle_paths_path_key_uq").on(table.pathKey),
    index("vehicle_paths_year_idx").on(table.year),
    index("vehicle_paths_year_make_idx").on(table.year, table.make),
    index("vehicle_paths_year_make_model_idx").on(table.year, table.make, table.model),
    index("vehicle_paths_full_lookup_idx").on(table.year, table.make, table.model, table.trim),
    index("vehicle_paths_normalized_idx").on(table.year, table.makeNormalized, table.modelNormalized),
  ],
);

export const dataMeta = sqliteTable("data_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
