import { z } from "zod";

const chartConfigSchema = z.object({
  id: z.string(),
  type: z.enum(["horizontal-bar", "donut", "area-timeline"]),
  title: z.string(),
  data: z.array(z.object({ name: z.string(), value: z.number() })),
  color: z.string().optional(),
});

const statCardConfigSchema = z.object({
  id: z.string(),
  type: z.literal("stat-card"),
  title: z.string(),
  value: z.string(),
  subtitle: z.string().optional(),
});

const dashboardItemSchema = z.discriminatedUnion("type", [
  statCardConfigSchema,
  chartConfigSchema.extend({ type: z.literal("horizontal-bar") }),
  chartConfigSchema.extend({ type: z.literal("donut") }),
  chartConfigSchema.extend({ type: z.literal("area-timeline") }),
]);

const fieldSchemaSchema = z.object({
  key: z.string(),
  label: z.string(),
  source: z.enum(["luma", "custom", "classified"]),
  render: z.enum(["filter", "chart", "detail", "hidden"]),
});

const triageDimensionSchema = z.object({
  key: z.string(),
  label: z.string(),
  categories: z.array(z.string()),
});

const candidateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    createdAt: z.string(),
    approvalStatus: z.string(),
    linkedinUrl: z.string().optional(),
    relevanceScore: z.number(),
  })
  .passthrough();

export const processedDataSchema = z.object({
  meta: z.object({
    eventName: z.string(),
    eventDate: z.string(),
    eventLocation: z.string().optional(),
    processedAt: z.string(),
    candidateCount: z.number(),
    lumaColumns: z.array(z.string()),
    customColumns: z.array(z.string()),
  }),
  schema: z.object({
    dashboard: z.array(dashboardItemSchema),
    triageDimensions: z.array(triageDimensionSchema),
    fields: z.array(fieldSchemaSchema),
    scoreFactors: z.array(z.string()),
  }),
  candidates: z.array(candidateSchema),
});
