import React, { useState, useEffect } from 'react';
import { X, Settings, Save, Trash2, Plus, Clock } from 'lucide-react';
import { adminService, GroupItem } from '../../../../services/adminService';

interface AdminCacheSettingsModalProps {
    isVisible: boolean;
    onClose: () => void;
}

export const AdminCacheSettingsModal: React.FC<AdminCacheSettingsModalProps> = ({ isVisible, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [globalTtl, setGlobalTtl] = useState<number>(3600);
    const [overrides, setOverrides] = useState<{ group_id: string, group_name: string, cache_ttl_seconds: number }[]>([]);

    // For adding a new override
    const [groups, setGroups] = useState<GroupItem[]>([]);
    const [newOverrideGroupId, setNewOverrideGroupId] = useState<string>('');
    const [newOverrideTtl, setNewOverrideTtl] = useState<string>('3600');

    useEffect(() => {
        if (isVisible) {
            fetchSettings();
            fetchGroups();
        }
    }, [isVisible]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const data = await adminService.getCacheSettings();
            setGlobalTtl(data.default_cache_ttl_seconds);
            setOverrides(data.group_overrides);
        } catch (e) {
            console.error(e);
            alert("Failed to load cache settings");
        } finally {
            setLoading(false);
        }
    };

    const fetchGroups = async () => {
        try {
            const data = await adminService.listGroups();
            setGroups(data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveGlobal = async () => {
        try {
            await adminService.updateGlobalCacheTtl(globalTtl);
            fetchSettings();
            alert("Global cache TTL updated.");
        } catch (e) {
            console.error(e);
            alert("Failed to update global TTL");
        }
    };

    const handleAddOverride = async () => {
        if (!newOverrideGroupId || !newOverrideTtl) return;
        const ttl = parseInt(newOverrideTtl, 10);
        if (isNaN(ttl) || ttl < 0) return;

        try {
            await adminService.setGroupCacheTtl(newOverrideGroupId, ttl);
            setNewOverrideGroupId('');
            setNewOverrideTtl('3600');
            fetchSettings();
        } catch (e) {
            console.error(e);
            alert("Failed to add override");
        }
    };

    const handleDeleteOverride = async (groupId: string) => {
        try {
            await adminService.deleteGroupCacheOverride(groupId);
            fetchSettings();
        } catch (e) {
            console.error(e);
            alert("Failed to remove override");
        }
    };

    if (!isVisible) return null;

    const availableGroups = groups.filter(g => !overrides.some(o => o.group_id === g.id));

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                    <h2 className="text-xl font-medium tracking-tight text-white flex items-center gap-2">
                        <Settings size={20} className="text-blue-400" />
                        Cache Settings
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                    {/* Global Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <Clock size={16} /> Global Policy
                        </h3>
                        <p className="text-sm text-gray-500">
                            Sets the default browser cache duration (Time-To-Live in seconds) for thumbnails, image previews, fonts, and static assets. Set to 0 to disable caching globally.
                        </p>
                        <div className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-400 mb-1">Global TTL (seconds)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={globalTtl}
                                    onChange={(e) => setGlobalTtl(parseInt(e.target.value) || 0)}
                                    className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
                                />
                            </div>
                            <button
                                onClick={handleSaveGlobal}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
                            >
                                <Save size={16} /> Save
                            </button>
                        </div>
                    </div>

                    <div className="border-t border-white/10 pt-8 space-y-4">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Group Overrides</h3>
                        <p className="text-sm text-gray-500">
                            Override the global cache TTL for specific user groups. This is useful for groups requiring stricter cache validation (e.g., set to 0 for highly sensitive groups).
                        </p>

                        {/* Add Override Form */}
                        {availableGroups.length > 0 && (
                            <div className="flex gap-3 items-end p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-400 mb-1">Select Group</label>
                                    <select
                                        value={newOverrideGroupId}
                                        onChange={(e) => setNewOverrideGroupId(e.target.value)}
                                        className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm appearance-none"
                                    >
                                        <option value="">-- Select Group --</option>
                                        {availableGroups.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-32">
                                    <label className="block text-xs text-gray-400 mb-1">TTL (sec)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={newOverrideTtl}
                                        onChange={(e) => setNewOverrideTtl(e.target.value)}
                                        className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
                                    />
                                </div>
                                <button
                                    onClick={handleAddOverride}
                                    disabled={!newOverrideGroupId}
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                        )}

                        {/* Overrides List */}
                        <div className="space-y-2 mt-4">
                            {loading ? (
                                <div className="text-sm text-gray-500 text-center py-4">Loading overrides...</div>
                            ) : overrides.length === 0 ? (
                                <div className="text-sm text-gray-500 bg-black/20 border border-white/5 rounded-lg p-4 text-center">
                                    No group overrides configured
                                </div>
                            ) : (
                                overrides.map((override) => (
                                    <div key={override.group_id} className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-xl group hover:bg-white/[0.05] transition-colors">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-white">{override.group_name}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-sm text-blue-400 font-mono bg-blue-500/10 px-2 py-1 rounded">
                                                {override.cache_ttl_seconds}s
                                            </div>
                                            <button
                                                onClick={() => handleDeleteOverride(override.group_id)}
                                                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                title="Remove Override"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
