// Express.User 네임스페이스 선언 — akashaalt 자체 세션 토큰(Akademiya JWT와 무관)의 req.user 타입.
// passport를 쓰지 않으므로 Request.user 자체도 여기서 직접 선언해야 한다.
declare global {
  namespace Express {
    interface User {
      id: number;
      email: string | null;
      displayName: string;
    }
    interface Request {
      user?: User;
    }
  }
}

export {};
