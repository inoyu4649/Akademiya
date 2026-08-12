// Express.User 네임스페이스 선언 — passport의 req.user 타입과 통합
import type { ApiActor } from "../middleware/apiAuth.js";

declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      role: "user" | "admin";
    }

    // requireApiActor가 채우는 호출자 정보.
    // req.user와 달리 "웹앱 세션인지 서드파티 OAuth 앱인지"까지 구분한다.
    interface Request {
      actor?: ApiActor;
    }
  }
}

export {};
