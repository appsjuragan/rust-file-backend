import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2, Plus, Users, Search, Check } from 'lucide-react';
import { adminService, GroupItem } from '../../../../services/adminService';

interface AdminGroupsModalProps {
    isVisible: boolean;
    onClose: () => void;
}

export const AdminGroupsModal: React.FC<AdminGroupsModalProps> = ({ isVisible, onClose }) => {
    const [groups, setGroups] = useState<GroupItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupDesc, setNewGroupDesc] = useState('');

    // Member management state
    const [selectedGroup, setSelectedGroup] = useState<GroupItem | null>(null);
    const [members, setMembers] = useState<any[]>([]);

    // Autocomplete state
    const [userQuery, setUserQuery] = useState('');
    const [userSuggestions, setUserSuggestions] = useState<any[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isVisible) {
            fetchGroups();
            setSelectedGroup(null);
        }
    }, [isVisible]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const data = await adminService.listGroups();
            setGroups(data);
        } catch (e) {
            console.error(e);
            alert("Failed to load groups");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGroupName) return;
        try {
            await adminService.createGroup(newGroupName, newGroupDesc);
            setNewGroupName('');
            setNewGroupDesc('');
            fetchGroups();
        } catch (e) {
            console.error(e);
            alert("Failed to create group");
        }
    };

    const handleDeleteGroup = async (id: string) => {
        if (!confirm("Are you sure you want to delete this group?")) return;
        try {
            await adminService.deleteGroup(id);
            fetchGroups();
            if (selectedGroup?.id === id) {
                setSelectedGroup(null);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to delete group");
        }
    };

    const handleSelectGroup = async (group: GroupItem) => {
        setSelectedGroup(group);
        fetchMembers(group.id);
        setSelectedUsers([]);
        setUserQuery('');
    };

    const fetchMembers = async (groupId: string) => {
        try {
            const uids = await adminService.listGroupMembers(groupId);
            setMembers(uids);
        } catch (e) {
            console.error(e);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!selectedGroup) return;
        try {
            await adminService.removeMember(selectedGroup.id, userId);
            fetchMembers(selectedGroup.id);
        } catch (e) {
            console.error(e);
            alert("Failed to remove member");
        }
    };

    // Autocomplete search
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (userQuery.trim().length >= 1) {
                setIsSearching(true);
                adminService.searchUsers(userQuery).then(data => {
                    setUserSuggestions(data);
                    setIsSearching(false);
                    setIsDropdownOpen(true);
                });
            } else {
                setUserSuggestions([]);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [userQuery]);

    const handleSelectUser = (user: any) => {
        if (!selectedUsers.find(u => u.id === user.id)) {
            setSelectedUsers([...selectedUsers, user]);
        }
        setUserQuery('');
        setUserSuggestions([]);
        setIsDropdownOpen(false);
    };

    const handleRemoveSelectedUser = (userId: string) => {
        setSelectedUsers(selectedUsers.filter(u => u.id !== userId));
    };

    const handleAddSelectedMembers = async () => {
        if (!selectedGroup || selectedUsers.length === 0) return;
        try {
            await Promise.all(selectedUsers.map(u => adminService.addMember(selectedGroup.id, u.id)));
            setSelectedUsers([]);
            fetchMembers(selectedGroup.id);
        } catch (e) {
            console.error(e);
            alert("Failed to add members");
        }
    };

    if (!isVisible) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-4xl bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden max-h-[80vh] min-h-[500px]">
                {/* Left Side: Groups List */}
                <div className="w-full md:w-1/3 p-6 border-b md:border-b-0 md:border-r border-white/10 flex flex-col shrink-0 bg-white/[0.02]">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-medium tracking-tight text-white flex items-center gap-2">
                            <Users size={20} className="text-blue-400" />
                            Admins
                        </h2>
                        <button onClick={onClose} className="p-2 md:hidden hover:bg-white/10 rounded-full transition-colors text-gray-400">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleCreateGroup} className="mb-6 space-y-3">
                        <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="Group Name"
                            className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
                            required
                        />
                        <input
                            type="text"
                            value={newGroupDesc}
                            onChange={(e) => setNewGroupDesc(e.target.value)}
                            placeholder="Description (Optional)"
                            className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm hidden"
                        />
                        <button
                            type="submit"
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            <Plus size={16} /> Create Group
                        </button>
                    </form>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {loading ? (
                            <div className="text-sm text-gray-400 text-center py-4">Loading groups...</div>
                        ) : groups.length === 0 ? (
                            <div className="text-sm text-gray-500 text-center py-4">No groups created yet</div>
                        ) : (
                            groups.map((g) => (
                                <div
                                    key={g.id}
                                    className={`p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${selectedGroup?.id === g.id ? 'bg-blue-500/10 border-blue-500/30' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                                    onClick={() => handleSelectGroup(g)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">{g.name}</div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }}
                                        className={`p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors ml-2 ${selectedGroup?.id === g.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                        title="Delete Group"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Side: Members List */}
                <div className="w-full md:w-2/3 p-6 flex flex-col relative h-full">
                    <div className="absolute top-6 right-6 hidden md:block z-10">
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                            <X size={20} />
                        </button>
                    </div>

                    {!selectedGroup ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 h-full">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 text-gray-500">
                                <Users size={32} />
                            </div>
                            <p className="text-gray-400 text-sm">Select a group to manage its members</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="mb-6">
                                <h2 className="text-xl font-medium tracking-tight text-white mb-1 truncate pr-10">
                                    {selectedGroup.name}
                                </h2>
                                <p className="text-sm text-gray-400">Manage Members</p>
                            </div>

                            {/* Multi-select Autocomplete Input */}
                            <div className="relative mb-4" ref={dropdownRef}>
                                <div className="min-h-[42px] px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all flex flex-wrap gap-2 items-center">
                                    {selectedUsers.map(u => (
                                        <div key={u.id} className="flex items-center gap-1.5 bg-blue-500/20 text-blue-200 px-2.5 py-1 rounded-md text-xs border border-blue-500/20">
                                            <span>{u.username}</span>
                                            {u.email && <span className="text-blue-400/70 text-[10px]">({u.email})</span>}
                                            <button
                                                onClick={() => handleRemoveSelectedUser(u.id)}
                                                className="p-0.5 hover:bg-blue-500/30 rounded-full transition-colors ml-1"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}

                                    <div className="flex-1 min-w-[200px] flex items-center">
                                        <Search size={14} className="text-gray-500 mr-2" />
                                        <input
                                            type="text"
                                            value={userQuery}
                                            onChange={(e) => setUserQuery(e.target.value)}
                                            onFocus={() => {
                                                if (userSuggestions.length > 0) setIsDropdownOpen(true);
                                            }}
                                            placeholder={selectedUsers.length === 0 ? "Search users by name, username or email..." : ""}
                                            className="w-full bg-transparent text-white outline-none text-sm"
                                        />
                                    </div>
                                </div>

                                {isDropdownOpen && userSuggestions.length > 0 && (
                                    <div className="absolute top-full left-0 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-20 max-h-[250px] overflow-y-auto">
                                        {userSuggestions.map(user => {
                                            const isSelected = selectedUsers.some(u => u.id === user.id);
                                            const isMember = members.some(m => m.id === user.id);

                                            return (
                                                <div
                                                    key={user.id}
                                                    className={`p-3 border-b border-white/5 flex items-center justify-between transition-colors ${isMember ? 'opacity-50 cursor-not-allowed bg-black/20' : 'cursor-pointer hover:bg-white/5'}`}
                                                    onClick={() => {
                                                        if (!isMember) handleSelectUser(user);
                                                    }}
                                                >
                                                    <div className="flex gap-3 items-center">
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                                            {(user.name || user.username).charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium text-white leading-tight">
                                                                {user.name || user.username}
                                                            </span>
                                                            <span className="text-xs text-gray-500 leading-tight flex gap-2">
                                                                <span>@{user.username}</span>
                                                                {user.email && <span>• {user.email}</span>}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {isMember ? (
                                                        <span className="text-xs font-medium text-gray-500">Already a member</span>
                                                    ) : isSelected ? (
                                                        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white">
                                                            <Check size={12} />
                                                        </div>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {isSearching && (
                                    <div className="absolute right-3 top-3">
                                        <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/80 animate-spin"></div>
                                    </div>
                                )}
                            </div>

                            {selectedUsers.length > 0 && (
                                <div className="flex justify-end mb-6">
                                    <button
                                        onClick={handleAddSelectedMembers}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
                                    >
                                        Add {selectedUsers.length} User{selectedUsers.length !== 1 ? 's' : ''} to Group
                                    </button>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar border-t border-white/5 pt-4">
                                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Current Members ({members.length})</h3>
                                {members.length === 0 ? (
                                    <div className="text-sm text-gray-500 text-center py-8">No members in this group</div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2">
                                        {members.map((member) => (
                                            <div key={member.id} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl flex justify-between items-center group">
                                                <div className="flex-1 overflow-hidden flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                        {(member.name || member.username).charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-sm font-medium text-white truncate">{member.name || member.username}</span>
                                                        <span className="text-xs text-gray-500 truncate mt-0.5">@{member.username} {member.email && `• ${member.email}`}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveMember(member.id)}
                                                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-all ml-2 shrink-0"
                                                    title="Remove Member"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
