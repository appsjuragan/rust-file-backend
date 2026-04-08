import { request } from './httpClient';

export interface GroupItem {
    id: string;
    name: string;
    description?: string;
}

export const adminService = {
    async listGroups(): Promise<GroupItem[]> {
        return request('/admin/groups');
    },
    async createGroup(name: string, description?: string): Promise<GroupItem> {
        return request('/admin/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
    },
    async deleteGroup(id: string): Promise<void> {
        return request(`/admin/groups/${id}`, {
            method: 'DELETE'
        });
    },
    async addMember(groupId: string, userId: string): Promise<void> {
        return request(`/admin/groups/${groupId}/users/${userId}`, {
            method: 'POST'
        });
    },
    async removeMember(groupId: string, userId: string): Promise<void> {
        return request(`/admin/groups/${groupId}/users/${userId}`, {
            method: 'DELETE'
        });
    },
    async listGroupMembers(groupId: string): Promise<{ id: string; username: string; email?: string; name?: string }[]> {
        return request(`/admin/groups/${groupId}/users`);
    },
    async searchUsers(query: string = ''): Promise<{ id: string; username: string; email?: string; name?: string }[]> {
        return request(`/admin/users/search?q=${encodeURIComponent(query)}`);
    },
    async listMyGroups(): Promise<GroupItem[]> {
        return request(`/users/me/groups`);
    },
    async getCacheSettings(): Promise<{ default_cache_ttl_seconds: number, group_overrides: { group_id: string, group_name: string, cache_ttl_seconds: number }[] }> {
        return request('/admin/cache-settings');
    },
    async updateGlobalCacheTtl(cache_ttl_seconds: number): Promise<any> {
        return request('/admin/cache-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cache_ttl_seconds })
        });
    },
    async setGroupCacheTtl(groupId: string, cache_ttl_seconds: number): Promise<any> {
        return request(`/admin/cache-settings/groups/${groupId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cache_ttl_seconds })
        });
    },
    async deleteGroupCacheOverride(groupId: string): Promise<any> {
        return request(`/admin/cache-settings/groups/${groupId}`, {
            method: 'DELETE'
        });
    }
};
