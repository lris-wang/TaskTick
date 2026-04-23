"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * Desktop-only preload. Exposes a limited, safe API to the renderer via IPC.
 *
 * All DB operations are asynchronous (invoke) so the renderer can use
 * them identically regardless of platform.
 */
contextBridge.exposeInMainWorld("tasktickDesktop", {
  platform: process.platform,

  // Projects
  dbProjectsGetAll: () => ipcRenderer.invoke("db:projects:get-all"),
  dbProjectsUpsert: (project) => ipcRenderer.invoke("db:projects:upsert", project),
  dbProjectsSoftDelete: (id) => ipcRenderer.invoke("db:projects:soft-delete", id),

  // Tags
  dbTagsGetAll: () => ipcRenderer.invoke("db:tags:get-all"),
  dbTagsUpsert: (tag) => ipcRenderer.invoke("db:tags:upsert", tag),
  dbTagsSoftDelete: (id) => ipcRenderer.invoke("db:tags:soft-delete", id),

  // Tasks
  dbTasksGetAll: () => ipcRenderer.invoke("db:tasks:get-all"),
  dbTasksUpsert: (task) => ipcRenderer.invoke("db:tasks:upsert", task),
  dbTasksSoftDelete: (id) => ipcRenderer.invoke("db:tasks:soft-delete", id),

  // Notifications
  notify: (title, body) => ipcRenderer.invoke("notify", { title, body }),
});
