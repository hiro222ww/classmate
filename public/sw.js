/* Classmate Web Push Service Worker */

self.addEventListener("push", (event) => {
  let payload = {
    title: "Classmate",
    body: "新しいお知らせがあります",
    url: "/",
    classId: "",
    tag: "classmate",
  };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (_) {
    // keep defaults
  }

  const tag =
    String(payload.tag ?? "").trim() ||
    (payload.classId ? `classmate:${payload.classId}` : "classmate");

  event.waitUntil(
    self.registration.showNotification(payload.title || "Classmate", {
      body: payload.body || "新しいお知らせがあります",
      tag,
      renotify: true,
      data: {
        url: payload.url || "/",
        classId: payload.classId || "",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = String(event.notification.data?.url || "/");

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (!("focus" in client)) continue;
        try {
          if ("navigate" in client) {
            return client.navigate(targetUrl).then(() => client.focus());
          }
        } catch (_) {
          // fall through
        }
        return client.focus();
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
