import { z } from "zod";

// An "enum" here is a fixed set of allowed string values.
export const issueTypeEnum = z.enum(["task", "bug", "story", "epic"]);
export const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

// A Zod "schema" is a runtime description of a valid object.
export const createIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(20_000).optional(),
  type: issueTypeEnum.default("task"),
  priority: priorityEnum.default("medium"),
  assigneeId: z.string().uuid().nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  labelIds: z.array(z.string().uuid()).default([]),
  dueDate: z.coerce.date().nullable().optional(),
});

// z.infer turns the runtime schema into a compile-time TypeScript type — for free.
export type CreateIssueInput = z.infer<typeof createIssueSchema>;
