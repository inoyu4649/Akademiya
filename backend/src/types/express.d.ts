// Express.User 네임스페이스 선언 — passport의 req.user 타입과 통합
declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      role: "user" | "admin";
    }
  }
}

export {};
