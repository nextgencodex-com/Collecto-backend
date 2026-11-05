export type AuthRole = "OWNER" | "RIDER";

export interface AuthUser {
  id: number;
  role: AuthRole;
  username: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
