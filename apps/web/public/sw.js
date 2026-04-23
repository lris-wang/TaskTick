/**
 * TaskTick Service Worker — handles push notifications.
 *
 * When a push event arrives (from the backend's web push),
 * show an OS-level notification even when the page is closed.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "TaskTick 提醒", body: event.data.text() };
  }

  const title = data.title || "TaskTick 提醒";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: data.tag || "tasktick",
    data: { url: "/" },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
