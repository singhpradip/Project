import { z } from "zod";
export const issueTypeEnum = z.enum(["task", "bug", "story", "epic"]);
export const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);
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
export type CreateIssueInput = z.infer<typeof createIssueSchema>;
