import { createRouter, createWebHashHistory } from "vue-router";

import HomeView from "../views/HomeView.vue";
import { useAuthStore } from "../stores/auth";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
      meta: { requiresAuth: true },
    },
    {
      path: "/welcome",
      name: "welcome",
      component: () => import("../views/WelcomeView.vue"),
      meta: { guestOnly: true },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
      meta: { guestOnly: true },
    },
    {
      path: "/email-login",
      name: "email-login",
      component: () => import("../views/EmailLoginView.vue"),
      meta: { guestOnly: true },
    },
    {
      path: "/phone-login",
      name: "phone-login",
      component: () => import("../views/PhoneLoginView.vue"),
      meta: { guestOnly: true },
    },
    {
      path: "/register",
      name: "register",
      component: () => import("../views/RegisterView.vue"),
      meta: { guestOnly: true },
    },
    {
      path: "/phone-register",
      name: "phone-register",
      component: () => import("../views/PhoneRegisterView.vue"),
      meta: { guestOnly: true },
    },
    {
      path: "/reset-password",
      name: "reset-password",
      component: () => import("../views/PasswordResetView.vue"),
      meta: { guestOnly: true },
    },
    {
      path: "/",
      name: "home",
      component: HomeView,
      meta: { requiresAuth: true },
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("../views/SettingsView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/calendar/:date",
      name: "calendar-day",
      component: () => import("../views/DayTimelineView.vue"),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return {
      name: "welcome",
      ...(to.fullPath !== "/" ? { query: { redirect: to.fullPath } } : {}),
    };
  }
  if (to.meta.guestOnly && auth.isLoggedIn) {
    return { name: "home" };
  }
  return true;
});
