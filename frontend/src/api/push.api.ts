import client from "./client";

export const pushApi = {
  getVapidPublicKey: () =>
    client.get<{ publicKey: string }>("/push/vapid-public-key").then((r) => r.data.publicKey),

  subscribe: (subscription: PushSubscriptionJSON) =>
    client.post("/push/subscribe", subscription).then((r) => r.data),

  unsubscribe: (endpoint: string) =>
    client.delete("/push/unsubscribe", { data: { endpoint } }).then((r) => r.data),
};
