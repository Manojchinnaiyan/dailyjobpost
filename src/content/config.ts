import { defineCollection, z } from 'astro:content';

const jobs = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    company: z.string(),
    location: z.string(),
    type: z.enum(['full-time', 'part-time', 'contract', 'remote', 'internship']),
    remote: z.boolean().default(false),
    urgent: z.boolean().default(false),
    salary: z.string().optional(),
    tags: z.array(z.string()),
    posted: z.date(),
    applyUrl: z.string().url().optional(),
    experience: z.string().optional(),
    category: z.string().optional(),
  }),
});

export const collections = { jobs };
