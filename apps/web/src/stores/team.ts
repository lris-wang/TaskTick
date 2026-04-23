/**
 * Team Store
 *
 * Manages teams and team memberships. Teams are synced with the server.
 * Persisted to localStorage alongside other auth data.
 */

import { defineStore } from "pinia";
import type { Team, TeamMember } from "@tasktick/shared";
import {
  createTeam as apiCreateTeam,
  deleteTeam as apiDeleteTeam,
  fetchTeamMembers as apiFetchTeamMembers,
  fetchTeams as apiFetchTeams,
  inviteTeamMember as apiInviteTeamMember,
  removeTeamMember as apiRemoveTeamMember,
  transferTeamOwnership as apiTransferOwnership,
  updateTeam as apiUpdateTeam,
  updateTeamMember as apiUpdateTeamMember,
} from "../api";
import { useAuthStore } from "./auth";

const TEAMS_STORAGE_KEY = "tasktick.local.teams.v1";
const ACTIVE_TEAM_KEY = "tasktick.local.active_team_id.v1";

export const useTeamStore = defineStore("team", {
  state: () => ({
    teams: [] as Team[],
    activeTeamId: null as string | null,
    members: [] as TeamMember[],
  }),

  getters: {
    activeTeam(state): Team | null {
      return state.teams.find((t) => t.id === state.activeTeamId) ?? null;
    },

    isInTeam(state): boolean {
      return state.activeTeamId !== null;
    },

    myMembership(state): TeamMember | null {
      if (!state.activeTeamId) return null;
      const auth = useAuthStore();
      return (
        state.members.find(
          (m) => m.teamId === state.activeTeamId && m.userUsername === auth.username,
        ) ?? null
      );
    },

    myRole(): TeamMember["role"] | null {
      const membership = this.myMembership;
      return membership?.role ?? null;
    },

    canManageTeam(): boolean {
      const role = this.myRole;
      return role === "owner" || role === "admin";
    },

    canEditTeamResources(): boolean {
      const role = this.myRole;
      return role === "owner" || role === "admin" || role === "member";
    },
  },

  actions: {
    persist(): boolean {
      try {
        localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(this.teams));
        if (this.activeTeamId) {
          localStorage.setItem(ACTIVE_TEAM_KEY, this.activeTeamId);
        } else {
          localStorage.removeItem(ACTIVE_TEAM_KEY);
        }
      } catch {
        /* ignore */
      }
      return true;
    },

    hydrate(): void {
      try {
        const raw = localStorage.getItem(TEAMS_STORAGE_KEY);
        if (raw) {
          this.teams = JSON.parse(raw);
        }
        this.activeTeamId = localStorage.getItem(ACTIVE_TEAM_KEY);
      } catch {
        /* ignore */
      }
    },

    async fetchTeams(): Promise<void> {
      const data = await apiFetchTeams();
      if (data) {
        this.teams = data;
        this.persist();
      }
    },

    async createTeam(name: string): Promise<Team | null> {
      const team = await apiCreateTeam({ name });
      if (team) {
        this.teams.push(team);
        this.activeTeamId = team.id;
        this.persist();
        await this.fetchMembers(team.id);
        return team;
      }
      return null;
    },

    async updateTeam(teamId: string, name: string): Promise<boolean> {
      const team = await apiUpdateTeam(teamId, { name });
      if (team) {
        const idx = this.teams.findIndex((t) => t.id === teamId);
        if (idx !== -1) this.teams[idx] = team;
        this.persist();
        return true;
      }
      return false;
    },

    async deleteTeam(teamId: string): Promise<boolean> {
      const ok = await apiDeleteTeam(teamId);
      if (ok) {
        this.teams = this.teams.filter((t) => t.id !== teamId);
        if (this.activeTeamId === teamId) {
          this.activeTeamId = null;
          this.members = [];
        }
        this.persist();
        return true;
      }
      return false;
    },

    async setActiveTeam(teamId: string | null): Promise<void> {
      this.activeTeamId = teamId;
      if (teamId) {
        await this.fetchMembers(teamId);
      } else {
        this.members = [];
      }
      this.persist();
    },

    async fetchMembers(teamId: string): Promise<void> {
      const data = await apiFetchTeamMembers(teamId);
      if (data) {
        this.members = data;
      }
    },

    async inviteMember(teamId: string, email: string, role: string): Promise<boolean> {
      const ok = await apiInviteTeamMember(teamId, { email, role });
      if (ok) {
        await this.fetchMembers(teamId);
        return true;
      }
      return false;
    },

    async updateMemberRole(teamId: string, targetUserId: string, role: string): Promise<boolean> {
      const ok = await apiUpdateTeamMember(teamId, targetUserId, { role });
      if (ok) {
        await this.fetchMembers(teamId);
        return true;
      }
      return false;
    },

    async removeMember(teamId: string, targetUserId: string): Promise<boolean> {
      const ok = await apiRemoveTeamMember(teamId, targetUserId);
      if (ok) {
        await this.fetchMembers(teamId);
        return true;
      }
      return false;
    },

    async leaveTeam(teamId: string): Promise<boolean> {
      const auth = useAuthStore();
      if (!auth.username) return false;
      const membership = this.members.find(
        (m) => m.teamId === teamId && m.userUsername === auth.username,
      );
      if (!membership) return false;
      return await this.removeMember(teamId, membership.userId);
    },

    async transferOwnership(teamId: string, targetUserId: string): Promise<boolean> {
      const ok = await apiTransferOwnership(teamId, targetUserId);
      if (ok) {
        await this.fetchMembers(teamId);
      }
      return ok;
    },
  },
});
