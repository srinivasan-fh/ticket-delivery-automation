import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentItem {
  serviceId: string;
  timestamp: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
  timestamp: string;
}

interface PortalState {
  themeMode: 'light' | 'dark';
  toggleTheme: () => void;
  favorites: string[];
  toggleFavorite: (serviceId: string) => void;
  starredOctopusProjects: string[];
  toggleStarredOctopusProject: (projectId: string) => void;
  recents: RecentItem[];
  addRecent: (serviceId: string) => void;
  notifications: NotificationItem[];
  addNotification: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
  clearNotifications: () => void;
}

export const useStore = create<PortalState>()(
  persist(
    (set) => ({
      themeMode: 'dark',
      toggleTheme: () =>
        set((state) => ({ themeMode: state.themeMode === 'light' ? 'dark' : 'light' })),
      favorites: ['jira-view-ticket', 'github-approve-pr'],
      toggleFavorite: (serviceId) =>
        set((state) => {
          const isFav = state.favorites.includes(serviceId);
          return {
            favorites: isFav
              ? state.favorites.filter((id) => id !== serviceId)
              : [...state.favorites, serviceId],
          };
        }),
      starredOctopusProjects: [],
      toggleStarredOctopusProject: (projectId) =>
        set((state) => {
          const isStarred = state.starredOctopusProjects.includes(projectId);
          return {
            starredOctopusProjects: isStarred
              ? state.starredOctopusProjects.filter((id) => id !== projectId)
              : [...state.starredOctopusProjects, projectId],
          };
        }),
      recents: [],
      addRecent: (serviceId) =>
        set((state) => {
          const filtered = state.recents.filter((r) => r.serviceId !== serviceId);
          return {
            recents: [
              { serviceId, timestamp: new Date().toISOString() },
              ...filtered,
            ].slice(0, 10), // Keep last 10 recents
          };
        }),
      notifications: [],
      addNotification: (title, message, type) =>
        set((state) => ({
          notifications: [
            {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title,
              message,
              type,
              timestamp: new Date().toISOString(),
            },
            ...state.notifications,
          ].slice(0, 50), // Limit to 50 notifications
        })),
      clearNotifications: () => set({ notifications: [] }),
    }),
    {
      name: 'devportal-storage',
      partialize: (state) => ({
        themeMode: state.themeMode,
        favorites: state.favorites,
        starredOctopusProjects: state.starredOctopusProjects,
        recents: state.recents,
      }),
    }
  )
);
