import { z } from "zod";

export const loginBody = z.object({
  role: z.enum(["owner", "rider"]),
  username: z.string().trim().min(1, "Enter your username and password.").max(100),
  password: z.string().min(1, "Enter your username and password.").max(200),
  remember: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginBody>;
