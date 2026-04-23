/**
 * PushSubscription Store — manages Web Push subscription state.
 * Persists the subscribed flag to localStorage (the actual
 * subscription lives in the browser's ServiceWorkerRegistration).
 */

import { defineStore } from "pinia";

const STORAGE_KEY = "tasktick.push.v1";

export const usePushSubscriptionStore = defineStore("pushSubscription", {
  state: () => ({
    /** Whether the user has an active push subscription */
    isSubscribed: false,
  }),

  actions: {
    setSubscribed(val: boolean) {
      this.isSubscribed = val;
      try {
        localStorage.setItem(STORAGE_KEY, val ? "1" : "0");
      } catch {
        /* ignore */
      }
    },

    hydrate() {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        this.isSubscribed = v === "1";
      } catch {
        this.isSubscribed = false;
      }
    },
  },
});
